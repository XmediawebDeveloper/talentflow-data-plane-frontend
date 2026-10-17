/**
 * The two resume pools of Resume Database — My Resumes and the Shared
 * Database — as one definition, shared by the Resume Database page (its tab
 * strip and breadcrumb) and the Resume View page (the breadcrumb back to the
 * pool a resume was opened from).
 */

export type ResumeTab = 'my-resumes' | 'internal-db';

/** What each pool is called — the tab label and its breadcrumb. */
export const RESUME_TAB_LABEL: Record<ResumeTab, string> = {
  'my-resumes': 'My Resumes',
  'internal-db': 'Shared Database',
};

/* The same permission lists the nav entry is gated on (see
   lib/navigation/menuSections.ts) — holding ANY one of a pool's permissions is
   enough to see it, so the two stay in step: if the menu item shows, at least
   one pool behind it is reachable. */
export const MY_RESUMES_PERMISSIONS = [
  'canViewResumes',
  'canUploadResumes',
  'canUpdateResumes',
  'canDeleteResumes',
] as const;

export const INTERNAL_DB_PERMISSIONS = [
  'canAccessInternalDB',
  'canViewInternalDB',
  'canUpdateInternalDB',
  'canDeleteInternalDB',
] as const;

/** The Resume Database page, opened on one pool's tab. */
export const resumeDatabaseTabHref = (tab: ResumeTab) => `/recruitment/resume-database?tab=${tab}`;

/**
 * `?source=` on a Resume View link: which pool the resume was opened from.
 * Carried on the URL (not only in sessionStorage) so the breadcrumb survives a
 * refresh or a shared link and is never a stale value left by an earlier visit.
 */
export const RESUME_VIEW_SOURCE_PARAM = 'source';
