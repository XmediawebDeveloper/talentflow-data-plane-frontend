'use client';

import type { JDLineageVersion } from '@/lib/services/jdService';
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

/** Which job badge (if any) to show beside a job name: the Disabled / Archived /
 *  Draft status of the job VERSION the assessment or interview is linked to.
 *  Another version of the same job still being Published does not hide it —
 *  the linked version is what locks the assessment / interview (Share, Invite,
 *  Edit), so the badge has to say so wherever that job is listed.
 *  `_versions` is kept for callers that still pass the lineage. */
export function jobLockBadgeFor(
  jdStatus: string | null | undefined,
  _versions?: JDLineageVersion[] | undefined,
): JobStatusBadgeKind | null {
  return jobStatusBadgeKind(jdStatus);
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
