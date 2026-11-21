'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Copy, GitBranch, Loader2, X, CheckCircle, AlertCircle, Clock, Calendar, ChevronDown, ChevronRight, FileText, Info, RefreshCw, Ban, Lightbulb, Minus, Upload, Layers, Search } from 'lucide-react';
import AppModal, { AppModalFooterButtons } from '@/components/ui/app-modal';
import ListPagination from '@/components/ListPagination';
import { Button } from '@/components/ui/button';
import UploadModal from '@/components/UploadModal';
import UploadHistoryEmptyState from '@/components/resumes/UploadHistoryEmptyState';
import type { DuplicateFile } from '@/components/DuplicateResumeModal';
import UploadHistoryDetailModal, { UploadHistoryItem } from '@/components/UploadHistoryDetailModal';
import BulkVersionResolutionModal from '@/components/BulkVersionResolutionModal';
import type { VersionedBatchItem } from '@/components/BulkVersionResolutionModal';
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
import { Folder as FolderType } from '@/lib/types/types';
import { Tenant } from '@/lib/types/tenant';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { Resume as ApiResume } from '@/lib/services/resumeService';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatIST } from '@/lib/utils/dateUtils';
import { setUploadHistoryOpener } from '@/lib/backgroundTasks';
import { clickableProps } from '@/lib/a11y/clickableProps';
import { IconButton } from '@/components/ui/icon-button';

// Dynamic import to avoid SSR issues with docx-preview dependency
const DuplicateResumeModal = dynamic(() => import('@/components/DuplicateResumeModal'), {
  ssr: false,
  loading: () => <div>Loading...</div>
});

const formatDateTimeIST = formatIST;

export interface ResumeUploadFlowOptions {
  /** The host's folders in the UI shape (flat with parentId, or a tree with children). */
  folders: FolderType[];
  tenant?: Tenant | null;
  /** Folder the upload dialog pre-selects when it is opened without one. */
  defaultTargetFolder?: string;
  canUpload?: boolean;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onViewResume?: (resumeId: string) => void;
  /** A root folder had to be created for the upload. */
  onRootFolderCreated?: (folder: FolderType) => void;
  /** Uploads landed (or were resolved / cancelled / retried) — reload the host's list. */
  onRefresh?: () => void;
  /** One resume was stored: a single upload ('upload') or an overwrite / new version of a duplicate ('duplicate'). */
  onResumeStored?: (resume: ApiResume, via: 'upload' | 'duplicate') => void;
  /** A bulk upload finished; the resumes it stored. */
  onBatchFinished?: (resumes: { id: string; candidateName: string }[]) => void;
  /** Appended to the upload / duplicate success toast ("It is now selected..."). */
  successHint?: string;
  /** false: the host announces a single upload itself. */
  successToast?: boolean;
}

/**
 * The whole resume upload flow of My Resumes — upload dialog, duplicate
 * resolution (discard / overwrite / save as new version), bulk upload with
 * Upload History (progress, retry, cancel, version resolution) — so every
 * place that uploads resumes behaves exactly like My Resumes. The host
 * renders `uploadFlowElements` and reacts through the callbacks.
 */
export function useResumeUploadFlow(opts: ResumeUploadFlowOptions) {
  // Callbacks are read at call time: polling outlives the render that started it.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const { user } = useAuth();

  /* Display segments of a folder's path, root-most first — flat folders link
     through parentId, a tree through children. */
  const folderSegments = useCallback((folderId?: string): string[] => {
    const byId = new Map<string, FolderType & { parentId?: string | null }>();
    const walk = (list: FolderType[], parentId?: string | null) => {
      for (const f of list) {
        byId.set(f.id, { ...f, parentId: f.parentId ?? parentId ?? null });
        if (f.children?.length) walk(f.children, f.id);
      }
    };
    walk(opts.folders);
    const segments: string[] = [];
    let current = folderId ? byId.get(folderId) : undefined;
    while (current) {
      segments.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return segments.length === 1 && segments[0].toLowerCase() === 'root' ? [] : segments;
  }, [opts.folders]);

  // Stop every polling interval when the host unmounts.
  useEffect(() => () => {
    pollingIntervalsRef.current.forEach(interval => clearInterval(interval));
    pollingIntervalsRef.current.clear();
  }, []);

  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string | undefined>();
  /* Set only by a folder's "Upload to Folder": the upload's folder dropdown
     then lists just that folder and its subfolders. */
  const [uploadScopeFolderId, setUploadScopeFolderId] = useState<string | undefined>();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);

  // Duplicate detection state
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateFile[]>([]);
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState<string | undefined>();
  /* Destination of the refused upload, as the upload dialog itself named it.
     Authoritative — it is the label the user picked. Only when it is missing
     (an upload started somewhere with no folder picker) does the id below get
     resolved against the folder tree instead. */
  const [pendingUploadFolderLabel, setPendingUploadFolderLabel] = useState<string | undefined>();
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

  // Upload history modal state
  const [isUploadHistoryModalOpen, setIsUploadHistoryModalOpen] = useState(false);
  const [isUploadHistoryMinimized, setIsUploadHistoryMinimized] = useState(false);

  /* Upload History in the shared "My Activities" list: every upload batch of
     this user is a row of its own there, built from the server (the dock
     reads them from the activity feed), so the same rows show on every
     device. A row's View reopens this panel — registered here while this
     host is mounted; with no host on the page the row opens My Resumes. */
  useEffect(() => {
    const open = () => {
      setIsUploadHistoryMinimized(false);
      setIsUploadHistoryModalOpen(true);
    };
    setUploadHistoryOpener(open);
    return () => setUploadHistoryOpener(null, open);
  }, []);
  /* Read by polling: no new poller once this host has unmounted. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [uploadHistoryTab, setUploadHistoryTab] = useState<'current' | 'completed'>('current');
  // Flipped the moment an upload starts here, so the Upload History button goes
  // live for a first-time user immediately instead of waiting for the resume
  // list to come back.
  const [uploadStartedThisSession, setUploadStartedThisSession] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<UploadHistoryItem | null>(null);
  const [uploadHistoryFilter, setUploadHistoryFilter] = useState<'completed' | 'duplicated' | 'versioned' | 'error' | 'pending' | 'cancelled' | null>(null);
  /* Upload History popup — display only: every file in one table, or the
     upload-by-upload cards; and how many table rows are shown. */
  const [uploadHistoryView, setUploadHistoryView] = useState<'table' | 'batches'>('batches');
  /* Files the user retried / cancelled from the table, for the tab + pill they
     did it on ('tab|filter'). They stay in that table with their new status
     even once they no longer match the pill, or their upload moves to the
     other tab — so an action never makes a row vanish. Display only. */
  const [uploadHistoryPinned, setUploadHistoryPinned] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  /* Table view bulk actions: the files ticked for Retry / Cancel, the
     confirmation, and which bulk action is running. */
  type UploadHistoryBulkItem = { batchId: string; itemId: string; fileName: string; status: string };
  const [uploadHistorySelected, setUploadHistorySelected] = useState<Map<string, UploadHistoryBulkItem>>(new Map());
  const [uploadHistoryBulk, setUploadHistoryBulk] = useState<{ open: boolean; mode: 'retry' | 'cancel'; items: UploadHistoryBulkItem[] }>({ open: false, mode: 'retry', items: [] });
  const [uploadHistoryBulkBusy, setUploadHistoryBulkBusy] = useState<null | 'retry' | 'cancel'>(null);
  // Per file table (the Table view, and each upload's "Show files"): search + page.
  const [uploadHistoryTableUi, setUploadHistoryTableUi] = useState<Record<string, { page: number; perPage: number; q: string }>>({});
  const uploadHistoryPagerScrollRef = useRef<HTMLSpanElement | null>(null);
  // When the last in-flight batch finishes while the user is watching the
  // Currently Processing tab, move them to Completed instead of leaving them
  // on the "No uploads in progress" empty state.
  const activeUploadCount = useMemo(
    () => uploadHistory.filter(
      r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)
    ).length,
    [uploadHistory]
  );
  const prevActiveUploadCountRef = useRef(activeUploadCount);
  useEffect(() => {
    const prev = prevActiveUploadCountRef.current;
    prevActiveUploadCountRef.current = activeUploadCount;
    // Never in the Table view (it has no tabs) or while a status pill is picked.
    const userIsWorking = uploadHistoryView === 'table' || !!uploadHistoryFilter;
    if (prev > 0 && activeUploadCount === 0 && isUploadHistoryModalOpen && uploadHistoryTab === 'current' && !userIsWorking) {
      setUploadHistoryTab('completed');
      setUploadHistoryFilter(null);
    }
  }, [activeUploadCount, isUploadHistoryModalOpen, uploadHistoryTab, uploadHistoryFilter, uploadHistoryView]);
  const [retryingBatches, setRetryingBatches] = useState<Set<string>>(new Set());
  const [cancellingBatches, setCancellingBatches] = useState<Set<string>>(new Set());
  const [retryingItems, setRetryingItems] = useState<Set<string>>(new Set());
  const [cancellingItems, setCancellingItems] = useState<Set<string>>(new Set());
  const [cancelBatchConfirm, setCancelBatchConfirm] = useState<{ isOpen: boolean; batchId: string; pendingCount: number }>({ isOpen: false, batchId: '', pendingCount: 0 });
  const [cancelItemConfirm, setCancelItemConfirm] = useState<{ isOpen: boolean; batchId: string; itemId: string; fileName: string }>({ isOpen: false, batchId: '', itemId: '', fileName: '' });

  // Bulk version resolution state
  const [selectedVersionedItems, setSelectedVersionedItems] = useState<Map<string, VersionedBatchItem>>(new Map());
  // Upload History: batches whose file list dropdown is open (collapsed by default).
  const [expandedUploadBatches, setExpandedUploadBatches] = useState<Set<string>>(new Set());
  const [isBulkResolveModalOpen, setIsBulkResolveModalOpen] = useState(false);

  // The mount fetch can land before AuthProvider has resolved the user, and the
  // ownership filter below needs an identity to match against — so refetch once
  // the user arrives, otherwise a real history would stay filtered out.
  useEffect(() => {
    if (!user?.id) return;
    fetchUploadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  /* `/resumes/upload/batches?mine=true` lists only this user's batches, on
     every device (the server filters by who uploaded them). It used to be
     tenant-wide, and ownership was guessed from a list of batch ids kept in
     this browser's localStorage — so uploads made in another browser or on
     another laptop never showed here. */
  const hasBatchFiles = (batch: any) =>
    (batch?.total_files ?? 0) > 0 || (batch?.items?.length ?? 0) > 0;

  const ownBatchRecords = (batches: any[]) => batches.filter(hasBatchFiles).map(mapBatchRecord);

  /* Single-file uploads go through `/resumes/upload`, which returns a resume
     and never tells us the batch it landed in. So we snapshot the batch ids
     before the upload and claim whatever is new afterwards. */
  const snapshotBatchIds = async (): Promise<string[]> => {
    try {
      const response = await resumeService.listUploadBatches(50);
      return (response?.batches ?? []).map((b: any) => String(b.id));
    } catch {
      return [];
    }
  };

  /* The batch row for a single upload isn't always written by the time the
     upload call returns, so one look is not enough — retry with a widening gap
     before giving up. */
  const adoptNewBatchIds = async (priorIds: string[], attempts = 4): Promise<string[]> => {
    const prior = new Set(priorIds);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await resumeService.listUploadBatches(50);
        const fresh = (response?.batches ?? [])
          .map((b: any) => String(b.id))
          .filter((id: string) => !prior.has(id));
        if (fresh.length > 0) return fresh;
      } catch {
        // Ignore and retry — a transient failure shouldn't lose the batch.
      }
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
    return [];
  };

  /* Fallback record for an upload the server never gave us a batch for (single
     uploads may not create one at all). Kept per user in localStorage so the
     upload still appears in history after a reload, and dropped as soon as a
     real batch turns up carrying the same resume. */
  const localUploadsKey = user?.id ? `tf:upload-local:${user.id}` : null;

  const readLocalUploads = useCallback((): any[] => {
    if (!localUploadsKey || typeof window === 'undefined') return [];
    try {
      const stored = JSON.parse(localStorage.getItem(localUploadsKey) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }, [localUploadsKey]);

  const rememberLocalUpload = useCallback((record: any) => {
    if (!localUploadsKey || typeof window === 'undefined') return;
    try {
      localStorage.setItem(localUploadsKey, JSON.stringify([record, ...readLocalUploads()].slice(0, 50)));
    } catch {
      // Private mode / quota — the record just won't survive a reload.
    }
  }, [localUploadsKey, readLocalUploads]);

  // Server records win: a local stand-in is hidden once a real batch reports
  // the same resume, so an upload is never listed twice.
  const withLocalUploads = (records: any[]) => {
    const claimed = new Set(
      records.flatMap(r => (r.statuses ?? []).map((s: any) => s.resumeId).filter(Boolean)),
    );
    const locals = readLocalUploads().filter(
      local => !(local.statuses ?? []).some((s: any) => s.resumeId && claimed.has(s.resumeId)),
    );
    return [...locals, ...records].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  };

  // Refresh from the server and replace only the my-resumes records.
  const refreshMyResumesBatches = async () => {
    const response = await resumeService.listUploadBatches(50);
    if (!response?.batches) return;
    const updated = withLocalUploads(ownBatchRecords(response.batches));
    setUploadHistory(prev => [...prev.filter(r => r.source !== 'my-resumes'), ...updated]);
  };

  const fetchUploadHistory = async () => {
    try {
      const response = await resumeService.listUploadBatches(50);
      if (response?.batches) {
        setUploadHistory(withLocalUploads(ownBatchRecords(response.batches)));
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
    // Still uploading? Its batches stay in My Activities (server activity feed).
    setUploadHistoryFilter(null);
    setUploadHistorySelected(new Map());
    setUploadHistoryPinned({ key: '', ids: new Set() });
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
      showErrorToast(err, "Couldn't retry the batch items");
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
      showErrorToast(err, "Couldn't cancel the batch");
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
      showErrorToast(err, "Couldn't retry the file");
    } finally {
      setRetryingItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  /* Retry / Cancel several files at once (Table view). The same per-file
     endpoints the row buttons call, five at a time, then one toast and one
     refresh instead of one per file. */
  const runUploadHistoryBulk = async () => {
    const { mode, items } = uploadHistoryBulk;
    setUploadHistoryBulk(b => ({ ...b, open: false }));
    if (!items.length) return;
    setUploadHistoryBulkBusy(mode);
    const ids = items.map(i => i.itemId);
    const mark = (set: React.Dispatch<React.SetStateAction<Set<string>>>, on: boolean) =>
      set(prev => { const next = new Set(prev); ids.forEach(id => (on ? next.add(id) : next.delete(id))); return next; });
    mark(mode === 'retry' ? setRetryingItems : setCancellingItems, true);
    let ok = 0;
    let failed = 0;
    let units = 0;
    const batches = new Set<string>();
    try {
      for (let i = 0; i < items.length; i += 5) {
        const chunk = items.slice(i, i + 5);
        const results = await Promise.allSettled(chunk.map(it =>
          mode === 'retry' ? resumeService.retryItem(it.batchId, it.itemId) : resumeService.cancelItem(it.batchId, it.itemId)
        ));
        results.forEach((r, j) => {
          if (r.status === 'fulfilled') {
            ok += 1;
            batches.add(chunk[j].batchId);
            units += Number(mode === 'retry' ? r.value?.units_deducted : r.value?.refunded_units) || 0;
          } else {
            failed += 1;
          }
        });
      }
      if (ok > 0) {
        toast.success(mode === 'retry'
          ? `Retrying ${ok} file${ok === 1 ? '' : 's'}. ${units > 0 ? `${units} Resume Storage unit${units === 1 ? '' : 's'} deducted.` : 'No additional units deducted.'}`
          : `Cancelled ${ok} file${ok === 1 ? '' : 's'}.${units > 0 ? ` ${units} unit${units === 1 ? '' : 's'} refunded.` : ''}`);
      }
      if (failed > 0) {
        toast.error(`${failed} file${failed === 1 ? '' : 's'} couldn't be ${mode === 'retry' ? 'retried' : 'cancelled'}. Try them again from their row.`);
      }
      await refreshMyResumesBatches();
      if (mode === 'retry') batches.forEach(b => startBatchPolling(b));
      setUploadHistorySelected(new Map());
    } finally {
      mark(mode === 'retry' ? setRetryingItems : setCancellingItems, false);
      setUploadHistoryBulkBusy(null);
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
      showErrorToast(err, "Couldn't cancel the file");
    } finally {
      setCancellingItems(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  };

  // Ref to store active polling intervals for cleanup
  const pollingIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  // Start (or restart) polling for a batch — used after retry so items progress in real-time
  const startBatchPolling = (batchId: string) => {
    // Host already gone (closed mid-upload): the activity feed keeps its dock row.
    if (!mountedRef.current) return;
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
          // Stay in whatever folder/search the user is looking at — an
          // unfiltered refresh here swapped the table and the header count for
          // the whole library mid-view.
          optsRef.current.onRefresh?.();
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

  const openUploadToFolder = (folderId?: string, scoped = false) => {
    setUploadTargetFolderId(folderId);
    setUploadScopeFolderId(scoped ? folderId : undefined);
    setIsUploadModalOpen(true);
  };

  // Helper function to find or create "root" folder
  const getOrCreateRootFolder = async (): Promise<string> => {
    // Check if "root" folder already exists
    const existingRoot = optsRef.current.folders.find(f => f.name.toLowerCase() === 'root' && !f.parentId);
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
      optsRef.current.onRootFolderCreated?.(converted);
      return newFolder.id;
    } catch (error: any) {
      console.error('Failed to create root folder:', error);
      throw error;
    }
  };

  // Return type mirrors UploadModalProps['onUpload'] (components/UploadModal.tsx). This
  // local annotation had drifted narrower than both what the body actually returns
  // (resumeId / candidateName) and what the modal declares (the richer existingResume).
  const handleUploadResumes = async (files: File[], folderId?: string): Promise<{
    success: boolean;
    error?: string;
    resumeId?: string;
    candidateName?: string;
    existingResume?: {
      id: string;
      candidateName: string;
      uploadedAt?: string;
      email?: string;
      currentTitle?: string;
      folderName?: string;
      version?: number;
    };
    duplicateData?: {
      file: File;
      existingResume: {
        id: string;
        candidate_name: string;
        email: string;
        folder_name?: string;
        folder_path?: string;
        upload_date: string;
        file_size: number;
        file_name: string;
        version: number;
        // sent by the my-resumes duplicate path alongside `version`
        version_count?: number;
      };
      contentDifferences: string[];
      isDuplicate: boolean;
      targetFolderId?: string;
    };
  }> => {
    setUploadStartedThisSession(true);

    // Which batches existed before this upload — anything new afterwards is
    // ours, which is the only way to claim a single-file upload's batch.
    const priorBatchIds = await snapshotBatchIds();

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
      /* Close the upload dialog NOW, not when the bulk request returns — it
         used to linger behind Upload History for the 3–5 s that took. A bulk
         upload reports everything in Upload History; a failure to even start
         it is toasted below, since the dialog is no longer there to show it. */
      setIsUploadModalOpen(false);
      setUploadTargetFolderId(undefined);

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
        optsRef.current.onResumeStored?.(r, 'upload');
        if (optsRef.current.successToast !== false) {
          toast.success(`Resume uploaded successfully${optsRef.current.successHint ? `. ${optsRef.current.successHint}` : ''}`);
        }

        /* Record it in history right away. The single-upload endpoint returns
           a resume, not a batch, and the server may not create a batch row for
           it at all — without this the upload would never appear in the
           history. If a real batch does turn up carrying this resume id, the
           merge in `withLocalUploads` hides this stand-in. */
        const localRecord = {
          id: `local-${r.id}`,
          date: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          fileName: files[0].name,
          totalFiles: 1,
          completed: 1,
          pending: 0,
          duplicated: 0,
          versioned: 0,
          errors: 0,
          cancelled: 0,
          status: 'completed',
          source: 'my-resumes' as const,
          statuses: [{
            id: `local-item-${r.id}`,
            fileName: files[0].name,
            status: 'completed',
            errorMessage: null,
            candidateName: r.candidate_name || null,
            resumeId: r.id,
          }],
        };
        rememberLocalUpload(localRecord);
        setUploadHistory(prev => [localRecord, ...prev]);

        // Background refresh to get correct uploaded_by_name, version counts, etc.
        setTimeout(async () => {
          // Queued behind any in-flight fetch rather than forced past it (see
          // the folder-delete refresh above).
          // Refresh the view the user is actually on, and update the pinned
          // All Resumes count separately — an unfiltered refresh here made the
          // folder view and its badge jump to the whole library for a moment.
          optsRef.current.onRefresh?.();
          // Claim the batch this upload created before reading history back,
          // otherwise the ownership filter would treat it as somebody else's.
          await adoptNewBatchIds(priorBatchIds);
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
        // Check for AI parsing service unavailable (503 Service Unavailable) -
        // e.g. RU_OPENAI_API_KEY not configured on the backend.
        else if (error?.response?.status === 503) {
          const detail = error?.response?.data?.detail;
          return {
            success: false,
            error: detail?.message || 'Resume upload is temporarily unavailable. Please try again later or contact your administrator.',
          };
        }
        else {
          // Fall back to whatever reason the backend gave, even for status
          // codes not explicitly handled above, instead of a generic message
          // that hides why the upload actually failed.
          const detail = error?.response?.data?.detail;
          const backendMessage = typeof detail === 'string' ? detail : detail?.message;
          return { success: false, error: backendMessage || `Failed to upload ${files[0].name}` };
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

            // Refresh upload history and resume list — keeping the user's
            // folder/search in place, with the global count refreshed on its own.
            fetchUploadHistory();
            optsRef.current.onRefresh?.();
            const stored = (status.items ?? [])
              .filter((item: any) => item.status === 'completed' && item.resume_id)
              .map((item: any) => ({ id: String(item.resume_id), candidateName: item.candidate_name || item.file_name || 'Resume' }));
            if (stored.length > 0) optsRef.current.onBatchFinished?.(stored);
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
      let message = 'Failed to start bulk upload';
      // Check for read-only mode (403 Forbidden)
      if (error?.response?.status === 403) {
        const detail = error?.response?.data?.detail;
        message = detail?.error === 'READ_ONLY_MODE'
          ? 'Uploads are disabled because your account is in read-only mode. Please contact your administrator.'
          : 'You do not have permission to upload resumes. Please contact your administrator.';
      } else if (error?.response?.status === 409) {
        // Duplicate error (409 Conflict)
        message = error?.response?.data?.detail?.message || 'All files are duplicates';
      }
      // The upload dialog closed when this started, so say it here, and drop
      // the optimistic "Uploading N files..." placeholder that will never fill.
      if (error?.response?.status === 403 || error?.response?.status === 409) {
        toast.error(message);
      } else {
        showErrorToast(error, "Couldn't start the upload");
      }
      setUploadHistory(prev => prev.filter(r => !(String(r.id).startsWith('temp-') && r.status === 'uploading')));
      return { success: false, error: message };
    }
  };

  /* Display path of the folder the refused upload was aimed at, for the
     "New Resume (Uploading)" card in the duplicate dialog. `pendingUploadFolderId`
     is the id the upload actually used, which `handleUploadResumes` has already
     resolved to the root folder when the user picked "All Resumes" or nothing —
     so an empty breadcrumb means root, not "unknown". The "My Resumes /" prefix
     matches the shape the backend returns in `folder_path` for the other card. */
  const pendingUploadFolderPath = useMemo(() => {
    if (pendingUploadFolderLabel) return `My Resumes / ${pendingUploadFolderLabel}`;
    const segments = folderSegments(pendingUploadFolderId);
    return ['My Resumes', ...(segments.length > 0 ? segments : ['root'])].join(' / ');
  }, [pendingUploadFolderLabel, pendingUploadFolderId, folderSegments]);

  // Handle duplicate resolution
  const handleResolveDuplicates = async (resolutions: { fileIndex: number; action: 'discard' | 'overwrite' | 'version' }[]) => {
    /* No "Processing duplicate resolution..." loading toast here — the
       DuplicateResumeModal's Confirm All/Continue button shows its own
       loading state while this runs, so a floating toast on top of it was
       redundant. Only the final outcome gets a toast. */
    // Same as a plain upload: whatever batch this creates has to be claimed,
    // or the ownership filter will read it as another account's.
    const priorBatchIds = await snapshotBatchIds();

    try {
      let discardedCount = 0;
      let overwrittenCount = 0;
      let versionedCount = 0;

      for (const resolution of resolutions) {
        const duplicateFile = duplicateFiles[resolution.fileIndex];
        if (!duplicateFile) continue;

        if (resolution.action === 'discard') {
          // Just skip this file
          discardedCount += 1;
        } else {
          // Use the resolve duplicate and upload endpoint
          const storedResume = await resumeService.resolveDuplicateAndUpload(
            duplicateFile.file,
            duplicateFile.existingResume.id,
            resolution.action,
            pendingUploadFolderId
          );
          optsRef.current.onResumeStored?.(storedResume, 'duplicate');

          if (resolution.action === 'overwrite') {
            overwrittenCount += 1;
          } else {
            versionedCount += 1;
          }
        }
      }

      const summaryParts = [
        discardedCount > 0 && `${discardedCount} discarded`,
        overwrittenCount > 0 && `${overwrittenCount} overwritten`,
        versionedCount > 0 && `${versionedCount} saved as new version${versionedCount > 1 ? 's' : ''}`,
      ].filter(Boolean);
      if (summaryParts.length > 0) {
        const stored = overwrittenCount + versionedCount > 0 && optsRef.current.successHint;
        toast.success(`Duplicate resolution complete: ${summaryParts.join(', ')}${stored ? `. ${stored}` : ''}`);
      }

      // Refresh full list from server to get correct data
      setTimeout(async () => {
        optsRef.current.onRefresh?.();
        await adoptNewBatchIds(priorBatchIds);
        fetchUploadHistory();
      }, 500);
    } catch (error: any) {
      console.error('Error resolving duplicates:', error);
      showErrorToast(error, "Couldn't resolve the duplicate");
    } finally {
      setDuplicateFiles([]);
      setPendingUploadFolderId(undefined);
      setPendingUploadFolderLabel(undefined);
      setIsDuplicateModalOpen(false);
    }
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadTargetFolderId(undefined);
    setUploadScopeFolderId(undefined);
  };

  const uploadFlowElements: ReactNode = (
    <>
      {isUploadModalOpen && (
        <UploadModal
          folders={opts.folders.filter(f => f.id !== 'all' && !(f.name === 'Archived Resumes' && !f.parentId))}
          tenant={opts.tenant ?? null}
          targetFolder={uploadTargetFolderId || opts.defaultTargetFolder}
          scopeFolderId={uploadScopeFolderId}
          onClose={closeUploadModal}
          onUpload={handleUploadResumes}
          onCreateFolder={opts.onCreateFolder}
          onViewResume={opts.onViewResume ? (resumeId) => {
            setIsUploadModalOpen(false);
            optsRef.current.onViewResume?.(resumeId);
          } : undefined}
          onDuplicateDetected={(duplicateData) => {
            // Set duplicate files for the DuplicateResumeModal
            setDuplicateFiles([{
              file: duplicateData.file,
              existingResume: duplicateData.existingResume,
              contentDifferences: duplicateData.contentDifferences || [],
              isDuplicate: duplicateData.isDuplicate,
            }]);
            setPendingUploadFolderId(duplicateData.targetFolderId);
            setPendingUploadFolderLabel(duplicateData.targetFolderPath);
            setIsUploadModalOpen(false);
            setIsDuplicateModalOpen(true);
          }}
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
            setPendingUploadFolderLabel(undefined);
          }}
          onResolve={handleResolveDuplicates}
          targetFolderPath={pendingUploadFolderPath}
        />
      )}

      {/* Upload History Sheet (Slide-in Panel) */}
      {/* Minimized Upload History: its batches are rows in My Activities (see setUploadHistoryOpener above). */}

      {isUploadHistoryModalOpen && !isUploadHistoryMinimized && (
        /* The same frame as the AI Assessment / AI Interview invitation
           progress popup (BulkInviteResultsDialog): icon + title top-left,
           "− Minimize" top-right, Close in the footer bottom-right.
           z-50 (not AppModal's z-[60]) so the cancel confirmations, also
           z-50 and rendered after it, still open on top. */
        <AppModal
          open
          onCancel={handleCloseUploadHistory}
          cancelLabel="Close"
          size="xl"
          widthClassName="sm:max-w-4xl"
          tone="plain"
          density="compact"
          zIndexClass="z-50"
          icon={<Upload className="w-4 h-4 text-brand-blue" />}
          title="Upload History"
          subtitle="See what happened to every resume you uploaded — and what needs your attention"
          headerExtra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsUploadHistoryMinimized(true);
                setIsUploadHistoryModalOpen(false);
              }}
              className="h-8 px-2 text-xs sm:px-2.5"
              aria-label="Minimize"
              title="Minimize — uploads carry on; find them in My Activities"
            >
              <Minus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Minimize</span>
            </Button>
          }
          bodyClassName="bg-gray-50/70"
          footer={
            <>
              {/* Resolve selected new versions */}
              {selectedVersionedItems.size > 0 && (
                <div className="shrink-0 border-t border-brand-blue-2/20 bg-brand-blue-2/[0.05] px-4 py-2 sm:px-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 bg-brand-blue-2/10 text-brand-blue-2 rounded-lg flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-tight text-gray-900 dark:text-slate-100">
                        {selectedVersionedItems.size} new version{selectedVersionedItems.size !== 1 ? 's' : ''} selected
                      </p>
                      <p className="tf-meta leading-tight">Choose what to keep for these candidates</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedVersionedItems(new Map())}
                      className="h-8 text-xs"
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setIsBulkResolveModalOpen(true)}
                      icon={<GitBranch className="w-3.5 h-3.5" />}
                      className="h-8 flex-1 text-xs sm:flex-none"
                    >
                      Resolve ({selectedVersionedItems.size})
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-white px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-900 sm:px-5">
                <span className="hidden sm:inline tf-meta">Uploads keep running if you close this window.</span>
                <AppModalFooterButtons onCancel={handleCloseUploadHistory} cancelLabel="Close" tone="plain" compactFooter />
              </div>
            </>
          }
        >
                {(() => {
                  const myResumesHistory = uploadHistory.filter(r => r.source === 'my-resumes');
                  const isActive = (r: any) => r.status === 'processing' || r.pending > 0;
                  const activeRecords = myResumesHistory.filter(isActive);
                  const completedRecords = myResumesHistory.filter(r => !isActive(r));

                  // Stats are scoped to the records in the active tab — when a
                  // batch finishes its numbers move from Currently Processing
                  // into Completed automatically.
                  /* The Table view lists the files of every upload (the pills filter
                     them); the In progress / Completed tabs only split the
                     upload-by-upload cards. So an action that moves an upload
                     between tabs never takes its rows out of the table. */
                  const isTableView = uploadHistoryView === 'table';
                  const displayRecords = isTableView
                    ? myResumesHistory
                    : uploadHistoryTab === 'current' ? activeRecords : completedRecords;
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

                  /* A tab holding no batches at all gets one illustrated empty
                     state and nothing else. */
                  const showFullEmptyState = displayRecords.length === 0;

                  /* ── Display-only values (no behaviour) ── */
                  const isCurrentTab = uploadHistoryTab === 'current';
                  /* Is anything in view still running? Table view: any upload; cards: the tab. */
                  const isRunningScope = isTableView ? activeRecords.length > 0 : isCurrentTab;
                  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
                  const processedTotal = completedCount + failedCount + duplicatedCount + versionedCount + cancelledTotal;
                  const overallPct = totalFiles > 0 ? Math.min(100, Math.round((processedTotal / totalFiles) * 100)) : 0;
                  /* Duplicates need nothing from the user; new versions and failures do. */
                  const needsLook = versionedCount > 0 || failedCount > 0;

                  // Overall time left — the same estimate the old banner showed,
                  // only for batches that still have genuinely active items.
                  const overallEta = (() => {
                    if (!isRunningScope) return null;
                    const activeBatches = myResumesHistory.filter(r =>
                      r.pending > 0 && r.date &&
                      r.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing')
                    );
                    if (activeBatches.length === 0) return null;
                    const totalPending = activeBatches.reduce((sum: number, r: any) => sum + r.pending, 0);
                    const totalProcessed = activeBatches.reduce((sum: number, r: any) => sum + r.completed + r.errors + r.duplicated + (r.versioned || 0), 0);
                    if (totalProcessed <= 0) return { text: 'Estimating time left…', left: totalPending, batches: activeBatches.length };
                    // Cap elapsed at 10 minutes so a batch that started hours ago with a
                    // stuck file doesn't produce an absurd ETA (e.g. "233–433 mins remaining").
                    const earliestStart = Math.min(...activeBatches.map((r: any) => new Date(r.date).getTime()));
                    const elapsed = Math.min(Date.now() - earliestStart, 10 * 60 * 1000);
                    const avgTimePerFile = elapsed / totalProcessed;
                    const remainingMs = totalPending * avgTimePerFile;
                    const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                    const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                    const text = lowMins === highMins
                      ? `about ${lowMins} min${lowMins !== 1 ? 's' : ''} left`
                      : `about ${lowMins}–${highMins} mins left`;
                    return { text, left: totalPending, batches: activeBatches.length };
                  })();

                  const heading = isRunningScope
                    ? (isTableView
                      ? `${plural(activeRecords.length, 'upload')} in progress…`
                      : totalFiles > 0 ? `Uploading ${plural(totalFiles, 'resume')}…` : 'Starting your upload…')
                    : needsLook ? 'Finished — some files need a look' : 'All uploads finished';
                  const subline = isTableView
                    ? `${plural(myResumesHistory.length, 'upload')} · ${plural(totalFiles, 'file')} · ${completedCount.toLocaleString('en-IN')} added to your resume database.`
                    : isCurrentTab
                      ? `Each resume is read and added to your resume database. ${plural(activeRecords.length, 'upload')} in progress.`
                      : `${plural(completedRecords.length, 'upload')} · ${plural(totalFiles, 'file')} · ${completedCount.toLocaleString('en-IN')} added to your resume database.`;

                  /* One coloured segment per outcome, inside one rounded bar — the
                     AI Assessment / AI Interview send progress bar's colours: done
                     green, left out on purpose gray, cancelled amber, failed red,
                     and the files being read right now a pulsing blue. */
                  const barSegments = (r: { completed: number; versioned: number; duplicated: number; errors: number; cancelled: number; processing: number; total: number }) => [
                    { key: 'completed', n: r.completed, bar: 'bg-success' },
                    { key: 'versioned', n: r.versioned, bar: 'bg-success/60' },
                    { key: 'duplicated', n: r.duplicated, bar: 'bg-brand-orange' },
                    { key: 'cancelled', n: r.cancelled, bar: 'bg-warning-strong' },
                    { key: 'error', n: r.errors, bar: 'bg-destructive' },
                    { key: 'processing', n: r.processing, bar: 'bg-brand-blue animate-pulse' },
                  ].filter(s => s.n > 0).map(s => ({ ...s, width: r.total > 0 ? Math.min(100, (s.n / r.total) * 100) : 0 }));
                  /* Files being read right now (not just waiting). */
                  const processingOf = (recs: typeof displayRecords) => recs.reduce((sum, r) =>
                    sum + (r.statuses?.filter((x: { status: string }) => x.status === 'processing').length || 0), 0);

                  /* Plain-word names + what each status means, for the pills,
                     the batch chips and the file rows. */
                  type FilterKey = NonNullable<typeof uploadHistoryFilter>;
                  const STATUS_INFO: Record<FilterKey, { label: string; hint: string; tone: string; chip: string; icon: typeof CheckCircle }> = {
                    completed: { label: 'Done', hint: 'Read successfully and saved to your resume database.', tone: 'text-success', chip: 'bg-success-subtle text-success', icon: CheckCircle },
                    versioned: { label: 'New version', hint: 'Looks like an updated resume of a candidate you already have. Review it to decide what to keep.', tone: 'text-brand-blue-2', chip: 'bg-brand-blue-2/10 text-brand-blue-2', icon: GitBranch },
                    duplicated: { label: 'Duplicate', hint: 'This resume is already in your database, so it was not added again. Nothing to do.', tone: 'text-brand-orange-deep', chip: 'bg-brand-orange/10 text-brand-orange-deep', icon: Copy },
                    error: { label: 'Failed', hint: 'Could not be read. Open the file to see why, then Retry.', tone: 'text-destructive', chip: 'bg-destructive-subtle text-destructive', icon: AlertCircle },
                    pending: { label: 'Queue', hint: 'Waiting its turn, or being read right now.', tone: 'text-gray-600 dark:text-slate-300', chip: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300', icon: Clock },
                    cancelled: { label: 'Cancelled', hint: 'Stopped before it was read — its unit was refunded. Retry puts it back in the queue.', tone: 'text-warning-strong', chip: 'bg-warning-subtle text-warning-strong', icon: Ban },
                  };
                  /* How many files ended in each outcome ("Done 1", "Duplicate 13"). */
                  const renderBreakdown = (outcomes: [FilterKey, number][], total: number, className = '') => {
                    const shown = outcomes.filter(([, n]) => n > 0);
                    if (!shown.length) return null;
                    return (
                      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
                        {shown.map(([key, n]) => {
                          const info = STATUS_INFO[key];
                          const Icon = info.icon;
                          return (
                            <span
                              key={key}
                              title={`${info.label}: ${plural(n, 'file')} of ${total.toLocaleString('en-IN')} — ${info.hint}`}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.chip}`}
                            >
                              <Icon className="w-3 h-3" />
                              {info.label}
                              <span className="font-semibold tabular-nums">{n.toLocaleString('en-IN')}</span>
                            </span>
                          );
                        })}
                      </div>
                    );
                  };
                  const pills: { key: FilterKey | null; n: number }[] = [
                    { key: null, n: totalFiles },
                    { key: 'completed', n: completedCount },
                    { key: 'versioned', n: versionedCount },
                    { key: 'duplicated', n: duplicatedCount },
                    { key: 'error', n: failedCount },
                    { key: 'pending', n: pendingCount },
                    { key: 'cancelled', n: cancelledTotal },
                  ];

                  /* ── One file table, used by the Table view and by each upload's
                     "Show files". Row click, version picking and Retry / Cancel
                     call the same handlers the file list always used. ── */
                  type UploadFile = { id: string; status: string; fileName: string; errorMessage?: string; candidateName?: string; resumeId?: string };
                  type UploadRecord = (typeof displayRecords)[number];
                  const isVersionedFile = (f: UploadFile) => f.status === 'versioned' || f.status === 'version';
                  const toVersionItem = (f: UploadFile) => ({ id: f.id, fileName: f.fileName, candidateName: f.candidateName || '', resumeId: f.resumeId });
                  /* One file's status, in the same words and colours as the pills. */
                  const fileStatus = (file: UploadFile) => {
                    const s = file.status;
                    if (s === 'completed') return { label: 'Done', cls: 'bg-success-subtle text-success', reason: file.candidateName ? `${file.candidateName} · added to your database` : 'Added to your database' };
                    if (s === 'versioned' || s === 'version') return { label: 'New version', cls: 'bg-brand-blue-2/10 text-brand-blue-2', reason: file.candidateName ? `Newer resume of ${file.candidateName} · click to review` : 'Newer resume of an existing candidate · click to review' };
                    if (s === 'duplicate' || s === 'duplicated') return { label: 'Duplicate', cls: 'bg-brand-orange/10 text-brand-orange-deep', reason: file.errorMessage || 'Already in your database · not added again' };
                    if (s === 'error') return { label: 'Failed', cls: 'bg-destructive-subtle text-destructive', reason: file.errorMessage || 'Could not be read' };
                    if (s === 'processing') return { label: 'Reading', cls: 'bg-brand-blue/10 text-brand-blue', reason: 'Reading the resume…' };
                    if (s === 'pending') return { label: 'Queue', cls: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300', reason: 'Waiting its turn…' };
                    if (s === 'cancelled' || s === 'discarded') return { label: s === 'cancelled' ? 'Cancelled' : 'Discarded', cls: 'bg-warning-subtle text-warning-strong', reason: file.errorMessage || 'Cancelled before it was read' };
                    return { label: String(s ?? 'unknown'), cls: 'bg-amber-100 text-amber-800', reason: `Unrecognised status: ${String(s)}` };
                  };
                  const renderFileTable = (
                    allRows: { file: UploadFile; record: UploadRecord }[],
                    opts: {
                      tableKey: string;
                      showUpload: boolean;
                      emptyText: ReactNode;
                      /** Called before a row's own Retry / Cancel (to keep the row in view). */
                      onAct?: (fileId: string) => void;
                      /** Tick boxes on retry-able / cancel-able rows + the bulk bar. */
                      selectable?: boolean;
                      /** Rows acted on in this view — they carry an "Updated" tag. */
                      pinnedIds?: Set<string>;
                      onBulk?: (mode: 'retry' | 'cancel', items: UploadHistoryBulkItem[]) => void;
                    },
                  ) => {
                    /* Search + pagination (5 rows a page by default). */
                    const ui = uploadHistoryTableUi[opts.tableKey] ?? { page: 1, perPage: 5, q: '' };
                    const setUi = (patch: Partial<typeof ui>) => setUploadHistoryTableUi(prev => ({
                      ...prev,
                      [opts.tableKey]: { ...(prev[opts.tableKey] ?? { page: 1, perPage: 5, q: '' }), ...patch },
                    }));
                    const q = ui.q.trim().toLowerCase();
                    const searchedRows = q
                      ? allRows.filter(({ file, record }) =>
                          [file.fileName, file.candidateName, fileStatus(file).label, opts.showUpload ? record.fileName : '']
                            .some(v => !!v && String(v).toLowerCase().includes(q)))
                      : allRows;
                    const pageCount = Math.max(1, Math.ceil(searchedRows.length / ui.perPage));
                    const page = Math.min(ui.page, pageCount);
                    const firstIndex = (page - 1) * ui.perPage;
                    const shownRows = searchedRows.slice(firstIndex, firstIndex + ui.perPage);
                    const versionedShown = shownRows.filter(r => isVersionedFile(r.file));
                    /* Retry works on waiting, failed and cancelled files; Cancel on waiting ones.
                       Never on the optimistic temp-/local- records (their ids are not UUIDs). */
                    type Row = { file: UploadFile; record: UploadRecord };
                    const canActOn = ({ file, record }: Row) => !!file.id
                      && !record.id.startsWith('temp-') && !record.id.startsWith('local-') && !String(file.id).startsWith('temp-')
                      && (file.status === 'pending' || file.status === 'error' || file.status === 'cancelled');
                    const toBulkItem = ({ file, record }: Row): UploadHistoryBulkItem => ({ batchId: record.id, itemId: file.id, fileName: file.fileName, status: file.status });
                    const actionableShown = opts.selectable ? shownRows.filter(canActOn) : [];
                    const pickedRows = opts.selectable ? searchedRows.filter(r => uploadHistorySelected.has(r.file.id) && canActOn(r)) : [];
                    const cancelPicked = pickedRows.filter(r => r.file.status === 'pending');
                    const withCheckbox = versionedShown.length > 0 || actionableShown.length > 0;
                    const allVersionedPicked = withCheckbox
                      && versionedShown.every(r => selectedVersionedItems.has(r.file.id))
                      && actionableShown.every(r => uploadHistorySelected.has(r.file.id));
                    /* One-click shortcut for the picked pill: every matching row, all pages. */
                    const shortcut = (() => {
                      if (!opts.selectable || pickedRows.length > 0) return null;
                      if (uploadHistoryFilter === 'error') {
                        const rows = searchedRows.filter(r => r.file.status === 'error' && canActOn(r));
                        return rows.length ? { mode: 'retry' as const, label: `Retry all failed (${rows.length})`, rows } : null;
                      }
                      if (uploadHistoryFilter === 'cancelled') {
                        const rows = searchedRows.filter(r => r.file.status === 'cancelled' && canActOn(r));
                        return rows.length ? { mode: 'retry' as const, label: `Re-queue all cancelled (${rows.length})`, rows } : null;
                      }
                      if (uploadHistoryFilter === 'pending') {
                        const rows = searchedRows.filter(r => r.file.status === 'pending' && canActOn(r));
                        return rows.length ? { mode: 'cancel' as const, label: `Cancel all waiting (${rows.length})`, rows } : null;
                      }
                      return null;
                    })();
                    const bulkBusy = !!uploadHistoryBulkBusy;
                    // ☐ · S.No · File · Status (+ reason) · [Upload] · Actions
                    const GRID = withCheckbox
                      ? (opts.showUpload
                        ? 'sm:grid-cols-[1.25rem_2.25rem_minmax(12rem,2fr)_minmax(10rem,1.5fr)_minmax(9rem,1fr)_5rem]'
                        : 'sm:grid-cols-[1.25rem_2.25rem_minmax(12rem,2fr)_minmax(10rem,1.5fr)_5rem]')
                      : (opts.showUpload
                        ? 'sm:grid-cols-[2.25rem_minmax(12rem,2fr)_minmax(10rem,1.5fr)_minmax(9rem,1fr)_5rem]'
                        : 'sm:grid-cols-[2.25rem_minmax(12rem,2fr)_minmax(10rem,1.5fr)_5rem]');
                    return (
                      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
                        {/* Search */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-slate-700/60">
                          <div className="relative min-w-0 flex-1 sm:max-w-sm">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                            <input
                              type="search"
                              value={ui.q}
                              onChange={(e) => setUi({ q: e.target.value, page: 1 })}
                              placeholder={opts.showUpload ? 'Search file, candidate, status or upload…' : 'Search file, candidate or status…'}
                              aria-label="Search files"
                              className="h-7 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-[13px] text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:border-brand-blue/40 focus-visible:ring-2 focus-visible:ring-brand-blue/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <span className="tf-meta ml-auto">
                            {q ? `${searchedRows.length.toLocaleString('en-IN')} of ` : ''}{plural(allRows.length, 'file')}
                          </span>
                          {pickedRows.length > 0 && (
                            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                              <span className="tf-meta whitespace-nowrap">
                                <b className="font-semibold text-gray-900 tabular-nums dark:text-slate-100">{pickedRows.length}</b> selected
                              </span>
                              <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setUploadHistorySelected(new Map())} disabled={bulkBusy}>
                                Clear
                              </Button>
                              {cancelPicked.length > 0 && (
                                <Button
                                  type="button" variant="secondary" size="sm" className="h-7 text-xs text-destructive"
                                  disabled={bulkBusy}
                                  onClick={() => opts.onBulk?.('cancel', cancelPicked.map(toBulkItem))}
                                  icon={uploadHistoryBulkBusy === 'cancel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                  title="Stop the ticked files that are still waiting"
                                >
                                  Cancel ({cancelPicked.length})
                                </Button>
                              )}
                              <Button
                                type="button" variant="primary" size="sm" className="h-7 text-xs"
                                disabled={bulkBusy}
                                onClick={() => opts.onBulk?.('retry', pickedRows.map(toBulkItem))}
                                icon={uploadHistoryBulkBusy === 'retry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              >
                                Retry ({pickedRows.length})
                              </Button>
                            </div>
                          )}
                          {shortcut && (
                            <Button
                              type="button"
                              variant={shortcut.mode === 'cancel' ? 'secondary' : 'primary'}
                              size="sm"
                              className={`h-7 text-xs ${shortcut.mode === 'cancel' ? 'text-destructive' : ''}`}
                              disabled={bulkBusy}
                              onClick={() => opts.onBulk?.(shortcut.mode, shortcut.rows.map(toBulkItem))}
                              icon={uploadHistoryBulkBusy
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : shortcut.mode === 'cancel' ? <X className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            >
                              {shortcut.label}
                            </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <ul className={`divide-y divide-gray-100 dark:divide-slate-700/60 ${opts.showUpload ? 'sm:min-w-[44rem]' : 'sm:min-w-[34rem]'}`}>
                            {shownRows.length > 0 && (
                              <li className={`hidden sm:grid ${GRID} gap-3 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 sticky top-0 z-[1]`}>
                                {withCheckbox && (
                                  <span className="flex items-center">
                                    <input
                                      type="checkbox"
                                      className="tf-checkbox"
                                      aria-label={allVersionedPicked ? 'Deselect all on this page' : 'Select all on this page'}
                                      checked={allVersionedPicked}
                                      onChange={() => {
                                        if (versionedShown.length) {
                                          const next = new Map(selectedVersionedItems);
                                          if (allVersionedPicked) versionedShown.forEach(r => next.delete(r.file.id));
                                          else versionedShown.forEach(r => next.set(r.file.id, toVersionItem(r.file)));
                                          setSelectedVersionedItems(next);
                                        }
                                        if (actionableShown.length) {
                                          const next = new Map(uploadHistorySelected);
                                          if (allVersionedPicked) actionableShown.forEach(r => next.delete(r.file.id));
                                          else actionableShown.forEach(r => next.set(r.file.id, toBulkItem(r)));
                                          setUploadHistorySelected(next);
                                        }
                                      }}
                                    />
                                  </span>
                                )}
                                <span>S.No</span>
                                <span>File</span>
                                <span>Status</span>
                                {opts.showUpload && <span>Upload</span>}
                                <span className="text-right">Actions</span>
                              </li>
                            )}
                            {shownRows.length === 0 && (q || opts.emptyText) && (
                              <li className="px-3 py-8 text-center tf-body-muted">
                                {q ? <>No files match &ldquo;{ui.q.trim()}&rdquo;.</> : opts.emptyText}
                              </li>
                            )}
                            {shownRows.map(({ file, record }, i) => {
                              const st = fileStatus(file);
                              const isVersioned = isVersionedFile(file);
                              const isClickable = ['completed', 'versioned', 'duplicate', 'error'].includes(file.status);
                              const isSelected = selectedVersionedItems.has(file.id);
                              const recordIsTemp = record.id.startsWith('temp-') || record.id.startsWith('local-');
                              const canAct = file.id && !recordIsTemp && !String(file.id).startsWith('temp-')
                                && (file.status === 'pending' || file.status === 'error' || file.status === 'cancelled');
                              return (
                                <li {...clickableProps}
                                  key={`${record.id}:${file.id || i}`}
                                  onClick={() => {
                                    if (isVersioned) {
                                      // Open resolution modal for this single versioned file
                                      setSelectedVersionedItems(new Map([[file.id, toVersionItem(file)]]));
                                      setIsBulkResolveModalOpen(true);
                                    } else if (isClickable) {
                                      setSelectedHistoryItem({
                                        id: file.id,
                                        fileName: file.fileName,
                                        status: file.status as UploadHistoryItem['status'],
                                        errorMessage: file.errorMessage,
                                        candidateName: file.candidateName,
                                        resumeId: file.resumeId,
                                      });
                                    }
                                  }}
                                  className={`grid grid-cols-1 ${GRID} gap-x-3 gap-y-1 px-3 py-2 sm:items-center transition-colors ${
                                    isVersioned && isSelected ? 'bg-brand-blue-2/[0.06]'
                                      : opts.selectable && uploadHistorySelected.has(file.id) ? 'bg-brand-blue/[0.04]' : ''
                                  } ${isClickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60' : ''}`}
                                >
                                  {withCheckbox && (
                                    <span className="hidden sm:flex items-center">
                                      {isVersioned && (
                                        <input
                                          type="checkbox"
                                          className="tf-checkbox focus:ring-brand-blue-2/40"
                                          aria-label={`Select ${file.fileName}`}
                                          checked={isSelected}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={() => {
                                            const next = new Map(selectedVersionedItems);
                                            if (isSelected) next.delete(file.id);
                                            else next.set(file.id, toVersionItem(file));
                                            setSelectedVersionedItems(next);
                                          }}
                                        />
                                      )}
                                      {!isVersioned && opts.selectable && canAct && (
                                        <input
                                          type="checkbox"
                                          className="tf-checkbox"
                                          aria-label={`Select ${file.fileName}`}
                                          checked={uploadHistorySelected.has(file.id)}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={() => {
                                            const next = new Map(uploadHistorySelected);
                                            if (next.has(file.id)) next.delete(file.id);
                                            else next.set(file.id, toBulkItem({ file, record }));
                                            setUploadHistorySelected(next);
                                          }}
                                        />
                                      )}
                                    </span>
                                  )}
                                  <span className="hidden sm:block text-sm tabular-nums text-gray-500 dark:text-slate-400">{firstIndex + i + 1}</span>
                                  <div className="min-w-0">
                                    <div className="tf-row-name truncate" title={file.fileName}>{file.fileName}</div>
                                    {file.candidateName && <div className="tf-meta truncate">{file.candidateName}</div>}
                                  </div>
                                  <div className="min-w-0">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${st.cls}`}>{st.label}</span>
                                    {opts.pinnedIds?.has(file.id) && (
                                      <span className="ml-1.5 inline-flex items-center rounded-full bg-brand-blue/10 px-1.5 py-0.5 text-2xs font-medium text-brand-blue" title="You retried or cancelled this file — its status is live">
                                        Updated
                                      </span>
                                    )}
                                    <div className="tf-meta mt-0.5 truncate" title={st.reason}>{st.reason}</div>
                                  </div>
                                  {opts.showUpload && (
                                    <div className="min-w-0 tf-meta">
                                      <div className="truncate text-gray-700 dark:text-slate-200" title={record.fileName}>{record.fileName}</div>
                                      {record.date && <div className="truncate">{formatDateTimeIST(record.date)}</div>}
                                    </div>
                                  )}
                                  <div className="flex items-center justify-start sm:justify-end gap-1" onClick={e => e.stopPropagation()}>
                                    {canAct && (
                                      <IconButton bare label="Retry this file" tooltip={file.status === 'cancelled' ? 'Re-queue this cancelled file' : 'Retry this file'}
                                        type="button"
                                        disabled={retryingItems.has(file.id)}
                                        onClick={(e) => { opts.onAct?.(file.id); handleRetryItem(record.id, file.id, e); }}
                                        className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors ${retryingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-brand-blue hover:bg-brand-blue/10'}`}
                                      >
                                        <RefreshCw className={`w-3.5 h-3.5 ${retryingItems.has(file.id) ? 'animate-spin' : ''}`} />
                                      </IconButton>
                                    )}
                                    {canAct && file.status === 'pending' && (
                                      <IconButton bare label="Cancel this file (waiting only)"
                                        type="button"
                                        disabled={cancellingItems.has(file.id)}
                                        onClick={(e) => { opts.onAct?.(file.id); handleCancelItem(record.id, file.id, file.fileName, e); }}
                                        className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors ${cancellingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-destructive hover:bg-destructive-subtle'}`}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </IconButton>
                                    )}
                                    {isClickable && (
                                      <ChevronRight className="hidden sm:block w-4 h-4 text-gray-400" aria-hidden="true" />
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <ListPagination
                          attached
                          compact
                          minimalOnMobile
                          currentPage={page}
                          itemsPerPage={ui.perPage}
                          totalItems={searchedRows.length}
                          onPageChange={(p) => setUi({ page: p })}
                          onItemsPerPageChange={(n) => setUi({ perPage: n, page: 1 })}
                          pageSizeOptions={[5, 10, 20]}
                          itemLabel="files"
                          scrollContainerRef={uploadHistoryPagerScrollRef}
                        />
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {/* Pagination scroll target: a page change in these short tables keeps the
                          popup where it is (without one, ListPagination scrolls the page behind). */}
                      <span ref={uploadHistoryPagerScrollRef} className="hidden" aria-hidden="true" />
                      {/* Tabs — By upload only; the Table view lists every upload */}
                      {!isTableView && (
                      <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label="Uploads">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={isCurrentTab}
                          onClick={() => setUploadHistoryTab('current')}
                          className={`flex h-7 items-center gap-1.5 px-2.5 sm:px-3 rounded-md text-xs font-medium transition-colors ${
                            isCurrentTab
                              ? 'bg-brand-blue text-white shadow-sm'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${activeRecords.length > 0 && !isCurrentTab ? 'text-brand-blue animate-spin' : ''}`} />
                          In progress
                          {activeRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full text-[10px] font-semibold tabular-nums ${
                              isCurrentTab ? 'bg-white text-brand-blue' : 'bg-brand-blue/10 text-brand-blue'
                            }`}>
                              {activeRecords.length}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={!isCurrentTab}
                          onClick={() => setUploadHistoryTab('completed')}
                          className={`flex h-7 items-center gap-1.5 px-2.5 sm:px-3 rounded-md text-xs font-medium transition-colors ${
                            !isCurrentTab
                              ? 'bg-brand-blue text-white shadow-sm'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Completed
                          {completedRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1rem] h-4 px-1 rounded-full text-[10px] font-semibold tabular-nums ${
                              !isCurrentTab ? 'bg-white text-brand-blue' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {completedRecords.length}
                            </span>
                          )}
                        </button>
                      </div>
                      )}

                      {showFullEmptyState ? (
                        <>
                          <UploadHistoryEmptyState
                            title={
                              isCurrentTab && !isTableView
                                ? 'No uploads in progress'
                                : myResumesHistory.length === 0 ? 'No upload history yet' : 'Nothing here yet'
                            }
                            lines={
                              isCurrentTab && !isTableView
                                ? ['All your uploads are processed.', 'Start a new bulk upload to see live progress here.']
                                : myResumesHistory.length === 0
                                  ? ['Bulk upload reports will appear here.', 'Upload multiple resumes to see detailed status reports.']
                                  : ['Your uploads are still running.', 'Their reports will appear here once they finish.']
                            }
                            /* Straight from history into the upload dialog — the
                               modal has to close first or the two would stack. */
                            onAction={() => {
                              handleCloseUploadHistory();
                              openUploadToFolder(undefined);
                            }}
                            actionDisabledReason={!(opts.canUpload ?? true) ? 'You do not have permission to upload resumes' : undefined}
                          />

                          {/* The Upload Resume popup's own Tip — the brand's amber,
                              so it reads as guidance rather than a warning. */}
                          <div className="flex items-start gap-2.5 rounded-xl bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2.5">
                            <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                            <p className="tf-body">
                              <span className="font-semibold">Tip:</span> You can upload a single resume or bulk upload multiple resumes at once.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Status card — the bulk invite / scoring popup's: what is
                              happening in one line, then one bar for every outcome. */}
                          <div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-start gap-3">
                              <span className={`h-8 w-8 shrink-0 rounded-lg inline-flex items-center justify-center ${
                                isRunningScope ? 'bg-brand-blue/10 text-brand-blue'
                                  : needsLook ? 'bg-warning-subtle text-warning-strong'
                                  : 'bg-success-subtle text-success'
                              }`}>
                                {isRunningScope ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : needsLook ? <AlertCircle className="w-4 h-4" />
                                  : <CheckCircle className="w-4 h-4" />}
                              </span>
                              <div className="min-w-0 flex-1" aria-live="polite">
                                <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-slate-100">{heading}</p>
                                <p className="tf-meta mt-0.5">{subline}</p>
                              </div>
                            </div>

                            {totalFiles > 0 && (
                              <div className="mt-3">
                                <div className="mb-1.5 flex items-end justify-between gap-3">
                                  <span className="tf-meta">
                                    {processedTotal.toLocaleString('en-IN')} of {plural(totalFiles, 'file')} processed
                                    {overallEta ? ` · ${overallEta.text}` : ''}
                                  </span>
                                </div>
                                <div
                                  className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
                                  role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallPct}
                                  aria-label={`${processedTotal} of ${totalFiles} files processed`}
                                >
                                  {barSegments({ completed: completedCount, versioned: versionedCount, duplicated: duplicatedCount, errors: failedCount, cancelled: cancelledTotal, processing: isRunningScope ? processingOf(displayRecords) : 0, total: totalFiles }).map(seg => (
                                    <div key={seg.key} className={`${seg.bar} h-full transition-[width] duration-500`} style={{ width: `${seg.width}%` }} />
                                  ))}
                                </div>
                                {renderBreakdown([
                                  ['completed', completedCount],
                                  ['versioned', versionedCount],
                                  ['duplicated', duplicatedCount],
                                  ['error', failedCount],
                                  ['pending', pendingCount],
                                  ['cancelled', cancelledTotal],
                                ], totalFiles, 'mt-2.5')}
                                {overallEta && overallEta.batches > 1 && (
                                  <p className="tf-meta mt-1.5">{plural(overallEta.left, 'resume')} left across {overallEta.batches} uploads</p>
                                )}
                              </div>
                            )}

                          </div>

                          {/* Status pills — click one to see only those files. Hover
                              (or focus) a pill to read what it means. */}
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter files by status">
                              {pills.map(({ key, n }) => {
                                const info = key ? STATUS_INFO[key] : null;
                                const Icon = info?.icon ?? Layers;
                                const selected = uploadHistoryFilter === key;
                                const muted = key !== null && n === 0 && !selected;
                                return (
                                  <button
                                    key={key ?? 'all'}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => {
                                      setUploadHistoryFilter(key === null || selected ? null : key);
                                      // A status picked → its files in the table, where they can be retried / cancelled.
                                      if (key !== null && !selected) setUploadHistoryView('table');
                                    }}
                                    title={info?.hint ?? 'Total — every file in these uploads.'}
                                    className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs transition-colors ${
                                      selected
                                        ? 'border-brand-blue/50 ring-1 ring-brand-blue/20 bg-brand-blue/[0.06]'
                                        : 'border-gray-200 bg-white hover:border-brand-blue/30 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900'
                                    } ${muted ? 'opacity-70' : ''}`}
                                  >
                                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${info?.tone ?? 'text-gray-500'} ${key === 'pending' && isRunningScope && n > 0 ? 'animate-pulse' : ''}`} />
                                    <span className="text-gray-600 dark:text-slate-400">{info?.label ?? 'Total'}:</span>
                                    <span
                                      className="font-bold tabular-nums text-gray-900 dark:text-slate-50"
                                      title={n > 99 ? `${n.toLocaleString('en-IN')} files` : undefined}
                                    >
                                      {n > 99 ? '99+' : n.toLocaleString('en-IN')}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {uploadHistoryFilter && (
                              <p className="tf-meta mt-2 flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                                Showing only <b className="font-semibold text-gray-700 dark:text-slate-200">{STATUS_INFO[uploadHistoryFilter].label}</b> — {STATUS_INFO[uploadHistoryFilter].hint}
                                <button type="button" onClick={() => setUploadHistoryFilter(null)} className="ml-1 font-medium text-brand-blue hover:underline">Show all</button>
                              </p>
                            )}
                          </div>

                          {/* Needs your attention — the next step, said plainly. */}
                          {!uploadHistoryFilter && needsLook && (
                            <div className="rounded-lg border border-warning-line bg-warning-subtle/60 px-3 py-2">
                              <p className="text-xs font-semibold text-warning-strong mb-1.5">Needs your attention</p>
                              <ul className="space-y-1.5">
                                {versionedCount > 0 && (
                                  <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700 dark:text-slate-200">
                                    <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue-2" />
                                    <span className="min-w-0 flex-1">
                                      <b className="font-semibold">{plural(versionedCount, 'resume')}</b> look{versionedCount === 1 ? 's' : ''} like a newer version of a candidate you already have. Review and decide what to keep.
                                    </span>
                                    <button type="button" onClick={() => { setUploadHistoryFilter('versioned'); setUploadHistoryView('table'); }} className="font-medium text-brand-blue hover:underline">Review</button>
                                  </li>
                                )}
                                {failedCount > 0 && (
                                  <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700 dark:text-slate-200">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-destructive" />
                                    <span className="min-w-0 flex-1">
                                      <b className="font-semibold">{plural(failedCount, 'file')}</b> could not be read. Open a file to see why, then Retry.
                                    </span>
                                    <button type="button" onClick={() => { setUploadHistoryFilter('error'); setUploadHistoryView('table'); }} className="font-medium text-brand-blue hover:underline">Show failed</button>
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}

                          {/* Upload list — every file in one table, or upload by upload */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-baseline gap-2">
                              <h3 className="tf-row-title">
                                {uploadHistoryView === 'table'
                                  ? (uploadHistoryFilter ? `${STATUS_INFO[uploadHistoryFilter].label} files` : 'All files')
                                  : isCurrentTab ? 'Uploads in progress' : 'Recent uploads'}
                              </h3>
                              <span className="tf-meta">{plural(displayRecords.length, 'upload')}</span>
                            </div>
                            <div className="inline-flex items-center rounded-lg bg-gray-100 p-0.5 dark:bg-slate-800" role="tablist" aria-label="View">
                              {([['batches', 'By upload'], ['table', 'Table']] as const).map(([v, label]) => (
                                <button
                                  key={v}
                                  type="button"
                                  role="tab"
                                  aria-selected={uploadHistoryView === v}
                                  onClick={() => setUploadHistoryView(v)}
                                  title={v === 'table' ? 'Every file in one table' : 'Each upload as its own card'}
                                  className={`h-6 px-2.5 text-xs font-medium rounded-md transition-colors ${
                                    uploadHistoryView === v
                                      ? 'bg-white text-brand-blue shadow-sm dark:bg-slate-900'
                                      : 'text-gray-600 hover:text-brand-blue dark:text-slate-300'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {uploadHistoryView === 'table' ? (() => {
                            /* Same status matching the cards' file lists use. */
                            const fileMatches = (f: UploadFile) => {
                              if (!uploadHistoryFilter) return true;
                              if (uploadHistoryFilter === 'completed') return f.status === 'completed';
                              if (uploadHistoryFilter === 'duplicated') return f.status === 'duplicate' || f.status === 'duplicated';
                              if (uploadHistoryFilter === 'versioned') return f.status === 'versioned' || f.status === 'version';
                              if (uploadHistoryFilter === 'error') return f.status === 'error';
                              if (uploadHistoryFilter === 'pending') return f.status === 'pending' || f.status === 'processing';
                              if (uploadHistoryFilter === 'cancelled') return f.status === 'cancelled' || f.status === 'discarded';
                              return true;
                            };
                            /* Every upload's files (the pills filter them). Files retried /
                               cancelled here stay listed with their live status and an
                               "Updated" tag until the pill changes or the list is
                               refreshed — an action never makes a row vanish. */
                            const pinKey = `table|${uploadHistoryFilter ?? 'all'}`;
                            const pinnedIds = uploadHistoryPinned.key === pinKey ? uploadHistoryPinned.ids : new Set<string>();
                            const pinRows = (ids: string[]) => setUploadHistoryPinned(prev => {
                              const next = new Set(prev.key === pinKey ? prev.ids : []);
                              ids.forEach(id => next.add(id));
                              return { key: pinKey, ids: next };
                            });
                            const tableRows = myResumesHistory.flatMap(record =>
                              (record.statuses || [])
                                .filter((file: UploadFile) => fileMatches(file) || pinnedIds.has(file.id))
                                .map((file: UploadFile) => ({ file, record }))
                            );
                            /* Acted-on rows whose status no longer matches the pill. */
                            const movedOut = uploadHistoryFilter
                              ? tableRows.filter(r => pinnedIds.has(r.file.id) && !fileMatches(r.file)).length
                              : 0;
                            return (
                              <div className="space-y-2">
                                {movedOut > 0 && (
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-brand-blue/5 px-3 py-1.5 text-xs text-gray-700 ring-1 ring-brand-blue/15 dark:text-slate-200">
                                    <Info className="h-3.5 w-3.5 shrink-0 text-brand-blue" />
                                    <span className="min-w-0 flex-1">
                                      {plural(movedOut, 'file')} changed status after your action and {movedOut === 1 ? 'is' : 'are'} no longer &ldquo;{STATUS_INFO[uploadHistoryFilter!].label}&rdquo;.
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setUploadHistoryPinned({ key: '', ids: new Set() })}
                                      className="font-medium text-brand-blue hover:underline"
                                    >
                                      Refresh list
                                    </button>
                                  </div>
                                )}
                                {renderFileTable(tableRows, {
                                  tableKey: 'all',
                                  showUpload: true,
                                  selectable: true,
                                  pinnedIds,
                                  onAct: (fileId) => pinRows([fileId]),
                                  onBulk: (mode, items) => {
                                    pinRows(items.map(i => i.itemId));
                                    setUploadHistoryBulk({ open: true, mode, items });
                                  },
                                  emptyText: uploadHistoryFilter
                                    ? <>No files with status &ldquo;{STATUS_INFO[uploadHistoryFilter].label}&rdquo;.</>
                                    : 'No file details yet — they appear as soon as the upload is registered.',
                                })}
                              </div>
                            );
                          })() : (
                          <div className="space-y-3">
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
                                const isUploading = record.status === 'uploading';
                                const isProcessing = record.status === 'processing' || record.pending > 0;
                                const isCancelled = cancelledCount > 0;
                                // Optimistic pre-API record: its id and item ids are `temp-*`
                                // placeholders, not UUIDs. Every retry/cancel endpoint takes UUID
                                // path params, so any action fired against it 422s on uuid_parsing.
                                // `local-*` records are the client-side stand-ins for single
                                // uploads the server gave us no batch for — same story, no UUID.
                                const isTempRecord = record.id.startsWith('temp-') || record.id.startsWith('local-');
                                const hasErrors = record.errors > 0;
                                const recordNeedsLook = record.errors > 0 || (record.versioned || 0) > 0;

                                /* The batch's state, in one chip. */
                                const statusChip = isUploading
                                  ? { label: 'Uploading…', cls: 'bg-brand-blue/10 text-brand-blue', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
                                  : isProcessing
                                    ? { label: 'Processing', cls: 'bg-brand-blue/10 text-brand-blue', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
                                    : recordNeedsLook
                                      ? { label: 'Needs a look', cls: 'bg-warning-subtle text-warning-strong', icon: <AlertCircle className="w-3 h-3" /> }
                                      : isCancelled && record.completed === 0
                                        ? { label: 'Cancelled', cls: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300', icon: <Ban className="w-3 h-3" /> }
                                        : { label: 'Completed', cls: 'bg-success-subtle text-success', icon: <CheckCircle className="w-3 h-3" /> };

                                /* Outcome chips — only the outcomes that happened. */
                                const outcomes = ([
                                  ['completed', record.completed],
                                  ['versioned', record.versioned || 0],
                                  ['duplicated', record.duplicated],
                                  ['error', record.errors],
                                  ['pending', record.pending],
                                  ['cancelled', cancelledCount],
                                ] as [FilterKey, number][]).filter(([, n]) => n > 0);

                                // Time left for this batch — only when items are genuinely active.
                                const batchEta = (() => {
                                  if (!(record.pending > 0 && record.date &&
                                    record.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing'))) return null;
                                  // Cap elapsed at 10 minutes to prevent absurd ETAs when a file
                                  // is stuck at 'processing' and the batch started hours ago.
                                  const elapsed = Math.min(Date.now() - new Date(record.date).getTime(), 10 * 60 * 1000);
                                  if (processed <= 0 || elapsed <= 0) return 'estimating time left…';
                                  const avgTimePerFile = elapsed / processed;
                                  const remainingMs = record.pending * avgTimePerFile;
                                  const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                                  const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                                  return lowMins === highMins
                                    ? `about ${lowMins} min${lowMins !== 1 ? 's' : ''} left`
                                    : `about ${lowMins}–${highMins} mins left`;
                                })();

                                return (
                                  <div
                                    key={record.id}
                                    /* Not clickable as a whole — no hover lift or chevron. */
                                    className="rounded-xl border border-gray-200 bg-white pb-3.5 dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    {/* Header: name + when, status on the right */}
                                    <div className="flex items-start justify-between gap-3 px-3.5 pt-3.5">
                                      <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-8 h-8 bg-brand-blue/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                          <FileText className="w-4 h-4 text-brand-blue" />
                                        </div>
                                        <div className="min-w-0">
                                          <span className="tf-row-title block truncate">{record.fileName}</span>
                                          <span className="tf-meta mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            {record.date && (
                                              <span className="inline-flex items-center gap-1">
                                                <Calendar className="w-3 h-3 flex-shrink-0" />
                                                Started {formatDateTimeIST(record.date)}
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
                                                <span className="inline-flex items-center gap-1">
                                                  <CheckCircle className="w-3 h-3 flex-shrink-0 text-success" />
                                                  Finished {formatDateTimeIST(record.completedAt)} · took <span className="font-medium text-gray-700 dark:text-slate-200">{duration}</span>
                                                </span>
                                              );
                                            })()}
                                          </span>
                                        </div>
                                      </div>
                                      <span className={`tf-badge shrink-0 gap-1.5 ${statusChip.cls}`}>
                                        {statusChip.icon}
                                        {statusChip.label}
                                      </span>
                                    </div>

                                    {/* Progress: count + time left, %, one bar for every outcome */}
                                    <div className="px-3.5 mt-3">
                                      <div className="mb-1.5 flex items-end justify-between gap-3">
                                        <span className="tf-meta">
                                          {processed.toLocaleString('en-IN')} of {plural(record.totalFiles || 0, 'file')} processed
                                          {batchEta ? ` · ${batchEta}` : ''}
                                        </span>
                                      </div>
                                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                                        {barSegments({ completed: record.completed, versioned: record.versioned || 0, duplicated: record.duplicated, errors: record.errors, cancelled: cancelledCount, processing: isProcessing ? processingOf([record]) : 0, total: record.totalFiles || 0 }).map(seg => (
                                          <div key={seg.key} className={`${seg.bar} h-full transition-[width] duration-500`} style={{ width: `${seg.width}%` }} />
                                        ))}
                                      </div>
                                      {renderBreakdown(outcomes, record.totalFiles || 0, 'mt-2.5')}
                                    </div>
                                    {unaccountedCount > 0 && (
                                      <div className="mx-3.5 mt-3 flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-strong">
                                        <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                                        <span>
                                          {unaccountedCount} file{unaccountedCount !== 1 ? 's' : ''} in this upload {unaccountedCount !== 1 ? 'are' : 'is'} not
                                          reflected in the totals above — open the file list below for their actual state.
                                        </span>
                                      </div>
                                    )}

                                    {/* Retry / Cancel Batch. Hidden until the optimistic temp
                                        record is swapped for the real server batch_id, since
                                        both endpoints take a UUID. */}
                                    {(isProcessing || hasErrors || isCancelled) && !isTempRecord && (
                                      <div className="flex flex-wrap items-center gap-2 px-3.5 mt-3" onClick={e => e.stopPropagation()}>
                                        {(isProcessing || hasErrors || isCancelled) && (
                                          <button
                                            type="button"
                                            disabled={retryingBatches.has(record.id)}
                                            onClick={(e) => handleRetryBatch(record.id, e)}
                                            title={isCancelled && !isProcessing ? 'Put the cancelled files back in the queue' : 'Try the failed or stuck files again'}
                                            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-md transition-colors text-brand-blue bg-brand-blue/[0.08] hover:bg-brand-blue/[0.14] disabled:text-gray-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                          >
                                            <RefreshCw className={`w-3.5 h-3.5 ${retryingBatches.has(record.id) ? 'animate-spin' : ''}`} />
                                            {retryingBatches.has(record.id)
                                              ? 'Retrying…'
                                              : isCancelled && !isProcessing ? `Re-queue ${cancelledCount} cancelled` : 'Retry'}
                                          </button>
                                        )}
                                        {/* Cancel — only while items are still pending. type="button"
                                            so a stray Enter can't activate it; it opens a confirmation. */}
                                        {isProcessing && record.pending > 0 && (
                                          <button
                                            type="button"
                                            disabled={cancellingBatches.has(record.id)}
                                            onClick={(e) => handleCancelBatch(record.id, record.pending, e)}
                                            onKeyDown={(e) => {
                                              // Space scrolls the file list; it must not double as "cancel 77 files".
                                              if (e.key === ' ') e.preventDefault();
                                            }}
                                            title="Stop the files still waiting — files already added stay"
                                            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-md transition-colors text-destructive bg-destructive-subtle hover:brightness-95 disabled:text-gray-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                            {cancellingBatches.has(record.id) ? 'Cancelling…' : `Cancel ${record.pending} waiting`}
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
                                      /* The file list is a dropdown — collapsed by default so a
                                         batch reads as its summary first. A status filter opens
                                         it, since filtering is asking to see those files. */
                                      const filesOpen = !!uploadHistoryFilter || expandedUploadBatches.has(record.id);
                                      return filteredStatuses.length > 0 ? (
                                      <div className="mt-3 border-t border-gray-100 pt-3 px-3.5 dark:border-slate-700/60">
                                        <div className={`flex flex-wrap items-center justify-between gap-2 ${filesOpen ? 'mb-2' : ''}`}>
                                          <div className="flex items-center gap-3">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedUploadBatches((prev) => {
                                                  const next = new Set(prev);
                                                  if (next.has(record.id)) next.delete(record.id);
                                                  else next.add(record.id);
                                                  return next;
                                                });
                                              }}
                                              disabled={!!uploadHistoryFilter}
                                              aria-expanded={filesOpen}
                                              className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-brand-blue hover:bg-brand-blue/5 disabled:text-gray-700 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                                            >
                                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filesOpen ? '' : '-rotate-90'}`} />
                                              {uploadHistoryFilter
                                                ? `${STATUS_INFO[uploadHistoryFilter].label} (${filteredStatuses.length} of ${record.statuses.length} files)`
                                                : `${filesOpen ? 'Hide' : 'Show'} files (${filteredStatuses.length})`}
                                            </button>
                                            {/* Select All checkbox for versioned items */}
                                            {uploadHistoryFilter === 'versioned' && filteredStatuses.length > 0 && (() => {
                                              const versionedInBatch = filteredStatuses.filter((f: any) => f.status === 'versioned' || f.status === 'version');
                                              if (versionedInBatch.length === 0) return null;
                                              const allSelected = versionedInBatch.every((f: any) => selectedVersionedItems.has(f.id));
                                              return (
                                                <button
                                                  type="button"
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
                                                    tabIndex={-1}
                                                    className="tf-checkbox w-3 h-3 pointer-events-none"
                                                  />
                                                  Select All
                                                </button>
                                              );
                                            })()}
                                          </div>
                                          {!filesOpen && (
                                            <span className="tf-meta">Open to see each file and what happened to it</span>
                                          )}
                                        </div>
                                        {filesOpen && (<>
                                        {/* Short note: what Retry / Cancel can do */}
                                        {record.statuses.some((f: any) => f.status === 'pending' || f.status === 'error' || f.status === 'cancelled') && (
                                          <p className="flex items-center gap-1.5 tf-meta mb-2.5">
                                            <Info className="w-3 h-3 flex-shrink-0" />
                                            Retry works on waiting, failed &amp; cancelled files. Cancel works only on files still waiting.
                                          </p>
                                        )}
                                        {filteredStatuses.some((f: any) => ['completed', 'versioned', 'version', 'duplicate', 'error'].includes(f.status)) && (
                                          <p className="flex items-center gap-1.5 tf-meta mb-2.5">
                                            <ChevronRight className="w-3 h-3 flex-shrink-0" />
                                            Click a file to see its details{filteredStatuses.some((f: any) => f.status === 'versioned' || f.status === 'version') ? ' — or, for a new version, to decide what to keep' : ''}.
                                          </p>
                                        )}
                                        {renderFileTable(
                                          filteredStatuses.map((file: UploadFile) => ({ file, record })),
                                          { tableKey: `batch:${record.id}`, showUpload: false, emptyText: null },
                                        )}
                                        </>)}
                                      </div>
                                      ) : uploadHistoryFilter ? (
                                        <div className="mt-3 border-t border-gray-100 pt-3 px-3.5 dark:border-slate-700/60">
                                          <p className="tf-meta text-center py-2">No files with status &ldquo;{STATUS_INFO[uploadHistoryFilter].label}&rdquo; in this upload</p>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                );
                              })}
                          </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
        </AppModal>
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
            // Refresh batch data, without pulling the view out of its folder
            fetchUploadHistory();
            optsRef.current.onRefresh?.();
          }}
        />
      )}

      {/* Cancel Batch Confirmation Dialog.
          The confirmation dialogs below pass only `sm:max-w-lg`: a bare
          `max-w-md` used to replace the base `max-w-[calc(100%-2rem)]`, so on a
          phone they ran edge to edge with no gutter. */}
      <AlertDialog
        open={cancelBatchConfirm.isOpen}
        onOpenChange={(open) => {
          if (!open) setCancelBatchConfirm({ isOpen: false, batchId: '', pendingCount: 0 });
        }}
      >
        <AlertDialogContent className="sm:max-w-lg" hideClose>
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel {cancelBatchConfirm.pendingCount} queued file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''}?
                </AlertDialogTitle>
                <p className="mt-1 tf-body-muted">
                  This stops {cancelBatchConfirm.pendingCount} file{cancelBatchConfirm.pendingCount !== 1 ? 's' : ''} that
                  {cancelBatchConfirm.pendingCount !== 1 ? ' have' : ' has'} not finished processing.
                </p>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-1.5 rounded-xl border border-red-100 bg-red-50/60 p-4 tf-body">
                <p>Files already completed are kept</p>
                <p>Their Resume Storage units are refunded</p>
                <p>You can re-queue cancelled files later with Retry</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
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
        <AlertDialogContent className="sm:max-w-lg" hideClose>
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <Ban className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                  Cancel this file?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <p className="mt-1 tf-body-muted">
                    <span className="font-medium text-gray-900">{cancelItemConfirm.fileName}</span> will not
                    be processed. Its unit is refunded and you can re-queue it later with Retry.
                  </p>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
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

      {/* Bulk Retry / Cancel Confirmation (Upload History table) */}
      <AlertDialog
        open={uploadHistoryBulk.open}
        onOpenChange={(open) => {
          if (!open) setUploadHistoryBulk(b => ({ ...b, open: false }));
        }}
      >
        <AlertDialogContent className="sm:max-w-lg" hideClose>
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${
                uploadHistoryBulk.mode === 'cancel' ? 'bg-red-100 text-red-600' : 'bg-brand-blue/10 text-brand-blue'
              }`}>
                {uploadHistoryBulk.mode === 'cancel' ? <Ban className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-xl font-bold text-gray-900">
                  {uploadHistoryBulk.mode === 'cancel'
                    ? `Cancel ${uploadHistoryBulk.items.length} waiting file${uploadHistoryBulk.items.length !== 1 ? 's' : ''}?`
                    : `Retry ${uploadHistoryBulk.items.length} file${uploadHistoryBulk.items.length !== 1 ? 's' : ''}?`}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <p className="mt-1 tf-body-muted">
                    {uploadHistoryBulk.mode === 'cancel'
                      ? 'They will not be processed. Their units are refunded and you can re-queue them later with Retry.'
                      : 'They go back in the queue and are read again. A file that failed because you were out of Resume Storage units uses 1 unit.'}
                  </p>
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="border-t border-gray-100 pt-4">
            <AlertDialogCancel>{uploadHistoryBulk.mode === 'cancel' ? 'Keep processing' : 'Not now'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void runUploadHistoryBulk(); }}
              className={uploadHistoryBulk.mode === 'cancel' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-brand-blue hover:bg-brand-blue-2 text-white'}
            >
              {uploadHistoryBulk.mode === 'cancel'
                ? `Cancel ${uploadHistoryBulk.items.length} file${uploadHistoryBulk.items.length !== 1 ? 's' : ''}`
                : `Retry ${uploadHistoryBulk.items.length} file${uploadHistoryBulk.items.length !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  const activeUploads = uploadHistory.filter(r => r.source === 'my-resumes' && (r.status === 'processing' || r.pending > 0)).length;

  return {
    openUploadToFolder,
    isUploadModalOpen,
    closeUploadModal,
    openUploadHistoryModal,
    uploadHistory,
    activeUploads,
    uploadStartedThisSession,
    uploadFlowElements,
  };
}
