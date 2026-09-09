'use client';

import {
  Archive,
  Briefcase,
  Info,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';

/**
 * What archiving actually does, spelled out before it happens.
 *
 * Kept as data, not markup: the list renders whatever is here, so adding a
 * fifth consequence is one entry and not a JSX change.
 */
const ARCHIVE_EFFECTS = [
  'Not appear in active job lists.',
  'Stop new candidate flow.',
  'Pause all related automations (AI Talent Match, Scoring, Assessments & AI Interviews).',
  'Keep all existing data safe.',
] as const;

export interface ArchiveJobModalProps {
  isOpen: boolean;
  /**
   * What is being archived, already formatted for the pill — pass
   * `formatJobVersionLabel(job)` so it reads "JD-152 QA Test Engineer V2"
   * exactly as every other surface that names one specific JD version does.
   * For a bulk archive, a summary such as "12 job descriptions".
   */
  jobLabel: string;
  /**
   * How many JDs this will archive. Omitted (or 1) is the single-JD wording;
   * anything higher switches the copy to the plural throughout, so the bulk
   * action gets the same warning rather than a second dialog that could drift
   * from this one.
   */
  count?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * The confirm shown before a JD is archived, from every surface that archives
 * one — the Job Openings list rows, its grid cards, the version-history rows,
 * the bulk action and the Job Details page. They all render THIS component
 * rather than their own dialog, so the warning cannot drift between them.
 *
 * Visual language is shared with `DisableJobModal` (icon disc + title + JD
 * chip, a tinted callout, a plain bullet list, a reassurance banner, a bordered
 * footer) so the two read as one family of confirm — archive tinted orange,
 * disable tinted red — rather than two different dialogs that happen to sit
 * next to each other in the same menu.
 */
export default function ArchiveJobModal({
  isOpen,
  jobLabel,
  count = 1,
  onConfirm,
  onCancel,
  isLoading = false,
}: ArchiveJobModalProps) {
  if (!isOpen) return null;

  /* One switch, read by every string below, so the singular and plural wordings
     cannot fall out of step with each other. */
  const many = count > 1;
  const subject = many ? 'these JDs' : 'this JD';

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <button
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 text-gray-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto">
          {/* Header: tinted disc + title + the JD this is about */}
          <div className="flex items-start gap-4 pr-8">
            <div className="w-12 h-12 shrink-0 rounded-full bg-brand-orange/10 dark:bg-orange-500/15 flex items-center justify-center">
              <Archive className="w-6 h-6 text-brand-orange-deep dark:text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
                {many ? `Archive ${count} Job Descriptions?` : 'Archive Job Description?'}
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-gray-600 dark:text-slate-400">
                Are you sure you want to archive the following job description{many ? 's' : ''}?
              </p>
              {/* The house grey pill, so the JD reads as a chip and not as body copy. */}
              <span className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg bg-gray-100 dark:bg-slate-800 px-3 py-1.5 ring-1 ring-gray-200 dark:ring-slate-700">
                <Briefcase className="w-4 h-4 shrink-0 text-gray-500 dark:text-slate-400" />
                <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {jobLabel}
                </span>
              </span>
            </div>
          </div>

          {/* Where it goes */}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand-orange/20 dark:border-orange-500/25 bg-brand-orange/[0.06] dark:bg-orange-500/10 px-4 py-3">
            <Info className="w-5 h-5 shrink-0 text-brand-orange-deep dark:text-orange-300 mt-0.5" />
            <div className="min-w-0 text-sm text-gray-700 dark:text-slate-300">
              <p>
                Archiving {subject} will move {many ? 'them' : 'it'} to the{' '}
                <span className="font-semibold text-brand-orange-deep dark:text-orange-300">Archived</span> section.
              </p>
              <p className="mt-0.5 text-gray-600 dark:text-slate-400">
                You can view the details, reports and history of {subject} anytime.
              </p>
            </div>
          </div>

          {/* What stops, and what does not */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              While archived, {subject} will:
            </p>
            <ul className="mt-3 space-y-2.5">
              {ARCHIVE_EFFECTS.map(effect => (
                <li key={effect} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-orange shrink-0" aria-hidden="true" />
                  <span>{effect}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* The reassurance — archiving is not deleting */}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 dark:border-emerald-500/25 bg-emerald-50/60 dark:bg-emerald-500/10 px-4 py-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-gray-900 dark:text-slate-100">
                You can unarchive {subject} anytime to restore all features.
              </p>
              <p className="mt-0.5 text-gray-600 dark:text-slate-400">No data will be lost.</p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-6 py-2.5 text-sm font-semibold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-6 py-2.5 text-sm font-semibold bg-brand-orange hover:bg-brand-orange-deep text-white rounded-lg shadow-md shadow-brand-orange/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Archiving...
              </span>
            ) : (
              'Yes, Archive'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
