'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Shield, Camera, Lock, AlertCircle, Mail, User,
  CheckCircle, RefreshCw, Loader2, ArrowRight, KeyRound,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import { loadFaceApiWithCpuBackend } from '@/lib/face-api-loader';
import { FACE_API_MODEL_URLS, loadFaceApiNetWithFallback, assessCandidateFaceVisibility, type FaceRegion } from '@/lib/proctoring/faceDetection';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';

interface StepIdentityProps {
  token: string;
  candidateName?: string;
  candidateEmail?: string;
  position?: string;
  onVerify: (data: { name: string; email: string; candidate_id?: string; photo?: Blob }) => void;
  submitting?: boolean;
}

// Seconds counted down before the identity photo is auto-captured.
const CAPTURE_COUNTDOWN_SECONDS = 3;

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
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setOtpCode('');
      setOtpVerified(false);
      startCooldown();
    } catch {
      setOtpError('Failed to send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  }, [isEmailValid, otpSending, token, email, startCooldown]);

  const handleVerifyOtp = useCallback(async (codeOverride?: string) => {
    const code = (codeOverride ?? otpCode).trim();
    if (code.length < 4 || otpVerifying) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await candidateAIInterviewService.verifyOtp(token, email.trim(), code);
      if (res.verified) {
        setOtpVerified(true);
        setOtpError(null);
      } else {
        setOtpError(res.message || 'Invalid OTP. Please try again.');
      }
    } catch {
      setOtpError('Invalid or expired OTP. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  }, [otpCode, otpVerifying, token, email]);


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

  const startCamera = useCallback(async () => {
    try {
      setCameraError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { setCameraError(true); }
  }, []);

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

  const handleRetake = useCallback(() => {
    stopStream();
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null); setPhotoPreview(null);
    setPhase('photo_ready');
  }, [stopStream, photoPreview]);

  const handleGoBackFromPhoto = useCallback(() => {
    stopStream();
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null); setPhotoPreview(null);
    setPhase('form');
  }, [stopStream, photoPreview]);

  const handleConfirmAndSubmit = useCallback(() => {
    if (photoBlob) {
      onVerify({ name: name.trim(), email: email.trim(), photo: photoBlob });
    }
  }, [photoBlob, onVerify, name, email]);

  // ── Progress stepper (2 sections) ──
  const isPhotoPhase = phase !== 'form';
  const isComplete = phase === 'captured';

  const progressStepper = (
    <div className="flex items-center justify-center mb-6">
      {/* Step 1 */}
      <div className="flex flex-col items-center gap-1.5">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
          isPhotoPhase
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'bg-gray-900 border-gray-900 text-white'
        }`}>
          {isPhotoPhase ? <CheckCircle className="w-5 h-5" /> : '1'}
        </div>
        <span className={`text-xs font-medium ${isPhotoPhase ? 'text-gray-500' : 'text-gray-900'}`}>
          Candidate Details
        </span>
      </div>

      {/* Connector */}
      <div className={`h-0.5 w-20 mx-2 mb-5 transition-all ${isPhotoPhase ? 'bg-gray-900' : 'bg-gray-200'}`} />

      {/* Step 2 */}
      <div className="flex flex-col items-center gap-1.5">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
          isComplete
            ? 'bg-gray-900 border-gray-900 text-white'
            : isPhotoPhase
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'bg-white border-gray-300 text-gray-400'
        }`}>
          {isComplete ? <CheckCircle className="w-5 h-5" /> : '2'}
        </div>
        <span className={`text-xs font-medium ${isPhotoPhase ? 'text-gray-900' : 'text-gray-400'}`}>
          Live Photo Capture
        </span>
      </div>
    </div>
  );

  // ── Privacy card ──
  const privacyCard = (
    <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
      <Lock className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Privacy &amp; Security</h4>
        <p className="text-xs text-gray-600 leading-relaxed">
          Your information is encrypted and stored securely under GDPR and DPDP regulations.
          Used only for interview verification purposes.
        </p>
      </div>
    </div>
  );

  // ── PHASE A: Form ──
  if (phase === 'form') {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        {progressStepper}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
            <Shield className="w-3.5 h-3.5" /> Identity Verification
          </span>
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Identity</h1>
          <p className="text-gray-600 mt-1 text-sm">
            Confirm your details to proceed with the interview for <strong>{position}</strong>
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-gray-800 px-6 py-4">
            <div className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5" />
              <h2 className="font-semibold">Candidate Details</h2>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-3">
              <p className="text-sm text-amber-800 font-medium">Important</p>
              <p className="text-xs text-amber-700 mt-1">Enter your name exactly as it appears on your government ID.</p>
            </div>

            <div>
              <label htmlFor="identity-name" className="flex items-center gap-1.5 text-sm font-medium text-gray-900 mb-1.5">
                <User className="w-4 h-4 text-gray-500" /> Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="identity-name" type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. John Michael Smith"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="identity-email" className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Mail className="w-4 h-4 text-gray-500" /> Email Address <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="identity-email" type="email" value={email}
                  readOnly
                  className={`flex-1 px-4 py-2.5 border rounded-lg text-sm bg-gray-50 cursor-not-allowed transition-colors ${
                    otpVerified ? 'border-green-400 bg-green-50' : 'border-gray-200'
                  }`}
                />
                {!otpVerified && !otpSent && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={!isEmailValid || otpSending}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {otpSending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
                      : 'Get OTP'
                    }
                  </button>
                )}
                {otpVerified && (
                  <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium px-3">
                    <CheckCircle className="w-4 h-4" /> Verified
                  </div>
                )}
              </div>

              {/* OTP input — shown after OTP sent, hidden once verified */}
              {otpSent && !otpVerified && (
                <div className="space-y-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <KeyRound className="w-4 h-4 text-gray-500" /> Enter OTP <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setOtpCode(digits);
                        setOtpError(null);
                        // Auto-verify once the full 6-digit code is entered by
                        // manual typing — mirrors the paste behavior so the
                        // candidate never has to click "Verify" or press Enter.
                        if (digits.length === 6) handleVerifyOtp(digits);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const live = (e.currentTarget.value || '').replace(/\D/g, '');
                          handleVerifyOtp(live);
                        }
                      }}
                      onPaste={e => {
                        const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                        if (pasted.length >= 4) {
                          e.preventDefault();
                          setOtpCode(pasted);
                          setOtpError(null);
                          handleVerifyOtp(pasted);
                        }
                      }}
                      placeholder="Enter 6-digit OTP"
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 tracking-widest font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyOtp()}
                      disabled={otpCode.length < 4 || otpVerifying}
                      className="flex-shrink-0 flex items-center gap-1.5 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {otpVerifying ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</> : 'Verify OTP'}
                    </button>
                  </div>

                  {/* Resend timer */}
                  <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg border border-gray-100">
                    {resendCooldown > 0 ? (
                      <>
                        {/* Circular countdown */}
                        <div className="relative flex-shrink-0 w-9 h-9">
                          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15" fill="none"
                              stroke="#374151" strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={2 * Math.PI * 15}
                              strokeDashoffset={2 * Math.PI * 15 * (1 - resendCooldown / 60)}
                              style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
                            {resendCooldown}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700">OTP sent to <span className="font-semibold">{email}</span></p>
                          <p className="text-xs text-gray-500">Resend available in {resendCooldown}s</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <RefreshCw className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-600">Didn't receive the OTP?</p>
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={otpSending}
                            className="text-sm font-semibold text-gray-900 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {otpSending ? 'Sending…' : 'Resend OTP'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {otpError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {otpError}
                </div>
              )}
            </div>

            {privacyCard}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button" onClick={handleFormSubmit}
            disabled={!isFormValid || submitting}
            className="inline-flex items-center gap-2 bg-gray-900 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
              : !otpVerified
                ? <>Verify Email to Continue <ArrowRight className="w-4 h-4" /></>
                : <>Continue to Photo <ArrowRight className="w-4 h-4" /></>
            }
          </button>
        </div>
      </div>
    );
  }

  // ── PHASES B-E: Live Photo Capture ──
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6" style={{ colorScheme: 'light' }}>
      {progressStepper}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <Camera className="w-3.5 h-3.5" /> Live Photo Capture
        </span>
        <h1 className="text-2xl font-bold text-gray-900">Identity Validation</h1>
        <p className="text-gray-600 mt-1 text-sm">Take a live photo to verify your identity and prevent proxy interviews.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gray-800 px-6 py-4">
          <div className="flex items-center gap-2 text-white">
            <Shield className="w-5 h-5" />
            <h2 className="font-semibold">Live Identity Verification</h2>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Video feed */}
            <div className="relative bg-gray-900 rounded-xl aspect-video overflow-hidden flex items-center justify-center">
              {phase !== 'captured' && (
                <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              )}
              {phase === 'captured' && photoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreview} alt="Captured identity photo" className="w-full h-full object-cover" />
              )}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-2">
                  <Camera className="w-10 h-10 text-gray-400" />
                  <p className="text-sm text-gray-300">Camera access denied</p>
                  <p className="text-xs text-gray-500">Please allow camera access and reload</p>
                </div>
              )}

              {/* Always-visible face oval guide — border + hint reflect the live
                  face status so the candidate knows why capture is disabled. */}
              {phase !== 'captured' && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-36 h-44 md:w-44 md:h-52 rounded-[50%] border-[3px] transition-all duration-300 ${
                    phase === 'countdown' || phase === 'verifying' ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.4)]' :
                    phase === 'photo_ready' && liveFaceStatus === 'ok' ? 'border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.45)]' :
                    phase === 'photo_ready' && (liveFaceStatus === 'multiple' || liveFaceStatus === 'none') ? 'border-red-400 shadow-[0_0_20px_rgba(248,113,113,0.45)]' :
                    'border-white/50'
                  }`} />
                  <p className="absolute bottom-12 text-xs text-white/90 font-medium text-center px-4">
                    {phase === 'countdown' ? 'Hold still…'
                      : phase === 'verifying' ? 'Verifying your photo…'
                      : liveFaceStatus === 'checking' ? 'Starting camera…'
                      : liveFaceStatus === 'multiple' ? 'Multiple people detected — only you should be visible'
                      : liveFaceStatus === 'none' ? 'No face detected — center your face in the oval'
                      : liveFaceStatus === 'off_oval' ? 'Move so your face fills the oval'
                      : liveFaceStatus === 'ok' ? 'Looks good — you can capture'
                      : 'Position face inside oval'}
                  </p>
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
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Camera Active
                </div>
              )}
              {phase === 'captured' && (
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-green-600/90 text-white text-xs px-2.5 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Captured
                </div>
              )}
            </div>

            {/* Right: Instructions / status */}
            <div className="space-y-4">
              {phase === 'photo_ready' && (
                <>
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <Shield className="w-4 h-4 text-gray-600" />
                      <h4 className="text-sm font-semibold text-gray-900">How it works</h4>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">1</div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">Position your face</p>
                          <p className="text-xs text-gray-500">Center your face inside the oval, with only you in frame.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">2</div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">Capture</p>
                          <p className="text-xs text-gray-500">A short countdown, then your photo is taken automatically.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {faceError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{faceError}</p>
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
                        {!captureReady && blockedMsg && (
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-700">{blockedMsg}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleStartCapture}
                          disabled={cameraError || !captureReady}
                          title={!captureReady ? blockedMsg : undefined}
                          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-800 active:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-sm shadow-sm"
                        >
                          {faceError ? 'Retake Photo' : 'Capture Photo →'}
                        </button>
                      </>
                    );
                  })()}
                </>
              )}

              {phase === 'verifying' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                  <Loader2 className="w-8 h-8 text-yellow-600 mx-auto mb-2 animate-spin" />
                  <h4 className="text-sm font-semibold text-yellow-900">Verifying Photo…</h4>
                  <p className="text-xs text-yellow-800 mt-1">Checking that your face is clearly visible</p>
                </div>
              )}

              {phase === 'countdown' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                  <Camera className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                  <h4 className="text-sm font-semibold text-yellow-900">Capturing Photo…</h4>
                  <p className="text-xs text-yellow-800 mt-1">Hold still and look at the camera</p>
                </div>
              )}

              {phase === 'captured' && (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-green-900">Photo Verified</h4>
                      <p className="text-xs text-green-700 mt-1">One face detected and clearly visible — no other people in frame. Review your photo on the left, then click Continue.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmAndSubmit}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm"
                  >
                    {submitting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                      : <>Continue <ArrowRight className="w-4 h-4" /></>
                    }
                  </button>
                  <button
                    type="button" onClick={handleRetake}
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-medium py-2.5 px-5 rounded-xl hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" /> Retake Photo
                  </button>
                </div>
              )}
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {privacyCard}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={handleGoBackFromPhoto}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
          ← Go Back
        </button>
      </div>
    </div>
  );
}
