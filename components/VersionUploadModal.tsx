import { X, Upload, File, Trash2, GitBranch, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';
import DuplicateResolutionModal from './DuplicateResolutionModal';

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

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
          error: 'Unsupported file format. Only PDF, DOC, and DOCX files are allowed.',
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
    alert(`Version upload completed!\n\n${actionSummary}`);
    
    setShowResolutionModal(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <GitBranch className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl text-gray-900">Version Upload</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Upload new versions of existing resumes
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {/* Info Banner */}
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-start gap-3">
                <GitBranch className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm text-purple-900 mb-1">Version Management</h3>
                  <p className="text-xs text-purple-700">
                    Upload updated versions of candidate resumes. You'll be able to choose how to handle each version:
                  </p>
                  <ul className="text-xs text-purple-700 mt-2 space-y-1 ml-4">
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
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-purple-600' : 'text-gray-400'}`} />
              <p className="text-gray-900 mb-2">
                Drop updated resumes here or click to browse
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Supported formats: PDF, DOCX, DOC
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                <span>• Max file size: 10MB</span>
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
                  <span className="text-sm text-gray-700">
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
                      className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg"
                    >
                      <File className="w-5 h-5 text-purple-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{file.name}</div>
                        <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 rounded flex-shrink-0"
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
                  <span className="text-sm text-gray-700">
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
                        <div className="text-sm text-gray-900 truncate">{error.fileName}</div>
                        <div className="text-xs text-gray-500">{error.error}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleProceedToResolution}
              disabled={selectedFiles.length === 0}
              className="flex items-center gap-2 px-8 py-2.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            newResumeDate: new Date().toLocaleDateString(),
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
