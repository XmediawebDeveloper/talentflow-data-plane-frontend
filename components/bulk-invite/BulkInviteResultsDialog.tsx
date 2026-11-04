'use client';

import { Send } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import BulkInviteProgressPanel from './BulkInviteProgressPanel';
import type { TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';

/**
 * A bulk send's progress and results, opened from the floating progress
 * widget anywhere in the app (the popup that started the send may be long
 * closed). The standard AppModal in its white (`plain`) header, Cancel in the
 * footer, no ✕. The subtitle names what was sent the way the invite popup
 * does: "JD-343 Senior AI Engineer V1 - Assessment V1", with the app's own
 * Job ID badge and version pills.
 */
export default function BulkInviteResultsDialog({
  job,
  onClose,
}: {
  job: TrackedBulkInvite;
  onClose: () => void;
}) {
  const kindLabel = job.kind === 'assessment' ? 'Assessment' : 'AI Interview';
  /* Runs tracked before the versions were recorded: read the version from the
     label the backend keeps ("… - Version 1"). */
  const version = job.versionNumber ?? (Number(/version\s*(\d+)/i.exec(job.version_label ?? '')?.[1]) || undefined);
  const subtitle = job.jdTitle || job.jdCode ? (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-normal">
      {job.jdCode && <JobIdBadge className="flex-shrink-0">{job.jdCode}</JobIdBadge>}
      {job.jdTitle && <span className="min-w-0 [overflow-wrap:anywhere] text-gray-900 dark:text-slate-100">{job.jdTitle}</span>}
      {job.jobVersion ? <VersionPill kind="job" version={job.jobVersion} /> : null}
      <span className="whitespace-nowrap text-gray-900 dark:text-slate-100">- {kindLabel}</span>
      {version ? <VersionPill kind="assessment" version={version} /> : null}
    </span>
  ) : job.version_label || undefined;
  return (
    <AppModal
      open
      onCancel={onClose}
      cancelLabel="Close"
      size="lg"
      tone="plain"
      icon={<Send className="w-4 h-4 text-brand-blue" />}
      title={`${kindLabel} invitations`}
      subtitle={subtitle}
      zIndexClass="z-[70]"
      /* Same 16px above the "Invitation process completed" box as the panel
         leaves below it (its space-y-4), not the body's default 24px. */
      bodyClassName="pt-4 sm:pt-4"
    >
      <BulkInviteProgressPanel jobId={job.job_id} initialJob={job} />
    </AppModal>
  );
}
