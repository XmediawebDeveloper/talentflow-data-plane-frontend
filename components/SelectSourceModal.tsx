'use client';

import { X, Users, Database, Search, CheckSquare, Square, Loader2, Mail, Phone, Briefcase, MapPin, Calendar, Target, ArrowLeft, FolderOpen, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resumeService, folderService, Resume, Folder as FolderType } from '@/lib/services/resumeService';
import { scoringService } from '@/lib/services/scoringService';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';

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

  // Fetch resumes and folders on mount and tab change
  useEffect(() => {
    fetchData();
  }, [activeTab]);

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

  // Submit for scoring
  const handleSubmitForScoring = async () => {
    if (selectedResumes.length === 0) return;

    setSubmitting(true);
    try {
      // Call bulk scoring API
      await scoringService.bulkScore(jobId, selectedResumes);

      toast.success(`${selectedResumes.length} resume(s) submitted for scoring`);

      if (onScoringComplete) {
        onScoringComplete();
      }
      onClose();
    } catch (error) {
      console.error('Failed to submit for scoring:', error);
      handleQuotaError(error, router, 'Failed to submit resumes for scoring');
    } finally {
      setSubmitting(false);
    }
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
    const childFolders = folders.filter(f => f.parent_id === parentId && !(f.name.toLowerCase() === 'root' && !f.parent_id));

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
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Folder Tree (Only for My Resumes) */}
          {activeTab === 'my-resumes' && folders.length > 0 && (
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
                <div className="space-y-1">
                  {renderFolderTree(undefined, 0)}
                </div>
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
    </div>
  );
}
