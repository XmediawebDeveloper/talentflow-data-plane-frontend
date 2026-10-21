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

/* Mail providers whose domains are mistyped often enough to be worth
   catching. A well-formed address is not a real one: "gmail.om" passes every
   format rule (.om is Oman's TLD) yet no Gmail user has it. Kept in step with
   the backend's KNOWN_EMAIL_DOMAINS (app/services/email.py). */
const KNOWN_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.in',
  'ymail.com', 'rocketmail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.in',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com',
  'proton.me', 'zoho.com', 'zohomail.in', 'rediffmail.com', 'mail.com', 'email.com', 'gmx.com', 'yandex.com',
];
const KNOWN_EMAIL_DOMAIN_SET = new Set(KNOWN_EMAIL_DOMAINS);
/* Providers with a single domain: their name under ANY other ending
   ("gmail.om", "gmail.co", "icloud.cm") is a typo. Providers with genuine
   country domains (yahoo.fr, hotmail.de, outlook.in…) are left out. */
const SINGLE_DOMAIN_PROVIDERS: Record<string, string> = {
  gmail: 'gmail.com',
  googlemail: 'googlemail.com',
  icloud: 'icloud.com',
  rediffmail: 'rediffmail.com',
  ymail: 'ymail.com',
  rocketmail: 'rocketmail.com',
  protonmail: 'protonmail.com',
};
/* ".com" typos. Some are real country TLDs (.om, .cm, .co), which is why this
   only applies to a known provider's name: "yahoo.om" is a typo, "shop.om" is not. */
const COM_TYPOS = new Set(['con', 'cmo', 'ocm', 'comm', 'coom', 'vom', 'xom', 'cpm', 'cim', 'clm', 'c0m', 'om', 'cm', 'co']);

/** Optimal-string-alignment distance: insertions, deletions, substitutions
 *  and swaps of two neighbouring letters each cost 1 ("gamil" → "gmail" is 1). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * The provider domain a mistyped one was meant to be, or null when the
 * domain is not a recognisable misspelling. Checked only on a well-formed
 * address. One edit is the limit, and only against domains of 8+ characters
 * with the same ending, so short real domains (me.com, msn.com, aol.com…)
 * and country domains (yahoo.co.id beside yahoo.co.in) never collide.
 */
export function suggestEmailDomain(domain: string): string | null {
  const d = domain.toLowerCase();
  if (KNOWN_EMAIL_DOMAIN_SET.has(d)) return null;
  const labels = d.split('.');
  const tld = labels[labels.length - 1];
  const name = labels.slice(0, -1).join('.');
  // gmail.om, gmail.co, gmail.cm …
  if (SINGLE_DOMAIN_PROVIDERS[name]) return SINGLE_DOMAIN_PROVIDERS[name];
  // yahoo.con, outlook.om …
  if (COM_TYPOS.has(tld) && KNOWN_EMAIL_DOMAIN_SET.has(`${name}.com`)) return `${name}.com`;
  // gmial.com, gamil.com, hotmal.com, outlok.com …
  for (const known of KNOWN_EMAIL_DOMAINS) {
    if (known.length >= 8 && known.endsWith(`.${tld}`) && editDistance(d, known) === 1) return known;
  }
  return null;
}

/**
 * Why `raw` is not an acceptable email, or null when it is. Malformed →
 * EMAIL_FORMAT_ERROR; a misspelt provider domain → that error plus the
 * corrected address ("Did you mean name@gmail.com?").
 */
export function emailValidationError(raw: string | null | undefined): string | null {
  if (!isWellFormedEmail(raw)) return EMAIL_FORMAT_ERROR;
  const at = raw!.lastIndexOf('@');
  const suggestion = suggestEmailDomain(raw!.slice(at + 1));
  return suggestion ? `${EMAIL_FORMAT_ERROR} Did you mean ${raw!.slice(0, at)}@${suggestion}?` : null;
}

/** Well-formed AND not a misspelt provider domain — every caller's gate. */
export function isValidEmailFormat(raw: string | null | undefined): boolean {
  return emailValidationError(raw) === null;
}

function isWellFormedEmail(raw: string | null | undefined): boolean {
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
