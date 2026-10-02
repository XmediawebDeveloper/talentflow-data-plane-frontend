'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Archive, AlertTriangle, CheckCircle2, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatISTDate } from '@/lib/utils/dateUtils';

/**
 * What archiving an assessment actually does, spelled out before it happens.
 * The AI Interviews archive confirm's list (`ArchiveAIInterviewModal`), said
 * of an assessment. Kept as data, not markup, so a fifth consequence is one
 * entry and not a JSX change.
 */
const ARCHIVE_EFFECTS = [
  'This assessment will be moved to the Archived tab.',
  'It will be removed from the Active list.',
  'You can still view the assessment results and tracking details anytime.',
  'You will not be able to take any new actions (e.g., send new invite) unless it is restored.',
] as const;

/** What is being archived — rendered in the summary card below the message. */
export interface ArchiveAssessmentTarget {
  title: string;
  version?: number;
  createdAt?: string;
  durationMinutes?: number;
}

export interface ArchiveAssessmentModalProps {
  isOpen: boolean;
  target: ArchiveAssessmentTarget | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirm shown before an assessment is archived — from the details
 * page's Archive icon, the All Assessments table's menu and the Assessments
 * page's own menu, which all render THIS component so the warning cannot
 * drift between them. Layout, copy shape and styling are the AI Interviews
 * archive confirm's (`ArchiveAIInterviewModal`): icon disc + title, the
 * "What will happen?" callout, the summary card, a bordered footer.
 */
export default function ArchiveAssessmentModal({ isOpen, target, onConfirm, onCancel }: ArchiveAssessmentModalProps) {
  if (!isOpen || !target) return null;

  const metaParts = [
    target.version ? `Version ${target.version}` : null,
    target.createdAt ? `Created on ${formatISTDate(target.createdAt)}` : null,
    typeof target.durationMinutes === 'number' ? `${target.durationMinutes} Minutes` : null,
  ].filter((part): part is string => !!part);

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-assessment-title"
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-scale-in max-h-[calc(100dvh-1.5rem)] flex flex-col tf-round-edges"
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-4 right-4 px-2"
        >
          <X className="w-5 h-5" />
        </Button>

        <div className="flex-1 min-h-0 px-4 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto">
          {/* Header: tinted disc + title */}
          <div className="flex items-start gap-3 sm:gap-4 pr-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-full bg-brand-orange/10 dark:bg-orange-500/15 flex items-center justify-center">
              <Archive className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange-deep dark:text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="archive-assessment-title" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
                Archive Assessment?
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-gray-600 dark:text-slate-400">
                Move this assessment to the Archived tab.
              </p>
            </div>
          </div>

          {/* What will happen */}
          <div className="mt-5 rounded-xl border border-brand-orange/20 dark:border-orange-500/25 bg-brand-orange/[0.06] dark:bg-orange-500/10 px-3 sm:px-4 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-brand-orange-deep dark:text-orange-300" />
              <p className="text-sm font-bold text-brand-orange-deep dark:text-orange-300">What will happen?</p>
            </div>
            <ul className="mt-2.5 space-y-2">
              {ARCHIVE_EFFECTS.map((effect) => (
                <li key={effect} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-orange-deep dark:text-orange-300 mt-0.5" />
                  <span className="min-w-0">{effect}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What is being archived — the AI Interviews summary card's shape */}
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 px-3 sm:px-4 py-3.5 flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold tracking-wide text-gray-500 dark:text-slate-400 uppercase">
                Assessment
              </p>
              <p className="mt-0.5 text-sm sm:text-base font-bold text-gray-900 dark:text-slate-100 truncate" title={target.title}>
                {target.title}
              </p>
              {metaParts.length > 0 && (
                <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                  {metaParts.map((part, i) => (
                    <span key={part}>
                      {i > 0 && <span className="mx-1.5 text-gray-300 dark:text-slate-600">|</span>}
                      {part}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <p className="text-sm text-gray-700 dark:text-slate-300">
            Are you sure you want to archive this assessment?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="destructive" onClick={onConfirm} className="px-6">
              <span className="flex items-center justify-center gap-2">
                <Archive className="w-4 h-4" />
                Archive
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `await confirmArchive(target)` → true on Archive, false on close — the
 * shape `dialog.confirm` gave the three archive actions, so each keeps its
 * own flow (permission check, status write, toast, refresh) unchanged and
 * only swaps which dialog asks. Render `archiveConfirmModal` once in the
 * component that calls it.
 */
export function useArchiveAssessmentConfirm(): {
  confirmArchive: (target: ArchiveAssessmentTarget) => Promise<boolean>;
  archiveConfirmModal: ReactNode;
} {
  const [target, setTarget] = useState<ArchiveAssessmentTarget | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setTarget(null);
  }, []);

  const confirmArchive = useCallback((next: ArchiveAssessmentTarget) => {
    resolveRef.current?.(false);
    setTarget(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return {
    confirmArchive,
    archiveConfirmModal: (
      <ArchiveAssessmentModal
        isOpen={!!target}
        target={target}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    ),
  };
}
