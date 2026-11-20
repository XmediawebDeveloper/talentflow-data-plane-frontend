'use client';

import { FileText, FileSearch, Briefcase, Sparkle, Plus, Loader2 } from 'lucide-react';
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
    <ModalA11y><div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-in zoom-in-95 fade-in duration-200 max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <div className="px-6 sm:px-8 pt-8 pb-6 overflow-y-auto">
          {/* Header: small icon + title */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-11 h-11 shrink-0 bg-brand-blue/10 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-blue" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug pt-1">
              Find matching candidates from the Resume Database?
            </h2>
          </div>

          {/* Illustration — emboss-effect icon on a decorative disc */}
          <div className="relative w-40 h-40 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-blue/10 to-brand-blue/5" />

            <Sparkle className="absolute top-2 left-5 w-3.5 h-3.5 text-brand-blue/50" />
            <Plus className="absolute top-3 right-4 w-3 h-3 text-brand-blue/40" strokeWidth={3} />
            <span className="absolute top-[42%] -left-1 w-1.5 h-1.5 rounded-full bg-brand-blue/30" />
            <span className="absolute top-[52%] left-1 w-1 h-1 rounded-full bg-brand-blue/30" />
            <span className="absolute bottom-6 left-3 w-2 h-2 rounded-full ring-1 ring-brand-blue/30" />
            <span className="absolute bottom-9 -right-1 w-1.5 h-1.5 rounded-full bg-brand-blue/30" />
            <span className="absolute top-9 -right-2 w-2 h-2 rounded-full ring-1 ring-brand-blue/30" />

            <div className="relative w-16 h-16">
              {/* Emboss effect: a light highlight offset up-left and a dark shadow
                  offset down-right behind the true-color icon, giving it a raised,
                  bevelled/engraved look rather than a flat outline. */}
              <FileSearch
                className="absolute inset-0 w-16 h-16 text-white"
                strokeWidth={1.75}
                style={{ transform: 'translate(-1.25px, -1.25px)' }}
              />
              <FileSearch
                className="absolute inset-0 w-16 h-16 text-brand-blue-2"
                strokeWidth={1.75}
                style={{ transform: 'translate(1.25px, 1.25px)', opacity: 0.55 }}
              />
              <FileSearch className="relative w-16 h-16 text-brand-blue" strokeWidth={1.75} />
            </div>
          </div>

          {/* Description */}
          <p className="text-center tf-body-secondary sm:text-base leading-relaxed mb-5">
            <span className="font-semibold text-brand-blue">AI Talent Match</span> will scan your resume database
            against the job description and rank the closest candidates.
          </p>

          {/* Job pill */}
          <div className="flex items-center gap-3 bg-brand-blue/5 dark:bg-brand-blue/10 rounded-xl px-4 py-3">
            <div className="w-8 h-8 shrink-0 bg-brand-blue/15 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            {job ? (
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {job.job_id && <JobIdBadge className="flex-shrink-0">{job.job_id}</JobIdBadge>}
                <span className="tf-row-name truncate min-w-0" title={job.title}>
                  {job.title}
                </span>
                {/* The Job Openings card's version badge. */}
                <span className="tf-badge bg-gray-50 text-gray-700 border border-gray-200 flex gap-1.5 flex-shrink-0 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                  v{job.versionNumber ?? 1}
                </span>
              </div>
            ) : (
              <span className="tf-row-name truncate">{jobTitle}</span>
            )}
          </div>
        </div>

        {/* Footer — Cancel, then the action, bottom-right at their own width. */}
        <div className="px-6 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-wrap items-center justify-end gap-3 shrink-0">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isLoading}
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
