import { X, FolderOpen, Database, Search, CheckSquare, Square, User, Mail, Award, Target, ChevronRight, ChevronDown, Folder, FileText, MapPin, Phone, Briefcase, AlertTriangle, Zap, Upload, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { Resume, Folder as FolderType } from '@/lib/types/types';
import ScoringVersionSelectionModal from './ScoringVersionSelectionModal';
import { resumeService } from '@/lib/services/resumeService';
import { toast } from 'sonner';

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
}

export default function ResumeSelectionModal({
  jobTitle,
  myResumes,
  databaseResumes,
  folders,
  onClose,
  onScoreResumes,
  availableUnits,
  onResumeUploaded
}: ResumeSelectionModalProps) {
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'database'>('my-resumes');
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [showVersionSelection, setShowVersionSelection] = useState(false);
  const [resumesForVersionSelection, setResumesForVersionSelection] = useState<Resume[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [localResumes, setLocalResumes] = useState<Resume[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debug: Log folders data
  console.log('[ResumeSelectionModal] Folders received:', folders);
  console.log('[ResumeSelectionModal] MyResumes count:', myResumes.length);
  console.log('[ResumeSelectionModal] MyResumes sample:', myResumes.slice(0, 3).map(r => ({ id: r.id, name: r.name, folderId: r.folderId })));

  // Combine myResumes with locally uploaded resumes
  const allMyResumes = [...localResumes, ...myResumes];
  const allDatabaseResumes = [...localResumes, ...databaseResumes];

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/plain'];
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      toast.error('Invalid file type. Please upload PDF, DOC, DOCX, RTF, or TXT files.');
      return;
    }

    // Validate file size (3MB max)
    if (file.size > 3 * 1024 * 1024) {
      toast.error('File size exceeds 3MB limit.');
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

      // Handle duplicate error
      if (error.message?.includes('409') || error.message?.includes('DUPLICATE')) {
        toast.error('A resume with this email already exists.', { id: toastId });
      } else {
        toast.error(error.message || 'Failed to upload resume', { id: toastId });
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
        resumes = allMyResumes;
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
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  const handleSelectAll = () => {
    if (selectedResumes.length === filteredResumes.length) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(filteredResumes.map(r => r.id));
    }
  };

  const handleTabChange = (tab: 'my-resumes' | 'database') => {
    setActiveTab(tab);
    setSelectedResumes([]);
    setSearchTerm('');
    setSelectedFolder('all');
  };

  const handleScore = () => {
    if (selectedResumes.length > 0) {
      // Get the selected resume objects
      const allResumes = activeTab === 'my-resumes' ? allMyResumes : allDatabaseResumes;
      const selectedResumeObjects = allResumes.filter(r => selectedResumes.includes(r.id));

      // Debug: Log version counts
      console.log('[ResumeSelectionModal] Selected resumes version info:',
        selectedResumeObjects.map(r => ({
          id: r.id,
          name: r.name,
          versionCount: r.versionCount,
          version: r.version
        }))
      );

      console.log('[ResumeSelectionModal] selectedCount:', selectedResumeObjects.length);

      // SINGLE candidate → Always show version selection popup (modal will fetch versions from API)
      // MULTIPLE candidates → Auto-select latest version, no popup
      if (selectedResumeObjects.length === 1) {
        // Single candidate - always show version selection modal
        // The modal will fetch versions from API and display them
        console.log('[ResumeSelectionModal] Single candidate - showing version selection popup');
        setResumesForVersionSelection(selectedResumeObjects);
        setShowVersionSelection(true);
      } else {
        // Multiple candidates - proceed directly with scoring (uses latest version automatically)
        console.log('[ResumeSelectionModal] Multiple candidates - auto-selecting latest versions');
        onScoreResumes(selectedResumes, activeTab);
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
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
                className="p-0.5 hover:bg-gray-200 rounded"
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
                ? 'bg-gray-200 text-gray-900'
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl text-gray-900 mb-1">Select Resumes to Score</h2>
              <p className="text-sm text-gray-600">
                Job: <span className="font-medium text-gray-900">{jobTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6 pt-4">
          <div className="flex gap-2">
            <button
              onClick={() => handleTabChange('my-resumes')}
              className={`px-5 py-3 text-sm font-medium rounded-t-lg transition-all ${
                activeTab === 'my-resumes'
                  ? 'bg-gray-50 text-gray-900 border-b-2 border-gray-800'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                My Resumes
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'my-resumes'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {allMyResumes.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => handleTabChange('database')}
              className={`px-5 py-3 text-sm font-medium rounded-t-lg transition-all ${
                activeTab === 'database'
                  ? 'bg-gray-50 text-gray-900 border-b-2 border-gray-800'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                Internal Database
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'database'
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {allDatabaseResumes.length}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Folder Tree (Only for My Resumes) */}
          {activeTab === 'my-resumes' && (
            <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
              <div className="p-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3 px-3">Folders</h3>
                
                {/* All Resumes */}
                <button
                  onClick={() => setSelectedFolder('all')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm mb-2 ${
                    selectedFolder === 'all'
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span className="flex-1 text-left">All Resumes</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedFolder === 'all'
                      ? 'bg-gray-200 text-gray-900'
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
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, title, or skills..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent"
                  />
                </div>

                {/* Upload Resume Button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.rtf,.txt"
                  className="hidden"
                />
                <button
                  onClick={handleUploadClick}
                  disabled={isUploading}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Resume
                    </>
                  )}
                </button>

                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-white transition-colors text-sm font-medium text-gray-700 flex items-center gap-2"
                >
                  {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-gray-800" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      Select All
                    </>
                  )}
                </button>
                <div className="text-sm text-gray-700 bg-white px-4 py-2.5 rounded-lg border border-gray-200 font-medium">
                  <span className="text-gray-800">{selectedResumes.length}</span> selected
                </div>
              </div>
            </div>

            {/* Resume List */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredResumes.length > 0 ? (
                <div className="space-y-2">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 uppercase">
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        onClick={handleSelectAll}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-gray-800" />
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

                  {/* Table Rows */}
                  {filteredResumes.map((resume) => {
                    const isSelected = selectedResumes.includes(resume.id);
                    return (
                      <div
                        key={resume.id}
                        onClick={() => handleToggleResume(resume.id)}
                        className={`grid grid-cols-12 gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer items-center ${
                          isSelected
                            ? 'border-gray-400 bg-gray-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className="col-span-1 flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleResume(resume.id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-gray-800" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </div>

                        {/* Name */}
                        <div className="col-span-3">
                          <div className="font-medium text-gray-900">{resume.name}</div>
                          {resume.source && (
                            <div className="text-xs text-gray-500 mt-0.5">{resume.source}</div>
                          )}
                        </div>

                        {/* Title */}
                        <div className="col-span-2">
                          <div className="flex items-start gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-gray-700">{resume.title || 'N/A'}</span>
                          </div>
                        </div>

                        {/* Contact */}
                        <div className="col-span-2">
                          <div className="flex items-start gap-1.5 mb-1">
                            <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-gray-600 truncate">{resume.email}</span>
                          </div>
                          {resume.phone && (
                            <div className="flex items-start gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-gray-600">{resume.phone}</span>
                            </div>
                          )}
                        </div>

                        {/* Experience */}
                        <div className="col-span-2">
                          <div className="flex items-start gap-1.5">
                            <Award className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
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
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                                  +{resume.skills.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">No skills listed</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-gray-900 mb-2">No Resumes Found</h3>
                  <p className="text-sm text-gray-600">
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
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          {/* Quota Warning */}
          {availableUnits !== null && availableUnits !== undefined && selectedResumes.length > 0 && selectedResumes.length > availableUnits && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <span className="font-medium text-amber-800">Insufficient Units!</span>
                <span className="text-amber-700 ml-1">
                  You selected {selectedResumes.length} resumes but only have {availableUnits} RS units available.
                  Need {selectedResumes.length - availableUnits} more unit{selectedResumes.length - availableUnits > 1 ? 's' : ''}.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {selectedResumes.length > 0 ? (
                  <span>
                    <span className="font-medium text-gray-900">{selectedResumes.length}</span> resume{selectedResumes.length === 1 ? '' : 's'} selected from{' '}
                    <span className="font-medium text-gray-900">
                      {activeTab === 'my-resumes'
                        ? selectedFolder === 'all'
                          ? 'All Folders'
                          : folders.find(f => f.id === selectedFolder)?.name || 'Selected Folder'
                        : 'Internal Database'
                      }
                    </span>
                  </span>
                ) : (
                  <span>Select resumes to score against this job</span>
                )}
              </div>

              {/* Available Units Display */}
              {availableUnits !== null && availableUnits !== undefined && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  selectedResumes.length > availableUnits
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  <Zap className="w-3.5 h-3.5" />
                  <span>{availableUnits} RS units available</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleScore}
                disabled={selectedResumes.length === 0}
                className={`px-6 py-2.5 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg flex items-center gap-2 ${
                  selectedResumes.length > 0 && availableUnits !== null && availableUnits !== undefined && selectedResumes.length > availableUnits
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800'
                    : 'bg-gradient-to-r from-gray-800 to-gray-800 hover:from-gray-700 hover:to-gray-900'
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
    </div>
  );
}
