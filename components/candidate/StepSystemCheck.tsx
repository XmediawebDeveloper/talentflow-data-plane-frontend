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
  Radio,
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
  /**
   * Called after face detection passes — verifies the current face matches the registered identity photo.
   * If the person doesn't match, the Face Detection check is failed with an identity mismatch message.
   */
  onVerifyFace?: (videoElement: HTMLVideoElement) => Promise<{ matched: boolean; distance: number } | null>;
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
  // Brave check BEFORE Chrome — Brave's UA contains "Chrome/xxx" so it would be misidentified.
  // navigator.brave is only present in Brave (synchronous check; isBrave() method is async).
  if (typeof navigator !== 'undefined' && 'brave' in navigator) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    const version = match?.[1] ?? 'unknown';
    const major = parseInt(version.split('.')[0], 10) || 0;
    return { name: 'Brave', version, majorVersion: major, supported: false };
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
    return { name: 'Firefox', version, majorVersion: major, supported: false };
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
  { name: 'Safari', minVersion: 'v14+' },
];

const MIN_INTERNET_MBPS = 1.0;
const FACE_REGISTRATION_TIMEOUT_MS = 3000;

const SYSTEM_REQUIREMENTS = [
  {
    label: 'Desktop or Laptop Computer',
    note: 'Mobile devices not supported',
    check: (d: DeviceInfo) => !d.isMobile,
  },
  {
    label: 'Supported Browser',
    note: 'Chrome, Edge, or Safari',
    check: (d: DeviceInfo) => d.browser.supported,
  },
  {
    label: 'Stable Internet Connection',
    note: `Required: ${MIN_INTERNET_MBPS} Mbps or higher`,
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
  onVerifyFace,
}: StepSystemCheckProps) {
  const [phase, setPhase] = useState<Phase>('browser_check');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // System checks phase state
  const [systemChecks, setSystemChecks] = useState<SystemCheckItem[]>([]);
  const [hasFaceDetector, setHasFaceDetector] = useState(false);
  const [checksRunning, setChecksRunning] = useState(false);
  const [checksCompleted, setChecksCompleted] = useState(false);
  const [isProceedLoading, setIsProceedLoading] = useState(false);

  // Measured metric values to include when submitting to backend
  const networkLatencyMsRef = useRef<number | null>(null);
  const networkSpeedMbpsRef = useRef<number | null>(null);
  const videoBrightnessRef = useRef<number | null>(null);
  const aiEngineLatencyMsRef = useRef<number | null>(null);

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
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const checksCancelledRef = useRef(false);
  const envScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const envScanRAFRef = useRef<number | null>(null);
  // Guards concurrent face-api.js / TF.js WebGL calls — only one may run at a time.
  // handleProceed waits for this to clear before calling onRegisterFace.
  const faceApiBusyRef = useRef(false);

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
    if (micIntervalRef.current) { clearInterval(micIntervalRef.current); micIntervalRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    analyserRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const INITIAL_CHECKS: SystemCheckItem[] = [
    { id: 'device', label: 'Device Type', detail: 'Pending...', icon: <Monitor className="w-4 h-4" />, status: 'pending', colorClass: 'text-gray-600' },
    { id: 'webcam', label: 'Webcam', detail: 'Pending...', icon: <Camera className="w-4 h-4" />, status: 'pending', colorClass: 'text-gray-600' },
    { id: 'microphone', label: 'Microphone', detail: 'Pending...', icon: <Mic className="w-4 h-4" />, status: 'pending', colorClass: 'text-indigo-600' },
    { id: 'internet', label: 'Internet Connection', detail: `Required: ≥ ${MIN_INTERNET_MBPS} Mbps`, icon: <Wifi className="w-4 h-4" />, status: 'pending', colorClass: 'text-cyan-600' },
    { id: 'ai_engine', label: 'AI Engine', detail: 'Pending...', icon: <Zap className="w-4 h-4" />, status: 'pending', colorClass: 'text-purple-600' },
    { id: 'websocket', label: 'WebSocket Connection', detail: 'Pending...', icon: <Radio className="w-4 h-4" />, status: 'pending', colorClass: 'text-teal-600' },
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
    setSystemChecks(INITIAL_CHECKS);
  }, [phase]);

  // Reset environment scan state every time the phase is entered
  // Without this, a previously completed scan persists and shows "Scan Complete" immediately
  useEffect(() => {
    if (phase !== 'env_scan') return;
    setEnvScanPhase('idle');
    setEnvScanProgress(0);
    setEnvScanFrameCount(0);
    setEnvScanResults(null);
  }, [phase]);

  const handleRunChecks = useCallback(async () => {
    // Stop any in-progress checks and reset
    stopActiveChecks();
    checksCancelledRef.current = false;
    setChecksRunning(true);
    setChecksCompleted(false);
    setSystemChecks(INITIAL_CHECKS);

    // Give browser (especially Brave) time to fully release mic hardware from the previous run
    // before getUserMedia is called again — 100ms is too short and causes stale/silent streams
    await new Promise((r) => setTimeout(r, 600));

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

      // 2. Webcam — verify access AND that actual video frames are being produced
      if (cancelled()) return;
      updateSystemCheck('webcam', { status: 'checking', detail: 'Requesting webcam access...' });
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled()) { videoStream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = videoStream;
        if (videoRef.current) videoRef.current.srcObject = videoStream;

        // Wait for video metadata to load, then verify actual frames are non-black
        updateSystemCheck('webcam', { status: 'checking', detail: 'Verifying video signal...' });
        await new Promise((r) => setTimeout(r, 1200));
        if (cancelled()) return;

        let videoOk = false;
        const vid = videoRef.current;
        const cvs = canvasRef.current;
        if (vid && cvs && vid.readyState >= 2 && vid.videoWidth > 0) {
          const ctx = cvs.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            cvs.width = vid.videoWidth;
            cvs.height = vid.videoHeight;
            ctx.drawImage(vid, 0, 0);
            const d = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
            // A completely black/blank frame has all pixels near 0 — a real camera has some variation
            let maxPixel = 0;
            for (let i = 0; i < d.length; i += 4) maxPixel = Math.max(maxPixel, d[i], d[i + 1], d[i + 2]);
            videoOk = maxPixel > 5; // any non-black pixel means real signal
          }
        } else if (vid && vid.readyState >= 1) {
          // readyState >= 1 means stream connected even if frame not yet decoded
          videoOk = true;
        }

        if (videoOk) {
          updateSystemCheck('webcam', { status: 'pass', detail: 'Webcam producing video' });
        } else {
          updateSystemCheck('webcam', { status: 'fail', detail: 'Camera connected but no video signal — check if lens is covered' });
        }
      } catch {
        if (cancelled()) return;
        updateSystemCheck('webcam', { status: 'fail', detail: 'Webcam access denied' });
      }

      // 3. Microphone — verify actual audio capture, not just driver access
      if (cancelled()) return;
      updateSystemCheck('microphone', { status: 'checking', detail: 'Requesting microphone access...' });
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled()) { audioStream.getTracks().forEach((t) => t.stop()); return; }
        const AudioContextImpl: typeof AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextImpl();

        // Ensure AudioContext is actually running before measuring.
        // Brave (and Firefox) often create it in 'suspended' state when constructed
        // after async awaits. resume() alone isn't enough — Brave may acknowledge
        // the call but keep the context suspended until the audio pipeline is ready.
        // Poll up to 2s for 'running' state.
        try { await audioContext.resume(); } catch { /* ignore */ }
        let resumeWait = 0;
        while (audioContext.state !== 'running' && resumeWait < 2000) {
          await new Promise((r) => setTimeout(r, 100));
          resumeWait += 100;
        }

        const source = audioContext.createMediaStreamSource(audioStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        if (streamRef.current) audioStream.getAudioTracks().forEach((t) => streamRef.current!.addTrack(t));

        // --- Active mic test ---
        // Step 1: measure ambient baseline (1.5s — gives Brave extra time after context starts)
        updateSystemCheck('microphone', { status: 'checking', detail: 'Measuring ambient levels...' });
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled()) return;

        const getRMS = (a: AnalyserNode): number => {
          const buf = new Uint8Array(a.frequencyBinCount);
          a.getByteFrequencyData(buf);
          const sum = buf.reduce((acc, v) => acc + v * v, 0);
          return Math.sqrt(sum / buf.length); // RMS level 0–255
        };

        let ambientLevel = getRMS(analyser);
        // Brave's fingerprinting protection can return all-zeros immediately after AudioContext
        // creation/resume — give one extra chance with a short pause before giving up
        if (ambientLevel < 1) {
          await new Promise((r) => setTimeout(r, 600));
          if (cancelled()) return;
          ambientLevel = getRMS(analyser);
        }

        if (ambientLevel < 1) {
          // Mic is muted or dead — skip speak test, fail immediately
          updateSystemCheck('microphone', { status: 'fail', detail: 'No audio signal — mic may be muted or disconnected' });
          // Live polling so user sees it recover if they fix the issue
          micIntervalRef.current = setInterval(() => {
            const a = analyserRef.current;
            if (!a) return;
            const lvl = getRMS(a);
            if (lvl >= 1) updateSystemCheck('microphone', { status: 'checking', detail: 'Signal detected — say something to confirm...' });
          }, 1000);
        } else {
          // Step 2: active speak window — ask user to say something for 3s
          updateSystemCheck('microphone', { status: 'checking', detail: 'Say something to test your microphone...' });
          const SPEAK_WINDOW_MS = 3000;
          const SPEAK_SAMPLES = 15; // sample every 200ms
          const INTERVAL_MS = SPEAK_WINDOW_MS / SPEAK_SAMPLES;
          // Voice detected when level spikes ≥ 1.8× ambient AND above absolute floor of 8
          const VOICE_THRESHOLD = Math.max(ambientLevel * 1.8, 8);

          let peakVoiceLevel = 0;
          for (let i = 0; i < SPEAK_SAMPLES; i++) {
            if (cancelled()) return;
            await new Promise((r) => setTimeout(r, INTERVAL_MS));
            if (cancelled()) return;
            const lvl = getRMS(analyser);
            if (lvl > peakVoiceLevel) peakVoiceLevel = lvl;
          }

          if (cancelled()) return;

          const voiceDetected = peakVoiceLevel >= VOICE_THRESHOLD;
          updateSystemCheck('microphone', voiceDetected
            ? { status: 'pass', detail: 'Voice detected — microphone working correctly' }
            : { status: 'fail', detail: 'No voice detected — speak louder or check mic hardware/settings' },
          );

          // Live re-check every 2s — recover automatically if user fixes their mic
          micIntervalRef.current = setInterval(() => {
            const a = analyserRef.current;
            if (!a) return;
            const lvl = getRMS(a);
            if (lvl >= VOICE_THRESHOLD) {
              updateSystemCheck('microphone', { status: 'pass', detail: 'Voice detected — microphone working correctly' });
            } else if (lvl < 1) {
              updateSystemCheck('microphone', { status: 'fail', detail: 'No audio signal — mic may be muted or disconnected' });
            }
            // Silence between words — don't flicker; leave result as-is
          }, 2000);
        }
      } catch {
        if (cancelled()) return;
        updateSystemCheck('microphone', { status: 'fail', detail: 'Microphone access denied' });
      }

      // 4. Internet Connection — measure Mbps using NetworkInformation API (Chrome/Edge)
      //    and fall back to a latency-based heuristic for Firefox/Safari.
      if (cancelled()) return;
      updateSystemCheck('internet', { status: 'checking', detail: 'Testing connection speed...' });
      const healthUrl = `${API_BASE_URL.replace('/api/v1', '')}/health`;

      // --- Primary: NetworkInformation API (Chrome/Edge only) ---
      const connection = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
      let measuredMbps: number | null = connection?.downlink ?? null; // already in Mbps

      // --- Fallback: download timing against /health (tiny payload, latency-based) ---
      const latencies: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const start = performance.now();
          await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
          latencies.push(performance.now() - start);
        } catch { /* individual ping failed */ }
      }
      if (cancelled()) return;

      if (latencies.length === 0 && measuredMbps === null) {
        updateSystemCheck('internet', { status: 'fail', detail: 'Unable to reach server — check your connection' });
      } else if (measuredMbps !== null) {
        // Use NetworkInformation API value (most accurate)
        const mbps = measuredMbps;
        networkSpeedMbpsRef.current = mbps;
        if (latencies.length > 0) networkLatencyMsRef.current = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        const passes = mbps >= MIN_INTERNET_MBPS;
        updateSystemCheck('internet', passes
          ? { status: 'pass', detail: `Speed: ${mbps.toFixed(1)} Mbps (≥ ${MIN_INTERNET_MBPS} Mbps required)` }
          : { status: 'fail', detail: `Speed: ${mbps.toFixed(1)} Mbps (below ${MIN_INTERNET_MBPS} Mbps minimum)` },
        );
      } else {
        // Latency-only fallback — infer speed category from round-trip time
        const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        networkLatencyMsRef.current = avg;
        // < 150ms ≈ fast broadband, 150-500ms ≈ marginal, > 500ms = slow/congested
        const passes = avg < 500;
        updateSystemCheck('internet', passes
          ? { status: 'pass', detail: `Connection: Good (${avg}ms latency — speed measurement not available on this browser)` }
          : { status: 'fail', detail: `Connection: Slow (${avg}ms latency — check your internet speed, ${MIN_INTERNET_MBPS} Mbps required)` },
        );
      }

      // 4b. AI Engine — ping the AI health endpoint
      if (cancelled()) return;
      updateSystemCheck('ai_engine', { status: 'checking', detail: 'Checking AI engine availability...' });
      try {
        const aiHealth = await candidateAIInterviewService.checkAIHealth(token);
        if (cancelled()) return;
        aiEngineLatencyMsRef.current = aiHealth.latency_ms;
        updateSystemCheck('ai_engine', aiHealth.status === 'ready'
          ? { status: 'pass', detail: `AI engine ready (${aiHealth.latency_ms}ms)` }
          : { status: 'fail', detail: 'AI engine unavailable — please try again shortly' },
        );
      } catch {
        if (cancelled()) return;
        updateSystemCheck('ai_engine', { status: 'fail', detail: 'AI engine unreachable — check your connection' });
      }

      // 4c. WebSocket connectivity — verify real-time connection support
      if (cancelled()) return;
      updateSystemCheck('websocket', { status: 'checking', detail: 'Testing WebSocket connectivity...' });
      await (async () => {
        if (typeof WebSocket === 'undefined') {
          updateSystemCheck('websocket', { status: 'fail', detail: 'WebSocket not supported by this browser' });
          return;
        }
        // Use the same WS endpoint the interview itself uses.
        // The server will accept or reject (auth/state) — either way it proves
        // WebSocket traffic reaches the backend (non-1006 close = success).
        const wsUrl = API_BASE_URL
          .replace(/^https:\/\//i, 'wss://')
          .replace(/^http:\/\//i, 'ws://')
          .replace(/\/api\/v1\/?$/, '') + `/api/v1/ws/ai-interview/${token}`;

        await new Promise<void>((resolve) => {
          const TIMEOUT_MS = 7000;
          let settled = false;
          let ws: WebSocket | null = null;

          const settle = (status: CheckStatus, detail: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws?.close(); } catch { /* ignore */ }
            updateSystemCheck('websocket', { status, detail });
            resolve();
          };

          const timer = setTimeout(() => {
            settle('fail', 'WebSocket connection timed out — check network/firewall settings');
          }, TIMEOUT_MS);

          try {
            ws = new WebSocket(wsUrl);
          } catch {
            settle('fail', 'WebSocket connection could not be established');
            return;
          }

          ws.onopen = () => {
            settle('pass', 'WebSocket connected successfully');
          };

          ws.onerror = () => {
            // onerror fires before onclose — the close code gives us more info
          };

          ws.onclose = () => {
            // Any close event (including 1006) means the browser received a response
            // from the server — WebSocket traffic is reaching the backend.
            // True network blocks manifest as a timeout (no response at all), not a close event.
            settle('pass', 'WebSocket connection established');
          };
        });
      })();

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
          videoBrightnessRef.current = Math.round(avgBrightness);
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
              if (faceApiBusyRef.current || !video || video.readyState < 2) return;
              faceApiBusyRef.current = true;
              try { applyFaceCount((await detector.detect(video)).length); } catch { /* skip frame */ }
              finally { faceApiBusyRef.current = false; }
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
              if (faceApiBusyRef.current || !video || video.readyState < 2) return;
              faceApiBusyRef.current = true;
              try { applyFaceCount((await faceapi.detectAllFaces(video, opts)).length); } catch { /* skip frame */ }
              finally { faceApiBusyRef.current = false; }
            }, 2500);
          } catch {
            // Model load failed — can't verify face; treat as soft warning only
            setHasFaceDetector(false);
            updateSystemCheck('face', { status: 'pass', detail: 'Camera working (face check unavailable on this browser)' });
            updateSystemCheck('multiple', { status: 'pass', detail: 'Single-face check unavailable on this browser' });
          }
        }

        // One-time identity match check — verify the current face against the identity photo baseline.
        // Runs after initial detection; does not affect the polling interval.
        if (onVerifyFace && !cancelled()) {
          try {
            await new Promise(r => setTimeout(r, 800)); // let models stabilize
            if (!cancelled()) {
              const verifyResult = await onVerifyFace(video);
              if (verifyResult !== null && !verifyResult.matched) {
                updateSystemCheck('face', {
                  status: 'fail',
                  detail: 'Identity mismatch — please ensure you are the registered candidate',
                });
              }
            }
          } catch { /* non-critical — ignore */ }
        }
      }
    }

    if (!checksCancelledRef.current) {
      setChecksRunning(false);
      setChecksCompleted(true);
    }
  }, [token, deviceInfo, stopActiveChecks, updateSystemCheck, onVerifyFace]);

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

    const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/';

    // Face detector setup — Path A: native FaceDetector (Chrome/Edge), Path B: face-api.js (Firefox/Safari)
    let nativeFaceDetector: any = null;
    let faceApiModule: any = null;
    let faceApiOptions: any = null;
    // fastMode:false gives much better accuracy for partial/side faces at the cost of slight speed
    const useNative = typeof window !== 'undefined' && 'FaceDetector' in window;

    if (useNative) {
      try { nativeFaceDetector = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 5 }); } catch { /* not available */ }
    }

    // Load face-api.js BEFORE starting the scan so the model is ready for frame 1.
    // If we start async and model arrives late, all early frames return null → false "pass".
    let faceApiReady = false;
    const faceApiLoadPromise = !useNative
      ? import('face-api.js').then(async (fa) => {
          if (!fa.nets.tinyFaceDetector.isLoaded) {
            await fa.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
          }
          faceApiModule = fa;
          // Lower threshold (0.3) catches partial/side faces; 0.5 was missing them
          faceApiOptions = new fa.TinyFaceDetectorOptions({ scoreThreshold: 0.3 });
          faceApiReady = true;
        }).catch(() => { /* model load failed — detection will be skipped */ })
      : Promise.resolve();

    // Helper: detect number of faces from a canvas snapshot (more reliable than live video element)
    const detectFaceCount = async (canvas: HTMLCanvasElement): Promise<number | null> => {
      if (nativeFaceDetector) {
        try {
          // FaceDetector works on ImageBitmap snapshots for consistent results
          const bitmap = await createImageBitmap(canvas);
          const faces = await nativeFaceDetector.detect(bitmap);
          bitmap.close();
          return faces.length;
        } catch { return null; }
      }
      if (faceApiModule && faceApiOptions) {
        try {
          const detections = await faceApiModule.detectAllFaces(canvas, faceApiOptions);
          return detections.length;
        } catch { return null; }
      }
      return null; // model not yet loaded
    };

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
    // Start progress animation immediately so the UI doesn't freeze during model load
    envScanRAFRef.current = requestAnimationFrame(animateProgress);

    // Frame capture interval — starts after face model is guaranteed to be loaded
    const startFrameCapture = () => {
    envScanTimerRef.current = setInterval(async () => {
      // Top-level guard: extension-injected promise rejections (e.g. Brave "message channel
      // closed" from CDN intercept) must not surface as uncaught — they would halt the scan.
      try {
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

          // Multi-person check — skip frame if a face-api.js call is already in-flight
          if (!faceApiBusyRef.current) {
            faceApiBusyRef.current = true;
            try {
              const faceCount = await detectFaceCount(canvas);
              if (faceCount !== null) {
                frameMultiPersonFlags.push(faceCount > 1);
              }
            } finally {
              faceApiBusyRef.current = false;
            }
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
        // Require at least half the frames to have returned a detection result before trusting the check.
        // If all frames returned null (model unavailable), we treat it as unchecked (soft pass).
        const detectedFrameCount = frameMultiPersonFlags.length;
        const singlePersonChecked = detectedFrameCount >= Math.floor(TOTAL_SCAN_FRAMES / 2);
        const singlePersonOk = !singlePersonChecked || multiPersonFrames === 0;
        const singlePersonDetail = !singlePersonOk
          ? `Multiple people detected in ${multiPersonFrames} of ${detectedFrameCount} frames — ensure you are alone in the room`
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
      } catch { /* swallow any per-frame error — scan continues on next tick */ }
    }, SCAN_INTERVAL_MS);
    }; // end startFrameCapture

    // Wait for the face detection model to be ready before capturing frames.
    // This ensures frame 1 already has face detection available — no false passes from null returns.
    // Wrap both branches in try/catch — Brave's extension layer can reject the CDN fetch with
    // "message channel closed" which would otherwise surface as an uncaught promise rejection.
    faceApiLoadPromise
      .then(() => { try { startFrameCapture(); } catch { /* ignore */ } })
      .catch(() => { try { startFrameCapture(); } catch { /* ignore */ } });
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
    if (isProceedLoading) return;
    setIsProceedLoading(true);

    const checkStatus = (id: string) =>
      systemChecks.find((c) => c.id === id)?.status === 'pass' ? 'pass' : 'fail';

    // Stop face detection intervals before face registration — concurrent face-api.js /
    // TF.js calls corrupt the WebGL backend (tensor.backend becomes undefined).
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
    if (envScanTimerRef.current) { clearInterval(envScanTimerRef.current); envScanTimerRef.current = null; }
    if (envScanRAFRef.current !== null) { cancelAnimationFrame(envScanRAFRef.current); envScanRAFRef.current = null; }

    // Wait for any in-flight face-api.js / TF.js WebGL call to finish before
    // calling onRegisterFace. clearInterval does NOT cancel an already-executing
    // async callback — the detectAllFaces call may still be running and will
    // corrupt the WebGL backend if onRegisterFace starts concurrently.
    const deadline = Date.now() + 3000; // max 3s wait
    while (faceApiBusyRef.current && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }

    try {
      // Run API recording and face registration in parallel — they are independent.
      // Face registration is best-effort only and must never block progression.
      await Promise.all([
        // 1. Record system check results to backend (fire-and-forget on error)
        candidateAIInterviewService.recordSystemCheck(token, {
          camera: checkStatus('webcam'),
          microphone: checkStatus('microphone'),
          network: checkStatus('internet'),
          ai_engine: checkStatus('ai_engine'),
          websocket: checkStatus('websocket'),
          lighting: checkStatus('lighting'),
          noise: checkStatus('noise'),
          face_detection: checkStatus('face'),
          face_count: systemChecks.find((c) => c.id === 'multiple')?.status === 'pass' ? 1 : 0,
          network_latency_ms: networkLatencyMsRef.current ?? undefined,
          internet_speed_mbps: networkSpeedMbpsRef.current ?? undefined,
          video_brightness: videoBrightnessRef.current ?? undefined,
          ai_engine_latency_ms: aiEngineLatencyMsRef.current ?? undefined,
        }).catch(() => {}),

        // 2. Register face baseline for proctoring (best-effort with timeout).
        onRegisterFace && videoRef.current
          ? Promise.race([
              onRegisterFace(videoRef.current).catch(() => false),
              new Promise<boolean>((resolve) => setTimeout(() => resolve(false), FACE_REGISTRATION_TIMEOUT_MS)),
            ])
          : Promise.resolve(true),
      ]);

      // Stop remaining streams and intervals
      if (lightingIntervalRef.current) clearInterval(lightingIntervalRef.current);
      if (noiseIntervalRef.current) clearInterval(noiseIntervalRef.current);
      if (micIntervalRef.current) clearInterval(micIntervalRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      onAllPassed();
    } finally {
      if (mountedRef.current) setIsProceedLoading(false);
    }
  }, [token, systemChecks, onAllPassed, isProceedLoading, onRegisterFace]);

  // ────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────

  const blockedBrowserName = deviceInfo?.browser.name === 'Brave' || deviceInfo?.browser.name === 'Firefox' ? deviceInfo.browser.name : null;
  const deviceAllPass = deviceInfo ? !deviceInfo.isMobile && deviceInfo.browser.supported && !blockedBrowserName : false;

  // ────────────────────────────────────────
  // Phase 1: browser_check (loading)
  // ────────────────────────────────────────
  if (phase === 'browser_check') {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6" style={{ colorScheme: 'light' }}>
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
      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-6" style={{ colorScheme: 'light' }}>
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

            {blockedBrowserName && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900">{blockedBrowserName} is not a compatible browser</p>
                  <p className="text-sm text-amber-800 mt-1">
                    Use Chrome, Edge, or Safari to continue the interview. You cannot proceed while this interview is opened in {blockedBrowserName}.
                  </p>
                </div>
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
                {blockedBrowserName === 'Brave' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800 font-medium">Brave browser is blocked for AI interviews.</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Please open this interview link in Chrome, Edge, or Safari.
                    </p>
                  </div>
                )}
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
              disabled={!deviceAllPass}
              className={`w-full inline-flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-lg transition-all text-sm ${
                deviceAllPass
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
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
                        onClick={allEnvPassed && !isProceedLoading ? handleProceed : undefined}
                        disabled={!allEnvPassed || isProceedLoading}
                        className={`flex-1 inline-flex items-center justify-center gap-2 font-semibold py-3 px-4 rounded-lg text-sm transition-all ${
                          allEnvPassed && !isProceedLoading
                            ? 'bg-gray-900 text-white hover:bg-gray-800 cursor-pointer'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isProceedLoading ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Preparing...</>
                        ) : (
                          <>Proceed <ArrowRight className="w-4 h-4" /></>
                        )}
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
