'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';
import { loadFaceApiWithCpuBackend } from '@/lib/face-api-loader';
import { createVideoFrameCanvas, filterMultipleFaceCandidates, type FaceRegion } from '@/lib/proctoring/faceDetection';
import { createMediaPipeFaceCounter, type MediaPipeFaceCounter } from '@/lib/proctoring/mediapipeFaceCounter';
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
  Play,
  Pause,
  RefreshCw,
  Settings,
  MicOff,
  Maximize2,
  AppWindow,
  Check,
  Shield,
  Info,
} from 'lucide-react';
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';
import { prefetchObjectDetectionModel } from '@/components/ai-interview/proctoring/InterviewObjectDetection';
import { checkVirtualCamera, isVirtualCameraLabel, INVALID_CAMERA_SELECTION_MESSAGE } from '@/lib/proctoring/virtualCameraDetection';
import { canOpenDevice, enumerateAudioInputIds, saveVerifiedAudioInputs, currentAudioInputId } from '@/lib/utils/mediaDeviceProbe';
import { Button } from '@/components/ui/button';
import FadePresence from '@/components/ui/fade-presence';
import { revealAfterPaint, revealIfHidden } from '@/lib/utils/candidateScroll';
import SubStepProgress from './SubStepProgress';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface StepSystemCheckProps {
  token: string;
  position?: string;
  /** approvedCameraDeviceId is the resolved deviceId of the camera that
   * passed the webcam check (null if none — shouldn't happen once Continue
   * is enabled, but kept nullable defensively). */
  // Both APPROVED devices are handed upward so the interview can PIN them.
  // The mic used to be omitted, so the candidate's Device Settings choice died
  // here and the interview silently opened the OS default instead — on Windows
  // usually a freshly-plugged headset, i.e. NOT the mic they selected.
  onAllPassed: (approvedCameraDeviceId: string | null, approvedMicDeviceId: string | null) => void;
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
  onEnrollVoice?: (
    stream: MediaStream,
    /** The capture finished and the sample is being checked (upload + server
     *  voiceprint), or a fallback capture started again. Lets the panel stop
     *  saying "keep speaking" while nothing is being recorded. */
    onPhase?: (phase: 'recording' | 'verifying') => void,
  ) => Promise<boolean>;
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

function detectBrowserEngine(ua: string): BrowserInfo {
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

/**
 * Chromium and WebKit browsers that would otherwise read as Chrome, Edge or
 * Safari: [display name, UA token, userAgentData brand]. The token is the
 * version source; the brand catches builds that leave the token out.
 */
const RELABELLED_BROWSERS: [name: string, token: RegExp, brand: RegExp][] = [
  ['Opera', /OPR\/([\d.]+)/, /^Opera/i],
  ['Vivaldi', /Vivaldi\/([\d.]+)/, /^Vivaldi/i],
  ['DuckDuckGo', /(?:DuckDuckGo|Ddg)\/([\d.]+)/, /^DuckDuckGo/i],
];

/**
 * detectBrowserEngine, then a display-only pass: Opera, Vivaldi and
 * DuckDuckGo get their own name and version so the Detected Browser row can
 * show their logo. `supported` and `majorVersion` are left as the engine check
 * set them, so who can continue is exactly what it was before.
 */
function detectBrowser(ua: string): BrowserInfo {
  const info = detectBrowserEngine(ua);
  if (info.name === 'Brave' || info.name === 'Firefox') return info;
  const brands: { brand: string }[] =
    (typeof navigator !== 'undefined' && (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands) || [];
  for (const [name, token, brand] of RELABELLED_BROWSERS) {
    const match = ua.match(token);
    if (match || brands.some((b) => brand.test(b.brand))) {
      return { ...info, name, version: match?.[1] ?? info.version };
    }
  }
  return info;
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

// Real browser logo marks, supplied as assets (lucide-react has no brand
// icon set to draw the actual Chrome/Edge/Safari logos).
const BROWSER_LOGOS: Record<string, string> = {
  Chrome: '/logos/browsers/chrome.png',
  Edge: '/logos/browsers/edge.png',
  Safari: '/logos/browsers/safari.png',
  // Detected-browser row only; not in SUPPORTED_BROWSERS.
  Firefox: '/logos/browsers/firefox.png',
  Brave: '/logos/browsers/brave.png',
  Opera: '/logos/browsers/opera.png',
  Vivaldi: '/logos/browsers/vivaldi.png',
  DuckDuckGo: '/logos/browsers/duckduckgo.png',
};

/** Icons for the Device Type card's rows. */
const SYSTEM_ICONS = {
  device: '/logos/system/device.png',
  resolution: '/logos/system/resolution.png',
};

/** OS logo for the detected platform, or null to fall back to a generic icon.
 *  Matches loosely since userAgentData and navigator.platform word it differently. */
function osLogo(os: string): string | null {
  if (/win/i.test(os)) return '/logos/system/windows.png';
  if (/mac|darwin/i.test(os)) return '/logos/system/macos.png';
  if (/linux|ubuntu|debian|fedora/i.test(os) && !/android/i.test(os)) return '/logos/system/linux.png';
  return null;
}

const MIN_INTERNET_MBPS = 1.0;
// Face baseline registration loads face-api models on first use and may need
// a few seconds on a cold browser cache. 3s was too short and let the UI move
// to practice while registration was still running in the background.
const FACE_REGISTRATION_TIMEOUT_MS = 8000;

// ── Face-detection cost controls ────────────────────────────────────────────
// Windows Chrome has no native FaceDetector (the Shape Detection API only ships
// on macOS / ChromeOS / Android), so effectively every candidate falls back to
// face-api.js on the tf.js CPU backend — see lib/face-api-loader.ts for why the
// backend is pinned to CPU. That runs on the main thread, so at the library's
// default 416px input on a 4-core laptop it is roughly a second of blocking
// work per tick: the screen froze and Continue silently missed clicks.
// 224px on a 320px-wide frame is ~3-4x cheaper and still detects a face that
// fills a webcam frame, which is the only thing this screen asks.
const FACE_DETECT_INPUT_SIZE = 224;
const FACE_DETECT_FRAME_WIDTH = 320;
// The poll re-arms AFTER each detection returns rather than on a fixed
// interval, backing off to a multiple of the last inference — a slow machine
// gets idle main-thread time instead of a backlog of queued ticks.
const FACE_POLL_MIN_MS = 2500;
const FACE_POLL_MAX_MS = 8000;
const FACE_POLL_BUSY_FACTOR = 3;
// A single missed frame is not a failure — the detector blinks, especially at
// the reduced input size. Only this many CONSECUTIVE bad ticks may flip a row
// (and with it, disable Continue). Same rule the microphone-disconnect poll
// further down already uses, and for the same reason.
const FACE_MISS_STREAK = 2;

/** Filled round status mark: green tick when met, red cross when not. */
function StatusDot({ ok, size = 'sm' }: { ok: boolean; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'w-12 h-12' : 'w-7 h-7';
  const glyph = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
  return (
    <span className={`${box} rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-success' : 'bg-destructive'}`}>
      {ok
        ? <Check className={`${glyph} text-white`} strokeWidth={3} />
        : <XCircle className={`${glyph} text-white`} />}
    </span>
  );
}


// ────────────────────────────────────────
// Progress Stepper Component
// ────────────────────────────────────────
const STEPPER_STEPS = ['Device Check', 'System Checks'];

function getStepIndex(phase: Phase): number {
  if (phase === 'browser_check' || phase === 'browser_results') return 0;
  if (phase === 'system_checks') return 1;
  return 0;
}

/** Browser Check → System Checks — the shared in-step progress card, first
 *  on every sub-page so it stays put while the content below swaps. */
function ProgressStepper({ phase }: { phase: Phase }) {
  return <SubStepProgress steps={STEPPER_STEPS} activeIndex={getStepIndex(phase)} />;
}

// ── System Checks screen pieces ──────────────────────────────────────────────

/** Smooth scrolling unless the user asked the OS for reduced motion. */
const scrollBehavior = (): ScrollBehavior =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** Length of the voice-enrollment capture — drives the progress bar and the
 *  record bar's "00:05 / 00:12" clock. */
const VOICE_CAPTURE_SECONDS = 12;

/** Seconds the recording dot takes to fade in/out (see FadePresence below). */
const RECORDING_DOT_FADE_S = 0.3;

/** Bar heights (%) for the record bar's waveform-shaped progress meter. */
const VOICE_WAVE_BARS = [
  30, 55, 40, 75, 50, 90, 60, 35, 70, 45, 85, 55, 30, 65, 95, 50, 40, 80, 60, 35,
  70, 50, 90, 45, 30, 60, 80, 40, 55, 75, 35, 65, 50, 85, 45, 30,
];

/** One-line status under the record bar (errors / what to do next). */
function VoiceNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-brand-orange-deep flex items-start gap-1.5">
      <MicOff className="w-4 h-4 flex-shrink-0" />
      <span>{children}</span>
    </p>
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
    useState<'idle' | 'recording' | 'verifying' | 'success' | 'failed' | 'disconnected'>('idle');
  // Latches true the first time a voice sample succeeds. The environment
  // section (Device Settings, the checks, Continue) is unlocked by it, not by
  // the live status: a mic dropping after success flips the status to
  // 'disconnected', and hiding Device Settings then would take away the very
  // control the disconnect popup tells the candidate to use. Continue stays
  // gated on the live status (voiceGateOk). Set during render (React's
  // "adjust state when a value changes" pattern), not in an effect.
  const [voiceEverSucceeded, setVoiceEverSucceeded] = useState(false);
  if (voiceEnrollStatus === 'success' && !voiceEverSucceeded) setVoiceEverSucceeded(true);
  const [voiceEnrollProgress, setVoiceEnrollProgress] = useState(0); // 0..100
  // Local playback copy of the voice sample (object URL) — recorded in
  // parallel from the same mic track purely so the candidate can listen back;
  // the enrollment itself still goes through onEnrollVoice.
  const [voicePlaybackUrl, setVoicePlaybackUrl] = useState<string | null>(null);
  const voicePlaybackUrlRef = useRef<string | null>(null);
  const voicePlaybackAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  // Whether a live mic stream/analyser is up, acquired proactively (below)
  // instead of waiting for "Run Check" — Voice Verification must be
  // completable before Run Check is even enabled.
  const [micStreamReady, setMicStreamReady] = useState(false);
  // Set when startVoiceEnroll's on-demand mic-acquisition attempt fails
  // (permission denied/blocked, no device, etc.) — switches the idle panel
  // to an explicit error + Retry instead of the button silently doing
  // nothing on a second click.
  const [micAcquireFailed, setMicAcquireFailed] = useState(false);
  // Whether the Camera Preview <video> actually has live frames — the
  // "Camera Active" badge used to be hardcoded and shown regardless of
  // whether the preview was really playing, which lied to the candidate
  // whenever the camera failed to start (e.g. black preview, device busy in
  // another tab) while still claiming "Camera Active".
  const [cameraLive, setCameraLive] = useState(false);

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
  // The concrete deviceId of whichever camera most recently PASSED the
  // webcam check (see runWebcam) — carried forward to the interview so it
  // can pin to and monitor this exact device, not just "whatever the OS
  // calls default" (which selectedCameraIdRef alone can't express, since ''
  // means "system default" there).
  const approvedCameraDeviceIdRef = useRef<string | null>(null);
  // Shown next to the camera dropdown when the candidate attempts to select
  // (or programmatically bypasses the disabled state of) an unsupported
  // virtual/mobile-relay camera — see switchCamera.
  const [cameraSelectionError, setCameraSelectionError] = useState<string | null>(null);
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
  const faceIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever the face poll is stopped or restarted, so a tick that is
  // already in flight can't re-arm a timer for a poll nobody wants any more.
  const faceLoopGenRef = useRef(0);
  // Consecutive-bad-tick counters behind FACE_MISS_STREAK.
  const noFaceStreakRef = useRef(0);
  const multiFaceStreakRef = useRef(0);
  // Second opinion for the Multiple People row: the in-interview MediaPipe
  // model. The poll's own detector runs small (224 px on a 320 px frame) for
  // CPU reasons and misses smaller / partly covered second faces.
  const faceCounterRef = useRef<MediaPipeFaceCounter | null>(null);
  const countPeopleWithMediaPipe = (video: HTMLVideoElement): Promise<number | null> => {
    if (!faceCounterRef.current) faceCounterRef.current = createMediaPipeFaceCounter();
    return faceCounterRef.current.count(video);
  };
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

  // The parent portal scrolls to top on STEP transitions (entering this
  // component at all), but StepSystemCheck itself cycles through several
  // internal PHASES (browser_check → system_checks → ...) via setPhase
  // without ever unmounting/remounting — so a mount-only effect here would
  // fire once for 'browser_check' and never again. Depending on `phase`
  // instead re-fires on every internal phase change too, e.g. the "Continue"
  // click on Browser Check that reveals System Checks (and, above it, the
  // Voice Verification card) — otherwise the browser can keep whatever
  // scroll position Browser Check was left at and land mid-page.
  //
  // System Checks goes one step further and brings its own "System Checks"
  // card heading into view, and a freshly recorded voice sample moves the
  // candidate on to the camera row (the next thing to set up).
  const systemChecksCardRef = useRef<HTMLElement>(null);
  // The in-step progress card (Device Check → System Checks) on the loading
  // and results views: the page opens scrolled to it, just below the pinned
  // header + stepper.
  const deviceStepperRef = useRef<HTMLDivElement>(null);
  const cameraRowRef = useRef<HTMLDivElement>(null);
  // The checks grid: Run Check brings it into view when it isn't already.
  const checksListRef = useRef<HTMLDivElement>(null);
  // Further auto-scroll targets: the Continue row under the checks, the
  // Device Check "Continue to System Checks" button, the voice section and the
  // passage to read aloud.
  const checksFooterRef = useRef<HTMLDivElement>(null);
  const deviceContinueRef = useRef<HTMLDivElement>(null);
  const voiceSectionRef = useRef<HTMLDivElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Detection finishing swaps the loading view for the results view with
    // the heading in the same place: hold the position, no jump to the top.
    if (phase === 'browser_results') {
      deviceStepperRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (phase === 'browser_check') {
      deviceStepperRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
    if (phase === 'system_checks') {
      systemChecksCardRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }, [phase]);

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

  useEffect(() => { voiceEnrollStatusRef.current = voiceEnrollStatus; }, [voiceEnrollStatus]);

  // Capture the playback copy while a voice attempt records. The effect's
  // cleanup stops the recorder the moment the status leaves 'recording'; the
  // clip is only offered back once the attempt succeeded (see the record bar).
  useEffect(() => {
    if (voiceEnrollStatus !== 'recording') return;
    const tracks = streamRef.current?.getAudioTracks().filter((t) => t.readyState === 'live') ?? [];
    if (tracks.length === 0 || typeof MediaRecorder === 'undefined') return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(new MediaStream(tracks));
    } catch {
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!mountedRef.current || chunks.length === 0) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      if (voicePlaybackUrlRef.current) URL.revokeObjectURL(voicePlaybackUrlRef.current);
      voicePlaybackUrlRef.current = url;
      setVoicePlaybackUrl(url);
    };
    recorder.start();
    return () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
  }, [voiceEnrollStatus]);

  useEffect(() => () => {
    if (voicePlaybackUrlRef.current) URL.revokeObjectURL(voicePlaybackUrlRef.current);
  }, []);

  const toggleVoicePlayback = useCallback(() => {
    const audio = voicePlaybackAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.currentTime = 0;
      void audio.play().then(() => setVoicePlaying(true)).catch(() => setVoicePlaying(false));
    } else {
      audio.pause();
      setVoicePlaying(false);
    }
  }, []);

  // Wait out the recording dot's fade-out first: it unmounts at the end of it,
  // shortening the voice section, and a scroll taken before that lands too far
  // down, cutting off the checks' heading and Run Check.
  useEffect(() => {
    if (voiceEnrollStatus !== 'success') return;
    const t = setTimeout(() => {
      cameraRowRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }, RECORDING_DOT_FADE_S * 1000 + 50);
    return () => clearTimeout(t);
  }, [voiceEnrollStatus]);

  // No speech / mic dropped: bring the voice section (its notice and the
  // retry control) back into view — after the recording dot's fade-out, which
  // shortens the section. Recording start on a stacked layout (below lg):
  // keep the passage to read in view; the recorder sits right under it.
  useEffect(() => {
    if (voiceEnrollStatus === 'failed' || voiceEnrollStatus === 'disconnected') {
      const t = setTimeout(() => revealIfHidden(voiceSectionRef.current, 'start'), RECORDING_DOT_FADE_S * 1000 + 50);
      return () => clearTimeout(t);
    }
    if (voiceEnrollStatus === 'recording' && window.matchMedia('(max-width: 1023px)').matches) {
      revealAfterPaint(() => passageRef.current, 'start');
    }
  }, [voiceEnrollStatus]);

  // Drive the recording progress bar (~12 s capture) for visible feedback.
  useEffect(() => {
    if (voiceEnrollStatus !== 'recording') return;
    const started = performance.now();
    const CAPTURE_MS = VOICE_CAPTURE_SECONDS * 1000;
    const iv = setInterval(() => {
      const pct = Math.min(100, ((performance.now() - started) / CAPTURE_MS) * 100);
      setVoiceEnrollProgress(pct);
    }, 200);
    return () => clearInterval(iv);
  }, [voiceEnrollStatus]);

  // Cancels the face poll for good: clears the pending timer AND invalidates
  // any tick already running, which a bare clearTimeout cannot do (the tick
  // would finish and schedule the next one).
  const stopFacePoll = useCallback(() => {
    faceLoopGenRef.current += 1;
    if (faceIntervalRef.current) { clearTimeout(faceIntervalRef.current); faceIntervalRef.current = null; }
  }, []);

  const stopActiveChecks = useCallback(() => {
    checksCancelledRef.current = true;
    if (lightingIntervalRef.current) { clearInterval(lightingIntervalRef.current); lightingIntervalRef.current = null; }
    if (noiseIntervalRef.current) { clearInterval(noiseIntervalRef.current); noiseIntervalRef.current = null; }
    stopFacePoll();
    if (micIntervalRef.current) { clearInterval(micIntervalRef.current); micIntervalRef.current = null; }

    // Preserve the microphone if Voice Verification already succeeded on it.
    // This is called at the top of every "Run Check" run (to give Brave time
    // to release camera hardware from a prior run before re-acquiring it) —
    // but stopping the mic track here too would kill an already-good
    // voiceprint for no reason, which the disconnect watcher then treats as a
    // real disconnect and invalidates, forcing the candidate to redo Voice
    // Verification every single time Run Check runs. Only video needs the
    // stop-and-reacquire treatment; the mic can just stay live throughout.
    const keepMic = voiceEnrollStatusRef.current === 'success';
    if (!keepMic) {
      if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
      analyserRef.current = null;
    }
    if (streamRef.current) {
      const tracksToStop = keepMic ? streamRef.current.getVideoTracks() : streamRef.current.getTracks();
      tracksToStop.forEach((t) => t.stop());
      streamRef.current = keepMic ? new MediaStream(streamRef.current.getAudioTracks()) : null;
    }
  }, [stopFacePoll]);

  const INITIAL_CHECKS: SystemCheckItem[] = [
    { id: 'device', label: 'Device Type', detail: 'Pending...', icon: <Monitor className="w-4 h-4" />, status: 'pending', colorClass: 'text-gray-600' },
    { id: 'webcam', label: 'Webcam', detail: 'Pending...', icon: <Camera className="w-4 h-4" />, status: 'pending', colorClass: 'text-gray-600' },
    { id: 'microphone', label: 'Microphone', detail: 'Pending...', icon: <Mic className="w-4 h-4" />, status: 'pending', colorClass: 'text-brand-blue' },
    { id: 'internet', label: 'Internet Connection', detail: `Required: ≥ ${MIN_INTERNET_MBPS} Mbps`, icon: <Wifi className="w-4 h-4" />, status: 'pending', colorClass: 'text-cyan-600 dark:text-cyan-400' },
    { id: 'ai_engine', label: 'AI Engine', detail: 'Pending...', icon: <Zap className="w-4 h-4" />, status: 'pending', colorClass: 'text-purple-600 dark:text-purple-400' },
    { id: 'websocket', label: 'WebSocket Connection', detail: 'Pending...', icon: <Radio className="w-4 h-4" />, status: 'pending', colorClass: 'text-teal-600 dark:text-teal-400' },
    { id: 'lighting', label: 'Lighting Conditions', detail: 'Pending...', icon: <Sun className="w-4 h-4" />, status: 'pending', colorClass: 'text-warning' },
    { id: 'noise', label: 'Background Noise', detail: 'Pending...', icon: <Volume2 className="w-4 h-4" />, status: 'pending', colorClass: 'text-orange-600 dark:text-orange-400' },
    { id: 'face', label: 'Face Detection', detail: 'Pending...', icon: <Eye className="w-4 h-4" />, status: 'pending', colorClass: 'text-success' },
    { id: 'multiple', label: 'Multiple People Check', detail: 'Pending...', icon: <Users className="w-4 h-4" />, status: 'pending', colorClass: 'text-destructive' },
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
        : defaultCameraDeviceIdRef.current
        ? { deviceId: { exact: defaultCameraDeviceIdRef.current } }
        : true;
      const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });
      // Preserve any audio track ensureAudioAnalyser already put on
      // streamRef.current (e.g. Voice Verification's on-demand mic
      // acquisition resolving while this video call is still in flight)
      // instead of overwriting it outright — same combine pattern runWebcam
      // uses below. Overwriting would silently drop a live mic track and
      // Voice Verification would record from a video-only stream (captured
      // silence → "We didn't hear any speech").
      const existingAudioTracks = streamRef.current?.getAudioTracks() ?? [];
      const combined = new MediaStream([...s.getVideoTracks(), ...existingAudioTracks]);
      streamRef.current = combined;
      if (videoRef.current) videoRef.current.srcObject = combined;
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
      if (streamRef.current) {
        audioStream.getAudioTracks().forEach((t) => streamRef.current!.addTrack(t));
      } else {
        // No shared stream yet — e.g. the candidate clicked "Start recording"
        // before the camera preview's own getUserMedia call (fired on mount)
        // has resolved. Start streamRef.current with just the audio track so
        // it isn't silently dropped; ensureVideoStream merges its video
        // track into whatever's already here instead of overwriting it.
        streamRef.current = audioStream;
      }
      return analyser;
    } catch {
      return null;
    }
  }, []);

  // Kick off voice enrollment once, updating the visible panel state as it
  // runs. Called on the candidate's own click — "Start recording" or "Retry"
  // — so the microphone permission prompt (when this is the first-ever
  // request) is a direct, expected result of that click, not something that
  // fired unprompted in the background before they touched anything.
  //
  // Guarded by voiceEnrollAttemptIdRef: if the headset dies mid-recording, the
  // candidate can start a FRESH attempt (once the mic is live again) before
  // the old, now-aborted onEnrollVoice() promise has actually settled.
  // Without the id check, that stale promise resolving later would stomp the
  // new attempt's 'recording'/'success' state with its own leftover outcome.
  const startVoiceEnroll = useCallback(async () => {
    if (voiceEnrollPromiseRef.current || !onEnrollVoice) return;
    // With 2+ mics connected, the browser's own "default" pick is a guess —
    // the same rule runMicrophone already enforces for the Microphone check
    // itself (see its selectedMicIdRef gate). Recording against the wrong
    // device silently captures near-silence and fails every attempt with "We
    // didn't hear any speech," with nothing tying that back to the
    // unselected dropdown. The render guard below keeps "Start recording"
    // itself hidden in this case; this is the defense-in-depth backstop.
    if (micDevices.length > 1 && !selectedMicIdRef.current) return;
    const hasLiveAudio = streamRef.current?.getAudioTracks().some((t) => t.readyState === 'live');
    if (!hasLiveAudio) {
      setMicAcquireFailed(false);
      const analyser = await ensureAudioAnalyser();
      if (!analyser) {
        // getUserMedia rejected — permission denied/blocked, no device, or
        // hardware in use elsewhere. Surface this so the candidate has a
        // clear next step instead of the button just doing nothing.
        setMicAcquireFailed(true);
        return;
      }
      setMicStreamReady(true);
    }
    if (!streamRef.current) return; // shouldn't happen once analyser succeeded, but nothing to record from otherwise
    const attemptId = ++voiceEnrollAttemptIdRef.current;
    setVoiceEnrollStatus('recording');
    setVoiceEnrollProgress(0);
    voiceEnrollPromiseRef.current = onEnrollVoice(streamRef.current, (phase) => {
      // 12 s capture done → "Checking your voice sample…" while the sample is
      // uploaded and verified. Before, the status stayed 'recording' for that
      // whole wait, so the panel read "Recording — keep speaking… 00:12 / 00:12"
      // for seconds after recording had actually stopped.
      if (!mountedRef.current || voiceEnrollAttemptIdRef.current !== attemptId) return;
      if (phase === 'verifying') setVoiceEnrollProgress(100);
      setVoiceEnrollStatus(phase);
    })
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
  }, [onEnrollVoice, ensureAudioAnalyser, micDevices]);

  // Re-run voice enrollment (from the panel's Retry / Record-again button).
  const retryVoiceEnroll = useCallback(() => {
    voicePlaybackAudioRef.current?.pause();
    setVoicePlaying(false);
    voiceEnrollPromiseRef.current = null;
    setVoiceEnrollStatus('idle');
    setVoiceEnrollProgress(0);
    void startVoiceEnroll();
  }, [startVoiceEnroll]);

  // Chrome/Edge expose two synthetic aliases per physical audio device
  // ("default" and "communications", deviceId literally 'default'/'communications')
  // that just point at whichever real device is already listed — without this
  // filter the dropdown shows the same physical mic three times. Drop the
  // aliases and keep only the actual connected hardware; also de-dupe by
  // groupId in case a device is otherwise listed twice.
  const dedupeRealDevices = (devices: MediaDeviceInfo[]): MediaDeviceInfo[] => {
    const seenGroups = new Set<string>();
    const filtered = devices.filter((d) => {
      if (d.deviceId === 'default' || d.deviceId === 'communications') return false;
      if (d.groupId && seenGroups.has(d.groupId)) return false;
      if (d.groupId) seenGroups.add(d.groupId);
      return true;
    });
    // Before mic/camera permission is ever granted, some browsers expose
    // ONLY the 'default'/'communications' pseudo-entries — no separate
    // per-device entry at all yet — so filtering those out would leave the
    // dropdown completely empty even though a real device IS connected.
    // Fall back to the raw (un-deduped) list in that case so there's always
    // something to select; once permission is granted (first "Run Check"),
    // enumerateDevices() reveals the real per-device entries and normal
    // dedup applies again on the next refresh.
    return filtered.length > 0 ? filtered : devices;
  };

  // Camera dropdown labels. The MediaDevices API never exposes a device's
  // transport (USB vs built-in) and — unlike audio — Chrome does NOT create a
  // synthetic 'default' pseudo-entry for video input devices, so there is no
  // groupId to match against. USB is instead detected from the OS/driver-
  // reported name itself — USB webcam drivers virtually always put "USB" in
  // the label (e.g. "USB2.0 HD UVC WebCam", "Logitech USB Webcam"), while
  // built-in cameras don't (e.g. "HP TrueVision HD Camera", "Integrated
  // Webcam"). Any camera whose label doesn't look like a USB device is
  // treated as the system/built-in default.
  const isUsbCameraLabel = (label: string): boolean => /usb/i.test(label);
  const getCameraDeviceLabel = (d: MediaDeviceInfo, i: number): string => {
    const base = d.label || `Camera ${i + 1}`;
    if (isVirtualCameraLabel(base)) return `${base} (Unsupported)`;
    return isUsbCameraLabel(base) ? `${base} USB Camera` : `${base} System Default`;
  };
  // Whichever listed camera doesn't look like a USB device (and isn't a
  // known virtual/mobile-relay driver — a virtual camera must NEVER be the
  // implicit "System Default" row, or picking that row would silently
  // activate it) is treated as THE system default and rendered with
  // value="" (no deviceId constraint — same as the old placeholder option)
  // instead of its own deviceId, so it gets exactly one dropdown row rather
  // than a separate "System Default" row on top of its own named row. Falls
  // back to any non-virtual device, then to null (renders no value="" row —
  // e.g. every enumerated camera is virtual, so none should be implicit).
  const defaultCameraDevice: MediaDeviceInfo | null =
    cameraDevices.find((d) => !isUsbCameraLabel(d.label || '') && !isVirtualCameraLabel(d.label || ''))
    || cameraDevices.find((d) => !isVirtualCameraLabel(d.label || ''))
    || null;
  // Mirrors defaultCameraDevice's id for getUserMedia calls inside
  // useCallback closures (ensureVideoStream/runWebcam) below — those have
  // narrow dependency arrays, so reading the derived value directly would
  // see a stale ("no devices yet") snapshot. Used to explicitly constrain
  // those calls instead of leaving them unconstrained (`video: true`): an
  // unconstrained request lets the OS/browser pick ANY registered camera as
  // its own "default," which a virtual-camera driver like DroidCam can win
  // even while this dropdown is showing a real camera as selected.
  const defaultCameraDeviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    defaultCameraDeviceIdRef.current = defaultCameraDevice?.deviceId || null;
  }, [defaultCameraDevice]);

  // Populate the dropdown option lists. Labels are only populated by the
  // browser once camera/mic permission has been granted, so this is called
  // again after each successful webcam/microphone check.
  const refreshDeviceLists = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = dedupeRealDevices(devices.filter((d) => d.kind === 'videoinput'));
      const mics = dedupeRealDevices(devices.filter((d) => d.kind === 'audioinput'));
      setCameraDevices(cameras);
      setMicDevices(mics);
      return { cameras, mics };
    } catch {
      /* enumeration unsupported or blocked — dropdowns just stay empty */
      return { cameras: [] as MediaDeviceInfo[], mics: [] as MediaDeviceInfo[] };
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
  //   - Alternate found  → switch to it silently; check reports 'pass' only
  //                        when this run WAS the explicit check (see
  //                        `viaExplicitCheck` below) — otherwise the row is
  //                        left for Run Check/Retry to confirm, same as every
  //                        other silent device change (no popup either way).
  //   - None found       → fail the check and show the reconnect popup.
  // NOTE: this never sets micDisconnectedPopup itself — only the live watch
  // effect below does that (see its handleDisconnect), because it's the only
  // caller that KNOWS this is a genuine regression (the mic was passing and
  // just died). This function is also called from runMicrophone's plain
  // failure path — used by the very first "Run Check" and a manual Retry
  // click, where reporting 'pass' is correct because Run Check/Retry IS what
  // the candidate just clicked. If this set the popup on every failure, a
  // background retry attempt alone could pop the reconnect modal before
  // checks even ran once.
  //
  // `allowFallback: false` disables the silent switch entirely and forces the
  // plain-failure path. Used when the mic dies mid voice-verification: the
  // voiceprint must be enrolled on the device the candidate actually selected,
  // so quietly re-pointing them at the laptop's built-in mic and carrying on
  // would enroll the WRONG device. That case has to surface as a real "no
  // microphone" stop, exactly like a machine with no fallback at all.
  //
  // `viaExplicitCheck` marks that THIS call is itself running as part of an
  // explicit "Run Check" / "Retry" click (i.e. called from runMicrophone).
  // Only then may a successful fallback report 'pass' — mirroring the rule
  // markAudioChecksUnverified documents for every other audio check: no check
  // may pass as a side effect of a device merely being plugged in. The other
  // caller, the live-disconnect watcher, runs completely in the background
  // (no candidate action) and must not silently claim a pass on its behalf.
  const tryMicFallbackOrFail = useCallback(async (
    deadDeviceId: string,
    allowFallback = true,
    viaExplicitCheck = false,
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
        setMicStreamReady(true);
        if (viaExplicitCheck) {
          updateSystemCheck('microphone', {
            status: 'pass',
            detail: 'Microphone active — switched to built-in microphone after headset disconnected',
          });
        } else if (checksCompleted) {
          updateSystemCheck('microphone', { status: 'fail', detail: 'Click Retry to verify this microphone' });
        }
        // else: Run Check hasn't completed a first pass yet — leave the row at
        // its current 'pending' state, same as markAudioChecksUnverified does
        // before the first run.
        void refreshDeviceLists();
        return true;
      }
      // The "fallback" device turned out to be unreachable too (rare) — fall
      // through to the plain failure below.
    }

    setMicStreamReady(false);
    // Same rule as the recovered branch above: only an explicit Run
    // Check/Retry click (viaExplicitCheck) or a regression AFTER the first
    // full pass (checksCompleted) may write to the System Checks row. A
    // disconnect caught by the background live-track watcher before Run
    // Check has ever completed must not — the row stays at its current
    // 'pending' state; the Voice Verification panel above is what tells the
    // candidate their mic died, not this checklist.
    if (viaExplicitCheck || checksCompleted) {
      updateSystemCheck('microphone', {
        status: 'fail',
        detail: 'No microphone detected — please connect a microphone',
      });
    }
    return false;
  }, [ensureAudioAnalyser, updateSystemCheck, refreshDeviceLists, checksCompleted]);

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
        : defaultCameraDeviceIdRef.current
        ? { deviceId: { exact: defaultCameraDeviceIdRef.current } }
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
        console.warn(`[SystemCheck] Rejected virtual/unsupported camera: "${camCheck.label}"`);
        updateSystemCheck('webcam', { status: 'fail', detail: INVALID_CAMERA_SELECTION_MESSAGE });
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
      // Capture the resolved device id of whichever camera just PASSED (not
      // just selectedCameraIdRef — that can be '' meaning "system default",
      // and we need the concrete id to carry forward into the interview).
      if (videoOk) {
        approvedCameraDeviceIdRef.current = videoStream.getVideoTracks()[0]?.getSettings?.().deviceId || null;
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
    // Awaited (not fire-and-forget): the auto-select-when-there's-only-one-mic
    // effect further down reacts to the `micDevices` STATE, which can't land
    // until a render after this function returns — too late for the gate
    // check a few lines below. Resolving it here, against the list this call
    // just fetched, is what lets a single-microphone machine pass on the
    // very first "Run Check" instead of failing once and self-correcting
    // only on Retry.
    const { mics } = await refreshDeviceLists();
    if (!analyser) {
      // A specific device was already selected (this check likely passed
      // before) but is no longer reachable — that's a disconnect, not a
      // permission denial. Try a fallback device (built-in mic) before
      // failing, and keep the reconnect messaging/popup consistent regardless
      // of WHICH path discovered it: the live track-ended watcher, a manual
      // "Retry" click, or the initial "Run Check" running mid-outage.
      if (selectedMicIdRef.current) {
        // true, true: allow the silent device fallback AND report 'pass' if it
        // works — legitimate here because runMicrophone only ever runs as part
        // of an explicit "Run Check" or "Retry" click (see call sites below).
        await tryMicFallbackOrFail(selectedMicIdRef.current, true, true);
      } else {
        setMicStreamReady(false);
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
    if (!selectedMicIdRef.current && mics.length === 1) {
      selectedMicIdRef.current = mics[0].deviceId;
      setSelectedMicId(mics[0].deviceId);
    }
    if (!selectedMicIdRef.current) {
      updateSystemCheck('microphone', {
        status: 'fail',
        detail: 'Select your microphone in Device Settings below to complete this check',
      });
      return;
    }
    // Keep micStreamReady in sync: Run Check can reach this point after
    // stopActiveChecks() (called at the top of handleRunChecks) released the
    // PRIOR track — which the disconnect watcher armed by Voice Verification
    // sees as a real disconnect and reacts to (see handleDisconnect above) —
    // and this fresh re-acquisition then supersedes that. Without this, a
    // Run Check re-run after Voice Verification already succeeded could leave
    // the checklist showing "Microphone active" while the Voice Verification
    // panel stays stuck on "No microphone detected".
    setMicStreamReady(true);
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
    stopFacePoll();
    noFaceStreakRef.current = 0;
    multiFaceStreakRef.current = 0;
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
    // Takes the dimensions of the frame the detector actually ran on — the
    // face-api path detects on a downscaled canvas, so measuring its boxes
    // against the full-resolution video would shrink every face below the
    // significance threshold and report an empty room.
    const countSignificantFaces = (
      dets: any[],
      getRegion: (d: any) => FaceRegion | null,
      w: number,
      h: number,
    ): number => {
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
    //
    // Both rows are debounced by FACE_MISS_STREAK: a row only flips to 'fail'
    // once the detector has been sure for that many CONSECUTIVE ticks. A lone
    // dropped frame used to knock Face Detection to 'fail' for ~2.5s, which
    // disabled Continue (allSystemPassed) right as the candidate clicked it —
    // the "I had to press Next several times" complaint. During a first miss
    // the row keeps its status and only its detail line changes.
    // `peopleCount` (Multiple People row) may come from a second detector — the
    // larger of the two counts; `count` alone drives the Face Detection row.
    const applyFaceCount = (count: number, peopleCount: number = count) => {
      // Face Detection: purely about the candidate's face being present.
      if (count >= 1) {
        noFaceStreakRef.current = 0;
        updateSystemCheck('face', { status: 'pass', detail: 'Face detected successfully' });
      } else {
        noFaceStreakRef.current += 1;
        updateSystemCheck('face', noFaceStreakRef.current >= FACE_MISS_STREAK
          ? { status: 'fail', detail: 'No face detected — position yourself in front of the camera' }
          : { detail: 'Looking for your face — hold still...' });
      }
      // Multiple People Check: purely about EXTRA people — independent of whether
      // the face is currently visible. Passes for 0 or 1 person; fails only at 2+.
      if (peopleCount >= 2) {
        multiFaceStreakRef.current += 1;
        updateSystemCheck('multiple', multiFaceStreakRef.current >= FACE_MISS_STREAK
          ? { status: 'fail', detail: `${peopleCount} people detected — ensure you are alone` }
          : { detail: 'Confirming you are alone...' });
      } else if (peopleCount === 1 || count === 1) {
        multiFaceStreakRef.current = 0;
        updateSystemCheck('multiple', { status: 'pass', detail: 'Single person detected (Good)' });
      } else {
        multiFaceStreakRef.current = 0;
        updateSystemCheck('multiple', { status: 'pass', detail: 'No other people detected' });
      }
    };

    // Self-scheduling poll — the next tick is armed only once the previous one
    // has returned, and waits FACE_POLL_BUSY_FACTOR x however long that took.
    // The old fixed 2.5s setInterval kept firing while a ~1s CPU inference was
    // still running, so the main thread never got a gap to paint or handle a
    // click in.
    const startFacePoll = (tick: () => Promise<void>) => {
      const generation = ++faceLoopGenRef.current;
      const run = async () => {
        if (faceLoopGenRef.current !== generation || !mountedRef.current) return;
        let elapsedMs = 0;
        // Skip the actual inference while a voice recording is in flight — the
        // CPU/WebGL face-detection tick blocks the main thread for a few
        // hundred ms, which starves the setInterval driving the voice
        // progress bar (see startVoiceEnroll) and makes it visibly stall then
        // jump every ~FACE_POLL_MIN_MS. Keep rescheduling at the same cadence
        // so face monitoring resumes on its own the moment recording ends.
        if (!faceApiBusyRef.current && video.readyState >= 2 && voiceEnrollStatusRef.current !== 'recording') {
          faceApiBusyRef.current = true;
          const startedAt = performance.now();
          try { await tick(); } catch { /* skip frame */ }
          finally {
            elapsedMs = performance.now() - startedAt;
            faceApiBusyRef.current = false;
          }
        }
        if (faceLoopGenRef.current !== generation || !mountedRef.current) return;
        faceIntervalRef.current = setTimeout(run, Math.min(
          FACE_POLL_MAX_MS,
          Math.max(FACE_POLL_MIN_MS, elapsedMs * FACE_POLL_BUSY_FACTOR),
        ));
      };
      faceIntervalRef.current = setTimeout(run, FACE_POLL_MIN_MS);
    };

    const hasNative = typeof window !== 'undefined' && 'FaceDetector' in window;
    let useFaceApi = !hasNative;
    if (hasNative) {
      try {
        const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        // Native detection is off-thread and cheap, so it reads the video
        // element directly — boxes come back in video coordinates.
        const detectNative = async () => {
          const count = countSignificantFaces(
            Array.from(await detector.detect(video)), nativeRegion, video.videoWidth, video.videoHeight,
          );
          applyFaceCount(count, Math.max(count, (await countPeopleWithMediaPipe(video)) ?? 0));
        };
        await detectNative();
        setHasFaceDetector(true);
        startFacePoll(detectNative);
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
        const opts = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5, inputSize: FACE_DETECT_INPUT_SIZE });
        // Detect on a downscaled copy of the frame, not the raw video: this is
        // the CPU-backend path, and the cost scales with the pixels handed in.
        const detectWithFaceApi = async () => {
          const frame = createVideoFrameCanvas(video, FACE_DETECT_FRAME_WIDTH);
          if (!frame) return;
          const count = countSignificantFaces(
            await faceapi.detectAllFaces(frame, opts), faceApiRegion, frame.width, frame.height,
          );
          applyFaceCount(count, Math.max(count, (await countPeopleWithMediaPipe(video)) ?? 0));
        };
        await detectWithFaceApi();
        setHasFaceDetector(true);
        startFacePoll(detectWithFaceApi);
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
  }, [ensureVideoStream, onVerifyFace, updateSystemCheck, stopFacePoll]);

  // Full run — orchestrates every check in order (initial "Run Check").
  const handleRunChecks = useCallback(async () => {
    // Voice Verification is required first — the button is also disabled in
    // the UI for this, this is just defense in depth.
    if (onEnrollVoice && voiceEnrollStatus !== 'success') return;
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
    // Warm the proctoring object-detection weights (tens of MB) so the
    // interview itself never waits on that download. Deliberately started
    // AFTER the speed test rather than on mount: the two used to pull ~25 MB
    // and ~tens of MB down the same link at once, which both slowed the page
    // and made the measured speed look worse than the candidate's connection
    // actually is. Fire-and-forget; failure is harmless.
    prefetchObjectDetectionModel();
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
  }, [onEnrollVoice, voiceEnrollStatus, stopActiveChecks, runDevice, runWebcam, runMicrophone, runInternet, runAiEngine, runWebsocket, runLighting, runNoise, runFaceMultiple]);

  // Retry a SINGLE check — reruns only that row (face/multiple share one detector).
  const retryCheck = useCallback(async (id: string) => {
    // The Microphone row is special: its proactive stream can die (and its
    // row can reach 'fail') from a disconnect DURING Voice Verification,
    // before the candidate has ever completed a first "Run Check" pass —
    // see the live-disconnect watcher above, which is armed the moment
    // micStreamReady goes true, well before checksCompleted. Letting a
    // per-row Retry click re-verify (and pass) the row at that point would
    // let the Microphone check pass outside the real "Run Check" flow this
    // whole component exists to gate — the candidate never ran the actual
    // Run Check sequence, they just happened to click a Retry that appeared
    // on a row that failed for an unrelated reason. So before the first
    // "Run Check" has completed once, Microphone Retry is a no-op; the
    // candidate must fix the device (via the Voice Verification panel) and
    // go through handleRunChecks, which is the only path allowed to hand
    // out the row's very first pass.
    if (id === 'microphone' && !checksCompleted) return;
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
  }, [runDevice, runWebcam, runMicrophone, runInternet, runAiEngine, runWebsocket, runLighting, runNoise, runFaceMultiple, checksCompleted]);

  // Mark camera-dependent checks as unverified after the selected camera
  // changes — same rule and reason as markAudioChecksUnverified below:
  // picking a device must never auto-verify it, only "Run Check" (first run)
  // or a per-row "Retry" click may. The Camera Preview intentionally keeps
  // showing the PREVIOUS device's feed until Retry actually swaps the stream
  // via runWebcam() — that swap IS the verification, so it's deferred too.
  const markCameraChecksUnverified = useCallback(() => {
    if (lightingIntervalRef.current) { clearInterval(lightingIntervalRef.current); lightingIntervalRef.current = null; }
    stopFacePoll();
    if (!checksCompleted) return;
    updateSystemCheck('webcam', { status: 'fail', detail: 'Click Retry to verify this camera' });
    updateSystemCheck('lighting', { status: 'fail', detail: 'Click Retry to re-check lighting' });
    updateSystemCheck('face', { status: 'fail', detail: 'Click Retry to re-check face detection' });
    updateSystemCheck('multiple', { status: 'fail', detail: 'Click Retry to re-check for other people' });
  }, [checksCompleted, updateSystemCheck, stopFacePoll]);

  const switchCamera = useCallback((deviceId: string) => {
    if (deviceId === selectedCameraId) return;
    // Defense-in-depth: the dropdown already renders virtual/mobile-relay
    // cameras as disabled <option>s, but a disabled option can still end up
    // "selected" via programmatic dispatch — never activate one even if that
    // happens. deviceId === '' means "system default", which is never one of
    // the enumerated (and therefore never a flagged) devices.
    if (deviceId) {
      const target = cameraDevices.find((d) => d.deviceId === deviceId);
      if (target && isVirtualCameraLabel(target.label)) {
        setCameraSelectionError(INVALID_CAMERA_SELECTION_MESSAGE);
        return;
      }
    }
    setCameraSelectionError(null);
    selectedCameraIdRef.current = deviceId;
    setSelectedCameraId(deviceId);
    markCameraChecksUnverified();
  }, [selectedCameraId, cameraDevices, markCameraChecksUnverified]);

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
      setMicStreamReady(false);
      markAudioChecksUnverified();
      // A failed/disconnected voice-verification attempt leaves the "Record
      // again" button gated on micReadyForVoice (== micStreamReady), which we
      // just set false above and which nothing else will ever flip back to
      // true — the only path that re-acquires the stream is startVoiceEnroll,
      // reachable only by clicking that now-disabled button. Reset to 'idle'
      // so the unconditionally-enabled "Start recording" button takes over
      // for the newly selected device instead of a dead-ended "Record again".
      //
      // A previously-SUCCEEDED voiceprint is invalidated here too: it was
      // captured on the device the candidate is now switching away from, so
      // it can't be trusted to match whatever device is now selected. Without
      // this, voiceEnrollStatus stays 'success' after a mic switch and
      // "Run Check" unlocks without the candidate ever re-proving their voice
      // on the newly selected microphone.
      if (voiceEnrollStatus === 'failed' || voiceEnrollStatus === 'disconnected' || voiceEnrollStatus === 'success') {
        voiceEnrollPromiseRef.current = null;
        setVoiceEnrollStatus('idle');
        setVoiceEnrollProgress(0);
      }
    } finally {
      setIsSwitchingDevice(false);
    }
  }, [isSwitchingDevice, selectedMicId, markAudioChecksUnverified, voiceEnrollStatus]);

  // Keep the dropdown options current if the candidate plugs/unplugs a device
  // mid-check (e.g. connects a USB webcam after the page already loaded).
  useEffect(() => {
    if (phase !== 'system_checks') return;
    void refreshDeviceLists();
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener('devicechange', refreshDeviceLists);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDeviceLists);
  }, [phase, refreshDeviceLists]);

  // Start the camera preview the moment this screen loads — so the candidate
  // can see their actual device and pick a different one from the Device
  // Settings dropdown BEFORE running system checks, instead of only being
  // able to choose it after "Run Check" already ran against whatever camera
  // happened to be default. This does NOT mark the webcam check as passed;
  // that still requires an explicit "Run Check" or "Retry" click.
  //
  // The microphone is deliberately NOT acquired proactively here — it's
  // requested on-demand, inside startVoiceEnroll, the moment the candidate
  // actually clicks "Start recording" (or "Retry"). Asking for it up front
  // used to fire alongside this camera request and race it (two concurrent
  // getUserMedia calls competing for the browser's permission-prompt UI could
  // silently fail one of them), and it also meant a mic permission prompt
  // could pop up before the candidate had done anything — surprising, and
  // hard to explain when it failed. Tying it to the click keeps cause and
  // effect obvious: click record → prompt (first time) → recording starts.
  useEffect(() => {
    if (phase !== 'system_checks') return;
    let cancelled = false;
    (async () => {
      const ok = await ensureVideoStream();
      if (ok && !cancelled) void refreshDeviceLists();
    })();
    return () => { cancelled = true; };
  }, [phase, ensureVideoStream, refreshDeviceLists]);

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
    // Gated on micStreamReady (not micCheckStatus) so this watcher is armed
    // as soon as the proactively-acquired mic stream is live — i.e. from the
    // moment Voice Verification becomes usable, which is now BEFORE "Run
    // Check" has ever run (see micReadyForVoice above). micCheckStatus
    // becoming 'pass' no longer precedes that; it's the other way around.
    if (phase !== 'system_checks' || !micStreamReady) return;
    const track = streamRef.current?.getAudioTracks().find((t) => t.readyState === 'live');
    if (!track) return;

    let handling = false;
    const handleDisconnect = async () => {
      if (handling) return; // re-entrancy guard — 'ended' + the 1s poll can both fire
      handling = true;
      setMicStreamReady(false);
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

        // An ALREADY-SUCCEEDED voiceprint is invalidated by this disconnect too,
        // not just one that interrupts an in-flight recording — it was captured
        // on the track/device that just died, so it can't be trusted to still
        // match whatever device is live once reconnected (or, if a silent
        // laptop fallback fires below, the DIFFERENT device it just switched
        // to). Without this, voiceEnrollStatus stays stuck on 'success' forever
        // and Continue reappears the moment the Microphone check re-passes,
        // without the candidate ever re-proving their voice on the live device.
        // Reuses the same 'disconnected' panel/copy as the mid-recording case
        // ("No microphone detected" → "Microphone reconnected — start over")
        // for consistent messaging, and requires the same explicit "Start
        // over" click rather than auto-restarting.
        if (voiceEnrollStatusRef.current === 'success') {
          voiceEnrollPromiseRef.current = null;
          setVoiceEnrollStatus('disconnected');
          setVoiceEnrollProgress(0);
        }

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
    // selectedMicId is a dependency because a successful "laptop" silent
    // fallback switch keeps micStreamReady true the whole time — it never
    // changes — so without also re-running on selectedMicId, this effect
    // would keep polling the OLD, now-dead track forever instead of picking
    // up the newly-active fallback device's track.
  }, [phase, micStreamReady, selectedMicId, updateSystemCheck, tryMicFallbackOrFail]);

  // While the reconnect popup is showing, poll for the OS reporting the
  // device back (headset plugged back in) so the popup itself clears and
  // Voice Verification becomes usable again without a button click for THAT.
  // Uses ensureAudioAnalyser directly (not the full runMicrophone) so a
  // still-disconnected retry fails silently instead of flashing "checking..."
  // / "access denied" over the reconnect message every couple of seconds.
  //
  // What this must NOT do is silently flip the "microphone" System Checks row
  // to 'pass' — that's exactly the case markAudioChecksUnverified's comment
  // above rules out for every other audio check: "Neither check may run —
  // let alone pass — as a side effect of a device merely being selected or
  // plugged in... verification happens solely on an explicit 'Run Check'
  // (first run) or per-row 'Retry' click." A replug is exactly that kind of
  // side effect, so it surfaces the same "Click Retry to verify this
  // microphone" prompt markAudioChecksUnverified uses instead of reporting a
  // pass the candidate never asked this screen to record.
  useEffect(() => {
    if (!micDisconnectedPopup) return;
    const tryRecover = async () => {
      const analyser = await ensureAudioAnalyser();
      if (!analyser || !selectedMicIdRef.current) return; // still gone — stay quiet
      setMicStreamReady(true);
      setMicDisconnectedPopup(false);
      if (checksCompleted) {
        updateSystemCheck('microphone', { status: 'fail', detail: 'Click Retry to verify this microphone' });
      }
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
  }, [micDisconnectedPopup, ensureAudioAnalyser, updateSystemCheck, refreshDeviceLists, checksCompleted]);

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
      faceCounterRef.current?.close();
      faceCounterRef.current = null;
      if (micFallbackNoticeTimerRef.current) clearTimeout(micFallbackNoticeTimerRef.current);
    };
  }, [stopActiveChecks]);

  // Record system check results when all passed
  const allSystemPassed = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass');
  const allSystemDone = systemChecks.length > 0 && systemChecks.every((c) => c.status === 'pass' || c.status === 'fail');
  const isAnyChecking = systemChecks.some((c) => c.status === 'checking' || c.status === 'pending');
  // The mic must be accessible before the candidate can record their voice.
  // Gated on the proactively-acquired mic stream (micStreamReady), NOT on the
  // formal "microphone" system-check row passing — Voice Verification must be
  // usable before "Run Check" has run at all (see the effect that calls
  // ensureAudioAnalyser() above, and the Run Check button's disabled state).
  const micReadyForVoice = micStreamReady;
  // Voice Verification is a REQUIRED sub-step (when enabled): Continue is blocked
  // until a valid, non-silent voice sample has been captured.
  const voiceGateOk = !onEnrollVoice || voiceEnrollStatus === 'success';

  // Scroll to whatever the checks' outcome asks of the candidate, but only
  // when it is off screen:
  //  - a run finishes → all passed: the Continue row; some failed: the first
  //    failed row;
  //  - after a run, a single Retry turns everything green → the Continue row;
  //  - after a run, switching a device fails more rows → the first failed row.
  const failedCheckCount = systemChecks.filter((c) => c.status === 'fail').length;
  const prevChecksRef = useRef({ completed: false, passed: false, failed: 0 });
  useEffect(() => {
    const prev = prevChecksRef.current;
    prevChecksRef.current = { completed: checksCompleted, passed: allSystemPassed, failed: failedCheckCount };
    if (checksRunning || !checksCompleted) return;
    const firstFailed = () => checksListRef.current?.querySelector('[data-check-status="fail"]');
    if (!prev.completed) {
      if (allSystemPassed) revealAfterPaint(() => checksFooterRef.current, 'nearest');
      else revealAfterPaint(firstFailed, 'center');
    } else if (allSystemPassed && !prev.passed) {
      revealAfterPaint(() => checksFooterRef.current, 'nearest');
    } else if (failedCheckCount > prev.failed) {
      revealAfterPaint(firstFailed, 'center');
    }
  }, [checksRunning, checksCompleted, allSystemPassed, failedCheckCount]);

  // The mic-disconnected popup points at Device Settings: bring the
  // microphone picker into view.
  useEffect(() => {
    if (!micDisconnectedPopup) return;
    revealAfterPaint(() => document.getElementById('tf-mic-select'), 'center');
  }, [micDisconnectedPopup]);

  const handleProceed = useCallback(async () => {
    if (isProceedLoading) return;
    setIsProceedLoading(true);

    // ── FINAL device gate ──────────────────────────────────────────────────
    // Every check on this screen is a STORED verdict from when it ran. A camera
    // or headset unplugged after those checks passed leaves them reading "pass"
    // — the live pollers can lag, and the candidate can even unplug between the
    // last poll and this click — so the run would be recorded as passed against
    // hardware that is no longer there.
    //
    // Probe both devices for real, right now. Video and audio are opened
    // SEPARATELY, never in one getUserMedia call: a combined request is
    // all-or-nothing, so a missing camera would mask a missing mic and the
    // candidate would be told to fix the wrong thing. Probe tracks are stopped
    // immediately — this only answers "can it open?".
    const _camLive = await canOpenDevice({ video: true }, 'video');
    const _micLive = await canOpenDevice({ audio: true }, 'audio');
    if (!_camLive || !_micLive) {
      console.warn(`[SystemCheck] Continue blocked — camera=${_camLive} mic=${_micLive} at click time`);
      if (!_camLive) {
        // NB the check id is 'webcam', not 'camera' — updateSystemCheck matches
        // by id and silently no-ops on a wrong one.
        updateSystemCheck('webcam', { status: 'fail', detail: 'Camera is not available — reconnect it and run the check again' });
      }
      if (!_micLive) {
        updateSystemCheck('microphone', { status: 'fail', detail: 'Microphone is not available — reconnect it and run the check again' });
      }
      setIsProceedLoading(false);
      return;
    }

    // Record every microphone that is connected and working RIGHT NOW. The
    // interview pins one device and treats a change as a proctoring event, but
    // it will accept a fallback to a mic from THIS set — the candidate had it
    // plugged in before the interview began, so it cannot be a device
    // introduced mid-interview to reroute audio. Anything not captured here
    // still pauses the interview.
    try {
      saveVerifiedAudioInputs(token, await enumerateAudioInputIds());
    } catch { /* best-effort: no set recorded => interview keeps strict pinning */ }

    const checkStatus = (id: string) =>
      systemChecks.find((c) => c.id === id)?.status === 'pass' ? 'pass' : 'fail';

    // Stop face detection intervals before face registration — concurrent face-api.js /
    // TF.js calls corrupt the WebGL backend (tensor.backend becomes undefined).
    stopFacePoll();

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
            const _opts = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5, inputSize: FACE_DETECT_INPUT_SIZE });
            // Same downscaled frame as the live poll — this one runs while the
            // candidate is waiting on the Continue spinner, so it has to be
            // just as cheap.
            const _frame = createVideoFrameCanvas(_vid, FACE_DETECT_FRAME_WIDTH);
            _faces = _frame ? (await faceapi.detectAllFaces(_frame, _opts)).length : -1;
          } catch { _faces = -1; }
        }
        // Same second opinion as the live poll.
        _faces = Math.max(_faces, (await countPeopleWithMediaPipe(_vid)) ?? -1);
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

      // Resolve the mic the candidate actually verified on: their explicit
      // Device Settings choice, or the concrete device behind "System Default".
      // Resolving the concrete id matters even when they never chose, because
      // "default" is a moving target on Windows — plugging a headset in
      // reassigns it, so an interview that merely asks for the default can
      // change microphone underneath itself mid-session.
      let _approvedMicId: string | null = selectedMicIdRef.current || null;
      if (!_approvedMicId) {
        try { _approvedMicId = await currentAudioInputId(); } catch { _approvedMicId = null; }
      }
      console.log(`[SystemCheck] approved devices — camera=${approvedCameraDeviceIdRef.current ?? 'default'} mic=${_approvedMicId ?? 'default'}`);
      onAllPassed(approvedCameraDeviceIdRef.current, _approvedMicId);
    } finally {
      if (mountedRef.current) setIsProceedLoading(false);
    }
  }, [token, systemChecks, onAllPassed, isProceedLoading, onRegisterFace, onEnrollVoice, runFaceMultiple, updateSystemCheck]);

  // ────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────

  const blockedBrowserName = deviceInfo?.browser.name === 'Brave' || deviceInfo?.browser.name === 'Firefox' ? deviceInfo.browser.name : null;
  const deviceAllPass = deviceInfo ? !deviceInfo.isMobile && deviceInfo.browser.supported && !blockedBrowserName : false;

  // Device Check results, all requirements met: after the hold on the in-step
  // stepper, make sure "Continue to System Checks" is on screen (short
  // laptops, phones). When requirements are NOT met, the warning sits right
  // under the stepper, so the hold alone is right.
  useEffect(() => {
    if (phase !== 'browser_results' || !deviceAllPass) return;
    revealAfterPaint(() => deviceContinueRef.current, 'nearest');
  }, [phase, deviceAllPass]);

  // ────────────────────────────────────────
  // Phase 1: browser_check (loading)
  // ────────────────────────────────────────
  if (phase === 'browser_check') {
    return (
      <div className="w-full space-y-6">
        <div ref={deviceStepperRef}>
          <ProgressStepper phase={phase} />
        </div>

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-success-subtle text-success text-xs font-semibold px-3 py-1.5 rounded-full">
            <Monitor className="w-3.5 h-3.5" />
            Device Check
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Device Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Checking your device and browser compatibility for the interview.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-lg">
          {/* Card body: Loading */}
          <div className="p-8 flex flex-col items-center justify-center min-h-[200px] space-y-4">
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
    const detectedLogo = BROWSER_LOGOS[deviceInfo.browser.name];
    /* `image` when there is a logo that fits the detected value; otherwise
       the lucide `icon`. The tablet-and-laptop device icon suits either answer. */
    const deviceRows: { label: string; value: string; icon: typeof Monitor; image: string | null }[] = [
      { label: 'Device', value: deviceInfo.deviceType, icon: Monitor, image: SYSTEM_ICONS.device },
      { label: 'Operating System', value: deviceInfo.os, icon: AppWindow, image: osLogo(deviceInfo.os) },
      { label: 'Screen Resolution', value: `${deviceInfo.screenWidth} × ${deviceInfo.screenHeight}`, icon: Maximize2, image: SYSTEM_ICONS.resolution },
    ];
    return (
      <div className="w-full space-y-6">
        <div ref={deviceStepperRef}>
          <ProgressStepper phase={phase} />
        </div>

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-success-subtle text-success text-xs font-semibold px-3 py-1.5 rounded-full">
            <Monitor className="w-3.5 h-3.5" />
            Device Check
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Device Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Checking your device and browser compatibility for the interview.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="p-5 sm:p-6 space-y-5">
            {blockedBrowserName && (
              <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive-strong">{blockedBrowserName} is not a compatible browser</p>
                  <p className="text-sm text-destructive-strong mt-1">
                    Use Chrome, Edge, or Safari to continue the interview. You cannot proceed while this interview is opened in {blockedBrowserName}.
                  </p>
                </div>
              </div>
            )}

            {/* Two cards side by side, then the verdict merged across both columns
                beneath them. items-stretch + h-full keeps the two cards level.
                Each card fades in from its own side, one after the other. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              {/* ═══ LEFT: Device Type ═══ */}
              <div className="min-w-0">
                <div className="relative h-full border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                    <span className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                      <Monitor className="w-5 h-5 text-brand-blue" />
                    </span>
                    <h3 className="text-base font-semibold text-gray-900">Device Type</h3>
                    {!deviceInfo.isMobile
                      ? <CheckCircle className="w-5 h-5 text-success" />
                      : <XCircle className="w-5 h-5 text-destructive" />}
                  </div>
                  <dl className="px-5 py-4 space-y-3">
                    {deviceRows.map(({ label, value, icon: RowIcon, image }) => (
                      <div key={label} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3 items-center text-sm">
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="flex items-center gap-2.5 font-semibold text-gray-900 min-w-0">
                          {image
                            ? <Image src={image} alt="" width={20} height={20} unoptimized className="w-5 h-5 object-contain flex-shrink-0" />
                            : <RowIcon className="w-5 h-5 text-brand-blue flex-shrink-0" />}
                          <span className="truncate">{value}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {deviceInfo.isMobile && (
                    <div className="mx-5 mb-4 p-3 bg-destructive-subtle border border-destructive-line rounded-lg">
                      <p className="text-sm text-destructive font-medium">Mobile devices are not supported</p>
                      <p className="text-xs text-destructive mt-0.5">
                        AI interviews must be completed on a desktop or laptop computer. Switching to &quot;Desktop Mode&quot; in your mobile browser does not bypass this restriction.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ RIGHT: Browser Compatibility ═══ */}
              <div className="min-w-0">
                <div className="h-full border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                    <span className="w-10 h-10 rounded-full bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-brand-blue" />
                    </span>
                    <h3 className="text-base font-semibold text-gray-900">Browser Compatibility</h3>
                    {deviceInfo.browser.supported
                      ? <CheckCircle className="w-5 h-5 text-success" />
                      : <XCircle className="w-5 h-5 text-destructive" />}
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3 items-center text-sm">
                      <span className="text-gray-500">Detected Browser</span>
                      <span className="flex items-center gap-2.5 font-semibold text-gray-900 min-w-0">
                        {detectedLogo
                          ? <Image src={detectedLogo} alt="" width={22} height={22} unoptimized className="flex-shrink-0" />
                          : <Globe className="w-5 h-5 text-brand-blue flex-shrink-0" />}
                        <span className="truncate">{deviceInfo.browser.name} {deviceInfo.browser.version}</span>
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">Supported Browsers</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2.5">
                      {SUPPORTED_BROWSERS.map((b) => {
                        const isCurrent = deviceInfo.browser.name === b.name;
                        return (
                          <div
                            key={b.name}
                            className={`rounded-xl px-3 py-2.5 flex items-center gap-3 border min-w-0 ${
                              isCurrent ? 'bg-success-subtle border-success-line' : 'bg-white border-gray-200'
                            }`}
                          >
                            <Image src={BROWSER_LOGOS[b.name]} alt="" width={36} height={36} unoptimized className="flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                              <p className="text-xs text-gray-500 truncate">{b.minVersion}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {blockedBrowserName === 'Brave' && (
                      <div className="p-3 bg-destructive-subtle border border-destructive-line rounded-lg">
                        <p className="text-sm text-destructive-strong font-medium">Brave browser is blocked for AI interviews.</p>
                        <p className="text-xs text-destructive mt-1">
                          Please open this interview link in Chrome, Edge, or Safari.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ Verdict, full width across both columns ═══ */}
            <div>
              <div className={`border rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                deviceAllPass ? 'bg-success-subtle border-success-line' : 'bg-destructive-subtle border-destructive-line'
              }`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <StatusDot ok={deviceAllPass} size="lg" />
                  <div className="min-w-0">
                    {deviceAllPass ? (
                      <>
                        <p className="text-lg font-bold text-success-strong leading-tight">All Requirements Met!</p>
                        <p className="text-sm text-gray-600 mt-0.5">Your device and browser are compatible for the interview.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-bold text-destructive-strong leading-tight">Requirements Not Met</p>
                        <p className="text-sm text-gray-600 mt-0.5">Fix the items marked above to continue with the interview.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Only offered once every requirement is met, and fades in just
                after the verdict. */}
            {deviceAllPass && (
              <div ref={deviceContinueRef} className="flex sm:justify-end scroll-mb-4">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => setPhase('system_checks')}
                  className="w-full sm:w-auto whitespace-normal h-auto min-h-11 py-2 text-center"
                >
                  Continue to System Checks
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────
  // Phase 2: system_checks
  // ────────────────────────────────────────
  if (phase === 'system_checks') {
    // Voice Verification must be completed before "Run Check" unlocks — see
    // micReadyForVoice / the mic-acquisition effect above, which make the
    // Voice Verification panel usable from the moment this screen loads.
    // Unlocked by the first successful sample (see voiceEverSucceeded), so a
    // later mic drop doesn't hide Device Settings; Continue still needs a
    // live 'success' (voiceGateOk).
    const runCheckLocked = !!onEnrollVoice && !voiceEverSucceeded;
    // Brand-palette only on this screen: blue = primary, red = needs
    // attention (required, recording, failed), sky = soft accents; green is
    // kept for the per-check "Working" badge only.
    const recordSeconds = Math.round((voiceEnrollProgress / 100) * VOICE_CAPTURE_SECONDS);
    const fmtClock = (sec: number) => `00:${String(sec).padStart(2, '0')}`;
    const canStartRecording = voiceEnrollStatus === 'idle' && !micAcquireFailed && (micDevices.length <= 1 || !!selectedMicId);

    return (
      <div className="w-full space-y-6">
        <style>{`
          @keyframes tf-checks-fade-in { from { opacity: 0; } to { opacity: 1; } }
          .tf-checks-fade-in { animation: tf-checks-fade-in 0.6s ease-out both; }
          @media (prefers-reduced-motion: reduce) { .tf-checks-fade-in { animation: none; } }
        `}</style>
        <ProgressStepper phase={phase} />

        {/* Pill badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-success-subtle text-success text-xs font-semibold px-3 py-1.5 rounded-full">
            <Monitor className="w-3.5 h-3.5" />
            System Checks
          </span>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Environment Verification</h1>
          <p className="text-gray-600 mt-2">
            Let&apos;s make sure your system is ready for the interview. Please complete all the checks below.
          </p>
        </div>

        {/* One full-width card, top to bottom: voice verification (read
            aloud, record, tips) → camera & devices → once the voice sample is
            in, the environment checks fade in → Continue. */}
        <section ref={systemChecksCardRef} className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-lg">
          <div className="p-5 sm:p-6 space-y-6">
            {/* ── 1. Voice Verification: read aloud → record → tips ── */}
            {onEnrollVoice && (
              <div ref={voiceSectionRef} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mic className="w-6 h-6 text-brand-blue" />
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Voice Verification</h3>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    voiceEnrollStatus === 'success' ? 'bg-brand-blue/10 text-brand-blue' : 'bg-destructive text-white'
                  }`}>
                    {voiceEnrollStatus === 'success' ? 'Done' : 'Required'}
                  </span>
                </div>

                {/* Two columns: the passage to read on the left, the recorder on
                    the right (stacked: button, status, waveform, timer, actions). */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-stretch">
                  {/* A suggested line — NOT required. The candidate can say
                      anything; we only need to hear their voice. */}
                  <div ref={passageRef} className="rounded-xl border border-brand-blue/15 bg-brand-sky/40 dark:bg-brand-blue/10 overflow-hidden flex flex-col justify-between">
                    <div className="flex items-start gap-3 p-4">
                      <span className="w-7 h-7 rounded-full bg-brand-blue text-white flex items-center justify-center flex-shrink-0">
                        <Info className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-brand-blue">
                          Read this aloud — or just speak naturally:
                        </p>
                        <p className="mt-1 text-sm italic text-gray-800 leading-relaxed">&ldquo;{ENROLL_PASSAGE}&rdquo;</p>
                        <p className="text-2xs text-gray-500 mt-1.5">
                          You don&apos;t have to read this exactly — we only check that you spoke.
                        </p>
                      </div>
                    </div>
                    {voiceEnrollStatus === 'success' && (
                      <div className="flex items-center gap-3 px-4 py-3 bg-brand-blue/10 border-t border-brand-blue/15">
                        <span className="w-6 h-6 rounded-full bg-brand-blue text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </span>
                        <p className="text-sm font-semibold text-brand-blue">Voice sample captured successfully! You&apos;re all set.</p>
                      </div>
                    )}
                  </div>

                  {/* Recorder. The red dot is only a "recording" indicator, not a
                      control: it rises in when recording starts and sinks out
                      when it ends. Without it the rest stays centred. */}
                  <div className="rounded-xl border border-gray-200 px-4 py-4 flex flex-col items-center justify-center text-center gap-3">
                    <FadePresence show={voiceEnrollStatus === 'recording'} distance={12} duration={RECORDING_DOT_FADE_S}>
                      <span aria-hidden className="relative w-9 h-9 rounded-full border-2 border-destructive flex items-center justify-center">
                        <span className="absolute inset-0 rounded-full bg-destructive/20 animate-ping" />
                        <span className="relative w-4 h-4 rounded-full bg-destructive animate-pulse" />
                      </span>
                    </FadePresence>
                    <p className="text-sm font-semibold text-gray-900 text-center inline-flex items-center justify-center gap-2">
                      {voiceEnrollStatus === 'verifying' && <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />}
                      {voiceEnrollStatus === 'recording' ? 'Recording — keep speaking…'
                        : voiceEnrollStatus === 'verifying' ? 'Checking your voice sample…'
                        : voiceEnrollStatus === 'success' ? 'Voice sample recorded'
                        : 'Record Voice Sample'}
                    </p>
                    {/* Bars fill with the capture's real progress — a progress
                        meter shaped like a waveform, not live audio levels. */}
                    <div className="w-full flex items-center gap-px sm:gap-[3px] h-8" aria-hidden>
                      {VOICE_WAVE_BARS.map((h, i) => {
                        const filled = voiceEnrollStatus === 'success' || voiceEnrollStatus === 'verifying'
                          || (i / VOICE_WAVE_BARS.length) * 100 < voiceEnrollProgress;
                        return (
                          <span
                            key={i}
                            className={`flex-1 rounded-full transition-colors ${filled ? 'bg-brand-blue' : 'bg-brand-blue/15'}`}
                            style={{ height: `${h}%` }}
                          />
                        );
                      })}
                    </div>
                    <span className="text-sm tabular-nums text-gray-600 whitespace-nowrap">
                      {fmtClock(voiceEnrollStatus === 'success' || voiceEnrollStatus === 'verifying' ? VOICE_CAPTURE_SECONDS : recordSeconds)} / {fmtClock(VOICE_CAPTURE_SECONDS)}
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {canStartRecording && (
                        <button
                          type="button"
                          onClick={startVoiceEnroll}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 min-h-11 sm:min-h-0 transition-colors bg-brand-blue text-white hover:bg-brand-blue-2"
                        >
                          <Mic className="w-4 h-4" />
                          Start recording
                        </button>
                      )}
                      {voiceEnrollStatus === 'idle' && micAcquireFailed && (
                        <button
                          type="button"
                          onClick={startVoiceEnroll}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 min-h-11 sm:min-h-0 transition-colors bg-brand-blue text-white hover:bg-brand-blue-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Retry
                        </button>
                      )}
                      {voiceEnrollStatus === 'success' && (
                        <>
                          {voicePlaybackUrl && (
                            <>
                              <audio
                                ref={voicePlaybackAudioRef}
                                src={voicePlaybackUrl}
                                onEnded={() => setVoicePlaying(false)}
                                onPause={() => setVoicePlaying(false)}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={toggleVoicePlayback}
                                aria-label={voicePlaying ? 'Pause your recording' : 'Play your recording'}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 min-h-11 sm:min-h-0 transition-colors border border-brand-blue/30 text-brand-blue bg-white hover:bg-brand-blue/5"
                              >
                                {voicePlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                {voicePlaying ? 'Pause' : 'Play'}
                              </button>
                            </>
                          )}
                          {/* Locked while the checks run (they use the mic) or
                              while Continue is finishing up. */}
                          <button
                            type="button"
                            onClick={retryVoiceEnroll}
                            disabled={!micReadyForVoice || checksRunning || isProceedLoading}
                            title={checksRunning ? 'Available after the checks finish' : isProceedLoading ? 'Finishing up…' : !micReadyForVoice ? 'Connect a microphone first' : undefined}
                            className={`inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 min-h-11 sm:min-h-0 transition-colors border ${
                              micReadyForVoice && !checksRunning && !isProceedLoading
                                ? 'border-brand-blue/30 text-brand-blue bg-white hover:bg-brand-blue/5'
                                : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Re-record
                          </button>
                        </>
                      )}
                      {(voiceEnrollStatus === 'failed' || voiceEnrollStatus === 'disconnected') && (
                        <button
                          type="button"
                          onClick={retryVoiceEnroll}
                          disabled={!micReadyForVoice}
                          className={`inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 min-h-11 sm:min-h-0 transition-colors border ${
                            micReadyForVoice
                              ? 'border-brand-blue/30 text-brand-blue bg-white hover:bg-brand-blue/5'
                              : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <RefreshCw className="w-4 h-4" />
                          {voiceEnrollStatus === 'failed' ? 'Re-record' : micReadyForVoice ? 'Start recording' : 'Start over'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Why recording can't start / what went wrong. The mic is
                    requested on-demand inside startVoiceEnroll, so Retry is a
                    real new attempt. With 2+ mics and none picked, recording
                    would fall back to the browser's "default" guess and could
                    silently use the wrong device — so it's blocked until the
                    candidate picks one. A mid-capture disconnect discards the
                    partial audio (see MicDisconnectedDuringRecordingError);
                    the button stays disabled until a mic is live again. */}
                {voiceEnrollStatus === 'idle' && micAcquireFailed && (
                  <VoiceNotice>Couldn&apos;t access your microphone. Check your browser&apos;s site permissions, or pick a different device in Device Settings, then retry.</VoiceNotice>
                )}
                {/* Device Settings stays hidden until the voice sample is in, so
                    with 2+ mics the pick happens here; it writes the same
                    selection the Device Settings picker shows later. */}
                {((voiceEnrollStatus === 'idle' && !selectedMicId) || voiceEnrollStatus === 'disconnected') && !micAcquireFailed && micDevices.length > 1 && (
                  <div className="space-y-2">
                    <VoiceNotice>More than one microphone is connected. Choose the one you&apos;ll speak into, then click Start recording.</VoiceNotice>
                    <div className="flex items-center gap-2 max-w-md">
                      <Mic className="w-4 h-4 text-brand-blue flex-shrink-0" />
                      <label htmlFor="tf-voice-mic-select" className="sr-only">Microphone</label>
                      <select
                        id="tf-voice-mic-select"
                        value={selectedMicId}
                        onChange={(e) => switchMicrophone(e.target.value)}
                        disabled={isSwitchingDevice}
                        className="w-full text-base sm:text-sm min-h-11 sm:min-h-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                      >
                        <option value="" disabled>Select your microphone…</option>
                        {micDevices.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {voiceEnrollStatus === 'failed' && (
                  <VoiceNotice>We didn&apos;t hear any speech. Please speak clearly for a few seconds, then record again.</VoiceNotice>
                )}
                {voiceEnrollStatus === 'disconnected' && (
                  <VoiceNotice>
                    {micReadyForVoice
                      ? 'Microphone reconnected. Your earlier recording was discarded — start the voice verification again from the beginning.'
                      : 'No microphone detected. Please connect a microphone.'}
                  </VoiceNotice>
                )}
              </div>
            )}

            {/* ── 2. Camera, devices & environment checks — revealed (with a
                fade) once the voice sample is recorded, immediately when voice
                verification is off. Kept MOUNTED while hidden, not unrendered:
                the camera stream is attached to the <video> in here during the
                voice step, and unmounting it would drop the preview. ── */}
              <div
                ref={cameraRowRef}
                className={`space-y-4 ${onEnrollVoice ? 'border-t border-gray-100 pt-6' : ''} ${runCheckLocked ? 'hidden' : 'tf-checks-fade-in'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-6 h-6 text-brand-blue" />
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900">Environment Checks</h3>
                  </div>
                  {/* Only the initial "Run Check" lives here. After the run, a
                      FAILED check is retried from its own row, and a
                      fully-passed run shows Continue below. */}
                  {!checksRunning && !checksCompleted && (
                    <>
                      {/* The pulse is a glow only (no scale), so the button's hit
                          area never moves under the pointer; off for reduced
                          motion. */}
                      <style>{`
                        @keyframes tfRunCheckPulse {
                          0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.6); }
                          50%      { box-shadow: 0 0 0 10px rgba(22,163,74,0); }
                        }
                        .tf-run-check-pulse { animation: tfRunCheckPulse 1.2s ease-in-out infinite; }
                        @media (prefers-reduced-motion: reduce) { .tf-run-check-pulse { animation: none; } }
                      `}</style>
                      <button
                        type="button"
                        onClick={() => {
                          // After the click's re-render, bring the checks into
                          // view — on any screen, but only when they aren't
                          // already fully visible (stacked layouts, short
                          // laptops). A large screen showing them stays put.
                          revealAfterPaint(() => checksListRef.current, 'start');
                          void handleRunChecks();
                        }}
                        className="tf-run-check-pulse flex-shrink-0 inline-flex items-center justify-center gap-2 font-bold min-h-11 py-2.5 px-5 rounded-lg text-sm transition-colors bg-success hover:bg-success-strong text-white shadow-lg w-full min-[400px]:w-auto"
                      >
                        <Play className="w-4 h-4" />
                        Run Check
                      </button>
                    </>
                  )}
                </div>

              {/* Layout: left column = camera preview + Device Settings, with
                  the checks as one top-down list on the right; below both, a
                  row with Continue in the right corner. The result banner sits
                  under Device Settings. Phones stack in DOM order: camera/settings
                  → checks → result/Continue. */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 items-start">
              <div className="space-y-4 min-w-0 lg:col-start-1 lg:row-start-1">
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="relative bg-gray-900 aspect-video max-h-[42svh] w-full mx-auto rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                      onLoadedData={() => setCameraLive(true)}
                      onPlaying={() => setCameraLive(true)}
                      onEmptied={() => setCameraLive(false)}
                      onError={() => setCameraLive(false)}
                      onStalled={() => setCameraLive(false)}
                    />
                    {/* Reflects the video element's actual playback state
                        (cameraLive) instead of always claiming "Camera Active". */}
                    {cameraLive ? (
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 text-success text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 text-destructive text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                        <span className="w-2 h-2 bg-destructive rounded-full" />
                        No Camera Signal
                      </span>
                    )}
                  </div>
                </div>

                {/* Device Settings — lets the candidate pick whichever connected
                    camera/microphone is actually compatible, instead of being
                    stuck with whatever the OS treats as default. */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
                    <Settings className="w-5 h-5 text-brand-blue" />
                    <h3 className="text-base font-semibold text-gray-900">Device Settings</h3>
                    {isSwitchingDevice && <Loader2 className="w-3.5 h-3.5 text-brand-blue animate-spin" />}
                  </div>
                  <div className="p-4 space-y-5">
                    <div className="flex items-start gap-3">
                      <Camera className="w-5 h-5 text-brand-blue flex-shrink-0 mt-6" />
                      <div className="min-w-0 flex-1">
                        <label htmlFor="tf-camera-select" className="block text-sm font-semibold text-gray-900 mb-1">Camera</label>
                        <select
                          id="tf-camera-select"
                          value={selectedCameraId}
                          onChange={(e) => switchCamera(e.target.value)}
                          disabled={isSwitchingDevice || checksRunning}
                          className="w-full text-base sm:text-sm min-h-11 sm:min-h-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                        >
                          {cameraDevices.length === 0 && <option value="">System Default</option>}
                          {cameraDevices.map((d, i) => (
                            <option
                              key={d.deviceId}
                              value={d === defaultCameraDevice ? '' : d.deviceId}
                              disabled={isVirtualCameraLabel(d.label)}
                            >
                              {getCameraDeviceLabel(d, i)}
                            </option>
                          ))}
                        </select>
                        {cameraSelectionError && (
                          <p className="mt-1 text-xs font-medium text-destructive">{cameraSelectionError}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Mic className="w-5 h-5 text-brand-blue flex-shrink-0 mt-6" />
                      <div className="min-w-0 flex-1">
                        <label htmlFor="tf-mic-select" className="block text-sm font-semibold text-gray-900 mb-1">
                          Microphone <span className="text-destructive">*</span>
                        </label>
                        <select
                          id="tf-mic-select"
                          value={selectedMicId}
                          onChange={(e) => switchMicrophone(e.target.value)}
                          disabled={isSwitchingDevice || checksRunning}
                          className="w-full text-base sm:text-sm min-h-11 sm:min-h-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                        >
                          <option value="" disabled>Select your microphone…</option>
                          {micDevices.map((d, i) => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                          ))}
                        </select>
                        {/* The Microphone check cannot pass until an explicit
                            device is chosen here — "System Default" does not
                            count. Some browsers won't list real devices until
                            mic permission has been granted once, hence the hint. */}
                        {micDevices.length === 0 ? (
                          <p className="mt-1 text-xs text-gray-500">
                            No microphones detected yet — {onEnrollVoice
                              ? <>click <strong>Start recording</strong> above to allow microphone access</>
                              : <>click <strong>Run Check</strong> below to detect your connected microphone(s)</>}, then select one here.
                          </p>
                        ) : !selectedMicId && (
                          <p className="mt-1 text-xs text-destructive font-medium">
                            Required — select your microphone to complete the Microphone check.
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      Not seeing the right device? Choose a different one above, then click Retry on the affected checks.
                    </p>
                  </div>
                </div>
                {/* The run's result, right under Device Settings — where the
                    candidate fixes a failed check. */}
                    {!checksRunning && checksCompleted && allSystemPassed && (
                      <div className="flex items-center gap-2.5 rounded-xl border border-success-line bg-success-subtle px-3 py-2 min-w-0">
                        <span className="w-7 h-7 rounded-full bg-success text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-success-strong leading-tight">Everything Looks Good</p>
                          <p className="text-xs text-gray-600 leading-snug">Your device and system have passed the required checks. You&apos;re all set for the interview.</p>
                        </div>
                      </div>
                    )}
                    {!checksRunning && checksCompleted && !allSystemPassed && (
                      <div className="flex items-center gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.07] px-3 py-2 min-w-0">
                        <span className="w-7 h-7 rounded-full bg-destructive text-white flex items-center justify-center flex-shrink-0">
                          <XCircle className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-destructive leading-tight">Some checks failed</p>
                          <p className="text-xs text-gray-600 leading-snug">
                            {systemChecks.find((c) => c.id === 'webcam' && c.status === 'fail')
                              ? 'Camera access is required for the interview. Allow camera access in your browser settings, then click Retry on that check.'
                              : systemChecks.find((c) => c.id === 'microphone' && c.status === 'fail')
                              ? (!selectedMicId
                                  ? 'Select your microphone in Device Settings to complete this check.'
                                  : 'Click Retry on the Microphone check to verify your selected device.')
                              : 'Fix the issues and click Retry on each failed check to re-run just that one.'}
                          </p>
                        </div>
                      </div>
                    )}
              </div>

                {/* Checks — one top-down list in the right column (spans both
                    rows on lg); a row wraps its status/Retry under the label
                    when it runs out of room. */}
                <div ref={checksListRef} className="flex flex-col gap-2 min-w-0 lg:col-start-2 lg:row-start-1">
                  {systemChecks.map((check) => (
                    <div
                      key={check.id}
                      data-check-status={check.status}
                      className={`rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 ${
                        check.status === 'fail' ? 'border-destructive/30 bg-destructive/[0.04]' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 [&_svg]:w-5 [&_svg]:h-5 ${
                        check.status === 'fail' ? 'bg-destructive/10 text-destructive' : 'bg-brand-blue/10 text-brand-blue'
                      }`}>
                        {check.icon}
                      </span>

                      {/* Label + detail (the "Pending..." placeholder stays
                          hidden until a check actually runs) */}
                      <div className="flex-1 min-w-[8rem]">
                        <p className="text-sm font-semibold text-gray-900">{check.label}</p>
                        {check.detail && check.detail !== 'Pending...' && (
                          <p className="text-xs text-gray-500 line-clamp-2 break-words sm:line-clamp-1" title={check.detail}>{check.detail}</p>
                        )}
                      </div>

                      {/* Status + per-check retry (only that row re-runs) */}
                      <div className="flex-shrink-0 ml-auto flex items-center gap-2">
                        {check.status === 'pass' && (
                          <span className="inline-flex items-center gap-1.5 bg-success-subtle text-success text-xs font-semibold pl-1 pr-3 py-1 rounded-full">
                            <span className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center">
                              <Check className="w-3 h-3" strokeWidth={3} />
                            </span>
                            Working
                          </span>
                        )}
                        {check.status === 'fail' && (
                          <>
                            <span className="inline-flex items-center gap-1.5 bg-destructive/10 text-destructive text-xs font-semibold px-3 py-1 rounded-full">
                              <XCircle className="w-3.5 h-3.5" />
                              Failed
                            </span>
                            {/* Microphone can only get its first pass from the
                                real "Run Check" flow (see retryCheck's guard
                                above) — before that's completed once, a per-row
                                Retry would be a dead click, so it's hidden. */}
                            {/* Also hidden while the full run is still going:
                                a per-row retry then would run alongside it on
                                the same stream. */}
                            {!checksRunning && (check.id !== 'microphone' || checksCompleted) && (
                              <button
                                type="button"
                                onClick={() => retryCheck(check.id)}
                                className="inline-flex items-center gap-1 min-h-9 text-xs font-semibold text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/5 rounded-md px-3 py-1.5 transition-colors"
                                title={`Retry ${check.label}`}
                              >
                                <RefreshCw className="w-3 h-3" />
                                Retry
                              </button>
                            )}
                          </>
                        )}
                        {check.status === 'checking' && (
                          <Loader2 className="w-5 h-5 text-brand-blue animate-spin" />
                        )}
                        {check.status === 'pending' && (
                          <span className="text-xs font-medium text-gray-400">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer row: the overall result as a compact chip on the left
                    ("Everything Looks Good" or "Some checks failed", once the
                    run is done), running indicator / Continue on the right.
                    Stacks on small screens. */}
                {(checksRunning || checksCompleted) && (
                  <div ref={checksFooterRef} className="flex flex-col md:flex-row md:items-center md:justify-end gap-3 min-w-0 scroll-mb-4 lg:col-span-2 lg:row-start-2">
                    {checksRunning ? (
                      <div className="shrink-0 flex items-center justify-center gap-2 bg-gray-100 text-gray-500 font-semibold py-3 px-6 rounded-lg text-sm cursor-not-allowed">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Running checks…
                      </div>
                    ) : (
                      /* Proceed — enabled only when all checks passed. */
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        onClick={() => { if (allSystemPassed && voiceGateOk && !isProceedLoading && !micDisconnectedPopup) handleProceed(); }}
                        disabled={!allSystemPassed || !voiceGateOk || isProceedLoading || micDisconnectedPopup}
                        title={micDisconnectedPopup ? 'Please reconnect your microphone to continue' : !voiceGateOk ? 'Record your voice sample first' : !allSystemPassed ? 'Fix the failed checks above (click Retry on each)' : undefined}
                        className="w-full md:w-auto md:min-w-[240px] shrink-0 whitespace-normal h-auto min-h-11 py-2 text-center"
                      >
                        {isProceedLoading ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Finishing…</>
                        ) : micDisconnectedPopup ? (
                          <>Please reconnect your microphone</>
                        ) : !voiceGateOk ? (
                          <>Record your voice to continue</>
                        ) : (
                          <>Continue to Practice <ArrowRight className="w-4 h-4" /></>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              </div>
          </div>
        </section>

        {/* Hidden canvas for frame analysis */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Headset/microphone disconnected popup — appears the instant a
            PREVIOUSLY-PASSING microphone check goes dead (see the track
            'ended' + poll effect above). Continue is disabled via its own
            `disabled` attribute (not by this overlay blocking clicks) —
            deliberately NOT a full-screen click-blocking modal, so Device
            Settings stays reachable in case the candidate needs to pick a
            DIFFERENT microphone. Auto-dismisses once the device is back. */}
        {micDisconnectedPopup && (
          <div className="fixed top-4 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none">
            <div role="alert" aria-live="assertive" className="w-full max-w-md bg-white border border-destructive/30 rounded-2xl shadow-2xl p-5 flex items-start gap-3 pointer-events-auto">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 flex-shrink-0">
                <MicOff className="w-5 h-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <h3 className="text-gray-900 font-semibold text-sm mb-0.5">No microphone detected.</h3>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Please connect a microphone. This is detected automatically — if it&apos;s a
                  different device, you can also select it from Device Settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* External-mic-removed notice — a system/built-in mic was still
            available, so tryMicFallbackOrFail already switched to it silently
            and the check stayed 'pass'. Purely informational: never blocks
            Continue and dismisses itself. */}
        {/* Never stacked on the disconnect popup (same slot): that one wins. */}
        {micFallbackNotice && !micDisconnectedPopup && (
          <div className="fixed top-4 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none">
            <div role="status" aria-live="polite" className="w-full max-w-md bg-white border border-destructive/30 rounded-2xl shadow-2xl p-5 flex items-start gap-3 pointer-events-auto">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 flex-shrink-0">
                <MicOff className="w-5 h-5 text-destructive" />
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
