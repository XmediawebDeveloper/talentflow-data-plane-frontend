'use client';

import { FileText, AlertCircle, Info, Save, Loader2, X } from 'lucide-react';

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  /** Overrides for flows whose "draft" is not a JD — e.g. an interview config. */
  title?: string;
  description?: string;
  /** The consequence line in the blue banner. */
  infoText?: string;
  discardLabel?: string;
  saveLabel?: string;
  /** Close without choosing — the X. Leaves the user where they are. */
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  isSaving?: boolean;
}

/**
 * The "you have unsaved changes" prompt, shared by every flow that can be left
 * mid-edit — JD creation and AI Interview config today.
 *
 * It was a plain `Dialog` with a title, a line of text and two buttons in each
 * of those files, separately. Two problems with that: the flows had drifted
 * apart in wording and button labels, and the prompt read like a routine
 * confirm when it is the last thing standing between a recruiter and losing
 * their work. The icon badge and the explicit consequence line are doing that
 * job — this is the one dialog on the page worth stopping for.
 *
 * Built on the house overlay skeleton (fixed backdrop, `animate-scale-in` card,
 * bordered footer) rather than the Radix `Dialog` primitive, like the app's
 * other rich confirms.
 */
export default function UnsavedChangesModal({
  isOpen,
  title = 'Unsaved Changes',
  description = 'You have unsaved changes. Would you like to save them as a draft before leaving?',
  infoText = 'If you leave without saving, your changes will be lost.',
  discardLabel = 'Discard Changes',
  saveLabel = 'Save Draft',
  onClose,
  onDiscard,
  onSave,
  isSaving = false,
}: UnsavedChangesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-xl animate-scale-in overflow-hidden tf-round-edges">
        <button
          onClick={onClose}
          disabled={isSaving}
          aria-label="Close"
          className="absolute top-5 right-5 z-10 p-1.5 text-gray-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge — decorative, so the heading (not the icon) is what
                a screen reader announces. */}
            <div aria-hidden className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-orange/10">
              <FileText className="h-7 w-7 text-brand-orange" strokeWidth={2} />
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-orange text-white ring-2 ring-white dark:ring-slate-900">
                <AlertCircle className="h-3 w-3" />
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-50">
              {title}
            </h2>
          </div>

          <p className="mt-4 tf-body-secondary sm:text-base">
            {description}
          </p>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-blue-100 dark:border-blue-500/25 bg-blue-50/70 dark:bg-blue-500/10 px-3.5 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
            <p className="tf-body">{infoText}</p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              onClick={onDiscard}
              disabled={isSaving}
              className="tf-btn tf-btn-secondary px-5 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-brand-blue/30 transition-colors whitespace-normal gap-0"
            >
              {discardLabel}
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="tf-btn tf-btn-primary px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-sm font-semibold shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-normal"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {saveLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
