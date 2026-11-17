'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Trash2, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatISTDate } from '@/lib/utils/dateUtils';

/** What is being deleted — read straight off the assessment / AI interview record. */
export interface DeleteRecordTarget {
  /** JD-014 */
  jobShortId?: string;
  jobTitle: string;
  /** Job version (V1, V2, …) */
  jobVersion?: number;
  /** Assessment / AI interview version within its job version. */
  version?: number;
  createdAt?: string;
  createdBy?: string;
}

export interface DeleteRecordModalProps {
  isOpen: boolean;
  /** "Assessment" | "AI Interview" — drives the title, copy and button label. */
  kind: 'Assessment' | 'AI Interview';
  target: DeleteRecordTarget | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  /** Keeps Delete off (e.g. the job is disabled); shown as the button's tooltip. */
  disabledReason?: string;
}

/**
 * The delete confirm shared by Recruitment → Assessments and Recruitment →
 * AI Interview: trash disc + title, the "Job Details" card, the red Important
 * callout and a bordered Cancel / Delete footer. One component so the two
 * modules cannot drift apart.
 */
export default function DeleteRecordModal({
  isOpen,
  kind,
  target,
  onConfirm,
  onCancel,
  isLoading = false,
  disabledReason,
}: DeleteRecordModalProps) {
  if (!isOpen || !target) return null;

  const noun = kind === 'Assessment' ? 'assessment' : 'AI interview';
  const heading = [
    target.jobShortId,
    target.jobTitle,
    target.jobVersion ? `V${target.jobVersion}` : null,
  ].filter(Boolean).join(' ');
  const metaParts = [
    target.version ? `${kind} - Version ${target.version}` : kind,
    target.createdAt ? `Created on ${formatISTDate(target.createdAt)}` : null,
    target.createdBy ? `Created by: ${target.createdBy}` : null,
  ].filter((part): part is string => !!part);

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-record-title"
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges"
      >
        <div className="flex-1 min-h-0 px-5 sm:px-8 pt-7 sm:pt-8 pb-5 overflow-y-auto text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-destructive-subtle flex items-center justify-center">
            <Trash2 className="w-6 h-6 sm:w-7 sm:h-7 text-destructive" />
          </div>
          <h2 id="delete-record-title" className="mt-3 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
            Delete {kind}
          </h2>
          <p className="mt-2 tf-body-secondary sm:text-base">
            Are you sure you want to delete this {noun}?
            <br />
            This action cannot be undone.
          </p>

          {/* Job details */}
          <div className="mt-5 text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 px-3 sm:px-4 py-3.5 flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-lg bg-info-subtle flex items-center justify-center">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="tf-eyebrow tracking-wide">
                Job Details
              </p>
              <p className="mt-0.5 text-sm sm:text-base font-bold text-gray-900 dark:text-slate-100 uppercase break-words" title={heading}>
                {heading}
              </p>
              <p className="mt-1 tf-body-muted flex flex-wrap items-center gap-y-0.5">
                {metaParts.map((part, i) => (
                  <span key={part} className="inline-flex items-center">
                    {i > 0 && <span className="mx-1.5 sm:mx-2 text-gray-300 dark:text-slate-600">|</span>}
                    {part}
                  </span>
                ))}
              </p>
            </div>
          </div>

          {/* Important */}
          <div className="mt-4 text-left flex items-start gap-3 sm:gap-4 rounded-xl border border-destructive-line bg-destructive-subtle/70 px-3 sm:px-4 py-3">
            <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 text-destructive" />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-destructive">Important</p>
              <p className="mt-0.5 text-destructive">
                This {noun} and its associated data will be permanently deleted.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0">
          <Button variant="secondary" onClick={onCancel} disabled={isLoading} className="w-full sm:w-auto sm:min-w-[128px] px-6">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => { if (!disabledReason) onConfirm(); }}
            disabled={isLoading || !!disabledReason}
            title={disabledReason}
            className="w-full sm:w-auto px-6"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {isLoading ? 'Deleting...' : `Delete ${kind}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * `await confirmDelete(target)` → true on Delete, false on Cancel / close —
 * the shape `dialog.confirm` gave, so each caller keeps its own flow
 * (permission check, API call, toast, refresh) and only swaps the dialog.
 * Render `deleteConfirmModal` once in the component that calls it.
 */
export function useDeleteRecordConfirm(kind: DeleteRecordModalProps['kind']): {
  confirmDelete: (target: DeleteRecordTarget) => Promise<boolean>;
  deleteConfirmModal: ReactNode;
} {
  const [target, setTarget] = useState<DeleteRecordTarget | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setTarget(null);
  }, []);

  const confirmDelete = useCallback((next: DeleteRecordTarget) => {
    resolveRef.current?.(false);
    setTarget(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return {
    confirmDelete,
    deleteConfirmModal: (
      <DeleteRecordModal
        isOpen={!!target}
        kind={kind}
        target={target}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    ),
  };
}
