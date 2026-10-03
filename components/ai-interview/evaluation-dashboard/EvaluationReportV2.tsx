// Evaluation Report tab — converted from Vite source:
// /root/staging/MVP 1- Timed mode (Evaluation) 12-5-26/src/app/components/EvaluationReport.tsx
// MUI Card/Typography/Table → Tailwind. Wired to live DashboardData (no mocks).
import { CheckCircle, XCircle } from 'lucide-react';
import type { DashboardData } from './types';

import { formatScore1, formatSkillScore } from '@/lib/utils/matchStatus';
interface Props {
  data: DashboardData;
  aiConfidence?: number | null;
  /** Display-friendly evaluation ID (e.g. "EV-20260513-AB12"). Optional. */
  evaluationId?: string | null;
}

const MHS_THRESHOLD = 6.0;

function priorityLabel(p: 'High' | 'Medium' | 'Low'): { tag: 'P1' | 'P2' | 'P3'; weight: number } {
  if (p === 'High')   return { tag: 'P1', weight: 10 };
  if (p === 'Medium') return { tag: 'P2', weight: 7 };
  return                   { tag: 'P3', weight: 4 };
}

function scoreColor(score: number) {
  if (score >= 8.0) return { text: 'text-emerald-500', bar: 'bg-emerald-500' };
  if (score >= MHS_THRESHOLD) return { text: 'text-amber-500',   bar: 'bg-amber-500'   };
  return                   { text: 'text-red-500',     bar: 'bg-red-500'     };
}

export function EvaluationReportV2({ data, aiConfidence, evaluationId }: Props) {
  const { candidate, interview, scores, finalResult, sectionsPresent,
          mustHaveClusters, niceToHaveClusters, perQuestionDetails, isPartialEvaluation } = data;

  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = !isPartialEvaluation
    ? (finalResult ?? (isPassed ? 'Pass' : 'Fail')).toUpperCase()
    : 'PARTIAL';
  const confidence = aiConfidence ?? Math.round(scores.final);

  const reportGenerated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const flatMustHave = mustHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name,
    score: s.score,
    ...priorityLabel(c.priority),
  })));
  const flatNiceToHave = niceToHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name,
    score: s.score,
    ...priorityLabel(c.priority),
  })));
  const totalSkills = flatMustHave.length + flatNiceToHave.length;
  const totalQuestions = perQuestionDetails.length;

  // Strengths/weaknesses-style recommendations
  const niceToHaveStrong = scores.niceToHave >= 7.5 ? 'strong' : 'adequate';
  const evalId = evaluationId
    ?? `EV-${(interview.date || '').replace(/[^0-9]/g, '').slice(0, 8) || 'XXXXXXXX'}`;

  return (
    <div className="bg-white max-w-[1200px] mx-auto space-y-6">
      {/* ── Report Header ───────────────────────────────────────────── */}
      <div className="rounded-lg border-2 border-indigo-600 p-8">
        <div className="flex items-start justify-between mb-6 gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-brand-blue text-white font-bold text-2xl flex items-center justify-center shadow-sm">
              AI
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 leading-tight">AI Interview Evaluation Report</div>
              <div className="text-sm text-gray-500">Automated Technical Assessment & Skills Evaluation</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">Report Generated</div>
            <div className="text-sm font-semibold text-gray-900 mb-2">{reportGenerated}</div>
            <div className="text-xs text-gray-400">Evaluation ID: #{evalId}</div>
          </div>
        </div>

        <hr className="border-gray-200 mb-6" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">Candidate Name</div>
            <div className="text-xl font-bold text-gray-900">{candidate.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Position Applied</div>
            <div className="text-xl font-bold text-gray-900">{candidate.role}</div>
          </div>
          {candidate.email && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Email Address</div>
              <div className="text-sm font-semibold text-gray-900">{candidate.email}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500 mb-1">Interview Date</div>
            <div className="text-sm font-semibold text-gray-900">{interview.date || '—'}</div>
          </div>
        </div>

        <hr className="border-gray-200 mb-6" />

        <div
          className={`p-5 rounded-xl border-2 ${
            isPartialEvaluation
              ? 'bg-amber-50 border-amber-300'
              : isPassed
                ? 'bg-emerald-50 border-emerald-500'
                : 'bg-red-50 border-red-500'
          }`}
        >
          <div className="flex items-center gap-4">
            {isPartialEvaluation ? (
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 shrink-0 flex items-center justify-center text-lg font-bold">
                AI
              </div>
            ) : isPassed ? (
              <CheckCircle className="w-12 h-12 text-emerald-500 shrink-0" strokeWidth={1.5} />
            ) : (
              <XCircle className="w-12 h-12 text-red-500 shrink-0" strokeWidth={1.5} />
            )}
            <div className="flex-1">
              <div className={`text-2xl font-bold mb-0.5 ${
                isPartialEvaluation
                  ? 'text-amber-800'
                  : isPassed
                    ? 'text-emerald-800'
                    : 'text-red-800'
              }`}>
                {isPartialEvaluation ? 'Partial Evaluation' : `Final Decision: ${finalResultLabel}`}
              </div>
              <div className={`text-sm ${
                isPartialEvaluation
                  ? 'text-amber-800'
                  : isPassed
                    ? 'text-emerald-800'
                    : 'text-red-800'
              }`}>
                {isPartialEvaluation
                  ? 'This interview ended before completion. The AI evaluated only the questions the candidate attended, so no final pass/fail or match score is generated.'
                  : `${isPassed ? 'Recommended for Hire' : 'Not Recommended for Hire'} • Match Score: ${confidence}%`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Executive Summary ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
          <div className="text-base font-bold text-gray-900">Executive Summary</div>
        </div>
        <div className="p-6 space-y-4 text-sm leading-relaxed text-gray-900">
          <p>
            {candidate.name} {isPartialEvaluation ? 'attended' : 'completed'} an AI-powered technical interview for the{' '}
            {candidate.role} position on {interview.date || 'the scheduled date'}.{' '}
            The report includes <strong>{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}</strong>{' '}
            covering <strong>{totalSkills} skill{totalSkills !== 1 ? 's' : ''}</strong> across multiple priority levels.
          </p>
          {sectionsPresent.mustHave && (
            <p>
              The candidate achieved a <strong>Must-Have Section Score of {formatScore1(scores.mustHave)}/10</strong>,{' '}
              {isPartialEvaluation
                ? 'calculated from the attended questions only.'
                : isPassed
                  ? `which exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${formatScore1((scores.mustHave - MHS_THRESHOLD))} points.`
                  : `which falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${formatScore1((MHS_THRESHOLD - scores.mustHave))} points.`}
              {sectionsPresent.niceToHave && (
                <>
                  {' '}The Nice-to-Have Section Score was <strong>{formatScore1(scores.niceToHave)}/10</strong>,{' '}
                  demonstrating {niceToHaveStrong} proficiency in supplementary skills.
                </>
              )}
            </p>
          )}
          <p>
            {isPartialEvaluation ? (
              <>
                Because the interview was terminated early, this report provides question-by-question and skill-by-skill analysis only.{' '}
                <strong>No final hiring recommendation or overall match score is generated.</strong>
              </>
            ) : (
              <>
                Based on the automated evaluation, this assessment recommends{' '}
                <strong>{isPassed ? 'proceeding with the hiring process' : 'not proceeding with the current application'}</strong>{' '}
                with an AI confidence level of <strong>{confidence}%</strong>.
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Detailed Score Breakdown ────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
          <div className="text-base font-bold text-gray-900">Detailed Score Breakdown</div>
        </div>
        <div className="divide-y divide-gray-100">
          {sectionsPresent.mustHave && (
            <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center bg-emerald-50/60 px-5 py-4 gap-2">
              <div className="text-sm font-bold text-emerald-800">Must-Have Section Score</div>
              <div className="text-2xl font-bold text-emerald-500">{formatScore1(scores.mustHave)}</div>
              <div className="pr-3">
                <div className="h-3.5 bg-emerald-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(scores.mustHave / 10) * 100}%` }} />
                </div>
              </div>
              <div>
                {isPartialEvaluation ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    Partial
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {isPassed
                      ? <CheckCircle className="w-3.5 h-3.5" />
                      : <XCircle className="w-3.5 h-3.5" />}
                    {isPassed ? 'PASS' : 'FAIL'}
                  </span>
                )}
              </div>
            </div>
          )}
          {sectionsPresent.niceToHave && (
            <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center px-5 py-4 gap-2">
              <div className="text-sm font-semibold text-gray-900">Nice-to-Have Section Score</div>
              <div className="text-2xl font-bold text-indigo-500">{formatScore1(scores.niceToHave)}</div>
              <div className="pr-3">
                <div className="h-3.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(scores.niceToHave / 10) * 100}%` }} />
                </div>
              </div>
              <div>
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  Info Only
                </span>
              </div>
            </div>
          )}
          {!isPartialEvaluation && (
            <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center bg-gray-50 px-5 py-4 gap-2">
              <div className="text-sm font-semibold text-gray-900">Overall Average Score</div>
              <div className="text-2xl font-bold text-indigo-700">{formatScore1((scores.final / 10))}</div>
              <div className="pr-3">
                <div className="h-3.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-700 rounded-full" style={{ width: `${scores.final}%` }} />
                </div>
              </div>
              <div className="text-xs italic text-gray-500">Reference only</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Skills Assessment Summary ───────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
          <div className="text-base font-bold text-gray-900">Skills Assessment Summary</div>
        </div>

        {sectionsPresent.mustHave && flatMustHave.length > 0 && (
          <div className="p-6 border-b border-gray-200">
            <div className="text-sm font-bold text-gray-900 mb-3">
              Must-Have Skills ({flatMustHave.length} skill{flatMustHave.length !== 1 ? 's' : ''} evaluated)
            </div>
            <div className="space-y-1">
              {flatMustHave.map((s, i) => {
                const sc = scoreColor(s.score);
                const tagBg = s.tag === 'P1' ? 'bg-indigo-600' : s.tag === 'P2' ? 'bg-indigo-500' : 'bg-indigo-400';
                return (
                  <div key={`mh-${i}`} className="grid grid-cols-[30%_15%_15%_minmax(0,1fr)_15%] items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                    <div>
                      <span className={`inline-block text-2xs font-bold text-white px-2 py-0.5 rounded ${tagBg}`}>
                        {s.tag}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">Weight: {s.weight}</div>
                    <div className="pr-2">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                      </div>
                    </div>
                    <div className={`text-base font-bold ${sc.text} text-right`}>{formatSkillScore(s.score)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sectionsPresent.niceToHave && flatNiceToHave.length > 0 && (
          <div className="p-6">
            <div className="text-sm font-bold text-gray-900 mb-3">
              Nice-to-Have Skills ({flatNiceToHave.length} skill{flatNiceToHave.length !== 1 ? 's' : ''} evaluated)
            </div>
            <div className="space-y-1">
              {flatNiceToHave.map((s, i) => {
                const sc = scoreColor(s.score);
                const tagBg = s.tag === 'P1' ? 'bg-amber-500' : 'bg-amber-400';
                return (
                  <div key={`nh-${i}`} className="grid grid-cols-[30%_15%_15%_minmax(0,1fr)_15%] items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                    <div>
                      <span className={`inline-block text-2xs font-bold text-white px-2 py-0.5 rounded ${tagBg}`}>
                        {s.tag}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">Weight: {s.weight}</div>
                    <div className="pr-2">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                      </div>
                    </div>
                    <div className={`text-base font-bold ${sc.text} text-right`}>{formatSkillScore(s.score)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {flatMustHave.length === 0 && flatNiceToHave.length === 0 && (
          <div className="p-6 text-sm text-gray-400 italic text-center">No skills evaluated yet.</div>
        )}
      </div>

      {/* ── Question-by-Question Performance ────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
          <div className="text-base font-bold text-gray-900">Question-by-Question Performance</div>
        </div>
        {perQuestionDetails.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {perQuestionDetails.map((q, i) => {
              const isHR = q.section === 'hr';
              const sc = scoreColor(q.questionScore);
              const sectionLabel = q.section === 'mth' ? 'Must-Have' : q.section === 'nth' ? 'Nice-to-Have' : 'HR';
              const sectionClass = q.section === 'mth'
                ? 'bg-indigo-50 text-indigo-600'
                : q.section === 'nth'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-purple-50 text-purple-600';
              // HR section is "Not scored — review only" per spec (memory:
              // project_ai_interview_timed_eval_spec). Show the actual
              // question text instead of skill chips (HR isn't about JD
              // skills) and a dash for the score column so the row reads
              // unambiguously as review-only.
              const middleText = isHR
                ? q.question
                : (q.skills.map(s => s.name).join(', ') || q.question);
              return (
                <div
                  key={i}
                  className={`grid grid-cols-[15%_20%_minmax(0,1fr)_15%] items-center px-5 py-3 gap-3 ${
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-bold text-indigo-600">Q{q.qNum}</div>
                  <div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sectionClass}`}>
                      {sectionLabel}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {middleText}
                  </div>
                  {isHR ? (
                    <div className="text-xs font-medium text-gray-400 text-right italic">Review only</div>
                  ) : (
                    <div className={`text-base font-bold ${sc.text} text-right`}>{formatScore1(q.questionScore)}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-sm text-gray-400 italic text-center">No question-level data available.</div>
        )}
      </div>

      {/* ── Recommendations & Next Steps ────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
          <div className="text-base font-bold text-gray-900">Recommendations & Next Steps</div>
        </div>
        <div className="p-6">
          {isPartialEvaluation ? (
            <>
              <div className="text-sm font-bold text-amber-800 mb-3">Partial Interview Guidance:</div>
              <ul className="space-y-2 text-sm leading-relaxed text-gray-900">
                <li><strong>Review attended answers only:</strong> These scores reflect only the questions the candidate reached before termination</li>
                <li><strong>Avoid final hiring decisions from this report:</strong> There is no complete must-have coverage or valid overall match score</li>
                <li><strong>Re-run the interview if needed:</strong> Schedule a fresh interview when a full hiring signal is required</li>
              </ul>
            </>
          ) : isPassed ? (
            <>
              <div className="text-sm font-bold text-emerald-800 mb-3">✓ Recommended Actions:</div>
              <ul className="space-y-2 text-sm leading-relaxed text-gray-900">
                <li><strong>Proceed to next round:</strong> Candidate demonstrates strong technical competency across must-have skills</li>
                <li><strong>Technical interview:</strong> Consider a deeper assessment in core architecture and design topics</li>
                <li><strong>Cultural fit:</strong> Schedule a behavioral interview to assess team alignment</li>
                <li><strong>Areas to explore:</strong> Skills showing medium-level proficiency can benefit from additional validation</li>
              </ul>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-red-800 mb-3">⚠ Recommended Actions:</div>
              <ul className="space-y-2 text-sm leading-relaxed text-gray-900">
                <li><strong>Do not proceed:</strong> Candidate did not meet the minimum requirements for must-have skills</li>
                <li><strong>Skills gap identified:</strong> Significant development needed in core technical areas</li>
                <li><strong>Alternative path:</strong> Consider for junior positions or recommend additional training</li>
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── Footer (Methodology + Confidentiality) ──────────────────── */}
      <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-6">
        <p className="text-xs text-indigo-800 leading-relaxed mb-3">
          <strong>Evaluation Methodology:</strong> This report was generated using AI-powered automated assessment technology.
          Scores are calculated based on LLM analysis of candidate responses against predefined technical competency criteria.
          Must-Have Section Score = Average of Must-Have question scores (Pass threshold ≥ {MHS_THRESHOLD.toFixed(1)}).
          Nice-to-Have Section Score = Average of Nice-to-Have question scores (informational only).
          Question Score = Σ(Skill Score × Priority Weight) / ΣWeights where P1=10, P2=7, P3=4.
          {isPartialEvaluation && ' For terminated interviews, this report evaluates only the attended questions and does not generate a final decision.'}
        </p>
        <hr className="border-indigo-200 my-3" />
        <p className="text-xs text-indigo-600 leading-relaxed">
          <strong>Confidentiality Notice:</strong> This evaluation report contains proprietary and confidential information.
          It is intended solely for authorized personnel involved in the hiring decision process.
          Unauthorized distribution, copying, or disclosure is strictly prohibited.
        </p>
      </div>
    </div>
  );
}
