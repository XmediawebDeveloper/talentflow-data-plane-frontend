// Score and insight helpers for a candidate's assessment result, shared by the
// result page (components/CandidateResultDetails.tsx) and its client-side
// report PDF (lib/reports/assessmentReportPdf.ts), so both show the same
// marks, percentages and bullet points.
import type { QuestionEvaluation } from '@/lib/services';
import { toOneDecimalScore } from '@/lib/utils/score';

/** AI insight text → bullet points. Explicit lines / bullets win; otherwise
 *  'sentences' splits prose at sentence ends and 'list' splits a
 *  comma-separated list ("Writing clarity, detailed explanation, …"). */
export function toInsightPoints(text: string, mode: 'sentences' | 'list'): string[] {
  const clean = (t: string) => t.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  if (lines.length > 1) return lines;
  const parts = mode === 'list'
    ? text.split(/\s*[,;]\s*/)
    : text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return parts.map(clean).filter(Boolean);
}

export function getCodingEvaluationState(q: QuestionEvaluation) {
  const judged = q.candidate_test_results;
  const hasCode = !!q.candidate_code_submission?.trim();
  const hasJudgedTests = !!judged?.details && judged.details.length > 0;
  const marks = judged?.marks_breakdown;

  if (!hasCode) {
    return {
      summary: 'No code submitted.',
      warning: null as string | null,
      marks,
    };
  }

  if (!hasJudgedTests) {
    return {
      summary: 'Code submission exists, but judged test-case results are missing. Rescore required.',
      warning: 'Saved run output may be visible below, but it is not authoritative judged evaluation.',
      marks,
    };
  }

  return {
    summary: judged?.summary || q.feedback || 'Judged coding evaluation available.',
    warning: null as string | null,
    marks,
  };
}

export function getNormalizedQuestionPossiblePoints(q: QuestionEvaluation) {
  return q.points_possible === 100 ? 10 : (q.points_possible || 10);
}

export function getDisplayedQuestionEarnedPoints(q: QuestionEvaluation) {
  const normalizedEarned = q.points_possible === 100 ? (q.points_earned || 0) / 10 : (q.points_earned || 0);
  return toOneDecimalScore(normalizedEarned);
}

export function getDisplaySectionPercentage(questions: QuestionEvaluation[]) {
  const totalPossible = questions.reduce((sum, q) => sum + getNormalizedQuestionPossiblePoints(q), 0);
  const totalDisplayedEarned = questions.reduce((sum, q) => sum + getDisplayedQuestionEarnedPoints(q), 0);
  if (totalPossible <= 0) return 0;
  // One decimal, like every other mark on the page: 17/180 reads 9.4%, not 9%.
  return toOneDecimalScore((totalDisplayedEarned / totalPossible) * 100);
}

/** Answered = actually submitted something: code for a coding question,
 *  a selected option or answer text otherwise. */
export function isQuestionAnswered(q: QuestionEvaluation): boolean {
  return q.question_type === 'coding'
    ? !!q.candidate_code_submission?.trim()
    : (q.candidate_selected_options?.length ?? 0) > 0 || !!q.candidate_answer_text?.trim();
}
