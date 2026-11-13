'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export interface ScoringProgressItem {
  id: string;
  resumeId: string;
  /** Which version of the resume this run scores — the one the recruiter picked. */
  resumeVersion?: number;
  candidateName: string;
  jobTitle: string;
  jobId: string;
  source: 'Internal DB' | 'My Resumes';
  /** 'Cancelled': stopped while still waiting (Cancel / Cancel all) — settled, never charged. */
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed' | 'Cancelled';
  errorReason?: string;
  scoredDateTime?: string;
  matchResult?: 'Exact Match' | 'Partial Match' | 'No Match';
  score?: number;
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating shown instead of `score`(%) wherever this item is rendered.
  overallRating10?: number;
}

export interface ScoringJob {
  jobId: string;
  jobTitle: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  startedAt: string;
  items: ScoringProgressItem[];
  returnUrl?: string;
  /** The job's JD ID ("JD-352") and version, for the corner widget's rows. */
  jobCode?: string;
  jobVersion?: number;
  /** Say when the run finishes (toast + View Results) — a run started in the
   *  background from a page that keeps the recruiter where they are. */
  announce?: boolean;
  /** The Celery scoring batch behind the run (latest one, for a JD-keyed
   *  job) — lets the popup Cancel / Retry it. */
  batchId?: string;
}

/** Optional details a run can be started with. */
export interface ScoringJobMeta {
  jobCode?: string;
  jobVersion?: number;
  announce?: boolean;
  batchId?: string;
}

interface ScoringProgressContextType {
  // State
  activeScoringJobs: ScoringJob[];
  isMinimized: boolean;
  hasActiveScoring: boolean;
  isMainPanelOpen: boolean;  // True when center panel is visible (not minimized)

  // Actions
  startScoringJob: (jobId: string, jobTitle: string, items: Omit<ScoringProgressItem, 'status'>[], returnUrl?: string, meta?: ScoringJobMeta) => void;
  /**
   * Upsert a whole job from a progress snapshot.
   *
   * `startScoringJob` is for a run this tab is DISPATCHING — it resets every
   * item to Queued. A run that arrives already in flight (the `?batch_id=`
   * handoff from My Resumes, Resume Database or AI Talent Match, polled by the
   * route) has to report its real counts instead, and re-report them on every
   * poll, so calling that would peg the widget at 0% forever.
   *
   * One state write per tick, deliberately: syncing such a run through
   * `updateItemStatus` would be one write per resume per tick, which for a
   * few hundred resumes is a few hundred renders every two seconds.
   */
  syncScoringJob: (job: Omit<ScoringJob, 'startedAt'> & { startedAt?: string }) => void;
  updateItemStatus: (jobId: string, itemId: string, status: ScoringProgressItem['status'], result?: Partial<ScoringProgressItem>) => void;
  clearCompletedJobs: () => void;
  clearJob: (jobId: string) => void;
  setMinimized: (minimized: boolean) => void;
  /**
   * Register/unregister this caller's own "a progress panel is visibly open"
   * state, keyed by a caller-supplied owner id (use `useId()` so concurrent
   * instances of the same component never collide).
   *
   * Three independent components (ResumeScoringPage, SelectSourceModal,
   * ResumeScoringStatusPanel) each show their own BulkScoringProgressModal /
   * status panel and each need to hide the global floating widget while
   * theirs is on screen. They used to all call a single shared
   * `setMainPanelOpen(open)` boolean directly — whichever one last ran its
   * effect won, so one component's "my panel just closed" could silently
   * clobber another's still-open panel and let the global widget and a real
   * popup render at the same time (or leave the widget wrongly hidden after
   * navigating away). Ref-counting by owner id means `isMainPanelOpen` is
   * true whenever ANY owner reports open, regardless of the others' timing.
   */
  setPanelVisibility: (ownerId: string, open: boolean) => void;
  getJobProgress: (jobId: string) => ScoringJob | undefined;
  onRestorePanel?: () => void;  // Callback to restore minimized panel
  setOnRestorePanel: (callback: (() => void) | undefined) => void;
}

const STORAGE_KEY = 'scoring_progress_state';

/** How long a finished run stays available in the corner before it is forgotten. */
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

const ScoringProgressContext = createContext<ScoringProgressContextType | undefined>(undefined);

export function ScoringProgressProvider({ children }: { children: React.ReactNode }) {
  const [activeScoringJobs, setActiveScoringJobs] = useState<ScoringJob[]>([]);
  const [isMinimized, setIsMinimized] = useState(true);
  // Ref-counted by owner id (see `setPanelVisibility` on the context type for
  // why this isn't a single shared boolean anymore).
  const [openPanelOwners, setOpenPanelOwners] = useState<Set<string>>(new Set());
  const isMainPanelOpen = openPanelOwners.size > 0;
  const [onRestorePanel, setOnRestorePanelState] = useState<(() => void) | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        /* Finished runs are KEPT. The corner button is meant to stay put until
           the recruiter dismisses it, and dropping every job with nothing left
           running meant a completed run vanished on the next page load — taking
           the only way back to its results with it.

           The one thing still dropped is a run old enough that nobody is coming
           back to it, so a forgotten job cannot haunt the corner indefinitely. */
        const cutoff = Date.now() - JOB_RETENTION_MS;
        const activeJobs = (parsed.activeScoringJobs || []).filter((job: ScoringJob) => {
          if (job.queued > 0 || job.processing > 0) return true;
          const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : 0;
          return startedAt > cutoff;
        });
        setActiveScoringJobs(activeJobs);
        setIsMinimized(parsed.isMinimized ?? true);
      }
    } catch (error) {
      console.error('[ScoringProgressContext] Error loading from localStorage:', error);
    }
    setIsInitialized(true);
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!isInitialized) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeScoringJobs,
        isMinimized
      }));
    } catch (error) {
      console.error('[ScoringProgressContext] Error saving to localStorage:', error);
    }
  }, [activeScoringJobs, isMinimized, isInitialized]);

  const hasActiveScoring = activeScoringJobs.some(job => job.queued > 0 || job.processing > 0);

  const startScoringJob = useCallback((jobId: string, jobTitle: string, items: Omit<ScoringProgressItem, 'status'>[], returnUrl?: string, meta?: ScoringJobMeta) => {
    const newItems: ScoringProgressItem[] = items.map(item => ({ ...item, status: 'Queued' as const }));

    setActiveScoringJobs(prev => {
      const existingIndex = prev.findIndex(j => j.jobId === jobId);
      if (existingIndex < 0) {
        const newJob: ScoringJob = {
          jobId,
          jobTitle,
          total: newItems.length,
          queued: newItems.length,
          processing: 0,
          completed: 0,
          failed: 0,
          startedAt: new Date().toISOString(),
          items: newItems,
          returnUrl,
          ...meta,
        };
        return [...prev, newJob];
      }

      /* Merge into the EXISTING job rather than replacing it outright.
         Scoring a second resume against the same JD later in the same
         session calls this again for the same `jobId` — replacing the whole
         job object wiped out every item from the first run, which is why the
         popup showed only the newest resume and the previous one's row
         vanished. Items already tracked are kept; a re-registered item id
         (same resume, re-scored) is reset to Queued via the later `set()`
         call overwriting the earlier one. */
      const existing = prev[existingIndex];
      // Defensive: a job persisted to localStorage by an older build, or one
      // left in a partial state, might not have a well-formed `items` array —
      // `.map` on that would throw synchronously inside this state updater
      // and silently abort whatever else the caller does after this call.
      const itemMap = new Map((Array.isArray(existing.items) ? existing.items : []).map(item => [item.id, item]));
      newItems.forEach(item => itemMap.set(item.id, item));
      const mergedItems = Array.from(itemMap.values());

      const merged: ScoringJob = {
        ...existing,
        jobTitle,
        items: mergedItems,
        total: mergedItems.length,
        queued: mergedItems.filter(i => i.status === 'Queued').length,
        processing: mergedItems.filter(i => i.status === 'Scoring in progress').length,
        completed: mergedItems.filter(i => i.status === 'Scored successfully').length,
        failed: mergedItems.filter(i => i.status === 'Failed').length,
        returnUrl: returnUrl || existing.returnUrl,
        ...meta,
      };
      const updated = [...prev];
      updated[existingIndex] = merged;
      return updated;
    });

    // Show the progress indicator when starting a new job
    setIsMinimized(false);
  }, []);

  const syncScoringJob = useCallback((incoming: Omit<ScoringJob, 'startedAt'> & { startedAt?: string }) => {
    setActiveScoringJobs(prev => {
      const existing = prev.find(j => j.jobId === incoming.jobId);
      /* `startedAt` is kept from the first sighting — it is what the retention
         window ages a finished run out on, and taking it from each snapshot
         would keep pushing that expiry forward. */
      const next: ScoringJob = {
        ...incoming,
        batchId: incoming.batchId ?? existing?.batchId,
        startedAt: existing?.startedAt || incoming.startedAt || new Date().toISOString(),
      };
      if (!existing) return [...prev, next];
      return prev.map(job => (job.jobId === incoming.jobId ? next : job));
    });
  }, []);

  const updateItemStatus = useCallback((
    jobId: string,
    itemId: string,
    status: ScoringProgressItem['status'],
    result?: Partial<ScoringProgressItem>
  ) => {
    setActiveScoringJobs(prev => {
      return prev.map(job => {
        if (job.jobId !== jobId) return job;

        const updatedItems = job.items.map(item => {
          if (item.id !== itemId) return item;
          return { ...item, status, ...result };
        });

        // Recalculate counts
        const queued = updatedItems.filter(i => i.status === 'Queued').length;
        const processing = updatedItems.filter(i => i.status === 'Scoring in progress').length;
        const completed = updatedItems.filter(i => i.status === 'Scored successfully').length;
        const failed = updatedItems.filter(i => i.status === 'Failed').length;

        return {
          ...job,
          items: updatedItems,
          queued,
          processing,
          completed,
          failed
        };
      });
    });
  }, []);

  const clearCompletedJobs = useCallback(() => {
    setActiveScoringJobs(prev => prev.filter(job => job.queued > 0 || job.processing > 0));
  }, []);

  const clearJob = useCallback((jobId: string) => {
    setActiveScoringJobs(prev => prev.filter(job => job.jobId !== jobId));
  }, []);

  const setMinimized = useCallback((minimized: boolean) => {
    setIsMinimized(minimized);
  }, []);

  const getJobProgress = useCallback((jobId: string) => {
    return activeScoringJobs.find(job => job.jobId === jobId);
  }, [activeScoringJobs]);

  const setPanelVisibility = useCallback((ownerId: string, open: boolean) => {
    setOpenPanelOwners(prev => {
      const has = prev.has(ownerId);
      if (open === has) return prev; // no-op — keep the same Set reference
      const next = new Set(prev);
      if (open) next.add(ownerId); else next.delete(ownerId);
      return next;
    });
  }, []);

  const setOnRestorePanel = useCallback((callback: (() => void) | undefined) => {
    setOnRestorePanelState(() => callback);
  }, []);

  const contextValue = useMemo<ScoringProgressContextType>(() => ({
    activeScoringJobs,
    isMinimized,
    hasActiveScoring,
    isMainPanelOpen,
    startScoringJob,
    syncScoringJob,
    updateItemStatus,
    clearCompletedJobs,
    clearJob,
    setMinimized,
    setPanelVisibility,
    getJobProgress,
    onRestorePanel,
    setOnRestorePanel
  }), [
    activeScoringJobs,
    isMinimized,
    hasActiveScoring,
    isMainPanelOpen,
    startScoringJob,
    syncScoringJob,
    updateItemStatus,
    clearCompletedJobs,
    clearJob,
    setMinimized,
    setPanelVisibility,
    getJobProgress,
    onRestorePanel,
    setOnRestorePanel
  ]);

  return (
    <ScoringProgressContext.Provider value={contextValue}>
      {children}
    </ScoringProgressContext.Provider>
  );
}

export function useScoringProgress() {
  const context = useContext(ScoringProgressContext);
  if (!context) {
    throw new Error('useScoringProgress must be used within a ScoringProgressProvider');
  }
  return context;
}

export default ScoringProgressContext;
