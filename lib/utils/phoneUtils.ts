// A single resume / candidate phone field can pack more than one number into
// one string (separated by comma, slash, semicolon, pipe or newline). This
// splits that string into individual, trimmed numbers and optionally caps how
// many are returned (e.g. show at most two).
export function splitPhoneNumbers(phone?: string | null, max?: number): string[] {
  if (!phone || phone === 'No phone') return [];
  const numbers = phone
    .split(/[,;/|\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return typeof max === 'number' ? numbers.slice(0, max) : numbers;
}
