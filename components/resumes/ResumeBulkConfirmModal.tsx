'use client';

import { Archive, Download, FileArchive, Info, Loader2, Users } from 'lucide-react';
import { ModalA11y } from '@/components/ui/modal-a11y';

/**
 * The My Resumes bulk confirms — "Download as ZIP" and "Archive Resumes" —
 * as one shared component, so every screen that offers these bulk actions
 * (My Resumes, the Select Applicants to Score popup) asks in the same design.
 */
export type ResumeBulkConfirmKind = 'zip' | 'archive';

const COPY: Record<ResumeBulkConfirmKind, {
  title: string;
  subtitle: string;
  body: string;
  question: string;
  confirm: string;
  busy: string;
}> = {
  zip: {
    title: 'Download as ZIP',
    subtitle: 'Multiple files selected',
    body: 'All selected resumes will be downloaded and packed in a ZIP file.',
    question: 'Do you want to download all selected resumes as a ZIP file?',
    confirm: 'Continue',
    busy: 'Preparing...',
  },
  archive: {
    title: 'Archive Resumes',
    subtitle: 'Move selected resumes to archive',
    body: 'The selected resumes will be moved to archive and hidden from the active list.',
    question: 'Are you sure you want to archive all selected resumes?',
    confirm: 'Archive',
    busy: 'Archiving...',
  },
};

interface ResumeBulkConfirmModalProps {
  kind: ResumeBulkConfirmKind;
  open: boolean;
  count: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Stacking layer. My Resumes uses the default; a host that is itself a
   *  z-50 popup passes a higher one so this sits above it. */
  zIndexClass?: string;
}

export default function ResumeBulkConfirmModal({
  kind,
  open,
  count,
  busy = false,
  onCancel,
  onConfirm,
  zIndexClass = 'z-50',
}: ResumeBulkConfirmModalProps) {
  if (!open) return null;
  const copy = COPY[kind];
  const HeaderIcon = kind === 'zip' ? FileArchive : Archive;
  const ConfirmIcon = kind === 'zip' ? Download : Archive;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 ${zIndexClass} animate-in fade-in duration-200`}
        onClick={() => !busy && onCancel()}
      />

      {/* Modal */}
      <ModalA11y><div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 bg-brand-blue/10 ${kind === 'zip' ? 'rounded-2xl' : 'rounded-full'} flex items-center justify-center flex-shrink-0`}>
                <HeaderIcon className="w-7 h-7 text-brand-blue" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">{copy.title}</h3>
                <p className="tf-body-muted mt-0.5">{copy.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 flex items-center gap-4 border-b border-gray-200">
            <div className="w-16 h-16 bg-brand-blue/5 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Users className="w-7 h-7 text-brand-blue" />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-blue">
                {count}
                <span className="tf-section-title ml-2">candidates selected</span>
              </p>
              <p className="tf-body-muted mt-1">{copy.body}</p>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="w-7 h-7 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Info className="w-4 h-4 text-brand-blue" />
            </div>
            <p className="tf-body">{copy.question}</p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-200">
            <button
              onClick={onCancel}
              disabled={busy}
              className="tf-btn tf-btn-secondary px-5 py-2.5 text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-brand-blue/30 whitespace-normal gap-0"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="tf-btn tf-btn-primary flex px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 whitespace-normal justify-start"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {copy.busy}
                </>
              ) : (
                <>
                  <ConfirmIcon className="w-4 h-4" />
                  {copy.confirm}
                </>
              )}
            </button>
          </div>
        </div>
      </div></ModalA11y>
    </>
  );
}
