'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Copy, GitBranch, Upload, Loader2, Search, History, X, CheckCircle, AlertCircle, Clock, Calendar, ChevronRight, ArrowLeft, FileText, Maximize2, LayoutGrid, List, Folder, FolderOpen, MapPin, Briefcase, Mail, Phone, Download, Eye, MoreHorizontal, Trash2, Archive, ClipboardCheck, UserPlus, Sparkles, GripVertical, RefreshCw, Ban } from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import dynamic from 'next/dynamic';
import ResumeTable from '@/components/ResumeTable';
import SkillsList from '@/components/ui/SkillsList';
import { getDisplaySkills } from '@/lib/utils/resumeSkills';
import Pagination from '@/components/Pagination';
import StatsCards from '@/components/StatsCards';
import SearchFilterBarCompact from '@/components/SearchFilterBarCompact';
import FolderTree from '@/components/FolderTree';
import BulkActionsBar from '@/components/BulkActionsBar';
import UploadModal from '@/components/UploadModal';
import type { DuplicateFile, ExistingResume } from '@/components/DuplicateResumeModal';

// Dynamic import to avoid SSR issues with docx-preview dependency
const DuplicateResumeModal = dynamic(() => import('@/components/DuplicateResumeModal'), {
  ssr: false,
  loading: () => <div>Loading...</div>
});
import ResumeQuickViewModal from '@/components/ResumeQuickViewModal';
import UploadHistoryDetailModal, { UploadHistoryItem } from '@/components/UploadHistoryDetailModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import AITalentMatchSelectJobModal from '@/components/AITalentMatchSelectJobModal';
import ResumeVersionSelector from '@/components/ResumeVersionSelector';
import BulkVersionResolutionModal from '@/components/BulkVersionResolutionModal';
import type { VersionedBatchItem } from '@/components/BulkVersionResolutionModal';
import ShareAssessmentModal from '@/components/ShareAssessmentModal';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Resume, Folder as FolderType, Job } from '@/lib/types/types';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume, Folder as ApiFolder, FolderDeletionInfo } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { scoringService } from '@/lib/services/scoringService';
import { assessmentService } from '@/lib/services';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import FeatureGate from '@/components/shared/FeatureGate';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';

const formatDateIST = formatISTDate;
const formatDateTimeIST = formatIST;

// Drag item type for resumes (must match ResumeTable and FolderTree)
const RESUME_DRAG_TYPE = 'RESUME';

interface DragItem {
  id: string;
  ids: string[];
}

// Droppable folder card for card view
interface DroppableFolderCardProps {
  folder: FolderType;
  resumeCount: number;
  hasSubfolders: boolean;
  isArchived: boolean;
  isRoot: boolean;
  onNavigate: (folderId: string) => void;
  onMoveToFolder?: (resumeIds: string[], folderId: string) => void;
}

function DroppableFolderCard({
  folder,
  resumeCount,
  hasSubfolders,
  isArchived,
  isRoot,
  onNavigate,
  onMoveToFolder,
}: DroppableFolderCardProps) {
  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: RESUME_DRAG_TYPE,
    drop: (item) => {
      const resumeIds = item.ids && item.ids.length > 0 ? item.ids : [item.id];
      if (onMoveToFolder) {
        onMoveToFolder(resumeIds, folder.id);
      }
    },
    // Cannot drop on Root folder
    canDrop: () => !(folder.name.toLowerCase() === 'root' && !folder.parentId),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const isDropTarget = isOver && canDrop;

  return (
    <div
      ref={drop as unknown as React.Ref<HTMLDivElement>}
      className={`bg-white border rounded-xl shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] overflow-hidden cursor-pointer hover:shadow-md hover:shadow-brand-blue/10 transition-all ${
        isDropTarget
          ? 'border-brand-blue border-2 border-dashed bg-brand-blue/5'
          : isArchived
            ? 'border-brand-orange/20 hover:border-brand-orange/40'
            : isRoot
              ? 'border-green-200 hover:border-green-400'
              : 'border-gray-100 hover:border-brand-blue/30 hover:-translate-y-0.5 duration-150'
      }`}
      onClick={() => onNavigate(folder.id)}
    >
      <div className="flex items-center gap-3 p-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ring-1 ${
          isArchived
            ? 'bg-brand-orange/10 ring-brand-orange/15'
            : isRoot
              ? 'bg-green-100 ring-green-200/60'
              : 'bg-brand-blue/10 ring-brand-blue/15'
        }`}>
          {isArchived ? (
            <Archive className="w-4 h-4 text-brand-orange-deep" />
          ) : (
            <Folder className={`w-4 h-4 ${isRoot ? 'text-green-600' : 'text-brand-blue'}`} />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-gray-900">
            {isRoot ? 'Root (Default)' : folder.name}
          </h3>
          <p className="text-xs text-gray-500">
            {hasSubfolders && `${folder.children!.length} subfolder${folder.children!.length !== 1 ? 's' : ''} • `}
            {resumeCount} resume{resumeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

// Draggable resume row for card view
interface DraggableCardResumeRowProps {
  resume: Resume;
  selectedResumes: string[];
  isLast: boolean;
  onSelect: (id: string) => void;
  onQuickView: (resume: Resume) => void;
  onDelete: (id: string) => void;
  onViewDetails: (resume: Resume) => void;
}

function DraggableCardResumeRow({
  resume,
  selectedResumes,
  isLast,
  onSelect,
  onQuickView,
  onDelete,
  onViewDetails,
}: DraggableCardResumeRowProps) {
  const [{ isDragging }, drag, preview] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: RESUME_DRAG_TYPE,
    item: () => ({
      id: resume.id,
      ids: selectedResumes.includes(resume.id) ? selectedResumes : [resume.id],
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={preview as unknown as React.Ref<HTMLDivElement>}
      className={`grid grid-cols-[32px_auto_1fr_1fr_1fr_1fr_1fr_80px_100px_80px_60px_100px] gap-2 px-3 sm:px-4 py-3 hover:bg-brand-blue/[0.03] cursor-pointer group transition-colors items-center min-w-[1200px] ${
        !isLast ? 'border-b border-gray-100' : ''
      } ${selectedResumes.includes(resume.id) ? 'bg-brand-blue/5' : ''} ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => onViewDetails(resume)}
    >
      {/* Drag Handle */}
      <div
        ref={drag as unknown as React.Ref<HTMLDivElement>}
        className="cursor-grab hover:bg-gray-100 rounded p-1 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      {/* Checkbox */}
      <div className="flex items-center">
        <input
          type="checkbox"
          checked={selectedResumes.includes(resume.id)}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(resume.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40"
        />
      </div>
      {/* Candidate Name */}
      <div className="flex items-center min-w-0">
        <span className="font-medium text-brand-blue hover:text-brand-blue-2 hover:underline text-sm truncate cursor-pointer">{resume.name}</span>
      </div>
      {/* Email */}
      <div className="text-sm text-gray-600 truncate">{resume.email || '-'}</div>
      {/* Phone */}
      <div className="text-sm text-gray-600 truncate">{resume.phone || '-'}</div>
      {/* Skills — same set the Resume Details "Skills" section shows */}
      <div className="flex flex-wrap gap-1.5 max-w-[200px]">
        {getDisplaySkills(resume).length > 0 ? (
          <SkillsList
            skills={getDisplaySkills(resume)}
            chipClassName="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-brand-blue/10 text-brand-blue border border-brand-blue/20 truncate max-w-[90px]"
            moreClassName="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200 transition-colors"
          />
        ) : (
          <span className="text-xs text-gray-400 italic">No skills</span>
        )}
      </div>
      {/* Experience */}
      <div className="text-sm text-gray-600">{resume.experience || '-'}</div>
      {/* Source */}
      <div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          resume.source === 'TalentFlow'
            ? 'bg-brand-blue-2/10 text-brand-blue-2 border border-brand-blue-2/20'
            : 'bg-gray-100 text-gray-700'
        }`}>
          {resume.source || 'Manual'}
        </span>
      </div>
      {/* Upload Date */}
      <div className="text-sm text-gray-600">
        {formatDateIST(resume.uploadDate)}
      </div>
      {/* Uploaded By */}
      <div className="text-sm text-gray-600 truncate">{resume.uploadedBy || '-'}</div>
      {/* Files */}
      <div className="flex items-center gap-1 text-sm text-gray-600">
        <FileText className="w-4 h-4" />
        <span>{resume.attachments}</span>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onQuickView(resume);
          }}
          className="p-1.5 text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 rounded"
          aria-label="Quick View" title="Quick View"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const blob = await resumeService.download(resume.id);
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = resume.fileName || `${resume.name}.${resume.fileType || 'pdf'}`;
              a.click();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              toast.error('Failed to download');
            }
          }}
          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(resume.id);
          }}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
          aria-label="Delete" title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function MyResumesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isTenantAdmin, hasPermission, hasPermissionCode, isLoading: authLoading } = useAuth();
  const canViewMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:read');
  const canUploadMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  const canUpdateMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update');
  const canDeleteMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:delete');
  const canArchiveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:archive');
  const canShareMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:share');
  const canMoveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update') || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');
  const { hasPlanFeature } = usePlanFeatures();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(''); // For highlighting
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isPaginating, setIsPaginating] = useState(false);
  const [folderTreeWidth, setFolderTreeWidth] = useState(240);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [cardViewFolder, setCardViewFolder] = useState<string | null>(null); // Selected folder in card view
  const [breadcrumbPath, setBreadcrumbPath] = useState<{ id: string; name: string }[]>([]); // Breadcrumb navigation path

  // Modal states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [quickViewResume, setQuickViewResume] = useState<Resume | null>(null);

  // Duplicate detection state
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFile[]>([]);
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState<string | undefined>();
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Upload history modal state
  const [isUploadHistoryModalOpen, setIsUploadHistoryModalOpen] = useState(false);
  const [isUploadHistoryMinimized, setIsUploadHistoryMinimized] = useState(false);
  const [uploadHistoryTab, setUploadHistoryTab] = useState<'current' | 'completed'>('current');
  const [allResumesTotal, setAllResumesTotal] = useState(0);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<UploadHistoryItem | null>(null);
  const [uploadHistoryFilter, setUploadHistoryFilter] = useState<'completed' | 'duplicated' | 'versioned' | 'error' | 'pending' | 'cancelled' | null>(null);
  const [retryingBatches, setRetryingBatches] = useState<Set<string>>(new Set());
  const [cancellingBatches, setCancellingBatches] = useState<Set<string>>(new Set());
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [cancellingItems, setCancellingItems] = useState<Set<string>>(new Set());
  const [cancelBatchConfirm, setCancelBatchConfirm] = useState<{ isOpen: boolean; batchId: string; pendingCount: number }>({ isOpen: false, batchId: '', pendingCount: 0 });
  const [cancelItemConfirm, setCancelItemConfirm] = useState<{ isOpen: boolean; batchId: string; itemId: string; fileName: string }>({ isOpen: false, batchId: '', itemId: '', fileName: '' });

  // Bulk version resolution state
  const [selectedVersionedItems, setSelectedVersionedItems] = useState<Map<string, VersionedBatchItem>>(new Map());
  const [isBulkResolveModalOpen, setIsBulkResolveModalOpen] = useState(false);

  // Apply to Job modal state
  const [isApplyToJobModalOpen, setIsApplyToJobModalOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [uploadedResumeToScore, setUploadedResumeToScore] = useState<{ id: string; candidateName: string } | null>(null);
  const [singleResumeToApply, setSingleResumeToApply] = useState<Resume | null>(null);

  // Duplicate scoring warning state
  const [duplicateScoringWarning, setDuplicateScoringWarning] = useState<{
    isOpen: boolean;
    jobId: string;
    jobTitle: string;
    resumeIds: string[];
    existingScores: Array<{
      resume_id: string;
      candidate_name: string;
      overall_score: number;
      match_status: string;
      scored_at: string | null;
    }>;
    newCount: number;
  }>({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 });

  // Version selector state (for single candidate apply)
  const [versionSelectorResume, setVersionSelectorResume] = useState<Resume | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // ZIP download confirmation modal state
  const [isZipDownloadModalOpen, setIsZipDownloadModalOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Assessment modal state
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [selectedJobForAssessment, setSelectedJobForAssessment] = useState<string | null>(null);
  const [activeAssessments, setActiveAssessments] = useState<any[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [selectedAssessments, setSelectedAssessments] = useState<any[]>([]); // Changed to array for multi-select

  // Share Assessment Modal state
  const [isShareAssessmentModalOpen, setIsShareAssessmentModalOpen] = useState(false);
  const [prefilledCandidates, setPrefilledCandidates] = useState<any[]>([]);
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');

  // AI Talent Match modal state
  const [isAITalentMatchModalOpen, setIsAITalentMatchModalOpen] = useState(false);

  // Delete resume confirmation state
  const [deleteResumeConfirm, setDeleteResumeConfirm] = useState<{
    isOpen: boolean;
    ids: string[];
    names: string[];
  }>({ isOpen: false, ids: [], names: [] });

  // Delete folder confirmation state
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<{
    isOpen: boolean;
    folderId: string | null;
    folderName: string;
    resumeCount: number;
    parentFolderId: string | null;
    parentFolderName: string;
    contentAction: 'move-parent' | 'move-root' | 'delete-all' | null;
    hasSubfolders: boolean;
    subfolderCount: number;
    subfolderDetails: { id: string; name: string; resume_count: number }[];
    totalResumeCount: number;
    subfolderResumeCount: number;
    loading: boolean;
  }>({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });

  // Refs to prevent infinite loop and duplicate API calls
  const hasMountedRef = useRef(false);
  const lastFetchParamsRef = useRef<string>('');
  const isFetchingRef = useRef(false);

  // Persist + restore this list's scroll position and view state so returning
  // from a resume detail page (router.push -> remount) lands the user exactly
  // where they left off. Re-detect the scroll container when the list<->card
  // view toggles, since that changes the page height drastically.
  const rootRef = useScrollRestoration<HTMLElement>('my-resumes', !loading, [viewMode]);
  useListStatePersistence(
    'my-resumes',
    {
      searchQuery,
      appliedSearchQuery,
      selectedFolder,
      filters,
      sortBy,
      currentPage,
      itemsPerPage,
      viewMode,
      cardViewFolder,
      breadcrumbPath,
    },
    (s) => {
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.appliedSearchQuery === 'string') setAppliedSearchQuery(s.appliedSearchQuery);
      if (typeof s.selectedFolder === 'string') setSelectedFolder(s.selectedFolder);
      if (s.filters && typeof s.filters === 'object' && !Array.isArray(s.filters)) {
        setFilters(s.filters as typeof filters);
      }
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
      if (s.viewMode === 'list' || s.viewMode === 'card') setViewMode(s.viewMode);
      if (s.cardViewFolder === null || typeof s.cardViewFolder === 'string') {
        setCardViewFolder(s.cardViewFolder as string | null);
      }
      if (Array.isArray(s.breadcrumbPath)) {
        setBreadcrumbPath(s.breadcrumbPath as { id: string; name: string }[]);
      }
    },
  );

  useEffect(() => {
    fetchData();
    fetchUploadHistory();
    // Self-heal admin-API resume usage on mount (fire-and-forget — capped at ±200).
    resumeService.reconcileUsage();
    hasMountedRef.current = true; // Mark as mounted

    // Cleanup: Stop all polling intervals when component unmounts
    return () => {
      pollingIntervalsRef.current.forEach(interval => {
        clearInterval(interval);
      });
      pollingIntervalsRef.current.clear();
      console.log('[MyResumes] Cleaned up all polling intervals on unmount');
    };
  }, []);

  // Refetch when filters or folder selection changes
  useEffect(() => {
    // Skip the very first render (fetchData is already called in mount effect above)
    if (!hasMountedRef.current) {
      console.log('[MyResumes] useEffect - Skipping (not mounted yet)');
      return;
    }

    // Create signature of params to detect ACTUAL changes (not just reference changes)
    const currentParams = JSON.stringify({ appliedSearchQuery, filters, selectedFolder, currentPage, itemsPerPage, sortBy });

    // Skip if params haven't actually changed (prevents loop from object reference changes)
    if (currentParams === lastFetchParamsRef.current) {
      console.log('[MyResumes] useEffect - Skipping (params unchanged)', currentParams);
      return;
    }

    console.log('[MyResumes] useEffect - Will fetch in 300ms', {
      appliedSearchQuery,
      filtersKeys: Object.keys(filters),
      selectedFolder,
      currentPage,
      itemsPerPage,
      sortBy,
    });

    // Debounce: Wait 300ms before fetching
    const debounceTimer = setTimeout(() => {
      console.log('[MyResumes] useEffect - Fetching data now...');
      lastFetchParamsRef.current = currentParams;

      // Use lighter loading for page/sort changes when data is already on screen
      const isPageChange = resumes.length > 0;
      fetchData(appliedSearchQuery, filters, selectedFolder, isPageChange ? true : false).finally(() => {
        setIsPaginating(false);
        console.log('[MyResumes] useEffect - Fetch complete');
      });
    }, 300);

    return () => {
      console.log('[MyResumes] useEffect - Cleanup (timer cleared)');
      clearTimeout(debounceTimer);
    };
  }, [appliedSearchQuery, filters, selectedFolder, currentPage, itemsPerPage, sortBy]);

  // Handle deep link from notifications
  useEffect(() => {
    const resumeIdFromUrl = searchParams.get('resume_id');
    const batchIdFromUrl = searchParams.get('batch_id');

    if (resumeIdFromUrl) {
      // Open specific resume in quick view
      const openResume = async () => {
        try {
          const resume = await resumeService.getById(resumeIdFromUrl);
          if (resume) {
            setQuickViewResume(resume as unknown as Resume);
          }
          // Clear the query parameter
          router.replace('/recruitment/my-resumes', { scroll: false });
        } catch (error) {
          console.error('Error fetching resume from URL:', error);
          toast.error('Could not find the requested resume');
        }
      };
      openResume();
    }

    if (batchIdFromUrl) {
      // Show upload history filtered by batch
      openUploadHistoryModal();
      // Clear the query parameter
      router.replace('/recruitment/my-resumes', { scroll: false });
    }
  }, [searchParams, router]);

  // Single mapper for every batch payload the API returns. The cancel/retry
  // handlers used to spread the raw snake_case batch instead (`statuses: b.items`),
  // which silently blanked out file names, candidate names and error messages
  // until the next full refresh.
  const mapBatchRecord = (batch: any) => ({
    id: batch.id,
    date: batch.date ?? batch.created_at,
    completedAt: batch.completed_at,
    fileName: batch.batch_name,
    totalFiles: batch.total_files,
    completed: batch.completed ?? 0,
    pending: batch.pending ?? 0,
    duplicated: batch.duplicates ?? 0,
    versioned: batch.versions ?? 0,
    errors: batch.errors ?? 0,
    cancelled: batch.cancelled ?? 0,
    status: batch.status,
    source: 'my-resumes' as const,
    statuses: batch.items?.map((item: any) => ({
      id: item.id,
      fileName: item.file_name,
      status: item.status === 'duplicated' ? 'duplicate' : item.status,
      errorMessage: item.error_message,
      candidateName: item.candidate_name,
      resumeId: item.resume_id,
    })) || [],
  });

  // Refresh from the server and replace only the my-resumes records.
  const refreshMyResumesBatches = async () => {
    const response = await resumeService.listUploadBatches(50);
    if (!response?.batches) return;
    const updated = response.batches.map(mapBatchRecord);
    setUploadHistory(prev => [...prev.filter(r => r.source !== 'my-resumes'), ...updated]);
  };

  const fetchUploadHistory = async () => {
    try {
      const response = await resumeService.listUploadBatches(50);
      if (response?.batches) {
        setUploadHistory(response.batches.map(mapBatchRecord));
      }
    } catch (error) {
      console.error('Failed to fetch upload history:', error);
    }
  };

  const openUploadHistoryModal = () => {
    const hasActive = uploadHistory.some(
      r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)
    );
    setUploadHistoryTab(hasActive ? 'current' : 'completed');
    setUploadHistoryFilter(null);
    setIsUploadHistoryModalOpen(true);
    setIsUploadHistoryMinimized(false);
  };

  const handleCloseUploadHistory = async () => {
    // Note: completed batches are intentionally retained so the Completed
    // tab stays useful as a history view. If the user wants to clear it
    // they can call deleteCompletedBatches() explicitly elsewhere.
    setIsUploadHistoryModalOpen(false);
    setIsUploadHistoryMinimized(false);
    setUploadHistoryFilter(null);
  };

  const handleRetryBatch = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingBatches(prev => new Set(prev).add(batchId));
    try {
      const res = await resumeService.retryBatchItems(batchId);
      const deducted = res?.units_deducted ?? 0;
      toast.success(
        deducted > 0
          ? `Retrying items. ${deducted} unit(s) deducted for quota-exceeded files.`
          : 'Retrying stuck items. No additional units deducted.'
      );
      // Refresh upload history so items show as "pending" and start polling for progress
      await refreshMyResumesBatches();
      startBatchPolling(batchId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to retry batch items');
    } finally {
      setRetryingBatches(prev => { const s = new Set(prev); s.delete(batchId); return s; });
    }
  };

  // Cancelling a batch is destructive and irreversible for files already in
  // flight, so it always goes through a confirmation step. It used to fire on a
  // single click — and a focused button also fires on Space/Enter, which is an
  // easy way to lose most of a 100-file upload without realising it.
  const handleCancelBatch = (batchId: string, pendingCount: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelBatchConfirm({ isOpen: true, batchId, pendingCount });
  };

  const confirmCancelBatch = async () => {
    const { batchId, pendingCount } = cancelBatchConfirm;
    setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 });
    if (!batchId) return;
    setCancellingBatches(prev => new Set(prev).add(batchId));
    try {
      const res = await resumeService.cancelBatch(batchId);
      const refunded = res?.refunded_units ?? pendingCount;
      toast.success(`Cancelled ${res?.cancelled ?? pendingCount} file(s). ${refunded} unit(s) refunded.`);
      // Refresh upload history to reflect the cancellation
      await refreshMyResumesBatches();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel batch');
    } finally {
      setCancellingBatches(prev => { const s = new Set(prev); s.delete(batchId); return s; });
    }
  };

  const handleRetryItem = async (batchId: string, itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingItems(prev => new Set(prev).add(itemId));
    try {
      const res = await resumeService.retryItem(batchId, itemId);
      const deducted = res?.units_deducted ?? 0;
      toast.success(
        deducted > 0
          ? 'Retrying file. 1 Resume Storage unit deducted.'
          : 'Retrying file. No additional units deducted.'
      );
      // Refresh upload history so the item shows as "pending/queued" and start polling for progress
      await refreshMyResumesBatches();
      startBatchPolling(batchId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to retry file');
    } finally {
      setRetryingItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  const handleCancelItem = (batchId: string, itemId: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelItemConfirm({ isOpen: true, batchId, itemId, fileName });
  };

  const confirmCancelItem = async () => {
    const { batchId, itemId, fileName } = cancelItemConfirm;
    setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' });
    if (!batchId || !itemId) return;
    setCancellingItems(prev => new Set(prev).add(itemId));
    try {
      const res = await resumeService.cancelItem(batchId, itemId);
      toast.success(
        res?.refunded_units
          ? `'${fileName}' cancelled. 1 unit refunded.`
          : `'${fileName}' cancelled.`
      );
      await refreshMyResumesBatches();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to cancel file');
    } finally {
      setCancellingItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  // Ref to store active polling intervals for cleanup
  const pollingIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Start (or restart) polling for a batch — used after retry so items progress in real-time
  const startBatchPolling = (batchId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const status = await resumeService.getBatchStatus(batchId);
        setUploadHistory(prev => prev.map(record =>
          record.id === batchId
            ? {
                ...record,
                completed: status.completed,
                pending: status.pending,
                duplicated: status.duplicates,
                versioned: status.versions,
                errors: status.errors,
                cancelled: status.cancelled ?? 0,
                completedAt: status.completed_at,
                status: status.status,
                statuses: status.items?.map((item: any) => ({
                  id: item.id,
                  fileName: item.file_name,
                  status: item.status === 'duplicated' ? 'duplicate' : item.status,
                  errorMessage: item.error_message,
                  candidateName: item.candidate_name,
                  resumeId: item.resume_id,
                })) || [],
              }
            : record
        ));
        const hasActiveItems = status.items?.some((item: any) =>
          item.status === 'pending' || item.status === 'processing'
        ) ?? false;
        if (status.status === 'completed' || !hasActiveItems) {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(pollInterval);
          fetchUploadHistory();
          fetchData();
        }
      } catch {
        clearInterval(pollInterval);
        pollingIntervalsRef.current.delete(pollInterval);
      }
    }, 3000);
    pollingIntervalsRef.current.add(pollInterval);
    // Safety: stop polling after 10 minutes regardless
    setTimeout(() => {
      clearInterval(pollInterval);
      pollingIntervalsRef.current.delete(pollInterval);
    }, 600000);
  };

  const fetchData = async (searchTerm?: string, currentFilters?: any, folderId?: string, silent?: boolean) => {
    console.log('[FETCH] fetchData called', {
      searchTerm,
      filtersKeys: currentFilters ? Object.keys(currentFilters) : 'none',
      folderId,
      isFetching: isFetchingRef.current,
      silent,
    });

    // Prevent concurrent fetches - stops flickering from rapid calls
    if (isFetchingRef.current) {
      console.log('[FETCH] Already fetching, skipping duplicate call');
      return;
    }

    isFetchingRef.current = true;
    if (!silent) setLoading(true);
    console.log('[FETCH] Starting fetch...');
    try {
      // Build search params for backend API
      const sortByMap: Record<string, string> = {
        'date': 'date-desc',
        'latest': 'date-desc',
        'oldest': 'date-asc',
        'name-asc': 'name-asc',
        'name-desc': 'name-desc',
      };

      const searchParams: any = {
        source: 'my-resumes',
        page: currentPage,
        page_size: itemsPerPage,
        sort_by: sortByMap[sortBy] || 'date-desc',
      };

      // Add folder filter if not viewing all.
      if (folderId && folderId !== 'all') {
        searchParams.folder_id = folderId;
      }

      // Add search query
      if (searchTerm && searchTerm.trim()) {
        searchParams.search = searchTerm.trim();
      }

      // Add filter parameters
      if (currentFilters) {
        if (currentFilters.skills && currentFilters.skills.length > 0) {
          searchParams.skills = currentFilters.skills.join(',');
        }
        if (currentFilters.experienceRange) {
          if (currentFilters.experienceRange.min !== undefined) {
            searchParams.experience_min = currentFilters.experienceRange.min;
          }
          if (currentFilters.experienceRange.max !== undefined) {
            searchParams.experience_max = currentFilters.experienceRange.max;
          }
        }
        if (currentFilters.location) {
          searchParams.location = currentFilters.location;
        }
        if (currentFilters.education) {
          searchParams.education = currentFilters.education;
        }
        if (currentFilters.currentCompany) {
          searchParams.current_company = currentFilters.currentCompany;
        }
        if (currentFilters.noticePeriod) {
          searchParams.notice_period = currentFilters.noticePeriod;
        }
        if (currentFilters.uploadDateFrom) {
          searchParams.upload_date_from = currentFilters.uploadDateFrom;
        }
        if (currentFilters.uploadDateTo) {
          searchParams.upload_date_to = currentFilters.uploadDateTo;
        }
        if (currentFilters.sourceType) {
          searchParams.source_type = currentFilters.sourceType;
        }
      }

      const [resumeResponse, folderResponse] = await Promise.all([
        resumeService.list(searchParams),
        folderService.list().catch(() => []),
      ]);

      // Convert API Resume to component Resume type
      const convertedResumes: Resume[] = resumeResponse.items.map((r: ApiResume) => ({
        id: r.id,
        name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
        email: r.email || 'No email',
        phone: r.phone || 'No phone',
        title: r.current_title || 'N/A',
        experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
        education: r.education?.[0]?.degree || 'N/A',
        location: r.location || 'N/A',
        skills: r.skills || [],
        source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
        folderId: r.folder_id || '',
        uploadDate: r.created_at,
        attachments: r.version_count || r.version || 1,
        uploadedBy: r.uploaded_by_name || 'Unknown',
        currentCompany: r.current_company,
        previousCompany: r.previous_company,
        noticePeriod: r.notice_period,
        lastUpdated: r.updated_at,
        // Extended fields for detailed view
        professionalSummary: r.professional_summary,
        technicalSkills: r.technical_skills,
        softSkills: r.soft_skills,
        educationDetails: r.education?.map((edu: any) => ({
          degree: edu.degree || '',
          school: edu.school || edu.institution || '',
          location: edu.location || '',
          year: edu.year || edu.graduation_year || '',
          gpa: edu.gpa || '',
          honors: edu.honors || '',
        })),
        experienceDetails: r.experience?.map((exp: any) => ({
          title: exp.title || exp.position || '',
          company: exp.company || '',
          location: exp.location || '',
          startDate: exp.start_date || '',
          endDate: exp.end_date || 'Present',
          duration: exp.duration || '',
          description: exp.description || '',
          achievements: exp.achievements || exp.responsibilities || [],
        })),
        certifications: r.certifications?.map((cert: any) => ({
          name: cert.name || cert.title || '',
          issuer: cert.issuer || cert.organization || '',
          date: cert.date || cert.issued_date || '',
          credentialId: cert.credential_id || cert.credentialId || '',
        })),
        languages: r.languages?.map((lang: any) => ({
          name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
          proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
        })),
        fileName: r.file_name, // Original file name with extension
        fileType: r.file_type, // File type (pdf, doc, docx)
        // Version info
        version: r.version || 1,
        versionCount: r.version_count || 1,
        // Archive status
        isArchived: r.is_archived || false,
        archivedAt: r.archived_at,
      }));

      // Convert API Folder to component Folder type
      const convertApiFolder = (f: ApiFolder): FolderType => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      let apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

      // Ensure "root" folder always exists (default folder for uploads)
      const hasRootFolder = apiFolders.some(f => f.name.toLowerCase() === 'root' && !f.parentId);
      if (!hasRootFolder) {
        try {
          const newRootFolder = await folderService.create('root');
          const rootFolderConverted: FolderType = {
            id: newRootFolder.id,
            name: newRootFolder.name,
            count: 0,
            parentId: newRootFolder.parent_id,
          };
          apiFolders = [rootFolderConverted, ...apiFolders];
        } catch (error) {
          console.error('Failed to create root folder:', error);
        }
      }

      // Ensure "Archived Resumes" folder always exists
      const hasArchivedFolder = apiFolders.some(f => f.name === 'Archived Resumes' && !f.parentId);
      if (!hasArchivedFolder) {
        try {
          const newArchivedFolder = await folderService.create('Archived Resumes');
          const archivedFolderConverted: FolderType = {
            id: newArchivedFolder.id,
            name: newArchivedFolder.name,
            count: 0,
            parentId: newArchivedFolder.parent_id,
          };
          apiFolders = [...apiFolders, archivedFolderConverted];
        } catch (error) {
          console.error('Failed to create Archived Resumes folder:', error);
        }
      }

      // The current API call may be filtered by folder/search/skills — its
      // total reflects the filtered view, not the user's whole library. Only
      // refresh the pinned global count when no such filters are applied.
      const isUnfiltered =
        (!folderId || folderId === 'all') &&
        !searchTerm?.trim() &&
        !currentFilters;
      const nextAllTotal = isUnfiltered ? resumeResponse.total : allResumesTotal;
      if (isUnfiltered) {
        setAllResumesTotal(resumeResponse.total);
      }

      // Add "All Resumes" virtual folder at the top
      const allResumesFolder: FolderType = {
        id: 'all',
        name: 'All Resumes',
        count: nextAllTotal,
      };

      const convertedFolders: FolderType[] = [
        allResumesFolder,
        ...apiFolders,
      ];

      setResumes(convertedResumes);
      setTotalItems(resumeResponse.total);
      setTotalPages(resumeResponse.total_pages);
      setFolders(convertedFolders);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load resumes');
    } finally {
      setLoading(false);
      isFetchingRef.current = false; // Reset flag to allow next fetch
    }
  };

  // Helper function to flatten all folders (including nested children)
  const flattenAllFolders = useCallback((folderList: FolderType[]): FolderType[] => {
    const result: FolderType[] = [];
    const traverse = (items: FolderType[]) => {
      for (const folder of items) {
        result.push(folder);
        if (folder.children && folder.children.length > 0) {
          traverse(folder.children);
        }
      }
    };
    traverse(folderList);
    return result;
  }, []);

  // Get folder by ID (including nested folders)
  const getFolderById = useCallback((folderId: string): FolderType | undefined => {
    const allFolders = flattenAllFolders(folders);
    return allFolders.find(f => f.id === folderId);
  }, [folders, flattenAllFolders]);

  // Get direct children folders of a parent folder
  const getChildrenFolders = useCallback((parentId: string | null): FolderType[] => {
    if (parentId === null) {
      // Return top-level folders (excluding 'all' virtual folder)
      return folders.filter(f => f.id !== 'all' && !f.parentId);
    }
    const parentFolder = getFolderById(parentId);
    return parentFolder?.children || [];
  }, [folders, getFolderById]);

  // Build breadcrumb path for a folder
  const buildBreadcrumbPath = useCallback((folderId: string | null): { id: string; name: string }[] => {
    if (!folderId) return [];

    const path: { id: string; name: string }[] = [];
    let currentFolder = getFolderById(folderId);

    while (currentFolder) {
      path.unshift({ id: currentFolder.id, name: currentFolder.name });
      if (currentFolder.parentId) {
        currentFolder = getFolderById(currentFolder.parentId);
      } else {
        break;
      }
    }

    return path;
  }, [getFolderById]);

  // Navigate to folder in card view
  const navigateToFolder = useCallback((folderId: string | null) => {
    setCardViewFolder(folderId);
    // Drive the server-side filter too — without this, the card view
    // tries to client-filter the currently loaded (paginated) page of
    // resumes, which usually doesn't contain the target folder's items
    // and shows an empty grid in Edge/Firefox.
    if (folderId === null) {
      setSelectedFolder('all');
    } else {
      setSelectedFolder(folderId);
    }
    setCurrentPage(1);
    // Clear stale resumes and flip to loading immediately so the grid shows a
    // spinner instead of "No resumes in this folder" while the fetch is in
    // flight (the debounced effect can take ~300ms before it fires).
    setResumes([]);
    setLoading(true);
    if (folderId) {
      const path = buildBreadcrumbPath(folderId);
      setBreadcrumbPath(path);
    } else {
      setBreadcrumbPath([]);
    }
  }, [buildBreadcrumbPath]);

  const handleSelectResume = (id: string) => {
    setSelectedResumes(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  // Only act on currently visible IDs. Selections in OTHER folders / pages
  // must be preserved — wiping them would surprise users with multi-folder
  // selections (e.g. picking 5 in folder A then opening folder B and clicking
  // Select All used to drop the original 5).
  const handleSelectAll = (selected: boolean) => {
    const visibleIds = filteredResumes.map(r => r.id);
    setSelectedResumes(prev => {
      if (selected) {
        const merged = new Set(prev);
        visibleIds.forEach(id => merged.add(id));
        return Array.from(merged);
      }
      return prev.filter(id => !visibleIds.includes(id));
    });
  };

  const handleDelete = (id: string) => {
    const resume = resumes.find(r => r.id === id);
    setDeleteResumeConfirm({
      isOpen: true,
      ids: [id],
      names: [resume?.candidate_name || resume?.file_name || 'this resume'],
    });
  };

  const handleDeleteResumes = (ids: string[]) => {
    const names = ids.map(id => {
      const r = resumes.find(r => r.id === id);
      return r?.candidate_name || r?.file_name || 'this resume';
    });
    setDeleteResumeConfirm({ isOpen: true, ids, names });
  };

  const confirmDeleteResumes = async () => {
    const { ids } = deleteResumeConfirm;
    setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] });
    try {
      await Promise.all(ids.map(id => resumeService.delete(id)));
      setResumes(prev => prev.filter(r => !ids.includes(r.id)));
      setSelectedResumes(prev => prev.filter(id => !ids.includes(id)));
      toast.success(ids.length === 1 ? 'Resume deleted' : `${ids.length} resume(s) deleted`);
    } catch (error) {
      toast.error('Failed to delete resume(s)');
    }
  };

  const handleMoveToFolder = async (resumeIds: string[], folderId: string) => {
    try {
      await Promise.all(resumeIds.map(id => resumeService.move(id, folderId)));
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id) ? { ...r, folderId } : r
      ));
      setSelectedResumes([]);
      toast.success(`${resumeIds.length} resume(s) moved`);
    } catch (error) {
      toast.error('Failed to move resumes');
    }
  };

  // Handle archive resumes - sets is_archived AND moves to Archived Resumes folder
  const handleArchiveResumes = async (resumeIds: string[]) => {
    try {
      // Find the "Archived Resumes" folder
      const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
      if (!archivedFolder) {
        toast.error('Archived Resumes folder not found');
        return;
      }

      // Get old folder IDs for count update
      const oldFolderIds = resumeIds.map(id => {
        const resume = resumes.find(r => r.id === id);
        return resume?.folderId;
      }).filter(Boolean);

      // Remember where each resume was before archiving so Unarchive can
      // restore it to the same folder. Backend has no previous_folder_id
      // column, so we stash it in localStorage keyed by resume id.
      try {
        const stash = JSON.parse(localStorage.getItem('archivedResumePrevFolder') || '{}');
        resumeIds.forEach((id) => {
          const r = resumes.find((x) => x.id === id);
          if (r?.folderId && r.folderId !== archivedFolder.id) {
            stash[id] = r.folderId;
          }
        });
        localStorage.setItem('archivedResumePrevFolder', JSON.stringify(stash));
      } catch {
        // localStorage unavailable / quota — silently fall through; unarchive
        // will just default to Root for these ids.
      }

      // Archive and move each resume
      await Promise.all(resumeIds.map(async (id) => {
        await resumeService.archive(id, true);
        await resumeService.move(id, archivedFolder.id);
      }));

      // Update local state - set archived flag AND move to archived folder
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id)
          ? { ...r, isArchived: true, archivedAt: new Date().toISOString(), folderId: archivedFolder.id }
          : r
      ));

      // Update folder counts
      setFolders(prev => prev.map(f => {
        if (f.id === archivedFolder.id) {
          return { ...f, count: f.count + resumeIds.length };
        }
        // Decrease count from old folders
        const decreaseCount = oldFolderIds.filter(fid => fid === f.id).length;
        if (decreaseCount > 0) {
          return { ...f, count: Math.max(0, f.count - decreaseCount) };
        }
        return f;
      }));

      setSelectedResumes([]);
      toast.success(`${resumeIds.length} resume(s) archived`);
    } catch (error) {
      toast.error('Failed to archive resumes');
    }
  };

  // Handle unarchive resumes - clears is_archived and restores each resume
  // to the folder it lived in before archiving (stashed in localStorage by
  // handleArchiveResumes). Falls back to Root for resumes with no stash
  // entry (archived before this fix, or stash cleared).
  const handleUnarchiveResumes = async (resumeIds: string[]) => {
    try {
      const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
      if (!rootFolder) {
        toast.error('Root folder not found');
        return;
      }
      const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);

      let stash: Record<string, string> = {};
      try {
        stash = JSON.parse(localStorage.getItem('archivedResumePrevFolder') || '{}');
      } catch {
        stash = {};
      }
      const validFolderIds = new Set(folders.map(f => f.id));
      const targetFolderFor = (id: string): string => {
        const prev = stash[id];
        if (prev && validFolderIds.has(prev) && prev !== archivedFolder?.id) return prev;
        return rootFolder.id;
      };

      const restorations = resumeIds.map(id => ({ id, target: targetFolderFor(id) }));

      await Promise.all(restorations.map(async ({ id, target }) => {
        await resumeService.archive(id, false);
        await resumeService.move(id, target);
      }));

      // Drop the consumed stash entries so they don't grow unbounded.
      try {
        resumeIds.forEach(id => { delete stash[id]; });
        localStorage.setItem('archivedResumePrevFolder', JSON.stringify(stash));
      } catch {
        // ignore — best-effort cleanup
      }

      const targetById = new Map(restorations.map(r => [r.id, r.target]));
      setResumes(prev => prev.map(r =>
        resumeIds.includes(r.id)
          ? { ...r, isArchived: false, archivedAt: undefined, folderId: targetById.get(r.id) || rootFolder.id }
          : r
      ));

      // Folder counts: bump each restored folder, decrement Archived Resumes
      const restoredCounts = new Map<string, number>();
      restorations.forEach(({ target }) => {
        restoredCounts.set(target, (restoredCounts.get(target) || 0) + 1);
      });
      setFolders(prev => prev.map(f => {
        if (restoredCounts.has(f.id)) {
          return { ...f, count: f.count + (restoredCounts.get(f.id) || 0) };
        }
        if (archivedFolder && f.id === archivedFolder.id) {
          return { ...f, count: Math.max(0, f.count - resumeIds.length) };
        }
        return f;
      }));

      setSelectedResumes([]);
      // Refetch the current folder view — the displayed list (`filteredResumes`)
      // is the server-returned page for the selected folder, so the
      // just-unarchived row won't disappear until we re-query.
      isFetchingRef.current = false;
      fetchData(appliedSearchQuery, filters, selectedFolder, true);

      const restoredToOriginal = restorations.filter(r => r.target !== rootFolder.id).length;
      toast.success(
        restoredToOriginal === resumeIds.length
          ? `${resumeIds.length} resume(s) unarchived and restored to their original folder`
          : restoredToOriginal === 0
            ? `${resumeIds.length} resume(s) unarchived (moved to Root — original folder not remembered)`
            : `${resumeIds.length} resume(s) unarchived (${restoredToOriginal} restored, ${resumeIds.length - restoredToOriginal} to Root)`
      );
    } catch (error) {
      toast.error('Failed to unarchive resumes');
    }
  };

  // Handle bulk download of selected resumes
  const handleBulkDownload = async () => {
    if (selectedResumes.length === 0) return;

    // If more than 1 resume selected, show confirmation popup
    if (selectedResumes.length > 1) {
      setIsZipDownloadModalOpen(true);
      return;
    }

    // For single resume, download directly
    toast.loading('Downloading resume...', { id: 'bulk-download' });
    try {
      const resumeId = selectedResumes[0];
      const resume = resumes.find(r => r.id === resumeId);
      const blob = await resumeService.download(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original fileName to preserve file extension (pdf, doc, docx, rtf, txt, etc.)
      a.download = resume?.fileName || `${resume?.name || 'resume'}.${resume?.fileType || 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Resume downloaded', { id: 'bulk-download' });
      setSelectedResumes([]);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download resume', { id: 'bulk-download' });
    }
  };

  // Handle ZIP download of multiple resumes
  const handleZipDownload = async () => {
    if (selectedResumes.length === 0) return;

    setIsDownloadingZip(true);
    toast.loading(`Preparing ${selectedResumes.length} resumes for download...`, { id: 'zip-download' });

    try {
      // Dynamically import fflate to avoid SSR issues
      const { zipSync, strToU8 } = await import('fflate');

      const files: { [key: string]: Uint8Array } = {};

      // Download each resume and add to ZIP
      for (let i = 0; i < selectedResumes.length; i++) {
        const resumeId = selectedResumes[i];
        const resume = resumes.find(r => r.id === resumeId);
        // Use original fileName to preserve file extension (pdf, doc, docx, etc.)
        const fileName = resume?.fileName || `${resume?.name || `resume_${i + 1}`}_resume`;
        const zipPath = `resumes/${fileName}`;

        try {
          const blob = await resumeService.download(resumeId);
          const arrayBuffer = await blob.arrayBuffer();
          files[zipPath] = new Uint8Array(arrayBuffer);
        } catch (err) {
          console.error(`Failed to download ${fileName}:`, err);
        }
      }

      // Generate ZIP file
      const zipped = zipSync(files);
      const zipBlob = new Blob([zipped], { type: 'application/zip' });

      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resumes_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${selectedResumes.length} resumes downloaded as ZIP`, { id: 'zip-download' });
      setSelectedResumes([]);
      setIsZipDownloadModalOpen(false);
    } catch (error) {
      console.error('ZIP download failed:', error);
      toast.error('Failed to create ZIP file', { id: 'zip-download' });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Handle Assessment button click
  const handleAssessment = async () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // Fetch active assessments if not already loaded
    if (activeAssessments.length === 0) {
      await fetchActiveAssessments();
    }
    setIsAssessmentModalOpen(true);
  };

  // Fetch active assessments for the Assessment modal.
  // Revoked assessments are filtered out — once the recruiter has revoked
  // invites on an assessment they shouldn't be able to send fresh invites
  // through any other module; they must duplicate it to start a new round.
  const fetchActiveAssessments = async () => {
    setLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const filtered = (response.items || []).filter(
        (a: any) => !isAssessmentRevoked(a, revokedIds)
      );
      setActiveAssessments(filtered);
    } catch (error) {
      console.error('Failed to load active assessments:', error);
      toast.error('Failed to load active assessments');
    } finally {
      setLoadingAssessments(false);
    }
  };

  // Toggle assessment selection (for multi-select)
  const toggleAssessmentSelection = (assessment: any) => {
    setSelectedAssessments(prev => {
      const isSelected = prev.some(a => a.id === assessment.id);
      if (isSelected) {
        return prev.filter(a => a.id !== assessment.id);
      } else {
        return [...prev, assessment];
      }
    });
  };

  // Handle AI Talent Match button click
  const handleAITalentMatch = async () => {
    if (selectedResumes.length === 0) {
      toast.error('Please select at least one resume');
      return;
    }
    // Fetch published jobs if not already loaded
    if (publishedJobs.length === 0) {
      await fetchPublishedJobs();
    }
    setIsAITalentMatchModalOpen(true);
  };

  // Fetch published jobs for the Apply to Job modal
  const fetchPublishedJobs = async () => {
    setLoadingJobs(true);
    try {
      const response = await jdService.list({ status: 'published', page_size: 100, source: 'my-jds' });
      const convertedJobs: Job[] = response.items.map((jd: any) => ({
        id: jd.id,
        job_id: jd.job_id,
        title: jd.title || 'Untitled',
        status: 'Published' as const,
        location: jd.location || '',
        daysActive: jd.created_at ? Math.ceil((new Date().getTime() - new Date(jd.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
        requiredMatch: jd.required_match || 70,
        department: jd.department,
        industry_type: jd.industry_type,
        applicants: jd.applicants_count || 0,
        description: jd.description,
        skills: jd.skills || jd.must_have_skills || [],
        postedDate: jd.published_at || jd.created_at,
        postedBy: jd.created_by_name,
        employmentType: jd.employment_type,
        workMode: jd.remote_type,
        created_at: jd.created_at,
        updated_at: jd.updated_at,
        creation_method: jd.creation_method,
      }));
      setPublishedJobs(convertedJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoadingJobs(false);
    }
  };

  // Helper: check if a resume is archived (by flag OR by folder)
  const isResumeArchived = (resume: Resume): boolean => {
    if (resume.isArchived === true) return true;
    const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
    if (archivedFolder && resume.folderId === archivedFolder.id) return true;
    return false;
  };

  // Handle apply to job
  // Single candidate: show version selector first
  // Multiple candidates: use latest version directly
  const handleApplyToJob = async () => {
    if (selectedResumes.length === 0) return;

    // Check if any selected resumes are archived (by flag or folder)
    const selectedResumeObjects = resumes.filter(r => selectedResumes.includes(r.id));
    const archivedCount = selectedResumeObjects.filter(r => isResumeArchived(r)).length;

    if (archivedCount > 0) {
      toast.error(`Archived resume${archivedCount > 1 ? 's' : ''} cannot be applied to any job. Please select active resumes only.`);
      return;
    }

    if (selectedResumes.length === 1) {
      // Single candidate - show version selector first
      const resume = resumes.find(r => r.id === selectedResumes[0]);
      if (resume) {
        await showVersionSelector(resume);
        return;
      }
    }

    // Multiple candidates - use latest versions directly (resumes in list are already latest)
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Show version selector for a single resume
  const showVersionSelector = async (resume: Resume) => {
    setIsLoadingVersions(true);
    try {
      const versions = await resumeService.getVersions(resume.id);
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
      setVersionSelectorResume(resumeWithVersions);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      // On error, create single version entry
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
      setVersionSelectorResume(resumeWithVersions);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Handle version selection - proceed to job modal with selected version
  const handleVersionSelect = async (versionId: string) => {
    // Capture resume data immediately (before component's onClose runs)
    const currentResume = versionSelectorResume;
    if (!currentResume || !currentResume.versions) return;

    const selectedVersion = currentResume.versions.find((v: any) => v.id === versionId);
    if (!selectedVersion) return;

    // Create resume with selected version ID
    const resumeWithSelectedVersion = {
      ...currentResume,
      id: versionId,
      version: selectedVersion.version,
    };

    // Set the resume to apply and fetch jobs
    setSingleResumeToApply(resumeWithSelectedVersion);

    // Fetch published jobs then open modal
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle apply to job for a single resume (from table action button)
  // This is called from ResumeTable after version is selected there
  const handleSingleResumeApplyToJob = async (resume: Resume) => {
    // Check if resume is archived (by flag OR by folder)
    if (isResumeArchived(resume)) {
      toast.error('Archived resume cannot be applied to any job. Please select an active resume.');
      return;
    }

    // Resume already has selected version ID from ResumeTable's version selector
    setSingleResumeToApply(resume);
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle scoring an uploaded resume - called from UploadModal success state
  const handleScoreUploadedResume = async (resumeId: string, candidateName: string) => {
    // Store the uploaded resume info for scoring
    setUploadedResumeToScore({ id: resumeId, candidateName });

    // Fetch published jobs and open modal
    await fetchPublishedJobs();
    setIsApplyToJobModalOpen(true);
  };

  // Handle applying resumes to selected jobs (scoring) - using async Celery
  const handleApplyToJobSubmit = async (resumeIds: string[], jobIds: string[]) => {
    if (jobIds.length === 0 || resumeIds.length === 0) return;

    setIsApplyToJobModalOpen(false);

    // Get the selected job details
    const jobId = jobIds[0];
    const selectedJob = publishedJobs.find(j => j.id === jobId);

    try {
      // Check for existing scores (duplicate check)
      const duplicateCheck = await scoringService.checkExistingScores(jobId, resumeIds);

      // If there are existing scores, show warning
      if (duplicateCheck.existing_count > 0) {
        setDuplicateScoringWarning({
          isOpen: true,
          jobId: jobId,
          jobTitle: duplicateCheck.jd_title,
          resumeIds: resumeIds,
          existingScores: duplicateCheck.existing_scores,
          newCount: duplicateCheck.new_count,
        });
        return; // Stop here and wait for user decision
      }

      // No duplicates - proceed with scoring
      await proceedWithScoring(jobId, resumeIds, selectedJob?.title || duplicateCheck.jd_title);
    } catch (error: any) {
      console.error('Failed to check duplicates or start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  // Proceed with scoring (extracted for reuse in duplicate confirmation)
  const proceedWithScoring = async (jobId: string, resumeIds: string[], jobTitle: string) => {
    try {
      // Start async bulk scoring via Celery (resumeIds already have correct version IDs)
      const response = await scoringService.startBulkScoringAsync(jobId, resumeIds);

      // Get candidate names for the selected resumes
      const resumeItems = resumeIds.map(id => {
        const resume = resumes.find(r => r.id === id);
        return {
          resumeId: id,
          candidateName: resume?.candidateName || resume?.candidate_name || resume?.name || 'Unknown',
        };
      });

      // Store batch info for the resume-scoring page to poll (including resume items for fallback)
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes,
        resumeItems: resumeItems,
      };
      sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));

      // Clear selection and navigate to resume scoring page
      setSelectedResumes([]);
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  // Handle scoring only new candidates (remove duplicates)
  const handleScoreOnlyNew = async () => {
    const { jobId, resumeIds, jobTitle, existingScores } = duplicateScoringWarning;

    // Filter out already scored resumes
    const alreadyScoredIds = existingScores.map(s => s.resume_id);
    const newResumeIds = resumeIds.filter(id => !alreadyScoredIds.includes(id));

    setDuplicateScoringWarning({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 });

    if (newResumeIds.length === 0) {
      toast.error('All selected candidates are already scored');
      return;
    }

    // Proceed with scoring only new candidates
    await proceedWithScoring(jobId, newResumeIds, jobTitle);
    toast.success(`Scoring ${newResumeIds.length} new candidate(s), skipped ${alreadyScoredIds.length} duplicate(s)`);
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      // Helper to get all folders including nested children
      const getAllFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (list: FolderType[]) => {
          for (const f of list) {
            result.push(f);
            if (f.children) traverse(f.children);
          }
        };
        traverse(folderList);
        return result;
      };

      // Check if folder with same name already exists ANYWHERE (globally unique)
      const allFolders = getAllFolders(folders);
      const existingFolder = allFolders.find(f =>
        f.name.toLowerCase() === name.toLowerCase() &&
        f.id !== 'all'
      );

      if (existingFolder) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }

      console.log('[DEBUG] Creating folder:', { name, parentId });
      const newFolder = await folderService.create(name, parentId);
      console.log('[DEBUG] Folder created:', newFolder);

      // Reload folders from backend to get proper tree structure
      const folderResponse = await folderService.list();
      const convertApiFolder = (f: ApiFolder): FolderType => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      const apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

      // Add "All Resumes" virtual folder at the top — use the pinned global
      // total, not the currently loaded list (which may be filtered/paginated).
      const allResumesFolder: FolderType = {
        id: 'all',
        name: 'All Resumes',
        count: allResumesTotal,
      };
      setFolders([allResumesFolder, ...apiFolders]);

      toast.success('Folder created');
    } catch (error: any) {
      console.error('[DEBUG] Failed to create folder:', error);
      const message = error?.response?.data?.detail || error?.message || 'Unknown error';
      toast.error(`Failed to create folder: ${message}`);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      // Prevent renaming "Archived Resumes" folder
      const folderToRename = folders.find(f => f.id === id);
      if (folderToRename && folderToRename.name === 'Archived Resumes' && !folderToRename.parentId) {
        toast.error('Archived Resumes folder cannot be renamed');
        return;
      }

      // Helper to get all folders including nested children
      const getAllFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (list: FolderType[]) => {
          for (const f of list) {
            result.push(f);
            if (f.children) traverse(f.children);
          }
        };
        traverse(folderList);
        return result;
      };

      // Check if folder with same name already exists ANYWHERE (globally unique)
      const allFolders = getAllFolders(folders);
      const existingFolder = allFolders.find(f =>
        f.name.toLowerCase() === name.toLowerCase() &&
        f.id !== id &&
        f.id !== 'all'
      );

      if (existingFolder) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }

      await folderService.update(id, { name });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
      toast.success('Folder renamed');
    } catch (error) {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    // Find the folder to check if it's a system folder
    const folderToDelete = folders.find(f => f.id === id);

    // Prevent deletion of root folder
    if (folderToDelete && folderToDelete.name.toLowerCase() === 'root' && !folderToDelete.parentId) {
      toast.error('Root folder cannot be deleted');
      return;
    }

    // Prevent deletion of "Archived Resumes" folder
    if (folderToDelete && folderToDelete.name === 'Archived Resumes' && !folderToDelete.parentId) {
      toast.error('Archived Resumes folder cannot be deleted');
      return;
    }

    // Count resumes in this folder (local fallback)
    const resumesInFolder = resumes.filter(r => r.folderId === id);

    // Find parent folder info
    const parentFolder = folderToDelete?.parentId
      ? folders.find(f => f.id === folderToDelete.parentId)
      : null;

    // Find root folder
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);

    // Open dialog immediately with loading state
    setDeleteFolderConfirm({
      isOpen: true,
      folderId: id,
      folderName: folderToDelete?.name || 'this folder',
      resumeCount: resumesInFolder.length,
      parentFolderId: parentFolder?.id || rootFolder?.id || null,
      parentFolderName: parentFolder?.name || 'My Resumes (root)',
      contentAction: null,
      hasSubfolders: false,
      subfolderCount: 0,
      subfolderDetails: [],
      totalResumeCount: resumesInFolder.length,
      subfolderResumeCount: 0,
      loading: true,
    });

    // Fetch accurate deletion info from backend
    try {
      const info = await folderService.getDeletionInfo(id);
      setDeleteFolderConfirm(prev => ({
        ...prev,
        resumeCount: info.direct_resume_count,
        hasSubfolders: info.subfolder_count > 0,
        subfolderCount: info.subfolder_count,
        subfolderDetails: info.subfolder_details,
        totalResumeCount: info.total_resume_count,
        subfolderResumeCount: info.subfolder_resume_count,
        loading: false,
      }));
    } catch {
      // Fallback to client-side data on API error
      setDeleteFolderConfirm(prev => ({
        ...prev,
        loading: false,
      }));
    }
  };

  const confirmDeleteFolder = async () => {
    const { folderId, totalResumeCount, contentAction, parentFolderId, hasSubfolders } = deleteFolderConfirm;
    if (!folderId) return;

    // If folder has content and no action selected, don't proceed
    if (totalResumeCount > 0 && !contentAction) {
      toast.error('Please select what to do with the resumes in this folder');
      return;
    }

    // Find root folder for 'move-root' action
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);

    // Determine target folder for moving resumes and flags
    let moveResumesTo: string | undefined;
    let deleteSubfolders = hasSubfolders;
    let deleteResumes = false;

    if (totalResumeCount > 0 && contentAction) {
      if (contentAction === 'move-parent') {
        moveResumesTo = parentFolderId || rootFolder?.id;
      } else if (contentAction === 'move-root') {
        moveResumesTo = rootFolder?.id;
      } else if (contentAction === 'delete-all') {
        deleteResumes = true;
      }
    }

    try {
      const result = await folderService.delete(folderId, moveResumesTo, deleteSubfolders, deleteResumes);

      // Refresh folders from backend for accurate state
      try {
        const folderResponse = await folderService.list();
        type ApiFolder = { id: string; name: string; parent_id?: string; resume_count: number; children?: ApiFolder[]; created_at: string };
        const convertApiFolder = (f: ApiFolder): FolderType => ({
          id: f.id,
          name: f.name,
          count: f.resume_count || 0,
          parentId: f.parent_id,
          children: f.children?.map(convertApiFolder),
        });
        let apiFolders: FolderType[] = (Array.isArray(folderResponse) ? folderResponse : []).map(convertApiFolder);

        // Ensure "root" folder always exists
        const hasRootFolder = apiFolders.some(f => f.name.toLowerCase() === 'root' && !f.parentId);
        if (!hasRootFolder) {
          try {
            const rootFolder = await folderService.create('root');
            apiFolders.push(convertApiFolder(rootFolder as unknown as ApiFolder));
          } catch { /* ignore */ }
        }

        // Ensure "All Resumes" virtual folder uses the pinned global total
        const allResumesFolder: FolderType = {
          id: 'all',
          name: 'All Resumes',
          count: allResumesTotal,
          children: [],
        };
        setFolders([allResumesFolder, ...apiFolders]);
      } catch {
        // Fallback: remove deleted folder from local state
        setFolders(prev => prev.filter(f => f.id !== folderId));
      }

      // If we deleted resumes, remove them from local state
      if (deleteResumes && result.deleted_resumes > 0) {
        setResumes(prev => prev.filter(r => r.folderId !== folderId));
      }

      // If viewing a deleted folder, redirect to root
      if (selectedFolder === folderId) {
        const root = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
        setSelectedFolder(root?.id || 'all');
      }

      // Dynamic toast with counts
      const parts: string[] = [];
      if (result.deleted_folders > 1) parts.push(`${result.deleted_folders} folders deleted`);
      else parts.push('Folder deleted');
      if (result.moved_resumes > 0) parts.push(`${result.moved_resumes} resume${result.moved_resumes !== 1 ? 's' : ''} moved`);
      if (result.deleted_resumes > 0) parts.push(`${result.deleted_resumes} resume${result.deleted_resumes !== 1 ? 's' : ''} deleted`);
      toast.success(parts.join(', '));
    } catch (error) {
      toast.error('Failed to delete folder');
    }

    // Close dialog
    setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
  };

  // Helper function to find or create "root" folder
  const getOrCreateRootFolder = async (): Promise<string> => {
    // Check if "root" folder already exists
    const existingRoot = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
    if (existingRoot) {
      return existingRoot.id;
    }

    // Create "root" folder
    try {
      const newFolder = await folderService.create('root');
      const converted: FolderType = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      setFolders(prev => [...prev, converted]);
      return newFolder.id;
    } catch (error: any) {
      console.error('Failed to create root folder:', error);
      throw error;
    }
  };

  // Helper function to find or create "Archived Resumes" folder
  const getOrCreateArchivedFolder = async (existingFolders: FolderType[]): Promise<FolderType | null> => {
    // Check if "Archived Resumes" folder already exists
    const existingArchived = existingFolders.find(f => f.name === 'Archived Resumes' && !f.parentId);
    if (existingArchived) {
      return existingArchived;
    }

    // Create "Archived Resumes" folder
    try {
      const newFolder = await folderService.create('Archived Resumes');
      const converted: FolderType = {
        id: newFolder.id,
        name: newFolder.name,
        count: 0,
        parentId: newFolder.parent_id,
      };
      return converted;
    } catch (error: any) {
      console.error('Failed to create Archived Resumes folder:', error);
      return null;
    }
  };

  const handleUploadResumes = async (files: File[], folderId?: string): Promise<{
    success: boolean;
    error?: string;
    existingResume?: { id: string; candidateName: string; uploadedAt?: string };
  }> => {
    // If no folder is selected or "All Resumes" is selected, use or create "root" folder
    let targetFolderId = folderId;
    if (!targetFolderId || targetFolderId === 'all') {
      try {
        targetFolderId = await getOrCreateRootFolder();
      } catch (error) {
        return { success: false, error: 'Failed to create root folder for upload' };
      }
    }

    // Auto-open upload history panel immediately when upload starts (for multiple files)
    if (files.length > 1) {
      console.log('[UPLOAD] Auto-opening upload history panel for', files.length, 'files');
      // New batch is about to start processing — land on Currently Processing tab
      setUploadHistoryTab('current');
      setIsUploadHistoryModalOpen(true);
      setIsUploadHistoryMinimized(false);

      // Show "Uploading..." record immediately BEFORE API call
      const tempId = `temp-${Date.now()}`;
      const uploadingRecord = {
        id: tempId,
        date: new Date().toISOString(),
        fileName: `Uploading ${files.length} files...`,
        totalFiles: files.length,
        completed: 0,
        pending: files.length,
        duplicated: 0,
        versioned: 0,
        errors: 0,
        cancelled: 0,
        status: 'uploading',
        source: 'my-resumes' as const,
        statuses: files.map((f, idx) => ({
          id: `temp-file-${idx}`,
          fileName: f.name,
          status: 'pending',
          errorMessage: null,
          candidateName: null,
        })),
      };
      setUploadHistory(prev => [uploadingRecord, ...prev]);
    }

    // For single file, use single upload endpoint
    if (files.length === 1) {
      try {
        const r = await resumeService.upload(files[0], targetFolderId);
        // Optimistic update for instant UI feedback
        const converted = convertApiResume(r);
        setResumes(prev => [converted, ...prev]);
        toast.success('Resume uploaded successfully');
        // Background refresh to get correct uploaded_by_name, version counts, etc.
        setTimeout(() => {
          isFetchingRef.current = false; // Reset guard so fetchData can run
          fetchData(undefined, undefined, undefined, true);
          fetchUploadHistory();
        }, 500);
        return {
          success: true,
          resumeId: r.id,
          candidateName: r.candidate_name || files[0].name
        };
      } catch (error: any) {
        console.log('[UPLOAD-ERROR] Caught error:', error);
        console.log('[UPLOAD-ERROR] Response status:', error?.response?.status);
        console.log('[UPLOAD-ERROR] Response data:', error?.response?.data);

        // Check for duplicate error (409 Conflict)
        if (error?.response?.status === 409) {
          const detail = error?.response?.data?.detail;
          console.log('[UPLOAD-ERROR] 409 detail:', detail);
          const existingResume = detail?.existing_resume;
          const isExactDuplicate = detail?.is_exact_duplicate ?? true;
          const contentDifferences = detail?.content_differences || [];
          console.log('[UPLOAD-ERROR] existingResume:', existingResume);

          if (existingResume) {
            // Return existing resume info - UploadModal will decide how to handle it
            // If onScoreResume is provided, UploadModal shows DuplicateResumeDetectedModal
            // Otherwise, show the full duplicate resolution modal here
            return {
              success: false,
              error: `A resume for ${existingResume.candidate_name || 'this candidate'} already exists in your Internal Resume Database.`,
              existingResume: {
                id: existingResume.id,
                candidateName: existingResume.candidate_name || existingResume.file_name || 'Unknown',
                email: existingResume.email || '',
                currentTitle: existingResume.current_title || '',
                folderName: existingResume.folder_name || '',
                uploadedAt: existingResume.upload_date || '',
                version: existingResume.version || 1,
              },
              // Also include full data for the old duplicate modal fallback
              duplicateData: {
                file: files[0],
                existingResume: {
                  id: existingResume.id,
                  candidate_name: existingResume.candidate_name || existingResume.file_name || 'Unknown',
                  email: existingResume.email || '',
                  folder_name: existingResume.folder_name,
                  folder_path: existingResume.folder_path || 'My Resumes',
                  upload_date: existingResume.upload_date || '',
                  file_size: existingResume.file_size || 0,
                  file_name: existingResume.file_name || '',
                  version: existingResume.version || 1,
                  version_count: existingResume.version_count || existingResume.version || 1,
                },
                contentDifferences: contentDifferences,
                isDuplicate: isExactDuplicate,
                targetFolderId: targetFolderId,
              }
            };
          }

          return {
            success: false,
            error: 'This resume already exists in the system.',
          };
        }
        // Check for validation errors (400 Bad Request)
        else if (error?.response?.status === 400) {
          const detail = error?.response?.data?.detail;

          // Handle INVALID_RESUME error
          if (detail?.error === 'INVALID_RESUME') {
            return {
              success: false,
              error: detail?.message || 'The uploaded file does not appear to be a valid resume. It may be a scorecard, invoice, or other document type.',
            };
          }

          // Handle NO_CONTENT error
          if (detail?.error === 'NO_CONTENT') {
            return {
              success: false,
              error: detail?.message || 'The resume file has no readable content. The file may be blank, image-only, or heavily formatted.',
            };
          }

          // Handle other 400 errors
          return {
            success: false,
            error: detail?.message || `Failed to upload ${files[0].name}`,
          };
        }
        // Check for read-only mode (403 Forbidden)
        else if (error?.response?.status === 403) {
          const detail = error?.response?.data?.detail;
          if (detail?.error === 'READ_ONLY_MODE') {
            return {
              success: false,
              error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
            };
          }
          return {
            success: false,
            error: 'You do not have permission to upload resumes. Please contact your administrator.',
          };
        }
        else {
          return { success: false, error: `Failed to upload ${files[0].name}` };
        }
      }
    }

    // For multiple files, use bulk upload with async processing
    try {
      // Note: previous completed batches are intentionally kept — the
      // Completed tab in the Upload History modal serves as the history
      // view, so wiping on every new upload would defeat its purpose.

      // Start bulk upload - returns immediately with batch info
      const batch = await resumeService.uploadBulk(files, targetFolderId);

      // Fetch full status with items immediately
      let initialStatuses: any[] = [];
      try {
        const fullStatus = await resumeService.getBatchStatus(batch.id);
        initialStatuses = fullStatus.items?.map((item: any) => ({
          id: item.id,
          fileName: item.file_name,
          status: item.status === 'duplicated' ? 'duplicate' : item.status,
          errorMessage: item.error_message,
          candidateName: item.candidate_name,
          resumeId: item.resume_id,
        })) || [];
      } catch (e) {
        console.error('Error fetching initial batch status:', e);
      }

      // Replace temp "Uploading..." record with real batch data
      const newBatchRecord = {
        id: batch.id,
        date: new Date().toISOString(),
        fileName: `Bulk Upload (${batch.total_files} files)`,
        totalFiles: batch.total_files,
        completed: batch.completed || 0,
        pending: batch.pending || batch.total_files,
        duplicated: batch.duplicates || 0,
        versioned: batch.versions || 0,
        errors: batch.errors || 0,
        cancelled: batch.cancelled || 0,
        status: batch.status || 'processing',
        source: 'my-resumes' as const,
        statuses: initialStatuses,
      };
      // Remove temp record and add real one
      setUploadHistory(prev => [newBatchRecord, ...prev.filter(r => !r.id.startsWith('temp-'))]);

      // Poll for batch status until complete (REDUCED: every 3 seconds instead of 1)
      const pollInterval = setInterval(async () => {
        try {
          const status = await resumeService.getBatchStatus(batch.id);

          const processed = status.completed + status.errors + status.duplicates;
          const total = status.total_files;
          const percentage = Math.round((processed / total) * 100);

          // Update upload history to show progress including individual file statuses
          setUploadHistory(prev => prev.map(record =>
            record.id === batch.id
              ? {
                  ...record,
                  completed: status.completed,
                  pending: status.pending,
                  duplicated: status.duplicates,
                  versioned: status.versions,
                  errors: status.errors,
                  cancelled: status.cancelled ?? 0,
                  completedAt: status.completed_at,
                  status: status.status,
                  statuses: status.items?.map((item: any) => ({
                    id: item.id,
                    fileName: item.file_name,
                    status: item.status === 'duplicated' ? 'duplicate' : item.status,
                    errorMessage: item.error_message,
                    candidateName: item.candidate_name,
                    resumeId: item.resume_id,
                  })) || [],
                }
              : record
          ));

          // Check if batch is complete.
          // IMPORTANT: Do NOT stop on status.pending === 0 alone — the backend uses
          // 'pending' only for queued items. Once a file moves to 'processing',
          // pending drops to 0 but the file is still running. Stopping here causes
          // it to freeze at "⚡ Processing..." forever.
          const hasActiveItems = status.items?.some((item: any) =>
            item.status === 'pending' || item.status === 'processing'
          ) ?? false;

          if (status.status === 'completed' || !hasActiveItems) {
            clearInterval(pollInterval);
            pollingIntervalsRef.current.delete(pollInterval); // Remove from tracking

            // Refresh upload history and resume list
            fetchUploadHistory();
            fetchData();
          }
        } catch (pollError) {
          console.error('Error polling batch status:', pollError);
          // On error, stop polling this batch to prevent infinite errors
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(pollInterval);
        }
      }, 3000); // FIXED: Poll every 3 seconds (was 1 second) = 3x fewer requests

      // Track interval for cleanup
      pollingIntervalsRef.current.add(pollInterval);

      // Set a timeout to stop polling after 10 minutes
      const stopTimeout = setTimeout(() => {
        clearInterval(pollInterval);
        pollingIntervalsRef.current.delete(pollInterval);
        console.log('[Upload] Polling stopped after 10 minutes timeout');
      }, 600000);

      return { success: true };
    } catch (error: any) {
      // Check for read-only mode (403 Forbidden)
      if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;
        if (detail?.error === 'READ_ONLY_MODE') {
          return {
            success: false,
            error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
          };
        }
        return {
          success: false,
          error: 'You do not have permission to upload resumes. Please contact your administrator.',
        };
      }
      // Check for duplicate error (409 Conflict)
      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        return {
          success: false,
          error: detail?.message || 'All files are duplicates',
        };
      }
      return { success: false, error: 'Failed to start bulk upload' };
    }
  };

  // Helper function to convert API resume to component type
  const convertApiResume = (r: ApiResume): Resume => ({
    id: r.id,
    name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
    email: r.email || 'No email',
    phone: r.phone || 'No phone',
    title: r.current_title || 'N/A',
    experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
    education: r.education?.[0]?.degree || 'N/A',
    location: r.location || 'N/A',
    skills: r.skills || [],
    source: 'Manual',
    folderId: r.folder_id || '',
    uploadDate: r.created_at,
    attachments: r.version_count || r.version || 1,
    uploadedBy: r.uploaded_by_name || 'Unknown',
    currentCompany: r.current_company,
    previousCompany: r.previous_company,
    noticePeriod: r.notice_period,
    lastUpdated: r.updated_at,
    professionalSummary: r.professional_summary,
    technicalSkills: r.technical_skills,
    softSkills: r.soft_skills,
    educationDetails: r.education?.map((edu: any) => ({
      degree: edu.degree || '',
      school: edu.school || edu.institution || '',
      location: edu.location || '',
      year: edu.year || edu.graduation_year || '',
      gpa: edu.gpa || '',
      honors: edu.honors || '',
    })),
    experienceDetails: r.experience?.map((exp: any) => ({
      title: exp.title || exp.position || '',
      company: exp.company || '',
      location: exp.location || '',
      startDate: exp.start_date || '',
      endDate: exp.end_date || 'Present',
      duration: exp.duration || '',
      description: exp.description || '',
      achievements: exp.achievements || exp.responsibilities || [],
    })),
    certifications: r.certifications?.map((cert: any) => ({
      name: cert.name || cert.title || '',
      issuer: cert.issuer || cert.organization || '',
      date: cert.date || cert.issued_date || '',
      credentialId: cert.credential_id || cert.credentialId || '',
    })),
    languages: r.languages?.map((lang: any) => ({
      name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
      proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
    })),
    version: r.version || 1,
    versionCount: r.version_count || 1,
  });

  // Handle search change from SearchFilterBarCompact (already debounced)
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setAppliedSearchQuery(query);
    setCurrentPage(1);
    // Don't call fetchData directly - let the useEffect handle it
    // This prevents double API calls
  }, []);

  // Client-side search helper - searches across all text fields including phone and skills
  // Server handles search, filtering, sorting, and pagination.
  // filteredResumes is now just the server-returned page of resumes.
  const filteredResumes = resumes;

  // Stats (all resumes returned are user's own resumes)
  const totalResumes = resumes.length;
  const appliedResumes = 0; // Would need job applications data
  const availableResumes = totalResumes - appliedResumes;

  // Handle duplicate resolution
  const handleResolveDuplicates = async (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => {
    const toastId = toast.loading('Processing duplicate resolution...');

    try {
      for (const resolution of resolutions) {
        const duplicateFile = duplicateFiles[resolution.fileIndex];
        if (!duplicateFile) continue;

        if (resolution.action === 'discard') {
          // Just skip this file
          toast.success('New resume discarded, keeping existing', { id: toastId });
        } else {
          // Use the resolve duplicate and upload endpoint
          await resumeService.resolveDuplicateAndUpload(
            duplicateFile.file,
            duplicateFile.existingResume.id,
            resolution.action,
            pendingUploadFolderId
          );

          if (resolution.action === 'overwrite') {
            toast.success('Resume overwritten successfully', { id: toastId });
          } else {
            toast.success(`Resume saved as version ${(duplicateFile.existingResume.version || 1) + 1}`, { id: toastId });
          }
        }
      }
      // Refresh full list from server to get correct data
      setTimeout(() => {
        isFetchingRef.current = false;
        fetchData(undefined, undefined, undefined, true);
        fetchUploadHistory();
      }, 500);
    } catch (error: any) {
      console.error('Error resolving duplicates:', error);
      toast.error('Failed to resolve duplicate', { id: toastId });
    } finally {
      setDuplicateFiles([]);
      setPendingUploadFolderId(undefined);
      setIsDuplicateModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
        <span className="ml-3 text-sm text-gray-600">Loading resumes...</span>
      </div>
    );
  }

  return (
    <FeatureGate feature="resume_upload">
    <DndProvider backend={HTML5Backend}>
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
      <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'My Resumes' }]} />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div className="w-full sm:w-auto flex items-start gap-3">
          <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
            <FileText className="h-4 w-4 text-brand-blue" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">My Resume Database</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                {totalItems} Resumes
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">Resumes uploaded by you</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {canViewMyResumes && (
            <button
              onClick={openUploadHistoryModal}
              className="relative flex items-center justify-center gap-1.5 bg-white text-gray-700 px-3 py-2 rounded-md border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm flex-1 sm:flex-initial"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Upload History</span>
              <span className="sm:hidden">History</span>
              {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan/60 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-cyan text-white text-[10px] items-center justify-center">
                    {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length}
                  </span>
                </span>
              )}
            </button>
          )}
          {canUploadMyResumes && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-md transition-all text-sm flex-1 sm:flex-initial bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Resume</span>
              <span className="sm:hidden">Upload</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden">
        {/* Bulk Actions Bar - Shows at TOP when resumes selected */}
        {selectedResumes.length > 0 && (() => {
          // Detect the Archived Resumes folder context — when active, the
          // recruiter is looking at archived resumes, so swap Archive → Unarchive
          // and hide Apply-to-Job / Assessment / AI Talent Match (those actions
          // shouldn't apply to retired records).
          const archivedFolder = folders.find(f => f.name === 'Archived Resumes' && !f.parentId);
          const isArchivedContext =
            !!archivedFolder &&
            (selectedFolder === archivedFolder.id ||
              selectedResumes.every(id => resumes.find(r => r.id === id)?.isArchived));
          return (
          <BulkActionsBar
            selectedCount={selectedResumes.length}
            onCancel={() => setSelectedResumes([])}
            onMoveToFolder={canMoveMyResumes ? (folderId) => handleMoveToFolder(selectedResumes, folderId) : undefined}
            onApplyToJob={!isArchivedContext && hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job'))) ? handleApplyToJob : undefined}
            onDownload={handleBulkDownload}
            onDelete={canDeleteMyResumes ? () => handleDeleteResumes(selectedResumes) : undefined}
            folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
            onAssessment={!isArchivedContext && hasPlanFeature('assessment') && (isTenantAdmin || (hasPermission('canCreateAssessments') && hasPermissionCode('my_resumes:assessment'))) ? handleAssessment : undefined}
            onArchive={!isArchivedContext && canArchiveMyResumes ? () => handleArchiveResumes(selectedResumes) : undefined}
            onUnarchive={isArchivedContext && canArchiveMyResumes ? () => handleUnarchiveResumes(selectedResumes) : undefined}
            onAITalentMatch={!isArchivedContext && hasPlanFeature('ai_talent_match') && (isTenantAdmin || (hasPermission('canRunAiMatch') && hasPermissionCode('my_resumes:ai_match'))) ? handleAITalentMatch : undefined}
          />
          );
        })()}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-gray-200">
          <div className="flex-1 border-b sm:border-b-0 sm:border-r border-gray-200">
            <SearchFilterBarCompact
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              filters={filters}
              onFiltersChange={(newFilters: any) => { setFilters(newFilters); setCurrentPage(1); }}
              sortBy={sortBy}
              onSortChange={(newSort: string) => { setSortBy(newSort); setCurrentPage(1); }}
            />
          </div>
          {/* View Toggle */}
          <div className="flex items-center justify-center gap-1 px-3 sm:px-4 py-2 sm:py-3">
            <span className="text-xs text-gray-500 mr-1 sm:mr-2">View:</span>
            <div className="flex items-center gap-1 bg-brand-blue/5 ring-1 ring-brand-blue/10 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 sm:p-2 rounded transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                    : 'text-gray-600 hover:text-brand-blue'
                }`}
                aria-label="List View" title="List View"
              >
                <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`p-1.5 sm:p-2 rounded transition-all ${
                  viewMode === 'card'
                    ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                    : 'text-gray-600 hover:text-brand-blue'
                }`}
                aria-label="Card View" title="Card View"
              >
                <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Results Summary */}
        {appliedSearchQuery && (
          <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">
                Found <span className="font-semibold">{totalItems}</span> matching resume{totalItems !== 1 ? 's' : ''}
                {appliedSearchQuery && (
                  <span> for "<span className="font-medium text-brand-blue">{appliedSearchQuery}</span>"</span>
                )}
              </span>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setAppliedSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-sm text-red-600 hover:text-red-700 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {viewMode === 'list' ? (
          // List View with Folder Tree
          <div className="flex flex-col md:flex-row">
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={(folderId: string) => { setSelectedFolder(folderId); setCurrentPage(1); }}
              onCreateFolder={canUploadMyResumes ? handleCreateFolder : undefined}
              onRenameFolder={canUpdateMyResumes ? handleRenameFolder : undefined}
              onDeleteFolder={canDeleteMyResumes ? handleDeleteFolder : undefined}
              onUploadToFolder={(folderId) => {
                if (!canUploadMyResumes) return;
                setSelectedFolder(folderId);
                setIsUploadModalOpen(true);
              }}
              onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
              selectedResumes={selectedResumes}
              resumes={resumes}
              width={folderTreeWidth}
              onWidthChange={setFolderTreeWidth}
            />

            <div className="flex-1 flex flex-col min-w-0">
              {/* Breadcrumb Navigation for List View */}
              {selectedFolder && selectedFolder !== 'all' && (
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
                  <button
                    onClick={() => setSelectedFolder('all')}
                    className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>All Resumes</span>
                  </button>
                  {buildBreadcrumbPath(selectedFolder).map((item, index, arr) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      {index === arr.length - 1 ? (
                        <span className="text-gray-900 font-medium">{item.name}</span>
                      ) : (
                        <button
                          onClick={() => setSelectedFolder(item.id)}
                          className="text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                        >
                          {item.name}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination overlay for lighter page transitions */}
              <div className="relative">
                {isPaginating && (
                  <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-blue" />
                  </div>
                )}
                <ResumeTable
                  resumes={filteredResumes}
                  selectedResumes={selectedResumes}
                  onSelectResume={handleSelectResume}
                  onSelectAll={handleSelectAll}
                  onQuickView={(resume) => setQuickViewResume(resume)}
                  onApplyToJob={hasPlanFeature('resume_scoring') && (isTenantAdmin || (hasPermission('canRunScoring') && hasPermissionCode('my_resumes:apply_job'))) ? handleSingleResumeApplyToJob : undefined}
                  onDelete={canDeleteMyResumes ? (id) => handleDelete(id) : undefined}
                  onMoveToFolder={canMoveMyResumes ? handleMoveToFolder : undefined}
                  folders={folders.filter(f => f.id !== 'all' && !(f.name.toLowerCase() === 'root' && !f.parentId))}
                  onViewDetails={(resume) => {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(filteredResumes.map((r) => r.id)));
                    sessionStorage.setItem('resumeNavSource', 'my-resumes');
                    router.push(`/recruitment/resume-view/${resume.id}`);
                  }}
                  highlightQuery={appliedSearchQuery}
                  onArchive={canArchiveMyResumes ? (resumeId) => handleArchiveResumes([resumeId]) : undefined}
                  canShare={canShareMyResumes}
                  canTag={canUpdateMyResumes}
                  disablePagination={true}
                  isArchivedFolder={
                    folders.some(f => f.name === 'Archived Resumes' && !f.parentId && f.id === selectedFolder)
                  }
                  archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parentId)?.id}
                />
              </div>
              {totalPages > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                  onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                />
              )}
            </div>
          </div>
        ) : (
          // Card View - Folders as Cards with Breadcrumb Navigation
          <div className="p-3 sm:p-4 md:p-6">
            {(() => {
              // Get current folder data and children
              const currentFolderData = cardViewFolder ? getFolderById(cardViewFolder) : null;
              const folderName = currentFolderData?.name || 'All Folders';

              // Get folders to display (top-level or children of current folder)
              const foldersToDisplay = cardViewFolder === null
                ? folders.filter(f => f.id !== 'all' && !f.parentId) // Top-level folders
                : cardViewFolder === 'all'
                  ? [] // No subfolders in All Resumes view
                  : currentFolderData?.children || []; // Children of current folder

              // Get resumes for current folder (only direct resumes, not nested)
              const folderResumes = cardViewFolder === null
                ? [] // No resumes at root level view
                : cardViewFolder === 'all'
                  ? filteredResumes // Show all resumes
                  : filteredResumes.filter(r => r.folderId === cardViewFolder);

              // Group resumes by folder for counts (only needed at root level)
              const resumesByFolder = new Map<string, Resume[]>();
              if (cardViewFolder === null) {
                filteredResumes.forEach(resume => {
                  if (resume.folderId) {
                    const existing = resumesByFolder.get(resume.folderId) || [];
                    resumesByFolder.set(resume.folderId, [...existing, resume]);
                  }
                });
              }

              // Count resumes in a folder (including nested subfolders)
              const getResumeCountRecursive = (folder: FolderType): number => {
                let count = filteredResumes.filter(r => r.folderId === folder.id).length;
                if (folder.children) {
                  folder.children.forEach(child => {
                    count += getResumeCountRecursive(child);
                  });
                }
                return count;
              };

              return (
                <>
                  {/* Breadcrumb Navigation */}
                  {(cardViewFolder !== null || breadcrumbPath.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-4 sm:mb-6 text-xs sm:text-sm">
                      <button
                        onClick={() => navigateToFolder(null)}
                        className="flex items-center gap-1 text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        <span>All Folders</span>
                      </button>
                      {breadcrumbPath.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                          {index === breadcrumbPath.length - 1 ? (
                            <span className="text-gray-900 font-medium">{item.name}</span>
                          ) : (
                            <button
                              onClick={() => navigateToFolder(item.id)}
                              className="text-brand-blue hover:text-brand-blue-2 hover:underline transition-colors"
                            >
                              {item.name}
                            </button>
                          )}
                        </div>
                      ))}
                      {cardViewFolder === 'all' && (
                        <>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-900 font-medium">All Resumes</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Current Folder Header (when inside a folder) */}
                  {cardViewFolder !== null && cardViewFolder !== 'all' && currentFolderData && (
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ${
                        currentFolderData.name === 'Archived Resumes' && !currentFolderData.parentId
                          ? 'bg-brand-orange/10 ring-brand-orange/15'
                          : currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'bg-green-100 ring-green-200/60'
                            : 'bg-brand-blue/10 ring-brand-blue/15'
                      }`}>
                        {currentFolderData.name === 'Archived Resumes' && !currentFolderData.parentId ? (
                          <Archive className="w-5 h-5 sm:w-6 sm:h-6 text-brand-orange-deep" />
                        ) : (
                          <FolderOpen className={`w-5 h-5 sm:w-6 sm:h-6 ${
                            currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                              ? 'text-green-600'
                              : 'text-brand-blue'
                          }`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-gray-900 text-base sm:text-lg truncate">
                          {currentFolderData.name.toLowerCase() === 'root' && !currentFolderData.parentId
                            ? 'Root (Default)'
                            : currentFolderData.name}
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-500">
                          {foldersToDisplay.length > 0 && `${foldersToDisplay.length} subfolder${foldersToDisplay.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length > 0 && folderResumes.length > 0 && ' • '}
                          {folderResumes.length > 0 && `${folderResumes.length} resume${folderResumes.length !== 1 ? 's' : ''}`}
                          {foldersToDisplay.length === 0 && folderResumes.length === 0 && 'Empty folder'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* All Resumes Header */}
                  {cardViewFolder === 'all' && (
                    <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                        <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-gray-900 text-base sm:text-lg">All Resumes</h2>
                        <p className="text-xs sm:text-sm text-gray-500">{folderResumes.length} resume{folderResumes.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  )}

                  {/* Subfolders Grid (if any) */}
                  {(foldersToDisplay.length > 0 || cardViewFolder === null) && (
                    <div className="mb-4 sm:mb-6">
                      {cardViewFolder !== null && (
                        <h3 className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Subfolders</h3>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                        {/* All Resumes card at root level */}
                        {cardViewFolder === null && (
                          <div
                            className="bg-white border border-brand-blue/20 ring-1 ring-black/[0.02] rounded-xl shadow-sm shadow-brand-blue/5 overflow-hidden cursor-pointer hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => {
                              setCardViewFolder('all');
                              setBreadcrumbPath([]);
                            }}
                          >
                            <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 text-brand-blue" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm sm:text-base text-gray-900 truncate">All Resumes</h3>
                                <p className="text-xs sm:text-sm text-gray-500">{totalItems} resume{totalItems !== 1 ? 's' : ''}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            </div>
                          </div>
                        )}

                        {foldersToDisplay.map((folder) => {
                          // Use folder.count from backend API (total count) instead of recalculating from current page
                          const resumeCount = folder.count || 0;
                          const hasSubfolders = folder.children && folder.children.length > 0;
                          const isArchived = folder.name === 'Archived Resumes' && !folder.parentId;
                          const isRoot = folder.name.toLowerCase() === 'root' && !folder.parentId;

                          return (
                            <DroppableFolderCard
                              key={folder.id}
                              folder={folder}
                              resumeCount={resumeCount}
                              hasSubfolders={hasSubfolders || false}
                              isArchived={isArchived}
                              isRoot={isRoot}
                              onNavigate={navigateToFolder}
                              onMoveToFolder={handleMoveToFolder}
                            />
                          );
                        })}

                      </div>
                    </div>
                  )}

                  {/* Loading state at root level (folders/resumes not yet fetched) */}
                  {loading && cardViewFolder === null && foldersToDisplay.length === 0 && (
                    <div className="text-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-3 animate-spin" />
                      <p className="text-sm text-gray-500">Loading folders…</p>
                    </div>
                  )}

                  {/* Empty state for root level */}
                  {!loading && cardViewFolder === null && foldersToDisplay.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                        <Folder className="w-8 h-8 text-brand-blue" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No folders found</h3>
                      <p className="text-gray-500">Create folders to organize your resumes</p>
                    </div>
                  )}

                  {/* Resumes Section (when inside a folder) */}
                  {cardViewFolder !== null && (
                    <>
                      {folderResumes.length > 0 && (
                        <div>
                          {foldersToDisplay.length > 0 && (
                            <h3 className="text-sm font-medium text-gray-700 mb-3">Resumes in this folder</h3>
                          )}
                          {/* Resumes Table - Desktop */}
                      <div className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl overflow-hidden">
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                        {/* Table Header */}
                        <div className="grid grid-cols-[32px_auto_1fr_1fr_1fr_1fr_1fr_80px_100px_80px_60px_100px] gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[1200px]">
                          <div></div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={folderResumes.length > 0 && folderResumes.every(r => selectedResumes.includes(r.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedResumes(prev => [...new Set([...prev, ...folderResumes.map(r => r.id)])]);
                                } else {
                                  setSelectedResumes(prev => prev.filter(id => !folderResumes.find(r => r.id === id)));
                                }
                              }}
                              className="w-4 h-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40"
                            />
                          </div>
                          <div>Candidate Name</div>
                          <div>Email</div>
                          <div>Phone</div>
                          <div>Skills</div>
                          <div>Experience</div>
                          <div>Source</div>
                          <div>Upload Date</div>
                          <div>Uploaded By</div>
                          <div>Files</div>
                          <div>Actions</div>
                        </div>
                        {/* Table Body */}
                        {folderResumes.map((resume, index) => (
                          <DraggableCardResumeRow
                            key={resume.id}
                            resume={resume}
                            selectedResumes={selectedResumes}
                            isLast={index === folderResumes.length - 1}
                            onSelect={handleSelectResume}
                            onQuickView={(r) => setQuickViewResume(r)}
                            onDelete={canDeleteMyResumes ? handleDelete : undefined}
                            onViewDetails={(r) => {
                              sessionStorage.setItem('resumeNavList', JSON.stringify(folderResumes.map((x) => x.id)));
                              sessionStorage.setItem('resumeNavSource', 'my-resumes');
                              router.push(`/recruitment/resume-view/${r.id}`);
                            }}
                          />
                        ))}
                        </div>

                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-3 p-3">
                          {folderResumes.map((resume) => (
                            <div
                              key={resume.id}
                              className={`bg-white border rounded-lg p-4 cursor-pointer hover:shadow-md hover:shadow-brand-blue/10 hover:border-brand-blue/30 transition-all ${
                                selectedResumes.includes(resume.id) ? 'border-brand-blue/50 bg-brand-blue/5 ring-1 ring-brand-blue/30' : 'border-gray-200'
                              }`}
                              onClick={() => {
                                sessionStorage.setItem('resumeNavList', JSON.stringify(folderResumes.map((x) => x.id)));
                                sessionStorage.setItem('resumeNavSource', 'my-resumes');
                                router.push(`/recruitment/resume-view/${resume.id}`);
                              }}
                            >
                              <div className="flex items-start gap-3 mb-3">
                                <input
                                  type="checkbox"
                                  checked={selectedResumes.includes(resume.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleSelectResume(resume.id);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 mt-1"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 truncate">{resume.name}</div>
                                  <div className="text-sm text-gray-500 truncate">{resume.email || '-'}</div>
                                </div>
                              </div>
                              <div className="space-y-2 text-sm mb-3">
                                {resume.phone && resume.phone !== 'No phone' && (
                                  <div className="text-gray-600 truncate">{resume.phone}</div>
                                )}
                                {resume.experience && (
                                  <div className="text-gray-600">{resume.experience} exp.</div>
                                )}
                                {getDisplaySkills(resume).length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    <SkillsList
                                      skills={getDisplaySkills(resume)}
                                      chipClassName="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded text-xs border border-brand-blue/20"
                                      moreClassName="px-2 py-0.5 text-brand-blue text-xs font-medium rounded hover:bg-brand-blue/10 transition-colors cursor-pointer"
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setQuickViewResume(resume); }}
                                  className="flex-1 px-3 py-2 text-sm text-gray-700 bg-brand-blue/5 hover:bg-brand-blue/10 hover:text-brand-blue ring-1 ring-brand-blue/10 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  View
                                </button>
                                {canDeleteMyResumes && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(resume.id); }}
                                    className="px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center justify-center gap-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                        </div>
                      )}

                      {/* Loading state while the folder's resumes are being fetched */}
                      {loading && folderResumes.length === 0 && foldersToDisplay.length === 0 && (
                        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
                          <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-3 animate-spin" />
                          <p className="text-sm text-gray-500">Loading resumes…</p>
                        </div>
                      )}

                      {/* Empty state when no resumes and no subfolders */}
                      {!loading && folderResumes.length === 0 && foldersToDisplay.length === 0 && (
                        <div className="text-center py-12 bg-white border-2 border-dashed border-brand-blue/20 rounded-xl">
                          <div className="w-16 h-16 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                            <FileText className="w-8 h-8 text-brand-blue" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-2 tracking-tight">No resumes in this folder</h3>
                          <p className="text-gray-500">Upload resumes to this folder to get started</p>
                        </div>
                      )}

                      {/* Card view pagination */}
                      {totalPages > 0 && folderResumes.length > 0 && (
                        <div className="mt-4">
                          <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={(page) => { setCurrentPage(page); setIsPaginating(true); }}
                            onItemsPerPageChange={(size) => { setItemsPerPage(size); setCurrentPage(1); setIsPaginating(true); }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <UploadModal
          folders={folders.filter(f => f.id !== 'all' && !(f.name === 'Archived Resumes' && !f.parentId))}
          tenant={null}
          // Pre-select whichever folder the user is currently browsing.
          // Card view uses `cardViewFolder` (drill-down navigation), list view
          // uses `selectedFolder`. Skip the synthetic 'all' value — it's a
          // filter, not a real folder the API knows about. When no folder is
          // selected, the backend routes the upload to the user's root folder.
          targetFolder={(() => {
            const card = cardViewFolder && cardViewFolder !== 'all'
              ? cardViewFolder
              : null;
            const list = selectedFolder && selectedFolder !== 'all' ? selectedFolder : null;
            return card || list || undefined;
          })()}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUploadResumes}
          onCreateFolder={handleCreateFolder}
          onViewResume={(resumeId) => {
            setIsUploadModalOpen(false);
            sessionStorage.setItem('resumeNavSource', 'my-resumes');
            router.push(`/recruitment/resume-view/${resumeId}`);
          }}
          onDuplicateDetected={(duplicateData) => {
            // Set duplicate files for the DuplicateResumeModal
            setDuplicateFiles([{
              file: duplicateData.file,
              existingResume: duplicateData.existingResume,
              contentDifferences: duplicateData.contentDifferences || [],
              isDuplicate: duplicateData.isDuplicate,
            }]);
            setPendingUploadFolderId(duplicateData.targetFolderId);
            setIsUploadModalOpen(false);
            setIsDuplicateModalOpen(true);
          }}
        />
      )}

      {quickViewResume && (
        <ResumeQuickViewModal
          resume={quickViewResume}
          onClose={() => setQuickViewResume(null)}
        />
      )}

      {/* Duplicate Resume Modal */}
      {isDuplicateModalOpen && duplicateFiles.length > 0 && (
        <DuplicateResumeModal
          duplicates={duplicateFiles}
          onClose={() => {
            setIsDuplicateModalOpen(false);
            setDuplicateFiles([]);
            setPendingUploadFolderId(undefined);
          }}
          onResolve={handleResolveDuplicates}
        />
      )}

      {/* Loading overlay for version fetch */}
      {isLoadingVersions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3 shadow-2xl shadow-brand-blue/10">
            <Loader2 className="w-6 h-6 text-brand-blue animate-spin" />
            <span className="text-gray-700">Loading versions...</span>
          </div>
        </div>
      )}

      {/* Version Selector Modal (for single candidate apply) */}
      {versionSelectorResume && versionSelectorResume.versions && versionSelectorResume.versions.length > 0 && (
        <ResumeVersionSelector
          resume={versionSelectorResume}
          onSelect={handleVersionSelect}
          onClose={() => setVersionSelectorResume(null)}
        />
      )}

      {/* Apply to Job Modal */}
      {isApplyToJobModalOpen && (
        <ApplyToJobModal
          resumes={
            singleResumeToApply
              ? [singleResumeToApply]
              : uploadedResumeToScore
                ? resumes.filter(r => r.id === uploadedResumeToScore.id)
                : resumes.filter(r => selectedResumes.includes(r.id))
          }
          jobs={publishedJobs}
          onClose={() => {
            setIsApplyToJobModalOpen(false);
            setUploadedResumeToScore(null);
            setSingleResumeToApply(null);
          }}
          onApply={handleApplyToJobSubmit}
        />
      )}

      {/* Duplicate Scoring Warning Modal */}
      {duplicateScoringWarning.isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center gap-4 p-6 border-b border-gray-200">
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Already Scored - Duplicate Warning</h3>
                  <p className="text-sm text-gray-500">{duplicateScoringWarning.jobTitle}</p>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <p className="text-gray-700 mb-4">
                  <span className="font-semibold text-red-600">{duplicateScoringWarning.existingScores.length} candidate(s)</span> have already been scored for this job description.
                </p>

                {/* List of duplicate candidates */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    Already Scored - Will NOT be Re-scored:
                  </h4>
                  <div className="space-y-2">
                    {duplicateScoringWarning.existingScores.map((score, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-200">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                            <X className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{score.candidate_name}</div>
                            {score.scored_at && (
                              <div className="text-xs text-gray-500">
                                Scored on {formatDateTimeIST(score.scored_at)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{score.overall_score}%</div>
                          <div className="text-xs text-gray-500 capitalize">{score.match_status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {duplicateScoringWarning.newCount > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-green-700">{duplicateScoringWarning.newCount} new candidate(s)</span> will be scored if you continue.
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">
                      All selected candidates are already scored. No new candidates to score.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
                <button
                  onClick={() => setDuplicateScoringWarning({ isOpen: false, jobId: '', jobTitle: '', resumeIds: [], existingScores: [], newCount: 0 })}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                {duplicateScoringWarning.newCount > 0 && (
                  <button
                    onClick={handleScoreOnlyNew}
                    className="flex items-center gap-2 px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Score Only New ({duplicateScoringWarning.newCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ZIP Download Confirmation Modal */}
      {isZipDownloadModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => !isDownloadingZip && setIsZipDownloadModalOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-md animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center gap-4 p-6 border-b border-gray-200">
                <div className="w-12 h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                  <Archive className="w-6 h-6 text-brand-blue" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Download as ZIP</h3>
                  <p className="text-sm text-gray-500">Multiple files selected</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700">
                  You have selected <span className="font-semibold text-gray-900">{selectedResumes.length} candidates</span>.
                </p>
                <p className="text-gray-600 mt-2">
                  Do you want to download all selected resumes as a ZIP file?
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-200">
                <button
                  onClick={() => setIsZipDownloadModalOpen(false)}
                  disabled={isDownloadingZip}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleZipDownload}
                  disabled={isDownloadingZip}
                  className="flex items-center gap-2 px-4 py-2 text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloadingZip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Continue
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload History Sheet (Slide-in Panel) */}
      {/* Minimized Upload History Floating Indicator */}
      {isUploadHistoryMinimized && (
        <div
          onClick={() => {
            setIsUploadHistoryMinimized(false);
            setIsUploadHistoryModalOpen(true);
          }}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 bg-brand-blue hover:bg-brand-blue-2 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl shadow-lg shadow-brand-blue/30 ring-1 ring-white/10 transition-all cursor-pointer flex items-center gap-2 sm:gap-3 animate-in slide-in-from-bottom duration-300"
        >
          <div className="relative">
            <History className="w-5 h-5" />
            {uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-orange rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">Upload History</p>
            <p className="text-xs text-blue-100">
              {(() => {
                const processing = uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length;
                return processing > 0 ? `${processing} processing...` : 'Click to expand';
              })()}
            </p>
          </div>
          <Maximize2 className="w-4 h-4 ml-2" />
        </div>
      )}

      {isUploadHistoryModalOpen && !isUploadHistoryMinimized && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-300"
            onClick={() => {
              setIsUploadHistoryMinimized(true);
              setIsUploadHistoryModalOpen(false);
            }}
          />
          {/* Centered Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-brand-blue/[0.06] via-brand-cyan/[0.04] to-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-xl font-semibold text-gray-900 tracking-tight">Upload History</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">View all past bulk upload reports</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsUploadHistoryMinimized(true);
                        setIsUploadHistoryModalOpen(false);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-xl font-medium"
                      aria-label="Minimize" title="Minimize"
                    >
                      −
                    </button>
                    <button
                      onClick={handleCloseUploadHistory}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Close" title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-slate-50">
                {(() => {
                  const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');
                  const isActive = (r: any) => r.status === 'processing' || r.pending > 0;
                  const activeRecords = myResumesHistory.filter(isActive);
                  const completedRecords = myResumesHistory.filter(r => !isActive(r));

                  // Stats are scoped to the records in the active tab — when a
                  // batch finishes its numbers move from Currently Processing
                  // into Completed automatically.
                  const displayRecords = uploadHistoryTab === 'current' ? activeRecords : completedRecords;
                  const completedCount = displayRecords.reduce((sum, r) => sum + (r.completed || 0), 0);
                  const duplicatedCount = displayRecords.reduce((sum, r) => sum + (r.duplicated || 0), 0);
                  const versionedCount = displayRecords.reduce((sum, r) => sum + (r.versioned || 0), 0);
                  const failedCount = displayRecords.reduce((sum, r) => sum + (r.errors || 0), 0);
                  const pendingCount = displayRecords.reduce((sum, r) => sum + (r.pending || 0), 0);
                  // Fall back to the item list for batches whose row predates the `cancelled` column.
                  const cancelledTotal = displayRecords.reduce((sum, r) => sum + Math.max(
                    r.cancelled || 0,
                    r.statuses?.filter((s: any) => s.status === 'cancelled' || s.status === 'discarded').length || 0,
                  ), 0);
                  const totalFiles = displayRecords.reduce((sum, r) => sum + (r.totalFiles || 0), 0);
                  // Cancelled files were never attempted, so they must not count against
                  // the success rate — that is what turned a cancelled batch into "23%".
                  const attemptedFiles = Math.max(0, totalFiles - cancelledTotal);
                  const successRate = attemptedFiles > 0 ? Math.round((completedCount / attemptedFiles) * 100) : 0;

                  return (
                    <>
                      {/* Tabs */}
                      <div className="inline-flex items-center bg-white border border-gray-100 ring-1 ring-black/[0.02] rounded-lg p-1 mb-4 sm:mb-6 shadow-sm shadow-brand-blue/5">
                        <button
                          onClick={() => setUploadHistoryTab('current')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            uploadHistoryTab === 'current'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeRecords.length > 0 && uploadHistoryTab !== 'current' ? 'text-brand-blue animate-spin' : ''}`} />
                          Currently Processing
                          {activeRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                              uploadHistoryTab === 'current' ? 'bg-white text-brand-blue' : 'bg-brand-blue/10 text-brand-blue'
                            }`}>
                              {activeRecords.length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setUploadHistoryTab('completed')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            uploadHistoryTab === 'completed'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Completed
                          {completedRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                              uploadHistoryTab === 'completed' ? 'bg-white text-brand-blue' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {completedRecords.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* 7-card stats grid — same layout in both tabs, scoped to
                          the tab's records. Brand palette throughout, except the
                          neutral Cancelled card. When
                          every number is zero the grid is replaced by a single
                          "nothing here" card, so a wall of zeros never shows. */}
                      {(() => {
                        const statCards = [
                          { key: 'completed', label: 'Completed', value: completedCount, icon: CheckCircle, tone: 'brand-blue' },
                          { key: 'duplicated', label: 'Duplicates', value: duplicatedCount, icon: Copy, tone: 'brand-orange' },
                          { key: 'versioned', label: 'Versioned', value: versionedCount, icon: GitBranch, tone: 'brand-blue-2' },
                          { key: 'error', label: 'Failed', value: failedCount, icon: AlertCircle, tone: 'brand-orange-deep' },
                          { key: 'pending', label: 'Pending', value: pendingCount, icon: Clock, tone: 'brand-teal' },
                          { key: 'cancelled', label: 'Cancelled', value: cancelledTotal, icon: Ban, tone: 'gray' },
                        ] as const;

                        // Tailwind needs whole class names, so map tone → classes.
                        const TONE_CLASS: Record<string, { card: string; active: string; idle: string; tile: string; value: string }> = {
                          'brand-blue': {
                            card: 'from-brand-blue/[0.08] to-brand-blue/[0.03]',
                            active: 'border-brand-blue/50 ring-2 ring-brand-blue/30 shadow-md',
                            idle: 'border-brand-blue/20',
                            tile: 'bg-brand-blue',
                            value: 'text-brand-blue',
                          },
                          'brand-blue-2': {
                            card: 'from-brand-blue-2/[0.08] to-brand-blue-2/[0.03]',
                            active: 'border-brand-blue-2/50 ring-2 ring-brand-blue-2/30 shadow-md',
                            idle: 'border-brand-blue-2/20',
                            tile: 'bg-brand-blue-2',
                            value: 'text-brand-blue-2',
                          },
                          'brand-cyan': {
                            card: 'from-brand-cyan/[0.08] to-brand-cyan/[0.03]',
                            active: 'border-brand-cyan/50 ring-2 ring-brand-cyan/30 shadow-md',
                            idle: 'border-brand-cyan/20',
                            tile: 'bg-brand-cyan',
                            value: 'text-brand-cyan',
                          },
                          'brand-teal': {
                            card: 'from-brand-teal/[0.08] to-brand-teal/[0.03]',
                            active: 'border-brand-teal/50 ring-2 ring-brand-teal/30 shadow-md',
                            idle: 'border-brand-teal/20',
                            tile: 'bg-brand-teal',
                            value: 'text-brand-teal',
                          },
                          'brand-orange': {
                            card: 'from-brand-orange/[0.08] to-brand-orange/[0.03]',
                            active: 'border-brand-orange/50 ring-2 ring-brand-orange/30 shadow-md',
                            idle: 'border-brand-orange/20',
                            tile: 'bg-brand-orange',
                            value: 'text-brand-orange-deep',
                          },
                          'brand-orange-deep': {
                            card: 'from-brand-orange-deep/[0.08] to-brand-orange-deep/[0.03]',
                            active: 'border-brand-orange-deep/50 ring-2 ring-brand-orange-deep/30 shadow-md',
                            idle: 'border-brand-orange-deep/20',
                            tile: 'bg-brand-orange-deep',
                            value: 'text-brand-orange-deep',
                          },
                          // Cancelled is deliberately off-palette: it's an
                          // absence of work, not a result.
                          'gray': {
                            card: 'from-gray-100 to-gray-200/50',
                            active: 'border-gray-700 ring-2 ring-gray-400 shadow-md',
                            idle: 'border-gray-300',
                            tile: 'bg-gray-600',
                            value: 'text-gray-800',
                          },
                        };

                        const allZero = statCards.every(card => (card.value || 0) === 0) && totalFiles === 0;

                        if (allZero) {
                          return (
                            <div className="flex items-center gap-3 mb-4 sm:mb-6 bg-gradient-to-br from-brand-blue/[0.08] to-brand-blue/[0.03] border border-brand-blue/20 rounded-xl p-4">
                              <div className="w-9 h-9 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {uploadHistoryTab === 'current' ? 'No uploads in progress' : 'No completed uploads yet'}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {uploadHistoryTab === 'current'
                                    ? 'Upload resumes to see live progress and status counts here.'
                                    : 'Finished upload batches and their status counts will appear here.'}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                            {statCards.map(({ key, label, value, icon: Icon, tone }) => {
                              const t = TONE_CLASS[tone];
                              const isActive = uploadHistoryFilter === key;
                              return (
                                <div
                                  key={key}
                                  onClick={() => setUploadHistoryFilter(isActive ? null : key)}
                                  className={`bg-gradient-to-br ${t.card} border rounded-xl p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-all hover:shadow-md ${isActive ? t.active : t.idle}`}
                                >
                                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 ${t.tile} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                    </div>
                                    <span className="text-[10px] sm:text-xs text-gray-700 truncate">{label}</span>
                                  </div>
                                  <div className={`text-lg sm:text-xl lg:text-2xl font-bold tracking-tight ${t.value}`}>{value}</div>
                                </div>
                              );
                            })}

                            {/* Success Rate — not a filter, so it stays static */}
                            <div className="bg-gradient-to-br from-brand-cyan/[0.08] to-brand-cyan/[0.03] border border-brand-cyan/20 rounded-xl p-2.5 sm:p-3 lg:p-4">
                              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1.5 sm:mb-2">
                                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-brand-cyan rounded-lg flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                </div>
                                <span className="text-[10px] sm:text-xs text-gray-700 truncate">Success Rate</span>
                              </div>
                              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-brand-cyan tracking-tight">{successRate}%</div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Active Filter Indicator */}
                      {uploadHistoryFilter && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                          <span className="text-xs text-gray-500">Filtering by:</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            uploadHistoryFilter === 'completed' ? 'bg-brand-blue/10 text-brand-blue' :
                            uploadHistoryFilter === 'duplicated' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                            uploadHistoryFilter === 'versioned' ? 'bg-brand-blue-2/10 text-brand-blue-2' :
                            uploadHistoryFilter === 'error' ? 'bg-brand-orange-deep/10 text-brand-orange-deep' :
                            uploadHistoryFilter === 'cancelled' ? 'bg-gray-200 text-gray-800' :
                            'bg-brand-teal/10 text-brand-teal'
                          }`}>
                            {uploadHistoryFilter === 'completed' ? 'Completed' :
                             uploadHistoryFilter === 'duplicated' ? 'Duplicates' :
                             uploadHistoryFilter === 'versioned' ? 'Versioned' :
                             uploadHistoryFilter === 'error' ? 'Failed' :
                             uploadHistoryFilter === 'cancelled' ? 'Cancelled' :
                             'Pending'}
                          </span>
                          <button
                            onClick={() => setUploadHistoryFilter(null)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
                           aria-label="Close">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Overall ETA Banner — only relevant on the Currently Processing tab */}
                      {uploadHistoryTab === 'current' && (() => {
                        // Only show for batches that still have genuinely active items
                        const activeBatches = myResumesHistory.filter(r =>
                          r.pending > 0 && r.date &&
                          r.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing')
                        );
                        if (activeBatches.length === 0) return null;
                        const totalPending = activeBatches.reduce((sum: number, r: any) => sum + r.pending, 0);
                        const totalProcessed = activeBatches.reduce((sum: number, r: any) => sum + r.completed + r.errors + r.duplicated + (r.versioned || 0), 0);
                        if (totalProcessed <= 0) {
                          return (
                            <div className="flex items-center gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue animate-spin flex-shrink-0" />
                              <span className="text-xs sm:text-sm text-brand-blue">Processing {totalPending} resume{totalPending !== 1 ? 's' : ''}... Estimating time remaining</span>
                            </div>
                          );
                        }
                        // Cap elapsed at 10 minutes so a batch that started hours ago with a
                        // stuck file doesn't produce an absurd ETA (e.g. "233–433 mins remaining").
                        const earliestStart = Math.min(...activeBatches.map((r: any) => new Date(r.date).getTime()));
                        const elapsed = Math.min(Date.now() - earliestStart, 10 * 60 * 1000);
                        const avgTimePerFile = elapsed / totalProcessed;
                        const remainingMs = totalPending * avgTimePerFile;
                        const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                        const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                        const etaText = lowMins === highMins
                          ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                          : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
                        return (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/10 border border-brand-blue/20 rounded-xl">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0" />
                              <span className="text-xs sm:text-sm font-medium text-brand-blue">{etaText}</span>
                            </div>
                            <span className="text-[10px] sm:text-xs text-brand-blue/60 sm:ml-auto">{totalPending} resume{totalPending !== 1 ? 's' : ''} left across {activeBatches.length} batch{activeBatches.length !== 1 ? 'es' : ''}</span>
                          </div>
                        );
                      })()}

                      {/* Upload History List */}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {uploadHistoryTab === 'current' ? 'Active Uploads' : 'Recent Uploads'}
                        </h3>
                        <span className="text-xs text-gray-500">{displayRecords.length} batch{displayRecords.length !== 1 ? 'es' : ''}</span>
                      </div>

                      {displayRecords.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-8 sm:py-12">
                          <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-3 sm:mb-4 ring-1 ${
                            uploadHistoryTab === 'current' ? 'bg-brand-cyan/10 ring-brand-cyan/20' : 'bg-brand-blue/10 ring-brand-blue/15'
                          }`}>
                            {uploadHistoryTab === 'current' ? (
                              <CheckCircle className="w-7 h-7 sm:w-10 sm:h-10 text-brand-cyan" />
                            ) : (
                              <FileText className="w-7 h-7 sm:w-10 sm:h-10 text-brand-blue" />
                            )}
                          </div>
                          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1.5 sm:mb-2">
                            {uploadHistoryTab === 'current'
                              ? 'No uploads in progress'
                              : myResumesHistory.length === 0 ? 'No upload history' : 'Nothing here yet'}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-500 max-w-sm px-4">
                            {uploadHistoryTab === 'current'
                              ? 'All your uploads are processed. Start a new bulk upload to see live progress here.'
                              : myResumesHistory.length === 0
                                ? 'Bulk upload reports will appear here. Upload multiple resumes to see detailed status reports.'
                                : 'Active uploads will appear in the Currently Processing tab until they finish.'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {displayRecords
                            .slice(0, 20)
                            .map(record => {
                              // Prefer the server counter, but fall back to the item list so an
                              // older batch row (written before `cancelled` existed) still adds up.
                              const cancelledFromItems = record.statuses?.filter(
                                (s: any) => s.status === 'cancelled' || s.status === 'discarded'
                              ).length ?? 0;
                              const cancelledCount = Math.max(record.cancelled ?? 0, cancelledFromItems);
                              const processed = record.completed + record.errors + record.duplicated + (record.versioned || 0) + cancelledCount;
                              // Files the batch counters can't explain. If this is ever non-zero the
                              // summary is under-reporting, and we say so instead of hiding it.
                              const unaccountedCount = Math.max(0, (record.totalFiles || 0) - processed - (record.pending || 0));
                              // Success is measured against files that were actually attempted —
                              // cancelling 77 of 100 is not a 23% failure of the upload.
                              const attempted = Math.max(0, (record.totalFiles || 0) - cancelledCount);
                              const percentage = attempted > 0 ? Math.round((record.completed / attempted) * 100) : 100;
                              const isUploading = record.status === 'uploading';
                              const isProcessing = record.status === 'processing' || record.pending > 0;
                              const isCancelled = cancelledCount > 0;
                              // Optimistic pre-API record: its id and item ids are `temp-*`
                              // placeholders, not UUIDs. Every retry/cancel endpoint takes UUID
                              // path params, so any action fired against it 422s on uuid_parsing.
                              const isTempRecord = record.id.startsWith('temp-');
                              const hasErrors = record.errors > 0;
                              const hasIssues = record.duplicated > 0 || (record.versioned || 0) > 0 || record.errors > 0 || cancelledCount > 0;

                              return (
                                <div
                                  key={record.id}
                                  className="bg-white border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 rounded-xl p-3 sm:p-4 lg:p-5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                                >
                                  {/* Header Row */}
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 sm:mb-4 gap-2 sm:gap-3">
                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="font-medium text-gray-900 text-xs sm:text-sm block truncate">{record.fileName}</span>
                                        {record.date && (
                                          <span className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Calendar className="w-3 h-3 flex-shrink-0" />
                                            <span className="truncate">Started {formatDateTimeIST(record.date)}</span>
                                          </span>
                                        )}
                                        {record.completedAt && record.pending === 0 && (() => {
                                          const start = new Date(record.date).getTime();
                                          const end = new Date(record.completedAt).getTime();
                                          const ms = Math.max(0, end - start);
                                          const totalSec = Math.round(ms / 1000);
                                          const h = Math.floor(totalSec / 3600);
                                          const m = Math.floor((totalSec % 3600) / 60);
                                          const s = totalSec % 60;
                                          const duration = h > 0
                                            ? `${h}h ${m}m ${s}s`
                                            : m > 0
                                              ? `${m}m ${s}s`
                                              : `${s}s`;
                                          return (
                                            <span className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                              <CheckCircle className="w-3 h-3 flex-shrink-0 text-brand-blue" />
                                              <span className="truncate">
                                                Finished {formatDateTimeIST(record.completedAt)}
                                                <span className="ml-1.5 text-gray-400">·</span>
                                                <span className="ml-1.5 text-gray-700 font-medium">{duration}</span>
                                              </span>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 sm:gap-3 ml-10 sm:ml-0">
                                      {isUploading && (
                                        <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-blue/10 text-brand-blue text-[10px] sm:text-xs rounded-full border border-brand-blue/20 animate-pulse">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Uploading...
                                        </span>
                                      )}
                                      {!isUploading && hasIssues && (
                                        <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-orange/15 text-brand-orange-deep text-[10px] sm:text-xs rounded-full border border-brand-orange/30">
                                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                          <span className="hidden sm:inline">Needs Review</span>
                                          <span className="sm:hidden">Review</span>
                                        </span>
                                      )}
                                      {!isUploading && (
                                        <div className="text-right">
                                          <div className={`text-base sm:text-xl font-bold tracking-tight ${
                                            percentage === 100 ? 'text-brand-blue' :
                                            percentage >= 90 ? 'text-brand-cyan' :
                                            percentage >= 70 ? 'text-brand-orange' :
                                            'text-brand-orange-deep'
                                          }`}>
                                            {percentage}%
                                          </div>
                                          <div className="text-[10px] sm:text-xs text-gray-500">Success</div>
                                        </div>
                                      )}
                                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                                    </div>
                                  </div>

                                  {/* Mini Stats */}
                                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                                    {/* Mini stats use the same brand tones as the summary cards above */}
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-blue/[0.06] rounded-lg border border-brand-blue/15">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-blue">{record.completed}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">Done</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-orange/[0.08] rounded-lg border border-brand-orange/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-orange-deep">{record.duplicated}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">Duplicates</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-blue-2/[0.07] rounded-lg border border-brand-blue-2/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-blue-2">{record.versioned || 0}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">Version</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-orange-deep/[0.08] rounded-lg border border-brand-orange-deep/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-orange-deep">{record.errors}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">Failed</div>
                                    </div>
                                    <div className="text-center p-1.5 sm:p-2 bg-brand-teal/[0.08] rounded-lg border border-brand-teal/20">
                                      <div className="text-xs sm:text-sm font-semibold text-brand-teal">{record.pending}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">Pending</div>
                                    </div>
                                    {/* Cancelled — previously had no tile, so cancelled files simply
                                        disappeared from the batch summary (23 of 100, nothing failed). */}
                                    <div className="text-center p-1.5 sm:p-2 bg-gray-100 rounded-lg border border-gray-300">
                                      <div className="text-xs sm:text-sm font-semibold text-gray-700">{cancelledCount}</div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">Cancelled</div>
                                    </div>
                                  </div>
                                  {unaccountedCount > 0 && (
                                    <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] sm:text-xs text-amber-800">
                                      <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                                      <span>
                                        {unaccountedCount} file{unaccountedCount !== 1 ? 's' : ''} in this batch {unaccountedCount !== 1 ? 'are' : 'is'} not
                                        reflected in the totals above — open the file list below for their actual state.
                                      </span>
                                    </div>
                                  )}

                                  {/* Progress Bar */}
                                  <div className="mb-3 sm:mb-4">
                                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-600 mb-1 sm:mb-1.5">
                                      <span>Progress</span>
                                      <span>{processed} of {record.totalFiles}</span>
                                    </div>
                                    <div className="h-1.5 sm:h-2 bg-brand-blue/10 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all ${
                                          percentage === 100 ? 'bg-brand-blue' :
                                          percentage >= 90 ? 'bg-brand-cyan' :
                                          percentage >= 70 ? 'bg-brand-orange' :
                                          'bg-brand-orange-deep'
                                        }`}
                                        style={{ width: `${Math.min((processed / record.totalFiles) * 100, 100)}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Estimated Time Remaining — only show when items are genuinely active */}
                                  {record.pending > 0 && record.date &&
                                   record.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing') &&
                                   (() => {
                                    // Cap elapsed at 10 minutes to prevent absurd ETAs when a file
                                    // is stuck at 'processing' and the batch started hours ago.
                                    const elapsed = Math.min(Date.now() - new Date(record.date).getTime(), 10 * 60 * 1000);
                                    if (processed <= 0 || elapsed <= 0) {
                                      return (
                                        <div className="flex items-center gap-1.5 mb-3 sm:mb-4 text-[10px] sm:text-xs text-blue-600">
                                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                          <span>Estimating time remaining...</span>
                                        </div>
                                      );
                                    }
                                    const avgTimePerFile = elapsed / processed;
                                    const remainingMs = record.pending * avgTimePerFile;
                                    const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                                    const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                                    const etaText = lowMins === highMins
                                      ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                                      : `Approx. ${lowMins}\u2013${highMins} mins remaining`;
                                    return (
                                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-0.5 sm:gap-1.5 mb-3 sm:mb-4 text-[10px] sm:text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2.5 sm:px-3 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                                          <span>{etaText}</span>
                                        </div>
                                        <span className="text-blue-400 sm:ml-auto">{record.pending} file{record.pending !== 1 ? 's' : ''} left</span>
                                      </div>
                                    );
                                  })()}

                                  {/* Retry / Cancel Batch actions — hidden until the optimistic
                                      temp record is swapped for the real server batch_id, since
                                      both endpoints require a UUID path param. */}
                                  {(isProcessing || hasErrors || isCancelled) && !isTempRecord && (
                                    <div className="flex items-center gap-2 mb-3 sm:mb-4" onClick={e => e.stopPropagation()}>
                                      {/* Retry — stuck in pending, failed, or cancelled (re-queues the files) */}
                                      {(isProcessing || hasErrors || isCancelled) && (
                                        <button
                                          disabled={retryingBatches.has(record.id)}
                                          onClick={(e) => handleRetryBatch(record.id, e)}
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                            retryingBatches.has(record.id)
                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                              : 'bg-brand-blue/10 text-brand-blue border-brand-blue/20 hover:bg-brand-blue/15'
                                          }`}
                                        >
                                          <RefreshCw className={`w-3 h-3 ${retryingBatches.has(record.id) ? 'animate-spin' : ''}`} />
                                          {retryingBatches.has(record.id)
                                            ? 'Retrying...'
                                            : isCancelled && !isProcessing ? `Re-queue ${cancelledCount} cancelled` : 'Retry'}
                                        </button>
                                      )}
                                      {/* Cancel — show only while items are still pending.
                                          type="button" so a stray Enter can't submit-activate it, and it
                                          opens a confirmation instead of cancelling on the spot. */}
                                      {isProcessing && record.pending > 0 && (
                                        <button
                                          type="button"
                                          disabled={cancellingBatches.has(record.id)}
                                          onClick={(e) => handleCancelBatch(record.id, record.pending, e)}
                                          onKeyDown={(e) => {
                                            // Space scrolls the file list; don't let it double as "cancel 77 files".
                                            if (e.key === ' ') e.preventDefault();
                                          }}
                                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                            cancellingBatches.has(record.id)
                                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                          }`}
                                        >
                                          <X className="w-3 h-3" />
                                          {cancellingBatches.has(record.id) ? 'Cancelling...' : `Cancel Batch (${record.pending} pending)`}
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Individual File Statuses */}
                                  {record.statuses && record.statuses.length > 0 && (() => {
                                    const filteredStatuses = uploadHistoryFilter
                                      ? record.statuses.filter((f: any) => {
                                          if (uploadHistoryFilter === 'completed') return f.status === 'completed';
                                          if (uploadHistoryFilter === 'duplicated') return f.status === 'duplicate' || f.status === 'duplicated';
                                          if (uploadHistoryFilter === 'versioned') return f.status === 'versioned' || f.status === 'version';
                                          if (uploadHistoryFilter === 'error') return f.status === 'error';
                                          if (uploadHistoryFilter === 'pending') return f.status === 'pending' || f.status === 'processing';
                                          if (uploadHistoryFilter === 'cancelled') return f.status === 'cancelled' || f.status === 'discarded';
                                          return true;
                                        })
                                      : record.statuses;
                                    return filteredStatuses.length > 0 ? (
                                    <div className="border-t border-gray-100 pt-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                          <div className="text-xs font-semibold text-gray-700">
                                            Files ({filteredStatuses.length}{uploadHistoryFilter ? ` of ${record.statuses.length}` : ''})
                                          </div>
                                          {/* Select All checkbox for versioned items */}
                                          {uploadHistoryFilter === 'versioned' && filteredStatuses.length > 0 && (() => {
                                            const versionedInBatch = filteredStatuses.filter((f: any) => f.status === 'versioned' || f.status === 'version');
                                            if (versionedInBatch.length === 0) return null;
                                            const allSelected = versionedInBatch.every((f: any) => selectedVersionedItems.has(f.id));
                                            return (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const newSelected = new Map(selectedVersionedItems);
                                                  if (allSelected) {
                                                    versionedInBatch.forEach((f: any) => newSelected.delete(f.id));
                                                  } else {
                                                    versionedInBatch.forEach((f: any) => {
                                                      newSelected.set(f.id, {
                                                        id: f.id,
                                                        fileName: f.fileName,
                                                        candidateName: f.candidateName || '',
                                                        resumeId: f.resumeId,
                                                      });
                                                    });
                                                  }
                                                  setSelectedVersionedItems(newSelected);
                                                }}
                                                className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-brand-blue-2 bg-brand-blue-2/10 border border-brand-blue-2/20 rounded-md hover:bg-brand-blue-2/15 transition-colors"
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={allSelected}
                                                  readOnly
                                                  className="w-3 h-3 rounded border-brand-blue-2/40 text-brand-blue-2 pointer-events-none"
                                                />
                                                Select All
                                              </button>
                                            );
                                          })()}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="flex items-center gap-1 text-green-600">
                                            <CheckCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'completed' || f.status === 'versioned').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-blue-600">
                                            <Loader2 className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'processing' || f.status === 'pending').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-red-600">
                                            <AlertCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'error' || f.status === 'duplicate' || f.status === 'duplicated').length}
                                          </span>
                                          {/* Cancelled files had no counter at all, so they were invisible here too */}
                                          {record.statuses.some((f: any) => f.status === 'cancelled' || f.status === 'discarded') && (
                                            <span className="flex items-center gap-1 text-gray-600">
                                              <Ban className="w-3 h-3" />
                                              {record.statuses.filter((f: any) => f.status === 'cancelled' || f.status === 'discarded').length}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {/* Short note: cancel only for queued items */}
                                      {record.statuses.some((f: any) => f.status === 'pending' || f.status === 'error' || f.status === 'cancelled') && (
                                        <p className="text-[10px] text-gray-400 mb-2">
                                          ℹ️ Retry is available for queued, failed &amp; cancelled files. Cancel is only available for queued files.
                                        </p>
                                      )}
                                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                        {filteredStatuses.map((file: any, idx: number) => {
                                          const isClickable = ['completed', 'versioned', 'duplicate', 'error'].includes(file.status);
                                          const isVersioned = file.status === 'versioned' || file.status === 'version';
                                          const isSelected = selectedVersionedItems.has(file.id);
                                          const isCancelledFile = file.status === 'cancelled' || file.status === 'discarded';
                                          // Anything the UI has no case for. Surfaced explicitly rather than
                                          // being absorbed by the "Queued" fallback, so a new backend status
                                          // can never masquerade as "still waiting in the queue".
                                          const isUnknownStatusFile = ![
                                            'completed', 'versioned', 'version', 'processing',
                                            'pending', 'duplicate', 'duplicated', 'error',
                                            'cancelled', 'discarded',
                                          ].includes(file.status);
                                          return (
                                          <div
                                            key={file.id || idx}
                                            onClick={() => {
                                              if (isVersioned) {
                                                // Open resolution modal for this single versioned file
                                                setSelectedVersionedItems(new Map([[file.id, {
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  candidateName: file.candidateName || '',
                                                  resumeId: file.resumeId,
                                                }]]));
                                                setIsBulkResolveModalOpen(true);
                                              } else if (isClickable) {
                                                setSelectedHistoryItem({
                                                  id: file.id,
                                                  fileName: file.fileName,
                                                  status: file.status,
                                                  errorMessage: file.errorMessage,
                                                  candidateName: file.candidateName,
                                                  resumeId: file.resumeId,
                                                });
                                              }
                                            }}
                                            className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg border transition-all ${
                                              isVersioned && isSelected ? 'bg-brand-blue-2/15 border-brand-blue-2/40 ring-1 ring-brand-blue-2/30' :
                                              file.status === 'completed' ? 'bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/[0.07] border-brand-blue-2/20 hover:bg-brand-blue-2/[0.12] hover:border-brand-blue-2/30' :
                                              file.status === 'processing' ? 'bg-brand-blue/5 border-brand-blue/20' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/[0.07] border-brand-orange/20 hover:bg-brand-orange/10 hover:border-brand-orange/30' :
                                              file.status === 'error' ? 'bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300' :
                                              isCancelledFile ? 'bg-gray-100 border-gray-300' :
                                              isUnknownStatusFile ? 'bg-amber-50 border-amber-300' :
                                              'bg-gray-50 border-gray-200'
                                            } ${isClickable ? 'cursor-pointer' : ''}`}
                                          >
                                            {/* Checkbox for versioned items */}
                                            {isVersioned && (
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const newSelected = new Map(selectedVersionedItems);
                                                  if (isSelected) {
                                                    newSelected.delete(file.id);
                                                  } else {
                                                    newSelected.set(file.id, {
                                                      id: file.id,
                                                      fileName: file.fileName,
                                                      candidateName: file.candidateName || '',
                                                      resumeId: file.resumeId,
                                                    });
                                                  }
                                                  setSelectedVersionedItems(newSelected);
                                                }}
                                                className="w-4 h-4 rounded border-brand-blue-2/40 text-brand-blue-2 focus:ring-brand-blue-2/40 cursor-pointer flex-shrink-0"
                                              />
                                            )}
                                            {/* Status Icon */}
                                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-green-500' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange' :
                                              file.status === 'error' ? 'bg-red-500' :
                                              isCancelledFile ? 'bg-gray-500' :
                                              'bg-gray-400'
                                            }`}>
                                              {file.status === 'completed' && <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'versioned' && <GitBranch className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'processing' && <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-spin" />}
                                              {file.status === 'duplicate' && <Copy className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'error' && <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                              {file.status === 'pending' && <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-white animate-pulse" />}
                                              {isCancelledFile && <Ban className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                                            </div>
                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-gray-900 text-[11px] sm:text-sm truncate">{file.fileName}</div>
                                              <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">
                                                {file.status === 'completed' && (file.candidateName ? `✓ ${file.candidateName}` : '✓ Uploaded successfully')}
                                                {file.status === 'versioned' && (file.candidateName ? `↑ ${file.candidateName} - Version update detected` : '↑ Version update detected - Pending resolution')}
                                                {file.status === 'processing' && '⚡ Processing...'}
                                                {file.status === 'pending' && '⏳ Waiting in queue...'}
                                                {file.status === 'duplicate' && (file.errorMessage || '⚠ Duplicate - already exists')}
                                                {file.status === 'error' && (file.errorMessage || '✗ Failed to process')}
                                                {isCancelledFile && (file.errorMessage || '✕ Cancelled before processing')}
                                                {isUnknownStatusFile && `? Unrecognised status: ${String(file.status)}`}
                                              </div>
                                            </div>
                                            {/* Status Badge */}
                                            <span className={`hidden sm:inline px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-green-100 text-green-700' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/15 text-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue/10 text-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                                              file.status === 'error' ? 'bg-red-100 text-red-700' :
                                              isCancelledFile ? 'bg-gray-200 text-gray-700' :
                                              'bg-gray-100 text-gray-600'
                                            }`}>
                                              {file.status === 'completed' ? '✓ Done' :
                                               file.status === 'versioned' ? '↑ Version' :
                                               file.status === 'processing' ? '⚡ Running' :
                                               file.status === 'duplicate' ? '⚠ Duplicate' :
                                               file.status === 'error' ? '✗ Failed' :
                                               file.status === 'cancelled' ? '✕ Cancelled' :
                                               file.status === 'discarded' ? '✕ Discarded' :
                                               file.status === 'pending' ? '⏳ Queued' :
                                               /* Never claim "Queued" for a status we don't understand —
                                                  that is exactly how 77 cancelled files read as queued. */
                                               `? ${String(file.status ?? 'unknown')}`}
                                            </span>
                                            {/* Per-item Retry / Cancel — same temp-record guard as the
                                                batch-level actions above. Without it the optimistic
                                                record renders these buttons over `temp-file-N` ids and
                                                the request 422s on uuid_parsing for both path params. */}
                                            {file.id && !isTempRecord && !String(file.id).startsWith('temp-')
                                              && (file.status === 'pending' || file.status === 'error' || file.status === 'cancelled') && (
                                              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                <button
                                                  disabled={retryingItems.has(file.id)}
                                                  onClick={(e) => handleRetryItem(record.id, file.id, e)}
                                                  className={`p-1 rounded text-[10px] font-medium transition-colors ${retryingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-brand-blue hover:bg-brand-blue/10'}`}
                                                  aria-label="Retry this file" title={file.status === 'cancelled' ? 'Re-queue this cancelled file' : 'Retry this file'}
                                                >
                                                  <RefreshCw className={`w-3 h-3 ${retryingItems.has(file.id) ? 'animate-spin' : ''}`} />
                                                </button>
                                                {file.status === 'pending' && (
                                                  <button
                                                    disabled={cancellingItems.has(file.id)}
                                                    onClick={(e) => handleCancelItem(record.id, file.id, file.fileName, e)}
                                                    className={`p-1 rounded text-[10px] font-medium transition-colors ${cancellingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                                                    aria-label="Cancel this file (queued only)" title="Cancel this file (queued only)"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                        })}
                                      </div>
                                    </div>
                                    ) : uploadHistoryFilter ? (
                                      <div className="border-t border-gray-100 pt-4">
                                        <p className="text-xs text-gray-400 text-center py-3">No {
                                          uploadHistoryFilter === 'completed' ? 'completed' :
                                          uploadHistoryFilter === 'duplicated' ? 'duplicate' :
                                          uploadHistoryFilter === 'versioned' ? 'versioned' :
                                          uploadHistoryFilter === 'error' ? 'failed' :
                                          uploadHistoryFilter === 'cancelled' ? 'cancelled' :
                                          'pending'
                                        } files in this batch</p>
                                      </div>
                                    ) : null;
                                  })()}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Floating Resolve Selected Bar */}
              {selectedVersionedItems.size > 0 && (
                <div className="border-t border-brand-blue-2/20 px-3 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-brand-blue-2/[0.07] to-brand-blue/[0.04] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-brand-blue-2 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10">
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-brand-blue-2">
                        {selectedVersionedItems.size} versioned resume{selectedVersionedItems.size !== 1 ? 's' : ''} selected
                      </span>
                      <p className="text-[10px] sm:text-xs text-brand-blue-2/80">Choose how to resolve these version conflicts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedVersionedItems(new Map())}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setIsBulkResolveModalOpen(true)}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-2 rounded-lg transition-all shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10 flex items-center justify-center gap-1.5 sm:gap-2"
                    >
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Resolve ({selectedVersionedItems.size})
                    </button>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 bg-white rounded-b-2xl">
                <button
                  onClick={handleCloseUploadHistory}
                  className="w-full px-4 py-2 sm:py-2.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 text-sm sm:text-base"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Upload History Item Detail Modal */}
      {selectedHistoryItem && (
        <UploadHistoryDetailModal
          item={selectedHistoryItem}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}

      {/* Bulk Version Resolution Modal */}
      {isBulkResolveModalOpen && selectedVersionedItems.size > 0 && (
        <BulkVersionResolutionModal
          items={Array.from(selectedVersionedItems.values())}
          onClose={() => setIsBulkResolveModalOpen(false)}
          onResolved={() => {
            setIsBulkResolveModalOpen(false);
            setSelectedVersionedItems(new Map());
            // Refresh batch data
            fetchUploadHistory();
            isFetchingRef.current = false;
            fetchData();
          }}
        />
      )}

      {/* Assessment Modal - Select Assessment */}
      {isAssessmentModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
            onClick={() => {
              setIsAssessmentModalOpen(false);
              setAssessmentSearchQuery('');
              setSelectedAssessments([]);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex-shrink-0 flex items-center gap-4 p-6 border-b border-gray-100 bg-gradient-to-r from-brand-blue/[0.06] via-brand-cyan/[0.04] to-white">
                <div className="w-12 h-12 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
                  <ClipboardCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Invite to Assessment</h3>
                  <p className="text-sm text-gray-500">
                    {selectedResumes.length} candidate{selectedResumes.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setAssessmentSearchQuery('');
                    setSelectedAssessments([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6">
                {/* Selected Candidates Preview */}
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Candidates</h4>
                  <div className="space-y-1">
                    {resumes.filter(r => selectedResumes.includes(r.id)).slice(0, 5).map(resume => (
                      <div key={resume.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>{resume.name}</span>
                        <span className="text-gray-400">- {resume.email || 'No email'}</span>
                      </div>
                    ))}
                    {selectedResumes.length > 5 && (
                      <p className="text-sm text-gray-500 italic">+{selectedResumes.length - 5} more</p>
                    )}
                  </div>
                </div>

                {/* Assessment Selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Select Active Assessments</h4>
                    {activeAssessments.length > 0 && (
                      <button
                        onClick={() => {
                          const filteredAssessments = activeAssessments.filter(assessment => {
                            if (!assessmentSearchQuery.trim()) return true;
                            const query = assessmentSearchQuery.toLowerCase();
                            return (
                              assessment.short_id?.toLowerCase().includes(query) ||
                              assessment.title?.toLowerCase().includes(query) ||
                              assessment.jd_short_id?.toLowerCase().includes(query) ||
                              assessment.jd_title?.toLowerCase().includes(query)
                            );
                          });

                          if (selectedAssessments.length === filteredAssessments.length) {
                            // Clear all
                            setSelectedAssessments([]);
                          } else {
                            // Select all filtered
                            setSelectedAssessments(filteredAssessments);
                          }
                        }}
                        className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                      >
                        {selectedAssessments.length === activeAssessments.filter(assessment => {
                          if (!assessmentSearchQuery.trim()) return true;
                          const query = assessmentSearchQuery.toLowerCase();
                          return (
                            assessment.short_id?.toLowerCase().includes(query) ||
                            assessment.title?.toLowerCase().includes(query) ||
                            assessment.jd_short_id?.toLowerCase().includes(query) ||
                            assessment.jd_title?.toLowerCase().includes(query)
                          );
                        }).length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                      </button>
                    )}
                  </div>

                  {/* Search Bar */}
                  <div className="mb-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={assessmentSearchQuery}
                        onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                        placeholder="Search by Assessment ID, Name, JD ID, or JD Name..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                      />
                    </div>
                  </div>

                  {loadingAssessments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (() => {
                    // Filter assessments based on search query
                    const filteredAssessments = activeAssessments.filter(assessment => {
                      if (!assessmentSearchQuery.trim()) return true;
                      const query = assessmentSearchQuery.toLowerCase();
                      return (
                        assessment.short_id?.toLowerCase().includes(query) ||
                        assessment.title?.toLowerCase().includes(query) ||
                        assessment.jd_short_id?.toLowerCase().includes(query) ||
                        assessment.jd_title?.toLowerCase().includes(query)
                      );
                    });

                    return filteredAssessments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments found'}</p>
                        <p className="text-sm">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first to send invitations'}</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {filteredAssessments.map(assessment => {
                          const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                          return (
                            <button
                              key={assessment.id}
                              onClick={() => toggleAssessmentSelection(assessment)}
                              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                                isSelected
                                  ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                  : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                <div className="flex-shrink-0 mt-1">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-brand-blue border-brand-blue'
                                      : 'bg-white border-gray-300'
                                  }`}>
                                    {isSelected && (
                                      <CheckCircle className="w-4 h-4 text-white" />
                                    )}
                                  </div>
                                </div>

                                <div className="flex-1">
                                  {/* Assessment ID, Title, Version */}
                                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    {assessment.short_id && (
                                      <span className="text-xs px-2 py-0.5 bg-brand-blue text-white rounded font-semibold">
                                        {assessment.short_id}
                                      </span>
                                    )}
                                    {(() => {
                                      // Show the assessment's title with its real version
                                      // (derived from `version` field, falling back to a
                                      // version baked into the title). Strips the inline
                                      // "- Version N" suffix so we don't double-render.
                                      const parsed = parseAssessmentTitle(assessment.title || '');
                                      const displayVersion = typeof assessment.version === 'number'
                                        ? assessment.version
                                        : parsed.version;
                                      const base = parsed.cleanTitle || 'Untitled assessment';
                                      return (
                                        <>
                                          <h5 className="font-medium text-gray-900">{base}</h5>
                                          {displayVersion && (
                                            <span className="text-xs px-2 py-0.5 bg-brand-cyan/15 text-brand-cyan ring-1 ring-brand-cyan/30 rounded font-semibold">
                                              V{displayVersion}
                                            </span>
                                          )}
                                        </>
                                      );
                                    })()}
                                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                                      {assessment.status}
                                    </span>
                                  </div>

                                  {/* Linked JD Information */}
                                  {assessment.jd_short_id && (
                                    <div className="text-xs text-gray-600 mb-1.5">
                                      <span className="font-medium">Linked to: </span>
                                      <span className="text-gray-800">{assessment.jd_short_id}</span>
                                      {assessment.jd_title && (
                                        <span className="ml-1">- {assessment.jd_title}</span>
                                      )}
                                      {assessment.jd_version && (
                                        <span className="ml-1 text-gray-500">v{assessment.jd_version}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Duration and Sections */}
                                  <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {assessment.duration_minutes || 0} min
                                    </span>
                                    <span>•</span>
                                    <span>{assessment.sections?.length || 0} section{assessment.sections?.length !== 1 ? 's' : ''}</span>
                                  </div>

                                  {/* Created By and Date */}
                                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5">
                                    {assessment.created_by_name && (
                                      <>
                                        <span>Created by: <span className="text-gray-700 font-medium">{assessment.created_by_name}</span></span>
                                        <span>•</span>
                                      </>
                                    )}
                                    {assessment.created_at && (
                                      <span>
                                        {formatIST(assessment.created_at)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsAssessmentModalOpen(false);
                      setAssessmentSearchQuery('');
                      setSelectedAssessments([]);
                    }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === 0) {
                        toast.error('Please select at least one assessment');
                        return;
                      }

                      // Prepare candidate data from selected resumes
                      const candidateData = resumes
                        .filter(r => selectedResumes.includes(r.id))
                        .map((r, index) => ({
                          id: `${Date.now()}-${index}`,
                          name: r.name,
                          email: r.email || '',
                          source: 'database' as const,
                          resumeId: r.id
                        }))
                        .filter(c => c.email); // Only include candidates with email

                      if (candidateData.length === 0) {
                        toast.error('Selected resumes must have email addresses');
                        return;
                      }

                      // Open ShareAssessmentModal for customization (works for both single and multiple)
                      setPrefilledCandidates(candidateData);
                      setIsAssessmentModalOpen(false);
                      setIsShareAssessmentModalOpen(true);
                    }}
                    disabled={selectedAssessments.length === 0}
                    className="flex items-center gap-2 px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    Proceed to Send Invitations
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Share Assessment Modal with Pre-filled Candidates (supports multiple assessments) */}
      {isShareAssessmentModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareAssessmentModalOpen}
          onClose={() => {
            setIsShareAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setSelectedResumes([]);
            setAssessmentSearchQuery('');
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: selectedAssessments[0].sections?.reduce((total: number, section: any) =>
              total + (section.questions?.length || 0), 0) || 0,
            type: selectedAssessments[0].sections?.length > 0 && selectedAssessments[0].sections[0]?.section_type === 'ai_generated'
              ? 'AI-Generated'
              : 'Manual',
            short_id: selectedAssessments[0].short_id,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version
          }}
          additionalAssessments={selectedAssessments.slice(1).map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: a.sections?.reduce((total: number, section: any) =>
              total + (section.questions?.length || 0), 0) || 0,
            type: a.sections?.length > 0 && a.sections[0]?.section_type === 'ai_generated'
              ? 'AI-Generated'
              : 'Manual',
            short_id: a.short_id,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
          inviteSource="My Resumes"
        />
      )}

      {/* AI Talent Match Modal */}
      {isAITalentMatchModalOpen && (
        <AITalentMatchSelectJobModal
          resumes={resumes.filter(r => selectedResumes.includes(r.id))}
          jobs={publishedJobs}
          onClose={() => setIsAITalentMatchModalOpen(false)}
          onMatch={(resumeIds, jobId) => {
            // Store selected resumes in sessionStorage for the AI Talent Match page
            const resumeData = resumes
              .filter(r => resumeIds.includes(r.id))
              .map(r => ({
                id: r.id,
                candidateName: r.name,
                email: r.email,
              }));
            sessionStorage.setItem('aiTalentMatchResumes', JSON.stringify(resumeData));

            // Close modal
            setIsAITalentMatchModalOpen(false);
            setSelectedResumes([]);

            // Navigate to AI Talent Match page with the selected JD
            router.push(`/recruitment/ai-talent-match?jdId=${jobId}&view=new`);
          }}
        />
      )}

      {/* Cancel Batch Confirmation Dialog */}
      <AlertDialog
        open={cancelBatchConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 });
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Cancel {cancelBatchConfirm.pendingCount} queued file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  This stops <span className="font-medium text-gray-900">{cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}</span> that
                  {cancelBatchConfirm.pendingCount !== 1 ? ' have' : ' has'} not finished processing.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Files already completed are kept</li>
                  <li>Their Resume Storage units are refunded</li>
                  <li>You can re-queue cancelled files later with Retry</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep processing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelBatch}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel {cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Single File Confirmation Dialog */}
      <AlertDialog
        open={cancelItemConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelItemConfirm({ isOpen: false, batchId: '', itemId: '', fileName: '' });
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              Cancel this file?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <span className="font-medium text-gray-900">{cancelItemConfirm.fileName}</span> will not
                  be processed. Its unit is refunded and you can re-queue it later with Retry.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep processing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelItem}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Resume Confirmation Dialog */}
      <AlertDialog
        open={deleteResumeConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteResumeConfirm({ isOpen: false, ids: [], names: [] });
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete {deleteResumeConfirm.ids.length === 1 ? 'Resume' : `${deleteResumeConfirm.ids.length} Resumes`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                <ul className="list-disc list-inside space-y-1">
                  <li>Deletion is permanent and irreversible</li>
                  <li>Deleted resumes cannot be recovered</li>
                  <li>This action cannot be undone.</li>
                </ul>
                <p>
                  {deleteResumeConfirm.ids.length === 1
                    ? 'Are you sure you want to delete the resume?'
                    : <>Are you sure you want to delete <span className="font-medium text-gray-900">{deleteResumeConfirm.ids.length} resumes</span>?</>
                  }
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteResumes}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog
        open={deleteFolderConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFolderConfirm({ isOpen: false, folderId: null, folderName: '', resumeCount: 0, parentFolderId: null, parentFolderName: '', contentAction: null, hasSubfolders: false, subfolderCount: 0, subfolderDetails: [], totalResumeCount: 0, subfolderResumeCount: 0, loading: false });
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete Folder
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {deleteFolderConfirm.loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Loading folder info...</span>
                  </div>
                ) : (
                  <>
                    <p>
                      Are you sure you want to delete &quot;{deleteFolderConfirm.folderName}&quot;?
                    </p>

                    {/* Subfolder warning banner */}
                    {deleteFolderConfirm.hasSubfolders && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-800">
                              This folder contains {deleteFolderConfirm.subfolderCount} subfolder{deleteFolderConfirm.subfolderCount !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                              All subfolders will be permanently deleted:
                            </p>
                            <ul className="mt-2 space-y-1">
                              {deleteFolderConfirm.subfolderDetails.map((sf) => (
                                <li key={sf.id} className="flex items-center gap-2 text-sm text-red-700">
                                  <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="font-medium">{sf.name}</span>
                                  {sf.resume_count > 0 && (
                                    <span className="text-red-500 text-xs">({sf.resume_count} resume{sf.resume_count !== 1 ? 's' : ''})</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Resume action section */}
                    {deleteFolderConfirm.totalResumeCount > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-amber-800">
                              {deleteFolderConfirm.totalResumeCount} resume{deleteFolderConfirm.totalResumeCount !== 1 ? 's' : ''} will be affected
                              {deleteFolderConfirm.hasSubfolders && deleteFolderConfirm.subfolderResumeCount > 0 && (
                                <span className="font-normal text-amber-700"> ({deleteFolderConfirm.resumeCount} in this folder, {deleteFolderConfirm.subfolderResumeCount} in subfolders)</span>
                              )}
                            </p>
                            <p className="text-sm text-amber-700 mt-1">
                              Please choose what to do with the resumes:
                            </p>

                            <div className="mt-3 space-y-2">
                              {(() => {
                                const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
                                const parentIsRoot = deleteFolderConfirm.parentFolderId === rootFolder?.id;

                                return (
                                  <>
                                    {/* Option: Move to parent folder */}
                                    <label
                                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        deleteFolderConfirm.contentAction === 'move-parent'
                                          ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                          : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 bg-white'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="contentAction"
                                        value="move-parent"
                                        checked={deleteFolderConfirm.contentAction === 'move-parent'}
                                        onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'move-parent' }))}
                                        className="w-4 h-4 text-brand-blue"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <FolderOpen className="w-4 h-4 text-gray-600" />
                                          <span className="text-sm font-medium text-gray-900">
                                            Move to {parentIsRoot ? 'My Resumes (root)' : deleteFolderConfirm.parentFolderName}
                                          </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                          All resumes will be moved to {parentIsRoot ? 'the root folder' : 'the parent folder'}
                                        </p>
                                      </div>
                                    </label>

                                    {/* Option: Move to root (only when parent is NOT root) */}
                                    {!parentIsRoot && (
                                      <label
                                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                          deleteFolderConfirm.contentAction === 'move-root'
                                            ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                                            : 'border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/5 bg-white'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name="contentAction"
                                          value="move-root"
                                          checked={deleteFolderConfirm.contentAction === 'move-root'}
                                          onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'move-root' }))}
                                          className="w-4 h-4 text-brand-blue"
                                        />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <Folder className="w-4 h-4 text-gray-600" />
                                            <span className="text-sm font-medium text-gray-900">
                                              Move to My Resumes (root)
                                            </span>
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5">
                                            All resumes will be moved to the root folder
                                          </p>
                                        </div>
                                      </label>
                                    )}

                                    {/* Option: Delete all resumes */}
                                    <label
                                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        deleteFolderConfirm.contentAction === 'delete-all'
                                          ? 'border-red-500 bg-red-50'
                                          : 'border-gray-200 hover:border-gray-300 bg-white'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="contentAction"
                                        value="delete-all"
                                        checked={deleteFolderConfirm.contentAction === 'delete-all'}
                                        onChange={() => setDeleteFolderConfirm(prev => ({ ...prev, contentAction: 'delete-all' }))}
                                        className="w-4 h-4 text-red-600"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <Trash2 className="w-4 h-4 text-red-600" />
                                          <span className="text-sm font-medium text-red-700">
                                            Delete all resumes permanently
                                          </span>
                                        </div>
                                        <p className="text-xs text-red-500 mt-0.5">
                                          All {deleteFolderConfirm.totalResumeCount} resume{deleteFolderConfirm.totalResumeCount !== 1 ? 's' : ''} will be permanently deleted
                                        </p>
                                      </div>
                                    </label>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteFolder}
              disabled={deleteFolderConfirm.loading || (deleteFolderConfirm.totalResumeCount > 0 && !deleteFolderConfirm.contentAction)}
              className={`text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                deleteFolderConfirm.contentAction === 'delete-all'
                  ? 'bg-red-700 hover:bg-red-800 focus:ring-red-600'
                  : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
              }`}
            >
              {deleteFolderConfirm.loading
                ? 'Loading...'
                : deleteFolderConfirm.contentAction === 'delete-all'
                  ? 'Delete Everything'
                  : deleteFolderConfirm.totalResumeCount > 0
                    ? 'Move & Delete'
                    : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
      </div>
    </main>
    </DndProvider>
    </FeatureGate>
  );
}
