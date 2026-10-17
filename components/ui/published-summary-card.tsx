import React from 'react';
import JobIdBadge from '@/components/jobs/JobIdBadge';

/**
 * The "what was published" card under a Published success screen's headline —
 * shared by Assessment Published and AI Interview Published, so both name the
 * published thing the same way, on one line:
 *
 *   [JD-294] Java Developer [V1] [Assessment V2]
 *
 * The JD ID, the job version and the published thing's own version keep the
 * badges this card always drew them with; parts the record does not carry are
 * left out rather than guessed at. From `sm` up it is one line on which only
 * the role truncates — the badges are what tell this publish apart from the
 * job's others. On a phone the line wraps instead, so the role reads in full,
 * and the icon steps aside the way the job details header's does.
 */
export default function PublishedSummaryCard({
  icon,
  jobId,
  jobName,
  jobVersion,
  ownVersion,
  className = '',
}: {
  icon: React.ReactNode;
  jobId?: string | null;
  jobName?: string | null;
  /** The job version, shown bare ("V1"). */
  jobVersion?: number | null;
  /** The published thing's own version, already named ("Assessment V2"). */
  ownVersion?: string | null;
  className?: string;
}) {
  return (
    <div className={`bg-slate-50 rounded-xl border border-gray-100 ring-1 ring-black/[0.02] px-4 sm:px-5 py-3 sm:py-3.5 flex items-center gap-3 sm:gap-4 text-left ${className}`}>
      <div className="hidden sm:flex w-10 h-10 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1 flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start gap-x-1.5 gap-y-1 sm:gap-2 sm:whitespace-nowrap">
        {jobId && <JobIdBadge className="flex-shrink-0">{jobId}</JobIdBadge>}
        {jobName && (
          <span className="min-w-0 break-words sm:truncate text-sm sm:text-base font-semibold text-gray-900" title={jobName}>
            {jobName}
          </span>
        )}
        {jobVersion != null && (
          <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-gray-700 ring-1 ring-gray-200">
            V{jobVersion}
          </span>
        )}
        {ownVersion && (
          <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
            {ownVersion}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The ways on from a Published success screen, under its card: each button as
 * wide as its label from `sm` up, centred, a step under the default `md` size
 * (h-9, px-3.5 — the repo's `!h-9` override); stacked full-width on a phone.
 * Shared so the Job, Assessment and AI Interview screens cannot drift apart.
 */
export function PublishedActions({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center [&>button]:justify-center [&>button]:!h-9 [&>button]:!px-3.5 ${className}`}>
      {children}
    </div>
  );
}
