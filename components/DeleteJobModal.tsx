'use client';

import { Trash2, Briefcase, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DeleteJobModalProps {
  isOpen: boolean;
  /**
   * What is being deleted, already formatted for the pill — a single JD's
   * `formatJobVersionLabel(job)` ("JD-152 QA Test Engineer V2"), or a bulk
   * summary such as "12 Job Description Selected".
   */
  jobLabel: string;
  /** How many JDs this will delete — switches the copy to the plural. */
  count?: number;
  /** Optional warning under the JD chip — e.g. which selected jobs a bulk
   *  delete will skip because they are in use. */
  note?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * The confirm shown before a JD is deleted. It is the same popup component as
 * ArchiveJobModal / DisableJobModal — same frame, header (icon disc + title +
 * description + JD chip) and bordered footer — tinted destructive red, so delete
 * reads as one family with archive (orange) and disable (red). Only the icon,
 * title, description and primary action say "delete".
 */
export default function DeleteJobModal({
  isOpen,
  jobLabel,
  count = 1,
  note,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteJobModalProps) {
  if (!isOpen) return null;

  const many = count > 1;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-in zoom-in-95 fade-in duration-200 max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <div className="px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto">
          {/* Header: red disc + title + the JDs this is about */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 shrink-0 rounded-full bg-destructive-subtle flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
                Delete Job Openings
              </h2>
              <p className="mt-1.5 tf-body-secondary sm:text-base">
                Are you sure you want to delete the following job opening{many ? 's' : ''}? This action cannot be undone.
              </p>
              {/* The house grey pill, so the selection reads as a chip and not as body copy. */}
              <span className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg bg-gray-100 dark:bg-slate-800 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                <Briefcase className="w-4 h-4 shrink-0 text-gray-500 dark:text-slate-400" />
                <span className="truncate tf-row-title">
                  {jobLabel}
                </span>
              </span>
              {note && (
                <p className="mt-3 rounded-lg border border-warning-line bg-warning-subtle/60 px-3 py-2 tf-body">
                  {note}
                </p>
              )}
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
                Deleting...
              </span>
            ) : (
              'Delete'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
