'use client';

import { useEffect, useRef } from 'react';

/**
 * Quiet background refresh for the invitation trackers (AI Interview and
 * Assessment), which used to poll every 15s each — whether or not anyone was
 * looking, and even while the previous refresh was still running.
 *
 *  - Every TRACKER_POLL_MS, but only while the browser tab is visible.
 *  - Coming back to the tab refreshes at once if a tick was missed, so the
 *    list is never staler than the interval when the recruiter looks at it.
 *  - A tick is skipped while the previous refresh is still in flight, so a
 *    slow response can't stack requests.
 *
 * `refresh` is read through a ref: callers pass a fresh closure each render
 * (current page, filters…) without restarting the timer. The caller's own
 * first load stays where it is — this hook only does the repeats.
 */
export const TRACKER_POLL_MS = 30_000;

export function useTrackerPoll(enabled: boolean, refresh: () => unknown): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    let lastRunAt = Date.now();

    const run = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      lastRunAt = Date.now();
      try {
        await refreshRef.current();
      } catch {
        /* Silent refresh — the next tick tries again. */
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(run, TRACKER_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAt >= TRACKER_POLL_MS) void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
