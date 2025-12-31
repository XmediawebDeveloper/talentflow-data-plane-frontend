'use client';

import { X, FileText, Trash2, RefreshCw, GitBranch, AlertTriangle, Eye, Calendar, FolderOpen, HardDrive, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useState } from 'react';

export interface ExistingResume {
  id: string;
  candidate_name: string;
  email: string;
  folder_name?: string;
  folder_path?: string;
  upload_date: string;
  file_size: number;
  file_name: string;
  version: number;
}

export interface DuplicateFile {
  file: File;
  existingResume: ExistingResume;
  contentDifferences: string[];
  isDuplicate: boolean; // true = exact duplicate, false = version (has changes)
}

interface DuplicateResumeModalProps {
  duplicates: DuplicateFile[];
  onClose: () => void;
  onResolve: (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => void;
}

export default function DuplicateResumeModal({ duplicates, onClose, onResolve }: DuplicateResumeModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<number, 'discard' | 'overwrite' | 'version'>>(new Map());
  const [selectedAction, setSelectedAction] = useState<'discard' | 'overwrite' | 'version' | null>(null);

  const currentDuplicate = duplicates[currentIndex];
  const isExactDuplicate = currentDuplicate?.isDuplicate;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleSelectAction = (action: 'discard' | 'overwrite' | 'version') => {
    setSelectedAction(action);
    const newResolutions = new Map(resolutions);
    newResolutions.set(currentIndex, action);
    setResolutions(newResolutions);
  };

  const handleNext = () => {
    if (currentIndex < duplicates.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAction(resolutions.get(currentIndex + 1) || null);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedAction(resolutions.get(currentIndex - 1) || null);
    }
  };

  const handleConfirm = () => {
    // If current selection not saved, save it
    if (selectedAction && !resolutions.has(currentIndex)) {
      resolutions.set(currentIndex, selectedAction);
    }

    // Check if all duplicates have resolutions
    const allResolved = duplicates.every((_, index) => resolutions.has(index));
    if (!allResolved) {
      // Set current selection if exists
      if (selectedAction) {
        resolutions.set(currentIndex, selectedAction);
      }
    }

    const resolutionArray = Array.from(resolutions.entries()).map(([fileIndex, action]) => ({
      fileIndex,
      action
    }));

    onResolve(resolutionArray);
  };

  const allResolved = duplicates.every((_, index) => resolutions.has(index) || (index === currentIndex && selectedAction));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                {isExactDuplicate ? 'Duplicate Resume Detected' : 'Resume Update Detected'}
              </h2>
              <p className="text-sm text-gray-600">
                {isExactDuplicate
                  ? 'This candidate already exists with identical information.'
                  : 'This candidate already exists in the system. Choose how to handle this update.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* File Counter */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            File {currentIndex + 1} of {duplicates.length}
          </span>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isExactDuplicate
                ? 'bg-red-100 text-red-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {isExactDuplicate ? 'Exact Duplicate' : 'Content Changes Detected'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-320px)]">
          {/* Candidate Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {currentDuplicate.existingResume.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{currentDuplicate.existingResume.candidate_name}</h3>
                <p className="text-sm text-gray-500">{currentDuplicate.existingResume.email}</p>
              </div>
            </div>
          </div>

          {/* Comparison Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Existing Resume */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-600" />
                  Existing Resume
                </h4>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Location:</span>
                  <span className="text-gray-900">{currentDuplicate.existingResume.folder_path || 'My Resumes'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Upload Date:</span>
                  <span className="text-gray-900">{formatDate(currentDuplicate.existingResume.upload_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">File Size:</span>
                  <span className="text-gray-900">{formatFileSize(currentDuplicate.existingResume.file_size)}</span>
                </div>
                {currentDuplicate.existingResume.version > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">Version:</span>
                    <span className="text-gray-900">v{currentDuplicate.existingResume.version}</span>
                  </div>
                )}
                <button className="mt-2 w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview Existing
                </button>
              </div>
            </div>

            {/* New Resume */}
            <div className="border border-blue-200 rounded-xl overflow-hidden bg-blue-50/30">
              <div className="px-4 py-3 bg-blue-100 border-b border-blue-200">
                <h4 className="font-medium text-blue-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  New Resume (Uploading)
                </h4>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">File Name:</span>
                  <span className="text-gray-900 truncate">{currentDuplicate.file.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Upload Date:</span>
                  <span className="text-gray-900">{new Date().toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">File Size:</span>
                  <span className="text-gray-900">{formatFileSize(currentDuplicate.file.size)}</span>
                </div>
                <button className="mt-2 w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview New
                </button>
              </div>
            </div>
          </div>

          {/* Content Differences - Only show for non-exact duplicates */}
          {!isExactDuplicate && currentDuplicate.contentDifferences.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <h4 className="font-medium text-amber-900 mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Content Differences Detected
              </h4>
              <ul className="space-y-1.5">
                {currentDuplicate.contentDifferences.map((diff, index) => (
                  <li key={index} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {diff}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Exact Duplicate Warning */}
          {isExactDuplicate && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Exact Duplicate - Cannot Upload
              </h4>
              <p className="text-sm text-red-700">
                This resume contains identical information (same name, email, and content) as the existing resume.
                Uploading duplicate resumes is not allowed. Please discard this file.
              </p>
            </div>
          )}

          {/* Action Options */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 mb-3">Choose an action:</h4>

            {/* Option 1: Discard */}
            <button
              onClick={() => handleSelectAction('discard')}
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
                    <h5 className="font-semibold text-gray-900">1. Discard New Resume</h5>
                    {selectedAction === 'discard' && (
                      <Check className="w-5 h-5 text-gray-800" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Keep existing resume unchanged. New resume will be deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>• Old resume: <span className="text-gray-700">Unchanged</span></span>
                    <span>• New resume: <span className="text-red-600">Deleted</span></span>
                    <span>• Storage: <span className="text-gray-700">No impact</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Overwrite - Only for non-exact duplicates */}
            {!isExactDuplicate && (
              <button
                onClick={() => handleSelectAction('overwrite')}
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
                      <h5 className="font-semibold text-gray-900">2. Overwrite Existing Resume</h5>
                      {selectedAction === 'overwrite' && (
                        <Check className="w-5 h-5 text-orange-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Replace old resume with new one. Original will be permanently deleted.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>• Old resume: <span className="text-red-600">Deleted</span></span>
                      <span>• New resume: <span className="text-green-600">Saved</span></span>
                      <span>• Consumes: <span className="text-orange-600">1 upload unit</span></span>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Option 3: Save as Version - Only for non-exact duplicates */}
            {!isExactDuplicate && (
              <button
                onClick={() => handleSelectAction('version')}
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
                        <h5 className="font-semibold text-gray-900">3. Save as New Version</h5>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Recommended</span>
                      </div>
                      {selectedAction === 'version' && (
                        <Check className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Keep both resumes. New resume stored as a versioned update. Recommended for tracking changes.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>• Old resume: <span className="text-green-600">Kept</span></span>
                      <span>• New resume: <span className="text-green-600">Saved as v{currentDuplicate.existingResume.version + 1}</span></span>
                      <span>• Consumes: <span className="text-orange-600">1 upload unit</span></span>
                    </div>
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Note */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600">
              <span className="font-medium">Note:</span> All actions are fully audit logged.
              {!isExactDuplicate && ' Overwriting or saving as a new version will consume 1 resume upload unit from your quota.'}
            </p>
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
              disabled={currentIndex === duplicates.length - 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            {duplicates.map((_, index) => (
              <div
                key={index}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  resolutions.has(index) || (index === currentIndex && selectedAction)
                    ? 'bg-green-500'
                    : index === currentIndex
                    ? 'bg-gray-800'
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
            >
              Cancel All
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedAction}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {allResolved ? 'Confirm All' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
