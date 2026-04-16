'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, TrendingUp, Calculator,
  LayoutGrid, List, Table2, AlertCircle, Info,
} from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  name: string;
  score: number;
  level: 'High' | 'Medium' | 'Low' | 'Not Covered';
  feedback: string;
}

interface Cluster {
  name: string;
  clusterNumber: number;
  priority: 'High' | 'Medium' | 'Low';
  weight: number;
  skills: Skill[];
  clusterScore: number;
}

interface Props {
  sessionId: string;
  aiEvaluation: Record<string, any>;
  isCompleted: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function bandToLevel(band: string | undefined): 'High' | 'Medium' | 'Low' | 'Not Covered' {
  if (!band) return 'Not Covered';
  const b = band.toLowerCase();
  if (b === 'strong' || b === 'proficient' || b === 'high') return 'High';
  if (b === 'developing' || b === 'medium') return 'Medium';
  if (b === 'weak' || b === 'low') return 'Low';
  return 'Not Covered';
}

function priorityFromNumber(p: number): 'High' | 'Medium' | 'Low' {
  if (p >= 3) return 'High';
  if (p >= 2) return 'Medium';
  return 'Low';
}

function getLevelColor(level: 'High' | 'Medium' | 'Low' | 'Not Covered') {
  switch (level) {
    case 'High':
      return { bg: '#d1fae5', text: '#10b981', border: '#10b981' };
    case 'Medium':
      return { bg: '#fef3c7', text: '#f59e0b', border: '#f59e0b' };
    case 'Low':
      return { bg: '#fee2e2', text: '#f87171', border: '#f87171' };
    case 'Not Covered':
      return { bg: '#f3f4f6', text: '#9ca3af', border: '#9ca3af' };
  }
}

function scoreToLevel(score: number | null): 'High' | 'Medium' | 'Low' | 'Not Covered' {
  if (score === null || score === undefined) return 'Not Covered';
  if (score >= 80) return 'High';
  if (score >= 50) return 'Medium';
  if (score > 0) return 'Low';
  return 'Not Covered';
}

// ── Data extraction from ai_evaluation ──────────────────────────────────────

function extractData(eval_: Record<string, any>) {
  const clusterInsights: any[] = eval_?.cluster_insights || [];
  const sectionScores: Record<string, any> = eval_?.section_scores || {};
  const capScore = eval_?.capability_score ?? 0;
  const performanceNote = eval_?.performance_note || '';
  const scoringFormula = eval_?.scoring_formula;

  // Resolve final score
  let finalScore = 0;
  if (scoringFormula?.overall_score != null) {
    finalScore = scoringFormula.overall_score;
  } else if (capScore) {
    finalScore = capScore <= 10 ? capScore * 10 : capScore;
  }

  // Section scores (0-10 scale)
  const mthRaw = sectionScores?.mth?.score;
  const nthRaw = sectionScores?.nth?.score;
  const hrRaw = sectionScores?.hr?.score;
  const mthScore = mthRaw != null ? (mthRaw > 10 ? mthRaw / 10 : mthRaw) : 0;
  const nthScore = nthRaw != null ? (nthRaw > 10 ? nthRaw / 10 : nthRaw) : 0;
  const hrScore = hrRaw != null ? (hrRaw > 10 ? hrRaw / 10 : hrRaw) : 0;

  // Section weights (percentages) — prefer scoring_formula weights (v2),
  // fall back to section_scores.section_pct (v1), then defaults.
  const formulaSections = scoringFormula?.sections || [];
  const fmMth = formulaSections.find((s: any) => s.key === 'mth');
  const fmNth = formulaSections.find((s: any) => s.key === 'nth');
  const fmHr = formulaSections.find((s: any) => s.key === 'hr');
  const mthPct = fmMth?.weight ?? sectionScores?.mth?.section_pct ?? 70;
  const nthPct = fmNth?.weight ?? sectionScores?.nth?.section_pct ?? 20;
  const hrPct = fmHr?.weight ?? sectionScores?.hr?.section_pct ?? 10;

  // Build clusters from cluster_insights — this has full skill-level detail
  // in BOTH v1 and v2 formats. scoring_formula only has cluster-level
  // aggregates (no skill_scores), so always prefer cluster_insights.
  let mustHaveClusters: Cluster[] = [];
  let niceToHaveClusters: Cluster[] = [];
  let mthClusterNum = 0;
  let nthClusterNum = 0;

  if (clusterInsights.length) {
    for (const ci of clusterInsights) {
      const cat = ci.category || 'mth';
      if (cat === 'hr') continue;
      const rawScore = ci.band_score;
      const clusterScore = rawScore != null ? (rawScore > 10 ? rawScore / 10 : rawScore) : 0;
      const skills: Skill[] = (ci.skill_scores || []).map((s: any) => ({
        name: s.skill || s.name || '',
        score: s.score != null ? (s.score > 10 ? s.score / 10 : s.score) : 0,
        level: s.band ? bandToLevel(s.band) : scoreToLevel(s.score),
        feedback: s.note || s.feedback || '',
      }));
      const cluster: Cluster = {
        name: ci.cluster_name || '',
        clusterNumber: cat === 'mth' ? ++mthClusterNum : ++nthClusterNum,
        priority: (ci.priority_label as 'High' | 'Medium' | 'Low') || priorityFromNumber(ci.priority ?? 3),
        weight: Math.round(ci.weight ?? 0),
        skills,
        clusterScore,
      };
      if (cat === 'mth') mustHaveClusters.push(cluster);
      else if (cat === 'nth') niceToHaveClusters.push(cluster);
    }
  }

  // Fallback: if cluster_insights was empty but scoring_formula has clusters,
  // build from scoring_formula (cluster-level only, no individual skill detail)
  if (!mustHaveClusters.length && !niceToHaveClusters.length && scoringFormula?.sections?.length) {
    for (const section of scoringFormula.sections) {
      const cat = section.key;
      if (cat === 'hr') continue;
      for (const c of (section.clusters || [])) {
        const rawScore = c.score ?? 0;
        const cluster: Cluster = {
          name: c.name || c.cluster_name || '',
          clusterNumber: cat === 'mth' ? ++mthClusterNum : ++nthClusterNum,
          priority: priorityFromNumber(c.priority ?? 3),
          weight: Math.round(c.weight ?? 0),
          skills: [],
          clusterScore: rawScore > 10 ? rawScore / 10 : rawScore,
        };
        if (cat === 'mth') mustHaveClusters.push(cluster);
        else if (cat === 'nth') niceToHaveClusters.push(cluster);
      }
    }
  }

  // Last fallback: if still no clusters, build flat list from skill_coverage_map
  if (!mustHaveClusters.length && !niceToHaveClusters.length) {
    const coverageMap: Record<string, string> = eval_?.skill_coverage_map || {};
    const priorityMap: Record<string, string> = eval_?.skill_priority_map || {};
    const mthSkills: Skill[] = [];
    const nthSkills: Skill[] = [];
    for (const [skillName, level] of Object.entries(coverageMap)) {
      const isMth = priorityMap[skillName] !== 'nice_to_have';
      const lvl = level === 'covered' ? 'High' : level === 'medium' ? 'Medium' : level === 'low' ? 'Low' : 'Not Covered' as const;
      const scoreVal = level === 'covered' ? 8.5 : level === 'medium' ? 6.0 : level === 'low' ? 3.0 : 0;
      const s: Skill = { name: skillName, score: scoreVal, level: lvl, feedback: '' };
      if (isMth) mthSkills.push(s);
      else nthSkills.push(s);
    }
    if (mthSkills.length) {
      const avg = mthSkills.reduce((a, s) => a + s.score, 0) / mthSkills.length;
      mustHaveClusters.push({ name: 'Must-Have Skills', clusterNumber: 1, priority: 'High', weight: 100, skills: mthSkills, clusterScore: avg });
    }
    if (nthSkills.length) {
      const avg = nthSkills.reduce((a, s) => a + s.score, 0) / nthSkills.length;
      niceToHaveClusters.push({ name: 'Nice-to-Have Skills', clusterNumber: 1, priority: 'Medium', weight: 100, skills: nthSkills, clusterScore: avg });
    }
  }

  return {
    finalScore,
    mthScore,
    nthScore,
    hrScore,
    mthPct,
    nthPct,
    hrPct,
    mustHaveClusters,
    niceToHaveClusters,
    performanceNote,
    scoringFormula,
  };
}

// ── Sub-Components ───────────────────────────────────────────────────────────

/* Circular Progress */
function CircularProgress({ value, max, size = 200, strokeWidth = 14 }: {
  value: number; max: number; size?: number; strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clamped = Math.min(Math.max(value, 0), max);
  const offset = circumference - (clamped / max) * circumference;
  const percentage = (clamped / max) * 100;
  const gradId = `evalDashGrad_${size}`;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke={`url(#${gradId})`} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-5xl font-semibold tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {clamped.toFixed(1)}
        </div>
        <div className="text-sm text-gray-500 mt-1">out of {max}</div>
        <div className="text-xs text-gray-400 mt-0.5 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
          {percentage.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

/* Overall Summary Card */
function OverallSummary({ finalScore, mthScore, nthScore, hrScore, mthPct, nthPct, hrPct, performanceNote }: {
  finalScore: number; mthScore: number; nthScore: number; hrScore: number;
  mthPct: number; nthPct: number; hrPct: number; performanceNote: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1">Evaluation Summary</h2>
          <p className="text-gray-500 mb-8 text-sm">Comprehensive assessment of candidate performance</p>

          <div className="grid grid-cols-3 gap-6 mb-8">
            {/* Must-Have */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200">
              <div className="text-xs text-emerald-700 uppercase tracking-wider mb-2 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>
                Must-Have Skills
              </div>
              <div className="text-3xl font-semibold text-emerald-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {mthScore.toFixed(2)}
              </div>
              <div className="text-xs text-emerald-600 mt-1">out of 10.00 &middot; {mthPct}% weight</div>
            </div>
            {/* Nice-to-Have */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
              <div className="text-xs text-amber-700 uppercase tracking-wider mb-2 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>
                Nice-to-Have Skills
              </div>
              <div className="text-3xl font-semibold text-amber-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {nthScore.toFixed(2)}
              </div>
              <div className="text-xs text-amber-600 mt-1">out of 10.00 &middot; {nthPct}% weight</div>
            </div>
            {/* HR */}
            <div className="p-5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
              <div className="text-xs text-blue-700 uppercase tracking-wider mb-2 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>
                HR Assessment
              </div>
              <div className="text-3xl font-semibold text-blue-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {hrScore.toFixed(2)}
              </div>
              <div className="text-xs text-blue-600 mt-1">out of 10.00 &middot; {hrPct}% weight</div>
            </div>
          </div>

          {performanceNote && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={18} className="text-white" />
              </div>
              <p className="text-sm text-emerald-800">{performanceNote}</p>
            </div>
          )}
        </div>

        <div className="ml-12 flex flex-col items-center flex-shrink-0">
          <CircularProgress value={finalScore} max={100} size={210} strokeWidth={14} />
          <p className="text-xs text-gray-400 mt-3 text-center max-w-[210px]">
            Weighted average across all evaluation criteria
          </p>
        </div>
      </div>
    </div>
  );
}

/* Skill Cluster Card */
function SkillClusterCard({ cluster, expanded, onToggle }: {
  cluster: Cluster; expanded: boolean; onToggle: () => void;
}) {
  const priColor = getLevelColor(cluster.priority);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-center justify-between hover:bg-gray-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-5">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-semibold flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${priColor.border} 0%, ${priColor.text} 100%)`,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {cluster.clusterNumber}
          </div>
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">{cluster.name}</h3>
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium"
                style={{
                  background: priColor.bg,
                  color: priColor.text,
                  border: `1px solid ${priColor.border}`,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {cluster.priority} Priority
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Weight: <span className="tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{cluster.weight}%</span> &middot; {cluster.skills.length} skills evaluated
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">Cluster Score</div>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: priColor.border, fontFamily: 'ui-monospace, monospace' }}>
              {cluster.clusterScore.toFixed(2)}
            </div>
          </div>
          <div className="w-28 h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.min((cluster.clusterScore / 10) * 100, 100)}%`,
                background: `linear-gradient(90deg, ${priColor.border} 0%, ${priColor.text} 100%)`,
              }}
            />
          </div>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-2.5">
          {cluster.skills.map((skill, idx) => {
            const lvlC = getLevelColor(skill.level);
            return (
              <div key={idx} className="p-4 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{
                        background: lvlC.bg,
                        color: lvlC.text,
                        border: `1px solid ${lvlC.border}`,
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      {skill.score.toFixed(1)}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{skill.name}</h4>
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium"
                        style={{ color: lvlC.text, fontFamily: 'ui-monospace, monospace' }}
                      >
                        {skill.level === 'Not Covered' ? 'Not Covered' : `${skill.level} Proficiency`}
                      </span>
                    </div>
                  </div>
                  <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min((skill.score / 10) * 100, 100)}%`,
                      background: lvlC.border,
                    }} />
                  </div>
                </div>
                {skill.feedback && (
                  <div className="flex items-start gap-2 mt-2 text-xs text-gray-500">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" style={{ color: lvlC.text }} />
                    <p>{skill.feedback}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Radar Chart */
function SkillRadar({ mustHaveClusters, niceToHaveClusters }: {
  mustHaveClusters: Cluster[]; niceToHaveClusters: Cluster[];
}) {
  const allClusters = [...mustHaveClusters, ...niceToHaveClusters];
  if (allClusters.length === 0) return null;

  const data = allClusters.map(c => ({
    cluster: c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name,
    score: c.clusterScore,
    fullName: c.name,
  }));

  const allSkills = allClusters.flatMap(c => c.skills);
  const highCount = allSkills.filter(s => s.level === 'High').length;
  const medCount = allSkills.filter(s => s.level === 'Medium').length;
  const lowCount = allSkills.filter(s => s.level === 'Low' || s.level === 'Not Covered').length;

  return (
    <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Skill Coverage Analysis</h2>
      <p className="text-gray-500 text-sm mb-6">Visual breakdown of performance across all skill clusters</p>

      <ResponsiveContainer width="100%" height={340}>
        <RadarChart data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="cluster" tick={{ fill: '#374151', fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
          <Radar name="Performance" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2} />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              fontSize: 12,
            }}
            formatter={(val: number) => [val.toFixed(2), 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="p-3.5 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100/30 border border-emerald-200">
          <div className="text-[10px] text-emerald-700 uppercase tracking-wider mb-1 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>High Level Skills</div>
          <div className="text-2xl font-semibold text-emerald-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{highCount}</div>
        </div>
        <div className="p-3.5 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100/30 border border-amber-200">
          <div className="text-[10px] text-amber-700 uppercase tracking-wider mb-1 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>Medium Level Skills</div>
          <div className="text-2xl font-semibold text-amber-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{medCount}</div>
        </div>
        <div className="p-3.5 rounded-lg bg-gradient-to-br from-red-50 to-red-100/30 border border-red-200">
          <div className="text-[10px] text-red-700 uppercase tracking-wider mb-1 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>Low / Not Covered</div>
          <div className="text-2xl font-semibold text-red-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{lowCount}</div>
        </div>
      </div>
    </div>
  );
}

/* Evaluation Breakdown */
function EvalBreakdown({ mthScore, nthScore, hrScore, finalScore, mthPct, nthPct, hrPct }: {
  mthScore: number; nthScore: number; hrScore: number; finalScore: number;
  mthPct: number; nthPct: number; hrPct: number;
}) {
  const mthW = mthPct / 100;
  const nthW = nthPct / 100;
  const hrW = hrPct / 100;
  const mthContrib = mthScore * mthW;
  const nthContrib = nthScore * nthW;
  const hrContrib = hrScore * hrW;

  return (
    <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
          <Calculator size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Evaluation Breakdown</h2>
          <p className="text-sm text-gray-500">Scoring methodology and calculations</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Step 1 */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center text-[10px]">1</span>
            Skill Scoring (0–10 Scale)
          </h3>
          <p className="text-xs text-gray-500 pl-7">
            Each skill is scored 0–10 by the AI evaluator based on candidate responses.
          </p>
        </div>

        {/* Step 2 */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center text-[10px]">2</span>
            Cluster Averaging
          </h3>
          <p className="text-xs text-gray-500 pl-7 mb-2">
            Skills within each cluster are averaged. Higher-priority clusters get more weight.
          </p>
          <div className="pl-7 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <code className="text-[11px] text-gray-700" style={{ fontFamily: 'ui-monospace, monospace' }}>
              Cluster Score = Σ(Skill Scores) ÷ Number of Skills
            </code>
          </div>
        </div>

        {/* Step 3 */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center text-[10px]">3</span>
            Section Weight Distribution
          </h3>
          <div className="pl-7 grid grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] text-emerald-700 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>MUST-HAVE</div>
              <div className="text-lg font-semibold text-emerald-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{mthPct}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-[10px] text-amber-700 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>NICE-TO-HAVE</div>
              <div className="text-lg font-semibold text-amber-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{nthPct}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-[10px] text-blue-700 font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>HR ASSESSMENT</div>
              <div className="text-lg font-semibold text-blue-900 tabular-nums" style={{ fontFamily: 'ui-monospace, monospace' }}>{hrPct}%</div>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center text-[10px]">4</span>
            Final Calculation
          </h3>
          <div className="pl-7 space-y-2.5">
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <div className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>Formula</div>
              <code className="text-xs text-gray-800 block" style={{ fontFamily: 'ui-monospace, monospace' }}>
                Final Score = (Must-Have × {mthPct}%) + (Nice-to-Have × {nthPct}%) + (HR × {hrPct}%)
              </code>
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
              <div className="text-[10px] text-emerald-700 mb-2 uppercase tracking-wider font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>Actual Calculation</div>
              <div className="space-y-1.5 text-xs" style={{ fontFamily: 'ui-monospace, monospace' }}>
                <div className="flex justify-between text-emerald-900">
                  <span>({mthScore.toFixed(2)} × {(mthPct / 100).toFixed(2)})</span>
                  <span>= {mthContrib.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-900">
                  <span>({nthScore.toFixed(2)} × {(nthPct / 100).toFixed(2)})</span>
                  <span>= {nthContrib.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-900">
                  <span>({hrScore.toFixed(2)} × {(hrPct / 100).toFixed(2)})</span>
                  <span>= {hrContrib.toFixed(2)}</span>
                </div>
                <div className="border-t border-emerald-300 pt-1.5 mt-1.5" />
                <div className="flex justify-between text-emerald-900 font-semibold">
                  <span>Total (× 10)</span>
                  <span className="text-base">= {finalScore.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 p-3.5 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2.5">
        <Info size={15} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-800">
          This weighted scoring approach ensures that critical skills have the most impact on the final evaluation, while still considering additional competencies and cultural fit.
        </p>
      </div>
    </div>
  );
}

/* Detailed Skills Table */
function DetailedTable({ mustHaveClusters, niceToHaveClusters }: {
  mustHaveClusters: Cluster[]; niceToHaveClusters: Cluster[];
}) {
  const allSkills = [...mustHaveClusters, ...niceToHaveClusters].flatMap(cluster =>
    cluster.skills.map(s => ({ ...s, clusterName: cluster.name, clusterPriority: cluster.priority }))
  );

  if (allSkills.length === 0) return <p className="text-center text-gray-400 py-12">No skill data available.</p>;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
          <Table2 size={18} className="text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Detailed Skills Table</h2>
          <p className="text-sm text-gray-500">Comprehensive view of all evaluated skills</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Skill Name', 'Cluster', 'Score', 'Level', 'AI Feedback'].map(h => (
                <th key={h} className={`p-3.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium ${h === 'Score' || h === 'Level' ? 'text-center' : 'text-left'}`}
                  style={{ fontFamily: 'ui-monospace, monospace' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSkills.map((skill, idx) => {
              const lvlC = getLevelColor(skill.level);
              const priC = getLevelColor(skill.clusterPriority as any);
              return (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                  <td className="p-3.5 text-sm font-medium text-gray-900">{skill.name}</td>
                  <td className="p-3.5">
                    <div className="text-sm text-gray-600">{skill.clusterName}</div>
                    <div className="text-[10px] uppercase tracking-wider font-medium mt-0.5"
                      style={{ color: priC.text, fontFamily: 'ui-monospace, monospace' }}>
                      {skill.clusterPriority} Priority
                    </div>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-lg text-sm font-semibold tabular-nums"
                      style={{ background: lvlC.bg, color: lvlC.text, border: `1px solid ${lvlC.border}`, fontFamily: 'ui-monospace, monospace' }}>
                      {skill.score.toFixed(1)}
                    </span>
                    <div className="text-[10px] text-gray-400 mt-0.5">/ 10.0</div>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium"
                      style={{ background: lvlC.bg, color: lvlC.text, border: `1px solid ${lvlC.border}`, fontFamily: 'ui-monospace, monospace' }}>
                      {skill.level}
                    </span>
                  </td>
                  <td className="p-3.5 text-xs text-gray-500 max-w-sm">{skill.feedback}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Total Skills: <span className="tabular-nums font-medium" style={{ fontFamily: 'ui-monospace, monospace' }}>{allSkills.length}</span>
        </div>
        <div className="flex gap-4">
          {[
            { label: 'High', color: '#10b981', count: allSkills.filter(s => s.level === 'High').length },
            { label: 'Medium', color: '#f59e0b', count: allSkills.filter(s => s.level === 'Medium').length },
            { label: 'Low', color: '#f87171', count: allSkills.filter(s => s.level === 'Low' || s.level === 'Not Covered').length },
          ].map(({ label, color, count }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-[10px] text-gray-500">{label}: {count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* View Toggle */
function ViewToggle({ view, onChange }: { view: 'summary' | 'detailed'; onChange: (v: 'summary' | 'detailed') => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
      {[
        { key: 'summary' as const, label: 'Summary View', Icon: LayoutGrid },
        { key: 'detailed' as const, label: 'Detailed View', Icon: List },
      ].map(({ key, label, Icon }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`px-3.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all text-xs font-medium ${
            view === key
              ? 'bg-gray-900 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function EvaluationDashboardTab({ sessionId, aiEvaluation, isCompleted }: Props) {
  const [expandedClusters, setExpandedClusters] = useState<number[]>([1]);
  const [view, setView] = useState<'summary' | 'detailed'>('summary');

  const data = useMemo(() => extractData(aiEvaluation), [aiEvaluation]);

  const toggleCluster = (num: number) => {
    setExpandedClusters(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  if (!data.mustHaveClusters.length && !data.niceToHaveClusters.length && !data.finalScore) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-500">No evaluation data available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1500px]">
      {/* View Toggle */}
      <div className="flex justify-end">
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* Overall Summary */}
      <OverallSummary
        finalScore={data.finalScore}
        mthScore={data.mthScore}
        nthScore={data.nthScore}
        hrScore={data.hrScore}
        mthPct={data.mthPct}
        nthPct={data.nthPct}
        hrPct={data.hrPct}
        performanceNote={data.performanceNote}
      />

      {view === 'summary' ? (
        <>
          {/* Must-Have Skills */}
          {data.mustHaveClusters.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Must-Have Skills</h2>
                <p className="text-xs text-gray-500">
                  Core competencies required for the role ({data.mthPct}% weight)
                </p>
              </div>
              <div className="space-y-3">
                {data.mustHaveClusters.map(cluster => (
                  <SkillClusterCard
                    key={cluster.clusterNumber}
                    cluster={cluster}
                    expanded={expandedClusters.includes(cluster.clusterNumber)}
                    onToggle={() => toggleCluster(cluster.clusterNumber)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Nice-to-Have Skills */}
          {data.niceToHaveClusters.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Nice-to-Have Skills</h2>
                <p className="text-xs text-gray-500">
                  Additional competencies ({data.nthPct}% weight)
                </p>
              </div>
              <div className="space-y-3">
                {data.niceToHaveClusters.map(cluster => (
                  <SkillClusterCard
                    key={cluster.clusterNumber}
                    cluster={cluster}
                    expanded={expandedClusters.includes(cluster.clusterNumber)}
                    onToggle={() => toggleCluster(cluster.clusterNumber)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Radar + Breakdown side by side */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <SkillRadar
              mustHaveClusters={data.mustHaveClusters}
              niceToHaveClusters={data.niceToHaveClusters}
            />
            <EvalBreakdown
              mthScore={data.mthScore}
              nthScore={data.nthScore}
              hrScore={data.hrScore}
              finalScore={data.finalScore}
              mthPct={data.mthPct}
              nthPct={data.nthPct}
              hrPct={data.hrPct}
            />
          </div>
        </>
      ) : (
        <DetailedTable
          mustHaveClusters={data.mustHaveClusters}
          niceToHaveClusters={data.niceToHaveClusters}
        />
      )}
    </div>
  );
}
