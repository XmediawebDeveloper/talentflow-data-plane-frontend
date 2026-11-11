import type { AIInterviewResponse } from '@/lib/services/aiInterviewService';

// The "Proctoring Risk" level shown in the results lists. The PDF report reads
// the same function, so the two never disagree.
export function getProctoringRisk(session: AIInterviewResponse): { level: string; badge: string } {
  // Prefer server-computed risk_level (persisted at completion time, AIU-82)
  const stored = session.risk_level;
  if (stored) {
    if (stored === 'high')   return { level: 'High',   badge: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line' };
    if (stored === 'medium') return { level: 'Medium', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' };
    if (stored === 'low')    return { level: 'Low',    badge: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' };
    return { level: 'None', badge: 'bg-success-subtle text-success ring-1 ring-success-line' };
  }
  // Fallback: heuristic from raw violations (pre-AIU-82 sessions or incomplete data)
  const violations = session.proctoring_violations || [];
  const severe = violations.filter((v) => v.severity === 'high' || v.severity === 'critical').length;
  const medium = violations.filter((v) => v.severity === 'medium').length;
  if (severe >= 3 || (severe >= 1 && medium >= 2)) return { level: 'High',   badge: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line' };
  if (severe >= 1 || medium >= 2)                  return { level: 'Medium', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' };
  if (violations.length > 0)                       return { level: 'Low',    badge: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' };
  return { level: 'None', badge: 'bg-success-subtle text-success ring-1 ring-success-line' };
}
