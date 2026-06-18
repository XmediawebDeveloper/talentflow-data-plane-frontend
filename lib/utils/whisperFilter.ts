/**
 * Whisper STT hallucination filter.
 *
 * OpenAI Whisper, when given silence, low-volume speech, music, or background
 * noise, falls back to phrases that appear frequently in its training data —
 * subtitle credits, captioning conventions, song lyrics, channel intros, and
 * looping repetitions of the previous decoded n-gram. Those snippets are NOT
 * candidate speech and must not be shown as the candidate's answer.
 *
 * This filter rejects ONLY obvious artifacts. Real answers (even short ones,
 * even off-topic ones) must always pass — the cost of a false positive (a
 * candidate's real "Yes" being dropped) is far higher than the cost of a
 * false negative (one stray hallucination making it through).
 *
 * Sources for these patterns:
 *   - Practice-session bug reports showing "Please help! This is a big problem!",
 *     "Transcription by ESO. Translation by …", and 4× "But teacher need a break."
 *   - Whisper community-tracked hallucination corpora.
 */

const HALLUCINATION_PATTERNS: RegExp[] = [
  // Bracketed sound annotations: [music], [applause], [laughter]
  /^\[.*\]$/,

  // Subtitle / caption attributions
  /^(subtitles|captions).*amara/i,
  /transcription\s+by\s+/i,
  /translation\s+by\s+/i,
  /subtitled\s+by\s+/i,
  /subtitles?\s+by\s+/i,
  /captions?\s+by\s+/i,
  /\bESO\b.*translation/i,
  /\bAmara\.org\b/i,

  // Channel / video close-outs
  /^thank you for (watching|listening)/i,
  /^thanks for (watching|listening)/i,
  /^please (like|subscribe|follow|share)/i,
  /\bdon'?t forget to (like|subscribe|comment)/i,
  /\bsmash that like button\b/i,
  /\bring the bell\b/i,

  // Common song-lyric / dramatic-snippet hallucinations
  /^please help!?\s*this is a big problem!?$/i,
  /^you'?re watching\s+/i,
];

/**
 * Detect Whisper's repeating-phrase failure mode (e.g.
 * "But teacher need a break. But teacher need a break. But teacher need a break.").
 * Returns true if the same short phrase repeats ≥ 3 times back-to-back AND
 * makes up the bulk of the text.
 */
function isRepetitionLoop(text: string): boolean {
  const cleaned = text.trim();
  // Split on common sentence terminators while keeping content.
  const fragments = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(f => f.trim().toLowerCase().replace(/[.!?]+$/, ''))
    .filter(Boolean);
  if (fragments.length < 3) return false;
  // Count consecutive identical fragments anywhere in the list.
  let runLen = 1;
  let maxRun = 1;
  for (let i = 1; i < fragments.length; i++) {
    if (fragments[i] === fragments[i - 1] && fragments[i].length > 0) {
      runLen += 1;
      if (runLen > maxRun) maxRun = runLen;
    } else {
      runLen = 1;
    }
  }
  // Require at least 3 identical consecutive fragments AND the repeated
  // fragment's combined length to dominate the transcript.
  if (maxRun < 3) return false;
  const repeatedFragment = fragments.find((f, i) =>
    i > 0 && f === fragments[i - 1]
  ) || '';
  const dominance = (repeatedFragment.length * maxRun) / cleaned.length;
  return dominance > 0.6;
}

const ROMANIZED_TAMIL_MARKERS = new Set([
  'aama', 'ama', 'adha', 'adhu', 'adhe', 'antha', 'andha', 'anga',
  'apdi', 'appadi', 'avanga', 'avan', 'aval', 'da', 'di', 'dhan',
  'dhaan', 'enna', 'enakku', 'enga', 'epdi', 'eppadi', 'idhu',
  'idha', 'idhula', 'idathula', 'illa', 'illai', 'iruka', 'iruku',
  'irukku', 'irukiya', 'irukkinga', 'mudiyuma', 'mudiyum', 'naan',
  'namma', 'nee', 'neenga', 'oru', 'panna', 'pannala', 'pannum',
  'panren', 'pesu', 'pesuren', 'sari', 'seri', 'solra', 'sollunga',
  'sollu', 'thaniya', 'theriyala', 'theriyum', 'unga', 'vandirucha',
  'vanducha', 'varum', 'vechirukiya', 'venum',
]);

function looksRomanizedTamil(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length < 2) return false;
  const markerCount = words.filter(word => ROMANIZED_TAMIL_MARKERS.has(word)).length;
  if (markerCount >= 2) return true;
  const suffixCount = words.filter(word =>
    word.length >= 5 && /(kku|nga|la|uma|iya|ucha)$/.test(word)
  ).length;
  return markerCount >= 1 && suffixCount >= 2;
}

/**
 * Returns true if the text looks like real candidate speech (should be shown
 * to the user / sent to the LLM). Returns false for known Whisper hallucinations.
 */
export function isTranscriptMeaningful(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (HALLUCINATION_PATTERNS.some(p => p.test(t))) return false;
  if (isRepetitionLoop(t)) return false;
  if (looksRomanizedTamil(t)) return false;
  return true;
}
