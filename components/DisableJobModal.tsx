'use client';

import { AlertTriangle, Briefcase, Info, Loader2 } from 'lucide-react';
import { getJDDisableImpactModules } from '@/lib/utils/jdUsageModules';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import type { Job } from '@/lib/types/types';

export interface DisableJobModalProps {
  isOpen: boolean;
  /**
   * What is being disabled, already formatted for the pill — pass
   * `formatJobVersionLabel(job)` so it reads "JD-152 QA Test Engineer V2"
   * exactly as the archive confirm's chip does for the same job.
   */
  jobLabel: string;
  /**
   * The ONE job version being disabled. Given, the header names it the way the
   * lists do — Job ID badge, job name, job version pill — in place of the grey
   * `jobLabel` pill. Bulk disable has no single job and leaves it out.
   */
  job?: Pick<Job, 'job_id' | 'title' | 'versionNumber'> | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * The confirm shown before a JD is disabled, from every surface that disables
 * one — the Job Openings list, the Job Details page and the JD list sheet.
 * They all render THIS component rather than their own dialog, so the warning
 * cannot depend on which screen the recruiter happened to start from.
 *
 * Visual language is shared with `ArchiveJobModal` (icon disc + title + JD
 * chip, a tinted callout, a plain bullet list, a reassurance banner, a bordered
 * footer) so the two read as one family of confirm — disable tinted red,
 * archive tinted orange — rather than two different dialogs that happen to
 * sit next to each other in the same menu.
 */
export default function DisableJobModal({
  isOpen,
  jobLabel,
  job,
  onConfirm,
  onCancel,
  isLoading = false,
}: DisableJobModalProps) {
  if (!isOpen) return null;

  const modules = getJDDisableImpactModules();

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-in zoom-in-95 fade-in duration-200 max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <div className="px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto">
          {/* Header: red disc + title + the JD this is about */}
          <div className="flex items-start gap-4 sm:pr-8">
            <div className="w-12 h-12 shrink-0 rounded-full bg-destructive-subtle flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
                Disable Job Description?
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-gray-600 dark:text-slate-400">
                Are you sure you want to disable the following job description?
              </p>
              {job ? (
                /* Wraps on a phone: the version pill drops below a long name. */
                <div className="mt-3 flex flex-wrap items-center gap-2 min-w-0">
                  {job.job_id && <JobIdBadge className="flex-shrink-0">{job.job_id}</JobIdBadge>}
                  <span className="min-w-0 [overflow-wrap:anywhere] text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50">
                    {job.title || 'Untitled'}
                  </span>
                  {job.versionNumber ? <VersionPill kind="job" version={job.versionNumber} /> : null}
                </div>
              ) : (
              /* The house grey pill, so the JD reads as a chip and not as body copy. */
              <span className="mt-3 inline-flex max-w-full items-start sm:items-center gap-2 rounded-lg bg-gray-100 dark:bg-slate-800 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                <Briefcase className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-gray-500 dark:text-slate-400" />
                {/* Wraps on a phone: truncating there cut even "1 Job Description Selected" short. */}
                <span className="min-w-0 [overflow-wrap:anywhere] sm:truncate tf-cell-name">
                  {jobLabel}
                </span>
              </span>
              )}
            </div>
          </div>

          {/* What stops */}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/70 px-4 py-3">
            <Info className="w-5 h-5 shrink-0 text-destructive mt-0.5" />
            <p className="tf-body">
              If you disable this JD, it will{' '}
              <span className="font-semibold text-destructive">not</span>{' '}
              be available to use in the following features:
            </p>
          </div>

          <ul className="mt-4 space-y-2.5">
            {modules.map(module => (
              <li key={module.key} className="flex items-start gap-2.5 tf-body">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-destructive shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">{module.name}</span>
                  {' – '}
                  {module.summary}.
                </span>
              </li>
            ))}
          </ul>

          {/* The reassurance — disabling is not deleting */}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 dark:border-blue-500/25 bg-blue-50/70 dark:bg-blue-500/10 px-4 py-3">
            <Info className="w-5 h-5 shrink-0 text-brand-blue mt-0.5" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-gray-900 dark:text-slate-100">
                You can re-enable this JD at any time if needed.
              </p>
              <p className="mt-0.5 text-gray-600 dark:text-slate-400">No data will be lost.</p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-6"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Disabling...
              </span>
            ) : (
              'Yes, Disable'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
