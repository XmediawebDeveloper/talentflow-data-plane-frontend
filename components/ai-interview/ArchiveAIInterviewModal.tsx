'use client';

import { Archive, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AIInterviewConfigSummaryCard from '@/components/ai-interview/AIInterviewConfigSummaryCard';

/**
 * What archiving an AI interview actually does, spelled out before it
 * happens. Kept as data, not markup, so a fifth consequence is one entry
 * and not a JSX change.
 */
const ARCHIVE_EFFECTS = [
  'This AI interview will be moved to the Archived tab.',
  'It will be removed from the Active list.',
  'You can still view the interview results and tracking details anytime.',
  'You will not be able to take any new actions (e.g., send new invite) unless it is restored.',
] as const;

export interface ArchiveAIInterviewModalProps {
  isOpen: boolean;
  /** The config being archived — rendered in the summary card below the message. */
  title: string;
  version?: number;
  createdAt?: string;
  totalQuestions?: number;
  durationMinutes?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * The confirm shown before an AI interview configuration (or one of its
 * versions) is archived — the card list, the version-history rows and the
 * details page all render THIS component so the warning cannot drift
 * between surfaces. Visual language matches `ArchiveJobModal` /
 * `DisableJobModal` (icon disc + title, tinted callouts, bordered footer)
 * so archive confirms read as one family across the app.
 */
export default function ArchiveAIInterviewModal({
  isOpen,
  title,
  version,
  createdAt,
  totalQuestions,
  durationMinutes,
  onConfirm,
  onCancel,
  isLoading = false,
}: ArchiveAIInterviewModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <div className="px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto">
          {/* Header: tinted disc + title */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 shrink-0 rounded-full bg-brand-orange/10 dark:bg-orange-500/15 flex items-center justify-center">
              <Archive className="w-6 h-6 text-brand-orange-deep dark:text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
                Archive AI Interview?
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-gray-600 dark:text-slate-400">
                Move this AI interview to the Archived tab.
              </p>
            </div>
          </div>

          {/* What will happen */}
          <div className="mt-5 rounded-xl border border-brand-orange/20 dark:border-orange-500/25 bg-brand-orange/[0.06] dark:bg-orange-500/10 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-brand-orange-deep dark:text-orange-300" />
              <p className="text-sm font-bold text-brand-orange-deep dark:text-orange-300">What will happen?</p>
            </div>
            <ul className="mt-2.5 space-y-2">
              {ARCHIVE_EFFECTS.map((effect) => (
                <li key={effect} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-orange-deep dark:text-orange-300 mt-0.5" />
                  <span>{effect}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What is being archived */}
          <div className="mt-4">
            <AIInterviewConfigSummaryCard
              title={title}
              version={version}
              createdAt={createdAt}
              totalQuestions={totalQuestions}
              durationMinutes={durationMinutes}
            />
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <p className="text-sm text-gray-700 dark:text-slate-300">
            Are you sure you want to archive this AI interview?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onCancel} disabled={isLoading} className="px-6">
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={isLoading} className="px-6">
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Archiving...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Archive className="w-4 h-4" />
                  Archive
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
