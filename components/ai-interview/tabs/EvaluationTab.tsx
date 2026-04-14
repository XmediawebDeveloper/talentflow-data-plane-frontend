'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Download, Award, Target, TrendingUp,
  CheckCircle2, AlertTriangle, XCircle, Info,
} from 'lucide-react';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

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

const LEVEL_DOT: Record<string, string> = {
  covered: 'bg-emerald-500',
  medium: 'bg-amber-400',
  low: 'bg-orange-400',
  skipped: 'bg-red-400',
  not_started: 'bg-gray-300',
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
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
        <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" className={ring} strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${size === 'lg' ? 'text-2xl' : 'text-sm'} font-bold ${color}`}>{Math.round(pct)}</span>
        {size === 'lg' && <span className="text-[10px] text-gray-400">/ 100</span>}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EvaluationTab({ sessionId, aiEvaluation: eval_, isCompleted }: Props) {
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const formula: ScoringFormula | null = eval_?.scoring_formula || null;
  const cards: SkillScoreCard[] = eval_?.skill_score_cards || [];
  const clusterInsights: any[] = eval_?.cluster_insights || [];
  const isV2 = eval_?.evaluation_version === 2;

  // ── Score resolution: v2 formula → v1 capability_score → v1 section_scores → evaluations average
  let overallScore = 0;
  if (formula?.overall_score) {
    overallScore = formula.overall_score;
  } else if (eval_?.capability_score) {
    const cap = Number(eval_.capability_score) || 0;
    overallScore = cap <= 10 ? cap * 10 : cap;
  } else if (eval_?.section_scores) {
    // Derive from v1 section_scores (keys: mth/nth/hr with {score, section_pct})
    const secs = eval_.section_scores;
    let total = 0, weightSum = 0;
    for (const [, s] of Object.entries(secs) as [string, any][]) {
      const sc = Number(s?.score) || 0;
      const pct = Number(s?.section_pct) || 0;
      if (pct > 0) {
        total += (sc <= 10 ? sc * 10 : sc) * pct / 100;
        weightSum += pct;
      }
    }
    overallScore = weightSum > 0 ? Math.round(total / weightSum * 100) / 100 * (100 / (weightSum > 0 ? 1 : 100)) : 0;
    // Simpler: just use weighted sum
    overallScore = Math.round(total * 10) / 10;
  } else if (eval_?.evaluations?.length) {
    // Last resort: average per-turn evaluator scores → 0-100
    const scores = (eval_.evaluations as any[])
      .map(e => Number(e?.evaluation?.overall) || 0)
      .filter(s => s > 0);
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      overallScore = Math.round(avg * 20); // 1-5 scale → 0-100
    }
  }

  // ── Recommendation resolution
  let recommendation = 'N/A';
  if (formula?.recommendation) {
    recommendation = formula.recommendation;
  } else if (eval_?.interview_summary?.hiring_recommendation) {
    const rec = eval_.interview_summary.hiring_recommendation;
    if (rec === 'strong_yes' || rec === 'yes') recommendation = overallScore >= 80 ? 'STRONG_YES' : 'YES';
    else if (rec === 'maybe') recommendation = 'MAYBE';
    else if (rec === 'no' || rec === 'strong_no') recommendation = 'NO';
  } else if (overallScore >= 80) recommendation = 'STRONG_YES';
  else if (overallScore >= 65) recommendation = 'YES';
  else if (overallScore >= 50) recommendation = 'MAYBE';
  else if (overallScore > 0) recommendation = 'NO';

  const bandStyle = BAND_STYLES[recommendation] || BAND_STYLES.NO;

  // Check if we have ANY evaluation data at all
  const hasAnyData = !!(
    formula || eval_?.capability_score || eval_?.section_scores ||
    eval_?.cluster_insights?.length || eval_?.evaluations?.length ||
    eval_?.skill_score_cards?.length
  );

  if (!isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Target className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Evaluation will be available after the interview completes.</p>
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Award className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Evaluation data not yet available.</p>
        <p className="text-xs mt-1">The AI evaluator may still be processing this interview.</p>
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
      const blob = await aiInterviewService.downloadReport(sessionId, 'evaluation', format);
      const ext = format === 'excel' ? 'xlsx' : format;
      aiInterviewService.triggerBlobDownload(blob, `Evaluation_Report.${ext}`);
    } catch { /* silent */ }
    setDownloading(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Download bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-400 mr-auto">
          {isV2 ? 'Formula-based scoring (v2)' : 'Legacy evaluation (v1)'}
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

      {/* ── Overall score hero ────────────────────────────────────── */}
      <div className={`${bandStyle.bg} ${bandStyle.border} border rounded-xl p-6`}>
        <div className="flex items-center gap-6">
          <ScoreGauge score={overallScore} size="lg" />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-gray-900">Overall Score</h2>
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

        {/* Recommendation bands legend */}
        {formula?.recommendation_band && (
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-200/50">
            {Object.entries(formula.recommendation_band).map(([band, threshold]) => {
              const s = BAND_STYLES[band] || BAND_STYLES.NO;
              const isActive = band === recommendation;
              return (
                <span key={band} className={`text-[10px] font-medium px-2 py-0.5 rounded ${isActive ? `${s.bg} ${s.text} ring-1 ring-current` : 'text-gray-400'}`}>
                  {band.replace(/_/g, ' ')} ({threshold})
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section breakdown cards ───────────────────────────────── */}
      {formula?.sections && formula.sections.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Section Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {formula.sections.map(section => {
              const pct = Math.min(100, section.score);
              const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div key={section.key} className="border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">{section.name}</h4>
                    <span className="text-[10px] text-gray-400 font-mono">x {section.weight}%</span>
                  </div>
                  <div className="flex items-end gap-2 mb-3">
                    <span className="text-2xl font-bold text-gray-900">{section.score.toFixed(1)}</span>
                    <span className="text-xs text-gray-400 mb-1">/ 100</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full ${barColor} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Contributes <span className="font-semibold text-gray-600">{section.contribution.toFixed(1)}</span> to overall
                  </div>
                  {/* Cluster breakdown within section */}
                  {section.clusters.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-100 space-y-1">
                      {section.clusters.map(cl => (
                        <div key={cl.name} className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-500 truncate flex-1">{cl.name}</span>
                          <span className="text-gray-700 font-medium ml-2">{cl.score.toFixed(1)}</span>
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

      {/* ── Per-skill score cards with formula ────────────────────── */}
      {cards.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-Skill Scores</h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">Skill</div>
              <div className="col-span-1 text-center">Priority</div>
              <div className="col-span-1 text-center">Level</div>
              <div className="col-span-1 text-center">Base</div>
              <div className="col-span-2 text-center">Modifiers</div>
              <div className="col-span-1 text-center">Final</div>
              <div className="col-span-1 text-center">%</div>
              <div className="col-span-1"></div>
            </div>
            {/* Skill rows */}
            {cards.map(card => {
              const isExpanded = expandedSkills.has(card.skill);
              const mods = card.modifiers;
              const modParts: string[] = [];
              if (mods.follow_up_bonus) modParts.push(`+${mods.follow_up_bonus} follow-up`);
              if (mods.depth_bonus) modParts.push(`+${mods.depth_bonus} depth`);
              if (mods.idk_penalty) modParts.push(`${mods.idk_penalty} IDK`);
              const modStr = modParts.length > 0 ? modParts.join(', ') : '-';

              const pctColor = card.final_pct >= 80 ? 'text-emerald-600' : card.final_pct >= 60 ? 'text-blue-600' : card.final_pct >= 40 ? 'text-amber-600' : 'text-red-600';

              return (
                <div key={card.skill}>
                  <div
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50/50 cursor-pointer border-b border-gray-100 transition-colors"
                    onClick={() => toggleSkill(card.skill)}
                  >
                    <div className="col-span-4 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${LEVEL_DOT[card.coverage_level] || LEVEL_DOT.not_started}`} />
                      <span className="text-sm font-medium text-gray-900 truncate">{card.skill}</span>
                      {card.cluster && <span className="text-[10px] text-gray-400 hidden lg:inline">({card.cluster})</span>}
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${card.priority === 'must_have' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                        {card.priority === 'must_have' ? 'MH' : 'NH'}
                      </span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className="text-xs text-gray-600 capitalize">{(card.coverage_level || 'N/A').replace(/_/g, ' ')}</span>
                    </div>
                    <div className="col-span-1 text-center text-sm text-gray-700 font-mono">{card.base_score.toFixed(1)}</div>
                    <div className="col-span-2 text-center text-[11px] text-gray-500">{modStr}</div>
                    <div className="col-span-1 text-center text-sm font-bold text-gray-900">{card.final_score.toFixed(1)}</div>
                    <div className={`col-span-1 text-center text-sm font-bold ${pctColor}`}>{card.final_pct}%</div>
                    <div className="col-span-1 text-right">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  {/* Expanded formula detail */}
                  {isExpanded && (
                    <div className="px-6 py-3 bg-indigo-50/40 border-b border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-xs font-semibold text-indigo-700">Score Formula</span>
                      </div>
                      <code className="text-xs text-indigo-600 font-mono bg-white/60 px-3 py-1.5 rounded border border-indigo-100 block">
                        {card.formula}
                      </code>
                      {card.questions.length > 0 && (
                        <div className="mt-2 text-[11px] text-gray-500">
                          Assessed in: {card.questions.map(q => `Q${q}`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── v1 Cluster Insights fallback (when no v2 skill_score_cards) ── */}
      {!isV2 && cards.length === 0 && clusterInsights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Skill Breakdown</h3>
          <div className="space-y-4">
            {clusterInsights.map((ci: any, idx: number) => {
              const bandScore = Number(ci.band_score) || 0;
              const displayScore = bandScore <= 10 ? Math.round(bandScore * 10) : Math.round(bandScore);
              const barColor = displayScore >= 70 ? 'bg-emerald-500' : displayScore >= 50 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">{ci.cluster_name || 'Skills'}</h4>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      ci.band === 'Strong' ? 'bg-emerald-100 text-emerald-700' :
                      ci.band === 'Proficient' ? 'bg-blue-100 text-blue-700' :
                      ci.band === 'Developing' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>{ci.band || 'N/A'}</span>
                  </div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-xl font-bold text-gray-900">{displayScore}</span>
                    <span className="text-xs text-gray-400 mb-0.5">/ 100</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${displayScore}%` }} />
                  </div>
                  {ci.skill_scores?.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                      {(ci.skill_scores as any[]).map((ss: any, si: number) => (
                        <div key={si} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 truncate flex-1">{ss.skill}</span>
                          <span className={`font-medium px-1.5 py-0.5 rounded text-[10px] ${
                            ss.band === 'Strong' ? 'bg-emerald-50 text-emerald-700' :
                            ss.band === 'Proficient' ? 'bg-blue-50 text-blue-700' :
                            ss.band === 'Developing' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>{ss.score ?? 'N/A'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ci.cluster_note && (
                    <p className="text-[11px] text-gray-500 mt-2 italic">{ci.cluster_note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── v1 Section Scores fallback (when no v2 formula) ────────── */}
      {!isV2 && !formula && eval_?.section_scores && Object.keys(eval_.section_scores).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Section Scores</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(eval_.section_scores).map(([key, s]: [string, any]) => {
              const sc = Number(s?.score) || 0;
              const displaySc = sc <= 10 ? Math.round(sc * 10) : Math.round(sc);
              const barColor = displaySc >= 70 ? 'bg-emerald-500' : displaySc >= 50 ? 'bg-amber-500' : 'bg-red-500';
              return (
                <div key={key} className="border border-gray-200 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">{s?.section_name || key}</h4>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-bold text-gray-900">{displaySc}</span>
                    <span className="text-xs text-gray-400">/ 100</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      s?.band === 'Strong' ? 'bg-emerald-50 text-emerald-700' :
                      s?.band === 'Proficient' ? 'bg-blue-50 text-blue-700' :
                      s?.band === 'Developing' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{s?.band || 'N/A'}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${displaySc}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Strengths & Weaknesses (shown for both v1 and v2) ────── */}
      {(eval_?.strengths?.length > 0 || eval_?.weaknesses?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {eval_.strengths?.length > 0 && (
            <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-sm font-semibold text-emerald-800">Strengths</h4>
              </div>
              <ul className="space-y-1.5">
                {eval_.strengths.map((s: string, i: number) => (
                  <li key={i} className="text-sm text-emerald-700 flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {eval_.weaknesses?.length > 0 && (
            <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h4 className="text-sm font-semibold text-red-800">Areas for Improvement</h4>
              </div>
              <ul className="space-y-1.5">
                {eval_.weaknesses.map((w: string, i: number) => (
                  <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Narrative insight / summary ───────────────────────────── */}
      {(eval_?.narrative_insight || eval_?.candidate_summary) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Summary</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {eval_.narrative_insight || eval_.candidate_summary}
          </p>
        </div>
      )}
    </div>
  );
}
