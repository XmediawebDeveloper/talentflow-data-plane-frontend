// Adapter: transforms the backend's ai_evaluation + session config
// into the dashboard design's DashboardData shape.
//
// Cluster Name + Priority come DIRECTLY from the special_instructions config,
// not from the evaluator's output — that's the authoritative source.

import type {
  DashboardData, Cluster, Skill, Level, Recommendation, InterviewResponse,
} from './types';

interface ClusterConfigDef {
  id?: string;
  name: string;
  priority: number;     // 3=High, 2=Medium, 1=Low
  skills: string[];
  reason?: string;
}

interface ClusterConfig {
  mth: ClusterConfigDef[];
  nth: ClusterConfigDef[];
}

function scoreToLevel(score: number): Level {
  if (score >= 7) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}

function priorityNumToLevel(p: number): Level {
  if (p >= 3) return 'High';
  if (p === 2) return 'Medium';
  return 'Low';
}

function recommendationFromString(raw: any, finalScore: number): Recommendation {
  const s = (raw ?? '').toString().toUpperCase().trim();
  if (s === 'STRONG_YES' || s === 'STRONG HIRE') return 'Strong Hire';
  if (s === 'YES' || s === 'HIRE') return 'Hire';
  if (s === 'MAYBE' || s === 'CONSIDER') return 'Consider';
  if (s === 'NO' || s === 'NO HIRE' || s === 'NO_HIRE') return 'No Hire';
  // Fallback inferred from final score
  if (finalScore >= 80) return 'Strong Hire';
  if (finalScore >= 65) return 'Hire';
  if (finalScore >= 50) return 'Consider';
  return 'No Hire';
}

/** Case-insensitive + token-overlap + typo-tolerant skill lookup. */
function lookupSkillScore(skill: string, scoreMap: Record<string, number>): number {
  const sl = skill.toLowerCase().trim();
  const entries = Object.entries(scoreMap).map(([k, v]) => [k.toLowerCase().trim(), v] as const);
  // 1. exact
  for (const [k, v] of entries) if (k === sl) return Number(v) || 0;
  // 2. substring
  for (const [k, v] of entries) if (k.includes(sl) || sl.includes(k)) return Number(v) || 0;
  // 3. token overlap
  const slTokens = new Set(sl.split(/[\s(),]+/).filter(t => t.length > 2));
  if (slTokens.size > 0) {
    for (const [k, v] of entries) {
      const ks = new Set(k.split(/[\s(),]+/).filter(t => t.length > 2));
      for (const t of slTokens) if (ks.has(t)) return Number(v) || 0;
    }
  }
  return 0;
}

/** Find the evaluator note (highest-scoring match for this skill). */
function lookupFeedback(skill: string, evaluations: any[]): string {
  const sl = skill.toLowerCase().trim();
  const slTokens = new Set(sl.split(/[\s(),]+/).filter(t => t.length > 2));
  let best = { score: -1, note: '' };
  for (const ev of evaluations || []) {
    const topic = (ev?.evaluation?.topic || ev?.topic || '').toLowerCase().trim();
    if (!topic) continue;
    let matched = topic === sl || topic.includes(sl) || sl.includes(topic);
    if (!matched && slTokens.size > 0) {
      const ks = new Set(topic.split(/[\s(),]+/).filter((t: string) => t.length > 2));
      for (const t of slTokens) if (ks.has(t)) { matched = true; break; }
    }
    if (matched) {
      const sc = ev?.evaluation?.overall ?? ev?.score ?? 0;
      const note = ev?.evaluation?.brief_note || ev?.one_line_note || '';
      if (typeof sc === 'number' && sc > best.score) best = { score: sc, note };
    }
  }
  return best.note;
}

/** Distribute weights proportionally so they sum to exactly 100.
 * Uses largest-remainder method to absorb rounding error on the top cluster. */
function computeWeights(clusters: ClusterConfigDef[]): number[] {
  if (clusters.length === 0) return [];
  const totalPriority = clusters.reduce((sum, c) => sum + (c.priority || 1), 0) || 1;
  const raw = clusters.map(c => ((c.priority || 1) / totalPriority) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  // Distribute leftover 1s to the entries with the largest fractional parts
  const fractions = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (const { i } of fractions) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder--;
  }
  return out;
}

/** Build cluster data from config (authoritative) + scores from ai_evaluation. */
function buildClustersFromConfig(
  configClusters: ClusterConfigDef[],
  eval_: any,
  startingNumber: number,
): Cluster[] {
  const skillScoresMap = (eval_?.skill_scores_map || {}) as Record<string, number>;
  const evaluations = eval_?.evaluations || [];
  const clusterInsights = eval_?.cluster_insights || [];

  // Weights always sum to exactly 100 so displayed math is consistent
  const weights = computeWeights(configClusters);

  return configClusters.map((cc, idx): Cluster => {
    const weight = weights[idx];

    const skills: Skill[] = (cc.skills || []).map((sname): Skill => {
      // Prefer skill_scores_map (0-10); fall back to lookup in cluster_insights
      let score010 = lookupSkillScore(sname, skillScoresMap);
      if (score010 === 0) {
        // Try cluster_insights skill_scores (score is 0-100 there)
        for (const ci of clusterInsights) {
          for (const s of (ci.skill_scores || [])) {
            if ((s.skill || '').toLowerCase() === sname.toLowerCase()) {
              score010 = (Number(s.score) || 0) / 10;
              break;
            }
          }
        }
      }
      return {
        name: sname,
        score: Math.round(score010 * 10) / 10,
        level: scoreToLevel(score010),
        feedback: lookupFeedback(sname, evaluations) || 'No specific feedback captured for this skill.',
      };
    });

    // Cluster score = average of skill scores
    const scored = skills.filter(s => s.score > 0);
    const clusterScore = scored.length > 0
      ? Math.round((scored.reduce((a, s) => a + s.score, 0) / scored.length) * 100) / 100
      : 0;

    return {
      clusterNumber: startingNumber + idx,
      name: cc.name,                          // CLUSTER NAME FROM CONFIG
      priority: priorityNumToLevel(cc.priority), // CLUSTER PRIORITY FROM CONFIG
      weight,
      skills,
      clusterScore,
    };
  });
}

/** Extract HR score from ai_evaluation.section_scores.hr (0-100 → 0-10). */
function hrScoreFromEval(eval_: any): number {
  const hr = eval_?.section_scores?.hr?.score;
  if (typeof hr === 'number' && hr > 0) return Math.round(hr) / 10;
  return 0;
}

/** Build interview response timeline from question_groups (preferred) or question_history. */
function buildInterviewResponses(eval_: any): InterviewResponse[] {
  const groups = eval_?.question_groups || [];
  if (groups.length > 0) {
    // Flatten: each main question becomes one response, follow-ups stay within
    const out: InterviewResponse[] = [];
    let id = 1;
    for (const g of groups) {
      const skills: string[] = [g.skill].filter(Boolean);
      const duration = g.duration_seconds ? formatMinSec(g.duration_seconds) : '—';
      const ts = g.timestamp ? formatTimestamp(g.timestamp) : `Q${id}`;
      out.push({
        id: id++,
        timestamp: ts,
        question: g.question || '',
        candidateResponse: g.answer || '',
        skillsCovered: skills,
        duration,
      });
      for (const fu of (g.follow_ups || [])) {
        out.push({
          id: id++,
          timestamp: fu.timestamp ? formatTimestamp(fu.timestamp) : `Q${id-1}f`,
          question: `↳ ${fu.question || ''}`,
          candidateResponse: fu.answer || '',
          skillsCovered: skills,
          duration: fu.duration_seconds ? formatMinSec(fu.duration_seconds) : '—',
        });
      }
    }
    return out;
  }

  // Fallback to question_history
  const history = eval_?.question_history || [];
  return history.map((h: any, idx: number): InterviewResponse => ({
    id: idx + 1,
    timestamp: h.timestamp ? formatTimestamp(h.timestamp) : `Q${idx + 1}`,
    question: h.question_text || h.question || '',
    candidateResponse: h.response_text || h.answer || '',
    skillsCovered: [h.topic].filter(Boolean),
    duration: '—',
  }));
}

function formatTimestamp(raw: string): string {
  try {
    // Extract HH:MM:SS from ISO
    const t = new Date(raw);
    return t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return raw; }
}

function formatMinSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationMinutes(min: number): string {
  if (!min || min < 1) return `${Math.round((min || 0) * 60)}s`;
  if (min < 60) return `${Math.round(min * 10) / 10} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

/** Main entry point. */
export function buildDashboardData(params: {
  ai_evaluation: any;
  cluster_config: ClusterConfig;
  candidate: { name: string; role?: string; email?: string };
  interview: { mode?: string; completed_at?: string | null; created_at?: string };
}): DashboardData {
  const { ai_evaluation: eval_, cluster_config, candidate, interview } = params;

  const mustHaveClusters = buildClustersFromConfig(cluster_config?.mth || [], eval_, 1);
  const niceToHaveClusters = buildClustersFromConfig(
    cluster_config?.nth || [],
    eval_,
    mustHaveClusters.length + 1,
  );

  // Section scores: prefer backend `section_question_avg` (simple average of
  // per-question scores, 0-10 — drives the recruiter Pass/Fail per spec).
  // Fall back to cluster-weighted derivation when backend hasn't supplied it.
  const mthQAvg = eval_?.section_question_avg?.mth;
  const nthQAvg = eval_?.section_question_avg?.nth;
  const mthBackend = eval_?.section_scores?.mth?.score;
  const nthBackend = eval_?.section_scores?.nth?.score;
  const mustHaveAvg = (typeof mthQAvg === 'number')
    ? Math.round(mthQAvg * 100) / 100
    : (mustHaveClusters.length > 0
        ? Math.round(mustHaveClusters.reduce((a, c) => a + c.clusterScore * c.weight / 100, 0) * 100) / 100
        : (typeof mthBackend === 'number' && mthBackend > 0 ? Math.round(mthBackend) / 10 : 0));
  const niceToHaveAvg = (typeof nthQAvg === 'number')
    ? Math.round(nthQAvg * 100) / 100
    : (niceToHaveClusters.length > 0
        ? Math.round(niceToHaveClusters.reduce((a, c) => a + c.clusterScore * c.weight / 100, 0) * 100) / 100
        : (typeof nthBackend === 'number' && nthBackend > 0 ? Math.round(nthBackend) / 10 : 0));
  const hr = hrScoreFromEval(eval_);

  // Determine which sections actually exist in this interview
  const sectionsPresent = {
    mustHave: mustHaveClusters.length > 0 || mustHaveAvg > 0,
    niceToHave: niceToHaveClusters.length > 0 || niceToHaveAvg > 0,
    hr: hr > 0 || !!eval_?.section_scores?.hr,
  };

  // Base weights (canonical 70/20/10). Renormalize to sum to 100 based on
  // which sections actually exist — missing sections get 0%, present sections
  // keep their proportion.
  const BASE_MTH = 70, BASE_NTH = 20, BASE_HR = 10;
  const baseSum =
    (sectionsPresent.mustHave   ? BASE_MTH : 0) +
    (sectionsPresent.niceToHave ? BASE_NTH : 0) +
    (sectionsPresent.hr         ? BASE_HR  : 0);
  const weights = {
    mustHave:   sectionsPresent.mustHave   && baseSum > 0 ? (BASE_MTH / baseSum) * 100 : 0,
    niceToHave: sectionsPresent.niceToHave && baseSum > 0 ? (BASE_NTH / baseSum) * 100 : 0,
    hr:         sectionsPresent.hr         && baseSum > 0 ? (BASE_HR  / baseSum) * 100 : 0,
  };

  // Final score = (MHS × w_mth + NHS × w_nth + HR × w_hr) — where weights are
  // fractional (w/100). Each section score is 0-10, so × 10 at the end scales
  // the total to 0-100. Round to 1 decimal.
  const weightedSum =
    mustHaveAvg   * (weights.mustHave   / 100) +
    niceToHaveAvg * (weights.niceToHave / 100) +
    hr            * (weights.hr         / 100);
  const finalScore = Math.round(weightedSum * 100) / 10;

  const summary = eval_?.interview_summary || {};
  const rawRec = summary?.hiring_recommendation;
  // Backend now emits `final_result: "Pass" | "Fail"` derived from MHS section
  // average (≥6.0 → Pass). Treat it as the authoritative gate when available
  // and map onto the existing recommendation enum (Pass → Hire, Fail → No Hire)
  // so downstream UI/PDF rendering keep working without schema churn.
  const backendFinal = (eval_?.final_result || '').toString().toLowerCase();
  const recommendation: Recommendation =
    backendFinal === 'pass' ? 'Hire'
    : backendFinal === 'fail' ? 'No Hire'
    : recommendationFromString(rawRec, finalScore);

  const strengths: string[] = Array.isArray(summary?.key_strengths)
    ? summary.key_strengths
    : Array.isArray(eval_?.strengths) ? eval_.strengths : [];
  const weaknesses: string[] = Array.isArray(summary?.key_concerns)
    ? summary.key_concerns
    : Array.isArray(eval_?.weaknesses) ? eval_.weaknesses : [];
  const aiSummary: string = summary?.summary
    || summary?.narrative_insight
    || eval_?.narrative_insight
    || eval_?.capability_score_reasoning
    || '';

  const dateISO = interview.completed_at || interview.created_at || '';
  const dateStr = dateISO ? new Date(dateISO).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const modeNormalized = (interview.mode || '').toLowerCase();
  const mode: 'Timed' | 'Conversational' = modeNormalized === 'fixed' ? 'Timed' : 'Conversational';

  return {
    candidate: {
      name: candidate.name,
      role: candidate.role || 'Candidate',
      email: candidate.email,
    },
    interview: {
      mode,
      duration: formatDurationMinutes(eval_?.duration_minutes || 0),
      date: dateStr,
    },
    scores: {
      mustHave: Math.round(mustHaveAvg * 100) / 100,
      niceToHave: Math.round(niceToHaveAvg * 100) / 100,
      hr: Math.round(hr * 100) / 100,
      final: finalScore,
    },
    weights: {
      mustHave: Math.round(weights.mustHave * 100) / 100,
      niceToHave: Math.round(weights.niceToHave * 100) / 100,
      hr: Math.round(weights.hr * 100) / 100,
    },
    sectionsPresent,
    strengths,
    weaknesses,
    aiSummary,
    recommendation,
    mustHaveClusters,
    niceToHaveClusters,
    interviewResponses: buildInterviewResponses(eval_),
  };
}
