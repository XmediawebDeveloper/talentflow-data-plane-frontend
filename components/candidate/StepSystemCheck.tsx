'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor,
  Globe,
  Camera,
  Mic,
  Wifi,
  Sun,
  Volume2,
  Eye,
  Users,
  Zap,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Shield,
  CircleDot,
  Play,
  RefreshCw,
  RotateCcw,
  Scan,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface StepSystemCheckProps {
  token: string;
  position?: string;
  onAllPassed: () => void;
  /** Called just before proceeding — registers the candidate's face as a baseline for identity verification during the interview */
  onRegisterFace?: (videoElement: HTMLVideoElement) => Promise<boolean>;
}

type Phase = 'browser_check' | 'browser_results' | 'system_checks' | 'env_scan';
type CheckStatus = 'pending' | 'checking' | 'pass' | 'fail';

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

/**
 * Reliably detect mobile devices even when the browser is in "Desktop Mode".
 * Desktop Mode only changes the User-Agent string; the physical device doesn't change.
 * We combine three independent signals:
 *   1. navigator.userAgentData.mobile  — Chrome 90+ explicitly reports true on mobile, even in Desktop Mode
 *   2. User-Agent regex                — catches non-desktop-mode cases on older browsers
 *   3. Physical screen width < 768px   — window.screen.width reflects actual hardware pixels (CSS px),
 *                                        unchanged by Desktop Mode. Real laptops are ≥ 768px wide.
 *   4. Touch + orientation API         — orientation is only defined on mobile browsers
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;

  // Signal 1: Chrome's explicit mobile flag (survives Desktop Mode)
  if ((navigator as any).userAgentData?.mobile === true) return true;

  const ua = navigator.userAgent;

  // Signal 2: UA string (fails when Desktop Mode rewrites UA, but still useful for Firefox/Safari)
  if (MOBILE_UA_REGEX.test(ua)) return true;

  // Signal 3: Physical screen width — mobile phones are < 768px even in desktop mode
  if (window.screen.width < 768) return true;

  // Signal 4: Touch + window.orientation (orientation API only exists on mobile)
  if (navigator.maxTouchPoints > 1 && typeof (window as any).orientation !== 'undefined') return true;

  return false;
}

// Environment scan constants
const TOTAL_SCAN_FRAMES = 6;
const SCAN_INTERVAL_MS = 2500; // capture frame every 2.5s

interface BrowserInfo {
  name: string;
  version: string;
  majorVersion: number;
  supported: boolean;
}

interface DeviceInfo {
  isMobile: boolean;
  deviceType: string;
  os: string;
  screenWidth: number;
  screenHeight: number;
  browser: BrowserInfo;
}

interface SystemCheckItem {
  id: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  status: CheckStatus;
  colorClass: string;
}

function detectBrowser(ua: string): BrowserInfo {
  if (/Edg\//i.test(ua)) {
    const match = ua.match(/Edg\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Edge', version, majorVersion: major, supported: major >= 85 };
  }
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Chrome', version, majorVersion: major, supported: major >= 85 };
  }
  if (/Firefox\//i.test(ua)) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Firefox', version, majorVersion: major, supported: major >= 85 };
  }
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    const match = ua.match(/Version\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Safari', version, majorVersion: major, supported: major >= 14 };
  }
  return { name: 'Unknown', version: 'unknown', majorVersion: 0, supported: false };
}

function detectOS(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  // Try modern API first
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) return uaData.platform;
  // Fallback to navigator.platform
  const platform = navigator.platform || '';
  if (/Win/i.test(platform)) return 'Windows';
  if (/Mac/i.test(platform)) return 'macOS';
  if (/Linux/i.test(platform)) return 'Linux';
  if (/iPhone|iPad|iPod/i.test(platform)) return 'iOS';
  return platform || 'Unknown';
}

function detectDevice(): DeviceInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mobile = isMobileDevice();
  const browser = detectBrowser(ua);
  const os = detectOS();
  const screenWidth = typeof window !== 'undefined' ? window.screen.width : 0;
  const screenHeight = typeof window !== 'undefined' ? window.screen.height : 0;

  return {
    isMobile: mobile,
    deviceType: mobile ? 'Mobile Device' : 'Desktop/Laptop',
    os,
    screenWidth,
    screenHeight,
    browser,
  };
}

const SUPPORTED_BROWSERS = [
  { name: 'Chrome', minVersion: 'v85+' },
  { name: 'Edge', minVersion: 'v85+' },
  { name: 'Firefox', minVersion: 'v85+' },
  { name: 'Safari', minVersion: 'v14+' },
];

const SYSTEM_REQUIREMENTS = [
  {
    label: 'Desktop or Laptop Computer',
    note: 'Mobile devices not supported',
    check: (d: DeviceInfo) => !d.isMobile,
  },
  {
    label: 'Supported Browser',
    note: 'Chrome, Edge, Firefox, or Safari',
    check: (d: DeviceInfo) => d.browser.supported,
  },
  {
    label: 'Stable Internet Connection',
    note: 'Recommended: 5 Mbps or higher',
    check: () => true, // Always passes for device check phase
  },
  {
    label: 'Webcam & Microphone Access',
    note: 'Required for video interview',
    check: () => true, // Checked later in system_checks phase
  },
];

// ────────────────────────────────────────
// Progress Stepper Component
// ────────────────────────────────────────
const STEPPER_STEPS = ['Browser Check', 'System Checks', 'Environment Scan'];

function getStepIndex(phase: Phase): number {
  if (phase === 'browser_check' || phase === 'browser_results') return 0;
  if (phase === 'system_checks') return 1;
  if (phase === 'env_scan') return 2;
  return 0;
}

function ProgressStepper({ phase }: { phase: Phase }) {
  const activeStep = getStepIndex(phase);

  return (
    <div className="flex items-center justify-center w-full mb-6">
      {STEPPER_STEPS.map((label, idx) => {
        const isCompleted = idx < activeStep;
        const isActive = idx === activeStep;
        const isPending = idx > activeStep;

        return (
          <React.Fragment key={label}>
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm select-none ${
                  isCompleted
                    ? 'bg-gray-900 text-white'
                    : isActive
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isActive ? 'text-gray-900' : isPending ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {idx < STEPPER_STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-3 mb-5 ${
                  idx < activeStep ? 'bg-gray-900' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function StepSystemCheck({
  token,
  position = 'this position',
  onAllPassed,
  onRegisterFace,
}: StepSystemCheckProps) {
  const [phase, setPhase] = useState<Phase>('browser_check');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // System checks phase state
  const [systemChecks, setSystemChecks] = useState<SystemCheckItem[]>([]);
  const [hasFaceDetector, setHasFaceDetector] = useState(false);
  const [checksRunning, setChecksRunning] = useState(false);
  const [checksCompleted, setChecksCompleted] = useState(false);

  // Environment scan state
  const [envScanPhase, setEnvScanPhase] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [envScanProgress, setEnvScanProgress] = useState(0); // 0-100
  const [envScanFrameCount, setEnvScanFrameCount] = useState(0); // 0 to TOTAL_FRAMES
  const [envScanResults, setEnvScanResults] = useState<{
    lighting: boolean;
    singlePerson: boolean;
    clear: boolean;
    lightingDetail?: string;
    singlePersonDetail?: string;
  } | null>(null);

  // Refs for cleanup
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lightingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noiseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const checksCancelledRef = useRef(false);
  const envScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const envScanRAFRef = useRef<number | null>(null);

  // ────────────────────────────────────────
  // Phase 1: Browser Check — auto-detect on mount
  // ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'browser_check') return;

    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      const info = detectDevice();
      setDeviceInfo(info);
      setPhase('browser_results');
    }, 2000);

    return () => clearTimeout(timer);
  }, [phase]);

  // ────────────────────────────────────────
  // Phase 2: System Checks
  // ────────────────────────────────────────
  const updateSystemCheck = useCallback(
    (id: string, update: Partial<Pick<SystemCheckItem, 'status' | 'detail'>>) => {
      setSystemChecks((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...update } : c)),
      );
    },
    [],
  );

  const stopActiveChecks = useCallback(() => {
    checksCancelledRef.current = true;
    if (lightingIntervalRef.current) { clearInterval(lightingIntervalRef.current); lightingIntervalRef.current = null; }
    if (noiseIntervalRef.current) { clearInterval(noiseIntervalRef.current); noiseIntervalRef.current = null; }
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const INITIAL_CHECKS: SystemCheckItem[] = [
    { id: 'device', label: 'Device Type', detail: 'Pending...', icon: <Monitor className="w-4 h-4" />, status: 'pending', colorClass: 'text-gray-600' },
    { id: 'webcam', label: 'Webcam', detail: 'Pending...', icon: <Camera className="w-4 h-4" />, status: 'pending', colorClass: 'text-gray-600' },
    { id: 'microphone', label: 'Microphone', detail: 'Pending...', icon: <Mic className="w-4 h-4" />, status: 'pending', colorClass: 'text-indigo-600' },
    { id: 'internet', label: 'Internet Connection', detail: 'Pending...', icon: <Wifi className="w-4 h-4" />, status: 'pending', colorClass: 'text-cyan-600' },
    { id: 'lighting', label: 'Lighting Conditions', detail: 'Pending...', icon: <Sun className="w-4 h-4" />, status: 'pending', colorClass: 'text-yellow-600' },
    { id: 'noise', label: 'Background Noise', detail: 'Pending...', icon: <Volume2 className="w-4 h-4" />, status: 'pending', colorClass: 'text-orange-600' },
    { id: 'face', label: 'Face Detection', detail: 'Pending...', icon: <Eye className="w-4 h-4" />, status: 'pending', colorClass: 'text-green-600' },
    { id: 'multiple', label: 'Multiple People Check', detail: 'Pending...', icon: <Users className="w-4 h-4" />, status: 'pending', colorClass: 'text-red-600' },
  ];

  // Initialize system checks when entering that phase
  useEffect(() => {
    if (phase !== 'system_checks') return;
    setChecksRunning(false);
    setChecksCompleted(false);
    setSystemChecks([
      {
        id: 'device',
        label: 'Device Type',
        detail: 'Checking device...',
        icon: <Monitor className="w-4 h-4" />,
        status: 'checking',
        colorClass: 'text-gray-600',
      },
      {
        id: 'webcam',
        label: 'Webcam',
        detail: 'Checking webcam...',
        icon: <Camera className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-gray-600',
      },
      {
        id: 'microphone',
        label: 'Microphone',
        detail: 'Checking microphone...',
        icon: <Mic className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-indigo-600',
      },
      {
        id: 'internet',
        label: 'Internet Connection',
        detail: 'Testing connection...',
        icon: <Wifi className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-cyan-600',
      },
      {
        id: 'lighting',
        label: 'Lighting Conditions',
        detail: 'Analyzing lighting...',
        icon: <Sun className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-yellow-600',
      },
      {
        id: 'noise',
        label: 'Background Noise',
        detail: 'Analyzing noise...',
        icon: <Volume2 className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-orange-600',
      },
      {
        id: 'face',
        label: 'Face Detection',
        detail: 'Detecting face...',
        icon: <Eye className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-green-600',
      },
      {
        id: 'multiple',
        label: 'Multiple People Check',
        detail: 'Checking for multiple people...',
        icon: <Users className="w-4 h-4" />,
        status: 'pending',
        colorClass: 'text-red-600',
      },
    ]);
  }, [phase]);

  const handleRunChecks = useCallback(async () => {
    // Stop any in-progress checks and reset
    stopActiveChecks();
    checksCancelledRef.current = false;
    setChecksRunning(true);
    setChecksCompleted(false);
    setSystemChecks(INITIAL_CHECKS);

    // Small delay to let state settle before starting
    await new Promise((r) => setTimeout(r, 100));

    const cancelled = () => checksCancelledRef.current;

    {
      // 1. Device Type (instant)
      if (cancelled()) return;
      updateSystemCheck('device', { status: 'checking', detail: 'Detecting device...' });
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled()) return;
      const info = deviceInfo || detectDevice();
      if (!info.isMobile) {
        updateSystemCheck('device', { status: 'pass', detail: 'Desktop/Laptop detected' });
      } else {
        updateSystemCheck('device', { status: 'fail', detail: 'Mobile device detected — use a desktop or laptop' });
      }

      // 2. Webcam
      if (cancelled()) return;
      updateSystemCheck('webcam', { status: 'checking', detail: 'Requesting webcam access...' });
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled()) { videoStream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = videoStream;
        if (videoRef.current) videoRef.current.srcObject = videoStream;
        updateSystemCheck('webcam', { status: 'pass', detail: 'Webcam ready' });
      } catch {
        if (cancelled()) return;
        updateSystemCheck('webcam', { status: 'fail', detail: 'Webcam access denied' });
      }

      // 3. Microphone
      if (cancelled()) return;
      updateSystemCheck('microphone', { status: 'checking', detail: 'Requesting microphone access...' });
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled()) { audioStream.getTracks().forEach((t) => t.stop()); return; }
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(audioStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        if (streamRef.current) audioStream.getAudioTracks().forEach((t) => streamRef.current!.addTrack(t));
        updateSystemCheck('microphone', { status: 'pass', detail: 'Microphone ready' });
      } catch {
        if (cancelled()) return;
        updateSystemCheck('microphone', { status: 'fail', detail: 'Microphone access denied' });
      }

      // 4. Internet Connection
      if (cancelled()) return;
      updateSystemCheck('internet', { status: 'checking', detail: 'Testing connection speed...' });
      const healthUrl = `${API_BASE_URL.replace('/api/v1', '')}/health`;
      const latencies: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const start = performance.now();
          await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
          latencies.push(performance.now() - start);
        } catch { /* individual ping failed */ }
      }
      if (cancelled()) return;
      if (latencies.length === 0) {
        updateSystemCheck('internet', { status: 'fail', detail: 'Unable to reach server' });
      } else {
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        updateSystemCheck('internet', avg < 500
          ? { status: 'pass', detail: `Connection: Excellent (${avg}ms avg)` }
          : { status: 'fail', detail: `Connection: Slow (${avg}ms avg)` },
        );
      }

      // 5. Lighting
      if (cancelled()) return;
      updateSystemCheck('lighting', { status: 'checking', detail: 'Analyzing lighting...' });
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled()) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let totalBrightness = 0;
          for (let i = 0; i < data.length; i += 4) totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
          const avgBrightness = data.length > 0 ? totalBrightness / (data.length / 4) : 0;
          updateSystemCheck('lighting', avgBrightness >= 40
            ? { status: 'pass', detail: 'Lighting: Good (Face clearly visible)' }
            : { status: 'fail', detail: 'Lighting: Too dark - improve your lighting' },
          );
        } else {
          updateSystemCheck('lighting', { status: 'fail', detail: 'Unable to analyze lighting' });
        }
      } else {
        updateSystemCheck('lighting', { status: 'fail', detail: 'Camera not available for lighting check' });
      }

      if (video && canvas) {
        lightingIntervalRef.current = setInterval(() => {
          if (!video || !canvas || video.readyState < 2) return;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let tb = 0;
          for (let i = 0; i < data.length; i += 4) tb += (data[i] + data[i + 1] + data[i + 2]) / 3;
          const avg = data.length > 0 ? tb / (data.length / 4) : 0;
          updateSystemCheck('lighting', avg >= 40
            ? { status: 'pass', detail: 'Lighting: Good (Face clearly visible)' }
            : { status: 'fail', detail: 'Lighting: Too dark - improve your lighting' },
          );
        }, 3000);
      }

      // 6. Background Noise
      if (cancelled()) return;
      updateSystemCheck('noise', { status: 'checking', detail: 'Analyzing background noise...' });
      await new Promise((r) => setTimeout(r, 1000));
      if (cancelled()) return;
      const analyser = analyserRef.current;
      if (analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = bufferLength > 0 ? dataArray.reduce((a, b) => a + b, 0) / bufferLength : 0;
        updateSystemCheck('noise', avgNoise < 80
          ? { status: 'pass', detail: 'Background noise: Low (Good)' }
          : { status: 'fail', detail: 'Background noise: High - find a quieter space' },
        );
        noiseIntervalRef.current = setInterval(() => {
          const a = analyserRef.current;
          if (!a) return;
          const da = new Uint8Array(a.frequencyBinCount);
          a.getByteFrequencyData(da);
          const avg = da.length > 0 ? da.reduce((x, y) => x + y, 0) / da.length : 0;
          updateSystemCheck('noise', avg < 80
            ? { status: 'pass', detail: 'Background noise: Low (Good)' }
            : { status: 'fail', detail: 'Background noise: High - find a quieter space' },
          );
        }, 3000);
      } else {
        updateSystemCheck('noise', { status: 'fail', detail: 'Microphone not available for noise check' });
      }

      // 7. Face Detection — Path A: native FaceDetector, Path B: face-api.js
      if (cancelled()) return;
      updateSystemCheck('face', { status: 'checking', detail: 'Detecting face...' });
      updateSystemCheck('multiple', { status: 'checking', detail: 'Checking for multiple people...' });

      const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/';

      const applyFaceCount = (count: number) => {
        if (count === 1) {
          updateSystemCheck('face', { status: 'pass', detail: 'Face detected successfully' });
          updateSystemCheck('multiple', { status: 'pass', detail: 'Single person detected (Good)' });
        } else if (count === 0) {
          updateSystemCheck('face', { status: 'fail', detail: 'No face detected — position yourself in front of the camera' });
          updateSystemCheck('multiple', { status: 'fail', detail: 'No person detected' });
        } else {
          updateSystemCheck('face', { status: 'pass', detail: 'Face detected successfully' });
          updateSystemCheck('multiple', { status: 'fail', detail: `${count} people detected — ensure you are alone` });
        }
      };

      const runNativeDetector = async (vid: HTMLVideoElement) => {
        const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        const faces = await detector.detect(vid);
        applyFaceCount(faces.length);
        return detector; // return so polling can reuse it
      };

      const runFaceApi = async (vid: HTMLVideoElement) => {
        const faceapi = await import('face-api.js');
        if (!faceapi.nets.tinyFaceDetector.isLoaded) {
          await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
        }
        const options = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });
        const detections = await faceapi.detectAllFaces(vid, options);
        applyFaceCount(detections.length);
        return faceapi; // return so polling can reuse it
      };

      if (video && video.readyState >= 2) {
        const hasNative = typeof window !== 'undefined' && 'FaceDetector' in window;
        let useFaceApi = !hasNative;

        if (hasNative) {
          try {
            const detector = await runNativeDetector(video);
            if (cancelled()) return;
            setHasFaceDetector(true);
            // Polling with native detector
            faceIntervalRef.current = setInterval(async () => {
              if (!video || video.readyState < 2) return;
              try { applyFaceCount((await detector.detect(video)).length); } catch { /* skip frame */ }
            }, 2500);
          } catch {
            useFaceApi = true; // native threw — fall through to face-api.js
          }
        }

        if (useFaceApi) {
          if (cancelled()) return;
          try {
            const faceapi = await runFaceApi(video);
            if (cancelled()) return;
            setHasFaceDetector(true);
            const opts = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });
            // Polling with face-api.js
            faceIntervalRef.current = setInterval(async () => {
              if (!video || video.readyState < 2) return;
              try { applyFaceCount((await faceapi.detectAllFaces(video, opts)).length); } catch { /* skip frame */ }
            }, 2500);
          } catch {
            // Model load failed — can't verify face; treat as soft warning only
            setHasFaceDetector(false);
            updateSystemCheck('face', { status: 'pass', detail: 'Camera working (face check unavailable on this browser)' });
            updateSystemCheck('multiple', { status: 'pass', detail: 'Single-face check unavailable on this browser' });
          }
        }
      }
    }

    if (!checksCancelledRef.current) {
      setChecksRunning(false);
      setChecksCompleted(true);
    }
  }, [deviceInfo, stopActiveChecks, updateSystemCheck]);

  // ────────────────────────────────────────
  // Phase 3: Environment Scan
  // ────────────────────────────────────────
  const handleEnvScan = useCallback(() => {
    // Cancel any existing scan timer
    if (envScanTimerRef.current) {
      clearInterval(envScanTimerRef.current);
      envScanTimerRef.current = null;
    }
    if (envScanRAFRef.current !== null) {
      cancelAnimationFrame(envScanRAFRef.current);
      envScanRAFRef.current = null;
    }

    // Reset state
    setEnvScanProgress(0);
    setEnvScanFrameCount(0);
    setEnvScanResults(null);
    setEnvScanPhase('scanning');

    // Accumulated frame analysis data
    const frameBrightnessValues: number[] = [];
    const frameMultiPersonFlags: boolean[] = []; // true = multiple people in this frame
    let framesCapured = 0;

    // Face detector (if available) for multi-person check during scan
    let faceDetector: any = null;
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try { faceDetector = new (window as any).FaceDetector({ fastMode: true }); } catch { /* not available */ }
    }

    // Smooth progress animation over total duration
    const totalDuration = TOTAL_SCAN_FRAMES * SCAN_INTERVAL_MS;
    const startTime = performance.now();

    const animateProgress = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      setEnvScanProgress(pct);
      if (pct < 100) {
        envScanRAFRef.current = requestAnimationFrame(animateProgress);
      }
    };
    envScanRAFRef.current = requestAnimationFrame(animateProgress);

    // Frame capture interval
    envScanTimerRef.current = setInterval(async () => {
      framesCapured += 1;
      setEnvScanFrameCount(framesCapured);

      // Analyze brightness and multi-person from the current video frame
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          ctx.drawImage(video, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let totalB = 0;
          for (let i = 0; i < imgData.length; i += 4) {
            totalB += (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
          }
          const avgB = imgData.length > 0 ? totalB / (imgData.length / 4) : 0;
          frameBrightnessValues.push(avgB);

          // Multi-person check via FaceDetector
          if (faceDetector) {
            try {
              const faces = await faceDetector.detect(video);
              frameMultiPersonFlags.push(faces.length > 1);
            } catch { /* ignore detection errors */ }
          }
        }
      }

      if (framesCapured >= TOTAL_SCAN_FRAMES) {
        // Done — clear interval and compute results
        if (envScanTimerRef.current) {
          clearInterval(envScanTimerRef.current);
          envScanTimerRef.current = null;
        }
        if (envScanRAFRef.current !== null) {
          cancelAnimationFrame(envScanRAFRef.current);
          envScanRAFRef.current = null;
        }
        setEnvScanProgress(100);

        // Compute lighting result
        const someFramesCaptured = frameBrightnessValues.length >= Math.floor(TOTAL_SCAN_FRAMES / 2);
        const darkFrames = frameBrightnessValues.filter((b) => b < 40).length;
        const lightingOk = someFramesCaptured && darkFrames === 0;
        const lightingDetail = !lightingOk
          ? darkFrames > 0
            ? `Insufficient lighting detected in ${darkFrames} of ${frameBrightnessValues.length} frames — move to a brighter area`
            : 'Unable to analyze lighting — check camera access'
          : undefined;

        // Compute single-person result
        const multiPersonFrames = frameMultiPersonFlags.filter(Boolean).length;
        const singlePersonChecked = frameMultiPersonFlags.length > 0;
        const singlePersonOk = !singlePersonChecked || multiPersonFrames === 0;
        const singlePersonDetail = !singlePersonOk
          ? `Multiple people detected in ${multiPersonFrames} frame(s) — ensure you are alone in the room`
          : undefined;

        const clearOk = lightingOk && singlePersonOk;

        setEnvScanResults({
          lighting: lightingOk,
          singlePerson: singlePersonOk,
          clear: clearOk,
          lightingDetail,
          singlePersonDetail,
        });
        setEnvScanPhase('complete');
      }
    }, SCAN_INTERVAL_MS);
  }, []);

  // Cleanup all resources on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopActiveChecks();
      if (envScanTimerRef.current) {
        clearInterval(envScanTimerRef.current);
        envScanTimerRef.current = null;
      }
      if (envScanRAFRef.current !== null) {
        cancelAnimationFrame(envScanRAFRef.current);
        envScanRAFRef.current = null;
      }
    };
  }, [stopActiveChecks]);

  // Record system check results when all passed
  const allSystemPassed = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass');
  const allSystemDone = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass' || c.status === 'fail');
  const isAnyChecking = systemChecks.some((c) => c.status === 'checking' || c.status === 'pending');

  const handleProceed = useCallback(async () => {
    // Record system check results to backend
    try {
      await candidateAIInterviewService.recordSystemCheck(token, {
        camera: systemChecks.find((c) => c.id === 'webcam')?.status === 'pass' ? 'pass' : 'fail',
        microphone: systemChecks.find((c) => c.id === 'microphone')?.status === 'pass' ? 'pass' : 'fail',
        network: systemChecks.find((c) => c.id === 'internet')?.status === 'pass' ? 'pass' : 'fail',
        ai_engine: 'pass',
        lighting: systemChecks.find((c) => c.id === 'lighting')?.status === 'pass' ? 'pass' : 'fail',
        noise: systemChecks.find((c) => c.id === 'noise')?.status === 'pass' ? 'pass' : 'fail',
        face_detection: systemChecks.find((c) => c.id === 'face')?.status === 'pass' ? 'pass' : 'fail',
        face_count: systemChecks.find((c) => c.id === 'multiple')?.status === 'pass' ? 1 : 0,
      });
    } catch {
      // Non-blocking — proceed even if recording fails
    }

    // Register candidate's face baseline for identity verification during the interview.
    // Must happen before stopping the stream (video element still has live frames).
    if (onRegisterFace && videoRef.current) {
      try {
        await onRegisterFace(videoRef.current);
      } catch {
        // Non-blocking — proceed even if registration fails
      }
    }

    // Stop streams right before calling onAllPassed
    if (lightingIntervalRef.current) clearInterval(lightingIntervalRef.current);
    if (noiseIntervalRef.current) clearInterval(noiseIntervalRef.current);
    if (faceIntervalRef.current) clearInterval(faceIntervalRef.current);
    if (envScanTimerRef.current) { clearInterval(envScanTimerRef.current); envScanTimerRef.current = null; }
    if (envScanRAFRef.current !== null) { cancelAnimationFrame(envScanRAFRef.current); envScanRAFRef.current = null; }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    onAllPassed();
  }, [token, systemChecks, onAllPassed]);

  // ────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────

  const deviceAllPass = deviceInfo ? !deviceInfo.isMobile && deviceInfo.browser.supported : false;

  // ────────────────────────────────────────
  // Phase 1: browser_check (loading)
  // ────────────────────────────────────────
  if (phase === 'browser_check') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
        <ProgressStepper phase={phase} />

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            Browser Verification
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Browser Requirement Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Checking your browser compatibility for the interview.
          </p>
        </div>

        {/* Gradient header card */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-800 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              <Monitor className="w-5 h-5" />
              <h2 className="text-lg font-semibold">System Requirements Check</h2>
            </div>
            <p className="text-gray-300 text-sm">
              Verifying device and browser compatibility for{' '}
              <span className="font-medium text-white">{position}</span>
            </p>
          </div>

          {/* Card body: Loading */}
          <div className="bg-white rounded-b-xl p-8 flex flex-col items-center justify-center min-h-[200px] space-y-4">
            <div className="bg-gray-100 rounded-full p-3">
              <Zap className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Checking Device Requirements...</p>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Phase 1: browser_results
  // ────────────────────────────────────────
  if (phase === 'browser_results' && deviceInfo) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6">
        <ProgressStepper phase={phase} />

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            Browser Verification
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Browser Requirement Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Checking your browser compatibility for the interview.
          </p>
        </div>

        {/* Gradient header card */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-800 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              <Monitor className="w-5 h-5" />
              <h2 className="text-lg font-semibold">System Requirements Check</h2>
            </div>
            <p className="text-gray-300 text-sm">
              Verifying device and browser compatibility for{' '}
              <span className="font-medium text-white">{position}</span>
            </p>
          </div>

          {/* Card body: Results */}
          <div className="bg-white rounded-b-xl p-6 space-y-5">
            {/* All Requirements Met banner */}
            {deviceAllPass ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="font-semibold text-green-800">All Requirements Met!</p>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="font-semibold text-red-800">Requirements Not Met</p>
              </div>
            )}

            {/* Device Type card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Device Type</h3>
                  {!deviceInfo.isMobile ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5 ml-[52px]">
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Detected:</span>{' '}
                  <span className="font-medium">{deviceInfo.deviceType}</span>
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Operating System:</span>{' '}
                  <span className="font-medium">{deviceInfo.os}</span>
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Screen Resolution:</span>{' '}
                  <span className="font-medium">{deviceInfo.screenWidth} x {deviceInfo.screenHeight}</span>
                </p>
                {deviceInfo.isMobile && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 font-medium">Mobile devices are not supported</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      AI interviews must be completed on a desktop or laptop computer. Switching to "Desktop Mode" in your mobile browser does not bypass this restriction.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Browser Compatibility card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Globe className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Browser Compatibility</h3>
                  {deviceInfo.browser.supported ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="ml-[52px] space-y-3">
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Detected Browser:</span>{' '}
                  <span className="font-medium">{deviceInfo.browser.name} {deviceInfo.browser.version}</span>
                </p>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Supported Browsers:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_BROWSERS.map((b) => {
                      const isCurrent = deviceInfo.browser.name === b.name;
                      return (
                        <div
                          key={b.name}
                          className={`rounded-lg p-3 text-center text-sm font-medium border ${
                            isCurrent
                              ? 'bg-green-50 border-green-300 text-green-800'
                              : 'bg-gray-50 border-gray-200 text-gray-700'
                          }`}
                        >
                          <p className="font-semibold">{b.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{b.minVersion}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* System Requirements checklist card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3">System Requirements</h3>
              <div className="space-y-2.5">
                {SYSTEM_REQUIREMENTS.map((req, idx) => {
                  const passed = req.check(deviceInfo);
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      {passed ? (
                        <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <CheckCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <XCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{req.label}</p>
                        <p className="text-xs text-gray-500">{req.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detected System Information card */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Detected System Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Device Type</p>
                  <p className="text-sm font-medium text-gray-900">{deviceInfo.deviceType}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Browser</p>
                  <p className="text-sm font-medium text-gray-900">
                    {deviceInfo.browser.name} {deviceInfo.browser.version}
                  </p>
                </div>
              </div>
            </div>

            {/* Continue to System Checks button */}
            <button
              type="button"
              onClick={() => setPhase('system_checks')}
              className="w-full inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-800 transition-all text-sm"
            >
              Continue to System Checks
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Phase 2: system_checks
  // ────────────────────────────────────────
  if (phase === 'system_checks') {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
        <ProgressStepper phase={phase} />

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5" />
            System Checks
          </span>
        </div>

        {/* Gradient header */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-900 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              {checksRunning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : checksCompleted && allSystemPassed ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : checksCompleted ? (
                <XCircle className="w-5 h-5 text-amber-400" />
              ) : (
                <Shield className="w-5 h-5" />
              )}
              <h2 className="text-lg font-semibold">
                {checksRunning ? 'Running System Checks…'
                  : checksCompleted && allSystemPassed ? 'System Checks Complete'
                  : checksCompleted ? 'Some Checks Failed'
                  : 'System Checks'}
              </h2>
            </div>
            <p className="text-green-100 text-sm">
              {checksRunning ? 'Please wait while we verify your environment'
                : checksCompleted && allSystemPassed ? 'All environment checks have been completed'
                : checksCompleted ? 'Fix the issues below and retry'
                : 'Click "Run Check" to begin verifying your environment'}
            </p>
          </div>

          {/* Card body: 2-column layout */}
          <div className="bg-white rounded-b-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: Camera Preview */}
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
                  <CircleDot className="w-4 h-4 text-white" />
                  <h3 className="text-sm font-semibold text-white">Camera Preview</h3>
                </div>
                <div className="relative bg-gray-900 aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Camera Active badge */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                    <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                    Camera Active
                  </div>
                </div>
              </div>

              {/* Right column: Check items */}
              <div className="space-y-2">
                {systemChecks.map((check) => (
                  <div
                    key={check.id}
                    className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
                  >
                    {/* Left: colored circle icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        check.status === 'pass'
                          ? 'bg-green-100'
                          : check.status === 'fail'
                          ? 'bg-red-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <span
                        className={
                          check.status === 'pass'
                            ? 'text-green-600'
                            : check.status === 'fail'
                            ? 'text-red-600'
                            : 'text-gray-400'
                        }
                      >
                        {check.icon}
                      </span>
                    </div>

                    {/* Middle: label + detail */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{check.label}</p>
                      <p className="text-xs text-gray-500 truncate">{check.detail}</p>
                    </div>

                    {/* Right: status icon */}
                    <div className="flex-shrink-0">
                      {check.status === 'pass' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {check.status === 'fail' && (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      {(check.status === 'checking' || check.status === 'pending') && (
                        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden canvas for frame analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Status banners */}
            {checksCompleted && allSystemPassed && (
              <div className="mt-5 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">All Checks Passed!</p>
                  <p className="text-sm text-green-700">Your environment is ready for the interview.</p>
                </div>
              </div>
            )}
            {checksCompleted && !allSystemPassed && (
              <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800">Some checks failed</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    {systemChecks.find((c) => c.id === 'webcam' && c.status === 'fail')
                      ? 'Camera access is required for the interview. Allow camera access in your browser settings, then click Retry.'
                      : 'Fix the issues above and click Retry to continue.'}
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              {/* Run Check — shown before first run */}
              {!checksRunning && !checksCompleted && (
                <button
                  type="button"
                  onClick={handleRunChecks}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg text-sm hover:bg-gray-800 transition-all"
                >
                  <Play className="w-4 h-4" />
                  Run Check
                </button>
              )}

              {/* Retry — shown after checks complete with failures */}
              {checksCompleted && !allSystemPassed && !checksRunning && (
                <button
                  type="button"
                  onClick={handleRunChecks}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg text-sm hover:bg-gray-50 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              )}

              {/* Running indicator */}
              {checksRunning && (
                <div className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-500 font-semibold py-3 px-6 rounded-lg text-sm cursor-not-allowed">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running checks…
                </div>
              )}

              {/* Continue to Environment Scan — enabled only when all passed */}
              {checksCompleted && (
                <button
                  type="button"
                  onClick={() => {
                    if (allSystemPassed) setPhase('env_scan');
                  }}
                  disabled={!allSystemPassed}
                  className={`flex-1 inline-flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-lg text-sm transition-all ${
                    allSystemPassed
                      ? 'bg-gray-900 text-white hover:bg-gray-800 cursor-pointer'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Continue to Environment Scan
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Phase 3: env_scan
  // ────────────────────────────────────────
  if (phase === 'env_scan') {
    const allEnvPassed = envScanResults
      ? envScanResults.lighting && envScanResults.singlePerson && envScanResults.clear
      : false;

    // SVG ring parameters
    const ringSize = 130;
    const strokeWidth = 8;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (envScanProgress / 100) * circumference;

    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
        <ProgressStepper phase={phase} />

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Scan className="w-3.5 h-3.5" />
            Environment Scan
          </span>
        </div>

        {/* Gradient header */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          <div className="bg-gray-900 px-6 py-5 rounded-t-xl">
            <div className="flex items-center gap-2 text-white mb-1">
              {envScanPhase === 'scanning' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : envScanPhase === 'complete' ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <Scan className="w-5 h-5" />
              )}
              <h2 className="text-lg font-semibold">
                {envScanPhase === 'scanning'
                  ? 'Scanning Environment…'
                  : envScanPhase === 'complete'
                  ? 'Scan Complete'
                  : '360° Environment Scan'}
              </h2>
            </div>
            <p className="text-green-100 text-sm">
              {envScanPhase === 'scanning'
                ? 'Please rotate your camera slowly to cover all angles'
                : envScanPhase === 'complete'
                ? 'Environment analysis finished'
                : 'Scan your surroundings to ensure a fair interview environment'}
            </p>
          </div>

          {/* Card body: 2-column layout */}
          <div className="bg-white rounded-b-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left column: Camera + scan ring overlay */}
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
                  <CircleDot className="w-4 h-4 text-white" />
                  <h3 className="text-sm font-semibold text-white">Camera Preview</h3>
                </div>
                <div className="relative bg-gray-900 aspect-video flex items-center justify-center">
                  {/* Video element — reuses the same stream from system checks */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* SVG circular progress ring overlay — only during scanning */}
                  {envScanPhase === 'scanning' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <svg
                        width={ringSize}
                        height={ringSize}
                        className="drop-shadow-lg"
                        style={{ transform: 'rotate(-90deg)' }}
                      >
                        {/* Background circle */}
                        <circle
                          cx={ringSize / 2}
                          cy={ringSize / 2}
                          r={radius}
                          fill="none"
                          stroke="rgba(255,255,255,0.25)"
                          strokeWidth={strokeWidth}
                        />
                        {/* Animated fill */}
                        <circle
                          cx={ringSize / 2}
                          cy={ringSize / 2}
                          r={radius}
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                        />
                      </svg>
                      {/* Center text (counter-rotate so text is upright) */}
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-white text-lg font-bold leading-none drop-shadow">
                            {Math.round(envScanProgress)}%
                          </span>
                          <span className="text-white/70 text-xs mt-0.5 drop-shadow">
                            {envScanFrameCount}/{TOTAL_SCAN_FRAMES}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Camera Active badge */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-green-600/90 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                    <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                    Camera Active
                  </div>
                </div>
              </div>

              {/* Right column: instructions / progress / results */}
              <div className="flex flex-col justify-between gap-4">

                {/* IDLE state */}
                {envScanPhase === 'idle' && (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-xl font-bold text-gray-900">360° Environment Scan</h3>
                      <p className="text-sm text-gray-600">
                        We'll scan your surroundings to ensure a fair interview environment.
                        Slowly rotate your camera to show all sides of the room.
                      </p>

                      {/* Direction guide */}
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          Rotation Guide
                        </p>
                        <div className="flex items-center justify-between gap-1">
                          {['Front', 'Right', 'Back', 'Left'].map((dir, idx) => (
                            <React.Fragment key={dir}>
                              <div className="flex flex-col items-center gap-1">
                                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-gray-700">{dir[0]}</span>
                                </div>
                                <span className="text-xs text-gray-500">{dir}</span>
                              </div>
                              {idx < 3 && (
                                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleEnvScan}
                      className="w-full inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg text-sm hover:bg-gray-800 transition-all"
                    >
                      <Play className="w-4 h-4" />
                      Start Scan
                    </button>
                  </>
                )}

                {/* SCANNING state */}
                {envScanPhase === 'scanning' && (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-green-600 animate-spin" />
                        <h3 className="text-xl font-bold text-gray-900">Scanning in progress</h3>
                      </div>

                      {/* Frame counter */}
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 font-medium">
                            Frame {envScanFrameCount} / {TOTAL_SCAN_FRAMES} captured
                          </span>
                          <span className="text-gray-800 font-semibold">
                            {Math.round(envScanProgress)}%
                          </span>
                        </div>

                        {/* Linear progress bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-green-500 h-2 rounded-full transition-[width] duration-300 ease-out"
                            style={{ width: `${envScanProgress}%` }}
                          />
                        </div>

                        <p className="text-xs text-gray-500">
                          Tip: Keep rotating slowly to cover all angles
                        </p>
                      </div>
                    </div>

                    {/* Disabled start button during scan */}
                    <button
                      type="button"
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-400 font-semibold py-3 px-6 rounded-lg text-sm cursor-not-allowed"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning…
                    </button>
                  </>
                )}

                {/* COMPLETE state */}
                {envScanPhase === 'complete' && envScanResults && (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <h3 className="text-xl font-bold text-gray-900">Scan Complete</h3>
                      </div>

                      {/* Results list */}
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                        {[
                          {
                            label: 'Lighting consistency',
                            passed: envScanResults.lighting,
                            detail: envScanResults.lightingDetail,
                          },
                          {
                            label: 'Single person throughout',
                            passed: envScanResults.singlePerson,
                            detail: envScanResults.singlePersonDetail,
                          },
                          {
                            label: 'Environment clear',
                            passed: envScanResults.clear,
                            detail: !envScanResults.clear && envScanResults.lighting && envScanResults.singlePerson
                              ? 'Environment did not meet all requirements'
                              : undefined,
                          },
                        ].map(({ label, passed, detail }) => (
                          <div key={label} className="flex items-start gap-3">
                            {passed ? (
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-800">{label}</span>
                              {!passed && detail && (
                                <p className="text-xs text-red-600 mt-0.5">{detail}</p>
                              )}
                            </div>
                            <span
                              className={`ml-auto text-xs font-semibold flex-shrink-0 ${
                                passed ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {passed ? 'Pass' : 'Fail'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Summary banner */}
                      {allEnvPassed ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <p className="text-sm font-semibold text-green-800">
                            Environment looks great! You're ready.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-amber-800">Issues detected — please fix and rescan</p>
                            {!envScanResults.lighting && (
                              <p className="text-xs text-amber-700 mt-0.5">• Improve your lighting before rescanning</p>
                            )}
                            {!envScanResults.singlePerson && (
                              <p className="text-xs text-amber-700 mt-0.5">• Ensure you are the only person in the frame</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleEnvScan}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg text-sm hover:bg-gray-50 transition-all"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Rescan
                      </button>
                      <button
                        type="button"
                        onClick={handleProceed}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg text-sm hover:bg-gray-800 transition-all"
                      >
                        Proceed
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Hidden canvas for env scan frame analysis */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
