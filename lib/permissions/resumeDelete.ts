/**
 * Resume deletion is account-owner only (meeting decision, 2026-11-19).
 *
 * Deleting a resume erases its Resume Scoring and AI Talent Match results
 * (GDPR - only the candidate's name and email are kept), so no role can be
 * given Delete, Admin included. Everyone else sees Delete greyed with this
 * reason; they can still Archive. The server enforces the same rule.
 */
export const RESUME_DELETE_OWNER_ONLY_REASON =
  'Only the account owner can delete resumes. You can archive it instead.';

/** True when this person may delete resumes: the account owner only. */
export const canDeleteResumes = (isTenantAdmin: boolean | undefined | null): boolean => !!isTenantAdmin;

/**
 * Shown on a Resume Scoring / AI Talent Match row whose resume the account
 * owner deleted: the score and match results were erased (GDPR) and only the
 * candidate's name and email remain. Scoring units already used are not
 * refunded, so the row stays visible to explain them. AI Talent Match drops it
 * on the next "Run again".
 */
export const RESUME_DELETED_ROW_MESSAGE =
  'This resume was deleted by the account owner, so its scores and AI Talent Match results were also deleted.';
export const RESUME_DELETED_BADGE_LABEL = 'Resume deleted';
export const RESUME_DELETED_BADGE_CLASS =
  'inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap bg-gray-100 text-gray-600 border-gray-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
