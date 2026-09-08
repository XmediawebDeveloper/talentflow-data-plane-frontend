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

export default function JobIdBadge({
  children,
  className,
}: {
  /** The Job ID itself, e.g. `job.job_id` or `assessment.jd_short_id`. */
  children: ReactNode;
  /** Layout classes for the surrounding row — never colours. */
  className?: string;
}) {
  return (
    <span className={className ? `${JOB_ID_BADGE_CLASS} ${className}` : JOB_ID_BADGE_CLASS}>
      {children}
    </span>
  );
}
