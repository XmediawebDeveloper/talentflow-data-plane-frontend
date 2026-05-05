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
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-violet-50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Resume Update Detected
              </h2>
              <p className="text-sm text-gray-600">
                {items.length === 1
                  ? 'This candidate already exists in the system. Choose how to handle this update.'
                  : `${items.length} candidates already exist in the system. Choose how to handle these updates.`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-260px)]">
          {/* Affected Files List */}
          <div className="mb-6 p-4 bg-purple-50/50 rounded-xl border border-purple-200">
            <h4 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              {items.length === 1 ? 'Affected Resume' : `Affected Resumes (${items.length})`}
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-purple-100">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
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
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex-shrink-0">
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
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'discard'
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'discard' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900">Discard New Resume{items.length > 1 ? 's' : ''}</h5>
                    {selectedAction === 'discard' && <Check className="w-5 h-5 text-gray-800" />}
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
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'overwrite'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'overwrite' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900">Overwrite Existing Resume{items.length > 1 ? 's' : ''}</h5>
                    {selectedAction === 'overwrite' && <Check className="w-5 h-5 text-orange-500" />}
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
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'version'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'version' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <GitBranch className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className="font-semibold text-gray-900">Save as New Version{items.length > 1 ? 's' : ''}</h5>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Recommended</span>
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
        <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50 gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAction || isSubmitting}
            className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
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
