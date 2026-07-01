'use client';

/**
 * useProctoringMonitor — Performance-optimized proctoring hook.
 *
 * Architecture:
 *   Pipeline A (main thread): Interview UI — mic, TTS, WebSocket, avatar
 *   Pipeline B (workers):     Proctoring — video analysis, voice detection
 *
 * Key design rules:
 *   1. Workers post ONLY state changes, not per-frame results
 *   2. UI warnings go through ProctoringEventBus (no React state in parent)
 *   3. Backend logging is batched (every 5s) — every event is recorded
 *   4. Only track-state (camera/mic active) uses React state (needed for overlays)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ProctoringEventBus, ProctoringEventType } from '@/lib/ProctoringEventBus';
// Side-effect import: global guard for face-api.js / TF.js WebGL backend crashes.
import '@/lib/tfjs-rejection-guard';
import { loadFaceApiWithCpuBackend, type FaceApiModule } from '@/lib/face-api-loader';
import {
  assessCandidateFaceVisibility,
  createVideoFrameCanvas,
  FACE_API_MODEL_URLS,
  filterMultipleFaceCandidates,
  loadFaceApiNetWithFallback,
  MIN_CONFIDENT_FACE_SCORE,
  pickPrimaryFace,
} from '@/lib/proctoring/faceDetection';
import {
  readAssessmentFaceBaseline,
  writeAssessmentFaceBaseline,
} from '@/lib/proctoring/assessmentFaceBaseline';

// Re-export for consumers that import from here
export type { ProctoringEventType } from '@/lib/ProctoringEventBus';

// ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Returns true on mobile browsers (iOS + Android).
 * getDisplayMedia and keyboard-based screenshot detection are both
 * OS-level on mobile and completely invisible to the browser.
 */
const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && !/Macintosh/.test(navigator.userAgent));
};

const isFullscreenActive = (): boolean => {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
};

// ── Constants ────────────────────────────────────────────────────────────────
const BACKEND_FLUSH_INTERVAL = 5000; // ms — batch-flush proctoring events to backend
const VIDEO_CHECK_INTERVAL = 500;    // ms — sample video frames at 2 FPS for obstruction detection
const FACE_DETECTION_INTERVAL = 3000; // ms — sample face visibility every 3 seconds
const IDENTITY_BOOTSTRAP_CAPTURES = 3;
const IDENTITY_MISMATCH_THRESHOLD = 0.8;
const IDENTITY_MISMATCH_CONFIRMATIONS = 2;
const IDENTITY_EVENT_COOLDOWN_MS = 15000;
const GAZE_AWAY_CONFIRMATIONS = 3;
const GAZE_RESTORED_CONFIRMATIONS = 2;
const FACE_MISSING_EVENT_COOLDOWN_MS = 4000;
// ─────────────────────────────────────────────────────────────────────────────

// Legacy type kept for compatibility with existing imports
export interface ProctoringWarning {
  id: string;
  type: ProctoringEventType;
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
}

interface UseProctoringMonitorOptions {
  token: string;
  stream: MediaStream | null;
  enabled?: boolean;
  voiceDetectionSensitivity?: number;
  obstructionThreshold?: number;
  maxTabSwitches?: number;
  reportEvent?: (token: string, event: { event_type: string; timestamp: string; details: Record<string, any> }) => Promise<any>;
  // Per-feature flags from tenant proctoring settings
  screenshotBlocking?: boolean;
  copyPasteBlocking?: boolean;
  tabSwitchDetection?: boolean;
}

interface ProctoringState {
  isMonitoring: boolean;
  isCameraObstructed: boolean;
  isMicrophoneActive: boolean;
  isCameraActive: boolean;
}

// Voice detection specific settings
const VOICE_CHECK_INTERVAL = 1000;   // Sample every 1 s


// ==================== WORKER CODE ====================

const getVideoWorkerCode = () => `
  // Camera obstruction analysis — runs in worker, posts only state changes
  let isObstructed = false;
  let isFrozen = false;
  let consecutiveObstructed = 0;
  let consecutiveClear = 0;
  let consecutiveFrozen = 0;
  let consecutiveLive = 0;
  let previousBrightnessSample = null;
  const OBSTRUCT_THRESHOLD = 6;   // 6 × 500 ms = ~3 s to confirm obstruction
  const CLEAR_THRESHOLD = 3;      // 3 × 500 ms = ~1.5 s to confirm clear
  const FROZEN_THRESHOLD = 16;    // 16 × 500 ms = ~8 s to confirm freeze
  const LIVE_THRESHOLD = 3;       // 3 × 500 ms = ~1.5 s to clear freeze

  function analyze(imageData, width, height, threshold) {
    let totalBrightness = 0;
    let totalBrightnessSquared = 0;
    let minBrightness = 255;
    let maxBrightness = 0;
    const step = 16;
    const brightnessSample = [];

    for (let i = 0; i < imageData.length; i += step * 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      totalBrightnessSquared += brightness * brightness;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
      brightnessSample.push(brightness);
    }

    const sampledPixels = Math.floor(imageData.length / (step * 4));
    const avgBrightness = totalBrightness / sampledPixels;
    const variance = Math.max(0, (totalBrightnessSquared / sampledPixels) - (avgBrightness * avgBrightness));
    const brightnessStdDev = Math.sqrt(variance);
    const brightnessRange = maxBrightness - minBrightness;
    const isDark = avgBrightness < threshold;
    const isUniform = brightnessRange < 35 || brightnessStdDev < 12;
    const isLowTexture = brightnessRange < 45 && brightnessStdDev < 18;

    let meanFrameDelta = null;
    if (previousBrightnessSample && previousBrightnessSample.length === brightnessSample.length) {
      let deltaSum = 0;
      for (let i = 0; i < brightnessSample.length; i += 1) {
        deltaSum += Math.abs(brightnessSample[i] - previousBrightnessSample[i]);
      }
      meanFrameDelta = deltaSum / brightnessSample.length;
    }

    previousBrightnessSample = brightnessSample;

    return { isDark, isUniform, isLowTexture, avgBrightness, brightnessRange, brightnessStdDev, meanFrameDelta };
  }

  self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'ANALYZE_FRAME') {
      const result = analyze(
        new Uint8ClampedArray(data.imageData),
        data.width, data.height, data.threshold
      );
      const frameObstructed = result.isDark || result.isUniform || result.isLowTexture;

      if (frameObstructed) {
        consecutiveObstructed++;
        consecutiveClear = 0;
        if (!isObstructed && consecutiveObstructed >= OBSTRUCT_THRESHOLD) {
          isObstructed = true;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: {
              kind: 'obstruction',
              obstructed: true,
              reason: result.isDark ? 'too_dark' : (result.isUniform ? 'too_uniform' : 'low_texture'),
              avgBrightness: result.avgBrightness,
              brightnessRange: result.brightnessRange,
              brightnessStdDev: result.brightnessStdDev,
            }
          });
        }
      } else {
        consecutiveClear++;
        consecutiveObstructed = 0;
        if (isObstructed && consecutiveClear >= CLEAR_THRESHOLD) {
          isObstructed = false;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: {
              kind: 'obstruction',
              obstructed: false,
              avgBrightness: result.avgBrightness,
              brightnessRange: result.brightnessRange,
              brightnessStdDev: result.brightnessStdDev,
            }
          });
        }
      }

      const canEvaluateFreeze =
        !frameObstructed &&
        result.avgBrightness >= Math.max(20, data.threshold + 2) &&
        typeof result.meanFrameDelta === 'number';

      if (!canEvaluateFreeze) {
        consecutiveFrozen = 0;
        consecutiveLive = 0;
        if (isFrozen) {
          isFrozen = false;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: {
              kind: 'freeze',
              frozen: false,
              meanFrameDelta: result.meanFrameDelta,
            }
          });
        }
      } else if (result.meanFrameDelta < 0.75) {
        consecutiveFrozen++;
        consecutiveLive = 0;
        if (!isFrozen && consecutiveFrozen >= FROZEN_THRESHOLD) {
          isFrozen = true;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: {
              kind: 'freeze',
              frozen: true,
              meanFrameDelta: result.meanFrameDelta,
              durationMs: consecutiveFrozen * 500,
            }
          });
        }
      } else {
        consecutiveLive++;
        consecutiveFrozen = 0;
        if (isFrozen && consecutiveLive >= LIVE_THRESHOLD) {
          isFrozen = false;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: {
              kind: 'freeze',
              frozen: false,
              meanFrameDelta: result.meanFrameDelta,
            }
          });
        }
      }
    } else if (type === 'SET_FREQUENCY') {
      // reserved for load-shedding
    } else if (type === 'RESET') {
      isObstructed = false;
      isFrozen = false;
      consecutiveObstructed = 0;
      consecutiveClear = 0;
      consecutiveFrozen = 0;
      consecutiveLive = 0;
      previousBrightnessSample = null;
    }
  };
  self.postMessage({ type: 'READY' });
`;

const getAudioWorkerCode = () => `
  // Voice detection — runs in worker, posts only state changes
  let isVoiceActive = false;
  let consecutiveVoice = 0;
  let consecutiveSilent = 0;
  const VOICE_THRESHOLD_FRAMES = 2;
  const SILENCE_THRESHOLD_FRAMES = 3;

  function analyzeVoice(frequencyData, threshold, sampleRate) {
    const bufferLength = frequencyData.length;
    const binSize = sampleRate / (bufferLength * 2);
    const speechStartBin = Math.floor(300 / binSize);
    const speechEndBin = Math.min(Math.floor(3000 / binSize), bufferLength);

    let sum = 0;
    for (let i = speechStartBin; i < speechEndBin; i++) {
      sum += frequencyData[i];
    }
    return sum / (speechEndBin - speechStartBin);
  }

  self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'ANALYZE_VOICE') {
      const avg = analyzeVoice(
        new Uint8Array(data.frequencyData),
        data.threshold, data.sampleRate
      );
      const detected = avg > data.threshold;

      if (detected) {
        consecutiveVoice++;
        consecutiveSilent = 0;
        if (!isVoiceActive && consecutiveVoice >= VOICE_THRESHOLD_FRAMES) {
          isVoiceActive = true;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: { voiceDetected: true, averageVolume: avg, threshold: data.threshold }
          });
        }
      } else {
        consecutiveSilent++;
        consecutiveVoice = 0;
        if (isVoiceActive && consecutiveSilent >= SILENCE_THRESHOLD_FRAMES) {
          isVoiceActive = false;
        }
      }
    } else if (type === 'RESET') {
      isVoiceActive = false;
      consecutiveVoice = 0;
      consecutiveSilent = 0;
    }
  };
  self.postMessage({ type: 'READY' });
`;

// ─────────────────────────────────────────────────────────────────────────────

export function useProctoringMonitor({
  token,
  stream,
  enabled = true,
  voiceDetectionSensitivity = 50,
  obstructionThreshold = 30,
  maxTabSwitches = 3,
  reportEvent,
  screenshotBlocking = true,
  copyPasteBlocking = true,
  tabSwitchDetection = true,
}: UseProctoringMonitorOptions) {
  // Minimal React state — only what InterviewUI overlays need
  const [state, setState] = useState<ProctoringState>({
    isMonitoring: false,
    isCameraObstructed: false,
    isMicrophoneActive: true,
    isCameraActive: true,
  });

  // Refs for props (prevent re-render cascades)
  const tokenRef = useRef(token);
  const streamRef = useRef(stream);
  const enabledRef = useRef(enabled);
  const reportEventRef = useRef(reportEvent);
  const voiceSensitivityRef = useRef(voiceDetectionSensitivity);
  const obstructionThresholdRef = useRef(obstructionThreshold);
  const maxTabSwitchesRef = useRef(maxTabSwitches);
  const isMonitoringRef = useRef(false);
  const isCameraObstructedRef = useRef(false);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { reportEventRef.current = reportEvent; }, [reportEvent]);
  useEffect(() => { voiceSensitivityRef.current = voiceDetectionSensitivity; }, [voiceDetectionSensitivity]);
  useEffect(() => { obstructionThresholdRef.current = obstructionThreshold; }, [obstructionThreshold]);
  useEffect(() => { maxTabSwitchesRef.current = maxTabSwitches; }, [maxTabSwitches]);

  // Worker refs
  const videoWorkerRef = useRef<Worker | null>(null);
  const audioWorkerRef = useRef<Worker | null>(null);

  // Intervals & cleanup refs
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const batchFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceDetectionCancelledRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // ==================== BACKEND EVENT QUEUE ====================
  // Every single event is queued here with full details. Flushed every 5 seconds.
  interface QueuedEvent {
    event_type: string;
    timestamp: string;
    severity: string;
    details: Record<string, any>;
  }
  const backendQueueRef = useRef<QueuedEvent[]>([]);
  const navigationSuppressionUntilRef = useRef(0);
  const lastTabSwitchEventAtRef = useRef(0);
  const tabSwitchCountRef = useRef(0);
  const tabSwitchThresholdReachedRef = useRef(false);
  const lastMouseMovementEventAtRef = useRef(0);
  const lastViewportExitAtRef = useRef(0);
  const lastAltKeyAtRef = useRef(0);
  const lastCtrlKeyAtRef = useRef(0);
  const lastTabKeyAtRef = useRef(0);
  const focusSwitchSignalUntilRef = useRef(0);
  const focusSwitchSignalLabelRef = useRef<string | null>(null);
  const lastPrintScreenKeyAtRef = useRef(0);
  const screenshotChordUntilRef = useRef(0);
  const screenshotChordLabelRef = useRef<string | null>(null);
  const screenshotSuppressionUntilRef = useRef(0);
  const lastScreenshotEventAtRef = useRef(0);
  const lastIdentityMismatchEventAtRef = useRef(0);
  const lastFaceMissingEventAtRef = useRef(0);
  const lastMetaKeyAtRef = useRef(0);
  const lastShiftKeyAtRef = useRef(0);
  const lastSKeyAtRef = useRef(0);

  // ==================== CORE: emitEvent ====================
  // 1. Always queues event for backend (every event recorded)
  // 2. Emits UI warning via EventBus for every emitted violation
  const emitEvent = useCallback((
    eventType: ProctoringEventType,
    details?: Record<string, any>,
  ) => {
    if (!enabledRef.current) return;

    const timestamp = new Date().toISOString();

    // 1. ALWAYS queue for backend — no event is ever lost
    backendQueueRef.current.push({
      event_type: eventType,
      timestamp,
      severity: getSeverity(eventType),
      details: details || {},
    });

    // 2. Show a warning for every emitted violation
    ProctoringEventBus.emit(eventType, details);
  }, []);

  const emitEventRef = useRef(emitEvent);
  useEffect(() => { emitEventRef.current = emitEvent; }, [emitEvent]);

  const beginNavigationSequence = useCallback((durationMs = 1500) => {
    navigationSuppressionUntilRef.current = Date.now() + durationMs;
  }, []);

  const isNavigationSequenceActive = useCallback(() => {
    return Date.now() < navigationSuppressionUntilRef.current;
  }, []);

  const emitTabSwitchEvent = useCallback((details?: Record<string, any>) => {
    const now = Date.now();
    beginNavigationSequence();

    // Keyboard shortcut + visibilitychange/blur often fire as one OS-level
    // sequence. Count that as a single tab switch violation.
    if (now - lastTabSwitchEventAtRef.current < 1200) {
      return false;
    }

    lastTabSwitchEventAtRef.current = now;
    tabSwitchCountRef.current += 1;
    const maxAllowed = Math.max(1, maxTabSwitchesRef.current || 3);
    const thresholdReached = tabSwitchCountRef.current >= maxAllowed;
    if (thresholdReached) {
      tabSwitchThresholdReachedRef.current = true;
    }
    emitEventRef.current('tab_switch', {
      ...details,
      tab_switch_count: tabSwitchCountRef.current,
      max_tab_switches: maxAllowed,
      threshold_reached: thresholdReached,
    });
    return true;
  }, [beginNavigationSequence]);

  const emitScreenshotEvent = useCallback((details?: Record<string, any>) => {
    const now = Date.now();
    screenshotSuppressionUntilRef.current = now + 1500;

    if (now - lastScreenshotEventAtRef.current < 1200) {
      return false;
    }

    lastScreenshotEventAtRef.current = now;
    emitEventRef.current('screenshot_attempt', details);
    return true;
  }, []);

  const emitMouseMovementEvent = useCallback((details?: Record<string, any>) => {
    const now = Date.now();
    if (now - lastMouseMovementEventAtRef.current < 1200) {
      return false;
    }

    lastMouseMovementEventAtRef.current = now;
    emitEventRef.current('mouse_movement', details);
    return true;
  }, []);

  const armFocusSwitchSignal = useCallback((label: string, windowMs = 1400) => {
    focusSwitchSignalUntilRef.current = Date.now() + windowMs;
    focusSwitchSignalLabelRef.current = label;
  }, []);

  const getRecentFocusSwitchSignal = useCallback(() => {
    const now = Date.now();

    if (now < focusSwitchSignalUntilRef.current && focusSwitchSignalLabelRef.current) {
      return focusSwitchSignalLabelRef.current;
    }

    if (now - lastTabKeyAtRef.current < 450 && now - lastAltKeyAtRef.current < 450) {
      return 'alt_tab_partial';
    }

    if (now - lastTabKeyAtRef.current < 450 && now - lastMetaKeyAtRef.current < 450) {
      return 'cmd_tab_partial';
    }

    if (now - lastTabKeyAtRef.current < 450 && now - lastCtrlKeyAtRef.current < 450) {
      return 'ctrl_tab_partial';
    }

    return null;
  }, []);

  const armScreenshotChord = useCallback((label: string, windowMs = 1200) => {
    screenshotChordUntilRef.current = Date.now() + windowMs;
    screenshotChordLabelRef.current = label;
  }, []);

  const getRecentScreenshotSignal = useCallback(() => {
    const now = Date.now();
    if (now - lastPrintScreenKeyAtRef.current < 1200) {
      return 'PrintScreen';
    }

    if (now < screenshotChordUntilRef.current && screenshotChordLabelRef.current) {
      return screenshotChordLabelRef.current;
    }

    const sawExplicitWindowsSnipShortcut =
      now - lastMetaKeyAtRef.current < 900 &&
      now - lastShiftKeyAtRef.current < 900 &&
      now - lastSKeyAtRef.current < 900;
    if (sawExplicitWindowsSnipShortcut) {
      return 'Win+Shift+S';
    }

    const sawExplicitLinuxSnipShortcut =
      now - lastAltKeyAtRef.current < 900 &&
      now - lastShiftKeyAtRef.current < 900 &&
      now - lastSKeyAtRef.current < 900;
    if (sawExplicitLinuxSnipShortcut) {
      return 'Alt+Shift+S';
    }

    const sawSoftWindowsSnipShortcut =
      now - lastMetaKeyAtRef.current < 700 &&
      now - lastShiftKeyAtRef.current < 700;
    if (sawSoftWindowsSnipShortcut) {
      return 'Win+Shift based capture';
    }

    return null;
  }, []);

  const maybeHandleRecentScreenshotSignal = useCallback((source: string, details?: Record<string, any>) => {
    const signalKey = getRecentScreenshotSignal();

    if (!signalKey) {
      return Date.now() < screenshotSuppressionUntilRef.current;
    }

    emitScreenshotEvent({
      key: signalKey,
      capture_type: 'screenshot',
      source,
      enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
      ...details,
    });
    return true;
  }, [emitScreenshotEvent, getRecentScreenshotSignal, screenshotBlocking]);

  // ==================== BACKEND BATCH FLUSH ====================
  const flushBackendQueue = useCallback(async () => {
    if (backendQueueRef.current.length === 0) return;

    const batch = [...backendQueueRef.current];
    backendQueueRef.current = [];

    const reporter = reportEventRef.current;
    if (!reporter) return;

    // Send each event individually (backend API expects single events)
    // But we're doing it in a batch cycle, not per-detection
    for (const event of batch) {
      try {
        await reporter(tokenRef.current, {
          event_type: event.event_type,
          timestamp: event.timestamp,
          details: {
            ...event.details,
            severity: event.severity,
          },
        });
      } catch (err) {
        console.error(`[PROCTORING] Failed to send event ${event.event_type}:`, err);
        // Re-queue failed event — cap at 50 to avoid unbounded growth on persistent failure
        if (backendQueueRef.current.length < 50) {
          backendQueueRef.current.push(event);
        } else {
          console.warn('[PROCTORING] Event queue full (50) — dropping event:', event.event_type);
        }
      }
    }

    if (batch.length > 0) {
      console.log(`[PROCTORING] Flushed ${batch.length} events to backend`);
    }
  }, []);

  // ==================== VIDEO WORKER ====================
  const setupVideoWorker = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const videoTracks = currentStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    try {
      const blob = new Blob([getVideoWorkerCode()], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      videoWorkerRef.current = new Worker(url);
      URL.revokeObjectURL(url); // Worker has its own copy — revoke to free memory

      videoWorkerRef.current.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'STATE_CHANGE') {
          if (data.kind === 'obstruction' && data.obstructed) {
            isCameraObstructedRef.current = true;
            setState(prev => prev.isCameraObstructed ? prev : { ...prev, isCameraObstructed: true });
            emitEventRef.current('camera_obstructed', {
              reason: data.reason,
              avgBrightness: data.avgBrightness,
              brightnessRange: data.brightnessRange,
            });
            const now = Date.now();
            if (now - lastFaceMissingEventAtRef.current >= FACE_MISSING_EVENT_COOLDOWN_MS) {
              lastFaceMissingEventAtRef.current = now;
              emitEventRef.current('face_missing', {
                method: 'video_worker',
                reason: 'camera_obstructed',
                obstruction_reason: data.reason,
                avgBrightness: data.avgBrightness,
                brightnessRange: data.brightnessRange,
              });
            }
          } else if (data.kind === 'obstruction') {
            isCameraObstructedRef.current = false;
            setState(prev => !prev.isCameraObstructed ? prev : { ...prev, isCameraObstructed: false });
          } else if (data.kind === 'freeze' && data.frozen) {
            emitEventRef.current('camera_frozen', {
              meanFrameDelta: data.meanFrameDelta,
              durationMs: data.durationMs,
            });
          }
        }
      };

      videoWorkerRef.current.onerror = (err) => {
        console.error('[PROCTORING] Video worker error:', err);
      };

      // Create hidden video + canvas for frame capture
      videoRef.current = document.createElement('video');
      videoRef.current.srcObject = currentStream;
      videoRef.current.muted = true;
      videoRef.current.play();

      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 160;
      canvasRef.current.height = 120;
      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Send frames to worker at low frequency
      videoRef.current.onloadedmetadata = () => {
        videoIntervalRef.current = setInterval(() => {
          if (!isMonitoringRef.current || !videoRef.current || !canvasRef.current || !videoWorkerRef.current) return;
          if (
            document.hidden ||
            document.visibilityState === 'hidden' ||
            videoRef.current.paused ||
            videoRef.current.readyState < 2 ||
            videoRef.current.videoWidth === 0
          ) {
            videoWorkerRef.current.postMessage({ type: 'RESET' });
            return;
          }

          ctx.drawImage(videoRef.current, 0, 0, 160, 120);
          const imageData = ctx.getImageData(0, 0, 160, 120);
          const dataToSend = new Uint8ClampedArray(imageData.data);

          videoWorkerRef.current.postMessage({
            type: 'ANALYZE_FRAME',
            data: {
              imageData: dataToSend.buffer,
              width: 160,
              height: 120,
              threshold: obstructionThresholdRef.current,
            },
          }, [dataToSend.buffer]);
        }, VIDEO_CHECK_INTERVAL);

        console.log(`[PROCTORING] Video worker started (${VIDEO_CHECK_INTERVAL}ms interval)`);
      };
    } catch (err) {
      console.error('[PROCTORING] Failed to setup video worker:', err);
    }
  }, []);

  // ==================== AUDIO WORKER ====================
  const setupAudioWorker = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[PROCTORING] No audio tracks — voice detection skipped');
      return;
    }

    try {
      const blob = new Blob([getAudioWorkerCode()], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      audioWorkerRef.current = new Worker(url);
      URL.revokeObjectURL(url); // Worker has its own copy — revoke to free memory

      audioWorkerRef.current.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'STATE_CHANGE' && data.voiceDetected) {
          emitEventRef.current('voice_detected', {
            averageVolume: data.averageVolume,
            threshold: data.threshold,
          });
        }
      };

      audioWorkerRef.current.onerror = (err) => {
        console.error('[PROCTORING] Audio worker error:', err);
      };

      // Setup AudioContext + AnalyserNode to feed frequency data to the worker
      // Safari requires AudioContext to be created / resumed from a user-gesture context.
      // We attach a one-shot interaction listener so the context resumes on the next
      // tap/click/keydown after creation (covers the strict iOS/Safari case).
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (ctxErr) {
        console.error('[PROCTORING] AudioContext creation failed:', ctxErr);
        return;
      }
      if (audioContextRef.current.state === 'suspended') {
        const resumeCtx = () => {
          audioContextRef.current?.resume().catch(() => {});
          document.removeEventListener('click', resumeCtx, true);
          document.removeEventListener('touchstart', resumeCtx, true);
          document.removeEventListener('keydown', resumeCtx, true);
        };
        document.addEventListener('click', resumeCtx, { capture: true, once: true });
        document.addEventListener('touchstart', resumeCtx, { capture: true, once: true });
        document.addEventListener('keydown', resumeCtx, { capture: true, once: true });
      }
      const source = audioContextRef.current.createMediaStreamSource(currentStream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const sampleRate = audioContextRef.current.sampleRate;

      voiceIntervalRef.current = setInterval(() => {
        if (!isMonitoringRef.current || !analyserRef.current || !audioWorkerRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const threshold = 128 - (voiceSensitivityRef.current * 1.28);
        const dataToSend = new Uint8Array(dataArray);

        audioWorkerRef.current.postMessage({
          type: 'ANALYZE_VOICE',
          data: {
            frequencyData: dataToSend.buffer,
            threshold,
            sampleRate,
          },
        }, [dataToSend.buffer]);
      }, VOICE_CHECK_INTERVAL);

      console.log(`[PROCTORING] Audio worker started (${VOICE_CHECK_INTERVAL}ms interval)`);
    } catch (error) {
      console.error('[PROCTORING] Failed to initialize audio worker:', error);
    }
  }, []);

  // ==================== MULTIPLE FACES DETECTION ====================

  const setupFaceDetection = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const videoTracks = currentStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    // Reset cancellation flag for this setup attempt
    faceDetectionCancelledRef.current = false;

    const video = document.createElement('video');
    video.srcObject = currentStream;
    video.muted = true;
    faceVideoRef.current = video;

    video.play().then(async () => {
      try {
        let consecutiveNoFace = 0;
        let consecutiveDetectionFailures = 0;
        let consecutiveGazeAway = 0;
        let consecutiveGazeRestored = 0;
        let consecutiveIdentityMismatch = 0;
        let faceApiBusy = false;
        let lastKnownFaceCount = 0;
        let identityBaseline = readAssessmentFaceBaseline(tokenRef.current);
        const bootstrapDescriptors: Float32Array[] = [];
        const NO_FACE_THRESHOLD = 1; // 1 × 3 s = 3 s before emitting face_missing
        const DETECTION_FAILURE_THRESHOLD = 2; // Treat repeated detector failures as face missing
        let advancedFaceApi: FaceApiModule | null = null;
        let advancedLoadPromise: Promise<FaceApiModule | null> | null = null;

        const resetFaceMissingState = () => {
          consecutiveNoFace = 0;
          consecutiveDetectionFailures = 0;
        };

        const resetAdvancedStates = () => {
          consecutiveGazeAway = 0;
          consecutiveGazeRestored = 0;
          consecutiveIdentityMismatch = 0;
        };

        const maybeEmitFaceMissing = (method: string, reason: string, extraDetails?: Record<string, unknown>) => {
          consecutiveNoFace++;
          consecutiveDetectionFailures = 0;
          if (consecutiveNoFace >= NO_FACE_THRESHOLD) {
            const now = Date.now();
            if (now - lastFaceMissingEventAtRef.current < FACE_MISSING_EVENT_COOLDOWN_MS) {
              consecutiveNoFace = 0;
              return;
            }
            lastFaceMissingEventAtRef.current = now;
            consecutiveNoFace = 0;
            resetAdvancedStates();
            emitEventRef.current('face_missing', {
              method,
              reason,
              camera_obstructed: isCameraObstructedRef.current,
              ...extraDetails,
            });
            console.log(`[PROCTORING] Face missing (${method}, ${reason})`);
          }
        };

        const handleFaceCount = (
          count: number,
          method: string,
          extraDetails?: Record<string, unknown>,
        ) => {
          lastKnownFaceCount = count;
          if (count >= 2) {
            resetFaceMissingState();
            resetAdvancedStates();
            emitEventRef.current('multiple_faces', { face_count: count, method });
            if (extraDetails?.candidate_visible === false) {
              const reason = typeof extraDetails?.reason === 'string'
                ? extraDetails.reason
                : 'candidate_not_visible';
              maybeEmitFaceMissing(method, reason, extraDetails);
            }
            console.log(`[PROCTORING] Multiple faces: ${count} (${method})`);
          } else if (count === 0) {
            const reason = typeof extraDetails?.reason === 'string'
              ? extraDetails.reason
              : 'no_face_detected';
            maybeEmitFaceMissing(method, reason, {
              camera_obstructed: isCameraObstructedRef.current,
              ...extraDetails,
            });
          } else {
            resetFaceMissingState();
          }
        };

        const handleDetectionFailure = (method: string, error: unknown) => {
          lastKnownFaceCount = 0;
          consecutiveDetectionFailures++;
          if (consecutiveDetectionFailures >= DETECTION_FAILURE_THRESHOLD) {
            maybeEmitFaceMissing(method, 'detection_failed', {
              camera_obstructed: isCameraObstructedRef.current,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };

        const ensureAdvancedFaceApi = async (): Promise<FaceApiModule | null> => {
          if (advancedFaceApi) return advancedFaceApi;
          if (advancedLoadPromise) return advancedLoadPromise;

          advancedLoadPromise = (async () => {
            try {
              const faceapi = await loadFaceApiWithCpuBackend();
              await Promise.all([
                loadFaceApiNetWithFallback(faceapi.nets.tinyFaceDetector, FACE_API_MODEL_URLS),
                loadFaceApiNetWithFallback(faceapi.nets.faceLandmark68Net, FACE_API_MODEL_URLS),
                loadFaceApiNetWithFallback(faceapi.nets.faceRecognitionNet, FACE_API_MODEL_URLS),
              ]);

              advancedFaceApi = faceapi;
              return faceapi;
            } catch (error) {
              console.warn('[PROCTORING] Advanced face analysis models unavailable:', error);
              return null;
            } finally {
              advancedLoadPromise = null;
            }
          })();

          return advancedLoadPromise;
        };

        const averageDescriptors = (descriptors: Float32Array[]): Float32Array => {
          const average = new Float32Array(descriptors[0].length);
          for (const descriptor of descriptors) {
            for (let i = 0; i < descriptor.length; i += 1) {
              average[i] += descriptor[i];
            }
          }
          for (let i = 0; i < average.length; i += 1) {
            average[i] /= descriptors.length;
          }
          return average;
        };

        const classifyGazeDirection = (
          landmarkPositions: Array<{ x: number; y: number }>,
        ): { lookingAway: boolean; direction: string; noseOffsetX: number; noseOffsetY: number } | null => {
          const noseTip = landmarkPositions[30];
          const leftEyeOuter = landmarkPositions[36];
          const rightEyeOuter = landmarkPositions[45];
          const bridgeTop = landmarkPositions[27];
          const chin = landmarkPositions[8];
          if (!noseTip || !leftEyeOuter || !rightEyeOuter || !bridgeTop || !chin) return null;

          const faceWidth = Math.max(Math.abs(rightEyeOuter.x - leftEyeOuter.x), 1);
          const faceHeight = Math.max(Math.abs(chin.y - bridgeTop.y), 1);
          const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
          const faceMidY = (bridgeTop.y + chin.y) / 2;
          const noseOffsetX = (noseTip.x - eyeMidX) / faceWidth;
          const noseOffsetY = (noseTip.y - faceMidY) / faceHeight;

          const horizontalAway = Math.abs(noseOffsetX) > 0.16;
          const upwardAway = noseOffsetY < -0.12;
          const downwardAway = noseOffsetY > 0.2;
          const lookingAway = horizontalAway || upwardAway || downwardAway;

          let direction = 'center';
          if (horizontalAway) {
            direction = noseOffsetX > 0 ? 'right' : 'left';
          }
          if (upwardAway) {
            direction = direction === 'center' ? 'up' : `${direction}_up`;
          } else if (downwardAway) {
            direction = direction === 'center' ? 'down' : `${direction}_down`;
          }

          return { lookingAway, direction, noseOffsetX, noseOffsetY };
        };

        const runAdvancedFaceAnalysis = async () => {
          if (
            !isMonitoringRef.current ||
            !faceVideoRef.current ||
            faceDetectionCancelledRef.current ||
            document.hidden ||
            document.visibilityState === 'hidden' ||
            isCameraObstructedRef.current ||
            lastKnownFaceCount !== 1
          ) {
            resetAdvancedStates();
            return;
          }

          if (faceApiBusy) return;
          faceApiBusy = true;

          try {
            if (!identityBaseline) {
              identityBaseline = readAssessmentFaceBaseline(tokenRef.current);
            }

            const faceapi = await ensureAdvancedFaceApi();
            if (!faceapi || !faceVideoRef.current || faceDetectionCancelledRef.current) {
              return;
            }

            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
            let frameWidth = faceVideoRef.current.videoWidth;
            let frameHeight = faceVideoRef.current.videoHeight;
            let usedSnapshot = false;
            let detections;

            try {
              detections = await faceapi
                .detectAllFaces(faceVideoRef.current, options)
                .withFaceLandmarks()
                .withFaceDescriptors();
            } catch (videoError) {
              const snapshot = createVideoFrameCanvas(faceVideoRef.current);
              if (!snapshot) {
                throw videoError;
              }
              detections = await faceapi
                .detectAllFaces(snapshot, options)
                .withFaceLandmarks()
                .withFaceDescriptors();
              frameWidth = snapshot.width;
              frameHeight = snapshot.height;
              usedSnapshot = true;
            }

            if (!detections.length && !usedSnapshot) {
              const snapshot = createVideoFrameCanvas(faceVideoRef.current);
              if (snapshot) {
                detections = await faceapi
                  .detectAllFaces(snapshot, options)
                  .withFaceLandmarks()
                  .withFaceDescriptors();
                frameWidth = snapshot.width;
                frameHeight = snapshot.height;
              }
            }

            const typedDetections = detections as Array<{
              detection: {
                box: { x: number; y: number; width: number; height: number };
                score?: number;
              };
              descriptor: Float32Array;
              landmarks: { positions: Array<{ x: number; y: number }> };
            }>;
            const confidentDetections = typedDetections.filter((candidate) => {
              const score = candidate.detection?.score;
              return typeof score !== 'number' || score >= MIN_CONFIDENT_FACE_SCORE;
            });
            const detection = pickPrimaryFace(
              confidentDetections,
              (candidate) => {
                const box = candidate.detection?.box;
                return box
                  ? {
                      x: box.x,
                      y: box.y,
                      width: box.width,
                      height: box.height,
                      score: candidate.detection?.score,
                    }
                  : null;
              },
              frameWidth,
              frameHeight,
            );
            const primaryVisibility = assessCandidateFaceVisibility(
              detection
                ? {
                    x: detection.detection.box.x,
                    y: detection.detection.box.y,
                    width: detection.detection.box.width,
                    height: detection.detection.box.height,
                    score: detection.detection.score,
                  }
                : null,
              frameWidth,
              frameHeight,
            );

            if (!primaryVisibility.visible) {
              maybeEmitFaceMissing('face-api.js-advanced', primaryVisibility.reason, {
                detector_hint_face_count: lastKnownFaceCount,
                primary_face_metrics: primaryVisibility.metrics,
              });
              resetAdvancedStates();
              return;
            }

            if (!detection?.descriptor || !detection.landmarks) {
              if (lastKnownFaceCount === 1) {
                maybeEmitFaceMissing('face-api.js-advanced', 'advanced_face_missing', {
                  detector_hint_face_count: lastKnownFaceCount,
                });
              }
              resetAdvancedStates();
              return;
            }

            const gaze = classifyGazeDirection(detection.landmarks.positions);
            if (gaze?.lookingAway) {
              consecutiveGazeAway += 1;
              consecutiveGazeRestored = 0;
              if (consecutiveGazeAway >= GAZE_AWAY_CONFIRMATIONS) {
                consecutiveGazeAway = 0;
                emitEventRef.current('gaze_away', {
                  direction: gaze.direction,
                  noseOffsetX: Number(gaze.noseOffsetX.toFixed(3)),
                  noseOffsetY: Number(gaze.noseOffsetY.toFixed(3)),
                });
              }
            } else {
              consecutiveGazeRestored += 1;
              if (consecutiveGazeRestored >= GAZE_RESTORED_CONFIRMATIONS) {
                consecutiveGazeAway = 0;
                consecutiveGazeRestored = 0;
              }
            }

            if (identityBaseline?.descriptor) {
              const distance = faceapi.euclideanDistance(
                Array.from(identityBaseline.descriptor),
                Array.from(detection.descriptor),
              );

              if (distance > IDENTITY_MISMATCH_THRESHOLD) {
                consecutiveIdentityMismatch += 1;
                if (
                  consecutiveIdentityMismatch >= IDENTITY_MISMATCH_CONFIRMATIONS &&
                  Date.now() - lastIdentityMismatchEventAtRef.current > IDENTITY_EVENT_COOLDOWN_MS
                ) {
                  consecutiveIdentityMismatch = 0;
                  lastIdentityMismatchEventAtRef.current = Date.now();
                  emitEventRef.current('identity_mismatch', {
                    distance: Number(distance.toFixed(3)),
                    baseline_source: identityBaseline.source,
                    baseline_created_at: identityBaseline.createdAt,
                  });
                }
              } else {
                consecutiveIdentityMismatch = 0;
              }
            } else {
              bootstrapDescriptors.push(detection.descriptor);
              if (bootstrapDescriptors.length >= IDENTITY_BOOTSTRAP_CAPTURES) {
                const baselineDescriptor = averageDescriptors(
                  bootstrapDescriptors.slice(0, IDENTITY_BOOTSTRAP_CAPTURES),
                );
                writeAssessmentFaceBaseline(tokenRef.current, baselineDescriptor, 'assessment_bootstrap');
                identityBaseline = {
                  descriptor: baselineDescriptor,
                  source: 'assessment_bootstrap',
                  createdAt: new Date().toISOString(),
                };
                bootstrapDescriptors.length = 0;
              }
            }
          } catch (error) {
            console.warn('[PROCTORING] Advanced face analysis skipped:', error);
          } finally {
            faceApiBusy = false;
          }
        };

        const startAdvancedFaceAnalysis = () => {
          if (faceAnalysisIntervalRef.current) {
            clearInterval(faceAnalysisIntervalRef.current);
            faceAnalysisIntervalRef.current = null;
          }

          const startTimer = window.setTimeout(() => {
            void runAdvancedFaceAnalysis();
            faceAnalysisIntervalRef.current = setInterval(() => {
              void runAdvancedFaceAnalysis();
            }, FACE_DETECTION_INTERVAL);
          }, Math.floor(FACE_DETECTION_INTERVAL / 2));

          faceAnalysisIntervalRef.current = startTimer as unknown as NodeJS.Timeout;
          console.log('[PROCTORING] Advanced face analysis started');
        };

        // ── Path A: Native FaceDetector (Chrome/Edge, no model download) ──
        if ('FaceDetector' in window) {
          type NativeFaceDetector = {
            detect: (input: HTMLVideoElement) => Promise<ArrayLike<unknown>>;
          };
          type NativeFaceDetectorCtor = new (options: {
            fastMode?: boolean;
            maxDetectedFaces?: number;
          }) => NativeFaceDetector;

          const FaceDetectorAPI = (window as Window & {
            FaceDetector?: NativeFaceDetectorCtor;
          }).FaceDetector;
          if (!FaceDetectorAPI) return;

          const detector = new FaceDetectorAPI({ fastMode: true, maxDetectedFaces: 5 });

          // Guard: component may have unmounted while video was preparing
          if (faceDetectionCancelledRef.current) return;

          faceIntervalRef.current = setInterval(async () => {
            if (!isMonitoringRef.current || !faceVideoRef.current) return;
            try {
              const faces = await detector.detect(faceVideoRef.current);
              const multipleFaceCandidates = filterMultipleFaceCandidates(
                Array.from(faces),
                (face) => {
                  const box = (face as { boundingBox?: DOMRectReadOnly | DOMRect }).boundingBox;
                  return box
                    ? { x: box.x, y: box.y, width: box.width, height: box.height }
                    : null;
                },
                faceVideoRef.current.videoWidth,
                faceVideoRef.current.videoHeight,
              );
              const primaryFace = pickPrimaryFace(
                multipleFaceCandidates,
                (face) => {
                  const box = (face as { boundingBox?: DOMRectReadOnly | DOMRect }).boundingBox;
                  return box
                    ? { x: box.x, y: box.y, width: box.width, height: box.height }
                    : null;
                },
                faceVideoRef.current.videoWidth,
                faceVideoRef.current.videoHeight,
              );
              const primaryVisibility = assessCandidateFaceVisibility(
                primaryFace
                  ? (() => {
                      const box = (primaryFace as { boundingBox?: DOMRectReadOnly | DOMRect }).boundingBox;
                      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
                    })()
                  : null,
                faceVideoRef.current.videoWidth,
                faceVideoRef.current.videoHeight,
              );
              const visibleCount =
                multipleFaceCandidates.length > 1
                  ? multipleFaceCandidates.length
                  : (primaryVisibility.visible ? 1 : 0);
              handleFaceCount(visibleCount, 'native', {
                reason: primaryVisibility.visible ? 'ok' : primaryVisibility.reason,
                candidate_visible: primaryVisibility.visible,
                significant_face_count: multipleFaceCandidates.length,
                primary_face_metrics: primaryVisibility.metrics,
              });
            } catch (error) {
              handleDetectionFailure('native', error);
            }
          }, FACE_DETECTION_INTERVAL);

          startAdvancedFaceAnalysis();

          console.log('[PROCTORING] Face detection started (native FaceDetector — Chrome/Edge)');
          return;
        }

        // ── Path B: face-api.js with TinyFaceDetector (Firefox / Safari / all others) ──
        const faceapi = await loadFaceApiWithCpuBackend();

        try {
          await loadFaceApiNetWithFallback(faceapi.nets.tinyFaceDetector, FACE_API_MODEL_URLS);
        } catch (loadErr) {
          console.error('[PROCTORING] TinyFaceDetector model could not be loaded from any source — face detection unavailable on this browser', loadErr);
          return;
        }

        // Guard: component may have unmounted during model download (~190 KB fetch)
        if (faceDetectionCancelledRef.current) {
          console.log('[PROCTORING] Face detection cancelled after model load — component unmounted');
          return;
        }

        const detectorOptions = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });

        faceIntervalRef.current = setInterval(async () => {
          if (!isMonitoringRef.current || !faceVideoRef.current || faceApiBusy) return;
          faceApiBusy = true;
          try {
            let frameWidth = faceVideoRef.current.videoWidth;
            let frameHeight = faceVideoRef.current.videoHeight;
            let usedSnapshot = false;
            let detections;

            try {
              detections = await faceapi.detectAllFaces(faceVideoRef.current, detectorOptions);
            } catch (videoError) {
              const snapshot = createVideoFrameCanvas(faceVideoRef.current);
              if (!snapshot) {
                throw videoError;
              }
              detections = await faceapi.detectAllFaces(snapshot, detectorOptions);
              frameWidth = snapshot.width;
              frameHeight = snapshot.height;
              usedSnapshot = true;
            }

            if (!detections.length && !usedSnapshot) {
              const snapshot = createVideoFrameCanvas(faceVideoRef.current);
              if (snapshot) {
                detections = await faceapi.detectAllFaces(snapshot, detectorOptions);
                frameWidth = snapshot.width;
                frameHeight = snapshot.height;
              }
            }

            const typedDetections = detections as Array<{
              box: { x: number; y: number; width: number; height: number };
              score?: number;
            }>;
            const confidentDetections = typedDetections.filter(
              detection => (typeof detection.score === 'number' ? detection.score >= MIN_CONFIDENT_FACE_SCORE : true),
            );
            const multipleFaceDetections = filterMultipleFaceCandidates(
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
            const primaryDetection = pickPrimaryFace(
              multipleFaceDetections,
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
            const primaryVisibility = assessCandidateFaceVisibility(
              primaryDetection
                ? {
                    x: primaryDetection.box.x,
                    y: primaryDetection.box.y,
                    width: primaryDetection.box.width,
                    height: primaryDetection.box.height,
                    score: primaryDetection.score,
                  }
                : null,
              frameWidth,
              frameHeight,
            );
            const visibleCount =
              multipleFaceDetections.length > 1
                ? multipleFaceDetections.length
                : (primaryVisibility.visible ? 1 : 0);

            handleFaceCount(visibleCount, 'face-api.js', {
              reason: multipleFaceDetections.length === 0 && detections.length > 0
                ? 'low_confidence_face'
                : (primaryVisibility.visible ? 'ok' : primaryVisibility.reason),
              candidate_visible: primaryVisibility.visible,
              raw_face_count: detections.length,
              confident_face_count: confidentDetections.length,
              significant_face_count: multipleFaceDetections.length,
              primary_face_metrics: primaryVisibility.metrics,
            });
          } catch (error) {
            handleDetectionFailure('face-api.js', error);
          } finally {
            faceApiBusy = false;
          }
        }, FACE_DETECTION_INTERVAL);

        advancedFaceApi = faceapi;
        startAdvancedFaceAnalysis();

        console.log('[PROCTORING] Face detection started (face-api.js — Firefox/Safari/Opera compatible)');
      } catch (err) {
        console.error('[PROCTORING] Face detection setup failed:', err);
      }
    }).catch(err => {
      console.error('[PROCTORING] Face detection video failed to play:', err);
    });
  }, []); // uses refs internally

  // ==================== EVENT-DRIVEN DETECTIONS (main thread, cheap) ====================

  const setupTrackMonitoring = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    currentStream.getVideoTracks().forEach(track => {
      track.onended = () => {
        setState(prev => ({ ...prev, isCameraActive: false }));
        emitEventRef.current('camera_disabled', { reason: 'track_ended' });
      };
      track.onmute = () => {
        setState(prev => ({ ...prev, isCameraActive: false }));
        emitEventRef.current('camera_disabled', { reason: 'track_muted' });
      };
      track.onunmute = () => {
        setState(prev => ({ ...prev, isCameraActive: true }));
      };
    });

    currentStream.getAudioTracks().forEach(track => {
      track.onended = () => {
        setState(prev => ({ ...prev, isMicrophoneActive: false }));
        emitEventRef.current('microphone_disabled', { reason: 'track_ended' });
      };
      track.onmute = () => {
        setState(prev => ({ ...prev, isMicrophoneActive: false }));
        emitEventRef.current('microphone_disabled', { reason: 'track_muted' });
      };
      track.onunmute = () => {
        setState(prev => ({ ...prev, isMicrophoneActive: true }));
      };
    });

    console.log('[PROCTORING] Track monitoring started');
  }, []);

  const setupTabSwitchDetection = useCallback(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (maybeHandleRecentScreenshotSignal('visibilitychange_heuristic', {
          hidden: true,
        })) {
          return;
        }
        emitTabSwitchEvent({
          hidden: true,
          method: 'visibilitychange',
        });
      }
    };
    const handleBlur = () => {
      window.setTimeout(() => {
        if (maybeHandleRecentScreenshotSignal('blur_heuristic', {
          hidden: document.hidden,
          visibilityState: document.visibilityState,
        })) {
          return;
        }

        // A real browser tab switch frequently fires `blur` first and only then
        // flips `document.hidden`. Give visibility state a brief grace window,
        // then classify any now-hidden page as a tab switch rather than a
        // generic focus-loss event. `emitTabSwitchEvent` already deduplicates
        // against the visibilitychange path, so this safely acts as a fallback.
        const recentFocusSwitch = getRecentFocusSwitchSignal();
        const recentlyExitedViewport = Date.now() - lastViewportExitAtRef.current < 250;

        if (document.hidden || document.visibilityState === 'hidden' || recentFocusSwitch || recentlyExitedViewport) {
          emitTabSwitchEvent({
            hidden: document.hidden || document.visibilityState === 'hidden',
            method: recentFocusSwitch ? 'blur_focus_switch_heuristic' : 'blur_visibility_fallback',
            source: recentlyExitedViewport ? 'viewport_exit' : 'blur',
            shortcut: recentFocusSwitch || undefined,
          });
          return;
        }
        if (isNavigationSequenceActive()) return;
        if (Date.now() < screenshotSuppressionUntilRef.current) return;
        emitEventRef.current('window_blur', { reason: 'assessment_window_focus_lost' });
      }, 150);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    console.log('[PROCTORING] Tab switch detection started');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [emitTabSwitchEvent, getRecentFocusSwitchSignal, isNavigationSequenceActive, maybeHandleRecentScreenshotSignal]);

  const setupCopyPasteDetection = useCallback(() => {
    const block = (e: Event, type: ProctoringEventType, details?: Record<string, any>) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      emitEventRef.current(type, details);
      return false;
    };

    // Timestamps to deduplicate clipboard events.
    // Firefox (and sometimes Safari) fires BOTH the keydown AND the clipboard event
    // (copy/paste/cut) even after e.preventDefault() on keydown — causing each key
    // press to count as 2 violations. We suppress the clipboard event if the keydown
    // handler already emitted within the last 100 ms.
    let lastCopyKeyTime = 0;
    let lastPasteKeyTime = 0;
    let lastCutKeyTime = 0;
    let lastDragCopyTime = 0;
    let lastDragDropTime = 0;

    const handleCopy = (e: ClipboardEvent) => {
      if (Date.now() - lastCopyKeyTime < 100) {
        // Already emitted by keydown; just block without double-counting
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
      if ((e as any).clipboardData) (e as any).clipboardData.clearData();
      return block(e, 'copy_attempt', { selectedText: window.getSelection()?.toString()?.substring(0, 100) });
    };
    const handlePaste = (e: ClipboardEvent) => {
      if (Date.now() - lastPasteKeyTime < 100) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
      if ((e as any).clipboardData) (e as any).clipboardData.clearData();
      return block(e, 'paste_attempt', {});
    };
    const handleCut = (e: ClipboardEvent) => {
      if (Date.now() - lastCutKeyTime < 100) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
      return block(e, 'copy_attempt', { action: 'cut' });
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      return false;
    };
    const handleDragStart = (e: DragEvent) => {
      const now = Date.now();
      if (now - lastDragCopyTime < 250) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
      lastDragCopyTime = now;
      return block(e, 'copy_attempt', {
        method: 'drag_drop',
        action: 'dragstart',
        selectedText: window.getSelection()?.toString()?.substring(0, 100),
      });
    };
    const swallowDragMovement = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      return false;
    };
    const handleDrop = (e: DragEvent) => {
      const now = Date.now();
      if (now - lastDragDropTime < 250) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
      lastDragDropTime = now;
      const itemCount = e.dataTransfer?.items?.length ?? 0;
      const fileCount = e.dataTransfer?.files?.length ?? 0;
      return block(e, 'paste_attempt', {
        method: 'drag_drop',
        action: 'drop',
        item_count: itemCount,
        file_count: fileCount,
        has_files: fileCount > 0,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const normalizedKey = e.key.toLowerCase();

      if (normalizedKey === 'alt') {
        lastAltKeyAtRef.current = now;
      }
      if (normalizedKey === 'control') {
        lastCtrlKeyAtRef.current = now;
      }
      if (normalizedKey === 'tab') {
        lastTabKeyAtRef.current = now;
      }

      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        armFocusSwitchSignal('alt_tab_keyboard');
        emitTabSwitchEvent({ method: 'alt_tab', source: 'keyboard' });
        return false;
      }
      if (e.altKey && e.key === 'F4') {
        beginNavigationSequence();
        return block(e, 'window_blur', { method: 'alt_f4' });
      }
      if (e.metaKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        armFocusSwitchSignal('cmd_tab_keyboard');
        emitTabSwitchEvent({ method: 'cmd_tab', source: 'keyboard' });
        return false;
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        armFocusSwitchSignal('ctrl_tab_keyboard');
        emitTabSwitchEvent({ method: 'ctrl_tab', source: 'keyboard' });
        return false;
      }
      if (e.key === 'Meta' || e.key === 'OS') {
        // Allow the OS/meta key event to reach the screenshot monitor.
        // Blocking it here would prevent Win+Shift+S style attempts from
        // being classified correctly when screenshot blocking is disabled.
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        lastCopyKeyTime = Date.now();
        return block(e, 'copy_attempt', { method: 'keyboard' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        lastPasteKeyTime = Date.now();
        return block(e, 'paste_attempt', { method: 'keyboard' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        lastCutKeyTime = Date.now();
        return block(e, 'copy_attempt', { method: 'keyboard', action: 'cut' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
    };

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('dragenter', swallowDragMovement, true);
    document.addEventListener('dragover', swallowDragMovement, true);
    document.addEventListener('drop', handleDrop, true);
    document.addEventListener('keydown', handleKeyDown, true);
    console.log('[PROCTORING] Copy/paste detection started');

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('dragenter', swallowDragMovement, true);
      document.removeEventListener('dragover', swallowDragMovement, true);
      document.removeEventListener('drop', handleDrop, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [armFocusSwitchSignal, beginNavigationSequence, emitTabSwitchEvent]);

  const setupScreenshotDetection = useCallback(() => {
    // Mobile browsers never receive keyboard events for hardware screenshot
    // shortcuts (power+volume / side buttons) — these are handled entirely
    // by the OS.  Nothing the browser can do to intercept them.
    if (isMobileDevice()) {
      console.warn(
        '[PROCTORING] Screenshot detection is NOT available on mobile. ' +
        'Hardware button screenshots (power+volume) are OS-level and invisible to the browser.'
      );
      return () => {};
    }

    const normalizeKeyValue = (value: string | undefined | null) => {
      return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    };

    const isPrintScreenEvent = (e: KeyboardEvent) => {
      const normalizedKey = normalizeKeyValue(e.key);
      const normalizedCode = normalizeKeyValue(e.code);
      return (
        normalizedKey === 'printscreen' ||
        normalizedKey === 'print screen' ||
        normalizedKey === 'print' ||
        normalizedKey === 'print scrn' ||
        normalizedKey === 'printscrn' ||
        normalizedKey === 'prntscrn' ||
        normalizedKey === 'prtsc' ||
        normalizedKey === 'prtscr' ||
        normalizedKey === 'prtscn' ||
        normalizedKey === 'snapshot' ||
        normalizedKey === 'sysrq' ||
        normalizedKey === 'sys rq' ||
        normalizedCode === 'printscreen' ||
        normalizedCode === 'print' ||
        e.keyCode === 44 ||
        e.which === 44
      );
    };

    const buildPrintScreenLabel = (e: KeyboardEvent) => {
      const modifiers = [
        e.ctrlKey ? 'Ctrl' : '',
        e.altKey ? 'Alt' : '',
        e.shiftKey ? 'Shift' : '',
      ].filter(Boolean);
      return `${modifiers.length > 0 ? `${modifiers.join('+')}+` : ''}PrintScreen`;
    };

    const trackScreenshotShortcutState = (e: KeyboardEvent) => {
      const now = Date.now();
      const normalizedKey = normalizeKeyValue(e.key);

      if (normalizedKey === 'meta' || normalizedKey === 'os' || normalizedKey === 'super') {
        lastMetaKeyAtRef.current = now;
      }
      if (normalizedKey === 'alt') {
        lastAltKeyAtRef.current = now;
      }
      if (normalizedKey === 'shift') {
        lastShiftKeyAtRef.current = now;
      }
      if (normalizedKey === 's') {
        lastSKeyAtRef.current = now;
      }

      const sawWindowsSnipChord =
        (e.metaKey || normalizedKey === 'meta' || normalizedKey === 'os' || normalizedKey === 'super') &&
        (e.shiftKey || normalizedKey === 'shift') &&
        (
          normalizedKey === 's' ||
          now - lastSKeyAtRef.current < 250
        );

      if (sawWindowsSnipChord) {
        armScreenshotChord('Win+Shift+S');
      } else if (
        e.altKey &&
        (e.shiftKey || normalizedKey === 'shift') &&
        (
          normalizedKey === 's' ||
          now - lastSKeyAtRef.current < 250
        )
      ) {
        armScreenshotChord('Alt+Shift+S');
      } else if (
        (e.metaKey || normalizedKey === 'meta' || normalizedKey === 'os' || normalizedKey === 'super') &&
        (e.shiftKey || normalizedKey === 'shift')
      ) {
        armScreenshotChord('Win+Shift based capture', 900);
      }
    };

    const clearClipboardIfPossible = () => {
      if (screenshotBlocking) {
        navigator.clipboard?.writeText('').catch(() => {});
      }
    };

    const handleScreenshotKeyEvent = (e: KeyboardEvent, phase: 'keydown' | 'keyup') => {
      trackScreenshotShortcutState(e);
      const normalizedKey = normalizeKeyValue(e.key);

      if (isPrintScreenEvent(e)) {
        lastPrintScreenKeyAtRef.current = Date.now();
        if (screenshotBlocking) {
          e.preventDefault();
        }
        emitScreenshotEvent({
          key: buildPrintScreenLabel(e),
          capture_type: 'screenshot',
          phase,
          enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        });
        clearClipboardIfPossible();
        return;
      }

      if (e.altKey && e.shiftKey && normalizedKey === 's') {
        if (screenshotBlocking) {
          e.preventDefault();
        }
        emitScreenshotEvent({
          key: 'Alt+Shift+S',
          capture_type: 'screenshot',
          phase,
          enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        });
        return;
      }

      if (e.metaKey && e.shiftKey && normalizedKey === 's') {
        if (screenshotBlocking) {
          e.preventDefault();
        }
        emitScreenshotEvent({
          key: 'Win+Shift+S',
          capture_type: 'screenshot',
          phase,
          enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        });
        return;
      }

      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
        if (screenshotBlocking) {
          e.preventDefault();
        }
        emitScreenshotEvent({
          key: `Cmd+Shift+${e.key}`,
          capture_type: 'screenshot',
          phase,
          enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        });
        return;
      }

      // macOS Cmd+Shift+5 — screenshot toolbar (macOS 10.14+)
      if (e.metaKey && e.shiftKey && e.key === '5') {
        if (screenshotBlocking) {
          e.preventDefault();
        }
        emitScreenshotEvent({
          key: 'Cmd+Shift+5',
          capture_type: 'screenshot',
          phase,
          enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        });
        return;
      }

      // macOS Cmd+Ctrl+Shift+3/4 — copy screenshot to clipboard
      if (e.metaKey && e.ctrlKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
        if (screenshotBlocking) {
          e.preventDefault();
        }
        emitScreenshotEvent({
          key: `Cmd+Ctrl+Shift+${e.key}`,
          capture_type: 'screenshot',
          phase,
          enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => handleScreenshotKeyEvent(e, 'keydown');
    const handleKeyUp = (e: KeyboardEvent) => handleScreenshotKeyEvent(e, 'keyup');

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    console.log('[PROCTORING] Screenshot detection started');
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [armScreenshotChord, emitScreenshotEvent, screenshotBlocking]);

  const setupScreenRecordingDetection = useCallback(() => {
    // Mobile browsers (iOS/Android) do not support getDisplayMedia — screen
    // recording is handled at OS level (Control Centre / Quick Settings) and
    // is completely invisible to any browser API. Do not create a violation
    // automatically when no attempt occurred.
    if (isMobileDevice()) {
      console.warn(
        '[PROCTORING] Screen recording detection is NOT available on mobile. ' +
        'iOS and Android handle screen recording at OS level — no browser API can intercept it.'
      );
      return () => {};
    }

    const reportScreenCapture = (details?: Record<string, any>) => {
      emitScreenshotEvent({
        capture_type: 'screen_recording',
        enforcement_mode: screenshotBlocking ? 'best_effort_block' : 'detect_only',
        ...details,
      });
    };

    const mediaDevices = navigator.mediaDevices;
    const originalGetDisplayMedia = mediaDevices?.getDisplayMedia;
    const originalNavigatorGetDisplayMedia = (navigator as any).getDisplayMedia as
      | ((constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>)
      | undefined;

    if (mediaDevices && originalGetDisplayMedia) {
      mediaDevices.getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
        reportScreenCapture({ source: 'mediaDevices.getDisplayMedia' });
        if (screenshotBlocking) {
          throw new Error('Screen recording is not allowed during the assessment');
        }
        return originalGetDisplayMedia.call(mediaDevices, constraints);
      };
    }

    if (originalNavigatorGetDisplayMedia) {
      (navigator as any).getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
        reportScreenCapture({ source: 'navigator.getDisplayMedia' });
        if (screenshotBlocking) {
          throw new Error('Screen recording is not allowed during the assessment');
        }
        return originalNavigatorGetDisplayMedia.call(navigator, constraints);
      };
    }

    if (!originalGetDisplayMedia && !originalNavigatorGetDisplayMedia) {
      console.warn('[PROCTORING] getDisplayMedia not available in this browser — screen recording detection skipped.');
    }
    console.log('[PROCTORING] Screen recording detection started');
    return () => {
      if (mediaDevices && originalGetDisplayMedia) {
        mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
      if (originalNavigatorGetDisplayMedia) {
        (navigator as any).getDisplayMedia = originalNavigatorGetDisplayMedia;
      }
    };
  }, [emitScreenshotEvent, screenshotBlocking]);

  const setupFullscreenDetection = useCallback(() => {
    let eventName = 'fullscreenchange';
    if ('onwebkitfullscreenchange' in document) eventName = 'webkitfullscreenchange';
    else if ('onmozfullscreenchange' in document) eventName = 'mozfullscreenchange';

    const handler = () => {
      const isFs = isFullscreenActive();
      if (!isFs) {
        if (maybeHandleRecentScreenshotSignal('fullscreenchange_heuristic', {
          fullscreenActive: false,
        })) {
          return;
        }
        emitEventRef.current('fullscreen_exit', {});
      }
    };

    document.addEventListener(eventName, handler);
    console.log('[PROCTORING] Fullscreen detection started');
    return () => document.removeEventListener(eventName, handler);
  }, [maybeHandleRecentScreenshotSignal]);

  const setupMouseTracking = useCallback(() => {
    // Keep normal in-assessment movement allowed. Only flag attempts to push
    // the cursor out of the fullscreen assessment viewport or into the top
    // browser-chrome reveal zone.
    let topEdgeTriggered = false;
    let lastPointerX = -1;
    let lastPointerY = -1;

    const classifyViewportEdge = (x: number, y: number): 'top' | 'right' | 'bottom' | 'left' | null => {
      if (y <= 3) return 'top';
      if (x <= 1) return 'left';
      if (x >= window.innerWidth - 1) return 'right';
      if (y >= window.innerHeight - 1) return 'bottom';
      return null;
    };

    const shouldIgnoreMouseViolation = () => {
      if (isNavigationSequenceActive()) {
        topEdgeTriggered = false;
        return true;
      }

      if (!isFullscreenActive()) {
        topEdgeTriggered = false;
        return true;
      }

      if (document.hidden || document.visibilityState === 'hidden') {
        return true;
      }

      return false;
    };

    const getExitSnapshot = (e: MouseEvent) => {
      const pointerX = Number.isFinite(e.clientX) ? e.clientX : lastPointerX;
      const pointerY = Number.isFinite(e.clientY) ? e.clientY : lastPointerY;
      const edge =
        classifyViewportEdge(pointerX, pointerY) ??
        classifyViewportEdge(lastPointerX, lastPointerY) ??
        'unknown';

      return {
        edge,
        clientX: pointerX,
        clientY: pointerY,
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;

      if (shouldIgnoreMouseViolation()) {
        return;
      }

      const edge = classifyViewportEdge(e.clientX, e.clientY);
      if (edge === 'top') {
        if (!topEdgeTriggered) {
          topEdgeTriggered = true;
          emitMouseMovementEvent({
            reason: 'fullscreen_header_hover',
            edge: 'top',
            source: 'mousemove',
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }
      } else {
        topEdgeTriggered = false;
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (shouldIgnoreMouseViolation()) {
        return;
      }

      if (maybeHandleRecentScreenshotSignal('mouseout_heuristic', {
        relatedTargetNull: !e.relatedTarget,
      })) {
        return;
      }

      // `relatedTarget === null` indicates the pointer left the document,
      // which is the strongest browser-visible signal that the candidate is
      // steering toward another app or off-window destination.
      if (e.relatedTarget || (e as MouseEvent & { toElement?: EventTarget | null }).toElement) {
        return;
      }

      lastViewportExitAtRef.current = Date.now();
      const snapshot = getExitSnapshot(e);
      window.setTimeout(() => {
        if (isNavigationSequenceActive() || !isFullscreenActive()) {
          topEdgeTriggered = false;
          return;
        }

        if (maybeHandleRecentScreenshotSignal('mouseout_heuristic', {
          relatedTargetNull: true,
          ...snapshot,
        })) {
          return;
        }

        const pageHidden = document.hidden || document.visibilityState === 'hidden';
        const pageLostFocus = typeof document.hasFocus === 'function' ? !document.hasFocus() : false;
        const recentFocusSwitch = getRecentFocusSwitchSignal();

        if (pageHidden || pageLostFocus || recentFocusSwitch) {
          topEdgeTriggered = false;
          emitTabSwitchEvent({
            method: recentFocusSwitch ? 'mouseout_focus_switch_heuristic' : 'mouseout_focusloss_fallback',
            source: 'mouseout',
            shortcut: recentFocusSwitch || undefined,
            hidden: pageHidden,
            focusLost: pageLostFocus,
            ...snapshot,
          });
          return;
        }

        if (snapshot.edge === 'top' && topEdgeTriggered) {
          return;
        }

        if (snapshot.edge !== 'top') {
          topEdgeTriggered = false;
        }

        emitMouseMovementEvent({
          reason: 'viewport_exit',
          source: 'mouseout',
          ...snapshot,
        });
      }, 120);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleMouseOut);
    console.log('[PROCTORING] Mouse tracking started');

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [emitMouseMovementEvent, emitTabSwitchEvent, getRecentFocusSwitchSignal, isNavigationSequenceActive, maybeHandleRecentScreenshotSignal]);

  // ==================== LOAD SHEDDING ====================
  const setReducedFrequency = useCallback((reduced: boolean) => {
    videoWorkerRef.current?.postMessage({ type: 'SET_FREQUENCY', data: { reduced } });
    console.log(`[PROCTORING] Load shedding: ${reduced ? 'ON' : 'OFF'}`);
  }, []);

  // ==================== MAIN EFFECT ====================
  useEffect(() => {
    if (!enabledRef.current) return;

    isMonitoringRef.current = true;
    setState(prev => ({ ...prev, isMonitoring: true }));

    // Event-driven detections (lightweight, main thread)
    // Only activate features that are enabled in tenant proctoring settings
    const cleanups = [
      tabSwitchDetection ? setupTabSwitchDetection() : () => {},
      copyPasteBlocking ? setupCopyPasteDetection() : () => {},
      setupScreenshotDetection(),
      setupScreenRecordingDetection(),
      setupFullscreenDetection(),
      setupMouseTracking(),
    ];

    // Stream-dependent: workers + track monitoring + face detection
    if (streamRef.current) {
      setTimeout(() => {
        setupVideoWorker();
        setupAudioWorker();
        setupTrackMonitoring();
        setupFaceDetection();
      }, 100);
    }

    // Backend batch flush timer
    batchFlushIntervalRef.current = setInterval(() => {
      flushBackendQueue();
    }, BACKEND_FLUSH_INTERVAL);

    console.log('[PROCTORING] All monitoring active (2-worker architecture)');

    return () => {
      isMonitoringRef.current = false;
      setState(prev => ({ ...prev, isMonitoring: false }));

      // Cleanup event listeners
      cleanups.forEach(fn => fn());

      // Cleanup intervals
      // Cancel any in-flight async face detection setup (model download / video.play)
      faceDetectionCancelledRef.current = true;
      if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }
      if (voiceIntervalRef.current) { clearInterval(voiceIntervalRef.current); voiceIntervalRef.current = null; }
      if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
      if (faceAnalysisIntervalRef.current) { clearInterval(faceAnalysisIntervalRef.current); faceAnalysisIntervalRef.current = null; }
      if (batchFlushIntervalRef.current) { clearInterval(batchFlushIntervalRef.current); batchFlushIntervalRef.current = null; }

      // Final flush — send remaining events to backend
      if (backendQueueRef.current.length > 0) {
        console.log(`[PROCTORING] Final flush: ${backendQueueRef.current.length} events`);
        flushBackendQueue();
      }

      // Cleanup audio
      if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }

      // Cleanup video elements
      if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current = null; }
      if (faceVideoRef.current) { faceVideoRef.current.srcObject = null; faceVideoRef.current = null; }
      canvasRef.current = null;

      // Terminate workers
      if (videoWorkerRef.current) { videoWorkerRef.current.terminate(); videoWorkerRef.current = null; }
      if (audioWorkerRef.current) { audioWorkerRef.current.terminate(); audioWorkerRef.current = null; }

      console.log('[PROCTORING] All monitoring stopped');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stream]);

  return {
    state,
    emitEvent, // For external callers (face detection, etc.)
    setReducedFrequency, // For load shedding from InterviewUI
  };
}

// ==================== HELPERS ====================

function getSeverity(type: ProctoringEventType): string {
  const map: Record<ProctoringEventType, string> = {
    tab_switch: 'low',
    copy_attempt: 'medium',
    paste_attempt: 'medium',
    voice_detected: 'medium',
    multiple_voices: 'high',
    camera_disabled: 'high',
    microphone_disabled: 'high',
    camera_obstructed: 'high',
    camera_frozen: 'high',
    screenshot_attempt: 'high',
    screen_recording_attempt: 'high',
    window_blur: 'low',
    mouse_movement: 'low',
    fullscreen_exit: 'high',
    face_missing: 'high',
    multiple_faces: 'high',
    gaze_away: 'medium',
    identity_mismatch: 'high',
  };
  return map[type] || 'low';
}
