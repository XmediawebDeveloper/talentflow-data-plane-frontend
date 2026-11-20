'use client';

import { X, Database, FolderOpen, Search, Loader2, ClipboardList, Upload, ChevronDown, ChevronRight, FolderInput, FolderRoot, Download, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { SelectAllMenu } from '@/components/ui/select-all-menu';
import { RESUME_TAB_LABEL } from '@/lib/constants/resumePools';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { lineageKey } from '@/lib/utils/jobOpeningDisplay';
import type { Job } from '@/lib/types/types';
import { useState, useEffect, useMemo, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { resumeService, folderService, archiveResumeToArchivedFolder, unarchiveResumesToPreviousFolder, Resume, Folder as FolderType } from '@/lib/services/resumeService';
import type { Folder as TableFolder } from '@/lib/types/types';
import ResumeTable from './ResumeTable';
import DeleteResumeDialog, { type DeleteResumeVersionTarget } from '@/components/resumes/DeleteResumeDialog';
import FolderTree, { FOLDER_NAME_MAX_LENGTH } from './FolderTree';
import NoResumesEmptyState from '@/components/resumes/NoResumesEmptyState';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import ApplyToJobModal from './ApplyToJobModal';
import type { Job as SharedJob, Resume as SharedResume } from '@/lib/types/types';
import { convertApiResumeToRow, convertApiFolderToTree } from '@/lib/utils/resumeMappers';
import { scoringService, normalizeScoringStatus, type BatchScoringStatus } from '@/lib/services/scoringService';
import { formatOverallScore } from '@/lib/utils/matchStatus';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { useAuth } from '@/components/providers/AuthProvider';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import { useResumeUploadFlow } from './resumes/useResumeUploadFlow';
import { useScoringProgress, toMatchResult } from '@/contexts/ScoringProgressContext';
import { Skeleton } from '@/components/ui/skeleton';
import { canDownloadResume, DOWNLOAD_BLOCKED_MESSAGE } from '@/lib/permissions/resumeDownload';
import ResumeBulkConfirmModal, { type ResumeBulkConfirmKind } from '@/components/resumes/ResumeBulkConfirmModal';
import { RESUME_DELETE_OWNER_ONLY_REASON, canDeleteResumes } from '@/lib/permissions/resumeDelete';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

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
  resumeVersion?: number;
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
  /**
   * The host's JD row. When given, the popup offers a Job Version picker - the
   * Resume Database scoring dialog's own Version History panel - and scores
   * against the version picked there. Starts on `jobId`'s version. Omitted, the
   * popup scores `jobId` exactly as before.
   */
  job?: Job;
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
  /** Swap the header's Close (X) icon for a Cancel button beside Score
   *  Resumes in the footer. Both just call `onClose` — nothing is scored. */
  cancelInFooter?: boolean;
}

export default function SelectSourceModal({
  onClose,
  jobTitle: hostJobTitle,
  jobId: hostJobId,
  jobShortId,
  jobVersion: hostJobVersion,
  job,
  onScoringFinished,
  onScoringComplete,
  onViewResult,
  cancelInFooter = false
}: SelectSourceModalProps) {
  const router = useRouter();

  /* THE JD VERSION THIS RUN SCORES AGAINST. Each job version is its own JD row,
     so scoring "against v2" means sending v2's row id. Starts on the host's own
     version and changes only when the recruiter picks another one below; every
     use of `jobId` / `jobTitle` / `jobVersion` in this component - the
     already-scored check, the bulk start, the polling, the progress registry,
     retry - reads it, so a run is scored, tracked and labelled against the
     version that was picked. A run already started keeps the id it started with
     (its closures captured it), and the picker is locked while one is going. */
  const [scoringTarget, setScoringTarget] = useState<{ id: string; title: string; version: number | null }>(
    () => ({ id: hostJobId, title: hostJobTitle, version: hostJobVersion ?? null }),
  );
  const jobId = scoringTarget.id;
  const jobTitle = scoringTarget.title;
  const jobVersion = scoringTarget.version;

  /* The lineage behind the picker - the same hook and endpoint the Resume
     Database scoring dialog's Version History uses. */
  const versionLineage = useJobVersionLineage();
  const versionKey = job ? lineageKey(job) : '';
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const versionRadioGroup = `score-version-${useId()}`;
  useEffect(() => {
    if (job && versionKey) versionLineage.ensureLoaded(versionKey, hostJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, versionKey, hostJobId]);
  const lineageVersions = job ? versionLineage.lineages[versionKey] : undefined;
  const publishedVersionCount = (lineageVersions || []).filter(v => (v.status || '').toLowerCase() === 'published').length;

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
  // The tenant admin owns every source, so it is enabled by default and does
  // not wait for the per-user permission flags to load (they were still unset
  // on first open, leaving the tab disabled until a refresh).
  const hasInternalDBAccess =
    isTenantAdmin ||
    ((user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false) &&
      hasPermissionCode('internal_db:score'));

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
  const canDeleteMyResumes = canDeleteResumes(isTenantAdmin);
  const canArchiveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:archive');
  const canDownloadMine = canDownloadResume({ isTenantAdmin, hasPermissionCode, own: true });
  const canDownloadShared = canDownloadResume({ isTenantAdmin, hasPermissionCode, own: false });
  const canShareMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:share');
  // Same rule as My Resumes' "Move to Folder".
  const canMoveMyResumes = isTenantAdmin || hasPermissionCode('my_resumes:update') || hasPermissionCode('my_resumes:upload') || hasPermissionCode('my_resumes:create');

  // State
  // Default to whichever source the Owner actually left enabled — falls
  // back to 'internal-db' only when My Resumes' own Score Resume permission
  // is off but Internal Database's is on.
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'internal-db'>(
    hasMyResumesScoreAccess ? 'my-resumes' : (hasInternalDBAccess ? 'internal-db' : 'my-resumes')
  );
  const [resumes, setResumes] = useState<Resume[]>([]);
  /* Every row either tab has loaded, by id. The selection is kept across the
     My Resumes / Shared Database tabs, so ticked resumes are read from here
     rather than from the list currently on screen. A stable Map (never
     replaced); the latest copy of a row wins. */
  const [seenRows] = useState<Map<string, Resume>>(() => new Map());
  resumes.forEach(r => seenRows.set(r.id, r));
  const rowOf = (id: string): Resume | undefined => seenRows.get(id);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
  // Review step before scoring — the shared Candidates Selected dialog with
  // this job fixed: untick to drop a resume, pick another version, then Score.
  const [showScoreReview, setShowScoreReview] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  /* Ticks made inside Archived Resumes — kept apart from `selectedResumes`
     (the scoring set): archived resumes can't be scored, only unarchived.
     Same permission the other pickers use for Unarchive. */
  const [archivedPicks, setArchivedPicks] = useState<string[]>([]);
  const [unarchiving, setUnarchiving] = useState(false);
  const canUnarchiveMyResumes = canArchiveMyResumes;
  const viewingArchivedFolder =
    activeTab === 'my-resumes' &&
    (folders.find(f => f.id === selectedFolder)?.name?.toLowerCase().includes('archived') || false);
  // Archived ticks belong to that folder: leaving it (or the tab) drops them.
  useEffect(() => {
    if (!viewingArchivedFolder) setArchivedPicks([]);
  }, [viewingArchivedFolder]);

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
  /* The scoring batch behind the progress popup (Cancel / Retry act on it). */
  const [progressBatchId, setProgressBatchId] = useState<string | undefined>(undefined);
  const [scoringStats, setScoringStats] = useState({ queued: 0, processing: 0, completed: 0, failed: 0 });

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
        // Active only — the number All Resumes lists (archived sit in their folder).
        resumeService.list({ source: 'my-resumes', page_size: 1 }),
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

  type FolderListResult = { data?: Awaited<ReturnType<typeof folderService.list>>; error?: unknown; failed: boolean };
  const fetchData = async () => {
    setLoading(true);
    /* Folders (My Resumes tab only) start WITH the resume list rather than
       after it — they don't depend on it, and the serial wait added a full
       round trip to opening the popup. Applied at the same point as before
       (after the resumes land, skipped if they fail), so the result is the
       same; only the wait is gone. Settles to a tagged result, never throws. */
    const foldersPromise = activeTab === 'my-resumes'
      ? folderService.list().then<FolderListResult, FolderListResult>(
          (data) => ({ data, failed: false }),
          (error: unknown) => ({ error, failed: true }),
        )
      : null;
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
      // My Resumes' badge counts active resumes only (see refreshTabCounts);
      // this list includes archived ones, so it is not that number.
      if (activeTab === 'my-resumes') refreshTabCounts();
      else setTabCounts(prev => ({ ...prev, internalDb: loadedTotal }));

      // Fetch folders only for my-resumes tab
      if (foldersPromise) {
        try {
          const folderResult = await foldersPromise;
          if (folderResult.failed) throw folderResult.error;
          const folderData = folderResult.data;
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
      showErrorToast(error, "Couldn't load resumes", { id: 'select-source-load', retry: fetchData });
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
    /* All Resumes leaves archived resumes out, as on the My Resumes page —
       they live in the Archived Resumes folder only. (Archiving one from the
       row menu left it listed in BOTH places.) */
    if (activeTab === 'my-resumes' && selectedFolder === 'all') {
      filtered = filtered.filter(r => !r.is_archived);
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

  /* Uploading here runs the same flow as My Resumes — upload dialog,
     duplicate resolution, Upload History for bulk — and every resume it
     stores is ticked for scoring. */
  const selectUploadedResumes = (ids: string[]) =>
    setSelectedResumes(prev => [...prev, ...ids.filter(id => !prev.includes(id))]);
  const { openUploadToFolder, uploadFlowElements } = useResumeUploadFlow({
    /* resumeService.Folder (resume_count) vs types.Folder (count) - two shapes,
       same name. Cast only; the same array is passed. */
    folders: tableFolders as any,
    tenant,
    // "all" is a UI filter (not a real folder), so the dialog defaults to root.
    defaultTargetFolder: selectedFolder !== 'all' ? selectedFolder : undefined,
    canUpload: canUploadResumes,
    onCreateFolder: (name, parentId) => { void handleCreateFolder(name, parentId); },
    onRootFolderCreated: () => {
      folderService.list().then(data => setFolders(flattenFolders(data || []))).catch(() => {});
    },
    onRefresh: () => {
      fetchData();
      refreshTabCounts();
    },
    onResumeStored: (resume) => selectUploadedResumes([resume.id]),
    onBatchFinished: (stored) => {
      selectUploadedResumes(stored.map(r => r.id));
      toast.success(`${stored.length} resume${stored.length !== 1 ? 's' : ''} uploaded and selected. Add more or click "Score Resumes" to continue.`);
    },
    successHint: 'It is now selected. Add more or click "Score Resumes" to continue.',
  });

  /* The nested shape `FolderTree` renders from. This modal keeps `folders`
     flat (it filters resumes by a single id), but the tree draws its
     hierarchy from `children`, so re-link parents to children here and
     prepend the virtual "All Resumes" fixture the My Resumes page also adds. */
  const activeResumeCount = useMemo(() => resumes.filter(r => !r.is_archived).length, [resumes]);
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
      // Counts what All Resumes lists — active resumes, not archived ones.
      { id: 'all', name: 'All Resumes', count: activeResumeCount, children: [] },
      ...roots,
    ];
  }, [folders, activeResumeCount]);

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

    return (
      <NoResumesEmptyState
        description={
          isArchivedResumesFolder
            ? ''
            : canUploadResumes
              ? 'No resumes are available in this folder yet. Add a resume to get started.'
              : 'No resumes are available in this folder yet.'
        }
        onAction={isArchivedResumesFolder ? undefined : () => openUploadToFolder()}
        actionDisabledReason={!canUploadResumes ? 'You do not have permission to upload resumes' : undefined}
      />
    );
  };

  /* Select-all adapter. `ResumeTable` reports the desired state; the archived
     guard and the "keep picks made in other folders" rule are the modal's own
     and are preserved exactly as the previous list had them. */
  const handleTableSelectAll = (selected: boolean) => {
    // Inside Archived Resumes, ticks pick resumes to unarchive (not to score).
    if (viewingArchivedFolder) {
      const ids = filteredResumes.map(r => r.id);
      setArchivedPicks(prev =>
        selected ? Array.from(new Set([...prev, ...ids])) : prev.filter(id => !ids.includes(id)),
      );
      return;
    }
    const visibleIds = filteredResumes
      .filter(r => !r.is_archived && !(r.is_tenant_user_email || r.isTenantUserEmail))
      .map(r => r.id);
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
  // One row (⋮ → Delete) or the ticked rows (actions bar → Delete).
  const [deleteResumeTarget, setDeleteResumeTarget] = useState<{ ids: string[]; names: string[] } | null>(null);
  /* Preview — same in-app document viewer My Resumes uses, replacing the old
     new-tab `/recruitment/resume-view/[id]` behaviour so Preview reads
     identically in both places. */
  const [previewResume, setPreviewResume] = useState<{ id: string; name: string; fileName?: string } | null>(null);

  const handleArchiveResume = async (resumeId: string) => {
    try {
      // Same destination as My Resumes: flagged AND filed into the one
      // Archived Resumes folder, not left in its folder with just the flag.
      await archiveResumeToArchivedFolder(resumeId, rowOf(resumeId)?.folder_id);
      setSelectedResumes(prev => prev.filter(id => id !== resumeId));
      toast.success('Resume archived');
      await fetchData();
      refreshTabCounts();
    } catch (error: any) {
      showErrorToast(error, "Couldn't archive the resume");
    }
  };

  /* Unarchive — the ticked archived resumes (toolbar button) or one row (⋮).
     Each goes back to the folder it was archived from, else Root, exactly as
     My Resumes does. Succeeded ones are unticked; failed ones stay ticked for
     a retry. The list and folder counts are read again. */
  const handleUnarchiveResumes = async (ids: string[]) => {
    if (!canUnarchiveMyResumes || ids.length === 0 || unarchiving) return;
    const rootFolder = folders.find(f => f.name.toLowerCase() === 'root' && !f.parent_id);
    if (!rootFolder) {
      toast.error('Root folder not found');
      return;
    }
    setUnarchiving(true);
    try {
      const { succeeded, failed, restoredToOriginal } = await unarchiveResumesToPreviousFolder(ids, {
        rootFolderId: rootFolder.id,
        archivedFolderId: folders.find(f => f.name === 'Archived Resumes' && !f.parent_id)?.id,
        validFolderIds: new Set(folders.map(f => f.id)),
      });
      if (succeeded.length) {
        const n = succeeded.length;
        toast.success(
          restoredToOriginal === n
            ? `${n} resume${n === 1 ? '' : 's'} unarchived and restored to ${n === 1 ? 'its' : 'their'} original folder`
            : `${n} resume${n === 1 ? '' : 's'} unarchived${restoredToOriginal ? ` (${restoredToOriginal} restored, ${n - restoredToOriginal} to Root)` : ' (moved to Root)'}`,
        );
        setArchivedPicks(prev => prev.filter(id => !succeeded.includes(id)));
        await fetchData();
        refreshTabCounts();
      }
      if (failed.length) {
        showErrorToast(null, `Couldn't unarchive ${failed.length} resume${failed.length === 1 ? '' : 's'}`);
      }
    } finally {
      setUnarchiving(false);
    }
  };

  const handleConfirmDeleteResume = async (version?: DeleteResumeVersionTarget) => {
    if (!deleteResumeTarget) return;
    const { ids } = deleteResumeTarget;
    setDeleteResumeTarget(null);
    if (version) {
      // Just one version: the candidate stays, another version becomes the latest.
      try {
        await resumeService.delete(version.id, { onlyThisVersion: true });
        dropFromSelections(ids);
        toast.success(`Version ${version.version} deleted`);
        await fetchData();
        refreshTabCounts();
      } catch (error: any) {
        showErrorToast(error, `Couldn't delete version ${version.version}`);
      }
      return;
    }
    const results = await Promise.allSettled(ids.map(id => resumeService.delete(id)));
    const done = ids.filter((_, i) => results[i].status === 'fulfilled');
    const failedCount = ids.length - done.length;
    if (done.length) {
      dropFromSelections(done); // failed ones stay ticked for a retry
      toast.success(done.length === 1 ? 'Resume deleted' : `${done.length} resumes deleted`);
      await fetchData();
      refreshTabCounts();
    }
    if (failedCount) {
      const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      showErrorToast(firstError?.reason ?? null, `Couldn't delete ${failedCount === 1 ? 'the resume' : `${failedCount} resumes`}`);
    }
  };

  /* ── Actions ▾ menu (the Job Openings selection toolbar) ─────────────────
     Acts on what is ticked in the current view: the archived picks inside
     Archived Resumes, else the scoring selection. Every action unticks the
     rows it succeeded on and keeps failures ticked; data changes re-read the
     list and counts. */
  const actionIds = viewingArchivedFolder ? archivedPicks : selectedResumes;
  const dropFromSelections = (ids: string[]) => {
    setSelectedResumes(prev => prev.filter(id => !ids.includes(id)));
    setArchivedPicks(prev => prev.filter(id => !ids.includes(id)));
  };
  const clearActionSelection = () => {
    if (viewingArchivedFolder) setArchivedPicks([]);
    else setSelectedResumes([]);
  };
  const resumeName = (id: string) => {
    const r = rowOf(id);
    return r?.candidate_name || r?.file_name || 'this resume';
  };
  const [bulkBusy, setBulkBusy] = useState(false);

  const handleBulkMove = async (folderId: string) => {
    const ids = [...actionIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map(id => resumeService.move(id, folderId)));
      const done = ids.filter((_, i) => results[i].status === 'fulfilled');
      const failedCount = ids.length - done.length;
      if (done.length) {
        const target = folders.find(f => f.id === folderId)?.name || 'folder';
        toast.success(`${done.length} resume${done.length === 1 ? '' : 's'} moved to ${target}`);
        dropFromSelections(done);
        await fetchData();
        refreshTabCounts();
        /* Same flow as My Resumes: open the destination folder so the user sees
           the resumes they just moved there (the list is filtered by folder
           client-side, so the fresh fetch above already holds them). */
        setSelectedFolder(folderId);
      }
      if (failedCount) showErrorToast(results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason ?? null, `Couldn't move ${failedCount === 1 ? 'the resume' : `${failedCount} resumes`}`);
    } finally {
      setBulkBusy(false);
    }
  };

  /* Archive and multi-resume Download confirm in the My Resumes design
     (ResumeBulkConfirmModal) before running. */
  const [bulkConfirm, setBulkConfirm] = useState<ResumeBulkConfirmKind | null>(null);

  const handleBulkArchive = async () => {
    const ids = [...actionIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => archiveResumeToArchivedFolder(id, rowOf(id)?.folder_id)),
      );
      const done = ids.filter((_, i) => results[i].status === 'fulfilled');
      const failedCount = ids.length - done.length;
      if (done.length) {
        toast.success(`${done.length} resume${done.length === 1 ? '' : 's'} archived`);
        dropFromSelections(done);
        await fetchData();
        refreshTabCounts();
      }
      if (failedCount) showErrorToast(results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason ?? null, `Couldn't archive ${failedCount === 1 ? 'the resume' : `${failedCount} resumes`}`);
    } finally {
      setBulkBusy(false);
      setBulkConfirm(null);
    }
  };

  const saveBlob = (blob: Blob, name: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };
  /* One resume downloads as its own file; several ask first, then go out as
     one ZIP — as on My Resumes. Download changes nothing, so no re-read. */
  const handleBulkDownload = async () => {
    const ids = [...actionIds];
    if (!ids.length || bulkBusy) return;
    if (ids.length === 1) {
      const r = rowOf(ids[0]);
      try {
        saveBlob(await resumeService.download(ids[0]), r?.file_name || `${r?.candidate_name || 'resume'}.${r?.file_type || 'pdf'}`);
        toast.success('Resume downloaded');
        clearActionSelection();
      } catch (error) {
        showErrorToast(error, "Couldn't download the resume", { retry: handleBulkDownload });
      }
      return;
    }
    // Several: confirm first (Download as ZIP), then runZipDownload.
    setBulkConfirm('zip');
  };
  const runZipDownload = async () => {
    const ids = [...actionIds];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    const toastId = toast.loading(`Preparing ${ids.length} resumes for download...`);
    try {
      const { zipSync } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      let failed = 0;
      for (let i = 0; i < ids.length; i++) {
        const r = rowOf(ids[i]);
        let name = r?.file_name || `${r?.candidate_name || `resume_${i + 1}`}_resume`;
        if (files[`resumes/${name}`]) name = `${i + 1}_${name}`;
        try {
          files[`resumes/${name}`] = new Uint8Array(await (await resumeService.download(ids[i])).arrayBuffer());
        } catch {
          failed += 1;
        }
      }
      if (failed === ids.length) throw new Error('none downloaded');
      saveBlob(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), `resumes_${new Date().toISOString().split('T')[0]}.zip`);
      if (failed) {
        // Partial ZIP: keep the selection so the missing ones can be retried.
        toast.warning(`${ids.length - failed} resumes downloaded · ${failed} failed`, { id: toastId });
      } else {
        toast.success(`${ids.length} resumes downloaded as ZIP`, { id: toastId });
        clearActionSelection();
      }
    } catch (error) {
      showErrorToast(error, "Couldn't create the ZIP file", { id: toastId, retry: runZipDownload });
    } finally {
      setBulkBusy(false);
      setBulkConfirm(null);
    }
  };

  /* The Actions ▾ menu (Job Openings pattern): open state, the Move to Folder
     sub-list, and closing on an outside click. */
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showMoveList, setShowMoveList] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showActionsMenu) return;
    const onDown = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
        setShowMoveList(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showActionsMenu]);
  // Nothing ticked → nothing to act on: close the menu.
  useEffect(() => {
    if (actionIds.length === 0) { setShowActionsMenu(false); setShowMoveList(false); }
  }, [actionIds.length]);
  const closeActionsMenu = () => { setShowActionsMenu(false); setShowMoveList(false); };
  /* Move targets, depth-first with their depth for indenting: every folder
     except the one on screen. Archived Resumes is left out — archiving goes
     through Archive, which also remembers where the resume came from. */
  const moveTargets = useMemo(() => {
    const out: { id: string; name: string; depth: number; count: number; isRoot: boolean }[] = [];
    const walk = (list: TableFolder[], depth: number) => list.forEach(f => {
      if (f.id === 'all') return;
      const isArchived = f.name === 'Archived Resumes' && !f.parentId;
      const isRoot = !f.parentId && f.name.toLowerCase() === 'root';
      if (!isArchived && f.id !== selectedFolder) out.push({ id: f.id, name: f.name, depth, count: f.count, isRoot });
      if (f.children?.length) walk(f.children, depth + 1);
    });
    walk(folderTree, 0);
    return out;
  }, [folderTree, selectedFolder]);

  // Toggle resume selection
  const handleToggleResume = (resumeId: string) => {
    // Inside Archived Resumes, a tick picks the resume to unarchive.
    if (viewingArchivedFolder) {
      setArchivedPicks(prev => (prev.includes(resumeId) ? prev.filter(id => id !== resumeId) : [...prev, resumeId]));
      return;
    }

    // An archived resume shown anywhere else still can't be scored.
    const resume = resumes.find(r => r.id === resumeId);
    if (resume?.is_archived) {
      toast.error('Archived resumes cannot be scored. Please select an active resume.');
      return;
    }

    // Block if the resume's email belongs to an existing team member —
    // same restriction the Resume Database module enforces.
    if (resume && (resume.is_tenant_user_email || resume.isTenantUserEmail)) {
      toast.error('This email belongs to an existing team member. It cannot be selected.');
      return;
    }

    setSelectedResumes(prev =>
      prev.includes(resumeId)
        ? prev.filter(id => id !== resumeId)
        : [...prev, resumeId]
    );
  };

  // Ids on the table's current page — fed to "Select all on this page".
  const [pageResumeIds, setPageResumeIds] = useState<string[]>([]);

  // Tab change
  const handleTabChange = (tab: 'my-resumes' | 'internal-db') => {
    setActiveTab(tab);
    // The selection is kept across tabs (like the Resume Database page): tick
    // some in My Resumes, switch to Shared Database, tick more, score them all.
    setSearchTerm('');
    setSelectedFolder('all');
  };

  /* Each snapshot of the run's batch. The progress popup (BulkScoringProgressModal,
     mounted for the whole run, minimised or not) is the ONE poller of the batch
     — every second while it runs, and it stops once the batch is settled. This
     popup used to run a second, 3-second loop of its own on the same batch. */
  const settledBatchRef = useRef<string | null>(null);
  const handleRunBatchStatus = (batchStatus: BatchScoringStatus) => {
    // Update progress items from batch status. `items` is guarded — an
    // undefined `items` used to throw before ever reaching the `allDone`
    // check, leaving the popup stuck on "Queued".
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
        updateItemStatus(jobId, itemId, 'Scored successfully', { score: batchItem.overall_score, overallRating10: batchItem.overall_rating_10, matchResult: toMatchResult(batchItem.match_status) });
      } else if (itemStatus === 'failed') {
        updateItemStatus(jobId, itemId, 'Failed', { errorReason: batchItem.error_message || 'Scoring failed' });
      } else if (itemStatus === 'processing') {
        updateItemStatus(jobId, itemId, 'Scoring in progress');
      }
    }

    const aggregateStatus = normalizeScoringStatus(batchStatus.status);
    const allDone = aggregateStatus === 'completed' || aggregateStatus === 'failed' ||
      (batchStatus.queued === 0 && batchStatus.processing === 0);

    if (!allDone) {
      // Running again (e.g. Retry from the popup): its finish is reported again.
      settledBatchRef.current = null;
      return;
    }
    if (settledBatchRef.current === batchStatus.batch_id) return; // reported already
    settledBatchRef.current = batchStatus.batch_id;
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
  };

  // Submit for scoring with progress tracking
  const handleSubmitForScoring = async (reviewedIds?: string[], reviewedVersions?: (number | undefined)[]) => {
    // From the review step: the resumes still ticked, each on its chosen version.
    const idsToScore = reviewedIds ?? selectedResumes;
    if (idsToScore.length === 0) return;

    let resumesToScore = [...idsToScore];
    setSubmitting(true);

    try {
      /* One request (2026-11-20): the server leaves out the resumes already
         scored for this job (POST /scoring/check-existing's rule), runs the
         unit check on the ones left (POST /unit-pool/validate-before-action's
         rule) and starts the batch — it used to be three serial round trips. */
      const response = await scoringService.startBulkScoringAsync(jobId, resumesToScore, { skipExisting: true, validateUnits: true });

      // Already-scored resumes: the same toasts the separate check showed.
      if ((response.existing_count ?? 0) > 0 && response.existing_scores) {
        const alreadyScoredNames = response.existing_scores
          .map(s => `${s.candidate_name} (${formatOverallScore(s.overall_rating_10, s.overall_score)})`)
          .join(', ');

        if (response.new_count === 0) {
          // ALL resumes already scored - block entirely
          toast.error(
            `All ${response.existing_count} resume(s) already scored for "${response.jd_title}": ${alreadyScoredNames}`,
            { duration: 6000 }
          );
          setSubmitting(false);
          return;
        }

        // SOME already scored - warn and filter them out
        toast.warning(
          `${response.existing_count} resume(s) already scored and will be skipped: ${alreadyScoredNames}`,
          { duration: 5000 }
        );
        const existingIds = new Set(response.existing_scores.map(s => s.resume_id));
        resumesToScore = resumesToScore.filter(id => !existingIds.has(id));
      }

      // Not enough units for the ones left: the message the client check showed.
      const unitRefusal = scoringService.bulkUnitRefusal(response);
      if (unitRefusal) throw unitRefusal;
      if (!response.batch_id || resumesToScore.length === 0) {
        setSubmitting(false);
        return;
      }

      // Build resume items for progress display. The version is the one picked
      // in the review step (parallel to `reviewedIds`), else the row's own.
      const resumeItems = resumesToScore.map(resumeId => {
        const resume = rowOf(resumeId);
        const reviewedIndex = reviewedIds ? reviewedIds.indexOf(resumeId) : -1;
        return {
          resumeId,
          candidateName: resume?.candidate_name || 'Unknown',
          resumeVersion: (reviewedIndex >= 0 ? reviewedVersions?.[reviewedIndex] : undefined) ?? resume?.version,
        };
      });

      // Initialize progress items and show modal
      const initialItems: ProgressItem[] = resumeItems.map(item => ({
        resumeId: item.resumeId,
        resumeVersion: item.resumeVersion,
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
        resumeVersion: item.resumeVersion,
        candidateName: item.candidateName,
        jobTitle: jobTitle,
        jobId: jobId,
        source: (activeTab === 'my-resumes' ? 'My Resumes' : 'Internal DB') as 'My Resumes' | 'Internal DB',
      }));
      const batchId = response.batch_id;
      setProgressBatchId(batchId);
      startScoringJob(jobId, jobTitle, contextItems, typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined, { batchId });

      // Batch progress arrives through handleRunBatchStatus (the popup polls it).

    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      showErrorToast(error, "Couldn't start scoring");
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
      showErrorToast(error, `Couldn't re-score ${item.candidateName || 'this resume'}`);
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

  /* Rename from a folder's (+) menu — the Resume Database page's rules:
     no markup, the length cap, Archived Resumes keeps its name, and no two
     folders of one parent share a name. */
  const handleRenameFolder = async (id: string, name: string) => {
    try {
      if (/<[^>]+>/.test(name) || /javascript:|data:|vbscript:/i.test(name)) {
        toast.error('Folder name must not contain HTML or script content');
        return;
      }
      const trimmedName = name.trim();
      if (!trimmedName) return;
      if (trimmedName.length > FOLDER_NAME_MAX_LENGTH) {
        toast.error(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer`);
        return;
      }
      const target = folders.find(f => f.id === id);
      if (target && target.name === 'Archived Resumes' && !target.parent_id) {
        toast.error('Archived Resumes folder cannot be renamed');
        return;
      }
      const parentId = target?.parent_id || undefined;
      if (folders.find(f =>
        f.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        (f.parent_id || undefined) === parentId &&
        f.id !== id &&
        f.id !== 'all'
      )) {
        const parentName = parentId ? folders.find(f => f.id === parentId)?.name : undefined;
        toast.error(parentName
          ? `"${trimmedName}" already exists inside "${parentName}"`
          : `Folder "${trimmedName}" already exists`);
        return;
      }
      await folderService.update(id, { name: trimmedName });
      setFolders(prev => prev.map(f => (f.id === id ? { ...f, name: trimmedName } : f)));
      toast.success('Folder renamed');
    } catch (error) {
      showErrorToast(error, "Couldn't rename the folder");
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
      showErrorToast(error, "Couldn't create the folder");
    }
  };


  return (
    // While the progress popup is minimized this component stays mounted (it owns
    // progressItems and the restore callback) but its overlay must not block the
    // page — hide it rather than unmounting, so "expand" can bring it straight back.
    <ModalA11y><div className={`fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm ${isBulkProgressMinimized ? 'hidden' : 'flex'} items-center justify-center z-50 p-3 sm:p-6`}>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-[94vw] 2xl:max-w-[1680px] h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)] [@media(max-height:820px)]:sm:h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 [@media(max-height:820px)]:sm:py-3 border-b border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <div className="flex items-start gap-2 sm:gap-4 min-w-0">
            <div className="hidden sm:flex h-10 w-10 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-lg mb-0.5 sm:mb-1">
                <span className="hidden sm:inline">Select Applicants to Score</span>
                <span className="sm:hidden">Select Applicants</span>
              </h2>
              {/* JD ID · job name · job version */}
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {jobShortId && <JobIdBadge className="inline-flex items-center flex-shrink-0">{jobShortId}</JobIdBadge>}
                <span className="tf-row-name truncate min-w-0 max-w-full" title={jobTitle}>{jobTitle}</span>
                {jobVersion != null && jobVersion > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 flex-shrink-0" title="Job version">V{jobVersion}</span>
                )}
              </div>
            </div>
          </div>
          {!cancelInFooter && (
            <IconButton bare label="Close"
              onClick={onClose}
              className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0">
              <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
            </IconButton>
          )}
        </div>

        {/* JOB VERSION - which version the selected resumes are scored
            against. The chosen version is named here (and in the header) before
            anything is scored; "View Versions" opens the Resume Database
            scoring dialog's own Version History panel, a Select radio per
            version, published ones selectable. With a single published version
            there is nothing to choose, so it is simply stated. */}
        {job && (
          <div className="border-b border-gray-100 dark:border-slate-700/60 px-3 sm:px-6 py-2.5 sm:py-3 [@media(max-height:820px)]:sm:py-2 bg-white dark:bg-slate-900 flex-shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 min-w-0 text-sm">
                <span className="text-gray-600 dark:text-slate-400">Score against Job Version</span>
                {jobVersion != null && jobVersion > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 flex-shrink-0">V{jobVersion}</span>
                )}
                {lineageVersions && publishedVersionCount <= 1 && (
                  <span className="tf-meta">Only published version</span>
                )}
              </div>
              {publishedVersionCount > 1 && (
                <button
                  type="button"
                  onClick={() => setVersionPickerOpen(open => !open)}
                  disabled={submitting || showProgressModal}
                  aria-expanded={versionPickerOpen}
                  className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                    versionPickerOpen
                      ? 'bg-brand-sky text-brand-blue border-brand-blue/30 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 dark:bg-slate-800 dark:text-slate-100 dark:border-brand-blue/50'
                      : 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
                  }`}
                  title={versionPickerOpen ? 'Hide version history' : 'Choose the job version to score against'}
                >
                  {versionPickerOpen ? 'Hide Versions' : 'View Versions'}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionPickerOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
            {versionPickerOpen && publishedVersionCount > 1 && (
              <div className="mt-2.5 max-h-64 overflow-auto">
                <JobVersionHistoryPanel
                  job={job}
                  versions={lineageVersions}
                  loading={versionLineage.isLoading(versionKey)}
                  versionDetails={versionLineage.versionDetails}
                  versionApplicants={versionLineage.versionApplicants}
                  openInNewTab
                  staticRows
                  /* Every published version is a target here, the latest
                     included - there is no card radio standing in for it. */
                  keepLatestWhenSelectable
                  onSelectVersion={(versionJob) => {
                    setScoringTarget({
                      id: versionJob.id,
                      title: versionJob.title || hostJobTitle,
                      version: versionJob.versionNumber ?? null,
                    });
                    setVersionPickerOpen(false);
                  }}
                  selectedVersionId={scoringTarget.id}
                  selectHint={(versionJob) => `Score against v${versionJob.versionNumber ?? 1}`}
                  selectionDisabled={submitting || showProgressModal}
                  selectionDisabledReason="Scoring is in progress"
                  radioGroupName={versionRadioGroup}
                  publishedOnly
                  includeInactiveVersions
                />
              </div>
            )}
          </div>
        )}

        {/* Tabs — the Resume Database page's pool switch (same segmented
            strip, icons, colours and count badge), centred in the popup. A
            pool without the Score Resume permission stays visible but greyed
            out (hover explains). */}
        <div className="border-b border-gray-100 dark:border-slate-700/60 px-3 sm:px-6 py-3 bg-slate-50 dark:bg-slate-950 flex-shrink-0 flex justify-center">
          <div
            role="tablist"
            aria-label="Resume pool"
            className="grid w-full max-w-full grid-cols-2 gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200 shadow-sm sm:inline-flex sm:w-auto dark:bg-slate-900 dark:ring-slate-700"
          >
            {([
              { tab: 'my-resumes', Icon: FolderOpen, iconColor: 'text-brand-orange', allowed: hasMyResumesScoreAccess, count: tabCounts.myResumes, lockedTitle: 'You do not have permission to score resumes from My Resumes' },
              { tab: 'internal-db', Icon: Database, iconColor: 'text-brand-cyan', allowed: hasInternalDBAccess, count: tabCounts.internalDb, lockedTitle: 'You do not have permission to score resumes from the Shared Database' },
            ] as const).map(({ tab, Icon, iconColor, allowed, count, lockedTitle }) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => { if (!allowed) return; handleTabChange(tab); }}
                aria-disabled={!allowed}
                title={!allowed ? lockedTitle : undefined}
                className={`inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors sm:h-9 sm:gap-2 sm:px-4 sm:whitespace-nowrap ${
                  !allowed
                    ? 'font-medium text-gray-400 cursor-not-allowed opacity-60 dark:text-slate-500'
                    : activeTab === tab
                      ? 'bg-slate-100 font-semibold text-brand-blue shadow-sm ring-1 ring-brand-blue/30 dark:bg-slate-800'
                      : 'font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`hidden sm:block h-4 w-4 shrink-0 ${allowed ? iconColor : 'text-gray-500'}`} />
                {RESUME_TAB_LABEL[tab]}
                {count !== undefined && count !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                      activeTab === tab
                        ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
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
        {/* Phones: the folders are a band above the list (as on My Resumes)
            and the whole area scrolls as one; from md they sit side by side. */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 max-md:overflow-y-auto md:overflow-hidden">
          {/* Left Sidebar — the My Resumes page's own FolderTree, so the
              hierarchy, System Folders / My Folders grouping, labels, icons,
              colours, spacing and selected state are identical to that page
              rather than a second implementation of them.

              A folder here filters the list. "+ New" and each folder's (+)
              menu — Upload to Folder, Create Subfolder, Rename Folder — work
              as on the Resume Database page, so a recruiter picking resumes
              to score doesn't have to leave this flow to file them. Delete
              Folder stays on that page: it decides where the folder's resumes
              go, which is no part of picking resumes to score. */}
          {activeTab === 'my-resumes' && (
            /* `flex` (not `block`) so the panel stretches to the row's height —
               FolderTree lays its content out with `md:absolute md:inset-0`
               and would otherwise collapse to its 360px floor. */
            <div className="flex flex-shrink-0">
              <FolderTree
                folders={folderTree}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                onCreateFolder={handleCreateFolder}
                canCreateFolder={canUploadResumes}
                onRenameFolder={handleRenameFolder}
                canRenameFolder={canUpdateMyResumes}
                canUploadToFolder={canUploadResumes}
                onUploadToFolder={(folderId) => {
                  if (!canUploadResumes) return;
                  // The upload targets the selected folder (UploadModal's targetFolder).
                  setSelectedFolder(folderId);
                  openUploadToFolder(folderId, true);
                }}
                hideDeleteFolder
                resumes={[]}
                width={sidebarWidth}
                onWidthChange={handleSidebarWidthChange}
                collapsible
              />
            </div>
          )}


          {/* Main Content */}
          <div className="flex-1 flex flex-col max-md:flex-none md:overflow-hidden">
            {/* Search and Bulk Actions */}
            {/* Left padding lines the Select All ▾ square up vertically with the
                list's row checkboxes (measured): the phone/tablet cards sit 16px
                further in, the md+ table runs edge to edge, so the toolbar's
                left inset follows each. */}
            <div className="pl-[17px] pr-3 sm:pl-[20px] sm:pr-6 md:pl-0.5 py-2.5 sm:py-4 [@media(max-height:820px)]:sm:py-2 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/60 flex-shrink-0">
              {/* sm+: Select All ▾ · search · Upload on one row.
                  Phones, two rows: the search with an icon-only Upload beside
                  it, then Select All ▾ with Actions ▾ and an icon-only Clear
                  once something is ticked. The inner group is `contents`
                  there so all of these wrap as one set of items; the search's
                  basis (100% − the 36px Upload − the gap) closes row one. */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4">
                <div className="flex flex-1 min-w-0 flex-wrap items-center gap-2 sm:gap-x-4 max-sm:contents">
                <div className="shrink-0">
                  {(() => {
                    /* Inside Archived Resumes the same menu ticks resumes to
                       unarchive (archivedPicks), not to score. */
                    if (viewingArchivedFolder) {
                      const visibleIds = filteredResumes.map(r => r.id);
                      const pageIds = pageResumeIds.filter(id => visibleIds.includes(id));
                      return (
                        <SelectAllMenu
                          selectedCount={archivedPicks.length}
                          pageCount={pageIds.length}
                          totalCount={visibleIds.length}
                          noun="resumes"
                          allSelected={visibleIds.length > 0 && visibleIds.every(id => archivedPicks.includes(id))}
                          pageSelected={pageIds.length > 0 && pageIds.every(id => archivedPicks.includes(id))}
                          onSelectPage={() => setArchivedPicks(prev => Array.from(new Set([...prev, ...pageIds])))}
                          onDeselectPage={() => setArchivedPicks(prev => prev.filter(id => !pageIds.includes(id)))}
                          onSelectAll={() => handleTableSelectAll(true)}
                          onClear={() => setArchivedPicks([])}
                        />
                      );
                    }
                    /* The Job Openings "Select All ▾" menu (JD module):
                       this page / every resume in the folder / clear. Same
                       archived guard and "keep picks from other folders"
                       rule the old button had. */
                    const selectable = new Set(
                      filteredResumes
                        .filter(r => !r.is_archived && !(r.is_tenant_user_email || r.isTenantUserEmail))
                        .map(r => r.id),
                    );
                    const visibleIds = Array.from(selectable);
                    const pageIds = pageResumeIds.filter(id => selectable.has(id));
                    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedResumes.includes(id));
                    const pageSelected = pageIds.length > 0 && pageIds.every(id => selectedResumes.includes(id));
                    const blockedArchived = () => {
                      const folder = folders.find(f => f.id === selectedFolder);
                      if (folder?.name?.toLowerCase().includes('archived')) {
                        toast.error('Archived resumes cannot be scored. Please select an active resume.');
                        return true;
                      }
                      return false;
                    };
                    return (
                      <SelectAllMenu
                        selectedCount={selectedResumes.length}
                        pageCount={pageIds.length}
                        totalCount={visibleIds.length}
                        noun="resumes"
                        allSelected={allVisibleSelected}
                        pageSelected={pageSelected}
                        onSelectPage={() => {
                          if (blockedArchived() || pageIds.length === 0) return;
                          setSelectedResumes(prev => Array.from(new Set([...prev, ...pageIds])));
                        }}
                        onDeselectPage={() => setSelectedResumes(prev => prev.filter(id => !pageIds.includes(id)))}
                        onSelectAll={() => handleTableSelectAll(true)}
                        onClear={() => setSelectedResumes([])}
                      />
                    );
                  })()}
                </div>
                {/* Actions ▾ + Clear — the Job Openings selection toolbar, shown
                    once a resume is ticked (Select All or a single row). Acts on
                    the archived picks inside Archived Resumes, else on the
                    scoring selection. Shared Database is a shared list this
                    popup only picks from, so it offers Download only. */}
                {actionIds.length > 0 && (
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="relative" ref={actionsMenuRef}>
                      <button
                        type="button"
                        onClick={() => { setShowActionsMenu(v => !v); setShowMoveList(false); }}
                        aria-label={`Actions for ${actionIds.length} selected`}
                        aria-expanded={showActionsMenu}
                        className={`relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 shadow-sm animate-in fade-in zoom-in-95 duration-300 ${showActionsMenu ? 'bg-gray-200' : ''}`}
                      >
                        <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                        </span>
                        {bulkBusy || unarchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Actions<span className="max-sm:hidden"> ({actionIds.length})</span>
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      {showActionsMenu && (() => {
                        const busy = bulkBusy || unarchiving;
                        const item = (enabled: boolean, danger = false) =>
                          `w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                            !enabled
                              ? 'text-gray-400 cursor-not-allowed opacity-60'
                              : danger ? 'text-destructive hover:bg-destructive-subtle' : 'text-gray-700 hover:bg-gray-50'
                          }`;
                        const mine = activeTab === 'my-resumes';
                        const canDl = mine ? canDownloadMine : canDownloadShared;
                        return (
                          <div className="absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-2 z-50">
                            {mine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { if (!canMoveMyResumes || busy) return; setShowMoveList(v => !v); }}
                                  aria-disabled={!canMoveMyResumes || busy}
                                  aria-expanded={showMoveList}
                                  title={!canMoveMyResumes ? 'You do not have permission to move resumes to a folder' : ''}
                                  className={item(canMoveMyResumes && !busy)}
                                >
                                  {/* Icon colours: My Resumes' folder picker / row ⋮ menu. */}
                                  <FolderInput className={`w-4 h-4 ${canMoveMyResumes && !busy ? 'text-brand-orange' : ''}`} />
                                  <span className="flex-1">Move to Folder</span>
                                  <ChevronRight className={`w-4 h-4 transition-transform ${showMoveList ? 'rotate-90' : ''}`} />
                                </button>
                                {showMoveList && (
                                  <div className="max-h-56 overflow-y-auto border-y border-gray-100 dark:border-slate-700/60 bg-gray-50/60 dark:bg-slate-800/40 py-1">
                                    {moveTargets.length === 0 ? (
                                      <p className="px-3 py-2 tf-meta">No other folders</p>
                                    ) : moveTargets.map(f => (
                                      <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => { closeActionsMenu(); void handleBulkMove(f.id); }}
                                        className="w-full py-1.5 pr-3 text-left text-sm text-foreground hover:bg-accent/50 transition-colors flex items-center gap-2"
                                        style={{ paddingLeft: `${1.75 + Math.min(f.depth, 3) * 0.75}rem` }}
                                        title={f.name}
                                      >
                                        {/* Same as My Resumes' Move to Folder list: Root cyan, folders orange, count muted. */}
                                        {f.isRoot
                                          ? <FolderRoot className="w-4 h-4 shrink-0 text-brand-cyan" />
                                          : <FolderInput className="w-4 h-4 shrink-0 text-brand-orange" />}
                                        <span className="truncate flex-1">{f.name}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">({f.count})</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => { if (!canDl || busy) return; closeActionsMenu(); void handleBulkDownload(); }}
                              aria-disabled={!canDl || busy}
                              title={!canDl ? DOWNLOAD_BLOCKED_MESSAGE : ''}
                              className={item(canDl && !busy)}
                            >
                              <Download className={`w-4 h-4 ${canDl && !busy ? 'text-menu-icon-download' : ''}`} />
                              Download Selected
                            </button>
                            {mine && (viewingArchivedFolder ? (
                              <button
                                type="button"
                                onClick={() => { if (!canUnarchiveMyResumes || busy) return; closeActionsMenu(); void handleUnarchiveResumes(archivedPicks); }}
                                aria-disabled={!canUnarchiveMyResumes || busy}
                                title={!canUnarchiveMyResumes ? 'You do not have permission to unarchive resumes' : ''}
                                className={item(canUnarchiveMyResumes && !busy)}
                              >
                                <ArchiveRestore className={`w-4 h-4 ${canUnarchiveMyResumes && !busy ? 'text-menu-icon-archive' : ''}`} />
                                Unarchive Selected
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { if (!canArchiveMyResumes || busy) return; closeActionsMenu(); setBulkConfirm('archive'); }}
                                aria-disabled={!canArchiveMyResumes || busy}
                                title={!canArchiveMyResumes ? 'You do not have permission to archive resumes' : ''}
                                className={item(canArchiveMyResumes && !busy)}
                              >
                                <Archive className={`w-4 h-4 ${canArchiveMyResumes && !busy ? 'text-menu-icon-archive' : ''}`} />
                                Archive Selected
                              </button>
                            ))}
                            {mine && (
                              <>
                                <div className="border-t border-gray-200 dark:border-slate-700 my-2" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!canDeleteMyResumes || busy) return;
                                    closeActionsMenu();
                                    setDeleteResumeTarget({ ids: [...actionIds], names: actionIds.map(resumeName) });
                                  }}
                                  aria-disabled={!canDeleteMyResumes || busy}
                                  title={!canDeleteMyResumes ? RESUME_DELETE_OWNER_ONLY_REASON : ''}
                                  className={item(canDeleteMyResumes && !busy, true)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Selected
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Clear — a standalone button beside Actions, as on Job Openings. */}
                    <button
                      type="button"
                      onClick={clearActionSelection}
                      title="Clear the selection"
                      aria-label="Clear the selection"
                      className="h-9 px-3 max-sm:w-9 max-sm:px-0 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 shadow-sm"
                    >
                      <X className="w-4 h-4" />
                      <span className="max-sm:sr-only">Clear</span>
                    </button>
                  </div>
                )}
                {/* min width so, beside Actions + Clear on a phone, the search
                    wraps to its own line instead of squeezing to nothing. */}
                <div className={`flex-1 min-w-[12rem] relative max-sm:order-first max-sm:min-w-0 ${activeTab === 'my-resumes' && !viewingArchivedFolder ? 'max-sm:basis-[calc(100%-2.75rem)]' : 'max-sm:basis-full'}`}>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, skills..."
                    className="w-full h-9 pl-9 pr-4 border border-gray-300 dark:border-slate-700 rounded-lg text-sm bg-gray-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-800 placeholder:text-gray-500 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-transparent transition-colors"
                  />
                </div>
                </div>
                {/* Upload Resume button - only for My Resumes tab + canUploadResumes RBAC.
                    Not inside Archived Resumes — nothing is uploaded there. */}
                {activeTab === 'my-resumes' && !viewingArchivedFolder && (
                  <div className="flex items-center justify-end max-sm:order-first">
                    <button
                      onClick={() => { if (!canUploadResumes) return; openUploadToFolder(); }}
                      aria-disabled={!canUploadResumes}
                      aria-label="Upload Resume"
                      title={!canUploadResumes ? 'You do not have permission to upload resumes' : 'Upload Resume'}
                      className={`h-9 max-sm:w-9 max-sm:justify-center max-sm:px-0 px-3 sm:px-4 text-sm whitespace-nowrap rounded-lg transition-colors font-medium flex items-center gap-1.5 sm:gap-2 ${
                        canUploadResumes
                          ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Upload Resume</span>
                      <span className="sr-only">Upload</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Resume List. Both tabs render the same shared table the
                Resume Database and My Resumes pages use — column set and
                order, widths, sticky header, sticky Actions column,
                separators, hover/selected states, checkbox styling,
                pagination — so this popup's Shared Database tab looks
                exactly like the Resume Database page instead of a second,
                hand-rolled implementation of it. */}
            <div className="flex-1 min-h-0 flex flex-col max-md:overflow-y-auto max-md:px-3">
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
                  selectedResumes={viewingArchivedFolder ? archivedPicks : selectedResumes}
                  onSelectResume={handleToggleResume}
                  onSelectAll={handleTableSelectAll}
                  hideHeaderSelectAll
                  /* A resume whose email belongs to an existing team member
                     is greyed out and locked out of selection/actions, same
                     as the Resume Database module's My Resumes / Internal DB
                     views. */
                  showTeamMemberBadge
                  /* Tablets get the desktop table, not the phone cards. */
                  tableFrom="md"
                  onPageItemsChange={setPageResumeIds}
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
                  canDownload={activeTab === 'my-resumes' ? canDownloadMine : canDownloadShared}
                  onArchive={activeTab === 'my-resumes' ? handleArchiveResume : undefined}
                  /* ⋮ → Unarchive on an archived row, as on My Resumes. */
                  onUnarchive={activeTab === 'my-resumes' ? (id) => void handleUnarchiveResumes([id]) : undefined}
                  onUnarchiveDisabled={!canUnarchiveMyResumes}
                  onUnarchiveDisabledReason="You do not have permission to unarchive resumes"
                  onArchiveDisabled={!canArchiveMyResumes}
                  onArchiveDisabledReason="You do not have permission to archive resumes"
                  onDeleteDisabled={!canDeleteMyResumes}
                  onDeleteDisabledReason={RESUME_DELETE_OWNER_ONLY_REASON}
                  onDelete={
                    activeTab === 'my-resumes'
                      ? (id) => {
                          setDeleteResumeTarget({ ids: [id], names: [resumeName(id)] });
                        }
                      : undefined
                  }
                  canShare={activeTab === 'my-resumes' && canShareMyResumes}
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
                  /* Fill the modal body and scroll inside it. Without this
                     the shell keeps `.tf-table-shell`'s 400px floor / vh cap
                     — taller than the space left under the header and tabs —
                     so its scrollbars ended up floating over the footer
                     buttons instead of staying in the table. */
                  /* The Job Openings pager (2026-11-17). */
                  paginationStyle="list"
                  containerClassName="flex flex-col md:flex-1 md:min-h-0"
                  tableShellClassName="tf-table-shell--fill flex-1 min-h-0"
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
                          <p className="tf-body-secondary max-w-md mx-auto">
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
          <div className="flex-1 flex items-center justify-center p-10 text-center tf-body-muted">
            You don't have permission to score resumes from either source.
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 px-4 sm:px-6 py-3 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div className="tf-body-secondary">
              {viewingArchivedFolder ? (
                archivedPicks.length > 0 ? (
                  <span>
                    <span className="font-medium text-gray-900 dark:text-slate-50">{archivedPicks.length}</span> archived resume{archivedPicks.length === 1 ? '' : 's'} selected to unarchive
                  </span>
                ) : (
                  <span>Archived resumes can&apos;t be scored — select them to unarchive</span>
                )
              ) : selectedResumes.length > 0 ? (
                <span>
                  <span className="font-medium text-gray-900 dark:text-slate-50">{selectedResumes.length}</span> resume{selectedResumes.length === 1 ? '' : 's'} selected
                </span>
              ) : (
                <span>Select resumes to score</span>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3">
              {cancelInFooter && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="tf-btn tf-btn-secondary w-full sm:w-auto px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors whitespace-normal gap-0"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => { if (!canRunScoring) return; setShowScoreReview(true); }}
                aria-disabled={!canRunScoring}
                disabled={(() => {
                  if (!canRunScoring) return false; // greyed via aria-disabled so the hover reason shows
                  if (selectedResumes.length === 0) return true;
                  if (submitting) return true;
                  const selectedFolderData = folders.find(f => f.id === selectedFolder);
                  const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
                  if (isArchivedFolder && selectedResumes.length > 0) return true;
                  const selectedResumeObjects = selectedResumes.map(rowOf).filter((r): r is Resume => !!r);
                  const hasArchivedResumes = selectedResumeObjects.some(r => r.is_archived === true);
                  return hasArchivedResumes;
                })()}
                title={!canRunScoring ? 'You do not have permission to score resumes' : ''}
                className={`w-full sm:w-auto justify-center px-4 py-2 text-sm bg-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-1.5 sm:gap-2 ${
                  canRunScoring ? 'hover:bg-brand-blue-2' : 'opacity-50 cursor-not-allowed'
                }`}
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
          headerJobVersion={jobVersion}
          batchId={progressBatchId}
          onBatchStatus={handleRunBatchStatus}
          activePollMs={1000}
          onClose={handleCloseProgress}
          progressData={progressItems.map((item): ScoringProgressItem => ({
            id: item.resumeId,
            resumeId: item.resumeId,
            resumeVersion: item.resumeVersion,
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

      {uploadFlowElements}

      {/* Delete confirmation for the table's ⋮ menu. The table fires
          `onDelete` immediately (unlike Archive, which it confirms itself),
          so the guard has to live here. Shared with My Resumes (DeleteResumeDialog),
          just scoped to always exactly one resume. */}
      {/* Archive / Download-as-ZIP confirms — the My Resumes design, above this z-50 popup. */}
      <ResumeBulkConfirmModal
        kind={bulkConfirm ?? 'archive'}
        open={!!bulkConfirm}
        count={actionIds.length}
        busy={bulkBusy}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => void (bulkConfirm === 'zip' ? runZipDownload() : handleBulkArchive())}
        zIndexClass="z-[70]"
      />

      <DeleteResumeDialog
        open={!!deleteResumeTarget}
        names={deleteResumeTarget?.names ?? []}
        resumeId={deleteResumeTarget?.ids.length === 1 ? deleteResumeTarget.ids[0] : undefined}
        onCancel={() => setDeleteResumeTarget(null)}
        onConfirm={handleConfirmDeleteResume}
      />

      {/* Review before scoring — Candidates Selected with this job fixed, the
          same dialog every other Score Resume flow shows first. */}
      {showScoreReview && (
        <ApplyToJobModal
          mode="scoring"
          resumes={selectedResumes.map(id => {
            const r = rowOf(id);
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
          onApply={(resumeIds, _jobIds, _jobs, _sourceIds, resumeVersions) => {
            setShowScoreReview(false);
            void handleSubmitForScoring(resumeIds, resumeVersions);
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
    </div></ModalA11y>
  );
}
