import { Calculator, CheckCircle, XCircle } from 'lucide-react';
import type { DashboardData, PerQuestionDetail } from './types';

interface Props {
  data: DashboardData;
}

/** Timed-mode Evaluation Breakdown — mirrors the 5-step methodology in the
 *  "AI INTERVIEW — TIMED APPROACH EVALUATION (SIMPLIFIED)" spec:
 *
 *    1. Skill Score (0–10) from the LLM, per skill assigned to a question.
 *    2. Weighted Contribution = Skill Score × Priority Weight (H=10 / M=7 / L=4).
 *    3. Question Score = Σ(Skill × Weight) / Σ(Weights).
 *    4. Section Score = mean of Question Scores within MHS / NHS.
 *    5. Final Result: PASS if MHS Section Score ≥ 6.0, else FAIL.
 *
 *  The numbers shown here are pulled from ai_evaluation:
 *    - perQuestionDetails (built in adapter.ts from skill_question_map +
 *      skill_priority_map + question_scores + question_groups)
 *    - scores.mustHave / scores.niceToHave (= section_question_avg)
 *    - finalResult / mhsThreshold
 *  …so what the recruiter sees IS the math the backend ran.
 */
export function TimedEvaluationBreakdown({ data }: Props) {
  const { perQuestionDetails, scores, finalResult, mhsThreshold, sectionsPresent } = data;
  const mhsQuestions = perQuestionDetails.filter(q => q.section === 'mth');
  const nhsQuestions = perQuestionDetails.filter(q => q.section === 'nth');
  const isPass = finalResult === 'Pass';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Calculator size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Evaluation Breakdown</h2>
          <p className="text-sm text-gray-500">
            Skill → Question → Section → Final result. Weights: High = 10, Medium = 7, Low = 4.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* STEP 1 — Skill score */}
        <Step n={1} title="Skill Score (0–10)">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Every skill assigned to a question is rated independently by the LLM evaluator (0–10)
            based on the candidate's answer — quoting evidence and noting any gaps.
          </p>
        </Step>

        {/* STEP 2 — Weighted contribution */}
        <Step n={2} title="Weighted Contribution per Skill">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Each skill's contribution to its question is its score scaled by its priority weight.
          </p>
          <CodeBlock>
            Weighted Contribution = Skill Score × Priority Weight
          </CodeBlock>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Weight label="High Priority" value={10} color="emerald" />
            <Weight label="Medium Priority" value={7} color="amber" />
            <Weight label="Low Priority" value={4} color="slate" />
          </div>
        </Step>

        {/* STEP 3 — Per-question table with real numbers */}
        <Step n={3} title="Question Score">
          <CodeBlock>
            Question Score = Σ (Skill Score × Skill Weight) / Σ (Skill Weights)
          </CodeBlock>

          {mhsQuestions.length > 0 && (
            <QuestionTable
              title="Must-Have Questions"
              tone="emerald"
              rows={mhsQuestions}
            />
          )}
          {nhsQuestions.length > 0 && (
            <QuestionTable
              title="Nice-to-Have Questions"
              tone="amber"
              rows={nhsQuestions}
            />
          )}
          {perQuestionDetails.length === 0 && (
            <div className="mt-3 text-sm text-gray-500 italic">
              No per-question evaluation data available for this interview.
            </div>
          )}
        </Step>

        {/* STEP 4 — Section scores */}
        <Step n={4} title="Section Score">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Each section's score is the simple average of its question scores.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {sectionsPresent.mustHave && (
              <SectionPill
                label="Must-Have Section"
                value={scores.mustHave}
                count={mhsQuestions.length}
                tone={isPass ? 'emerald' : 'red'}
              />
            )}
            {sectionsPresent.niceToHave && (
              <SectionPill
                label="Nice-to-Have Section"
                value={scores.niceToHave}
                count={nhsQuestions.length}
                tone="amber"
                informational
              />
            )}
          </div>
        </Step>

        {/* STEP 5 — Final gate */}
        <Step n={5} title="Final Result">
          <div
            className={`p-5 rounded-xl border-2 flex items-start gap-4 ${
              isPass
                ? 'bg-emerald-50 border-emerald-300'
                : finalResult === 'Fail'
                  ? 'bg-red-50 border-red-300'
                  : 'bg-gray-50 border-gray-300'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isPass ? 'bg-emerald-500' : finalResult === 'Fail' ? 'bg-red-500' : 'bg-gray-400'
              }`}
            >
              {isPass
                ? <CheckCircle size={26} className="text-white" />
                : <XCircle size={26} className="text-white" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <div
                  className={`text-2xl font-bold ${
                    isPass ? 'text-emerald-900' : finalResult === 'Fail' ? 'text-red-900' : 'text-gray-700'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {finalResult ? finalResult.toUpperCase() : '—'}
                </div>
                <div className="text-sm text-gray-600">
                  Must-Have <strong>{scores.mustHave.toFixed(2)} / 10</strong>
                  {' '}
                  {isPass ? '≥' : '<'} {mhsThreshold.toFixed(1)} threshold
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                The Must-Have section score is the primary pass/fail gate. Nice-to-Have is
                informational. HR questions are never scored.
              </p>
            </div>
          </div>
        </Step>
      </div>
    </div>
  );
}

// ── Small presentation helpers ─────────────────────────────────────────────

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-xs">
          {n}
        </span>
        {title}
      </h3>
      <div className="pl-8">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700">
      <code className="text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
        {children}
      </code>
    </div>
  );
}

function Weight({ label, value, color }: { label: string; value: number; color: 'emerald' | 'amber' | 'slate' }) {
  const styles =
    color === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : color === 'amber'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : 'bg-slate-50 border-slate-200 text-slate-900';
  return (
    <div className={`p-3 rounded-lg border ${styles}`}>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
        × {value}
      </div>
    </div>
  );
}

function SectionPill({
  label, value, count, tone, informational,
}: {
  label: string; value: number; count: number;
  tone: 'emerald' | 'amber' | 'red';
  informational?: boolean;
}) {
  const styles =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
      : tone === 'amber'
        ? 'bg-amber-50 border-amber-300 text-amber-900'
        : 'bg-red-50 border-red-300 text-red-900';
  return (
    <div className={`p-4 rounded-xl border-2 ${styles}`}>
      <div className="text-xs uppercase tracking-wider font-semibold opacity-80 mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div className="text-3xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
        {value.toFixed(2)}<span className="text-base opacity-60 font-normal"> / 10</span>
      </div>
      <div className="text-[11px] opacity-70 mt-1">
        avg of {count} question{count === 1 ? '' : 's'}
        {informational && ' • informational only'}
      </div>
    </div>
  );
}

function QuestionTable({
  title, tone, rows,
}: {
  title: string;
  tone: 'emerald' | 'amber';
  rows: PerQuestionDetail[];
}) {
  const palette =
    tone === 'emerald'
      ? { header: 'bg-emerald-100 text-emerald-900', row: 'odd:bg-emerald-50/40', strong: 'text-emerald-900' }
      : { header: 'bg-amber-100 text-amber-900', row: 'odd:bg-amber-50/40', strong: 'text-amber-900' };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold ${palette.header}`} style={{ fontFamily: 'var(--font-mono)' }}>
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Q</th>
              <th className="px-4 py-2 text-left font-semibold">Skill</th>
              <th className="px-4 py-2 text-right font-semibold">Priority</th>
              <th className="px-4 py-2 text-right font-semibold">Weight</th>
              <th className="px-4 py-2 text-right font-semibold">Score</th>
              <th className="px-4 py-2 text-right font-semibold">Score × Weight</th>
              <th className="px-4 py-2 text-right font-semibold">Question Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(q => {
              const skillCount = q.skills.length;
              return q.skills.map((s, idx) => (
                <tr key={`${q.qNum}-${idx}`} className={`border-t border-gray-100 ${palette.row}`}>
                  {idx === 0 && (
                    <td
                      rowSpan={skillCount}
                      className={`px-4 py-2 font-bold align-top ${palette.strong}`}
                    >
                      Q{q.qNum}
                    </td>
                  )}
                  <td className="px-4 py-2 text-gray-800">{s.name}</td>
                  <td className="px-4 py-2 text-right">{s.priority}</td>
                  <td className="px-4 py-2 text-right">{s.weight}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <span className={s.is_skipped ? 'text-gray-400' : ''}>{s.score.toFixed(1)}</span>
                      {s.is_skipped ? (
                        <span
                          className="inline-flex items-center px-1 py-0 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-300"
                          title="Candidate skipped or said 'I don't know' — not scored for this skill."
                        >
                          Skipped
                        </span>
                      ) : s.is_fallback ? (
                        <span
                          className="inline-flex items-center px-1 py-0 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"
                          title="Q-level fallback: not directly evaluated; reflects overall answer score for this question."
                        >
                          Q
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{(s.score * s.weight).toFixed(1)}</td>
                  {idx === 0 && (
                    <td
                      rowSpan={skillCount}
                      className={`px-4 py-2 text-right font-bold text-base align-top ${palette.strong}`}
                    >
                      {q.questionScore.toFixed(2)}
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
