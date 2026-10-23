import { jdService } from '@/lib/services/jdService';

/**
 * Editing a PUBLISHED JD always goes through its draft version - never the live
 * row. The JD editor saves at every step (autosave, Next, each Step 2 edit), so
 * opening it on the published JD wrote half-finished edits straight into the
 * live job before the recruiter ever pressed Republish.
 *
 * `createNewVersion` returns the job's open draft version when one exists
 * (`reused_existing_draft`), otherwise forks a new one. A new fork is marked in
 * sessionStorage so the editor knows it was made only for this visit: left
 * untouched, it is removed again on leave instead of piling up under Draft.
 */
const FRESH_FORK_KEY = (id: string) => `tf:jd-fresh-fork:${id}`;

export interface DraftVersionForEdit {
  id: string;
  /** Forked just now (true), or the job's existing open draft (false). */
  fresh: boolean;
}

export async function openDraftVersionForEdit(publishedJdId: string): Promise<DraftVersionForEdit> {
  const draft = await jdService.createNewVersion(publishedJdId);
  const fresh = !draft.reused_existing_draft;
  if (fresh) {
    try { sessionStorage.setItem(FRESH_FORK_KEY(draft.id), '1'); } catch { /* storage unavailable */ }
  }
  return { id: draft.id, fresh };
}

/** The editor URL for that draft. `new_version=1` names the flow "New Version";
 *  reopening an existing draft version reads "Edit New Version" instead. */
export function draftVersionEditorUrl(draft: DraftVersionForEdit, extraQuery = ''): string {
  return `/recruitment/jd-creation?id=${draft.id}&stage=create${draft.fresh ? '&new_version=1' : ''}${extraQuery}`;
}

/** Whether this draft is an untouched fork made for the current visit. */
export function isFreshDraftVersion(id: string): boolean {
  try { return sessionStorage.getItem(FRESH_FORK_KEY(id)) === '1'; } catch { return false; }
}

/** The fork stopped being throwaway: it was edited, saved, published or removed. */
export function clearFreshDraftVersion(id: string): void {
  try { sessionStorage.removeItem(FRESH_FORK_KEY(id)); } catch { /* storage unavailable */ }
}
