// Values that mean "no phone on file". They must never reach the splitter —
// "N/A" would otherwise split on the slash and render as two stacked lines.
const PLACEHOLDER_PHONES = new Set([
  'n/a', 'n.a.', 'na', 'not available', 'not provided', 'none',
  'null', 'undefined', 'no phone', '-', '--',
]);

// A single resume / candidate phone field can pack more than one number into
// one string (separated by comma, slash, semicolon, pipe or newline). This
// splits that string into individual, trimmed numbers and optionally caps how
// many are returned (e.g. show at most two).
export function splitPhoneNumbers(phone?: string | null, max?: number): string[] {
  if (!phone) return [];

  const trimmed = phone.trim();
  if (!trimmed || PLACEHOLDER_PHONES.has(trimmed.toLowerCase())) return [];

  const numbers = trimmed
    .split(/[,;/|\n]+/)
    .map((p) => p.trim())
    // A real number always carries at least one digit; dropping digit-less
    // fragments keeps placeholder text from being split into pieces.
    .filter((p) => /\d/.test(p));

  return typeof max === 'number' ? numbers.slice(0, max) : numbers;
}
