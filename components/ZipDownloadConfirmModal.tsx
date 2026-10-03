'use client';

import { Download, FileArchive, Info, Loader2, Users, X } from 'lucide-react';

interface ZipDownloadConfirmModalProps {
  open: boolean;
  /** How many items go into the ZIP. */
  count: number;
  /** What is being packed — "resumes", "scorecards"… Used in the copy. */
  itemLabel?: string;
  /** True while the ZIP is being built; locks the dialog. */
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * "Download as ZIP" confirmation — the dialog Resume Database and My Resumes
 * show before a multi-file download, shared so every bulk download asks the
 * same way.
 */
export default function ZipDownloadConfirmModal({
  open,
  count,
  itemLabel = 'resumes',
  busy = false,
  onClose,
  onConfirm,
}: ZipDownloadConfirmModalProps) {
  if (!open) return null;
  const close = () => { if (!busy) onClose(); };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" onClick={close} />
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="zip-download-confirm-title"
          className="pointer-events-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                <FileArchive className="w-7 h-7 text-brand-blue" />
              </div>
              <div>
                <h3 id="zip-download-confirm-title" className="text-xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">Download as ZIP</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Multiple files selected</p>
              </div>
            </div>
            <button
              onClick={close}
              disabled={busy}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 flex items-center gap-4 border-b border-gray-200 dark:border-slate-700">
            <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Users className="w-7 h-7 text-brand-blue" />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-blue">
                {count}
                <span className="text-base font-semibold text-gray-900 dark:text-slate-100 ml-2">candidates selected</span>
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                All selected {itemLabel} will be downloaded and packed in a ZIP file.
              </p>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Info className="w-4 h-4 text-brand-blue" />
            </div>
            <p className="text-sm text-gray-700 dark:text-slate-300">
              Do you want to download all selected {itemLabel} as a ZIP file?
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-slate-800/50 rounded-b-2xl border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={onConfirm}
              disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Continue
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
