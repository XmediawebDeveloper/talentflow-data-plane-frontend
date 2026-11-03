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

/** Panel width: the narrow one for skill rows only, the wider one once HR
 *  question text joins the list; the viewport cap keeps a narrow screen from
 *  scrolling sideways. */
const POPOVER_WIDTH: Record<number, string> = {
  1: 'w-[min(560px,calc(100vw-2rem))]',
  2: 'w-[min(780px,calc(100vw-2rem))]',
  3: 'w-[min(1120px,calc(100vw-2rem))]',
};

/** An HR question as the rounds config stores it — listed as rows in the same table. */
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

  // Q# runs serially down ONE list in the order Bina asks: Opening HR,
  // Must-Have, Nice-to-Have, then Closing HR — so it lines up with the
  // ask-order "Q" on the Question Analysis tab.
  const stageOf = (q: DistHRQuestion) => (q.stage === 'opening' ? 'opening' : 'closing');
  type ListItem =
    | { kind: 'skill'; row: DistRow; sectionKey: 'mth' | 'nth' }
    | { kind: 'hr'; q: DistHRQuestion };
  const items: ListItem[] = [
    ...hrQuestions.filter(q => stageOf(q) === 'opening').map(q => ({ kind: 'hr' as const, q })),
    ...mthDist.map(row => ({ kind: 'skill' as const, row, sectionKey: 'mth' as const })),
    ...nthDist.map(row => ({ kind: 'skill' as const, row, sectionKey: 'nth' as const })),
    ...hrQuestions.filter(q => stageOf(q) === 'closing').map(q => ({ kind: 'hr' as const, q })),
  ];

  // Section label at the end of every row — the type of question asked.
  const sectionLabel = (key: 'mth' | 'nth' | 'hr') => {
    const { text, cls } = {
      mth: { text: 'Must-to-Have', cls: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
      nth: { text: 'Nice-to-Have', cls: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' },
      hr: { text: 'HR', cls: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' },
    }[key];
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide ring-1 ${cls}`}>
        {text}
      </span>
    );
  };

  // The row's section label, in its own fixed-width "Section" column so every
  // label starts at the same x on every row (it used to trail the chips,
  // landing wherever the content ended).
  const SECTION_COL = 'w-[96px] sm:w-[150px]';
  const rowSection = (key: 'mth' | 'nth' | 'hr') => (
    <td className={`align-top px-2 py-1.5 ${SECTION_COL}`}>
      <span className="inline-flex items-center whitespace-nowrap">
        {sectionLabel(key)}
      </span>
    </td>
  );

  const qCell = (n: number, tone: string) => (
    <td className="tf-td align-top w-[32px] sm:w-[40px]">
      <span className={`text-2xs font-mono font-semibold ${tone}`}>Q{n}</span>
    </td>
  );

  const renderSkillRow = (row: DistRow, sectionKey: 'mth' | 'nth', n: number) => {
    const chips: DistChip[] = [{ name: row.primary, priority: row.priority }, ...row.secondaries];
    return (
      <tr
        key={`${sectionKey}-${row.q}`}
        className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
      >
        {qCell(n, sectionKey === 'mth' ? 'text-brand-blue' : 'text-brand-cyan')}
        <td className="tf-td align-top">
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
        {rowSection(sectionKey)}
      </tr>
    );
  };

  const renderHrRow = (q: DistHRQuestion, n: number) => (
    <tr key={`hr-${q.id}`} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
      {qCell(n, 'text-brand-orange-deep')}
      <td className="tf-td align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-gray-800">{q.question_text}</span>
        </div>
      </td>
      {rowSection('hr')}
    </tr>
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
      {/* One list, so one column; HR rows carry full question text, so the
          panel widens when there are any. Capped to the viewport so it never
          grows a horizontal scrollbar of its own. */}
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={16}
        className={`${hrQuestions.length > 0 ? POPOVER_WIDTH[2] : POPOVER_WIDTH[1]} max-h-[75dvh] overflow-y-auto p-0`}
      >
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="tf-row-title">Question Distribution</div>
          <div className="tf-micro-hint">
            {totalQ + hrQuestions.length} questions · {totalSkillsCovered} skills covered
          </div>
          {/* Per-section question counts — only sections that have questions. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {([
              ['mth', mthDist.length],
              ['nth', nthDist.length],
              ['hr', hrQuestions.length],
            ] as const).filter(([, n]) => n > 0).map(([key, n]) => (
              <span key={key} className="inline-flex items-center gap-1">
                {sectionLabel(key)}
                <span className="text-2xs font-semibold text-gray-700">{n}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="p-4">
          {/* The head sticks to the popover body, the ONLY scroller — a nested
              scroll box would give a second scrollbar and a head that sticks
              to the wrong box. */}
          <div className="sticky top-0 z-10 bg-white">
            <div className="grid grid-cols-[32px_1fr_96px] sm:grid-cols-[40px_1fr_150px] bg-white border border-gray-100 rounded-t-md">
              <span className="px-2 py-1.5 tf-caption">Q#</span>
              <span className="px-2 py-1.5 tf-caption">Skills/Questions</span>
              <span className="px-2 py-1.5 tf-caption">Section</span>
            </div>
          </div>
          <div className="border border-t-0 border-gray-100 rounded-b-md">
            <table className="w-full text-left">
              <tbody>
                {items.map((it, i) =>
                  it.kind === 'hr'
                    ? renderHrRow(it.q, i + 1)
                    : renderSkillRow(it.row, it.sectionKey, i + 1),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default QuestionDistributionPopover;
