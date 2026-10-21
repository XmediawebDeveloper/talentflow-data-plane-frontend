/**
 * Candidate name validator for the AI Interview and Assessment invite flows
 * (invite form, Copy Link, Send, Edit Invitation). Letters A–Z / a–z only, with spaces
 * between words so a full name ("John Doe") still fits; digits and special
 * characters (".", "-", "'", "@", "_" …) are rejected. Surrounding spaces are
 * ignored — every caller trims the name before sending it.
 */

export const NAME_FORMAT_ERROR = 'Name can contain only letters (A–Z, a–z) and spaces.';

const NAME_RE = /^[A-Za-z]+(?: +[A-Za-z]+)*$/;

export function isValidCandidateName(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && NAME_RE.test(raw.trim());
}
