import type { ReactNode } from 'react';

/**
 * The Job ID badge — JD-526 — as it appears on every main list and card view.
 *
 * One definition, because there were nine. Six lists drew the id as a light
 * `bg-brand-blue/10` chip, two drew it solid, and the Assessments grid card had
 * a third variant of its own, so the same identifier looked like three
 * different things depending on which page a recruiter was on.
 *
 * The style kept is the AI Interviews JD-selection badge
 * (`components/ai-interview/AIInterviewJDSelection.tsx`), copied verbatim:
 * solid `brand-blue` ground, white text, semibold, its own brand-tinted shadow
 * and a hairline white ring. Every value is a brand token — no colour is
 * spelled out here.
 *
 * `font-mono` is carried over from the source for exactness, but note it is a
 * no-op in this app: the theme maps the mono stack to Inter, so it resolves to
 * the same face as everything else. Kept rather than dropped so this badge and
 * the one it was taken from stay byte-identical.
 *
 * `className` is for LAYOUT only (`flex-shrink-0`, `inline-flex items-center`
 * and the like), which is what each call site already carried around its own
 * span. Nothing about the badge's own appearance should be passed in: a page
 * that needs to look different needs this component changed, not overridden.
 */

export const JOB_ID_BADGE_CLASS =
  'px-2 py-0.5 text-xs font-mono font-semibold bg-brand-blue text-white rounded shadow-sm shadow-brand-blue/25 ring-1 ring-white/10';

/**
 * A job card's headline: [selection control] + Job ID + Job Name on ONE line at
 * every width. The row never wraps; the name truncates (`truncate min-w-0` on
 * it, full name in its `title`) and a long id is capped by `JOB_ID_BADGE_FIT`.
 * Sits inside the card's wrapping badge row, where `max-w-full` lets it take a
 * whole line of its own when the name is long, so the version / status pills
 * after it drop below instead of pushing the name onto a line by itself.
 */
export const JOB_HEADLINE_ROW = 'flex items-center gap-2 min-w-0 max-w-full';

/**
 * Layout for the badge inside `JOB_HEADLINE_ROW`: on phones a very long id is
 * capped at 9rem and ellipsed (full id in the badge's `title`), so it can never
 * squeeze the job name out of the row. `sm` and up: no cap, as before.
 */
export const JOB_ID_BADGE_FIT = 'flex-shrink-0 max-w-[9rem] sm:max-w-none truncate';

export default function JobIdBadge({
  children,
  className,
  title,
}: {
  /** The Job ID itself, e.g. `job.job_id` or `assessment.jd_short_id`. */
  children: ReactNode;
  /** Layout classes for the surrounding row — never colours. */
  className?: string;
  /** Hover text — the full id where `JOB_ID_BADGE_FIT` may truncate it. */
  title?: string;
}) {
  return (
    <span title={title} className={className ? `${JOB_ID_BADGE_CLASS} ${className}` : JOB_ID_BADGE_CLASS}>
      {children}
    </span>
  );
}
