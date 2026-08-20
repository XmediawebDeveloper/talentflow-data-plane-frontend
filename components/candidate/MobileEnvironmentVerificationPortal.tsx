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
  | 'aligning'
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

// ── Screen-alignment detection (gates Record button visibility) ──
// No existing alignment/detection logic exists anywhere in this codebase, so
// this is a new, best-effort, purely client-side heuristic: after the phone
// opens this link, the laptop already shows the anti-replay challenge (a
// solid background color + a short ID — see EnvironmentVerificationOverlay
// on the laptop side), so "is the laptop screen aligned in frame" reduces to
// "is there one large, roughly uniform-colored, centered, non-edge-touching
// rectangular region in the camera view." This intentionally does NOT try to
// detect the exact screen edges/corners or correct for tilt precisely — it's
// a coarse, honest signal, tuned conservatively (see ACCEPTANCE TEST cases).
const ALIGN_SAMPLE_W = 160; // downscaled analysis canvas width
const ALIGN_CHECK_INTERVAL_MS = 300;
const ALIGN_PASS_STREAK_NEEDED = 3; // ~0.9s of consecutive PASS before showing Record
const ALIGN_FAIL_STREAK_NEEDED = 2; // ~0.6s of consecutive FAIL before hiding Record
// 110 (not a tight ~40-50) — real screens show a brightness gradient/
// vignette from center to edge, not a flat color; a tight tolerance only
// matches a thin band of that gradient and never covers the whole screen
// (confirmed live 2026-08-19 — see the seed-sampling comment below). Still
// comfortably excludes the near-black bezel and most desk/background colors.
const ALIGN_COLOR_DISTANCE = 110; // RGB distance to count a pixel as "part of the screen"

// ── Fixed viewfinder guide (corner-bracket outline) ──
// Replaces free-floating "find the screen anywhere in frame" bbox search
// with a much simpler, more predictable rule the candidate can directly see
// and act on: a fixed outline is drawn over the camera preview (matching a
// viewfinder-reticle reference the user provided 2026-08-19) and the ONLY
// question the algorithm answers is "is this rectangle mostly filled with
// one uniform color" — i.e. did the candidate actually fit their laptop
// screen inside the visible brackets. As fractions of the analysis frame
// (which now matches the visible preview crop exactly — see the
// object-cover mirroring above).
const GUIDE_X0 = 0.12;
const GUIDE_X1 = 0.88;
const GUIDE_Y0 = 0.16;
const GUIDE_Y1 = 0.84;
const ALIGN_GUIDE_MIN_DENSITY = 0.62; // fraction of guide-rect pixels that must match the seed color

// ── Voice activity detection (VAD) — runs only while actually recording ──
// Web Audio API only (no new library) on the SAME getUserMedia stream
// already captured for the recording. Deliberately more than a volume
// threshold (spec explicitly forbids that): requires BOTH sustained energy
// above an auto-calibrated noise floor AND a zero-crossing-rate in the band
// typical of voiced speech (very low ZCR ≈ steady hums/fans; very high ZCR ≈
// hiss/fricative noise/static) for several consecutive ticks before counting
// it as speech — a single loud click or a steady fan/AC hum should not pass
// both gates.
const VAD_TICK_MS = 100;
const VAD_CALIBRATION_MS = 700; // brief window to measure this room's own noise floor
const VAD_MIN_THRESHOLD = 0.02; // floor for VAD_THRESHOLD_MULT below, even in a dead-silent room
const VAD_THRESHOLD_MULT = 3.5; // speech energy must exceed noiseFloor * this
const VAD_ZCR_MIN = 0.02;
const VAD_ZCR_MAX = 0.35;
const VAD_ON_STREAK_NEEDED = 3; // ~300ms sustained before flipping to DETECTED — rejects clicks/transients
const VAD_OFF_STREAK_NEEDED = 5; // ~500ms of quiet before flipping back — avoids flicker mid-sentence

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
  // Two SEPARATE 5s countdowns (resets at the phase switch), not one
  // continuous 10s countdown — matches the spec's own wording ("start 5 secs
  // timer" for phase 1, "another 5 secs timer" for phase 2).
  const [recordingCountdown, setRecordingCountdown] = useState(5);
  // Drives Record button visibility ONLY — see ALIGN_* constants above.
  const [canRecord, setCanRecord] = useState(false);
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

  // ── Screen alignment ──
  const alignCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const alignIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alignPassStreakRef = useRef(0);
  const alignFailStreakRef = useRef(0);
  const lastLoggedAlignRef = useRef<boolean | null>(null);
  const lastLoggedButtonShownRef = useRef<boolean | null>(null);

  // ── Manual Record click gate — startVerificationFlow awaits this instead
  // of any timer/countdown (req #10: "NEVER automatically start recording
  // merely because the screen becomes aligned"). ──
  const recordClickResolveRef = useRef<(() => void) | null>(null);
  const recordClickedRef = useRef(false); // guards against double-clicks (req #5/F)
  const [recordClicked, setRecordClicked] = useState(false);

  // ── Voice activity detection — see VAD_* constants above. ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadOnStreakRef = useRef(0);
  const vadOffStreakRef = useRef(0);
  const vadActiveRef = useRef(false);
  const vadCalibrationSamplesRef = useRef<number[]>([]);
  const vadNoiseFloorRef = useRef<number | null>(null);
  const vadStartedAtRef = useRef(0);
  const vadElapsedRecordingMsRef = useRef(0);
  const vadLastTickAtRef = useRef(0);
  const voiceEventsRef = useRef<number[]>([]); // millisecond offsets of DETECTED transitions

  const stopVoiceMonitoring = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { /* best-effort */ });
      audioCtxRef.current = null;
    }
  };

  const startVoiceMonitoring = (stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return; // no mic track — nothing to monitor
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      // Deliberately NOT connected to audioCtx.destination — this is
      // analysis-only, connecting to destination would cause audio feedback.
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      vadOnStreakRef.current = 0;
      vadOffStreakRef.current = 0;
      vadActiveRef.current = false;
      vadCalibrationSamplesRef.current = [];
      vadNoiseFloorRef.current = null;
      vadStartedAtRef.current = Date.now();
      vadElapsedRecordingMsRef.current = 0;
      vadLastTickAtRef.current = Date.now();
      voiceEventsRef.current = [];

      const buf = new Float32Array(analyser.fftSize);
      vadIntervalRef.current = setInterval(() => {
        const analyserNode = analyserRef.current;
        const now = Date.now();
        const delta = now - vadLastTickAtRef.current;
        vadLastTickAtRef.current = now;
        // Only accumulate "recording time" (and only analyze) while the
        // recorder is ACTUALLY recording — MediaRecorder.pause() (used
        // around the pan-instructions transition) excludes that wall time
        // from the final video, so voice-event offsets must too.
        if (!analyserNode || recorderRef.current?.state !== 'recording') return;
        vadElapsedRecordingMsRef.current += delta;

        analyserNode.getFloatTimeDomainData(buf);
        let sumSquares = 0;
        let zeroCrossings = 0;
        for (let i = 0; i < buf.length; i++) {
          sumSquares += buf[i] * buf[i];
          if (i > 0 && ((buf[i] >= 0) !== (buf[i - 1] >= 0))) zeroCrossings++;
        }
        const rms = Math.sqrt(sumSquares / buf.length);
        const zcr = zeroCrossings / buf.length;

        // Calibrate this room's noise floor from the first
        // VAD_CALIBRATION_MS of actual recording — never flags as speech
        // during calibration itself.
        if (vadNoiseFloorRef.current === null) {
          vadCalibrationSamplesRef.current.push(rms);
          if (now - vadStartedAtRef.current >= VAD_CALIBRATION_MS) {
            const samples = vadCalibrationSamplesRef.current;
            const avg = samples.reduce((s, v) => s + v, 0) / (samples.length || 1);
            vadNoiseFloorRef.current = avg;
          }
          return;
        }

        const threshold = Math.max(vadNoiseFloorRef.current * VAD_THRESHOLD_MULT, VAD_MIN_THRESHOLD);
        const qualifies = rms > threshold && zcr > VAD_ZCR_MIN && zcr < VAD_ZCR_MAX;

        if (qualifies) {
          vadOnStreakRef.current += 1;
          vadOffStreakRef.current = 0;
        } else {
          vadOffStreakRef.current += 1;
          vadOnStreakRef.current = 0;
        }

        if (!vadActiveRef.current && vadOnStreakRef.current >= VAD_ON_STREAK_NEEDED) {
          vadActiveRef.current = true;
          const offsetMs = Math.round(vadElapsedRecordingMsRef.current);
          voiceEventsRef.current.push(offsetMs);
          console.info(`[ENV-VERIFY] Voice activity: DETECTED (offset=${offsetMs}ms)`);
        } else if (vadActiveRef.current && vadOffStreakRef.current >= VAD_OFF_STREAK_NEEDED) {
          vadActiveRef.current = false;
          console.info('[ENV-VERIFY] Voice activity: NOT DETECTED');
        }
      }, VAD_TICK_MS);
    } catch (e) {
      console.warn('[ENV-VERIFY] Voice activity monitoring could not be started', e);
    }
  };

  // ── Screen-alignment detection loop — see constants above for the "one
  // large, roughly uniform, centered, non-edge-touching region" heuristic. ──
  const stopAlignmentLoop = () => {
    if (alignIntervalRef.current) {
      clearInterval(alignIntervalRef.current);
      alignIntervalRef.current = null;
    }
  };

  const startAlignmentLoop = () => {
    alignPassStreakRef.current = 0;
    alignFailStreakRef.current = 0;
    lastLoggedAlignRef.current = null;
    lastLoggedButtonShownRef.current = null;
    if (!alignCanvasRef.current) {
      alignCanvasRef.current = document.createElement('canvas');
    }
    const canvas = alignCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    alignIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

      // Analyze the SAME crop the candidate actually sees, not the full raw
      // camera frame. The <video> preview below is styled `aspect-video
      // object-cover` — CSS crops the raw feed to a 16:9 box (cutting off
      // top/bottom or left/right depending on the phone camera's native
      // aspect ratio). Previously this canvas drew the ENTIRE uncropped raw
      // frame, so a screen that looked perfectly centered/full-frame in the
      // visible preview could still fail area/centering checks against the
      // larger, differently-proportioned real frame the algorithm was
      // actually scoring (confirmed live 2026-08-19: several fully-visible,
      // well-centered previews never passed alignment). Mirroring the exact
      // same object-cover crop here keeps what's analyzed identical to what
      // the candidate is looking at and aligning to.
      const w = ALIGN_SAMPLE_W;
      const targetAspect = 16 / 9; // matches the preview's `aspect-video` class
      const h = Math.round(w / targetAspect);
      canvas.width = w;
      canvas.height = h;
      const nativeAspect = video.videoWidth / video.videoHeight;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (nativeAspect > targetAspect) {
        // Native frame is relatively wider than the box — object-cover crops the sides.
        sw = Math.round(video.videoHeight * targetAspect);
        sx = Math.round((video.videoWidth - sw) / 2);
      } else if (nativeAspect < targetAspect) {
        // Native frame is relatively taller than the box — object-cover crops top/bottom.
        sh = Math.round(video.videoWidth / targetAspect);
        sy = Math.round((video.videoHeight - sh) / 2);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

      let pass = false;
      try {
        const { data } = ctx.getImageData(0, 0, w, h);
        // Guide-rect bounds in canvas pixels — same fixed box drawn as the
        // corner-bracket overlay on the preview (GUIDE_X0/X1/Y0/Y1 above).
        const gx0 = Math.round(w * GUIDE_X0);
        const gx1 = Math.round(w * GUIDE_X1);
        const gy0 = Math.round(h * GUIDE_Y0);
        const gy1 = Math.round(h * GUIDE_Y1);

        // Seed color = the center of the GUIDE RECT (not the whole frame).
        // The laptop screen's background is a solid color only in
        // principle — real screens show a visible brightness gradient/
        // vignette (confirmed 2026-08-19 live: a well-centered, fully-
        // visible screen still failed a tight/whole-frame match because of
        // this). Sampling inside the guide box the candidate is filling
        // reliably lands ON the screen once aligned.
        const seedBoxW = Math.max(2, Math.round((gx1 - gx0) * 0.15));
        const seedBoxH = Math.max(2, Math.round((gy1 - gy0) * 0.15));
        const seedX0 = Math.round((gx0 + gx1) / 2 - seedBoxW / 2);
        const seedY0 = Math.round((gy0 + gy1) / 2 - seedBoxH / 2);
        let seedR = 0, seedG = 0, seedB = 0, seedN = 0;
        for (let y = seedY0; y < seedY0 + seedBoxH; y++) {
          for (let x = seedX0; x < seedX0 + seedBoxW; x++) {
            const i = (y * w + x) * 4;
            seedR += data[i]; seedG += data[i + 1]; seedB += data[i + 2];
            seedN++;
          }
        }
        if (seedN > 0) {
          const domR = seedR / seedN;
          const domG = seedG / seedN;
          const domB = seedB / seedN;

          // Only question that matters now: is the fixed guide rectangle
          // itself mostly filled with one uniform color — i.e. did the
          // candidate actually fit their laptop screen inside the visible
          // brackets. No more free-floating bbox search across the whole
          // frame (replaced 2026-08-19 per a viewfinder-reticle reference —
          // simpler and matches exactly what the candidate can see and act on).
          let matched = 0;
          const guideArea = (gx1 - gx0) * (gy1 - gy0);
          for (let y = gy0; y < gy1; y++) {
            for (let x = gx0; x < gx1; x++) {
              const i = (y * w + x) * 4;
              const dr = data[i] - domR, dg = data[i + 1] - domG, db = data[i + 2] - domB;
              if (Math.sqrt(dr * dr + dg * dg + db * db) <= ALIGN_COLOR_DISTANCE) matched++;
            }
          }
          const density = guideArea > 0 ? matched / guideArea : 0;
          pass = density >= ALIGN_GUIDE_MIN_DENSITY;
        }
      } catch (e) {
        // getImageData can throw on a tainted canvas in rare cross-origin
        // setups — never crash the alignment loop over it, just fail this tick.
        console.warn('[ENV-VERIFY] Alignment check failed', e);
        pass = false;
      }

      if (pass) {
        alignPassStreakRef.current += 1;
        alignFailStreakRef.current = 0;
      } else {
        alignFailStreakRef.current += 1;
        alignPassStreakRef.current = 0;
      }

      if (lastLoggedAlignRef.current !== pass) {
        lastLoggedAlignRef.current = pass;
        console.info(`[ENV-VERIFY] Screen alignment: ${pass ? 'PASS' : 'FAIL'}`);
      }

      setCanRecord(prev => {
        let next = prev;
        if (!prev && alignPassStreakRef.current >= ALIGN_PASS_STREAK_NEEDED) next = true;
        else if (prev && alignFailStreakRef.current >= ALIGN_FAIL_STREAK_NEEDED) next = false;
        if (lastLoggedButtonShownRef.current !== next) {
          lastLoggedButtonShownRef.current = next;
          console.info(`[ENV-VERIFY] Record button: ${next ? 'SHOWN' : 'HIDDEN'}`);
        }
        return next;
      });
    }, ALIGN_CHECK_INTERVAL_MS);
  };

  // Candidate manually taps Record. Guards against multiple clicks (req #5/F)
  // and against clicking while alignment hasn't actually passed (mirrors the
  // button's own disabled/hidden state as a second line of defense). Only
  // resolves the promise startVerificationFlow is awaiting — no timer, no
  // delay; MediaRecorder.start() is the very next statement that runs.
  const handleRecordClick = () => {
    if (recordClickedRef.current || !canRecord) return;
    recordClickedRef.current = true;
    setRecordClicked(true);
    recordClickResolveRef.current?.();
    recordClickResolveRef.current = null;
  };

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
      console.info('[ENV-VERIFY] Recording: STOPPED');
      stopAlignmentLoop();
      stopVoiceMonitoring();
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

    // ── Alignment-gated Record button — replaces the old fixed "get ready"
    // countdown entirely. No auto-start: camera stays open showing a live
    // preview while startAlignmentLoop() continuously evaluates the frame;
    // the Record button only becomes clickable once alignment passes (see
    // canRecord), and this function does not proceed past this point until
    // the candidate actually clicks it (recordClickResolveRef, resolved by
    // handleRecordClick below) — never on a timer. ──
    recordClickedRef.current = false;
    setRecordClicked(false);
    setCanRecord(false);
    setPhase('aligning');
    startAlignmentLoop();

    await new Promise<void>(resolve => { recordClickResolveRef.current = resolve; });
    stopAlignmentLoop();

    // Guard: only ever call .start() once, and only if not already recording
    // (spec #5, #28) — verify actual recorder.state afterward rather than
    // assuming success. No setTimeout/delay of any kind between the
    // candidate's click (handleRecordClick) and this call — the click
    // resolves the promise above synchronously, and this is the very next
    // statement to run.
    if (recorderRef.current && (recorderRef.current.state as string) !== 'recording') {
      recorderRef.current.start();
      const stateAfterStart: string = recorderRef.current.state;
      if (stateAfterStart !== 'recording') {
        console.warn(`[ENV-VERIFY] Recording could not be started — recorder.state=${stateAfterStart}`);
        setErrorMessage('Recording could not be started. Please try again.');
        setPhase('error');
        return;
      }
      console.info('[ENV-VERIFY] Recording: STARTED');
      startVoiceMonitoring(stream);
      // Tell the backend the INSTANT recording is confirmed live — this is
      // what the laptop's 1-color-per-second RGB cycle syncs to, not link-
      // open time, so candidate-side delays (reading instructions, granting
      // permission, aligning the screen) never desync the sequence from
      // what's actually being filmed. Best-effort/fire-and-forget: a failed
      // push just means the laptop keeps showing color #1 a little longer —
      // never blocks the phone's own recording, which is already running by
      // this point.
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
      stopAlignmentLoop();
      stopVoiceMonitoring();
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
    console.info('[ENV-VERIFY] Upload: STARTED');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'env_verify.webm');
      // Best-effort — the video upload itself must never depend on this.
      if (voiceEventsRef.current.length > 0) {
        formData.append('voice_events', JSON.stringify(voiceEventsRef.current));
      }
      const res = await verifyApi.post(`/candidate/environment-verify/${token}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Trust the backend's explicit confirmation, not just a 2xx status —
      // video_uploaded=true is only ever returned after storage AND the DB
      // commit both succeeded (spec #15/#6).
      if (!res?.data?.video_uploaded) {
        console.warn('[ENV-VERIFY] Upload: FAILED (response did not confirm persistence)');
        setErrorMessage('Upload could not be confirmed. Please close this page and rescan the QR code to try again.');
        setPhase('error');
        return;
      }
      console.info('[ENV-VERIFY] Upload: SUCCESS');
      setPhase('done');
    } catch (err) {
      console.warn('[ENV-VERIFY] Upload: FAILED', err);
      setErrorMessage('Upload failed. Please close this page and rescan the QR code to try again.');
      setPhase('error');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0F1929] text-white flex flex-col items-center justify-center p-6 text-center">
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
          <div className="text-sm text-[#cbd5e1] leading-relaxed text-left space-y-4 bg-white/5 rounded-xl p-4 border border-white/10">
            <p>
              You'll record a <strong className="text-white">10-second video</strong> in{' '}
              <strong className="text-white">landscape mode</strong>, in two steps:
            </p>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-blue/20 text-brand-blue text-xs font-bold flex items-center justify-center mt-0.5">1</span>
              <p>
                <strong className="text-white">First 5 seconds</strong> — focus your camera on your
                laptop screen/display. It will show a changing color and a unique ID; keep it
                centered and hold steady.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-blue/20 text-brand-blue text-xs font-bold flex items-center justify-center mt-0.5">2</span>
              <div className="flex-1">
                <p>
                  <strong className="text-white">Next 5 seconds</strong> — slowly move your phone from
                  left to right and back again, capturing your workspace, surrounding area, and any
                  nearby devices.
                </p>
                <div className="mt-2 flex items-center gap-1.5 px-2">
                  <span className="text-xl inline-block animate-[tf-instr-curve_1.6s_ease-in-out_infinite_alternate]">📱</span>
                  <span className="text-[11px] text-[#94a3b8]">left ↔ right</span>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void startVerificationFlow(); }}
            className="w-full py-3 rounded-xl bg-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Next
          </button>
          <style>{`
            @keyframes tf-instr-curve {
              0%   { transform: translateX(-8px) translateY(0) rotate(-12deg); }
              50%  { transform: translateX(0)     translateY(-4px) rotate(0deg); }
              100% { transform: translateX(8px)  translateY(0) rotate(12deg); }
            }
          `}</style>
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
          the aligning/recording phases via `hidden` rather than unmounted. */}
      <div className={`w-full max-w-2xl space-y-4 ${(phase === 'aligning' || phase === 'recording_screen' || phase === 'pan_instructions' || phase === 'recording_pan') ? '' : 'hidden'}`}>
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video rounded-xl bg-black object-cover"
          />
          {phase === 'aligning' && (() => {
            // Corner-bracket viewfinder outline (per the reference image) —
            // positioned via the SAME GUIDE_X0/X1/Y0/Y1 fractions the
            // alignment loop scores against, so what the candidate sees is
            // exactly the region that must be filled with their laptop
            // screen. object-cover's crop is symmetric-about-center, and
            // the analysis canvas mirrors that same crop, so plain CSS %
            // positioning over the <video> box lines up correctly with what
            // the algorithm is actually checking.
            const bracketColor = canRecord ? 'border-green-400' : 'border-white/80';
            const armStyle = 'absolute w-7 h-7 border-[3px]';
            return (
              <>
                <div
                  className="absolute pointer-events-none"
                  style={{ left: `${GUIDE_X0 * 100}%`, top: `${GUIDE_Y0 * 100}%`, right: `${(1 - GUIDE_X1) * 100}%`, bottom: `${(1 - GUIDE_Y1) * 100}%` }}
                >
                  <span className={`${armStyle} ${bracketColor} left-0 top-0 border-r-0 border-b-0 rounded-tl-md`} />
                  <span className={`${armStyle} ${bracketColor} right-0 top-0 border-l-0 border-b-0 rounded-tr-md`} />
                  <span className={`${armStyle} ${bracketColor} left-0 bottom-0 border-r-0 border-t-0 rounded-bl-md`} />
                  <span className={`${armStyle} ${bracketColor} right-0 bottom-0 border-l-0 border-t-0 rounded-br-md`} />
                </div>
                <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1 px-4 text-center">
                  {canRecord ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-black/50 rounded-full px-3 py-1">
                      <span className="w-2 h-2 rounded-full bg-green-400" /> Screen aligned
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-black/50 rounded-full px-3 py-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Fit your laptop screen inside the outline
                    </span>
                  )}
                </div>
              </>
            );
          })()}
          {phase === 'pan_instructions' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 rounded-xl px-4 overflow-hidden">
              <span className="text-5xl inline-block animate-[tf-phone-curve_1.8s_ease-in-out_infinite_alternate]">📱</span>
              <p className="text-sm font-medium text-white text-center">
                Now slowly move your phone from left to right and back again — capture your workspace, surrounding area, and any nearby devices.
              </p>
              <style>{`
                @keyframes tf-phone-curve {
                  0%   { transform: translateX(-40px) translateY(0)    rotate(-16deg); }
                  25%  { transform: translateX(-20px) translateY(-14px) rotate(-6deg); }
                  50%  { transform: translateX(0)      translateY(-18px) rotate(0deg); }
                  75%  { transform: translateX(20px)  translateY(-14px) rotate(6deg); }
                  100% { transform: translateX(40px)  translateY(0)    rotate(16deg); }
                }
              `}</style>
            </div>
          )}
        </div>
        {phase === 'aligning' ? (
          canRecord ? (
            <>
              <div className="flex items-center justify-center gap-2 text-green-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                Screen aligned
              </div>
              <button
                type="button"
                onClick={handleRecordClick}
                disabled={recordClicked}
                className="w-full py-3 rounded-xl bg-red-500 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {recordClicked ? 'Recording…' : '● Record'}
              </button>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-[#94a3b8]">
              Fit your laptop screen inside the outline above — the Record button appears automatically once it's aligned.
            </p>
          )
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
