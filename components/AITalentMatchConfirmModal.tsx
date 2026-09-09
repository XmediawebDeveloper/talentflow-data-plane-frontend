'use client';

import { FileText, FileSearch, Briefcase, Sparkle, Plus, Loader2, X } from 'lucide-react';

interface AITalentMatchConfirmModalProps {
  isOpen: boolean;
  jobTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function AITalentMatchConfirmModal({
  isOpen,
  jobTitle,
  onConfirm,
  onCancel,
  isLoading = false,
}: AITalentMatchConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 sm:p-6">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-2xl w-full animate-scale-in max-h-[calc(100dvh-2rem)] flex flex-col tf-round-edges">
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 text-gray-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 sm:px-8 pt-8 pb-6 overflow-y-auto">
          {/* Header: small icon + title */}
          <div className="flex items-start gap-4 mb-6 pr-8">
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
          <p className="text-center text-sm sm:text-base text-gray-600 dark:text-slate-400 leading-relaxed mb-5">
            <span className="font-semibold text-brand-blue">AI Talent Match</span> will scan your resume database
            against{' '}
            <span className="font-semibold text-brand-blue">&ldquo;{jobTitle}&rdquo;</span> and rank the closest
            candidates.
          </p>

          {/* Job pill */}
          <div className="flex items-center gap-3 bg-brand-blue/5 dark:bg-brand-blue/10 rounded-xl px-4 py-3">
            <div className="w-8 h-8 shrink-0 bg-brand-blue/15 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{jobTitle}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-gray-100 dark:border-slate-700/60 flex flex-col-reverse sm:flex-row gap-3 shrink-0">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-brand-blue hover:bg-brand-blue/5 hover:border-brand-blue/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            No
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </span>
            ) : (
              'Yes, find matches'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
