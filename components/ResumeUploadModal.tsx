'use client';

import { X, Upload, FileText, CheckCircle2, AlertCircle, AlertTriangle, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuotaCheck } from '@/lib/hooks/useQuotaCheck';
import { resumeService } from '@/lib/services/resumeService';
import DuplicateResumeModal, { DuplicateFile, ExistingResume } from './DuplicateResumeModal';

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
      const canUpload = await checkQuota('RU', selectedFiles.length || 1);
      setQuotaChecked(true);
      if (quotaStatus.data?.total_remaining !== undefined) {
        setQuotaRemaining(quotaStatus.data.total_remaining);
      }
    };
    checkResumeQuota();
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
        file => file.type === 'application/pdf' || file.name.endsWith('.doc') || file.name.endsWith('.docx')
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

  const addFiles = async (files: File[]) => {
    // Add files with pending status
    const newFilesWithStatus: FileWithStatus[] = files.map(file => ({
      file,
      status: 'pending' as const
    }));

    setFilesWithStatus(prev => [...prev, ...newFilesWithStatus]);

    // Check for duplicates
    await checkDuplicates([...filesWithStatus, ...newFilesWithStatus]);
  };

  const checkDuplicates = async (files: FileWithStatus[]) => {
    setIsCheckingDuplicates(true);

    // Update all pending files to checking
    setFilesWithStatus(prev => prev.map(f =>
      f.status === 'pending' ? { ...f, status: 'checking' as const } : f
    ));

    try {
      // Call API to check for duplicates
      const formData = new FormData();
      files.filter(f => f.status === 'pending' || f.status === 'checking').forEach(f => {
        formData.append('files', f.file);
      });

      // Mock duplicate check - In real implementation, call API
      // const response = await resumeService.checkDuplicates(formData);

      // Simulate API response with mock data
      const mockCheckResults = await simulateDuplicateCheck(files.filter(f => f.status === 'checking'));

      // Update file statuses based on check results
      setFilesWithStatus(prev => prev.map(f => {
        const result = mockCheckResults.find(r => r.fileName === f.file.name);
        if (result) {
          return {
            ...f,
            status: result.status,
            existingResume: result.existingResume,
            contentDifferences: result.contentDifferences,
            error: result.error
          };
        }
        return f;
      }));

    } catch (error) {
      console.error('Error checking duplicates:', error);
      // Mark all checking files as valid (fallback)
      setFilesWithStatus(prev => prev.map(f =>
        f.status === 'checking' ? { ...f, status: 'valid' as const } : f
      ));
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  // Mock duplicate check simulation
  const simulateDuplicateCheck = async (files: FileWithStatus[]): Promise<{
    fileName: string;
    status: 'valid' | 'duplicate' | 'version';
    existingResume?: ExistingResume;
    contentDifferences?: string[];
    error?: string;
  }[]> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // For demo, randomly mark some files as duplicates/versions
    return files.map(f => {
      const random = Math.random();

      // 70% valid, 15% version, 15% duplicate
      if (random < 0.7) {
        return { fileName: f.file.name, status: 'valid' as const };
      } else if (random < 0.85) {
        // Version - same candidate, different content
        return {
          fileName: f.file.name,
          status: 'version' as const,
          existingResume: {
            id: 'existing-' + Date.now(),
            candidate_name: f.file.name.replace(/\.(pdf|doc|docx)$/i, '').replace(/[-_]/g, ' '),
            email: 'candidate@example.com',
            folder_name: 'Senior Developers',
            folder_path: 'My Resumes / Senior Developers',
            upload_date: '2024-10-15',
            file_size: 235520,
            file_name: f.file.name,
            version: 1
          },
          contentDifferences: [
            'Skills section updated (added 3 new skills)',
            'Work experience added: Senior Developer at TechCorp',
            'Education details updated',
            'Contact information modified'
          ]
        };
      } else {
        // Exact duplicate
        return {
          fileName: f.file.name,
          status: 'duplicate' as const,
          existingResume: {
            id: 'existing-' + Date.now(),
            candidate_name: f.file.name.replace(/\.(pdf|doc|docx)$/i, '').replace(/[-_]/g, ' '),
            email: 'candidate@example.com',
            folder_name: 'All Resumes',
            folder_path: 'My Resumes / All Resumes',
            upload_date: '2024-11-20',
            file_size: f.file.size,
            file_name: f.file.name,
            version: 1
          },
          contentDifferences: []
        };
      }
    });
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

  const handleSubmit = () => {
    if (validFiles.length > 0) {
      onSubmit(validFiles);
    }
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
        return <FileText className="w-5 h-5 text-gray-400" />;
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-gray-900 mb-1">Upload Resumes</h2>
              <p className="text-sm text-gray-600">Add applicants to: <span className="text-gray-800">{jobTitle}</span></p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? 'border-gray-700 bg-gray-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-gray-800" />
              </div>
              <h3 className="text-gray-900 mb-2">Drop resumes here</h3>
              <p className="text-sm text-gray-600 mb-4">
                or click to browse from your computer
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
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
              <p className="text-xs text-gray-500 mt-4">
                Supported formats: PDF, DOC, DOCX (Max 10MB per file)
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
                  <h4 className="text-sm text-gray-700">
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
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        fileWithStatus.status === 'duplicate'
                          ? 'bg-red-50 border-red-200'
                          : fileWithStatus.status === 'version'
                          ? 'bg-amber-50 border-amber-200'
                          : fileWithStatus.status === 'valid'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${
                        fileWithStatus.status === 'duplicate'
                          ? 'bg-red-100'
                          : fileWithStatus.status === 'version'
                          ? 'bg-amber-100'
                          : fileWithStatus.status === 'valid'
                          ? 'bg-green-100'
                          : 'bg-gray-100'
                      }`}>
                        <FileText className="w-5 h-5 text-gray-800" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{fileWithStatus.file.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-500">{formatFileSize(fileWithStatus.file.size)}</p>
                          {fileWithStatus.existingResume && (
                            <p className="text-xs text-gray-500">
                              • Matches: {fileWithStatus.existingResume.candidate_name}
                            </p>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(fileWithStatus)}
                      {getStatusIcon(fileWithStatus.status)}
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1.5 hover:bg-gray-200 rounded-md transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>

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
                    <h5 className="text-sm font-medium text-red-900 mb-1">Resume Upload Quota {!hasQuota ? 'Exceeded' : 'Warning'}</h5>
                    <p className="text-xs text-red-700">
                      {!hasQuota ? (
                        <>You have reached your resume upload limit. </>
                      ) : filesExceedQuota ? (
                        <>You can only upload {quotaRemaining} more resume{quotaRemaining !== 1 ? 's' : ''}. You've selected {validFiles.length}. </>
                      ) : null}
                      <a href="/subscription/plans" className="underline font-medium">Upgrade your plan</a> to upload more resumes.
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
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-gray-800 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm text-gray-800 mb-1">What happens next?</h5>
                  <p className="text-xs text-gray-900">
                    Resumes will be automatically parsed and scored against the job requirements.
                    You'll see the scoring results after submission.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              {isCheckingQuota || isCheckingDuplicates ? (
                <span className="text-gray-500 animate-pulse flex items-center gap-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isCheckingDuplicates ? 'Checking for duplicates...' : 'Checking quota...'}
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
                <span>No files selected</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={validFiles.length === 0 || !hasQuota || filesExceedQuota || isCheckingQuota || isCheckingDuplicates || needsResolution}
                className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isCheckingQuota || isCheckingDuplicates ? 'Checking...' : !hasQuota || filesExceedQuota ? 'Quota Exceeded' : needsResolution ? 'Resolve Duplicates First' : 'Upload & Score Resumes'}
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
