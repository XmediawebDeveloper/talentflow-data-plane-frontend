'use client';

import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { bulkInviteService, isBulkInviteActive, type BulkInviteApiError, type BulkInviteJob } from '@/lib/services/bulkInviteService';
import { getTokens } from '@/lib/services/api';

/**
 * The Create / Send bulk runs of the signed-in user, polled while they run so
 * a progress widget can follow them after the popup that started them has
 * closed — the same job the ScoringProgressProvider does for bulk scoring.
 * The backend owns the run; this only mirrors its counts.
 *
 * Where the list comes from:
 *   - the server's "my sends" (GET /bulk-invites/mine) on load, on sign-in
 *     and every minute — so the widget works on any browser, after clearing
 *     storage, and picks up sends started on another device;
 *   - localStorage, keyed by account + user, for what the server does not
 *     keep: which runs were removed from the widget. Another user signing in
 *     on the same browser never sees this list.
 *
 * Several tabs: only one tab polls (a short lease in localStorage); the
 * others take its snapshots from the storage event and merge them, so a run
 * removed in one tab stays removed in the others.
 */

export interface TrackedBulkInvite extends BulkInviteJob {
  /** Where it was started from — the popup's job, for the widget's title.
   *  Filled from the server's jd_code / jd_title / ... when not given. */
  jdTitle?: string;
  jdCode?: string;
  jobVersion?: number;
  versionNumber?: number;
  /** When this browser first saw it; finished runs drop after a day. */
  trackedAt: string;
  /** Removed from the widget (never cancels a send), and when that last
   *  changed — tabs merge by the later change. */
  dismissed?: boolean;
  dismissedAt?: number;
  /** When this copy was last read from the server — tabs merge by it. */
  syncedAt?: number;
}

/** What the starting popup knows about the send that the job record may not. */
type TrackMeta = Pick<TrackedBulkInvite, 'jdTitle' | 'jdCode' | 'jobVersion' | 'versionNumber'>;

/** The floating widget: hidden, the round icon, or the mini popup open. */
export type BulkInviteWidgetView = 'hidden' | 'icon' | 'mini';

/** Which tab the results popup opens on. */
export type BulkInviteResultsTab = 'all' | 'sent' | 'skipped' | 'failed' | 'remaining';

interface BulkInviteProgressContextType {
  jobs: TrackedBulkInvite[];
  activeJobs: TrackedBulkInvite[];
  /** Start following a run (right after POST /bulk-invites returns). */
  track: (job: BulkInviteJob, meta?: TrackMeta) => void;
  /** Apply a fresher snapshot (a panel that polls on its own hands them in). */
  sync: (job: BulkInviteJob) => void;
  /** Drops runs from the widget's list. Never cancels a send. */
  dismiss: (jobId: string | string[]) => void;
  /** Brings removed runs back into the widget. */
  restore: (jobId: string | string[]) => void;
  /** Runs whose own invite popup is open right now. The widget leaves these
   *  out (that popup shows them) and does not poll them (its panel does). */
  inPopupIds: ReadonlySet<string>;
  setInPopup: (jobId: string, open: boolean) => void;
  /** Which form the widget is in. Minimize → 'icon'; a popup's Close /
   *  Done → 'mini'; the mini popup's ✕ → 'icon'. */
  widget: BulkInviteWidgetView;
  setWidget: (view: BulkInviteWidgetView) => void;
  /** The job id a results view should open, if any, and on which tab. */
  openResultsFor: string | null;
  openResultsTab: BulkInviteResultsTab;
  setOpenResultsFor: (jobId: string | null, tab?: BulkInviteResultsTab) => void;
  /** Re-read "my sends" from the server now. */
  refreshMine: () => void;
  /** The round invite icon is on screen (bottom-right). The scoring widget
   *  sits to its left meanwhile, so the invite icon never moves. */
  iconShown: boolean;
  setIconShown: (shown: boolean) => void;
}

const STORAGE_PREFIX = 'bulk_invite_progress_state';
const LEGACY_KEY = 'bulk_invite_progress_state';
const POLLER_PREFIX = 'bulk_invite_poller';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 2500;
const MINE_EVERY_MS = 60 * 1000;
/* The polling tab renews its lease every tick; a lease older than this is
   free (that tab closed or went to sleep). */
const POLLER_LEASE_MS = 8000;
/* A run that has stopped moving (or never started): poll it every
   STALE_POLL_MS instead, so stuck runs do not keep hitting the API. */
const STALE_POLL_MS = 30 * 1000;

/* When this page was opened / refreshed. The widget lists only the sends of
   this visit: a batch that finished before it starts hidden ("Show removed"
   brings it back). Batches still sending always show. */
const PAGE_OPENED_AT = Date.now();
const isEarlier = (j: TrackedBulkInvite) => {
  if (isBulkInviteActive(j) || j.status === 'paused' || j.stalled) return false;
  const t = new Date(j.created_at ?? j.trackedAt).getTime();
  return Number.isFinite(t) && t < PAGE_OPENED_AT;
};
/* Hidden as "earlier", not removed by hand: dismissedAt 0 so another tab's
   own choice for the same run still wins the merge. */
const hideEarlier = (j: TrackedBulkInvite): TrackedBulkInvite =>
  (!j.dismissed && isEarlier(j) ? { ...j, dismissed: true, dismissedAt: 0 } : j);

const TAB_ID = typeof window !== 'undefined' ? `${Date.now()}-${Math.random().toString(36).slice(2)}` : 'ssr';

/** account:user from the access token, or null when signed out. */
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

const storageKey = (identity: string) => `${STORAGE_PREFIX}:${identity}`;

const isQuiet = (j: TrackedBulkInvite) => !!j.stalled || (j.status === 'queued' && !j.is_sending && !j.waiting_turn
  && !!j.created_at && Date.now() - new Date(j.created_at).getTime() > 2 * 60 * 1000);

/** Server fields fill the names the popup did not pass. */
const withNames = (j: BulkInviteJob, prev?: TrackedBulkInvite, meta?: TrackMeta): Partial<TrackedBulkInvite> => ({
  jdTitle: meta?.jdTitle ?? prev?.jdTitle ?? j.jd_title ?? undefined,
  jdCode: meta?.jdCode ?? prev?.jdCode ?? j.jd_code ?? undefined,
  jobVersion: meta?.jobVersion ?? prev?.jobVersion ?? j.job_version ?? undefined,
  versionNumber: meta?.versionNumber ?? prev?.versionNumber ?? j.version_number ?? undefined,
});

const keep = (j: TrackedBulkInvite) => {
  if (!j.job_id) return false;
  if (isBulkInviteActive(j) || j.status === 'paused') return true;
  const t = new Date(j.trackedAt).getTime();
  return Number.isFinite(t) && t >= Date.now() - RETENTION_MS;
};

const readStored = (identity: string | null): TrackedBulkInvite[] => {
  if (typeof window === 'undefined' || !identity) return [];
  try {
    const raw = localStorage.getItem(storageKey(identity));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { jobs?: TrackedBulkInvite[] };
    return (parsed.jobs || []).filter(keep);
  } catch {
    return [];
  }
};

/** Two copies of the list (this tab's, another tab's) → one: per run, the
 *  later server read wins, and the later remove / restore wins. */
const mergeLists = (mine: TrackedBulkInvite[], theirs: TrackedBulkInvite[]): TrackedBulkInvite[] => {
  const byId = new Map<string, TrackedBulkInvite>();
  for (const j of mine) byId.set(j.job_id, j);
  for (const t of theirs) {
    const m = byId.get(t.job_id);
    if (!m) { byId.set(t.job_id, t); continue; }
    const base = (t.syncedAt ?? 0) > (m.syncedAt ?? 0) ? { ...m, ...t } : { ...t, ...m };
    const hide = (t.dismissedAt ?? 0) > (m.dismissedAt ?? 0) ? t : m;
    byId.set(t.job_id, { ...base, dismissed: hide.dismissed, dismissedAt: hide.dismissedAt });
  }
  return [...byId.values()].sort((a, b) => (b.created_at ?? b.trackedAt).localeCompare(a.created_at ?? a.trackedAt));
};

const BulkInviteProgressContext = createContext<BulkInviteProgressContextType | undefined>(undefined);

export function BulkInviteProgressProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [jobs, setJobs] = useState<TrackedBulkInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openResults, setOpenResults] = useState<{ id: string; tab: BulkInviteResultsTab } | null>(null);
  const [widget, setWidget] = useState<BulkInviteWidgetView>('hidden');
  const pathname = usePathname();

  /* Who is signed in: read after mount (client-only), and again on every
     route change, tab focus and storage change — sign-in / sign-out swaps the
     list for that user's own. */
  const checkIdentity = useCallback(() => {
    const next = readIdentity();
    setIdentity((prev) => (prev === next ? prev : next));
  }, []);
  useEffect(() => {
    // The pre-2026-11 list was not keyed by user: drop it.
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ }
    // Reads the sign-in token (client-only) once mounted.
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

  useEffect(() => {
    const stored = readStored(identity).map(hideEarlier);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobs(stored);
    // Runs carried over from before a reload come back as the round icon.
    setWidget(stored.some((j) => !j.dismissed) ? 'icon' : 'hidden');
    setLoaded(true);
  }, [identity]);

  useEffect(() => {
    if (!loaded || !identity) return;
    try {
      localStorage.setItem(storageKey(identity), JSON.stringify({ jobs }));
    } catch {
      /* storage blocked: the widget still works for this page's lifetime */
    }
  }, [jobs, loaded, identity]);

  // Another tab polled, started, removed or restored a run: merge it in.
  useEffect(() => {
    if (!identity) return;
    const key = storageKey(identity);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setJobs((prev) => mergeLists(prev, readStored(identity)));
      if (e.key === 'accessToken' || e.key === null) checkIdentity();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [identity, checkIdentity]);

  const upsert = useCallback((job: BulkInviteJob, meta?: TrackMeta) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.job_id === job.job_id);
      const now = Date.now();
      if (idx === -1) {
        return [{ ...job, ...withNames(job, undefined, meta), trackedAt: new Date().toISOString(), syncedAt: now } as TrackedBulkInvite, ...prev];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...job, ...withNames(job, next[idx], meta), syncedAt: now };
      return next;
    });
  }, []);

  const drop = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
  }, []);

  const track = useCallback((job: BulkInviteJob, meta?: TrackMeta) => upsert(job, meta), [upsert]);
  const sync = useCallback((job: BulkInviteJob) => upsert(job), [upsert]);
  const setDismissed = useCallback((jobId: string | string[], dismissed: boolean) => {
    const ids = new Set(Array.isArray(jobId) ? jobId : [jobId]);
    const at = Date.now();
    setJobs((prev) => prev.map((j) => (ids.has(j.job_id) ? { ...j, dismissed, dismissedAt: at } : j)));
  }, []);
  const dismiss = useCallback((jobId: string | string[]) => setDismissed(jobId, true), [setDismissed]);
  const restore = useCallback((jobId: string | string[]) => {
    setDismissed(jobId, false);
    setWidget((w) => (w === 'hidden' ? 'icon' : w));
  }, [setDismissed]);

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

  const setOpenResultsFor = useCallback((jobId: string | null, tab: BulkInviteResultsTab = 'all') => {
    setOpenResults(jobId ? { id: jobId, tab } : null);
  }, []);

  /* "My sends" from the server: merged in (server counts win, this
     browser's remove choices stay), new ones show the round icon. */
  const mineBusy = useRef(false);
  const pullMine = useCallback(async () => {
    if (!identity || mineBusy.current || !getTokens().accessToken) return;
    mineBusy.current = true;
    try {
      const fresh = await bulkInviteService.mine();
      const now = Date.now();
      let added = false;
      setJobs((prev) => {
        const byId = new Map(prev.map((j) => [j.job_id, j]));
        for (const f of fresh) {
          const p = byId.get(f.job_id);
          if (!p) added = true;
          byId.set(f.job_id, p
            ? { ...p, ...f, ...withNames(f, p), syncedAt: now }
            : hideEarlier({ ...f, ...withNames(f), trackedAt: f.created_at ?? new Date().toISOString(), syncedAt: now } as TrackedBulkInvite));
        }
        return [...byId.values()].filter(keep)
          .sort((a, b) => (b.created_at ?? b.trackedAt).localeCompare(a.created_at ?? a.trackedAt));
      });
      if (added && fresh.some((f) => !isEarlier({ ...f, trackedAt: f.created_at ?? new Date().toISOString() } as TrackedBulkInvite))) setWidget((w) => (w === 'hidden' ? 'icon' : w));
    } catch {
      /* offline / signed out: the next round retries */
    } finally {
      mineBusy.current = false;
    }
  }, [identity]);
  const refreshMine = useCallback(() => { void pullMine(); }, [pullMine]);
  useEffect(() => {
    if (!identity) return;
    // Async: the list is set after the server answers, not in this pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void pullMine();
    const t = setInterval(() => {
      if (document.visibilityState !== 'hidden') void pullMine();
    }, MINE_EVERY_MS);
    return () => clearInterval(t);
  }, [identity, pullMine]);

  const [iconShown, setIconShown] = useState(false);

  const activeJobs = useMemo(() => jobs.filter(isBulkInviteActive), [jobs]);

  /* One poll loop for every active run, in ONE tab — except a run whose
     progress panel is on screen (its invite popup, or the results popup):
     that panel polls it and hands each snapshot in through `sync`. */
  const activeIds = activeJobs.map((j) => j.job_id).join(',');
  const polling = useRef(false);
  const lastPolled = useRef<Record<string, number>>({});
  const holdsPollerLease = useEffectEvent((): boolean => {
    if (!identity) return false;
    const key = `${POLLER_PREFIX}:${identity}`;
    try {
      const raw = localStorage.getItem(key);
      const lease = raw ? (JSON.parse(raw) as { tab: string; at: number }) : null;
      const now = Date.now();
      if (lease && lease.tab !== TAB_ID && now - lease.at < POLLER_LEASE_MS) return false;
      localStorage.setItem(key, JSON.stringify({ tab: TAB_ID, at: now }));
      return true;
    } catch {
      return true; // storage blocked: every tab polls for itself
    }
  });
  const shouldPoll = useEffectEvent((id: string) => {
    if (inPopupIds.has(id) || openResults?.id === id) return false;
    const known = jobs.find((j) => j.job_id === id);
    const now = Date.now();
    if (known && isQuiet(known) && now - (lastPolled.current[id] ?? 0) < STALE_POLL_MS) return false;
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
      if (!holdsPollerLease()) return;
      polling.current = true;
      try {
        await Promise.all(activeIds.split(',').map(async (id) => {
          if (!shouldPoll(id)) return;
          try {
            const fresh = await bulkInviteService.get(id);
            if (!cancelled) upsert(fresh);
          } catch (err) {
            // Gone (deleted, or another account's): stop asking for it.
            if ((err as BulkInviteApiError)?.status === 404 && !cancelled) drop(id);
          }
        }));
      } finally {
        polling.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeIds, upsert, drop]);

  const value = useMemo<BulkInviteProgressContextType>(() => ({
    jobs, activeJobs, track, sync, dismiss, restore, inPopupIds, setInPopup,
    openResultsFor: openResults?.id ?? null, openResultsTab: openResults?.tab ?? 'all', setOpenResultsFor,
    widget, setWidget, refreshMine, iconShown, setIconShown,
  }), [jobs, activeJobs, track, sync, dismiss, restore, inPopupIds, setInPopup, openResults, setOpenResultsFor, widget, refreshMine, iconShown]);

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
