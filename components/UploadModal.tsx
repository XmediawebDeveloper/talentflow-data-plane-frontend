'use client';

import { X, Upload, File, Trash2, FolderPlus, AlertCircle, CheckCircle, XCircle, Shield, HardDrive, FileText, CreditCard, Target, Eye } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Folder } from '@/lib/types/types';
import { Tenant } from '@/lib/types/tenant';
import { recordResumeUpload, hasAvailableQuota, checkQuotaStatus, QuotaInfo } from '@/lib/services/usageTrackingService';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import DuplicateResumeDetectedModal from './DuplicateResumeDetectedModal';
import ErrorModal from './ErrorModal';

// Default constants for fallback
const DEFAULT_MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_BULK_FILES = 100; // Maximum files per bulk upload (matches backend limit)
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
    resumeId?: string; // Added to support post-upload scoring
    candidateName?: string;
    existingResume?: {
      id: string;
      candidateName: string;
      uploadedAt?: string;
    };
    duplicateData?: {
      file: File;
      existingResume: {
        id: string;
        candidate_name: string;
        email: string;
        folder_name?: string;
        folder_path?: string;
        upload_date: string;
        file_size: number;
        file_name: string;
        version: number;
      };
      contentDifferences: string[];
      isDuplicate: boolean;
      targetFolderId?: string;
    };
  }>;
  onUploadComplete?: (statuses: any[]) => void;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onViewResume?: (resumeId: string) => void;
  onScoreResume?: (resumeId: string, candidateName: string) => void; // New callback for scoring
  onDuplicateDetected?: (duplicateData: any) => void; // Callback for duplicate resolution
  targetFolder?: string;
}

export default function UploadModal({ folders, tenant, uploadSection, onClose, onUpload, onUploadComplete, onCreateFolder, onViewResume, onScoreResume, onDuplicateDetected, targetFolder }: UploadModalProps) {
  const { available: resumeUploadAvailable } = usePlanFeature('resume_upload');

  if (!resumeUploadAvailable) {
    toast.error('Resume Storage is not available in your plan');
    onClose?.();
    return null;
  }

  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<{ resumeId: string; candidateName: string } | null>(null);
  // Find root folder for default selection
  const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);

  // Flatten the folder TREE (folder.children) into a single list so the
  // dropdown can include sub-folders. Without this, only top-level folders
  // show up — and the targetFolder ID for a sub-folder never matches an
  // <option>, so the dropdown silently falls back to Root.
  const allFolders = useMemo(() => {
    const out: { folder: Folder; depth: number; path: string }[] = [];
    const walk = (nodes: Folder[] | undefined, depth: number, parentPath: string) => {
      if (!nodes) return;
      for (const f of nodes) {
        if (f.id === 'all') continue; // synthetic "All Resumes" filter
        const path = parentPath ? `${parentPath} / ${f.name}` : f.name;
        out.push({ folder: f, depth, path });
        if (f.children && f.children.length > 0) {
          walk(f.children, depth + 1, path);
        }
      }
    };
    walk(folders, 0, '');
    return out;
  }, [folders]);

  // Initialize with targetFolder, or root folder if available
  const [selectedFolder, setSelectedFolder] = useState<string>(targetFolder || '');

  // Auto-select root folder when folders are loaded
  useEffect(() => {
    if (!targetFolder && rootFolder?.id) {
      setSelectedFolder(rootFolder.id);
    }
  }, [rootFolder?.id, targetFolder]);
  const [isDragging, setIsDragging] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [showNoFilesError, setShowNoFilesError] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duplicate resume detection state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    fileName: string;
    existingResume: {
      id: string;
      candidate_name: string;
      email?: string;
      current_title?: string;
      folder_name?: string;
      uploaded_at?: string;
      version?: number;
    };
  } | null>(null);

  const [tabSwitchWarning, setTabSwitchWarning] = useState<{ message: string; targetTab: 'single' | 'bulk' } | null>(null);

  // Handler to switch tabs with validation
  const handleTabSwitch = (newTab: 'single' | 'bulk') => {
    if (newTab === activeTab) return;
    // Block tab switch if files are already selected — user must clear first
    if (selectedFiles.length > 0) {
      setTabSwitchWarning({
        message: `You have ${selectedFiles.length} ${selectedFiles.length > 1 ? 'files' : 'file'} selected. Clear ${selectedFiles.length > 1 ? 'them' : 'it'} before switching to ${newTab === 'single' ? 'Single' : 'Bulk'} Upload.`,
        targetTab: newTab
      });
      return;
    }
    setTabSwitchWarning(null);
    setValidationErrors([]);
    setActiveTab(newTab);
  };

  const handleClearAndSwitch = () => {
    if (!tabSwitchWarning) return;
    setSelectedFiles([]);
    setValidationErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActiveTab(tabSwitchWarning.targetTab);
    setTabSwitchWarning(null);
  };

  // Check quota status on mount
  useEffect(() => {
    const fetchQuotaStatus = async () => {
      setIsCheckingQuota(true);
      try {
        const result = await checkQuotaStatus();
        if (result.status === 'success' && result.data?.quotas?.RU) {
          setQuotaInfo(result.data.quotas.RU);
        }
      } catch (error) {
        console.error('Failed to check quota status:', error);
      } finally {
        setIsCheckingQuota(false);
      }
    };
    fetchQuotaStatus();
  }, []);

  // Get tenant-specific limits or use defaults — hard-capped at 3MB per backend limit
  const maxFileSizeMB = Math.min(tenant?.subscription.limits.maxFileSizeMB || 3, 3);
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

    // Validate file count for single upload
    if (activeTab === 'single' && files.length > 1) {
      setValidationErrors([{
        fileName: '',
        error: `Single upload accepts only 1 file. You dropped ${files.length} files. Please use Bulk Upload to upload multiple files.`,
        type: 'limit'
      }]);
      return;
    }

    const validatedFiles = validateAndFilterFiles(files);
    setSelectedFiles(prev => [...prev, ...validatedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);

      // Validate file count for single upload
      if (activeTab === 'single' && files.length > 1) {
        setValidationErrors([{
          fileName: '',
          error: `Single upload accepts only 1 file. You selected ${files.length} files. Please use Bulk Upload to upload multiple files.`,
          type: 'limit'
        }]);
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      const validatedFiles = validateAndFilterFiles(files);
      setSelectedFiles(prev => [...prev, ...validatedFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      // Clear validation errors if removing files fixes the issue
      if (activeTab === 'single' && newFiles.length <= 1) {
        setValidationErrors([]);
      }
      return newFiles;
    });
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      // Use root folder as fallback when no folder is selected
      onUpload(selectedFiles, selectedFolder || rootFolder?.id || undefined);

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

    // Check single upload file limit (only 1 file allowed)
    if (activeTab === 'single' && files.length > 1) {
      errors.push({
        fileName: '',
        error: `Single upload accepts only 1 file. You selected ${files.length} files. Please use Bulk Upload tab for multiple files.`,
        type: 'limit'
      });
      setValidationErrors(errors);
      return [];
    }

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
          error: 'Unsupported file format. Only PDF, DOC, DOCX, RTF, and TXT files are allowed.',
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
      // TODO: Integrate real scan service (e.g. ClamAV / VirusTotal) here
      // if (virusScanEnabled) {
      //   const random = Math.random();
      //   if (random < 0.02) { // 2% chance of virus detection for demo
      //     errors.push({
      //       fileName: file.name,
      //       error: 'Security scan detected potential malware. File rejected for safety.',
      //       type: 'virus'
      //     });
      //     return;
      //   }
      // }

      // File is valid
      validFiles.push(file);
    });

    setValidationErrors(errors);
    return validFiles;
  };

  const handleValidateAndUpload = async () => {
    // Show error if no files selected
    if (selectedFiles.length === 0) {
      setShowNoFilesError(true);
      setTimeout(() => setShowNoFilesError(false), 3000);
      return;
    }

    // Final validation before upload
    const errors: FileValidationError[] = [];

    // CRITICAL: Validate file count for single upload mode
    if (activeTab === 'single' && selectedFiles.length > 1) {
      errors.push({
        fileName: '',
        error: `Single upload accepts only 1 file. You have ${selectedFiles.length} files selected. Please remove extra files or use Bulk Upload.`,
        type: 'limit'
      });
      setValidationErrors(errors);
      return;
    }

    const totalSizeMB = selectedFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
    const availableStorageMB = storageLimitMB - storageUsedMB;

    // Check RU quota before upload
    setIsCheckingQuota(true);
    const quotaCheck = await hasAvailableQuota('RU', selectedFiles.length);
    setIsCheckingQuota(false);

    if (!quotaCheck.hasQuota) {
      errors.push({
        fileName: '',
        error: quotaCheck.error || `Insufficient Resume Storage (RU) units. You need ${selectedFiles.length} units but only have ${quotaCheck.remaining} remaining. Please upgrade your plan or purchase additional units.`,
        type: 'limit'
      });
    }

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
      // Use root folder as fallback when no folder is selected
      const result = await onUpload(selectedFiles, selectedFolder || rootFolder?.id || undefined);
      console.log('[UPLOAD-MODAL-DEBUG] Result from onUpload:', result);
      console.log('[UPLOAD-MODAL-DEBUG] result.existingResume:', result.existingResume);

      if (!result.success && result.error) {
        // Check if this is a duplicate error with existing resume info
        if (result.existingResume) {
          console.log('[UPLOAD-MODAL-DEBUG] Duplicate detected:', result.existingResume);

          // If onScoreResume is provided (scoring context), show DuplicateResumeDetectedModal
          // with options: View existing, Proceed with Scoring, Cancel
          if (onScoreResume) {
            console.log('[UPLOAD-MODAL-DEBUG] Scoring mode - showing DuplicateResumeDetectedModal');
            setDuplicateInfo({
              fileName: selectedFiles[0]?.name || '',
              existingResume: {
                id: result.existingResume.id,
                candidate_name: result.existingResume.candidateName,
                email: result.existingResume.email,
                current_title: result.existingResume.currentTitle,
                folder_name: result.existingResume.folderName,
                uploaded_at: result.existingResume.uploadedAt,
                version: result.existingResume.version,
              }
            });
            setShowDuplicateModal(true);
            setIsUploading(false);
            return;
          }

          // Not in scoring mode - check if parent wants to handle duplicates
          if (onDuplicateDetected && result.duplicateData) {
            console.log('[UPLOAD-MODAL-DEBUG] Calling onDuplicateDetected with data');
            onDuplicateDetected(result.duplicateData);
            onClose(); // Close upload modal, parent will show duplicate modal
            return;
          }

          console.log('[UPLOAD-MODAL-DEBUG] Not scoring mode - showing error with details');
        }

        // Show errors in the validation errors section
        const errorObj = {
          fileName: selectedFiles[0]?.name || '',
          error: result.error,
          type: 'duplicate' as const,
          existingResume: result.existingResume ? {
            id: result.existingResume.id,
            candidateName: result.existingResume.candidateName,
            uploadedAt: result.existingResume.uploadedAt,
          } : undefined
        };
        console.log('[UPLOAD-MODAL-DEBUG] Setting validationErrors:', errorObj);
        setValidationErrors([errorObj]);
        setIsUploading(false);
        return;
      }

      // Success - show success state with scoring option for single uploads
      if (activeTab === 'single' && result.resumeId && onScoreResume) {
        setUploadSuccess({
          resumeId: result.resumeId,
          candidateName: result.candidateName || selectedFiles[0]?.name || 'Resume'
        });
        setIsUploading(false);
        return;
      }

      // For bulk uploads or when scoring is not available, close modal
      onClose();
    } catch (error: any) {
      console.error('Upload error:', error);

      // Handle INVALID_RESUME error from API
      let errorMessage = 'Upload failed. Please try again.';
      let fileName = selectedFiles[0]?.name || '';

      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        const existingResume = detail?.existing_resume;
        errorMessage = existingResume?.candidate_name
          ? `A resume for ${existingResume.candidate_name} already exists in your Internal Resume Database.`
          : 'This resume already exists in the system.';
      } else if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail : detail?.message;
        errorMessage = msg || 'You do not have permission to upload resumes. Please contact your administrator.';
      } else if (error?.response?.status === 400 && error?.response?.data?.detail) {
        const detail = error.response.data.detail;

        if (detail.error === 'INVALID_RESUME') {
          errorMessage = detail.message || 'Invalid Resume. The uploaded file does not appear to be a valid resume.';
          fileName = detail.file_name || fileName;

          // Add suggestion if available
          if (detail.suggestion) {
            errorMessage += `\n\n${detail.suggestion}`;
          }
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else if (detail.message) {
          errorMessage = detail.message;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setValidationErrors([{
        fileName: fileName,
        error: errorMessage,
        type: 'format'
      }]);
      setIsUploading(false);
    }
  };

  // Storage percentage calculation removed (no longer displayed in UI)

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden relative">
        <div className="flex-shrink-0 flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl text-gray-900 dark:text-slate-50">Upload Resume</h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-500 mt-0.5 sm:mt-1">
              {activeTab === 'single' ? 'Upload a single resume file' : 'Upload multiple resumes at once'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 dark:text-slate-500 hover:text-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 flex-shrink-0 ml-2"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          {/* Success State with Scoring Option */}
          {uploadSuccess ? (
            <div className="text-center py-6 sm:py-8">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
              </div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 mb-1.5 sm:mb-2">Resume Uploaded Successfully!</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400 mb-4 sm:mb-6 px-2">
                {uploadSuccess.candidateName} has been added to your resume database.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 max-w-md mx-auto">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={() => {
                    onScoreResume?.(uploadSuccess.resumeId, uploadSuccess.candidateName);
                    onClose();
                  }}
                  className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  <Target className="w-4 h-4" />
                  Score Against a Job
                </button>
              </div>
            </div>
          ) : (
          <>
          {/* RU Quota Indicator */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2 sm:gap-3">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-800 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 gap-0.5 sm:gap-2">
                  <span className="text-xs sm:text-sm text-gray-900 dark:text-slate-50">Resume Storage Units (RU)</span>
                  {isCheckingQuota ? (
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-slate-500">Checking...</span>
                  ) : quotaInfo ? (
                    <span className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                      {quotaInfo.total_remaining.toLocaleString()} / {quotaInfo.subscription.limit.toLocaleString()} available
                    </span>
                  ) : (
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-slate-500">Unable to check quota</span>
                  )}
                </div>
                {quotaInfo && (
                  <>
                    <div className="w-full bg-blue-200 rounded-full h-1.5 sm:h-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          quotaInfo.subscription.percentage >= 90 ? 'bg-red-600' :
                          quotaInfo.subscription.percentage >= 70 ? 'bg-yellow-500' :
                          'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(100, quotaInfo.subscription.percentage)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] sm:text-xs text-gray-700 dark:text-slate-300 font-medium">
                        {quotaInfo.subscription.used.toLocaleString()} used
                      </span>
                      {(quotaInfo.status === 'APPROACHING' || quotaInfo.status === 'WARNING' || quotaInfo.status === 'CRITICAL') && (
                        <span className="text-[10px] sm:text-xs text-amber-600 font-medium">
                          Low quota - consider upgrading
                        </span>
                      )}
                      {quotaInfo.status === 'EXCEEDED' && (
                        <span className="text-[10px] sm:text-xs text-red-600 font-medium">
                          Quota exhausted - upgrade required
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4 sm:mb-5">
            <button
              onClick={() => handleTabSwitch('single')}
              disabled={activeTab !== 'single' && selectedFiles.length > 0}
              title={activeTab !== 'single' && selectedFiles.length > 0 ? 'Clear selected files before switching to Single Upload' : undefined}
              className={`flex-1 px-3 py-2 rounded-lg border transition-all flex items-center justify-center gap-2 ${
                activeTab === 'single'
                  ? 'border-brand-blue/30 bg-brand-blue/5 shadow-sm'
                  : selectedFiles.length > 0
                    ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <Upload className={`w-4 h-4 ${activeTab === 'single' ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
              <span className={`text-sm font-medium ${activeTab === 'single' ? 'text-brand-blue' : 'text-gray-900 dark:text-slate-50'}`}>
                Single Upload
              </span>
            </button>
            <button
              onClick={() => handleTabSwitch('bulk')}
              disabled={activeTab !== 'bulk' && selectedFiles.length > 0}
              title={activeTab !== 'bulk' && selectedFiles.length > 0 ? 'Clear selected files before switching to Bulk Upload' : undefined}
              className={`flex-1 px-3 py-2 rounded-lg border transition-all flex items-center justify-center gap-2 ${
                activeTab === 'bulk'
                  ? 'border-brand-blue/30 bg-brand-blue/5 shadow-sm'
                  : selectedFiles.length > 0
                    ? 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
              }`}
            >
              <Upload className={`w-4 h-4 ${activeTab === 'bulk' ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}`} />
              <span className={`text-sm font-medium ${activeTab === 'bulk' ? 'text-brand-blue' : 'text-gray-900 dark:text-slate-50'}`}>
                Bulk Upload
              </span>
            </button>
          </div>

          {tabSwitchWarning && (
            <div className="flex items-start sm:items-center justify-between gap-3 mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
              <div className="flex items-start gap-2 text-amber-800 text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5 sm:mt-0" />
                <span>{tabSwitchWarning.message}</span>
              </div>
              <button
                onClick={handleClearAndSwitch}
                className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap"
              >
                Clear &amp; Switch
              </button>
            </div>
          )}

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 sm:p-10 lg:p-12 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-gray-800 bg-gray-50 dark:bg-slate-800/50'
                : 'border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            <Upload className={`w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 mx-auto mb-3 sm:mb-4 ${isDragging ? 'text-gray-800' : 'text-gray-400 dark:text-slate-500'}`} />
            <p className="text-sm sm:text-base text-gray-900 dark:text-slate-50 mb-1.5 sm:mb-2">
              {activeTab === 'single' ? 'Drop your resume here or click to browse' : 'Drop multiple resumes here or click to browse'}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3 sm:mb-4">
              Supported formats: PDF, DOCX, DOC
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-6 text-[10px] sm:text-xs text-gray-500 dark:text-slate-500">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Max file size: {maxFileSizeMB} MB
              </span>
              {activeTab === 'bulk' && <span>• Max files: 100 resumes</span>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple={activeTab === 'bulk'}
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-1 sm:gap-2">
                  {/* Only show Add More Files button in bulk upload mode */}
                  {activeTab === 'bulk' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="text-xs sm:text-sm text-gray-800 dark:text-slate-100 hover:text-gray-900 flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Upload className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">Add More Files</span>
                      <span className="sm:hidden">Add</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedFiles([]);
                      setValidationErrors([]);
                      setTabSwitchWarning(null);
                    }}
                    className="text-xs sm:text-sm text-red-600 hover:text-red-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate">{file.name}</div>
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500">{formatFileSize(file.size)}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(index);
                      }}
                      className="p-1 text-gray-500 dark:text-slate-500 hover:text-red-600 rounded flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="mt-4 sm:mt-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span className="text-xs sm:text-sm text-red-700 flex items-center gap-1 sm:gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Validation Errors ({validationErrors.length})
                </span>
              </div>
              <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
                {validationErrors.map((error, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border ${
                      error.type === 'virus' ? 'bg-red-100 border-red-300' :
                      error.type === 'storage' ? 'bg-orange-50 border-orange-200' :
                      error.type === 'duplicate' ? 'bg-amber-50 border-amber-300' :
                      'bg-red-50 border-red-200'
                    }`}
                  >
                    {error.type === 'virus' ? (
                      <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-red-700 flex-shrink-0 mt-0.5" />
                    ) : error.type === 'storage' ? (
                      <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    ) : error.type === 'duplicate' ? (
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      {error.fileName && (
                        <div className="text-xs sm:text-sm text-gray-900 dark:text-slate-50 truncate mb-1">{error.fileName}</div>
                      )}
                      <div className={`text-xs sm:text-sm whitespace-pre-line ${
                        error.type === 'virus' ? 'text-red-800' :
                        error.type === 'storage' ? 'text-orange-700' :
                        error.type === 'duplicate' ? 'text-amber-800 font-medium' :
                        'text-red-700'
                      }`}>
                        {error.error}
                      </div>
                      {/* Show existing resume details for duplicates */}
                      {error.type === 'duplicate' && error.existingResume && (
                        <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200">
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 mb-1">Existing Resume</div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 truncate">
                                {error.existingResume.candidateName}
                              </div>
                              {error.existingResume.uploadedAt && (
                                <div className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500">
                                  Uploaded: {formatISTDate(error.existingResume.uploadedAt)}
                                </div>
                              )}
                            </div>
                            {onViewResume && (
                              <button
                                onClick={() => {
                                  onViewResume(error.existingResume!.id);
                                  onClose();
                                }}
                                className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors flex-shrink-0 w-full sm:w-auto text-center"
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

          <div className="mt-4 sm:mt-6">
            <label className="block text-xs sm:text-sm text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">
              Select Folder (Optional)
            </label>

            {!showCreateFolder ? (
              <div className="space-y-2 sm:space-y-3">
                <select
                  value={selectedFolder || rootFolder?.id || ''}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent text-sm sm:text-base text-black"
                >
                  {/* Show Root folder first as default */}
                  {rootFolder && (
                    <option key={rootFolder.id} value={rootFolder.id}>
                      Root (Default)
                    </option>
                  )}
                  {/* Only show "Choose folder" if no root folder exists */}
                  {!rootFolder && <option value="">Choose folder...</option>}
                  {/* Flattened tree — includes sub-folders shown with the
                      breadcrumb path (e.g. "Arun / sub folder") and indented
                      so the hierarchy is visually obvious. Excludes 'all',
                      the Root folder (rendered above), and 'Archived Resumes'. */}
                  {allFolders
                    .filter(({ folder: f }) =>
                      !(f.name.toLowerCase() === 'root' && !f.parentId) &&
                      !(f.name === 'Archived Resumes' && !f.parentId),
                    )
                    .map(({ folder, depth, path }) => (
                      <option key={folder.id} value={folder.id}>
                        {`${'  '.repeat(depth)}${depth > 0 ? '↳ ' : ''}${path}`}
                      </option>
                    ))}
                </select>
                
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs border border-dashed border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-md hover:border-gray-700 hover:text-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
                >
                  <FolderPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Create New Folder
                </button>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                <div className="p-3 sm:p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                      <FolderPlus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800 dark:text-slate-100" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs sm:text-sm text-gray-700 dark:text-slate-300 mb-1.5 sm:mb-2">
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
                        className="w-full px-3 sm:px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent text-sm"
                      />
                      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-slate-500 mt-1">Press Enter to create, Esc to cancel</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2.5 sm:mt-3">
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      className="flex-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      Create Folder
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateFolder(false);
                        setNewFolderName('');
                      }}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-xs sm:text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        {/* No Files Error Alert */}
        {showNoFilesError && (
          <div className="flex-shrink-0 mx-4 sm:mx-6 mb-0 p-3 sm:p-4 bg-red-50 border border-red-300 rounded-lg animate-pulse">
            <div className="flex items-center gap-2 sm:gap-3">
              <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-red-900">No files selected!</p>
                <p className="text-[10px] sm:text-xs text-red-700">Please select at least one resume file to upload.</p>
              </div>
              <button
                onClick={() => setShowNoFilesError(false)}
                className="p-1 hover:bg-red-100 rounded flex-shrink-0"
               aria-label="Close">
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
              </button>
            </div>
          </div>
        )}

        {/* Hide footer when showing success state */}
        {!uploadSuccess && (
        <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-black"
          >
            Cancel
          </button>
          <button
            onClick={handleValidateAndUpload}
            disabled={isUploading || isCheckingQuota || (quotaInfo?.status === 'EXCEEDED') || selectedFiles.length === 0}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm ${
              selectedFiles.length === 0 && !isUploading && !isCheckingQuota
                ? 'bg-gray-400 text-white hover:bg-gray-500 cursor-pointer'
                : 'bg-brand-blue text-white hover:bg-brand-blue-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
            }`}
          >
            {isCheckingQuota ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Checking Quota...
              </>
            ) : isUploading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : quotaInfo?.status === 'EXCEEDED' ? (
              'Quota Exhausted - Upgrade Plan'
            ) : selectedFiles.length === 0
              ? 'Select Files to Upload'
              : validationErrors.length > 0
                ? `Upload ${selectedFiles.length} Valid Resume${selectedFiles.length !== 1 ? 's' : ''} (${validationErrors.length} skipped)`
                : `Upload ${selectedFiles.length} Resume${selectedFiles.length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
        )}
      </div>

      {/* Duplicate Resume Detection Modal */}
      {duplicateInfo && (
        <DuplicateResumeDetectedModal
          isOpen={showDuplicateModal}
          onClose={() => {
            setShowDuplicateModal(false);
            setDuplicateInfo(null);
          }}
          fileName={duplicateInfo.fileName}
          existingResume={duplicateInfo.existingResume}
          onViewExisting={(resumeId) => {
            if (onViewResume) {
              onViewResume(resumeId);
            }
            setShowDuplicateModal(false);
            setDuplicateInfo(null);
            onClose();
          }}
          onProceedWithScoring={(resumeId) => {
            if (onScoreResume && duplicateInfo.existingResume) {
              onScoreResume(resumeId, duplicateInfo.existingResume.candidate_name);
            }
            setShowDuplicateModal(false);
            setDuplicateInfo(null);
            onClose();
          }}
        />
      )}
    </div>
  );
}