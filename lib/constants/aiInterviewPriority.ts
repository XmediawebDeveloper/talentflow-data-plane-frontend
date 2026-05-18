/**
 * AI Interview cluster priority scale.
 *
 * Cluster priorities are stored and displayed on a 3-level scale:
 *   1 = Low, 2 = Medium, 3 = High
 *
 * The OpenAI-based cluster generator historically emits priorities on a 1-5
 * scale. `normalizePriority` downgrades 4 and 5 to 3 rather than silently
 * clamping to 1-3 somewhere deep in the UI. Every AI Interview screen that
 * renders a cluster priority (Config, Clusters, Preview, DetailsView) must
 * import these helpers to stay consistent.
 *
 * If you ever move the UI to a 5-level scale, update BOTH the AI prompt
 * (app/ai_engine/prompts.py) and this file — do not let them drift.
 */

export type ClusterPriority = 1 | 2 | 3;

export interface PriorityLabelInfo {
  label: string;
  short: string;
  color: string;
  dot: string;
}

/**
 * Clamp any numeric priority to the 3-level scale.
 * Accepts both the legacy 1-5 AI output and already-normalised 1-3 values
 * without downgrading the latter.
 */
export function normalizePriority(p: number): ClusterPriority {
  if (p >= 3) return 3; // 3, 4, 5 → High
  if (p === 2) return 2; // 2 → Medium
  return 1;              // 1 or below → Low
}

// P-label follows industry convention: P1 = highest priority (Must-Have),
// P3 = lowest priority (Nice-to-Have). The internal numeric scale stays
// 1=Low \u2192 3=High; only the display label maps the highest number to P1.
// EvaluationDashboardV2.tsx uses the same convention (line 577-579).
export const PRIORITY_LABELS: Record<ClusterPriority, PriorityLabelInfo> = {
  3: { label: 'P1 \u2013 High',   short: 'High',   color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  2: { label: 'P2 \u2013 Medium', short: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  1: { label: 'P3 \u2013 Low',    short: 'Low',    color: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-500'   },
};

export function getPriorityLabel(p: number): PriorityLabelInfo {
  return PRIORITY_LABELS[normalizePriority(p)];
}
