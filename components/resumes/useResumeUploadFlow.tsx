'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useId, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Copy, GitBranch, Loader2, X, CheckCircle, AlertCircle, Clock, Calendar, ChevronDown, FileText, Info, RefreshCw, Ban, Lightbulb, HelpCircle } from 'lucide-react';
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
import { removeBackgroundTask, upsertBackgroundTask } from '@/lib/backgroundTasks';

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

  /* Minimized Upload History: a row in the shared "My Activities" list
     (bottom-right, beside scoring runs and invite sends) instead of a floating
     button of its own in the same corner. The row's View reopens the panel. */
  const uploadTaskId = `resume-upload:${useId()}`;
  const reopenUploadHistory = useRef<() => void>(() => {});
  useEffect(() => {
    reopenUploadHistory.current = () => {
      setIsUploadHistoryMinimized(false);
      setIsUploadHistoryModalOpen(true);
    };
  });
  useEffect(() => {
    if (!isUploadHistoryMinimized) { removeBackgroundTask(uploadTaskId); return; }
    const mine = uploadHistory.filter((r) => r.source === 'my-resumes');
    const running = mine.filter((r) => r.status === 'processing' || (r.pending ?? 0) > 0);
    const of = (list: typeof mine, pick: (r: (typeof mine)[number]) => number) => list.reduce((sum, r) => sum + (Number(pick(r)) || 0), 0);
    const total = of(running, (r) => r.totalFiles);
    const left = of(running, (r) => r.pending);
    const uploaded = of(mine, (r) => r.completed) + of(mine, (r) => r.versioned);
    const failed = of(mine, (r) => r.errors);
    const fmt = (v: number) => v.toLocaleString('en-IN');
    upsertBackgroundTask({
      id: uploadTaskId,
      kind: 'resume-upload',
      title: 'Upload History',
      pct: running.length && total > 0 ? Math.round(((total - left) / total) * 100) : 100,
      done: running.length === 0,
      detail: running.length
        ? `${fmt(total - left)}/${fmt(total)} processed`
        : `${fmt(uploaded)} uploaded${failed ? ` · ${fmt(failed)} failed` : ''}`,
      onOpen: () => reopenUploadHistory.current(),
    });
  }, [isUploadHistoryMinimized, uploadHistory, uploadTaskId]);
  useEffect(() => () => removeBackgroundTask(uploadTaskId), [uploadTaskId]);
  const [uploadHistoryTab, setUploadHistoryTab] = useState<'current' | 'completed'>('current');
  // Flipped the moment an upload starts here, so the Upload History button goes
  // live for a first-time user immediately instead of waiting for the resume
  // list to come back.
  const [uploadStartedThisSession, setUploadStartedThisSession] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<UploadHistoryItem | null>(null);
  const [uploadHistoryFilter, setUploadHistoryFilter] = useState<'completed' | 'duplicated' | 'versioned' | 'error' | 'pending' | 'cancelled' | null>(null);
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
    if (prev > 0 && activeUploadCount === 0 && isUploadHistoryModalOpen && uploadHistoryTab === 'current') {
      setUploadHistoryTab('completed');
      setUploadHistoryFilter(null);
    }
  }, [activeUploadCount, isUploadHistoryModalOpen, uploadHistoryTab]);
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

  /* `/resumes/upload/batches` is tenant-scoped — it takes no owner filter and
     its payload doesn't say who created a batch — so a second account in the
     same tenant was shown everybody else's uploads. Ownership is therefore
     established two ways, in order:

       1. An owner field on the payload, if the API ever sends one. Authoritative.
       2. A local ledger of the batch ids THIS account created, kept per user in
          localStorage and written the moment an upload starts here.

     A batch that matches neither is another account's and is dropped. That
     means uploads made before this ledger existed, or from another browser,
     won't be listed — the endpoint gives the client nothing to recognise them
     by. Scoping the endpoint server-side is the real fix. */
  const BATCH_OWNER_FIELDS = [
    'user_id', 'uploaded_by', 'uploaded_by_id', 'uploaded_by_name',
    'created_by', 'created_by_id', 'owner_id',
  ];

  const batchLedgerKey = user?.id ? `tf:upload-batches:${user.id}` : null;

  const readBatchLedger = useCallback((): string[] => {
    if (!batchLedgerKey || typeof window === 'undefined') return [];
    try {
      const stored = JSON.parse(localStorage.getItem(batchLedgerKey) || '[]');
      return Array.isArray(stored) ? stored.map(String) : [];
    } catch {
      return [];
    }
  }, [batchLedgerKey]);

  const rememberBatchIds = useCallback((ids: string[]) => {
    if (!batchLedgerKey || typeof window === 'undefined') return;
    const fresh = ids.filter(Boolean).map(String);
    if (fresh.length === 0) return;
    try {
      // Newest first, capped — a ledger is only useful for recent history.
      const next = Array.from(new Set([...fresh, ...readBatchLedger()])).slice(0, 200);
      localStorage.setItem(batchLedgerKey, JSON.stringify(next));
    } catch {
      // Private mode / quota — ownership just falls back to the payload check.
    }
  }, [batchLedgerKey, readBatchLedger]);

  const batchOwnerValue = (batch: any) =>
    BATCH_OWNER_FIELDS
      .map(field => batch?.[field])
      .find(value => value !== undefined && value !== null && value !== '');

  const isOwnBatch = (batch: any, ledger: string[]) => {
    const owner = batchOwnerValue(batch);
    if (owner !== undefined) {
      const identities = [user?.id, user?.email, user?.name]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      return identities.includes(String(owner).toLowerCase());
    }
    return ledger.includes(String(batch?.id));
  };

  const hasBatchFiles = (batch: any) =>
    (batch?.total_files ?? 0) > 0 || (batch?.items?.length ?? 0) > 0;

  const ownBatchRecords = (batches: any[]) => {
    const ledger = readBatchLedger();
    return batches.filter(b => isOwnBatch(b, ledger) && hasBatchFiles(b)).map(mapBatchRecord);
  };

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
        if (fresh.length > 0) {
          rememberBatchIds(fresh);
          return fresh;
        }
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
      // Claim it straight away — every later refresh filters on this ledger.
      rememberBatchIds([batch.id]);

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
      {/* Minimized Upload History: a row in My Activities (see uploadTaskId above). */}

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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-4xl max-h-[85dvh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header — plain, one hairline under it */}
              <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="tf-section-title sm:text-xl tracking-tight">Upload History</h2>
                    <p className="tf-body-secondary mt-0.5">View all past bulk upload reports</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsUploadHistoryMinimized(true);
                        setIsUploadHistoryModalOpen(false);
                      }}
                      className="h-8 min-w-8 px-2 sm:px-3 flex items-center justify-center gap-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Minimize" title="Minimize"
                    >
                      <span className="text-xl font-medium leading-none">−</span>
                      <span className="hidden sm:inline text-sm font-medium">Minimize</span>
                    </button>
                    <button
                      onClick={handleCloseUploadHistory}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 bg-gray-50/70">
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

                  /* A tab holding no batches at all gets one illustrated empty
                     state and nothing else. Previously it stacked three blocks
                     that each said the same thing — the all-zero stats card, the
                     "0 batches" list header, and the list's own placeholder. */
                  const showFullEmptyState = displayRecords.length === 0;

                  return (
                    <>
                      {/* Tabs */}
                      <div className="tf-card-soft inline-flex items-center p-1 mb-4 sm:mb-6">
                        <button
                          onClick={() => setUploadHistoryTab('current')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-sm font-medium transition-all ${
                            uploadHistoryTab === 'current'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeRecords.length > 0 && uploadHistoryTab !== 'current' ? 'text-brand-blue animate-spin' : ''}`} />
                          Currently Processing
                          {activeRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                              uploadHistoryTab === 'current' ? 'bg-white text-brand-blue' : 'bg-brand-blue/10 text-brand-blue'
                            }`}>
                              {activeRecords.length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setUploadHistoryTab('completed')}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-sm font-medium transition-all ${
                            uploadHistoryTab === 'completed'
                              ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                              : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                          }`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Completed
                          {completedRecords.length > 0 && (
                            <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
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
                          "nothing here" card, so a wall of zeros never shows.
                          Skipped entirely when the tab has no batches — the
                          illustrated empty state below speaks for it. */}
                      {!showFullEmptyState && (() => {
                        const statCards = [
                          // Labelled "Files Completed" (not "Completed") because it sums completed
                          // files across every batch in this tab, while the tab badge and the
                          // "N batches" header below count batches — a batch with several files
                          // can push this past that batch count, which used to read as a bug.
                          { key: 'completed', label: 'Files Completed', value: completedCount, icon: CheckCircle, tone: 'brand-blue' },
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
                            tile: 'bg-brand-blue/10 text-brand-blue',
                            value: 'text-brand-blue',
                          },
                          'brand-blue-2': {
                            card: 'from-brand-blue-2/[0.08] to-brand-blue-2/[0.03]',
                            active: 'border-brand-blue-2/50 ring-2 ring-brand-blue-2/30 shadow-md',
                            idle: 'border-brand-blue-2/20',
                            tile: 'bg-brand-blue-2/10 text-brand-blue-2',
                            value: 'text-brand-blue-2',
                          },
                          'brand-cyan': {
                            card: 'from-brand-cyan/[0.08] to-brand-cyan/[0.03]',
                            active: 'border-brand-cyan/50 ring-2 ring-brand-cyan/30 shadow-md',
                            idle: 'border-brand-cyan/20',
                            tile: 'bg-brand-cyan/10 text-brand-cyan',
                            value: 'text-brand-cyan',
                          },
                          'brand-teal': {
                            card: 'from-brand-teal/[0.08] to-brand-teal/[0.03]',
                            active: 'border-brand-teal/50 ring-2 ring-brand-teal/30 shadow-md',
                            idle: 'border-brand-teal/20',
                            tile: 'bg-brand-teal/10 text-brand-teal',
                            value: 'text-brand-teal',
                          },
                          'brand-orange': {
                            card: 'from-brand-orange/[0.08] to-brand-orange/[0.03]',
                            active: 'border-brand-orange/50 ring-2 ring-brand-orange/30 shadow-md',
                            idle: 'border-brand-orange/20',
                            tile: 'bg-brand-orange/10 text-brand-orange',
                            value: 'text-brand-orange-deep',
                          },
                          'brand-orange-deep': {
                            card: 'from-brand-orange-deep/[0.08] to-brand-orange-deep/[0.03]',
                            active: 'border-brand-orange-deep/50 ring-2 ring-brand-orange-deep/30 shadow-md',
                            idle: 'border-brand-orange-deep/20',
                            tile: 'bg-brand-orange-deep/10 text-brand-orange-deep',
                            value: 'text-brand-orange-deep',
                          },
                          // Cancelled is deliberately off-palette: it's an
                          // absence of work, not a result.
                          'gray': {
                            card: 'from-gray-100 to-gray-200/50',
                            active: 'border-gray-700 ring-2 ring-gray-400 shadow-md',
                            idle: 'border-gray-300',
                            tile: 'bg-gray-100 text-gray-600',
                            value: 'text-gray-800',
                          },
                        };

                        const allZero = statCards.every(card => (card.value || 0) === 0) && totalFiles === 0;

                        if (allZero) {
                          return (
                            <div className="flex items-center gap-3 mb-4 sm:mb-6 tf-panel p-4">
                              <div className="w-9 h-9 bg-brand-blue/10 text-brand-blue rounded-lg flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="tf-row-name">
                                  {uploadHistoryTab === 'current' ? 'No uploads in progress' : 'No completed uploads yet'}
                                </p>
                                <p className="tf-meta">
                                  {uploadHistoryTab === 'current'
                                    ? 'Upload resumes to see live progress and status counts here.'
                                    : 'Finished upload batches and their status counts will appear here.'}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        // Only outcomes that actually happened get a card — a
                        // batch with no duplicates or failures shouldn't spend
                        // grid space saying so. The active filter's card stays
                        // even at zero, otherwise clicking a card could make it
                        // vanish with the filter still applied and no way to
                        // toggle it back off.
                        const visibleCards = statCards.filter(
                          card => (card.value || 0) > 0 || uploadHistoryFilter === card.key
                        );

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                            {visibleCards.map(({ key, label, value, icon: Icon, tone }) => {
                              const t = TONE_CLASS[tone];
                              const isActive = uploadHistoryFilter === key;
                              return (
                                <div
                                  key={key}
                                  onClick={() => setUploadHistoryFilter(isActive ? null : key)}
                                  className={`bg-white border rounded-xl p-2.5 sm:p-3 lg:p-4 cursor-pointer transition-colors ${isActive ? t.active : 'border-gray-200 hover:border-gray-300'}`}
                                >
                                  <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 mb-1.5 sm:mb-2">
                                    <div className={`w-6 h-6 sm:w-7 sm:h-7 ${t.tile} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </div>
                                    <span className="tf-meta truncate">{label}</span>
                                  </div>
                                  <div className={`text-lg sm:text-xl lg:text-2xl font-bold tracking-tight ${t.value}`}>{value}</div>
                                </div>
                              );
                            })}

                            {/* Success Rate — not a filter, so it stays static.
                                Hidden when nothing was attempted: 0% would read
                                as a total failure rather than "no data". */}
                            {attemptedFiles > 0 && (
                            <div className="tf-panel p-2.5 sm:p-3 lg:p-4">
                              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 mb-1.5 sm:mb-2">
                                <div className="w-6 h-6 sm:w-7 sm:h-7 bg-brand-cyan/10 text-brand-cyan rounded-lg flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <span className="tf-meta truncate">Success Rate</span>
                              </div>
                              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-brand-cyan tracking-tight">{successRate}%</div>
                            </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Active Filter Indicator */}
                      {uploadHistoryFilter && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-white rounded-lg shadow-sm shadow-black/[0.03]">
                          <span className="tf-meta">Filtering by:</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            uploadHistoryFilter === 'completed' ? 'bg-brand-blue/10 text-brand-blue' :
                            uploadHistoryFilter === 'duplicated' ? 'bg-brand-orange/15 text-brand-orange-deep' :
                            uploadHistoryFilter === 'versioned' ? 'bg-brand-blue-2/10 text-brand-blue-2' :
                            uploadHistoryFilter === 'error' ? 'bg-brand-orange-deep/10 text-brand-orange-deep' :
                            uploadHistoryFilter === 'cancelled' ? 'bg-gray-200 text-gray-800' :
                            'bg-brand-teal/10 text-brand-teal'
                          }`}>
                            {uploadHistoryFilter === 'completed' ? 'Files Completed' :
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
                            <div className="flex items-center gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/[0.07] rounded-xl">
                              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue animate-spin flex-shrink-0" />
                              <span className="text-sm text-brand-blue">Processing {totalPending} resume{totalPending !== 1 ? 's' : ''}... Estimating time remaining</span>
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
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-brand-blue/[0.07] rounded-xl">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue flex-shrink-0" />
                              <span className="text-sm font-medium text-brand-blue">{etaText}</span>
                            </div>
                            <span className="text-xs text-brand-blue/60 sm:ml-auto">{totalPending} resume{totalPending !== 1 ? 's' : ''} left across {activeBatches.length} batch{activeBatches.length !== 1 ? 'es' : ''}</span>
                          </div>
                        );
                      })()}

                      {/* Upload History List */}
                      {!showFullEmptyState && (
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="tf-row-title">
                            {uploadHistoryTab === 'current' ? 'Active Uploads' : 'Recent Uploads'}
                          </h3>
                          <span className="tf-meta">{displayRecords.length} batch{displayRecords.length !== 1 ? 'es' : ''}</span>
                        </div>
                      )}

                      {showFullEmptyState ? (
                        <>
                          <UploadHistoryEmptyState
                            title={
                              uploadHistoryTab === 'current'
                                ? 'No uploads in progress'
                                : myResumesHistory.length === 0 ? 'No upload history yet' : 'Nothing here yet'
                            }
                            lines={
                              uploadHistoryTab === 'current'
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
                          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-orange/[0.08] border border-brand-orange/20 px-3 py-2.5">
                            <Lightbulb className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" />
                            <p className="tf-body">
                              <span className="font-semibold">Tip:</span> You can upload a single resume or bulk upload multiple resumes at once.
                            </p>
                          </div>
                        </>
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
                              // `local-*` records are the client-side stand-ins for single
                              // uploads the server gave us no batch for — same story, no UUID.
                              const isTempRecord = record.id.startsWith('temp-') || record.id.startsWith('local-');
                              const hasErrors = record.errors > 0;
                              const hasIssues = record.duplicated > 0 || (record.versioned || 0) > 0 || record.errors > 0 || cancelledCount > 0;

                              return (
                                <div
                                  key={record.id}
                                  /* One subtle border, nothing else: the card is not
                                     clickable, so no hover lift or chevron either. */
                                  className="tf-panel pb-4 sm:pb-5"
                                >
                                  {/* Header Row */}
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 px-4 sm:px-5 pt-4 sm:pt-5">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-9 h-9 bg-brand-blue/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-4 h-4 text-brand-blue" />
                                      </div>
                                      <div className="min-w-0">
                                        <span className="tf-row-title block truncate">{record.fileName}</span>
                                        {record.date && (
                                          <span className="tf-meta flex items-center gap-1 mt-0.5">
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
                                            <span className="tf-meta flex items-center gap-1 mt-0.5">
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
                                    <div className="flex items-center gap-3 ml-12 sm:ml-0">
                                      {isUploading && (
                                        <span className="tf-badge gap-1.5 bg-brand-blue/10 text-brand-blue">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Uploading…
                                        </span>
                                      )}
                                      {!isUploading && hasIssues && (
                                        <span className="tf-badge gap-1.5 bg-brand-orange/10 text-brand-orange-deep">
                                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                          Needs review
                                        </span>
                                      )}
                                      {!isUploading && (
                                        <div className="text-right">
                                          <div className={`text-xl font-bold tracking-tight leading-none tabular-nums ${
                                            percentage === 100 ? 'text-brand-blue' :
                                            percentage >= 90 ? 'text-brand-cyan' :
                                            percentage >= 70 ? 'text-brand-orange' :
                                            'text-brand-orange-deep'
                                          }`}>
                                            {percentage}%
                                          </div>
                                          <div className="tf-micro-hint mt-1 uppercase tracking-wide">Success</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Outcome strip — one soft panel split by hairlines instead
                                      of six separately bordered tiles; a number is coloured
                                      only when something actually landed in it. */}
                                  <div className="mx-4 sm:mx-5 mt-4 grid grid-cols-3 sm:grid-cols-6 gap-y-2 rounded-lg bg-gray-50 py-2.5 sm:divide-x sm:divide-gray-200/80">
                                    {[
                                      { label: 'Done', value: record.completed, tone: 'text-brand-blue' },
                                      { label: 'Duplicates', value: record.duplicated, tone: 'text-brand-orange-deep' },
                                      { label: 'Version', value: record.versioned || 0, tone: 'text-brand-blue-2' },
                                      { label: 'Failed', value: record.errors, tone: 'text-destructive' },
                                      { label: 'Pending', value: record.pending, tone: 'text-brand-teal' },
                                      { label: 'Cancelled', value: cancelledCount, tone: 'text-gray-700' },
                                    ].map(({ label, value, tone }) => (
                                      <div key={label} className="text-center px-1">
                                        <div className={`text-base font-semibold tabular-nums leading-tight ${value > 0 ? tone : 'text-gray-300'}`}>{value}</div>
                                        <div className="tf-micro-hint mt-0.5">{label}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {unaccountedCount > 0 && (
                                    <div className="mx-4 sm:mx-5 mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                      <AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                                      <span>
                                        {unaccountedCount} file{unaccountedCount !== 1 ? 's' : ''} in this batch {unaccountedCount !== 1 ? 'are' : 'is'} not
                                        reflected in the totals above — open the file list below for their actual state.
                                      </span>
                                    </div>
                                  )}

                                  {/* Progress, with the time estimate right under the bar */}
                                  <div className="px-4 sm:px-5 mt-4">
                                    <div className="flex items-center justify-between text-xs mb-1.5">
                                      <span className="font-medium text-gray-700">Progress</span>
                                      <span className="text-gray-500 tabular-nums">{processed} of {record.totalFiles}</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          percentage === 100 ? 'bg-brand-blue' :
                                          percentage >= 90 ? 'bg-brand-cyan' :
                                          percentage >= 70 ? 'bg-brand-orange' :
                                          'bg-brand-orange-deep'
                                        }`}
                                        style={{ width: `${Math.min((processed / record.totalFiles) * 100, 100)}%` }}
                                      />
                                    </div>
                                    {/* Estimated Time Remaining — only when items are genuinely active */}
                                    {record.pending > 0 && record.date &&
                                     record.statuses?.some((s: any) => s.status === 'pending' || s.status === 'processing') &&
                                     (() => {
                                      // Cap elapsed at 10 minutes to prevent absurd ETAs when a file
                                      // is stuck at 'processing' and the batch started hours ago.
                                      const elapsed = Math.min(Date.now() - new Date(record.date).getTime(), 10 * 60 * 1000);
                                      if (processed <= 0 || elapsed <= 0) {
                                        return (
                                          <div className="flex items-center gap-1.5 mt-2 tf-meta">
                                            <Clock className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue" />
                                            <span>Estimating time remaining…</span>
                                          </div>
                                        );
                                      }
                                      const avgTimePerFile = elapsed / processed;
                                      const remainingMs = record.pending * avgTimePerFile;
                                      const lowMins = Math.max(1, Math.floor((remainingMs * 0.7) / 60000));
                                      const highMins = Math.max(1, Math.ceil((remainingMs * 1.3) / 60000));
                                      const etaText = lowMins === highMins
                                        ? `Approx. ${lowMins} min${lowMins !== 1 ? 's' : ''} remaining`
                                        : `Approx. ${lowMins}–${highMins} mins remaining`;
                                      return (
                                        <div className="flex items-center gap-1.5 mt-2 tf-meta">
                                          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-brand-blue" />
                                          <span>{etaText}</span>
                                          <span className="text-gray-300">·</span>
                                          <span>{record.pending} file{record.pending !== 1 ? 's' : ''} left</span>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  {/* Retry / Cancel Batch — borderless tinted buttons. Hidden
                                      until the optimistic temp record is swapped for the real
                                      server batch_id, since both endpoints take a UUID. */}
                                  {(isProcessing || hasErrors || isCancelled) && !isTempRecord && (
                                    <div className="flex items-center gap-2 px-4 sm:px-5 mt-4" onClick={e => e.stopPropagation()}>
                                      {(isProcessing || hasErrors || isCancelled) && (
                                        <button
                                          type="button"
                                          disabled={retryingBatches.has(record.id)}
                                          onClick={(e) => handleRetryBatch(record.id, e)}
                                          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg transition-colors text-brand-blue bg-brand-blue/[0.08] hover:bg-brand-blue/[0.14] disabled:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                                          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg transition-colors text-destructive bg-destructive-subtle hover:brightness-95 disabled:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                          {cancellingBatches.has(record.id) ? 'Cancelling…' : `Cancel batch (${record.pending} pending)`}
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
                                    <div className="mt-4 border-t border-gray-100 pt-3 px-4 sm:px-5">
                                      <div className={`flex items-center justify-between ${filesOpen ? 'mb-2' : ''}`}>
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
                                            className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                                          >
                                            <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${filesOpen ? '' : '-rotate-90'}`} />
                                            Files ({filteredStatuses.length}{uploadHistoryFilter ? ` of ${record.statuses.length}` : ''})
                                          </button>
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
                                                  className="tf-checkbox w-3 h-3 pointer-events-none"
                                                />
                                                Select All
                                              </button>
                                            );
                                          })()}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="flex items-center gap-1 text-success tabular-nums" title="Done">
                                            <CheckCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'completed' || f.status === 'versioned').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-brand-blue tabular-nums" title="In progress or queued">
                                            <Clock className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'processing' || f.status === 'pending').length}
                                          </span>
                                          <span className="flex items-center gap-1 text-destructive tabular-nums" title="Failed or duplicate">
                                            <AlertCircle className="w-3 h-3" />
                                            {record.statuses.filter((f: any) => f.status === 'error' || f.status === 'duplicate' || f.status === 'duplicated').length}
                                          </span>
                                          {/* Cancelled files had no counter at all, so they were invisible here too */}
                                          {record.statuses.some((f: any) => f.status === 'cancelled' || f.status === 'discarded') && (
                                            <span className="flex items-center gap-1 text-gray-500 tabular-nums" title="Cancelled">
                                              <Ban className="w-3 h-3" />
                                              {record.statuses.filter((f: any) => f.status === 'cancelled' || f.status === 'discarded').length}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {filesOpen && (<>
                                      {/* Short note: cancel only for queued items */}
                                      {record.statuses.some((f: any) => f.status === 'pending' || f.status === 'error' || f.status === 'cancelled') && (
                                        <p className="flex items-center gap-1.5 tf-micro-hint mb-2.5">
                                          <Info className="w-3 h-3 flex-shrink-0 text-gray-400" />
                                          Retry is available for queued, failed &amp; cancelled files. Cancel is only available for queued files.
                                        </p>
                                      )}
                                      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-72 overflow-y-auto">
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
                                            className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                                              isVersioned && isSelected ? 'bg-brand-blue-2/[0.06]' :
                                              isUnknownStatusFile ? 'bg-amber-50/70' :
                                              'bg-white'
                                            } ${isClickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
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
                                                className="tf-checkbox focus:ring-brand-blue-2/40"
                                              />
                                            )}
                                            {/* Status Icon */}
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-success-subtle text-success' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/10 text-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue/10 text-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/10 text-brand-orange-deep' :
                                              file.status === 'error' ? 'bg-destructive-subtle text-destructive' :
                                              isUnknownStatusFile ? 'bg-amber-100 text-amber-700' :
                                              'bg-gray-100 text-gray-500'
                                            }`}>
                                              {file.status === 'completed' && <CheckCircle className="w-3.5 h-3.5" />}
                                              {file.status === 'versioned' && <GitBranch className="w-3.5 h-3.5" />}
                                              {file.status === 'processing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                              {file.status === 'duplicate' && <Copy className="w-3.5 h-3.5" />}
                                              {file.status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                                              {file.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                                              {isCancelledFile && <Ban className="w-3.5 h-3.5" />}
                                              {isUnknownStatusFile && <HelpCircle className="w-3.5 h-3.5" />}
                                            </div>
                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                              <div className="tf-row-name truncate">{file.fileName}</div>
                                              <div className="tf-meta mt-0.5 truncate">
                                                {file.status === 'completed' && (file.candidateName || 'Uploaded successfully')}
                                                {file.status === 'versioned' && (file.candidateName ? `${file.candidateName} · version update detected` : 'Version update detected · pending resolution')}
                                                {file.status === 'processing' && 'Processing…'}
                                                {file.status === 'pending' && 'Waiting in queue…'}
                                                {file.status === 'duplicate' && (file.errorMessage || 'Duplicate · already exists')}
                                                {file.status === 'error' && (file.errorMessage || 'Failed to process')}
                                                {isCancelledFile && (file.errorMessage || 'Cancelled before processing')}
                                                {isUnknownStatusFile && `Unrecognised status: ${String(file.status)}`}
                                              </div>
                                            </div>
                                            {/* Status Badge */}
                                            <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium flex-shrink-0 ${
                                              file.status === 'completed' ? 'bg-success-subtle text-success' :
                                              file.status === 'versioned' ? 'bg-brand-blue-2/10 text-brand-blue-2' :
                                              file.status === 'processing' ? 'bg-brand-blue/10 text-brand-blue' :
                                              file.status === 'duplicate' ? 'bg-brand-orange/10 text-brand-orange-deep' :
                                              file.status === 'error' ? 'bg-destructive-subtle text-destructive' :
                                              isUnknownStatusFile ? 'bg-amber-100 text-amber-800' :
                                              'bg-gray-100 text-gray-600'
                                            }`}>
                                              {file.status === 'completed' ? 'Done' :
                                               file.status === 'versioned' ? 'Version' :
                                               file.status === 'processing' ? 'Running' :
                                               file.status === 'duplicate' ? 'Duplicate' :
                                               file.status === 'error' ? 'Failed' :
                                               file.status === 'cancelled' ? 'Cancelled' :
                                               file.status === 'discarded' ? 'Discarded' :
                                               file.status === 'pending' ? 'Queued' :
                                               /* Never claim "Queued" for a status we don't understand —
                                                  that is exactly how 77 cancelled files read as queued. */
                                               String(file.status ?? 'unknown')}
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
                                                  className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors ${retryingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-brand-blue hover:bg-brand-blue/10'}`}
                                                  aria-label="Retry this file" title={file.status === 'cancelled' ? 'Re-queue this cancelled file' : 'Retry this file'}
                                                >
                                                  <RefreshCw className={`w-3.5 h-3.5 ${retryingItems.has(file.id) ? 'animate-spin' : ''}`} />
                                                </button>
                                                {file.status === 'pending' && (
                                                  <button
                                                    disabled={cancellingItems.has(file.id)}
                                                    onClick={(e) => handleCancelItem(record.id, file.id, file.fileName, e)}
                                                    className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors ${cancellingItems.has(file.id) ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-destructive hover:bg-destructive-subtle'}`}
                                                    aria-label="Cancel this file (queued only)" title="Cancel this file (queued only)"
                                                  >
                                                    <X className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                        })}
                                      </div>
                                      </>)}
                                    </div>
                                    ) : uploadHistoryFilter ? (
                                      <div className="mt-4 border-t border-gray-100 pt-4 px-4 sm:px-5">
                                        <p className="tf-hint text-center py-3">No {
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
                      <span className="text-sm font-semibold text-brand-blue-2">
                        {selectedVersionedItems.size} versioned resume{selectedVersionedItems.size !== 1 ? 's' : ''} selected
                      </span>
                      <p className="text-xs text-brand-blue-2/80">Choose how to resolve these version conflicts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedVersionedItems(new Map())}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setIsBulkResolveModalOpen(true)}
                      className="tf-btn tf-btn-primary flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue-2/25 ring-1 ring-white/10 flex gap-1.5 sm:gap-2 whitespace-normal"
                    >
                      <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Resolve ({selectedVersionedItems.size})
                    </button>
                  </div>
                </div>
              )}

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
