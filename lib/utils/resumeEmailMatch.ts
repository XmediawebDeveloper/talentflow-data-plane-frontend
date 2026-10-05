/**
 * The one rule deciding whether a recruiter may open a candidate's resume
 * from an AI Interview or Assessment result: the resume must exist in the
 * resume database AND its email must match the email the invitation was
 * sent to.
 *
 *   Invite email → resume email → match → resume in DB → View Resume
 *
 * Applied to every candidate resume id, however it was found — the
 * resume_id linked on the invitation/session included. That link used to be
 * trusted as-is, so an interview created for one address could open a
 * resume belonging to another (re-parsed resume whose email changed, a
 * resume picked for the wrong person, an address edited after inviting).
 *
 * Emails are compared after trimming and lower-casing: addresses are
 * case-insensitive in practice, and the resume's email comes out of a parser
 * that doesn't preserve the invite's casing. Anything else must be identical.
 */

export const RESUME_EMAIL_MISMATCH_MESSAGE =
  "Resume not available — the resume's email doesn't match the email this candidate was invited with.";

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeEmail(a);
  return !!x && x === normalizeEmail(b);
}

/** A resume record's email — the API sends `email`; list rows may carry `candidate_email`. */
export function resumeEmailOf(resume: any): string {
  return normalizeEmail(resume?.email || resume?.candidate_email);
}

/**
 * Returns `resumeId` when that resume exists and belongs to `inviteEmail`,
 * otherwise null. A missing (404/deleted) resume is null; any other fetch
 * failure is rethrown so the caller can tell "not available" from "try
 * again".
 *
 * `fetchResume` must NOT log a view — this is an availability check, not the
 * recruiter opening the resume.
 */
export async function verifyResumeBelongsToInvite(
  resumeId: string | null | undefined,
  inviteEmail: string | null | undefined,
  fetchResume: (id: string) => Promise<any>,
): Promise<string | null> {
  if (!resumeId || !normalizeEmail(inviteEmail)) return null;
  let resume: any;
  try {
    resume = await fetchResume(resumeId);
  } catch (err: any) {
    if (err?.response?.status === 404 || /not found/i.test(err?.message || '')) return null;
    throw err;
  }
  if (!resume) return null;
  return emailsMatch(resumeEmailOf(resume), inviteEmail) ? resumeId : null;
}

/**
 * The resume for a candidate invited by email alone (no resume_id on the
 * invite): any library resume whose email is exactly the invite email. The
 * invite source doesn't matter — a direct-email invite maps to a resume
 * uploaded later with that address.
 *
 * The name is NOT a gate. It used to be: the email match also had to share a
 * name word with the invite, so "naveen" invited by email never mapped to the
 * resume parsed as e.g. "NAVEENKUMAR" — the result page said "invited via
 * Direct Email" though the resume was right there. The name now only breaks a
 * tie when several resumes carry the same address.
 */
export function pickResumeByEmail<T extends { id?: string; candidate_name?: string | null }>(
  items: T[],
  inviteEmail: string | null | undefined,
  inviteName?: string | null,
): T | null {
  const email = normalizeEmail(inviteEmail);
  if (!email) return null;
  const matches = items.filter((item) => item.id && emailsMatch(resumeEmailOf(item), email));
  if (matches.length <= 1) return matches[0] ?? null;
  const tokens = (v: string | null | undefined) => new Set((v || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const want = tokens(inviteName);
  return matches.find((m) => [...tokens(m.candidate_name)].some((t) => want.has(t))) ?? matches[0];
}
