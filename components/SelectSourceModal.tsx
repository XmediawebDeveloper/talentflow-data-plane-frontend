'use client';

import { X, Users, Database, Search, CheckSquare, Square, Loader2, Mail, Phone, Briefcase, MapPin, Calendar, Target, ArrowLeft, FolderOpen, ChevronRight, ChevronDown, Folder, Clock, CheckCircle2, XCircle, User, Timer, Minus, RotateCcw, Upload } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { resumeService, folderService, Resume, Folder as FolderType } from '@/lib/services/resumeService';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { useAuth } from '@/components/providers/AuthProvider';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import UploadModal from './UploadModal';

// Progress item interface (internal)
interface ProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  errorMessage?: string;
}

interface SelectSourceModalProps {
  onClose: () => void;
  jobTitle: string;
  jobId: string;
  onScoringComplete?: () => void;
}

export default function SelectSourceModal({
  onClose,
  jobTitle,
  jobId,
  onScoringComplete
}: SelectSourceModalProps) {
  const router = useRouter();
  const { user, tenant } = useAuth();

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

  // State
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [scoringStats, setScoringStats] = useState({ queued: 0, processing: 0, completed: 0, failed: 0 });

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Fetch resumes and folders on mount and tab change
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Auto-expand all folders when they load
  useEffect(() => {
    if (folders.length > 0) {
      const allFolderIds = folders.map(f => f.id);
      setExpandedFolders(allFolderIds);
    }
  }, [folders]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch resumes based on active tab
      const resumeResponse = await resumeService.list({
        source: activeTab,
        page_size: 100
      });
      setResumes(resumeResponse.items || []);

      // Fetch folders only for my-resumes tab
      if (activeTab === 'my-resumes') {
        try {
          const folderData = await folderService.list();
          console.log('[SelectSourceModal] Fetched folders:', folderData);
          console.log('[SelectSourceModal] Folders count:', folderData?.length || 0);

          // Log each folder's details
          folderData?.forEach((folder, index) => {
            console.log(`[SelectSourceModal] Folder ${index + 1}:`, {
              id: folder.id,
              name: folder.name,
              parent_id: folder.parent_id,
              resume_count: folder.resume_count
            });
          });

          setFolders(folderData || []);
        } catch (e) {
          console.error('Failed to fetch folders:', e);
          setFolders([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch resumes:', error);
      toast.error('Failed to load resumes. Please try again.');
      setResumes([]);
    } finally {
      setLoading(false);
    }
  };

  // Set a timeout to stop loading if API is too slow
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false);
        console.warn('Resume fetch timed out');
      }
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [loading]);

  // Filter resumes based on search and folder
  const getFilteredResumes = () => {
    let filtered = resumes;

    // Filter by folder (only for my-resumes)
    if (activeTab === 'my-resumes' && selectedFolder !== 'all') {
      filtered = filtered.filter(r => r.folder_id === selectedFolder);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(resume =>
        (resume.candidate_name || '').toLowerCase().includes(term) ||
        (resume.email || '').toLowerCase().includes(term) ||
        (resume.current_title || '').toLowerCase().includes(term) ||
        (resume.skills || []).some(skill => skill.toLowerCase().includes(term))
      );
    }

    return filtered;
  };

  const filteredResumes = getFilteredResumes();

  // Toggle resume selection
  const handleToggleResume = (resumeId: string) => {
    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  // Select/deselect all
  const handleSelectAll = () => {
    if (selectedResumes.length === filteredResumes.length && filteredResumes.length > 0) {
      setSelectedResumes([]);
    } else {
      setSelectedResumes(filteredResumes.map(r => r.id));
    }
  };

  // Tab change
  const handleTabChange = (tab: 'my-resumes' | 'internal-db') => {
    setActiveTab(tab);
    setSelectedResumes([]);
    setSearchTerm('');
    setSelectedFolder('all');
  };

  // Submit for scoring with progress tracking
  const handleSubmitForScoring = async () => {
    if (selectedResumes.length === 0) return;

    // Check for already-scored resumes before proceeding
    let resumesToScore = [...selectedResumes];
    try {
      const checkResult = await scoringService.checkExistingScores(jobId, resumesToScore);
      if (checkResult.existing_count > 0) {
        const alreadyScoredNames = checkResult.existing_scores
          .map((s: any) => `${s.candidate_name} (${s.overall_score}%)`)
          .join(', ');

        if (checkResult.new_count === 0) {
          // ALL resumes already scored - block entirely
          toast.error(
            `All ${checkResult.existing_count} resume(s) already scored for "${checkResult.jd_title}": ${alreadyScoredNames}`,
            { duration: 6000 }
          );
          return;
        }

        // SOME already scored - warn and filter them out
        toast.warning(
          `${checkResult.existing_count} resume(s) already scored and will be skipped: ${alreadyScoredNames}`,
          { duration: 5000 }
        );
        const existingIds = new Set(checkResult.existing_scores.map((s: any) => s.resume_id));
        resumesToScore = resumesToScore.filter(id => !existingIds.has(id));

        if (resumesToScore.length === 0) return;
      }
    } catch (error) {
      console.error('Error checking existing scores:', error);
      // Continue with scoring even if check fails
    }

    // Initialize all items with 'queued' status immediately
    const initialItems: ProgressItem[] = resumesToScore.map(resumeId => {
      const resume = resumes.find(r => r.id === resumeId);
      return {
        resumeId,
        candidateName: resume?.candidate_name || 'Unknown',
        status: 'queued' as const,
      };
    });

    setProgressItems(initialItems);
    setScoringStats({ queued: resumesToScore.length, processing: 0, completed: 0, failed: 0 });
    setShowProgressModal(true);
    setSubmitting(true);

    let completed = 0;
    let failed = 0;

    // Score resumes one by one to show real-time progress
    for (let i = 0; i < resumesToScore.length; i++) {
      const resumeId = resumesToScore[i];
      const resume = resumes.find(r => r.id === resumeId);
      const candidateName = resume?.candidate_name || 'Unknown';

      // Update current item to 'processing'
      setProgressItems(prev => prev.map(item =>
        item.resumeId === resumeId
          ? { ...item, status: 'processing' as const }
          : item
      ));
      setScoringStats({
        queued: resumesToScore.length - i - 1,
        processing: 1,
        completed,
        failed,
      });

      try {
        const result = await scoringService.scoreResume(jobId, resumeId);
        completed++;

        // Update item to 'completed' with score
        setProgressItems(prev => prev.map(item =>
          item.resumeId === resumeId
            ? { ...item, status: 'completed' as const, score: Math.round(result.overall_score) }
            : item
        ));
        setScoringStats({
          queued: resumesToScore.length - i - 1,
          processing: 0,
          completed,
          failed,
        });
      } catch (error: any) {
        failed++;
        const errorMsg = error?.message || 'Scoring failed';

        // Update item to 'failed' with error
        setProgressItems(prev => prev.map(item =>
          item.resumeId === resumeId
            ? { ...item, status: 'failed' as const, errorMessage: errorMsg }
            : item
        ));
        setScoringStats({
          queued: resumesToScore.length - i - 1,
          processing: 0,
          completed,
          failed,
        });
      }
    }

    // All done
    setSubmitting(false);

    if (completed > 0) {
      toast.success(`${completed} resume(s) scored successfully${failed > 0 ? `, ${failed} failed` : ''}`);
    } else if (failed > 0) {
      toast.error(`All ${failed} resume(s) failed to score`);
    }

    if (onScoringComplete) {
      onScoringComplete();
    }
  };

  // Retry failed scoring
  const handleRetryFailed = async (resumeId: string) => {
    const item = progressItems.find(i => i.resumeId === resumeId);
    if (!item || item.status !== 'failed') return;

    // Update to processing
    setProgressItems(prev => prev.map(i =>
      i.resumeId === resumeId ? { ...i, status: 'processing' as const, errorMessage: undefined } : i
    ));
    setScoringStats(prev => ({ ...prev, failed: prev.failed - 1, processing: prev.processing + 1 }));

    try {
      const result = await scoringService.scoreResume(jobId, resumeId);
      setProgressItems(prev => prev.map(i =>
        i.resumeId === resumeId
          ? { ...i, status: 'completed' as const, score: Math.round(result.overall_score) }
          : i
      ));
      setScoringStats(prev => ({ ...prev, processing: prev.processing - 1, completed: prev.completed + 1 }));
      toast.success('Retry successful');
      if (onScoringComplete) onScoringComplete();
    } catch (error: any) {
      setProgressItems(prev => prev.map(i =>
        i.resumeId === resumeId
          ? { ...i, status: 'failed' as const, errorMessage: error?.message || 'Retry failed' }
          : i
      ));
      setScoringStats(prev => ({ ...prev, processing: prev.processing - 1, failed: prev.failed + 1 }));
      toast.error('Retry failed');
    }
  };

  // Close progress modal
  const handleCloseProgress = () => {
    if (!submitting) {
      setShowProgressModal(false);
      onClose();
    }
  };

  // Handle resume upload
  const handleUpload = async (files: File[], folderId?: string) => {
    try {
      // Upload the first file (UploadModal handles single file uploads)
      if (files.length === 0) {
        return {
          success: false,
          error: 'No file provided'
        };
      }

      const file = files[0];
      const response = await resumeService.upload(file, folderId);

      // Refresh resumes list
      await fetchData();

      return {
        success: true,
        resumeId: response.id,
        candidateName: response.candidate_name
      };
    } catch (error: any) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: error.message || 'Upload failed'
      };
    }
  };

  // Handle upload complete - auto-select the uploaded resume
  const handleUploadComplete = () => {
    setShowUploadModal(false);
    fetchData(); // Refresh the list
  };

  // Handle auto-select after upload
  const handleAutoSelectAfterUpload = async (resumeId: string, candidateName: string) => {
    // Close upload modal
    setShowUploadModal(false);

    // Refresh the list to include the new resume
    await fetchData();

    // Auto-select the uploaded resume
    setSelectedResumes(prev => {
      if (!prev.includes(resumeId)) {
        return [...prev, resumeId];
      }
      return prev;
    });

    // Show success message
    toast.success(`Resume uploaded! "${candidateName}" is now selected. Add more or click "Score Resumes" to continue.`);
  };

  // Toggle folder expansion
  const toggleFolder = (id: string) => {
    setExpandedFolders(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  // Get resume count for folder
  const getResumeCount = (folderId: string) => {
    if (folderId === 'all') return resumes.length;
    return resumes.filter(r => r.folder_id === folderId).length;
  };

  // Render folder tree
  const renderFolderTree = (parentId?: string, level: number = 0) => {
    // Find root folder first
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && (!f.parent_id || f.parent_id === null));
    const rootId = rootFolder?.id;

    // If no parentId specified, show all non-root folders
    let childFolders: typeof folders;
    if (parentId === undefined) {
      // Show all folders except root itself
      childFolders = folders.filter(f => {
        // Skip root folder
        if (f.name.toLowerCase() === 'root' && (!f.parent_id || f.parent_id === null)) {
          return false;
        }

        // Include folders that are:
        // 1. Children of root (parent_id === rootId)
        // 2. OR have no parent/null parent (top-level folders)
        // 3. OR have empty string parent
        if (rootId) {
          return f.parent_id === rootId || !f.parent_id || f.parent_id === null || f.parent_id === '';
        } else {
          return !f.parent_id || f.parent_id === null || f.parent_id === '';
        }
      });
    } else {
      // Show children of specified parent
      childFolders = folders.filter(f => f.parent_id === parentId);
    }

    console.log('[SelectSourceModal] renderFolderTree - parentId:', parentId, 'rootId:', rootId, 'folders.length:', folders.length, 'childFolders:', childFolders.length);
    console.log('[SelectSourceModal] childFolders names:', childFolders.map(f => f.name));

    return childFolders.map(folder => {
      const isExpanded = expandedFolders.includes(folder.id);
      const isSelected = selectedFolder === folder.id;
      const hasChildren = folders.some(f => f.parent_id === folder.id);
      const count = getResumeCount(folder.id);

      return (
        <div key={folder.id}>
          <button
            onClick={() => setSelectedFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm group ${
              isSelected
                ? 'bg-blue-100 text-blue-900 font-medium'
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
            <span className="flex-1 text-left truncate">{folder.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isSelected
                ? 'bg-blue-200 text-blue-900'
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Select Applicants to Score</h2>
              <p className="text-sm text-gray-600">
                Job: <span className="font-medium text-gray-900">{jobTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6 pt-4 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={() => handleTabChange('my-resumes')}
              className={`px-5 py-3 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 ${
                activeTab === 'my-resumes'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4" />
              My Resumes
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'my-resumes'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {activeTab === 'my-resumes' ? resumes.length : '...'}
              </span>
            </button>
            {/* Only show Internal Database tab if user has permission */}
            {hasInternalDBAccess && (
              <button
                onClick={() => handleTabChange('internal-db')}
                className={`px-5 py-3 text-sm font-medium rounded-t-lg transition-all flex items-center gap-2 ${
                  activeTab === 'internal-db'
                    ? 'bg-white text-green-600 border-b-2 border-green-600 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Database className="w-4 h-4" />
                Internal Database
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === 'internal-db'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {activeTab === 'internal-db' ? resumes.length : '...'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Folder Tree (Only for My Resumes) */}
          {activeTab === 'my-resumes' && (
            <div className="w-56 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0">
              <div className="p-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3 px-3">Folders</h3>

                {/* All Resumes */}
                <button
                  onClick={() => setSelectedFolder('all')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm mb-2 ${
                    selectedFolder === 'all'
                      ? 'bg-blue-100 text-blue-900 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  <span className="flex-1 text-left">All Resumes</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedFolder === 'all'
                      ? 'bg-blue-200 text-blue-900'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {resumes.length}
                  </span>
                </button>

                {/* Folder Tree */}
                {folders.length > 0 ? (
                  <div className="space-y-1">
                    {renderFolderTree(undefined, 0)}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-xs text-gray-500 text-center">
                    <p className="mb-2">No folders yet</p>
                    <p className="text-gray-400">Create folders from My Resumes page</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Bulk Actions */}
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, title, or skills..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {/* Upload Resume button - only for My Resumes tab */}
                {activeTab === 'my-resumes' && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all font-medium shadow-md hover:shadow-lg flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Resume
                  </button>
                )}
                <button
                  onClick={handleSelectAll}
                  disabled={filteredResumes.length === 0}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      Select All
                    </>
                  )}
                </button>
                <div className="text-sm text-gray-700 bg-blue-50 px-4 py-2.5 rounded-lg border border-blue-200 font-medium">
                  <span className="text-blue-700">{selectedResumes.length}</span> selected
                </div>
              </div>
            </div>

            {/* Resume List */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-gray-600">Loading resumes...</span>
                </div>
              ) : filteredResumes.length > 0 ? (
                <div className="space-y-2">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 uppercase sticky top-0">
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        onClick={handleSelectAll}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {selectedResumes.length === filteredResumes.length && filteredResumes.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <div className="col-span-3">Candidate</div>
                    <div className="col-span-2">Current Role</div>
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
                            ? 'border-blue-400 bg-blue-50 shadow-sm'
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
                              <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        </div>

                        {/* Candidate Name */}
                        <div className="col-span-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                              {(resume.candidate_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{resume.candidate_name || 'Unknown'}</div>
                              {resume.location && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                                  <MapPin className="w-3 h-3" />
                                  {resume.location}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Current Role */}
                        <div className="col-span-2">
                          <div className="text-sm text-gray-900">{resume.current_title || 'N/A'}</div>
                          {resume.current_company && (
                            <div className="text-xs text-gray-500 mt-0.5">{resume.current_company}</div>
                          )}
                        </div>

                        {/* Contact */}
                        <div className="col-span-2">
                          {resume.email && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-600 truncate">{resume.email}</span>
                            </div>
                          )}
                          {resume.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-600">{resume.phone}</span>
                            </div>
                          )}
                        </div>

                        {/* Experience */}
                        <div className="col-span-2">
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700">
                              {resume.experience_years ? `${resume.experience_years} years` : 'N/A'}
                            </span>
                          </div>
                          {resume.notice_period && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-xs text-gray-500">{resume.notice_period}</span>
                            </div>
                          )}
                        </div>

                        {/* Skills */}
                        <div className="col-span-2">
                          {resume.skills && resume.skills.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {resume.skills.slice(0, 3).map((skill, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                >
                                  {skill}
                                </span>
                              ))}
                              {resume.skills.length > 3 && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                                  +{resume.skills.length - 3}
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
                <div className="text-center py-16">
                  <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Resumes Found</h3>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    {searchTerm
                      ? 'No resumes match your search. Try different keywords.'
                      : activeTab === 'my-resumes'
                      ? 'Upload resumes to My Resumes to get started.'
                      : 'No resumes available in the internal database.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {selectedResumes.length > 0 ? (
                <span>
                  <span className="font-medium text-gray-900">{selectedResumes.length}</span> resume{selectedResumes.length === 1 ? '' : 's'} selected for scoring
                </span>
              ) : (
                <span>Select resumes to score against this job</span>
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
                onClick={handleSubmitForScoring}
                disabled={selectedResumes.length === 0 || submitting}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md hover:shadow-lg flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    Score {selectedResumes.length > 0 && `${selectedResumes.length} `}Resume{selectedResumes.length === 1 ? '' : 's'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Modal - Using BulkScoringProgressModal */}
      {showProgressModal && (
        <BulkScoringProgressModal
          onClose={handleCloseProgress}
          progressData={progressItems.map((item): ScoringProgressItem => ({
            id: item.resumeId,
            resumeId: item.resumeId,
            candidateName: item.candidateName,
            jobTitle: jobTitle,
            jobId: jobId,
            source: activeTab === 'internal-db' ? 'Internal DB' : 'My Resumes',
            status: item.status === 'queued' ? 'Queued' :
                    item.status === 'processing' ? 'Scoring in progress' :
                    item.status === 'completed' ? 'Scored successfully' :
                    item.status === 'already_scored' ? 'Already Scored - Skipped' :
                    'Failed',
            errorReason: item.errorMessage,
            scoredDateTime: item.status === 'completed' ? new Date() : undefined,
            matchResult: item.status === 'completed' && item.score !== undefined
              ? (item.score >= 80 ? 'Exact Match' : item.score >= 60 ? 'Partial Match' : 'No Match')
              : undefined,
            score: item.score,
          }))}
          filterByJobId={jobId}
          showJobTitleColumn={false}
          onRetryFailed={async (scoringItem) => {
            await handleRetryFailed(scoringItem.resumeId);
          }}
        />
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          folders={folders}
          tenant={tenant}
          uploadSection="my-resumes"
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
          onUploadComplete={handleUploadComplete}
          onScoreResume={handleAutoSelectAfterUpload}
        />
      )}
    </div>
  );
}
