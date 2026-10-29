'use client';

import type { JDLineageVersion } from '@/lib/services/jdService';
import { jobVersionDisplayStatus } from '@/components/assessments/AssessmentVersionHistoryPanel';
import { getStatusConfig } from '@/lib/utils/jobOpeningDisplay';

/* The job's own Disabled / Archived / Draft status, drawn beside a job name on
   the AI Interview and Assessment lists. It marks the JOB: the interview's or
   assessment's own status keeps its own column / pill. */

export type JobStatusBadgeKind = 'disabled' | 'archived' | 'draft';

const LABEL: Record<JobStatusBadgeKind, 'Disabled' | 'Archived' | 'Draft'> = {
  disabled: 'Disabled',
  archived: 'Archived',
  draft: 'Draft',
};

/** The job's status when it is one the Job Name gets a badge for — Disabled,
 *  Archived or Draft — else null. An unknown or missing status gets no badge. */
export function jobStatusBadgeKind(jdStatus: string | null | undefined): JobStatusBadgeKind | null {
  const status = String(jdStatus || '').toLowerCase();
  return status === 'disabled' || status === 'archived' || status === 'draft' ? status : null;
}

/** Which job badge (if any) to show beside a job name: the JD's own Disabled /
 *  Archived / Draft status, unless another version of the same job is still
 *  Published or Republished — one closed version does not speak for a live job.
 *  `versions` undefined (not loaded yet) falls back to the JD's own status. */
export function jobLockBadgeFor(
  jdStatus: string | null | undefined,
  versions: JDLineageVersion[] | undefined,
): JobStatusBadgeKind | null {
  const own = jobStatusBadgeKind(jdStatus);
  if (!own || !versions?.length) return own;
  const anyLive = versions.some((v) => {
    const label = jobVersionDisplayStatus(v.status, v.current_version);
    return label === 'Published' || label === 'Republished';
  });
  return anyLive ? null : own;
}

/* The Job Openings status pill itself (getStatusConfig: same colours, border
   and dot), so a job reads the same here as on its own page. `title` says
   what the status means on the page showing it. */
export default function JobStatusBadge({ kind, title }: { kind: JobStatusBadgeKind; title?: string }) {
  const label = LABEL[kind];
  const tone = getStatusConfig(label);
  return (
    <span
      title={title ?? `This job is ${label.toLowerCase()}.`}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border ${tone.bg} ${tone.text} ${tone.border}`}
    >
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {label}
    </span>
  );
}
