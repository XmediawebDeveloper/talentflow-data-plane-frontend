'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { bulkInviteService, isBulkInviteActive, type BulkInviteJob } from '@/lib/services/bulkInviteService';

/**
 * The Create / Send bulk runs this browser started (or picked up), polled
 * while they run so a progress widget can follow them after the popup that
 * started them has closed — the same job the ScoringProgressProvider does for
 * bulk scoring. The backend owns the run; this only mirrors its counts.
 *
 * Kept in localStorage so a reload, or the same job opened in another tab,
 * carries on from the server's current state rather than forgetting the run.
 */

export interface TrackedBulkInvite extends BulkInviteJob {
  /** Where it was started from — the popup's job, for the widget's title. */
  jdTitle?: string;
  jdCode?: string;
  /** When this browser first saw it; the widget drops finished runs after a day. */
  trackedAt: string;
  /** Finished and acknowledged in the widget. */
  dismissed?: boolean;
}

interface BulkInviteProgressContextType {
  jobs: TrackedBulkInvite[];
  activeJobs: TrackedBulkInvite[];
  /** Start following a run (right after POST /bulk-invites returns). */
  track: (job: BulkInviteJob, meta?: { jdTitle?: string; jdCode?: string }) => void;
  /** Apply a fresher snapshot (a panel that polls on its own hands them in). */
  sync: (job: BulkInviteJob) => void;
  dismiss: (jobId: string) => void;
  /** The job id a results view should open, if any, and who sets it. */
  openResultsFor: string | null;
  setOpenResultsFor: (jobId: string | null) => void;
}

const STORAGE_KEY = 'bulk_invite_progress_state';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 2500;

const BulkInviteProgressContext = createContext<BulkInviteProgressContextType | undefined>(undefined);

const readStored = (): TrackedBulkInvite[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { jobs?: TrackedBulkInvite[] };
    const cutoff = Date.now() - RETENTION_MS;
    return (parsed.jobs || []).filter((j) => {
      const t = new Date(j.trackedAt).getTime();
      return Number.isFinite(t) && t >= cutoff && j.job_id;
    });
  } catch {
    return [];
  }
};

export function BulkInviteProgressProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<TrackedBulkInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openResultsFor, setOpenResultsFor] = useState<string | null>(null);

  useEffect(() => {
    // Read after mount on purpose: localStorage is client-only, and reading
    // it in the initialiser would hydrate a widget the server never rendered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobs(readStored());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobs }));
    } catch {
      /* storage blocked: the widget still works for this page's lifetime */
    }
  }, [jobs, loaded]);

  // Another tab started or finished a run: pick it up.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setJobs(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const upsert = useCallback((job: BulkInviteJob, meta?: { jdTitle?: string; jdCode?: string }) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.job_id === job.job_id);
      if (idx === -1) {
        return [{ ...job, ...meta, trackedAt: new Date().toISOString() }, ...prev];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...job, ...(meta || {}) };
      return next;
    });
  }, []);

  const track = useCallback((job: BulkInviteJob, meta?: { jdTitle?: string; jdCode?: string }) => upsert(job, meta), [upsert]);
  const sync = useCallback((job: BulkInviteJob) => upsert(job), [upsert]);
  const dismiss = useCallback((jobId: string) => {
    setJobs((prev) => prev.map((j) => (j.job_id === jobId ? { ...j, dismissed: true } : j)));
  }, []);

  const activeJobs = useMemo(() => jobs.filter(isBulkInviteActive), [jobs]);

  /* One poll loop for every active run, whichever page is open. A page's own
     panel may poll the same job faster; both write through `upsert`, so the
     newest snapshot wins either way. */
  const activeIds = activeJobs.map((j) => j.job_id).join(',');
  const polling = useRef(false);
  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false;
    const tick = async () => {
      if (polling.current || document.visibilityState === 'hidden') return;
      polling.current = true;
      try {
        await Promise.all(activeIds.split(',').map(async (id) => {
          try {
            const fresh = await bulkInviteService.get(id);
            if (!cancelled) upsert(fresh);
          } catch {
            /* transient: the next tick retries */
          }
        }));
      } finally {
        polling.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeIds, upsert]);

  const value = useMemo<BulkInviteProgressContextType>(() => ({
    jobs, activeJobs, track, sync, dismiss, openResultsFor, setOpenResultsFor,
  }), [jobs, activeJobs, track, sync, dismiss, openResultsFor]);

  return <BulkInviteProgressContext.Provider value={value}>{children}</BulkInviteProgressContext.Provider>;
}

export function useBulkInviteProgress(): BulkInviteProgressContextType {
  const ctx = useContext(BulkInviteProgressContext);
  if (!ctx) throw new Error('useBulkInviteProgress must be used within a BulkInviteProgressProvider');
  return ctx;
}

/** The same hook where the provider may be absent (tests, public pages). */
export function useOptionalBulkInviteProgress(): BulkInviteProgressContextType | null {
  return useContext(BulkInviteProgressContext) ?? null;
}
