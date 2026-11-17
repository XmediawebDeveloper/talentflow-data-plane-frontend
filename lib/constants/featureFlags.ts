/**
 * Build-time feature flags for features that are complete but not yet approved
 * by the client, so they ship dark rather than being branched or reverted.
 *
 * These are `NEXT_PUBLIC_*`, which Next.js INLINES AT BUILD TIME — changing the
 * value in `.env` requires a rebuild of the frontend, not just a restart.
 *
 * A flag hides a feature's UI. It is NOT a security boundary and it is NOT what
 * stops server-side behaviour: anything already saved in the database still has
 * whatever value it was saved with. Every flag here must have a matching
 * server-side switch, named below, that is the actual guarantee.
 */

/** Mobile QR "Proxy Integrity Verification" — the mid-interview room scan.
 *
 *  Hides the toggle on the AI Interview Configure step and the status row on the
 *  config details view. Server-side counterpart, which is what actually prevents
 *  the QR from arming or firing (including for a config saved earlier with the
 *  toggle ON): `AI_ENVIRONMENT_VERIFICATION_ENABLED` in the backend `.env`.
 *  Set BOTH to false to ship the feature dark.
 *
 *  Unset means enabled, so an environment that never heard of this flag keeps
 *  today's behaviour. */
export const PROXY_INTEGRITY_VERIFICATION_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_PROXY_INTEGRITY_VERIFICATION ?? 'true')
    .trim()
    .toLowerCase() !== 'false';

/** "Share Resume" — emailing a resume (with its file) to someone.
 *
 *  Hidden for now, everywhere it is offered: Resume Scoring (row ⋮ menu, the
 *  View Resume panel, the candidate's score page) and the Resume Database
 *  (My Resumes / Internal Database row menus, the resume page). The dialogs and
 *  the `my_resumes:share` permission stay in place, so turning this back on
 *  is just setting it.
 *
 *  Unlike the flag above this one is OFF unless explicitly enabled. It only
 *  hides the UI; the backend share endpoint is unchanged. */
export const RESUME_EMAIL_SHARE_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_RESUME_EMAIL_SHARE ?? 'false')
    .trim()
    .toLowerCase() === 'true';
