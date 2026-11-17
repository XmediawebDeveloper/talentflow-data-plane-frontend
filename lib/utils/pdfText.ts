// Text helpers shared by the client-side report PDFs (AI interview evaluation
// report and assessment result report).
//
// jsPDF's built-in Helvetica only has WinAnsi (Latin-1 + cp1252) glyphs.
// Anything else (Tamil, Hindi, ≥, ✓ …) prints as mojibake AND makes jsPDF
// letter-space the whole line, so text is filtered before it is drawn.
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const PDF_CHAR_SUBS: Record<string, string> = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '×': 'x', '−': '-' };

export const isPdfSafeChar = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch);
};

/** The text with every character Helvetica can't draw substituted or dropped. */
export const pdfSafe = (value: string) =>
  Array.from(value || '')
    .map((ch) => (ch === '\n' || isPdfSafeChar(ch) ? ch : (PDF_CHAR_SUBS[ch] ?? '')))
    .join('')
    .replace(/[ \t]{2,}/g, ' ');

/** True when a meaningful share (≥30%) of the letters are in a script
 *  Helvetica can't draw — a few stray words in an English answer are just
 *  dropped by pdfSafe instead of hiding the whole answer. */
export const hasNonLatinScript = (value: string) => {
  const letters = Array.from(value || '').filter((ch) => /\p{L}/u.test(ch));
  if (letters.length === 0) return false;
  const nonLatin = letters.filter((ch) => !isPdfSafeChar(ch)).length;
  return nonLatin / letters.length >= 0.3;
};
