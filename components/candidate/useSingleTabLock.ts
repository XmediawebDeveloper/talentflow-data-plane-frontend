'use client';

import { useEffect, useRef, useState } from 'react';

export type TabLockState = 'checking' | 'owner' | 'blocked';

const HEARTBEAT_MS = 2000;
// Generous: browsers throttle timers in hidden tabs to ~1/min, and a candidate
// legitimately switches tabs. Normal close/refresh releases via pagehide.
const STALE_MS = 75000;
const VERIFY_DELAY_MS = 60;

interface Lease {
  id: string;
  ts: number;
}

function readLease(key: string): Lease | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string' && typeof parsed.ts === 'number') return parsed;
  } catch { /* storage unavailable or corrupt */ }
  return null;
}

function writeLease(key: string, id: string) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ id, ts: Date.now() }));
  } catch { /* storage unavailable */ }
}

/**
 * Allows only ONE browser tab at a time to run the assessment for a token.
 * A tab holds a short-lived lease in localStorage that it renews every
 * couple of seconds. Other tabs (same browser) see a fresh lease and are
 * 'blocked'; they take over automatically once the owner closes (lease
 * released on pagehide) or dies (lease goes stale).
 *
 * Refreshing is fine: pagehide releases the lease and the new mount
 * re-acquires it. If localStorage is unavailable we fail open — the server
 * still enforces a single session across devices.
 */
export function useSingleTabLock(token: string): TabLockState {
  const [state, setState] = useState<TabLockState>('checking');
  const tabIdRef = useRef<string>('');

  useEffect(() => {
    if (!token) return;
    const key = `tf_assess_tab_lock_${token}`;
    const myId =
      tabIdRef.current ||
      (tabIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    let disposed = false;
    let verifyTimer: ReturnType<typeof setTimeout> | null = null;

    const isHeldByOther = () => {
      const lease = readLease(key);
      return !!lease && lease.id !== myId && Date.now() - lease.ts < STALE_MS;
    };

    const tick = () => {
      if (disposed) return;
      if (isHeldByOther()) {
        setState('blocked');
        return;
      }
      writeLease(key, myId);
      // Two tabs may write in the same instant: re-read and let the last writer win.
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = setTimeout(() => {
        if (disposed) return;
        const lease = readLease(key);
        setState(lease && lease.id !== myId ? 'blocked' : 'owner');
      }, VERIFY_DELAY_MS);
    };

    const release = () => {
      const lease = readLease(key);
      if (lease && lease.id === myId) {
        try { window.localStorage.removeItem(key); } catch { /* ignore */ }
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue === null) tick(); // owner released -> try to take over
    };

    tick();
    const interval = setInterval(tick, HEARTBEAT_MS);
    window.addEventListener('pagehide', release);
    window.addEventListener('storage', onStorage);

    return () => {
      disposed = true;
      clearInterval(interval);
      if (verifyTimer) clearTimeout(verifyTimer);
      window.removeEventListener('pagehide', release);
      window.removeEventListener('storage', onStorage);
      release();
    };
  }, [token]);

  return state;
}
