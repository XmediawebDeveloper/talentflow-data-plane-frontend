import { X, FolderOpen, Database, Search, CheckSquare, Square, User, Mail, Award, Target, ChevronRight, ChevronDown, Folder, FileText, MapPin, Phone, Briefcase, AlertTriangle, Zap, Upload, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { Resume, Folder as FolderType } from '@/lib/types/types';
import ScoringVersionSelectionModal from './ScoringVersionSelectionModal';
import DuplicateResumeDetectedModal from './DuplicateResumeDetectedModal';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { useAuth } from '@/components/providers/AuthProvider';

interface VersionSelection {
  resumeId: string;
  versionId: string;
  candidateName?: string;
}

interface ResumeSelectionModalProps {
  jobTitle: string;
  myResumes: Resume[];
  databaseResumes: Resume[];
  folders: FolderType[];
  onClose: () => void;
  onScoreResumes: (selectedIds: string[], source: 'my-resumes' | 'database', versionSelections?: VersionSelection[]) => void;
  availableUnits?: number | null;
  onResumeUploaded?: (resume: Resume) => void;
  error?: string | null;
  onClearError?: () => void;
}

export default function ResumeSelectionModal({
  jobTitle,
  myResumes,
  databaseResumes,
  folders,
  onClose,
  onScoreResumes,
  availableUnits,
  onResumeUploaded,
  error,
  onClearError
}: ResumeSelectionModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'database'>('my-resumes');
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [showVersionSelection, setShowVersionSelection] = useState(false);
  const [resumesForVersionSelection, setResumesForVersionSelection] = useState<Resume[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [localResumes, setLocalResumes] = useState<Resume[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

  // Duplicate detection modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    fileName: string;
    existingResume: any;
  } | null>(null);

  // Debug: Log folders data
  console.log('[ResumeSelectionModal] Folders received:', folders);
  console.log('[ResumeSelectionModal] MyResumes count:', myResumes.length);
  console.log('[ResumeSelectionModal] MyResumes sample:', myResumes.slice(0, 3).map(r => ({ id: r.id, name: r.name, folderId: r.folderId })));

  // Combine myResumes with locally uploaded resumes - DEDUPLICATE by ID to prevent showing same resume twice
  const deduplicateByResumeId = (localUploads: Resume[], propsResumes: Resume[]): Resume[] => {
    const seenIds = new Set<string>();
    const result: Resume[] = [];

    // Add props resumes first (source of truth from API)
    for (const resume of propsResumes) {
      if (!seenIds.has(resume.id)) {
        seenIds.add(resume.id);
        result.push(resume);
      }
    }

    // Add local uploads only if not already in props
    for (const resume of localUploads) {
      if (!seenIds.has(resume.id)) {
        seenIds.add(resume.id);
        result.push(resume);
      }
    }

    return result;
  };

  const allMyResumes = deduplicateByResumeId(localResumes, myResumes);
  const allDatabaseResumes = deduplicateByResumeId(localResumes, databaseResumes);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Clear previous upload error
    setUploadError(null);

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/plain'];
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      setUploadError('Invalid file type. Please upload PDF, DOC, DOCX, RTF, or TXT files.');
      return;
    }

    // Validate file size (3MB max)
    if (file.size > 3 * 1024 * 1024) {
      setUploadError('File size exceeds 3MB limit.');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading(`Uploading ${file.name}...`);

    try {
      // Upload the resume
      const uploadedResume = await resumeService.upload(file);

      // Convert API response to Resume type
      const newResume: Resume = {
        id: uploadedResume.id,
        name: uploadedResume.candidate_name || file.name.replace(/\.[^/.]+$/, ''),
        email: uploadedResume.email || uploadedResume.candidate_email || 'No email',
        phone: uploadedResume.phone || 'No phone',
        title: uploadedResume.current_title || 'N/A',
        experience: uploadedResume.experience_years ? `${uploadedResume.experience_years} years` : 'N/A',
        education: uploadedResume.education?.[0]?.degree || 'N/A',
        location: uploadedResume.location || 'N/A',
        skills: uploadedResume.skills || [],
        source: 'Manual' as const,
        folderId: '',
        uploadDate: uploadedResume.created_at || new Date().toISOString(),
        attachments: 1,
        uploadedBy: 'Current User',
        version: uploadedResume.version || 1,
        versionCount: uploadedResume.version_count || 1,
        fileName: uploadedResume.file_name,
      };

      // Clear any previous upload error
      setUploadError(null);

      // Add to local resumes and auto-select
      setLocalResumes(prev => [newResume, ...prev]);
      setSelectedResumes(prev => [newResume.id, ...prev]);

      // Notify parent component
      if (onResumeUploaded) {
        onResumeUploaded(newResume);
      }

      toast.success(`Resume uploaded: ${newResume.name}`, { id: toastId });
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.dismiss(toastId);

      // Handle duplicate error (409)
      if (error.status === 409 || error.response?.status === 409) {
        // Parse the existing resume details from error response
        const errorData = error.response?.data || error.data || {};
        const existingResume = errorData.existing_resume;

        if (existingResume) {
          // Show duplicate detection modal
          setDuplicateInfo({
            fileName: file.name,
            existingResume: {
              id: existingResume.id,
              candidate_name: existingResume.candidate_name,
              email: existingResume.email,
              current_title: existingResume.current_title,
              folder_name: existingResume.folder_name,
              uploaded_at: existingResume.upload_date,
              version: existingResume.version,
            },
          });
          setShowDuplicateModal(true);
        } else {
          setUploadError('A resume with this email already exists.');
        }
      } else if (error.message?.includes('DUPLICATE')) {
        setUploadError('A resume with this email already exists.');
      } else {
        // Extract detailed error message from API response
        let errorMessage = 'Failed to upload resume. Please try again.';

        if (error?.response?.status === 400 && error?.response?.data?.detail) {
          const detail = error.response.data.detail;
          if (typeof detail === 'string') {
            errorMessage = detail;
          } else if (detail.message) {
            errorMessage = detail.message;
            if (detail.file_name) {
              errorMessage = `File: ${detail.file_name}\n${errorMessage}`;
            }
            if (detail.suggestion) {
              errorMessage += `\n\nSuggestion: ${detail.suggestion}`;
            }
          } else if (detail.error) {
            errorMessage = `${detail.error}: ${detail.message || 'Please check your file and try again.'}`;
          }
        } else if (error?.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error?.message) {
          errorMessage = error.message;
        }

        setUploadError(errorMessage);
      }
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Filter resumes based on active tab and selected folder
  const getFilteredResumes = () => {
    let resumes: Resume[] = [];

    if (activeTab === 'my-resumes') {
      if (selectedFolder === 'all') {
        // In "All Resumes" view, hide archived resumes (both flagged and folder-based)
        const archivedFolder = folders.find(f => f.name?.toLowerCase().includes('archived'));
        resumes = allMyResumes.filter(r => {
          if (r.isArchived === true) return false;
          if (archivedFolder && r.folderId === archivedFolder.id) return false;
          return true;
        });
      } else {
        // Check if selected folder is the root folder
        const selectedFolderData = folders.find(f => f.id === selectedFolder);
        const isRootFolder = selectedFolderData?.name?.toLowerCase() === 'root';

        if (isRootFolder) {
          // Root folder contains resumes with no folderId or folderId matching root
          resumes = allMyResumes.filter(r => !r.folderId || r.folderId === selectedFolder);
        } else {
          resumes = allMyResumes.filter(r => r.folderId === selectedFolder);
        }
      }
    } else {
      resumes = allDatabaseResumes;
    }

    // Apply search filter
    return resumes.filter(resume =>
      resume.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (resume.title && resume.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (resume.skills && resume.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())))
    );
  };

  const filteredResumes = getFilteredResumes();

  const handleToggleResume = (resumeId: string) => {
    // Check if resume is archived OR if we're in the Archived Resumes folder
    const allResumes = activeTab === 'my-resumes' ? allMyResumes : allDatabaseResumes;
    const resume = allResumes.find(r => r.id === resumeId);

    // Check if currently viewing Archived folder
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;

    console.log('[ResumeSelectionModal] Toggling resume:', {
      resumeId,
      isArchived: resume?.isArchived,
      resumeName: resume?.name,
      selectedFolder: selectedFolderData?.name,
      isArchivedFolder: isArchivedFolder,
      resume: resume
    });

    // Block if resume is archived OR if viewing archived folder
    if (resume?.isArchived || isArchivedFolder) {
      console.log('[ResumeSelectionModal] BLOCKED: Archived resume cannot be selected');
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }

    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const handleSelectAll = () => {
    // Check if viewing Archived folder
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;

    // Don't allow select all in archived folder
    if (isArchivedFolder) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }

    // Filter out archived resumes before selecting
    const selectableResumes = filteredResumes.filter(r => !r.isArchived);

    if (selectedResumes.length === selectableResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(selectableResumes.map(r => r.id));
    }
  };

  const handleTabChange = (tab: 'my-resumes' | 'database') => {
    setActiveTab(tab);
    setSelectedResumes([]);
    setSearchTerm('');
    setSelectedFolder('all');
    setUploadError(null); // Clear upload error when switching tabs
  };

  // Handle duplicate modal actions
  const handleProceedWithScoring = async (resumeId: string) => {
    // Add existing resume to local resumes if not already present
    const existingInList = allMyResumes.find(r => r.id === resumeId);

    if (!existingInList && duplicateInfo?.existingResume) {
      const existingResume = duplicateInfo.existingResume;

      // Fetch full resume details to add to the list
      try {
        const fullResume = await resumeService.get(resumeId);

        const resumeToAdd: Resume = {
          id: fullResume.id,
          name: fullResume.candidate_name || existingResume.candidate_name,
          email: fullResume.candidate_email || existingResume.email || 'No email',
          phone: fullResume.phone || 'No phone',
          title: fullResume.current_title || existingResume.current_title || 'N/A',
          experience: fullResume.experience_years ? `${fullResume.experience_years} years` : 'N/A',
          education: fullResume.education?.[0]?.degree || 'N/A',
          location: fullResume.location || 'N/A',
          skills: fullResume.skills || [],
          source: 'Manual' as const,
          folderId: existingResume.folder_id || '',
          uploadDate: existingResume.uploaded_at || new Date().toISOString(),
          attachments: 1,
          uploadedBy: 'Existing',
          version: existingResume.version || 1,
          versionCount: 1,
          fileName: fullResume.file_name,
        };

        setLocalResumes(prev => [resumeToAdd, ...prev]);
      } catch (error) {
        console.error('Failed to fetch resume details:', error);
        // Continue anyway with basic info
      }
    }

    // Add the existing resume to selected resumes for scoring
    setSelectedResumes(prev => {
      if (!prev.includes(resumeId)) {
        return [...prev, resumeId];
      }
      return prev;
    });

    toast.success('Existing resume added to selection for scoring');
    setShowDuplicateModal(false);
    setDuplicateInfo(null);
  };

  const handleViewExisting = (resumeId: string) => {
    // Open resume detail in new tab
    window.open(`/recruitment/resume-view/${resumeId}`, '_blank');
  };

  const handleScore = () => {
    if (selectedResumes.length > 0) {
      // Get the selected resume objects
      const allResumes = activeTab === 'my-resumes' ? allMyResumes : allDatabaseResumes;
      const selectedResumeObjects = allResumes.filter(r => selectedResumes.includes(r.id));

      // Filter out archived resumes
      const archivedCount = selectedResumeObjects.filter(r => r.isArchived).length;
      const nonArchivedResumes = selectedResumeObjects.filter(r => !r.isArchived);

      // Show warning if archived resumes were selected
      if (archivedCount > 0) {
        toast.warning(`${archivedCount} archived resume${archivedCount > 1 ? 's' : ''} cannot be scored and will be skipped.`);
      }

      // If no non-archived resumes remain, don't proceed
      if (nonArchivedResumes.length === 0) {
        toast.error('Cannot score archived resumes. Please select active resumes.');
        return;
      }

      // Update selected resumes to only include non-archived ones
      const nonArchivedIds = nonArchivedResumes.map(r => r.id);
      setSelectedResumes(nonArchivedIds);

      // Debug: Log version counts
      console.log('[ResumeSelectionModal] Selected resumes version info:',
        nonArchivedResumes.map(r => ({
          id: r.id,
          name: r.name,
          versionCount: r.versionCount,
          version: r.version
        }))
      );

      console.log('[ResumeSelectionModal] selectedCount:', nonArchivedResumes.length);

      // SINGLE candidate → Always show version selection popup (modal will fetch versions from API)
      // MULTIPLE candidates → Auto-select latest version, no popup
      if (nonArchivedResumes.length === 1) {
        // Single candidate - always show version selection modal
        // The modal will fetch versions from API and display them
        console.log('[ResumeSelectionModal] Single candidate - showing version selection popup');
        setResumesForVersionSelection(nonArchivedResumes);
        setShowVersionSelection(true);
      } else {
        // Multiple candidates - proceed directly with scoring (uses latest version automatically)
        console.log('[ResumeSelectionModal] Multiple candidates - auto-selecting latest versions');
        onScoreResumes(nonArchivedIds, activeTab);
      }
    }
  };

  const handleVersionSelectionConfirm = (selectedVersions: { resumeId: string; versionId: string; candidateName?: string }[]) => {
    // Use the selected version IDs for scoring
    const versionIds = selectedVersions.map(v => v.versionId);
    setShowVersionSelection(false);
    // Pass version IDs along with the resume data for proper name mapping
    onScoreResumes(versionIds, activeTab, selectedVersions);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const getResumeCount = (folderId: string) => {
    if (folderId === 'all') return allMyResumes.length;
    // Use folder's count from API if available, otherwise count from resumes
    const folder = folders.find(f => f.id === folderId);
    if (folder && folder.count !== undefined) {
      return folder.count + localResumes.filter(r => r.folderId === folderId).length;
    }
    return allMyResumes.filter(r => r.folderId === folderId).length;
  };

  const renderFolderTree = (parentId?: string | null, level: number = 0) => {
    // Filter folders by parentId - treat null and undefined as equivalent (top-level folders)
    const childFolders = folders.filter(f => {
      const isTopLevel = !parentId && (f.parentId === null || f.parentId === undefined);
      const isChild = parentId && f.parentId === parentId;
      return isTopLevel || isChild;
    });
    
    return childFolders.map(folder => {
      const isExpanded = expandedFolders.includes(folder.id);
      const isSelected = selectedFolder === folder.id;
      const hasChildren = folders.some(f => f.parentId === folder.id);
      const count = getResumeCount(folder.id);
      
      return (
        <div key={folder.id}>
          <button
            onClick={() => setSelectedFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm group ${
              isSelected
                ? 'bg-brand-blue/10 text-brand-blue font-medium ring-1 ring-brand-blue/20'
                : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
                className="p-0.5 hover:bg-brand-blue/10 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}
            {!hasChildren && <div className="w-5" />}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4" />
            ) : (
              <Folder className="w-4 h-4" />
            )}
            <span className="flex-1 text-left">{folder.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isSelected
                ? 'bg-brand-blue/15 text-brand-blue'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {count}
            </span>
          </button>
          {isExpanded && hasChildren && (
            <div>
              {renderFolderTree(folder.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-7xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-blue ring-1 ring-white/10 shadow-md shadow-brand-blue/25 rounded-xl flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-semibold text-gray-900 mb-1">Select Resumes to Score</h2>
              <p className="text-xs sm:text-sm text-gray-600 truncate">
                Job: <span className="font-medium text-gray-900">{jobTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg transition-colors flex-shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100 px-4 sm:px-6 pt-3 sm:pt-4">
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={() => handleTabChange('my-resumes')}
              className={`px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-t-lg transition-all whitespace-nowrap ${
                activeTab === 'my-resumes'
                  ? 'bg-brand-blue/5 text-brand-blue border-b-2 border-brand-blue'
                  : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
              }`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                My Resumes
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'my-resumes'
                    ? 'bg-brand-blue text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {allMyResumes.length}
                </span>
              </div>
            </button>
            {/* Only show Internal Database tab if user has permission */}
            {hasInternalDBAccess && (
              <button
                onClick={() => handleTabChange('database')}
                className={`px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-t-lg transition-all whitespace-nowrap ${
                  activeTab === 'database'
                    ? 'bg-brand-blue/5 text-brand-blue border-b-2 border-brand-blue'
                    : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Internal Database
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === 'database'
                      ? 'bg-brand-blue text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {allDatabaseResumes.length}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {(error || uploadError) && (
          <div className="mx-4 sm:mx-6 mt-3 sm:mt-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-red-900 mb-1">
                {uploadError ? 'Upload Error' : 'Error'}
              </div>
              <div className="text-sm text-red-800 whitespace-pre-line">
                {uploadError || error}
              </div>
            </div>
            <button
              onClick={() => {
                if (uploadError) {
                  setUploadError(null);
                }
                if (error && onClearError) {
                  onClearError();
                }
              }}
              className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
              aria-label="Close error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mobile/Tablet Folder Selector (Only for My Resumes) */}
        {activeTab === 'my-resumes' && (
          <div className="lg:hidden border-b border-gray-100 bg-brand-blue/[0.03] px-3 sm:px-4 py-2 sm:py-3 flex-shrink-0 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              <button
                onClick={() => setSelectedFolder('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                  selectedFolder === 'all'
                    ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                All Resumes
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  selectedFolder === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {allMyResumes.length}
                </span>
              </button>
              {folders.filter(f => !f.parentId).map(folder => {
                const isSelected = selectedFolder === folder.id;
                const count = getResumeCount(folder.id);
                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                      isSelected
                        ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    {folder.name}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Folder Tree (Only for My Resumes - Desktop) */}
          {activeTab === 'my-resumes' && (
            <div className="hidden lg:block w-64 border-r border-gray-100 bg-brand-blue/[0.03] overflow-y-auto flex-shrink-0">
              <div className="p-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3 px-3">Folders</h3>

                {/* All Resumes */}
                <button
                  onClick={() => setSelectedFolder('all')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm mb-2 ${
                    selectedFolder === 'all'
                      ? 'bg-brand-blue/10 text-brand-blue font-medium ring-1 ring-brand-blue/20'
                      : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span className="flex-1 text-left">All Resumes</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedFolder === 'all'
                      ? 'bg-brand-blue/15 text-brand-blue'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {allMyResumes.length}
                  </span>
                </button>

                {/* Folder Tree */}
                <div className="space-y-1">
                  {renderFolderTree(undefined, 0)}
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Bulk Actions */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-brand-blue/[0.03] border-b border-gray-100">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, title, or skills..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue text-sm"
                  />
                </div>

                {/* Upload Resume Button - hidden input always present but button only for My Resumes tab */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.rtf,.txt"
                  className="hidden"
                />
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {activeTab === 'my-resumes' && (
                  <button
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="hidden sm:inline">Uploading...</span>
                        <span className="sm:hidden">...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload</span>
                      </>
                    )}
                  </button>
                  )}

                  <button
                    onClick={handleSelectAll}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 border border-gray-200 bg-white rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm font-medium text-gray-700 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                      <>
                        <CheckSquare className="w-4 h-4 text-brand-blue" />
                        <span className="hidden sm:inline">Deselect All</span>
                        <span className="sm:hidden">Deselect</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4" />
                        <span className="hidden sm:inline">Select All</span>
                        <span className="sm:hidden">Select</span>
                      </>
                    )}
                  </button>
                  <div className="text-sm text-gray-700 bg-white px-3 sm:px-4 py-2.5 rounded-lg border border-gray-200 font-medium whitespace-nowrap">
                    <span className="font-semibold text-brand-blue">{selectedResumes.length}</span> selected
                  </div>
                </div>
              </div>
            </div>

            {/* Resume List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              {filteredResumes.length > 0 ? (
                <div className="space-y-2">
                  {/* Table Header - Hidden on mobile */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 rounded-lg ring-1 ring-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        onClick={handleSelectAll}
                        className="p-1 hover:bg-brand-blue/10 rounded"
                      >
                        {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <div className="col-span-3">Name</div>
                    <div className="col-span-2">Title</div>
                    <div className="col-span-2">Contact</div>
                    <div className="col-span-2">Experience</div>
                    <div className="col-span-2">Skills</div>
                  </div>

                  {/* Table Rows - Card on mobile, grid on desktop */}
                  {filteredResumes.map((resume) => {
                    const isSelected = selectedResumes.includes(resume.id);
                    // Check if resume is archived OR if we're viewing the Archived folder
                    const selectedFolderData = folders.find(f => f.id === selectedFolder);
                    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
                    const isArchived = resume.isArchived === true || isArchivedFolder;

                    return (
                      <div
                        key={resume.id}
                        onClick={() => {
                          if (isArchived) {
                            toast.error('Archived resumes cannot be scored. Please select an active resume.');
                            return;
                          }
                          handleToggleResume(resume.id);
                        }}
                        className={`border-2 rounded-lg transition-all ${
                          isArchived
                            ? 'border-amber-100 bg-amber-50 opacity-60 cursor-not-allowed'
                            : isSelected
                              ? 'border-brand-blue/40 bg-brand-blue/5 shadow-sm shadow-brand-blue/10 cursor-pointer'
                              : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:bg-brand-blue/[0.03] hover:shadow-sm cursor-pointer'
                        }`}
                      >
                        {/* Desktop layout */}
                        <div className="hidden md:grid grid-cols-12 gap-4 p-4 items-center">
                          {/* Checkbox */}
                          <div className="col-span-1 flex items-center justify-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isArchived) {
                                  toast.error('Archived resumes cannot be scored. Please select an active resume.');
                                  return;
                                }
                                handleToggleResume(resume.id);
                              }}
                              disabled={isArchived}
                              className="p-1 hover:bg-brand-blue/10 rounded disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-brand-blue" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-400" />
                              )}
                            </button>
                          </div>

                          {/* Name */}
                          <div className="col-span-3">
                            <div className="font-semibold text-gray-900">{resume.name}</div>
                            {isArchived && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded mt-0.5">
                                Archived
                              </span>
                            )}
                            {!isArchived && resume.source && (
                              <div className="text-xs text-gray-600 mt-0.5">{resume.source}</div>
                            )}
                          </div>

                          {/* Title */}
                          <div className="col-span-2">
                            <div className="flex items-start gap-1.5">
                              <Briefcase className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{resume.title || 'N/A'}</span>
                            </div>
                          </div>

                          {/* Contact */}
                          <div className="col-span-2">
                            <div className="flex items-start gap-1.5 mb-1">
                              <Mail className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-gray-700 truncate">{resume.email}</span>
                            </div>
                            {resume.phone && (
                              <div className="flex items-start gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                                <span className="text-xs text-gray-700">{resume.phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Experience */}
                          <div className="col-span-2">
                            <div className="flex items-start gap-1.5">
                              <Award className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{resume.experience || 'N/A'}</span>
                            </div>
                          </div>

                          {/* Skills */}
                          <div className="col-span-2">
                            {resume.skills && resume.skills.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {resume.skills.slice(0, 2).map((skill, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                  >
                                    {skill}
                                  </span>
                                ))}
                                {resume.skills.length > 2 && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                    +{resume.skills.length - 2}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">No skills listed</span>
                            )}
                          </div>
                        </div>

                        {/* Mobile layout - Card style */}
                        <div className="md:hidden p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isArchived) {
                                  toast.error('Archived resumes cannot be scored. Please select an active resume.');
                                  return;
                                }
                                handleToggleResume(resume.id);
                              }}
                              disabled={isArchived}
                              className="p-1 hover:bg-gray-100 rounded disabled:cursor-not-allowed disabled:opacity-50 flex-shrink-0 mt-0.5"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-brand-blue" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-400" />
                              )}
                            </button>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-900 text-sm">{resume.name}</div>
                              {isArchived && (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded mt-1">
                                  Archived
                                </span>
                              )}
                              {!isArchived && resume.title && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Briefcase className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                  <span className="text-xs text-gray-700">{resume.title}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 mt-1">
                                <Mail className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                <span className="text-xs text-gray-700 truncate">{resume.email}</span>
                              </div>
                              {resume.experience && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Award className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                  <span className="text-xs text-gray-700">{resume.experience}</span>
                                </div>
                              )}
                              {resume.skills && resume.skills.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {resume.skills.slice(0, 3).map((skill, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                  {resume.skills.length > 3 && (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                      +{resume.skills.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <Database className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-300" />
                  <h3 className="text-gray-900 font-semibold mb-2">No Resumes Found</h3>
                  <p className="text-xs sm:text-sm text-gray-600">
                    {searchTerm
                      ? 'Try adjusting your search terms'
                      : activeTab === 'my-resumes'
                      ? selectedFolder === 'all'
                        ? 'Upload resumes to My Resumes to get started'
                        : 'No resumes in this folder'
                      : 'No resumes available in the internal database'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-brand-blue/[0.03]">
          {/* Quota Warning */}
          {availableUnits !== null && availableUnits !== undefined && selectedResumes.length > 0 && selectedResumes.length > availableUnits && (
            <div className="mb-3 p-3 bg-brand-orange/5 ring-1 ring-brand-orange/20 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-brand-orange-deep flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs sm:text-sm">
                <span className="font-semibold text-brand-orange-deep">Insufficient Units!</span>
                <span className="text-brand-orange-deep/90 ml-1">
                  You selected {selectedResumes.length} resumes but only have {availableUnits} RS units available.
                  Need {selectedResumes.length - availableUnits} more unit{selectedResumes.length - availableUnits > 1 ? 's' : ''}.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="text-xs sm:text-sm text-gray-700">
                {selectedResumes.length > 0 ? (
                  <span>
                    <span className="font-semibold text-gray-900">{selectedResumes.length}</span> resume{selectedResumes.length === 1 ? '' : 's'} selected from{' '}
                    <span className="font-semibold text-gray-900">
                      {activeTab === 'my-resumes'
                        ? selectedFolder === 'all'
                          ? 'All Folders'
                          : folders.find(f => f.id === selectedFolder)?.name || 'Selected Folder'
                        : 'Internal Database'
                      }
                    </span>
                  </span>
                ) : (
                  <span className="text-gray-600">Select resumes to score against this job</span>
                )}
              </div>

              {/* Available Units Display */}
              {availableUnits !== null && availableUnits !== undefined && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium ring-1 ${
                  selectedResumes.length > availableUnits
                    ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                    : 'bg-green-50 text-green-700 ring-green-200'
                }`}>
                  <Zap className="w-3.5 h-3.5" />
                  <span>{availableUnits} RS units available</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleScore}
                disabled={(() => {
                  // Check if no resumes selected
                  if (selectedResumes.length === 0) return true;

                  // Check if insufficient units
                  if (availableUnits !== null && availableUnits !== undefined && selectedResumes.length > availableUnits) return true;

                  // Check if currently viewing Archived folder
                  const selectedFolderData = folders.find(f => f.id === selectedFolder);
                  const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;

                  if (isArchivedFolder && selectedResumes.length > 0) {
                    return true; // Disable if any resumes selected in archived folder
                  }

                  // Check if any archived resumes are selected
                  const allResumes = activeTab === 'my-resumes' ? allMyResumes : allDatabaseResumes;
                  const selectedResumeObjects = allResumes.filter(r => selectedResumes.includes(r.id));
                  const hasArchivedResumes = selectedResumeObjects.some(r => r.isArchived === true);

                  return hasArchivedResumes;
                })()}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-white rounded-lg ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm ${
                  selectedResumes.length > 0 && availableUnits !== null && availableUnits !== undefined && selectedResumes.length > availableUnits
                    ? 'bg-brand-orange hover:bg-brand-orange-deep shadow-brand-orange/25'
                    : 'bg-brand-blue hover:bg-brand-blue-2 shadow-brand-blue/25'
                }`}
              >
                <Target className="w-4 h-4" />
                Score {selectedResumes.length > 0 && `(${selectedResumes.length})`} Resume{selectedResumes.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Version Selection Modal */}
      {showVersionSelection && resumesForVersionSelection.length > 0 && (
        <ScoringVersionSelectionModal
          resumes={resumesForVersionSelection}
          jobTitle={jobTitle}
          onClose={() => setShowVersionSelection(false)}
          onConfirm={handleVersionSelectionConfirm}
        />
      )}

      {/* Duplicate Resume Detected Modal */}
      {showDuplicateModal && duplicateInfo && (
        <DuplicateResumeDetectedModal
          isOpen={showDuplicateModal}
          onClose={() => {
            setShowDuplicateModal(false);
            setDuplicateInfo(null);
          }}
          fileName={duplicateInfo.fileName}
          existingResume={duplicateInfo.existingResume}
          jobTitle={jobTitle}
          onViewExisting={handleViewExisting}
          onProceedWithScoring={handleProceedWithScoring}
        />
      )}
    </div>
  );
}
