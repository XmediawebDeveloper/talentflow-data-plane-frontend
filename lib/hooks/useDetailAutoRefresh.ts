'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Keeps an open detail view (a support ticket) current without a reload:
 * runs `refresh` every `intervalMs` while the browser tab is visible, and
 * right away when the user comes back to the tab. Paused while `enabled` is
 * false (detail closed). A run never overlaps the previous one, and errors
 * are swallowed — this is a silent background catch-up; the normal load and
 * the user's own actions keep their own error handling.
 */
export function useDetailAutoRefresh(
  enabled: boolean,
  refresh: () => void | Promise<void>,
  intervalMs = 30_000,
) {
  // Always call the latest closure (it reads the current ticket / flags).
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const run = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        await refreshRef.current();
      } catch {
        /* silent — try again on the next tick */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs]);
}

/**
 * A toast for replies that arrived through a background refresh (someone
 * else's — your own replies are already on screen). `replies` are only the
 * new ones, oldest first.
 */
export function announceNewReplies(ticketNumber: string | undefined, replies: { name?: string | null; message: string }[]) {
  if (replies.length === 0) return;
  const last = replies[replies.length - 1];
  const text = last.message.length > 90 ? `${last.message.slice(0, 90)}…` : last.message;
  toast.info(
    replies.length === 1 ? `New reply on ${ticketNumber ? `#${ticketNumber}` : 'this ticket'}` : `${replies.length} new replies on ${ticketNumber ? `#${ticketNumber}` : 'this ticket'}`,
    { description: `${last.name || 'Someone'}: ${text}` },
  );
}

/**
 * True when `fresh` is older than what is on screen — a poll that started
 * before the user's own reply / action finished must not undo it.
 */
export function isOlder(fresh?: string | null, current?: string | null): boolean {
  const a = fresh ? Date.parse(fresh) : NaN;
  const b = current ? Date.parse(current) : NaN;
  return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
}
