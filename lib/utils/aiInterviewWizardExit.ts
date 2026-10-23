import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { clearUnsavedVersion } from '@/lib/utils/aiInterviewDraftResume';
import { endEditSession, isStaging } from '@/lib/utils/aiInterviewEditSession';

/**
 * How the AI Interview wizard's steps finish an edit — Save as Draft, Discard,
 * Delete — on top of the pending-edits model (lib/utils/aiInterviewEditSession).
 * Shared so Configure, Clusters, Preview and the leave prompt on each of them
 * all apply the same rules.
 */

/** Save as Draft on a PUBLISHED config: its edits stay pending and it stays live. */
export const PUBLISHED_CHANGES_SAVED_MESSAGE = 'Changes saved — they go live when you publish.';

/**
 * Save as Draft, AFTER the step has written its current state (which, on an
 * existing config, was staged as pending edits). Returns the success message.
 *
 *   - existing DRAFT: the pending edits are applied to the draft, then the
 *     audit-only `save_and_exit` checkpoint is logged (a staged save logs
 *     nothing, so the step's own exit flag was not recorded);
 *   - existing PUBLISHED: nothing more — the edits stay pending and the
 *     interview stays live until Publish applies them. Never `status: 'draft'`:
 *     that unpublished a live interview just to keep some edits;
 *   - created in this visit: the step wrote the draft directly, exit flag and
 *     all; it is only marked as kept.
 */
export async function keepWizardChanges(id: string, status: string | null | undefined): Promise<string> {
  if (isStaging(id)) {
    if (status === 'published') {
      endEditSession(id);
      return PUBLISHED_CHANGES_SAVED_MESSAGE;
    }
    await aiInterviewService.applyPendingEdits(id);
    try {
      await aiInterviewService.update(id, { save_and_exit: true });
    } catch {
      // Best-effort: the draft is saved; a missing audit row must not report failure.
    }
  }
  endEditSession(id);
  clearUnsavedVersion(id);
  return 'Draft saved!';
}

/**
 * Discard: a config created in this visit is deleted (nothing was ever kept);
 * an existing one has its pending edits dropped, so it is exactly as it was.
 * Best-effort — leaving is what was asked for.
 */
export async function discardWizardChanges(id: string, deleteIt: boolean): Promise<boolean> {
  try {
    if (deleteIt) {
      await aiInterviewService.delete(id);
      clearUnsavedVersion(id);
    } else {
      await aiInterviewService.discardPendingEdits(id);
    }
    return true;
  } catch {
    return false;
  } finally {
    endEditSession(id);
  }
}

/** Delete this interview (a saved draft nobody was invited to) from the leave prompt. */
export async function deleteWizardConfig(id: string): Promise<void> {
  await aiInterviewService.delete(id);
  clearUnsavedVersion(id);
  endEditSession(id);
}
