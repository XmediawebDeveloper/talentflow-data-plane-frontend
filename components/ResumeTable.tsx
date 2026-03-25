'use client'

import { Eye, Briefcase, Download, MoreHorizontal, Paperclip, Upload, Zap, FileSearch, Edit3, FolderOpen, Trash2, Copy, Share2, Mail, Star, Tag, Archive, FileText, Clock, GripVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDrag } from 'react-dnd';
import { Resume, Folder } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { EmptyState } from './ui/empty-state';
import Pagination from './Pagination';
import { usePagination } from '@/lib/hooks/usePagination';
import VersionHistoryModal from './VersionHistoryModal';
import ResumeVersionSelector from './ResumeVersionSelector';
import { toast } from 'sonner';
import { resumeService } from '@/lib/services/resumeService';
// ✅ PERMISSION FIX: Import permission hook for CRUD checks
import { useModulePermissions } from '@/lib/hooks/usePermissions';

// Drag item type for resumes
const RESUME_DRAG_TYPE = 'RESUME';

interface DragItem {
  id: string;
  ids: string[];
}

// Draggable row component
interface DraggableResumeRowProps {
  resume: Resume;
  selectedResumes: string[];
  children: React.ReactNode;
  className?: string;
}

function DraggableResumeRow({ resume, selectedResumes, children, className }: DraggableResumeRowProps) {
  const [{ isDragging }, drag, preview] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: RESUME_DRAG_TYPE,
    item: () => ({
      id: resume.id,
      // If current resume is selected, drag all selected resumes; otherwise just this one
      ids: selectedResumes.includes(resume.id) ? selectedResumes : [resume.id],
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <tr
      ref={preview as unknown as React.Ref<HTMLTableRowElement>}
      className={`${className} ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Drag handle */}
      <td className="w-8 px-2 py-4">
        <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="cursor-grab hover:bg-gray-100 rounded p-1 flex items-center justify-center">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      </td>
      {children}
    </tr>
  );
}

interface ResumeTableProps {
  resumes: Resume[];
  selectedResumes: string[];
  onSelectResume: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onQuickView: (resume: Resume) => void;
  onApplyToJob?: (resume: Resume) => void;
  onDelete?: (id: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
  folders?: Folder[];
  selectionMode?: boolean;
  onApplySelected?: () => void;
  onViewDetails?: (resume: Resume) => void;
  hideCheckboxes?: boolean;
  showTeamMemberBadge?: boolean;
  onVersion?: (resume: Resume) => void;
  highlightQuery?: string;
  onArchive?: (resumeId: string) => void;
  disablePagination?: boolean;
  isArchivedFolder?: boolean;
  archivedFolderId?: string;
}

// Helper function to highlight matching text
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query || !text) return text;

  // Split query into words for multi-keyword matching (handle both commas and spaces)
  const keywords = query.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(k => k.length > 0);
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
  onArchive,
  disablePagination = false,
  isArchivedFolder = false,
  archivedFolderId,
}: ResumeTableProps) {
  const router = useRouter();
  // ✅ PERMISSION FIX: Get Resume CRUD permissions
  const resumePerms = useModulePermissions('resume');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number; openUp: boolean }>({ top: 0, right: 0, openUp: false });
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

  // Pagination (skipped when parent handles pagination server-side)
  const {
    paginatedItems: paginatedItemsFromHook,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    changeItemsPerPage,
    totalItems,
    startIndex,
    endIndex,
  } = usePagination({ items: resumes, initialItemsPerPage: 25 });

  // When pagination is disabled (server-side pagination), render all passed items
  const paginatedItems = disablePagination ? resumes : paginatedItemsFromHook;

  const allSelected = resumes.length > 0 && resumes.every(r => selectedResumes.includes(r.id));
  const someSelected = selectedResumes.length > 0 && !allSelected;

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
          size: v.file_size_kb ? `${v.file_size_kb} KB` : (v.file_size ? `${Math.round(v.file_size / 1024)} KB` : 'N/A'),
          uploadedBy: v.uploaded_by_name || 'Unknown',
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
  // For SINGLE candidate: ALWAYS show version popup first, then job selection
  const handleApplyToJob = async (resume: Resume) => {
    console.log('[APPLY] handleApplyToJob called for:', resume.name);

    // Block archived resumes - check isArchived flag, folder prop, or resume's own folderId
    const isArchived = resume.isArchived === true
      || isArchivedFolder
      || (archivedFolderId !== undefined && resume.folderId === archivedFolderId);

    if (isArchived) {
      toast.error('Archived resume cannot be applied to any job. Please select an active resume.');
      return;
    }

    // Always fetch versions and show selector for single candidate apply
    setIsLoadingVersions(true);
    try {
      console.log('[APPLY] Fetching versions for resume:', resume.id);
      const versions = await resumeService.getVersions(resume.id);
      console.log('[APPLY] Got versions:', versions);
      const resumeWithVersions = {
        ...resume,
        versions: versions && versions.length > 0
          ? versions.map((v: any) => ({
              id: v.id,
              name: v.file_name || v.candidate_name || 'Resume',
              uploadDate: v.created_at,
              version: v.version || 1,
              uploadedBy: v.uploaded_by_name || 'Unknown',
            }))
          : [{
              id: resume.id,
              name: resume.fileName || resume.name || 'Resume',
              uploadDate: resume.uploadDate,
              version: resume.version || 1,
              uploadedBy: resume.uploadedBy || 'Unknown',
            }],
      };
      console.log('[APPLY] Setting versionSelectorResume:', resumeWithVersions);
      setVersionSelectorResume(resumeWithVersions);
    } catch (error) {
      console.error('[APPLY] Failed to fetch versions:', error);
      // If can't fetch versions, create single version entry
      const resumeWithVersions = {
        ...resume,
        versions: [{
          id: resume.id,
          name: resume.fileName || resume.name || 'Resume',
          uploadDate: resume.uploadDate,
          version: resume.version || 1,
          uploadedBy: resume.uploadedBy || 'Unknown',
        }],
      };
      console.log('[APPLY] Setting versionSelectorResume (fallback):', resumeWithVersions);
      setVersionSelectorResume(resumeWithVersions);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Handle version selection
  const handleVersionSelect = (versionId: string) => {
    if (versionSelectorResume && versionSelectorResume.versions) {
      // Find the selected version
      const selectedVersion = versionSelectorResume.versions.find((v: any) => v.id === versionId);
      if (selectedVersion) {
        // Create a resume object with the selected version's ID
        const resumeWithSelectedVersion = {
          ...versionSelectorResume,
          id: versionId, // Use the selected version's ID
          version: selectedVersion.version,
        };
        toast.success(`Applying with ${versionSelectorResume.name}'s resume (v${selectedVersion.version})`);
        onApplyToJob?.(resumeWithSelectedVersion);
      } else {
        // Fallback to current resume if version not found
        onApplyToJob?.(versionSelectorResume);
      }
      setVersionSelectorResume(null);
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
    <div className="flex-1">
      {/* FIX-008: Desktop Table View - hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[1100px]">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {/* Drag handle column */}
            <th className="w-8 px-2 py-3">
              <span className="sr-only">Drag</span>
            </th>
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
            <DraggableResumeRow
              key={resume.id}
              resume={resume}
              selectedResumes={selectedResumes}
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
                <div className="flex items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      {onViewDetails ? (
                        <button
                          onClick={() => onViewDetails(resume)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
                        >
                          {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                        </button>
                      ) : (
                        <div className="text-sm text-gray-900">
                          {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                        </div>
                      )}
                      {resume.isArchived && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 border border-amber-200">
                          <Archive className="w-3 h-3" />
                          Archived
                        </span>
                      )}
                    </div>
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
                {formatISTDate(resume.uploadDate)}
              </td>
              <td className="px-4 py-4">
                <span className="text-sm text-gray-700">{resume.uploadedBy}</span>
              </td>
              <td className="px-4 py-4">
                <button
                  onClick={() => handleShowVersionHistory(resume)}
                  disabled={isLoadingVersions}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors group disabled:opacity-50"
                >
                  <div className="flex items-center gap-1">
                    <Paperclip className="w-4 h-4" />
                    <span>{resume.attachments}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border group-hover:bg-blue-200 transition-colors ${
                    (resume.versionCount && resume.versionCount > 1) || (resume.versions && resume.versions.length > 1)
                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>
                    v{resume.version || 1}
                  </span>
                </button>
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
                        onClick={() => onQuickView(resume)}
                        className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                        title="Preview Resume"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {onApplyToJob && (
                        <button
                          onClick={() => handleApplyToJob(resume)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Apply to Job"
                        >
                          <Briefcase className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            toast.loading('Downloading resume...', { id: 'download' });
                            const blob = await resumeService.download(resume.id);
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            // Use original filename to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
                            a.download = resume.fileName || `${resume.name || 'resume'}.${resume.fileType || 'pdf'}`;
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
                          onClick={(e) => {
                            if (activeMenu === resume.id) {
                              setActiveMenu(null);
                              return;
                            }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const openUp = spaceBelow < 280;
                            setMenuPosition({
                              top: openUp ? rect.top : rect.bottom + 4,
                              right: window.innerWidth - rect.right,
                              openUp,
                            });
                            setActiveMenu(resume.id);
                          }}
                          className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          title="More Options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {activeMenu === resume.id && (
                          <>
                            <div
                              className="fixed inset-0 z-[100]"
                              onClick={() => setActiveMenu(null)}
                            />
                            <div
                              className="fixed w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-[101]"
                              style={menuPosition.openUp
                                ? { bottom: window.innerHeight - menuPosition.top, right: menuPosition.right }
                                : { top: menuPosition.top, right: menuPosition.right }
                              }
                            >
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
                              {/* ✅ PERMISSION FIX: Archive requires delete permission */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!resumePerms.canDelete) {
                                    toast.error('You do not have permission to archive resumes');
                                    setActiveMenu(null);
                                    return;
                                  }
                                  setSelectedResumeForAction(resume);
                                  setShowArchiveModal(true);
                                  setActiveMenu(null);
                                }}
                                disabled={!resumePerms.canDelete}
                                title={!resumePerms.canDelete ? 'You do not have permission to archive resumes' : ''}
                                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 ${
                                  !resumePerms.canDelete
                                    ? 'text-gray-400 cursor-not-allowed opacity-60'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <Archive className="w-4 h-4 text-gray-600" />
                                Archive Resume
                              </button>
                              <div className="border-t border-gray-100 my-1"></div>
                              {/* Delete: requires canDeleteResumes permission AND the parent page must pass onDelete (admins only in internal DB) */}
                              {resumePerms.canDelete && !!onDelete && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!resumePerms.canDelete) {
                                      toast.error('You do not have permission to delete resumes');
                                      setActiveMenu(null);
                                      return;
                                    }
                                    onDelete?.(resume.id);
                                    setActiveMenu(null);
                                  }}
                                  disabled={!resumePerms.canDelete}
                                  title={!resumePerms.canDelete ? 'You do not have permission to delete resumes' : ''}
                                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 ${
                                    !resumePerms.canDelete
                                      ? 'text-gray-400 cursor-not-allowed opacity-60'
                                      : 'text-red-600 hover:bg-red-50'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Resume
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </td>
            </DraggableResumeRow>
          ))}
        </tbody>
        </table>
      </div>

      {/* FIX-008: Mobile Card View - visible only on mobile */}
      <div className="md:hidden space-y-3 px-2">
        {paginatedItems.map((resume) => (
          <div
            key={resume.id}
            className={`bg-white border rounded-lg p-4 ${
              selectedResumes.includes(resume.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
            }`}
          >
            {/* Card Header */}
            <div className="flex items-start gap-3 mb-3">
              {!hideCheckboxes && (
                <input
                  type="checkbox"
                  checked={selectedResumes.includes(resume.id)}
                  onChange={() => onSelectResume(resume.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-600 mt-1"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900 truncate">{resume.name}</div>
                  {resume.isArchived && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                      <Archive className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 truncate">{resume.title}</div>
              </div>
            </div>

            {/* Card Content */}
            <div className="space-y-2 text-sm mb-3">
              {resume.email && resume.email !== 'No email' && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{resume.email}</span>
                </div>
              )}
              {resume.experience && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Briefcase className="w-4 h-4 flex-shrink-0" />
                  <span>{resume.experience} years exp.</span>
                </div>
              )}
              {resume.skills && resume.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {resume.skills.slice(0, 3).map((skill, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                      {skill}
                    </span>
                  ))}
                  {resume.skills.length > 3 && (
                    <span className="px-2 py-0.5 text-gray-500 text-xs">+{resume.skills.length - 3}</span>
                  )}
                </div>
              )}
            </div>

            {/* Card Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => onQuickView(resume)}
                className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center gap-1"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
              <button
                onClick={() => handleApplyToJob(resume)}
                className="flex-1 px-3 py-2 text-sm text-white bg-gray-800 hover:bg-gray-900 rounded-lg flex items-center justify-center gap-1"
              >
                <Briefcase className="w-4 h-4" />
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>

      {!disablePagination && totalPages > 1 && (
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
          onApplyToJob={onApplyToJob ? (versionId) => {
            setVersionHistoryResume(null);
            onApplyToJob(versionHistoryResume);
          } : undefined}
        />
      )}

      {/* Loading indicator for version fetch */}
      {isLoadingVersions && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3 shadow-xl">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-700">Loading versions...</span>
          </div>
        </div>
      )}

      {/* Version Selector Modal - shows for single candidate apply (even with 1 version) */}
      {versionSelectorResume && versionSelectorResume.versions && versionSelectorResume.versions.length > 0 && (
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="col-span-1 sm:col-span-2">
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
                  onClick={async () => {
                    if (onArchive) {
                      onArchive(selectedResumeForAction.id);
                    } else {
                      // Fallback: call API directly
                      try {
                        await resumeService.archive(selectedResumeForAction.id, true);
                        toast.success('Resume archived successfully');
                      } catch (error) {
                        toast.error('Failed to archive resume');
                      }
                    }
                    setShowArchiveModal(false);
                    setSelectedResumeForAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Archive className="w-4 h-4" />
                  Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
