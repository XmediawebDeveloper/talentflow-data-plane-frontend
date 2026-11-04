'use client';

import { X, Upload, File, Trash2, GitBranch, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

// Dynamic import to avoid SSR issues with docx-preview dependency
const DuplicateResolutionModal = dynamic(() => import('./DuplicateResolutionModal'), {
  ssr: false,
  loading: () => <div>Loading...</div>
});

// File validation constants
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
  'text/plain'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];

interface FileValidationError {
  fileName: string;
  error: string;
  type: 'format' | 'size' | 'virus';
}

interface VersionUploadModalProps {
  onClose: () => void;
  onComplete: (action: 'discard' | 'overwrite' | 'version', files: File[]) => void;
}

export default function VersionUploadModal({ onClose, onComplete }: VersionUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validatedFiles = validateAndFilterFiles(files);
    setSelectedFiles(prev => [...prev, ...validatedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validatedFiles = validateAndFilterFiles(files);
      setSelectedFiles(prev => [...prev, ...validatedFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const validateAndFilterFiles = (files: File[]) => {
    const errors: FileValidationError[] = [];
    const validFiles: File[] = [];

    files.forEach(file => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      // Validate file format
      if (!ALLOWED_FORMATS.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
        errors.push({
          fileName: file.name,
          error: 'Unsupported file format. Only PDF, DOC, DOCX, RTF, and TXT files are allowed.',
          type: 'format'
        });
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push({
          fileName: file.name,
          error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(MAX_FILE_SIZE)}).`,
          type: 'size'
        });
        return;
      }

      // Simulate virus/malware scan (in production, this would be server-side)
      const random = Math.random();
      if (random < 0.02) { // 2% chance of virus detection for demo
        errors.push({
          fileName: file.name,
          error: 'Security scan detected potential malware. File rejected.',
          type: 'virus'
        });
        return;
      }

      // File is valid
      validFiles.push(file);
    });

    setValidationErrors(errors);
    return validFiles;
  };

  const handleProceedToResolution = () => {
    if (selectedFiles.length === 0) return;
    setShowResolutionModal(true);
  };

  const handleResolutionComplete = (resolutions: any[]) => {
    console.log('Version Resolution Actions:', resolutions);
    
    // In a real app, you'd process each resolution action
    // For now, we'll just show an alert and close
    const actionSummary = resolutions.map(r => `${r.fileName}: ${r.action}`).join('\n');
    toast.success('Version upload completed!');
    
    setShowResolutionModal(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-brand-blue" />
                </div>
                <div>
                  <h2 className="tf-section-title sm:text-lg">Version Upload</h2>
                  <p className="tf-body-muted mt-0.5">
                    Upload new versions of existing resumes
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-500 dark:text-slate-500 hover:text-brand-blue rounded-md hover:bg-brand-blue/5"
             aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Info Banner */}
            <div className="mb-6 p-4 bg-brand-blue/5 border border-brand-blue/15 rounded-xl ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="flex items-start gap-3">
                <GitBranch className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-brand-blue mb-1">Version Management</h3>
                  <p className="tf-meta">
                    Upload updated versions of candidate resumes. You'll be able to choose how to handle each version:
                  </p>
                  <ul className="tf-meta mt-2 space-y-1 ml-4">
                    <li>• <strong>Discard New Resume</strong> - Keep only the existing version</li>
                    <li>• <strong>Overwrite Existing</strong> - Replace with the new version</li>
                    <li>• <strong>Save as New Version</strong> - Keep both versions</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-brand-blue bg-brand-blue/5'
                  : 'border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-brand-blue/5 hover:border-brand-blue/30'
              }`}
            >
              <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
              <p className="text-gray-900 dark:text-slate-50 mb-2">
                Drop updated resumes here or click to browse
              </p>
              <p className="tf-body-secondary mb-4">
                Supported formats: PDF, DOCX, DOC
              </p>
              <div className="flex items-center justify-center gap-4 tf-meta">
                <span>• Max file size: 3MB</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-body">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiles([]);
                      setValidationErrors([]);
                    }}
                    className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 tf-card-soft"
                    >
                      <File className="w-5 h-5 text-brand-blue flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="tf-body truncate">{file.name}</div>
                        <div className="tf-meta">{formatFileSize(file.size)}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        className="p-1 text-gray-500 dark:text-slate-500 hover:text-red-600 rounded flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-body">
                    Validation Errors
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {validationErrors.map((error, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="tf-body truncate">{error.fileName}</div>
                        <div className="tf-meta">{error.error}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 flex items-center justify-end gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950">
            <button
              onClick={handleProceedToResolution}
              disabled={selectedFiles.length === 0}
              className="tf-btn tf-btn-primary flex px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors whitespace-normal justify-start font-normal"
            >
              <GitBranch className="w-4 h-4" />
              Proceed to Version Resolution
            </button>
          </div>
        </div>
      </div>

      {/* Resolution Modal */}
      {showResolutionModal && (
        <DuplicateResolutionModal
          duplicateFiles={selectedFiles.map((file, index) => ({
            fileName: file.name,
            candidateName: `Candidate ${index + 1}`,
            newResumeSize: formatFileSize(file.size),
            newResumeDate: formatISTDate(new Date().toISOString()),
            existingLocation: 'My Resumes / Senior Developers',
            existingResumeDate: '2024-10-15',
            existingResumeSize: '230 KB',
            contentChanges: [
              'Skills section updated (added 3 new skills)',
              'Work experience added: Senior Developer at TechCorp',
              'Education details updated',
              'Contact information modified'
            ]
          }))}
          onClose={() => setShowResolutionModal(false)}
          onResolve={handleResolutionComplete}
        />
      )}
    </>
  );
}
