'use client';

import { X, Users, Database, Search, CheckSquare, Square, MinusSquare, Loader2, ClipboardList, Upload, Trash2, ShieldAlert, Lock, AlertCircle, HelpCircle } from 'lucide-react';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { useState, useEffect, useMemo, useId } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { resumeService, folderService, Resume, Folder as FolderType } from '@/lib/services/resumeService';
import type { Folder as TableFolder } from '@/lib/types/types';
import ResumeTable from './ResumeTable';
import FolderTree from './FolderTree';
import NoResumesEmptyState from '@/components/resumes/NoResumesEmptyState';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import ApplyToJobModal from './ApplyToJobModal';
import type { Job as SharedJob, Resume as SharedResume } from '@/lib/types/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { convertApiResumeToRow, convertApiFolderToTree } from '@/lib/utils/resumeMappers';
import { scoringService, normalizeScoringStatus } from '@/lib/services/scoringService';
import { formatOverallScore } from '@/lib/utils/matchStatus';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { useAuth } from '@/components/providers/AuthProvider';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import UploadModal from './UploadModal';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { Skeleton } from '@/components/ui/skeleton';

// Folder-tree pane sizing. Kept in step with FolderTree's own clamp
// (200–400px) so a width restored from storage is one the tree will honour.
const FOLDER_PANE_MIN = 200;
const FOLDER_PANE_MAX = 400;
const FOLDER_PANE_DEFAULT = 280;
const FOLDER_PANE_STORAGE_KEY = 'selectSourceModal:folderPaneWidth';

// The API returns a tree (parent.children). The folder-tree renderer filters
// this array by `parent_id`, which only ever sees top-level nodes — sub-folders
// live inside `children` and would never appear (this was the "sub folder
// doesn't show" bug). Flatten so every folder is searchable regardless of
// depth, both on initial load and after creating a new one.
const flattenFolders = (list: FolderType[]): FolderType[] => {
  const out: FolderType[] = [];
  const walk = (nodes: FolderType[]) => {
    for (const f of nodes || []) {
      // Strip `children` so downstream consumers (e.g. UploadModal which
      // re-walks the tree) don't double-count entries that already appear
      // flat in this list.
      const { children, ...rest } = f as FolderType & { children?: FolderType[] };
      out.push(rest as FolderType);
      if (Array.isArray(children) && children.length > 0) {
        walk(children);
      }
    }
  };
  walk(list);
  return out;
};

// Progress item interface (internal)
interface ProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating shown instead of `score`(%) - see formatOverallScore().
  overallRating10?: number;
  matchStatus?: string;
  errorMessage?: string;
}

interface SelectSourceModalProps {
  onClose: () => void;
  jobTitle: string;
  jobId: string;
  /** The JD's short id (e.g. "JD-198") and job version, for the subtitle. */
  jobShortId?: string;
  jobVersion?: number | null;
  /** The run has settled and the progress popup is still up: bring the
   *  results in BEHIND it (refresh, switch view/tab) without unmounting this
   *  modal, so Close only dismisses and Minimise lands on the results. */
  onScoringFinished?: () => void;
  /** The recruiter closed the finished popup: unmount this modal (and make
   *  sure the results are on screen, if `onScoringFinished` had not yet). */
  onScoringComplete?: () => void;
  /** A settled row (or its View) was clicked: open that candidate's scoring
   *  result. The run is dismissed first, exactly like Close; the page then
   *  unmounts this modal and shows the result. */
  onViewResult?: (item: ScoringProgressItem) => void;
}

export default function SelectSourceModal({
  onClose,
  jobTitle,
  jobId,
  jobShortId,
  jobVersion,
  onScoringFinished,
  onScoringComplete,
  onViewResult
}: SelectSourceModalProps) {
  const router = useRouter();
  const { user, tenant, isTenantAdmin, hasPermissionCode } = useAuth();
  const { startScoringJob, updateItemStatus, setPanelVisibility, setOnRestorePanel, setMinimized, clearJob, activeScoringJobs } = useScoringProgress();
  // Stable per-instance id for the ref-counted panel-visibility registry —
  // see `setPanelVisibility` on ScoringProgressContext for why this can't be
  // a hardcoded string (two instances would clobber each other's registration).
  const panelOwnerId = useId();

  // Internal Database tab requires BOTH view access to Internal Database AND
  // its own Score Resume sub-action (internal_db:score) — scoring is a
  // distinct capability from browsing, same as My Resumes' own below, so an
  // Owner can disable one source without touching the other (mirrors the
  // per-source AI Talent Match permissions).
  const hasInternalDBAccess =
    (user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false) &&
    hasPermissionCode('internal_db:score');

  // My Resumes tab used to be unconditional; now gated by its own Score
  // Resume sub-action the same way.
  const hasMyResumesScoreAccess = hasPermissionCode('my_resumes:score');

  // Check if user has scoring permission
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);

  // Check if user has upload permission (matches My Resumes page RBAC check)
  const canUploadResumes = isTenantAdmin || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');

  /* Row-action permissions — the same expressions the My Resumes page uses to
     gate its ⋮ menu, so the popup offers a user exactly the actions that page
     would. */
  const canUpdateMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update');
  const canDeleteMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:delete');
  const canArchiveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:archive');
  const canShareMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:share');

  // State
  // Default to whichever source the Owner actually left enabled — falls
  // back to 'internal-db' only when My Resumes' own Score Resume permission
  // is off but Internal Database's is on.
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'internal-db'>(
    hasMyResumesScoreAccess ? 'my-resumes' : (hasInternalDBAccess ? 'internal-db' : 'my-resumes')
  );
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  // Review step before scoring — the shared Candidates Selected dialog with
  // this job fixed: untick to drop a resume, pick another version, then Score.
  const [showScoreReview, setShowScoreReview] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');

  /* Totals behind each tab's badge. Both are fetched up front so the inactive
     tab shows a real number instead of a placeholder, and each is refreshed
     from the list response whenever its own tab reloads. `null` means "not
     known yet" — the badge stays blank rather than claiming zero. */
  const [tabCounts, setTabCounts] = useState<{ myResumes: number | null; internalDb: number | null }>({
    myResumes: null,
    internalDb: null,
  });

  // Folder-tree sidebar width. Was a fixed w-56 (224px), which left deep folder
  // names only ~45px after the indent + checkbox + chevron + icon, so they were
  // truncated to a couple of characters. Now user-resizable and remembered.
  const [sidebarWidth, setSidebarWidth] = useState<number>(FOLDER_PANE_DEFAULT);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(FOLDER_PANE_STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= FOLDER_PANE_MIN && saved <= FOLDER_PANE_MAX) {
        setSidebarWidth(saved);
      }
    } catch { /* ignore unavailable storage */ }
  }, []);

  /* FolderTree owns the drag handle, the keyboard resize and the
     double-click-to-reset; this just records where the user left it. */
  const handleSidebarWidthChange = (width: number) => {
    setSidebarWidth(width);
    try { localStorage.setItem(FOLDER_PANE_STORAGE_KEY, String(width)); } catch { /* ignore */ }
  };

  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [scoringStats, setScoringStats] = useState({ queued: 0, processing: 0, completed: 0, failed: 0 });
  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Minimized state for the bulk-scoring progress popup. Kept here (not inside
  // BulkScoringProgressModal) so "expand" from the floating indicator can bring
  // the popup back — see the restore-callback effect below.
  const [isBulkProgressMinimized, setIsBulkProgressMinimized] = useState(false);

  // Hide the global floating widget only while the progress popup is actually
  // on screen. Once minimized we must release it, otherwise
  // GlobalScoringProgressIndicator bails out on `isMainPanelOpen` and the user
  // gets no floating pill at all.
  useEffect(() => {
    setPanelVisibility(panelOwnerId, showProgressModal && !isBulkProgressMinimized);
    return () => { setPanelVisibility(panelOwnerId, false); };
  }, [showProgressModal, isBulkProgressMinimized, setPanelVisibility, panelOwnerId]);

  // Register how the floating indicator restores this popup. Without this the
  // indicator falls back to setMinimized(false) and only ever shows its own
  // small card — the popup the user minimized never comes back.
  useEffect(() => {
    if (showProgressModal && isBulkProgressMinimized) {
      /* One arrow, not two: `setOnRestorePanel`'s own wrapper (in
         ScoringProgressContext) already does the `setState(() => value)`
         trick needed to store a function safely — wrapping it again here
         made the stored "callback" a function that RETURNS this restore
         function instead of one that RUNS it, so calling it from the
         global widget silently did nothing. */
      setOnRestorePanel(() => {
        setIsBulkProgressMinimized(false);
        setMinimized(false);
      });
    } else {
      setOnRestorePanel(undefined);
    }
    return () => setOnRestorePanel(undefined);
  }, [showProgressModal, isBulkProgressMinimized, setOnRestorePanel, setMinimized]);

  // Fetch resumes and folders on mount and tab change
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  /* Both tab totals, up front. `page_size: 1` keeps this to a count query —
     only `total` is read. Runs once on mount; each tab's own load keeps its
     number current afterwards, and upload/archive/delete call it again. */
  const refreshTabCounts = async () => {
    try {
      const [mine, internal] = await Promise.all([
        resumeService.list({ source: 'my-resumes', page_size: 1, include_archived: true }),
        hasInternalDBAccess
          ? resumeService.list({ source: 'internal-db', page_size: 1, include_archived: true })
          : Promise.resolve(null),
      ]);
      setTabCounts({
        myResumes: mine?.total ?? 0,
        internalDb: internal ? internal.total ?? 0 : null,
      });
    } catch {
      /* Leave whatever we already had — a failed count must not blank the
         badges or block the list the user came here for. */
    }
  };

  useEffect(() => {
    refreshTabCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInternalDBAccess]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch resumes based on active tab (include archived so they show as disabled)
      const resumeResponse = await resumeService.list({
        source: activeTab,
        page_size: 100,
        include_archived: true
      });
      setResumes(resumeResponse.items || []);

      /* The list we just loaded is the freshest count this tab has. */
      const loadedTotal = resumeResponse.total ?? (resumeResponse.items || []).length;
      setTabCounts(prev =>
        activeTab === 'my-resumes'
          ? { ...prev, myResumes: loadedTotal }
          : { ...prev, internalDb: loadedTotal },
      );

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

          setFolders(flattenFolders(folderData || []));
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

  /* ── My Resumes tab: the real My Resumes table ───────────────────────────
     The tab renders `ResumeTable` — the same component the My Resumes page
     uses — rather than a modal-only list, so the columns, widths, sticky
     header/Actions column, borders, hover and selected states all come from
     one implementation and cannot drift. These memos put the API rows and
     folders into the shape that component reads (see lib/utils/resumeMappers). */
  const tableRows = useMemo(
    () => filteredResumes.map(convertApiResumeToRow),
    [filteredResumes],
  );

  const tableFolders = useMemo<TableFolder[]>(
    () => folders.map(convertApiFolderToTree),
    [folders],
  );

  /* The nested shape `FolderTree` renders from. This modal keeps `folders`
     flat (it filters resumes by a single id), but the tree draws its
     hierarchy from `children`, so re-link parents to children here and
     prepend the virtual "All Resumes" fixture the My Resumes page also adds. */
  const folderTree = useMemo<TableFolder[]>(() => {
    const nodes = new Map<string, TableFolder>();
    folders.forEach(f => {
      nodes.set(f.id, {
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: [],
      });
    });
    const roots: TableFolder[] = [];
    nodes.forEach(node => {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children!.push(node);
      else roots.push(node);
    });
    return [
      { id: 'all', name: 'All Resumes', count: resumes.length, children: [] },
      ...roots,
    ];
  }, [folders, resumes.length]);

  /* Folder name per row — the My Resumes page adds this column only in the
     aggregated "All Resumes" view, where rows come from many folders. */
  const getResumeFolderName = useMemo(() => {
    const byId = new Map(folders.map(f => [f.id, f.name]));
    return (folderId?: string) => (folderId ? byId.get(folderId) : undefined);
  }, [folders]);

  /* The My Resumes page's own empty state, with the same rules: a search or a
     filter in play means "no matches" (the table keeps its own copy), and the
     Archived Resumes folder gets the bare illustration — nothing is ever
     uploaded straight into it, so it earns no "add a resume" copy or button. */
  const renderNoResumesEmptyState = (folderId?: string) => {
    const isArchivedResumesFolder =
      !!folderId && folders.some(f => f.name === 'Archived Resumes' && !f.parent_id && f.id === folderId);
    const canAdd = canUploadResumes && !isArchivedResumesFolder;

    return (
      <NoResumesEmptyState
        description={
          isArchivedResumesFolder
            ? ''
            : canUploadResumes
              ? 'No resumes are available in this folder yet. Add a resume to get started.'
              : 'No resumes are available in this folder yet.'
        }
        onAction={canAdd ? () => setShowUploadModal(true) : undefined}
      />
    );
  };

  /* Select-all adapter. `ResumeTable` reports the desired state; the archived
     guard and the "keep picks made in other folders" rule are the modal's own
     and are preserved exactly as the previous list had them. */
  const handleTableSelectAll = (selected: boolean) => {
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
    if (isArchivedFolder) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }
    const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
    if (visibleIds.length === 0) return;
    setSelectedResumes(prev =>
      selected
        ? Array.from(new Set([...prev, ...visibleIds]))
        : prev.filter(id => !visibleIds.includes(id)),
    );
  };

  /* Row actions. `ResumeTable` runs Download / Share / Add Tags entirely on
     its own and confirms Archive in its own modal, so only Delete needs a
     confirmation of its own here — the table calls `onDelete` straight away.
     Both refresh the list and drop the row from the current selection so the
     scoring set can never point at something that no longer exists. */
  const [deleteResumeTarget, setDeleteResumeTarget] = useState<{ id: string; name: string } | null>(null);
  /* Preview — same in-app document viewer My Resumes uses, replacing the old
     new-tab `/recruitment/resume-view/[id]` behaviour so Preview reads
     identically in both places. */
  const [previewResume, setPreviewResume] = useState<{ id: string; name: string; fileName?: string } | null>(null);

  const handleArchiveResume = async (resumeId: string) => {
    try {
      await resumeService.archive(resumeId, true);
      setSelectedResumes(prev => prev.filter(id => id !== resumeId));
      toast.success('Resume archived');
      await fetchData();
      refreshTabCounts();
    } catch (error: any) {
      toast.error(`Failed to archive resume: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  };

  const handleConfirmDeleteResume = async () => {
    if (!deleteResumeTarget) return;
    const { id } = deleteResumeTarget;
    setDeleteResumeTarget(null);
    try {
      await resumeService.delete(id);
      setSelectedResumes(prev => prev.filter(rid => rid !== id));
      toast.success('Resume deleted');
      await fetchData();
      refreshTabCounts();
    } catch (error: any) {
      toast.error(`Failed to delete resume: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  };

  // Toggle resume selection
  const handleToggleResume = (resumeId: string) => {
    // Check if resume is archived OR if we're in the Archived folder
    const resume = resumes.find(r => r.id === resumeId);

    // Check if currently viewing Archived folder
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;

    // Block if resume is archived OR if viewing archived folder
    if (resume?.is_archived || isArchivedFolder) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }

    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  // Select/deselect all VISIBLE resumes — preserves picks in other folders.
  const handleSelectAll = () => {
    const selectedFolderData = folders.find(f => f.id === selectedFolder);
    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
    if (isArchivedFolder) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }
    const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
    if (visibleIds.length === 0) return;
    const allVisibleSelected = visibleIds.every(id => selectedResumes.includes(id));
    setSelectedResumes(prev => {
      if (allVisibleSelected) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      const merged = new Set(prev);
      visibleIds.forEach(id => merged.add(id));
      return Array.from(merged);
    });
  };

  // Tab change
  const handleTabChange = (tab: 'my-resumes' | 'internal-db') => {
    setActiveTab(tab);
    setSelectedResumes([]);
    setSearchTerm('');
    setSelectedFolder('all');
  };

  // Submit for scoring with progress tracking
  const handleSubmitForScoring = async (reviewedIds?: string[]) => {
    // From the review step: the resumes still ticked, each on its chosen version.
    const idsToScore = reviewedIds ?? selectedResumes;
    if (idsToScore.length === 0) return;

    // Check for already-scored resumes before proceeding
    let resumesToScore = [...idsToScore];
    try {
      const checkResult = await scoringService.checkExistingScores(jobId, resumesToScore);
      if (checkResult.existing_count > 0) {
        const alreadyScoredNames = checkResult.existing_scores
          .map((s: any) => `${s.candidate_name} (${formatOverallScore(s.overall_rating_10, s.overall_score)})`)
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

    setSubmitting(true);

    try {
      // Use async Celery-based bulk scoring (same as Resume Scoring module)
      const response = await scoringService.startBulkScoringAsync(jobId, resumesToScore);

      // Build resume items for progress display
      const resumeItems = resumesToScore.map(resumeId => {
        const resume = resumes.find(r => r.id === resumeId);
        return {
          resumeId,
          candidateName: resume?.candidate_name || 'Unknown',
        };
      });

      // Initialize progress items and show modal
      const initialItems: ProgressItem[] = resumeItems.map(item => ({
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        status: 'queued' as const,
      }));
      setProgressItems(initialItems);
      setScoringStats({ queued: initialItems.length, processing: 0, completed: 0, failed: 0 });
      setShowProgressModal(true);

      // Register in persistent scoring context so GlobalScoringProgressIndicator works when minimized
      const contextItems = resumeItems.map(item => ({
        id: `${jobId}-${item.resumeId}`,
        resumeId: item.resumeId,
        candidateName: item.candidateName,
        jobTitle: jobTitle,
        jobId: jobId,
        source: (activeTab === 'my-resumes' ? 'My Resumes' : 'Internal DB') as 'My Resumes' | 'Internal DB',
      }));
      startScoringJob(jobId, jobTitle, contextItems, typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined);

      // Poll batch status until all items are done
      const batchId = response.batch_id;
      const poll = async () => {
        try {
          const batchStatus = await scoringService.getBatchStatus(batchId);

          // Update progress items from batch status. `items` guarded the same
          // way the context-sync loop below already does — an undefined
          // `items` here used to throw before ever reaching that loop or the
          // `allDone` check, so every poll tick silently failed into the
          // catch block below and retried forever: the popup stayed stuck on
          // "Queued" indefinitely with no visible error.
          setProgressItems(prev => prev.map(item => {
            const batchItem = (batchStatus.items || []).find((b: any) => b.resume_id === item.resumeId);
            if (!batchItem) return item;
            const status = normalizeScoringStatus(batchItem.status) as ProgressItem['status'];
            return {
              ...item,
              status,
              score: batchItem.overall_score,
              overallRating10: batchItem.overall_rating_10,
              matchStatus: batchItem.match_status,
              // Never copied here before — only the context-sync loop below set
              // it (for GlobalScoringProgressIndicator), so the modal rendered
              // from THIS state always showed a bare "Failed" badge with no reason.
              errorMessage: batchItem.error_message || item.errorMessage,
            };
          }));
          setScoringStats({
            queued: batchStatus.queued,
            processing: batchStatus.processing,
            completed: batchStatus.completed,
            failed: batchStatus.failed,
          });

          // Sync status updates into the persistent context (drives GlobalScoringProgressIndicator)
          for (const batchItem of (batchStatus.items || [])) {
            const itemId = `${jobId}-${batchItem.resume_id}`;
            const itemStatus = normalizeScoringStatus(batchItem.status);
            if (itemStatus === 'completed') {
              updateItemStatus(jobId, itemId, 'Scored successfully', { score: batchItem.overall_score, overallRating10: batchItem.overall_rating_10 });
            } else if (itemStatus === 'failed') {
              updateItemStatus(jobId, itemId, 'Failed', { errorReason: batchItem.error_message || 'Scoring failed' });
            } else if (itemStatus === 'processing') {
              updateItemStatus(jobId, itemId, 'Scoring in progress');
            }
          }

          const aggregateStatus = normalizeScoringStatus(batchStatus.status);
          const allDone = aggregateStatus === 'completed' || aggregateStatus === 'failed' ||
            (batchStatus.queued === 0 && batchStatus.processing === 0);

          if (allDone) {
            setSubmitting(false);
            // Refresh header quota dropdown — RS deductions landed on CP
            dispatchUnitsConsumed();
            /* The popup stays up, finished, until the recruiter closes it; the
               page brings the results in behind it meanwhile. It used to close
               ITSELF here after 1.5s and only then hand off to the page. On the
               Resume Scoring page that hand-off awaits a history refresh before
               unmounting this modal, so the whole fetch showed this modal's own
               resume-selection tabs. And a popup closing on its own reads to
               the corner widget as "minimised" — with the run already older
               than its 3s card, it dropped straight to the round button nobody
               had asked for. */
            onScoringFinished?.();
          } else {
            setTimeout(poll, 3000);
          }
        } catch (pollError) {
          // Was silently swallowed — a poll tick that keeps throwing (like the
          // undefined-`items` case above used to) retried forever with no
          // trace of why, which is exactly what made this bug invisible.
          console.error('[SelectSourceModal] Error polling batch status:', pollError);
          setTimeout(poll, 5000);
        }
      };
      setTimeout(poll, 3000);

    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
      setSubmitting(false);
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
          ? { ...i, status: 'completed' as const, score: Math.round(result.overall_score), overallRating10: result.overall_rating_10, matchStatus: result.match_status }
          : i
      ));
      setScoringStats(prev => ({ ...prev, processing: prev.processing - 1, completed: prev.completed + 1 }));
      toast.success('Retry successful');
      // Refresh the results behind the popup; the popup itself stays up.
      (onScoringFinished ?? onScoringComplete)?.();
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
    if (submitting) return;
    /* Closing is a dismissal: take the corner widget with it, or the X looks
       like it did nothing. Every job goes, not just the settled ones —
       keeping a running one behind left the floating button on screen after
       the X that was meant to remove it. */
    activeScoringJobs.forEach(job => clearJob(job.jobId));
    if (onScoringComplete) {
      /* The page unmounts this modal once it has the results view ready. The
         popup is deliberately NOT hidden first: on the Resume Scoring page the
         hand-off awaits a history refresh, and hiding the popup ahead of that
         exposed the selection tabs underneath for the whole fetch. */
      onScoringComplete();
      return;
    }
    setShowProgressModal(false);
    onClose();
  };

  // Handle resume upload
  const handleUpload = async (files: File[], folderId?: string) => {
    try {
      if (files.length === 0) {
        return {
          success: false,
          error: 'No file provided'
        };
      }

      // For bulk upload, upload all files sequentially
      if (files.length > 1) {
        const results = await Promise.allSettled(
          files.map(file => resumeService.upload(file, folderId))
        );
        await fetchData();
        const uploadedResumes = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && !!r.value?.id)
          .map(r => ({ id: r.value.id as string, candidateName: (r.value.candidate_name as string) || 'Resume' }));
        if (uploadedResumes.length > 0) {
          const failedCount = files.length - uploadedResumes.length;
          if (failedCount > 0) {
            toast.error(`${failedCount} of ${files.length} resumes could not be uploaded (invalid, non-English or duplicate).`);
          }
          return {
            success: true,
            resumeId: uploadedResumes[0].id,
            candidateName: uploadedResumes[0].candidateName,
            uploadedResumes,
          };
        }
        // All files rejected — re-throw the first rejection so the catch
        // below maps 409 → DuplicateResumeDetectedModal payload instead of
        // surfacing axios's raw "Request failed with status code 409".
        const firstRejection = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstRejection) throw firstRejection.reason;
        return { success: false, error: 'Upload failed' };
      }

      const response = await resumeService.upload(files[0], folderId);
      await fetchData();

      return {
        success: true,
        resumeId: response.id,
        candidateName: response.candidate_name,
        uploadedResumes: [{ id: response.id, candidateName: response.candidate_name || 'Resume' }],
      };
    } catch (error: any) {
      console.error('Upload error:', error);

      // Handle 409 duplicate resume
      if (error?.response?.status === 409) {
        const detail = error?.response?.data?.detail;
        const existingResume = detail?.existing_resume;
        const isExactDuplicate = detail?.is_exact_duplicate ?? true;
        const contentDifferences = detail?.content_differences || [];

        if (existingResume) {
          return {
            success: false,
            error: `A resume for ${existingResume.candidate_name || 'this candidate'} already exists in your Shared Resume Database.`,
            existingResume: {
              id: existingResume.id,
              candidateName: existingResume.candidate_name || existingResume.file_name || 'Unknown',
              email: existingResume.email || '',
              currentTitle: existingResume.current_title || '',
              folderName: existingResume.folder_name || '',
              uploadedAt: existingResume.upload_date || '',
              version: existingResume.version || 1,
            },
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
              contentDifferences,
              isDuplicate: isExactDuplicate,
            }
          };
        }

        return {
          success: false,
          error: 'This resume already exists in the system.',
        };
      }

      // Handle 400 validation errors
      if (error?.response?.status === 400) {
        const detail = error?.response?.data?.detail;

        if (detail?.error === 'INVALID_RESUME') {
          return {
            success: false,
            error: detail?.message || 'The uploaded file does not appear to be a valid resume. It may be a scorecard, invoice, or other document type.',
          };
        }

        if (detail?.error === 'NO_CONTENT') {
          return {
            success: false,
            error: detail?.message || 'The resume file has no readable content. The file may be blank, image-only, or heavily formatted.',
          };
        }

        return {
          success: false,
          error: detail?.message || `Failed to upload ${files[0]?.name || 'file'}`,
        };
      }

      // Handle 403 — read-only mode, quota exhausted, or permission denied
      if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;

        if (detail?.error === 'READ_ONLY_MODE') {
          return {
            success: false,
            error: 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.',
          };
        }

        if (detail?.error === 'QUOTA_EXHAUSTED') {
          return {
            success: false,
            error: detail?.message || 'Resume upload quota exhausted. Please upgrade your plan to upload more resumes.',
          };
        }

        return {
          success: false,
          error: 'You do not have permission to upload resumes. Please contact your administrator.',
        };
      }

      // Handle 503 — AI parsing service unavailable (e.g. RU_OPENAI_API_KEY not configured)
      if (error?.response?.status === 503) {
        const detail = error?.response?.data?.detail;
        return {
          success: false,
          error: detail?.message || 'Resume upload is temporarily unavailable. Please try again later or contact your administrator.',
        };
      }

      // Fall back to whatever reason the backend gave, even for status codes
      // not explicitly handled above, instead of a generic message that hides
      // why the upload actually failed.
      {
        const detail = error?.response?.data?.detail;
        const backendMessage = typeof detail === 'string' ? detail : detail?.message;
        return {
          success: false,
          error: backendMessage || `Failed to upload ${files[0]?.name || 'file'}`,
        };
      }
    }
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      const allFolders = (function flatten(list: FolderType[]): FolderType[] {
        return list.flatMap(f => [f, ...flatten(f.children || [])]);
      })(folders);
      /* Siblings only, matching the My Resumes page. A name is a path segment,
         not a global id — "Test" at the root and "Test" inside it are two
         different folders — so a tree-wide check made the first subfolder
         named after any existing folder impossible to create. */
      if (allFolders.find(f =>
        f.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        // The API shape here, not the tree's: this list is `folderService.list()`
        // output verbatim, so the parent link is `parent_id`.
        (f.parent_id || undefined) === (parentId || undefined) &&
        f.id !== 'all'
      )) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }
      await folderService.create(name, parentId);
      const folderData = await folderService.list();
      setFolders(flattenFolders(folderData || []));
      toast.success('Folder created');
    } catch (error: any) {
      toast.error(`Failed to create folder: ${error?.response?.data?.detail || error?.message || 'Unknown error'}`);
    }
  };

  // Handle auto-select after upload
  const handleAutoSelectAfterUpload = async (resumeId: string, candidateName: string) => {
    // Close upload modal
    setShowUploadModal(false);

    // Refresh the list to include the new resume
    await fetchData();
    refreshTabCounts();

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

  // Bulk counterpart: tick every resume the bulk upload stored
  const handleAutoSelectManyAfterUpload = async (uploaded: { id: string; candidateName: string }[]) => {
    setShowUploadModal(false);

    await fetchData();
    refreshTabCounts();

    setSelectedResumes(prev => {
      const next = [...prev];
      uploaded.forEach(u => { if (!next.includes(u.id)) next.push(u.id); });
      return next;
    });

    toast.success(
      uploaded.length === 1
        ? `Resume uploaded! "${uploaded[0].candidateName}" is now selected. Add more or click "Score Resumes" to continue.`
        : `${uploaded.length} resumes uploaded and selected. Add more or click "Score Resumes" to continue.`
    );
  };

  return (
    // While the progress popup is minimized this component stays mounted (it owns
    // progressItems and the restore callback) but its overlay must not block the
    // page — hide it rather than unmounting, so "expand" can bring it straight back.
    <div className={`fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm ${isBulkProgressMinimized ? 'hidden' : 'flex'} items-center justify-center z-50 p-3 sm:p-6`}>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-[94vw] 2xl:max-w-[1680px] h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <div className="flex items-start gap-2 sm:gap-4 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">
                <span className="hidden sm:inline">Select Applicants to Score</span>
                <span className="sm:hidden">Select Applicants</span>
              </h2>
              {/* JD ID · job name · job version */}
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {jobShortId && <JobIdBadge className="inline-flex items-center flex-shrink-0">{jobShortId}</JobIdBadge>}
                <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{jobTitle}</span>
                {jobVersion != null && jobVersion > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 flex-shrink-0" title="Job version">V{jobVersion}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-100 dark:border-slate-700/60 px-3 sm:px-6 pt-3 sm:pt-4 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <div className="flex gap-1 sm:gap-2">
            {/* Only show My Resumes tab if the Owner granted its Score Resume sub-action */}
            {hasMyResumesScoreAccess && (
            <button
              onClick={() => handleTabChange('my-resumes')}
              className={`px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-medium rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 ${
                activeTab === 'my-resumes'
                  ? 'bg-white dark:bg-slate-900 text-brand-blue border-b-2 border-brand-blue shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">My Resumes</span>
              <span className="sm:hidden">Resumes</span>
              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-2xs sm:text-xs ${
                activeTab === 'my-resumes'
                  ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue'
                  : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
              }`}>
                {tabCounts.myResumes ?? ''}
              </span>
            </button>
            )}
            {/* Only show Internal Database tab if user has permission */}
            {hasInternalDBAccess && (
              <button
                onClick={() => handleTabChange('internal-db')}
                className={`px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-medium rounded-t-lg transition-all flex items-center gap-1.5 sm:gap-2 ${
                  activeTab === 'internal-db'
                    ? 'bg-white dark:bg-slate-900 text-brand-blue border-b-2 border-brand-blue shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-50'
                }`}
              >
                <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Shared Database</span>
                <span className="sm:hidden">Shared DB</span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-2xs sm:text-xs ${
                  activeTab === 'internal-db'
                    ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue'
                    : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                }`}>
                  {tabCounts.internalDb ?? ''}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area.

            Wrapped in `DndProvider` because BOTH shared components call
            react-dnd hooks unconditionally — FolderTree's folder rows are drop
            targets and ResumeTable's rows are drag sources — and the
            job-details page has no provider of its own. Nothing is actually
            draggable here (the table is rendered with `draggable={false}`);
            the provider only satisfies the hooks. */}
        {(hasMyResumesScoreAccess || hasInternalDBAccess) ? (
        <DndProvider backend={HTML5Backend}>
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar — the My Resumes page's own FolderTree, so the
              hierarchy, System Folders / My Folders grouping, labels, icons,
              colours, spacing and selected state are identical to that page
              rather than a second implementation of them.

              Mostly browse-only — a folder here filters the list, and
              rename/delete/upload-to-folder stay on the My Resumes page where
              they belong — but "+ New" is still worth having: a recruiter
              picking resumes to score for a fresh role shouldn't have to
              leave this flow just to make the folder they'd file them under. */}
          {activeTab === 'my-resumes' && (
            /* `flex` (not `block`) so the panel stretches to the row's height —
               FolderTree lays its content out with `md:absolute md:inset-0`
               and would otherwise collapse to its 360px floor. */
            <div className="hidden lg:flex flex-shrink-0">
              <FolderTree
                folders={folderTree}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                onCreateFolder={canUploadResumes ? handleCreateFolder : undefined}
                resumes={[]}
                width={sidebarWidth}
                onWidthChange={handleSidebarWidthChange}
                readOnly
                allowCreateFolder={canUploadResumes}
              />
            </div>
          )}


          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Bulk Actions */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, skills..."
                    className="w-full h-10 pl-10 pr-4 border border-gray-300 dark:border-slate-700 rounded-lg text-sm bg-gray-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-800 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                  {/* Upload Resume button - only for My Resumes tab + canUploadResumes RBAC */}
                  {activeTab === 'my-resumes' && canUploadResumes && (
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors font-medium flex items-center gap-1.5 sm:gap-2"
                    >
                      <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Upload Resume</span>
                      <span className="sm:hidden">Upload</span>
                    </button>
                  )}
                  {(() => {
                    // Track selection state of the *visible* folder only — the
                    // master count can include resumes from other folders.
                    const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
                    const visibleSelectedCount = visibleIds.filter(id => selectedResumes.includes(id)).length;
                    const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
                    const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
                    return (
                      <button
                        onClick={handleSelectAll}
                        disabled={filteredResumes.length === 0}
                        className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors font-medium flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 whitespace-nowrap"
                      >
                        {allVisibleSelected ? (
                          <>
                            <CheckSquare className="w-4 h-4 text-brand-blue" />
                            <span className="hidden sm:inline">Deselect All</span>
                            <span className="sm:hidden">Deselect</span>
                          </>
                        ) : someVisibleSelected ? (
                          <>
                            <MinusSquare className="w-4 h-4 text-blue-600" />
                            <span className="hidden sm:inline">Select All</span>
                            <span className="sm:hidden">All</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-4 h-4" />
                            <span className="hidden sm:inline">Select All</span>
                            <span className="sm:hidden">All</span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                  <div className="text-xs sm:text-sm text-gray-700 dark:text-slate-300 bg-brand-blue/5 ring-1 ring-brand-blue/15 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-transparent font-medium whitespace-nowrap">
                    <span className="text-brand-blue">{selectedResumes.length}</span> <span className="hidden sm:inline">selected</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resume List. Both tabs render the same shared table the
                Resume Database and My Resumes pages use — column set and
                order, widths, sticky header, sticky Actions column,
                separators, hover/selected states, checkbox styling,
                pagination — so this popup's Shared Database tab looks
                exactly like the Resume Database page instead of a second,
                hand-rolled implementation of it. */}
            <div className="flex-1 min-h-0 flex flex-col">
              {loading ? (
                <div className="flex-1 min-h-0 overflow-hidden px-3 sm:px-6 py-3 sm:py-4">
                  {/* Mirrors the ResumeTable: a header row of column labels
                      followed by resume rows (checkbox + avatar + name/meta). */}
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-hidden">
                    <div className="hidden md:flex items-center gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/50 px-4 py-3">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-3.5 flex-[2]" />
                      <Skeleton className="h-3.5 flex-1" />
                      <Skeleton className="h-3.5 flex-1" />
                      <Skeleton className="h-3.5 w-16" />
                    </div>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 sm:gap-4 border-b border-gray-100 dark:border-slate-700/60 px-4 py-3.5 last:border-b-0">
                        <Skeleton className="h-4 w-4 shrink-0 rounded" />
                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                        <div className="flex-[2] min-w-0 space-y-2">
                          <Skeleton className="h-4 w-2/5" />
                          <Skeleton className="h-3 w-3/5" />
                        </div>
                        <Skeleton className="hidden md:block h-4 flex-1" />
                        <Skeleton className="hidden md:block h-4 flex-1" />
                        <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <ResumeTable
                  resumes={tableRows}
                  selectedResumes={selectedResumes}
                  onSelectResume={handleToggleResume}
                  onSelectAll={handleTableSelectAll}
                  /* Clicking a row picks the applicant, as this list has
                     always done — the page uses this hook to navigate, but
                     navigating away from a half-made selection is not what
                     this popup wants. */
                  onViewDetails={(resume) => handleToggleResume(resume.id)}
                  /* Opened from the ⋮ menu's Preview — same in-app document
                     viewer My Resumes uses, rather than a new tab. */
                  onQuickView={(resume) =>
                    setPreviewResume({
                      id: resume.id,
                      name: resume.candidate_name || resume.file_name || 'Resume',
                      fileName: resume.file_name,
                    })
                  }
                  /* Archive/Delete/Share/Tag stay My Resumes-only — the
                     Shared Database tab never offered them (it's a shared,
                     org-wide list to pick candidates from, not one this
                     modal manages), so only the read-only Preview/Download
                     actions carry over onto it. */
                  onArchive={activeTab === 'my-resumes' && canArchiveMyResumes ? handleArchiveResume : undefined}
                  onDelete={
                    activeTab === 'my-resumes' && canDeleteMyResumes
                      ? (id) => {
                          const row = resumes.find(r => r.id === id);
                          setDeleteResumeTarget({
                            id,
                            name: row?.candidate_name || row?.file_name || 'this resume',
                          });
                        }
                      : undefined
                  }
                  canShare={activeTab === 'my-resumes' && canShareMyResumes}
                  canTag={activeTab === 'my-resumes' && canUpdateMyResumes}
                  archivedFolderId={activeTab === 'my-resumes' ? folders.find(f => f.name === 'Archived Resumes' && !f.parent_id)?.id : undefined}
                  /* Internal Database has no folder concept — the whole
                     tab is one flat, unfiltered list. */
                  folders={activeTab === 'my-resumes' ? tableFolders : []}
                  highlightQuery={searchTerm}
                  draggable={false}
                  /* Paginated, not one long scroll. `ResumeTable`'s built-in
                     pagination renders the same `components/Pagination`
                     the My Resumes and Resume Database pages use, with the
                     same props — so the count line, page buttons, per-page
                     picker, disabled states and hover/focus styling all
                     match those pages without a second implementation here.
                     Selection is held by resume id, so ticks survive a page
                     change. */
                  /* Left at its default (true), as on My Resumes and Resume
                     Database, so the Download Resume entry appears. */
                  canDownload
                  /* Fill the modal body and scroll inside it. Without this
                     the shell keeps `.tf-table-shell`'s 400px floor / vh cap
                     — taller than the space left under the header and tabs —
                     so its scrollbars ended up floating over the footer
                     buttons instead of staying in the table. */
                  containerClassName="flex-1 min-h-0 flex flex-col"
                  tableShellClassName="tf-table-shell--fill flex-1 min-h-0"
                  showEmptyAction={false}
                  emptyState={
                    activeTab === 'my-resumes'
                      /* Same call the My Resumes page makes: its illustrated
                         empty state for a genuinely empty folder, and the
                         table's own "no matches" copy while a search is
                         narrowing the list. */
                      ? (searchTerm.trim() ? undefined : renderNoResumesEmptyState(selectedFolder === 'all' ? undefined : selectedFolder))
                      : (
                        <div className="text-center py-10 sm:py-16">
                          <Database className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-300 dark:text-slate-500" />
                          <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No Resumes Found</h3>
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto">
                            {searchTerm
                              ? 'No resumes match your search. Try different keywords.'
                              : 'No resumes available in the internal database.'}
                          </p>
                        </div>
                      )
                  }
                  isArchivedFolder={
                    activeTab === 'my-resumes' &&
                    (folders.find(f => f.id === selectedFolder)?.name?.toLowerCase().includes('archived') || false)
                  }
                  /* Same rule as the My Resumes page: the folder column
                     only earns its place in the aggregated view. */
                  getFolderName={activeTab === 'my-resumes' && selectedFolder === 'all' ? getResumeFolderName : undefined}
                />
              )}
            </div>
          </div>
        </div>
        </DndProvider>
        ) : (
          <div className="flex-1 flex items-center justify-center p-10 text-center text-sm text-gray-500 dark:text-slate-400">
            You don't have permission to score resumes from either source.
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-3 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
              {selectedResumes.length > 0 ? (
                <span>
                  <span className="font-medium text-gray-900 dark:text-slate-50">{selectedResumes.length}</span> resume{selectedResumes.length === 1 ? '' : 's'} selected
                </span>
              ) : (
                <span>Select resumes to score</span>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowScoreReview(true)}
                disabled={(() => {
                  if (!canRunScoring) return true;
                  if (selectedResumes.length === 0) return true;
                  if (submitting) return true;
                  const selectedFolderData = folders.find(f => f.id === selectedFolder);
                  const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
                  if (isArchivedFolder && selectedResumes.length > 0) return true;
                  const selectedResumeObjects = resumes.filter(r => selectedResumes.includes(r.id));
                  const hasArchivedResumes = selectedResumeObjects.some(r => r.is_archived === true);
                  return hasArchivedResumes;
                })()}
                title={!canRunScoring ? 'You do not have permission to score resumes' : ''}
                className="px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1.5 sm:gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">Submitting...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Score {selectedResumes.length > 0 && `${selectedResumes.length} `}<span className="hidden sm:inline">Resume{selectedResumes.length === 1 ? '' : 's'}</span>
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
            matchResult: item.status === 'completed'
              ? item.matchStatus
                ? (item.matchStatus === 'exact_match' || item.matchStatus === 'excellent' ? 'Exact Match'
                  : item.matchStatus === 'partial_match' || item.matchStatus === 'partial' ? 'Partial Match'
                  : 'No Match')
                : undefined
              : undefined,
            score: item.score,
            overallRating10: item.overallRating10,
          }))}
          filterByJobId={jobId}
          showJobTitleColumn={false}
          onRetryFailed={async (scoringItem) => {
            await handleRetryFailed(scoringItem.resumeId);
          }}
          minimized={isBulkProgressMinimized}
          onViewResult={onViewResult ? (item) => {
            activeScoringJobs.forEach(job => clearJob(job.jobId));
            onViewResult(item);
          } : undefined}
          onMinimize={() => {
            // Hide the overlay so the user can navigate freely, but stay mounted:
            // this component owns progressItems, so unmounting here is what used
            // to make the popup unrestorable. The restore-callback effect above
            // wires the floating indicator's expand back to this state.
            setIsBulkProgressMinimized(true);
            /* Deliberately NOT setMinimized(true): the floating indicator shows
               the full card first and shrinks itself to the pill after 3s.
               Flipping it here made the run appear to vanish instantly. */
          }}
        />
      )}

      {/* Upload Modal — pre-selects the currently-viewed folder so the user
          doesn't have to re-pick. "all" is a UI filter (not a real folder),
          so we leave it unset and let the modal default to root. */}
      {showUploadModal && (
        <UploadModal
          /* The UI-shaped folders (count/parentId), same conversion the
             table uses — this was previously handed the raw API shape. */
          /* resumeService.Folder (resume_count) vs types.Folder (count) - two shapes,
             same name. Cast only; the same array is passed. */
          folders={tableFolders as any}
          tenant={tenant}
          uploadSection="my-resumes"
          targetFolder={selectedFolder !== 'all' ? selectedFolder : undefined}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
          onCreateFolder={handleCreateFolder}
          onScoreResume={handleAutoSelectAfterUpload}
          onScoreResumes={handleAutoSelectManyAfterUpload}
        />
      )}

      {/* Delete confirmation for the table's ⋮ menu. The table fires
          `onDelete` immediately (unlike Archive, which it confirms itself),
          so the guard has to live here. Same design as My Resumes' own
          delete-resume dialog, just scoped to always exactly one resume. */}
      <AlertDialog
        open={!!deleteResumeTarget}
        onOpenChange={(open) => { if (!open) setDeleteResumeTarget(null); }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-lg">
          <button
            type="button"
            onClick={() => setDeleteResumeTarget(null)}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <AlertDialogHeader>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">Delete Resume</AlertDialogTitle>
                <p className="mt-1 text-sm text-gray-500">This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4">
                <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      This action is <span className="font-semibold text-red-600">permanent</span> and{' '}
                      <span className="font-semibold text-red-600">cannot be undone</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <Lock className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      Deleted resume <span className="font-semibold text-red-600">cannot be recovered</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                      <AlertCircle className="h-4 w-4" />
                    </span>
                    <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                    <p className="text-sm text-gray-800">
                      All associated data will be <span className="font-semibold text-red-600">permanently removed</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-brand-orange">
                    <HelpCircle className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Are you sure you want to delete{' '}
                      <span className="font-semibold text-gray-900">&ldquo;{deleteResumeTarget?.name ?? ''}&rdquo;</span>?
                    </p>
                    <p className="mt-0.5 text-sm text-gray-500">This action cannot be reversed.</p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogAction
              onClick={handleConfirmDeleteResume}
              className="gap-2 bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete Resume
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review before scoring — Candidates Selected with this job fixed, the
          same dialog every other Score Resume flow shows first. */}
      {showScoreReview && (
        <ApplyToJobModal
          mode="scoring"
          resumes={selectedResumes.map(id => {
            const r = resumes.find(x => x.id === id);
            return (r
              ? { ...r, name: r.candidate_name || (r as { name?: string }).name || 'Unknown' }
              : { id, name: 'Resume' }) as unknown as SharedResume;
          })}
          fixedJob={{
            id: jobId,
            job_id: jobShortId,
            title: jobTitle,
            status: 'Published',
            location: '',
            daysActive: 0,
            requiredMatch: 70,
            applicants: 0,
            skills: [],
            versionNumber: jobVersion ?? undefined,
          } as SharedJob}
          onClose={() => setShowScoreReview(false)}
          onApply={(resumeIds) => {
            setShowScoreReview(false);
            void handleSubmitForScoring(resumeIds);
          }}
        />
      )}

      {/* Preview — same in-app document viewer My Resumes uses. */}
      {previewResume && (
        <ResumeTextPreviewModal
          resumeId={previewResume.id}
          title={previewResume.name}
          subtitle={previewResume.fileName}
          onClose={() => setPreviewResume(null)}
        />
      )}
    </div>
  );
}
