'use client';

import { useEffect, useEffectEvent } from 'react';
import { JD_STATUS_CHANGED_EVENT, JD_STATUS_CHANNEL } from '@/lib/services/jdService';

/**
 * Calls `onRefresh` whenever a job's Disabled / Archived / Draft status may
 * have changed, so a job badge never waits for a page reload:
 *   - at once, on `JD_STATUS_CHANGED_EVENT` — this tab, or another tab of the
 *     app over the BroadcastChannel (jdService fires it on enable / disable /
 *     archive / unarchive);
 *   - when the window regains focus or the tab becomes visible again;
 *   - every `pollMs` while the page is visible (a change made by another
 *     user). Pass 0 to skip polling — for a page whose re-read is heavy.
 */
export function useJobStatusRefresh(onRefresh: () => void, { pollMs = 10_000 }: { pollMs?: number } = {}) {
  const refresh = useEffectEvent(onRefresh);
  useEffect(() => {
    const onChange = () => refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(JD_STATUS_CHANGED_EVENT, onChange);
    window.addEventListener('focus', onChange);
    document.addEventListener('visibilitychange', onVisible);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(JD_STATUS_CHANNEL);
      channel.onmessage = onChange;
    } catch {
      channel = null;
    }
    const timer = pollMs > 0
      ? window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, pollMs)
      : null;
    return () => {
      window.removeEventListener(JD_STATUS_CHANGED_EVENT, onChange);
      window.removeEventListener('focus', onChange);
      document.removeEventListener('visibilitychange', onVisible);
      channel?.close();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [pollMs]);
}
