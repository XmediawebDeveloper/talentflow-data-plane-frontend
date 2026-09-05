'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** One chip in a question row — every skill carries its OWN priority, because a
 *  secondary can come from a different cluster than the primary. */
export type DistChip = { name: string; priority: number };

export type DistRow = {
  q: number;
  primary: string;
  secondaries: DistChip[];
  cluster: string;
  priority: number;
};

type SavedCluster = { priority?: number; skills?: string[] };

interface QuestionDistributionPopoverProps {
  /** The invite's `special_instructions` — string or already-parsed object. */
  specialInstructions?: string | Record<string, any> | null;
  /**
   * Clusters to resolve each skill's own priority from. Defaults to the
   * `mth_clusters` / `nth_clusters` saved inside `specialInstructions`; the
   * config page passes its LIVE (possibly unsaved) clusters instead.
   */
  clusters?: SavedCluster[];
  /**
   * Rows to show when nothing has been saved yet — the config page's local
   * preview. A thunk so the (non-trivial) distribution only runs when the
   * saved plan is genuinely absent.
   */
  fallback?: () => { mth: DistRow[]; nth: DistRow[] };
  className?: string;
}

/**
 * Reads the authoritative per-question skill plan and renders it behind a
 * "stealth dot" — a 1.5x1.5 gray dot with a blank aria-label, the same hidden
 * affordance used on the cluster editor and invite details pages.
 *
 * Source precedence matters and is the reason this lives in ONE place. The
 * popover must mirror what Bina actually asked at runtime:
 *
 *   1. `mth/nth_question_skill_map` — the deterministic per-question map the
 *      interview runs on, and the one the Question Analysis tab scores
 *      against. Authoritative.
 *   2. `skill_distribution` — the pre-augment plan. Fallback only: it can
 *      diverge when the saved distribution failed backend validation and was
 *      recomputed, which is exactly how the popover once showed a plan the
 *      interview never used (popover-vs-Question-Analysis contradiction,
 *      2026-08-25).
 *   3. The caller's local preview, for a config that has not been saved yet.
 *
 * Both row shapes are identical, so one converter handles them.
 */
export function QuestionDistributionPopover({
  specialInstructions,
  clusters,
  fallback,
  className = '',
}: QuestionDistributionPopoverProps) {
  const parsed: Record<string, any> | null = (() => {
    if (!specialInstructions) return null;
    try {
      return typeof specialInstructions === 'string'
        ? JSON.parse(specialInstructions)
        : specialInstructions;
    } catch {
      return null;
    }
  })();

  const saved: { mth_questions?: any[]; nth_questions?: any[] } | null = (() => {
    if (!parsed) return null;
    if (parsed.mth_question_skill_map?.length || parsed.nth_question_skill_map?.length) {
      return {
        mth_questions: parsed.mth_question_skill_map || [],
        nth_questions: parsed.nth_question_skill_map || [],
      };
    }
    return parsed.skill_distribution || null;
  })();

  // skill -> its own cluster priority, so a secondary shows ITS band rather
  // than inheriting the primary's.
  const skillPriority = new Map<string, number>();
  const prioritySource: SavedCluster[] = clusters ?? [
    ...((parsed?.mth_clusters as SavedCluster[] | undefined) ?? []),
    ...((parsed?.nth_clusters as SavedCluster[] | undefined) ?? []),
  ];
  for (const c of prioritySource) {
    const pri = c?.priority ?? 1;
    for (const s of c?.skills ?? []) {
      if (typeof s === 'string' && s.trim()) {
        const k = s.toLowerCase().trim();
        if (!skillPriority.has(k)) skillPriority.set(k, pri);
      }
    }
  }

  const toRow = (q: any, idx: number): DistRow => {
    const primary = String(q?.primary_skill || '').trim();
    const primaryPri =
      Number(q?.cluster_priority) || skillPriority.get(primary.toLowerCase()) || 1;
    const secondaries: DistChip[] = Array.isArray(q?.secondary_skills)
      ? q.secondary_skills
          .filter((s: any) => typeof s === 'string' && s.trim())
          .map((s: string) => ({
            name: s.trim(),
            // Fall back to the primary's band only when the skill is in no
            // cluster at all (rare — a JD-pool addition that never clustered).
            priority: skillPriority.get(s.trim().toLowerCase()) ?? primaryPri,
          }))
      : [];
    return {
      q: Number(q?.question_number) || idx + 1,
      primary,
      secondaries,
      cluster: String(q?.cluster_name || ''),
      priority: primaryPri,
    };
  };

  const hasSaved = Boolean(saved?.mth_questions?.length || saved?.nth_questions?.length);
  const local = hasSaved ? null : fallback?.();
  const mthDist: DistRow[] = hasSaved ? (saved?.mth_questions ?? []).map(toRow) : local?.mth ?? [];
  const nthDist: DistRow[] = hasSaved ? (saved?.nth_questions ?? []).map(toRow) : local?.nth ?? [];

  if (mthDist.length === 0 && nthDist.length === 0) return null;

  const totalQ = mthDist.length + nthDist.length;
  const totalSkillsCovered = new Set([
    ...mthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.name.toLowerCase())]),
    ...nthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.name.toLowerCase())]),
  ]).size;

  const priorityLabel = (p: number) => (p >= 3 ? 'P1' : p === 2 ? 'P2' : 'P3');
  const priorityClass = (p: number) =>
    p >= 3
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : p === 2
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-rose-50 text-rose-700 ring-rose-200';

  const renderRow = (row: DistRow, sectionKey: 'mth' | 'nth') => {
    const chips: DistChip[] = [{ name: row.primary, priority: row.priority }, ...row.secondaries];
    return (
      <tr
        key={`${sectionKey}-${row.q}`}
        className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
      >
        <td className="align-top px-2 py-1.5 w-[40px]">
          <span
            className={`text-[11px] font-mono font-semibold ${
              sectionKey === 'mth' ? 'text-brand-blue' : 'text-brand-cyan'
            }`}
          >
            Q{row.q}
          </span>
        </td>
        <td className="align-top px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((s, i) => (
              <span
                key={`${row.q}-chip-${i}`}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${priorityClass(s.priority)}`}
              >
                {s.name}
                <span className="text-[9px] font-semibold opacity-80">{priorityLabel(s.priority)}</span>
              </span>
            ))}
          </div>
        </td>
      </tr>
    );
  };

  const renderSection = (rows: DistRow[], label: string, sectionKey: 'mth' | 'nth') => (
    <div>
      <div className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
        {label} ({rows.length})
      </div>
      <div className="border border-gray-100 rounded-md overflow-hidden tf-table-shell">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-[40px]">
                Q#
              </th>
              <th className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Skills
              </th>
            </tr>
          </thead>
          <tbody>{rows.map(r => renderRow(r, sectionKey))}</tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label=" "
          title=""
          className={`inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-gray-300 hover:bg-brand-blue transition-colors ml-1 ${className}`}
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[480px] max-h-[70dvh] overflow-y-auto p-0">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Question Distribution</div>
            <div className="text-[11px] text-gray-500">
              {totalQ} questions · {totalSkillsCovered} skills covered
            </div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {mthDist.length > 0 && renderSection(mthDist, 'Must-To-Have', 'mth')}
          {nthDist.length > 0 && renderSection(nthDist, 'Nice-To-Have', 'nth')}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default QuestionDistributionPopover;
