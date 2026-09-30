'use client';

import { Trash2, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AIInterviewConfigSummaryCard from '@/components/ai-interview/AIInterviewConfigSummaryCard';

export interface DeleteAIInterviewModalProps {
  isOpen: boolean;
  /** The config being deleted — rendered in the summary card below the message. */
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
 * The confirm shown before an AI interview configuration is permanently
 * deleted — the card list, the version-history rows and the details page all
 * render THIS component so the warning cannot drift between surfaces.
 */
export default function DeleteAIInterviewModal({
  isOpen,
  title,
  version,
  createdAt,
  totalQuestions,
  durationMinutes,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteAIInterviewModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close"
          className="absolute top-4 right-4 px-2"
        >
          <X className="w-5 h-5" />
        </Button>

        <div className="px-5 sm:px-8 pt-8 sm:pt-10 pb-5 overflow-y-auto text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive-subtle flex items-center justify-center">
            <Trash2 className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="mt-4 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 leading-snug">
            Delete AI Interview Configuration
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-slate-400 max-w-md mx-auto">
            Are you sure you want to delete this AI interview configuration? This action cannot be undone.
          </p>

          <div className="mt-5 text-left">
            <AIInterviewConfigSummaryCard
              title={title}
              version={version}
              createdAt={createdAt}
              totalQuestions={totalQuestions}
              durationMinutes={durationMinutes}
            />
          </div>

          <div className="mt-4 text-left flex items-start gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/70 px-4 py-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-destructive mt-0.5" />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-destructive">Important</p>
              <p className="mt-0.5 font-semibold text-destructive">
                This configuration and its associated settings will be permanently deleted.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0">
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading} className="px-6">
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete Configuration
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
