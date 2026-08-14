// Evaluation Dashboard tab — converted from Vite sources:
// - SkillBreakdown.tsx     → "Skills" sub-view (per-skill analysis accordion)
// - QuestionAnalysis.tsx   → "Questions" sub-view (per-question accordion + math)
// - ExampleScenarios.tsx   → "Formula" sub-view (scoring formula reference)
// MUI Accordion/Card → Tailwind disclosure. Wired to live DashboardData.
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Clock, Brain, Calculator, X, MessageSquare, SkipForward,
} from 'lucide-react';
import type { DashboardData, PerQuestionDetail } from './types';
import { buildRationaleLines } from './types';
import { IS_PRODUCTION_ENV } from '../../../lib/utils/env';

interface Props {
  data: DashboardData;
}

const MHS_THRESHOLD = 6.0;

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
  if (score >= MHS_THRESHOLD) return '#F59E0B';
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

/* ─── Skills sub-view (from Vite SkillBreakdown.tsx) ────────────────────
 * Per the spec doc — Must-Have and Nice-to-Have are EVALUATED SEPARATELY:
 * MHS drives Pass/Fail (≥6.0), NHS is informational only. Skills must be
 * rendered in their own sections so the recruiter doesn't have to mentally
 * separate which 19 skills were the gate-blocking ones.
 */
export function SkillsView({ data }: { data: DashboardData }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const isPartialEvaluation = data.isPartialEvaluation;

  // Flatten each section's clusters into skill rows tagged with their
  // section so we can render two independent sections + summary blocks.
  const flatten = (clusters: typeof data.mustHaveClusters) =>
    clusters.flatMap(c =>
      c.skills.map(s => ({
        ...s,
        clusterPriority: c.priority,
        clusterName: c.name,
      })),
    );
  const mhSkills = flatten(data.mustHaveClusters);
  const nhSkills = flatten(data.niceToHaveClusters);
  const allSkills = [...mhSkills, ...nhSkills];

  // Use the adapter's QA-derived section averages so Skill Breakdown shows
  // the same numbers as Overview and Question Analysis.
  const mhAvg = data.scores.mustHave;
  const nhAvg = data.scores.niceToHave;

  const renderSkillCard = (
    s: typeof allSkills[number],
    rowKey: string,
  ) => {
    const tag = priorityTag(s.clusterPriority);
    const contribution = +(s.score * tag.weight).toFixed(1);
    const isOpen = expanded === rowKey;
    const color = scoreColor(s.score);
    return (
      <div
        key={rowKey}
        className={`rounded-2xl bg-white overflow-hidden transition-all ${
          isOpen ? 'border-2 border-indigo-600 shadow-sm' : 'border border-gray-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : rowKey)}
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
  };

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="rounded-2xl p-6 bg-brand-blue text-white">
        <div className="text-xl font-bold mb-2">Skill-by-Skill Analysis</div>
        <div className="text-sm text-white/95">
          Detailed breakdown of candidate performance across all evaluated skills with AI-powered insights and per-skill scoring.
        </div>
      </div>
      {isPartialEvaluation && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          This interview ended early. The AI evaluated only the questions the candidate attended, so no final pass/fail or overall match score is shown here.
        </div>
      )}

      {allSkills.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400 italic">
          No skills evaluated yet.
        </div>
      ) : (
        <>
          {/* Must-Have Section — gate-blocking skills, MHS ≥ 6.0 = Pass */}
          {mhSkills.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="text-base font-bold text-gray-900">Must-Have Skills</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    {isPartialEvaluation ? 'Evaluated from Attended Questions' : 'Scored for Pass/Fail'}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {mhSkills.length} skill{mhSkills.length === 1 ? '' : 's'} · Avg{' '}
                  <span className="font-semibold text-gray-900">{mhAvg.toFixed(2)}</span>/10
                </div>
              </div>
              {mhSkills.map((s, i) => renderSkillCard(s, `mh-${s.name}-${i}`))}
            </div>
          )}

          {/* Nice-to-Have Section — informational only per spec */}
          {nhSkills.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="text-base font-bold text-gray-900">Nice-to-Have Skills</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    Information Only
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {nhSkills.length} skill{nhSkills.length === 1 ? '' : 's'} · Avg{' '}
                  <span className="font-semibold text-gray-900">{nhAvg.toFixed(2)}</span>/10
                </div>
              </div>
              {nhSkills.map((s, i) => renderSkillCard(s, `nh-${s.name}-${i}`))}
            </div>
          )}
        </>
      )}

      {/* Per-section summary — separate MHS / NHS totals so the recruiter
          doesn't have to do mental math from a combined number. */}
      {allSkills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {mhSkills.length > 0 && (
            <div className="rounded-2xl border border-indigo-200 p-5 bg-indigo-50/40">
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-3">
                Must-Have Summary
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">Avg Score</div>
                  <div className="text-xl font-bold text-indigo-700">{mhAvg.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">Skills</div>
                  <div className="text-xl font-bold text-indigo-700">{mhSkills.length}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">Strong (≥8)</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {mhSkills.filter(s => s.score >= 8.0).length}
                  </div>
                </div>
              </div>
            </div>
          )}
          {nhSkills.length > 0 && (
            <div className="rounded-2xl border border-amber-200 p-5 bg-amber-50/40">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3">
                Nice-to-Have Summary
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">Avg Score</div>
                  <div className="text-xl font-bold text-amber-600">{nhAvg.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">Skills</div>
                  <div className="text-xl font-bold text-amber-600">{nhSkills.length}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">Strong (≥8)</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {nhSkills.filter(s => s.score >= 8.0).length}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Questions sub-view ─────────────────────────────────────────────────
 * Per the spec doc (timed-mode evaluation):
 *   • Each card: question + answer + skills (with per-skill score + weight)
 *   • Question Score = Σ(skill_score × weight) / Σ(weight), shown beside Q#
 *   • Section Score = avg(question scores), MHS ≥ 6.0 → Pass
 *   • Per-skill weights: P1=10, P2=7, P3=4
 *   • HR is not scored
 * Source: data.perQuestionDetails — built by adapter.ts:buildPerQuestionDetails.
 */
export function QuestionsView({ data }: { data: DashboardData }) {
  const delivered = data.perQuestionDetails;
  const isPartialEvaluation = data.isPartialEvaluation;

  // Collapsible "Skills assessed" dropdown per question (keyed by card index).
  // Multi-skill questions list 2-3 skills; collapsing keeps the timeline tidy
  // and the expanded view shows each skill's score + the AI's per-skill note.
  const [openSkills, setOpenSkills] = useState<Record<number, boolean>>({});
  const toggleSkills = (idx: number) => setOpenSkills(p => ({ ...p, [idx]: !p[idx] }));

  if (delivered.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400 italic">
        No question-level data available.
      </div>
    );
  }

  // Bina's TTS-bound question text occasionally lands in question_history /
  // conversation_transcript without a trailing question mark — usually
  // because the LLM's stop token cut the sentence mid-punctuation, or the
  // backend stripped trailing whitespace too aggressively. Append "?" when
  // the text has no terminating punctuation so the Q reads as a question
  // rather than a stray sentence. Skip when the text already ends with
  // any sentence terminator (? ! .).
  const ensureQuestionMark = (text: string): string => {
    const trimmed = (text || '').trim();
    if (!trimmed) return '';
    const last = trimmed.slice(-1);
    if (last === '?' || last === '!' || last === '.') return trimmed;
    return trimmed + '?';
  };

  // Score color: spec uses ≥6.0 as the Pass threshold for MHS — mirror that
  // in the per-Q badge so the recruiter sees instantly which Qs were strong.
  const scoreColorClass = (s: number): string => {
    if (s >= MHS_THRESHOLD) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (s >= 4.0) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };
  // Priority chip color — mirrors the spec's weight tiers: P1 (weight 10),
  // P2 (weight 7), P3 (weight 4). Green = high priority, lighter = lower.
  const priorityChipClass = (level: 'High' | 'Medium' | 'Low'): string => {
    if (level === 'High') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (level === 'Medium') return 'bg-sky-50 text-sky-700 border-sky-200';
    return 'bg-violet-50 text-violet-700 border-violet-200';
  };
  const priorityLabel = (level: 'High' | 'Medium' | 'Low'): string =>
    level === 'High' ? 'P1' : level === 'Medium' ? 'P2' : 'P3';

  // Section grouping — render Qs grouped by section so the recruiter sees
  // MHS / NHS / HR in distinct sections (matches the spec doc's framing).
  // HR rounds are not scored per spec but the questions Bina asked are
  // shown so the recruiter can review the conversation.
  const mhQs = delivered.filter(q => q.section === 'mth');
  const nhQs = delivered.filter(q => q.section === 'nth');
  const hrQs = delivered.filter(q => q.section === 'hr');
  // Section score = sum(question scores) ÷ PLANNED questions (product decision
  // 2026-08-04, mirrors backend _compute_section_scores). A question the
  // candidate never reached (ended early) counts as 0, so an unfinished
  // interview is penalised. The numerator sums only the SCORED questions
  // (isUnscored rows — incomplete evals — never got a score and are excluded
  // from BOTH numerator and denominator, matching the backend's incomplete
  // handling). The denominator is the planned count, floored at the number of
  // scored questions so a missing planned count never divides by too few.
  const mhScored = mhQs.filter(q => !q.isUnscored);
  const nhScored = nhQs.filter(q => !q.isUnscored);
  const mhDenom = Math.max(data.plannedCounts?.mustHave || 0, mhScored.length);
  const nhDenom = Math.max(data.plannedCounts?.niceToHave || 0, nhScored.length);
  const mhScore = mhDenom > 0
    ? Math.round((mhScored.reduce((s, q) => s + q.questionScore, 0) / mhDenom) * 10) / 10
    : 0;
  const nhScore = nhDenom > 0
    ? Math.round((nhScored.reduce((s, q) => s + q.questionScore, 0) / nhDenom) * 10) / 10
    : 0;
  const mhPass = mhScore >= MHS_THRESHOLD;

  // Per-Q card renderer (extracted so the grouped-by-section rendering
  // below stays readable).
  const renderQCard = (q: typeof delivered[number], idx: number) => {
    const answer = (q.answer && q.answer.trim()) || '';
    const displayOnlyScore = typeof q.displayOnlyQuestionScore === 'number'
      ? q.displayOnlyQuestionScore
      : null;
    // Footer arithmetic must use the SAME scored skills the question score was
    // derived from (unscored skills are excluded), so "Σ ÷ Σ = score" is
    // always internally consistent.
    const scoredSkills = q.skills.filter(k => !k.is_unscored);
    const sumW = scoredSkills.reduce((s, k) => s + k.weight, 0);
    const sumWS = scoredSkills.reduce((s, k) => s + k.score * k.weight, 0);
    // HR is not scored per spec — suppress score badge + per-skill score
    // calc footer for HR cards so the recruiter doesn't mistake "0.0/10"
    // for a performance signal on a behavioral question.
    const isHr = q.section === 'hr';
    return (
      <div
        key={`q-${idx}`}
        className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3"
      >
        {/* 1. Question + question score badge (suppressed for HR) */}
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold text-white bg-indigo-600 px-2 py-0.5 rounded-full">
              Question {q.qNum}
            </span>
            {isHr ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                HR · Not Scored
              </span>
            ) : q.isUnscored && displayOnlyScore !== null ? (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColorClass(displayOnlyScore)}`}
                title="Display-only score from the runtime evaluator snapshot for this attended question. Excluded from terminated-session overall scoring until a full evaluation lands."
              >
                Score: {displayOnlyScore.toFixed(1)}/10
              </span>
            ) : q.isUnscored ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-300"
                title="No evaluator scores were produced for this question — excluded from the section average rather than counted as 0.0."
              >
                Not Evaluated
              </span>
            ) : (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColorClass(q.questionScore)}`}
                title="Question Score = Σ(skill_score × weight) / Σ(weight)"
              >
                Score: {q.questionScore.toFixed(1)}/10
              </span>
            )}
            {q.bundledFollowUp && q.bundledFollowUp.source_qnum !== q.qNum && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200"
                title="This planned question was reframed as a follow-up because the candidate volunteered the skill in an earlier answer."
              >
                {q.bundledFollowUp.source_qnum && q.bundledFollowUp.source_qnum > 0
                  ? `Follow-up from Q${q.bundledFollowUp.source_qnum}`
                  : 'Follow-up'}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-gray-900 leading-relaxed">
            {ensureQuestionMark(q.question) || `Question ${q.qNum}`}
          </div>
          {q.bundledFollowUp && q.bundledFollowUp.source_qnum !== q.qNum && (() => {
            const focus = q.bundledFollowUp.focus_skill || 'this skill';
            const srcQ = q.bundledFollowUp.source_qnum;
            // Only reference a source question when it's a DIFFERENT, valid one.
            const srcRef = (srcQ && srcQ > 0 && srcQ !== q.qNum) ? `Q${srcQ}'s answer` : 'an earlier answer';
            const prior = q.bundledFollowUp.prior_level;
            const excerpt = q.bundledFollowUp.source_excerpt;
            // Phrase the coverage band in plain English so reviewers don't
            // have to know our internal "low / medium" labels.
            const priorPhrase =
              prior === 'low'
                ? 'briefly (low coverage)'
                : prior === 'medium'
                ? 'with some detail (medium coverage)'
                : prior === 'covered'
                ? 'in depth (high coverage)'
                : '';
            return (
              <div className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <div>
                  Reframed as a follow-up — the candidate volunteered{' '}
                  <span className="font-semibold">{focus}</span>{' '}
                  {priorPhrase && <>{priorPhrase} </>}
                  in {srcRef}, so Bina probed it at this planned slot instead
                  of asking it fresh.
                </div>
                {excerpt && (
                  <div className="mt-1 italic text-amber-800/90">
                    From {srcRef}: “{excerpt}”
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* 2. Candidate's answer */}
        <div className="border-l-2 border-indigo-200 pl-3">
          <div className="text-xs font-medium text-gray-500 mb-1">
            Candidate's Answer
          </div>
          <div className="text-sm whitespace-pre-wrap break-words">
            {(() => {
              // Distinguish a real answer from a skipped/no-answer turn, and for
              // skips show HOW it was skipped — candidate "Next Question" vs
              // "Are you there?" silence vs timer. The reason is derived in the
              // adapter (q.skipReason, via buildSkipReasoner) from the raw
              // transcript + skip_source, identical to the Transcript tab. We
              // fall back to a generic label only when the adapter couldn't
              // derive one (e.g. no transcript available).
              const rt = (q.responseType || '').toLowerCase();
              const ansClean = (answer || '').trim();
              const noRealAnswer =
                !ansClean ||
                ansClean.toLowerCase() === '[skipped]' ||
                ['skipped', 'not_answered', 'timeout', 'low_coverage', 'idk'].includes(rt);
              if (!noRealAnswer) {
                return <span className="text-gray-700">{answer}</span>;
              }
              if (q.skipReason) {
                return (
                  <span className={`inline-flex items-center gap-1.5 italic ${q.skipReason.tone === 'amber' ? 'text-amber-700' : 'text-gray-400'}`}>
                    <SkipForward className="w-3.5 h-3.5" />
                    {q.skipReason.text}
                  </span>
                );
              }
              // Fallback (no transcript to derive from) — legacy behaviour.
              const src = (q.skipSource || '').toLowerCase();
              if (src === 'candidate') {
                return <span className="text-gray-500 italic">Skipped — candidate clicked “Next Question”</span>;
              }
              if (rt === 'idk') {
                return <span className="text-gray-400 italic">Not Answered — candidate said “I don't know”</span>;
              }
              return <span className="text-gray-400 italic">Not Answered — no response from the candidate</span>;
            })()}
          </div>
        </div>

        {/* 2b. Why this score — deterministic per-question rationale (what the
            candidate demonstrated, what was missing, and the overall reason).
            Shown in ALL environments, INCLUDING production where the per-skill
            dropdown below is hidden — this is the reviewer's one explanation of
            the score. HR turns carry no rationale (never scored), so this hides
            for them automatically. */}
        {/* Score Rationale — derived from the SAME `q.skills[]` array that the
            "Skills assessed" table below renders from, so the two can NEVER
            disagree on a score (the recruiter's core requirement). Each line is
            `<Skill>: <score>/10 — <note>` using the skill's own map-sourced
            score+note; only the qualitative "Overall:" summary (and any non
            per-skill sentence) is carried over from the backend rationale
            string. Previously this rendered the backend `q.scoreRationale`
            string independently, which could drift from the table. */}
        {!isHr && q.skills.length > 0 && (() => {
          // buildRationaleLines regenerates the per-skill lines from q.skills[]
          // (same source as the "Skills assessed" table) + carries the backend
          // summary sentences. Shared by the PDF/report so all surfaces match.
          const lines = buildRationaleLines(q.skills, q.scoreRationale);
          return (
            <div className="border-l-2 border-amber-200 pl-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Score Rationale
              </div>
              <div className="flex items-start gap-1.5 text-sm text-gray-700 bg-amber-50/60 border border-amber-100 rounded px-2.5 py-2 break-words leading-relaxed">
                <Brain className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1 flex-1">
                  {lines.map((line, li) => {
                    const ci = line.indexOf(':');
                    const labeled = ci > 0 && ci <= 120;
                    return (
                      <div key={li}>
                        {labeled
                          ? <><span className="font-semibold text-gray-900">{line.slice(0, ci)}</span>{line.slice(ci)}</>
                          : line}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Per-skill rows — collapsible dropdown. For HR, skipped entirely
            (HR isn't scored). Multi-skill questions list 2-3 skills, so the
            block collapses by default; expanding shows each skill's score AND
            the AI's per-skill rationale (one_line_note). */}
        {!isHr && !IS_PRODUCTION_ENV && (
          <div>
            {q.skills.length === 0 ? (
              <>
                <div className="text-xs font-medium text-gray-500 mb-1.5">Skills assessed in this question</div>
                <span className="text-xs text-gray-400 italic">No skills tagged</span>
              </>
            ) : (() => {
              const isOpen = !!openSkills[idx];
              return (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  {/* Dropdown header — click to expand/collapse */}
                  <button
                    type="button"
                    onClick={() => toggleSkills(idx)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Skills assessed ({q.skills.length})
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                      {!isOpen && (
                        <span className="hidden sm:flex items-center gap-1 min-w-0">
                          {q.skills.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500 truncate max-w-[110px]">
                              {s.name}
                            </span>
                          ))}
                          {q.skills.length > 3 && <span className="text-[10px] text-gray-400">+{q.skills.length - 3}</span>}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-gray-500 shrink-0">
                        Q Score <span className="text-gray-900 font-semibold">{q.questionScore.toFixed(2)}</span>
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-2 space-y-1.5 border-t border-gray-200">
                      {q.skills.map((s, i) => {
                        const contribution = +(s.score * s.weight).toFixed(1);
                        return (
                          <div key={i} className="rounded bg-gray-50 border border-gray-200 p-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm text-gray-900 truncate">{s.name}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${priorityChipClass(s.priority)}`}>
                                  {priorityLabel(s.priority)}
                                </span>
                              </div>
                              {s.is_unscored ? (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-300"
                                  title="No evaluator score for this skill — excluded from the question score (not counted as 0.0)."
                                >
                                  Not evaluated
                                </span>
                              ) : (
                                <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                                  <span title="LLM score for this skill">
                                    <span className="text-gray-400">Score </span>
                                    <span className={`${s.is_skipped ? 'text-gray-400' : 'text-gray-900'} font-semibold`}>
                                      {s.score.toFixed(1)}
                                    </span>
                                    {s.is_skipped ? (
                                      <span className="ml-1 inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-300"
                                        title="Candidate skipped or said 'I don't know' — not scored for this skill.">
                                        Skipped
                                      </span>
                                    ) : s.is_fallback ? (
                                      <span className="ml-1 inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"
                                        title="Q-level fallback: skill not directly evaluated by AI; reflects overall answer on this question.">
                                        Q
                                      </span>
                                    ) : null}
                                  </span>
                                  <span title="Priority weight"><span className="text-gray-400">×</span><span className="text-gray-700"> {s.weight}</span></span>
                                  <span title="Score × Weight"><span className="text-gray-400">= </span><span className="text-indigo-700 font-semibold">{contribution}</span></span>
                                </div>
                              )}
                            </div>
                            {/* Per-skill AI analysis (one_line_note) */}
                            {s.note && !s.is_unscored && (
                              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-600 bg-white border border-gray-100 rounded px-2 py-1.5">
                                <Brain className="w-3 h-3 text-indigo-500 mt-0.5 shrink-0" />
                                <span className="leading-relaxed">{s.note}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {sumW > 0 ? (
                        <div className="text-[11px] font-mono text-gray-500 pl-1 pt-1">
                          Question Score = {sumWS.toFixed(1)} ÷ {sumW} = <span className="text-gray-900 font-semibold">{q.questionScore.toFixed(2)}</span>
                        </div>
                      ) : q.isUnscored && displayOnlyScore !== null ? (
                        <div className="text-[11px] text-amber-700 italic pl-1 pt-1">
                          Partial runtime score shown for this attended question. Excluded from the terminated-session section average.
                        </div>
                      ) : q.isUnscored ? (
                        <div className="text-[11px] text-gray-400 italic pl-1 pt-1">
                          Not evaluated — excluded from the section average.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* 4. Follow-ups (when any fired for this slot) — surfaced so
            the recruiter knows whether Bina probed deeper and how the
            candidate responded. Nothing rendered when followUps is
            empty/undefined (the common case in timed mode after
            strict-distribution turned probe-mode off). */}
        {q.followUps && q.followUps.length > 0 && (
          <div className="border-l-2 border-amber-300 pl-3 mt-1">
            <div className="text-xs font-semibold text-amber-700 mb-1.5">
              Follow-up{q.followUps.length === 1 ? '' : 's'} to Q{q.qNum} ({q.followUps.length})
            </div>
            <div className="space-y-2">
              {q.followUps.map((fu, fi) => {
                // Friendly explanation derived from the backend trigger
                // reason. Tells the recruiter WHY this extra question
                // appeared at this slot — usually because the candidate
                // mentioned the skill in an earlier answer.
                const explainReason = (): string | null => {
                  if (!fu.reason) return null;
                  const focus = fu.focus_skill || fu.topic || 'this skill';
                  const srcRef = fu.source_qnum
                    ? `Q${fu.source_qnum}'s answer`
                    : 'an earlier answer';
                  switch (fu.reason) {
                    case 'validate_volunteered_primary':
                      return `Follow-up asked because the candidate mentioned ${focus} in ${srcRef} (volunteered earlier). Bina validated the claim at this slot.`;
                    case 'probe_touched_secondary':
                      return `Follow-up asked because ${focus} was already volunteered in ${srcRef}. Bina probed depth at this slot instead of asking it fresh.`;
                    case 'volunteered_skill':
                      return `Follow-up asked because the candidate volunteered ${focus} while answering this question — Bina validated the claim.`;
                    case 'weak_answer':
                      return `Follow-up asked because the main answer scored low — giving the candidate a second chance.`;
                    case 'incomplete':
                      return `Follow-up asked because the main answer was incomplete — Bina probed for more detail.`;
                    default:
                      return null;
                  }
                };
                const reasonNote = explainReason();
                return (
                  <div key={fi} className="rounded bg-amber-50 border border-amber-200 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                        FU{fi + 1}
                      </span>
                      {/* Which question this is a follow-up to (parent), and —
                          when the trigger skill was volunteered earlier — which
                          question it came from (source). */}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        Follow-up to Q{q.qNum}
                      </span>
                      {typeof fu.source_qnum === 'number' && fu.source_qnum > 0 && fu.source_qnum !== q.qNum && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                          from Q{fu.source_qnum}
                        </span>
                      )}
                      {fu.topic && (
                        <span className="text-[10px] text-amber-700 italic">on {fu.topic}</span>
                      )}
                      {typeof fu.score === 'number' && (
                        <span className="ml-auto text-[10px] font-mono text-amber-800">
                          Score {fu.score.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-800">{fu.question || <span className="italic text-gray-500">(no follow-up text)</span>}</div>
                    <div className="text-xs text-gray-700">
                      <span className="text-gray-500">Answer: </span>
                      {fu.answer ? fu.answer : <span className="italic text-gray-500">(no response)</span>}
                    </div>
                    {fu.note && (
                      <div className="text-[11px] italic text-gray-600">{fu.note}</div>
                    )}
                    {reasonNote && (
                      <div className="text-[11px] text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1.5 mt-1">
                        <span className="font-semibold">Note:</span> {reasonNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Clarifications (when the candidate asked Bina to repeat /
            rephrase). Surfaced here so the Question Analysis tab agrees with
            the Transcript tab, which labels these "Clarify"/CL1, CL2…. Each
            shows Bina's repeated question and the candidate's reply after it.
            Nothing rendered when no clarification fired for this slot. */}
        {q.clarifications && q.clarifications.length > 0 && (
          <div className="border-l-2 border-brand-orange/40 pl-3 mt-1">
            <div className="text-xs font-semibold text-brand-orange-deep mb-1.5">
              Clarification{q.clarifications.length === 1 ? '' : 's'} ({q.clarifications.length})
            </div>
            <div className="space-y-2">
              {q.clarifications.map((cl, ci) => (
                <div key={ci} className="rounded bg-brand-orange/5 border border-brand-orange/20 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20">
                      CL{cl.number ?? ci + 1}
                    </span>
                    <span className="text-[10px] text-brand-orange-deep italic">candidate asked to repeat / rephrase</span>
                  </div>
                  <div className="text-sm text-gray-800">
                    {cl.question || <span className="italic text-gray-500">(no clarification text)</span>}
                  </div>
                  {cl.answer && (
                    <div className="text-xs text-gray-700">
                      <span className="text-gray-500">Answer: </span>
                      {cl.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Section header chip — small label + count badge so each block has a
  // visible divider between MHS / NHS / HR.
  const sectionHeader = (label: string, chipText: string, count: number, chipCls: string) => (
    <div className="flex items-center gap-2 pt-1 pb-1">
      <div className="text-base font-bold text-gray-900">{label}</div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chipCls}`}>{chipText}</span>
      <span className="text-xs text-gray-500">· {count} question{count === 1 ? '' : 's'}</span>
    </div>
  );

  return (
    <div className="space-y-3">
      {isPartialEvaluation && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          This interview was terminated before completion. The scores below are for attended questions only; no overall pass/fail or final match score is generated.
        </div>
      )}
      {mhQs.length > 0 && (
        <>
          {sectionHeader(
            'Must-Have Section',
            isPartialEvaluation ? 'Evaluated from Attended Questions' : 'Scored for Pass/Fail',
            mhQs.length,
            'bg-indigo-50 text-indigo-700',
          )}
          {mhQs.map((q, i) => renderQCard(q, i))}
        </>
      )}
      {nhQs.length > 0 && (
        <>
          {sectionHeader('Nice-to-Have Section', 'Information Only', nhQs.length, 'bg-amber-50 text-amber-700')}
          {nhQs.map((q, i) => renderQCard(q, mhQs.length + i))}
        </>
      )}
      {hrQs.length > 0 && (
        <>
          {sectionHeader('HR Round', 'Not Scored', hrQs.length, 'bg-violet-50 text-violet-700')}
          {hrQs.map((q, i) => renderQCard(q, mhQs.length + nhQs.length + i))}
        </>
      )}

      {/* Section Score summary — spec §4 Step 4 + Step 5. HR appears as
          a "Not Scored" info card so the recruiter knows the HR Qs were
          asked but didn't affect the Pass/Fail decision. */}
      {!isPartialEvaluation && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {mhQs.length > 0 && (
            <div className="rounded-2xl border-2 border-indigo-600 overflow-hidden">
              <div className="bg-indigo-600 text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                Must-Have Section
              </div>
              <div className={`p-4 ${mhPass ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <div className={`text-xs mb-1 ${mhPass ? 'text-emerald-800' : 'text-rose-800'}`}>
                  Section Score = sum of question scores ÷ {mhDenom} planned questions
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className={`text-3xl font-bold ${mhPass ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {mhScore.toFixed(2)}
                  </span>
                  <span className={`text-sm font-semibold ${mhPass ? 'text-emerald-700' : 'text-rose-700'}`}>
                    out of 10
                  </span>
                </div>
                <div
                  className={`text-sm font-bold text-center p-2 rounded border-2 ${
                    mhPass
                      ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
                      : 'bg-rose-100 border-rose-500 text-rose-800'
                  }`}
                >
                  {mhScore.toFixed(2)} {mhPass ? '≥' : '<'} {MHS_THRESHOLD.toFixed(1)} → {mhPass ? 'PASS ✓' : 'FAIL ✗'}
                </div>
              </div>
            </div>
          )}
          {nhQs.length > 0 && (
            <div className="rounded-2xl border-2 border-amber-500 overflow-hidden">
              <div className="bg-amber-500 text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                Nice-to-Have Section
              </div>
              <div className="p-4 bg-amber-50">
                <div className="text-xs text-amber-800 mb-1">
                  Section Score = sum of question scores ÷ {nhDenom} planned questions
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-3xl font-bold text-amber-600">{nhScore.toFixed(2)}</span>
                  <span className="text-sm font-semibold text-amber-700">out of 10</span>
                </div>
                <div className="text-sm font-bold text-center p-2 rounded bg-amber-100 border-2 border-amber-500 text-amber-800">
                  Informational only — does not affect Pass/Fail
                </div>
              </div>
            </div>
          )}
          {hrQs.length > 0 && (
            <div className="rounded-2xl border-2 border-violet-500 overflow-hidden">
              <div className="bg-violet-500 text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                HR Round
              </div>
              <div className="p-4 bg-violet-50">
                <div className="text-xs text-violet-800 mb-1">
                  {hrQs.length} HR question{hrQs.length === 1 ? '' : 's'} asked
                </div>
                <div className="text-sm font-semibold text-violet-900 mb-3">
                  Behavioral / cultural fit conversation
                </div>
                <div className="text-sm font-bold text-center p-2 rounded bg-violet-100 border-2 border-violet-500 text-violet-800">
                  Not scored — per evaluation spec
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-ignore -- kept temporarily for reference; safe to delete once new
// QuestionsView design has been validated against a few real sessions.
function _QuestionsView_DISABLED_DEAD_CODE({ data }: { data: DashboardData }) {
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
      <div className="rounded-2xl p-6 bg-brand-blue text-white">
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
                                    <div className="flex items-center justify-center gap-1">
                                      <div
                                        className={`text-base font-bold ${s.is_skipped ? 'text-gray-400' : 'text-emerald-500'}`}
                                      >
                                        {s.score.toFixed(1)}
                                      </div>
                                      {s.is_skipped ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-300"
                                          title="Candidate skipped or said 'I don't know' — not scored for this skill."
                                        >
                                          Skipped
                                        </span>
                                      ) : s.is_fallback ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200"
                                          title="Q-level fallback: this skill was not directly evaluated by the AI; score reflects the candidate's overall answer on this question."
                                        >
                                          Q
                                        </span>
                                      ) : null}
                                    </div>
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
            className="bg-white rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80vh] flex flex-col"
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
        'Sits just below the 6.0 threshold. A single question like this can swing Section Score below Pass.',
    },
  ];

  // Doc §5 Scenario 4 — full Must-Have section averaging
  const mhScores = [10.0, 9.5, 8.0, 7.5, 6.0, 8.5, 9.0, 7.0, 5.5, 8.2];
  const mhSectionAvg = +(mhScores.reduce((a, b) => a + b, 0) / mhScores.length).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6 bg-brand-blue text-white">
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
