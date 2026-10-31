'use client';

import { CheckCircle2, MinusCircle, AlertCircle, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { useState } from 'react';

interface SkillScore {
  skill: string;
  score: number | null;   // 0-100
  band: string;
  note?: string;
}

interface ClusterEntry {
  cluster_name: string;
  category: 'mth' | 'nth' | 'hr';
  section_name: string;
  section_pct: number;
  priority: number;
  priority_label?: string;
  weight: number;
  band_score: number | null;
  band: string;
  skill_scores: SkillScore[];
  evaluated: number;
  total: number;
  cluster_note?: string;
}

interface SectionScore {
  score: number | null;
  band: string;
  section_pct: number;
  section_name: string;
}

interface QuestionHistoryEntry {
  question_number: number;
  question: string;
  question_text?: string;   // v3 uses question_text instead of question
  answer: string;
  response_text?: string;   // v3 uses response_text instead of answer
  response_type: string;
  skip_source: string | null;
  score: number | null;   // 0-10 per-question score
  topic: string;          // = skill name
  round_type: string;
  timestamp?: string;
  is_follow_up?: boolean;
  question_intent?: string; // v3: explore | follow_up | probe | deep_dive | main_question
}

interface ClusterInsightsTabProps {
  clusterInsights: ClusterEntry[];
  capabilityScore?: number | null;
  sectionScores?: Record<string, SectionScore> | null;
  capabilityScoreReasoning?: string | null;
  questionHistory?: QuestionHistoryEntry[];
}

// ── Coverage bands (Not Covered / Low / Medium / High) ────────────────
type CoverageLevel = 'not_covered' | 'low' | 'medium' | 'high';

const COVERAGE_STYLES: Record<CoverageLevel, { label: string; badge: string; dot: string; icon: any }> = {
  high:        { label: 'High',        badge: 'bg-success-subtle text-success border-success-line', dot: 'bg-success', icon: CheckCircle2 },
  medium:      { label: 'Medium',      badge: 'bg-warning-subtle text-warning border-warning-line',       dot: 'bg-warning',   icon: AlertCircle },
  low:         { label: 'Low',         badge: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-400',  icon: MinusCircle },
  not_covered: { label: 'Not Covered', badge: 'bg-gray-100 text-gray-500 border-gray-200',         dot: 'bg-gray-300',    icon: XCircle },
};

// Per-question score (0-10) → coverage band
function questionCoverage(score: number | null): CoverageLevel {
  if (score == null || score <= 0) return 'not_covered';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

// Skill band (from backend) → internal coverage level for styling.
// Supports both new labels (High/Medium/Low/Not Covered) and legacy (Strong/Proficient/Developing/Weak).
function skillBandToCoverage(band: string, score: number | null): CoverageLevel {
  if (score == null || score <= 0 || band === 'Not Covered' || band === 'Not Evaluated') return 'not_covered';
  const b = band.toLowerCase();
  if (b === 'high' || b === 'strong' || b === 'proficient') return 'high';
  if (b === 'medium' || b === 'developing') return 'medium';
  return 'low';
}

const SECTION_COLORS: Record<string, string> = {
  mth: 'border-l-purple-400 bg-purple-50/30',
  nth: 'border-l-indigo-400 bg-indigo-50/30',
  hr:  'border-l-teal-400 bg-teal-50/30',
};

const SECTION_HEADER_COLORS: Record<string, string> = {
  mth: 'bg-purple-50 border-purple-100 text-purple-900',
  nth: 'bg-indigo-50 border-indigo-100 text-indigo-900',
  hr:  'bg-teal-50 border-teal-100 text-teal-900',
};

function CoverageBadge({ level }: { level: CoverageLevel }) {
  const s = COVERAGE_STYLES[level];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border ${s.badge}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

// Group question history: main question + follow-ups/deep-dives.
// Follow-ups → F1, F2 ... Deep dives → D1, D2 ...
type QGroup = { main: QuestionHistoryEntry; followUps: QuestionHistoryEntry[] };

function buildQuestionGroups(history: QuestionHistoryEntry[]): QGroup[] {
  const groups: QGroup[] = [];
  for (const h of history) {
    const intent = (h.question_intent || '').toLowerCase();
    const isSub = h.is_follow_up || ['follow_up', 'probe', 'deep_dive'].includes(intent);
    if (isSub && groups.length > 0) {
      groups[groups.length - 1].followUps.push(h);
    } else {
      groups.push({ main: h, followUps: [] });
    }
  }
  return groups;
}

// Label for a sub-question: F1/F2 for follow-ups, D1/D2 for deep dives
function subLabel(entries: QuestionHistoryEntry[], index: number): { tag: string; color: string; bg: string } {
  const intent = (entries[index].question_intent || '').toLowerCase();
  const isDd = intent === 'deep_dive';
  // Count only same-type entries before this one to get sequential number
  let seq = 0;
  for (let i = 0; i <= index; i++) {
    const it = (entries[i].question_intent || '').toLowerCase();
    if (isDd && it === 'deep_dive') seq++;
    if (!isDd && it !== 'deep_dive') seq++;
  }
  if (isDd) return { tag: `D${seq}`, color: 'text-teal-700', bg: 'bg-teal-100' };
  return { tag: `F${seq}`, color: 'text-violet-700', bg: 'bg-violet-100' };
}

function QuestionTable({ groups }: { groups: QGroup[] }) {
  const [openRow, setOpenRow] = useState<Set<number>>(new Set());
  if (groups.length === 0) {
    return <div className="text-xs text-gray-400 italic px-4 py-3">No questions recorded for this skill.</div>;
  }
  const toggle = (i: number) => {
    setOpenRow(p => {
      const n = new Set(p);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  };

  // Readable type label for the Type column
  function typeLabel(h: QuestionHistoryEntry): { text: string; cls: string } {
    const intent = (h.question_intent || '').toLowerCase();
    if (intent === 'deep_dive')  return { text: 'Deep Dive',  cls: 'bg-teal-100 text-teal-700' };
    if (intent === 'follow_up')  return { text: 'Follow-up',  cls: 'bg-violet-100 text-violet-700' };
    if (intent === 'probe')      return { text: 'Follow-up',  cls: 'bg-violet-100 text-violet-700' };
    if (intent === 'main_question') return { text: 'Main',    cls: 'bg-gray-100 text-gray-600' };
    if (intent === 'explore')    return { text: 'Main',       cls: 'bg-gray-100 text-gray-600' };
    // Fallback for old data without question_intent
    if (h.is_follow_up)          return { text: 'Follow-up',  cls: 'bg-violet-100 text-violet-700' };
    return { text: 'Main', cls: 'bg-gray-100 text-gray-600' };
  }

  return (
    <div className="overflow-x-auto tf-table-shell">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="bg-white text-gray-600 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-semibold w-14">Q #</th>
            <th className="px-3 py-2 text-left font-semibold w-24">Type</th>
            <th className="px-3 py-2 text-left font-semibold">Question</th>
            <th className="px-3 py-2 text-left font-semibold">Candidate Response</th>
            <th className="px-3 py-2 text-left font-semibold w-32">Coverage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {groups.map((g, i) => {
            const mainLevel = questionCoverage(g.main.score);
            const hasFu = g.followUps.length > 0;
            const isOpen = openRow.has(i);
            const mainType = typeLabel(g.main);
            const qText = g.main.question || g.main.question_text || '—';
            const aText = g.main.answer || g.main.response_text || '—';
            // Count follow-ups vs deep-dives for the expand button
            const ddCount = g.followUps.filter(fu => (fu.question_intent || '').toLowerCase() === 'deep_dive').length;
            const fuCount = g.followUps.length - ddCount;
            const expandLabel = [
              fuCount > 0 ? `${fuCount} follow-up${fuCount > 1 ? 's' : ''}` : '',
              ddCount > 0 ? `${ddCount} deep dive${ddCount > 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(', ');

            return (
              <tr key={i} className="align-top">
                <td className="px-3 py-2 align-top">
                  <span className="text-2xs font-semibold text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">
                    Q{g.main.question_number}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${mainType.cls}`}>
                    {mainType.text}
                  </span>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-xs font-medium text-gray-800 leading-snug">{qText}</div>
                  {hasFu && (
                    <div className="mt-2 pl-3 border-l-2 border-violet-200 space-y-2">
                      {!isOpen ? (
                        <button
                          onClick={() => toggle(i)}
                          className="text-2xs text-violet-600 hover:text-violet-800 flex items-center gap-1"
                        >
                          <ChevronDown className="w-3 h-3" />
                          {expandLabel}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => toggle(i)}
                            className="text-2xs text-violet-600 hover:text-violet-800 flex items-center gap-1"
                          >
                            <ChevronUp className="w-3 h-3" />
                            Hide
                          </button>
                          {g.followUps.map((fu, fi) => {
                            const sl = subLabel(g.followUps, fi);
                            const fuQ = fu.question || fu.question_text || '—';
                            return (
                              <div key={fi}>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`text-2xs font-semibold ${sl.color} ${sl.bg} rounded px-1.5 py-0.5`}>{sl.tag}</span>
                                </div>
                                <div className="text-2xs font-medium text-gray-700 leading-snug">{fuQ}</div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-xs text-gray-700 leading-snug whitespace-pre-wrap">{aText}</div>
                  {hasFu && isOpen && (
                    <div className="mt-2 pl-3 border-l-2 border-violet-200 space-y-2">
                      {g.followUps.map((fu, fi) => {
                        const sl = subLabel(g.followUps, fi);
                        const fuA = fu.answer || fu.response_text || '—';
                        return (
                          <div key={fi} className="text-2xs text-gray-600 leading-snug whitespace-pre-wrap">
                            <span className={`text-2xs font-semibold ${sl.color} mr-1`}>{sl.tag}:</span>
                            {fuA}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <CoverageBadge level={mainLevel} />
                  {hasFu && isOpen && (
                    <div className="mt-2 pl-3 border-l-2 border-violet-200 space-y-2">
                      {g.followUps.map((fu, fi) => (
                        <div key={fi}>
                          <CoverageBadge level={questionCoverage(fu.score)} />
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ClusterInsightsTab({
  clusterInsights,
  capabilityScore,
  sectionScores,
  capabilityScoreReasoning,
  questionHistory = [],
}: ClusterInsightsTabProps) {
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());

  if (!clusterInsights || clusterInsights.length === 0) {
    return (
      <div className="text-center py-16 tf-body-muted">
        No cluster insights available for this interview.
      </div>
    );
  }

  const SECTION_ORDER = ['mth', 'nth'];
  const grouped: Record<string, ClusterEntry[]> = {};
  for (const entry of clusterInsights) {
    const cat = entry.category || 'mth';
    (grouped[cat] = grouped[cat] || []).push(entry);
  }

  const toggleCluster = (k: string) => setCollapsedClusters(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // HR questions: flat list from question_history where round_type = 'hr'
  const hrQuestions = buildQuestionGroups(questionHistory.filter(h => (h.round_type || '').toLowerCase() === 'hr'));

  return (
    <div className="space-y-6">

      {/* ── Capability Score headline (no progress bar) ── */}
      {capabilityScore != null && capabilityScore > 0 && (
        <div className="bg-gray-900 text-white rounded-xl px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-300">Overall Capability Score</div>
              <div className="tf-meta mt-0.5">
                Weighted across all sections
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{capabilityScore}</div>
              <div className="text-xs text-gray-400">out of 100</div>
            </div>
          </div>
          {capabilityScoreReasoning && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="text-2xs text-gray-400 leading-relaxed">{capabilityScoreReasoning}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Sections ── */}
      {SECTION_ORDER.filter(cat => grouped[cat]?.length || (cat === 'hr' && hrQuestions.length > 0)).map(cat => {
        const entries = grouped[cat] || [];
        const sec = sectionScores?.[cat];
        const headerColor = SECTION_HEADER_COLORS[cat] || '';
        const borderColor = SECTION_COLORS[cat] || '';
        const sectionName = entries[0]?.section_name || (cat === 'hr' ? 'HR' : cat.toUpperCase());

        return (
          <div key={cat} className={`rounded-xl border overflow-hidden border-l-4 ${borderColor}`}>

            {/* Section header */}
            <div className={`flex items-center justify-between px-5 py-3 border-b ${headerColor}`}>
              <div>
                <span className="text-sm font-semibold">{sectionName}</span>
                {sec?.section_pct != null && cat !== 'hr' && (
                  <span className="ml-2 text-xs opacity-60">{sec.section_pct}% of final score</span>
                )}
              </div>
              {sec?.score != null && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{sec.score}%</span>
                </div>
              )}
            </div>

            {/* ── HR: flat question list (no clusters) ── */}
            {cat === 'hr' ? (
              <div className="bg-white p-4">
                {hrQuestions.length > 0 ? (
                  <QuestionTable groups={hrQuestions} />
                ) : (
                  <div className="text-xs text-gray-400 italic px-2 py-4">No HR questions recorded.</div>
                )}
              </div>
            ) : (
              /* ── mth / nth: clusters → skills → questions ── */
              <div className="divide-y divide-gray-100 bg-white">
                {entries.map((cluster, idx) => {
                  const cKey = `${cat}-${idx}`;
                  const cOpen = !collapsedClusters.has(cKey);

                  return (
                    <div key={idx}>
                      {/* Cluster accordion header — no share %, no progress bar */}
                      <button
                        onClick={() => toggleCluster(cKey)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="tf-cell-name">{cluster.cluster_name}</span>
                          <span className={`px-1.5 py-0.5 text-2xs rounded border ${
                            (cluster.priority_label === 'High' || cluster.priority >= 3) ? 'bg-success-subtle text-success border-success-line' :
                            (cluster.priority_label === 'Medium' || cluster.priority === 2) ? 'bg-warning-subtle text-warning border-warning-line' :
                            'bg-orange-50 text-orange-700 border-orange-200'
                          }`}>
                            {cluster.priority_label || (cluster.priority >= 3 ? 'High' : cluster.priority === 2 ? 'Medium' : 'Low')} Priority
                          </span>
                          <span className="text-2xs text-gray-400">
                            {cluster.evaluated}/{cluster.total} skills
                          </span>
                        </div>
                        {cOpen
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </button>

                      {/* Skills inside cluster — flat list, no per-skill accordion */}
                      {cOpen && (
                        <div className="border-t border-gray-50 bg-gray-50/30 divide-y divide-gray-100">
                          {cluster.skill_scores.length === 0 ? (
                            <div className="text-xs text-gray-400 italic px-6 py-3">No skills in this cluster.</div>
                          ) : (
                            cluster.skill_scores.map((s, si) => {
                              const level = skillBandToCoverage(s.band, s.score);
                              return (
                                <div key={si} className="flex items-center gap-3 px-6 py-2.5">
                                  <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 truncate">{s.skill}</span>
                                  <CoverageBadge level={level} />
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}
