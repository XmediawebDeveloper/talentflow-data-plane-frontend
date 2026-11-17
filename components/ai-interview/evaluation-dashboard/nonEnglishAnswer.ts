// The original (non-English) ASR text belongs ONLY in the Transcript tab's
// "Original (ASR)" bubble. Every other surface (Question Analysis, Evaluation
// Report, PDF) shows English-only content, so a not-scored answer is named
// rather than reproduced. Older interviews stored the raw text in the answer
// as "[non-English / … — not scored] <raw>", so this also catches those.
import { hasNonLatinScript } from '@/lib/utils/pdfText';

const NOT_SCORED_TAG = /^\s*\[[^\]]*(non-English|not scored)[^\]]*\]/i;

export const NON_ENGLISH_ANSWER_TEXT =
  'Answered in a language other than English — not scored. The original answer is in the Transcript tab.';

export const isNonEnglishAnswer = (answer: unknown): boolean => {
  const a = String(answer || '').trim();
  return !!a && (NOT_SCORED_TAG.test(a) || hasNonLatinScript(a));
};
