import { X, Upload, File, Trash2, FolderPlus, AlertCircle, CheckCircle, XCircle, Shield, HardDrive, FileText } from 'lucide-react';
import { useState, useRef } from 'react';
import { Folder } from '@/lib/types/types';
import { Tenant } from '@/lib/types/tenant';
import { recordResumeUpload } from '@/lib/services/usageTrackingService';

// Default constants for fallback
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_BULK_FILES = 300; // Async processing supports up to 300 files
const ALLOWED_FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

interface FileValidationError {
  fileName: string;
  error: string;
  type: 'format' | 'size' | 'storage' | 'virus' | 'limit' | 'duplicate';
  existingResume?: {
    id: string;
    candidateName: string;
    uploadedAt?: string;
  };
}

interface UploadModalProps {
  folders: Folder[];
  tenant: Tenant | null; // Pass tenant for validation
  uploadSection?: 'my-resumes' | 'internal-db'; // Which section is uploading
  onClose: () => void;
  onUpload: (files: File[], folderId?: string) => Promise<{
    success: boolean;
    error?: string;
    existingResume?: {
      id: string;
      candidateName: string;
      uploadedAt?: string;
    };
  }>;
  onUploadComplete?: (statuses: any[]) => void;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onViewResume?: (resumeId: string) => void;
  targetFolder?: string;
}

export default function UploadModal({ folders, tenant, uploadSection, onClose, onUpload, onUploadComplete, onCreateFolder, onViewResume, targetFolder }: UploadModalProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>(targetFolder || '');
  const [isDragging, setIsDragging] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get tenant-specific limits or use defaults
  const maxFileSizeMB = tenant?.subscription.limits.maxFileSizeMB || 10;
  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
  const storageLimitMB = (tenant?.subscription.limits.storageGB || 50) * 1024; // Convert GB to MB
  const storageUsedMB = tenant?.subscription.usage.storageUsedMB || 0;
  const virusScanEnabled = tenant?.subscription.limits.virusScanEnabled || false;

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

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onUpload(selectedFiles, selectedFolder || undefined);

      // Track usage - POST /api/v1/external/usage/record (RU for each resume uploaded)
      selectedFiles.forEach((file, index) => {
        recordResumeUpload(`upload-${Date.now()}-${index}`, {
          file_name: file.name,
          file_size_kb: Math.round(file.size / 1024),
          folder_id: selectedFolder || undefined,
          section: uploadSection
        });
      });

      // Generate upload status for bulk uploads
      if (activeTab === 'bulk' && selectedFiles.length > 1 && onUploadComplete) {
        // Simulate upload process with status tracking
        const statuses = selectedFiles.map((file, index) => {
          const random = Math.random();
          let status: 'completed' | 'updated' | 'duplicated' | 'version' | 'error' | 'pending';
          let errorMessage = undefined;
          let existingLocation = undefined;
          let versionInfo = undefined;
          
          if (random < 0.4) {
            status = 'completed';
          } else if (random < 0.5) {
            status = 'updated';
          } else if (random < 0.65) {
            status = 'duplicated';
            existingLocation = 'Frontend Developers / Senior Level';
          } else if (random < 0.75) {
            status = 'version';
            existingLocation = 'Backend Developers / Mid Level';
            versionInfo = 'Updated version detected - Resume last modified 2 weeks ago';
          } else if (random < 0.85) {
            status = 'pending';
          } else {
            status = 'error';
            errorMessage = 'File format not recognized or corrupted';
          }
          
          return {
            fileName: file.name,
            status,
            candidateName: `Candidate ${index + 1}`,
            errorMessage,
            existingLocation,
            versionInfo,
          };
        });
        
        onUploadComplete(statuses);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatStorage = (mb: number) => {
    // Convert MB to units (1 unit = 1 MB)
    const units = Math.round(mb);
    return units.toLocaleString() + ' units';
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() && onCreateFolder) {
      const newFolderId = `folder-${Date.now()}`;
      onCreateFolder(newFolderName.trim());
      setSelectedFolder(newFolderId); // Auto-select the newly created folder
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  const validateAndFilterFiles = (files: File[]) => {
    const errors: FileValidationError[] = [];
    const validFiles: File[] = [];
    const totalSizeMB = files.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);

    // ✅ STEP 2.3: Check tenant storage limit
    const availableStorageMB = storageLimitMB - storageUsedMB;
    if (totalSizeMB > availableStorageMB) {
      errors.push({
        fileName: '',
        error: `Storage limit exceeded. Available: ${formatStorage(availableStorageMB)}, Required: ${formatStorage(totalSizeMB)}. Upgrade your plan for more storage.`,
        type: 'storage'
      });
    }

    // Check bulk file limit
    if (activeTab === 'bulk' && files.length > MAX_BULK_FILES) {
      errors.push({
        fileName: '',
        error: `You can upload a maximum of ${MAX_BULK_FILES} files at once. You selected ${files.length} files.`,
        type: 'limit'
      });
    }

    files.forEach(file => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      // ✅ STEP 2.1: Validate file format (PDF, DOC, DOCX)
      if (!ALLOWED_FORMATS.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
        errors.push({
          fileName: file.name,
          error: 'Unsupported file format. Only PDF, DOC, and DOCX files are allowed.',
          type: 'format'
        });
        return;
      }

      // ✅ STEP 2.2: Validate maximum file size (tenant-specific)
      if (file.size > maxFileSizeBytes) {
        errors.push({
          fileName: file.name,
          error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${maxFileSizeMB} MB) for your plan.`,
          type: 'size'
        });
        return;
      }

      // ✅ STEP 2.4: Virus/malware scan (if enabled for tenant)
      if (virusScanEnabled) {
        const random = Math.random();
        if (random < 0.02) { // 2% chance of virus detection for demo
          errors.push({
            fileName: file.name,
            error: 'Security scan detected potential malware. File rejected for safety.',
            type: 'virus'
          });
          return;
        }
      }

      // File is valid
      validFiles.push(file);
    });

    setValidationErrors(errors);
    return validFiles;
  };

  const handleValidateAndUpload = async () => {
    if (selectedFiles.length === 0) return;

    // Final validation before upload
    const errors: FileValidationError[] = [];
    const totalSizeMB = selectedFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
    const availableStorageMB = storageLimitMB - storageUsedMB;

    if (totalSizeMB > availableStorageMB) {
      errors.push({
        fileName: '',
        error: `Storage limit exceeded. Available: ${formatStorage(availableStorageMB)}, Required: ${formatStorage(totalSizeMB)}. Please upgrade your plan.`,
        type: 'storage'
      });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // All validations passed, proceed with upload
    setIsUploading(true);
    setValidationErrors([]);

    try {
      const result = await onUpload(selectedFiles, selectedFolder || undefined);
      console.log('[UPLOAD-MODAL-DEBUG] Result from onUpload:', result);
      console.log('[UPLOAD-MODAL-DEBUG] result.existingResume:', result.existingResume);

      if (!result.success && result.error) {
        // Show duplicate error in the modal with existing resume details
        const errorObj = {
          fileName: selectedFiles[0]?.name || '',
          error: result.error,
          type: 'duplicate' as const,
          existingResume: result.existingResume
        };
        console.log('[UPLOAD-MODAL-DEBUG] Setting validationErrors:', errorObj);
        setValidationErrors([errorObj]);
        setIsUploading(false);
        return;
      }

      // Success - close modal
      onClose();
    } catch (error) {
      setValidationErrors([{
        fileName: '',
        error: 'Upload failed. Please try again.',
        type: 'format'
      }]);
      setIsUploading(false);
    }
  };

  const storagePercentage = (storageUsedMB / storageLimitMB) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl text-gray-900">Upload Resume</h2>
            <p className="text-sm text-gray-500 mt-1">
              {activeTab === 'single' ? 'Upload a single resume file' : 'Upload multiple resumes at once'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Storage Usage Indicator */}
          <div className="mb-6 p-4 bg-gradient-to-r from-gray-50 to-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-start gap-3">
              <HardDrive className="w-5 h-5 text-gray-800 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-900">Storage Usage</span>
                  <span className="text-sm text-gray-700">
                    {formatStorage(storageUsedMB)} / {formatStorage(storageLimitMB)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      storagePercentage >= 90 ? 'bg-red-600' : 
                      storagePercentage >= 70 ? 'bg-yellow-500' : 
                      'bg-gray-800'
                    }`}
                    style={{ width: `${Math.min(100, storagePercentage)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-600">
                    {formatStorage(storageLimitMB - storageUsedMB)} remaining
                  </span>
                  {virusScanEnabled && (
                    <span className="flex items-center gap-1 text-xs text-green-700">
                      <Shield className="w-3 h-3" />
                      Virus scan enabled
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('single')}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                activeTab === 'single'
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-center">
                <Upload className={`w-8 h-8 mx-auto mb-2 ${activeTab === 'single' ? 'text-gray-800' : 'text-gray-400'}`} />
                <div className={`text-sm mb-1 ${activeTab === 'single' ? 'text-gray-800' : 'text-gray-900'}`}>
                  Single Upload
                </div>
                <div className="text-xs text-gray-500">Upload one resume at a time</div>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('bulk')}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                activeTab === 'bulk'
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-center">
                <Upload className={`w-8 h-8 mx-auto mb-2 ${activeTab === 'bulk' ? 'text-gray-800' : 'text-gray-400'}`} />
                <div className={`text-sm mb-1 ${activeTab === 'bulk' ? 'text-gray-800' : 'text-gray-900'}`}>
                  Bulk Upload
                </div>
                <div className="text-xs text-gray-500">Upload multiple resumes (up to 300)</div>
              </div>
            </button>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-gray-800 bg-gray-50'
                : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-gray-800' : 'text-gray-400'}`} />
            <p className="text-gray-900 mb-2">
              {activeTab === 'single' ? 'Drop your resume here or click to browse' : 'Drop multiple resumes here or click to browse'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Supported formats: PDF, DOCX, DOC
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Max file size: {maxFileSizeMB} MB
              </span>
              {activeTab === 'bulk' && <span>• Max files: 300 resumes</span>}
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

          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-700">
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Add More Files
                  </button>
                  <button
                    onClick={() => {
                      setSelectedFiles([]);
                      setValidationErrors([]);
                    }}
                    className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
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

          {validationErrors.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  Validation Errors ({validationErrors.length})
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {validationErrors.map((error, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 p-4 rounded-lg border ${
                      error.type === 'virus' ? 'bg-red-100 border-red-300' :
                      error.type === 'storage' ? 'bg-orange-50 border-orange-200' :
                      error.type === 'duplicate' ? 'bg-amber-50 border-amber-300' :
                      'bg-red-50 border-red-200'
                    }`}
                  >
                    {error.type === 'virus' ? (
                      <Shield className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
                    ) : error.type === 'storage' ? (
                      <HardDrive className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    ) : error.type === 'duplicate' ? (
                      <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      {error.fileName && (
                        <div className="text-sm text-gray-900 truncate mb-1">{error.fileName}</div>
                      )}
                      <div className={`text-sm ${
                        error.type === 'virus' ? 'text-red-800' :
                        error.type === 'storage' ? 'text-orange-700' :
                        error.type === 'duplicate' ? 'text-amber-800 font-medium' :
                        'text-red-700'
                      }`}>
                        {error.error}
                      </div>
                      {/* Show existing resume details for duplicates */}
                      {error.type === 'duplicate' && error.existingResume && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
                          <div className="text-xs text-gray-500 mb-1">Existing Resume</div>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {error.existingResume.candidateName}
                              </div>
                              {error.existingResume.uploadedAt && (
                                <div className="text-xs text-gray-500">
                                  Uploaded: {new Date(error.existingResume.uploadedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                            {onViewResume && (
                              <button
                                onClick={() => {
                                  onViewResume(error.existingResume!.id);
                                  onClose();
                                }}
                                className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
                              >
                                View Resume
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <label className="block text-sm text-gray-700 mb-2">
              Select Folder (Optional)
            </label>
            
            {!showCreateFolder ? (
              <div className="space-y-3">
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                >
                  <option value="">Choose folder...</option>
                  {folders.filter(f => f.id !== 'all').map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm border-2 border-dashed border-gray-300 text-gray-700 rounded-md hover:border-gray-700 hover:text-gray-800 hover:bg-gray-50 transition-all"
                >
                  <FolderPlus className="w-4 h-4" />
                  Create New Folder
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <FolderPlus className="w-5 h-5 text-gray-800" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-700 mb-2">
                        New Folder Name
                      </label>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newFolderName.trim()) {
                            handleCreateFolder();
                          } else if (e.key === 'Escape') {
                            setShowCreateFolder(false);
                            setNewFolderName('');
                          }
                        }}
                        placeholder="e.g., Senior Developers, Frontend Team..."
                        autoFocus
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">Press Enter to create, Esc to cancel</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      Create Folder
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateFolder(false);
                        setNewFolderName('');
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleValidateAndUpload}
            disabled={selectedFiles.length === 0 || isUploading}
            className="px-8 py-2.5 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : selectedFiles.length === 0
              ? 'Upload'
              : `Upload ${selectedFiles.length} Resume${selectedFiles.length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}