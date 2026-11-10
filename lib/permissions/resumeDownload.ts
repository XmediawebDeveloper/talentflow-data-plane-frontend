/**
 * Who may DOWNLOAD a resume (user decision 2026-11-10). Viewing isn't
 * downloading: a see-only role (e.g. Viewer) can open a resume but not take
 * the file out. Same rule as the backend (ai_match_resume_access.can_download_resume):
 *
 * - Own upload: Resume Upload access (my_resumes:share).
 * - Anyone else's: Shared Database access (internal_db:share), or AI Talent
 *   Match access (ai_match:run) for a resume a match found.
 *
 * Buttons are greyed with DOWNLOAD_BLOCKED_MESSAGE, never hidden.
 */
export const DOWNLOAD_BLOCKED_MESSAGE = "You can view this resume, but your role doesn't allow downloading it";

export interface ResumeDownloadContext {
  isTenantAdmin: boolean;
  hasPermissionCode: (code: string) => boolean;
  /** The resume was uploaded by the current user. Unknown → treated as not own. */
  own: boolean;
  /** The resume was found by AI Talent Match (opened from that module). */
  fromAiMatch?: boolean;
}

/** For places that don't know whose resume it is (shared preview popups):
 *  false only when the role can't download ANY resume (e.g. Viewer). The
 *  backend still makes the final per-resume call. */
export function canDownloadSomeResumes({ isTenantAdmin, hasPermissionCode }: Pick<ResumeDownloadContext, 'isTenantAdmin' | 'hasPermissionCode'>): boolean {
  return isTenantAdmin
    || hasPermissionCode('my_resumes:share')
    || hasPermissionCode('internal_db:share')
    || hasPermissionCode('ai_match:run');
}

export function canDownloadResume({ isTenantAdmin, hasPermissionCode, own, fromAiMatch }: ResumeDownloadContext): boolean {
  if (isTenantAdmin) return true;
  if (own) return hasPermissionCode('my_resumes:share');
  if (hasPermissionCode('internal_db:share')) return true;
  return !!fromAiMatch && hasPermissionCode('ai_match:run');
}
