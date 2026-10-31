'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Shield, Camera, Lock, AlertCircle, Mail, User,
  CheckCircle, RefreshCw, Loader2, ArrowRight, KeyRound, Check,
  Lightbulb, Sun, Info,
} from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import { loadFaceApiWithCpuBackend } from '@/lib/face-api-loader';
import { FACE_API_MODEL_URLS, loadFaceApiNetWithFallback, assessCandidateFaceVisibility, type FaceRegion } from '@/lib/proctoring/faceDetection';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';
import { AUTH_THEME_CSS } from '@/components/auth/authTheme';
import SuccessAnimation from '@/components/ui/success-animation';
import SubStepProgress from './SubStepProgress';
import { candidateScrollBehavior, revealAfterPaint } from '@/lib/utils/candidateScroll';

interface StepIdentityProps {
  token: string;
  candidateName?: string;
  candidateEmail?: string;
  position?: string;
  onVerify: (data: { name: string; email: string; candidate_id?: string; photo?: Blob }) => void;
  submitting?: boolean;
  /** Returns the candidate to the previous pre-interview step (Job Details & Consent). */
  onBack?: () => void;
}

type OtpPhase = 'idle' | 'merge' | 'done';

// Flip-in for the two OTP helper cards (resend timer + tips) — each turns
// over on its horizontal axis, inward toward the other: the resend card
// from rotateX(90deg), the tips card from rotateX(-90deg). Pure rotation
// about each card's own centre — no perspective (which reads as a zoom),
// no translate, no fade.
const OTP_FLIP_CSS = `
@keyframes tf-otp-flip-down {
  from { transform: rotateX(90deg); }
  to   { transform: rotateX(0deg); }
}
@keyframes tf-otp-flip-up {
  from { transform: rotateX(-90deg); }
  to   { transform: rotateX(0deg); }
}
.tf-otp-flip-down {
  transform-origin: center;
  backface-visibility: hidden;
  animation: tf-otp-flip-down 0.55s ease-out both;
}
.tf-otp-flip-up {
  transform-origin: center;
  backface-visibility: hidden;
  animation: tf-otp-flip-up 0.55s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .tf-otp-flip-down, .tf-otp-flip-up { animation: none; }
}
`;

// Seconds counted down before the identity photo is auto-captured.
const CAPTURE_COUNTDOWN_SECONDS = 3;

// One card of the "How it works" panel: an illustrated tile with the step's
// number above it, then a title and a line under it. The number pops
// into an animated tick the moment that step is met.
function HowItWorksCard({
  num, done, title, subtitle, children,
}: { num: number; done: boolean; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center text-center">
      {/* The number sits ABOVE the picture, clear of it. */}
      <span className={`w-7 h-7 mb-1.5 rounded-full flex items-center justify-center text-xs font-bold shadow-sm transition-colors duration-300 ${
        done ? 'bg-success text-white' : 'bg-brand-blue text-white'
      }`}>
        {done ? <Check className="w-4 h-4 animate-in zoom-in-50 duration-300" /> : num}
      </span>
      {/* Phones (cards stacked): a small picture, not the column's full width. */}
      <div className="relative w-full max-w-[9rem] min-[380px]:max-w-none aspect-[156/123] rounded-xl bg-gradient-to-b from-brand-blue/5 to-brand-blue/10 border border-brand-blue/10 flex items-center justify-center overflow-hidden">
        {children}
      </div>
      <p className="mt-2 tf-cell-name leading-tight">{title}</p>
      <p className="mt-0.5 tf-meta-strong leading-snug">{subtitle}</p>
    </div>
  );
}

export default function StepIdentity({
  token,
  candidateName = '',
  candidateEmail = '',
  position = 'this position',
  onVerify,
  submitting = false,
}: StepIdentityProps) {
  const [phase, setPhase] = useState<'form' | 'photo_ready' | 'countdown' | 'verifying' | 'captured'>('form');
  const [name, setName] = useState(candidateName);
  const [email, setEmail] = useState(candidateEmail);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(CAPTURE_COUNTDOWN_SECONDS);
  const [cameraError, setCameraError] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  // Live face status while framing (photo_ready) — gates the Capture button so
  // it's only clickable with exactly ONE face correctly placed in the oval.
  // 'unavailable' = no detector → HARD-BLOCK (can't verify → can't capture).
  const [liveFaceStatus, setLiveFaceStatus] = useState<'checking' | 'ok' | 'none' | 'multiple' | 'off_oval' | 'unavailable'>('checking');
  const liveDetectBusyRef = useRef(false);

  // OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState<string[]>(['', '', '', '', '', '']);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Bumped on every successful send — keys the OTP helper cards so their
  // flip-in replays on Resend, not only on the first Send OTP.
  const [otpSendCount, setOtpSendCount] = useState(0);
  const otpHeadingRef = useRef<HTMLLabelElement>(null);

  // Bring the "Enter OTP" heading into view after every send — the cells
  // only mount once the first send succeeds, so this runs after that render.
  useEffect(() => {
    if (otpSendCount === 0) return;
    otpHeadingRef.current?.scrollIntoView({ behavior: candidateScrollBehavior(), block: 'start' });
    otpRefs.current[0]?.focus({ preventScroll: true });
  }, [otpSendCount]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Success animation for the OTP step: the six cells collapse into a green
  // field and the shared success tick (SuccessAnimation) plays in it — the
  // same tick and field as ForgotPasswordModal, without its grid → swap
  // shuffle first. `otpPhase` drives .tf-otp-stage--*; every visual is CSS,
  // this only decides when each phase begins.
  const [otpPhase, setOtpPhase] = useState<OtpPhase>('idle');
  const otpTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearOtpTimers = useCallback(() => {
    otpTimers.current.forEach(clearTimeout);
    otpTimers.current = [];
  }, []);

  const runOtpSuccess = useCallback((onDone: () => void) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SUCCESS_LOTTIE_MS = 1502;
    const SETTLE_MS = 400;
    // Straight to the tick: the digits collapse into the green field (the
    // merged bar's 0.45s fade) and the success tick plays in it. The
    // forgot-password grid → swap shuffle before that is left out here.
    const DONE_AT = 350;

    const at = reduced
      ? { done: 0, handover: 700 }
      : { done: DONE_AT, handover: DONE_AT + SUCCESS_LOTTIE_MS + SETTLE_MS };

    clearOtpTimers();
    setOtpPhase('merge');
    otpTimers.current.push(setTimeout(() => setOtpPhase('done'), at.done));
    otpTimers.current.push(setTimeout(onDone, at.handover));
  }, [clearOtpTimers]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Loaded face-api.js module + options — used only for the photo-capture face
  // COUNT check (0 / 1 / >1). `options` (inputSize 224) is the accurate,
  // one-shot capture-time check; `liveOptions` (inputSize 128) is the fast
  // variant for the continuous framing poll — see ensureFaceApiFallback.
  const faceApiRef = useRef<{ module: any; options: any; liveOptions: any } | null>(null);
  const faceApiLoadPromiseRef = useRef<Promise<typeof faceApiRef.current> | null>(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFormValid = name.trim() !== '' && email.trim() !== '' && isEmailValid && otpVerified;

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOtp = useCallback(async () => {
    if (!isEmailValid || otpSending) return;
    setOtpSending(true);
    setOtpError(null);
    try {
      await candidateAIInterviewService.sendOtp(token, email.trim());
      setOtpSent(true);
      setOtpCode(['', '', '', '', '', '']);
      setOtpPhase('idle');
      setOtpVerified(false);
      setOtpSendCount(count => count + 1);
      startCooldown();
    } catch {
      setOtpError('Failed to send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }, [isEmailValid, otpSending, token, email, startCooldown]);

  // Synchronous in-flight guard: `otpVerifying` state is a stale closure for
  // a second call in the same tick, so a fast paste/typing burst (or a
  // StrictMode double call) could otherwise send the same single-use code
  // twice and have the second response clear the cells mid-tick.
  const verifyingRef = useRef(false);
  const handleVerifyOtp = useCallback(async (codeOverride?: string) => {
    const code = (codeOverride ?? otpCode.join('')).trim();
    if (code.length !== 6 || otpVerifying || verifyingRef.current) return;
    verifyingRef.current = true;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await candidateAIInterviewService.verifyOtp(token, email.trim(), code);
      if (res.verified) {
        setOtpError(null);
        // Collapse into the green field and play the success tick before
        // actually marking this verified.
        runOtpSuccess(() => setOtpVerified(true));
      } else {
        setOtpError(res.message || 'Invalid OTP. Please try again.');
        setOtpCode(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus({ preventScroll: true });
      }
    } catch {
      setOtpError('Invalid or expired OTP. Please try again.');
      setOtpCode(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus({ preventScroll: true });
    } finally {
      verifyingRef.current = false;
      setOtpVerifying(false);
    }
  }, [otpCode, otpVerifying, token, email, runOtpSuccess]);

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    // Next code computed here, not inside a setOtpCode updater: updaters must
    // be pure (StrictMode runs them twice), and verifying is a side effect.
    const next = [...otpCode];
    next[index] = value;
    setOtpCode(next);
    setOtpError(null);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (next.every(d => d) && next.join('').length === 6) {
      handleVerifyOtp(next.join(''));
    }
  }, [otpCode, handleVerifyOtp]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = (e.clipboardData?.getData('text') || '').trim();
    if (!/^\d{6}$/.test(paste)) return;
    setOtpCode(paste.split(''));
    setOtpError(null);
    otpRefs.current[5]?.focus();
    handleVerifyOtp(paste);
  }, [handleVerifyOtp]);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }, [otpCode]);


  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      clearOtpTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureFaceApiFallback = useCallback(async () => {
    if (faceApiRef.current) return faceApiRef.current;
    if (!faceApiLoadPromiseRef.current) {
      faceApiLoadPromiseRef.current = loadFaceApiWithCpuBackend()
        .then(async (fa) => {
          if (!fa.nets.tinyFaceDetector.isLoaded) {
            await loadFaceApiNetWithFallback(fa.nets.tinyFaceDetector, FACE_API_MODEL_URLS);
          }
          const loaded = {
            module: fa,
            // inputSize is the dominant cost lever, NOT the source canvas
            // resolution: TinyFaceDetector resizes its input to a square of
            // ~inputSize before running the network, so detection time is
            // roughly the same whether the source canvas is 240px or full
            // webcam resolution (measured: ~540ms either way at inputSize
            // 224 on this CPU backend, pinned off WebGL — see
            // face-api-loader.ts — for crash stability). Cutting inputSize
            // 224 → 128 cut measured detection time ~3.8x (≈695ms → ≈181ms)
            // with no change in face count on test frames.
            //
            // `options` (224): the one-shot post-countdown check in
            // capturePhoto() — this is the authoritative accept/reject gate
            // for the saved photo, so it keeps the more careful inputSize.
            // `liveOptions` (128): the ~600ms live framing poll in
            // detectFaceInfo() — this only drives UI hints (oval color /
            // "center your face" text), re-checked every tick, so trading a
            // little precision for ~3.8x less time-per-tick is the right
            // call — a continuous poll is far more sensitive to per-call cost
            // than a single one-off check.
            options: new fa.TinyFaceDetectorOptions({ scoreThreshold: 0.4, inputSize: 224 }),
            liveOptions: new fa.TinyFaceDetectorOptions({ scoreThreshold: 0.4, inputSize: 128 }),
          };
          faceApiRef.current = loaded;
          return loaded;
        })
        .catch(() => null)
        .finally(() => {
          faceApiLoadPromiseRef.current = null;
        });
    }
    const loaded = await faceApiLoadPromiseRef.current;
    return loaded ?? faceApiRef.current;
  }, []);

  // Warm the face-api detector up front so the capture face-count check is ready.
  useEffect(() => {
    void ensureFaceApiFallback();
  }, [ensureFaceApiFallback]);

  // Core detector: run face detection on an ALREADY-DRAWN canvas and return the
  // face count + the largest face's bounding box (canvas pixels). Returns null
  // when no detector is available (→ callers HARD-BLOCK). Works on any canvas so
  // we can verify BOTH the live preview and the exact captured still image.
  const detectFaceInfoFromCanvas = useCallback(
    async (canvas: HTMLCanvasElement, useLiveOptions = false): Promise<{ count: number; region: FaceRegion | null } | null> => {
      const largest = (boxes: FaceRegion[]): FaceRegion | null => {
        let best: FaceRegion | null = null;
        let bestArea = 0;
        for (const b of boxes) {
          const area = (b.width || 0) * (b.height || 0);
          if (area > bestArea) { bestArea = area; best = b; }
        }
        return best;
      };

      // Path A (PRIMARY): face-api.js TinyFaceDetector — self-hosted models,
      // consistent across all browsers. Preferred over the native FaceDetector,
      // which is flag-gated / flaky and only used as a fallback below.
      await ensureFaceApiFallback();
      if (faceApiRef.current) {
        try {
          const { module: fa, options, liveOptions } = faceApiRef.current;
          const detections = await fa.detectAllFaces(canvas, useLiveOptions ? liveOptions : options);
          const boxes: FaceRegion[] = detections.map((d: any) => {
            const box = d.box || d.detection?.box || {};
            return { x: box.x ?? 0, y: box.y ?? 0, width: box.width ?? 0, height: box.height ?? 0 };
          });
          return { count: detections.length, region: largest(boxes) };
        } catch { /* fall through to native */ }
      }
      // Path B (FALLBACK): native FaceDetector where available.
      if (typeof window !== 'undefined' && 'FaceDetector' in window) {
        try {
          const detector = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 5 });
          const bitmap = await createImageBitmap(canvas);
          const faces = await detector.detect(bitmap);
          bitmap.close();
          const boxes: FaceRegion[] = faces.map((f: any) => ({
            x: f.boundingBox?.x ?? 0, y: f.boundingBox?.y ?? 0,
            width: f.boundingBox?.width ?? 0, height: f.boundingBox?.height ?? 0,
          }));
          return { count: faces.length, region: largest(boxes) };
        } catch { /* fall through */ }
      }
      return null; // NO detector available → callers HARD-BLOCK capture
    },
    [ensureFaceApiFallback]
  );

  // Detached (never mounted) canvas used ONLY by the live framing poll —
  // separate from `canvasRef` (full webcam resolution, used for the actual
  // capture) for two reasons: (1) downscaling here is what actually cuts the
  // CPU-backend TF.js inference cost per tick — drawing/reading a full
  // 720p-ish frame every poll was the bulk of the per-tick cost, independent
  // of the detector's own inputSize option; (2) it can no longer race with
  // capturePhoto() writing to canvasRef when the countdown finishes.
  const liveDetectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const LIVE_DETECT_MAX_WIDTH = 240;

  // Live detector: snapshot the current video frame, downscaled, and detect on
  // it (used by the framing/photo_ready poll). assessCandidateFaceVisibility
  // works in ratios of frame size, so downscaling doesn't affect accuracy.
  const detectFaceInfo = useCallback(async (): Promise<{ count: number; region: FaceRegion | null } | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    if (!liveDetectCanvasRef.current) liveDetectCanvasRef.current = document.createElement('canvas');
    const canvas = liveDetectCanvasRef.current;
    const scale = video.videoWidth > LIVE_DETECT_MAX_WIDTH ? LIVE_DETECT_MAX_WIDTH / video.videoWidth : 1;
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return detectFaceInfoFromCanvas(canvas, /* useLiveOptions */ true);
  }, [detectFaceInfoFromCanvas]);

  // Available video input devices — populated after the first getUserMedia
  // grant (device labels/ids are blank before permission is given). Drives
  // whether the "Switch Camera" control shows at all (hidden on single-camera
  // laptops, shown on phones/multi-cam setups).
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const activeDeviceIdRef = useRef<string | null>(null);

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      setCameraError(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      activeDeviceIdRef.current = stream.getVideoTracks()[0]?.getSettings?.().deviceId ?? deviceId ?? null;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      } catch { /* enumeration is a nice-to-have for the switch-camera button only */ }
    } catch { setCameraError(true); }
  }, []);

  const handleSwitchCamera = useCallback(() => {
    if (videoDevices.length < 2) return;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === activeDeviceIdRef.current);
    const next = videoDevices[(currentIndex + 1) % videoDevices.length];
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    void startCamera(next.deviceId);
  }, [videoDevices, startCamera]);

  useEffect(() => {
    if (phase === 'photo_ready') startCamera();
  }, [phase, startCamera]);

  // Camera liveness while the candidate is framing themselves.
  //
  // startCamera() runs once per entry into photo_ready, so a camera unplugged
  // WHILE framing left the preview frozen on its last frame with nothing ever
  // re-acquiring it: the live face poll would keep failing against a dead
  // image, Capture stayed disabled, and the candidate was stuck on a screen
  // that looked like it was still working. Re-acquire as soon as the track
  // dies — `devicechange` catches the replug immediately, and the slow poll
  // covers drivers that never fire it.
  useEffect(() => {
    if (phase !== 'photo_ready') return;
    let cancelled = false;
    let inFlight = false;
    const check = async () => {
      if (cancelled || inFlight) return;
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (track && track.readyState === 'live') return;
      inFlight = true;
      try {
        console.warn('[Identity] Preview camera is not live — re-acquiring');
        await startCamera();
      } finally {
        inFlight = false;
      }
    };
    const onDeviceChange = () => { void check(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    const id = setInterval(() => { void check(); }, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [phase, startCamera]);

  // Live face check while the candidate frames themselves (photo_ready only).
  // Polls ~every 400ms and drives `liveFaceStatus`, which gates the Capture
  // button: it's enabled ONLY with exactly one face correctly placed in the
  // oval — no face, multiple faces, or an off-oval face keeps it disabled.
  useEffect(() => {
    if (phase !== 'photo_ready' || cameraError) return;
    setLiveFaceStatus('checking');
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      // Skip detection entirely while the tab isn't visible — the candidate
      // can't be framing themselves in a background tab, and CPU-backend TF.js
      // inference is expensive enough that running it unattended is pure waste
      // (and competes with whatever the foreground tab is doing).
      if (typeof document !== 'undefined' && document.hidden) {
        if (!cancelled) timer = setTimeout(tick, 1000);
        return;
      }
      // Don't run detection — or show any "no face" / "unavailable" warning —
      // until the camera has actually produced frames. getUserMedia + video.play()
      // take a moment; before that the video is black/empty and would falsely
      // report 0 faces ('none') or, at readyState<2, be treated as 'unavailable'.
      // Keep status 'checking' (neutral, no warning) and poll quickly until ready.
      const _v = videoRef.current;
      const _videoReady = !!_v && _v.readyState >= 2 && (_v.videoWidth || 0) > 0;
      if (!_videoReady) {
        if (!cancelled) {
          setLiveFaceStatus('checking');
          timer = setTimeout(tick, 250);
        }
        return;
      }
      if (!liveDetectBusyRef.current) {
        liveDetectBusyRef.current = true;
        try {
          // Timeout-guard the detection so a hung/slow detector call can never
          // wedge the poll: without this, if detectFaceInfo() never resolves,
          // liveDetectBusyRef stays true forever and every later tick is skipped
          // — freezing the status (e.g. stuck on "No face detected" even after
          // the candidate removes their hand). The race releases the busy flag.
          const info = await Promise.race([
            detectFaceInfo(),
            new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 1500)),
          ]);
          if (!cancelled && info !== 'timeout') {
            if (info === null) {
              setLiveFaceStatus('unavailable'); // no detector → capture stays disabled
            } else if (info.count === 0) {
              setLiveFaceStatus('none');
            } else if (info.count > 1) {
              setLiveFaceStatus('multiple');
            } else {
              // Must use liveDetectCanvasRef's dimensions here, not canvasRef's —
              // info.region's box coordinates are in the downscaled live-detect
              // canvas's coordinate space (see detectFaceInfo above), and
              // assessCandidateFaceVisibility needs matching frame dimensions to
              // compute correct area/center ratios.
              const cvs = liveDetectCanvasRef.current;
              const assess = cvs
                ? assessCandidateFaceVisibility(info.region, cvs.width, cvs.height)
                : { visible: true, reason: 'ok' as const };
              setLiveFaceStatus(assess.visible ? 'ok' : 'off_oval');
            }
          }
        } catch { /* transient detector error — keep prior status */ }
        finally { liveDetectBusyRef.current = false; }
      }
      // ~400ms poll: with liveOptions (inputSize 128) each detection call now
      // measures ~180ms on the CPU backend (down from ~540-700ms at inputSize
      // 224 — see ensureFaceApiFallback), so a 400ms cadence still leaves the
      // main thread idle more than half the time, while framing feedback
      // (oval color / hint text) clears promptly once the candidate re-centers.
      if (!cancelled) timer = setTimeout(tick, 400);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [phase, cameraError, detectFaceInfo]);

  // Clear the sticky capture-failure warning as soon as the live check sees a
  // correctly-framed face again. Without this, a `faceError` set by a failed
  // capture (e.g. the candidate covered their face) lingered until the NEXT
  // capture click — so removing the hand didn't make the warning disappear.
  useEffect(() => {
    if (liveFaceStatus === 'ok') setFaceError(null);
  }, [liveFaceStatus]);

  // Detached canvas for the post-countdown face check — same reasoning as
  // liveDetectCanvasRef above: detecting on the full-resolution still is what
  // froze the countdown on "1" / "Capturing Photo…" for several seconds with
  // no repaint (CPU-backend TF.js inference blocks the main thread while it
  // runs, so React can't paint the 'verifying' phase until it's done).
  const captureCheckCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const CAPTURE_CHECK_MAX_WIDTH = 320;

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // ── LIVE CAMERA GATE ───────────────────────────────────────────────────
    // A <video> keeps painting its LAST frame after the camera track ends, so
    // unplugging the camera leaves the candidate's face frozen on screen and
    // drawImage() below would happily save that stale frame as the identity
    // photo. That is an integrity hole, not just a UX one: the still would look
    // perfectly valid and pass every face check on it.
    //
    // The countdown auto-capture runs through here too, so gating this one
    // function covers both the manual click and the timed capture.
    const _camTrack = streamRef.current?.getVideoTracks?.()[0];
    const _camLive = !!_camTrack && _camTrack.readyState === 'live' && !_camTrack.muted;
    if (!_camLive || video.readyState < 2 || !video.videoWidth) {
      console.warn('[Identity] Capture blocked — camera not live', {
        hasTrack: !!_camTrack,
        readyState: _camTrack?.readyState,
        muted: _camTrack?.muted,
        videoReadyState: video.readyState,
      });
      setFaceError('Your camera is not available. Reconnect it and wait for the preview to return before taking the photo.');
      setPhase('photo_ready');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Verify THE CAPTURED STILL itself (the exact pixels we're about to save),
    // not a fresh live frame — the saved photo must show exactly ONE face, that
    // is clearly visible and correctly placed inside the oval. If any check
    // fails we do NOT save the photo; we return to photo_ready so the candidate
    // fixes it and retries. (info=null → no detector → HARD-BLOCK.)
    // Detect on a downscaled COPY of the still (see captureCheckCanvasRef) —
    // `canvas` itself stays full resolution below for the actual saved photo.
    if (!captureCheckCanvasRef.current) captureCheckCanvasRef.current = document.createElement('canvas');
    const checkCanvas = captureCheckCanvasRef.current;
    const checkScale = canvas.width > CAPTURE_CHECK_MAX_WIDTH ? CAPTURE_CHECK_MAX_WIDTH / canvas.width : 1;
    checkCanvas.width = Math.max(1, Math.round(canvas.width * checkScale));
    checkCanvas.height = Math.max(1, Math.round(canvas.height * checkScale));
    const checkCtx = checkCanvas.getContext('2d', { willReadFrequently: true });
    checkCtx?.drawImage(canvas, 0, 0, checkCanvas.width, checkCanvas.height);
    const detectionCanvas = checkCtx ? checkCanvas : canvas;

    const info = await detectFaceInfoFromCanvas(detectionCanvas);
    if (info === null) {
      setFaceError('Face detection is unavailable — reload the page or use Chrome/Edge to continue.');
      setPhase('photo_ready');
      return;
    }
    {
      if (info.count === 0) {
        setFaceError('No face detected in the photo. Position your face inside the oval and try again.');
        setPhase('photo_ready');
        return;
      }
      if (info.count > 1) {
        setFaceError(`${info.count} people detected in the photo. Only you may be in frame — ask others to step away, then try again.`);
        setPhase('photo_ready');
        return;
      }
      // Exactly one face — require it to be properly sized/centered in the oval.
      // Must use detectionCanvas's dimensions (matches info.region's coordinate
      // space), not the full-res `canvas`.
      const assess = assessCandidateFaceVisibility(info.region, detectionCanvas.width, detectionCanvas.height);
      if (!assess.visible) {
        setFaceError(
          assess.reason === 'face_too_small'
            ? 'Your face is too small in the photo — move closer so it fills the oval, then try again.'
            : assess.reason === 'face_off_center'
            ? 'Your face is off-center in the photo — center it inside the oval, then try again.'
            : 'Position your face clearly inside the oval and try again.'
        );
        setPhase('photo_ready');
        return;
      }
    }
    setFaceError(null);

    // JPEG, not PNG: the backend already assumes JPEG end-to-end (hardcodes
    // `data:image/jpeg;base64,...` for the OpenAI Vision face check and names
    // the upload identity.jpg). A full-resolution webcam frame as PNG is often
    // 5-10x larger than an equivalent-quality JPEG, and OpenAI's `detail: "low"`
    // downsamples internally anyway — so the extra PNG bytes buy nothing but
    // slower upload (client → backend) and slower base64 transit (backend →
    // OpenAI), which is what made "Continue" feel like it hung for 3-5s.
    canvas.toBlob(blob => {
      if (blob) {
        setPhotoBlob(blob);
        setPhotoPreview(URL.createObjectURL(blob));
        setPhase('captured');
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }, 'image/jpeg', 0.92);
  }, [detectFaceInfoFromCanvas]);

  const handleFormSubmit = useCallback(() => {
    if (isFormValid) setPhase('photo_ready');
  }, [isFormValid]);

  const handleStartCapture = useCallback(() => {
    if (cameraError) return;
    setFaceError(null);
    // Short countdown so the candidate can frame themselves, then auto-capture.
    setPhase('countdown');
    setCountdown(CAPTURE_COUNTDOWN_SECONDS);
    let count = CAPTURE_COUNTDOWN_SECONDS;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(async () => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        // Face-check on the captured frame runs on the TF.js CPU backend and can
        // take a few seconds — show an honest "Verifying…" state instead of
        // leaving the countdown frozen on "1" for that whole time.
        setPhase('verifying');
        await capturePhoto();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [cameraError, capturePhoto]);

  // Double-click guard for photo Continue (see handleConfirmAndSubmit).
  const submittedRef = useRef(false);

  const handleRetake = useCallback(() => {
    submittedRef.current = false;
    stopStream();
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null); setPhotoPreview(null);
    setPhase('photo_ready');
  }, [stopStream, photoPreview]);

  // The parent's `submitting` only arrives a render later, so submittedRef
  // blocks a second click first. Released when a submit finishes
  // (submitting → false, e.g. a failed upload the candidate retries) and on
  // Retake.
  useEffect(() => {
    if (!submitting) submittedRef.current = false;
  }, [submitting]);
  const handleConfirmAndSubmit = useCallback(() => {
    if (!photoBlob || submittedRef.current) return;
    submittedRef.current = true;
    onVerify({ name: name.trim(), email: email.trim(), photo: photoBlob });
  }, [photoBlob, onVerify, name, email]);

  // ── Auto-scroll for each state change (only when the target is hidden) ──
  const formCardRef = useRef<HTMLDivElement>(null);
  const continueWrapRef = useRef<HTMLDivElement>(null);
  const otpErrorRef = useRef<HTMLDivElement>(null);
  const photoCardRef = useRef<HTMLDivElement>(null);
  const faceErrorRef = useRef<HTMLDivElement>(null);
  const capturedRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase) return;
    if (phase === 'photo_ready' && (prev === 'form' || prev === 'captured')) {
      // Details → camera (or Retake): the whole view swapped; land on the camera.
      revealAfterPaint(() => photoCardRef.current, 'start');
    } else if (phase === 'countdown') {
      // Capture tapped below the fold on phones: keep the countdown in view.
      revealAfterPaint(() => photoCardRef.current, 'nearest');
    } else if (phase === 'captured') {
      revealAfterPaint(() => capturedRef.current, 'nearest');
      requestAnimationFrame(() => confirmBtnRef.current?.focus({ preventScroll: true }));
    } else if (phase === 'form') {
      // Back from the camera: the page got much shorter.
      revealAfterPaint(() => formCardRef.current, 'start');
    }
  }, [phase]);

  // Code accepted: the OTP block unmounts and Continue moves up — bring it in.
  useEffect(() => {
    if (otpVerified) revealAfterPaint(() => continueWrapRef.current, 'center');
  }, [otpVerified]);

  useEffect(() => {
    if (otpError) revealAfterPaint(() => otpErrorRef.current, 'nearest');
  }, [otpError]);

  useEffect(() => {
    if (faceError) revealAfterPaint(() => faceErrorRef.current, 'center');
  }, [faceError]);

  useEffect(() => {
    if (cameraError) revealAfterPaint(() => photoCardRef.current, 'nearest');
  }, [cameraError]);

  // ── Progress stepper (2 sections) ── one compact card, rendered first on
  // BOTH phases so it stays put while the content below swaps from the
  // details form to the photo capture.
  const isPhotoPhase = phase !== 'form';
  const isComplete = phase === 'captured';

  const progressStepper = (
    <SubStepProgress
      steps={['Candidate Details', 'Live Photo Capture']}
      activeIndex={isPhotoPhase ? 1 : 0}
      allComplete={isComplete}
    />
  );

  // ── Privacy card ──
  const privacyCard = (
    <div className="bg-brand-blue/5 border border-brand-blue/15 rounded-xl p-4 flex items-start gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-brand-blue/20 text-brand-blue flex-shrink-0">
        <Lock className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <h4 className="tf-subsection-title mb-1">Your privacy is protected</h4>
        <p className="tf-meta-strong leading-relaxed">
          Your information is encrypted and stored securely under GDPR and DPDP regulations.
          Used only for interview verification purposes.
        </p>
      </div>
    </div>
  );

  // ── PHASE A: Form ──
  if (phase === 'form') {
    return (
      <div className="w-full max-w-6xl mx-auto space-y-6">
        {progressStepper}

        <div className="flex flex-col items-center text-center">
          {/* Same badge as the Live Photo Capture phase's header. */}
          <span className="inline-flex items-center gap-1.5 bg-success-subtle text-success text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
            <User className="w-3.5 h-3.5" /> Candidate Details
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Identity Verification</h1>
            <p className="tf-card-desc mt-0.5">
              Confirm your details to proceed with the interview for <strong>{position}</strong>
            </p>
          </div>
        </div>

        <div ref={formCardRef} className="w-full max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col lg:flex-row">
          <div className="p-4 sm:p-6 space-y-5 min-w-0 flex-1">
            <div>
              <label htmlFor="identity-name" className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-1.5">
                <User className="w-4 h-4 text-gray-500" /> Full Name
              </label>
              <input
                id="identity-name" type="text" value={name}
                readOnly
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 cursor-not-allowed transition-colors"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="identity-email" className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Mail className="w-4 h-4 text-gray-500" /> Email Address <span className="text-destructive">*</span>
              </label>
              <div className="flex flex-col min-[380px]:flex-row gap-2">
                <input
                  id="identity-email" type="email" value={email}
                  readOnly
                  className={`flex-1 min-w-0 px-4 py-2.5 border rounded-lg text-sm bg-gray-50 cursor-not-allowed transition-colors ${
                    otpVerified ? 'border-success-line bg-success-subtle' : 'border-gray-200'
                  }`}
                />
                {!otpVerified && !otpSent && (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSendOtp}
                    disabled={!isEmailValid || otpSending}
                    className="flex-shrink-0 whitespace-nowrap w-full min-[380px]:w-auto"
                  >
                    {otpSending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                      : 'Send OTP'
                    }
                  </Button>
                )}
                {otpVerified && (
                  <div className="flex items-center gap-1.5 text-success text-sm font-medium px-3">
                    <CheckCircle className="w-4 h-4" /> Verified
                  </div>
                )}
              </div>

              {/* OTP input — shown after OTP sent, hidden once verified. Six
                  individual cells that collapse into a green field with the
                  success tick once the code is accepted. */}
              {otpSent && !otpVerified && (
                <div className="space-y-3">
                  <label ref={otpHeadingRef} className="flex items-center gap-1.5 text-sm font-medium text-gray-900 scroll-mt-2">
                    <KeyRound className="w-4 h-4 text-gray-500" /> Enter OTP <span className="text-destructive">*</span>
                  </label>

                  <div className="tf-auth-scope">
                    <style>{AUTH_THEME_CSS}</style>
                    <div className={`tf-otp-stage tf-otp-stage--${otpPhase}`}>
                      <div className="tf-otp-rotor" onPaste={handleOtpPaste}>
                        {otpCode.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => { otpRefs.current[index] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            aria-label={`Digit ${index + 1} of 6`}
                            placeholder="–"
                            className="tf-auth-otp tf-otp-cell"
                            readOnly={otpPhase !== 'idle'}
                          />
                        ))}
                      </div>
                      <div
                        className="tf-otp-merged"
                        role="status"
                        aria-label={otpPhase === 'done' ? 'Verification code accepted' : undefined}
                      >
                        {otpPhase === 'done' && (
                          <SuccessAnimation
                            className="tf-otp-lottie"
                            fallback={<Check className="tf-otp-tick" style={{ width: 26, height: 26, opacity: 1, transform: 'none' }} />}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Wrong / expired code — right under the cells it's about. */}
                  {otpError && (
                    <div ref={otpErrorRef} role="alert" className="flex items-center gap-2 text-destructive text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" /> {otpError}
                    </div>
                  )}

                  <style>{OTP_FLIP_CSS}</style>

                  {/* Resend + "didn't receive the code" hint, merged into one
                      light-blue card (same blue as the privacy card). The
                      resend row is the primary content; the hint is smaller. */}
                  <div
                    key={`resend-${otpSendCount}`}
                    className="tf-otp-flip-down bg-brand-blue/5 border border-brand-blue/15 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {resendCooldown > 0 ? (
                        <>
                          {/* Circular countdown */}
                          <div className="relative flex-shrink-0 w-10 h-10">
                            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                              <circle cx="18" cy="18" r="15" fill="none" stroke="color-mix(in srgb, var(--color-brand-blue) 15%, transparent)" strokeWidth="3" />
                              <circle
                                cx="18" cy="18" r="15" fill="none"
                                stroke="var(--color-brand-blue)" strokeWidth="3"
                                strokeLinecap="round"
                                strokeDasharray={2 * Math.PI * 15}
                                strokeDashoffset={2 * Math.PI * 15 * (1 - resendCooldown / 60)}
                                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-brand-blue">
                              {resendCooldown}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-medium text-gray-900">OTP sent to <span className="font-semibold break-all">{email}</span></p>
                            <p className="text-sm text-brand-blue">Resend available in {resendCooldown}s</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-white border border-brand-blue/20 flex items-center justify-center flex-shrink-0">
                            <RefreshCw className="w-4 h-4 text-brand-blue" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base text-gray-700">Didn't receive the OTP?</p>
                            <button
                              type="button"
                              onClick={handleSendOtp}
                              disabled={otpSending}
                              className="inline-flex items-center min-h-10 -my-2 px-1 -mx-1 text-base font-semibold text-brand-blue hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {otpSending ? 'Sending…' : 'Resend OTP'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Didn't receive the code — secondary hint, smaller text. */}
                    <div className="mt-3 pt-3 border-t border-brand-blue/10 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-brand-blue flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="tf-meta-strong">
                        <span className="font-semibold text-gray-700">Didn&apos;t receive the code?</span>{' '}
                        Check your spam or junk folder. The code will expire in{' '}
                        <span className="font-semibold text-brand-blue">10 minutes</span>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Send failed (before the cells exist). */}
              {otpError && !(otpSent && !otpVerified) && (
                <div ref={otpErrorRef} role="alert" className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {otpError}
                </div>
              )}
            </div>

            {privacyCard}
          </div>
        </div>

        <div ref={continueWrapRef} className="w-full max-w-3xl mx-auto flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-4">
          {/* Why Continue is still disabled. */}
          {!submitting && !isFormValid && !name.trim() && (
            <p id="identity-continue-hint" className="tf-meta text-center sm:text-right sm:mr-auto">
              Enter your full name.
            </p>
          )}
          <Button
            type="button" variant="primary" onClick={handleFormSubmit}
            disabled={!isFormValid || submitting}
            aria-describedby={!isFormValid && !name.trim() ? 'identity-continue-hint' : undefined}
            className="w-full sm:w-auto px-6"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
              : !otpVerified
                ? <>Verify Email to Continue <ArrowRight className="w-4 h-4" /></>
                : <>Continue to Photo <ArrowRight className="w-4 h-4" /></>
            }
          </Button>
        </div>
      </div>
    );
  }

  // ── PHASES B-E: Live Photo Capture ──
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {progressStepper}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 bg-success-subtle text-success text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <Camera className="w-3.5 h-3.5" /> Live Photo Capture
        </span>
        <h1 className="text-2xl font-bold text-gray-900">Identity Validation</h1>
        <p className="tf-card-desc mt-1">Take a live photo to verify your identity and prevent proxy interviews.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 sm:gap-5">
            {/* Left: Video feed */}
            {/* 4:3 on phones; 16:9 from `md`, the webcam's own shape, at the
                SAME height the 4:3 box had — the cap is the same height budget
                (viewport height less the chrome) times 16/9 instead of 4/3, so
                the box only grows wider. Sits at the column's start, so the
                card has no empty band beside it. */}
            {/* The camera with the photo tips under it, the two as one column
                (the cap on the camera's width caps the tips' too). */}
            <div className="w-full min-w-0 md:self-start flex flex-col gap-3 md:max-w-[max(26.67rem,calc((100dvh-var(--tf-sticky-h,0px)-15rem)*16/9))]">
            <div ref={photoCardRef} className="relative bg-gray-900 rounded-xl aspect-[4/3] md:aspect-video overflow-hidden flex items-center justify-center w-full">
              {phase !== 'captured' && (
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              )}
              {phase === 'captured' && photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Captured identity photo" className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              )}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-2">
                  <Camera className="w-10 h-10 text-gray-400" />
                  <p className="text-sm text-gray-300">Camera access denied</p>
                  <p className="tf-meta text-center px-4">Allow camera access in your browser&apos;s address bar, then retry.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { void startCamera(); }} className="mt-1">
                    <RefreshCw className="w-4 h-4" /> Retry camera
                  </Button>
                </div>
              )}

              {/* Switch Camera — only shown once enumeration finds more than one
                  video input (hidden on single-camera laptops). */}
              {phase !== 'captured' && !cameraError && videoDevices.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="absolute top-3 right-3 flex flex-col items-center gap-1 bg-black/60 hover:bg-black/75 text-white text-2xs font-medium rounded-lg px-2.5 py-2 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Switch Camera
                </button>
              )}

              {/* Always-visible face oval guide — border + hint reflect the live
                  face status so the candidate knows why capture is disabled. */}
              {phase !== 'captured' && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`h-[68%] w-auto aspect-[9/11] rounded-[50%] border-2 border-dashed transition-all duration-300 ${
                    phase === 'countdown' || phase === 'verifying' ? 'border-warning-line shadow-[0_0_20px_rgba(250,204,21,0.4)]' :
                    phase === 'photo_ready' && liveFaceStatus === 'ok' ? 'border-success-line shadow-[0_0_20px_rgba(74,222,128,0.45)]' :
                    phase === 'photo_ready' && (liveFaceStatus === 'multiple' || liveFaceStatus === 'none') ? 'border-destructive-line shadow-[0_0_20px_rgba(248,113,113,0.45)]' :
                    'border-white/60'
                  }`} />
                  <span className={`absolute bottom-3 inset-x-3 mx-auto w-fit max-w-[calc(100%-1.5rem)] inline-flex items-center justify-center gap-1.5 text-xs font-medium text-center px-3 py-1.5 rounded-2xl ${
                    phase === 'countdown' || phase === 'verifying' ? 'bg-warning text-white' :
                    phase === 'photo_ready' && liveFaceStatus === 'ok' ? 'bg-success text-white' :
                    phase === 'photo_ready' && (liveFaceStatus === 'multiple' || liveFaceStatus === 'none') ? 'bg-destructive text-white' :
                    'bg-black/60 text-white/90'
                  }`}>
                    {liveFaceStatus === 'ok' && phase === 'photo_ready' && <CheckCircle className="w-3.5 h-3.5" />}
                    {phase === 'countdown' ? 'Hold still…'
                      : phase === 'verifying' ? 'Verifying your photo…'
                      : liveFaceStatus === 'checking' ? 'Starting camera…'
                      : liveFaceStatus === 'multiple' ? 'Multiple people detected — only you should be visible'
                      : liveFaceStatus === 'none' ? 'No face detected — center your face in the oval'
                      : liveFaceStatus === 'off_oval' ? 'Move so your face fills the oval'
                      : liveFaceStatus === 'ok' ? 'Looks good! You can capture'
                      : 'Position face inside oval'}
                  </span>
                </div>
              )}

              {/* Countdown overlay */}
              {phase === 'countdown' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                  <span className="text-7xl font-bold text-white drop-shadow-lg">{countdown}</span>
                  <span className="text-sm text-gray-300 mt-2">Hold still…</span>
                </div>
              )}

              {/* Verifying overlay — the face-check on the captured frame can take
                  a couple seconds; show a spinner instead of leaving the last
                  countdown digit frozen on screen with no feedback. */}
              {phase === 'verifying' && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                  <span className="text-sm text-gray-300 mt-3">Verifying photo…</span>
                </div>
              )}

              {/* Status badges */}
              {phase !== 'captured' && !cameraError && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
                  Camera Active
                </div>
              )}
              {phase === 'captured' && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-success/90 text-white text-xs px-2.5 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Captured
                </div>
              )}
            </div>

              {/* Tips for a clear photo — under the camera: light and only you. */}
              <div className="bg-brand-blue/5 border border-brand-blue/15 rounded-xl px-3 py-2.5 sm:px-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Lightbulb className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  <h4 className="tf-subsection-title">Tips for a clear photo</h4>
                </div>
                <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-brand-blue/15">
                  {[
                    { icon: Sun, text: 'Be in a well-lit place' },
                    { icon: User, text: 'Keep only yourself in the frame' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2 tf-card-desc py-1.5 sm:py-0 sm:px-4 sm:first:pl-0">
                      <Icon className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Instructions / status */}
            <div className="h-full flex flex-col gap-4">
              {/* "How it works" — stays visible across the whole capture flow so
                  each step's badge can pop into a tick the moment it's actually
                  met, instead of just listing instructions. `flex-1` lets it
                  absorb the column's extra height so the right side matches the
                  video panel instead of leaving a gap below the button. */}
              <div className="bg-brand-blue/5 border border-brand-blue/15 rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3 bg-brand-blue/5 border-b border-brand-blue/10">
                  <span className="w-8 h-8 rounded-lg bg-brand-blue text-white flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="tf-subsection-title leading-tight">How it works</h4>
                    <p className="tf-meta-strong">Follow the steps below to capture a clear photo.</p>
                  </div>
                </div>
                {(() => {
                  // Glasses off before the shot, the shot itself, glasses back on.
                  const shotTaken = phase !== 'photo_ready';
                  const captured = phase === 'captured';
                  return (
                    <div className="px-3 sm:px-4 py-4 flex-1 flex flex-col min-[480px]:flex-row items-stretch gap-4 min-[480px]:gap-2">
                      <HowItWorksCard
                        num={1}
                        done={shotTaken}
                        title="Remove Glasses"
                        subtitle="Remove your glasses before capture."
                      >
                        <Image src="/images/identity/how-it-works-1.png" alt="Candidate holding their glasses, ready to take them off" fill sizes="(min-width: 768px) 160px, 33vw" className="object-cover select-none" draggable={false} />
                      </HowItWorksCard>
                      <div className="hidden min-[480px]:flex items-center flex-shrink-0 self-start mt-[4rem]" aria-hidden="true">
                        <ArrowRight className="w-4 h-4 text-brand-blue" />
                      </div>
                      <HowItWorksCard
                        num={2}
                        done={captured}
                        title="Capture Photo"
                        subtitle="Center your face and capture the photo."
                      >
                        <Image src="/images/identity/how-it-works-2.png" alt="Candidate without glasses, face centred in the frame" fill sizes="(min-width: 768px) 160px, 33vw" className="object-cover select-none" draggable={false} />
                      </HowItWorksCard>
                      <div className="hidden min-[480px]:flex items-center flex-shrink-0 self-start mt-[4rem]" aria-hidden="true">
                        <ArrowRight className="w-4 h-4 text-brand-blue" />
                      </div>
                      <HowItWorksCard
                        num={3}
                        done={captured}
                        title="Wear Again"
                        subtitle="Put your glasses back on after capture."
                      >
                        <Image src="/images/identity/how-it-works-3.png" alt="Candidate putting their glasses back on" fill sizes="(min-width: 768px) 160px, 33vw" className="object-cover select-none" draggable={false} />
                      </HowItWorksCard>
                    </div>
                  );
                })()}
              </div>

              {phase === 'photo_ready' && (
                <>
                  {faceError && (
                    <div ref={faceErrorRef} role="alert" className="flex items-start gap-2 bg-destructive-subtle border border-destructive-line rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-destructive">{faceError}</p>
                    </div>
                  )}

                  {/* Capture is enabled ONLY when exactly one face is correctly in
                      the oval. If no detector is available we HARD-BLOCK (can't
                      verify → can't capture). */}
                  {(() => {
                    const captureReady = liveFaceStatus === 'ok';
                    // 'checking' = camera still initializing → show NO warning (a
                    // clean start). The face/unavailable warnings only appear once
                    // the camera is live and detection has actually run.
                    const blockedMsg =
                      liveFaceStatus === 'none' ? 'No face detected — center your face in the oval.'
                      : liveFaceStatus === 'multiple' ? 'Multiple people detected — only you may be in frame.'
                      : liveFaceStatus === 'off_oval' ? 'Move so your face fills the oval.'
                      : liveFaceStatus === 'unavailable' ? 'Face detection unavailable — reload the page or use Chrome/Edge to continue.'
                      : '';
                    return (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={handleStartCapture}
                          disabled={cameraError || !captureReady}
                          title={!captureReady ? blockedMsg : undefined}
                          className="w-full"
                        >
                          <Camera className="w-4 h-4" />
                          {faceError ? 'Retake Photo' : 'Capture Photo'}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                        {/* Only a blocked camera is spelled out here — the face
                            hints already show on the camera itself. */}
                        {cameraError && (
                          <p role="status" className="tf-meta-strong text-center">
                            Camera access is blocked — allow it in the address bar, then retry.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {phase === 'verifying' && (
                <div className="bg-warning-subtle border border-warning-line rounded-xl p-4 text-center">
                  <Loader2 className="w-8 h-8 text-warning mx-auto mb-2 animate-spin" />
                  <h4 className="text-sm font-semibold text-warning-strong">Verifying Photo…</h4>
                  <p className="text-xs text-warning-strong mt-1">Checking that your face is clearly visible</p>
                </div>
              )}

              {phase === 'countdown' && (
                <div className="bg-warning-subtle border border-warning-line rounded-xl p-4 text-center">
                  <Camera className="w-8 h-8 text-warning mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-warning-strong">Capturing Photo…</h4>
                  <p className="text-xs text-warning-strong mt-1">Hold still and look at the camera</p>
                </div>
              )}

              {phase === 'captured' && (
                <div ref={capturedRef} className="space-y-3">
                  <div className="bg-success-subtle border border-success-line rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-success-strong">Photo Verified</h4>
                      <p className="text-xs text-success mt-1">One face detected and clearly visible — no other people in frame. Review your photo on the left, then click Continue.</p>
                    </div>
                  </div>
                  <Button
                    ref={confirmBtnRef}
                    type="button"
                    variant="primary"
                    onClick={handleConfirmAndSubmit}
                    disabled={submitting}
                    className="w-full"
                  >
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                      : <>Continue <ArrowRight className="w-4 h-4" /></>
                    }
                  </Button>
                  <Button
                    type="button" variant="secondary" onClick={handleRetake}
                    disabled={submitting}
                    className="w-full"
                  >
                    <RefreshCw className="w-4 h-4" /> Retake Photo
                  </Button>
                </div>
              )}
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {privacyCard}
    </div>
  );
}
