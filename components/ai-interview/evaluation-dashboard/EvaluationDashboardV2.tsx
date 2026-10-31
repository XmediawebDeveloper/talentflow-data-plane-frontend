// Evaluation Dashboard tab — converted from Vite sources:
// - SkillBreakdown.tsx     → "Skills" sub-view (List: table with details shown; Grid: original per-skill cards)
// - QuestionAnalysis.tsx   → "Questions" sub-view (per-question accordion + math)
// - ExampleScenarios.tsx   → "Formula" sub-view (scoring formula reference)
// MUI Accordion/Card → Tailwind disclosure. Wired to live DashboardData.
import { useState, type ReactNode } from 'react';
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Clock, Brain, Calculator, X, MessageSquare, SkipForward,
  List, LayoutGrid,
} from 'lucide-react';
import type { DashboardData, PerQuestionDetail } from './types';
import { orderQuestionsAsAsked, isSkillNotAssessed } from './types';
import { buildRationaleLines } from './types';
import { IS_PRODUCTION_ENV } from '../../../lib/utils/env';

import { formatScore1, formatSkillScore, truncate1 } from '@/lib/utils/matchStatus';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';
interface Props {
  data: DashboardData;
}

const MHS_THRESHOLD = 6.0;

type SubView = 'skills' | 'questions' | 'formula';

function priorityTag(p: 'High' | 'Medium' | 'Low' | null) {
  // No priority → weight 0, not counted in the question score.
  if (!p)             return { tag: '—',  weight: 0,  bg: 'bg-gray-50',   text: 'text-gray-500'   };
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
  if (score >= 8.0) return 'var(--raw-10b981)';
  if (score >= MHS_THRESHOLD) return 'var(--raw-f59e0b)';
  return 'var(--raw-ef4444)';
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
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  // Same sliding segmented control as the Question Analysis All / Sections toggle.
  const layoutToggle = (
    <div
      role="radiogroup"
      aria-label="Skill view"
      className="relative grid grid-cols-2 p-0.5 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10"
    >
      <span
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
          layout === 'grid' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {([['list', 'List', List], ['grid', 'Grid', LayoutGrid]] as const).map(([mode, label, Icon]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={layout === mode}
          onClick={() => setLayout(mode)}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors duration-300 ${
            layout === mode ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{layoutToggle}</div>
      {layout === 'list' ? <SkillsListView data={data} /> : <SkillsGridView data={data} />}
    </div>
  );
}

/** List view — aligned table, every skill's detail shown by default. */
function SkillsListView({ data }: { data: DashboardData }) {
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

  // Table columns once the section card is wide enough (container query):
  // Skill | Cluster | Skill Weight | Score (10) | Contribution (Skill Weight × Score) | AI Analysis.
  // Narrower cards (tablet / phone / tight laptop) stack each row instead.
  const cols = '@4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_5.5rem_5rem_7.5rem_minmax(0,2fr)]';

  // Every row shows its full detail — no expand/collapse.
  const renderSkillRow = (
    s: typeof allSkills[number],
    rowKey: string,
  ) => {
    const tag = priorityTag(s.clusterPriority);
    // P1/P2/P3 colours — same as the Skill Coverage tab
    // (shared PRIORITY_LABELS; numeric scale 3 = High … 1 = Low).
    const pr = getPriorityLabel(s.clusterPriority === 'High' ? 3 : s.clusterPriority === 'Medium' ? 2 : 1);
    // A skill no question covered has no score to show. Its 0 is "not
    // measured", not "measured and failed" — the Cluster Coverage tab makes
    // the same distinction from the same `asked` flag.
    // Shared rule (types.ts): never on old interviews with no record of what
    // was asked, and a real score always wins.
    const notAssessed = isSkillNotAssessed(s);
    const contribution = +(s.score * tag.weight).toFixed(1);
    const color = notAssessed ? 'var(--raw-9ca3af)' : scoreColor(s.score);
    // AI Analysis box tint follows the same score bands as scoreColor.
    const analysisTint = notAssessed
      ? 'bg-gray-50 border-gray-200'
      : s.score >= 8.0
        ? 'bg-emerald-50 border-emerald-100'
        : s.score >= MHS_THRESHOLD
          ? 'bg-amber-50 border-amber-100'
          : 'bg-rose-50 border-rose-100';
    const statLabel = 'text-2xs text-gray-500 @4xl:hidden';
    return (
      <div
        key={rowKey}
        className={`grid grid-cols-3 ${cols} items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 ${notAssessed ? 'bg-gray-50/60' : ''}`}
      >
        {/* Skill name */}
        <div className="col-span-3 @4xl:col-span-1 min-w-0">
          <div className={`text-sm font-semibold break-words ${notAssessed ? 'text-gray-500' : 'text-gray-900'}`}>{s.name}</div>
          {notAssessed && (
            <span className="mt-1 inline-block text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 whitespace-nowrap">Not assessed</span>
          )}
        </div>

        {/* Cluster — "P1 - Cluster name" */}
        <div className="col-span-3 @4xl:col-span-1 min-w-0">
          <div className={statLabel}>Cluster</div>
          <div className="text-xs text-gray-700 break-words">
            <span className={`inline-block text-2xs font-semibold px-1.5 py-0.5 rounded border align-middle ${pr.color}`}>{tag.tag}</span> - {s.clusterName}
          </div>
        </div>

        {/* Skill Weight / Score / Contribution */}
        <div className="@4xl:text-center">
          <div className={statLabel}>Skill Weight</div>
          <div className="tf-body tabular-nums">{tag.weight}</div>
        </div>
        <div className="@4xl:text-center">
          <div className={statLabel}>Score (10)</div>
          <div className="text-base font-bold tabular-nums" style={{ color }}>{notAssessed ? '—' : formatSkillScore(s.score)}</div>
        </div>
        <div className="@4xl:text-center">
          <div className={statLabel}>Contribution</div>
          <div className="text-base font-bold tabular-nums" style={{ color }}>{notAssessed ? '—' : contribution}</div>
        </div>

        {/* AI Analysis */}
        <div className={`col-span-3 @4xl:col-span-1 rounded-lg border px-3 py-2 text-xs leading-relaxed ${analysisTint}`}>
          <div className="text-gray-700">
            {notAssessed
              ? 'No question in this interview covered this skill, so it has no skill score. If its planned question was never reached (the interview ended early), that question still counts as 0 in the Section Score.'
              : (s.feedback || 'No specific feedback captured for this skill.')}
          </div>
        </div>

      </div>
    );
  };

  // One section = title chip, then a single card: summary strip, column
  // headers, and the skill rows.
  const renderSection = (
    keyPrefix: string,
    title: string,
    chip: string,
    chipCls: string,
    skills: typeof allSkills,
    avg: number,
    summaryCls: string,
    accentCls: string,
  ) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="text-base font-bold text-gray-900">{title}</div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chipCls}`}>{chip}</span>
      </div>
      <div className="@container rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {/* Summary — the section score (question scores ÷ planned questions)
            is the number Pass/Fail and the report use, not an average of the
            skill rows below. */}
        <div className={`grid grid-cols-3 @3xl:grid-cols-[1fr_1fr_1fr_auto] border-b border-gray-200 ${summaryCls}`}>
          <div className="px-3 sm:px-5 py-3 border-r border-gray-200">
            <div className="text-2xs text-gray-500 mb-0.5">Section Score</div>
            <div className={`text-lg sm:text-xl font-bold tabular-nums ${accentCls}`}>
              {formatScore1(avg)}<span className="text-sm font-semibold text-gray-400">/10</span>
            </div>
          </div>
          <div className="px-3 sm:px-5 py-3 border-r border-gray-200">
            <div className="text-2xs text-gray-500 mb-0.5">Skills</div>
            <div className={`text-lg sm:text-xl font-bold tabular-nums ${accentCls}`}>{skills.length}</div>
          </div>
          <div className="px-3 sm:px-5 py-3 @3xl:border-r border-gray-200">
            <div className="text-2xs text-gray-500 mb-0.5">Strong (≥7)</div>
            <div className="text-lg sm:text-xl font-bold tabular-nums text-emerald-600">{skills.filter(s => s.score >= 7.0).length}</div>
          </div>
          {/* Priority legend — explains the P-codes in the Cluster column. */}
          <div className="col-span-3 @3xl:col-span-1 px-3 sm:px-5 py-3 border-t @3xl:border-t-0 border-gray-200">
            <div className="text-2xs text-gray-500 mb-1">Priority</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {([3, 2, 1] as const).map(n => {
                const pl = getPriorityLabel(n);
                return (
                  <span key={n} className={`text-2xs font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${pl.color}`}>
                    {priorityTag(pl.short as 'High' | 'Medium' | 'Low').tag} · {pl.short} Priority
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className={`hidden @4xl:grid ${cols} items-center gap-x-4 px-4 sm:px-5 py-2.5 bg-brand-blue/5 border-b border-gray-200 text-xs font-semibold text-gray-700`}>
          <div>Skill</div>
          <div>Cluster</div>
          <div className="text-center">Skill Weight</div>
          <div className="text-center">Score (10)</div>
          <div className="text-center">Contribution<div className="text-2xs font-medium text-gray-500">(Skill Weight × Score)</div></div>
          <div>AI Analysis</div>
        </div>
        <div className="divide-y divide-gray-200">
          {skills.map((s, i) => renderSkillRow(s, `${keyPrefix}-${s.name}-${i}`))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
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
          {mhSkills.length > 0 && renderSection(
            'mh',
            'Must-Have Skills',
            isPartialEvaluation ? 'Evaluated from Attended Questions' : 'Scored for Pass/Fail',
            'bg-indigo-50 text-indigo-700',
            mhSkills,
            mhAvg,
            'bg-amber-50/40',
            'text-indigo-700',
          )}

          {/* Nice-to-Have Section — informational only per spec */}
          {nhSkills.length > 0 && renderSection(
            'nh',
            'Nice-to-Have Skills',
            'Information Only',
            'bg-amber-50 text-amber-700',
            nhSkills,
            nhAvg,
            'bg-amber-50/40',
            'text-amber-600',
          )}
        </>
      )}
    </div>
  );
}

/** Grid view — the original per-skill cards (click a card for its analysis). */
function SkillsGridView({ data }: { data: DashboardData }) {
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
    // A skill no question covered has no score to show. Its 0 is "not
    // measured", not "measured and failed" — the Cluster Coverage tab makes
    // the same distinction from the same `asked` flag.
    // Shared rule (types.ts): never on old interviews with no record of what
    // was asked, and a real score always wins.
    const notAssessed = isSkillNotAssessed(s);
    const contribution = +(s.score * tag.weight).toFixed(1);
    const isOpen = expanded === rowKey;
    const color = notAssessed ? 'var(--raw-9ca3af)' : scoreColor(s.score);
    return (
      <div
        key={rowKey}
        className={`rounded-2xl overflow-hidden transition-all ${notAssessed ? 'bg-gray-50' : 'bg-white'} ${
          isOpen ? 'border-2 border-indigo-600 shadow-sm' : 'border border-gray-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : rowKey)}
          aria-expanded={isOpen}
          className="w-full text-left p-4 sm:p-5 hover:bg-gray-50 transition-colors"
        >
          {/* Wraps on narrow screens: the name and its chips take the first
              line, the three figures drop under it rather than squeezing it. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <div className={`text-base font-semibold break-words ${notAssessed ? 'text-gray-500' : 'text-gray-900'}`}>{s.name}</div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tag.bg} ${tag.text}`}>
                {tag.tag} • {s.clusterName}
              </span>
              {notAssessed ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Not assessed</span>
              ) : trendIcon(s.score)}
            </div>
            <div className="flex items-center gap-4 sm:gap-5 shrink-0 ml-auto">
              <div className="text-right">
                <div className="tf-meta">Score</div>
                <div className="text-lg font-bold" style={{ color }}>{notAssessed ? '—' : formatSkillScore(s.score)}</div>
              </div>
              <div className="text-right">
                <div className="tf-meta">Weight</div>
                <div className="text-lg font-bold text-gray-500">{tag.weight}</div>
              </div>
              <div className="text-right">
                <div className="tf-meta">Contribution</div>
                <div className={`text-lg font-bold ${notAssessed ? 'text-gray-400' : 'text-indigo-700'}`}>{notAssessed ? '—' : contribution}</div>
              </div>
              {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </div>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${notAssessed ? 0 : (s.score / 10) * 100}%`, backgroundColor: color }} />
          </div>
        </button>

        {isOpen && notAssessed && (
          <div className="px-4 sm:px-5 pb-5">
            <hr className="border-gray-200 mb-4" />
            <div className="p-4 rounded-xl bg-white border border-gray-200 tf-card-desc leading-relaxed">
              No question in this interview covered this skill, so it has no skill score. If its planned question was never reached (the interview ended early), that question still counts as 0 in the Section Score.
            </div>
          </div>
        )}

        {isOpen && !notAssessed && (() => {
          const { strengths, growth } = splitFeedback(s.feedback, s.score);
          // The feedback is shown ONCE: split into Strengths / Areas for
          // Growth when it splits, otherwise as one AI Analysis paragraph.
          const hasSplit = strengths.length > 0 || growth.length > 0;
          return (
            <div className="px-4 sm:px-5 pb-5">
              <hr className="border-gray-200 mb-4" />
              {!hasSplit && (
                <div className="p-4 rounded-xl bg-gray-50 mb-4">
                  <div className="tf-cell-name mb-1.5">AI Analysis:</div>
                  <div className="tf-body leading-relaxed">
                    {s.feedback || 'No specific feedback captured for this skill.'}
                  </div>
                </div>
              )}

              {hasSplit && (
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
                  Weighted Calculation: {formatSkillScore(s.score)} × {tag.weight} = {contribution}
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
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-bold text-gray-900">Must-Have Skills</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    {isPartialEvaluation ? 'Evaluated from Attended Questions' : 'Scored for Pass/Fail'}
                  </span>
                </div>
                {/* The section score (question scores ÷ planned questions) —
                    the number Pass/Fail and the report use, not an average of
                    the skill cards below. */}
                <div className="tf-meta">
                  {mhSkills.length} skill{mhSkills.length === 1 ? '' : 's'} · Section Score{' '}
                  <span className="font-semibold text-gray-900">{formatScore1(mhAvg)}</span>/10
                </div>
              </div>
              {mhSkills.map((s, i) => renderSkillCard(s, `mh-${s.name}-${i}`))}
            </div>
          )}

          {/* Nice-to-Have Section — informational only per spec */}
          {nhSkills.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-bold text-gray-900">Nice-to-Have Skills</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    Information Only
                  </span>
                </div>
                <div className="tf-meta">
                  {nhSkills.length} skill{nhSkills.length === 1 ? '' : 's'} · Section Score{' '}
                  <span className="font-semibold text-gray-900">{formatScore1(nhAvg)}</span>/10
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
                  <div className="text-2xs text-gray-500 mb-0.5">Section Score</div>
                  <div className="text-xl font-bold text-indigo-700">{formatScore1(mhAvg)}</div>
                </div>
                <div>
                  <div className="text-2xs text-gray-500 mb-0.5">Skills</div>
                  <div className="text-xl font-bold text-indigo-700">{mhSkills.length}</div>
                </div>
                <div>
                  <div className="text-2xs text-gray-500 mb-0.5">Strong (≥7)</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {mhSkills.filter(s => s.score >= 7.0).length}
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
                  <div className="text-2xs text-gray-500 mb-0.5">Section Score</div>
                  <div className="text-xl font-bold text-amber-600">{formatScore1(nhAvg)}</div>
                </div>
                <div>
                  <div className="text-2xs text-gray-500 mb-0.5">Skills</div>
                  <div className="text-xl font-bold text-amber-600">{nhSkills.length}</div>
                </div>
                <div>
                  <div className="text-2xs text-gray-500 mb-0.5">Strong (≥7)</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {nhSkills.filter(s => s.score >= 7.0).length}
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
type QaStatus = 'answered' | 'skipped' | 'not_asked';
type QaFilter = 'all' | QaStatus | 'low';
const STATUS_LABEL: Record<QaStatus, string> = { answered: 'Answered', skipped: 'Skipped', not_asked: 'Not Asked' };
const QA_FILTERS: { key: QaFilter; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'answered',  label: 'Answered' },
  { key: 'skipped',   label: 'Skipped' },
  { key: 'not_asked', label: 'Not Asked' },
  { key: 'low',       label: `Low score (<${MHS_THRESHOLD})` },
];

export function QuestionsView({ data, renderAnswerAction }: {
  data: DashboardData;
  /** Optional control shown beside "Candidate's Answer" for each question
   *  (the results page passes "▶ Watch in recording"). */
  renderAnswerAction?: (q: PerQuestionDetail) => ReactNode;
}) {
  const delivered = data.perQuestionDetails;
  const isPartialEvaluation = data.isPartialEvaluation;

  // Collapsible "Skills assessed" dropdown per question (keyed by card index).
  // Multi-skill questions list 2-3 skills; collapsing keeps the timeline tidy
  // and the expanded view shows each skill's score + the AI's per-skill note.
  const [openSkills, setOpenSkills] = useState<Record<number, boolean>>({});
  const toggleSkills = (idx: number) => setOpenSkills(p => ({ ...p, [idx]: !p[idx] }));
  // "All" = one continuous list numbered 1..N across the whole interview;
  // "Sections" = the MHS / NHS / HR grouping with section-local Q numbers.
  const [viewMode, setViewMode] = useState<'all' | 'sections'>('all');
  // Card = full per-question cards; List = compact one-row-per-question table.
  const [layout, setLayout] = useState<'card' | 'list'>('card');
  const [qFilter, setQFilter] = useState<QaFilter>('all');
  // List rows expanded in place, keyed by interview-wide question number.
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});

  if (delivered.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400 italic">
        The candidate exited the interview without answering any questions, so question-level details are not shown here.
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

  // Score color — same bands as Skill Breakdown (scoreColor): green ≥8,
  // amber from the 6.0 Pass threshold, red below it.
  const scoreColorClass = (s: number): string => {
    if (s >= 8.0) return 'text-success bg-success-subtle border-success-line';
    if (s >= MHS_THRESHOLD) return 'text-warning bg-warning-subtle border-warning-line';
    return 'text-destructive bg-destructive-subtle border-destructive-line';
  };
  // Priority chip color — the shared P1/P2/P3 colours (PRIORITY_LABELS), as on
  // Skill Coverage and Skill Breakdown. Numeric scale: 3 = High … 1 = Low.
  const priorityChipClass = (level: 'High' | 'Medium' | 'Low' | null): string => {
    if (!level) return 'bg-gray-50 text-gray-500 border-gray-200';
    return getPriorityLabel(level === 'High' ? 3 : level === 'Medium' ? 2 : 1).color;
  };
  const priorityLabel = (level: 'High' | 'Medium' | 'Low' | null): string =>
    !level ? 'No priority' : level === 'High' ? 'P1' : level === 'Medium' ? 'P2' : 'P3';

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
  // Use the AUTHORITATIVE backend section score (data.scores.*) — the exact
  // value that drives the Match Score, Pass/Fail and the Evaluation Report — so
  // this card cannot drift from those surfaces. Recomputing sum(qScore)/denom
  // on the frontend summed already-rounded per-question scores and produced a
  // ±0.1 mismatch (e.g. card 2.10 vs report/Match-Score 2.00). Fall back to the
  // local recompute only when the backend value is missing (old evals).
  const _mhRecompute = mhDenom > 0
    ? truncate1(mhScored.reduce((s, q) => s + q.questionScore, 0) / mhDenom)
    : 0;
  const _nhRecompute = nhDenom > 0
    ? truncate1(nhScored.reduce((s, q) => s + q.questionScore, 0) / nhDenom)
    : 0;
  const mhScore = (typeof data.scores?.mustHave === 'number') ? data.scores.mustHave : _mhRecompute;
  const nhScore = (typeof data.scores?.niceToHave === 'number') ? data.scores.niceToHave : _nhRecompute;
  const mhPass = mhScore >= MHS_THRESHOLD;

  // "All" view order follows the HR stage configured on the interview:
  // Opening HR questions (asked before the technical rounds) lead, Closing
  // ones follow NHS — the Question Distribution order. A row matched to a
  // selected HR question carries its configured stage (asked or not). Any
  // other HR row falls back to the ask order: asked before the first MHS/NHS
  // question = Opening; un-reached ones go to the Closing end.
  // (Shared with the Evaluation Report, so both list the same order.)
  const allOrder = orderQuestionsAsAsked(delivered);
  const allNumOf = new Map(allOrder.map((q, i) => [q, i + 1]));
  // The HR rows that lead the order are the Opening ones; the rest close it.
  const _firstNonHr = allOrder.findIndex(q => q.section !== 'hr');
  // (HR only: every HR question that was asked counts as Opening, as before.)
  const hrOpening = _firstNonHr === -1
    ? hrQs.filter(q => q.hrStage
      ? q.hrStage === 'opening'
      : !q.notDelivered && typeof q.askedNum === 'number')
    : allOrder.slice(0, _firstNonHr);
  const hrClosing = hrQs.filter(q => !hrOpening.includes(q));

  // Per-Q card renderer (extracted so the grouped-by-section rendering
  // below stays readable).
  const sectionTag: Record<string, { label: string; cls: string }> = {
    mth: { label: 'Must-Have', cls: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20' },
    nth: { label: 'Nice-to-Have', cls: 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20' },
    hr:  { label: 'HR', cls: 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20' },
  };
  // `allNum` is set only in the "All" view: the card shows that interview-wide
  // number plus a section tag (in "Sections" the header already names it).
  // Answer, score rationale, skills assessed, follow-ups and clarifications —
  // shared by the Grid card and an expanded List row. `idx` keys the
  // "Skills assessed" dropdown's open state.
  const renderQDetails = (q: typeof delivered[number], idx: number) => {
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
    const isHr = q.section === 'hr';
    return (
      <>
        {/* 2. Candidate's answer */}
        <div className="border-l-2 border-brand-blue/20 pl-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="text-xs font-medium text-gray-500">
              Candidate's Answer
            </div>
            {renderAnswerAction?.(q)}
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
              // Un-reached planned question — never asked, so there is no answer
              // to show. Distinct from "Not Answered" (asked, candidate silent).
              if (q.notDelivered) {
                return (
                  <span className="text-gray-400 italic inline-flex items-center gap-1.5">
                    <SkipForward className="w-3.5 h-3.5" />
                    Not asked — the interview ended before this question was reached
                  </span>
                );
              }
              const noRealAnswer =
                !ansClean ||
                ansClean.toLowerCase() === '[skipped]' ||
                ['skipped', 'not_answered', 'timeout', 'low_coverage', 'idk'].includes(rt);
              if (!noRealAnswer) {
                return <span className="text-gray-700">{answer}</span>;
              }
              if (q.skipReason) {
                return (
                  <span className={`inline-flex items-center gap-1.5 italic ${q.skipReason.tone === 'amber' ? 'text-warning' : 'text-gray-400'}`}>
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
        {!isHr && !q.notDelivered && q.skills.length > 0 && (() => {
          // buildRationaleLines regenerates the per-skill lines from q.skills[]
          // (same source as the "Skills assessed" table) + carries the backend
          // summary sentences. Shared by the PDF/report so all surfaces match.
          const lines = buildRationaleLines(q.skills, q.scoreRationale);
          return (
            <div className="border-l-2 border-warning-line pl-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Score Rationale
              </div>
              <div className="flex items-start gap-1.5 tf-body bg-warning-subtle/60 border border-warning-line rounded px-2.5 py-2 break-words leading-relaxed">
                <Brain className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
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
        {!isHr && !q.notDelivered && !IS_PRODUCTION_ENV && (
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
                            <span key={i} className="text-2xs px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500 truncate max-w-[110px]">
                              {s.name}
                            </span>
                          ))}
                          {q.skills.length > 3 && <span className="text-2xs text-gray-400">+{q.skills.length - 3}</span>}
                        </span>
                      )}
                      <span className="text-2xs font-mono text-gray-500 shrink-0">
                        Q Score <span className="text-gray-900 font-semibold">{formatScore1(q.questionScore)}</span>
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
                                <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${priorityChipClass(s.priority)}`}>
                                  {priorityLabel(s.priority)}
                                </span>
                              </div>
                              {s.is_unscored ? (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-gray-100 text-gray-500 border border-gray-300"
                                  title="No evaluator score for this skill — excluded from the question score (not counted as 0.0)."
                                >
                                  Not evaluated
                                </span>
                              ) : (
                                <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                                  <span title="LLM score for this skill">
                                    <span className="text-gray-400">Score </span>
                                    <span className={`${s.is_skipped ? 'text-gray-400' : 'text-gray-900'} font-semibold`}>
                                      {formatSkillScore(s.score)}
                                    </span>
                                    {s.is_skipped ? (
                                      <span className="ml-1 inline-flex items-center px-1.5 py-0 rounded text-2xs font-semibold bg-gray-100 text-gray-600 border border-gray-300"
                                        title="Candidate skipped or said 'I don't know' — not scored for this skill.">
                                        Skipped
                                      </span>
                                    ) : s.is_fallback ? (
                                      <span className="ml-1 inline-flex items-center px-1.5 py-0 rounded text-2xs font-semibold bg-warning-subtle text-warning-strong border border-warning-line"
                                        title="Q-level fallback: skill not directly evaluated by AI; reflects overall answer on this question.">
                                        Q
                                      </span>
                                    ) : null}
                                  </span>
                                  <span title="Priority weight"><span className="text-gray-400">×</span><span className="text-gray-700"> {s.weight}</span></span>
                                  <span title="Score × Weight"><span className="text-gray-400">= </span><span className="text-brand-blue font-semibold">{contribution}</span></span>
                                </div>
                              )}
                            </div>
                            {/* Per-skill AI analysis (one_line_note) */}
                            {s.note && !s.is_unscored && (
                              <div className="mt-1.5 flex items-start gap-1.5 tf-meta-strong bg-white border border-gray-100 rounded px-2 py-1.5">
                                <Brain className="w-3 h-3 text-brand-blue mt-0.5 shrink-0" />
                                <span className="leading-relaxed">{s.note}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {sumW > 0 ? (
                        <div className="text-2xs font-mono text-gray-500 pl-1 pt-1">
                          Question Score = {sumWS.toFixed(1)} ÷ {sumW} = <span className="text-gray-900 font-semibold">{formatScore1(q.questionScore)}</span>
                        </div>
                      ) : q.isUnscored && displayOnlyScore !== null ? (
                        <div className="text-2xs text-warning italic pl-1 pt-1">
                          Partial runtime score shown for this attended question. Excluded from the terminated-session section average.
                        </div>
                      ) : q.isUnscored ? (
                        <div className="text-2xs text-gray-400 italic pl-1 pt-1">
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
          <div className="border-l-2 border-warning-line pl-3 mt-1">
            <div className="text-xs font-semibold text-warning mb-1.5">
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
                  <div key={fi} className="rounded bg-warning-subtle border border-warning-line p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-warning-line text-warning-strong">
                        FU{fi + 1}
                      </span>
                      {/* Which question this is a follow-up to (parent), and —
                          when the trigger skill was volunteered earlier — which
                          question it came from (source). */}
                      <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-warning-subtle text-warning-strong border border-warning-line">
                        Follow-up to Q{q.qNum}
                      </span>
                      {typeof fu.source_qnum === 'number' && fu.source_qnum > 0 && fu.source_qnum !== q.qNum && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-warning-subtle text-warning border border-warning-line">
                          from Q{fu.source_qnum}
                        </span>
                      )}
                      {fu.topic && (
                        <span className="text-2xs text-warning italic">on {fu.topic}</span>
                      )}
                      {typeof fu.score === 'number' && (
                        <span className="ml-auto text-2xs font-mono text-warning-strong">
                          Score {formatSkillScore(fu.score)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-800">{fu.question || <span className="italic text-gray-500">(no follow-up text)</span>}</div>
                    <div className="text-xs text-gray-700">
                      <span className="text-gray-500">Answer: </span>
                      {fu.answer ? fu.answer : <span className="italic text-gray-500">(no response)</span>}
                    </div>
                    {fu.note && (
                      <div className="text-2xs italic text-gray-600">{fu.note}</div>
                    )}
                    {reasonNote && (
                      <div className="text-2xs text-warning-strong bg-warning-subtle border border-warning-line rounded px-2 py-1.5 mt-1">
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
                    <span className="text-2xs font-bold px-1.5 py-0.5 rounded text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20">
                      CL{cl.number ?? ci + 1}
                    </span>
                    <span className="text-2xs text-brand-orange-deep italic">candidate asked to repeat / rephrase</span>
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
      </>
    );
  };

  const renderQCard = (q: typeof delivered[number], idx: number, allNum?: number) => {
    const displayOnlyScore = typeof q.displayOnlyQuestionScore === 'number'
      ? q.displayOnlyQuestionScore
      : null;
    // HR is not scored per spec — suppress score badge + per-skill score
    // calc footer for HR cards so the recruiter doesn't mistake "0.0/10"
    // for a performance signal on a behavioral question.
    const isHr = q.section === 'hr';
    return (
      <div
        key={`q-${idx}`}
        id={anchorId(q)}
        className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 scroll-mt-[calc(var(--crumb-h,3rem)+9.5rem)]"
      >
        {/* 1. Question + question score badge (suppressed for HR) */}
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold text-white bg-brand-blue px-2 py-0.5 rounded-full">
              {/* Sections view: per-section serial number (q.qNum, from 1). */}
              {allNum !== undefined ? `Question ${allNum}` : `S.No. ${q.qNum}`}
            </span>
            {allNum !== undefined && sectionTag[q.section] && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sectionTag[q.section].cls}`}
                title={`Question ${q.qNum} of the ${sectionTag[q.section].label} section`}
              >
                {sectionTag[q.section].label} · Q{q.qNum}
              </span>
            )}
            {isHr && q.notDelivered ? (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-300"
                title="This selected HR question was never asked — the candidate ended the interview before reaching it."
              >
                HR · Not Asked
              </span>
            ) : isHr ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20">
                HR · For Reference
              </span>
            ) : q.notDelivered ? (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColorClass(0)}`}
                title="This planned question was never asked — the interview ended before reaching it, so it scores 0."
              >
                Not Delivered · 0.0/10
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
            {/* Sections view: the question's number in the "All" view, after the
                score. Taken from allOrder (not askedNum, which ranks every asked
                row before every un-reached one) so a Not Asked opening HR
                question still counts ahead of MHS: 5 HR configured → MHS
                starts at Q6 even when only 3 HR questions were asked. */}
            {allNum === undefined && allNumOf.has(q) && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200"
                title="Position in the whole interview, as numbered in the All view"
              >
                Q{allNumOf.get(q)}
              </span>
            )}
            {q.bundledFollowUp && q.bundledFollowUp.source_qnum !== q.qNum && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-warning-subtle text-warning border-warning-line"
                title="This planned question was reframed as a follow-up because the candidate volunteered the skill in an earlier answer."
              >
                {q.bundledFollowUp.source_qnum && q.bundledFollowUp.source_qnum > 0
                  ? `Follow-up from Q${q.bundledFollowUp.source_qnum}`
                  : 'Follow-up'}
              </span>
            )}
          </div>
          <div className="tf-cell-name leading-relaxed">
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
              <div className="mt-1.5 text-xs text-warning bg-warning-subtle border border-warning-line rounded px-2 py-1.5">
                <div>
                  Reframed as a follow-up — the candidate volunteered{' '}
                  <span className="font-semibold">{focus}</span>{' '}
                  {priorPhrase && <>{priorPhrase} </>}
                  in {srcRef}, so Bina probed it at this planned slot instead
                  of asking it fresh.
                </div>
                {excerpt && (
                  <div className="mt-1 italic text-warning-strong/90">
                    From {srcRef}: “{excerpt}”
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {renderQDetails(q, idx)}
      </div>
    );
  };

  // ── Filters / jump bar / list layout ────────────────────────────────────
  // Answer status, using the same "no real answer" rule as the card's
  // Candidate's Answer block.
  const statusOf = (q: typeof delivered[number]): QaStatus => {
    if (q.notDelivered || q.responseType === 'not_asked') return 'not_asked';
    const rt = (q.responseType || '').toLowerCase();
    const ans = (q.answer || '').trim();
    const noRealAnswer = !ans || ans.toLowerCase() === '[skipped]'
      || ['skipped', 'not_answered', 'timeout', 'low_coverage', 'idk'].includes(rt);
    return noRealAnswer ? 'skipped' : 'answered';
  };
  const matchesFilter = (q: typeof delivered[number], f: QaFilter): boolean => {
    if (f === 'all') return true;
    if (f === 'low') {
      // Scored questions below the Pass threshold. HR is never scored; never-
      // asked and not-evaluated questions have their own states.
      return q.section !== 'hr' && statusOf(q) !== 'not_asked' && !q.isUnscored && q.questionScore < MHS_THRESHOLD;
    }
    return statusOf(q) === f;
  };
  // Jump-chip colour: the same score bands as the card's score badge.
  const jumpTone = (q: typeof delivered[number]): string => {
    if (statusOf(q) === 'not_asked') return 'bg-gray-50 text-gray-400 border-gray-200';
    if (q.section === 'hr') return 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20';
    if (q.isUnscored) return 'bg-gray-100 text-gray-500 border-gray-300';
    return scoreColorClass(q.questionScore);
  };
  // Cards and list rows share one anchor id per question (only one layout
  // renders at a time), keyed by its interview-wide number.
  const anchorId = (q: typeof delivered[number]) => `qa-q-${allNumOf.get(q)}`;
  const scrollToQ = (q: typeof delivered[number]) =>
    document.getElementById(anchorId(q))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const jumpTo = (q: typeof delivered[number]) => {
    if (matchesFilter(q, qFilter)) { scrollToQ(q); return; }
    // Hidden by the filter — clear it first, then scroll once it renders.
    setQFilter('all');
    setTimeout(() => scrollToQ(q), 60);
  };
  const toggleRow = (n: number) => setOpenRows(p => ({ ...p, [n]: !p[n] }));
  const mhVis = mhQs.filter(q => matchesFilter(q, qFilter));
  const nhVis = nhQs.filter(q => matchesFilter(q, qFilter));
  const hrVis = hrQs.filter(q => matchesFilter(q, qFilter));
  const noneMatch = mhVis.length + nhVis.length + hrVis.length === 0;

  // Score cell for the list layout — mirrors the card's score badge states.
  const listScore = (q: typeof delivered[number]) => {
    const badge = 'inline-block text-xs font-semibold px-2 py-0.5 rounded-full border tabular-nums whitespace-nowrap';
    if (q.section === 'hr') return <span className={`${badge} bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20`}>Not scored</span>;
    if (q.notDelivered) return <span className={`${badge} ${scoreColorClass(0)}`}>0.0/10</span>;
    if (q.isUnscored) {
      return typeof q.displayOnlyQuestionScore === 'number'
        ? <span className={`${badge} ${scoreColorClass(q.displayOnlyQuestionScore)}`}>{q.displayOnlyQuestionScore.toFixed(1)}/10</span>
        : <span className={`${badge} bg-gray-100 text-gray-500 border-gray-300`}>Not evaluated</span>;
    }
    return <span className={`${badge} ${scoreColorClass(q.questionScore)}`}>{q.questionScore.toFixed(1)}/10</span>;
  };
  const statusChipCls: Record<QaStatus, string> = {
    answered:  'bg-success-subtle text-success border-success-line',
    skipped:   'bg-warning-subtle text-warning border-warning-line',
    not_asked: 'bg-gray-100 text-gray-500 border-gray-300',
  };
  const listCols = 'md:grid-cols-[3.5rem_minmax(0,1fr)_7.5rem_7rem_6.5rem]';
  // Compact list: one row per question; clicking a row expands its details
  // (answer, rationale, skills assessed…) right under it.
  const renderList = (qs: typeof delivered) => qs.length === 0 ? null : (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className={`hidden md:grid ${listCols} items-center gap-x-3 px-4 py-2.5 bg-brand-blue/5 border-b border-gray-200 text-xs font-semibold text-gray-700`}>
        <div>Q#</div>
        <div>Question</div>
        <div>Section</div>
        <div>Status</div>
        <div className="text-center">Score</div>
      </div>
      <div className="divide-y divide-gray-200">
        {qs.map((q, i) => {
          const st = statusOf(q);
          const sec = sectionTag[q.section];
          const n = allNumOf.get(q) ?? i + 1;
          const isOpen = !!openRows[n];
          return (
            <div key={`row-${i}`} id={anchorId(q)} className={`scroll-mt-[calc(var(--crumb-h,3rem)+9.5rem)] ${isOpen ? 'bg-brand-blue/5' : ''}`}>
            <button
              type="button"
              onClick={() => toggleRow(n)}
              aria-expanded={isOpen}
              title={isOpen ? 'Hide details' : 'Show details'}
              className={`w-full text-left grid grid-cols-[3rem_minmax(0,1fr)] ${listCols} items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-gray-50 transition-colors`}
            >
              <div className="flex items-center gap-1 text-xs font-bold text-brand-blue tabular-nums">
                {isOpen ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                Q{n}
              </div>
              <div className="text-sm text-gray-900 leading-snug line-clamp-2 min-w-0">
                {ensureQuestionMark(q.question) || `Question ${q.qNum}`}
              </div>
              <div className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-1.5 md:contents">
                <div>
                  {sec && <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${sec.cls}`}>{sec.label}</span>}
                </div>
                <div>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${statusChipCls[st]}`}>{STATUS_LABEL[st]}</span>
                </div>
                <div className="md:text-center">{listScore(q)}</div>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 md:pl-[5.25rem] space-y-3">
                {renderQDetails(q, 1000 + n)}
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // List | Grid (Grid = the full per-question cards) — same sliding toggle as All / Sections.
  const layoutToggle = (
    <div
      role="radiogroup"
      aria-label="Question layout"
      className="relative grid grid-cols-2 p-0.5"
    >
      <span
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
          layout === 'card' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {([['list', 'List', List], ['card', 'Grid', LayoutGrid]] as const).map(([mode, label, Icon]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={layout === mode}
          onClick={() => setLayout(mode)}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors duration-300 ${
            layout === mode ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue'
          }`}
        >
          <Icon className="hidden sm:block w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  // Section header chip — small label + count badge so each block has a
  // visible divider between MHS / NHS / HR.
  const sectionHeading = (label: string, chipText: string, count: number, chipCls: string) => (
    <>
      <div className="text-base font-bold text-gray-900">{label}</div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chipCls}`}>{chipText}</span>
      <span className="tf-meta">· {count} question{count === 1 ? '' : 's'}</span>
    </>
  );

  // Which section heads the Sections view (MHS → NHS → HR, skipping empties).
  // Its heading shares the top row with the toggle; the others draw their own.
  const firstSection = mhVis.length > 0 ? 'mh' : nhVis.length > 0 ? 'nh' : hrVis.length > 0 ? 'hr' : null;
  const mhHeading = () => sectionHeading(
    'Must-Have Section',
    isPartialEvaluation ? 'Evaluated from Attended Questions' : 'Scored for Pass/Fail',
    mhQs.length,
    'bg-brand-blue/10 text-brand-blue',
  );
  const nhHeading = () => sectionHeading('Nice-to-Have Section', 'Information Only', nhQs.length, 'bg-brand-orange/10 text-brand-orange-deep');
  const hrHeading = () => sectionHeading('HR Round', 'For Reference', hrQs.length, 'bg-brand-cyan/10 text-brand-cyan');
  const totalQs = mhQs.length + nhQs.length + hrQs.length;

  // All | Sections — the app's sliding tile toggle (as "View by" on Scored
  // Resumes): two equal halves on one track, a white tile sliding under the
  // active one. It stays mounted in the one top row whichever view is open,
  // so the tile can slide rather than the control being redrawn.
  const viewToggle = (
    <div
      role="radiogroup"
      aria-label="Question view"
      className="relative grid grid-cols-2 p-0.5"
    >
      <span
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
          viewMode === 'sections' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {([['all', 'All'], ['sections', 'Sections']] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={viewMode === mode}
          onClick={() => setViewMode(mode)}
          className={`relative z-10 px-2 sm:px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors duration-300 ${
            viewMode === mode ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {isPartialEvaluation && (
        <div className="rounded-2xl border border-warning-line bg-warning-subtle px-5 py-4 text-sm text-warning-strong">
          This interview was terminated before completion. The scores below are for attended questions only; no overall pass/fail or final match score is generated.
        </div>
      )}
      {/* Sticky so the All / Sections toggle stays reachable while scrolling a
          long question list. --crumb-h is the measured height of the page's
          sticky breadcrumb (set by CandidateResultsView); 3rem matches the left
          tab rail's offset where it isn't set. -mx-6 px-6 stretches the white
          backdrop to the card's padding so cards scroll cleanly beneath it. */}
      <div className="sticky top-[var(--crumb-h,3rem)] z-20 -mx-6 px-6 py-2 bg-white space-y-2 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'all' ? (
            <>
              <div className="text-base font-bold text-gray-900">All Questions</div>
              <span className="tf-meta">· {totalQs} question{totalQs === 1 ? '' : 's'}</span>
            </>
          ) : firstSection === 'mh' ? mhHeading()
            : firstSection === 'nh' ? nhHeading()
            : firstSection === 'hr' ? hrHeading()
            : null}
          {/* One control: All | Sections, a divider, then List | Grid. */}
          <div className="ml-auto max-w-full inline-flex items-center rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10">
            {viewToggle}
            <span aria-hidden className="w-px h-5 bg-brand-blue/20" />
            {layoutToggle}
          </div>
        </div>
        {/* Filters — each chip shows how many questions it matches. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter questions">
          {QA_FILTERS.map(f => {
            const count = delivered.filter(q => matchesFilter(q, f.key)).length;
            const active = qFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setQFilter(f.key)}
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 transition-colors ${
                  active
                    ? 'bg-brand-blue text-white ring-brand-blue'
                    : 'bg-white text-gray-600 ring-gray-200 hover:text-brand-blue hover:ring-brand-blue/40'
                }`}
              >
                {f.label}
                <span className={`tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        {/* Jump bar — one chip per question in interview order, coloured by
            its score; questions outside the active filter are dimmed. */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5" role="navigation" aria-label="Jump to question">
          {allOrder.map((q, i) => (
            <button
              key={`jump-${i}`}
              type="button"
              onClick={() => jumpTo(q)}
              title={`Q${i + 1} · ${STATUS_LABEL[statusOf(q)]}${q.section !== 'hr' && statusOf(q) !== 'not_asked' && !q.isUnscored ? ` · ${q.questionScore.toFixed(1)}/10` : ''}`}
              className={`shrink-0 min-w-[2.25rem] text-2xs font-semibold px-1.5 py-1 rounded border tabular-nums transition-opacity hover:opacity-100 ${jumpTone(q)} ${
                matchesFilter(q, qFilter) ? '' : 'opacity-35'
              }`}
            >
              Q{i + 1}
            </button>
          ))}
        </div>
      </div>
      {noneMatch && (
        <div className="rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400 italic">
          No questions match this filter.
        </div>
      )}
      {viewMode === 'all' && (
        layout === 'list'
          ? renderList(allOrder.filter(q => matchesFilter(q, qFilter)))
          : <>{allOrder.map((q, i) => matchesFilter(q, qFilter) ? renderQCard(q, i, i + 1) : null)}</>
      )}
      {/* Sections view keeps MHS → NHS → HR regardless of the HR stage. */}
      {viewMode === 'sections' && mhVis.length > 0 && (
        <>
          {firstSection !== 'mh' && (
            <div className="flex items-center gap-2 pt-1 pb-1">{mhHeading()}</div>
          )}
          {layout === 'list'
            ? renderList(mhVis)
            : mhQs.map((q, i) => matchesFilter(q, qFilter) ? renderQCard(q, hrQs.length + i) : null)}
        </>
      )}
      {viewMode === 'sections' && nhVis.length > 0 && (
        <>
          {firstSection !== 'nh' && <div className="flex items-center gap-2 pt-1 pb-1">{nhHeading()}</div>}
          {layout === 'list'
            ? renderList(nhVis)
            : nhQs.map((q, i) => matchesFilter(q, qFilter) ? renderQCard(q, hrQs.length + mhQs.length + i) : null)}
        </>
      )}
      {viewMode === 'sections' && hrVis.length > 0 && (
        <>
          {firstSection !== 'hr' && <div className="flex items-center gap-2 pt-1 pb-1">{hrHeading()}</div>}
          {layout === 'list'
            ? renderList(hrVis)
            : hrQs.map((q, i) => matchesFilter(q, qFilter) ? renderQCard(q, i) : null)}
        </>
      )}

      {/* Section Score summary — spec §4 Step 4 + Step 5. HR appears as
          a "For Reference" info card so the recruiter knows the HR Qs were
          asked but didn't affect the Pass/Fail decision. */}
      {!isPartialEvaluation && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {mhQs.length > 0 && (
            <div className="rounded-2xl border-2 border-brand-blue overflow-hidden">
              <div className="bg-brand-blue text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                Must-Have Section
              </div>
              <div className={`p-4 ${mhPass ? 'bg-success-subtle' : 'bg-destructive-subtle'}`}>
                <div className={`text-xs mb-1 ${mhPass ? 'text-success-strong' : 'text-destructive-strong'}`}>
                  Section Score = sum of question scores ÷ {mhDenom} planned questions
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className={`text-3xl font-bold ${mhPass ? 'text-success' : 'text-destructive'}`}>
                    {formatScore1(mhScore)}
                  </span>
                  <span className={`text-sm font-semibold ${mhPass ? 'text-success' : 'text-destructive'}`}>
                    out of 10
                  </span>
                </div>
                <div
                  className={`text-sm font-bold text-center p-2 rounded border-2 ${
                    mhPass
                      ? 'bg-success-subtle border-success text-success-strong'
                      : 'bg-destructive-subtle border-destructive text-destructive-strong'
                  }`}
                >
                  {formatScore1(mhScore)} {mhPass ? '≥' : '<'} {MHS_THRESHOLD.toFixed(1)} → {mhPass ? 'PASS ✓' : 'FAIL ✗'}
                </div>
              </div>
            </div>
          )}
          {nhQs.length > 0 && (
            <div className="rounded-2xl border-2 border-brand-orange overflow-hidden">
              <div className="bg-brand-orange text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                Nice-to-Have Section
              </div>
              <div className="p-4 bg-brand-orange/5">
                <div className="text-xs text-brand-orange-deep mb-1">
                  Section Score = sum of question scores ÷ {nhDenom} planned questions
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-3xl font-bold text-brand-orange-deep">{formatScore1(nhScore)}</span>
                  <span className="text-sm font-semibold text-brand-orange-deep">out of 10</span>
                </div>
                <div className="text-sm font-bold text-center p-2 rounded bg-brand-orange/10 border-2 border-brand-orange text-brand-orange-deep">
                  Informational only — does not affect Pass/Fail
                </div>
              </div>
            </div>
          )}
          {hrQs.length > 0 && (
            <div className={`${viewMode === 'all' && hrOpening.length > 0 && hrClosing.length === 0 ? 'order-first ' : ''}rounded-2xl border-2 border-brand-cyan overflow-hidden`}>
              <div className="bg-brand-cyan text-white px-4 py-2 text-xs font-bold uppercase tracking-wide">
                HR Round
              </div>
              <div className="p-4 bg-brand-cyan/10">
                <div className="text-xs text-brand-cyan mb-1">
                  {hrQs.length} HR question{hrQs.length === 1 ? '' : 's'} asked
                </div>
                <div className="text-sm font-semibold text-brand-cyan mb-3">
                  Behavioral / cultural fit conversation
                </div>
                <div className="text-sm font-bold text-center p-2 rounded bg-brand-cyan/15 border-2 border-brand-cyan text-brand-cyan">
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
      <div className="rounded-2xl p-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 text-gray-900 dark:text-slate-50">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 flex items-center justify-center shrink-0"><MessageSquare className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold mb-2">Question-by-Question Analysis</div>
            <div className="tf-card-desc mb-3">
              Detailed evaluation of each interview question with skill scoring, weighted contributions, and AI-derived rationale.
            </div>
            <div className="flex gap-6 flex-wrap text-sm">
              <div>
                <div className="text-gray-500 dark:text-slate-400">Total Questions</div>
                <div className="font-bold">{data.perQuestionDetails.length}</div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-slate-400">Must-Have</div>
                <div className="font-bold">{mhQs.length}</div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-slate-400">Nice-to-Have</div>
                <div className="font-bold">{nhQs.length}</div>
              </div>
            </div>
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
                          <div className="flex items-center gap-1 tf-meta">
                            <Clock className="w-3.5 h-3.5" />
                            {(() => {
                              const r = data.interviewResponses[i];
                              return r?.duration ? `Duration: ${r.duration}` : '—';
                            })()}
                          </div>
                        </div>
                        <div className="tf-cell-name mb-2">{q.question || `Question ${q.qNum}`}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {q.skills.map((s, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                              {s.name} ({priorityTag(s.priority).tag})
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-center min-w-[88px]">
                        <div className="text-3xl font-bold" style={{ color }}>{formatScore1(q.questionScore)}</div>
                        <div className="tf-meta">Final Score</div>
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
                      <div className="tf-cell-name mb-2">Skill Scoring Breakdown</div>
                      <div className="space-y-2 mb-4">
                        {q.skills.map((s, idx) => {
                          const tag = priorityTag(s.priority);
                          const contribution = +(s.score * s.weight).toFixed(1);
                          return (
                            <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <div className="tf-cell-name">{s.name}</div>
                                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${tag.bg} ${tag.text}`}>
                                    {tag.tag}
                                  </span>
                                </div>
                                <div className="flex items-center gap-5">
                                  <div className="text-center">
                                    <div className="tf-meta">Score</div>
                                    <div className="flex items-center justify-center gap-1">
                                      <div
                                        className={`text-base font-bold ${s.is_skipped ? 'text-gray-400' : 'text-emerald-500'}`}
                                      >
                                        {formatSkillScore(s.score)}
                                      </div>
                                      {s.is_skipped ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-gray-100 text-gray-600 border border-gray-300"
                                          title="Candidate skipped or said 'I don't know' — not scored for this skill."
                                        >
                                          Skipped
                                        </span>
                                      ) : s.is_fallback ? (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-amber-100 text-amber-800 border border-amber-200"
                                          title="Q-level fallback: this skill was not directly evaluated by the AI; score reflects the candidate's overall answer on this question."
                                        >
                                          Q
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <div className="tf-meta">Weight</div>
                                    <div className="text-base font-bold text-gray-500">{s.weight}</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="tf-meta">Contribution</div>
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
                              • {s.name}: {formatSkillScore(s.score)} × {s.weight} = {(s.score * s.weight).toFixed(1)}
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
                          = {sumContrib.toFixed(1)} ÷ {sumWeight} = {formatScore1(q.questionScore)}
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
          const parts = delivered.map(q => formatScore1(q.questionScore));
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
                      = {formatScore1(mhSum)} ÷ {mhDenom} = <strong>{formatScore1(mhAvg)}</strong>
                    </div>
                  </>
                )}
                <hr className="border-emerald-200 my-3" />
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-emerald-800">Final Must-Have Score:</div>
                  <div className="text-3xl font-bold text-emerald-500">{formatScore1(mhAvg)}</div>
                </div>
                <div className={`p-3 rounded-xl border-2 text-sm font-bold text-center ${
                  mhAvg >= MHS_THRESHOLD
                    ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
                    : 'bg-red-100 border-red-500 text-red-800'
                }`}>
                  {formatScore1(mhAvg)} {mhAvg >= MHS_THRESHOLD ? '≥' : '<'} {MHS_THRESHOLD.toFixed(1)} → {mhAvg >= MHS_THRESHOLD ? 'PASS ✓' : 'FAIL ✗'}
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
                      = {formatScore1(nhSum)} ÷ {nhDenom} = <strong>{formatScore1(nhAvg)}</strong>
                    </div>
                  </>
                )}
                <hr className="border-amber-200 my-3" />
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-amber-800">Final Nice-to-Have Score:</div>
                  <div className="text-3xl font-bold text-amber-500">{formatScore1(nhAvg)}</div>
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
            className="bg-white rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80dvh] flex flex-col"
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
              <div className="tf-body leading-relaxed whitespace-pre-wrap">
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
    { priority: 'Priority 1 (P1)', weight: 10, color: 'var(--raw-4f46e5)', description: 'Must-Have / Highest Priority' },
    { priority: 'Priority 2 (P2)', weight: 7,  color: 'var(--raw-6366f1)', description: 'Important'                  },
    { priority: 'Priority 3 (P3)', weight: 4,  color: 'var(--raw-a78bfa)', description: 'Nice-to-Have'               },
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
      color: 'var(--raw-10b981)',
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
      color: 'var(--raw-ef4444)',
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
      color: 'var(--raw-f59e0b)',
      insight:
        'Sits just below the 6.0 threshold. A single question like this can swing Section Score below Pass.',
    },
  ];

  // Doc §5 Scenario 4 — full Must-Have section averaging
  const mhScores = [10.0, 9.5, 8.0, 7.5, 6.0, 8.5, 9.0, 7.0, 5.5, 8.2];
  const mhSectionAvg = truncate1(mhScores.reduce((a, b) => a + b, 0) / mhScores.length);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 text-gray-900 dark:text-slate-50">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 flex items-center justify-center shrink-0"><Calculator className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold mb-2">Scoring Formula & Example Scenarios</div>
            <div className="tf-card-desc">
              Reference card explaining how skill scores roll up into question scores, section scores, and the final Pass/Fail decision — plus the worked scenarios from the evaluation spec.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 p-6 bg-white">
        <div className="text-base font-bold text-gray-900 mb-4">Priority Weights</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {priorityWeights.map(p => (
            <div key={p.priority} className="p-4 rounded-xl border" style={{ borderColor: p.color, backgroundColor: `${p.color}0F` }}>
              <div className="text-sm font-semibold mb-1" style={{ color: p.color }}>{p.priority}</div>
              <div className="text-3xl font-bold mb-1" style={{ color: p.color }}>{p.weight}</div>
              <div className="tf-meta-strong">{p.description}</div>
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
                <div className="tf-meta-strong">{sc.description}</div>
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
                Question Score = {sc.totalWeighted} ÷ {sc.totalWeight} = {formatScore1(sc.questionScore)}
              </div>
            </div>

            <div className="mt-3 tf-meta-strong italic leading-relaxed">{sc.insight}</div>
          </div>
        );
      })}

      {/* Doc §5 Scenario 4 — full section averaging */}
      <div className="rounded-2xl p-6 border-2 border-indigo-300 bg-indigo-50/40">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="text-base font-bold text-gray-900 mb-1">Scenario 4: Full Must-Have Section (10 Questions)</div>
            <div className="tf-meta-strong">How section score is computed from individual question scores</div>
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
          <div>Section Score = {mhScores.reduce((a, b) => a + b, 0).toFixed(1)} ÷ {mhScores.length} = <strong>{formatScore1(mhSectionAvg)}</strong></div>
        </div>

        <hr className="border-indigo-200 my-3" />

        <div className={`p-3 rounded-xl border-2 text-sm font-bold text-center ${
          mhSectionAvg >= MHS_THRESHOLD
            ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
            : 'bg-red-100 border-red-500 text-red-800'
        }`}>
          {formatScore1(mhSectionAvg)} {mhSectionAvg >= MHS_THRESHOLD ? '≥' : '<'} {MHS_THRESHOLD.toFixed(1)} → {mhSectionAvg >= MHS_THRESHOLD ? 'PASS ✓' : 'FAIL ✗'}
        </div>

        <div className="mt-3 tf-meta-strong italic leading-relaxed">
          Nice-to-Have (5 questions) is calculated the same way but only informational — it never affects Pass/Fail.
        </div>
      </div>
    </div>
  );
}
