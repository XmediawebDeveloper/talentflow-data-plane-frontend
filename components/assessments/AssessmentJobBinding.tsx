import JobIdBadge from '@/components/jobs/JobIdBadge';

/**
 * The job an assessment is configured against, as values only, in the order
 * JD ID · role · job version — e.g. [JD-017] Lead Java Developer [v1].
 *
 * Inline, so it can stand in for the job title inside a sentence. Wraps rather
 * than overflowing on a narrow screen, and a long role breaks inside itself
 * instead of pushing the version off the line. Any value the data does not
 * carry is left out rather than guessed at.
 */
export default function AssessmentJobBinding({
  jobId,
  role,
  version,
}: {
  jobId?: string | null;
  role?: string | null;
  version?: number | null;
}) {
  if (!jobId && !role && version == null) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 max-w-full align-middle">
      {jobId && <JobIdBadge className="flex-shrink-0">{jobId}</JobIdBadge>}
      {role && (
        <span className="min-w-0 text-brand-blue font-medium [overflow-wrap:anywhere]">{role}</span>
      )}
      {version != null && (
        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-gray-700 ring-1 ring-gray-200">
          v{version}
        </span>
      )}
    </span>
  );
}
