'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ACCESS_TOKEN_CHANGED_EVENT, getTokens } from '@/lib/services/api';
import { activityService, isActivityRunning, type ActivityItem, type ActivityRef } from '@/lib/services/activityService';

/**
 * The signed-in user's activities, read from the server (GET /activities/mine)
 * — the ONE place the "My Activities" dock learns what exists, for every
 * activity type, whichever browser or device started it.
 *
 * The scoring and invite contexts take their runs from here (instead of each
 * asking the server on its own), and the dock builds the AI Talent Match and
 * resume upload rows from it. Each run's own detail (per-resume / per-candidate
 * rows) is still polled by its own popup or context while it runs.
 *
 * When it asks:
 *   - on sign-in / user switch (at once),
 *   - when the tab comes back into view (at most every FOCUS_MIN_MS),
 *   - every ACTIVE_POLL_MS while something is running,
 *   - every IDLE_POLL_MS otherwise, while the tab is visible — so a run started
 *     on another device shows up without the recruiter clicking anything.
 *
 * Removing a row (`dismiss`) is saved on the server, so every device drops it;
 * it shows here at once and is confirmed by the next read.
 */

const ACTIVE_POLL_MS = 10_000;
/* Same as while running: most activities finish in seconds (a match in under
   2s, a small scoring run in ~15s), so a slower idle read meant another device
   often showed a run only long after it had finished. */
const IDLE_POLL_MS = 10_000;
const FOCUS_MIN_MS = 5_000;
const WINDOW_HOURS = 24;

/** `tenant:user` from the access token, or null when signed out. */
export const readSessionIdentity = (): string | null => {
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

export const activityKey = (type: string, id: string) => `${type}:${id}`;

/* The last server list, kept per user so the corner shows at once after a
   refresh instead of waiting for the first read. Only a first-paint copy:
   the first server read replaces it, and nothing (toasts, removals, adoption)
   acts on it until that read is in (`syncedFor`). */
const cacheKey = (identity: string) => `activity_feed_cache:${identity}`;
const readCache = (identity: string): ActivityItem[] => {
  try {
    const raw = localStorage.getItem(cacheKey(identity));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writeCache = (identity: string, items: ActivityItem[]) => {
  try { localStorage.setItem(cacheKey(identity), JSON.stringify(items)); } catch { /* storage blocked */ }
};

interface ActivityFeedContextType {
  /** Latest server list for `identity` (rows removed by the user carry `dismissed`). */
  items: ActivityItem[];
  /** Bumps on every successful read — consumers re-apply on it. */
  generation: number;
  /** When the read behind `items` was SENT (ms) — a local change made after
   *  this is newer than the list. */
  fetchedAt: number;
  /** The user whose first read has landed (or failed) — until then `items`
   *  is a placeholder, not "nothing running". */
  syncedFor: string | null;
  identity: string | null;
  refresh: () => void;
  /** Remove rows from the dock on every device (never cancels anything). */
  dismiss: (refs: ActivityRef[]) => void;
  /** Bring removed rows back on every device. */
  restore: (refs: ActivityRef[]) => void;
}

const ActivityFeedContext = createContext<ActivityFeedContextType | undefined>(undefined);

export function ActivityFeedProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [state, setState] = useState<{ for: string | null; items: ActivityItem[]; generation: number; fetchedAt: number; synced: boolean }>(
    { for: null, items: [], generation: 0, fetchedAt: 0, synced: false },
  );
  /* Removes / restores made here, applied over the server list until a read
     sent after them comes back. */
  const [overrides, setOverrides] = useState<Map<string, { dismissed: boolean; at: number }>>(() => new Map());

  const pathname = usePathname();
  const checkIdentity = useCallback(() => {
    const next = readSessionIdentity();
    setIdentity(prev => (prev === next ? prev : next));
  }, []);
  useEffect(() => {
    // Reads the sign-in token (client-only) once mounted, and on every route change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkIdentity();
  }, [pathname, checkIdentity]);

  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  const seq = useRef(0);
  const busy = useRef(false);
  const lastSent = useRef(0);

  const pull = useCallback(async () => {
    const who = identityRef.current;
    if (!who || busy.current || !getTokens().accessToken) return;
    busy.current = true;
    const mine = ++seq.current;
    const sentAt = Date.now();
    lastSent.current = sentAt;
    try {
      const items = await activityService.mine(WINDOW_HOURS);
      if (identityRef.current !== who || mine !== seq.current) return; // signed out / switched meanwhile
      setState(prev => ({ for: who, items, generation: prev.generation + 1, fetchedAt: sentAt, synced: true }));
      writeCache(who, items);
      // TEMP diagnostics (cross-device icon)
      console.log('[ActivityFeed] server', { total: items.length, shown: items.filter(a => !a.dismissed).length, running: items.filter(a => !a.dismissed && isActivityRunning(a)).length, types: items.filter(a => !a.dismissed).map(a => `${a.type}:${a.status}`) });
      setOverrides(prev => {
        if (!prev.size) return prev;
        const next = new Map([...prev].filter(([, o]) => o.at > sentAt));
        return next.size === prev.size ? prev : next;
      });
    } catch (error) {
      // Offline / signed out: the next round retries. Still "synced" — the
      // dock must not wait forever on a failed first read.
      console.warn('[ActivityFeed] read failed:', error);
      if (identityRef.current === who) setState(prev => (prev.for === who && prev.synced ? prev : { ...prev, for: who, synced: true }));
    } finally {
      busy.current = false;
    }
  }, []);

  // A new user: drop the old list and read theirs at once.
  useEffect(() => {
    identityRef.current = identity;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ for: identity, items: identity ? readCache(identity) : [], generation: 0, fetchedAt: 0, synced: false });
    setOverrides(new Map());
    seq.current += 1; // a read for the previous user is now stale
    busy.current = false;
    if (identity) void pull();
  }, [identity, pull]);

  // Back to the tab: re-check who is signed in and re-read.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      checkIdentity();
      if (Date.now() - lastSent.current < FOCUS_MIN_MS) return;
      void pull();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    // The token arrives a moment after a fresh page load (session restore):
    // read the user then, not only on the next page change / tab focus.
    window.addEventListener(ACCESS_TOKEN_CHANGED_EVENT, checkIdentity);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(ACCESS_TOKEN_CHANGED_EVENT, checkIdentity);
    };
  }, [checkIdentity, pull]);

  // Steady reads: fast while something runs, slow otherwise; never while hidden.
  const anyRunning = state.items.some(a => !a.dismissed && isActivityRunning(a));
  useEffect(() => {
    if (!identity) return;
    const every = anyRunning ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastSent.current < every - 500) return; // a focus read just went
      void pull();
    }, every);
    return () => clearInterval(t);
  }, [identity, anyRunning, pull]);

  const setLocal = useCallback((refs: ActivityRef[], dismissed: boolean) => {
    const at = Date.now();
    setOverrides(prev => {
      const next = new Map(prev);
      refs.forEach(r => { if (r.id) next.set(activityKey(r.type, r.id), { dismissed, at }); });
      return next;
    });
  }, []);

  const dismiss = useCallback((refs: ActivityRef[]) => {
    if (!refs.length) return;
    setLocal(refs, true);
    activityService.dismiss(refs)
      .catch(err => console.warn('[ActivityFeed] dismiss failed:', err))
      .finally(() => { void pull(); });
  }, [pull, setLocal]);

  const restore = useCallback((refs: ActivityRef[]) => {
    if (!refs.length) return;
    setLocal(refs, false);
    activityService.restore(refs)
      .catch(err => console.warn('[ActivityFeed] restore failed:', err))
      .finally(() => { void pull(); });
  }, [pull, setLocal]);

  const refresh = useCallback(() => { void pull(); }, [pull]);

  const current = state.for === identity;
  const items = useMemo(() => {
    const list = current ? state.items : [];
    if (!overrides.size) return list;
    return list.map(a => {
      const o = overrides.get(activityKey(a.type, a.id));
      return o && o.dismissed !== a.dismissed ? { ...a, dismissed: o.dismissed } : a;
    });
  }, [current, state.items, overrides]);

  const value = useMemo<ActivityFeedContextType>(() => ({
    items,
    generation: current ? state.generation : 0,
    fetchedAt: current ? state.fetchedAt : 0,
    syncedFor: current && state.synced ? identity : null,
    identity,
    refresh,
    dismiss,
    restore,
  }), [items, current, state.generation, state.fetchedAt, state.synced, identity, refresh, dismiss, restore]);

  return <ActivityFeedContext.Provider value={value}>{children}</ActivityFeedContext.Provider>;
}

export function useActivityFeed(): ActivityFeedContextType {
  const ctx = useContext(ActivityFeedContext);
  if (!ctx) throw new Error('useActivityFeed must be used within an ActivityFeedProvider');
  return ctx;
}

/** The same hook where the provider may be absent (tests, public pages). */
export function useOptionalActivityFeed(): ActivityFeedContextType | null {
  return useContext(ActivityFeedContext) ?? null;
}
