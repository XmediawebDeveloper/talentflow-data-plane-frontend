import { Check, EyeOff, Info, Minus } from 'lucide-react';

/**
 * The "Job Eligibility" note above a job list run in JobOpeningPickerList's
 * `excludeDraftsOnly` mode - which statuses are listed and which can be
 * picked. One component so Resume Scoring's Score Resumes list and the
 * Resume Database's Score Resume popup always say the same thing.
 */
const SCORING_ELIGIBILITY =
  'Every job is listed in every status except Draft — Published, Republished, Disabled and Archived — and View Versions shows its versions the same way. Only Published (or Republished) jobs and versions can be selected for scoring; Disabled and Archived ones are shown greyed out for reference. Drafts are not listed.';

/** The same rule, worded for AI Talent Match's job lists. */
export const MATCH_ELIGIBILITY =
  'Every job is listed in every status except Draft — Published, Republished, Disabled and Archived — and View Versions shows its versions the same way. Only Published (or Republished) jobs and versions can be selected for AI Talent Match; Disabled and Archived ones are shown greyed out for reference. Drafts are not listed.';

export type JobEligibilityLegendItem = { label: string; tone: string; Icon: typeof Check; hint: string };

/* Chip tones for the three things a list can do with a status. */
const SELECTABLE = 'bg-success-subtle text-success ring-success-line';
const GREYED = 'bg-[var(--muted)] text-[var(--muted-foreground)] ring-[var(--border)]';
const HIDDEN = 'bg-[var(--card)] text-[var(--text-muted)] ring-[var(--border)] line-through';

/* The statuses the sentence names, as a glanceable legend. */
const LEGEND: JobEligibilityLegendItem[] = [
  { label: 'Published', tone: SELECTABLE, Icon: Check, hint: 'Can be selected' },
  { label: 'Republished', tone: SELECTABLE, Icon: Check, hint: 'Can be selected' },
  { label: 'Disabled', tone: GREYED, Icon: Minus, hint: 'Shown greyed out for reference' },
  { label: 'Archived', tone: GREYED, Icon: Minus, hint: 'Shown greyed out for reference' },
  { label: 'Draft', tone: HIDDEN, Icon: EyeOff, hint: 'Not listed' },
];

/** Create Assessment's list: Disabled jobs are hidden there, not greyed. */
export const ASSESSMENT_ELIGIBILITY_LEGEND: JobEligibilityLegendItem[] = [
  { label: 'Published', tone: SELECTABLE, Icon: Check, hint: 'Can be selected' },
  { label: 'Republished', tone: SELECTABLE, Icon: Check, hint: 'Can be selected' },
  { label: 'Archived', tone: GREYED, Icon: Minus, hint: 'Shown greyed out for reference' },
  { label: 'Disabled', tone: HIDDEN, Icon: EyeOff, hint: 'Not listed' },
  { label: 'Draft', tone: HIDDEN, Icon: EyeOff, hint: 'Not listed' },
];

export default function JobEligibilityNote({
  className = '',
  description = SCORING_ELIGIBILITY,
  showLegend = false,
  legend = LEGEND,
}: {
  className?: string;
  /** The rule this list applies. Defaults to the Resume Scoring wording. */
  description?: string;
  /** Status chips (Published · Republished · Disabled · Archived · Draft)
   *  beside the title, ahead of the full sentence. */
  showLegend?: boolean;
  /** The chips, when this list treats a status differently from scoring. */
  legend?: JobEligibilityLegendItem[];
}) {
  if (showLegend) {
    return (
      <div className={`rounded-sm border border-[var(--info-line)] bg-[var(--info-subtle)] px-3 py-2.5 ${className}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--info-strong)]">
            <Info className="h-4 w-4 shrink-0" />
            Job Eligibility
          </p>
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Job statuses">
            {legend.map(({ label, tone, Icon, hint }) => (
              <li key={label} title={hint} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tone}`}>
                <Icon className="h-3 w-3 shrink-0" />{label}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-1.5 tf-meta leading-relaxed">{description}</p>
      </div>
    );
  }
  return (
    <div className={`flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5 ${className}`}>
      <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="tf-caption">Job Eligibility</p>
        <p className="mt-0.5 tf-meta">{description}</p>
      </div>
    </div>
  );
}
