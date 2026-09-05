'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * What disabling a JD takes it out of, spelled out before it happens.
 *
 * Data, not markup, for the same reason `ArchiveJobModal` keeps its list that
 * way: adding a fourth downstream module is one entry here rather than an edit
 * in every copy of the dialog.
 */
const DISABLE_EFFECTS = ['Resume Scoring', 'Assessment Generation', 'AI Talent Match'];

export interface DisableJobModalProps {
  isOpen: boolean;
  /** The JD being disabled, named in the confirm line. */
  jobTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * The confirm shown before a JD is disabled, from every surface that disables
 * one — the Job Openings list, the Job Details page and the JD list sheet.
 *
 * There were THREE implementations of this before, and they had drifted in
 * every way three copies can:
 *
 *   - Job Openings had this design: the red warning disc, the JD named in the
 *     question, the consequences as a bulleted list.
 *   - Job Details had a plain header-bar modal with an X — no warning icon, and
 *     it never named the JD being disabled, so the one detail that stops you
 *     disabling the wrong thing was the detail it omitted.
 *   - The JD list sheet used the generic `ConfirmationDialog`, flattening the
 *     bullets into one long sentence AND listing a fourth module ("Reporting")
 *     that neither of the others mentioned — so the app gave two different
 *     answers about what disabling actually does.
 *
 * They all render THIS now, so the warning cannot depend on which screen the
 * recruiter happened to start from. The design is Job Openings', which is the
 * one that named the JD and showed the consequences as a scannable list; dark
 * mode variants are added, which none of the three had.
 */
export default function DisableJobModal({
  isOpen,
  jobTitle,
  onConfirm,
  onCancel,
  isLoading = false,
}: DisableJobModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <div className="px-5 sm:px-6 pt-6 pb-4 overflow-y-auto">
          {/* Header: red disc + title + the JD this is about */}
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">
                Disable Job Description?
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                Are you sure you want to disable{' '}
                {/* The title is `break-words`, not truncated: this is the line
                    that tells you WHICH JD you are about to disable, so it must
                    never be the thing that gets cut off. */}
                <span className="font-medium text-gray-800 dark:text-slate-200 break-words">
                  &quot;{jobTitle}&quot;
                </span>
                ?
              </p>
            </div>
          </div>

          {/* Indented to sit under the title, not under the icon — but only
              once there is room for it; on a phone it runs full width. */}
          <div className="mt-3 sm:mt-4 sm:ml-16">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-2 sm:mb-3">
              If you disable this JD, it will be removed from:
            </p>
            <ul className="list-disc list-inside text-xs sm:text-sm text-gray-600 dark:text-slate-400 space-y-1">
              {DISABLE_EFFECTS.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-gray-500 dark:text-slate-500">
              You can re-enable this JD later if needed.
            </p>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 shrink-0">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Disabling...
              </span>
            ) : (
              'Yes, Disable'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
