'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, ChevronUp, Download, Layers, Clock, MessageSquare,
  CheckCircle2, AlertCircle, MinusCircle, HelpCircle, ArrowRight, XCircle,
} from 'lucide-react';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

// ── Types ────────────────────────────────────────────────────────────────────

interface TrailEntry {
  state: string;
  q_num: number;
  ts: string;
  score: number | null;
  is_follow_up: boolean;
  question_intent?: string; // v3: explore | follow_up | probe | deep_dive | main_question
}

interface FollowUp {
  q_num: number;
  question: string;
  answer: string;
  score: number | null;
  question_intent: string;
  response_type: string;
  timestamp: string;
}

interface Clarification {
  clarification_number: number;
  question: string;
  answer: string;
}

interface QuestionGroup {
  q_num: number;
  skill: string;
  round_type: string;
  question: string;
  answer: string;
  score: number | null;
  timestamp: string;
  response_type: string;
  follow_ups: FollowUp[];
  clarifications?: Clarification[];
}

interface ClusterDef {
  id: string;
  name: string;
  priority: number;
  skills: string[];
}

interface Props {
  sessionId: string;
  aiEvaluation: Record<string, any>;
  isCompleted: boolean;
  /** Cluster config from special_instructions — defines the canonical skill order. */
  clusterConfig?: { mth: ClusterDef[]; nth: ClusterDef[] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; border: string; label: string; dot: string }> = {
  // New standardized labels (backend sends these for new interviews)
  'High':          { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', label: 'High',        dot: 'bg-emerald-500' },
  'Medium':        { icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   label: 'Medium',      dot: 'bg-amber-400' },
  'Low':           { icon: MinusCircle,  color: 'text-orange-600',  bg: 'bg-orange-50',   border: 'border-orange-200',  label: 'Low',         dot: 'bg-orange-400' },
  'Not Covered':   { icon: HelpCircle,   color: 'text-gray-400',    bg: 'bg-gray-50',     border: 'border-gray-200',    label: 'Not Covered', dot: 'bg-gray-300' },
  // Legacy internal levels (backward compat with older saved data)
  covered:     { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', label: 'High',        dot: 'bg-emerald-500' },
  medium:      { icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   label: 'Medium',      dot: 'bg-amber-400' },
  low:         { icon: MinusCircle,  color: 'text-orange-600',  bg: 'bg-orange-50',   border: 'border-orange-200',  label: 'Low',         dot: 'bg-orange-400' },
  skipped:     { icon: HelpCircle,   color: 'text-red-500',     bg: 'bg-red-50',      border: 'border-red-200',     label: 'Not Covered', dot: 'bg-red-400' },
  not_started: { icon: HelpCircle,   color: 'text-gray-400',    bg: 'bg-gray-50',     border: 'border-gray-200',    label: 'Not Covered', dot: 'bg-gray-300' },
  asked:       { icon: Clock,        color: 'text-blue-500',    bg: 'bg-blue-50',     border: 'border-blue-200',    label: 'Asked',       dot: 'bg-blue-400' },
};

function LevelBadge({ level }: { level: string }) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.not_started;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 4 ? 'bg-emerald-100 text-emerald-700' : score >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{score}/5</span>;
}

// ── Coverage Trail Stepper ───────────────────────────────────────────────────

function CoverageTrail({ entries }: { entries: TrailEntry[] }) {
  if (!entries.length) return null;

  return (
    <div className="relative pl-5 py-1">
      <div className="absolute left-[9px] top-3 bottom-3 w-px bg-gray-200" />
      {entries.map((entry, i) => {
        const cfg = LEVEL_CONFIG[entry.state] || LEVEL_CONFIG.not_started;
        const isLast = i === entries.length - 1;
        return (
          <div key={i} className="relative flex items-start gap-3 mb-2.5 last:mb-0">
            <div className={`relative z-10 mt-1 w-[11px] h-[11px] rounded-full border-2 ${isLast ? cfg.border + ' ' + cfg.dot.replace('bg-', 'border-') : 'border-gray-300'} bg-white flex items-center justify-center`}>
              {isLast && <div className={`w-[5px] h-[5px] rounded-full ${cfg.dot}`} />}
            </div>
            <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0 -mt-0.5">
              <LevelBadge level={entry.state} />
              {entry.q_num > 0 && <span className="text-[10px] font-mono text-gray-400">Q{entry.q_num}</span>}
              {(() => {
                const intent = (entry.question_intent || '').toLowerCase();
                const isDd = intent === 'deep_dive';
                const isFu = !isDd && (entry.is_follow_up || ['follow_up', 'probe'].includes(intent));
                if (isDd) return <span className="text-[10px] font-semibold text-teal-700 bg-teal-100 rounded px-1 py-0.5">D</span>;
                if (isFu) return <span className="text-[10px] font-semibold text-violet-700 bg-violet-100 rounded px-1 py-0.5">F</span>;
                return null;
              })()}
              {entry.score != null && <ScorePill score={entry.score} />}
              {entry.state === 'asked' && <ArrowRight className="w-3 h-3 text-gray-300" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-question coverage band from 0-5 score ──────────────────────────────
// The question score in SkillCoverageTab is 0-5 (ScorePill uses /5).
// Map to Not Covered / Low / Medium / High.
type CovLevel = 'not_covered' | 'low' | 'medium' | 'high';

function qCoverage(score: number | null): CovLevel {
  if (score == null || score <= 0) return 'not_covered';
  if (score >= 4) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

const COV_STYLES: Record<CovLevel, { label: string; badge: string; icon: any }> = {
  high:        { label: 'High',        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  medium:      { label: 'Medium',      badge: 'bg-amber-50 text-amber-700 border-amber-200',       icon: AlertCircle },
  low:         { label: 'Low',         badge: 'bg-orange-50 text-orange-700 border-orange-200',    icon: MinusCircle },
  not_covered: { label: 'Not Covered', badge: 'bg-gray-100 text-gray-500 border-gray-200',         icon: XCircle },
};

function CovBadge({ level }: { level: CovLevel }) {
  const s = COV_STYLES[level];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.badge}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

// Truncates long text at `limit` chars and reveals the rest behind a Show more / Show less toggle.
// Short text (≤ limit) renders as-is with no button.
function TruncatedText({ text, limit = 180, className = '' }: { text: string; limit?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className={className}>—</span>;
  const needsCut = text.length > limit;
  if (!needsCut) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {open ? text : text.slice(0, limit).trimEnd() + '…'}
      {' '}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800"
      >
        {open ? 'Show less' : 'Show more'}
      </button>
    </span>
  );
}

// ── Question Table (Q# / Question / Candidate Response / Coverage) ─────────
// Follow-ups are nested inside the parent row via an inline toggle.
function QuestionTable({ groups }: { groups: QuestionGroup[] }) {
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
  return (
    <div className="rounded-lg border border-gray-200 w-full">
      {/* w-full + table-auto = fill container; columns still size to content
          within the available width, so short responses sit in a narrow cell
          and long responses get more room. */}
      <div className="tf-table-shell">
        <table className="w-full text-xs" style={{ tableLayout: 'auto' }}>
          <thead className="bg-gray-100 text-gray-600 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-12 whitespace-nowrap">Q #</th>
              <th className="px-3 py-2 text-left font-semibold">Question</th>
              <th className="px-3 py-2 text-left font-semibold">Candidate Response</th>
              <th className="px-3 py-2 text-left font-semibold w-32 whitespace-nowrap">Coverage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {groups.map((g, i) => {
              const mainLevel = qCoverage(g.score);
              const fus = g.follow_ups || [];
              const hasFu = fus.length > 0;
              const clarifs = g.clarifications || [];
              const hasClarif = clarifs.length > 0;
              const isOpen = openRow.has(i);
              return (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">
                      Q{g.q_num}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top" style={{ maxWidth: '28rem' }}>
                    <div className="text-[12px] font-medium text-gray-800 leading-snug break-words">
                      <TruncatedText text={g.question || ''} limit={160} />
                    </div>
                    {hasClarif && isOpen && (
                      <div className="mt-2 pl-3 border-l-2 border-amber-200 space-y-2">
                        {clarifs.map((cl, ci) => (
                          <div key={`cl-${ci}`}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                                CL{cl.clarification_number}
                              </span>
                            </div>
                            <div className="text-[11px] font-medium text-gray-700 leading-snug break-words">
                              <TruncatedText text={cl.question || ''} limit={140} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {hasClarif && !isOpen && !hasFu && (
                      <div className="mt-2 pl-3 border-l-2 border-amber-200">
                        <button onClick={() => toggle(i)} className="text-[10px] text-amber-700 hover:text-amber-900 flex items-center gap-1">
                          <ChevronDown className="w-3 h-3" />
                          {clarifs.length} clarification{clarifs.length > 1 ? 's' : ''}
                        </button>
                      </div>
                    )}
                    {hasFu && (
                      <div className="mt-2 pl-3 border-l-2 border-violet-200">
                        {!isOpen ? (
                          <button onClick={() => toggle(i)} className="text-[10px] text-violet-600 hover:text-violet-800 flex items-center gap-1">
                            <ChevronDown className="w-3 h-3" />
                            {(() => {
                              const dd = fus.filter(f => (f.question_intent || '').toLowerCase() === 'deep_dive').length;
                              const fu2 = fus.length - dd;
                              return [fu2 > 0 ? `${fu2} follow-up${fu2 > 1 ? 's' : ''}` : '', dd > 0 ? `${dd} deep dive${dd > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
                            })()}
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <button onClick={() => toggle(i)} className="text-[10px] text-violet-600 hover:text-violet-800 flex items-center gap-1">
                              <ChevronUp className="w-3 h-3" />
                              Hide
                            </button>
                            {(() => {
                              let fCtr = 0; let dCtr = 0;
                              return fus.map((fu, fi) => {
                                const isDd = (fu.question_intent || '').toLowerCase() === 'deep_dive';
                                const tag = isDd ? `D${++dCtr}` : `F${++fCtr}`;
                                const tagCls = isDd ? 'text-teal-700 bg-teal-100' : 'text-violet-700 bg-violet-100';
                                return (
                                  <div key={fi}>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <span className={`text-[10px] font-semibold ${tagCls} rounded px-1.5 py-0.5`}>{tag}</span>
                                    </div>
                                    <div className="text-[11px] font-medium text-gray-700 leading-snug break-words">
                                      <TruncatedText text={fu.question || ''} limit={140} />
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top" style={{ maxWidth: '40rem' }}>
                    <div className="text-[12px] text-gray-700 leading-snug whitespace-pre-wrap break-words">
                      <TruncatedText text={g.answer || ''} limit={220} />
                    </div>
                    {hasClarif && isOpen && (
                      <div className="mt-2 pl-3 border-l-2 border-amber-200 space-y-2">
                        {clarifs.map((cl, ci) => (
                          <div key={`cl-a-${ci}`} className="text-[11px] text-gray-600 leading-snug whitespace-pre-wrap break-words">
                            <span className="text-[10px] font-semibold text-amber-700 mr-1">CL{cl.clarification_number}:</span>
                            <TruncatedText text={cl.answer || ''} limit={180} />
                          </div>
                        ))}
                      </div>
                    )}
                    {hasFu && isOpen && (
                      <div className="mt-2 pl-3 border-l-2 border-violet-200 space-y-2">
                        {(() => {
                          let fCtr = 0; let dCtr = 0;
                          return fus.map((fu, fi) => {
                            const isDd = (fu.question_intent || '').toLowerCase() === 'deep_dive';
                            const tag = isDd ? `D${++dCtr}` : `F${++fCtr}`;
                            const tagColor = isDd ? 'text-teal-700' : 'text-violet-700';
                            return (
                              <div key={fi} className="text-[11px] text-gray-600 leading-snug whitespace-pre-wrap break-words">
                                <span className={`text-[10px] font-semibold ${tagColor} mr-1`}>{tag}:</span>
                                <TruncatedText text={fu.answer || ''} limit={180} />
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <CovBadge level={mainLevel} />
                    {hasFu && isOpen && (
                      <div className="mt-2 pl-3 border-l-2 border-violet-200 space-y-2">
                        {fus.map((fu, fi) => (
                          <div key={fi}><CovBadge level={qCoverage(fu.score)} /></div>
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
    </div>
  );
}

// ── Q&A Card (main question + nested follow-ups) ────────────────────────────

function QACard({ group, coverageLevel }: { group: QuestionGroup; coverageLevel: string }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const cfg = LEVEL_CONFIG[coverageLevel] || LEVEL_CONFIG.not_started;
  const fuCount = group.follow_ups?.length || 0;

  return (
    <div className={`border rounded-lg overflow-hidden ${cfg.border}`}>
      {/* Main question header */}
      <div
        className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors ${cfg.bg}`}
        onClick={() => setShowAnswer(!showAnswer)}
      >
        <div className="flex-shrink-0 mt-0.5">
          {showAnswer ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-bold text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">Q{group.q_num}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              group.round_type?.includes('must_have') ? 'bg-indigo-50 text-indigo-600' :
              group.round_type?.includes('nice_to_have') ? 'bg-purple-50 text-purple-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {group.round_type?.includes('must_have') ? 'Must Have' :
               group.round_type?.includes('nice_to_have') ? 'Nice to Have' :
               group.round_type?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'General'}
            </span>
            <ScorePill score={group.score} />
            {fuCount > 0 && (() => {
              const ddCt = (group.follow_ups || []).filter(f => (f.question_intent || '').toLowerCase() === 'deep_dive').length;
              const fuCt = fuCount - ddCt;
              const parts = [fuCt > 0 ? `${fuCt} follow-up${fuCt > 1 ? 's' : ''}` : '', ddCt > 0 ? `${ddCt} deep dive${ddCt > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
              return (
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-medium">
                  <MessageSquare className="w-3 h-3" />
                  {parts}
                </span>
              );
            })()}
          </div>
          <p className="text-sm text-gray-800 leading-snug line-clamp-2">{group.question || 'Question not recorded'}</p>
        </div>
        <LevelBadge level={coverageLevel} />
      </div>

      {/* Expanded: answer + follow-ups */}
      {showAnswer && (
        <div className="border-t border-gray-100">
          {/* Main answer */}
          {group.answer && (
            <div className="px-4 py-3 bg-white">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Candidate Answer</p>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{group.answer}</p>
            </div>
          )}
          {group.response_type === 'skipped' && (
            <div className="px-4 py-3 bg-red-50/30">
              <p className="text-xs text-red-500 italic">Skipped / No answer provided</p>
            </div>
          )}

          {/* Follow-ups & Deep Dives */}
          {(() => {
            let fCtr = 0; let dCtr = 0;
            return (group.follow_ups || []).map((fu, i) => {
              const isDd = (fu.question_intent || '').toLowerCase() === 'deep_dive';
              const tag = isDd ? `D${++dCtr}` : `F${++fCtr}`;
              const tagCls = isDd ? 'text-teal-700 bg-teal-100' : 'text-violet-700 bg-violet-100';
              const bgCls = isDd ? 'bg-teal-50/30' : 'bg-violet-50/30';
              const intentLabel = isDd ? 'Deep Dive' : (fu.question_intent || 'follow-up').replace(/_/g, ' ');
              return (
                <div key={i} className="border-t border-gray-100">
                  <div className={`px-4 py-3 ${bgCls}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-semibold ${tagCls} px-1.5 py-0.5 rounded`}>
                        {tag}
                      </span>
                      <span className={`text-[10px] font-medium capitalize ${isDd ? 'text-teal-600' : 'text-violet-600'}`}>
                        {intentLabel}
                      </span>
                      <ScorePill score={fu.score} />
                    </div>
                    <p className="text-sm text-gray-700 leading-snug">{fu.question || 'Question'}</p>
                  </div>
                  {fu.answer && (
                    <div className="px-4 py-3 bg-white pl-8">
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{fu.answer}</p>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SkillCoverageTab({ sessionId, aiEvaluation: eval_, isCompleted, clusterConfig }: Props) {
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const coverageMap: Record<string, string> = eval_?.skill_coverage_map || {};
  const priorityMap: Record<string, string> = eval_?.skill_priority_map || {};
  const coverageTrail: Record<string, TrailEntry[]> = eval_?.coverage_trail || {};
  const questionGroups: QuestionGroup[] = eval_?.question_groups || [];

  // Build skill → question groups mapping
  const skillQuestionMap = useMemo(() => {
    const map: Record<string, QuestionGroup[]> = {};
    for (const g of questionGroups) {
      const skill = (g.skill || '').toLowerCase();
      if (skill) {
        if (!map[skill]) map[skill] = [];
        map[skill].push(g);
      }
    }
    return map;
  }, [questionGroups]);

  // Fuzzy skill→questions lookup — handles config typos (e.g. "selinieum" vs "Selenium")
  // and multi-word mismatches ("Selenium" vs "Selenium Testing Expertise").
  // Falls back to: exact match → substring → token-overlap → edit-distance.
  const getQuestionsForSkill = useMemo(() => {
    const keys = Object.keys(skillQuestionMap);
    // Simple Levenshtein-style ratio — good enough for typo detection
    const sim = (a: string, b: string): number => {
      if (a === b) return 1;
      if (!a || !b) return 0;
      const la = a.length, lb = b.length;
      if (Math.abs(la - lb) / Math.max(la, lb) > 0.5) return 0;
      let matches = 0;
      const shorter = la <= lb ? a : b;
      const longer = la <= lb ? b : a;
      for (let i = 0; i < shorter.length; i++) {
        if (longer.includes(shorter[i])) matches++;
      }
      return (2 * matches) / (la + lb);
    };
    return (configSkill: string): QuestionGroup[] => {
      const sl = configSkill.toLowerCase();
      // 1. Exact match
      if (skillQuestionMap[sl]) return skillQuestionMap[sl];
      // 2. Substring match (either direction)
      for (const k of keys) {
        if (sl.includes(k) || k.includes(sl)) return skillQuestionMap[k];
      }
      // 3. Token overlap — "selenium" ↔ "selenium testing expertise"
      const slTokens = new Set(sl.split(/[\s(),]+/).filter(t => t.length > 2));
      if (slTokens.size > 0) {
        for (const k of keys) {
          const kTokens = new Set(k.split(/[\s(),]+/).filter(t => t.length > 2));
          for (const t of slTokens) { if (kTokens.has(t)) return skillQuestionMap[k]; }
        }
      }
      // 4. Fuzzy similarity ≥ 0.75 — catches "selinieum" → "selenium"
      let best = { key: '', score: 0 };
      for (const k of keys) {
        const s = sim(sl, k);
        if (s > best.score) best = { key: k, score: s };
      }
      if (best.score >= 0.75) return skillQuestionMap[best.key];
      return [];
    };
  }, [skillQuestionMap]);

  // Order skills following the cluster config (same order as when clusters were created).
  // MustHave clusters first, then NiceToHave — within each cluster skills stay in config order.
  // Skills present in coverageMap but absent from cluster config are appended at the end.
  const allSkills = useMemo(() => {
    const mthSkills = clusterConfig?.mth.flatMap(c => c.skills) ?? [];
    const nthSkills = clusterConfig?.nth.flatMap(c => c.skills) ?? [];
    const configOrder = [...mthSkills, ...nthSkills];

    if (configOrder.length > 0) {
      // Build a case-insensitive position lookup from the cluster config
      const posMap = new Map<string, number>();
      configOrder.forEach((s, i) => { posMap.set(s.toLowerCase(), i); });

      const coverageKeys = Object.keys(coverageMap);
      // Include config skills (even if missing from coverageMap) + any extras in coverageMap
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const s of configOrder) {
        const key = coverageKeys.find(k => k.toLowerCase() === s.toLowerCase()) ?? s;
        if (!seen.has(key.toLowerCase())) {
          seen.add(key.toLowerCase());
          ordered.push(key);
        }
      }
      // Append any skills from coverageMap that weren't in the config
      for (const k of coverageKeys) {
        if (!seen.has(k.toLowerCase())) {
          seen.add(k.toLowerCase());
          ordered.push(k);
        }
      }
      return ordered;
    }

    // Fallback: no cluster config — sort by priority then coverage level
    return Object.keys(coverageMap).sort((a, b) => {
      const pOrder: Record<string, number> = { must_have: 0, nice_to_have: 1 };
      const lOrder: Record<string, number> = { covered: 0, medium: 1, low: 2, skipped: 3, not_started: 4 };
      const pa = pOrder[priorityMap[a] || 'must_have'] ?? 1;
      const pb = pOrder[priorityMap[b] || 'must_have'] ?? 1;
      if (pa !== pb) return pa - pb;
      const la = lOrder[coverageMap[a]] ?? 4;
      const lb = lOrder[coverageMap[b]] ?? 4;
      return la - lb || a.localeCompare(b);
    });
  }, [coverageMap, priorityMap, clusterConfig]);

  const counts = useMemo(() => ({
    total: allSkills.length,
    covered: allSkills.filter(s => coverageMap[s] === 'covered').length,
    medium: allSkills.filter(s => coverageMap[s] === 'medium').length,
    low: allSkills.filter(s => coverageMap[s] === 'low').length,
    skipped: allSkills.filter(s => coverageMap[s] === 'skipped' || coverageMap[s] === 'not_started').length,
  }), [allSkills, coverageMap]);

  if (!isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Skill coverage will be available after the interview completes.</p>
      </div>
    );
  }

  if (allSkills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No skill coverage data available.</p>
      </div>
    );
  }

  const toggleSkill = (skill: string) => {
    setExpandedSkills(prev => {
      const next = new Set(prev);
      next.has(skill) ? next.delete(skill) : next.add(skill);
      return next;
    });
  };

  const handleDownload = async (format: 'pdf' | 'excel' | 'json') => {
    setDownloading(true);
    try {
      const blob = await aiInterviewService.downloadReport(sessionId, 'coverage', format);
      const ext = format === 'excel' ? 'xlsx' : format;
      aiInterviewService.triggerBlobDownload(blob, `Coverage_Report.${ext}`);
    } catch { /* silent */ }
    setDownloading(false);
  };

  const coveredPct = counts.total > 0 ? Math.round(((counts.covered + counts.medium) / counts.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Download bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-400 mr-auto">
          {coveredPct}% skills at medium+ coverage
        </span>
        {['pdf', 'excel', 'json'].map(fmt => (
          <button
            key={fmt}
            onClick={() => handleDownload(fmt as any)}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Summary strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'High', count: counts.covered, dot: 'bg-emerald-500', text: 'text-emerald-700' },
          { label: 'Medium', count: counts.medium, dot: 'bg-amber-400', text: 'text-amber-700' },
          { label: 'Low', count: counts.low, dot: 'bg-orange-400', text: 'text-orange-700' },
          { label: 'Not Covered', count: counts.skipped, dot: 'bg-gray-300', text: 'text-gray-500' },
        ].map(item => (
          <div key={item.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`} />
              <span className={`text-xl font-bold ${item.text}`}>{item.count}</span>
            </div>
            <p className="text-[10px] text-gray-500">{item.label}</p>
          </div>
        ))}
      </div>

      {/* ── Stacked progress bar ──────────────────────────────────── */}
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${counts.total > 0 ? (counts.covered / counts.total) * 100 : 0}%` }} />
        <div className="h-full bg-amber-400 transition-[width] duration-700" style={{ width: `${counts.total > 0 ? (counts.medium / counts.total) * 100 : 0}%` }} />
        <div className="h-full bg-orange-400 transition-[width] duration-700" style={{ width: `${counts.total > 0 ? (counts.low / counts.total) * 100 : 0}%` }} />
      </div>

      {/* ── Skills grouped by section (Must Have / Nice to Have / HR) ─ */}
      {(() => {
        // Group skills into sections — use cluster config order when available.
        const mthConfigSet = new Set((clusterConfig?.mth.flatMap(c => c.skills) ?? []).map(s => s.toLowerCase()));
        const nthConfigSet = new Set((clusterConfig?.nth.flatMap(c => c.skills) ?? []).map(s => s.toLowerCase()));
        const hasConfig = mthConfigSet.size > 0 || nthConfigSet.size > 0;

        const mustHaveSkills = hasConfig
          ? allSkills.filter(s => mthConfigSet.has(s.toLowerCase()))
          : allSkills.filter(s => (priorityMap[s] || 'must_have') === 'must_have');
        const niceToHaveSkills = hasConfig
          ? allSkills.filter(s => nthConfigSet.has(s.toLowerCase()))
          : allSkills.filter(s => priorityMap[s] === 'nice_to_have');
        // HR questions: question_groups with round_type containing 'hr'
        const hrGroups = questionGroups.filter(g => (g.round_type || '').toLowerCase() === 'hr');

        // round_tracking from evaluation — has budget/actual time and Q counts
        const roundTracking: Array<{
          type: string; display_name: string;
          budget_minutes: number; actual_duration_minutes: number;
          planned_questions: number; actual_questions_asked: number;
        }> = eval_?.round_tracking || [];

        // Map section key → round_type for lookup
        const ROUND_TYPE_MAP: Record<string, string> = {
          mth: 'must_have_skills', nth: 'nice_to_have_skills', hr: 'hr',
        };

        // Compute per-section stats from question_groups + round_tracking
        const sectionStats = (sectionKey: string, sectionSkills: string[]) => {
          const rt = ROUND_TYPE_MAP[sectionKey] || '';
          const tracking = roundTracking.find(r => r.type === rt);
          // Count main Qs and follow-ups from question_groups for this section's skills.
          // Use the fuzzy skill-lookup so config-skill typos (e.g. "selinieum" vs
          // evaluator topic "Selenium") still aggregate correctly.
          const seenGroupKeys = new Set<string>();
          const sectionGroups: QuestionGroup[] = sectionKey === 'hr'
            ? hrGroups
            : sectionSkills.flatMap(s => getQuestionsForSkill(s)).filter(g => {
                const key = `${g.q_num}-${(g.skill || '').toLowerCase()}`;
                if (seenGroupKeys.has(key)) return false;
                seenGroupKeys.add(key);
                return true;
              });
          const totalQs = sectionGroups.length;
          const totalFu = sectionGroups.reduce((s, g) => s + (g.follow_ups?.length || 0), 0);
          const allocatedQs = tracking?.planned_questions ?? 0;
          // Prefer actual question_groups count over tracking (which may be stale/0)
          const askedQs = Math.max(tracking?.actual_questions_asked ?? 0, totalQs);
          const allocatedMin = tracking?.budget_minutes ?? 0;
          const takenMin = tracking?.actual_duration_minutes ?? 0;
          return { totalQs, totalFu, allocatedQs, askedQs, allocatedMin, takenMin };
        };

        const fmtMin = (m: number) => {
          if (m <= 0) return '0m';
          if (m < 1) return `${Math.round(m * 60)}s`;
          return `${Math.round(m * 10) / 10}m`;
        };

        const SECTIONS = [
          { key: 'mth', label: 'Must Have Skills', skills: mustHaveSkills, borderColor: 'border-l-purple-400 bg-purple-50/30', headerColor: 'bg-purple-50 border-purple-100 text-purple-900' },
          { key: 'nth', label: 'Nice To Have Skills', skills: niceToHaveSkills, borderColor: 'border-l-indigo-400 bg-indigo-50/30', headerColor: 'bg-indigo-50 border-indigo-100 text-indigo-900' },
          { key: 'hr', label: 'HR', skills: [] as string[], borderColor: 'border-l-teal-400 bg-teal-50/30', headerColor: 'bg-teal-50 border-teal-100 text-teal-900' },
        ].filter(s => s.skills.length > 0 || (s.key === 'hr' && hrGroups.length > 0));

        return (
          <div className="space-y-6">
            {SECTIONS.map(section => {
              const stats = sectionStats(section.key, section.skills);
              return (
              <div key={section.key} className={`rounded-xl border overflow-hidden border-l-4 ${section.borderColor}`}>
                {/* Section header with stats */}
                <div className={`px-5 py-3 border-b ${section.headerColor}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold">{section.label}</span>
                    <span className="text-xs opacity-60">
                      {section.key === 'hr'
                        ? `${hrGroups.length} question${hrGroups.length !== 1 ? 's' : ''}`
                        : `${section.skills.length} skill${section.skills.length !== 1 ? 's' : ''}`
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap text-[11px]">
                    {stats.allocatedQs > 0 && (
                      <span className="flex items-center gap-1 text-gray-600">
                        <MessageSquare className="w-3 h-3" />
                        Allocated: {stats.allocatedQs} Q{stats.allocatedQs !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-gray-600">
                      <MessageSquare className="w-3 h-3" />
                      Asked: {stats.askedQs} Q{stats.askedQs !== 1 ? 's' : ''}
                    </span>
                    {stats.totalFu > 0 && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <MessageSquare className="w-3 h-3" />
                        {stats.totalFu} follow-up{stats.totalFu !== 1 ? 's' : ''}
                      </span>
                    )}
                    {stats.allocatedMin > 0 && (
                      <span className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-3 h-3" />
                        Allocated: {fmtMin(stats.allocatedMin)}
                      </span>
                    )}
                    {stats.takenMin > 0 && (
                      <span className="flex items-center gap-1 text-gray-600">
                        <Clock className="w-3 h-3" />
                        Time Taken: {fmtMin(stats.takenMin)}
                      </span>
                    )}
                  </div>
                </div>

                {section.key === 'hr' ? (
                  /* HR: flat question table (no skill sub-accordion) */
                  <div className="bg-white p-4">
                    {hrGroups.length > 0 ? (
                      <QuestionTable groups={hrGroups} />
                    ) : (
                      <div className="text-xs text-gray-400 italic px-2 py-4">No HR questions recorded.</div>
                    )}
                  </div>
                ) : (
                  /* MH / NTH: skill accordions */
                  <div className="divide-y divide-gray-100 bg-white">
                    {section.skills.map(skill => {
                      const level = coverageMap[skill] || 'not_started';
                      const groups = getQuestionsForSkill(skill);
                      const isExpanded = expandedSkills.has(skill);
                      const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.not_started;
                      const qNums = groups.map(g => g.q_num).filter(Boolean);
                      const totalFollowUps = groups.reduce((sum, g) => sum + (g.follow_ups?.length || 0), 0);

                      return (
                        <div key={skill}>
                          {/* Skill accordion header */}
                          <div
                            className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors ${isExpanded ? cfg.bg : ''}`}
                            onClick={() => toggleSkill(skill)}
                          >
                            <div className="flex-shrink-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                <span className="text-sm font-semibold text-gray-900 truncate">{skill}</span>
                              </div>
                            </div>
                            <LevelBadge level={level} />
                            {totalFollowUps > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                                <MessageSquare className="w-3 h-3" />
                                +{totalFollowUps}
                              </span>
                            )}
                          </div>

                          {/* Expanded: question table */}
                          {isExpanded && (
                            <div className="border-t border-gray-100">
                              {groups.length > 0 ? (
                                <div className="px-5 py-3">
                                  <QuestionTable groups={groups} />
                                </div>
                              ) : (
                                <div className="px-5 py-4 text-center text-xs text-gray-400 italic">
                                  No questions recorded for this skill
                                </div>
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
      })()}
    </div>
  );
}
