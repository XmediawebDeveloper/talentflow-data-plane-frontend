'use client';

import { X, Trash2, RefreshCw, GitBranch, ChevronLeft, ChevronRight, Check, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { useState, useMemo } from 'react';
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
  onResolved: () => void;  // called after all items resolved successfully
}

export default function BulkVersionResolutionModal({ items, onClose, onResolved }: BulkVersionResolutionModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<string, 'discard' | 'overwrite' | 'version'>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentItem = items[currentIndex];
  const currentAction = resolutions.get(currentItem?.id);

  const allResolved = useMemo(() => {
    return items.every(item => resolutions.has(item.id));
  }, [items, resolutions]);

  const resolvedCount = useMemo(() => {
    return items.filter(item => resolutions.has(item.id)).length;
  }, [items, resolutions]);

  const handleSelectAction = (action: 'discard' | 'overwrite' | 'version') => {
    if (!currentItem) return;
    const newResolutions = new Map(resolutions);
    newResolutions.set(currentItem.id, action);
    setResolutions(newResolutions);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleApplyToAll = (action: 'discard' | 'overwrite' | 'version') => {
    const newResolutions = new Map(resolutions);
    items.forEach(item => {
      newResolutions.set(item.id, action);
    });
    setResolutions(newResolutions);
  };

  const handleConfirmAll = async () => {
    if (!allResolved) return;
    setIsSubmitting(true);
    const toastId = toast.loading(`Resolving ${items.length} versioned resume${items.length !== 1 ? 's' : ''}...`);

    try {
      const results = await Promise.allSettled(
        items.map(item => {
          const action = resolutions.get(item.id)!;
          return resumeService.resolveDuplicate(item.id, action);
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed === 0) {
        toast.success(`All ${succeeded} resume${succeeded !== 1 ? 's' : ''} resolved successfully`, { id: toastId });
      } else if (succeeded > 0) {
        toast.warning(`${succeeded} resolved, ${failed} failed`, { id: toastId });
      } else {
        toast.error(`Failed to resolve resumes`, { id: toastId });
      }

      onResolved();
    } catch (error) {
      console.error('Bulk resolution error:', error);
      toast.error('Failed to resolve versioned resumes', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentItem) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-violet-50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <GitBranch className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Resolve Versioned Resumes
              </h2>
              <p className="text-sm text-gray-600">
                {items.length} versioned resume{items.length !== 1 ? 's' : ''} need resolution. Choose an action for each.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* File Counter */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              Resume {currentIndex + 1} of {items.length}
            </span>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
              {resolvedCount}/{items.length} resolved
            </span>
          </div>
          {/* Apply to all dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Apply to all:</span>
            <button
              onClick={() => handleApplyToAll('discard')}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-gray-700"
            >
              Discard
            </button>
            <button
              onClick={() => handleApplyToAll('overwrite')}
              className="px-2 py-1 text-xs border border-orange-300 rounded-md hover:bg-orange-50 transition-colors text-orange-700"
            >
              Overwrite
            </button>
            <button
              onClick={() => handleApplyToAll('version')}
              className="px-2 py-1 text-xs border border-green-300 rounded-md hover:bg-green-50 transition-colors text-green-700"
            >
              Version
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-300px)]">
          {/* Candidate Info */}
          <div className="mb-6 p-4 bg-purple-50/50 rounded-xl border border-purple-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                {currentItem.candidateName
                  ? currentItem.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                  : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{currentItem.candidateName || 'Unknown Candidate'}</h3>
                <p className="text-sm text-gray-500 truncate flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  {currentItem.fileName}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                Version Detected
              </span>
            </div>
          </div>

          {/* Action Options */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 mb-3">Choose an action:</h4>

            {/* Option 1: Discard */}
            <button
              onClick={() => handleSelectAction('discard')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                currentAction === 'discard'
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  currentAction === 'discard' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900">1. Discard New Resume</h5>
                    {currentAction === 'discard' && <Check className="w-5 h-5 text-gray-800" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Keep existing resume unchanged. The new upload will be deleted.
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2: Overwrite */}
            <button
              onClick={() => handleSelectAction('overwrite')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                currentAction === 'overwrite'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  currentAction === 'overwrite' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900">2. Overwrite Existing Resume</h5>
                    {currentAction === 'overwrite' && <Check className="w-5 h-5 text-orange-500" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Replace the old resume with the new one. Original will be permanently deleted.
                  </p>
                </div>
              </div>
            </button>

            {/* Option 3: Save as Version */}
            <button
              onClick={() => handleSelectAction('version')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                currentAction === 'version'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  currentAction === 'version' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  <GitBranch className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className="font-semibold text-gray-900">3. Save as New Version</h5>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Recommended</span>
                    </div>
                    {currentAction === 'version' && <Check className="w-5 h-5 text-green-500" />}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Keep both resumes. The new resume is stored as a versioned update.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === items.length - 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {items.length <= 12 ? (
              items.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    resolutions.has(item.id)
                      ? 'bg-green-500'
                      : index === currentIndex
                      ? 'bg-purple-600'
                      : 'bg-gray-300'
                  }`}
                />
              ))
            ) : (
              <span className="text-xs text-gray-500">
                {resolvedCount} of {items.length} resolved
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAll}
              disabled={!allResolved || isSubmitting}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Resolving...
                </>
              ) : allResolved ? (
                `Confirm All (${items.length})`
              ) : (
                `${resolvedCount}/${items.length} Resolved`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
