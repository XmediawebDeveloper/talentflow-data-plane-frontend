'use client';

import { Archive, Ban } from 'lucide-react';
import { getStatusConfig } from '@/lib/utils/jobOpeningDisplay';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';

/* A Disabled / Archived job, as the Track Invites popups show it: a red
   "Job Disabled" badge beside the job name, and a banner under the header
   saying what still works and what is turned off. */

export type JobLockKind = 'disabled' | 'archived';

const LABEL: Record<JobLockKind, string> = { disabled: 'Disabled', archived: 'Archived' };

/* Disabled in red; Archived in its own Job Openings colour (getStatusConfig),
   so it reads the same as the job's status pill. */
export function JobLockBadge({ kind, title }: { kind: JobLockKind; title?: string }) {
  const archived = getStatusConfig('Archived');
  const tone = kind === 'archived'
    ? `${archived.bg} ${archived.text} border ${archived.border}`
    : 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line';
  const Icon = kind === 'archived' ? Archive : Ban;
  return (
    <span
      title={title}
      className={`inline-flex flex-shrink-0 items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${tone}`}
    >
      <Icon className="w-3.5 h-3.5" />
      Job {LABEL[kind]}
    </span>
  );
}

/* What still works and what is off. "Exported": the Invitation Status tab's
   Export Invitations, in both modules. */
const BANNER: Record<JobLockKind, { lead: string; still: string; off: string }> = {
  disabled: {
    lead: 'This job is disabled.',
    still: 'Invited candidates can still be viewed and exported.',
    off: 'Send New Invitation, Resend Invitation, Copy Link, Edit Email, and Revoke Link are also turned off.',
  },
  archived: {
    lead: 'This job is archived.',
    still: 'Its invitations are kept for reference — invited candidates can still be viewed and exported.',
    off: 'Send New Invitation, Resend Invitation, Copy Link, Edit Email, and Revoke Link are turned off for archived jobs.',
  },
};

export function JobLockBanner({ kind }: { kind: JobLockKind }) {
  const text = BANNER[kind];
  return (
    <div
      role="status"
      className="mx-2.5 sm:mx-6 mt-2.5 sm:mt-3 flex items-start gap-2.5 rounded-xl border border-warning-line bg-warning-subtle px-3 sm:px-4 py-2.5 flex-shrink-0"
    >
      <span aria-hidden="true" className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-brand-orange text-white text-xs font-bold flex items-center justify-center">!</span>
      <p className="min-w-0 text-sm text-gray-800 dark:text-slate-200 leading-relaxed">
        <strong className="font-semibold text-gray-900 dark:text-slate-50">{text.lead}</strong>{' '}
        {text.still}
        <br />
        {text.off}
      </p>
    </div>
  );
}

/** A job version that is Disabled / Archived, for JobVersionsLockBanner. */
export interface LockedJobVersion {
  version: number;
  status: JobLockKind;
}

/** Which job versions (by their status) are locked: Disabled / Archived,
 *  in version order, plus the active (Published) ones. */
export function splitJobVersions(versions: { version_number?: number | null; status?: string | null }[]): {
  locked: LockedJobVersion[];
  active: number[];
} {
  const locked: LockedJobVersion[] = [];
  const active: number[] = [];
  for (const v of versions) {
    const n = v.version_number;
    if (n == null) continue;
    const s = String(v.status || '').toLowerCase();
    if (s === 'disabled' || s === 'archived') locked.push({ version: n, status: s });
    else if (s === 'published') active.push(n);
  }
  locked.sort((a, b) => a.version - b.version);
  active.sort((a, b) => a - b);
  return { locked, active };
}

/** A job status that locks invitations — Disabled / Archived — else null. */
export function jobLockKindOf(status: string | null | undefined): JobLockKind | null {
  const s = String(status || '').toLowerCase();
  return s === 'disabled' || s === 'archived' ? s : null;
}

/** The job version's Disabled / Archived status in its Job Openings colour —
 *  beside a version number (the Job Version column) or in the banner. */
export function JobVersionStatusPill({ status }: { status: JobLockKind }) {
  const tone = getStatusConfig(LABEL[status]);
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold border ${tone.bg} ${tone.text} ${tone.border}`}>
      {LABEL[status]}
    </span>
  );
}

/* Some versions of a job are Disabled / Archived: names them (version +
   status), and says where invitation actions still work. Used on the
   job-wide trackers and on a locked version's details page. */
export function JobVersionsLockBanner({ locked, active }: { locked: LockedJobVersion[]; active: number[] }) {
  if (locked.length === 0) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-warning-line bg-warning-subtle px-3 sm:px-4 py-2.5"
    >
      <span aria-hidden="true" className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-brand-orange text-white text-xs font-bold flex items-center justify-center">!</span>
      <p className="min-w-0 text-sm text-gray-800 dark:text-slate-200 leading-relaxed">
        {locked.map((v, i) => (
          <span key={v.version}>
            {i > 0 && (i === locked.length - 1 ? ' and ' : ', ')}
            <span className="inline-flex items-center gap-1 align-middle">
              <VersionPill kind="job" version={v.version} /> is <JobVersionStatusPill status={v.status} />
            </span>
          </span>
        ))}
        {'. '}
        {locked.length === 1 ? 'Its' : 'Their'} invitation records can still be viewed and exported,{' '}
        {active.length > 0
          ? <>but invitation actions are available only for the active version{active.length === 1 ? '' : 's'} ({active.map((n) => `V${n}`).join(', ')}).</>
          : <>but no version of this job is active, so invitation actions are turned off.</>}
      </p>
    </div>
  );
}
