import { Info } from 'lucide-react';

/**
 * The "Job Eligibility" note above a job list run in JobOpeningPickerList's
 * `excludeDraftsOnly` mode - which statuses are listed and which can be
 * picked. One component so Resume Scoring's Score Resumes list and the
 * Resume Database's Score Resume popup always say the same thing.
 */
const SCORING_ELIGIBILITY =
  'Every job is listed in every status except Draft — Published, Republished, Disabled and Archived — and View Versions shows its versions the same way. Only Published (or Republished) jobs and versions can be selected for scoring; Disabled and Archived ones are shown greyed out for reference. Drafts are not listed.';

export default function JobEligibilityNote({
  className = '',
  description = SCORING_ELIGIBILITY,
}: {
  className?: string;
  /** The rule this list applies. Defaults to the Resume Scoring wording. */
  description?: string;
}) {
  return (
    <div className={`flex items-start gap-2 rounded-lg bg-brand-blue/[0.06] border border-brand-blue/20 px-3 py-2.5 ${className}`}>
      <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">Job Eligibility</p>
        <p className="mt-0.5 text-xs text-gray-700 dark:text-slate-300">{description}</p>
      </div>
    </div>
  );
}
