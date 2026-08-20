'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';
import { loadFaceApiWithCpuBackend } from '@/lib/face-api-loader';
import { filterMultipleFaceCandidates, type FaceRegion } from '@/lib/proctoring/faceDetection';
import { MicDisconnectedDuringRecordingError } from '@/lib/utils/pcmEnroll';
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
  Settings,
  MicOff,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import { prefetchObjectDetectionModel } from '@/components/ai-interview/proctoring/InterviewObjectDetection';
import { checkVirtualCamera, virtualCameraMessage } from '@/lib/proctoring/virtualCameraDetection';

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
  /**
   * Called in parallel with onRegisterFace — enrolls the candidate's voice from
   * the live mic stream as a baseline for voice-identity verification during
   * the interview. Uses the same MediaStream already obtained for the noise
   * check, so no extra permission prompt is shown.
   */
  onEnrollVoice?: (stream: MediaStream) => Promise<boolean>;
}

type Phase = 'browser_check' | 'browser_results' | 'system_checks';
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
  // window.screen.width/height are CSS pixels — i.e. PHYSICAL ÷ display scale.
  // On Windows at 150% scaling a 1920×1080 panel reports 1280×720, which reads
  // as "wrong". Multiply by devicePixelRatio to recover the true hardware
  // resolution (dpr = OS scale × browser zoom; at 100% zoom this is exactly the
  // scale factor, so 1280 × 1.5 → 1920). Round to undo tiny float drift.
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const screenWidth = typeof window !== 'undefined' ? Math.round(window.screen.width * dpr) : 0;
  const screenHeight = typeof window !== 'undefined' ? Math.round(window.screen.height * dpr) : 0;

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
// Face baseline registration loads face-api models on first use and may need
// a few seconds on a cold browser cache. 3s was too short and let the UI move
// to practice while registration was still running in the background.
const FACE_REGISTRATION_TIMEOUT_MS = 8000;

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
const STEPPER_STEPS = ['Browser Check', 'System Checks'];

function getStepIndex(phase: Phase): number {
  if (phase === 'browser_check' || phase === 'browser_results') return 0;
  if (phase === 'system_checks') return 1;
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

// Fixed passage the candidate reads aloud during the mic check. A known,
// ~5-second sentence guarantees enough clean voiced speech for an accurate
// enrollment voiceprint (short spontaneous "hello" samples are too brief).
export const ENROLL_PASSAGE =
  'I am ready for my interview today, and I will answer each question to the best of my ability. ' +
  'I understand the instructions, and I am comfortable with my camera and microphone setup. ' +
  'Thank you for this opportunity — I am looking forward to getting started.';

export default function StepSystemCheck({
  token,
  position = 'this position',
  onAllPassed,
  onRegisterFace,
  onVerifyFace,
  onEnrollVoice,
}: StepSystemCheckProps) {
  const [phase, setPhase] = useState<Phase>('browser_check');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // System checks phase state
  const [systemChecks, setSystemChecks] = useState<SystemCheckItem[]>([]);
  const [hasFaceDetector, setHasFaceDetector] = useState(false);
  const [checksRunning, setChecksRunning] = useState(false);
  const [checksCompleted, setChecksCompleted] = useState(false);
  const [isProceedLoading, setIsProceedLoading] = useState(false);
  // Visible voice-enrollment state (the read-aloud panel inside the card).
  // 'disconnected' is distinct from 'failed': it means the headset died
  // mid-recording (see recordPcm16's MicDisconnectedDuringRecordingError),
  // not that the candidate's speech was rejected — the messaging and gating
  // below intentionally differ.
  const [voiceEnrollStatus, setVoiceEnrollStatus] =
    useState<'idle' | 'recording' | 'success' | 'failed' | 'disconnected'>('idle');
  const [voiceEnrollProgress, setVoiceEnrollProgress] = useState(0); // 0..100

  // Candidate-selectable camera/microphone — lets the candidate pick whichever
  // connected device is actually compatible (e.g. a USB webcam over a broken
  // built-in one, or a headset mic over a noisy laptop mic) instead of being
  // stuck with whatever the OS treats as default.
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(false);
  // Mirrors of the two selected-id state values above, read inside
  // getUserMedia calls. A ref (not the state) is used there because
  // switchCamera/switchMicrophone call runWebcam/ensureAudioAnalyser
  // synchronously, in the same tick as setSelectedCameraId/setSelectedMicId —
  // before React re-renders — so a closure over the state value would still
  // see the OLD selection.
  const selectedCameraIdRef = useRef<string>('');
  const selectedMicIdRef = useRef<string>('');
  // Set the moment a PREVIOUSLY-PASSING microphone check goes dead (headset
  // unplugged, Bluetooth drop, etc.) here on the System Check screen itself —
  // i.e. after the candidate already selected a mic and it passed, but before
  // they've clicked Continue. Blocks Continue and shows a reconnect popup
  // until the same device (or a newly selected one) is live again.
  const [micDisconnectedPopup, setMicDisconnectedPopup] = useState(false);
  // Fires alongside the SILENT fallback switch (external mic pulled, but a
  // system/built-in mic is still available) — the switch itself doesn't
  // block anything, but the candidate should still be told their device was
  // removed. Non-blocking, auto-dismisses itself after a few seconds.
  const [micFallbackNotice, setMicFallbackNotice] = useState(false);
  const micFallbackNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measured metric values to include when submitting to backend
  const networkLatencyMsRef = useRef<number | null>(null);
  const networkSpeedMbpsRef = useRef<number | null>(null);
  const videoBrightnessRef = useRef<number | null>(null);
  const aiEngineLatencyMsRef = useRef<number | null>(null);

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
  // Voice enrollment is captured WHILE the candidate speaks during the mic
  // check (reading the prompt below), not at proceed-time when they're silent —
  // that yields clean, sufficient speech for an accurate voiceprint.
  const voiceEnrollPromiseRef = useRef<Promise<boolean> | null>(null);
  // Bumped on every startVoiceEnroll() call so a stale attempt's outcome
  // (e.g. one that was already superseded by a fresh "Record again" after a
  // mid-recording disconnect) can't clobber a newer attempt's state when it
  // eventually settles.
  const voiceEnrollAttemptIdRef = useRef(0);
  // Mirror of voiceEnrollStatus readable from the live mic-disconnect watcher,
  // whose handler closes over state from the render that armed it.
  const voiceEnrollStatusRef = useRef<typeof voiceEnrollStatus>('idle');
  const mountedRef = useRef(true);
  const checksCancelledRef = useRef(false);
  // Guards concurrent face-api.js / TF.js WebGL calls — only one may run at a time.
  // handleProceed waits for this to clear before calling onRegisterFace.
  const faceApiBusyRef = useRef(false);

  // ────────────────────────────────────────
  // Phase 1: Browser Check — auto-detect on mount
  // ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'browser_check') return;

    // Warm the proctoring object-detection weights (tens of MB) while the
    // candidate works through the camera/mic checks, so the interview itself
    // never waits on that download. Fire-and-forget; failure is harmless.
    prefetchObjectDetectionModel();

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

  // Kick off voice enrollment once, updating the visible panel state as it runs.
  // Called from the mic check the moment the candidate's voice is detected.
  //
  // Guarded by voiceEnrollAttemptIdRef: if the headset dies mid-recording, the
  // candidate can start a FRESH attempt (once the mic check passes again)
  // before the old, now-aborted onEnrollVoice() promise has actually settled.
  // Without the id check, that stale promise resolving later would stomp the
  // new attempt's 'recording'/'success' state with its own leftover outcome.
  const startVoiceEnroll = useCallback(() => {
    if (voiceEnrollPromiseRef.current || !onEnrollVoice || !streamRef.current) return;
    const attemptId = ++voiceEnrollAttemptIdRef.current;
    setVoiceEnrollStatus('recording');
    setVoiceEnrollProgress(0);
    voiceEnrollPromiseRef.current = onEnrollVoice(streamRef.current)
      .then((ok) => {
        if (mountedRef.current && voiceEnrollAttemptIdRef.current === attemptId) {
          setVoiceEnrollStatus(ok ? 'success' : 'failed');
        }
        return ok;
      })
      .catch((err) => {
        if (mountedRef.current && voiceEnrollAttemptIdRef.current === attemptId) {
          // Headset pulled mid-recording: distinct status/messaging from a
          // normal "no speech heard" failure — the candidate must reconnect
          // and record again from scratch, not just retry.
          setVoiceEnrollStatus(err instanceof MicDisconnectedDuringRecordingError ? 'disconnected' : 'failed');
        }
        return false;
      })
      .finally(() => {
        if (voiceEnrollAttemptIdRef.current === attemptId) voiceEnrollPromiseRef.current = null;
      });
  }, [onEnrollVoice]);

  // Re-run voice enrollment (from the panel's Retry / Record-again button).
  const retryVoiceEnroll = useCallback(() => {
    voiceEnrollPromiseRef.current = null;
    setVoiceEnrollStatus('idle');
    setVoiceEnrollProgress(0);
    startVoiceEnroll();
  }, [startVoiceEnroll]);

  useEffect(() => { voiceEnrollStatusRef.current = voiceEnrollStatus; }, [voiceEnrollStatus]);

  // Drive the recording progress bar (~12 s capture) for visible feedback.
  useEffect(() => {
    if (voiceEnrollStatus !== 'recording') return;
    const started = performance.now();
    const CAPTURE_MS = 12000;
    const iv = setInterval(() => {
      const pct = Math.min(100, ((performance.now() - started) / CAPTURE_MS) * 100);
      setVoiceEnrollProgress(pct);
    }, 200);
    return () => clearInterval(iv);
  }, [voiceEnrollStatus]);

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

  // ── Shared media helpers ───────────────────────────────────────────────
  // Reuse the already-open webcam/mic when present (full run) so a single-check
  // retry doesn't fight for the device; acquire fresh only when missing.
  const ensureVideoStream = useCallback(async (): Promise<boolean> => {
    const existing = streamRef.current;
    const liveVideo = existing?.getVideoTracks().some((t) => t.readyState === 'live');
    if (liveVideo) {
      if (videoRef.current && videoRef.current.srcObject !== existing) videoRef.current.srcObject = existing;
      return true;
    }
    try {
      const videoConstraint: MediaTrackConstraints | boolean = selectedCameraIdRef.current
        ? { deviceId: { exact: selectedCameraIdRef.current } }
        : true;
      const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      await new Promise((r) => setTimeout(r, 1200)); // let metadata / first frames arrive
      return true;
    } catch {
      return false;
    }
  }, []);

  const ensureAudioAnalyser = useCallback(async (): Promise<AnalyserNode | null> => {
    if (analyserRef.current && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      return analyserRef.current;
    }
    try {
      const audioConstraint: MediaTrackConstraints | boolean = selectedMicIdRef.current
        ? { deviceId: { exact: selectedMicIdRef.current } }
        : true;
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new Ctx();
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
      if (audioContextRef.current && audioContextRef.current !== audioContext) {
        try { await audioContextRef.current.close(); } catch { /* ignore */ }
      }
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      if (streamRef.current) audioStream.getAudioTracks().forEach((t) => streamRef.current!.addTrack(t));
      return analyser;
    } catch {
      return null;
    }
  }, []);

  // Chrome/Edge expose two synthetic aliases per physical audio device
  // ("default" and "communications", deviceId literally 'default'/'communications')
  // that just point at whichever real device is already listed — without this
  // filter the dropdown shows the same physical mic three times. Drop the
  // aliases and keep only the actual connected hardware; also de-dupe by
  // groupId in case a device is otherwise listed twice.
  const dedupeRealDevices = (devices: MediaDeviceInfo[]): MediaDeviceInfo[] => {
    const seenGroups = new Set<string>();
    return devices.filter((d) => {
      if (d.deviceId === 'default' || d.deviceId === 'communications') return false;
      if (d.groupId && seenGroups.has(d.groupId)) return false;
      if (d.groupId) seenGroups.add(d.groupId);
      return true;
    });
  };

  // Populate the dropdown option lists. Labels are only populated by the
  // browser once camera/mic permission has been granted, so this is called
  // again after each successful webcam/microphone check.
  const refreshDeviceLists = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameraDevices(dedupeRealDevices(devices.filter((d) => d.kind === 'videoinput')));
      setMicDevices(dedupeRealDevices(devices.filter((d) => d.kind === 'audioinput')));
    } catch {
      /* enumeration unsupported or blocked — dropdowns just stay empty */
    }
  }, []);

  // Shared by both runMicrophone's failure path and the live-disconnect
  // watcher below: when the currently-selected microphone is unreachable,
  // try any OTHER enumerated mic before giving up. The web platform has no
  // "is this a laptop" API — device form-factor isn't exposed to pages — so
  // the presence of another live microphone is used as the practical stand-in
  // for "this machine has a built-in mic to fall back to." Desktops typically
  // have no built-in mic (the headset IS the only device), so this naturally
  // only kicks in on machines that do.
  //   - Alternate found  → switch to it silently, check stays 'pass' (no popup).
  //   - None found       → fail the check and show the reconnect popup.
  // NOTE: this never sets micDisconnectedPopup itself — only the live watch
  // effect below does that (see its handleDisconnect), because it's the only
  // caller that KNOWS this is a genuine regression (the mic was passing and
  // just died). This function is also called from runMicrophone's plain
  // failure path — used by the very first "Run Check", a manual Retry click,
  // AND the auto-select-single-device effect that fires silently the moment
  // the System Check page loads, before the candidate has done anything. If
  // this set the popup on every failure, that background auto-select attempt
  // alone could pop the reconnect modal before checks even ran once.
  //
  // `allowFallback: false` disables the silent switch entirely and forces the
  // plain-failure path. Used when the mic dies mid voice-verification: the
  // voiceprint must be enrolled on the device the candidate actually selected,
  // so quietly re-pointing them at the laptop's built-in mic and carrying on
  // would enroll the WRONG device. That case has to surface as a real "no
  // microphone" stop, exactly like a machine with no fallback at all.
  const tryMicFallbackOrFail = useCallback(async (
    deadDeviceId: string,
    allowFallback = true,
  ): Promise<boolean> => {
    let fallbackDeviceId: string | null = null;
    try {
      if (allowFallback) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const altMic = dedupeRealDevices(devices.filter((d) => d.kind === 'audioinput'))
          .find((d) => d.deviceId && d.deviceId !== deadDeviceId);
        if (altMic) fallbackDeviceId = altMic.deviceId;
      }
    } catch { /* enumeration failed — caller decides how to handle */ }

    if (fallbackDeviceId) {
      selectedMicIdRef.current = fallbackDeviceId;
      setSelectedMicId(fallbackDeviceId);
      const analyser = await ensureAudioAnalyser();
      if (analyser) {
        updateSystemCheck('microphone', {
          status: 'pass',
          detail: 'Microphone active — switched to built-in microphone after headset disconnected',
        });
        void refreshDeviceLists();
        return true;
      }
      // The "fallback" device turned out to be unreachable too (rare) — fall
      // through to the plain failure below.
    }

    updateSystemCheck('microphone', {
      status: 'fail',
      detail: 'No microphone detected — please connect a microphone',
    });
    return false;
  }, [ensureAudioAnalyser, updateSystemCheck, refreshDeviceLists]);

  // ── Individual checks — each self-contained so it can run standalone (retry) ──
  const runDevice = useCallback(async () => {
    updateSystemCheck('device', { status: 'checking', detail: 'Detecting device...' });
    await new Promise((r) => setTimeout(r, 400));
    const info = deviceInfo || detectDevice();
    updateSystemCheck('device', info.isMobile
      ? { status: 'fail', detail: 'Mobile device detected — use a desktop or laptop' }
      : { status: 'pass', detail: 'Desktop/Laptop detected' });
  }, [deviceInfo, updateSystemCheck]);

  const runWebcam = useCallback(async () => {
    updateSystemCheck('webcam', { status: 'checking', detail: 'Requesting webcam access...' });
    try {
      // Preserve any already-acquired audio track (e.g. from a prior mic
      // check) — replacing streamRef wholesale would silently drop it and
      // force an unnecessary mic re-check whenever the candidate switches camera.
      const existingAudioTracks = streamRef.current?.getAudioTracks() ?? [];
      streamRef.current?.getVideoTracks().forEach((t) => t.stop()); // release stale track on retry
      const videoConstraint: MediaTrackConstraints | boolean = selectedCameraIdRef.current
        ? { deviceId: { exact: selectedCameraIdRef.current } }
        : true;
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });

      // Reject mobile-camera-relay virtual drivers (Motorola Smart Connect,
      // DroidCam, Iriun, EpocCam, Camo, OBS Virtual Camera, etc.) before this
      // check can pass — they register as a normal video input device with
      // no API-level flag distinguishing them from real hardware, so the
      // driver's advertised name is the signal used here. Checked again in
      // Webcam.tsx at interview start (and every reacquire), since that's a
      // separate getUserMedia call from this system-check stream.
      const camCheck = checkVirtualCamera(videoStream.getVideoTracks()[0]);
      if (camCheck.flagged) {
        videoStream.getTracks().forEach((t) => t.stop());
        updateSystemCheck('webcam', { status: 'fail', detail: virtualCameraMessage(camCheck.label) });
        return;
      }

      const combinedStream = new MediaStream([...videoStream.getVideoTracks(), ...existingAudioTracks]);
      streamRef.current = combinedStream;
      if (videoRef.current) videoRef.current.srcObject = combinedStream;
      updateSystemCheck('webcam', { status: 'checking', detail: 'Verifying video signal...' });
      await new Promise((r) => setTimeout(r, 1200));
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
          let maxPixel = 0;
          for (let i = 0; i < d.length; i += 4) maxPixel = Math.max(maxPixel, d[i], d[i + 1], d[i + 2]);
          videoOk = maxPixel > 5;
        }
      } else if (vid && vid.readyState >= 1) {
        videoOk = true;
      }
      updateSystemCheck('webcam', videoOk
        ? { status: 'pass', detail: 'Webcam producing video' }
        : { status: 'fail', detail: 'Camera connected but no video signal — check if lens is covered' });
      void refreshDeviceLists();
    } catch {
      updateSystemCheck('webcam', { status: 'fail', detail: 'Webcam access denied' });
    }
  }, [updateSystemCheck, refreshDeviceLists]);

  const runMicrophone = useCallback(async () => {
    if (micIntervalRef.current) { clearInterval(micIntervalRef.current); micIntervalRef.current = null; }
    updateSystemCheck('microphone', { status: 'checking', detail: 'Requesting microphone access...' });
    const analyser = await ensureAudioAnalyser();
    void refreshDeviceLists();
    if (!analyser) {
      // A specific device was already selected (this check likely passed
      // before) but is no longer reachable — that's a disconnect, not a
      // permission denial. Try a fallback device (built-in mic) before
      // failing, and keep the reconnect messaging/popup consistent regardless
      // of WHICH path discovered it: the live track-ended watcher, a manual
      // "Retry" click, or the initial "Run Check" running mid-outage.
      if (selectedMicIdRef.current) {
        await tryMicFallbackOrFail(selectedMicIdRef.current);
      } else {
        updateSystemCheck('microphone', { status: 'fail', detail: 'Microphone access denied' });
      }
      return;
    }
    // Voice-activity detection was intentionally REMOVED from this check. The
    // candidate proves their voice in the dedicated, manual Voice Verification
    // sub-step below (which does server-side speech/silence detection and gates
    // Continue). Here we only confirm the microphone is accessible.
    //
    // This check is gated on an EXPLICIT device selection: mic access being
    // granted is not enough to pass — the candidate must pick their mic from
    // the Device Settings dropdown below (selectedMicIdRef stays '' — i.e.
    // "System Default" — until they do). This can't rely on the selectedMicId
    // STATE inside this closure, since switchMicrophone calls this function in
    // the same tick as setSelectedMicId, before React re-renders with the new
    // value — the ref is always current.
    if (!selectedMicIdRef.current) {
      updateSystemCheck('microphone', {
        status: 'fail',
        detail: 'Select your microphone in Device Settings below to complete this check',
      });
      return;
    }
    updateSystemCheck('microphone', { status: 'pass', detail: 'Microphone active' });
  }, [ensureAudioAnalyser, updateSystemCheck, refreshDeviceLists, tryMicFallbackOrFail]);

  const runInternet = useCallback(async () => {
    updateSystemCheck('internet', { status: 'checking', detail: 'Measuring your connection speed...' });
    const healthUrl = `${API_BASE_URL.replace('/api/v1', '')}/health`;
    const latencies: number[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        const start = performance.now();
        await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
        latencies.push(performance.now() - start);
      } catch { /* individual ping failed */ }
    }
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    const measureDownloadMbps = async (): Promise<number | null> => {
      const MAX_MS = 4000;
      const MAX_BYTES = 25_000_000;
      const MIN_BYTES = 250_000;
      const sources = [`https://speed.cloudflare.com/__down?bytes=${MAX_BYTES}`];
      for (const base of sources) {
        try {
          const controller = new AbortController();
          const hardStop = setTimeout(() => controller.abort(), MAX_MS + 1500);
          const url = `${base}${base.includes('?') ? '&' : '?'}_=${Date.now()}`;
          const start = performance.now();
          const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
          if (!res.ok || !res.body) { clearTimeout(hardStop); continue; }
          const reader = res.body.getReader();
          let bytes = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) bytes += value.length;
            if (performance.now() - start >= MAX_MS || bytes >= MAX_BYTES) {
              try { await reader.cancel(); } catch { /* ignore */ }
              controller.abort();
              break;
            }
          }
          clearTimeout(hardStop);
          const elapsedSec = (performance.now() - start) / 1000;
          if (bytes >= MIN_BYTES && elapsedSec > 0.15) {
            return (bytes * 8) / (elapsedSec * 1_000_000);
          }
        } catch { /* aborted/blocked */ }
      }
      return null;
    };

    let realMbps: number | null = null;
    try { realMbps = await measureDownloadMbps(); } catch { realMbps = null; }
    if (avgLatency !== null) networkLatencyMsRef.current = avgLatency;

    if (realMbps !== null) {
      networkSpeedMbpsRef.current = realMbps;
      const passes = realMbps >= MIN_INTERNET_MBPS;
      updateSystemCheck('internet', passes
        ? { status: 'pass', detail: `Speed: ${realMbps.toFixed(1)} Mbps (≥ ${MIN_INTERNET_MBPS} Mbps required)` }
        : { status: 'fail', detail: `Speed: ${realMbps.toFixed(1)} Mbps (below ${MIN_INTERNET_MBPS} Mbps minimum)` });
    } else if (avgLatency !== null) {
      const passes = avgLatency < 500;
      updateSystemCheck('internet', passes
        ? { status: 'pass', detail: `Connection: Good (${avgLatency}ms latency — speed test unavailable on this network)` }
        : { status: 'fail', detail: `Connection: Slow (${avgLatency}ms latency — check your internet, ${MIN_INTERNET_MBPS} Mbps required)` });
    } else {
      updateSystemCheck('internet', { status: 'fail', detail: 'Unable to reach server — check your connection' });
    }
  }, [updateSystemCheck]);

  const runAiEngine = useCallback(async () => {
    updateSystemCheck('ai_engine', { status: 'checking', detail: 'Checking AI engine availability...' });
    try {
      const aiHealth = await candidateAIInterviewService.checkAIHealth(token);
      aiEngineLatencyMsRef.current = aiHealth.latency_ms;
      updateSystemCheck('ai_engine', aiHealth.status === 'ready'
        ? { status: 'pass', detail: `AI engine ready (${aiHealth.latency_ms}ms)` }
        : { status: 'fail', detail: 'AI engine unavailable — please try again shortly' });
    } catch {
      updateSystemCheck('ai_engine', { status: 'fail', detail: 'AI engine unreachable — check your connection' });
    }
  }, [token, updateSystemCheck]);

  const runWebsocket = useCallback(async () => {
    updateSystemCheck('websocket', { status: 'checking', detail: 'Testing WebSocket connectivity...' });
    if (typeof WebSocket === 'undefined') {
      updateSystemCheck('websocket', { status: 'fail', detail: 'WebSocket not supported by this browser' });
      return;
    }
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
      const timer = setTimeout(() => settle('fail', 'WebSocket connection timed out — check network/firewall settings'), TIMEOUT_MS);
      try { ws = new WebSocket(wsUrl); } catch { settle('fail', 'WebSocket connection could not be established'); return; }
      ws.onopen = () => settle('pass', 'WebSocket connected successfully');
      ws.onclose = () => settle('pass', 'WebSocket connection established');
    });
  }, [token, updateSystemCheck]);

  const runLighting = useCallback(async () => {
    if (lightingIntervalRef.current) { clearInterval(lightingIntervalRef.current); lightingIntervalRef.current = null; }
    updateSystemCheck('lighting', { status: 'checking', detail: 'Analyzing lighting...' });
    const hasVideo = await ensureVideoStream();
    await new Promise((r) => setTimeout(r, hasVideo ? 800 : 0));
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState >= 2) {
      const readBrightness = (): number | null => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || video.readyState < 2) return null;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
        return data.length > 0 ? total / (data.length / 4) : 0;
      };
      // ONE-SHOT check — sampled a few times over ~1.5s so a single dark/bright
      // frame (a flicker, a hand passing the lens) can't decide it alone, but
      // this does NOT keep re-verifying itself in the background afterward on
      // a timer. Verification only happens here, at explicit "Run Check" /
      // "Retry" click time — never on an ongoing interval the candidate didn't ask for.
      const first = readBrightness();
      if (first === null) {
        updateSystemCheck('lighting', { status: 'fail', detail: 'Unable to analyze lighting' });
      } else {
        const SAMPLE_COUNT = 3;
        const SAMPLE_GAP_MS = 500;
        const samples: number[] = [first];
        for (let i = 1; i < SAMPLE_COUNT; i++) {
          await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS));
          const s = readBrightness();
          if (s !== null) samples.push(s);
        }
        const avgBrightness = samples.reduce((a, b) => a + b, 0) / samples.length;
        videoBrightnessRef.current = Math.round(avgBrightness);
        updateSystemCheck('lighting', avgBrightness >= 40
          ? { status: 'pass', detail: 'Lighting: Good (Face clearly visible)' }
          : { status: 'fail', detail: 'Lighting: Too dark - improve your lighting' });
      }
    } else {
      updateSystemCheck('lighting', { status: 'fail', detail: 'Camera not available for lighting check' });
    }
  }, [ensureVideoStream, updateSystemCheck]);

  const runNoise = useCallback(async () => {
    if (noiseIntervalRef.current) { clearInterval(noiseIntervalRef.current); noiseIntervalRef.current = null; }
    updateSystemCheck('noise', { status: 'checking', detail: 'Analyzing background noise...' });
    const analyser = await ensureAudioAnalyser();
    await new Promise((r) => setTimeout(r, 1000));
    if (analyser) {
      // ONE-SHOT check — sampled a few times over ~1.5s so a single spurious
      // spike (cough, chair scrape) can't decide it alone, but this does NOT
      // keep re-verifying itself in the background afterward on a timer.
      // Verification only happens here, at explicit "Run Check" / "Retry"
      // click time — never on an ongoing interval the candidate didn't ask for.
      const readAvg = () => {
        const da = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(da);
        return da.length > 0 ? da.reduce((a, b) => a + b, 0) / da.length : 0;
      };
      const SAMPLE_COUNT = 3;
      const SAMPLE_GAP_MS = 500;
      const samples: number[] = [readAvg()];
      for (let i = 1; i < SAMPLE_COUNT; i++) {
        await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS));
        samples.push(readAvg());
      }
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      updateSystemCheck('noise', avg < 80
        ? { status: 'pass', detail: 'Background noise: Low (Good)' }
        : { status: 'fail', detail: 'Background noise: High - find a quieter space' });
    } else {
      updateSystemCheck('noise', { status: 'fail', detail: 'Microphone not available for noise check' });
    }
  }, [ensureAudioAnalyser, updateSystemCheck]);

  const runFaceMultiple = useCallback(async () => {
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
    updateSystemCheck('face', { status: 'checking', detail: 'Detecting face...' });
    updateSystemCheck('multiple', { status: 'checking', detail: 'Checking for multiple people...' });
    await ensureVideoStream();
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      updateSystemCheck('face', { status: 'fail', detail: 'Camera not available for face check' });
      updateSystemCheck('multiple', { status: 'fail', detail: 'Camera not available' });
      return;
    }

    const FACE_API_MODEL_URL = '/models/';

    // Count only SIGNIFICANT (real, close-up) faces — tiny background artifacts,
    // shadows, posters, and reflections that the raw detector weakly flags as
    // "faces" are filtered out by size. Without this, an EMPTY frame (no one in
    // front of the camera) intermittently reported 2+ faces, so "Multiple People
    // Check" falsely failed with "2 people detected" while "Face Detection"
    // failed with "No face" — the two checks contradicting each other. Filtering
    // decouples them: an empty frame yields 0 → only the no-face result.
    const countSignificantFaces = (
      dets: any[],
      getRegion: (d: any) => FaceRegion | null,
    ): number => {
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      if (w <= 0 || h <= 0) return 0;
      return filterMultipleFaceCandidates(dets, getRegion, w, h).length;
    };
    const nativeRegion = (d: any): FaceRegion | null => {
      const b = d?.boundingBox;
      return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
    };
    const faceApiRegion = (d: any): FaceRegion | null => {
      const b = d?.box;
      return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
    };

    // The two checks are FULLY INDEPENDENT, each answering its own question:
    //   • Face Detection    → is the candidate's OWN face present?  (needs >=1)
    //   • Multiple People    → are there EXTRA people?  (only 2+ is a violation)
    // So they never move as a pair: 0 faces → Face fails, Multiple passes (no
    // extra people); 1 face → both pass; 2+ faces → Face passes, Multiple fails.
    // Face Detection alone gates "you must be visible" (allSystemPassed needs it),
    // so passing Multiple at 0 faces can't let anyone through without a face.
    const applyFaceCount = (count: number) => {
      // Face Detection: purely about the candidate's face being present.
      if (count >= 1) {
        updateSystemCheck('face', { status: 'pass', detail: 'Face detected successfully' });
      } else {
        updateSystemCheck('face', { status: 'fail', detail: 'No face detected — position yourself in front of the camera' });
      }
      // Multiple People Check: purely about EXTRA people — independent of whether
      // the face is currently visible. Passes for 0 or 1 person; fails only at 2+.
      if (count >= 2) {
        updateSystemCheck('multiple', { status: 'fail', detail: `${count} people detected — ensure you are alone` });
      } else if (count === 1) {
        updateSystemCheck('multiple', { status: 'pass', detail: 'Single person detected (Good)' });
      } else {
        updateSystemCheck('multiple', { status: 'pass', detail: 'No other people detected' });
      }
    };

    const hasNative = typeof window !== 'undefined' && 'FaceDetector' in window;
    let useFaceApi = !hasNative;
    if (hasNative) {
      try {
        const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        applyFaceCount(countSignificantFaces(Array.from(await detector.detect(video)), nativeRegion));
        setHasFaceDetector(true);
        faceIntervalRef.current = setInterval(async () => {
          if (faceApiBusyRef.current || !video || video.readyState < 2) return;
          faceApiBusyRef.current = true;
          try { applyFaceCount(countSignificantFaces(Array.from(await detector.detect(video)), nativeRegion)); } catch { /* skip frame */ }
          finally { faceApiBusyRef.current = false; }
        }, 2500);
      } catch {
        useFaceApi = true;
      }
    }
    if (useFaceApi) {
      try {
        const faceapi = await loadFaceApiWithCpuBackend();
        if (!faceapi.nets.tinyFaceDetector.isLoaded) {
          await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
        }
        const opts = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });
        applyFaceCount(countSignificantFaces(await faceapi.detectAllFaces(video, opts), faceApiRegion));
        setHasFaceDetector(true);
        faceIntervalRef.current = setInterval(async () => {
          if (faceApiBusyRef.current || !video || video.readyState < 2) return;
          faceApiBusyRef.current = true;
          try { applyFaceCount(countSignificantFaces(await faceapi.detectAllFaces(video, opts), faceApiRegion)); } catch { /* skip frame */ }
          finally { faceApiBusyRef.current = false; }
        }, 2500);
      } catch {
        setHasFaceDetector(false);
        updateSystemCheck('face', { status: 'pass', detail: 'Camera working (face check unavailable on this browser)' });
        updateSystemCheck('multiple', { status: 'pass', detail: 'Single-face check unavailable on this browser' });
      }
    }

    if (onVerifyFace) {
      try {
        await new Promise((r) => setTimeout(r, 800));
        const verifyResult = await onVerifyFace(video);
        if (verifyResult !== null && !verifyResult.matched) {
          updateSystemCheck('face', { status: 'fail', detail: 'Identity mismatch — please ensure you are the registered candidate' });
        }
      } catch { /* non-critical */ }
    }
  }, [ensureVideoStream, onVerifyFace, updateSystemCheck]);

  // Full run — orchestrates every check in order (initial "Run Check").
  const handleRunChecks = useCallback(async () => {
    stopActiveChecks();
    checksCancelledRef.current = false;
    setChecksRunning(true);
    setChecksCompleted(false);
    setSystemChecks(INITIAL_CHECKS);
    // Give the browser (esp. Brave) time to release mic hardware from a prior run.
    await new Promise((r) => setTimeout(r, 600));
    const cancelled = () => checksCancelledRef.current;
    if (cancelled()) return;
    await runDevice(); if (cancelled()) return;
    await runWebcam(); if (cancelled()) return;
    await runMicrophone(); if (cancelled()) return;
    await runInternet(); if (cancelled()) return;
    await runAiEngine(); if (cancelled()) return;
    await runWebsocket(); if (cancelled()) return;
    await runLighting(); if (cancelled()) return;
    await runNoise(); if (cancelled()) return;
    await runFaceMultiple(); if (cancelled()) return;
    if (!checksCancelledRef.current) {
      setChecksRunning(false);
      setChecksCompleted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopActiveChecks, runDevice, runWebcam, runMicrophone, runInternet, runAiEngine, runWebsocket, runLighting, runNoise, runFaceMultiple]);

  // Retry a SINGLE check — reruns only that row (face/multiple share one detector).
  const retryCheck = useCallback(async (id: string) => {
    checksCancelledRef.current = false;
    switch (id) {
      case 'device': await runDevice(); break;
      case 'webcam': await runWebcam(); break;
      case 'microphone': await runMicrophone(); break;
      case 'internet': await runInternet(); break;
      case 'ai_engine': await runAiEngine(); break;
      case 'websocket': await runWebsocket(); break;
      case 'lighting': await runLighting(); break;
      case 'noise': await runNoise(); break;
      case 'face':
      case 'multiple': await runFaceMultiple(); break;
    }
  }, [runDevice, runWebcam, runMicrophone, runInternet, runAiEngine, runWebsocket, runLighting, runNoise, runFaceMultiple]);

  // Mark camera-dependent checks as unverified after the selected camera
  // changes — same rule and reason as markAudioChecksUnverified below:
  // picking a device must never auto-verify it, only "Run Check" (first run)
  // or a per-row "Retry" click may. The Camera Preview intentionally keeps
  // showing the PREVIOUS device's feed until Retry actually swaps the stream
  // via runWebcam() — that swap IS the verification, so it's deferred too.
  const markCameraChecksUnverified = useCallback(() => {
    if (lightingIntervalRef.current) { clearInterval(lightingIntervalRef.current); lightingIntervalRef.current = null; }
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
    if (!checksCompleted) return;
    updateSystemCheck('webcam', { status: 'fail', detail: 'Click Retry to verify this camera' });
    updateSystemCheck('lighting', { status: 'fail', detail: 'Click Retry to re-check lighting' });
    updateSystemCheck('face', { status: 'fail', detail: 'Click Retry to re-check face detection' });
    updateSystemCheck('multiple', { status: 'fail', detail: 'Click Retry to re-check for other people' });
  }, [checksCompleted, updateSystemCheck]);

  const switchCamera = useCallback((deviceId: string) => {
    if (deviceId === selectedCameraId) return;
    selectedCameraIdRef.current = deviceId;
    setSelectedCameraId(deviceId);
    markCameraChecksUnverified();
  }, [selectedCameraId, markCameraChecksUnverified]);

  // Mark BOTH audio-dependent checks as unverified after the selected mic
  // changes (dropdown pick, or the single-device auto-select).
  //
  // Neither check may run — let alone pass — as a side effect of a device
  // merely being selected or plugged in. That's why this only sets row state
  // and never calls runMicrophone()/runNoise(): verification happens solely
  // on an explicit "Run Check" (first run) or per-row "Retry" click.
  //
  // Background Noise is a ONE-SHOT check (runNoise samples a few times and
  // stops — no ongoing polling interval), so there's nothing left running to
  // tear down here; this clear is just a defensive no-op against any stale
  // interval from before that change.
  const markAudioChecksUnverified = useCallback(() => {
    if (noiseIntervalRef.current) { clearInterval(noiseIntervalRef.current); noiseIntervalRef.current = null; }
    // Before the first "Run Check", leave both rows at their initial 'pending'
    // state — that button still exists and will run (and correctly pass) them
    // against the freshly selected device. After the first run, "Run Check" is
    // gone and only per-row Retry remains, so mark them unverified/'fail' here
    // to surface that Retry control.
    if (!checksCompleted) return;
    updateSystemCheck('microphone', { status: 'fail', detail: 'Click Retry to verify this microphone' });
    updateSystemCheck('noise', { status: 'fail', detail: 'Click Retry to re-check background noise' });
  }, [checksCompleted, updateSystemCheck]);

  // Candidate picked a different microphone — drop the cached analyser so
  // ensureAudioAnalyser is forced to re-acquire on the newly selected device.
  const switchMicrophone = useCallback(async (deviceId: string) => {
    if (isSwitchingDevice || deviceId === selectedMicId) return;
    setIsSwitchingDevice(true);
    selectedMicIdRef.current = deviceId;
    setSelectedMicId(deviceId);
    try {
      if (audioContextRef.current) {
        await audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => {
          t.stop();
          streamRef.current!.removeTrack(t);
        });
      }
      markAudioChecksUnverified();
    } finally {
      setIsSwitchingDevice(false);
    }
  }, [isSwitchingDevice, selectedMicId, markAudioChecksUnverified]);

  // Keep the dropdown options current if the candidate plugs/unplugs a device
  // mid-check (e.g. connects a USB webcam after the page already loaded).
  useEffect(() => {
    if (phase !== 'system_checks') return;
    void refreshDeviceLists();
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener('devicechange', refreshDeviceLists);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDeviceLists);
  }, [phase, refreshDeviceLists]);

  // If exactly one microphone is connected, there's nothing to choose between —
  // auto-select it so the candidate doesn't have to open the dropdown just to
  // pick the only option. With 2+ devices, the dropdown stays in charge and
  // the candidate must explicitly choose (see runMicrophone's selectedMicIdRef
  // gate). Guarded on `!selectedMicId` so this never overrides a choice the
  // candidate (or a prior auto-select) already made — e.g. if a second mic is
  // plugged in later, the first one stays selected.
  //
  // Deliberately runs neither check — auto-selecting the device must not
  // auto-pass or auto-run anything; "Run Check" (or Retry, post-first-run)
  // still has to do it, same as an explicit dropdown selection.
  useEffect(() => {
    if (phase !== 'system_checks' || selectedMicId || micDevices.length !== 1) return;
    const only = micDevices[0];
    selectedMicIdRef.current = only.deviceId;
    setSelectedMicId(only.deviceId);
    markAudioChecksUnverified();
  }, [phase, micDevices, selectedMicId, markAudioChecksUnverified]);

  // Once the Microphone check has PASSED on this screen, keep watching the
  // live track — if the headset is pulled before the candidate clicks
  // Continue, this is the only thing that would otherwise catch it (the
  // check itself only runs once, at "Run Check" / selection time). The
  // instant the track dies, fail the check (which disables Continue via
  // allSystemPassed) and show the reconnect popup.
  const micCheckStatus = systemChecks.find((c) => c.id === 'microphone')?.status;
  useEffect(() => {
    if (phase !== 'system_checks' || micCheckStatus !== 'pass') return;
    const track = streamRef.current?.getAudioTracks().find((t) => t.readyState === 'live');
    if (!track) return;

    let handling = false;
    const handleDisconnect = async () => {
      if (handling) return; // re-entrancy guard — 'ended' + the 1s poll can both fire
      handling = true;
      try {
        // Drop the cached analyser/AudioContext — ensureAudioAnalyser() short-
        // circuits and returns them as-is whenever they exist, regardless of
        // whether the underlying track is still live. Without clearing them
        // here, a retry would report success by handing back the same dead
        // analyser instead of re-acquiring the microphone.
        const deadDeviceId = selectedMicIdRef.current;
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (streamRef.current) {
          streamRef.current.getAudioTracks().forEach((t) => {
            t.stop();
            streamRef.current!.removeTrack(t);
          });
        }

        // Desktops typically have no built-in microphone, so a headset is the
        // only mic device — tryMicFallbackOrFail finds nothing to switch to
        // and the popup below covers it. Laptops almost always still have
        // their built-in mic enumerated as a second device even while a
        // headset was in use — when one exists, it switches to it silently
        // and the popup never shows, since the candidate can keep going.
        // This effect only ever runs after a confirmed 'pass', so unlike
        // runMicrophone's own failure path, reacting here IS always a
        // genuine "you had it working and it just died" regression — safe
        // to surface to the candidate either way.
        //
        // EXCEPTION — voice verification. While a read-aloud capture is in
        // flight (or was just interrupted and hasn't been redone), the silent
        // fallback is suppressed: the voiceprint has to be enrolled on the
        // device the candidate SELECTED, so quietly re-pointing them at the
        // laptop's built-in mic would enroll the wrong one, and the "keep
        // going, you're fine" fallback notice would directly contradict the
        // voice panel telling them to reconnect and start over. Forcing the
        // failure path here makes a laptop behave exactly like a desktop with
        // no built-in mic: check fails, popup shows, micReadyForVoice goes
        // false, and the voice panel reads "No microphone detected."
        const duringVoiceEnroll =
          voiceEnrollStatusRef.current === 'recording' || voiceEnrollStatusRef.current === 'disconnected';
        const recovered = await tryMicFallbackOrFail(deadDeviceId, !duringVoiceEnroll);
        if (recovered) {
          // Fell back to the system mic silently — still let the candidate
          // know their external device was removed, but don't block them;
          // the interview can keep going on the fallback device.
          setMicFallbackNotice(true);
          if (micFallbackNoticeTimerRef.current) clearTimeout(micFallbackNoticeTimerRef.current);
          micFallbackNoticeTimerRef.current = setTimeout(() => setMicFallbackNotice(false), 5000);
        } else {
          setMicDisconnectedPopup(true);
        }
      } finally {
        handling = false;
      }
    };
    track.addEventListener('ended', handleDisconnect);
    // Backstop poll — some drivers/OSes don't fire `ended` promptly on unplug.
    // Requires 2 CONSECUTIVE non-live ticks (~2s) before acting, not 1 — a
    // driver still settling right after a reconnect/switch can report a
    // transient non-live blip for a single tick, which was flipping the
    // check to fail immediately after it had just recovered ("Retry keeps
    // appearing again and again"). The 'ended' event above stays instant —
    // it's a reliable signal for a real unplug, unlike this poll.
    let missedTicks = 0;
    const poll = setInterval(() => {
      if (track.readyState !== 'live') {
        missedTicks += 1;
        if (missedTicks >= 2) void handleDisconnect();
      } else {
        missedTicks = 0;
      }
    }, 1000);

    return () => {
      track.removeEventListener('ended', handleDisconnect);
      clearInterval(poll);
    };
    // selectedMicId (not just micCheckStatus) is a dependency because a
    // successful "laptop" silent fallback switch keeps the check at 'pass'
    // the whole time — status never changes — so without also re-running on
    // selectedMicId, this effect would keep polling the OLD, now-dead track
    // forever instead of picking up the newly-active fallback device's track.
  }, [phase, micCheckStatus, selectedMicId, updateSystemCheck, tryMicFallbackOrFail]);

  // While the reconnect popup is showing, try to recover automatically the
  // moment the OS reports a device change (headset plugged back in) — no
  // button for the candidate to click, matching how the in-interview
  // headset-disconnect pause also auto-resumes on reconnect. Uses
  // ensureAudioAnalyser directly (not the full runMicrophone) so a still-
  // disconnected retry fails silently instead of flashing "checking..." /
  // "access denied" over the reconnect message every couple of seconds.
  useEffect(() => {
    if (!micDisconnectedPopup) return;
    const tryRecover = async () => {
      const analyser = await ensureAudioAnalyser();
      if (!analyser || !selectedMicIdRef.current) return; // still gone — stay quiet
      updateSystemCheck('microphone', { status: 'pass', detail: 'Microphone active' });
      void refreshDeviceLists();
    };
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', tryRecover);
    }
    // Also poll — devicechange doesn't fire in every browser/driver combo.
    const poll = setInterval(tryRecover, 2000);
    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', tryRecover);
      }
      clearInterval(poll);
    };
  }, [micDisconnectedPopup, ensureAudioAnalyser, updateSystemCheck, refreshDeviceLists]);

  // Clear the popup the moment the check is passing again (auto-recovery
  // above, or the candidate manually re-selecting a device from the dropdown).
  useEffect(() => {
    if (micCheckStatus === 'pass' && micDisconnectedPopup) setMicDisconnectedPopup(false);
  }, [micCheckStatus, micDisconnectedPopup]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopActiveChecks();
      if (micFallbackNoticeTimerRef.current) clearTimeout(micFallbackNoticeTimerRef.current);
    };
  }, [stopActiveChecks]);

  // Record system check results when all passed
  const allSystemPassed = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass');
  const allSystemDone = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass' || c.status === 'fail');
  const isAnyChecking = systemChecks.some((c) => c.status === 'checking' || c.status === 'pending');
  // The mic must be accessible before the candidate can record their voice.
  const micReadyForVoice = systemChecks.some((c) => c.id === 'microphone' && c.status === 'pass');
  // Voice Verification is a REQUIRED sub-step (when enabled): Continue is blocked
  // until a valid, non-silent voice sample has been captured.
  const voiceGateOk = !onEnrollVoice || voiceEnrollStatus === 'success';

  const handleProceed = useCallback(async () => {
    if (isProceedLoading) return;
    setIsProceedLoading(true);

    const checkStatus = (id: string) =>
      systemChecks.find((c) => c.id === id)?.status === 'pass' ? 'pass' : 'fail';

    // Stop face detection intervals before face registration — concurrent face-api.js /
    // TF.js calls corrupt the WebGL backend (tensor.backend becomes undefined).
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }

    // Wait for any in-flight face-api.js / TF.js WebGL call to finish before
    // calling onRegisterFace. clearInterval does NOT cancel an already-executing
    // async callback — the detectAllFaces call may still be running and will
    // corrupt the WebGL backend if onRegisterFace starts concurrently.
    const deadline = Date.now() + 3000; // max 3s wait
    while (faceApiBusyRef.current && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }

    // ── FINAL multi-face gate ──────────────────────────────────────────────
    // The live face poll runs every ~2.5 s and was cleared just above, so an
    // extra person who steps back into frame in that gap (right before clicking
    // Continue) could otherwise slip through on a stale "passed" status. Do ONE
    // fresh, synchronous detection NOW and block the proceed if >1 face is
    // present. Fail-open on a detector error (the live checks already validated).
    try {
      const _vid = videoRef.current;
      if (_vid && _vid.readyState >= 2 && _vid.videoWidth > 0) {
        faceApiBusyRef.current = true;
        let _faces = -1;
        if (typeof window !== 'undefined' && 'FaceDetector' in window) {
          try {
            const _det = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
            _faces = (await _det.detect(_vid)).length;
          } catch { _faces = -1; }
        }
        if (_faces < 0) {
          try {
            const faceapi = await loadFaceApiWithCpuBackend();
            if (!faceapi.nets.tinyFaceDetector.isLoaded) {
              await faceapi.nets.tinyFaceDetector.loadFromUri('/models/');
            }
            const _opts = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });
            _faces = (await faceapi.detectAllFaces(_vid, _opts)).length;
          } catch { _faces = -1; }
        }
        faceApiBusyRef.current = false;
        if (_faces > 1) {
          updateSystemCheck('multiple', { status: 'fail', detail: `${_faces} people detected — ensure you are alone before continuing` });
          setIsProceedLoading(false);
          runFaceMultiple();  // restart the live poll so they can fix it and retry
          return;
        }
      }
    } catch {
      faceApiBusyRef.current = false;
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

        // 3. Voice enrollment already completed as a REQUIRED sub-step before
        //    Continue was enabled (see the Voice Verification panel + voiceGateOk
        //    gate). Just await the resolved capture; never start a fresh one here.
        (voiceEnrollPromiseRef.current ?? Promise.resolve(true)),
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
  }, [token, systemChecks, onAllPassed, isProceedLoading, onRegisterFace, onEnrollVoice, runFaceMultiple, updateSystemCheck]);

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
          <div className="bg-gray-900 px-6 py-5 rounded-t-xl flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
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
            {/* Top-right action — only the initial "Run Check". After the run,
                any FAILED check is retried individually from its own row (below),
                and a fully-passed run shows the bottom Continue button. */}
            {!checksRunning && !checksCompleted && (
              <>
                {/* Attention-grabbing keyframes: a gentle scale "breathe" plus an
                    expanding ring ripple so the candidate can't miss the button. */}
                <style>{`
                  @keyframes tfRunCheckPulse {
                    0%, 100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(251,191,36,0.75); }
                    50%      { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(251,191,36,0); }
                  }
                `}</style>
                <button
                  type="button"
                  onClick={handleRunChecks}
                  style={{ animation: 'tfRunCheckPulse 1.2s ease-in-out infinite' }}
                  className="flex-shrink-0 inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold py-2.5 px-5 rounded-lg text-sm ring-2 ring-white/80 shadow-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Run Check
                </button>
              </>
            )}
          </div>

          {/* Card body: 2-column layout */}
          <div className="bg-white rounded-b-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: Camera Preview + Device Settings */}
              <div className="space-y-4">
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

                {/* Device Settings — lets the candidate pick whichever connected
                    camera/microphone is actually compatible, instead of being
                    stuck with whatever the OS treats as default. */}
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Device Settings</h3>
                    {isSwitchingDevice && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                  </div>

                  <div>
                    <label htmlFor="tf-camera-select" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                      <Camera className="w-3.5 h-3.5" /> Camera
                    </label>
                    <select
                      id="tf-camera-select"
                      value={selectedCameraId}
                      onChange={(e) => switchCamera(e.target.value)}
                      disabled={isSwitchingDevice || checksRunning}
                      className="w-full text-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    >
                      <option value="">System Default</option>
                      {cameraDevices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="tf-mic-select" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                      <Mic className="w-3.5 h-3.5" /> Microphone
                      <span className="text-red-500 font-semibold">*</span>
                    </label>
                    <select
                      id="tf-mic-select"
                      value={selectedMicId}
                      onChange={(e) => switchMicrophone(e.target.value)}
                      disabled={isSwitchingDevice || checksRunning}
                      className="w-full text-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    >
                      <option value="" disabled>Select your microphone…</option>
                      {micDevices.map((d, i) => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                      ))}
                    </select>
                    {/* The Microphone check in the list on the right cannot pass
                        until an explicit device is chosen here — "System Default"
                        does not count, so this option is disabled and the placeholder
                        stays selected until the candidate actively picks one. */}
                    {!selectedMicId && (
                      <p className="mt-1 text-xs text-amber-600 font-medium">
                        Required — select your microphone to complete the Microphone check.
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-gray-400">
                    Not seeing the right device? Choose a different one above — we&apos;ll re-check it automatically.
                  </p>
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

                    {/* Middle: label + detail (hide the "Pending..." placeholder
                        until a check actually runs) */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{check.label}</p>
                      {check.detail && check.detail !== 'Pending...' && (
                        <p className="text-xs text-gray-500 truncate">{check.detail}</p>
                      )}
                    </div>

                    {/* Right: status icon + per-check retry (only that row re-runs) */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {check.status === 'pass' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {check.status === 'fail' && (
                        <>
                          <XCircle className="w-5 h-5 text-red-500" />
                          <button
                            type="button"
                            onClick={() => retryCheck(check.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-md px-2 py-1 transition-colors"
                            title={`Retry ${check.label}`}
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </button>
                        </>
                      )}
                      {check.status === 'checking' && (
                        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status banners — shown ABOVE the Voice Verification panel so the
                overall system-check result reads first, then the (separate)
                voice enrollment step. */}
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
                      ? 'Camera access is required for the interview. Allow camera access in your browser settings, then click Retry on that check.'
                      : systemChecks.find((c) => c.id === 'microphone' && c.status === 'fail')
                      ? (!selectedMicId
                          ? 'Select your microphone from the Device Settings panel below to complete this check.'
                          : 'Click Retry on the Microphone check below to verify your selected device.')
                      : 'Fix the issues above and click Retry on each failed check to re-run just that one.'}
                  </p>
                </div>
              </div>
            )}

            {/* Voice Verification — visible read-aloud enrollment panel.
                Shown whenever voice enrollment is available (onEnrollVoice set). */}
            {onEnrollVoice && (
              <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Mic className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">Voice Verification</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        voiceEnrollStatus === 'success'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {voiceEnrollStatus === 'success' ? 'Done' : 'Required'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Click record and speak for a few seconds — this captures your voice so we can confirm it&apos;s you throughout the interview.
                    </p>
                  </div>
                </div>

                {/* A suggested line — NOT required. The candidate can say anything;
                    we only need to hear their voice (no word-matching). */}
                <div className="rounded-lg border border-indigo-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-500 mb-1">
                    Just speak naturally — say anything, or read this
                  </p>
                  <p className="text-base font-medium text-gray-900 leading-snug">
                    &ldquo;{ENROLL_PASSAGE}&rdquo;
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    You don&apos;t have to read this exactly — we only check that you spoke.
                  </p>
                </div>

                {/* Status area + manual record control */}
                <div className="mt-3">
                  {/* IDLE — must click to record */}
                  {voiceEnrollStatus === 'idle' && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-gray-500">
                        {micReadyForVoice
                          ? 'Click record, then speak for a few seconds.'
                          : 'Complete the microphone check first, then record your voice.'}
                      </p>
                      <button
                        type="button"
                        onClick={startVoiceEnroll}
                        disabled={!micReadyForVoice}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors ${
                          micReadyForVoice
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Start recording
                      </button>
                    </div>
                  )}

                  {/* RECORDING — live progress */}
                  {voiceEnrollStatus === 'recording' && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-indigo-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Recording — keep speaking…
                      </p>
                      <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-200 ease-linear"
                          style={{ width: `${voiceEnrollProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* SUCCESS */}
                  {voiceEnrollStatus === 'success' && (
                    <p className="text-xs font-medium text-green-700 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Voice sample captured — you&apos;re all set.
                    </p>
                  )}

                  {/* FAILED — now only the "no speech" case: the server/VAD
                      rejects a silent or noise-only clip. No word-matching. */}
                  {voiceEnrollStatus === 'failed' && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        We didn&apos;t hear any speech. Please speak clearly for a few seconds, then record again.
                      </p>
                      <button
                        type="button"
                        onClick={retryVoiceEnroll}
                        disabled={!micReadyForVoice}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors flex-shrink-0 ${
                          micReadyForVoice
                            ? 'text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Record again
                      </button>
                    </div>
                  )}

                  {/* DISCONNECTED — the mic died partway through the read-aloud
                      capture (see MicDisconnectedDuringRecordingError). The
                      partial audio was already discarded, so this is NOT a
                      pause: the only way forward is a brand-new capture from
                      0:00. Two sub-states:
                        • mic still gone  → "No microphone detected", button
                          disabled so the candidate can't restart onto a dead
                          device (micReadyForVoice tracks the Microphone check,
                          which the reconnect watcher flips back to 'pass' by
                          itself the moment a device is live again).
                        • mic reconnected → button enabled, wording makes it
                          explicit that this starts over rather than resumes. */}
                  {voiceEnrollStatus === 'disconnected' && (
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-xs font-medium flex items-center gap-1.5 ${
                        micReadyForVoice ? 'text-amber-700' : 'text-red-700'
                      }`}>
                        <MicOff className={`w-4 h-4 flex-shrink-0 ${
                          micReadyForVoice ? 'text-amber-600' : 'text-red-600'
                        }`} />
                        {micReadyForVoice
                          ? 'Microphone reconnected. Your earlier recording was discarded — start the voice verification again from the beginning.'
                          : 'No microphone detected. Please connect a microphone.'}
                      </p>
                      <button
                        type="button"
                        onClick={retryVoiceEnroll}
                        disabled={!micReadyForVoice}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors flex-shrink-0 ${
                          micReadyForVoice
                            ? 'text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Start over
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hidden canvas for frame analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Action buttons — Run Check / Retry now live in the header's
                top-right corner (see the gradient header above). The bottom
                row is reserved for the running indicator and the Continue
                button so the primary trigger is always visible at the same
                spot regardless of state. */}
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              {/* Running indicator */}
              {checksRunning && (
                <div className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-500 font-semibold py-3 px-6 rounded-lg text-sm cursor-not-allowed">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running checks…
                </div>
              )}

              {/* Proceed — enabled only when all checks passed. Environment scan removed. */}
              {checksCompleted && (
                <button
                  type="button"
                  onClick={() => { if (allSystemPassed && voiceGateOk && !isProceedLoading && !micDisconnectedPopup) handleProceed(); }}
                  disabled={!allSystemPassed || !voiceGateOk || isProceedLoading || micDisconnectedPopup}
                  title={micDisconnectedPopup ? 'Please reconnect your microphone to continue' : !voiceGateOk ? 'Record your voice sample first' : undefined}
                  className={`flex-1 inline-flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-lg text-sm transition-all ${
                    allSystemPassed && voiceGateOk && !isProceedLoading && !micDisconnectedPopup
                      ? 'bg-gray-900 text-white hover:bg-gray-800 cursor-pointer'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isProceedLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Finishing…</>
                  ) : micDisconnectedPopup ? (
                    <>Please reconnect your microphone</>
                  ) : !voiceGateOk ? (
                    <>Record your voice to continue</>
                  ) : (
                    <>Continue <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Headset/microphone disconnected popup — appears the instant a
            PREVIOUSLY-PASSING microphone check goes dead (see the track
            'ended' + poll effect above). Continue is disabled via its own
            `disabled` attribute (not by this overlay blocking clicks) —
            deliberately NOT a full-screen click-blocking modal, so the
            Device Settings dropdown underneath stays reachable in case the
            candidate needs to pick a DIFFERENT microphone (new deviceId)
            rather than the original one reconnecting. Auto-dismisses the
            moment the device is back — no button to click here. */}
        {micDisconnectedPopup && (
          <div className="fixed top-4 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none">
            <div className="w-full max-w-md bg-white border border-red-300 rounded-2xl shadow-2xl p-5 flex items-start gap-3 pointer-events-auto">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 flex-shrink-0">
                <MicOff className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-gray-900 font-semibold text-sm mb-0.5">No microphone detected.</h3>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Please connect a microphone. This is detected automatically — if it&apos;s a
                  different device, you can also select it from Device Settings below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* External-mic-removed notice — a system/built-in mic was still
            available, so tryMicFallbackOrFail already switched to it
            silently and the check stayed 'pass'. This is purely informational
            (the candidate can keep going on the fallback device), so unlike
            the popup above it never blocks Continue and dismisses itself. */}
        {micFallbackNotice && (
          <div className="fixed top-4 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none">
            <div className="w-full max-w-md bg-white border border-amber-300 rounded-2xl shadow-2xl p-5 flex items-start gap-3 pointer-events-auto">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 flex-shrink-0">
                <MicOff className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-gray-900 font-semibold text-sm mb-0.5">Your device removed</h3>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Your microphone device was removed — switched to your system&apos;s default
                  microphone automatically. You can keep going.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
