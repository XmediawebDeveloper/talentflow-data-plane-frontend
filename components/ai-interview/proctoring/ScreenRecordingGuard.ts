'use client';

/**
 * ScreenRecordingGuard — the single choke point for "the candidate is trying to
 * record this interview".
 *
 * ── What this file can and cannot do ────────────────────────────────────────
 * A web page can REFUSE screen capture only when the capture is asked for
 * THROUGH the page. That is a real and worthwhile set (see BLOCKED vectors
 * below) and it covers every browser-based recorder. It is NOT everything:
 * a native application (OBS, Bandicam, QuickTime, Game Bar, ffmpeg, …) reads
 * the framebuffer through the operating system and never asks the browser for
 * anything, so no web API can see the call, let alone deny it. Those are
 * handled by DETECTION signals (hotkeys, virtual devices, the vision watch on
 * the shared-screen feed) which the interview reacts to by pausing and blanking
 * itself, so the recording captures nothing of the session.
 *
 * BLOCKED here — refused before a single frame is produced:
 *   • navigator.mediaDevices.getDisplayMedia (every browser screen capture,
 *     including MV3 extension recorders: Screenity, Nimbus, Vmaker, Loom web,
 *     Screencastify's in-page path)
 *   • navigator.getDisplayMedia (legacy alias still shipped by some builds)
 *   • getUserMedia with chromeMediaSource:'desktop' (the chrome.desktopCapture
 *     source-id path older extension recorders still use)
 *   • new MediaRecorder(...) over any display-surface track we did not create
 *   • HTMLCanvasElement/HTMLMediaElement.captureStream (re-capturing our own
 *     avatar/webcam elements — the app itself never calls either)
 *
 * DETECTED but not blockable — reported through the same bus with
 * enforcement:'detected' (see ScreenRecorderHotkeys / ScreenRecorderDevices and
 * the portal's vision watch):
 *   • OS and app recording hotkeys
 *   • recorder virtual camera / audio-loopback devices appearing
 *   • a recorder visible on the shared screen
 *
 * NOT controllable from a browser at all — documented, never claimed:
 *   • chrome.tabCapture / offscreen-document extension recorders
 *   • a headless native recorder with no window, no hotkey and no virtual device
 *   • hardware capture (HDMI splitter, capture card), a phone pointed at the
 *     screen (the object detector covers that separately), or the interview
 *     being run inside a VM/remote desktop that the host records.
 * See SCREEN_RECORDING_COVERAGE.md for the full per-product matrix.
 */

// ── App-owned screen share ──────────────────────────────────────────────────
//
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

/**
 * Open an app-owned screen-capture window. ALWAYS pair with endLegitimateShare
 * in a finally.
 *
 * Ref-counted, not a bare boolean: the previous implementation set a flag,
 * awaited the picker and cleared the flag in a `finally`, so two overlapping
 * app-owned requests had the first one's `finally` revoke permission from the
 * second — and the app's own mandatory share was then reported as a candidate
 * recording attempt. Those false accusations are the reason the candidate-facing
 * warning had to be suppressed at all.
 *
 * The legacy `window.__tfAllowLegitimateShare` flag is still written and still
 * honoured, because hooks/useProctoringMonitor.ts (the separate assessment
 * surface) reads it directly.
 */
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

/**
 * Drop any in-flight app-owned share window immediately, ignoring the ref-count
 * and the grace.
 *
 * Two callers. The portal calls it on unmount, so a `beginLegitimateShare` whose
 * `endLegitimateShare` never ran (a navigation or crash between the two) cannot
 * leave the capture guard permanently open for the next mount. Tests call it
 * between cases, because the grace window is module state and would otherwise
 * leak one test's app-owned share into the next test's candidate-attempt
 * assertion — which is exactly how it behaves in the browser, and exactly what a
 * test must not inherit silently.
 */
export function resetLegitimateShareState(): void {
  legitimateShareDepth = 0;
  legitimateShareGraceUntilMs = 0;
  setWindowFlag(false);
}

/** True while a screen-capture call belongs to the app rather than the candidate. */
export function isLegitimateShareInFlight(): boolean {
  if (legitimateShareDepth > 0) return true;
  if (Date.now() < legitimateShareGraceUntilMs) return true;
  return typeof window !== 'undefined' && Boolean((window as any).__tfAllowLegitimateShare);
}

// ── App-owned display tracks ────────────────────────────────────────────────
//
// The interview records the candidate's screen itself, so "a MediaRecorder over
// a display track" cannot be blanket-refused. We remember the track ids the app
// obtained through beginLegitimateShare and refuse recording of any OTHER
// display track. Ids, not stream identity, because the portal rebuilds a fresh
// MediaStream (screen video + mixed audio) around the same track before
// recording it.
const appOwnedDisplayTrackIds = new Set<string>();

/** Mark a stream the app itself obtained, so it stays recordable. */
export function registerAppOwnedStream(stream: MediaStream | null | undefined): void {
  stream?.getVideoTracks().forEach((track) => {
    appOwnedDisplayTrackIds.add(track.id);
    // Self-cleaning: the id is meaningless once the track dies, and a stopped
    // share must not leave a permanently whitelisted id behind.
    track.addEventListener('ended', () => appOwnedDisplayTrackIds.delete(track.id), { once: true });
  });
}

/** Forget a stream (candidate stopped sharing / interview finished). */
export function unregisterAppOwnedStream(stream: MediaStream | null | undefined): void {
  stream?.getVideoTracks().forEach((track) => appOwnedDisplayTrackIds.delete(track.id));
}

/**
 * Is this a screen/window/tab capture track rather than a camera track?
 *
 * `displaySurface` is the spec answer and is what Chrome/Edge report. Firefox
 * omits it from getSettings(), so fall back to the track label, which Firefox
 * fills with the surface type ("Screen", "Window", "Browser"). A camera track's
 * label is the device name, so the two do not collide in practice.
 */
function isDisplayTrack(track: MediaStreamTrack): boolean {
  if (track.kind !== 'video') return false;
  const settings = track.getSettings?.() as (MediaTrackSettings & { displaySurface?: string }) | undefined;
  if (settings?.displaySurface) return true;
  return /^(screen|window|browser|monitor|entire screen)/i.test(track.label || '');
}

function foreignDisplayTrack(stream: MediaStream | null | undefined): MediaStreamTrack | null {
  if (!stream || typeof stream.getVideoTracks !== 'function') return null;
  for (const track of stream.getVideoTracks()) {
    if (isDisplayTrack(track) && !appOwnedDisplayTrackIds.has(track.id)) return track;
  }
  return null;
}

// ── Attempt bus ─────────────────────────────────────────────────────────────

/** Which channel the attempt came through. Drives the coverage matrix. */
export type ScreenRecordingVector =
  | 'getDisplayMedia'
  | 'getUserMedia_desktop'
  | 'mediaRecorder_display'
  | 'captureStream'
  | 'os_hotkey'
  | 'virtual_device'
  | 'vision';

/**
 * 'blocked'  — the capture was REFUSED; no frame was ever produced.
 * 'detected' — the capture was OBSERVED but the browser cannot stop it; the
 *              interview responds by pausing and blanking itself instead.
 * Never conflate the two: telling a candidate a recording was "blocked" when
 * the OS happily started it is worse than saying nothing.
 */
export type ScreenRecordingEnforcement = 'blocked' | 'detected';

export interface ScreenRecordingAttempt {
  vector: ScreenRecordingVector;
  /** Human-readable channel, shown to the candidate and stored for the recruiter. */
  source: string;
  enforcement: ScreenRecordingEnforcement;
  /**
   * 'high' — act on it alone (popup + violation).
   * 'low'  — corroborate first. Bare function-key recorder hotkeys land here:
   *          F9/F10/F12 are a real recorder default across a dozen products AND
   *          an innocent keypress, so they escalate the vision watch rather than
   *          accusing on their own.
   */
  confidence: 'high' | 'low';
  at: number;
  details?: Record<string, unknown>;
}

type AttemptListener = (attempt: ScreenRecordingAttempt) => void;

const attemptListeners = new Set<AttemptListener>();

/** Subscribe to screen-recording attempts (popup, backend reporting, escalation). */
export function onScreenRecordingAttempt(listener: AttemptListener): () => void {
  attemptListeners.add(listener);
  return () => { attemptListeners.delete(listener); };
}

/**
 * Announce an attempt. Called synchronously from inside the patched capture APIs
 * so the popup is on screen in the same task as the click — a listener that
 * throws must never stop the caller from refusing the capture.
 */
export function reportScreenRecordingAttempt(
  attempt: Omit<ScreenRecordingAttempt, 'at'>,
): ScreenRecordingAttempt {
  const full: ScreenRecordingAttempt = { ...attempt, at: Date.now() };
  attemptListeners.forEach((listener) => {
    try {
      listener(full);
    } catch (err) {
      console.error('[ScreenRecordingGuard] listener threw', err);
    }
  });
  return full;
}

/** Message shown to the candidate and used as the rejection reason. */
export const SCREEN_RECORDING_BLOCKED_MESSAGE =
  'Screen recording is not allowed during the interview.';

/**
 * Chrome/Edge extension screen capture predating MV3's getDisplayMedia does NOT
 * go through getDisplayMedia — the extension hands the page a desktop source id
 * and the page calls getUserMedia with chromeMediaSource:'desktop'. Without this
 * check, clicking "record" in such an extension sails past a
 * getDisplayMedia-only guard.
 */
export function isDesktopCaptureConstraint(constraints?: MediaStreamConstraints): boolean {
  if (!constraints) return false;
  const probe = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, any>;
    const mandatory = (v.mandatory || {}) as Record<string, unknown>;
    return (
      mandatory.chromeMediaSource === 'desktop' ||
      mandatory.chromeMediaSource === 'screen' ||
      mandatory.chromeMediaSource === 'window' ||
      typeof mandatory.chromeMediaSourceId === 'string' ||
      v.chromeMediaSource === 'desktop' ||
      typeof v.chromeMediaSourceId === 'string'
    );
  };
  return probe((constraints as any).video) || probe((constraints as any).audio);
}

// ── The guard install ───────────────────────────────────────────────────────

type Uninstall = () => void;

let installDepth = 0;
let activeUninstall: Uninstall | null = null;

function refuse(
  vector: ScreenRecordingVector,
  source: string,
  details?: Record<string, unknown>,
): Error {
  reportScreenRecordingAttempt({
    vector, source, enforcement: 'blocked', confidence: 'high', details,
  });
  console.warn(`[ScreenRecordingGuard] BLOCKED ${vector} (${source})`);
  const error = new Error(SCREEN_RECORDING_BLOCKED_MESSAGE);
  // NotAllowedError is what a denied permission looks like to a caller, so
  // recorders and extensions fall onto their existing failure path instead of
  // hanging on an unexpected error shape.
  error.name = 'NotAllowedError';
  return error;
}

function install(): Uninstall {
  const mediaDevices = navigator.mediaDevices;
  const restores: Uninstall[] = [];

  // 1 + 2. getDisplayMedia, standard and legacy alias.
  const originalGetDisplayMedia = mediaDevices?.getDisplayMedia;
  if (mediaDevices && originalGetDisplayMedia) {
    mediaDevices.getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
      if (isLegitimateShareInFlight()) {
        return originalGetDisplayMedia.call(mediaDevices, constraints as any);
      }
      throw refuse('getDisplayMedia', 'mediaDevices.getDisplayMedia');
    };
    restores.push(() => { mediaDevices.getDisplayMedia = originalGetDisplayMedia; });
  }

  const originalLegacyGetDisplayMedia = (navigator as any).getDisplayMedia as
    | ((constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>)
    | undefined;
  if (originalLegacyGetDisplayMedia) {
    (navigator as any).getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
      if (isLegitimateShareInFlight()) {
        return originalLegacyGetDisplayMedia.call(navigator, constraints);
      }
      throw refuse('getDisplayMedia', 'navigator.getDisplayMedia');
    };
    restores.push(() => { (navigator as any).getDisplayMedia = originalLegacyGetDisplayMedia; });
  }

  // 3. Desktop-source getUserMedia. Camera/mic getUserMedia must keep working
  //    untouched — only desktop-source constraints are refused, so the
  //    interview's own devices are unaffected.
  const originalGetUserMedia = mediaDevices?.getUserMedia;
  if (mediaDevices && originalGetUserMedia) {
    mediaDevices.getUserMedia = async function (constraints?: MediaStreamConstraints) {
      if (isDesktopCaptureConstraint(constraints) && !isLegitimateShareInFlight()) {
        throw refuse('getUserMedia_desktop', 'getUserMedia(chromeMediaSource:desktop)');
      }
      return originalGetUserMedia.call(mediaDevices, constraints as any);
    };
    restores.push(() => { mediaDevices.getUserMedia = originalGetUserMedia; });
  }

  // 4. MediaRecorder over a display track we did not create. Closes the gap
  //    where a stream obtained before the guard was installed (or handed in by
  //    an extension) is encoded afterwards.
  const OriginalMediaRecorder = typeof window !== 'undefined' ? window.MediaRecorder : undefined;
  if (OriginalMediaRecorder) {
    const GuardedMediaRecorder = function (
      this: unknown,
      stream: MediaStream,
      options?: MediaRecorderOptions,
    ) {
      const foreign = foreignDisplayTrack(stream);
      if (foreign) {
        throw refuse('mediaRecorder_display', 'MediaRecorder(display stream)', {
          track_label: foreign.label,
          display_surface: (foreign.getSettings?.() as any)?.displaySurface,
        });
      }
      return Reflect.construct(
        OriginalMediaRecorder,
        [stream, options],
        (new.target as any) || GuardedMediaRecorder,
      );
    } as unknown as typeof MediaRecorder;
    GuardedMediaRecorder.prototype = OriginalMediaRecorder.prototype;
    // Inherit the statics (isTypeSupported) rather than copying them, so a
    // browser that adds one later still exposes it through the guard.
    Object.setPrototypeOf(GuardedMediaRecorder, OriginalMediaRecorder);
    window.MediaRecorder = GuardedMediaRecorder;
    restores.push(() => { window.MediaRecorder = OriginalMediaRecorder; });
  }

  // 5. captureStream on our own <canvas>/<video>/<audio>. The app never calls
  //    either, so refusing them costs nothing and closes the "duplicate the
  //    avatar and webcam elements into a recordable stream" route available to
  //    an injected content script.
  const canvasProto = typeof HTMLCanvasElement !== 'undefined' ? HTMLCanvasElement.prototype : null;
  const originalCanvasCapture = (canvasProto as any)?.captureStream;
  if (canvasProto && typeof originalCanvasCapture === 'function') {
    (canvasProto as any).captureStream = function () {
      throw refuse('captureStream', 'HTMLCanvasElement.captureStream');
    };
    restores.push(() => { (canvasProto as any).captureStream = originalCanvasCapture; });
  }

  const mediaProto = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null;
  const originalMediaCapture = (mediaProto as any)?.captureStream;
  if (mediaProto && typeof originalMediaCapture === 'function') {
    (mediaProto as any).captureStream = function () {
      throw refuse('captureStream', 'HTMLMediaElement.captureStream');
    };
    restores.push(() => { (mediaProto as any).captureStream = originalMediaCapture; });
  }

  if (!originalGetDisplayMedia && !originalLegacyGetDisplayMedia) {
    console.warn('[ScreenRecordingGuard] getDisplayMedia unavailable — in-page capture block reduced.');
  }
  console.log('[ScreenRecordingGuard] installed', { patches: restores.length });

  return () => {
    // Restore in reverse so a later patch layered on an earlier one unwinds
    // cleanly.
    restores.reverse().forEach((restore) => {
      try { restore(); } catch { /* a page teardown must never throw here */ }
    });
    console.log('[ScreenRecordingGuard] uninstalled');
  };
}

/**
 * Install the capture guard. Idempotent and ref-counted so React StrictMode's
 * double-invoke, or two components asking for protection, cannot end up with a
 * patch layered on a patch (whose cleanup would restore a *patched* function and
 * leave the page permanently guarded, or permanently unguarded).
 */
export function installScreenCaptureGuard(): Uninstall {
  installDepth += 1;
  if (installDepth === 1) activeUninstall = install();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installDepth = Math.max(0, installDepth - 1);
    if (installDepth === 0 && activeUninstall) {
      activeUninstall();
      activeUninstall = null;
    }
  };
}

/** True while the capture guard is patched in. Exposed for tests and diagnostics. */
export function isScreenCaptureGuardInstalled(): boolean {
  return installDepth > 0;
}
