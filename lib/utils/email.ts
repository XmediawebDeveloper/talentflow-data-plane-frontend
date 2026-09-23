/**
 * Strict, comprehensive email FORMAT validator — the one reusable rule for
 * every place that accepts a candidate email in Invitation Tracking (invite
 * create, bulk invite, edit invitation, change email), across both the
 * Assessment and AI Interview modules. Mirrors the backend's
 * app/services/email.py::is_valid_email_format check by check, so a request
 * this rejects on the frontend would also be rejected by the API — the API
 * is still the final authority (this never replaces that validation, only
 * gives an immediate error before the round trip).
 *
 * Deliberately not a single do-everything regex: local part, domain labels
 * and TLD are checked separately so each rule (no leading/trailing/
 * consecutive dots, no label starting or ending with '-', a real
 * two-letter-minimum TLD, ...) stays readable and independently testable.
 */

export const EMAIL_FORMAT_ERROR = 'Please enter a valid email address.';

const LOCAL_PART_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL_RE = /^[A-Za-z0-9-]{1,63}$/;
const TLD_RE = /^[A-Za-z]{2,}$/;

export function isValidEmailFormat(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  // Leading/trailing whitespace is rejected outright rather than silently
  // trimmed — a pasted " user@example.com" should surface the same error as
  // any other malformed address, not be quietly cleaned up.
  if (raw !== raw.trim()) return false;
  if (/\s/.test(raw)) return false;

  const atParts = raw.split('@');
  if (atParts.length !== 2) return false; // missing @, or more than one
  const [local, domain] = atParts;
  if (!local || !domain) return false; // "user@" / "@example.com"

  if (!LOCAL_PART_RE.test(local)) return false; // leading/trailing/consecutive dots, bad chars

  const labels = domain.split('.');
  if (labels.length < 2) return false; // "user@example" — no TLD at all
  for (const label of labels) {
    if (!label) return false; // "example..com" / leading or trailing dot
    if (!DOMAIN_LABEL_RE.test(label)) return false; // bad chars (e.g. "_"), or too long
    if (label.startsWith('-') || label.endsWith('-')) return false; // "-example.com" / "example-.com"
  }

  const tld = labels[labels.length - 1];
  return TLD_RE.test(tld); // rejects "example.c" and any non-alphabetic TLD
}
