'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';
import {
  Camera,
  Mic,
  Monitor,
  Wifi,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Check,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadFaceApiWithCpuBackend } from '@/lib/face-api-loader';
import {
  createVideoFrameCanvas,
  FACE_API_MODEL_URLS,
  filterSignificantFaces,
  loadFaceApiNetWithFallback,
  MIN_CONFIDENT_FACE_SCORE,
} from '@/lib/proctoring/faceDetection';
import { candidateService, SystemCheckResult } from '@/lib/services/candidateService';
import { getUserMedia, getErrorMessage, detectBrowser, checkBrowserCompatibility, playVideo, shouldUseAdaptiveAssessmentMode } from '@/lib/utils/browserCompat';

interface SystemCheckProps {
  token: string;
  onComplete: (stream?: MediaStream) => void; // Pass stream to parent to keep it alive
  onRegisterFace?: (videoElement: HTMLVideoElement) => Promise<boolean>;
  onBack: () => void;
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

const FACE_REGISTRATION_TIMEOUT_MS = 8000;

export function SystemCheck({ token, onComplete, onRegisterFace, onBack }: SystemCheckProps) {
  const [cameraCheck, setCameraCheck] = useState<CheckStatus>({ status: 'pending', message: 'Not checked' });
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const networkCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const micCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const networkSpeedMbpsRef = useRef<number | null>(null);
  const networkLatencyMsRef = useRef<number | null>(null);
  const browserInfoRef = useRef<ReturnType<typeof detectBrowser> | null>(null);
  const faceDetectionBusyRef = useRef(false);
  const faceDetectionFailureCountRef = useRef(0);

  // Face verification must pass before the candidate can proceed.
  // We allow a short grace window for the detector to stabilize, but we no
  // longer soft-pass "no face" readings.
  const noFaceCountRef = useRef(0);
  const multiFaceCountRef = useRef(0);
  const MULTI_FACE_HARD_FAIL = 2;
  const NO_FACE_HARD_FAIL = 2;

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    return () => {
      // Stop periodic face detection
      if (faceCheckIntervalRef.current) {
        clearInterval(faceCheckIntervalRef.current);
        faceCheckIntervalRef.current = null;
      }
      if (networkCheckIntervalRef.current) {
        clearInterval(networkCheckIntervalRef.current);
        networkCheckIntervalRef.current = null;
      }
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
      micCheck.status === 'success' &&
      (internetCheck.status === 'success' || internetCheck.status === 'warning') &&
      browserCheck.status === 'success';
    setAllChecksComplete(allSuccess);
  }, [cameraCheck, micCheck, internetCheck, browserCheck]);

  const stopFaceDetectionPolling = () => {
    if (faceCheckIntervalRef.current) {
      clearInterval(faceCheckIntervalRef.current);
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

  const startNetworkPolling = () => {
    if (networkCheckIntervalRef.current) clearInterval(networkCheckIntervalRef.current);
    // Re-check every 15 s to keep the displayed speed current without
    // continuously consuming bandwidth with full download tests.
    networkCheckIntervalRef.current = setInterval(checkInternet, 15000);
  };

  const applyFaceCountResult = (count: number) => {
    if (count === 1) {
      noFaceCountRef.current = 0;
      multiFaceCountRef.current = 0;
      faceDetectionFailureCountRef.current = 0;
      setCameraCheck({ status: 'success', message: 'Camera ready — face detected' });
      return;
    }

    if (count >= 2) {
      // Multiple faces — strict path.
      noFaceCountRef.current = 0;
      multiFaceCountRef.current += 1;
      if (multiFaceCountRef.current >= MULTI_FACE_HARD_FAIL) {
        setCameraCheck({
          status: 'error',
          message: `Multiple faces detected (${count}). Only you should be in frame.`,
        });
      } else {
        setCameraCheck({
          status: 'checking',
          message: 'Verifying you are alone in frame…',
        });
      }
      return;
    }

    // count === 0 — the candidate must be visible before system check can pass.
    multiFaceCountRef.current = 0;
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
        message: 'No face detected. Position your face clearly in front of the camera.',
      });
    } else {
      setCameraCheck({
        status: 'checking',
        message: 'Looking for your face… please face the camera with good lighting.',
      });
    }
  };

  // Path A — native FaceDetector API (Chrome / Edge)
  const runFaceDetection = async () => {
    if (!videoRef.current) return;
    if (faceDetectionBusyRef.current) return;

    faceDetectionBusyRef.current = true;
    try {
      const FaceDetector = (window as BrowserWindow).FaceDetector;
      if (!FaceDetector) {
        throw new Error('native_face_detector_unavailable');
      }
      const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      const faces = await detector.detect(videoRef.current);
      const significantFaces = filterSignificantFaces(
        Array.from(faces),
        (face) => {
          const box = (face as { boundingBox?: DOMRectReadOnly | DOMRect }).boundingBox;
          return box
            ? { x: box.x, y: box.y, width: box.width, height: box.height }
            : null;
        },
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
      );
      applyFaceCountResult(significantFaces.length);
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

      const faceapi = await loadFaceApiWithCpuBackend();
      await loadFaceApiNetWithFallback(faceapi.nets.tinyFaceDetector, FACE_API_MODEL_URLS);
      // 0.5 is the face-api.js default. We tried 0.7 to suppress false
      // "multiple faces" hits from posters/monitors, but at 0.7 the actual
      // candidate's face was getting rejected too — especially with glasses
      // or off-axis angles. Holding the threshold at the default keeps real
      // faces in; the multi-face false positives are now handled by the
      // 2-strike buffer in applyFaceCountResult instead.
      const options = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });
      let frameWidth = video.videoWidth;
      let frameHeight = video.videoHeight;
      let usedSnapshot = false;
      let detections;

      try {
        detections = await faceapi.detectAllFaces(video, options);
      } catch (videoError) {
        const snapshot = createVideoFrameCanvas(video);
        if (!snapshot) {
          throw videoError;
        }
        detections = await faceapi.detectAllFaces(snapshot, options);
        frameWidth = snapshot.width;
        frameHeight = snapshot.height;
        usedSnapshot = true;
      }

      if (!detections.length && !usedSnapshot) {
        const snapshot = createVideoFrameCanvas(video);
        if (snapshot) {
          detections = await faceapi.detectAllFaces(snapshot, options);
          frameWidth = snapshot.width;
          frameHeight = snapshot.height;
        }
      }

      const typedDetections = detections as Array<{
        box: { x: number; y: number; width: number; height: number };
        score?: number;
      }>;
      const confidentDetections = typedDetections.filter(
        (detection) => (typeof detection.score !== 'number' ? true : detection.score >= MIN_CONFIDENT_FACE_SCORE),
      );
      const significantDetections = filterSignificantFaces(
        confidentDetections,
        (detection) => ({
          x: detection.box.x,
          y: detection.box.y,
          width: detection.box.width,
          height: detection.box.height,
          score: detection.score,
        }),
        frameWidth,
        frameHeight,
      );
      applyFaceCountResult(significantDetections.length);
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

  const startFaceDetectionPolling = (useFaceApi: boolean) => {
    if (faceCheckIntervalRef.current) clearInterval(faceCheckIntervalRef.current);
    // Re-check every 2.5 s so status updates as the user moves in/out of frame
    faceCheckIntervalRef.current = setInterval(
      useFaceApi ? runFaceDetectionFaceApi : runFaceDetection,
      2500
    );
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

      if (audioTracks.length > 0) {
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
          // ignore resume errors; state polling below handles delayed startup
        }

        let waitMs = 0;
        while (audioContext.state !== 'running' && waitMs < 2000) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          waitMs += 100;
        }

        const micOnlyStream = new MediaStream(audioTracks);
        const source = audioContext.createMediaStreamSource(micOnlyStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        setMicCheck({ status: 'checking', message: 'Listening — say something to confirm your microphone...' });
        await new Promise((resolve) => setTimeout(resolve, 1200));

        let ambientLevel = getAudioRms(analyser);
        if (ambientLevel < 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          ambientLevel = getAudioRms(analyser);
        }

        const voiceThreshold = Math.max(ambientLevel * 1.8, 8);
        let voiceDetected = false;

        if (micCheckIntervalRef.current) {
          clearInterval(micCheckIntervalRef.current);
        }
        micCheckIntervalRef.current = setInterval(() => {
          const level = getAudioRms(analyser);
          if (level >= voiceThreshold) {
            voiceDetected = true;
            if (micCheckIntervalRef.current) {
              clearInterval(micCheckIntervalRef.current);
              micCheckIntervalRef.current = null;
            }
            setMicCheck({ status: 'success', message: 'Voice detected — microphone working correctly' });
            return;
          }

          if (!voiceDetected) {
            setMicCheck(
              level >= 1
                ? { status: 'checking', message: 'Listening — say something to confirm your microphone...' }
                : { status: 'checking', message: 'No audio detected — speak clearly or unmute your microphone.' },
            );
          }
        }, 150);
      } else {
        setMicCheck({ status: 'error', message: 'No audio track available' });
      }

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
        try {
          await Promise.race([
            onRegisterFace(videoRef.current).catch(() => false),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), FACE_REGISTRATION_TIMEOUT_MS)),
          ]);
        } catch (error) {
          console.warn('[SYSTEM CHECK] Face baseline registration failed:', error);
        }
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

  const StatusIcon = ({ status }: { status: CheckStatus['status'] }) => {
    switch (status) {
      case 'pending':
        return <div className="w-6 h-6 rounded-full bg-gray-200" />;
      case 'checking':
        return (
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        );
      case 'success':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-6 h-6 text-red-500" />;
    }
  };

  // Progress steps
  const steps = [
    { label: 'Terms & Consent', active: false, completed: true },
    { label: 'Assessment Details', active: false, completed: true },
    { label: 'System Check', active: true, completed: false },
    { label: 'HR Questions', active: false, completed: false },
    { label: 'Assessment', active: false, completed: false }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-50">
        {/* Header */}
        <header className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/logos/talent_flow_logo.png"
                  alt="TalentFlow"
                  width={160}
                  height={40}
                  className="h-10 w-auto"
                  priority
                  unoptimized
                />
              </div>
              <a
                href="mailto:support@talentflow.com"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                Need help?
              </a>
            </div>
          </div>
        </header>

        {/* Progress Stepper */}
        <div className="w-full bg-white border-b border-gray-200">
          <div className="w-full px-6 lg:px-12 py-4">
            <div className="flex items-center justify-center gap-2">
              {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      step.completed
                        ? 'bg-green-500 text-white'
                        : step.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span className={`text-sm font-medium hidden sm:block ${
                      step.active ? 'text-gray-900' : step.completed ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-8 sm:w-16 h-0.5 mx-2 ${
                      step.completed ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 py-10">
        <div className="w-full px-6 lg:px-12 text-center">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">System Check</h1>
          <p className="text-blue-100 text-lg">
            Let&apos;s make sure your system is ready for the assessment
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full bg-white">
        <div className="w-full px-6 lg:px-12 py-10">
          <div className="grid lg:grid-cols-2 gap-10">
            {/* Camera Preview */}
            <div>
              <h3 className="font-semibold text-gray-900 text-xl mb-4">Camera Preview</h3>
              <div className="aspect-video bg-gray-900 rounded-2xl overflow-hidden relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!hasCameraPreview && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="w-20 h-20 text-gray-600" />
                  </div>
                )}
              </div>
            </div>

            {/* Checks */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-xl">System Requirements</h3>
                <Button
                  variant="outline"
                  onClick={runAllChecks}
                  disabled={isChecking}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                  {isChecking ? 'Checking...' : 'Run Checks'}
                </Button>
              </div>

              <div className="space-y-4">
                {/* Browser */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Browser</p>
                      <p className="text-sm text-gray-500">{browserCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={browserCheck.status} />
                </div>

                {/* Internet */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Wifi className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Internet Connection</p>
                      <p className="text-sm text-gray-500">{internetCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={internetCheck.status} />
                </div>

                {/* Camera */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Camera className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Camera</p>
                      <p className="text-sm text-gray-500">{cameraCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={cameraCheck.status} />
                </div>

                {/* Microphone */}
                <div className="flex items-center justify-between p-5 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Mic className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Microphone</p>
                      <p className="text-sm text-gray-500">{micCheck.message}</p>
                    </div>
                  </div>
                  <StatusIcon status={micCheck.status} />
                </div>

              </div>

              {/* Status Message */}
              {allChecksComplete && (
                <div className="mt-6 p-5 bg-green-50 rounded-xl flex items-center gap-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <p className="text-green-700 font-semibold">All checks passed! You&apos;re ready to start.</p>
                </div>
              )}

              {(() => {
                // Show "Some checks failed" only when ALL checks have settled
                // into a terminal state AND at least one is in error. The
                // previous condition fired while Camera/Microphone were still
                // in 'checking' (e.g., showing "Detecting face..."), making
                // the warning appear before any check had actually failed.
                const checks = [cameraCheck, micCheck, internetCheck, browserCheck];
                const inProgress = checks.some(c => c.status === 'pending' || c.status === 'checking');
                const anyError = checks.some(c => c.status === 'error');
                if (inProgress || !anyError) return null;
                return (
                  <div className="mt-6 p-5 bg-amber-50 rounded-xl flex items-center gap-4">
                    <AlertCircle className="w-6 h-6 text-amber-600" />
                    <p className="text-amber-700 font-medium">Some checks failed. Please resolve the issues above.</p>
                  </div>
                );
              })()}

              {browserWarning && browserCheck.status === 'success' && (
                <div className="mt-6 p-5 bg-blue-50 rounded-xl flex items-start gap-4">
                  <AlertTriangle className="w-6 h-6 text-blue-600 mt-0.5" />
                  <p className="text-blue-800 font-medium">{browserWarning}</p>
                </div>
              )}

              {/* Prominent Camera In Use Error Box */}
              {cameraInUseError && (
                <div className="mt-6 p-6 bg-red-50 border-2 border-red-300 rounded-xl">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-red-900 mb-2">Camera Is In Use</h4>
                      <p className="text-red-800 mb-4">{cameraInUseError}</p>
                      <div className="bg-white rounded-lg p-4 border border-red-200">
                        <p className="font-semibold text-red-900 mb-2">How to fix this:</p>
                        <ol className="list-decimal list-inside space-y-2 text-red-800 text-sm">
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
        </div>
      </main>

      {/* Actions Footer */}
      <div className="w-full bg-gray-50 border-t border-gray-200 py-6">
        <div className="w-full px-6 lg:px-12 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} className="text-gray-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button
            variant="primary"
            onClick={handleProceed}
            disabled={!allChecksComplete || isSubmitting}
            loading={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-6 text-lg font-semibold rounded-xl"
          >
            Start Assessment
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
