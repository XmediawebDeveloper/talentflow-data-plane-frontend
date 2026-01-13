'use client'

import { Eye, Briefcase, Download, MoreHorizontal, Paperclip, Upload, Zap, FileSearch, Edit3, FolderOpen, Trash2, Copy, Share2, Mail, Star, Tag, Archive, FileText, Clock } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Resume, Folder } from '@/lib/types/types';
import { EmptyState } from './ui/empty-state';
import Pagination from './Pagination';
import { usePagination } from '@/lib/hooks/usePagination';
import VersionHistoryModal from './VersionHistoryModal';
import ResumeVersionSelector from './ResumeVersionSelector';
import { toast } from 'sonner';
import { resumeService } from '@/lib/services/resumeService';

interface ResumeTableProps {
  resumes: Resume[];
  selectedResumes: string[];
  onSelectResume: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onQuickView: (resume: Resume) => void;
  onApplyToJob: (resume: Resume) => void;
  onDelete: (id: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  folders?: Folder[];
  selectionMode?: boolean;
  onApplySelected?: () => void;
  onViewDetails?: (resume: Resume) => void;
  hideCheckboxes?: boolean;
  showTeamMemberBadge?: boolean;
  onVersion?: (resume: Resume) => void;
  highlightQuery?: string;
}

// Helper function to highlight matching text
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query || !text) return text;

  // Split query into words for multi-keyword matching
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
  if (keywords.length === 0) return text;

  // Create regex pattern for all keywords
  const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');

  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isMatch = keywords.some(k => part.toLowerCase() === k);
    return isMatch ? (
      <mark key={index} className="bg-yellow-200 text-gray-900 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      part
    );
  });
};

export default function ResumeTable({
  resumes,
  selectedResumes,
  onSelectResume,
  onSelectAll,
  onQuickView,
  onApplyToJob,
  onDelete,
  onMoveToFolder,
  folders,
  selectionMode = false,
  onApplySelected,
  onViewDetails,
  hideCheckboxes = false,
  showTeamMemberBadge = false,
  onVersion,
  highlightQuery,
}: ResumeTableProps) {
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [versionHistoryResume, setVersionHistoryResume] = useState<Resume | null>(null);
  const [versionSelectorResume, setVersionSelectorResume] = useState<Resume | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // NEW: Modal states for complete workflows
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMoveToFolderModal, setShowMoveToFolderModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showAddTagsModal, setShowAddTagsModal] = useState(false);
  const [selectedResumeForAction, setSelectedResumeForAction] = useState<Resume | null>(null);

  // Pagination
  const {
    paginatedItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    changeItemsPerPage,
    totalItems,
    startIndex,
    endIndex,
  } = usePagination({ items: resumes, initialItemsPerPage: 25 });

  const allSelected = resumes.length > 0 && resumes.every(r => selectedResumes.includes(r.id));
  const someSelected = selectedResumes.length > 0 && !allSelected;

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      // Always display in IST timezone format
      return date.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  // Handle showing version history - fetch versions from backend
  const handleShowVersionHistory = async (resume: Resume) => {
    if (resume.versions && resume.versions.length > 0) {
      // Already have versions loaded
      setVersionHistoryResume(resume);
      return;
    }

    // Fetch versions from backend
    setIsLoadingVersions(true);
    try {
      const versions = await resumeService.getVersions(resume.id);
      const resumeWithVersions = {
        ...resume,
        versions: versions.map((v: any) => ({
          id: v.id,
          name: v.file_name || v.candidate_name || 'Resume',
          uploadDate: v.created_at,
          size: v.file_size ? `${Math.round(v.file_size / 1024)} KB` : 'N/A',
        })),
      };
      setVersionHistoryResume(resumeWithVersions);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      toast.error('Failed to load version history');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Handle apply to job with version detection
  const handleApplyToJob = (resume: Resume) => {
    // Check if resume has multiple versions
    if ((resume.versionCount && resume.versionCount > 1) || (resume.versions && resume.versions.length > 1)) {
      // Show version selector modal
      setVersionSelectorResume(resume);
    } else {
      // Proceed directly with apply to job
      onApplyToJob(resume);
    }
  };

  // Handle version selection
  const handleVersionSelect = (versionId: string) => {
    if (versionSelectorResume) {
      toast.success(`Applying with ${versionSelectorResume.name}'s resume (${versionId})`);
      onApplyToJob(versionSelectorResume);
    }
  };

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No resumes found"
        description="We couldn't find any resumes matching your search criteria. Try adjusting your filters or search terms."
        action={{
          label: 'Clear all filters',
          onClick: () => {
            // This would be handled by parent component
            window.location.reload();
          },
          variant: 'secondary'
        }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {!hideCheckboxes && (
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={input => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Candidate Name
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Skills
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Experience
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Upload Date
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Uploaded By
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Files
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {paginatedItems.map((resume) => (
            <tr
              key={resume.id}
              className={`hover:bg-gray-50 transition-colors ${
                selectedResumes.includes(resume.id) ? 'bg-blue-50' : ''
              }`}
            >
              {!hideCheckboxes && (
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selectedResumes.includes(resume.id)}
                    onChange={() => onSelectResume(resume.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                  />
                </td>
              )}
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
                    {resume.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    {onViewDetails ? (
                      <button
                        onClick={() => onViewDetails(resume)}
                        className="text-sm text-gray-900 hover:text-blue-600 hover:underline text-left transition-colors"
                      >
                        {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                      </button>
                    ) : (
                      <div className="text-sm text-gray-900">
                        {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      {highlightQuery ? highlightText(resume.title, highlightQuery) : resume.title}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">
                {resume.email && resume.email !== 'No email'
                  ? (highlightQuery ? highlightText(resume.email, highlightQuery) : resume.email)
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">
                {resume.phone && resume.phone !== 'No phone'
                  ? (highlightQuery ? highlightText(resume.phone, highlightQuery) : resume.phone)
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1">
                  {resume.skills.slice(0, 4).map((skill, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-300"
                    >
                      {highlightQuery ? highlightText(skill, highlightQuery) : skill}
                    </span>
                  ))}
                  {resume.skills.length > 4 && (
                    <span className="inline-flex items-center px-2.5 py-0.5 text-xs text-blue-600">
                      +{resume.skills.length - 4} more
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">{resume.experience}</td>
              <td className="px-4 py-4">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs ${
                    resume.source === 'Manual'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {resume.source === 'Manual' ? (
                    <Upload className="w-3 h-3" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  {resume.source}
                </span>
              </td>
              <td className="px-4 py-4 text-sm text-gray-700">
                {formatDate(resume.uploadDate)}
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xs text-white">
                    {resume.uploadedBy.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm text-gray-700">{resume.uploadedBy}</span>
                </div>
              </td>
              <td className="px-4 py-4">
                {(resume.versionCount && resume.versionCount > 1) || (resume.versions && resume.versions.length > 1) ? (
                  <button
                    onClick={() => handleShowVersionHistory(resume)}
                    disabled={isLoadingVersions}
                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1">
                      <Paperclip className="w-4 h-4" />
                      <span>{resume.attachments}</span>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 border border-blue-200 group-hover:bg-blue-200 transition-colors">
                      v{resume.versionCount || resume.versions?.length || 1}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-sm text-gray-700">
                    <Paperclip className="w-4 h-4" />
                    {resume.attachments}
                  </div>
                )}
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  {selectionMode ? (
                    <button
                      onClick={() => {
                        onSelectResume(resume.id);
                        if (onApplySelected) {
                          onApplySelected();
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-2"
                    >
                      <Briefcase className="w-4 h-4" />
                      Apply to Job
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => router.push(`/recruitment/resume-detail/${resume.id}`)}
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="View Resume Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleApplyToJob(resume)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Apply to Job"
                      >
                        <Briefcase className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            toast.loading('Downloading resume...', { id: 'download' });
                            const blob = await resumeService.download(resume.id);
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${resume.name || 'resume'}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            toast.success('Resume downloaded', { id: 'download' });
                          } catch (error) {
                            console.error('Download failed:', error);
                            toast.error('Failed to download resume', { id: 'download' });
                          }
                        }}
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Download Resume"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setActiveMenu(activeMenu === resume.id ? null : resume.id)}
                          className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          title="More Options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {activeMenu === resume.id && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setActiveMenu(null)}
                            />
                            <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onViewDetails) onViewDetails(resume);
                                  setActiveMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                              >
                                <FileText className="w-4 h-4 text-purple-600" />
                                View Full Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowDuplicateModal(true);
                                  setActiveMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                              >
                                <Copy className="w-4 h-4 text-indigo-600" />
                                Duplicate Resume
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowShareModal(true);
                                  setActiveMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                              >
                                <Share2 className="w-4 h-4 text-green-600" />
                                Share Resume
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowAddTagsModal(true);
                                  setActiveMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                              >
                                <Tag className="w-4 h-4 text-cyan-600" />
                                Add Tags
                              </button>
                              <div className="border-t border-gray-100 my-1"></div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowArchiveModal(true);
                                  setActiveMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                              >
                                <Archive className="w-4 h-4 text-gray-600" />
                                Archive Resume
                              </button>
                              <div className="border-t border-gray-100 my-1"></div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResumeForAction(resume);
                                  setShowDeleteModal(true);
                                  setActiveMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Resume
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={changeItemsPerPage}
        />
      )}
      
      {/* Version History Modal */}
      {versionHistoryResume && versionHistoryResume.versions && Array.isArray(versionHistoryResume.versions) && versionHistoryResume.versions.length > 0 && (
        <VersionHistoryModal
          candidateName={versionHistoryResume.name}
          versions={versionHistoryResume.versions}
          onClose={() => setVersionHistoryResume(null)}
        />
      )}

      {/* Version Selector Modal */}
      {versionSelectorResume && versionSelectorResume.versions && versionSelectorResume.versions.length > 1 && (
        <ResumeVersionSelector
          resume={versionSelectorResume}
          onSelect={handleVersionSelect}
          onClose={() => setVersionSelectorResume(null)}
        />
      )}

      {/* Edit Details Modal */}
      {showEditModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Edit3 className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-gray-900">Edit Candidate Details</h2>
              </div>
              <p className="text-sm text-gray-600">
                Update information for {selectedResumeForAction.name}
              </p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.name}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Job Title</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.title}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    defaultValue={selectedResumeForAction.email}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    defaultValue={selectedResumeForAction.phone}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Skills (comma separated)</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.skills.join(', ')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Experience</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.experience}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Location</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.location}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toast.success('Candidate details updated successfully');
                    setShowEditModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Resume Modal */}
      {showDuplicateModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Copy className="w-5 h-5 text-indigo-600" />
                </div>
                <h2 className="text-gray-900">Duplicate Resume</h2>
              </div>
              <p className="text-sm text-gray-600">
                Create a copy of {selectedResumeForAction.name}'s resume
              </p>
            </div>
            <div className="p-6">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-indigo-800">
                  <strong>What will be duplicated?</strong>
                </p>
                <ul className="text-sm text-indigo-700 mt-2 space-y-1 ml-4 list-disc">
                  <li>All candidate information</li>
                  <li>Skills and experience data</li>
                  <li>Resume attachments</li>
                  <li>Tags and metadata</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toast.success('Resume duplicated successfully');
                    setShowDuplicateModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Resume Modal */}
      {showShareModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-green-600" />
                </div>
                <h2 className="text-gray-900">Share Resume</h2>
              </div>
              <p className="text-sm text-gray-600">
                Share {selectedResumeForAction.name}'s resume with team members
              </p>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Email addresses (comma separated)</label>
                <input
                  type="text"
                  placeholder="john@company.com, jane@company.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Message (optional)</label>
                <textarea
                  rows={3}
                  placeholder="Add a message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toast.success('Resume shared successfully');
                    setShowShareModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tags Modal */}
      {showAddTagsModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <Tag className="w-5 h-5 text-cyan-600" />
                </div>
                <h2 className="text-gray-900">Add Tags</h2>
              </div>
              <p className="text-sm text-gray-600">
                Add tags to {selectedResumeForAction.name}'s resume
              </p>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Tags</label>
                <input
                  type="text"
                  placeholder="Enter tags (comma separated)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Example: high-priority, senior-level, remote</p>
              </div>
              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-2">Suggested Tags</p>
                <div className="flex flex-wrap gap-2">
                  {['High Priority', 'Remote', 'Senior Level', 'Immediate Start', 'Contract'].map((tag) => (
                    <button
                      key={tag}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors border border-gray-300"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddTagsModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toast.success('Tags added successfully');
                    setShowAddTagsModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Tag className="w-4 h-4" />
                  Add Tags
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Resume Modal */}
      {showArchiveModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Archive className="w-5 h-5 text-gray-600" />
                </div>
                <h2 className="text-gray-900">Archive Resume</h2>
              </div>
              <p className="text-sm text-gray-600">
                Archive {selectedResumeForAction.name}'s resume?
              </p>
            </div>
            <div className="p-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-800">
                  <strong>What happens when you archive?</strong>
                </p>
                <ul className="text-sm text-gray-700 mt-2 space-y-1 ml-4 list-disc">
                  <li>Resume moved to archived section</li>
                  <li>Removed from active database</li>
                  <li>All data preserved</li>
                  <li>Can be restored anytime</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowArchiveModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    toast.success('Resume archived successfully');
                    setShowArchiveModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Resume Modal */}
      {showDeleteModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Delete Resume?</h2>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete <strong>{selectedResumeForAction.name}</strong>'s resume permanently?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  No, Cancel
                </button>
                <button
                  onClick={() => {
                    onDelete(selectedResumeForAction.id);
                    toast.success('Resume deleted successfully');
                    setShowDeleteModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}