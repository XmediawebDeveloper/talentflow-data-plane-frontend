'use client';

import { X, Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { toast } from 'sonner';
import { resumeService } from '@/lib/services/resumeService';
import type { DuplicateFile, ExistingResume } from './DuplicateResumeModal';

// Dynamic import to avoid SSR issues with docx-preview dependency
const DuplicateResumeModal = dynamic(() => import('./DuplicateResumeModal'), {
  ssr: false,
  loading: () => <div>Loading...</div>
});

interface FileWithStatus {
  file: File;
  status: 'pending' | 'checking' | 'valid' | 'duplicate' | 'version' | 'error';
  error?: string;
  existingResume?: ExistingResume;
  contentDifferences?: string[];
}

interface ResumeUploadModalProps {
  jobTitle: string;
  onClose: () => void;
  onSubmit: (files: File[]) => void;
}

export default function ResumeUploadModal({ jobTitle, onClose, onSubmit }: ResumeUploadModalProps) {
  const { available: resumeUploadAvailable } = usePlanFeature('resume_upload');

  if (!resumeUploadAvailable) {
    toast.error('Resume Storage is not available in your plan');
    onClose?.();
    return null;
  }

  const [filesWithStatus, setFilesWithStatus] = useState<FileWithStatus[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicatesToResolve, setDuplicatesToResolve] = useState<DuplicateFile[]>([]);

  // Quota check for RU (Resume Upload)
  const { checkQuota, status: quotaStatus, canProceed: hasQuota, isChecking: isCheckingQuota } = useQuotaCheck();
  const [quotaChecked, setQuotaChecked] = useState(false);
  const [quotaRemaining, setQuotaRemaining] = useState<number>(-1);

  const selectedFiles = filesWithStatus.map(f => f.file);
  const validFiles = filesWithStatus.filter(f => f.status === 'valid').map(f => f.file);
  const duplicateFiles = filesWithStatus.filter(f => f.status === 'duplicate');
  const versionFiles = filesWithStatus.filter(f => f.status === 'version');
  const errorFiles = filesWithStatus.filter(f => f.status === 'error');

  // Check quota on mount and when files change
  useEffect(() => {
    const checkResumeQuota = async () => {
      try {
        const canUpload = await checkQuota('RU', selectedFiles.length || 1);
        setQuotaChecked(true);
        if (quotaStatus.data?.total_remaining !== undefined) {
          setQuotaRemaining(quotaStatus.data.total_remaining);
        }
      } catch (error) {
        console.error('Quota check failed:', error);
        // Fail-open: allow upload if quota check fails
        setQuotaChecked(true);
        setQuotaRemaining(-1);
      }
    };

    // Set a timeout to ensure modal becomes usable even if quota check is slow
    const timeoutId = setTimeout(() => {
      if (!quotaChecked) {
        setQuotaChecked(true);
        setQuotaRemaining(-1);
      }
    }, 3000);

    checkResumeQuota();

    return () => clearTimeout(timeoutId);
  }, [checkQuota, selectedFiles.length]);

  // Check if selected files exceed quota
  const filesExceedQuota = quotaRemaining !== -1 && validFiles.length > quotaRemaining;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files).filter(
        file => file.type === 'application/pdf' ||
                file.type === 'text/plain' ||
                file.name.endsWith('.doc') ||
                file.name.endsWith('.docx') ||
                file.name.endsWith('.txt') ||
                file.name.endsWith('.rtf')
      );
      addFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files);
      addFiles(files);
    }
  };

  const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

  const addFiles = async (files: File[]) => {
    // Add files with pending status, marking oversized files as errors immediately
    const newFilesWithStatus: FileWithStatus[] = files.map(file => {
      if (file.size > MAX_FILE_SIZE) {
        return {
          file,
          status: 'error' as const,
          error: `File size exceeds the 3MB limit. This file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Please upload a smaller file.`
        };
      }
      return { file, status: 'pending' as const };
    });

    setFilesWithStatus(prev => [...prev, ...newFilesWithStatus]);

    // Check for duplicates (only among non-errored files)
    await checkDuplicates([...filesWithStatus, ...newFilesWithStatus]);
  };

  const checkDuplicates = async (files: FileWithStatus[]) => {
    setIsCheckingDuplicates(true);

    // Update all pending files to checking (skip already-errored files like oversized)
    setFilesWithStatus(prev => prev.map(f =>
      f.status === 'pending' ? { ...f, status: 'checking' as const } : f
    ));

    try {
      // CLIENT-SIDE DUPLICATE DETECTION
      // Check if any files have the same base name (ignoring extension)
      // This catches PDF/DOC/DOCX of the same file uploaded together

      await new Promise(resolve => setTimeout(resolve, 300));

      // Helper function to get base name without extension
      const getBaseName = (fileName: string): string => {
        // Remove extension and normalize
        return fileName.replace(/\.(pdf|doc|docx|txt|rtf)$/i, '').toLowerCase().trim();
      };

      // Separate already-errored files (e.g. oversized) from files to check
      const erroredFiles = files.filter(f => f.status === 'error');
      const filesToCheck = files.filter(f => f.status !== 'error');

      // Group files by base name
      const filesByBaseName = new Map<string, FileWithStatus[]>();
      filesToCheck.forEach(fileWithStatus => {
        const baseName = getBaseName(fileWithStatus.file.name);
        if (!filesByBaseName.has(baseName)) {
          filesByBaseName.set(baseName, []);
        }
        filesByBaseName.get(baseName)!.push(fileWithStatus);
      });

      // Check for duplicates (same base name, different extensions)
      const updatedFiles: FileWithStatus[] = [...erroredFiles];
      let hasDuplicates = false;

      filesByBaseName.forEach((filesGroup, baseName) => {
        if (filesGroup.length > 1) {
          // Multiple files with same base name = DUPLICATES!
          hasDuplicates = true;

          // Mark all files in this group as duplicates
          filesGroup.forEach((fileWithStatus, index) => {
            const otherFiles = filesGroup
              .filter((_, i) => i !== index)
              .map(f => f.file.name)
              .join(', ');

            updatedFiles.push({
              ...fileWithStatus,
              status: 'error',
              error: `Duplicate file detected! This file is the same as: ${otherFiles}. Please upload only ONE version of each resume.`
            });
          });
        } else {
          // Only one file with this base name - mark as valid
          updatedFiles.push({
            ...filesGroup[0],
            status: 'valid'
          });
        }
      });

      // Update files with validation results
      setFilesWithStatus(updatedFiles);

      // If duplicates found, show error message
      if (hasDuplicates) {
        // Error will be shown in the UI via status badges and error messages
        console.warn('Duplicate files detected in upload');
      }

    } catch (error) {
      console.error('Error checking duplicates:', error);
      // Mark all checking files as valid (fallback), preserve error files
      setFilesWithStatus(prev => prev.map(f =>
        f.status === 'checking' ? { ...f, status: 'valid' as const } : f
      ));
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const removeFile = (index: number) => {
    setFilesWithStatus(prev => prev.filter((_, i) => i !== index));
  };

  const handleResolveFiles = () => {
    // Collect files that need resolution (versions and duplicates)
    const filesToResolve: DuplicateFile[] = filesWithStatus
      .filter(f => f.status === 'duplicate' || f.status === 'version')
      .map(f => ({
        file: f.file,
        existingResume: f.existingResume!,
        contentDifferences: f.contentDifferences || [],
        isDuplicate: f.status === 'duplicate'
      }));

    if (filesToResolve.length > 0) {
      setDuplicatesToResolve(filesToResolve);
      setShowDuplicateModal(true);
    }
  };

  const handleDuplicateResolution = (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => {
    // Process resolutions
    const resolvedFileNames = new Set<string>();
    const filesToKeep: FileWithStatus[] = [];

    resolutions.forEach(resolution => {
      const duplicate = duplicatesToResolve[resolution.fileIndex];
      if (resolution.action === 'discard') {
        // Remove the file
        resolvedFileNames.add(duplicate.file.name);
      } else {
        // Mark for upload (overwrite or version)
        resolvedFileNames.add(duplicate.file.name);
        filesToKeep.push({
          file: duplicate.file,
          status: 'valid',
          existingResume: duplicate.existingResume
        });
      }
    });

    // Update files list
    setFilesWithStatus(prev => {
      const filtered = prev.filter(f =>
        !resolvedFileNames.has(f.file.name) || f.status === 'valid'
      );
      return [...filtered, ...filesToKeep.filter(f =>
        !filtered.some(existing => existing.file.name === f.file.name)
      )];
    });

    setShowDuplicateModal(false);
    setDuplicatesToResolve([]);
  };

  const [showNoFilesError, setShowNoFilesError] = useState(false);

  const handleSubmit = () => {
    // Show error if no valid files selected
    if (validFiles.length === 0) {
      setShowNoFilesError(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowNoFilesError(false), 3000);
      return;
    }
    onSubmit(validFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'duplicate':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'version':
        return <RefreshCw className="w-5 h-5 text-amber-500" />;
      case 'checking':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400 dark:text-slate-500" />;
    }
  };

  const getStatusBadge = (fileWithStatus: FileWithStatus) => {
    switch (fileWithStatus.status) {
      case 'valid':
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Ready</span>;
      case 'duplicate':
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Exact Duplicate</span>;
      case 'version':
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">Update Available</span>;
      case 'checking':
        return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Checking...</span>;
      case 'error':
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Error</span>;
      default:
        return null;
    }
  };

  const needsResolution = duplicateFiles.length > 0 || versionFiles.length > 0;

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-gray-900 dark:text-slate-50 mb-1">Upload Resumes</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Add applicants to: <span className="text-gray-800 dark:text-slate-100">{jobTitle}</span></p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
             aria-label="Close">
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 p-6 overflow-y-auto">
            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? 'border-gray-700 bg-gray-50 dark:bg-slate-800/50'
                  : 'border-gray-300 dark:border-slate-700 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-gray-800 dark:text-slate-100" />
              </div>
              <h3 className="text-gray-900 dark:text-slate-50 mb-2">Drop resumes here</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                or click to browse from your computer
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.rtf"
                onChange={handleFileSelect}
                className="hidden"
                id="resume-upload"
              />
              <label
                htmlFor="resume-upload"
                className="inline-flex items-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
              >
                <Upload className="w-5 h-5" />
                Browse Files
              </label>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-4">
                Supported formats: PDF, DOC, DOCX, RTF, TXT (Max 3MB per file)
              </p>
            </div>

            {/* Duplicate Check Info */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">
                  <span className="font-medium">Duplicate Detection:</span> Each resume is automatically checked against existing records to prevent duplicates and manage versions.
                </p>
              </div>
            </div>

            {/* Selected Files List */}
            {filesWithStatus.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm text-gray-700 dark:text-slate-300">
                    Selected Files ({filesWithStatus.length})
                  </h4>
                  {isCheckingDuplicates && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Checking for duplicates...
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {filesWithStatus.map((fileWithStatus, index) => (
                    <div key={index} className="space-y-1">
                      <div
                        className={`flex items-center gap-3 p-3 rounded-lg border ${
                          fileWithStatus.status === 'error'
                            ? 'bg-red-50 border-red-300'
                            : fileWithStatus.status === 'duplicate'
                            ? 'bg-red-50 border-red-200'
                            : fileWithStatus.status === 'version'
                            ? 'bg-amber-50 border-amber-200'
                            : fileWithStatus.status === 'valid'
                            ? 'bg-green-50 border-green-200'
                            : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${
                          fileWithStatus.status === 'error'
                            ? 'bg-red-100'
                            : fileWithStatus.status === 'duplicate'
                            ? 'bg-red-100'
                            : fileWithStatus.status === 'version'
                            ? 'bg-amber-100'
                            : fileWithStatus.status === 'valid'
                            ? 'bg-green-100'
                            : 'bg-gray-100 dark:bg-slate-800'
                        }`}>
                          <FileText className="w-5 h-5 text-gray-800 dark:text-slate-100" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-slate-50 truncate">{fileWithStatus.file.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-500 dark:text-slate-500">{formatFileSize(fileWithStatus.file.size)}</p>
                            {fileWithStatus.existingResume && (
                              <p className="text-xs text-gray-500 dark:text-slate-500">
                                • Matches: {fileWithStatus.existingResume.candidate_name}
                              </p>
                            )}
                          </div>
                        </div>
                        {getStatusBadge(fileWithStatus)}
                        {getStatusIcon(fileWithStatus.status)}
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md transition-colors flex-shrink-0"
                         aria-label="Close">
                          <X className="w-4 h-4 text-gray-500 dark:text-slate-500" />
                        </button>
                      </div>
                      {/* Show error message below file */}
                      {fileWithStatus.status === 'error' && fileWithStatus.error && (
                        <div className="ml-12 px-3 py-2 bg-red-100 border border-red-200 rounded-lg">
                          <p className="text-xs text-red-800 font-medium">
                            {fileWithStatus.error}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Error Files Summary (Client-Side Duplicates) */}
                {errorFiles.length > 0 && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-300 rounded-lg">
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h5 className="text-sm font-medium text-red-900 mb-1">Cannot Upload - Duplicate Files Detected!</h5>
                        <p className="text-xs text-red-800 mb-2">
                          You've selected {errorFiles.length} file{errorFiles.length > 1 ? 's' : ''} that {errorFiles.length > 1 ? 'are' : 'is'} the same resume in different formats (PDF, DOC, DOCX).
                          Please <strong>remove the duplicate files</strong> and keep only ONE version of each resume.
                        </p>
                        <p className="text-xs text-red-700 font-medium">
                          ❌ Upload button is disabled until duplicates are removed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Duplicate/Version Summary */}
                {(duplicateFiles.length > 0 || versionFiles.length > 0) && (
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h5 className="text-sm font-medium text-amber-900 mb-1">Action Required</h5>
                        <p className="text-xs text-amber-800 mb-3">
                          {duplicateFiles.length > 0 && (
                            <span className="block">{duplicateFiles.length} exact duplicate{duplicateFiles.length > 1 ? 's' : ''} found - cannot be uploaded</span>
                          )}
                          {versionFiles.length > 0 && (
                            <span className="block">{versionFiles.length} resume{versionFiles.length > 1 ? 's' : ''} with updates detected - choose how to handle</span>
                          )}
                        </p>
                        <button
                          onClick={handleResolveFiles}
                          className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
                        >
                          Resolve {duplicateFiles.length + versionFiles.length} File{duplicateFiles.length + versionFiles.length > 1 ? 's' : ''}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quota Warning */}
            {quotaChecked && (!hasQuota || filesExceedQuota) && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-medium text-red-900 mb-1">Resume Storage Quota {!hasQuota ? 'Exceeded' : 'Warning'}</h5>
                    <p className="text-xs text-red-700">
                      {!hasQuota ? (
                        <>You have reached your resume upload limit. </>
                      ) : filesExceedQuota ? (
                        <>You can only upload {quotaRemaining} more resume{quotaRemaining !== 1 ? 's' : ''}. You've selected {validFiles.length}. </>
                      ) : null}
                      <a href="/subscription" className="underline font-medium">Upgrade your plan</a> to upload more resumes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Quota Info */}
            {quotaChecked && quotaRemaining !== -1 && hasQuota && !filesExceedQuota && validFiles.length > 0 && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-medium text-green-900 mb-1">Ready to Upload</h5>
                    <p className="text-xs text-green-700">
                      {validFiles.length} valid resume{validFiles.length > 1 ? 's' : ''} ready. You have {quotaRemaining} upload{quotaRemaining !== 1 ? 's' : ''} remaining.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-gray-800 dark:text-slate-100 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm text-gray-800 dark:text-slate-100 mb-1">What happens next?</h5>
                  <p className="text-xs text-gray-900 dark:text-slate-50">
                    Resumes will be automatically parsed and scored against the job requirements.
                    You'll see the scoring results after submission.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* No Files Error Alert */}
          {showNoFilesError && (
            <div className="mx-6 mb-0 p-4 bg-red-50 border border-red-300 rounded-lg animate-pulse">
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">No files selected!</p>
                  <p className="text-xs text-red-700">Please select at least one resume file to upload.</p>
                </div>
                <button
                  onClick={() => setShowNoFilesError(false)}
                  className="p-1 hover:bg-red-100 rounded"
                 aria-label="Close">
                  <X className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              {isCheckingQuota || isCheckingDuplicates ? (
                <span className="text-gray-500 dark:text-slate-500 animate-pulse flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isCheckingDuplicates ? 'Checking for duplicates...' : 'Checking quota...'}
                </span>
              ) : errorFiles.length > 0 ? (
                <span className="text-red-600 flex items-center gap-1 font-medium">
                  <XCircle className="w-4 h-4" />
                  Remove duplicate files to continue
                </span>
              ) : needsResolution ? (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Resolve duplicates before uploading
                </span>
              ) : validFiles.length > 0 ? (
                filesExceedQuota || !hasQuota ? (
                  <span className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {!hasQuota ? 'Quota exceeded' : `Exceeds quota (max ${quotaRemaining})`}
                  </span>
                ) : (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    {validFiles.length} file{validFiles.length > 1 ? 's' : ''} ready to upload
                  </span>
                )
              ) : (
                <span className="text-gray-500 dark:text-slate-500">No files selected</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!hasQuota || filesExceedQuota || isCheckingQuota || isCheckingDuplicates || needsResolution || errorFiles.length > 0}
                className={`px-6 py-2.5 rounded-lg transition-colors ${
                  validFiles.length === 0 && !isCheckingQuota && !isCheckingDuplicates
                    ? 'bg-gray-400 text-white hover:bg-gray-500 cursor-pointer'
                    : 'bg-gray-800 text-white hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed'
                }`}
              >
                {isCheckingQuota || isCheckingDuplicates
                  ? 'Checking...'
                  : !hasQuota || filesExceedQuota
                    ? 'Quota Exceeded'
                    : needsResolution
                      ? 'Resolve Duplicates First'
                      : errorFiles.length > 0
                        ? 'Remove Duplicates First'
                        : validFiles.length === 0
                          ? 'Select Files to Upload'
                          : 'Upload & Score Resumes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && duplicatesToResolve.length > 0 && (
        <DuplicateResumeModal
          duplicates={duplicatesToResolve}
          onClose={() => {
            setShowDuplicateModal(false);
            setDuplicatesToResolve([]);
          }}
          onResolve={handleDuplicateResolution}
        />
      )}
    </>
  );
}
