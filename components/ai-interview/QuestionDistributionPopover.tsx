'use client';

import React from 'react';
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

/** Panel width and grid for one, two or three columns. Each column wants
 *  roughly 360px; the viewport cap keeps a narrow screen from scrolling
 *  sideways. */
const POPOVER_WIDTH: Record<number, string> = {
  1: 'w-[min(420px,calc(100vw-2rem))]',
  2: 'w-[min(780px,calc(100vw-2rem))]',
  3: 'w-[min(1120px,calc(100vw-2rem))]',
};
const GRID_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

/** An HR question as the rounds config stores it — what the third column lists. */
export type DistHRQuestion = { id: string; question_text: string; stage?: string | null };

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
  /** The HR round's selected questions, for the third column. */
  hrQuestions?: DistHRQuestion[];
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
  hrQuestions = [],
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

  if (mthDist.length === 0 && nthDist.length === 0 && hrQuestions.length === 0) return null;

  const totalQ = mthDist.length + nthDist.length;
  const totalSkillsCovered = new Set([
    ...mthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.name.toLowerCase())]),
    ...nthDist.flatMap(r => [r.primary.toLowerCase(), ...r.secondaries.map(s => s.name.toLowerCase())]),
  ]).size;

  const priorityLabel = (p: number) => (p >= 3 ? 'P1' : p === 2 ? 'P2' : 'P3');
  const priorityClass = (p: number) =>
    p >= 3
      ? 'bg-success-subtle text-success ring-success-line'
      : p === 2
        ? 'bg-warning-subtle text-warning ring-warning-line'
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
            className={`text-2xs font-mono font-semibold ${
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
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium ring-1 ${priorityClass(s.priority)}`}
              >
                {s.name}
                <span className="text-2xs font-semibold opacity-80">{priorityLabel(s.priority)}</span>
              </span>
            ))}
          </div>
        </td>
      </tr>
    );
  };

  /* Each bucket is a column with its own sticky head. The head sticks to the
     popover body, which is the ONLY scroller: the tables used to sit inside
     `.tf-table-shell` scroll boxes of their own, so a long bucket showed a
     second scrollbar inside the popover's — and a sticky head inside a
     nested scroller sticks to that box, not to the popover the reader is
     scrolling. */
  const columnHead = (label: string, count: number, tone: string, right = 'Skills') => (
    <div className="sticky top-0 z-10 bg-white">
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${tone}`}>
        {label} ({count})
      </div>
      <div className="grid grid-cols-[40px_1fr] bg-gray-50 border border-gray-100 rounded-t-md">
        <span className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Q#</span>
        <span className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{right}</span>
      </div>
    </div>
  );

  const renderSection = (rows: DistRow[], label: string, sectionKey: 'mth' | 'nth') => (
    <div className="min-w-0">
      {columnHead(label, rows.length, sectionKey === 'mth' ? 'text-brand-blue' : 'text-brand-cyan')}
      <div className="border border-t-0 border-gray-100 rounded-b-md">
        <table className="w-full text-left">
          <tbody>
            {rows.map(r => renderRow(r, sectionKey))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHR = () => (
    <div className="min-w-0">
      {columnHead('HR Round', hrQuestions.length, 'text-brand-orange-deep', 'Question')}
      <div className="border border-t-0 border-gray-100 rounded-b-md">
        <table className="w-full text-left">
          <tbody>
            {hrQuestions.map((q, i) => (
                <tr key={q.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <td className="align-top px-2 py-1.5 w-[40px]">
                    <span className="text-[11px] font-mono font-semibold text-brand-orange-deep">Q{i + 1}</span>
                  </td>
                  <td className="align-top px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-gray-800">{q.question_text}</span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ring-1 ${
                          q.stage === 'opening'
                            ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                            : 'bg-advice-positive-bg text-advice-positive ring-advice-positive/25'
                        }`}
                      >
                        {q.stage === 'opening' ? 'opening' : 'closing'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const columns = [
    { key: 'mth', show: mthDist.length > 0, render: () => renderSection(mthDist, 'Must-To-Have', 'mth') },
    { key: 'nth', show: nthDist.length > 0, render: () => renderSection(nthDist, 'Nice-To-Have', 'nth') },
    { key: 'hr', show: hrQuestions.length > 0, render: renderHR },
  ].filter(c => c.show);

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
      {/* Only the rounds that have anything to show get a column, and the
          popover is sized to that count — one column does not need a
          three-column-wide panel with two empty thirds. Capped to the
          viewport so it never grows a horizontal scrollbar of its own. */}
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={16}
        className={`${POPOVER_WIDTH[columns.length] ?? POPOVER_WIDTH[3]} max-h-[75dvh] overflow-y-auto p-0`}
      >
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="text-sm font-semibold text-gray-900">Question Distribution</div>
          <div className="text-2xs text-gray-500">
            {totalQ + hrQuestions.length} questions · {totalSkillsCovered} skills covered
          </div>
        </div>
        <div className={`p-4 grid grid-cols-1 gap-4 items-start ${GRID_COLS[columns.length] ?? GRID_COLS[3]}`}>
          {columns.map(column => (
            <React.Fragment key={column.key}>{column.render()}</React.Fragment>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default QuestionDistributionPopover;
