'use client';

import { useEffect, useEffectEvent } from 'react';
import { JD_STATUS_CHANGED_EVENT, JD_STATUS_CHANNEL } from '@/lib/services/jdService';

/** Default poll for a change made by another user. */
export const JOB_STATUS_POLL_MS = 60_000;
/** A passive trigger (tab visible again, poll tick) is skipped when the last
 *  refresh ran less than this long ago. */
export const JOB_STATUS_MIN_GAP_MS = 30_000;

/**
 * Calls `onRefresh` whenever a job's Disabled / Archived / Draft status may
 * have changed, so a job badge never waits for a page reload:
 *   - at once, always, on `JD_STATUS_CHANGED_EVENT` — this tab, or another tab
 *     of the app over the BroadcastChannel (jdService fires it on enable /
 *     disable / archive / unarchive);
 *   - when the tab becomes visible again, and every `pollMs` while the page
 *     is visible (a change made by another user) — but these passive triggers
 *     are skipped if a refresh already ran within `minGapMs`.
 *
 * Window `focus` is deliberately not a trigger: it fired on every click back
 * into the window (DevTools, another app), and each one re-read whole lists.
 * Pass `pollMs: 0` to skip polling — for a page whose re-read is heavy.
 */
export function useJobStatusRefresh(
  onRefresh: () => void,
  { pollMs = JOB_STATUS_POLL_MS, minGapMs = JOB_STATUS_MIN_GAP_MS }: { pollMs?: number; minGapMs?: number } = {},
) {
  const refresh = useEffectEvent(onRefresh);
  useEffect(() => {
    // The page has just loaded its data on mount, so start the clock now.
    let lastRunAt = Date.now();
    const run = () => { lastRunAt = Date.now(); refresh(); };
    const runIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRunAt < minGapMs) return;
      run();
    };
    const onChange = () => run();
    window.addEventListener(JD_STATUS_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', runIfStale);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(JD_STATUS_CHANNEL);
      channel.onmessage = onChange;
    } catch {
      channel = null;
    }
    const timer = pollMs > 0 ? window.setInterval(runIfStale, pollMs) : null;
    return () => {
      window.removeEventListener(JD_STATUS_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', runIfStale);
      channel?.close();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [pollMs, minGapMs]);
}
