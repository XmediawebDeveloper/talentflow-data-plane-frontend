'use client'

import { Eye, Briefcase, Download, MoreHorizontal, Paperclip, Upload, Zap, FileSearch, Edit3, FolderOpen, Trash2, Copy, Share2, Mail, Star, Tag, Archive, Clock, GripVertical, FileText, Loader2, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDrag } from 'react-dnd';
import { Resume, Folder } from '@/lib/types/types';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import SkillsList from '@/components/ui/SkillsList';
import { EmptyState } from './ui/empty-state';
import Pagination from './Pagination';
import { usePagination } from '@/lib/hooks/usePagination';
import VersionHistoryModal from './VersionHistoryModal';
import ResumeVersionSelector from './ResumeVersionSelector';
import { toast } from 'sonner';
import { resumeService } from '@/lib/services/resumeService';

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
  onViewDetails?: (resume: Resume) => void;
  draggable?: boolean;
}

function DraggableResumeRow({ resume, selectedResumes, children, className, onViewDetails, draggable = true }: DraggableResumeRowProps) {
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
      ref={draggable ? (preview as unknown as React.Ref<HTMLTableRowElement>) : undefined}
      className={`${className} ${isDragging ? 'opacity-50' : ''} ${onViewDetails ? 'cursor-pointer' : ''}`}
      onClick={onViewDetails ? () => onViewDetails(resume) : undefined}
    >
      {/* Drag handle */}
      {draggable && (
        <td className="w-8 px-2 py-3">
          <div ref={drag as unknown as React.Ref<HTMLDivElement>} className="cursor-grab hover:bg-gray-100 rounded p-1 flex items-center justify-center">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>
        </td>
      )}
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
  canShare?: boolean;
  canTag?: boolean;
  canDownload?: boolean;
  draggable?: boolean;
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
  canShare = false,
  canTag = false,
  canDownload = true,
  draggable = true,
}: ResumeTableProps) {
  const router = useRouter();
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

  // Header checkbox state must reflect the VISIBLE rows only — selections in
  // other folders/pages should not flip the header to "indeterminate" or
  // change its onSelectAll behaviour.
  const allSelected = resumes.length > 0 && resumes.every(r => selectedResumes.includes(r.id));
  const someSelected = !allSelected && resumes.some(r => selectedResumes.includes(r.id));

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
        <table className="w-full min-w-[1200px] table-auto">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            {/* Drag handle column */}
            {draggable && (
              <th className="w-8 px-2 py-3 align-middle">
                <span className="sr-only">Drag</span>
              </th>
            )}
            {!hideCheckboxes && (
              <th className="w-12 px-4 py-3 align-middle">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={input => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                />
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Candidate Name
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Role
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Skills
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Experience
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Upload Date
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Uploaded By
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
              Files
            </th>
            <th className="px-4 py-3 text-left text-xs text-gray-900 uppercase tracking-wider whitespace-nowrap align-middle">
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
              draggable={draggable}
              className={`hover:bg-brand-blue/5 transition-colors ${
                selectedResumes.includes(resume.id) ? 'bg-brand-blue/10 ring-1 ring-inset ring-brand-blue/20' : ''
              }`}
              onViewDetails={onViewDetails}
            >
              {!hideCheckboxes && (
                <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedResumes.includes(resume.id)}
                    onChange={() => onSelectResume(resume.id)}
                    className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                  />
                </td>
              )}
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <div className="flex items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      {onViewDetails ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewDetails(resume); }}
                          className="text-sm font-medium text-brand-blue hover:text-brand-blue-2 hover:underline text-left transition-colors"
                        >
                          {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                        </button>
                      ) : (
                        <div className="text-sm text-gray-900">
                          {highlightQuery ? highlightText(resume.name, highlightQuery) : resume.name}
                        </div>
                      )}
                      {resume.isArchived && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20">
                          <Archive className="w-3 h-3" />
                          Archived
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {resume.title
                  ? (highlightQuery ? highlightText(resume.title, highlightQuery) : resume.title)
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {resume.email && resume.email !== 'No email'
                  ? (highlightQuery ? highlightText(resume.email, highlightQuery) : resume.email)
                  : <span className="text-gray-400">-</span>
                }
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {(() => {
                  // Show each number on its own line; cap at two when a resume
                  // carries multiple numbers in a single field.
                  const numbers = splitPhoneNumbers(resume.phone, 2);
                  if (numbers.length === 0) {
                    return <span className="text-gray-400">-</span>;
                  }
                  return (
                    <div className="flex flex-col gap-0.5">
                      {numbers.map((num, i) => (
                        <span key={i}>
                          {highlightQuery ? highlightText(num, highlightQuery) : num}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </td>
              <td className="px-4 py-3 align-middle min-w-[220px]">
                <div className="flex flex-wrap gap-1">
                  <SkillsList
                    skills={resume.skills}
                    highlight={(s) => (highlightQuery ? highlightText(s, highlightQuery) : s)}
                  />
                </div>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">{resume.experience}</td>
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs ring-1 ${
                    resume.source === 'Manual'
                      ? 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20'
                      : 'bg-brand-blue/10 text-brand-blue-2 ring-brand-blue/20'
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
              <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700">
                {formatISTDate(resume.uploadDate)}
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <span className="text-sm text-gray-700">{resume.uploadedBy}</span>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleShowVersionHistory(resume)}
                  disabled={isLoadingVersions}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-brand-blue transition-colors group disabled:opacity-50"
                >
                  <div className="flex items-center gap-1">
                    <Paperclip className="w-4 h-4" />
                    <span>{resume.attachments}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1 group-hover:bg-brand-blue/15 transition-colors ${
                    (resume.versionCount && resume.versionCount > 1) || (resume.versions && resume.versions.length > 1)
                      ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                      : 'bg-slate-100 text-gray-600 ring-gray-200'
                  }`}>
                    v{resume.version || 1}
                  </span>
                </button>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  {selectionMode ? (
                    <button
                      onClick={() => {
                        onSelectResume(resume.id);
                        if (onApplySelected) {
                          onApplySelected();
                        }
                      }}
                      className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm flex items-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <Briefcase className="w-4 h-4" />
                      Apply to Job
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onQuickView(resume)}
                        className="p-1.5 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded transition-colors"
                        aria-label="Preview Resume" title="Preview Resume"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {onApplyToJob && (
                        <button
                          onClick={() => handleApplyToJob(resume)}
                          className="p-1.5 text-brand-blue hover:bg-brand-blue/10 rounded transition-colors"
                          aria-label="Apply to Job" title="Apply to Job"
                        >
                          <Briefcase className="w-4 h-4" />
                        </button>
                      )}
                      {canDownload && (
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
                          className="p-1.5 text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue rounded transition-colors"
                          title="Download Resume"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
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
                          className="p-1.5 text-gray-700 hover:bg-slate-100 hover:text-gray-900 rounded transition-colors"
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
                              className="fixed w-56 bg-white rounded-lg shadow-xl shadow-brand-blue/10 border border-gray-100 ring-1 ring-black/[0.02] py-2 z-[101]"
                              style={menuPosition.openUp
                                ? { bottom: window.innerHeight - menuPosition.top, right: menuPosition.right }
                                : { top: menuPosition.top, right: menuPosition.right }
                              }
                            >
                              {canShare && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedResumeForAction(resume);
                                    setShowShareModal(true);
                                    setActiveMenu(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-3 transition-colors"
                                >
                                  <Share2 className="w-4 h-4 text-green-600" />
                                  Share Resume
                                </button>
                              )}
                              {canTag && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedResumeForAction(resume);
                                    setShowAddTagsModal(true);
                                    setActiveMenu(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue flex items-center gap-3 transition-colors"
                                >
                                  <Tag className="w-4 h-4 text-cyan-600" />
                                  Add Tags
                                </button>
                              )}
                              {!!onArchive && (canShare || canTag) && <div className="border-t border-gray-100 my-1"></div>}
                              {!!onArchive && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedResumeForAction(resume);
                                    setShowArchiveModal(true);
                                    setActiveMenu(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 text-gray-700 hover:bg-brand-orange/5 hover:text-brand-orange-deep transition-colors"
                                >
                                  <Archive className="w-4 h-4 text-brand-orange" />
                                  Archive Resume
                                </button>
                              )}
                              {!!onDelete && <div className="border-t border-gray-100 my-1"></div>}
                              {onDelete && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete?.(resume.id);
                                    setActiveMenu(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm flex items-center gap-3 text-red-600 hover:bg-red-50"
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
            className={`bg-white border rounded-xl p-4 ring-1 transition-all ${
              selectedResumes.includes(resume.id) ? 'border-brand-blue/40 bg-brand-blue/5 ring-brand-blue/20 shadow-sm shadow-brand-blue/10' : 'border-gray-100 ring-black/[0.02] shadow-sm shadow-brand-blue/5'
            }`}
          >
            {/* Card Header */}
            <div className="flex items-start gap-3 mb-3">
              {!hideCheckboxes && (
                <input
                  type="checkbox"
                  checked={selectedResumes.includes(resume.id)}
                  onChange={() => onSelectResume(resume.id)}
                  className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 mt-1"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900 truncate">{resume.name}</div>
                  {resume.isArchived && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20 flex-shrink-0">
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
                  <SkillsList
                    skills={resume.skills}
                    chipClassName="px-2 py-0.5 bg-brand-blue/5 text-brand-blue rounded text-xs ring-1 ring-brand-blue/20"
                    moreClassName="px-2 py-0.5 text-brand-blue text-xs font-medium rounded hover:bg-brand-blue/10 transition-colors cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Card Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => onQuickView(resume)}
                className="flex-1 px-3 py-2 text-sm text-gray-700 bg-slate-100 hover:bg-brand-blue/5 hover:text-brand-blue rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
              {onApplyToJob && (
                <button
                  onClick={() => handleApplyToJob(resume)}
                  className="flex-1 px-3 py-2 text-sm text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  <Briefcase className="w-4 h-4" />
                  Apply
                </button>
              )}
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
          <div className="bg-white rounded-xl p-6 flex items-center gap-3 shadow-xl shadow-brand-blue/20 ring-1 ring-brand-blue/10">
            <Loader2 className="w-5 h-5 text-brand-blue animate-spin" />
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
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Edit3 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Edit Candidate Details</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Update information for {selectedResumeForAction.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.name}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Job Title</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.title}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    defaultValue={selectedResumeForAction.email}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    defaultValue={selectedResumeForAction.phone}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Skills (comma separated)</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.skills.join(', ')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Experience</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.experience}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Location</label>
                  <input
                    type="text"
                    defaultValue={selectedResumeForAction.location}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  toast.success('Candidate details updated successfully');
                  setShowEditModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Resume Modal */}
      {showShareModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-cyan rounded-xl flex items-center justify-center shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10">
                    <Share2 className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Share Resume</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Share {selectedResumeForAction.name}'s resume with team members
                </p>
              </div>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Email addresses (comma separated)</label>
                <input
                  type="text"
                  placeholder="john@company.com, jane@company.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Message (optional)</label>
                <textarea
                  rows={3}
                  placeholder="Add a message..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  toast.success('Resume shared successfully');
                  setShowShareModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Mail className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tags Modal */}
      {showAddTagsModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-cyan rounded-xl flex items-center justify-center shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10">
                    <Tag className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Add Tags</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Add tags to {selectedResumeForAction.name}'s resume
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddTagsModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-sm text-gray-700 mb-2">Tags</label>
                <input
                  type="text"
                  placeholder="Enter tags (comma separated)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
                <p className="text-xs text-gray-500 mt-1">Example: high-priority, senior-level, remote</p>
              </div>
              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-2">Suggested Tags</p>
                <div className="flex flex-wrap gap-2">
                  {['High Priority', 'Remote', 'Senior Level', 'Immediate Start', 'Contract'].map((tag) => (
                    <button
                      key={tag}
                      className="px-3 py-1 bg-brand-blue/5 text-brand-blue rounded-full text-xs hover:bg-brand-blue/10 transition-colors ring-1 ring-brand-blue/20"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowAddTagsModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  toast.success('Tags added successfully');
                  setShowAddTagsModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Tag className="w-4 h-4" />
                Add Tags
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Resume Modal */}
      {showArchiveModal && selectedResumeForAction && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 shrink-0 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-brand-orange rounded-xl flex items-center justify-center shadow-sm shadow-brand-orange/25 ring-1 ring-white/10">
                    <Archive className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-gray-900">Archive Resume</h2>
                </div>
                <p className="text-sm text-gray-600">
                  Archive {selectedResumeForAction.name}'s resume?
                </p>
              </div>
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex-shrink-0 ml-2"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="bg-brand-orange/5 border border-brand-orange/20 rounded-lg p-4">
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
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-200 shrink-0">
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setSelectedResumeForAction(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
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
                className="flex-1 px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-deep text-white rounded-lg transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-orange/25 ring-1 ring-white/10"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
