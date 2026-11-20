'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Download, Award, Target, TrendingUp,
  CheckCircle2, AlertTriangle, XCircle, Info,
} from 'lucide-react';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { useCanDownloadAIReports, AI_REPORT_DOWNLOAD_DENIED, isForbiddenError } from '../ResultRowActions';
import { toast } from 'sonner';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { clickableRowProps } from '@/lib/a11y/clickableProps';

// ── Types ────────────────────────────────────────────────────────────────────

interface SkillScoreCard {
  skill: string;
  cluster: string;
  priority: string;
  base_score: number;
  modifiers: {
    follow_up_bonus: number;
    depth_bonus: number;
    idk_penalty: number;
  };
  final_score: number;
  final_pct: number;
  formula: string;
  questions: number[];
  coverage_level: string;
}

interface ScoringSection {
  name: string;
  key: string;
  score: number;
  weight: number;
  contribution: number;
  clusters: { name: string; score: number; weight: number; priority: number }[];
}

interface ScoringFormula {
  sections: ScoringSection[];
  overall_score: number;
  recommendation: string;
  recommendation_band: Record<string, string>;
  formula_text: string;
}

interface Props {
  sessionId: string;
  aiEvaluation: Record<string, any>;
  isCompleted: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BAND_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  STRONG_YES: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  YES:        { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  MAYBE:      { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  NO:         { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
};

const SECTION_STYLES: Record<string, { borderColor: string; headerColor: string }> = {
  mth:  { borderColor: 'border-l-purple-400 bg-purple-50/30', headerColor: 'bg-purple-50 border-purple-100 text-purple-900' },
  nth:  { borderColor: 'border-l-indigo-400 bg-indigo-50/30', headerColor: 'bg-indigo-50 border-indigo-100 text-indigo-900' },
  hr:   { borderColor: 'border-l-teal-400 bg-teal-50/30',     headerColor: 'bg-teal-50 border-teal-100 text-teal-900' },
};

function ScoreGauge({ score, size = 'lg' }: { score: number; size?: 'lg' | 'sm' }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? 'text-emerald-600' : pct >= 65 ? 'text-blue-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';
  const ring = pct >= 80 ? 'stroke-emerald-500' : pct >= 65 ? 'stroke-blue-500' : pct >= 50 ? 'stroke-amber-500' : 'stroke-red-500';
  const dim = size === 'lg' ? 120 : 64;
  const sw = size === 'lg' ? 8 : 5;
  const r = (dim - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dim, height: dim }}>
      <svg width={dim} height={dim} className="-rotate-90">
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="var(--raw-e5e7eb)" strokeWidth={sw} />
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" className={ring} strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${size === 'lg' ? 'text-2xl' : 'text-sm'} font-bold ${color}`}>{Math.round(pct)}</span>
        {size === 'lg' && <span className="tf-micro-hint">/ 100</span>}
      </div>
    </div>
  );
}

function scoreColor(score: number, max: number = 10): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EvaluationTab({ sessionId, aiEvaluation: eval_, isCompleted }: Props) {
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const formula: ScoringFormula | null = eval_?.scoring_formula || null;
  const cards: SkillScoreCard[] = eval_?.skill_score_cards || [];
  const clusterInsights: any[] = eval_?.cluster_insights || [];
  const isV2 = eval_?.evaluation_version === 2;

  // ── Score resolution
  let overallScore = 0;
  if (formula?.overall_score) {
    overallScore = formula.overall_score;
  } else if (eval_?.capability_score) {
    const cap = Number(eval_.capability_score) || 0;
    overallScore = cap <= 10 ? cap * 10 : cap;
  } else if (eval_?.section_scores) {
    const secs = eval_.section_scores;
    let total = 0;
    for (const [, s] of Object.entries(secs) as [string, any][]) {
      const sc = Number(s?.score) || 0;
      const pct = Number(s?.section_pct) || 0;
      if (pct > 0) total += (sc <= 10 ? sc * 10 : sc) * pct / 100;
    }
    overallScore = Math.round(total * 10) / 10;
  } else if (eval_?.evaluations?.length) {
    const scores = (eval_.evaluations as any[]).map(e => Number(e?.evaluation?.overall) || 0).filter(s => s > 0);
    if (scores.length > 0) overallScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 20);
  }

  // ── Recommendation
  let recommendation = 'N/A';
  if (formula?.recommendation) recommendation = formula.recommendation;
  else if (overallScore >= 80) recommendation = 'STRONG_YES';
  else if (overallScore >= 65) recommendation = 'YES';
  else if (overallScore >= 50) recommendation = 'MAYBE';
  else if (overallScore > 0) recommendation = 'NO';
  const bandStyle = BAND_STYLES[recommendation] || BAND_STYLES.NO;

  const hasAnyData = !!(formula || eval_?.capability_score || eval_?.section_scores || eval_?.cluster_insights?.length || eval_?.evaluations?.length || eval_?.skill_score_cards?.length);

  if (!isCompleted) {
    return (<div className="flex flex-col items-center justify-center py-20 text-gray-500"><Target className="w-10 h-10 mb-3 opacity-40" /><p className="text-sm">Evaluation will be available after the interview completes.</p></div>);
  }
  if (!hasAnyData) {
    return (<div className="flex flex-col items-center justify-center py-20 text-gray-500"><Award className="w-10 h-10 mb-3 opacity-40" /><p className="text-sm">Evaluation data not yet available.</p><p className="text-xs mt-1">The AI evaluator may still be processing this interview.</p></div>);
  }

  const toggleCluster = (k: string) => setExpandedClusters(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleSkill = (k: string) => setExpandedSkills(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // ai_interview:download_report — the PDF / Excel / JSON buttons (greyed, never hidden).
  const canDownloadReports = useCanDownloadAIReports();
  const handleDownload = async (format: 'pdf' | 'excel' | 'json') => {
    if (!canDownloadReports) return;
    setDownloading(true);
    try {
      const blob = await aiInterviewService.downloadReport(sessionId, 'evaluation', format);
      const ext = format === 'excel' ? 'xlsx' : format;
      aiInterviewService.triggerBlobDownload(blob, `Evaluation_Report.${ext}`);
    } catch (err) {
      if (isForbiddenError(err)) toast.error(AI_REPORT_DOWNLOAD_DENIED);
    }
    setDownloading(false);
  };

  // For v1 interviews without skill_score_cards, synthesize cards from cluster_insights
  const effectiveCards: SkillScoreCard[] = cards.length > 0 ? cards : clusterInsights.flatMap((ci: any) =>
    (ci.skill_scores || []).map((s: any) => ({
      skill: s.skill || '',
      cluster: ci.cluster_name || '',
      priority: ci.category === 'nth' ? 'nice_to_have' : ci.category === 'hr' ? 'hr' : 'must_have',
      base_score: s.score != null ? (s.score <= 10 ? s.score : s.score / 10) : 0,
      modifiers: { follow_up_bonus: 0, depth_bonus: 0, idk_penalty: 0 },
      final_score: s.score != null ? (s.score <= 10 ? s.score : s.score / 10) : 0,
      final_pct: s.score != null ? (s.score <= 10 ? Math.round(s.score * 10) : Math.round(s.score)) : 0,
      formula: '',
      questions: [],
      coverage_level: s.band === 'High' || s.band === 'Strong' || s.band === 'Proficient' ? 'High' : s.band === 'Medium' || s.band === 'Developing' ? 'Medium' : s.band === 'Not Covered' || s.band === 'Not Evaluated' ? 'Not Covered' : 'Low',
    }))
  );

  // Build a map: cluster name → skill cards for that cluster.
  // Try exact, case-insensitive, and substring matching.
  const clusterSkillMap: Record<string, SkillScoreCard[]> = {};
  for (const c of effectiveCards) {
    const key = (c.cluster || '').trim().toLowerCase();
    if (key) {
      if (!clusterSkillMap[key]) clusterSkillMap[key] = [];
      clusterSkillMap[key].push(c);
    }
  }

  // Helper: find skills for a cluster name (fuzzy match)
  const getClusterSkills = (clusterName: string): SkillScoreCard[] => {
    const key = (clusterName || '').trim().toLowerCase();
    if (!key) return [];
    // Exact match
    if (clusterSkillMap[key]) return clusterSkillMap[key];
    // Substring match: cluster name contains skill cluster or vice versa
    for (const [k, v] of Object.entries(clusterSkillMap)) {
      if (k.includes(key) || key.includes(k)) return v;
    }
    return [];
  };

  // For sections without formula clusters, group skills by section key
  const sectionSkillMap: Record<string, SkillScoreCard[]> = {};
  for (const c of effectiveCards) {
    const sKey = c.priority === 'must_have' ? 'mth' : c.priority === 'nice_to_have' ? 'nth' : 'hr';
    if (!sectionSkillMap[sKey]) sectionSkillMap[sKey] = [];
    sectionSkillMap[sKey].push(c);
  }

  // ── Build unified sections for ALL interviews (v1 + v2) ──────────
  // v2: use formula.sections directly.
  // v1: build sections from section_scores + cluster_insights + cards.
  const buildSections = (): ScoringSection[] => {
    if (formula?.sections?.length) return formula.sections;

    // v1 fallback: construct sections from cluster_insights + section_scores
    const secScores: Record<string, any> = eval_?.section_scores || {};
    const SECTION_DEFS: Array<{ key: string; name: string; defaultWeight: number }> = [
      { key: 'mth', name: 'Must Have Skills', defaultWeight: 60 },
      { key: 'nth', name: 'Nice To Have Skills', defaultWeight: 30 },
      { key: 'hr', name: 'HR / Cultural', defaultWeight: 10 },
    ];
    const sections: ScoringSection[] = [];
    for (const def of SECTION_DEFS) {
      const ss = secScores[def.key];
      const score = ss ? (Number(ss.score) || 0) : 0;
      const weight = ss ? (Number(ss.section_pct) || def.defaultWeight) : def.defaultWeight;
      const displayScore = score <= 10 ? score * 10 : score;

      // Build clusters from cluster_insights for this category
      const catClusters = clusterInsights.filter((ci: any) => ci.category === def.key);
      const clusters = catClusters.map((ci: any) => ({
        name: ci.cluster_name || 'All Skills',
        score: ci.band_score != null ? (ci.band_score <= 10 ? ci.band_score : ci.band_score / 10) : 0,
        weight: ci.weight || 0,
        priority: ci.priority || 1,
        priority_label: ci.priority_label || (ci.priority >= 3 ? 'High' : ci.priority === 2 ? 'Medium' : 'Low'),
      }));

      // Only include section if it has data (skills, clusters, or score)
      const hasSkills = (sectionSkillMap[def.key] || []).length > 0;
      const hasClusters = clusters.length > 0;
      const hasScore = displayScore > 0;
      if (hasSkills || hasClusters || hasScore || ss) {
        sections.push({
          name: ss?.section_name || def.name,
          key: def.key,
          score: displayScore,
          weight,
          contribution: Math.round(displayScore * weight / 100 * 10) / 10,
          clusters,
        });
      }
    }
    return sections;
  };

  const sections = buildSections();

  return (
    <div className="space-y-6">
      {/* ── Download bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <span className="tf-hint mr-auto">
          {isV2 ? 'Formula-based scoring (v2)' : 'Legacy evaluation (v1)'}
        </span>
        {['pdf', 'excel', 'json'].map(fmt => (
          <button
            key={fmt}
            onClick={() => handleDownload(fmt as any)}
            disabled={downloading}
            aria-disabled={!canDownloadReports || undefined}
            title={canDownloadReports ? undefined : AI_REPORT_DOWNLOAD_DENIED}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors${canDownloadReports ? '' : ' opacity-50 cursor-not-allowed'}`}
          >
            <Download className="w-3.5 h-3.5" />
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Overall score hero ────────────────────────────────────── */}
      <div className={`${bandStyle.bg} ${bandStyle.border} border rounded-xl p-4 sm:p-6`}>
        <div className="flex items-center gap-6">
          <ScoreGauge score={overallScore} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="tf-section-title">Overall Score</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${bandStyle.bg} ${bandStyle.text} ${bandStyle.border} border`}>
                {recommendation.replace(/_/g, ' ')}
              </span>
            </div>
            {formula?.formula_text && (
              <div className="mt-2 px-3 py-2 bg-white/60 rounded-lg border border-white/80">
                <code className="text-xs text-indigo-600 font-mono">{formula.formula_text}</code>
              </div>
            )}
          </div>
        </div>

        {formula?.recommendation_band && (
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-200/50">
            {Object.entries(formula.recommendation_band).map(([band, threshold]) => {
              const s = BAND_STYLES[band] || BAND_STYLES.NO;
              const isActive = band === recommendation;
              return (
                <span key={band} className={`text-2xs font-medium px-2 py-0.5 rounded ${isActive ? `${s.bg} ${s.text} ring-1 ring-current` : 'text-gray-500'}`}>
                  {band.replace(/_/g, ' ')} ({threshold})
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section → Cluster → Skill hierarchy ──────────────────── */}
      {sections.length > 0 && (
        <div className="space-y-5">
          <h3 className="tf-row-title">Section Breakdown</h3>
          {sections.map(section => {
            const sStyle = SECTION_STYLES[section.key] || SECTION_STYLES.mth;
            const sectionCards = sectionSkillMap[section.key] || [];
            const pct = Math.min(100, section.score);
            const sColor = scoreColor(pct, 100);

            return (
              <div key={section.key} className={`rounded-xl border overflow-hidden border-l-4 ${sStyle.borderColor}`}>
                {/* Section header */}
                <div className={`px-5 py-4 border-b ${sStyle.headerColor}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold">{section.name}</h4>
                      <p className="text-2xs opacity-60 mt-0.5">
                        Weight: {section.weight}% of final score · Contributes {Math.round(section.contribution)} to overall
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold ${sColor}`}>{Math.round(section.score)}</span>
                        <span className="tf-hint">/ 100</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clusters inside section — fall back to flat skills if no cluster matches */}
                {section.clusters.length > 0 && section.clusters.some(cl => getClusterSkills(cl.name).length > 0) ? (
                  <div className="divide-y divide-gray-100 bg-white">
                    {section.clusters.map((cl, ci) => {
                      const cKey = `${section.key}-${ci}`;
                      const cOpen = expandedClusters.has(cKey);
                      const clSkills = getClusterSkills(cl.name);
                      const clScore010 = cl.score <= 10 ? cl.score : cl.score / 10;
                      const clPct = Math.min(100, cl.score <= 10 ? cl.score * 10 : cl.score);

                      return (
                        <div key={ci}>
                          <button
                            onClick={() => toggleCluster(cKey)}
                            className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="tf-row-title">{cl.name}</span>
                              <span className={`text-2xs px-1.5 py-0.5 rounded ${
                                (cl as any).priority_label === 'High' || cl.priority >= 3 ? 'bg-emerald-50 text-emerald-700' :
                                (cl as any).priority_label === 'Medium' || cl.priority === 2 ? 'bg-amber-50 text-amber-700' :
                                'bg-orange-50 text-orange-700'
                              }`}>
                                {(cl as any).priority_label || (cl.priority >= 3 ? 'High' : cl.priority === 2 ? 'Medium' : 'Low')} Priority · {cl.weight}% weight
                              </span>
                              <span className="tf-micro-hint">{clSkills.length} skill{clSkills.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-bold ${scoreColor(clPct, 100)}`}>{Math.round(clScore010)}<span className="text-2xs text-gray-500 font-normal">/10</span></span>
                              {cOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                            </div>
                          </button>

                          {/* Skills inside cluster */}
                          {cOpen && (
                            <div className="border-t border-gray-50 bg-gray-50/30">
                              {clSkills.length === 0 ? (
                                <div className="tf-hint italic px-6 py-3">No skill-level data available for this cluster.</div>
                              ) : (
                                <>
                                <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
                                  <table className="w-full text-xs">
                                    <thead className="bg-white tf-meta">
                                      <tr>
                                        <th className="tf-th-cell text-left font-semibold">Skill</th>
                                        <th className="tf-th-cell text-center font-semibold w-20">Base</th>
                                        <th className="tf-th-cell text-center font-semibold w-28">Modifiers</th>
                                        <th className="tf-th-cell text-center font-semibold w-20">Final</th>
                                        <th className="tf-th-cell text-center font-semibold w-16">%</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                      {clSkills.map(card => {
                                        const isExp = expandedSkills.has(card.skill);
                                        const mods = card.modifiers;
                                        const modParts: string[] = [];
                                        if (mods.follow_up_bonus) modParts.push(`+${mods.follow_up_bonus} follow-up`);
                                        if (mods.depth_bonus) modParts.push(`+${mods.depth_bonus} depth`);
                                        if (mods.idk_penalty) modParts.push(`${mods.idk_penalty} IDK`);
                                        const modStr = modParts.length > 0 ? modParts.join(', ') : '—';
                                        const pctColor = card.final_pct >= 80 ? 'text-emerald-600' : card.final_pct >= 60 ? 'text-blue-600' : card.final_pct >= 40 ? 'text-amber-600' : 'text-red-600';

                                        return (
                                          <tr {...clickableRowProps} key={card.skill} className="cursor-pointer hover:bg-gray-50/50" onClick={() => toggleSkill(card.skill)}>
                                            <td className="tf-td align-top">
                                              <div className="flex items-center gap-2">
                                                <span className="tf-row-name">{card.skill}</span>
                                                <span className="tf-micro-hint capitalize">{(card.coverage_level || '').replace(/_/g, ' ')}</span>
                                              </div>
                                              {isExp && card.formula && (
                                                <div className="mt-1.5 px-2 py-1 bg-indigo-50/60 rounded text-2xs font-mono text-indigo-600 border border-indigo-100">
                                                  {card.formula}
                                                </div>
                                              )}
                                            </td>
                                            <td className="tf-td text-center font-mono text-gray-700">{Math.round(card.base_score)}</td>
                                            <td className="tf-td text-center text-gray-500">{modStr}</td>
                                            <td className="tf-td text-center font-bold text-gray-900">{Math.round(card.final_score)}</td>
                                            <td className={`px-3 py-2.5 text-center font-bold ${pctColor}`}>{card.final_pct}%</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <MobileRecordList className="p-3">
                                  {clSkills.map(card => {
                                    const isExp = expandedSkills.has(card.skill);
                                    const mods = card.modifiers;
                                    const modParts: string[] = [];
                                    if (mods.follow_up_bonus) modParts.push(`+${mods.follow_up_bonus} follow-up`);
                                    if (mods.depth_bonus) modParts.push(`+${mods.depth_bonus} depth`);
                                    if (mods.idk_penalty) modParts.push(`${mods.idk_penalty} IDK`);
                                    const modStr = modParts.length > 0 ? modParts.join(', ') : '—';
                                    const pctColor = card.final_pct >= 80 ? 'text-emerald-600' : card.final_pct >= 60 ? 'text-blue-600' : card.final_pct >= 40 ? 'text-amber-600' : 'text-red-600';
                                    return (
                                      <MobileRecordCard
                                        key={card.skill}
                                        badges={card.coverage_level ? <span className="tf-micro-hint capitalize">{card.coverage_level.replace(/_/g, ' ')}</span> : undefined}
                                        title={card.skill}
                                        footer={<span className={`font-bold ${pctColor}`}>{card.final_pct}%</span>}
                                        fields={[
                                          { label: 'Base', value: <span className="font-mono text-gray-700">{Math.round(card.base_score)}</span> },
                                          { label: 'Modifiers', value: modStr },
                                          { label: 'Final', value: <span className="font-bold text-gray-900">{Math.round(card.final_score)}</span> },
                                        ]}
                                        onClick={() => toggleSkill(card.skill)}
                                      >
                                        {isExp && card.formula && (
                                          <div className="mt-2.5 px-2 py-1 bg-indigo-50/60 rounded text-2xs font-mono text-indigo-600 border border-indigo-100">
                                            {card.formula}
                                          </div>
                                        )}
                                      </MobileRecordCard>
                                    );
                                  })}
                                </MobileRecordList>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* No clusters — show skills directly under section */
                  <div className="bg-white">
                    {sectionCards.length === 0 ? (
                      <div className="tf-hint italic px-5 py-4">No skill data available for this section.</div>
                    ) : (
                      <>
                      <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
                        <table className="w-full text-xs">
                          <thead className="bg-white tf-meta">
                            <tr>
                              <th className="tf-th-cell text-left font-semibold">Skill</th>
                              <th className="tf-th-cell text-center font-semibold w-20">Base</th>
                              <th className="tf-th-cell text-center font-semibold w-28">Modifiers</th>
                              <th className="tf-th-cell text-center font-semibold w-20">Final</th>
                              <th className="tf-th-cell text-center font-semibold w-16">%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {sectionCards.map(card => {
                              const isExp = expandedSkills.has(card.skill);
                              const mods = card.modifiers;
                              const modParts: string[] = [];
                              if (mods.follow_up_bonus) modParts.push(`+${mods.follow_up_bonus} follow-up`);
                              if (mods.depth_bonus) modParts.push(`+${mods.depth_bonus} depth`);
                              if (mods.idk_penalty) modParts.push(`${mods.idk_penalty} IDK`);
                              const modStr = modParts.length > 0 ? modParts.join(', ') : '—';
                              const pctColor = card.final_pct >= 80 ? 'text-emerald-600' : card.final_pct >= 60 ? 'text-blue-600' : card.final_pct >= 40 ? 'text-amber-600' : 'text-red-600';

                              return (
                                <tr {...clickableRowProps} key={card.skill} className="cursor-pointer hover:bg-gray-50/50" onClick={() => toggleSkill(card.skill)}>
                                  <td className="tf-td align-top">
                                    <div className="flex items-center gap-2">
                                      <span className="tf-row-name">{card.skill}</span>
                                      <span className="tf-micro-hint capitalize">{(card.coverage_level || '').replace(/_/g, ' ')}</span>
                                    </div>
                                    {isExp && card.formula && (
                                      <div className="mt-1.5 px-2 py-1 bg-indigo-50/60 rounded text-2xs font-mono text-indigo-600 border border-indigo-100">
                                        {card.formula}
                                      </div>
                                    )}
                                  </td>
                                  <td className="tf-td text-center font-mono text-gray-700">{Math.round(card.base_score)}</td>
                                  <td className="tf-td text-center text-gray-500">{modStr}</td>
                                  <td className="tf-td text-center font-bold text-gray-900">{Math.round(card.final_score)}</td>
                                  <td className={`px-3 py-2.5 text-center font-bold ${pctColor}`}>{card.final_pct}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <MobileRecordList className="p-3">
                        {sectionCards.map(card => {
                          const isExp = expandedSkills.has(card.skill);
                          const mods = card.modifiers;
                          const modParts: string[] = [];
                          if (mods.follow_up_bonus) modParts.push(`+${mods.follow_up_bonus} follow-up`);
                          if (mods.depth_bonus) modParts.push(`+${mods.depth_bonus} depth`);
                          if (mods.idk_penalty) modParts.push(`${mods.idk_penalty} IDK`);
                          const modStr = modParts.length > 0 ? modParts.join(', ') : '—';
                          const pctColor = card.final_pct >= 80 ? 'text-emerald-600' : card.final_pct >= 60 ? 'text-blue-600' : card.final_pct >= 40 ? 'text-amber-600' : 'text-red-600';
                          return (
                            <MobileRecordCard
                              key={card.skill}
                              badges={card.coverage_level ? <span className="tf-micro-hint capitalize">{card.coverage_level.replace(/_/g, ' ')}</span> : undefined}
                              title={card.skill}
                              footer={<span className={`font-bold ${pctColor}`}>{card.final_pct}%</span>}
                              fields={[
                                { label: 'Base', value: <span className="font-mono text-gray-700">{Math.round(card.base_score)}</span> },
                                { label: 'Modifiers', value: modStr },
                                { label: 'Final', value: <span className="font-bold text-gray-900">{Math.round(card.final_score)}</span> },
                              ]}
                              onClick={() => toggleSkill(card.skill)}
                            >
                              {isExp && card.formula && (
                                <div className="mt-2.5 px-2 py-1 bg-indigo-50/60 rounded text-2xs font-mono text-indigo-600 border border-indigo-100">
                                  {card.formula}
                                </div>
                              )}
                            </MobileRecordCard>
                          );
                        })}
                      </MobileRecordList>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── v1 Cluster Insights fallback (when sections couldn't be built) ── */}
      {sections.length === 0 && clusterInsights.length > 0 && (
        <div>
          <h3 className="tf-row-title mb-3">Skill Breakdown</h3>
          <div className="space-y-4">
            {clusterInsights.map((ci: any, idx: number) => {
              const bandScore = Number(ci.band_score) || 0;
              const displayScore = bandScore <= 10 ? Math.round(bandScore * 10) : Math.round(bandScore);
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="tf-row-title">{ci.cluster_name || 'Skills'}</h4>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      (ci.band === 'High' || ci.band === 'Strong') ? 'bg-emerald-100 text-emerald-700' :
                      (ci.band === 'Medium' || ci.band === 'Proficient' || ci.band === 'Developing') ? 'bg-amber-100 text-amber-700' :
                      (ci.band === 'Low') ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>{ci.band || 'N/A'}</span>
                  </div>
                  <div className="flex items-end gap-2 mb-3">
                    <span className="text-xl font-bold text-gray-900">{displayScore}</span>
                    <span className="tf-hint mb-0.5">/ 100</span>
                  </div>
                  {ci.skill_scores?.length > 0 && (
                    <div className="space-y-1.5 mt-2 pt-2 border-t border-gray-100">
                      {ci.skill_scores.map((s: any, si: number) => (
                        <div key={si} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{s.skill}</span>
                          <span className={`font-bold ${scoreColor(s.score ?? 0, 100)}`}>
                            {s.score != null ? `${s.score}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
