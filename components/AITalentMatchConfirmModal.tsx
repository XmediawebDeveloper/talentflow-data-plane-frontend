'use client';

import { Sparkles, Briefcase, FileText, FolderSearch, ListOrdered, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import type { Job } from '@/lib/types/types';
import { ModalA11y } from '@/components/ui/modal-a11y';

interface AITalentMatchConfirmModalProps {
  isOpen: boolean;
  jobTitle: string;
  /** The job itself, so the pill reads JD-275 · title · v1 with the Job
   *  Openings card's own badges. Without it the pill shows `jobTitle`. */
  job?: Pick<Job, 'job_id' | 'title' | 'versionNumber'> | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/* What running AI Talent Match does, in order. */
const STEPS = [
  { icon: FileText, title: 'Reads this job description', text: 'Its role, skills and experience become the match criteria.' },
  { icon: FolderSearch, title: 'Scans your Resume Database', text: 'Every résumé you have stored is compared against the job.' },
  { icon: ListOrdered, title: 'Ranks the closest candidates', text: 'You’ll find them in the job’s AI Talent Match Results tab.' },
];

/**
 * Confirm before running AI Talent Match for one job. Content-led: the
 * question, the job it runs for, and the three steps it takes — no artwork.
 */
export default function AITalentMatchConfirmModal({
  isOpen,
  jobTitle,
  job,
  onConfirm,
  onCancel,
  isLoading = false,
}: AITalentMatchConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-lg animate-in zoom-in-95 fade-in duration-200 max-h-[calc(100dvh-1.5rem)] flex flex-col tf-round-edges">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-5 overflow-y-auto">
          {/* Header: the question, and what AI Talent Match is in one line. */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center dark:bg-brand-blue/20">
              <Sparkles className="w-5 h-5 text-brand-blue dark:text-blue-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold leading-snug text-gray-900 dark:text-slate-50">
                Find matching candidates?
              </h2>
              <p className="mt-1 tf-body-secondary leading-relaxed">
                <span className="font-semibold text-brand-blue dark:text-blue-300">AI Talent Match</span> scans your
                Resume Database against this job and ranks the closest candidates.
              </p>
            </div>
          </div>

          {/* The job it runs for. */}
          <div className="mt-5">
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Job</div>
            <div className="flex items-center gap-3 rounded-xl border border-brand-blue/10 bg-brand-blue/5 px-3 py-2.5 dark:bg-brand-blue/10">
              <div className="w-8 h-8 shrink-0 bg-brand-blue/15 rounded-lg flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-brand-blue dark:text-blue-300" />
              </div>
              {job ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  {job.job_id && <JobIdBadge className="flex-shrink-0">{job.job_id}</JobIdBadge>}
                  <span className="tf-row-name min-w-0 flex-1 truncate" title={job.title}>
                    {job.title}
                  </span>
                  {/* The Job Openings card's version badge. */}
                  <span className="tf-badge bg-gray-50 text-gray-700 border border-gray-200 flex gap-1.5 flex-shrink-0 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                    v{job.versionNumber ?? 1}
                  </span>
                </div>
              ) : (
                <span className="tf-row-name min-w-0 truncate" title={jobTitle}>{jobTitle}</span>
              )}
            </div>
          </div>

          {/* What happens next — three steps. */}
          <div className="mt-5">
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">What happens</div>
            <ol className="space-y-2.5">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-blue text-[0.5625rem] font-bold leading-none text-white" aria-hidden>
                      {i + 1}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</span>
                    <span className="block tf-meta">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer — Cancel, then the action, bottom-right at their own width;
            full width and stacked (action on top) on narrow phones. */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3 shrink-0">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </span>
            ) : (
              'Yes, find matches'
            )}
          </Button>
        </div>
      </div>
    </div></ModalA11y>
  );
}
