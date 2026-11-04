'use client';

import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { bulkInviteService, isBulkInviteActive, type BulkInviteJob } from '@/lib/services/bulkInviteService';
import { getTokens } from '@/lib/services/api';

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
  /** The job version and the assessment / interview version sent, for the
   *  results popup's header ("JD-343 Senior AI Engineer V1 - Assessment V1"). */
  jobVersion?: number;
  versionNumber?: number;
  /** When this browser first saw it; the widget drops finished runs after a day. */
  trackedAt: string;
  /** Finished and acknowledged in the widget. */
  dismissed?: boolean;
}

/** What the starting popup knows about the send that the job record does not. */
type TrackMeta = Pick<TrackedBulkInvite, 'jdTitle' | 'jdCode' | 'jobVersion' | 'versionNumber'>;

/** The floating widget: hidden, the round icon, or the mini popup open. */
export type BulkInviteWidgetView = 'hidden' | 'icon' | 'mini';

interface BulkInviteProgressContextType {
  jobs: TrackedBulkInvite[];
  activeJobs: TrackedBulkInvite[];
  /** Start following a run (right after POST /bulk-invites returns). */
  track: (job: BulkInviteJob, meta?: TrackMeta) => void;
  /** Apply a fresher snapshot (a panel that polls on its own hands them in). */
  sync: (job: BulkInviteJob) => void;
  /** Drops runs from the widget's list. Never cancels a send. */
  dismiss: (jobId: string | string[]) => void;
  /** Runs whose own invite popup is open right now. The widget leaves these
   *  out (that popup shows them) and does not poll them (its panel does). */
  inPopupIds: ReadonlySet<string>;
  /** The invite popup showing this run opened (true) or closed (false). On
   *  close the run moves to the widget — finished or not, so its outcome can
   *  still be read there until the recruiter clears it. */
  setInPopup: (jobId: string, open: boolean) => void;
  /** Which form the widget is in. Minimize → 'icon'; a popup's Close /
   *  Done → 'mini'; the mini popup's ✕ → 'icon'. */
  widget: BulkInviteWidgetView;
  setWidget: (view: BulkInviteWidgetView) => void;
  /** The job id a results view should open, if any, and who sets it. */
  openResultsFor: string | null;
  setOpenResultsFor: (jobId: string | null) => void;
}

const STORAGE_KEY = 'bulk_invite_progress_state';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 2500;
/* A run still 'queued' after this long has no worker on it: poll it every
   STALE_POLL_MS instead, so two stuck jobs do not keep hitting the API. */
const STALE_AFTER_MS = 2 * 60 * 1000;
const STALE_POLL_MS = 30 * 1000;

const isStale = (j: BulkInviteJob) => {
  if (j.status !== 'queued' || !j.created_at) return false;
  const t = new Date(j.created_at).getTime();
  return Number.isFinite(t) && Date.now() - t > STALE_AFTER_MS;
};

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
  const [widget, setWidget] = useState<BulkInviteWidgetView>('hidden');

  useEffect(() => {
    // Read after mount on purpose: localStorage is client-only, and reading
    // it in the initialiser would hydrate a widget the server never rendered.
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobs(stored);
    // Runs carried over from before a reload come back as the round icon.
    if (stored.some((j) => !j.dismissed)) setWidget('icon');
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

  const upsert = useCallback((job: BulkInviteJob, meta?: TrackMeta) => {
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

  const track = useCallback((job: BulkInviteJob, meta?: TrackMeta) => upsert(job, meta), [upsert]);
  const sync = useCallback((job: BulkInviteJob) => upsert(job), [upsert]);
  const dismiss = useCallback((jobId: string | string[]) => {
    const ids = new Set(Array.isArray(jobId) ? jobId : [jobId]);
    setJobs((prev) => prev.map((j) => (ids.has(j.job_id) ? { ...j, dismissed: true } : j)));
  }, []);

  const [inPopupIds, setInPopupIds] = useState<ReadonlySet<string>>(() => new Set());
  const setInPopup = useCallback((jobId: string, open: boolean) => {
    setInPopupIds((prev) => {
      if (prev.has(jobId) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(jobId); else next.delete(jobId);
      return next;
    });
    // Handed to the widget: at least the icon, unless a popup asked for more.
    if (!open) setWidget((w) => (w === 'hidden' ? 'icon' : w));
  }, []);

  const activeJobs = useMemo(() => jobs.filter(isBulkInviteActive), [jobs]);

  /* One poll loop for every active run, whichever page is open — except a
     run whose progress panel is on screen (its invite popup, or the results
     popup opened from the widget): that panel polls it and hands each
     snapshot in through `sync`, so the run is never asked for twice. */
  const activeIds = activeJobs.map((j) => j.job_id).join(',');
  const polling = useRef(false);
  const lastPolled = useRef<Record<string, number>>({});
  /* Read through an effect event: the latest jobs, without restarting the
     poll loop on every snapshot. */
  const shouldPoll = useEffectEvent((id: string) => {
    if (inPopupIds.has(id) || openResultsFor === id) return false;
    const known = jobs.find((j) => j.job_id === id);
    const now = Date.now();
    if (known && isStale(known) && now - (lastPolled.current[id] ?? 0) < STALE_POLL_MS) return false;
    lastPolled.current[id] = now;
    return true;
  });
  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false;
    const tick = async () => {
      if (polling.current || document.visibilityState === 'hidden') return;
      /* Mounted app-wide, the login page included. Signed out, a poll only
         401s and raises "Session Expired" — and "Log In Again" reloads the
         login page into the same poll: the popup came back forever. */
      if (!getTokens().accessToken) return;
      polling.current = true;
      try {
        await Promise.all(activeIds.split(',').map(async (id) => {
          if (!shouldPoll(id)) return;
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
    jobs, activeJobs, track, sync, dismiss, inPopupIds, setInPopup, openResultsFor, setOpenResultsFor, widget, setWidget,
  }), [jobs, activeJobs, track, sync, dismiss, inPopupIds, setInPopup, openResultsFor, widget]);

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
