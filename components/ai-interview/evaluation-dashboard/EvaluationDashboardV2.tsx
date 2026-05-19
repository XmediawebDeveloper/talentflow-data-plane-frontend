// Evaluation Dashboard tab — converted from Vite sources:
// - SkillBreakdown.tsx     → "Skills" sub-view (per-skill analysis accordion)
// - QuestionAnalysis.tsx   → "Questions" sub-view (per-question accordion + math)
// - ExampleScenarios.tsx   → "Formula" sub-view (scoring formula reference)
// MUI Accordion/Card → Tailwind disclosure. Wired to live DashboardData.
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Clock, Brain, Calculator, X, MessageSquare,
} from 'lucide-react';
import type { DashboardData, PerQuestionDetail } from './types';

interface Props {
  data: DashboardData;
}

const MHS_THRESHOLD = 7.0;

type SubView = 'skills' | 'questions' | 'formula';

function priorityTag(p: 'High' | 'Medium' | 'Low') {
  if (p === 'High')   return { tag: 'P1', weight: 10, bg: 'bg-indigo-50', text: 'text-indigo-700' };
  if (p === 'Medium') return { tag: 'P2', weight: 7,  bg: 'bg-amber-50',  text: 'text-amber-700'  };
  return                   { tag: 'P3', weight: 4,  bg: 'bg-pink-50',   text: 'text-pink-700'   };
}

/** Best-effort split of a Skill.feedback string into strengths and growth.
 *  Heuristic: sentence-by-sentence, keyword-classified, score-aware fallback
 *  for ambiguous sentences. Single-sentence feedback isn't split — splitting
 *  one observation into "Strengths" + "Growth" panels just duplicates the
 *  AI Analysis box (and the original default pushed unmatched sentences to
 *  strengths, so a vague-answer note like "I know about — no detail" would
 *  surface as a strength). When this returns empty arrays the caller falls
 *  back to showing the AI Analysis paragraph only. */
function splitFeedback(
  feedback: string,
  score: number = -1,
): { strengths: string[]; growth: string[] } {
  if (!feedback) return { strengths: [], growth: [] };
  const sentences = feedback
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  // One sentence isn't a split — skip and let the caller render AI Analysis only.
  if (sentences.length < 2) return { strengths: [], growth: [] };

  const STRENGTH_RX = /\b(good|strong|solid|clear|excellent|deep|thorough|confident|robust|well|proficient|demonstrated|showed|exhibits|grasped|experience|skilled|knowledgeable|comprehensive|effective)\b/i;
  const GROWTH_RX   = /\b(weak|lacks?|missing|limited|unclear|struggled|could|should|need(s|ed)?|improvement|improve|gap|low|insufficient|consider|explore|vague|brief|minimal|barely|without|didn'?t|doesn'?t|did not|does not|no detail|not specific|unanswered|skipped|short|superficial|generic)\b/i;

  const strengths: string[] = [];
  const growth: string[]    = [];
  for (const s of sentences) {
    const hasGrowth   = GROWTH_RX.test(s);
    const hasStrength = STRENGTH_RX.test(s);
    if (hasGrowth && !hasStrength)       growth.push(s);
    else if (hasStrength && !hasGrowth)  strengths.push(s);
    else if (hasGrowth)                  growth.push(s);
    else if (score >= 0 && score < 5)    growth.push(s);    // low score → unmatched sentence reads as growth
    else if (score >= 0 && score >= 7)   strengths.push(s); // high score → reads as strength
    else                                 strengths.push(s); // unknown score → preserve old default
  }
  return { strengths, growth };
}

function trendIcon(score: number) {
  if (score >= 8.0) return <TrendingUp className="w-5 h-5 text-emerald-500" />;
  if (score >= 6.0) return <Minus className="w-5 h-5 text-amber-500" />;
  return <TrendingDown className="w-5 h-5 text-red-500" />;
}

function scoreColor(score: number) {
  if (score >= 8.0) return '#10B981';
  if (score >= 7.0) return '#F59E0B';
  return '#EF4444';
}

export function EvaluationDashboardV2({ data }: Props) {
  const [subView, setSubView] = useState<SubView>('skills');

  return (
    <div className="space-y-6">
      {/* Sub-view switcher */}
      <div className="flex gap-2 border-b border-gray-200">
        {([
          { key: 'skills',    label: 'Skills' },
          { key: 'questions', label: 'Questions' },
          { key: 'formula',   label: 'Formula' },
        ] as { key: SubView; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setSubView(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subView === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subView === 'skills'    && <SkillsView    data={data} />}
      {subView === 'questions' && <QuestionsView data={data} />}
      {subView === 'formula'   && <FormulaView />}
    </div>
  );
}

/* ─── Skills sub-view (from Vite SkillBreakdown.tsx) ──────────────────── */
export function SkillsView({ data }: { data: DashboardData }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const allClusters = [...data.mustHaveClusters, ...data.niceToHaveClusters];
  const allSkills = allClusters.flatMap(c => c.skills.map(s => ({
    ...s,
    clusterPriority: c.priority,
    clusterName: c.name,
  })));

  const avgScore = allSkills.length > 0
    ? allSkills.reduce((sum, s) => sum + s.score, 0) / allSkills.length
    : 0;
  const strongCount = allSkills.filter(s => s.score >= 8.0).length;
  const totalWeight = allSkills.reduce((sum, s) => sum + priorityTag(s.clusterPriority).weight, 0);

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
        <div className="text-xl font-bold mb-2">Skill-by-Skill Analysis</div>
        <div className="text-sm text-white/95">
          Detailed breakdown of candidate performance across all evaluated skills with AI-powered insights and per-skill scoring.
        </div>
      </div>

      {allSkills.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400 italic">
          No skills evaluated yet.
        </div>
      ) : (
        <div className="space-y-3">
          {allSkills.map((s, i) => {
            const tag = priorityTag(s.clusterPriority);
            const contribution = +(s.score * tag.weight).toFixed(1);
            const isOpen = expanded === i;
            const color = scoreColor(s.score);
            return (
              <div
                key={`${s.name}-${i}`}
                className={`rounded-2xl bg-white overflow-hidden transition-all ${
                  isOpen ? 'border-2 border-indigo-600 shadow-sm' : 'border border-gray-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-base font-semibold text-gray-900">{s.name}</div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tag.bg} ${tag.text}`}>
                        {tag.tag} • {s.clusterName}
                      </span>
                      {trendIcon(s.score)}
                    </div>
                    <div className="flex items-center gap-5 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Score</div>
                        <div className="text-lg font-bold" style={{ color }}>{s.score.toFixed(1)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Weight</div>
                        <div className="text-lg font-bold text-gray-500">{tag.weight}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Contribution</div>
                        <div className="text-lg font-bold text-indigo-700">{contribution}</div>
                      </div>
                      {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.score / 10) * 100}%`, backgroundColor: color }} />
                  </div>
                </button>

                {isOpen && (() => {
                  const { strengths, growth } = splitFeedback(s.feedback, s.score);
                  return (
                    <div className="px-5 pb-5">
                      <hr className="border-gray-200 mb-4" />
                      <div className="p-4 rounded-xl bg-gray-50 mb-4">
                        <div className="text-sm font-semibold text-gray-900 mb-1.5">AI Analysis:</div>
                        <div className="text-sm text-gray-700 leading-relaxed">
                          {s.feedback || 'No specific feedback captured for this skill.'}
                        </div>
                      </div>

                      {(strengths.length > 0 || growth.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          {strengths.length > 0 && (
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                              <div className="text-sm font-semibold text-emerald-700 mb-2">✓ Strengths</div>
                              <ul className="list-disc pl-5 space-y-1">
                                {strengths.map((line, idx) => (
                                  <li key={idx} className="text-sm text-emerald-900 leading-relaxed">{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {growth.length > 0 && (
                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                              <div className="text-sm font-semibold text-amber-700 mb-2">⚡ Areas for Growth</div>
                              <ul className="list-disc pl-5 space-y-1">
                                {growth.map((line, idx) => (
                                  <li key={idx} className="text-sm text-amber-900 leading-relaxed">{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-4 rounded-xl bg-indigo-50 border border-dashed border-indigo-300">
                        <div className="text-sm font-mono font-semibold text-indigo-800">
                          Weighted Calculation: {s.score.toFixed(1)} × {tag.weight} = {contribution}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      <div className="rounded-2xl border border-gray-200 p-6 bg-white">
        <div className="text-base font-semibold text-gray-900 mb-4">Summary Statistics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Average Score</div>
            <div className="text-2xl font-bold text-indigo-700">{avgScore.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Skills Evaluated</div>
            <div className="text-2xl font-bold text-indigo-700">{allSkills.length}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Strong Skills (≥8.0)</div>
            <div className="text-2xl font-bold text-emerald-500">{strongCount}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Weight</div>
            <div className="text-2xl font-bold text-indigo-700">{totalWeight}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Questions sub-view (from Vite QuestionAnalysis.tsx) ─────────────── */
export function QuestionsView({ data }: { data: DashboardData }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [transcriptOpen, setTranscriptOpen] = useState<PerQuestionDetail | null>(null);

  const sections: { key: 'mth' | 'nth'; label: string; chip: string; chipCls: string }[] = [
    { key: 'mth', label: 'Must-Have Section',   chip: 'Scored for Pass/Fail', chipCls: 'bg-indigo-50 text-indigo-700' },
    { key: 'nth', label: 'Nice-to-Have Section', chip: 'Information Only',     chipCls: 'bg-amber-50 text-amber-700'  },
  ];

  // Group transcript by qNum (interviewResponses has its own id system; match by index when possible)
  function transcriptFor(qNum: number): string {
    const r = data.interviewResponses[qNum - 1];
    return r?.candidateResponse || '';
  }

  const mhAvg = data.scores.mustHave;
  const nhAvg = data.scores.niceToHave;
  const mhQs = data.perQuestionDetails.filter(q => q.section === 'mth');
  const nhQs = data.perQuestionDetails.filter(q => q.section === 'nth');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
        <div className="text-xl font-bold mb-2">Question-by-Question Analysis</div>
        <div className="text-sm text-white/95 mb-3">
          Detailed evaluation of each interview question with skill scoring, weighted contributions, and AI-derived rationale.
        </div>
        <div className="flex gap-6 flex-wrap text-sm">
          <div>
            <div className="text-white/70">Total Questions</div>
            <div className="font-bold">{data.perQuestionDetails.length}</div>
          </div>
          <div>
            <div className="text-white/70">Must-Have</div>
            <div className="font-bold">{mhQs.length}</div>
          </div>
          <div>
            <div className="text-white/70">Nice-to-Have</div>
            <div className="font-bold">{nhQs.length}</div>
          </div>
        </div>
      </div>

      {data.perQuestionDetails.length === 0 && (
        <div className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400 italic">
          No question-level data available.
        </div>
      )}

      {sections.map(sec => {
        const qs = data.perQuestionDetails.filter(q => q.section === sec.key);
        if (qs.length === 0) return null;
        return (
          <div key={sec.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-base font-bold text-gray-900">{sec.label}</div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sec.chipCls}`}>{sec.chip}</span>
            </div>

            {qs.map(q => {
              const i = q.qNum - 1;
              const isOpen = expanded === i;
              const sumContrib = q.skills.reduce((sum, s) => sum + s.score * s.weight, 0);
              const sumWeight = q.skills.reduce((sum, s) => sum + s.weight, 0);
              const color = scoreColor(q.questionScore);
              return (
                <div
                  key={i}
                  className={`rounded-2xl bg-white overflow-hidden transition-all ${
                    isOpen ? 'border-2 border-indigo-600' : 'border border-gray-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : i)}
                    className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-semibold text-white bg-indigo-600 px-2 py-0.5 rounded-full">
                            Question {q.qNum}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            {(() => {
                              const r = data.interviewResponses[i];
                              return r?.duration ? `Duration: ${r.duration}` : '—';
                            })()}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900 mb-2">{q.question || `Question ${q.qNum}`}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {q.skills.map((s, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {s.name} ({priorityTag(s.priority).tag})
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-center min-w-[88px]">
                        <div className="text-3xl font-bold" style={{ color }}>{q.questionScore.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">Final Score</div>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5">
                      <hr className="border-gray-200 mb-4" />

                      {/* Candidate's transcribed response — surfaces what the
                          candidate actually said so reviewers can validate
                          the AI's score instead of trusting it blindly. */}
                      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 mb-4">
                        <div className="flex items-center gap-2 mb-2 text-gray-600">
                          <MessageSquare className="w-4 h-4" />
                          <div className="text-sm font-semibold">Candidate Response</div>
                        </div>
                        {q.answer && q.answer.trim() ? (
                          <blockquote className="text-sm text-gray-800 leading-relaxed border-l-2 border-gray-300 pl-3 italic">
                            {q.answer}
                          </blockquote>
                        ) : (
                          <div className="text-sm italic text-gray-400">
                            No response recorded — candidate skipped, timed out, or didn't answer.
                          </div>
                        )}
                      </div>

                      {/* AI summary derived from skill notes */}
                      <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 mb-4">
                        <div className="flex items-center gap-2 mb-2 text-sky-700">
                          <Brain className="w-4 h-4" />
                          <div className="text-sm font-semibold">AI Analysis Summary</div>
                        </div>
                        <div className="text-sm italic text-sky-900 leading-relaxed">
                          {q.skills.map(s => s.note).filter(Boolean).join(' • ')
                            || 'Detailed per-question rationale will appear here once available.'}
                        </div>
                      </div>

                      {/* Skill scoring breakdown */}
                      <div className="text-sm font-semibold text-gray-900 mb-2">Skill Scoring Breakdown</div>
                      <div className="space-y-2 mb-4">
                        {q.skills.map((s, idx) => {
                          const tag = priorityTag(s.priority);
                          const contribution = +(s.score * s.weight).toFixed(1);
                          return (
                            <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${tag.bg} ${tag.text}`}>
                                    {tag.tag}
                                  </span>
                                </div>
                                <div className="flex items-center gap-5">
                                  <div className="text-center">
                                    <div className="text-xs text-gray-500">Score</div>
                                    <div className="text-base font-bold text-emerald-500">{s.score.toFixed(1)}</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-xs text-gray-500">Weight</div>
                                    <div className="text-base font-bold text-gray-500">{s.weight}</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-xs text-gray-500">Contribution</div>
                                    <div className="text-base font-bold text-indigo-700">{contribution}</div>
                                  </div>
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(s.score / 10) * 100}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Step-by-step calculation */}
                      <div className="p-4 rounded-xl bg-indigo-50 border-2 border-indigo-200">
                        <div className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-2">
                          <Calculator className="w-4 h-4" />
                          Step-by-Step Calculation
                        </div>

                        <div className="text-sm font-semibold text-indigo-800 mb-1">Step 1: Individual Contributions</div>
                        <div className="ml-3 mb-3 space-y-0.5">
                          {q.skills.map((s, idx) => (
                            <div key={idx} className="text-sm font-mono text-indigo-800">
                              • {s.name}: {s.score.toFixed(1)} × {s.weight} = {(s.score * s.weight).toFixed(1)}
                            </div>
                          ))}
                        </div>

                        <hr className="border-indigo-200 my-2" />

                        <div className="text-sm font-semibold text-indigo-800 mb-1">Step 2: Sum Contributions</div>
                        <div className="ml-3 mb-1 text-sm font-mono text-indigo-800">
                          Total Weighted = {q.skills.map(s => (s.score * s.weight).toFixed(1)).join(' + ')} = {sumContrib.toFixed(1)}
                        </div>
                        <div className="ml-3 mb-3 text-sm font-mono text-indigo-800">
                          Total Weight = {q.skills.map(s => s.weight).join(' + ')} = {sumWeight}
                        </div>

                        <hr className="border-indigo-200 my-2" />

                        <div className="text-sm font-semibold text-indigo-800 mb-1">Step 3: Final Question Score</div>
                        <div className="ml-3 text-sm font-mono text-indigo-800">
                          Question Score = Total Weighted ÷ Total Weight
                        </div>
                        <div className="ml-3 text-lg font-mono font-bold text-indigo-700 mt-1">
                          = {sumContrib.toFixed(1)} ÷ {sumWeight} = {q.questionScore.toFixed(2)}
                        </div>
                      </div>

                      {transcriptFor(q.qNum) && (
                        <div className="flex justify-center pt-4">
                          <button
                            type="button"
                            onClick={() => setTranscriptOpen(q)}
                            className="px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                          >
                            View Full Transcript
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Section calculations */}
      {data.perQuestionDetails.length > 0 && (() => {
        // Denominator policy per spec: divide by PLANNED count (not delivered).
        // Undelivered/skipped slots contribute 0 to the numerator. Falls back
        // to delivered count if plannedCounts is missing (older sessions).
        const mhPlanned = data.plannedCounts?.mustHave || 0;
        const nhPlanned = data.plannedCounts?.niceToHave || 0;
        const mhDenom = mhPlanned > 0 ? mhPlanned : (mhQs.length || 1);
        const nhDenom = nhPlanned > 0 ? nhPlanned : (nhQs.length || 1);
        const mhSum = mhQs.reduce((a, q) => a + q.questionScore, 0);
        const nhSum = nhQs.reduce((a, q) => a + q.questionScore, 0);
        // Numerator display — pad with explicit "+ 0" entries for skipped
        // slots so the math is transparent ("8.0 + 7.5 + 0 + 0 + 0 ... ÷ 10").
        const numeratorParts = (delivered: PerQuestionDetail[], denom: number) => {
          const parts = delivered.map(q => q.questionScore.toFixed(2));
          const missing = Math.max(0, denom - parts.length);
          for (let i = 0; i < missing; i++) parts.push('0');
          return parts.length ? parts.join(' + ') : '0';
        };
        return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.sectionsPresent.mustHave && (
            <div className="rounded-2xl border-2 border-indigo-600 overflow-hidden">
              <div className="bg-indigo-600 text-white px-5 py-3 text-sm font-bold">
                Must-Have Section Score Calculation
              </div>
              <div className="p-5 bg-emerald-50">
                <div className="text-sm font-semibold text-emerald-800 mb-2">
                  Section Score = sum(question scores) ÷ planned questions ({mhDenom})
                </div>
                {mhQs.length === 0 ? (
                  <div className="text-sm font-mono italic text-emerald-800 mb-3">
                    No Must-Have questions delivered → score 0.00
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-mono text-emerald-800 mb-1 break-words">
                      = ({numeratorParts(mhQs, mhDenom)}) ÷ {mhDenom}
                    </div>
                    <div className="text-sm font-mono text-emerald-800 mb-3">
                      = {mhSum.toFixed(2)} ÷ {mhDenom} = <strong>{mhAvg.toFixed(2)}</strong>
                    </div>
                  </>
                )}
                <hr className="border-emerald-200 my-3" />
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-emerald-800">Final Must-Have Score:</div>
                  <div className="text-3xl font-bold text-emerald-500">{mhAvg.toFixed(2)}</div>
                </div>
                <div className={`p-3 rounded-xl border-2 text-sm font-bold text-center ${
                  mhAvg >= MHS_THRESHOLD
                    ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
                    : 'bg-red-100 border-red-500 text-red-800'
                }`}>
                  {mhAvg.toFixed(2)} {mhAvg >= MHS_THRESHOLD ? '≥' : '<'} {MHS_THRESHOLD.toFixed(1)} → {mhAvg >= MHS_THRESHOLD ? 'PASS ✓' : 'FAIL ✗'}
                </div>
              </div>
            </div>
          )}

          {data.sectionsPresent.niceToHave && (
            <div className="rounded-2xl border-2 border-amber-500 overflow-hidden">
              <div className="bg-amber-500 text-white px-5 py-3 text-sm font-bold">
                Nice-to-Have Section Score Calculation
              </div>
              <div className="p-5 bg-amber-50">
                <div className="text-sm font-semibold text-amber-800 mb-2">
                  Section Score = sum(question scores) ÷ planned questions ({nhDenom})
                </div>
                {nhQs.length === 0 ? (
                  <div className="text-sm font-mono italic text-amber-800 mb-3">
                    No Nice-to-Have questions delivered → score 0.00
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-mono text-amber-800 mb-1 break-words">
                      = ({numeratorParts(nhQs, nhDenom)}) ÷ {nhDenom}
                    </div>
                    <div className="text-sm font-mono text-amber-800 mb-3">
                      = {nhSum.toFixed(2)} ÷ {nhDenom} = <strong>{nhAvg.toFixed(2)}</strong>
                    </div>
                  </>
                )}
                <hr className="border-amber-200 my-3" />
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-amber-800">Final Nice-to-Have Score:</div>
                  <div className="text-3xl font-bold text-amber-500">{nhAvg.toFixed(2)}</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-100 border-2 border-amber-500 text-sm font-bold text-amber-800 text-center">
                  Information Only (Not used for Pass/Fail decision)
                </div>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Transcript dialog */}
      {transcriptOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setTranscriptOpen(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="text-base font-semibold text-gray-900">
                Question {transcriptOpen.qNum} — Full Transcript
              </div>
              <button
                type="button"
                onClick={() => setTranscriptOpen(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="text-sm font-semibold text-indigo-600 mb-3">{transcriptOpen.question}</div>
              <hr className="border-gray-200 mb-3" />
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {transcriptFor(transcriptOpen.qNum) || 'No transcript captured for this question.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Formula sub-view (from Vite ExampleScenarios.tsx) ─────────────────
 * Includes the 4 worked scenarios from the spec doc (§5) so this tab
 * mirrors the doc exactly. Scenarios are static teaching aids — not real
 * candidate data. */
export function FormulaView() {
  const priorityWeights = [
    { priority: 'Priority 1 (P1)', weight: 10, color: '#4F46E5', description: 'Must-Have / Highest Priority' },
    { priority: 'Priority 2 (P2)', weight: 7,  color: '#6366F1', description: 'Important'                  },
    { priority: 'Priority 3 (P3)', weight: 4,  color: '#A78BFA', description: 'Nice-to-Have'               },
  ];

  // Doc §5 worked scenarios — verbatim from the spec
  const scenarios: {
    title: string;
    description: string;
    skills: { name: string; priority: 'P1' | 'P2' | 'P3'; weight: number; score: number }[];
    totalWeighted: number;
    totalWeight: number;
    questionScore: number;
    result: 'PASS' | 'FAIL' | 'BORDERLINE';
    color: string;
    insight: string;
  }[] = [
    {
      title: 'Scenario 1: Perfect Performance',
      description: 'Candidate answers all skills with maximum scores',
      skills: [
        { name: 'Java',          priority: 'P1', weight: 10, score: 10 },
        { name: 'Spring Boot',   priority: 'P1', weight: 10, score: 10 },
        { name: 'Microservices', priority: 'P2', weight: 7,  score: 10 },
      ],
      totalWeighted: 270,
      totalWeight: 27,
      questionScore: 10.0,
      result: 'PASS',
      color: '#10B981',
      insight:
        'Perfect score demonstrates exceptional mastery across all priority levels. ' +
        'If repeated across all 10 Must-Have questions, the Must-Have Section Score becomes 10.0 — Clear Pass.',
    },
    {
      title: 'Scenario 2: Strong on Low-Priority, Weak on High-Priority',
      description: 'Excellent performance on P3 skills cannot compensate for weak P1 skills',
      skills: [
        { name: 'REST APIs', priority: 'P1', weight: 10, score: 3  },
        { name: 'SQL',       priority: 'P3', weight: 4,  score: 10 },
      ],
      totalWeighted: 70,
      totalWeight: 14,
      questionScore: 5.0,
      result: 'FAIL',
      color: '#EF4444',
      insight:
        'Even a perfect P3 cannot overcome a weak P1 — Priority 1 skills carry the most weight in the formula.',
    },
    {
      title: 'Scenario 3: Mixed Performance',
      description: 'Good P1 score with average P2 performance — the most common real case',
      skills: [
        { name: 'Spring Boot', priority: 'P1', weight: 10, score: 8 },
        { name: 'API Gateway', priority: 'P2', weight: 7,  score: 5 },
      ],
      totalWeighted: 115,
      totalWeight: 17,
      questionScore: 6.76,
      result: 'BORDERLINE',
      color: '#F59E0B',
      insight:
        'Sits just below the 7.0 threshold. A single question like this can swing Section Score below Pass.',
    },
  ];

  // Doc §5 Scenario 4 — full Must-Have section averaging
  const mhScores = [10.0, 9.5, 8.0, 7.5, 6.0, 8.5, 9.0, 7.0, 5.5, 8.2];
  const mhSectionAvg = +(mhScores.reduce((a, b) => a + b, 0) / mhScores.length).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
        <div className="text-xl font-bold mb-2">Scoring Formula & Example Scenarios</div>
        <div className="text-sm text-white/95">
          Reference card explaining how skill scores roll up into question scores, section scores, and the final Pass/Fail decision — plus the worked scenarios from the evaluation spec.
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 p-6 bg-white">
        <div className="text-base font-bold text-gray-900 mb-4">Priority Weights</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {priorityWeights.map(p => (
            <div key={p.priority} className="p-4 rounded-xl border" style={{ borderColor: p.color, backgroundColor: `${p.color}0F` }}>
              <div className="text-sm font-semibold mb-1" style={{ color: p.color }}>{p.priority}</div>
              <div className="text-3xl font-bold mb-1" style={{ color: p.color }}>{p.weight}</div>
              <div className="text-xs text-gray-600">{p.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-indigo-200 p-6 bg-indigo-50">
        <div className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Complete Scoring Formula
        </div>
        <ul className="text-sm text-indigo-800 leading-relaxed space-y-1.5">
          <li><strong>Step 1:</strong> For each skill in a question → Contribution = Skill Score × Priority Weight (P1=10, P2=7, P3=4)</li>
          <li><strong>Step 2:</strong> For each question → Question Score = Σ(Skill Contributions) ÷ Σ(Priority Weights)</li>
          <li><strong>Step 3:</strong> For each section → Section Score = Average of all question scores in that section</li>
          <li><strong>Step 4:</strong> Final Decision → Must-Have Section Score ≥ {MHS_THRESHOLD.toFixed(1)} = PASS, otherwise FAIL</li>
        </ul>
      </div>

      {/* Doc §5 — Worked scenarios */}
      <div className="text-lg font-bold text-gray-900 pt-2">Worked Scenarios</div>

      {scenarios.map((sc, i) => {
        const resultChip = sc.result === 'PASS'
          ? 'bg-emerald-100 text-emerald-700'
          : sc.result === 'FAIL'
            ? 'bg-red-100 text-red-700'
            : 'bg-amber-100 text-amber-700';
        return (
          <div
            key={i}
            className="rounded-2xl p-6 border-2"
            style={{ borderColor: sc.color, backgroundColor: `${sc.color}0A` }}
          >
            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div>
                <div className="text-base font-bold text-gray-900 mb-1">{sc.title}</div>
                <div className="text-xs text-gray-600">{sc.description}</div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${resultChip}`}>
                {sc.result}
              </span>
            </div>

            {/* Skills + contributions */}
            <div className="space-y-1 mb-3">
              {sc.skills.map((sk, j) => (
                <div key={j} className="text-sm font-mono text-gray-800">
                  • {sk.name} ({sk.priority}, weight {sk.weight}) → score {sk.score}
                  {'  '}→ contribution = {sk.score} × {sk.weight} = {sk.score * sk.weight}
                </div>
              ))}
            </div>

            <hr className="border-gray-200 my-3" />

            <div className="space-y-1 text-sm font-mono text-gray-800">
              <div>Total Weighted = {sc.skills.map(s => s.score * s.weight).join(' + ')} = {sc.totalWeighted}</div>
              <div>Total Weight = {sc.skills.map(s => s.weight).join(' + ')} = {sc.totalWeight}</div>
              <div className="text-base font-bold pt-1" style={{ color: sc.color }}>
                Question Score = {sc.totalWeighted} ÷ {sc.totalWeight} = {sc.questionScore.toFixed(2)}
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-600 italic leading-relaxed">{sc.insight}</div>
          </div>
        );
      })}

      {/* Doc §5 Scenario 4 — full section averaging */}
      <div className="rounded-2xl p-6 border-2 border-indigo-300 bg-indigo-50/40">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="text-base font-bold text-gray-900 mb-1">Scenario 4: Full Must-Have Section (10 Questions)</div>
            <div className="text-xs text-gray-600">How section score is computed from individual question scores</div>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            mhSectionAvg >= MHS_THRESHOLD
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {mhSectionAvg >= MHS_THRESHOLD ? 'PASS' : 'FAIL'}
          </span>
        </div>

        <div className="text-sm font-mono text-gray-800 space-y-1">
          <div>Question scores: {mhScores.join(', ')}</div>
          <div>Sum = {mhScores.reduce((a, b) => a + b, 0).toFixed(1)}</div>
          <div>Section Score = {mhScores.reduce((a, b) => a + b, 0).toFixed(1)} ÷ {mhScores.length} = <strong>{mhSectionAvg.toFixed(2)}</strong></div>
        </div>

        <hr className="border-indigo-200 my-3" />

        <div className={`p-3 rounded-xl border-2 text-sm font-bold text-center ${
          mhSectionAvg >= MHS_THRESHOLD
            ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
            : 'bg-red-100 border-red-500 text-red-800'
        }`}>
          {mhSectionAvg.toFixed(2)} {mhSectionAvg >= MHS_THRESHOLD ? '≥' : '<'} {MHS_THRESHOLD.toFixed(1)} → {mhSectionAvg >= MHS_THRESHOLD ? 'PASS ✓' : 'FAIL ✗'}
        </div>

        <div className="mt-3 text-xs text-gray-600 italic leading-relaxed">
          Nice-to-Have (5 questions) is calculated the same way but only informational — it never affects Pass/Fail.
        </div>
      </div>
    </div>
  );
}
