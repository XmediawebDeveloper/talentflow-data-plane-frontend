/**
 * Shared throttle for "re-check when the tab becomes visible / gets focus".
 *
 * The header's reads (auth/me, admin-assigned plan, pending plan changes,
 * chat unread) each re-fetched on EVERY visibilitychange, and one tab switch
 * fires it twice — on staging that was four ~0.6 s round trips at 0 s, 3.8 s,
 * 31 s, 46 s for nothing. Each fetch stamps its key (`markRefreshed`); a
 * visibility handler then asks `focusRefreshDue` and skips while the last read
 * is younger than the window. Explicit refreshes (WebSocket pushes, after a
 * write, the 5-minute fallback polls) never consult this.
 *
 * Memory only: a hard reload starts fresh, which is right — the page's own
 * first load reads everything anyway.
 */

export const FOCUS_REFRESH_MIN_MS = 60_000;

const lastRefreshed = new Map<string, number>();

/** Record that `key` was just read from the server (by any path). */
export function markRefreshed(key: string): void {
  lastRefreshed.set(key, Date.now());
}

/** True when `key` has not been read within `minMs` — the focus re-check may run. */
export function focusRefreshDue(key: string, minMs: number = FOCUS_REFRESH_MIN_MS): boolean {
  const last = lastRefreshed.get(key);
  return last === undefined || Date.now() - last >= minMs;
}
