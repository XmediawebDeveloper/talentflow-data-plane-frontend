'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, ChevronUp, Download, Layers, Clock, MessageSquare,
  CheckCircle2, AlertCircle, MinusCircle, HelpCircle, ArrowRight, XCircle,
  Activity, Award, Target, Zap, Sparkles, TrendingUp, RefreshCw,
} from 'lucide-react';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { DetailedSkillsTable } from '../evaluation-dashboard/DetailedSkillsTable';
import { buildDashboardData } from '../evaluation-dashboard/adapter';

// ── Shared Types ─────────────────────────────────────────────────────────────

interface TrailEntry {
  state: string;
  q_num: number;
  ts: string;
  score: number | null;
  is_follow_up: boolean;
  question_intent?: string;
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
}

interface ClusterDef {
  id: string;
  name: string;
  priority: number;
  skills: string[];
}

interface SkillScore {
  skill: string;
  score: number | null;
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

interface LiveSkillCoverage {
  covered: string[];
  medium_covered: string[];
  low_covered: string[];
  uncovered: string[];
  nice_to_have_skills?: string[];
  total_questions: number;
  questions_asked: number;
}

interface CrossClusterEvent {
  qNum: number;
  clusters: string[];
  skills: string[];
  ts: number;
}

interface Props {
  sessionId: string;
  aiEvaluation: Record<string, any>;
  isInProgress: boolean;
  isCompleted: boolean;
  clusterConfig: { mth: ClusterDef[]; nth: ClusterDef[] };
  liveSkillCoverage?: LiveSkillCoverage | null;
  liveWsConnected?: boolean;
  crossClusterEvents?: CrossClusterEvent[];
  clusterInsights?: ClusterEntry[];
  capabilityScore?: number | null;
  sectionScores?: Record<string, SectionScore> | null;
  capabilityScoreReasoning?: string | null;
}

// ── Level Configs ────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string; dot: string }> = {
  'High':        { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', label: 'High',        dot: 'bg-emerald-500' },
  'Medium':      { icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   label: 'Medium',      dot: 'bg-amber-400' },
  'Low':         { icon: MinusCircle,  color: 'text-orange-600',  bg: 'bg-orange-50',   border: 'border-orange-200',  label: 'Low',         dot: 'bg-orange-400' },
  'Not Covered': { icon: HelpCircle,   color: 'text-gray-400',    bg: 'bg-gray-50',     border: 'border-gray-200',    label: 'Not Covered', dot: 'bg-gray-300' },
  covered:     { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', label: 'High',        dot: 'bg-emerald-500' },
  medium:      { icon: AlertCircle,  color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   label: 'Medium',      dot: 'bg-amber-400' },
  low:         { icon: MinusCircle,  color: 'text-orange-600',  bg: 'bg-orange-50',   border: 'border-orange-200',  label: 'Low',         dot: 'bg-orange-400' },
  skipped:     { icon: HelpCircle,   color: 'text-red-500',     bg: 'bg-red-50',      border: 'border-red-200',     label: 'Not Covered', dot: 'bg-red-400' },
  not_started: { icon: HelpCircle,   color: 'text-gray-400',    bg: 'bg-gray-50',     border: 'border-gray-200',    label: 'Not Covered', dot: 'bg-gray-300' },
};

type CovLevel = 'not_covered' | 'low' | 'medium' | 'high';

function qCoverage(score: number | null): CovLevel {
  if (score == null || score <= 0) return 'not_covered';
  if (score >= 4) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function skillBandToLevel(band: string, score: number | null): string {
  if (score == null || score <= 0 || band === 'Not Covered' || band === 'Not Evaluated') return 'not_started';
  const b = (band || '').toLowerCase();
  if (b === 'high' || b === 'strong' || b === 'proficient') return 'covered';
  if (b === 'medium' || b === 'developing') return 'medium';
  return 'low';
}

const COV_STYLES: Record<CovLevel, { label: string; badge: string; icon: any }> = {
  high:        { label: 'High',        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  medium:      { label: 'Medium',      badge: 'bg-amber-50 text-amber-700 border-amber-200',       icon: AlertCircle },
  low:         { label: 'Low',         badge: 'bg-orange-50 text-orange-700 border-orange-200',    icon: MinusCircle },
  not_covered: { label: 'Not Covered', badge: 'bg-gray-100 text-gray-500 border-gray-200',         icon: XCircle },
};

// ── Atoms ────────────────────────────────────────────────────────────────────

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
  const rounded = Math.round(score);
  const color = rounded >= 4 ? 'bg-emerald-100 text-emerald-700' : rounded >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{rounded}/5</span>;
}

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

// ── Coverage Trail ───────────────────────────────────────────────────────────

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

// ── Question Table (with follow-ups) ─────────────────────────────────────────

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
    <div className="overflow-x-auto rounded-lg border border-gray-200 w-full">
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
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Fuzzy similarity (Sørensen-Dice style) for skill matching
function skillSim(a: string, b: string): number {
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
}

function priorityStyle(priority: number, label?: string) {
  const isHi = label === 'High' || priority >= 3;
  const isMid = label === 'Medium' || priority === 2;
  if (isHi) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (isMid) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-orange-50 text-orange-700 border-orange-200';
}

function priorityLabel(priority: number, label?: string): string {
  if (label) return label;
  if (priority >= 3) return 'High';
  if (priority === 2) return 'Medium';
  return 'Low';
}

function fmtMin(m: number): string {
  if (m <= 0) return '0m';
  if (m < 1) return `${Math.round(m * 60)}s`;
  return `${Math.round(m * 10) / 10}m`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function CoverageTab({
  sessionId,
  aiEvaluation: eval_,
  isInProgress,
  isCompleted,
  clusterConfig,
  liveSkillCoverage,
  liveWsConnected = false,
  crossClusterEvents = [],
  clusterInsights = [],
  capabilityScore,
  sectionScores,
  capabilityScoreReasoning,
}: Props) {
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const coverageMap: Record<string, string> = eval_?.skill_coverage_map || {};
  const skillScoresMap: Record<string, number> = eval_?.skill_scores_map || {};
  const coverageTrail: Record<string, TrailEntry[]> = eval_?.coverage_trail || {};
  const questionGroups: QuestionGroup[] = eval_?.question_groups || [];

  // Build skill → question groups mapping (case-insensitive)
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

  // Fuzzy skill lookup
  const getQuestionsForSkill = useMemo(() => {
    const keys = Object.keys(skillQuestionMap);
    return (configSkill: string): QuestionGroup[] => {
      const sl = configSkill.toLowerCase();
      if (skillQuestionMap[sl]) return skillQuestionMap[sl];
      for (const k of keys) {
        if (sl.includes(k) || k.includes(sl)) return skillQuestionMap[k];
      }
      const slTokens = new Set(sl.split(/[\s(),]+/).filter(t => t.length > 2));
      if (slTokens.size > 0) {
        for (const k of keys) {
          const kTokens = new Set(k.split(/[\s(),]+/).filter(t => t.length > 2));
          for (const t of slTokens) { if (kTokens.has(t)) return skillQuestionMap[k]; }
        }
      }
      let best = { key: '', score: 0 };
      for (const k of keys) {
        const s = skillSim(sl, k);
        if (s > best.score) best = { key: k, score: s };
      }
      if (best.score >= 0.75) return skillQuestionMap[best.key];
      return [];
    };
  }, [skillQuestionMap]);

  // Resolve coverage level for a skill (eval takes priority, live as fallback)
  const resolveSkillLevel = (skill: string): string => {
    const sl = skill.toLowerCase();
    const keyMatch = Object.keys(coverageMap).find(k => k.toLowerCase() === sl);
    if (keyMatch) return coverageMap[keyMatch];
    if (liveSkillCoverage) {
      if (liveSkillCoverage.covered.some(s => s.toLowerCase() === sl)) return 'covered';
      if (liveSkillCoverage.medium_covered.some(s => s.toLowerCase() === sl)) return 'medium';
      if (liveSkillCoverage.low_covered.some(s => s.toLowerCase() === sl)) return 'low';
      return 'not_started';
    }
    return 'not_started';
  };

  // Cluster-level insights lookup (by cluster name, case-insensitive)
  const ciByClusterName = useMemo(() => {
    const map = new Map<string, ClusterEntry>();
    for (const c of clusterInsights) {
      map.set(c.cluster_name.toLowerCase(), c);
    }
    return map;
  }, [clusterInsights]);

  // All skills in coverage (from either eval or live), in cluster config order
  const allCoveredSkills = useMemo(() => {
    const fromMap = Object.keys(coverageMap);
    if (fromMap.length > 0) return fromMap;
    if (liveSkillCoverage) {
      return [
        ...liveSkillCoverage.covered,
        ...liveSkillCoverage.medium_covered,
        ...liveSkillCoverage.low_covered,
        ...liveSkillCoverage.uncovered,
      ];
    }
    return [];
  }, [coverageMap, liveSkillCoverage]);

  // Aggregate level counts across all skills
  const counts = useMemo(() => {
    const allFromConfig = [
      ...clusterConfig.mth.flatMap(c => c.skills),
      ...clusterConfig.nth.flatMap(c => c.skills),
    ];
    const allSkills = allFromConfig.length > 0 ? allFromConfig : allCoveredSkills;
    let covered = 0, medium = 0, low = 0, skipped = 0;
    for (const s of allSkills) {
      const level = resolveSkillLevel(s);
      if (level === 'covered') covered++;
      else if (level === 'medium') medium++;
      else if (level === 'low') low++;
      else skipped++;
    }
    return { total: allSkills.length, covered, medium, low, skipped };
  }, [clusterConfig, allCoveredSkills, coverageMap, liveSkillCoverage]);

  const coveredPct = counts.total > 0 ? Math.round(((counts.covered + counts.medium) / counts.total) * 100) : 0;
  const touchedPct = counts.total > 0 ? Math.round(((counts.covered + counts.medium + counts.low) / counts.total) * 100) : 0;

  // Cluster stats for top-line KPI
  const clusterStats = useMemo(() => {
    const allClusters = [...clusterConfig.mth, ...clusterConfig.nth];
    const touched = allClusters.filter(c =>
      c.skills.some(s => {
        const lv = resolveSkillLevel(s);
        return lv === 'covered' || lv === 'medium' || lv === 'low';
      })
    );
    return { total: allClusters.length, touched: touched.length };
  }, [clusterConfig, coverageMap, liveSkillCoverage]);

  // HR question groups
  const hrGroups = useMemo(() =>
    questionGroups.filter(g => (g.round_type || '').toLowerCase() === 'hr'),
    [questionGroups]
  );

  // Round tracking (planned/actual Qs and time per section)
  const roundTracking: Array<{
    type: string; display_name: string;
    budget_minutes: number; actual_duration_minutes: number;
    planned_questions: number; actual_questions_asked: number;
  }> = eval_?.round_tracking || [];

  const toggleSkill = (skill: string) => {
    setExpandedSkills(prev => {
      const next = new Set(prev);
      next.has(skill) ? next.delete(skill) : next.add(skill);
      return next;
    });
  };

  const toggleCluster = (key: string) => {
    setCollapsedClusters(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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

  // ─── Not started placeholder ───────────────────────────────────────────────
  if (!isInProgress && !isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Activity className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium text-gray-500">Interview not yet started</p>
        <p className="text-xs text-gray-400 mt-1">Coverage will appear once the candidate begins the interview</p>
      </div>
    );
  }

  const hasAnyData = counts.total > 0 || questionGroups.length > 0 || !!liveSkillCoverage;
  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Layers className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No coverage data available yet.</p>
      </div>
    );
  }

  // Sections to render
  const hasMthConfig = clusterConfig.mth.length > 0;
  const hasNthConfig = clusterConfig.nth.length > 0;
  const SECTIONS: Array<{
    key: 'mth' | 'nth' | 'hr';
    label: string;
    clusters: ClusterDef[];
    headerBg: string;
    leftBorder: string;
    accentText: string;
    accentBg: string;
  }> = [
    hasMthConfig && {
      key: 'mth' as const,
      label: 'Must Have Skills',
      clusters: clusterConfig.mth,
      headerBg: 'bg-purple-50 border-purple-100 text-purple-900',
      leftBorder: 'border-l-purple-400',
      accentText: 'text-purple-700',
      accentBg: 'bg-purple-100',
    },
    hasNthConfig && {
      key: 'nth' as const,
      label: 'Nice To Have Skills',
      clusters: clusterConfig.nth,
      headerBg: 'bg-indigo-50 border-indigo-100 text-indigo-900',
      leftBorder: 'border-l-indigo-400',
      accentText: 'text-indigo-700',
      accentBg: 'bg-indigo-100',
    },
    hrGroups.length > 0 && {
      key: 'hr' as const,
      label: 'HR Round',
      clusters: [],
      headerBg: 'bg-teal-50 border-teal-100 text-teal-900',
      leftBorder: 'border-l-teal-400',
      accentText: 'text-teal-700',
      accentBg: 'bg-teal-100',
    },
  ].filter(Boolean) as any;

  return (
    <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════════════════════
          HERO — Capability Score + Live / Downloads
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-900 rounded-2xl px-6 py-5 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-indigo-400 blur-3xl" />
        </div>
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/10">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold">Coverage</h2>
                {isInProgress && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    LIVE {liveWsConnected ? '· WS' : '· polling'}
                  </span>
                )}
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-200 text-[10px] font-bold rounded-full border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    COMPLETED
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-300 mt-1 max-w-lg">
                Unified view of skill depth, cluster scoring, and question-level performance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {capabilityScore != null && capabilityScore > 0 && (
              <div className="text-right">
                <div className="flex items-baseline gap-1 justify-end">
                  <span className="text-4xl font-bold tracking-tight">{Math.round(capabilityScore)}</span>
                  <span className="text-sm text-gray-400">/100</span>
                </div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Capability Score</p>
              </div>
            )}
            {isCompleted && (
              <div className="flex items-center gap-1.5">
                {(['pdf', 'excel', 'json'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleDownload(fmt)}
                    disabled={downloading}
                    title={`Download coverage report (${fmt.toUpperCase()})`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" />
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {capabilityScoreReasoning && (
          <div className="relative mt-4 pt-3 border-t border-white/10">
            <p className="text-[11px] text-gray-300 leading-relaxed">{capabilityScoreReasoning}</p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          KPI STRIP + STACKED PROGRESS
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'High',        count: counts.covered, dot: 'bg-emerald-500', text: 'text-emerald-700', sub: 'Strong demonstration' },
          { label: 'Medium',      count: counts.medium,  dot: 'bg-amber-400',   text: 'text-amber-700',   sub: 'Partial coverage' },
          { label: 'Low',         count: counts.low,     dot: 'bg-orange-400',  text: 'text-orange-700',  sub: 'Surface level only' },
          { label: 'Not Covered', count: counts.skipped, dot: 'bg-gray-300',    text: 'text-gray-500',    sub: 'Skill not addressed' },
        ].map(item => (
          <div key={item.label} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`} />
              <span className={`text-2xl font-bold ${item.text} leading-none`}>{item.count}</span>
            </div>
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{item.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
          </div>
        ))}
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-2xl font-bold text-indigo-700 leading-none">
              {clusterStats.touched}<span className="text-sm text-gray-400 font-normal">/{clusterStats.total || '—'}</span>
            </span>
          </div>
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Clusters</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Addressed / total</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-2xl font-bold text-emerald-700 leading-none">{coveredPct}%</span>
          </div>
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Medium+</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{touchedPct}% touched total</p>
        </div>
      </div>

      {/* Stacked progress bar */}
      <div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${counts.total > 0 ? (counts.covered / counts.total) * 100 : 0}%` }} />
          <div className="h-full bg-amber-400 transition-[width] duration-700" style={{ width: `${counts.total > 0 ? (counts.medium / counts.total) * 100 : 0}%` }} />
          <div className="h-full bg-orange-400 transition-[width] duration-700" style={{ width: `${counts.total > 0 ? (counts.low / counts.total) * 100 : 0}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
          <span>0 skills</span>
          <span className="font-medium text-gray-500">{counts.total} total</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CROSS-CLUSTER EVENTS (in-progress only)
          ═══════════════════════════════════════════════════════════════════ */}
      {isInProgress && crossClusterEvents.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800">Cross-Cluster Events Detected</span>
            <span className="ml-auto text-xs text-blue-600">{crossClusterEvents.length} event{crossClusterEvents.length > 1 ? 's' : ''}</span>
          </div>
          {crossClusterEvents.slice(-3).map((ev, i) => (
            <div key={i} className="bg-white rounded-lg px-3 py-2 border border-blue-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400">Q{ev.qNum}</span>
                {ev.clusters.map(cn => (
                  <span key={cn} className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{cn}</span>
                ))}
                <span className="text-[10px] text-gray-400 ml-auto">
                  {ev.skills.length} skill{ev.skills.length > 1 ? 's' : ''} newly covered
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SECTIONS — MTH / NTH / HR — each with clusters + skills + questions
          ═══════════════════════════════════════════════════════════════════ */}
      {SECTIONS.map(section => {
        const sec = sectionScores?.[section.key];
        const sectionScore = sec?.score ?? null;
        const sectionWeight = sec?.section_pct ?? null;

        // Section-level stats
        const tracking = roundTracking.find(r =>
          (section.key === 'mth' && r.type === 'must_have_skills') ||
          (section.key === 'nth' && r.type === 'nice_to_have_skills') ||
          (section.key === 'hr' && r.type === 'hr')
        );

        // Per-section question counts for stat strip
        let sectionSkillList: string[] = [];
        if (section.key === 'mth' || section.key === 'nth') {
          sectionSkillList = section.clusters.flatMap(c => c.skills);
        }
        const seenGroups = new Set<string>();
        const sectionGroups = section.key === 'hr'
          ? hrGroups
          : sectionSkillList.flatMap(s => getQuestionsForSkill(s)).filter(g => {
              const key = `${g.q_num}-${(g.skill || '').toLowerCase()}`;
              if (seenGroups.has(key)) return false;
              seenGroups.add(key);
              return true;
            });
        const totalQs = sectionGroups.length;
        const totalFu = sectionGroups.reduce((s, g) => s + (g.follow_ups?.length || 0), 0);
        const allocatedQs = tracking?.planned_questions ?? 0;
        const askedQs = Math.max(tracking?.actual_questions_asked ?? 0, totalQs);
        const allocatedMin = tracking?.budget_minutes ?? 0;
        const takenMin = tracking?.actual_duration_minutes ?? 0;

        return (
          <div key={section.key} className={`rounded-xl border overflow-hidden border-l-4 ${section.leftBorder}`}>
            {/* Section Header */}
            <div className={`px-5 py-3.5 border-b ${section.headerBg}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{section.label}</span>
                  {section.key !== 'hr' && (
                    <span className={`text-[10px] ${section.accentBg} ${section.accentText} rounded px-1.5 py-0.5`}>
                      {section.clusters.length} cluster{section.clusters.length !== 1 ? 's' : ''} · {sectionSkillList.length} skill{sectionSkillList.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {section.key === 'hr' && (
                    <span className={`text-[10px] ${section.accentBg} ${section.accentText} rounded px-1.5 py-0.5`}>
                      {hrGroups.length} question{hrGroups.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {sectionWeight != null && section.key !== 'hr' && (
                    <span className="text-xs text-gray-500">{sectionWeight}% of final score</span>
                  )}
                </div>
                {sectionScore != null && (() => {
                  const rounded = Math.round(sectionScore);
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">Section Score</span>
                      <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                        rounded >= 80 ? 'bg-emerald-100 text-emerald-700' :
                        rounded >= 50 ? 'bg-amber-100 text-amber-700' :
                        rounded > 0 ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {rounded}%
                      </span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-4 flex-wrap text-[11px]">
                {allocatedQs > 0 && (
                  <span className="flex items-center gap-1 text-gray-600">
                    <MessageSquare className="w-3 h-3" /> Allocated: {allocatedQs} Q{allocatedQs !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="flex items-center gap-1 text-gray-600">
                  <MessageSquare className="w-3 h-3" /> Asked: {askedQs} Q{askedQs !== 1 ? 's' : ''}
                </span>
                {totalFu > 0 && (
                  <span className="flex items-center gap-1 text-violet-600">
                    <MessageSquare className="w-3 h-3" /> {totalFu} follow-up{totalFu !== 1 ? 's' : ''}
                  </span>
                )}
                {allocatedMin > 0 && (
                  <span className="flex items-center gap-1 text-gray-600">
                    <Clock className="w-3 h-3" /> Budget: {fmtMin(allocatedMin)}
                  </span>
                )}
                {takenMin > 0 && (
                  <span className="flex items-center gap-1 text-gray-600">
                    <Clock className="w-3 h-3" /> Taken: {fmtMin(takenMin)}
                  </span>
                )}
              </div>
            </div>

            {/* Section Body */}
            {section.key === 'hr' ? (
              <div className="bg-white p-4">
                {hrGroups.length > 0 ? (
                  <QuestionTable groups={hrGroups} />
                ) : (
                  <div className="text-xs text-gray-400 italic px-2 py-4">No HR questions recorded.</div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 bg-white">
                {section.clusters.map((cluster, ci) => {
                  const cKey = `${section.key}-${ci}`;
                  const cOpen = !collapsedClusters.has(cKey);
                  const ci_ = ciByClusterName.get(cluster.name.toLowerCase());
                  const pLabel = priorityLabel(cluster.priority, ci_?.priority_label);

                  // Cluster coverage stats
                  const skillsCovered = cluster.skills.filter(s => {
                    const lv = resolveSkillLevel(s);
                    return lv === 'covered' || lv === 'medium' || lv === 'low';
                  });
                  const skillsStrong = cluster.skills.filter(s => {
                    const lv = resolveSkillLevel(s);
                    return lv === 'covered' || lv === 'medium';
                  });
                  const clusterPct = cluster.skills.length > 0
                    ? Math.round((skillsStrong.length / cluster.skills.length) * 100)
                    : 0;
                  const clusterBarColor =
                    clusterPct >= 70 ? 'bg-emerald-500' :
                    clusterPct >= 40 ? 'bg-amber-400' :
                    clusterPct > 0 ? 'bg-orange-400' : 'bg-gray-200';

                  const bandScore = ci_?.band_score ?? null;
                  const bandLabel = ci_?.band ?? null;

                  return (
                    <div key={cKey}>
                      {/* Cluster Header */}
                      <button
                        onClick={() => toggleCluster(cKey)}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        {cOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 truncate">{cluster.name}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] rounded border ${priorityStyle(cluster.priority, pLabel)}`}>
                              {pLabel} Priority
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {skillsCovered.length}/{cluster.skills.length} skills addressed
                            </span>
                            {bandLabel && bandLabel !== 'Not Covered' && (
                              <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${
                                bandLabel === 'High' ? 'bg-emerald-100 text-emerald-700' :
                                bandLabel === 'Medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                Band: {bandLabel}
                              </span>
                            )}
                          </div>
                          {/* Cluster progress bar */}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-[width] duration-700 ${clusterBarColor}`}
                                style={{ width: `${clusterPct}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-semibold ${
                              clusterPct >= 70 ? 'text-emerald-600' :
                              clusterPct >= 40 ? 'text-amber-600' :
                              clusterPct > 0 ? 'text-orange-500' : 'text-gray-400'
                            }`}>
                              {clusterPct}%
                            </span>
                          </div>
                        </div>
                        {bandScore != null && (
                          <div className="flex-shrink-0 text-right ml-2">
                            <div className="text-sm font-bold text-gray-900">{Math.round(bandScore)}</div>
                            <div className="text-[9px] text-gray-400 uppercase">/100</div>
                          </div>
                        )}
                      </button>

                      {/* Cluster Body — skills accordions */}
                      {cOpen && (
                        <div className="bg-gray-50/30 border-t border-gray-100 divide-y divide-gray-100">
                          {cluster.skills.length === 0 ? (
                            <div className="text-xs text-gray-400 italic px-8 py-3">No skills in this cluster.</div>
                          ) : (
                            cluster.skills.map(skill => {
                              const level = resolveSkillLevel(skill);
                              const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.not_started;
                              const groups = getQuestionsForSkill(skill);
                              const sk = skill.toLowerCase();
                              const trailKey = Object.keys(coverageTrail).find(k => k.toLowerCase() === sk);
                              const trail = trailKey ? coverageTrail[trailKey] : [];
                              const scoreKey = Object.keys(skillScoresMap).find(k => k.toLowerCase() === sk);
                              const skillScore = scoreKey ? skillScoresMap[scoreKey] : null;
                              const isExpanded = expandedSkills.has(skill);
                              const totalFollowUps = groups.reduce((s, g) => s + (g.follow_ups?.length || 0), 0);

                              // Find per-skill score from ClusterInsights if available
                              const ciSkill = ci_?.skill_scores.find(ss => ss.skill.toLowerCase() === sk);
                              const effectiveScore = skillScore ?? ciSkill?.score ?? null;

                              return (
                                <div key={skill}>
                                  <div
                                    className={`flex items-center gap-3 px-8 py-2.5 cursor-pointer hover:bg-white/70 transition-colors ${isExpanded ? cfg.bg : ''}`}
                                    onClick={() => toggleSkill(skill)}
                                  >
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                    <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">{skill}</span>
                                    {effectiveScore != null && (() => {
                                      const rounded = Math.round(effectiveScore);
                                      return (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                          rounded >= 8 ? 'bg-emerald-100 text-emerald-700' :
                                          rounded >= 5 ? 'bg-amber-100 text-amber-700' :
                                          rounded >= 2 ? 'bg-orange-100 text-orange-700' :
                                          rounded > 0 ? 'bg-orange-100 text-orange-700' :
                                          'bg-gray-100 text-gray-400'
                                        }`}>
                                          {rounded}{rounded <= 10 ? '/10' : ''}
                                        </span>
                                      );
                                    })()}
                                    <LevelBadge level={level} />
                                    {groups.length > 0 && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                                        <MessageSquare className="w-3 h-3" />
                                        {groups.length}
                                        {totalFollowUps > 0 && <span className="text-blue-500">+{totalFollowUps}</span>}
                                      </span>
                                    )}
                                  </div>

                                  {isExpanded && (
                                    <div className="bg-white border-t border-gray-100 px-8 py-3 space-y-3">
                                      {/* Coverage trail (progression) */}
                                      {trail.length > 0 && (
                                        <div>
                                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                            <Activity className="w-3 h-3" /> Coverage Progression
                                          </div>
                                          <CoverageTrail entries={trail} />
                                        </div>
                                      )}
                                      {/* Question table */}
                                      {groups.length > 0 ? (
                                        <div>
                                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3" /> Questions & Responses
                                          </div>
                                          <QuestionTable groups={groups} />
                                        </div>
                                      ) : trail.length === 0 ? (
                                        <div className="text-xs text-gray-400 italic py-3 text-center">
                                          No questions recorded for this skill
                                        </div>
                                      ) : null}
                                      {/* Skill note (from cluster insights) */}
                                      {ciSkill?.note && (
                                        <div className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
                                          <span className="font-semibold text-gray-700">Evaluator note: </span>
                                          {ciSkill.note}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                          {ci_?.cluster_note && (
                            <div className="text-[11px] text-gray-600 bg-gray-50 border-t border-gray-200 px-6 py-2.5">
                              <span className="font-semibold text-gray-700">Cluster note: </span>
                              {ci_.cluster_note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {section.clusters.length === 0 && (
                  <div className="text-xs text-gray-400 italic px-5 py-4">No clusters configured for this section.</div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ═══════════════════════════════════════════════════════════════════
          DETAILED SKILLS TABLE — moved from Evaluation Dashboard
          ═══════════════════════════════════════════════════════════════════ */}
      {isCompleted && (() => {
        const data = buildDashboardData({
          ai_evaluation: eval_,
          cluster_config: clusterConfig,
          candidate: { name: 'Candidate' },
          interview: {},
        });
        if (data.mustHaveClusters.length === 0 && data.niceToHaveClusters.length === 0) return null;
        return (
          <DetailedSkillsTable
            mustHaveClusters={data.mustHaveClusters}
            niceToHaveClusters={data.niceToHaveClusters}
          />
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          IN-PROGRESS FOOTER NOTE
          ═══════════════════════════════════════════════════════════════════ */}
      {isInProgress && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Coverage updates in real-time · Full evaluation insights available after the interview completes</span>
        </div>
      )}
    </div>
  );
}
