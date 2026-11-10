/**
 * A candidate name as Job Details' result tables show it: the FIRST NAME with
 * its first letter capitalised and the rest of it lower case; every later word
 * exactly as stored. `john doe` → `John doe`, `aLLEN PARK` → `Allen PARK`.
 *
 * Display only. The stored name, what is sent back to the API, search, sort,
 * filters and exports all keep reading the original value. Empty, blank or
 * missing names come back unchanged (so each table's own fallback still
 * applies), as do leading spaces and anything that is not a letter.
 */
export function formatCandidateFirstName<T extends string | null | undefined>(name: T): T {
  if (typeof name !== 'string') return name;
  const match = /^(\s*)(\S+)([\s\S]*)$/.exec(name);
  if (!match) return name;
  const [, lead, first, rest] = match;
  return `${lead}${first.charAt(0).toLocaleUpperCase()}${first.slice(1).toLocaleLowerCase()}${rest}` as T;
}

/**
 * A person's name in Capitalized Case, whatever case it was stored in —
 * "PRIYA SHARMA" / "arun KUMAR" → "Priya Sharma" / "Arun Kumar". A letter is
 * capitalised after a space, dot, apostrophe or hyphen ("O'Brien",
 * "Jean-Luc"). What the invite trackers and results tables show. Display only,
 * as above; empty / missing names come back as they were.
 */
export function capitalizedCase(raw: string | null | undefined): string {
  if (!raw) return raw ?? '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/(^|[\s.'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
