'use client';

import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { bulkInviteService, isBulkInviteActive, type BulkInviteApiError, type BulkInviteJob } from '@/lib/services/bulkInviteService';
import { getTokens } from '@/lib/services/api';
import { emitBackgroundWork } from '@/lib/backgroundWorkEvents';
import { useActivityFeed } from '@/contexts/ActivityFeedContext';
import type { ActivityRef } from '@/lib/services/activityService';

/**
 * The Create / Send bulk runs of the signed-in user, polled while they run so
 * a progress widget can follow them after the popup that started them has
 * closed — the same job the ScoringProgressProvider does for bulk scoring.
 * The backend owns the run; this only mirrors its counts.
 *
 * Where the list comes from:
 *   - the server: every read of the activity feed (ActivityFeedContext —
 *     sign-in, tab focus, every 10s while the tab is visible)
 *     carries this user's sends with the same payload as
 *     GET /bulk-invites/mine — so the widget works on any browser, after
 *     clearing storage, and picks up sends started on another device;
 *   - which runs were removed from the widget is kept on the server too
 *     (POST /activities/dismiss), so a send removed on one device is removed
 *     on every device;
 *   - localStorage, keyed by account + user, is only a copy for the first
 *     paint after a reload. Another user signing in on the same browser never
 *     sees this list.
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
export type BulkInviteResultsTab = 'all' | 'sent' | 'skipped' | 'cancelled' | 'failed' | 'remaining';

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
  /** `onBack`: the results view was opened from another popup (e.g.
   *  "Overall Activity") — it shows a Back button that calls this. */
  setOpenResultsFor: (jobId: string | null, tab?: BulkInviteResultsTab, onBack?: () => void) => void;
  /** Back from the open results view, when it was opened from another popup. */
  openResultsBack: (() => void) | null;
  /** Re-read "my sends" from the server now. */
  refreshMine: () => void;
  /** The user whose first server read has been applied — until then `jobs`
   *  is this browser's saved copy, and a send it last saw running may have
   *  finished meanwhile (not a finish to announce). */
  serverSyncedFor: string | null;
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
/* The polling tab renews its lease every tick; a lease older than this is
   free (that tab closed or went to sleep). */
const POLLER_LEASE_MS = 8000;
/* A run that has stopped moving (or never started): poll it every
   STALE_POLL_MS instead, so stuck runs do not keep hitting the API. */
const STALE_POLL_MS = 30 * 1000;

/* Finished sends of the last day show in EVERY browser, same as scoring runs
   (2026-11-19). They used to start hidden when they finished before the page
   was opened ("this visit only"), so a fresh browser or a refresh showed no
   icon for a send the starting browser still listed. Sends hidden that way
   were stored with dismissedAt 0 (never a hand removal, which stamps the
   time) — un-hide those. */
const unhideEarlier = (j: TrackedBulkInvite): TrackedBulkInvite =>
  (j.dismissed && j.dismissedAt === 0 ? { ...j, dismissed: false } : j);

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
  const [openResults, setOpenResults] = useState<{ id: string; tab: BulkInviteResultsTab; onBack?: () => void } | null>(null);
  const [widget, setWidget] = useState<BulkInviteWidgetView>('hidden');
  const pathname = usePathname();

  /* Tell the pages when a send moves on: its `sent` count went up, or it
     finished. Pages showing invite counts re-read on this (see
     lib/backgroundWorkEvents), so the counts change as the invites go out
     rather than after a reload. The first sight of a job only records it. */
  const seenProgress = useRef<Map<string, { sent: number; active: boolean }>>(new Map());
  useEffect(() => {
    for (const j of jobs) {
      const active = isBulkInviteActive(j);
      const before = seenProgress.current.get(j.job_id);
      seenProgress.current.set(j.job_id, { sent: j.sent, active });
      if (!before) continue;
      const finished = before.active && !active;
      if (j.sent > before.sent || finished) emitBackgroundWork({ kind: 'invite', jdId: j.jd_id, finished });
    }
  }, [jobs]);

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
    const stored = readStored(identity).map(unhideEarlier);
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
  /* Removed / restored on the server too, so every device follows. */
  const feed = useActivityFeed();
  const jobsRef = useRef(jobs);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  const refsOf = useCallback((jobId: string | string[]): ActivityRef[] => {
    const ids = new Set(Array.isArray(jobId) ? jobId : [jobId]);
    return jobsRef.current.filter((j) => ids.has(j.job_id))
      .map((j) => ({ type: j.kind === 'assessment' ? 'assessment_invite' : 'interview_invite', id: j.job_id }));
  }, []);
  const feedDismiss = feed.dismiss;
  const feedRestore = feed.restore;
  const dismiss = useCallback((jobId: string | string[]) => {
    setDismissed(jobId, true);
    feedDismiss(refsOf(jobId));
  }, [setDismissed, feedDismiss, refsOf]);
  const restore = useCallback((jobId: string | string[]) => {
    setDismissed(jobId, false);
    feedRestore(refsOf(jobId));
    setWidget((w) => (w === 'hidden' ? 'icon' : w));
  }, [setDismissed, feedRestore, refsOf]);

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

  const setOpenResultsFor = useCallback((jobId: string | null, tab: BulkInviteResultsTab = 'all', onBack?: () => void) => {
    setOpenResults(jobId ? { id: jobId, tab, onBack } : null);
  }, []);

  /* "My sends" from the server — each read of the activity feed: merged in
     (server counts win; whether a send is removed from the widget is the
     server's too, unless this browser changed it after that read was sent),
     new ones show the round icon. */
  const [serverSyncedFor, setServerSyncedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!identity || !loaded || feed.syncedFor !== identity) return;
    const fresh = feed.items.filter((a) => (a.type === 'assessment_invite' || a.type === 'interview_invite') && a.raw);
    const sentAt = feed.fetchedAt;
    const now = Date.now();
    let added = false;
    // Applying a server read into local state is this effect's whole job.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobs((prev) => {
      const byId = new Map(prev.map((j) => [j.job_id, j]));
      for (const a of fresh) {
        const f = a.raw as BulkInviteJob;
        const p = byId.get(f.job_id);
        // A remove / restore made here after this read was sent is newer.
        const localNewer = !!p && (p.dismissedAt ?? 0) > sentAt;
        const hide = localNewer ? { dismissed: p!.dismissed, dismissedAt: p!.dismissedAt }
          : { dismissed: a.dismissed, dismissedAt: a.dismissed ? (p?.dismissed ? p.dismissedAt ?? sentAt : sentAt) : p?.dismissedAt };
        if (!p && !a.dismissed) added = true;
        byId.set(f.job_id, p
          ? { ...p, ...f, ...withNames(f, p), ...hide, syncedAt: now }
          : ({ ...f, ...withNames(f), ...hide, trackedAt: f.created_at ?? new Date().toISOString(), syncedAt: now } as TrackedBulkInvite));
      }
      return [...byId.values()].filter(keep)
        .sort((a, b) => (b.created_at ?? b.trackedAt).localeCompare(a.created_at ?? a.trackedAt));
    });
    if (added) setWidget((w) => (w === 'hidden' ? 'icon' : w));
    setServerSyncedFor(identity);
  }, [identity, loaded, feed.syncedFor, feed.generation, feed.items, feed.fetchedAt]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServerSyncedFor(null);
  }, [identity]);
  const feedRefresh = feed.refresh;
  const refreshMine = useCallback(() => { feedRefresh(); }, [feedRefresh]);

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
    openResultsBack: openResults?.onBack ?? null,
    widget, setWidget, refreshMine, iconShown, setIconShown, serverSyncedFor,
  }), [jobs, activeJobs, track, sync, dismiss, restore, inPopupIds, setInPopup, openResults, setOpenResultsFor, widget, refreshMine, iconShown, serverSyncedFor]);

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
