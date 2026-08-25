'use client';

import { X, Users, Database, Search, CheckSquare, Square, MinusSquare, Loader2, Briefcase, MapPin, Target, Upload } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { resumeService, folderService, Resume, Folder as FolderType } from '@/lib/services/resumeService';
import type { Folder as TableFolder } from '@/lib/types/types';
import ResumeTable from './ResumeTable';
import FolderTree from './FolderTree';
import NoResumesEmptyState from '@/components/resumes/NoResumesEmptyState';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { convertApiResumeToRow, convertApiFolderToTree } from '@/lib/utils/resumeMappers';
import { scoringService } from '@/lib/services/scoringService';
import { dispatchUnitsConsumed } from '@/lib/services/api';
import { toast } from 'sonner';
import { handleQuotaError } from '@/lib/utils/quotaErrorHandler';
import { useAuth } from '@/components/providers/AuthProvider';
import BulkScoringProgressModal, { ScoringProgressItem } from './BulkScoringProgressModal';
import SkillsList from '@/components/ui/SkillsList';
import UploadModal from './UploadModal';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';

// Folder-tree pane sizing. Kept in step with FolderTree's own clamp
// (200–400px) so a width restored from storage is one the tree will honour.
const FOLDER_PANE_MIN = 200;
const FOLDER_PANE_MAX = 400;
const FOLDER_PANE_DEFAULT = 280;
const FOLDER_PANE_STORAGE_KEY = 'selectSourceModal:folderPaneWidth';

// Progress item interface (internal)
interface ProgressItem {
  resumeId: string;
  candidateName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'already_scored';
  score?: number;
  matchStatus?: string;
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
  const { user, tenant, isTenantAdmin, hasPermissionCode } = useAuth();
  const { startScoringJob, updateItemStatus, setMainPanelOpen, setOnRestorePanel, setMinimized } = useScoringProgress();

  // Check if user has Internal DB access permission
  const hasInternalDBAccess = user?.permissions?.canAccessInternalDB || user?.permissions?.canViewInternalDB || false;

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
  const [activeTab, setActiveTab] = useState<'my-resumes' | 'internal-db'>('my-resumes');
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedResumes, setSelectedResumes] = useState<string[]>([]);
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
  // Mirror into a ref so the long-lived polling closure below reads the current
  // value instead of the one captured when scoring started.
  const isBulkProgressMinimizedRef = useRef(false);
  useEffect(() => { isBulkProgressMinimizedRef.current = isBulkProgressMinimized; }, [isBulkProgressMinimized]);

  // Hide the global floating widget only while the progress popup is actually
  // on screen. Once minimized we must release it, otherwise
  // GlobalScoringProgressIndicator bails out on `isMainPanelOpen` and the user
  // gets no floating pill at all.
  useEffect(() => {
    setMainPanelOpen(showProgressModal && !isBulkProgressMinimized);
    return () => { setMainPanelOpen(false); };
  }, [showProgressModal, isBulkProgressMinimized, setMainPanelOpen]);

  // Register how the floating indicator restores this popup. Without this the
  // indicator falls back to setMinimized(false) and only ever shows its own
  // small card — the popup the user minimized never comes back.
  useEffect(() => {
    if (showProgressModal && isBulkProgressMinimized) {
      setOnRestorePanel(() => () => {
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

          // API returns a tree (parent.children). The folder-tree renderer
          // below filters by `parent_id` against this array, which only ever
          // sees top-level nodes — sub-folders live inside `children` and
          // would never appear (this was the "sub folder doesn't show" bug).
          // Flatten so every folder is searchable regardless of depth.
          const flattenFolders = (list: any[]): any[] => {
            const out: any[] = [];
            const walk = (nodes: any[]) => {
              for (const f of nodes || []) {
                // Strip `children` so downstream consumers (e.g. UploadModal
                // which re-walks the tree) don't double-count entries that
                // already appear flat in this list.
                const { children, ...rest } = f;
                out.push(rest);
                if (Array.isArray(children) && children.length > 0) {
                  walk(children);
                }
              }
            };
            walk(list);
            return out;
          };
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

          // Update progress items from batch status
          setProgressItems(prev => prev.map(item => {
            const batchItem = batchStatus.items.find((b: any) => b.resume_id === item.resumeId);
            if (!batchItem) return item;
            let status: ProgressItem['status'] = item.status;
            if (batchItem.status === 'completed') status = 'completed';
            else if (batchItem.status === 'failed') status = 'failed';
            else if (batchItem.status === 'processing') status = 'processing';
            else status = 'queued';
            return { ...item, status, score: batchItem.overall_score, matchStatus: batchItem.match_status };
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
            if (batchItem.status === 'completed') {
              updateItemStatus(jobId, itemId, 'Scored successfully', { score: batchItem.overall_score });
            } else if (batchItem.status === 'failed') {
              updateItemStatus(jobId, itemId, 'Failed', { errorReason: batchItem.error_message || 'Scoring failed' });
            } else if (batchItem.status === 'processing') {
              updateItemStatus(jobId, itemId, 'Scoring in progress');
            }
          }

          const allDone = batchStatus.status === 'completed' || batchStatus.status === 'failed' ||
            (batchStatus.queued === 0 && batchStatus.processing === 0);

          if (allDone) {
            setSubmitting(false);
            // Refresh header quota dropdown — RS deductions landed on CP
            dispatchUnitsConsumed();
            // Redirect to Scored Resumes tab after a short delay so user sees final state.
            // If the user minimised the popup they are working elsewhere — tearing
            // this component down would destroy the popup's owner (and its restore
            // callback), so "expand" would have nothing to reopen. Stay mounted and
            // let them come back to the finished result.
            setTimeout(() => {
              if (isBulkProgressMinimizedRef.current) return;
              setShowProgressModal(false);
              if (onScoringComplete) {
                onScoringComplete();
              } else {
                onClose();
              }
            }, 1500);
          } else {
            setTimeout(poll, 3000);
          }
        } catch {
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
          ? { ...i, status: 'completed' as const, score: Math.round(result.overall_score), matchStatus: result.match_status }
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
        const firstSuccess = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any> | undefined;
        if (firstSuccess) {
          return {
            success: true,
            resumeId: firstSuccess.value?.id,
            candidateName: firstSuccess.value?.candidate_name,
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
        candidateName: response.candidate_name
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

      return {
        success: false,
        error: `Failed to upload ${files[0]?.name || 'file'}`,
      };
    }
  };

  // Handle upload complete - auto-select the uploaded resume
  const handleUploadComplete = () => {
    setShowUploadModal(false);
    fetchData(); // Refresh the list
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
      if (allFolders.find(f => f.name.toLowerCase() === name.toLowerCase() && f.id !== 'all')) {
        toast.error(`Folder "${name}" already exists`);
        return;
      }
      await folderService.create(name, parentId);
      const folderData = await folderService.list();
      setFolders(folderData || []);
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
              <Target className="w-5 h-5 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-0.5 sm:mb-1">
                <span className="hidden sm:inline">Select Applicants to Score</span>
                <span className="sm:hidden">Select Applicants</span>
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 truncate">
                Job: <span className="font-medium text-gray-900 dark:text-slate-50">{jobTitle}</span>
              </p>
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
              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
                activeTab === 'my-resumes'
                  ? 'bg-brand-blue/10 ring-1 ring-brand-blue/15 text-brand-blue'
                  : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
              }`}>
                {tabCounts.myResumes ?? ''}
              </span>
            </button>
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
                <span className="hidden sm:inline">Internal Database</span>
                <span className="sm:hidden">Internal DB</span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
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
        <DndProvider backend={HTML5Backend}>
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar — the My Resumes page's own FolderTree, so the
              hierarchy, System Folders / My Folders grouping, labels, icons,
              colours, spacing and selected state are identical to that page
              rather than a second implementation of them.

              Browse-only: here a folder filters the list, and folder
              management stays on the My Resumes page where it belongs. */}
          {activeTab === 'my-resumes' && (
            /* `flex` (not `block`) so the panel stretches to the row's height —
               FolderTree lays its content out with `md:absolute md:inset-0`
               and would otherwise collapse to its 360px floor. */
            <div className="hidden lg:flex flex-shrink-0">
              <FolderTree
                folders={folderTree}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                resumes={[]}
                width={sidebarWidth}
                onWidthChange={handleSidebarWidthChange}
                readOnly
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

            {/* Resume List. My Resumes renders the shared table, which brings
                its own scroll shell and spacing — the padding here is for the
                Internal Database list, whose header is a fixed row above its
                own scrolling body. */}
            <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'my-resumes' ? '' : 'p-3 sm:p-6'}`}>
              {loading ? (
                <div className="flex items-center justify-center py-10 sm:py-16 tf-loader-center tf-loader-center--compact">
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-brand-blue" />
                  <span className="ml-2 sm:ml-3 text-xs sm:text-base text-gray-600 dark:text-slate-400">Loading resumes...</span>
                </div>
              ) : activeTab === 'internal-db' && filteredResumes.length === 0 ? (
                <div className="text-center py-10 sm:py-16">
                  <Database className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-300 dark:text-slate-500" />
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No Resumes Found</h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto">
                    {searchTerm
                      ? 'No resumes match your search. Try different keywords.'
                      : 'No resumes available in the internal database.'}
                  </p>
                </div>
              ) : activeTab === 'my-resumes' ? (
                /* The My Resumes page's own table, embedded. Everything visual
                   — column set and order, widths, sticky header, sticky
                   Actions column, separators, hover and selected states,
                   checkbox styling, scroll shell — comes from that one
                   component, so the popup follows the page automatically. */
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
                    /* Opened from the ⋮ menu's Preview; a new tab keeps the
                       popup and its current selection intact. */
                    onQuickView={(resume) =>
                      window.open(`/recruitment/resume-view/${resume.id}`, '_blank', 'noopener,noreferrer')
                    }
                    /* The rest of the My Resumes ⋮ menu, gated by the same
                       permissions that page uses. Download, Share and Add Tags
                       are self-contained in the table; Archive and Delete run
                       through the handlers above. */
                    onArchive={canArchiveMyResumes ? handleArchiveResume : undefined}
                    onDelete={
                      canDeleteMyResumes
                        ? (id) => {
                            const row = resumes.find(r => r.id === id);
                            setDeleteResumeTarget({
                              id,
                              name: row?.candidate_name || row?.file_name || 'this resume',
                            });
                          }
                        : undefined
                    }
                    canShare={canShareMyResumes}
                    canTag={canUpdateMyResumes}
                    archivedFolderId={folders.find(f => f.name === 'Archived Resumes' && !f.parent_id)?.id}
                    folders={tableFolders}
                    highlightQuery={searchTerm}
                    draggable={false}
                    /* Paginated, not one long scroll. `ResumeTable`'s built-in
                       pagination renders the same `components/Pagination`
                       the My Resumes page uses, with the same props — so the
                       count line, page buttons, per-page picker, disabled
                       states and hover/focus styling all match that page
                       without a second implementation here. Selection is held
                       by resume id, so ticks survive a page change. */
                    /* Left at its default (true), as on My Resumes, so the
                       Download Resume entry appears. */
                    canDownload
                    /* Fill the modal body and scroll inside it. Without this
                       the shell keeps `.tf-table-shell`'s 400px floor / vh cap
                       — taller than the space left under the header and tabs —
                       so its scrollbars ended up floating over the footer
                       buttons instead of staying in the table. */
                    containerClassName="flex-1 min-h-0 flex flex-col"
                    tableShellClassName="tf-table-shell--fill flex-1 min-h-0"
                    showEmptyAction={false}
                    /* Same call the My Resumes page makes: its illustrated
                       empty state for a genuinely empty folder, and the
                       table's own "no matches" copy while a search is
                       narrowing the list. */
                    emptyState={
                      searchTerm.trim()
                        ? undefined
                        : renderNoResumesEmptyState(selectedFolder === 'all' ? undefined : selectedFolder)
                    }
                    isArchivedFolder={
                      folders.find(f => f.id === selectedFolder)?.name?.toLowerCase().includes('archived') || false
                    }
                    /* Same rule as the My Resumes page: the folder column
                       only earns its place in the aggregated view. */
                    getFolderName={selectedFolder === 'all' ? getResumeFolderName : undefined}
                  />
              ) : (
                <div className="flex flex-col min-h-0 flex-1">
                  {/* Desktop Table Header - hidden on mobile */}
                  <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-gray-200 dark:border-slate-700/60 text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider flex-shrink-0">
                    <div className="col-span-1 flex items-center justify-center">
                      {(() => {
                        const visibleIds = filteredResumes.filter(r => !r.is_archived).map(r => r.id);
                        const visibleSelectedCount = visibleIds.filter(id => selectedResumes.includes(id)).length;
                        const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
                        const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
                        return (
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            ref={input => {
                              if (input) input.indeterminate = someVisibleSelected;
                            }}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40"
                            aria-label={allVisibleSelected ? 'Deselect all visible resumes' : 'Select all visible resumes'}
                          />
                        );
                      })()}
                    </div>
                    <div className="col-span-3">Candidate</div>
                    <div className="col-span-2">Current Role</div>
                    <div className="col-span-2">Contact</div>
                    <div className="col-span-2">Experience</div>
                    <div className="col-span-2">Skills</div>
                  </div>

                  {/* Resume Items — the scrolling region (the "tbody"). Mobile
                      cards keep a visible gap between them; the desktop table
                      rows instead share a border like a real table body. */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2 md:space-y-0 md:divide-y md:divide-gray-200 dark:md:divide-slate-700/60">
                  {filteredResumes.map((resume) => {
                    const isSelected = selectedResumes.includes(resume.id);
                    const selectedFolderData = folders.find(f => f.id === selectedFolder);
                    const isArchivedFolder = selectedFolderData?.name?.toLowerCase().includes('archived') || false;
                    const isArchived = resume.is_archived === true || isArchivedFolder;

                    return (
                      <div key={resume.id}>
                        {/* Mobile Card View */}
                        <div
                          className="md:hidden"
                          onClick={() => {
                            if (isArchived) {
                              toast.error('Archived resumes cannot be scored.');
                              return;
                            }
                            handleToggleResume(resume.id);
                          }}
                        >
                          <div className={`p-3 border-2 rounded-lg transition-all ${
                            isArchived
                              ? 'border-brand-orange/20 bg-brand-orange/5 ring-1 ring-brand-orange/20 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'border-brand-blue/40 bg-brand-blue/5 ring-1 ring-brand-blue/15 cursor-pointer'
                                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer'
                          }`}>
                            <div className="flex items-start gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isArchived) handleToggleResume(resume.id);
                                }}
                                disabled={isArchived}
                                className="p-0.5 mt-0.5 flex-shrink-0"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-brand-blue" />
                                ) : (
                                  <Square className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                                )}
                              </button>
                              <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                {(resume.candidate_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{resume.candidate_name || 'Unknown'}</span>
                                  {isArchived && (
                                    <span className="text-[10px] text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20 px-1 py-0.5 rounded flex-shrink-0">Archived</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 dark:text-slate-400 truncate">{resume.current_title || 'N/A'}{resume.current_company ? ` · ${resume.current_company}` : ''}</p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 dark:text-slate-500 flex-wrap">
                                  {resume.location && (
                                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{resume.location}</span>
                                  )}
                                  {resume.experience_years && (
                                    <span className="flex items-center gap-0.5"><Briefcase className="w-2.5 h-2.5" />{resume.experience_years}y</span>
                                  )}
                                </div>
                                {resume.skills && resume.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    <SkillsList
                                      skills={resume.skills}
                                      chipClassName="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded text-[10px]"
                                      moreClassName="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded text-[10px] hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Desktop Table Row — flat divide-y row, matching the
                            My Resumes table (ResumeTable.tsx): no per-row card
                            border/radius, a light brand-blue tint for the
                            selected/hover states instead. */}
                        <div
                          className={`hidden md:grid grid-cols-12 gap-4 px-4 py-3 items-center transition-colors ${
                            isArchived
                              ? 'bg-brand-orange/5 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'bg-brand-blue/10 ring-1 ring-inset ring-brand-blue/20 cursor-pointer'
                                : 'bg-white dark:bg-slate-900 hover:bg-brand-blue/5 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (isArchived) {
                              toast.error('Archived resumes cannot be scored. Please select an active resume.');
                              return;
                            }
                            handleToggleResume(resume.id);
                          }}
                        >
                          {/* Checkbox */}
                          <div className="col-span-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isArchived}
                              onChange={() => {
                                if (isArchived) {
                                  toast.error('Archived resumes cannot be scored. Please select an active resume.');
                                  return;
                                }
                                handleToggleResume(resume.id);
                              }}
                              className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>

                          {/* Candidate Name */}
                          <div className="col-span-3 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{resume.candidate_name || 'Unknown'}</div>
                            {isArchived && (
                              <span className="inline-flex items-center gap-1 text-xs text-brand-orange-deep bg-brand-orange/10 ring-1 ring-brand-orange/20 px-1.5 py-0.5 rounded mt-0.5">
                                Archived
                              </span>
                            )}
                            {resume.location && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                {resume.location}
                              </div>
                            )}
                          </div>

                          {/* Current Role */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-700 dark:text-slate-300">{resume.current_title || 'N/A'}</div>
                            {resume.current_company && (
                              <div className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{resume.current_company}</div>
                            )}
                          </div>

                          {/* Contact */}
                          <div className="col-span-2">
                            {resume.email && (
                              <div className="text-xs text-gray-700 dark:text-slate-300 truncate">{resume.email}</div>
                            )}
                            {resume.phone && (
                              <div className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{resume.phone}</div>
                            )}
                            {!resume.email && !resume.phone && (
                              <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </div>

                          {/* Experience */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-700 dark:text-slate-300">
                              {resume.experience_years ? `${resume.experience_years} years` : 'N/A'}
                            </div>
                            {resume.notice_period && (
                              <div className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{resume.notice_period}</div>
                            )}
                          </div>

                          {/* Skills */}
                          <div className="col-span-2">
                            {resume.skills && resume.skills.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                <SkillsList
                                  skills={resume.skills}
                                  chipClassName="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded text-xs"
                                  moreClassName="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded text-xs hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </DndProvider>

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
                onClick={onClose}
                className="px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitForScoring}
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
                    <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
          }))}
          filterByJobId={jobId}
          showJobTitleColumn={false}
          onRetryFailed={async (scoringItem) => {
            await handleRetryFailed(scoringItem.resumeId);
          }}
          minimized={isBulkProgressMinimized}
          onMinimize={() => {
            // Hide the overlay so the user can navigate freely, but stay mounted:
            // this component owns progressItems, so unmounting here is what used
            // to make the popup unrestorable. The restore-callback effect above
            // wires the floating indicator's expand back to this state.
            setIsBulkProgressMinimized(true);
            setMinimized(true);
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
          folders={tableFolders}
          tenant={tenant}
          uploadSection="my-resumes"
          targetFolder={selectedFolder !== 'all' ? selectedFolder : undefined}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
          onUploadComplete={handleUploadComplete}
          onCreateFolder={handleCreateFolder}
          onScoreResume={handleAutoSelectAfterUpload}
        />
      )}

      {/* Delete confirmation for the table's ⋮ menu. The table fires
          `onDelete` immediately (unlike Archive, which it confirms itself),
          so the guard has to live here. */}
      <ConfirmationDialog
        isOpen={!!deleteResumeTarget}
        onClose={() => setDeleteResumeTarget(null)}
        onConfirm={handleConfirmDeleteResume}
        title="Delete resume?"
        description={`"${deleteResumeTarget?.name ?? ''}" will be permanently deleted. This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
