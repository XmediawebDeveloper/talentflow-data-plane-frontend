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
}

interface ScoringProgressContextType {
  // State
  activeScoringJobs: ScoringJob[];
  isMinimized: boolean;
  hasActiveScoring: boolean;
  isMainPanelOpen: boolean;  // True when center panel is visible (not minimized)

  // Actions
  startScoringJob: (jobId: string, jobTitle: string, items: Omit<ScoringProgressItem, 'status'>[]) => void;
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
        // Filter out jobs that are fully completed (no queued or processing items)
        const activeJobs = (parsed.activeScoringJobs || []).filter((job: ScoringJob) =>
          job.queued > 0 || job.processing > 0
        );
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

  const startScoringJob = useCallback((jobId: string, jobTitle: string, items: Omit<ScoringProgressItem, 'status'>[]) => {
    const newJob: ScoringJob = {
      jobId,
      jobTitle,
      total: items.length,
      queued: items.length,
      processing: 0,
      completed: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      items: items.map(item => ({ ...item, status: 'Queued' as const }))
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
