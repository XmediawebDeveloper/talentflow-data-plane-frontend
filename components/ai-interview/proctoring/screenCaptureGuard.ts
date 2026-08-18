'use client';

/**
 * screenCaptureGuard — the single install point for the browser-level screen
 * capture guard used by the AI interview (BUG09).
 *
 * WHAT A BROWSER CAN ACTUALLY OBSERVE
 * -----------------------------------
 * A web page only ever sees screen capture that goes THROUGH the browser:
 * `navigator.mediaDevices.getDisplayMedia()` calls made by this page (or by an
 * extension's content script injected into it) and the lifecycle of the
 * MediaStreamTracks those calls hand back. There is deliberately NO web API
 * that reports "a native application is recording this screen" — a page cannot
 * enumerate OS processes or windows. OBS, ShareX, Xbox Game Bar, the Loom
 * desktop app and the built-in Windows/macOS recorders are therefore invisible
 * to JavaScript, whether they were started before or during the interview.
 *
 * So this module does exactly what is observable and nothing more: it blocks
 * and reports every getDisplayMedia call that is not the interview's own
 * mandatory Entire-Screen share. The only signal that reaches an EXTERNAL
 * native recorder at all is the pixel content of that Entire-Screen capture —
 * a recorder's toolbar / REC badge / tray icons show up inside the frames we
 * are already capturing. That check lives in CandidateAIInterviewPortal
 * (`scanScreenForRecorder`, backed by the /verify-share-bar vision endpoint).
 *
 * Refcounted on purpose: the candidate portal arms the guard at page
 * INITIALIZATION (before the system check, before a session exists) and
 * useInterviewProctoringMonitor arms it again when the interview starts. Two
 * naive monkey-patches would stack — the second would capture the first as its
 * "original", so uninstalling in the wrong order would leave the page patched
 * forever and every attempt would be reported twice. One shared patch with a
 * handler set avoids both.
 */

/** Details passed to attempt handlers. `phase` is filled in by the caller. */
export type ScreenCaptureAttemptHandler = (details: Record<string, unknown>) => void;

/**
 * Window flag the portal sets around its OWN getDisplayMedia call so the
 * interview's mandatory Entire-Screen (re)share is let through. Declared here
 * as the single source of truth for the name.
 */
const ALLOW_FLAG = '__tfAllowLegitimateShare';

type GetDisplayMedia = (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;

/** True while the portal is making the interview's own Entire-Screen request. */
const isLegitimateShareInFlight = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as unknown as Record<string, unknown>)[ALLOW_FLAG]);

const handlers = new Set<ScreenCaptureAttemptHandler>();
let originalGetDisplayMedia: GetDisplayMedia | null = null;

/**
 * Feature detection — getDisplayMedia is absent on iOS Safari, on older
 * browsers and in any insecure (non-HTTPS) context. Nothing to guard there,
 * and the page must keep working.
 */
export function isDisplayCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

/**
 * Install (or join) the shared guard. Returns an uninstall function; the patch
 * is only reverted once every installer has released it. Safe to call from a
 * React effect — StrictMode's double-invoke just adds and removes one handler.
 */
export function installScreenCaptureGuard(onAttempt: ScreenCaptureAttemptHandler): () => void {
  if (!isDisplayCaptureSupported()) return () => {};

  handlers.add(onAttempt);

  if (!originalGetDisplayMedia) {
    // Keep the UNBOUND original so releasing restores the exact same function
    // object the browser installed — a bound copy would leave a permanent
    // wrapper behind and break anything that snapshotted the real one.
    const original = navigator.mediaDevices.getDisplayMedia as GetDisplayMedia;
    originalGetDisplayMedia = original;
    navigator.mediaDevices.getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
      if (isLegitimateShareInFlight()) return original.call(navigator.mediaDevices, constraints);
      handlers.forEach((fn) => {
        try { fn({ source: 'get_display_media_blocked' }); } catch { /* one bad handler must not unblock capture */ }
      });
      throw new Error('Screen recording is not allowed during the interview');
    } as typeof navigator.mediaDevices.getDisplayMedia;
    console.log('[INTERVIEW_PROCTORING] Screen capture guard armed');
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    handlers.delete(onAttempt);
    if (handlers.size === 0 && originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia as typeof navigator.mediaDevices.getDisplayMedia;
      originalGetDisplayMedia = null;
      console.log('[INTERVIEW_PROCTORING] Screen capture guard released');
    }
  };
}
