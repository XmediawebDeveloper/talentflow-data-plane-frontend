'use client';

import { useState, useEffect, useRef } from 'react';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';
import {
  Camera,
  Mic,
  Monitor,
  Wifi,
  Check,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Loader2,
  Play,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import CandidateHeader from './CandidateHeader';
import CandidateStepper from './CandidateStepper';
/* The candidate flow's container — see the note on the constant. The header
   bar and the blue hero band stay full-bleed; their CONTENTS sit in here. */
import {
  CANDIDATE_PAGE,
  RECRUITER_SHELL,
  RECRUITER_WRAP,
  RECRUITER_CARD,
  PAGE_ICON_TILE,
  T_PAGE_TITLE,
  T_PAGE_SUBTITLE,
  T_SECTION,
  T_CARD_TITLE,
  ICON,
  ICON_INLINE,
} from '@/lib/constants/candidateLayout';
import { loadFaceApiWithCpuBackend } from '@/lib/face-api-loader';
import {
  assessCandidateFaceVisibility,
  createVideoFrameCanvas,
  FACE_API_MODEL_URLS,
  FaceRegion,
  filterAdditionalFaceCandidates,
  filterMultipleFaceCandidates,
  loadFaceApiNetWithFallback,
  MIN_CONFIDENT_FACE_SCORE,
  pickPrimaryFace,
} from '@/lib/proctoring/faceDetection';
import { createMediaPipeFaceCounter, type MediaPipeFaceCounter } from '@/lib/proctoring/mediapipeFaceCounter';
import { candidateService, SystemCheckResult } from '@/lib/services/candidateService';
import { getUserMedia, getErrorMessage, detectBrowser, checkBrowserCompatibility, playVideo, shouldUseAdaptiveAssessmentMode } from '@/lib/utils/browserCompat';

interface SystemCheckProps {
  token: string;
  onComplete: (stream?: MediaStream) => void; // Pass stream to parent to keep it alive
  onRegisterFace?: (videoElement: HTMLVideoElement) => Promise<boolean>;
}

interface CheckStatus {
  status: 'pending' | 'checking' | 'success' | 'warning' | 'error';
  message: string;
}

interface FaceDetectorInstance {
  detect: (source: ImageBitmapSource) => Promise<unknown[]>;
}

type FaceDetectorConstructor = new (options: {
  fastMode: boolean;
  maxDetectedFaces: number;
}) => FaceDetectorInstance;

type BrowserWindow = Window & typeof globalThis & {
  FaceDetector?: FaceDetectorConstructor;
  webkitAudioContext?: typeof AudioContext;
};

const MULTI_FACE_MIN_CONFIDENT_SCORE = 0.45;

interface SystemCheckFaceResult {
  visibleCount: number;
  candidateVisible: boolean;
  reason: 'ok' | 'face_too_small' | 'face_off_center' | 'invalid_frame' | 'low_confidence_face';
  rawFaceCount: number;
  confidentFaceCount: number;
  significantFaceCount: number;
  additionalFaceCount: number;
}

function getSystemCheckFaceErrorMessage(reason: SystemCheckFaceResult['reason']): string {
  switch (reason) {
    case 'face_too_small':
      return 'Face detected but too small. Move closer and keep your face centered.';
    case 'face_off_center':
      return 'Face detected but not clearly centered. Position your face clearly in front of the camera.';
    default:
      return 'No face detected. Position your face clearly in front of the camera.';
  }
}

function getSystemCheckFacePendingMessage(reason: SystemCheckFaceResult['reason']): string {
  switch (reason) {
    case 'face_too_small':
      return 'Move a little closer and keep your face centered in the camera preview.';
    case 'face_off_center':
      return 'Center your face in the camera preview and keep good lighting.';
    case 'low_confidence_face':
      return 'Face detected, but verification is stabilizing. Keep only your face clearly visible.';
    default:
      return 'Looking for your face… please face the camera with good lighting.';
  }
}

function chooseAssessmentSystemCheckResult(
  nativeResult: SystemCheckFaceResult,
  fallbackResult: SystemCheckFaceResult | null,
): SystemCheckFaceResult {
  if (!fallbackResult) return nativeResult;

  if (nativeResult.visibleCount >= 2) {
    return nativeResult;
  }

  if (nativeResult.visibleCount === 1 && nativeResult.candidateVisible) {
    return nativeResult;
  }

  if (fallbackResult.visibleCount === 1 && fallbackResult.candidateVisible) {
    return fallbackResult;
  }

  if (fallbackResult.visibleCount >= 2) {
    return fallbackResult;
  }

  return fallbackResult;
}

function analyzeSystemCheckFaceDetections<T>({
  detections,
  primaryCandidates,
  multiFaceCandidates,
  getRegion,
  frameWidth,
  frameHeight,
}: {
  detections: T[];
  primaryCandidates?: T[];
  multiFaceCandidates?: T[];
  getRegion: (item: T) => FaceRegion | null;
  frameWidth: number;
  frameHeight: number;
}): SystemCheckFaceResult {
  const preferredPrimaryCandidates = primaryCandidates ?? detections;
  const preferredMultiFaceCandidates = multiFaceCandidates ?? detections;
  const primaryFace = pickPrimaryFace(
    preferredPrimaryCandidates,
    getRegion,
    frameWidth,
    frameHeight,
  );
  const primaryVisibility = assessCandidateFaceVisibility(
    primaryFace ? getRegion(primaryFace) : null,
    frameWidth,
    frameHeight,
  );
  const multipleFaceDetections = filterMultipleFaceCandidates(
    preferredMultiFaceCandidates,
    getRegion,
    frameWidth,
    frameHeight,
  );
  const additionalFaces = filterAdditionalFaceCandidates(
    preferredMultiFaceCandidates,
    getRegion,
    primaryFace,
    frameWidth,
    frameHeight,
  );
  const visibleCount =
    multipleFaceDetections.length > 1
      ? multipleFaceDetections.length
      : ((primaryVisibility.visible || additionalFaces.length > 0) && primaryFace ? (1 + additionalFaces.length) : 0);

  return {
    visibleCount,
    candidateVisible: primaryVisibility.visible,
    reason: multipleFaceDetections.length === 0 && detections.length > 0
      ? (primaryVisibility.visible ? 'low_confidence_face' : primaryVisibility.reason)
      : (primaryVisibility.visible ? 'ok' : primaryVisibility.reason),
    rawFaceCount: detections.length,
    confidentFaceCount: preferredPrimaryCandidates.length,
    significantFaceCount: multipleFaceDetections.length,
    additionalFaceCount: additionalFaces.length,
  };
}


/** A check row's icon tile — the AI interview System Check's: one minimal
 *  brand-blue tint for every row, turning red only when that check fails. */
/** One fixed size for a row's status chips (Working / Warning / Failed) and
 *  its Retry button, so they line up in a column whatever the label. */
const STATUS_CHIP =
  'inline-flex items-center justify-center gap-1.5 w-24 h-7 px-2 rounded-full text-xs font-semibold shrink-0';

const checkTile = (status: string) =>
  `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
    status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-brand-blue/10 text-brand-blue'
  }`;

export function SystemCheck({ token, onComplete, onRegisterFace }: SystemCheckProps) {
  const [cameraCheck, setCameraCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  // Its own row (AI interview parity): "is the candidate's face there" and
  // "is anyone ELSE there" are different questions. Folded into the Camera
  // row, a second person who wasn't counted simply left it green.
  const [multipleCheck, setMultipleCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [micCheck, setMicCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [internetCheck, setInternetCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [browserCheck, setBrowserCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
  const [isChecking, setIsChecking] = useState(false);
  const [allChecksComplete, setAllChecksComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [browserType, setBrowserType] = useState<string>('');
  const [isIOS, setIsIOS] = useState(false);
  const [browserWarning, setBrowserWarning] = useState<string | null>(null);
  const [cameraInUseError, setCameraInUseError] = useState<string>('');
  const [hasCameraPreview, setHasCameraPreview] = useState(false);
  // Before the first run every row still reads "Not checked": the Run Checks
  // button is then the only thing the candidate can usefully do.
  const checksNotStarted = !isChecking
    && [browserCheck, internetCheck, cameraCheck, multipleCheck, micCheck].every((c) => c.status === 'pending');
  // Set once the first full run finishes. Run Checks is then hidden, as on the
  // AI interview — from there each failed row has its own Retry.
  const [checksRan, setChecksRan] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const networkCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const micCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Bumped whenever the mic check is stopped or restarted, so an earlier run
  // still awaiting (calibration, AudioContext startup) can't arm its interval
  // over the new run's and flip a passed check back to "Listening".
  const micGenRef = useRef(0);
  // Removes the click/keydown listeners that resume a suspended AudioContext.
  const micResumeCleanupRef = useRef<(() => void) | null>(null);
  const networkSpeedMbpsRef = useRef<number | null>(null);
  const networkLatencyMsRef = useRef<number | null>(null);
  const browserInfoRef = useRef<ReturnType<typeof detectBrowser> | null>(null);
  const faceDetectionBusyRef = useRef(false);
  const faceDetectionFailureCountRef = useRef(0);
  const faceApiModuleRef = useRef<Awaited<ReturnType<typeof loadFaceApiWithCpuBackend>> | null>(null);
  const faceApiLoadPromiseRef = useRef<Promise<Awaited<ReturnType<typeof loadFaceApiWithCpuBackend>>> | null>(null);
  // Second opinion on "how many people": the in-test MediaPipe model. The
  // face-api pass below runs small (224 px) for CPU reasons and misses smaller /
  // partly covered faces — two people passed this screen that way.
  const faceCounterRef = useRef<MediaPipeFaceCounter | null>(null);

  // Face verification must pass before the candidate can proceed.
  // We allow a short grace window for the detector to stabilize, but we no
  // longer soft-pass "no face" readings.
  const noFaceCountRef = useRef(0);
  const multiFaceCountRef = useRef(0);
  const MULTI_FACE_HARD_FAIL = 2;
  const NO_FACE_HARD_FAIL = 2;

  // ── Face-detection cost controls ──────────────────────────────────────────
  // Windows Chrome has no native FaceDetector (the Shape Detection API only
  // ships on macOS / ChromeOS / Android), so effectively every candidate takes
  // the face-api.js path — on the tf.js CPU backend, on the main thread (see
  // lib/face-api-loader.ts for why the backend is pinned to CPU). At the
  // library's default 416px input that is ~a second of blocking work per tick
  // on a 4-core laptop, which froze this screen. 224px on a 320px-wide frame
  // is ~3-4x cheaper and still detects a face that fills a webcam frame.
  const FACE_DETECT_INPUT_SIZE = 224;
  const FACE_DETECT_FRAME_WIDTH = 320;
  // The poll re-arms AFTER each detection returns instead of on a fixed
  // interval, backing off to a multiple of the last inference, so a slow
  // machine gets idle main-thread time rather than a backlog of ticks.
  const FACE_POLL_MIN_MS = 2500;
  const FACE_POLL_MAX_MS = 8000;
  const FACE_POLL_BUSY_FACTOR = 3;
  // Invalidates an in-flight tick so it can't re-arm a stopped poll.
  const faceLoopGenRef = useRef(0);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    return () => {
      faceCounterRef.current?.close();
      faceCounterRef.current = null;
      // Stop periodic face detection
      if (faceCheckIntervalRef.current) {
        clearInterval(faceCheckIntervalRef.current);
        faceCheckIntervalRef.current = null;
      }
      if (networkCheckIntervalRef.current) {
        clearInterval(networkCheckIntervalRef.current);
        networkCheckIntervalRef.current = null;
      }
      micGenRef.current += 1;
      micResumeCleanupRef.current?.();
      micResumeCleanupRef.current = null;
      if (micCheckIntervalRef.current) {
        clearInterval(micCheckIntervalRef.current);
        micCheckIntervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      // DON'T cleanup stream on unmount - keep it alive for assessment
      // The parent (CandidateAssessmentPortal) will handle stream cleanup
      // This prevents the black screen gap between system check and assessment
      console.log('[SYSTEM CHECK] Component unmounting - keeping stream alive for assessment');
    };
  }, []);

  // Monitor camera and microphone stream - detect if browser/OS stops them
  useEffect(() => {
    if (!streamRef.current) return;

    const stream = streamRef.current;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    // Handler for when video track ends (camera disabled)
    const handleVideoEnded = () => {
      console.log('[SYSTEM CHECK] Camera track ended - camera was disabled');
      setHasCameraPreview(false);
      setCameraCheck({
        status: 'error',
        message: 'Camera was disabled. Please re-run checks.'
      });
      // Clear video preview to show camera is off
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    // Handler for when audio track ends (microphone disabled)
    const handleAudioEnded = () => {
      console.log('[SYSTEM CHECK] Audio track ended - microphone was disabled');
      setMicCheck({
        status: 'error',
        message: 'Microphone was disabled. Please re-run checks.'
      });
    };

    // Add event listeners for track ended events
    if (videoTrack) {
      videoTrack.addEventListener('ended', handleVideoEnded);
    }
    if (audioTrack) {
      audioTrack.addEventListener('ended', handleAudioEnded);
    }

    // Periodic check every 2 seconds to detect if tracks are no longer live
    const monitorInterval = setInterval(() => {
      if (videoTrack && videoTrack.readyState === 'ended') {
        console.log('[SYSTEM CHECK] Camera track readyState is ended');
        setCameraCheck({
          status: 'error',
          message: 'Camera stopped working. Please re-run checks.'
        });
      }
      if (audioTrack && audioTrack.readyState === 'ended') {
        console.log('[SYSTEM CHECK] Microphone track readyState is ended');
        setMicCheck({
          status: 'error',
          message: 'Microphone stopped working. Please re-run checks.'
        });
      }
    }, 2000);

    // Cleanup
    return () => {
      clearInterval(monitorInterval);
      if (videoTrack) {
        videoTrack.removeEventListener('ended', handleVideoEnded);
      }
      if (audioTrack) {
        audioTrack.removeEventListener('ended', handleAudioEnded);
      }
    };
  }, [hasCameraPreview]);

  useEffect(() => {
    // Internet 'warning' (slow but reachable) is allowed — candidate can still proceed.
    // All other checks must be 'success'.
    const allSuccess =
      cameraCheck.status === 'success' &&
      multipleCheck.status === 'success' &&
      micCheck.status === 'success' &&
      (internetCheck.status === 'success' || internetCheck.status === 'warning') &&
      browserCheck.status === 'success';
    setAllChecksComplete(allSuccess);
  }, [cameraCheck, multipleCheck, micCheck, internetCheck, browserCheck]);

  // Cancels the face poll for good: clears the pending timer AND invalidates
  // any tick already running, which clearTimeout alone cannot do (that tick
  // would finish and schedule the next one).
  const stopFaceDetectionPolling = () => {
    faceLoopGenRef.current += 1;
    if (faceCheckIntervalRef.current) {
      clearTimeout(faceCheckIntervalRef.current);
      faceCheckIntervalRef.current = null;
    }
  };

  const stopNetworkPolling = () => {
    if (networkCheckIntervalRef.current) {
      clearInterval(networkCheckIntervalRef.current);
      networkCheckIntervalRef.current = null;
    }
  };

  const stopMicMonitoring = () => {
    micGenRef.current += 1;
    micResumeCleanupRef.current?.();
    micResumeCleanupRef.current = null;
    if (micCheckIntervalRef.current) {
      clearInterval(micCheckIntervalRef.current);
      micCheckIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const stopExistingStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasCameraPreview(false);
  };

  const getHealthUrl = () => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    return `${apiBaseUrl.replace(/\/api\/v1\/?$/, '')}/health`;
  };

  const getAudioRms = (analyser: AnalyserNode): number => {
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buffer);
    const sum = buffer.reduce((acc, value) => acc + value * value, 0);
    return Math.sqrt(sum / Math.max(buffer.length, 1));
  };

  const analyzeCurrentVideoFrame = (): { obstructed: boolean; tooDark: boolean } | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = Math.max(90, Math.round((video.videoHeight / video.videoWidth) * 160));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let total = 0;
    let totalSq = 0;
    let min = 255;
    let max = 0;
    let edgeTotal = 0;
    let edgeSamples = 0;

    const luminanceValues = new Float32Array(canvas.width * canvas.height);
    for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
      const luminance = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
      luminanceValues[pixel] = luminance;
      total += luminance;
      totalSq += luminance * luminance;
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
    }

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 1; x < canvas.width; x += 1) {
        const current = luminanceValues[(y * canvas.width) + x];
        const left = luminanceValues[(y * canvas.width) + x - 1];
        edgeTotal += Math.abs(current - left);
        edgeSamples += 1;
      }
    }

    const pixelCount = canvas.width * canvas.height;
    const averageBrightness = total / Math.max(pixelCount, 1);
    const variance = (totalSq / Math.max(pixelCount, 1)) - (averageBrightness * averageBrightness);
    const stdDev = Math.sqrt(Math.max(variance, 0));
    const dynamicRange = max - min;
    const averageEdge = edgeTotal / Math.max(edgeSamples, 1);
    const tooDark = averageBrightness < 18 || max < 28;
    const tooUniform = stdDev < 10 && dynamicRange < 30;
    const tooFlat = averageEdge < 5;

    return {
      obstructed: tooDark || tooUniform || tooFlat,
      tooDark,
    };
  };

  const runAllChecks = async () => {
    setIsChecking(true);

    stopFaceDetectionPolling();
    stopNetworkPolling();
    stopMicMonitoring();
    stopExistingStream();

    // Reset all checks including camera in use error
    setCameraCheck({ status: 'checking', message: 'Checking...' });
    setMultipleCheck({ status: 'checking', message: 'Checking...' });
    setMicCheck({ status: 'checking', message: 'Checking...' });
    setInternetCheck({ status: 'checking', message: 'Checking...' });
    setBrowserCheck({ status: 'checking', message: 'Checking...' });
    setCameraInUseError(''); // Clear previous camera in use error
    // Reset face-detection tolerance buffers so a previous run's misses
    // don't leak into this one.
    noFaceCountRef.current = 0;
    multiFaceCountRef.current = 0;
    faceDetectionFailureCountRef.current = 0;
    networkSpeedMbpsRef.current = null;
    networkLatencyMsRef.current = null;
    browserInfoRef.current = null;

    // Run checks
    await checkBrowser();
    await checkInternet();
    startNetworkPolling(); // keep re-checking so slow→fast transitions update immediately
    await checkCameraAndMicrophone();  // Combined to avoid permission conflicts

    setIsChecking(false);
    setChecksRan(true);
  };

  // Per-row Retry, as on the AI interview System Check: re-runs only the
  // failed row's check. Camera, Multiple People and Microphone come from one
  // shared media stream, so retrying any of them re-acquires it and re-runs
  // those three together.
  const retryCheck = async (kind: 'browser' | 'internet' | 'media') => {
    setIsChecking(true);
    if (kind === 'browser') {
      setBrowserCheck({ status: 'checking', message: 'Checking...' });
      browserInfoRef.current = null;
      await checkBrowser();
    } else if (kind === 'internet') {
      stopNetworkPolling();
      setInternetCheck({ status: 'checking', message: 'Checking...' });
      networkSpeedMbpsRef.current = null;
      networkLatencyMsRef.current = null;
      await checkInternet();
      startNetworkPolling();
    } else {
      stopFaceDetectionPolling();
      stopMicMonitoring();
      stopExistingStream();
      setCameraCheck({ status: 'checking', message: 'Checking...' });
      setMultipleCheck({ status: 'checking', message: 'Checking...' });
      setMicCheck({ status: 'checking', message: 'Checking...' });
      setCameraInUseError('');
      noFaceCountRef.current = 0;
      multiFaceCountRef.current = 0;
      faceDetectionFailureCountRef.current = 0;
      await checkCameraAndMicrophone();
    }
    setIsChecking(false);
  };

  const checkBrowser = async () => {
    try {
      const browser = detectBrowser();
      const compat = checkBrowserCompatibility();
      browserInfoRef.current = browser;

      // Store browser type and iOS detection for error messaging
      setBrowserType(browser.name);
      setIsIOS(browser.isIOS);

      // Check for compatibility issues
      if (!compat.isCompatible) {
        setBrowserCheck({ status: 'error', message: `${browser.name} detected. ${compat.issues.join(' ')}` });
        setBrowserWarning(compat.warnings[0] || null);
      } else if (shouldUseAdaptiveAssessmentMode(browser)) {
        setBrowserCheck({ status: 'success', message: `Detected browser: ${browser.name} (adaptive mode supported)` });
        setBrowserWarning(compat.warnings[0] || 'Adaptive assessment mode will be used for this browser/device.');
      } else if (browser.name === 'Safari' || browser.name === 'iOS Safari') {
        setBrowserCheck({ status: 'success', message: `Detected browser: ${browser.name}` });
        setBrowserWarning(compat.warnings[0] || null);
      } else if (browser.name === 'Chrome' || browser.name === 'Edge' || browser.name === 'Firefox' || browser.name === 'Arc' || browser.name === 'Brave') {
        setBrowserCheck({ status: 'success', message: `Detected browser: ${browser.name}` });
        setBrowserWarning(compat.warnings[0] || null);
      } else {
        setBrowserCheck({ status: 'success', message: `Detected browser: ${browser.name}` });
        setBrowserWarning(compat.warnings[0] || null);
      }
    } catch {
      setBrowserCheck({ status: 'error', message: 'Could not detect browser' });
      setBrowserWarning(null);
    }
  };

  const measureLatencyMs = async (healthUrl: string): Promise<number | null> => {
    const latencies: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const start = performance.now();
        await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
        latencies.push(performance.now() - start);
      } catch {
        // ignore and continue with the next attempt
      }
    }

    if (!latencies.length) return null;
    return Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  };

  const measureDownloadMbps = async (): Promise<number | null> => {
    const maxMs = 3500;
    const maxBytes = 10_000_000;
    const minBytes = 200_000;
    const sourceUrl = `https://speed.cloudflare.com/__down?bytes=${maxBytes}&_=${Date.now()}`;

    try {
      const controller = new AbortController();
      const stopTimer = setTimeout(() => controller.abort(), maxMs + 1500);
      const start = performance.now();
      const response = await fetch(sourceUrl, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        clearTimeout(stopTimer);
        return null;
      }

      const reader = response.body.getReader();
      let bytesRead = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) bytesRead += value.length;
        if ((performance.now() - start) >= maxMs || bytesRead >= maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // ignore reader cancel errors
          }
          controller.abort();
          break;
        }
      }

      clearTimeout(stopTimer);
      const elapsedSeconds = (performance.now() - start) / 1000;
      if (bytesRead >= minBytes && elapsedSeconds > 0.15) {
        return (bytesRead * 8) / (elapsedSeconds * 1_000_000);
      }
    } catch {
      // ignore and fall back to latency / browser estimate below
    }

    const estimatedDownlink = (navigator as Navigator & {
      connection?: { downlink?: number };
    }).connection?.downlink;
    if (typeof estimatedDownlink === 'number' && Number.isFinite(estimatedDownlink) && estimatedDownlink > 0) {
      return estimatedDownlink;
    }

    return null;
  };

  const checkInternet = async () => {
    try {
      const healthUrl = getHealthUrl();
      const [latency, speedMbps] = await Promise.all([
        measureLatencyMs(healthUrl),
        measureDownloadMbps(),
      ]);

      networkLatencyMsRef.current = latency;
      networkSpeedMbpsRef.current = speedMbps;

      if (speedMbps !== null) {
        if (speedMbps >= 5) {
          setInternetCheck({
            status: 'success',
            message: `Speed: ${speedMbps.toFixed(1)} Mbps${latency !== null ? ` • ${latency}ms latency` : ''}`,
          });
        } else {
          setInternetCheck({
            status: 'warning',
            message: `Speed: ${speedMbps.toFixed(1)} Mbps${latency !== null ? ` • ${latency}ms latency` : ''} — connection may be unstable`,
          });
        }
      } else if (latency !== null) {
        if (latency < 500) {
          setInternetCheck({
            status: 'success',
            message: `Latency: ${latency}ms • speed test unavailable on this network`,
          });
        } else {
          setInternetCheck({
            status: 'warning',
            message: `Latency: ${latency}ms • speed test unavailable on this network`,
          });
        }
      } else {
        setInternetCheck({ status: 'error', message: 'Unable to measure internet connection' });
      }
    } catch {
      setInternetCheck({ status: 'error', message: 'No internet connection' });
    }
  };

  // Liveness re-check: latency only, no download.
  //
  // This used to re-run the FULL checkInternet — a fresh 10 MB Cloudflare
  // download — every 15 s for as long as the candidate sat on this screen.
  // That saturated the link the page itself needed (the submit call at the
  // end of the check queued behind it) and burned the candidate's data for a
  // number nobody was reading a second time. The measured speed from the
  // first run stands; all this does is notice the connection dropping, and
  // it never overwrites a good reading with a worse-looking one.
  const pollNetworkLiveness = async () => {
    const latency = await measureLatencyMs(getHealthUrl());
    networkLatencyMsRef.current = latency;
    if (latency === null) {
      setInternetCheck({ status: 'error', message: 'No internet connection' });
    }
  };

  const startNetworkPolling = () => {
    if (networkCheckIntervalRef.current) clearInterval(networkCheckIntervalRef.current);
    networkCheckIntervalRef.current = setInterval(() => { void pollNetworkLiveness(); }, 30000);
  };

  const loadSystemCheckFaceApi = async () => {
    if (faceApiModuleRef.current) return faceApiModuleRef.current;

    if (!faceApiLoadPromiseRef.current) {
      faceApiLoadPromiseRef.current = (async () => {
        const faceapi = await loadFaceApiWithCpuBackend();
        await loadFaceApiNetWithFallback(faceapi.nets.tinyFaceDetector, FACE_API_MODEL_URLS);
        faceApiModuleRef.current = faceapi;
        return faceapi;
      })();
    }

    try {
      return await faceApiLoadPromiseRef.current;
    } catch (error) {
      faceApiLoadPromiseRef.current = null;
      throw error;
    }
  };

  // Multiple People row: purely about EXTRA people (AI interview parity) —
  // passes at 0 or 1, fails at 2+ once confirmed on MULTI_FACE_HARD_FAIL
  // consecutive ticks (a lone false box must not block the candidate). During
  // the grace tick the row keeps its status; handleProceed re-checks anyway.
  const applyPeopleCount = (count: number) => {
    if (count >= 2) {
      multiFaceCountRef.current += 1;
      if (multiFaceCountRef.current >= MULTI_FACE_HARD_FAIL) {
        setMultipleCheck({
          status: 'error',
          message: `${count} people detected — only you should be in frame.`,
        });
      } else {
        setMultipleCheck((prev) => ({
          status: prev.status === 'success' ? 'success' : 'checking',
          message: 'Confirming you are alone in frame…',
        }));
      }
      return;
    }
    multiFaceCountRef.current = 0;
    setMultipleCheck({
      status: 'success',
      message: count === 1 ? 'Only you are in frame' : 'No other people detected',
    });
  };

  const countPeopleWithMediaPipe = (video: HTMLVideoElement): Promise<number | null> => {
    if (!faceCounterRef.current) faceCounterRef.current = createMediaPipeFaceCounter();
    return faceCounterRef.current.count(video);
  };

  const applyFaceDetectionResult = (result: SystemCheckFaceResult, mediaPipeCount: number | null = null) => {
    // People count = the larger of the two detectors (either one seeing a
    // second face is enough to stop the candidate and ask).
    applyPeopleCount(Math.max(result.visibleCount, mediaPipeCount ?? 0));

    // Camera row: is the candidate's OWN face visible? With 2+ faces it is —
    // the extra person is the Multiple People row's job.
    if (result.visibleCount >= 2 || (result.visibleCount === 1 && result.candidateVisible)) {
      noFaceCountRef.current = 0;
      faceDetectionFailureCountRef.current = 0;
      setCameraCheck({ status: 'success', message: 'Camera ready — face detected' });
      return;
    }

    // No usable face — the candidate must be visible before system check can pass.
    noFaceCountRef.current += 1;
    const frameAnalysis = analyzeCurrentVideoFrame();
    if (frameAnalysis?.obstructed) {
      setCameraCheck({
        status: 'error',
        message: frameAnalysis.tooDark
          ? 'Camera appears too dark, covered, or blank. Please uncover the camera and improve lighting.'
          : 'Camera appears covered or obstructed. Please clear the lens and face the camera.',
      });
      return;
    }

    if (noFaceCountRef.current >= NO_FACE_HARD_FAIL) {
      setCameraCheck({
        status: 'error',
        message: getSystemCheckFaceErrorMessage(result.reason),
      });
    } else {
      // Grace tick before NO_FACE_HARD_FAIL: the detector blinked, which is
      // normal. Keep the status the row already had and change only the
      // message — dropping an already-passing row to 'checking' cleared
      // allChecksComplete and disabled "Start Assessment" between ticks, so a
      // click landing in that window did nothing and the candidate pressed it
      // over and over. A real absence still fails on the next tick.
      setCameraCheck((prev) => ({
        status: prev.status === 'success' ? 'success' : 'checking',
        message: getSystemCheckFacePendingMessage(result.reason),
      }));
    }
  };

  const detectWithFaceApi = async (video: HTMLVideoElement): Promise<SystemCheckFaceResult> => {
    const faceapi = await loadSystemCheckFaceApi();
    const options = new faceapi.TinyFaceDetectorOptions({
      scoreThreshold: 0.5,
      inputSize: FACE_DETECT_INPUT_SIZE,
    });

    // ONE detection, on a downscaled copy of the frame. This used to run
    // against the raw video element and then run a SECOND full detection on a
    // snapshot whenever the first found nobody — i.e. it doubled the cost of
    // the most expensive path, exactly while the candidate was out of frame
    // and the Start button was already disabled.
    const snapshot = createVideoFrameCanvas(video, FACE_DETECT_FRAME_WIDTH);
    const frameWidth = snapshot ? snapshot.width : video.videoWidth;
    const frameHeight = snapshot ? snapshot.height : video.videoHeight;
    const detections = await faceapi.detectAllFaces(snapshot ?? video, options);

    const typedDetections = detections as Array<{
      box: { x: number; y: number; width: number; height: number };
      score?: number;
    }>;
    const confidentDetections = typedDetections.filter(
      (detection) => (typeof detection.score !== 'number' ? true : detection.score >= MIN_CONFIDENT_FACE_SCORE),
    );
    const multiFaceDetectionCandidates = typedDetections.filter(
      (detection) => (typeof detection.score !== 'number' ? true : detection.score >= MULTI_FACE_MIN_CONFIDENT_SCORE),
    );

    return analyzeSystemCheckFaceDetections({
      detections: typedDetections,
      primaryCandidates: confidentDetections,
      multiFaceCandidates: multiFaceDetectionCandidates,
      getRegion: (detection) => ({
        x: detection.box.x,
        y: detection.box.y,
        width: detection.box.width,
        height: detection.box.height,
        score: detection.score,
      }),
      frameWidth,
      frameHeight,
    });
  };

  // Path A — native FaceDetector API (Chrome / Edge)
  const runFaceDetection = async () => {
    if (!videoRef.current) return;
    if (faceDetectionBusyRef.current) return;

    faceDetectionBusyRef.current = true;
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
        setCameraCheck({
          status: 'checking',
          message: 'Initializing camera preview… please keep your face centered.',
        });
        return;
      }

      const FaceDetector = (window as BrowserWindow).FaceDetector;
      if (!FaceDetector) {
        throw new Error('native_face_detector_unavailable');
      }
      const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      const faces = Array.from(await detector.detect(video));
      const nativeResult = analyzeSystemCheckFaceDetections({
        detections: faces,
        getRegion: (face) => {
          const box = (face as { boundingBox?: DOMRectReadOnly | DOMRect }).boundingBox;
          return box
            ? { x: box.x, y: box.y, width: box.width, height: box.height }
            : null;
        },
        frameWidth: video.videoWidth,
        frameHeight: video.videoHeight,
      });

      let effectiveResult = nativeResult;
      if (!(nativeResult.visibleCount >= 2 || (nativeResult.visibleCount === 1 && nativeResult.candidateVisible))) {
        try {
          const faceApiResult = await detectWithFaceApi(video);
          effectiveResult = chooseAssessmentSystemCheckResult(nativeResult, faceApiResult);
        } catch (fallbackError) {
          console.warn('[SYSTEM CHECK] Native detector fallback to face-api.js failed:', fallbackError);
        }
      }

      applyFaceDetectionResult(effectiveResult, await countPeopleWithMediaPipe(video));
    } catch {
      // Native API failed — caller will switch to face-api.js path
      throw new Error('native_face_detector_unavailable');
    } finally {
      faceDetectionBusyRef.current = false;
    }
  };

  // Path B — face-api.js TinyFaceDetector (Firefox / Safari)
  const runFaceDetectionFaceApi = async () => {
    if (!videoRef.current) return;
    if (faceDetectionBusyRef.current) return;

    faceDetectionBusyRef.current = true;
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
        setCameraCheck({
          status: 'checking',
          message: 'Initializing camera preview… please keep your face centered.',
        });
        return;
      }

      const result = await detectWithFaceApi(video);
      applyFaceDetectionResult(result, await countPeopleWithMediaPipe(video));
    } catch (err) {
      faceDetectionFailureCountRef.current += 1;
      console.warn('[SYSTEM CHECK] face-api.js detection failed:', err);
      const frameAnalysis = analyzeCurrentVideoFrame();
      if (frameAnalysis?.obstructed) {
        setCameraCheck({
          status: 'error',
          message: frameAnalysis.tooDark
            ? 'Camera appears too dark, covered, or blank. Please uncover the camera and improve lighting.'
            : 'Camera appears covered or obstructed. Please clear the lens and face the camera.',
        });
      } else if (faceDetectionFailureCountRef.current < 3) {
        setCameraCheck({
          status: 'checking',
          message: 'Stabilizing face verification… keep only your face clearly visible.',
        });
      } else {
        setCameraCheck({
          status: 'error',
          message: 'Face verification could not stabilize. Keep only your face clearly visible and re-run checks.',
        });
      }
    } finally {
      faceDetectionBusyRef.current = false;
    }
  };

  // Self-scheduling poll: the next tick is armed only once the previous one has
  // returned, and waits FACE_POLL_BUSY_FACTOR x however long that took. The old
  // fixed 2.5 s setInterval kept firing while a ~1 s CPU inference was still
  // running (the busy flag just dropped those ticks), so the main thread never
  // got a gap in which to paint or handle a click.
  const startFaceDetectionPolling = (useFaceApi: boolean) => {
    stopFaceDetectionPolling();
    const generation = ++faceLoopGenRef.current;
    const tick = useFaceApi ? runFaceDetectionFaceApi : runFaceDetection;
    const run = async () => {
      if (faceLoopGenRef.current !== generation) return;
      const startedAt = performance.now();
      try {
        await tick();
      } catch {
        // tick() reports its own failures; never let one kill the poll.
      }
      if (faceLoopGenRef.current !== generation) return;
      faceCheckIntervalRef.current = setTimeout(run, Math.min(
        FACE_POLL_MAX_MS,
        Math.max(FACE_POLL_MIN_MS, (performance.now() - startedAt) * FACE_POLL_BUSY_FACTOR),
      ));
    };
    faceCheckIntervalRef.current = setTimeout(run, FACE_POLL_MIN_MS);
  };

  // How the mic check decides "voice": a level clearly above the room's quiet
  // floor. The floor is the quiet end of a short sample window, then keeps
  // tracking the quietest level heard. It used to be ONE reading taken 1.2 s
  // in: if the candidate was already talking (or the room was briefly loud)
  // the threshold landed above normal speech and the row said "Listening"
  // forever.
  const MIC_CALIBRATION_SAMPLES = 12; // x 100 ms
  const MIC_POLL_MS = 150;

  const startMicCheck = async (audioTracks: MediaStreamTrack[]) => {
    const gen = ++micGenRef.current;
    const stale = () => gen !== micGenRef.current;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      const AudioContextImpl: typeof AudioContext | undefined =
        window.AudioContext || (window as BrowserWindow).webkitAudioContext;
      if (!AudioContextImpl) {
        setMicCheck({ status: 'error', message: 'This browser cannot verify microphone input.' });
        return;
      }

      const audioContext = new AudioContextImpl();
      audioContextRef.current = audioContext;
      try {
        await audioContext.resume();
      } catch {
        // ignore; the state check below handles a context that stays suspended
      }
      let waitMs = 0;
      while (audioContext.state !== 'running' && waitMs < 2000 && !stale()) {
        await sleep(100);
        waitMs += 100;
      }
      if (stale()) {
        audioContext.close().catch(() => {});
        return;
      }

      // Chrome can keep an AudioContext suspended until the page gets a user
      // gesture; a suspended analyser reads silence forever. Resume on the
      // candidate's next click or key press (the poll below asks for one).
      if (audioContext.state !== 'running') {
        const resume = () => { audioContext.resume().catch(() => {}); };
        window.addEventListener('pointerdown', resume);
        window.addEventListener('keydown', resume);
        micResumeCleanupRef.current = () => {
          window.removeEventListener('pointerdown', resume);
          window.removeEventListener('keydown', resume);
        };
      }

      const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      setMicCheck({ status: 'checking', message: 'Listening — say something to confirm your microphone...' });

      const samples: number[] = [];
      for (let i = 0; i < MIC_CALIBRATION_SAMPLES; i += 1) {
        await sleep(100);
        if (stale()) return;
        samples.push(getAudioRms(analyser));
      }
      samples.sort((a, b) => a - b);
      let noiseFloor = samples[Math.floor(samples.length * 0.2)] ?? 0;

      if (micCheckIntervalRef.current) {
        clearInterval(micCheckIntervalRef.current);
      }
      const intervalId = setInterval(() => {
        if (stale()) {
          clearInterval(intervalId);
          return;
        }
        if (audioContext.state !== 'running') {
          audioContext.resume().catch(() => {});
          setMicCheck({ status: 'checking', message: 'Click anywhere on this page to start the microphone check.' });
          return;
        }
        const level = getAudioRms(analyser);
        noiseFloor = Math.min(noiseFloor, level);
        const voiceThreshold = Math.max(noiseFloor * 1.8, noiseFloor + 6, 8);
        if (level >= voiceThreshold) {
          clearInterval(intervalId);
          if (micCheckIntervalRef.current === intervalId) micCheckIntervalRef.current = null;
          micResumeCleanupRef.current?.();
          micResumeCleanupRef.current = null;
          setMicCheck({ status: 'success', message: 'Voice detected — microphone working correctly' });
          return;
        }
        setMicCheck(
          level >= 1
            ? { status: 'checking', message: 'Listening — say something to confirm your microphone...' }
            : { status: 'checking', message: 'No audio detected — speak clearly or unmute your microphone.' },
        );
      }, MIC_POLL_MS);
      micCheckIntervalRef.current = intervalId;
    } catch (err) {
      if (stale()) return;
      console.error('[SYSTEM CHECK] Microphone check failed:', err);
      setMicCheck({ status: 'error', message: 'Could not verify the microphone. Please re-run checks.' });
    }
  };

  const checkCameraAndMicrophone = async () => {
    // Request both camera and microphone together to avoid permission conflicts
    try {
      // Use enhanced getUserMedia with cross-browser support
      const stream = await getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setHasCameraPreview(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void playVideo(videoRef.current);
      }

      // Check if we got both video and audio tracks
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      // The mic check runs ALONGSIDE face detection. It used to start only
      // after face detection returned, and on Windows Chrome that is the
      // CPU-bound face-api path (seconds per pass, or a hang while models
      // load), so the Microphone row sat on "Checking..." though the mic was fine.
      let micTask: Promise<void> = Promise.resolve();
      if (audioTracks.length > 0) {
        micTask = startMicCheck(audioTracks);
      } else {
        setMicCheck({ status: 'error', message: 'No audio track available' });
      }

      if (videoTracks.length > 0) {
        setCameraCheck({ status: 'checking', message: 'Detecting face...' });
        // Give the video element a moment to render actual frames
        await new Promise(r => setTimeout(r, 1000));

        const hasNativeFaceDetector = 'FaceDetector' in window;
        if (hasNativeFaceDetector) {
          try {
            await runFaceDetection();
            startFaceDetectionPolling(false);
          } catch {
            // Native detector threw — fall back to face-api.js
            await runFaceDetectionFaceApi();
            startFaceDetectionPolling(true);
          }
        } else {
          // Firefox / Safari — use face-api.js TinyFaceDetector
          await runFaceDetectionFaceApi();
          startFaceDetectionPolling(true);
        }
      } else {
        setHasCameraPreview(false);
        setCameraCheck({ status: 'error', message: 'No video track available' });
      }

      await micTask;

    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Unknown media device error');
      console.error('[SYSTEM CHECK] Media device error:', {
        name: error.name,
        message: error.message,
        browser: browserType,
        isIOS: isIOS,
        fullError: err
      });

      // Get browser info for error messages
      const browser = detectBrowser();
      const errorMessage = error.message || '';

      // Handle standardized error codes from getUserMedia
      if (errorMessage === 'PERMISSION_DENIED') {
        const msg = 'Both camera and microphone are required. Please allow both in your browser site settings, then reload and re-run checks.';
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else if (errorMessage === 'DEVICE_NOT_FOUND') {
        const msg = getErrorMessage('DEVICE_NOT_FOUND', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else if (errorMessage === 'DEVICE_IN_USE') {
        const msg = getErrorMessage('DEVICE_IN_USE', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: 'Microphone may be in use by another app or tab' });
        setCameraInUseError(msg); // Store for prominent display
      } else if (errorMessage === 'SECURITY_ERROR_HTTPS_REQUIRED') {
        const msg = getErrorMessage('SECURITY_ERROR_HTTPS_REQUIRED', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else if (errorMessage === 'MEDIA_API_NOT_SUPPORTED') {
        const msg = getErrorMessage('MEDIA_API_NOT_SUPPORTED', browser.name);
        setCameraCheck({ status: 'error', message: msg });
        setMicCheck({ status: 'error', message: msg });
      } else {
        // For unknown errors, show user-friendly message
        setHasCameraPreview(false);
        setCameraCheck({ status: 'error', message: 'Camera error - please check if camera is available' });
        setMicCheck({ status: 'error', message: 'Microphone error - please check if microphone is available' });
      }
      // No per-device fallback: assessment requires BOTH camera and microphone.
      // If the combined request fails, both are reported failed and the
      // candidate must allow both before proceeding.
    }
  };

  const handleProceed = async () => {
    setIsSubmitting(true);
    try {
      stopFaceDetectionPolling();

      const faceDetectionWaitDeadline = Date.now() + 3000;
      while (faceDetectionBusyRef.current && Date.now() < faceDetectionWaitDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Final "alone in frame" check at the moment of Start (AI interview
      // parity): the poll runs every few seconds and the row passes during its
      // grace tick, so someone stepping in just before the click got through.
      const startVideo = videoRef.current;
      if (startVideo && startVideo.readyState >= 2) {
        const mediaPipeCount = await countPeopleWithMediaPipe(startVideo);
        let fallbackCount = 0;
        try {
          fallbackCount = (await detectWithFaceApi(startVideo)).visibleCount;
        } catch {
          // fallback detector unavailable — the MediaPipe count stands alone
        }
        const people = Math.max(mediaPipeCount ?? 0, fallbackCount);
        if (people >= 2) {
          multiFaceCountRef.current = MULTI_FACE_HARD_FAIL;
          setMultipleCheck({
            status: 'error',
            message: `${people} people detected — only you should be in frame before starting.`,
          });
          // Keep watching so the row turns green once they are alone.
          startFaceDetectionPolling(!('FaceDetector' in window));
          return;
        }
      }

      const results: SystemCheckResult = {
        camera_available: cameraCheck.status === 'success',
        microphone_available: micCheck.status === 'success',
        screen_share_available: false,
        browser_compatible: browserCheck.status === 'success',
        internet_speed_mbps: networkSpeedMbpsRef.current,
        browser_info: browserInfoRef.current
          ? {
              name: browserInfoRef.current.name,
              is_ios: browserInfoRef.current.isIOS,
              is_mobile: browserInfoRef.current.isMobile,
              supports_media_devices: browserInfoRef.current.supportsMediaDevices,
              supports_fullscreen: browserInfoRef.current.supportsFullscreen,
              measured_latency_ms: networkLatencyMsRef.current,
            }
          : undefined,
      };

      await candidateService.submitSystemCheck(token, results);

      // Validate stream before handoff to ensure it's still live
      let streamToPass = streamRef.current;

      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const audioTrack = streamRef.current.getAudioTracks()[0];

        const isVideoLive = videoTrack && videoTrack.readyState === 'live';
        const isAudioLive = audioTrack && audioTrack.readyState === 'live';

        console.log('[SYSTEM CHECK] Stream validation before handoff:', {
          hasStream: !!streamRef.current,
          videoTrack: videoTrack ? videoTrack.readyState : 'none',
          audioTrack: audioTrack ? audioTrack.readyState : 'none',
          isVideoLive,
          isAudioLive
        });

        // If video track is not live, try to request a fresh stream
        if (!isVideoLive) {
          console.log('[SYSTEM CHECK] Video track not live - requesting fresh stream');
          try {
            const freshStream = await getUserMedia({ video: true, audio: true });
            streamRef.current = freshStream;
            streamToPass = freshStream;

            // Update video preview with fresh stream
            if (videoRef.current) {
              videoRef.current.srcObject = freshStream;
              void playVideo(videoRef.current);
            }

            console.log('[SYSTEM CHECK] Fresh stream acquired successfully');
          } catch (err) {
            console.warn('[SYSTEM CHECK] Failed to get fresh stream - assessment will handle camera re-initialization', err);
            // Continue anyway - assessment component will handle camera re-request
          }
        } else {
          console.log('[SYSTEM CHECK] Stream is healthy and live');
        }
      }

      if (onRegisterFace && videoRef.current) {
        // Fire-and-forget (2026-09-24): registration now runs off-thread in the
        // portal's hook and keeps going after this screen unmounts; the baseline
        // lands in storage before the assessment starts. Awaiting it here made
        // the candidate sit on a spinner (and, on the old main-thread path,
        // froze the next screen) for up to 8 s.
        void onRegisterFace(videoRef.current)
          .then((ok) => console.log(`[SYSTEM CHECK] Face baseline registration ${ok ? 'done' : 'not captured'} (background)`))
          .catch((error) => console.warn('[SYSTEM CHECK] Face baseline registration failed:', error));
      }

      // Pass the stream to parent to keep camera alive (prevents black screen)
      console.log('[SYSTEM CHECK] Passing stream to parent - keeping camera alive');
      onComplete(streamToPass || undefined);
    } catch (err) {
      console.error('Failed to submit system check:', err);
      // Still proceed even if submission fails - pass stream to keep camera alive
      onComplete(streamRef.current || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  // A row's status, as the AI interview System Check shows it: a "Working"
  // / "Failed" badge rather than a bare tick or cross.
  const StatusBadge = ({ status }: { status: CheckStatus['status'] }) => {
    switch (status) {
      case 'pending':
        return <span className="tf-caption">Pending</span>;
      case 'checking':
        return <Loader2 className="w-5 h-5 text-brand-blue animate-spin" />;
      case 'success':
        return (
          <span className={`${STATUS_CHIP} bg-success-subtle text-success`}>
            <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center">
              <Check className="w-3 h-3" strokeWidth={3} />
            </span>
            Working
          </span>
        );
      case 'warning':
        return (
          <span className={`${STATUS_CHIP} bg-warning-subtle text-warning`}>
            <AlertTriangle className="w-3.5 h-3.5" />
            Warning
          </span>
        );
      case 'error':
        return (
          <span className={`${STATUS_CHIP} bg-destructive/10 text-destructive`}>
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
    }
  };

  // Progress steps
  return (
    <div className={CANDIDATE_PAGE}>
      {/* Sticky Header Container */}
      {/* Header + stepper: the shared pair. */}
      <div className="sticky top-0 z-50">
        <CandidateHeader />
        <CandidateStepper current={2} />
      </div>

      {/* The recruiter page shell. */}
      <main className={RECRUITER_SHELL}>
        <div className={RECRUITER_WRAP}>
          <div className={RECRUITER_CARD}>

            {/* Page header — the recruiter pattern, in place of the centred
                blue hero band. */}
            <div className="flex items-start gap-3 mb-4">
              <div className={PAGE_ICON_TILE}>
                <Monitor className={`${ICON} text-brand-blue`} />
              </div>
              <div className="min-w-0">
                <h1 className={T_PAGE_TITLE}>System Check</h1>
                <p className={T_PAGE_SUBTITLE}>
                  Let&apos;s make sure your system is ready for the assessment
                </p>
              </div>
            </div>

          <div className="tf-grid-split items-start">
            {/* Camera Preview */}
            <div>
              <h2 className={`${T_SECTION} mb-3`}>Camera Preview</h2>
              <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {!hasCameraPreview && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="w-12 h-12 text-gray-600" />
                  </div>
                )}
              </div>
            </div>

            {/* Checks */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className={T_SECTION}>System Requirements</h2>
                {/* Green with a play icon, as the AI interview's Run Check
                    button. Nothing runs until this is clicked, so before the
                    first run it also carries a pulsing ring — the candidate's
                    obvious next step. Gone once that first run has finished. */}
                {!checksRan && (
                <Button
                  size="sm"
                  className={`!bg-success hover:!bg-success-strong text-white font-bold shadow-lg ${checksNotStarted ? 'tf-attention-pulse-success' : ''}`}
                  onClick={runAllChecks}
                  disabled={isChecking}
                >
                  {isChecking
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Play className="w-3.5 h-3.5" />}
                  {isChecking ? 'Checking...' : 'Run Checks'}
                </Button>
                )}
              </div>
              {checksNotStarted && (
                <p className="-mt-1 mb-3 text-sm font-medium text-brand-blue">
                  Click &quot;Run Checks&quot; to test your camera, microphone and connection.
                </p>
              )}

              {/* The rows, in the AI interview System Check's style: white
                  card, small tile, compact label + detail, status badge on the
                  right. `flex-wrap` drops the badge under the label when a
                  narrow column runs out of room. */}
              <div className="flex flex-col gap-2">
                {([
                  { label: 'Browser', check: browserCheck, Icon: Monitor, retry: 'browser' },
                  { label: 'Internet Connection', check: internetCheck, Icon: Wifi, retry: 'internet' },
                  { label: 'Camera', check: cameraCheck, Icon: Camera, retry: 'media' },
                  { label: 'Multiple People Check', check: multipleCheck, Icon: Users, retry: 'media' },
                  { label: 'Microphone', check: micCheck, Icon: Mic, retry: 'media' },
                ] as const).map(({ label, check, Icon, retry }) => (
                  <div
                    key={label}
                    className={`rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 ${
                      check.status === 'error' ? 'border-destructive/30 bg-destructive/[0.04]' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className={checkTile(check.status)}>
                      <Icon className="w-4.5 h-4.5" />
                    </span>
                    <div className="flex-1 min-w-[8rem]">
                      <p className="tf-row-title">{label}</p>
                      <p className="tf-meta [overflow-wrap:anywhere]">{check.message}</p>
                    </div>
                    <div className="flex shrink-0 ml-auto items-center gap-2">
                      <StatusBadge status={check.status} />
                      {/* Hidden while any check is running, so a retry never
                          races a full run on the same stream. */}
                      {check.status === 'error' && !isChecking && (
                        <button
                          type="button"
                          onClick={() => void retryCheck(retry)}
                          className={`${STATUS_CHIP} text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/5 transition-colors`}
                          title={`Retry ${label}`}
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Status Message */}
              {allChecksComplete && (
                <div className="mt-3 px-4 py-3 bg-success-subtle rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0 text-success" />
                  <p className="text-sm text-success font-semibold">All checks passed! You&apos;re ready to start.</p>
                </div>
              )}

              {(() => {
                // Show "Some checks failed" only when ALL checks have settled
                // into a terminal state AND at least one is in error. The
                // previous condition fired while Camera/Microphone were still
                // in 'checking' (e.g., showing "Detecting face..."), making
                // the warning appear before any check had actually failed.
                // Multiple People only settles once the camera works — a
                // camera error leaves it 'checking' and must not hide this.
                const checks = [
                  cameraCheck, micCheck, internetCheck, browserCheck,
                  ...(cameraCheck.status === 'success' ? [multipleCheck] : []),
                ];
                const inProgress = checks.some(c => c.status === 'pending' || c.status === 'checking');
                const anyError = checks.some(c => c.status === 'error');
                if (inProgress || !anyError) return null;
                return (
                  <div className="mt-3 px-4 py-3 bg-warning-subtle rounded-xl flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 text-warning" />
                    <p className="text-sm text-warning font-medium">Some checks failed. Please resolve the issues above.</p>
                  </div>
                );
              })()}

              {browserWarning && browserCheck.status === 'success' && (
                <div className="mt-3 rounded-xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 flex items-start gap-3">
                  <AlertTriangle className={`${ICON_INLINE} text-brand-blue mt-0.5`} />
                  <p className={`${T_CARD_TITLE} text-brand-blue`}>{browserWarning}</p>
                </div>
              )}

              {/* Prominent Camera In Use Error Box */}
              {cameraInUseError && (
                <div className="mt-3 p-4 bg-destructive-subtle border border-destructive-line rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <XCircle className="w-6 h-6 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-destructive-strong mb-1">Camera Is In Use</h4>
                      <p className="text-sm text-destructive-strong mb-3">{cameraInUseError}</p>
                      <div className="bg-white rounded-lg p-3 border border-destructive-line">
                        <p className="text-sm font-semibold text-destructive-strong mb-1.5">How to fix this:</p>
                        <ol className="list-decimal list-inside space-y-1 text-destructive-strong text-sm">
                          <li>Close any apps using your camera (Zoom, Teams, Skype, FaceTime, Google Meet)</li>
                          <li>Close other browser tabs that may be using your camera</li>
                          {isIOS && (
                            <li>On iPhone/iPad: Go to Settings → Privacy → Camera and check which apps have access</li>
                          )}
                          {browserType === 'Firefox' && (
                            <li>In Firefox: Check if Enhanced Tracking Protection is blocking camera access (shield icon in address bar)</li>
                          )}
                          {browserType === 'Safari' && (
                            <li>In Safari: Check Safari → Preferences → Websites → Camera permissions</li>
                          )}
                          <li>If problems persist, restart your browser</li>
                          <li>Click &quot;Run Checks&quot; again once you&apos;ve closed other apps</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

            {/* Action row — inside the page card, on the recruiter's footer
                rule. Forward only: there is no going back to Job & Consent
                from here. */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
          <Button
            variant="primary"
            onClick={handleProceed}
            disabled={!allChecksComplete || isSubmitting}
            loading={isSubmitting}
            size="md"
          >
            Start Assessment
            <ArrowRight className={`${ICON_INLINE} ml-2`} />
          </Button>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
