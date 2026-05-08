'use client';

import { X, Trash2, RefreshCw, GitBranch, Check, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { resumeService } from '@/lib/services';
import { toast } from 'sonner';

export interface VersionedBatchItem {
  id: string;          // batch_item_id
  fileName: string;
  candidateName: string;
  resumeId?: string;
}

interface BulkVersionResolutionModalProps {
  items: VersionedBatchItem[];
  onClose: () => void;
  onResolved: () => void;
}

export default function BulkVersionResolutionModal({ items, onClose, onResolved }: BulkVersionResolutionModalProps) {
  const [selectedAction, setSelectedAction] = useState<'discard' | 'overwrite' | 'version' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedAction) return;
    setIsSubmitting(true);
    const toastId = toast.loading(`Resolving ${items.length} versioned resume${items.length !== 1 ? 's' : ''}...`);

    try {
      const results = await Promise.allSettled(
        items.map(item => resumeService.resolveDuplicate(item.id, selectedAction))
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        toast.success(`All ${succeeded} resume${succeeded !== 1 ? 's' : ''} resolved successfully`, { id: toastId });
      } else if (succeeded > 0) {
        toast.warning(`${succeeded} resolved, ${failed} failed`, { id: toastId });
      } else {
        toast.error('Failed to resolve resumes', { id: toastId });
      }

      onResolved();
    } catch (error) {
      console.error('Bulk resolution error:', error);
      toast.error('Failed to resolve versioned resumes', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/20 flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-brand-cyan" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">
                Resume Update Detected
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {items.length === 1
                  ? 'This candidate already exists. Choose how to handle this update.'
                  : `${items.length} candidates already exist. Choose how to handle these updates.`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {/* Affected Files List */}
          <div className="mb-4 p-3 bg-brand-cyan/5 ring-1 ring-brand-cyan/20 rounded-lg">
            <h4 className="text-sm font-semibold text-brand-cyan mb-2 flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              {items.length === 1 ? 'Affected Resume' : `Affected Resumes (${items.length})`}
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-brand-cyan/15">
                  <div className="w-8 h-8 rounded-full bg-brand-cyan ring-1 ring-white/10 shadow-sm shadow-brand-cyan/25 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                    {item.candidateName
                      ? item.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                      : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.candidateName || 'Unknown'}</div>
                    <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      {item.fileName}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20 flex-shrink-0">
                    Version
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Options */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 mb-3">
              Choose an action{items.length > 1 ? ' for all resumes' : ''}:
            </h4>

            {/* Option 1: Discard */}
            <button
              onClick={() => setSelectedAction('discard')}
              className={`w-full p-3 sm:p-4 border-2 rounded-lg text-left transition-all ${
                selectedAction === 'discard'
                  ? 'border-brand-blue/40 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                  : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
              }`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'discard' ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10' : 'bg-gray-100 text-gray-600'
                }`}>
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 text-sm sm:text-base">Discard New Resume{items.length > 1 ? 's' : ''}</h5>
                    {selectedAction === 'discard' && <Check className="w-5 h-5 text-brand-blue" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Keep existing resume{items.length > 1 ? 's' : ''} unchanged. {items.length > 1 ? 'New uploads' : 'The new upload'} will be deleted.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>Old resume: <span className="text-gray-700">Unchanged</span></span>
                    <span>New resume: <span className="text-red-600">Deleted</span></span>
                    <span>Storage: <span className="text-gray-700">No impact</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Overwrite */}
            <button
              onClick={() => setSelectedAction('overwrite')}
              className={`w-full p-3 sm:p-4 border-2 rounded-lg text-left transition-all ${
                selectedAction === 'overwrite'
                  ? 'border-brand-orange/50 bg-brand-orange/5 shadow-sm shadow-brand-orange/10'
                  : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
              }`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'overwrite' ? 'bg-brand-orange text-white shadow-sm shadow-brand-orange/25 ring-1 ring-white/10' : 'bg-gray-100 text-gray-600'
                }`}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 text-sm sm:text-base">Overwrite Existing Resume{items.length > 1 ? 's' : ''}</h5>
                    {selectedAction === 'overwrite' && <Check className="w-5 h-5 text-brand-orange" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Replace {items.length > 1 ? 'old resumes' : 'the old resume'} with {items.length > 1 ? 'new ones' : 'the new one'}. Original{items.length > 1 ? 's' : ''} will be permanently deleted.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>Old resume: <span className="text-red-600">Deleted</span></span>
                    <span>New resume: <span className="text-green-600">Saved</span></span>
                    <span>Consumes: <span className="text-orange-600">{items.length} upload unit{items.length !== 1 ? 's' : ''}</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 3: Save as Version */}
            <button
              onClick={() => setSelectedAction('version')}
              className={`w-full p-3 sm:p-4 border-2 rounded-lg text-left transition-all ${
                selectedAction === 'version'
                  ? 'border-green-500 bg-green-50 shadow-sm shadow-green-500/10'
                  : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
              }`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedAction === 'version' ? 'bg-green-500 text-white shadow-sm shadow-green-500/25 ring-1 ring-white/10' : 'bg-gray-100 text-gray-600'
                }`}>
                  <GitBranch className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className="font-semibold text-gray-900 text-sm sm:text-base">Save as New Version{items.length > 1 ? 's' : ''}</h5>
                      <span className="px-2 py-0.5 bg-green-50 text-green-700 ring-1 ring-green-200 text-xs font-medium rounded">Recommended</span>
                    </div>
                    {selectedAction === 'version' && <Check className="w-5 h-5 text-green-500" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Keep both old and new resumes. {items.length > 1 ? 'New resumes are' : 'The new resume is'} stored as versioned update{items.length > 1 ? 's' : ''}.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>Old resume: <span className="text-green-600">Kept</span></span>
                    <span>New resume: <span className="text-green-600">Saved as new version</span></span>
                    <span>Consumes: <span className="text-orange-600">{items.length} upload unit{items.length !== 1 ? 's' : ''}</span></span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end px-4 sm:px-6 py-3 border-t border-gray-100 bg-slate-50 gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAction || isSubmitting}
            className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Resolving...
              </>
            ) : (
              `Confirm${items.length > 1 ? ` (${items.length} resumes)` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
