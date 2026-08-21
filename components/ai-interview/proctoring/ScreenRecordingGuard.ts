'use client';

/**
 * ScreenRecordingGuard — the choke point for "the candidate tried to start a
 * screen recording".
 *
 * Two jobs, deliberately kept in one tiny module so they can never drift apart:
 *
 *  1. `beginLegitimateShare` / `endLegitimateShare` mark the window in which the
 *     APP itself is asking for the screen (the mandatory Entire-Screen share and
 *     the mid-interview re-share). Anything asking OUTSIDE that window is the
 *     candidate, and gets blocked.
 *
 *  2. `notifyScreenRecordingBlocked` fires the candidate-facing popup the instant
 *     a capture call is refused — synchronously, inside the patched API, BEFORE
 *     the rejection is thrown. Nothing polls, nothing batches, nothing waits for
 *     a React render cycle to notice: click → blocked → popup.
 *
 * Why a ref-count plus a trailing grace instead of the old bare
 * `window.__tfAllowLegitimateShare` boolean: that flag was set true, awaited, and
 * reset in a `finally`. Any second (nested or retried) app-owned request that
 * overlapped the first had its permission reset out from under it by the first
 * one's `finally`, and the app's own share was then reported as a candidate
 * recording attempt. Those false accusations are the reason the candidate-facing
 * warning had to be suppressed at all. Ref-counting removes the overlap bug and
 * the grace window absorbs the last-moment retry, so the popup below can be
 * trusted and shown.
 *
 * The old window flag is still written and still honoured, because
 * hooks/useProctoringMonitor.ts (the separate assessment surface) reads it.
 */

// How long after the app's own share settles that capture calls are still
// treated as ours. Covers a retry issued straight after a failed/cancelled
// picker. Short enough that a candidate cannot slip a recorder through it: the
// app's share is itself gated behind a user gesture and the browser picker.
const LEGITIMATE_SHARE_GRACE_MS = 1500;

let legitimateShareDepth = 0;
let legitimateShareGraceUntilMs = 0;

const setWindowFlag = (value: boolean) => {
  if (typeof window === 'undefined') return;
  (window as any).__tfAllowLegitimateShare = value;
};

/** Open an app-owned screen-capture window. ALWAYS pair with endLegitimateShare in a finally. */
export function beginLegitimateShare(): void {
  legitimateShareDepth += 1;
  legitimateShareGraceUntilMs = 0;
  setWindowFlag(true);
}

/** Close an app-owned screen-capture window (the outermost one starts the grace). */
export function endLegitimateShare(): void {
  legitimateShareDepth = Math.max(0, legitimateShareDepth - 1);
  if (legitimateShareDepth > 0) return;
  legitimateShareGraceUntilMs = Date.now() + LEGITIMATE_SHARE_GRACE_MS;
  setWindowFlag(false);
}

/** True while a screen-capture call belongs to the app rather than the candidate. */
export function isLegitimateShareInFlight(): boolean {
  if (legitimateShareDepth > 0) return true;
  if (Date.now() < legitimateShareGraceUntilMs) return true;
  // Legacy escape hatch — anything still setting the raw flag keeps working.
  return typeof window !== 'undefined' && Boolean((window as any).__tfAllowLegitimateShare);
}

/**
 * Chrome/Edge extension screen capture (Loom, Screencastify, Awesome Screenshot
 * & co.) does NOT go through getDisplayMedia — the extension hands the page a
 * desktop source id and the page calls getUserMedia with chromeMediaSource:
 * 'desktop'. Without this check, clicking "record" in such an extension sails
 * straight past a getDisplayMedia-only guard.
 */
export function isDesktopCaptureConstraint(constraints?: MediaStreamConstraints): boolean {
  if (!constraints) return false;
  const probe = (value: any): boolean => {
    if (!value || typeof value !== 'object') return false;
    const mandatory = value.mandatory || {};
    return (
      mandatory.chromeMediaSource === 'desktop' ||
      mandatory.chromeMediaSource === 'screen' ||
      mandatory.chromeMediaSource === 'window' ||
      typeof mandatory.chromeMediaSourceId === 'string' ||
      value.chromeMediaSource === 'desktop' ||
      typeof value.chromeMediaSourceId === 'string'
    );
  };
  return probe((constraints as any).video) || probe((constraints as any).audio);
}

export interface ScreenRecordingBlockedDetail {
  /** Which API or hotkey the attempt came through, for the recruiter timeline. */
  source: string;
  /**
   * True when the attempt was actually REFUSED (a browser API we control).
   * False when it was only OBSERVED and could not be stopped — an OS-level
   * recording hotkey, which the page can see fire but cannot cancel. The popup
   * changes its wording accordingly; telling a candidate a recording was
   * "blocked" when the OS happily started it is worse than saying nothing.
   */
  blocked: boolean;
  at: number;
}

type BlockedListener = (detail: ScreenRecordingBlockedDetail) => void;

const blockedListeners = new Set<BlockedListener>();

/** Subscribe to blocked screen-recording attempts (drives the popup). */
export function onScreenRecordingBlocked(listener: BlockedListener): () => void {
  blockedListeners.add(listener);
  return () => { blockedListeners.delete(listener); };
}

/**
 * Announce a refused attempt. Called synchronously from inside the patched
 * capture API so the popup is on screen in the same task as the click — a
 * listener that throws must never stop the caller from refusing the capture.
 */
export function notifyScreenRecordingBlocked(
  source: string,
  blocked = true,
): ScreenRecordingBlockedDetail {
  const detail: ScreenRecordingBlockedDetail = { source, blocked, at: Date.now() };
  blockedListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (err) {
      console.error('[ScreenRecordingGuard] listener threw', err);
    }
  });
  return detail;
}

/** Message shown to the candidate and used as the rejection reason. */
export const SCREEN_RECORDING_BLOCKED_MESSAGE =
  'Screen recording is not allowed during this interview.';
