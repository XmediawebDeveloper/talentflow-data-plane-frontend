'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { emitBackgroundWork } from '@/lib/backgroundWorkEvents';
import { getTokens } from '@/lib/services/api';
import { scoringService, normalizeScoringStatus, type BatchScoringStatus, type MyScoringBatch } from '@/lib/services/scoringService';

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
  /** Picked up from the server (GET /scoring/batches/mine) rather than started
   *  in this browser — so no page here polls it; the provider does. */
  serverTracked?: boolean;
  /** When the "scored successfully" toast was shown for this run. Saved with
   *  the run, so a reload never shows it again; starting the job again (new
   *  resumes on the same JD, or a new batch) clears it. */
  announcedAt?: string;
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
  /** The signed-in user whose saved runs are now in `activeScoringJobs`
   *  (null until they are read from storage after mount / a user switch).
   *  Until then the list is a placeholder `[]`, not "no runs". */
  restoredFor: string | null;
  /** Record that these runs' finish was announced (see `ScoringJob.announcedAt`). */
  markAnnounced: (jobIds: string[]) => void;

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

/* Saved per signed-in user. The old single key was shared by everyone who used
   the browser, so the next user to sign in saw the previous user's runs. */
const LEGACY_STORAGE_KEY = 'scoring_progress_state';
const storageKey = (identity: string) => `${LEGACY_STORAGE_KEY}:${identity}`;

/** How long a finished run stays available in the corner before it is forgotten. */
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

/** How often the server is asked for this user's running batches — only while
    a run is going. With nothing running, the corner asks once on load and on
    tab focus (at most every FOCUS_SYNC_MIN_MS) to pick up a run started on
    another device; a 15s poll on every page for no run cost a round trip each. */
const SERVER_SYNC_MS = 15000;
const FOCUS_SYNC_MIN_MS = 30000;
/** Cap on remembered "removed from the corner" batch ids. */
const MAX_DISMISSED = 200;

/** `tenant:user` from the access token, or null when signed out. */
const readIdentity = (): string | null => {
  const token = getTokens().accessToken;
  if (!token) return null;
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string; tenant_id?: string };
    return json.sub ? `${json.tenant_id ?? ''}:${json.sub}` : null;
  } catch {
    return null;
  }
};

const isJobActive = (job: ScoringJob) => job.queued > 0 || job.processing > 0;

/** Backend match_status → the progress row's verdict (drives Exact Match counts). */
export function toMatchResult(status?: string): ScoringProgressItem['matchResult'] {
  if (!status) return undefined;
  const s = status.toLowerCase().replace(/_/g, ' ').trim();
  if (s === 'exact match' || s === 'excellent') return 'Exact Match';
  if (s === 'partial match' || s === 'partial') return 'Partial Match';
  return 'No Match';
}

/** A server batch snapshot → the corner widget's job (keyed by batch id, like trackScoringBatch). */
function jobFromServer(status: BatchScoringStatus, summary?: MyScoringBatch, existing?: ScoringJob): Omit<ScoringJob, 'startedAt'> & { startedAt?: string } {
  const jobTitle = status.jd_title || summary?.jd_title || existing?.jobTitle || 'Resume Scoring';
  const items: ScoringProgressItem[] = (status.items || []).map(item => {
    const s = (item.status || '').toLowerCase();
    const norm = normalizeScoringStatus(item.status);
    const st: ScoringProgressItem['status'] = s === 'cancelled' ? 'Cancelled'
      : norm === 'completed' ? 'Scored successfully'
      : norm === 'failed' ? 'Failed'
      : norm === 'processing' ? 'Scoring in progress'
      : 'Queued';
    return {
      id: `${status.batch_id}-${item.resume_id}`,
      resumeId: item.resume_id,
      candidateName: item.candidate_name || 'Unknown',
      jobTitle,
      jobId: status.jd_id,
      source: 'Internal DB',
      status: st,
      score: item.overall_score,
      overallRating10: item.overall_rating_10,
      matchResult: st === 'Scored successfully' ? toMatchResult(item.match_status) : undefined,
      errorReason: item.error_message,
    };
  });
  return {
    jobId: status.batch_id,
    batchId: status.batch_id,
    jobTitle,
    total: status.total || items.length,
    queued: status.queued,
    processing: status.processing,
    completed: status.completed,
    failed: status.failed,
    items,
    returnUrl: existing?.returnUrl || `/recruitment/resume-scoring?jd_id=${status.jd_id}`,
    jobCode: summary?.jd_job_id || existing?.jobCode,
    jobVersion: summary?.jd_version_number ?? existing?.jobVersion,
    startedAt: status.created_at || summary?.created_at,
    serverTracked: true,
  };
}

const ScoringProgressContext = createContext<ScoringProgressContextType | undefined>(undefined);

export function ScoringProgressProvider({ children }: { children: React.ReactNode }) {
  const [activeScoringJobs, setActiveScoringJobs] = useState<ScoringJob[]>([]);
  const [isMinimized, setIsMinimized] = useState(true);

  /* Tell the pages when a run scores more resumes or finishes, so Scored /
     result counts re-read as it happens (lib/backgroundWorkEvents). The first
     sight of a run only records it. */
  const seenScoring = useRef<Map<string, { completed: number; active: boolean }>>(new Map());
  useEffect(() => {
    for (const job of activeScoringJobs) {
      const active = job.queued > 0 || job.processing > 0;
      const before = seenScoring.current.get(job.jobId);
      seenScoring.current.set(job.jobId, { completed: job.completed, active });
      if (!before) continue;
      const finished = before.active && !active;
      if (job.completed > before.completed || finished) emitBackgroundWork({ kind: 'scoring', jdId: job.jobId, finished });
    }
  }, [activeScoringJobs]);
  // Ref-counted by owner id (see `setPanelVisibility` on the context type for
  // why this isn't a single shared boolean anymore).
  const [openPanelOwners, setOpenPanelOwners] = useState<Set<string>>(new Set());
  const isMainPanelOpen = openPanelOwners.size > 0;
  const [onRestorePanel, setOnRestorePanelState] = useState<(() => void) | undefined>(undefined);

  /* Who is signed in. Read after mount (client-only) and again on every route
     change and tab focus — sign-in / sign-out swaps the list for that user's. */
  const [identity, setIdentity] = useState<string | null>(null);
  /** The identity whose saved list is currently loaded (null = none yet). */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const identityRef = useRef<string | null>(null);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  const pathname = usePathname();
  const checkIdentity = useCallback(() => {
    const next = readIdentity();
    setIdentity(prev => (prev === next ? prev : next));
  }, []);
  useEffect(() => {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkIdentity();
    const onFocus = () => checkIdentity();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [checkIdentity]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { checkIdentity(); }, [pathname, checkIdentity]);

  /* Batches the user removed from the corner — never re-added by the server
     sync while they are still running. */
  const dismissedRef = useRef<string[]>([]);
  const dismiss = useCallback((jobs: ScoringJob[]) => {
    const ids = jobs.flatMap(j => [j.jobId, j.batchId].filter(Boolean) as string[]);
    if (!ids.length) return;
    dismissedRef.current = [...dismissedRef.current.filter(id => !ids.includes(id)), ...ids].slice(-MAX_DISMISSED);
  }, []);

  // Load this user's saved state whenever the signed-in user changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setActiveScoringJobs([]);
    dismissedRef.current = [];
    seenScoring.current = new Map();
    if (!identity) {
      setLoadedFor(null);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey(identity));
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
        if (Array.isArray(parsed.dismissed)) dismissedRef.current = parsed.dismissed.slice(-MAX_DISMISSED);
      }
    } catch (error) {
      console.error('[ScoringProgressContext] Error loading from localStorage:', error);
    }
    setLoadedFor(identity);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [identity]);

  // Save state to localStorage (under this user's key) whenever it changes
  useEffect(() => {
    if (!identity || loadedFor !== identity) return;

    try {
      localStorage.setItem(storageKey(identity), JSON.stringify({
        activeScoringJobs,
        isMinimized,
        dismissed: dismissedRef.current,
      }));
    } catch (error) {
      console.error('[ScoringProgressContext] Error saving to localStorage:', error);
    }
  }, [activeScoringJobs, isMinimized, identity, loadedFor]);

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
        // A new round of scoring: its finish is announced afresh.
        announcedAt: undefined,
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
      const sameBatch = !incoming.batchId || !existing?.batchId || incoming.batchId === existing.batchId;
      const next: ScoringJob = {
        ...incoming,
        batchId: incoming.batchId ?? existing?.batchId,
        startedAt: existing?.startedAt || incoming.startedAt || new Date().toISOString(),
        // A snapshot of the same run keeps "already announced"; a new batch does not.
        announcedAt: sameBatch ? existing?.announcedAt : undefined,
      };
      if (!existing) return [...prev, next];
      return prev.map(job => (job.jobId === incoming.jobId ? next : job));
    });
  }, []);

  const markAnnounced = useCallback((jobIds: string[]) => {
    if (!jobIds.length) return;
    const at = new Date().toISOString();
    setActiveScoringJobs(prev => prev.map(job =>
      jobIds.includes(job.jobId) && !job.announcedAt ? { ...job, announcedAt: at } : job));
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
    setActiveScoringJobs(prev => {
      dismiss(prev.filter(job => !isJobActive(job)));
      return prev.filter(isJobActive);
    });
  }, [dismiss]);

  const clearJob = useCallback((jobId: string) => {
    setActiveScoringJobs(prev => {
      dismiss(prev.filter(job => job.jobId === jobId));
      return prev.filter(job => job.jobId !== jobId);
    });
  }, [dismiss]);

  /* Server sync: the runs this user has going, from ANY browser or device.
     Without it the corner only knew runs started in this browser (they lived
     in localStorage alone), so the same login in Firefox or on another laptop
     showed no icon. Runs started here keep their own page pollers; the ones
     picked up from the server (`serverTracked`) are polled here until done. */
  const jobsRef = useRef(activeScoringJobs);
  useEffect(() => { jobsRef.current = activeScoringJobs; }, [activeScoringJobs]);
  const syncBusy = useRef(false);
  const lastPullAt = useRef(0);
  const pullServerJobs = useCallback(async () => {
    const who = identityRef.current;
    if (!who || loadedFor !== who || syncBusy.current || !getTokens().accessToken) return;
    syncBusy.current = true;
    lastPullAt.current = Date.now();
    try {
      const running = await scoringService.getMyBatches({ status: 'active', page_size: 50 });
      const current = jobsRef.current;
      const known = new Set<string>();
      current.forEach(j => { known.add(j.jobId); if (j.batchId) known.add(j.batchId); });
      // A run this browser tracks by its JD (the ?batch_id= handoff) — don't add it twice.
      const runningJds = new Set(current.filter(isJobActive).map(j => j.jobId));
      const dismissed = new Set(dismissedRef.current);
      const summaries = new Map(running.map(b => [b.batch_id, b]));

      const adopt = running.filter(b => !known.has(b.batch_id) && !runningJds.has(b.jd_id) && !dismissed.has(b.batch_id));
      const follow = current.filter(j => j.serverTracked && j.batchId && isJobActive(j));
      const ids = [...new Set([...adopt.map(b => b.batch_id), ...follow.map(j => j.batchId as string)])];
      if (!ids.length) return;

      const results = await Promise.allSettled(ids.map(id => scoringService.getBatchStatus(id)));
      if (identityRef.current !== who) return; // signed out / switched user meanwhile
      results.forEach(r => {
        if (r.status !== 'fulfilled' || !r.value?.batch_id) return;
        const status = r.value;
        if (dismissedRef.current.includes(status.batch_id)) return;
        const existing = jobsRef.current.find(j => j.jobId === status.batch_id);
        syncScoringJob(jobFromServer(status, summaries.get(status.batch_id), existing));
      });
    } catch (error) {
      // Offline / signed out: the next round retries.
      console.warn('[ScoringProgressContext] Server sync failed:', error);
    } finally {
      syncBusy.current = false;
    }
  }, [loadedFor, syncScoringJob]);

  // Once per sign-in, then on focus — throttled, since focus and
  // visibilitychange both fire on one tab switch.
  useEffect(() => {
    if (!identity || loadedFor !== identity) return;
    void pullServerJobs();
    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastPullAt.current < FOCUS_SYNC_MIN_MS) return;
      void pullServerJobs();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [identity, loadedFor, pullServerJobs]);

  // The steady poll runs only while a run is going (started here or picked up).
  useEffect(() => {
    if (!identity || loadedFor !== identity || !hasActiveScoring) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') void pullServerJobs();
    }, SERVER_SYNC_MS);
    return () => clearInterval(t);
  }, [identity, loadedFor, hasActiveScoring, pullServerJobs]);

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

  const restoredFor = identity && loadedFor === identity ? identity : null;

  const contextValue = useMemo<ScoringProgressContextType>(() => ({
    activeScoringJobs,
    isMinimized,
    hasActiveScoring,
    isMainPanelOpen,
    restoredFor,
    markAnnounced,
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
    restoredFor,
    markAnnounced,
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
