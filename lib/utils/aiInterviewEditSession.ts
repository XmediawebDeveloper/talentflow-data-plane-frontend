/**
 * Which AI interview configs the wizard is editing as PENDING edits.
 *
 * Editing an existing config used to write straight into its row on every
 * Continue, every cluster generation and every Back — so a PUBLISHED config
 * changed under candidates mid-edit, and "Discard" had nothing to undo. Now the
 * wizard's saves on an existing config are sent with `stage_edits: true`: the
 * backend keeps them as `pending_edits` beside the config and its real fields
 * stay as they were until Save as Draft (on a draft) or Publish applies them,
 * or Discard drops them.
 *
 * Rather than threading a flag through the dozens of `aiInterviewService.update`
 * calls in Configure / Clusters / Preview, the service consults this registry:
 * an id is "staging" only while a wizard step that loaded it as an existing
 * config is mounted (the step marks it on load and clears it on unmount, Save,
 * Discard, Delete and Publish). Nothing else marks ids, so no other caller of
 * `update` can have its write staged by accident.
 *
 * A config the wizard CREATED in this visit (or the version Duplicate just
 * minted — both carry the unsaved-version mark, see aiInterviewDraftResume) is
 * never staged: it is a new draft row nobody else uses, so direct writes are
 * fine and Discard simply deletes it.
 */

const staging = new Set<string>();

export function markStaging(id: string | null | undefined): void {
  if (id) staging.add(id);
}

export function isStaging(id: string | null | undefined): boolean {
  return !!id && staging.has(id);
}

export function clearStaging(id: string | null | undefined): void {
  if (id) staging.delete(id);
}

/**
 * Pending edits made in THIS visit (this browser tab), per config id. Set by
 * the service when a staged save succeeds; cleared by Save as Draft, Discard,
 * Delete and Publish. Two uses:
 *   - the leave prompt: pending edits from this visit always ask before leaving;
 *   - the "restored" notice: pending edits the step finds on load that this
 *     visit did NOT make are an earlier, unfinished edit — the recruiter is told
 *     they were restored, once.
 * sessionStorage so it survives a refresh mid-edit (those edits are still this
 * visit's); another tab or device does not see it.
 */
const thisVisitKey = (id: string) => `ai_interview_pending_this_visit:${id}`;

export function markPendingThisVisit(id: string): void {
  try { sessionStorage.setItem(thisVisitKey(id), '1'); } catch { /* storage unavailable */ }
}

export function hasPendingThisVisit(id: string | null | undefined): boolean {
  if (!id) return false;
  try { return sessionStorage.getItem(thisVisitKey(id)) === '1'; } catch { return false; }
}

export function clearPendingThisVisit(id: string | null | undefined): void {
  if (!id) return;
  try { sessionStorage.removeItem(thisVisitKey(id)); } catch { /* nothing to clear */ }
}

/* The "restored" notice is shown once per config per page load, not once per
   step: Configure → Clusters → Preview each load the same pending edits. */
const restoredNoticeShown = new Set<string>();

/**
 * True exactly once for a config that opened with pending edits this visit did
 * not make — the caller then shows the "Unsaved changes from … restored" toast.
 */
export function shouldAnnounceRestoredEdits(
  config: { id: string; has_pending_edits?: boolean } | null | undefined,
): boolean {
  if (!config?.has_pending_edits || hasPendingThisVisit(config.id) || restoredNoticeShown.has(config.id)) {
    return false;
  }
  restoredNoticeShown.add(config.id);
  return true;
}

/* ── "Being edited by X" ───────────────────────────────────────────────────────
   aiInterviewService announces it; InterviewEditLockGate (one per wizard step)
   shows View only / Take over. */
export const AI_INTERVIEW_BEING_EDITED_EVENT = 'tf:ai-interview-being-edited';

export interface InterviewBeingEditedDetail {
  id: string;
  editorName: string | null;
  since: string | null;
}

export function announceBeingEdited(detail: InterviewBeingEditedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<InterviewBeingEditedDetail>(AI_INTERVIEW_BEING_EDITED_EVENT, { detail }));
}

/** The wizard is done with this config's pending edits (saved, discarded, deleted or published). */
export function endEditSession(id: string | null | undefined): void {
  clearStaging(id);
  clearPendingThisVisit(id);
}
