'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface ScoringProgressItem {
  id: string;
  resumeId: string;
  candidateName: string;
  jobTitle: string;
  jobId: string;
  source: 'Internal DB' | 'My Resumes';
  status: 'Queued' | 'Scoring in progress' | 'Scored successfully' | 'Failed';
  errorReason?: string;
  scoredDateTime?: string;
  matchResult?: 'Exact Match' | 'Partial Match' | 'No Match';
  score?: number;
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
}

interface ScoringProgressContextType {
  // State
  activeScoringJobs: ScoringJob[];
  isMinimized: boolean;
  hasActiveScoring: boolean;
  isMainPanelOpen: boolean;  // True when center panel is visible (not minimized)

  // Actions
  startScoringJob: (jobId: string, jobTitle: string, items: Omit<ScoringProgressItem, 'status'>[], returnUrl?: string) => void;
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
  setMainPanelOpen: (open: boolean) => void;  // Track main panel visibility
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
  const [isMainPanelOpen, setIsMainPanelOpen] = useState(false);  // Track if center panel is open
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

  const startScoringJob = useCallback((jobId: string, jobTitle: string, items: Omit<ScoringProgressItem, 'status'>[], returnUrl?: string) => {
    const newJob: ScoringJob = {
      jobId,
      jobTitle,
      total: items.length,
      queued: items.length,
      processing: 0,
      completed: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      items: items.map(item => ({ ...item, status: 'Queued' as const })),
      returnUrl,
    };

    setActiveScoringJobs(prev => {
      // Check if job already exists, update it
      const existingIndex = prev.findIndex(j => j.jobId === jobId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newJob;
        return updated;
      }
      return [...prev, newJob];
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

  const setMainPanelOpenFn = useCallback((open: boolean) => {
    setIsMainPanelOpen(open);
  }, []);

  const setOnRestorePanel = useCallback((callback: (() => void) | undefined) => {
    setOnRestorePanelState(() => callback);
  }, []);

  return (
    <ScoringProgressContext.Provider value={{
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
      setMainPanelOpen: setMainPanelOpenFn,
      getJobProgress,
      onRestorePanel,
      setOnRestorePanel
    }}>
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
