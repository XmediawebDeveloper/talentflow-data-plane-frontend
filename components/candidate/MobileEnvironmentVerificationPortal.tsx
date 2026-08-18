'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const verifyApi = axios.create({ baseURL: API_BASE_URL });

type Phase =
  | 'loading'
  | 'expired'
  | 'error'
  | 'instructions'
  | 'requesting_permission'
  | 'get_ready'
  | 'permission_denied'
  | 'recording_screen'
  | 'pan_instructions'
  | 'recording_pan'
  | 'ready_to_submit'
  | 'uploading'
  | 'done';

const RECORD_SCREEN_MS = 5000;
// Not padded — the display/color+ID phase must stay exactly the real 5s
// the backend's per-second RGB check expects (it samples timestamps
// 0.5s-4.5s of the file).
//
// RECORD_PAN_MS below carries a small +50ms buffer instead of the bare
// 5000 — the ONLY phase touched, per instruction. Real uploads measured via
// ffprobe on a genuine 5000+5000ms recording came in at ~9.9827s and
// ~9.9846s (both ~15-18ms short of 10.0s) from ordinary WebM encoder/
// container overhead — a universal browser-recording artifact, not missing
// footage, and not something JS timing precision alone can eliminate. A
// prior version padded this phase by +300ms to fix the native <video>
// player's floor()'d time display, which was reverted for adding too much
// real recording time beyond 10s. This smaller +50ms is sized only to
// comfortably clear that ~15-18ms shortfall with margin, not to visibly
// extend the recording — total real content is ~10.03-10.05s, effectively
// indistinguishable from 10s to the candidate, while reliably pushing the
// file's measured duration past the 10.0s floor threshold.
const RECORD_PAN_MS = 5050;
const GET_READY_SECONDS = 3;

interface MobileEnvironmentVerificationPortalProps {
  token: string;
}

/**
 * Mobile-browser page opened by scanning the laptop's QR code. Follows the
 * "AI Interview-Proxy Integrity Verification" spec's Steps 2-6:
 *   2. Camera/mic permission (no app install)
 *   3. Guided instructions screen (candidate taps Next to proceed)
 *   4. Recording phase 1 (5s) — capture the laptop's dynamic color+ID panel
 *   5. Recording phase 2 (5s) — pan the surroundings
 *   6. Explicit submit — candidate reviews and taps Upload rather than an
 *      automatic upload, so they know their recording is going somewhere.
 *
 * Deliberately does NOT fetch or display the anti-replay challenge
 * (color/ID) — that's shown only on the laptop, so the phone's job is purely
 * to film it, never to know the answer in advance.
 */
export function MobileEnvironmentVerificationPortal({ token }: MobileEnvironmentVerificationPortalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [getReadyCount, setGetReadyCount] = useState(GET_READY_SECONDS);
  // Two SEPARATE 5s countdowns (resets at the phase switch), not one
  // continuous 10s countdown — matches the spec's own wording ("start 5 secs
  // timer" for phase 1, "another 5 secs timer" for phase 2).
  const [recordingCountdown, setRecordingCountdown] = useState(5);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Resolver for the "waiting on the candidate to tap Next" promise during
  // the pan-instructions pause (below) — set while that phase is showing,
  // called by the Next button's onClick, then cleared.
  const panNextResolveRef = useRef<(() => void) | null>(null);
  const handlePanNext = () => {
    panNextResolveRef.current?.();
    panNextResolveRef.current = null;
  };

  // Landscape enforcement — spec explicitly requires "a 10-second video ...
  // in Landscape mode" (Step 3); previously this was only stated as text on
  // the instructions screen with nothing actually checking it. Blocks
  // permission/recording/upload with a rotate-prompt overlay whenever the
  // device is in portrait, so a candidate can't proceed holding the phone
  // the wrong way. Does not touch recording/timer/upload logic — purely a
  // gate rendered on top.
  const [isLandscape, setIsLandscape] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const update = () => setIsLandscape(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await verifyApi.get(`/candidate/environment-verify/${token}`);
        if (!cancelled) setPhase('instructions');
      } catch (err: unknown) {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 410) {
          setErrorMessage('This verification link has expired or was already used.');
          setPhase('expired');
        } else {
          setErrorMessage('Verification link not found.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Guards against starting this lifecycle more than once — covers React
  // StrictMode's double-invoke in dev, rapid double-taps on Next, and any
  // other re-entrancy. Once true, startVerificationFlow() is a no-op.
  const startedRef = useRef(false);

  // ── The entire permission → get-ready → record → stop lifecycle ──
  //
  // ROOT CAUSE OF THE "stuck after countdown" BUG (fixed here): this used to
  // live inside a `useEffect(() => {...}, [phase])`. That effect called
  // `setPhase(...)` on itself multiple times (to 'get_ready', then later
  // 'recording_screen'/'recording_pan') — and since `phase` was the effect's
  // own dependency, every one of those internal setPhase calls caused React
  // to tear down and re-run the effect. The teardown's `cancelled = true`
  // poisoned the ORIGINAL running countdown/recording closures (they all
  // checked the same `cancelled` variable each tick), so the very first
  // internal phase change silently killed the countdown before it ever
  // reached zero — recorder.start() was never called, and the UI froze on
  // "Get ready — recording starts now…" exactly as reported.
  //
  // Fix: this is now a plain async function, called ONCE from the Next
  // button's onClick — not a useEffect — so no internal setState call can
  // ever retrigger it. Timing is elapsed-time based (Date.now() deltas)
  // rather than chained setTimeout, so drift/re-render timing can't cause
  // a phase to be skipped or double-fired.
  const startVerificationFlow = async () => {
    if (startedRef.current) return; // prevents any double-entry
    startedRef.current = true;

    setPhase('requesting_permission');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
    } catch {
      setPhase('permission_denied');
      return;
    }

    // Verify the stream actually has a live video track before proceeding —
    // per spec, never enable the countdown on an invalid stream.
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      stream.getTracks().forEach(t => t.stop());
      setErrorMessage('Camera stream could not be started. Please try again.');
      setPhase('permission_denied');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => { /* autoplay may need a user gesture on some browsers; recording still proceeds */ });
    }

    const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm']
      .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
    if (!mimeType && typeof MediaRecorder === 'undefined') {
      stream.getTracks().forEach(t => t.stop());
      setErrorMessage('Video recording is not supported in this browser.');
      setPhase('permission_denied');
      return;
    }
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      console.info('[ENV-VERIFY] Recording stopped');
      streamRef.current?.getTracks().forEach(t => t.stop());
      // Blob validation (spec #17) before ever offering Upload — never show
      // a fake success state on an empty/invalid recording.
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      console.info('[ENV-VERIFY] Video blob created');
      console.info(`[ENV-VERIFY] Video size: ${blob.size}`);
      console.info(`[ENV-VERIFY] Video type: ${blob.type}`);
      if (!blob || blob.size === 0) {
        console.warn('[ENV-VERIFY] Empty blob — recording failed, refusing to advance to submit');
        setErrorMessage('Recording failed. Please close this page and rescan the QR code to try again.');
        setPhase('error');
        return;
      }
      setPhase('ready_to_submit');
    };
    recorderRef.current = recorder;

    // Elapsed-time-based countdown/phase driver (spec #27) — a single
    // 200ms-tick interval computes each stage from Date.now() deltas rather
    // than chaining setTimeout durations, so rendering delays can't cause
    // drift or a skipped transition.
    const getReadyStart = Date.now();
    setGetReadyCount(GET_READY_SECONDS);
    setPhase('get_ready');

    await new Promise<void>(resolve => {
      const tick = setInterval(() => {
        const elapsedSec = (Date.now() - getReadyStart) / 1000;
        const remaining = Math.max(0, Math.ceil(GET_READY_SECONDS - elapsedSec));
        if (elapsedSec >= GET_READY_SECONDS) {
          clearInterval(tick);
          resolve();
        } else {
          setGetReadyCount(remaining);
        }
      }, 200);
    });

    // Guard: only ever call .start() once, and only if not already recording
    // (spec #5, #28) — verify actual recorder.state afterward rather than
    // assuming success.
    if (recorderRef.current && (recorderRef.current.state as string) !== 'recording') {
      recorderRef.current.start();
      const stateAfterStart: string = recorderRef.current.state;
      if (stateAfterStart !== 'recording') {
        console.warn(`[ENV-VERIFY] Recording could not be started — recorder.state=${stateAfterStart}`);
        setErrorMessage('Recording could not be started. Please try again.');
        setPhase('error');
        return;
      }
      console.info('[ENV-VERIFY] Recording started');
      // Tell the backend the INSTANT recording is confirmed live — this is
      // what the laptop's 1-color-per-second RGB cycle syncs to, not link-
      // open time, so candidate-side delays (reading instructions, granting
      // permission) never desync the sequence from what's actually being
      // filmed. Best-effort/fire-and-forget: a failed push just means the
      // laptop keeps showing color #1 a little longer — never blocks the
      // phone's own recording, which is already running by this point.
      verifyApi.post(`/candidate/environment-verify/${token}/recording-started`).catch(() => { /* best-effort */ });
    }

    const runElapsedPhase = (nextPhase: Phase, durationMs: number) => new Promise<void>(resolve => {
      const phaseStart = Date.now();
      setPhase(nextPhase);
      setRecordingCountdown(Math.round(durationMs / 1000));
      const tick = setInterval(() => {
        const elapsedMs = Date.now() - phaseStart;
        const remaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
        if (elapsedMs >= durationMs) {
          clearInterval(tick);
          resolve();
        } else {
          setRecordingCountdown(remaining);
        }
      }, 200);
    });

    await runElapsedPhase('recording_screen', RECORD_SCREEN_MS);

    // Pause the ACTUAL recorder (not just a countdown/overlay) while showing
    // the transition instructions, and resume only on an explicit Next tap.
    // MediaRecorder excludes paused wall-clock time from the output stream
    // entirely — recorded content picks up again exactly where it left off —
    // so however long the candidate takes to read the instructions, the
    // final video is still exactly 5s (screen) + 5s (pan) = 10s, never more.
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause();
      const stateAfterPause: string = recorderRef.current.state;
      if (stateAfterPause !== 'paused') {
        console.warn(`[ENV-VERIFY] Recorder did not pause — state=${stateAfterPause}, continuing without pause`);
      } else {
        console.info('[ENV-VERIFY] Recording paused for pan instructions');
        setPhase('pan_instructions');
        await new Promise<void>(resolve => { panNextResolveRef.current = resolve; });
        recorderRef.current?.resume();
        const stateAfterResume: string = recorderRef.current?.state || '';
        if (stateAfterResume !== 'recording') {
          console.warn(`[ENV-VERIFY] Recording could not resume — state=${stateAfterResume}`);
          setErrorMessage('Recording could not resume. Please close this page and rescan the QR code to try again.');
          setPhase('error');
          return;
        }
        console.info('[ENV-VERIFY] Recording resumed');
      }
    }

    await runElapsedPhase('recording_pan', RECORD_PAN_MS);
    recorderRef.current?.stop(); // triggers onstop → Blob validation → ready_to_submit
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleSubmit = async () => {
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'video/webm' });
    // Re-validate at submit time too (spec #15: never call submit as if the
    // video was uploaded on an empty/invalid Blob) — the onstop check above
    // already guards the ready_to_submit transition, but this is the actual
    // upload call site and must not trust that state alone.
    if (!blob || blob.size === 0) {
      console.warn('[ENV-VERIFY] Empty blob at submit time — refusing to upload');
      setErrorMessage('Recording is empty or unavailable. Please close this page and rescan the QR code to try again.');
      setPhase('error');
      return;
    }
    setPhase('uploading');
    console.info('[ENV-VERIFY] Upload started');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'env_verify.webm');
      const res = await verifyApi.post(`/candidate/environment-verify/${token}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Trust the backend's explicit confirmation, not just a 2xx status —
      // video_uploaded=true is only ever returned after storage AND the DB
      // commit both succeeded (spec #15/#6).
      if (!res?.data?.video_uploaded) {
        console.warn('[ENV-VERIFY] Upload response did not confirm persistence — treating as failure');
        setErrorMessage('Upload could not be confirmed. Please close this page and rescan the QR code to try again.');
        setPhase('error');
        return;
      }
      console.info('[ENV-VERIFY] Upload completed');
      setPhase('done');
    } catch (err) {
      console.warn('[ENV-VERIFY] Upload failed', err);
      setErrorMessage('Upload failed. Please close this page and rescan the QR code to try again.');
      setPhase('error');
    }
  };

  const orientationGateActive =
    !isLandscape &&
    phase !== 'loading' && phase !== 'expired' && phase !== 'error' && phase !== 'done';

  return (
    <div className="min-h-screen bg-[#0F1929] text-white flex flex-col items-center justify-center p-6 text-center">
      {orientationGateActive && (
        <div className="fixed inset-0 z-50 bg-[#0F1929] flex flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="text-6xl inline-block animate-[tf-rotate-hint_1.6s_ease-in-out_infinite]">📱</span>
          <h1 className="text-lg font-semibold">Rotate your phone</h1>
          <p className="text-sm text-[#94a3b8] max-w-xs">
            This verification must be recorded in landscape (horizontal) mode. Please turn your phone sideways to continue.
          </p>
          <style>{`
            @keyframes tf-rotate-hint {
              0%, 100% { transform: rotate(0deg); }
              50% { transform: rotate(90deg); }
            }
          `}</style>
        </div>
      )}
      {phase === 'loading' && <p className="text-[#94a3b8]">Loading verification…</p>}

      {(phase === 'expired' || phase === 'error') && (
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Unable to verify</h1>
          <p className="text-sm text-[#94a3b8]">{errorMessage}</p>
        </div>
      )}

      {phase === 'instructions' && (
        <div className="max-w-sm space-y-5">
          <h1 className="text-lg font-semibold">Environment Verification</h1>
          <div className="text-sm text-[#cbd5e1] leading-relaxed text-left space-y-3 bg-white/5 rounded-xl p-4 border border-white/10">
            <p>
              Please record a <strong className="text-white">10-second video</strong> of your interview
              setup in <strong className="text-white">landscape mode</strong>. Ensure your laptop screen
              is visible throughout the recording.
            </p>
            <p>Slowly move your mobile phone:</p>
            <ul className="list-disc list-inside space-y-1 text-[#94a3b8]">
              <li>Left to Right</li>
              <li>Right to Left</li>
            </ul>
            <p>Keep your recording steady until instructed.</p>
          </div>
          <button
            type="button"
            onClick={() => { void startVerificationFlow(); }}
            className="w-full py-3 rounded-xl bg-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Next
          </button>
        </div>
      )}

      {phase === 'requesting_permission' && (
        <p className="text-[#94a3b8]">Requesting camera access…</p>
      )}

      {phase === 'permission_denied' && (
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Camera access needed</h1>
          <p className="text-sm text-[#94a3b8]">
            Please allow camera and microphone access in your browser settings, then rescan the QR code.
          </p>
        </div>
      )}

      {/* Always mounted (not conditional on phase) so videoRef.current is
          already available the instant getUserMedia resolves, above —
          otherwise the stream has nowhere to attach to and the preview
          stays black even though recording is happening. Hidden outside
          the get-ready/recording phases via `hidden` rather than unmounted. */}
      <div className={`w-full max-w-sm space-y-4 ${(phase === 'get_ready' || phase === 'recording_screen' || phase === 'pan_instructions' || phase === 'recording_pan') ? '' : 'hidden'}`}>
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video rounded-xl bg-black object-cover"
          />
          {phase === 'get_ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
              <span className="text-6xl font-bold text-white drop-shadow-lg">{getReadyCount}</span>
            </div>
          )}
          {phase === 'pan_instructions' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 rounded-xl px-4 overflow-hidden">
              <div className="flex items-center gap-2 animate-[tf-pan-sweep_2.4s_ease-in-out_infinite]">
                <span className="text-3xl inline-block leading-none animate-[tf-arrow-flip_2.4s_ease-in-out_infinite]">➜</span>
                <span className="text-5xl inline-block leading-none">📱</span>
              </div>
              <p className="text-sm font-medium text-white text-center">
                Now slowly move your phone from left to right and back again — capture your workspace, surrounding area, and any nearby devices.
              </p>
              <style>{`
                @keyframes tf-pan-sweep {
                  0%   { transform: translateX(-120px); }
                  50%  { transform: translateX(120px); }
                  100% { transform: translateX(-120px); }
                }
                @keyframes tf-arrow-flip {
                  0%, 49.9%  { transform: scaleX(1); }
                  50%, 99.9% { transform: scaleX(-1); }
                  100%       { transform: scaleX(1); }
                }
              `}</style>
            </div>
          )}
        </div>
        {phase === 'get_ready' ? (
          <p className="text-sm leading-relaxed font-medium">Get ready — recording starts now…</p>
        ) : phase === 'pan_instructions' ? (
          <>
            <div className="flex items-center justify-center gap-2 text-amber-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Recording paused
            </div>
            <button
              type="button"
              onClick={handlePanNext}
              className="w-full py-3 rounded-xl bg-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Next
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording
              <span className="text-white font-mono">· {recordingCountdown}s</span>
            </div>
            <p className="text-sm leading-relaxed">
              {phase === 'recording_screen'
                ? 'Focus your camera on your laptop screen/display. Keep it centered and hold steady — do not move yet.'
                : 'Now slowly move your phone from left to right and back again, capturing your workspace, surrounding area, and any nearby devices.'}
            </p>
          </>
        )}
      </div>

      {phase === 'ready_to_submit' && (
        <div className="max-w-sm space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="text-lg font-semibold">Recording complete</h1>
          <p className="text-sm text-[#94a3b8]">
            Your 10-second verification video is ready. Tap Upload to submit it and resume your interview.
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl bg-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Upload
          </button>
        </div>
      )}

      {phase === 'uploading' && <p className="text-[#94a3b8]">Uploading…</p>}

      {phase === 'done' && (
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Verification submitted</h1>
          <p className="text-sm text-[#94a3b8]">
            You can put your phone down — your interview is resuming on your laptop.
          </p>
        </div>
      )}
    </div>
  );
}
