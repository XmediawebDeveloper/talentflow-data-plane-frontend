'use client';

import {
  Archive,
  Briefcase,
  Info,
  UserSearch,
  FileSearch,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';

/**
 * What archiving actually does, spelled out before it happens.
 *
 * Archiving used to be a single click straight from a three-dot menu with no
 * confirm at all, which made an irreversible-looking action feel accidental —
 * and it is not obvious from "Archive" alone that scoring, assessments and AI
 * interviews stop running against the JD. Each entry below is one of those
 * consequences, so the recruiter reads them rather than discovering them.
 *
 * Kept as data, not markup: the grid renders whatever is here, so adding a
 * fifth consequence is one entry and not a layout change.
 */
const ARCHIVE_EFFECTS = [
  {
    id: 'hidden',
    icon: UserSearch,
    tint: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    title: 'Not appear in active lists',
    detail: 'Hidden from the active job lists.',
  },
  {
    id: 'candidates',
    icon: FileSearch,
    tint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    title: 'Stop new candidate flow',
    detail: 'You won’t be able to add or process new candidates.',
  },
  {
    id: 'automations',
    icon: TrendingUp,
    tint: 'bg-orange-100 text-brand-orange-deep dark:bg-orange-500/15 dark:text-orange-300',
    title: 'Pause all related automations',
    detail: 'AI Talent Match, Scoring, Assessments & AI Interviews will not run.',
  },
  {
    id: 'data',
    icon: ShieldCheck,
    tint: 'bg-blue-100 text-brand-blue dark:bg-blue-500/15 dark:text-blue-300',
    title: 'Keep all existing data safe',
    detail: 'All data, reports and history will remain intact.',
  },
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
 * Built on the same overlay skeleton as `AITalentMatchConfirmModal` (fixed
 * backdrop, `animate-scale-in` card, close button, bordered footer) rather than
 * the `AlertDialog` primitive: the content is a full explanatory panel, not a
 * title and a sentence, and this skeleton is what the other rich confirms in
 * this app already use.
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
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-3xl w-full animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
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

          <hr className="my-5 border-gray-100 dark:border-slate-700/60" />

          {/* Where it goes */}
          <div className="flex items-start gap-3 rounded-xl border border-blue-100 dark:border-blue-500/25 bg-blue-50/70 dark:bg-blue-500/10 px-4 py-3">
            <Info className="w-5 h-5 shrink-0 text-brand-blue mt-0.5" />
            <div className="min-w-0 text-sm text-gray-700 dark:text-slate-300">
              <p>
                Archiving {subject} will move {many ? 'them' : 'it'} to the{' '}
                <span className="font-semibold text-brand-blue">Archived</span> section.
              </p>
              <p className="mt-0.5 text-gray-600 dark:text-slate-400">
                You can view the details, reports and history of {subject} anytime.
              </p>
            </div>
          </div>

          {/* What stops, and what does not */}
          <div className="mt-4 rounded-xl border border-amber-200/70 dark:border-amber-500/25 bg-amber-50/50 dark:bg-amber-500/[0.07] px-4 py-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
              While archived, {subject} will:
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-0 sm:divide-y sm:divide-amber-200/70 lg:divide-y-0 lg:divide-x dark:sm:divide-amber-500/20">
              {ARCHIVE_EFFECTS.map(({ id, icon: EffectIcon, tint, title, detail }) => (
                <div key={id} className="flex flex-col items-center px-2 sm:px-4 py-1 sm:py-3 lg:py-0 text-center">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${tint}`}>
                    <EffectIcon className="h-5 w-5" />
                  </span>
                  <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {title}
                  </p>
                  <p className="mt-1 text-xs sm:text-[0.8125rem] leading-snug text-gray-600 dark:text-slate-400">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
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
            className="px-6 py-2.5 text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
