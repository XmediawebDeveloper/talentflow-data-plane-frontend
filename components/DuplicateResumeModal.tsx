'use client';

import { X, FileText, Trash2, RefreshCw, GitBranch, AlertTriangle, Eye, Calendar, FolderOpen, HardDrive, ChevronLeft, ChevronRight, Check, Ban, Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { resumeService } from '@/lib/services';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { renderAsync } from 'docx-preview';

// Maximum number of versions allowed per resume
const MAX_VERSIONS_PER_RESUME = 5;

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
  version_count?: number; // Total number of versions for this candidate
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
  // Separate exact duplicates from versions (content changes)
  const { exactDuplicates, versionsWithChanges } = useMemo(() => {
    const exact: { file: DuplicateFile; originalIndex: number }[] = [];
    const versions: { file: DuplicateFile; originalIndex: number }[] = [];

    duplicates.forEach((dup, index) => {
      if (dup.isDuplicate) {
        exact.push({ file: dup, originalIndex: index });
      } else {
        versions.push({ file: dup, originalIndex: index });
      }
    });

    return { exactDuplicates: exact, versionsWithChanges: versions };
  }, [duplicates]);

  // Only show modal for versions with changes (exact duplicates are auto-rejected)
  const hasOnlyExactDuplicates = versionsWithChanges.length === 0;

  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Map<number, 'discard' | 'overwrite' | 'version'>>(new Map());
  const [selectedAction, setSelectedAction] = useState<'discard' | 'overwrite' | 'version' | null>(null);
  const [previewLoading, setPreviewLoading] = useState<'existing' | 'new' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewDocxBlob, setPreviewDocxBlob] = useState<Blob | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // Helper: check if a blob is actually a PDF by reading magic bytes
  const isPdfBlob = async (blob: Blob): Promise<boolean> => {
    try {
      const header = await blob.slice(0, 5).text();
      return header.startsWith('%PDF');
    } catch {
      return false;
    }
  };

  // Render DOCX blob into container using docx-preview
  const renderDocx = useCallback(async (blob: Blob) => {
    if (docxContainerRef.current) {
      docxContainerRef.current.innerHTML = '';
      try {
        await renderAsync(blob, docxContainerRef.current, undefined, {
          className: 'docx-preview-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
      } catch (err) {
        console.error('DOCX render error:', err);
        docxContainerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">Failed to render document</div>';
      }
    }
  }, []);

  // When docxBlob is set, render it
  useEffect(() => {
    if (previewDocxBlob && docxContainerRef.current) {
      renderDocx(previewDocxBlob);
    }
  }, [previewDocxBlob, renderDocx]);

  const handlePreviewExisting = async (resumeId: string) => {
    setPreviewLoading('existing');
    try {
      const blob = await resumeService.preview(resumeId);
      const isPdf = await isPdfBlob(blob);

      if (isPdf) {
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(pdfBlob);
        setPreviewUrl(url);
        setPreviewDocxBlob(null);
        setPreviewTitle('Existing Resume');
      } else {
        // Backend returned DOCX/DOC - render using docx-preview
        setPreviewUrl(null);
        setPreviewDocxBlob(blob);
        setPreviewTitle('Existing Resume');
      }
    } catch {
      // Fallback: try download endpoint
      try {
        const blob = await resumeService.download(resumeId);
        const isPdf = await isPdfBlob(blob);
        if (isPdf) {
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(pdfBlob);
          setPreviewUrl(url);
          setPreviewDocxBlob(null);
          setPreviewTitle('Existing Resume');
        } else {
          setPreviewUrl(null);
          setPreviewDocxBlob(blob);
          setPreviewTitle('Existing Resume');
        }
      } catch {
        setPreviewUrl(null);
        setPreviewDocxBlob(null);
        setPreviewTitle('');
      }
    } finally {
      setPreviewLoading(null);
    }
  };

  const handlePreviewNew = async (file: File) => {
    setPreviewLoading('new');
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        const url = window.URL.createObjectURL(file);
        setPreviewUrl(url);
        setPreviewDocxBlob(null);
        setPreviewTitle('New Resume');
      } else {
        // DOCX/DOC - render using docx-preview
        setPreviewUrl(null);
        setPreviewDocxBlob(file);
        setPreviewTitle('New Resume');
      }
    } finally {
      setPreviewLoading(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPreviewDocxBlob(null);
    setPreviewTitle('');
  };

  const showPreviewModal = previewUrl || previewDocxBlob;

  // Auto-resolve exact duplicates as 'discard' on mount
  useEffect(() => {
    if (exactDuplicates.length > 0) {
      const autoResolutions = new Map(resolutions);
      exactDuplicates.forEach(({ originalIndex }) => {
        autoResolutions.set(originalIndex, 'discard');
      });
      setResolutions(autoResolutions);
    }
  }, [exactDuplicates]);

  // If only exact duplicates, auto-close after showing message
  useEffect(() => {
    if (hasOnlyExactDuplicates && exactDuplicates.length > 0) {
      // Auto-resolve all exact duplicates as discarded
      const autoResolutions = exactDuplicates.map(({ originalIndex }) => ({
        fileIndex: originalIndex,
        action: 'discard' as const
      }));

      // Show blocked message briefly, then auto-resolve
      const timer = setTimeout(() => {
        onResolve(autoResolutions);
      }, 3000); // 3 seconds to read the message

      return () => clearTimeout(timer);
    }
  }, [hasOnlyExactDuplicates, exactDuplicates, onResolve]);

  const currentVersion = versionsWithChanges[currentVersionIndex];
  const currentDuplicate = currentVersion?.file;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  // Check if version limit is reached for the current resume
  const isVersionLimitReached = useMemo(() => {
    if (!currentDuplicate?.existingResume) return false;
    const versionCount = currentDuplicate.existingResume.version_count || currentDuplicate.existingResume.version || 1;
    return versionCount >= MAX_VERSIONS_PER_RESUME;
  }, [currentDuplicate]);

  const handleSelectAction = (action: 'discard' | 'overwrite' | 'version') => {
    if (!currentVersion) return;
    // Prevent selecting 'version' if limit is reached
    if (action === 'version' && isVersionLimitReached) return;
    setSelectedAction(action);
    const newResolutions = new Map(resolutions);
    newResolutions.set(currentVersion.originalIndex, action);
    setResolutions(newResolutions);
  };

  const handleNext = () => {
    if (currentVersionIndex < versionsWithChanges.length - 1) {
      const nextIndex = currentVersionIndex + 1;
      setCurrentVersionIndex(nextIndex);
      setSelectedAction(resolutions.get(versionsWithChanges[nextIndex].originalIndex) || null);
    }
  };

  const handlePrevious = () => {
    if (currentVersionIndex > 0) {
      const prevIndex = currentVersionIndex - 1;
      setCurrentVersionIndex(prevIndex);
      setSelectedAction(resolutions.get(versionsWithChanges[prevIndex].originalIndex) || null);
    }
  };

  const handleConfirm = () => {
    // Save current selection if not already saved
    if (currentVersion && selectedAction && !resolutions.has(currentVersion.originalIndex)) {
      resolutions.set(currentVersion.originalIndex, selectedAction);
    }

    // Build resolution array (exact duplicates are already auto-discarded)
    const resolutionArray = Array.from(resolutions.entries()).map(([fileIndex, action]) => ({
      fileIndex,
      action
    }));

    onResolve(resolutionArray);
  };

  // Check if all versions with changes have been resolved (exact duplicates are auto-resolved)
  const allVersionsResolved = versionsWithChanges.every(({ originalIndex }) =>
    resolutions.has(originalIndex) ||
    (currentVersion && originalIndex === currentVersion.originalIndex && selectedAction)
  );

  // Show blocked message for exact duplicates only
  if (hasOnlyExactDuplicates) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-lg w-full max-h-[calc(100dvh-2rem)] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-red-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <Ban className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">
                  Upload Blocked
                </h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  {exactDuplicates.length === 1
                    ? 'This resume is an exact duplicate and cannot be uploaded.'
                    : `${exactDuplicates.length} resumes are exact duplicates and cannot be uploaded.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const autoResolutions = exactDuplicates.map(({ originalIndex }) => ({
                  fileIndex: originalIndex,
                  action: 'discard' as const
                }));
                onResolve(autoResolutions);
              }}
              className="p-2 hover:bg-red-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
              <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Duplicate Resume{exactDuplicates.length > 1 ? 's' : ''} Rejected
              </h4>
              <p className="text-sm text-red-700 mb-3">
                The following file{exactDuplicates.length > 1 ? 's contain' : ' contains'} identical information to existing resume{exactDuplicates.length > 1 ? 's' : ''} in the system:
              </p>
              <ul className="space-y-2">
                {exactDuplicates.map(({ file, originalIndex }) => (
                  <li key={originalIndex} className="flex items-center gap-2 text-sm text-red-800">
                    <FileText className="w-4 h-4 text-red-500" />
                    <span className="font-medium">{file.file.name}</span>
                    <span className="text-red-600">→ matches {file.existingResume.candidate_name}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
              <p className="text-xs text-gray-600 dark:text-slate-400">
                <span className="font-medium">Note:</span> Exact duplicates are automatically blocked to prevent data redundancy.
                The existing candidate records remain unchanged. This window will close automatically.
              </p>
            </div>

            {/* Auto-close countdown */}
            <div className="mt-4 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-500">
                <Loader2 className="w-4 h-4 text-gray-600 dark:text-slate-400 animate-spin" />
                <span>Closing automatically...</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => {
                // Resolve all as discarded immediately
                const autoResolutions = exactDuplicates.map(({ originalIndex }) => ({
                  fileIndex: originalIndex,
                  action: 'discard' as const
                }));
                onResolve(autoResolutions);
              }}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
            >
              Close Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if no versions to show
  if (!currentDuplicate) {
    return null;
  }

  return (
    <>
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-4xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1">
                Resume Update Detected
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                This candidate already exists in the system. Choose how to handle this update.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
          </button>
        </div>

        {/* File Counter */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              Resume {currentVersionIndex + 1} of {versionsWithChanges.length}
            </span>
            {exactDuplicates.length > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                {exactDuplicates.length} duplicate{exactDuplicates.length > 1 ? 's' : ''} auto-blocked
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              Content Changes Detected
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-320px)]">
          {/* Candidate Info */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                {currentDuplicate.existingResume.candidate_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">{currentDuplicate.existingResume.candidate_name}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-500">{currentDuplicate.existingResume.email}</p>
              </div>
            </div>
          </div>

          {/* Comparison Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Existing Resume */}
            <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <h4 className="font-medium text-gray-900 dark:text-slate-50 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                  Existing Resume
                </h4>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">Location:</span>
                  <span className="text-gray-900 dark:text-slate-50">{currentDuplicate.existingResume.folder_path || 'My Resumes'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">Upload Date:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatISTDate(currentDuplicate.existingResume.upload_date)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">File Size:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatFileSize(currentDuplicate.existingResume.file_size)}</span>
                </div>
                {currentDuplicate.existingResume.version > 1 && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <span className="text-gray-600 dark:text-slate-400">Version:</span>
                    <span className="text-gray-900 dark:text-slate-50">v{currentDuplicate.existingResume.version}</span>
                  </div>
                )}
                <button
                  onClick={() => handlePreviewExisting(currentDuplicate.existingResume.id)}
                  disabled={previewLoading === 'existing'}
                  className="mt-2 w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {previewLoading === 'existing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {previewLoading === 'existing' ? 'Loading...' : 'Preview Existing'}
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
                  <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">File Name:</span>
                  <span className="text-gray-900 dark:text-slate-50 truncate">{currentDuplicate.file.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">Upload Date:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatISTDate(new Date().toISOString())}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <span className="text-gray-600 dark:text-slate-400">File Size:</span>
                  <span className="text-gray-900 dark:text-slate-50">{formatFileSize(currentDuplicate.file.size)}</span>
                </div>
                <button
                  onClick={() => handlePreviewNew(currentDuplicate.file)}
                  disabled={previewLoading === 'new'}
                  className="mt-2 w-full px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {previewLoading === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {previewLoading === 'new' ? 'Loading...' : 'Preview New'}
                </button>
              </div>
            </div>
          </div>

          {/* Content Differences */}
          {currentDuplicate.contentDifferences.length > 0 && (
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

          {/* Action Options */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 dark:text-slate-50 mb-3">Choose an action:</h4>

            {/* Option 1: Discard */}
            <button
              onClick={() => handleSelectAction('discard')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'discard'
                  ? 'border-gray-800 bg-gray-50 dark:bg-slate-800/50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'discard' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 dark:text-slate-50">1. Discard New Resume</h5>
                    {selectedAction === 'discard' && (
                      <Check className="w-5 h-5 text-gray-800" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                    Keep existing resume unchanged. New resume will be deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-500">
                    <span>• Old resume: <span className="text-gray-700 dark:text-slate-300">Unchanged</span></span>
                    <span>• New resume: <span className="text-red-600">Deleted</span></span>
                    <span>• Storage: <span className="text-gray-700 dark:text-slate-300">No impact</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Overwrite */}
            <button
              onClick={() => handleSelectAction('overwrite')}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                selectedAction === 'overwrite'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  selectedAction === 'overwrite' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-900 dark:text-slate-50">2. Overwrite Existing Resume</h5>
                    {selectedAction === 'overwrite' && (
                      <Check className="w-5 h-5 text-orange-500" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                    Replace old resume with new one. Original will be permanently deleted.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-500">
                    <span>• Old resume: <span className="text-red-600">Deleted</span></span>
                    <span>• New resume: <span className="text-green-600">Saved</span></span>
                    <span>• Consumes: <span className="text-orange-600">1 upload unit</span></span>
                  </div>
                </div>
              </div>
            </button>

            {/* Option 3: Save as Version */}
            <button
              onClick={() => handleSelectAction('version')}
              disabled={isVersionLimitReached}
              className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                isVersionLimitReached
                  ? 'border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 opacity-60 cursor-not-allowed'
                  : selectedAction === 'version'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isVersionLimitReached
                    ? 'bg-gray-300 text-gray-500 dark:text-slate-500'
                    : selectedAction === 'version' ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  {isVersionLimitReached ? <Ban className="w-5 h-5" /> : <GitBranch className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h5 className={`font-semibold ${isVersionLimitReached ? 'text-gray-500 dark:text-slate-500' : 'text-gray-900 dark:text-slate-50'}`}>
                        3. Save as New Version
                      </h5>
                      {!isVersionLimitReached && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Recommended</span>
                      )}
                      {isVersionLimitReached && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">Limit Reached</span>
                      )}
                    </div>
                    {selectedAction === 'version' && !isVersionLimitReached && (
                      <Check className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                  {isVersionLimitReached ? (
                    <div className="mt-2">
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-900 font-medium">Version Limit Exceeded</p>
                          <p className="text-xs text-red-700 mt-1">
                            Maximum {MAX_VERSIONS_PER_RESUME} versions allowed per candidate.
                            Current: {currentDuplicate.existingResume.version_count || currentDuplicate.existingResume.version || 1} versions.
                            Please choose "Overwrite Existing Resume" or "Discard New Resume" instead.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                        Keep both resumes. New resume stored as a versioned update. Recommended for tracking changes.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-slate-500">
                        <span>• Old resume: <span className="text-green-600">Kept</span></span>
                        <span>• New resume: <span className="text-green-600">Saved as v{currentDuplicate.existingResume.version + 1}</span></span>
                        <span>• Consumes: <span className="text-orange-600">1 upload unit</span></span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* Note */}
          <div className="mt-6 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
            <p className="text-xs text-gray-600 dark:text-slate-400">
              <span className="font-medium">Note:</span> All actions are fully audit logged.
              Overwriting or saving as a new version will consume 1 resume upload unit from your quota.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentVersionIndex === 0}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentVersionIndex === versionsWithChanges.length - 1}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            {versionsWithChanges.map(({ originalIndex }, index) => (
              <div
                key={originalIndex}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  resolutions.has(originalIndex) || (index === currentVersionIndex && selectedAction)
                    ? 'bg-green-500'
                    : index === currentVersionIndex
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
              className="px-5 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors font-medium"
            >
              Cancel All
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedAction}
              className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {allVersionsResolved ? 'Confirm All' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Inline Preview Modal */}
    {showPreviewModal && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[110]" onClick={closePreview}>
        <div className="bg-white rounded-xl w-[90vw] h-[85vh] max-w-4xl flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900 dark:text-slate-50">{previewTitle}</h3>
            </div>
            <button onClick={closePreview} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title={previewTitle}
              />
            ) : (
              <div ref={docxContainerRef} className="w-full h-full overflow-auto bg-white dark:bg-slate-900 p-4" />
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
