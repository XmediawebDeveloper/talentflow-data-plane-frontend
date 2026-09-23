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
import {
  readAssessmentFaceBaseline,
  writeAssessmentFaceBaseline,
} from '@/lib/proctoring/assessmentFaceBaseline';
import { createAssessmentFaceMonitor, type AssessmentFaceMonitor } from '@/hooks/assessmentFaceMonitor';

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

const isLinuxDesktop = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /Linux/i.test(userAgent) && !/Android/i.test(userAgent);
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
// Face cadence (1.5 s detect / 2 s gaze / 10 s identity) lives in hooks/assessmentFaceMonitor.ts.
const IDENTITY_BOOTSTRAP_CAPTURES = 3;
const IDENTITY_MISMATCH_THRESHOLD = 0.8;
const IDENTITY_MISMATCH_CONFIRMATIONS = 2;
const IDENTITY_EVENT_COOLDOWN_MS = 15000;
// Gaze confirmations now live in hooks/assessmentFaceMonitor.ts (3 away / 2 restored at 2 s).

// Minimum gap between two backend rows / candidate warnings of the same type.
// Mirrors components/ai-interview/proctoring/InterviewProctoringMonitor.ts.
const EVENT_COOLDOWN_MS: Partial<Record<ProctoringEventType, number>> = {
  tab_switch: 5000,
  window_blur: 5000,
  mouse_movement: 5000,
  fullscreen_exit: 5000,
  voice_detected: 5000,
  multiple_voices: 8000,
  camera_disabled: 5000,
  microphone_disabled: 5000,
  camera_obstructed: 10000,
  camera_frozen: 10000,
  screenshot_attempt: 2000,
  screen_recording_attempt: 5000,
  face_missing: 8000,
  multiple_faces: 8000,
  gaze_away: 8000,
  identity_mismatch: 15000,
};
const CONTINUOUS_WARNING_INTERVAL_MS = 3000;
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

type ContinuousViolationType =
  | 'camera_obstructed'
  | 'face_missing'
  | 'multiple_faces'
  | 'multiple_voices';

interface ContinuousViolationState {
  timer: ReturnType<typeof setInterval> | null;
  details: Record<string, any> | null;
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
    const centerMinX = width * 0.2;
    const centerMaxX = width * 0.8;
    const centerMinY = height * 0.12;
    const centerMaxY = height * 0.82;
    let centerTotalBrightness = 0;
    let centerTotalBrightnessSquared = 0;
    let centerMinBrightness = 255;
    let centerMaxBrightness = 0;
    let centerSampleCount = 0;
    let previousCenterBrightness = null;
    let centerAdjacentDeltaSum = 0;

    for (let i = 0; i < imageData.length; i += step * 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const brightness = (r + g + b) / 3;
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      totalBrightness += brightness;
      totalBrightnessSquared += brightness * brightness;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
      brightnessSample.push(brightness);

      if (x >= centerMinX && x <= centerMaxX && y >= centerMinY && y <= centerMaxY) {
        centerTotalBrightness += brightness;
        centerTotalBrightnessSquared += brightness * brightness;
        centerMinBrightness = Math.min(centerMinBrightness, brightness);
        centerMaxBrightness = Math.max(centerMaxBrightness, brightness);
        if (previousCenterBrightness !== null) {
          centerAdjacentDeltaSum += Math.abs(brightness - previousCenterBrightness);
        }
        previousCenterBrightness = brightness;
        centerSampleCount += 1;
      }
    }

    const sampledPixels = Math.floor(imageData.length / (step * 4));
    const avgBrightness = totalBrightness / sampledPixels;
    const variance = Math.max(0, (totalBrightnessSquared / sampledPixels) - (avgBrightness * avgBrightness));
    const brightnessStdDev = Math.sqrt(variance);
    const brightnessRange = maxBrightness - minBrightness;
    const centerAvgBrightness = centerSampleCount > 0 ? (centerTotalBrightness / centerSampleCount) : avgBrightness;
    const centerVariance = centerSampleCount > 0
      ? Math.max(0, (centerTotalBrightnessSquared / centerSampleCount) - (centerAvgBrightness * centerAvgBrightness))
      : variance;
    const centerBrightnessStdDev = Math.sqrt(centerVariance);
    const centerBrightnessRange = centerSampleCount > 0
      ? (centerMaxBrightness - centerMinBrightness)
      : brightnessRange;
    const centerAdjacentDelta = centerSampleCount > 1
      ? (centerAdjacentDeltaSum / (centerSampleCount - 1))
      : brightnessStdDev;
    const isDark = avgBrightness < threshold;
    const isUniform = brightnessRange < 35 || brightnessStdDev < 12;
    const isLowTexture = brightnessRange < 45 && brightnessStdDev < 18;
    const isCenterOccluded =
      centerSampleCount > 12 &&
      (
        centerAvgBrightness < (threshold + 6) ||
        (centerBrightnessRange < 28 && centerBrightnessStdDev < 11) ||
        (centerAdjacentDelta < 6.5 && centerBrightnessStdDev < 13)
      );

    let meanFrameDelta = null;
    if (previousBrightnessSample && previousBrightnessSample.length === brightnessSample.length) {
      let deltaSum = 0;
      for (let i = 0; i < brightnessSample.length; i += 1) {
        deltaSum += Math.abs(brightnessSample[i] - previousBrightnessSample[i]);
      }
      meanFrameDelta = deltaSum / brightnessSample.length;
    }

    previousBrightnessSample = brightnessSample;

    return {
      isDark,
      isUniform,
      isLowTexture,
      isCenterOccluded,
      avgBrightness,
      brightnessRange,
      brightnessStdDev,
      centerAvgBrightness,
      centerBrightnessRange,
      centerBrightnessStdDev,
      centerAdjacentDelta,
      meanFrameDelta,
    };
  }

  self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'ANALYZE_FRAME') {
      const result = analyze(
        new Uint8ClampedArray(data.imageData),
        data.width, data.height, data.threshold
      );
      const frameObstructed = result.isDark || result.isUniform || result.isLowTexture || result.isCenterOccluded;

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
              reason: result.isDark
                ? 'too_dark'
                : (result.isUniform ? 'too_uniform' : (result.isCenterOccluded ? 'center_occluded' : 'low_texture')),
              avgBrightness: result.avgBrightness,
              brightnessRange: result.brightnessRange,
              brightnessStdDev: result.brightnessStdDev,
              centerAvgBrightness: result.centerAvgBrightness,
              centerBrightnessRange: result.centerBrightnessRange,
              centerBrightnessStdDev: result.centerBrightnessStdDev,
              centerAdjacentDelta: result.centerAdjacentDelta,
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
              centerAvgBrightness: result.centerAvgBrightness,
              centerBrightnessRange: result.centerBrightnessRange,
              centerBrightnessStdDev: result.centerBrightnessStdDev,
              centerAdjacentDelta: result.centerAdjacentDelta,
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
  let isMultipleVoices = false;
  let consecutiveVoice = 0;
  let consecutiveSilent = 0;
  let consecutiveMultipleVoices = 0;
  let consecutiveSingleVoice = 0;
  const VOICE_THRESHOLD_FRAMES = 2;
  const SILENCE_THRESHOLD_FRAMES = 3;
  const MULTI_VOICE_THRESHOLD_FRAMES = 3;
  const MULTI_VOICE_CLEAR_FRAMES = 2;

  function analyzeVoice(frequencyData, sampleRate) {
    const bufferLength = frequencyData.length;
    const binSize = sampleRate / (bufferLength * 2);
    const speechStartBin = Math.floor(300 / binSize);
    const speechEndBin = Math.min(Math.floor(3000 / binSize), bufferLength);
    const smoothed = [];
    let sum = 0;

    for (let i = speechStartBin; i < speechEndBin; i++) {
      const current = frequencyData[i];
      const previous = i > speechStartBin ? frequencyData[i - 1] : current;
      const next = (i + 1) < speechEndBin ? frequencyData[i + 1] : current;
      const value = (previous + current + next) / 3;
      smoothed.push(value);
      sum += value;
    }

    const averageVolume = smoothed.length > 0 ? (sum / smoothed.length) : 0;
    if (smoothed.length === 0 || averageVolume <= 0) {
      return {
        averageVolume: 0,
        peakCount: 0,
        spectralSpread: 0,
        spectralFlatness: 0,
      };
    }

    let weightedSum = 0;
    let weightedSqSum = 0;
    let logSum = 0;
    for (let i = 0; i < smoothed.length; i++) {
      const value = Math.max(smoothed[i], 1);
      const frequency = (speechStartBin + i) * binSize;
      weightedSum += frequency * value;
      weightedSqSum += frequency * frequency * value;
      logSum += Math.log(value);
    }

    const centroid = weightedSum / Math.max(sum, 1);
    const spectralSpread = Math.sqrt(Math.max(0, (weightedSqSum / Math.max(sum, 1)) - (centroid * centroid)));
    const spectralFlatness = Math.exp(logSum / smoothed.length) / Math.max(averageVolume, 1);
    const peakThreshold = Math.max(averageVolume * 1.45, 16);
    let peakCount = 0;
    let lastPeakFrequency = -Infinity;

    for (let i = 1; i < smoothed.length - 1; i++) {
      const value = smoothed[i];
      if (value < peakThreshold || value < smoothed[i - 1] || value < smoothed[i + 1]) {
        continue;
      }

      const frequency = (speechStartBin + i) * binSize;
      if ((frequency - lastPeakFrequency) < 250) {
        continue;
      }

      peakCount++;
      lastPeakFrequency = frequency;
    }

    return {
      averageVolume,
      peakCount,
      spectralSpread,
      spectralFlatness,
    };
  }

  self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'ANALYZE_VOICE') {
      const metrics = analyzeVoice(
        new Uint8Array(data.frequencyData),
        data.sampleRate
      );
      const detected = metrics.averageVolume > data.threshold;
      const multipleVoicesLikely =
        detected &&
        metrics.peakCount >= 4 &&
        metrics.spectralSpread >= 700 &&
        metrics.spectralFlatness >= 0.5;

      if (detected) {
        consecutiveVoice++;
        consecutiveSilent = 0;
        if (!isVoiceActive && consecutiveVoice >= VOICE_THRESHOLD_FRAMES) {
          isVoiceActive = true;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: { voiceDetected: true, averageVolume: metrics.averageVolume, threshold: data.threshold }
          });
        }

        if (multipleVoicesLikely) {
          consecutiveMultipleVoices++;
          consecutiveSingleVoice = 0;
          if (!isMultipleVoices && consecutiveMultipleVoices >= MULTI_VOICE_THRESHOLD_FRAMES) {
            isMultipleVoices = true;
            self.postMessage({
              type: 'MULTI_VOICE_STATE_CHANGE',
              data: {
                multipleVoices: true,
                averageVolume: metrics.averageVolume,
                threshold: data.threshold,
                peakCount: metrics.peakCount,
                spectralSpread: metrics.spectralSpread,
                spectralFlatness: metrics.spectralFlatness,
              }
            });
          }
        } else {
          consecutiveSingleVoice++;
          consecutiveMultipleVoices = 0;
          if (isMultipleVoices && consecutiveSingleVoice >= MULTI_VOICE_CLEAR_FRAMES) {
            isMultipleVoices = false;
            self.postMessage({
              type: 'MULTI_VOICE_STATE_CHANGE',
              data: { multipleVoices: false }
            });
          }
        }
      } else {
        consecutiveSilent++;
        consecutiveVoice = 0;
        if (isVoiceActive && consecutiveSilent >= SILENCE_THRESHOLD_FRAMES) {
          isVoiceActive = false;
        }
        consecutiveSingleVoice++;
        consecutiveMultipleVoices = 0;
        if (isMultipleVoices && consecutiveSingleVoice >= MULTI_VOICE_CLEAR_FRAMES) {
          isMultipleVoices = false;
          self.postMessage({
            type: 'MULTI_VOICE_STATE_CHANGE',
            data: { multipleVoices: false }
          });
        }
      }
    } else if (type === 'RESET') {
      isVoiceActive = false;
      isMultipleVoices = false;
      consecutiveVoice = 0;
      consecutiveSilent = 0;
      consecutiveMultipleVoices = 0;
      consecutiveSingleVoice = 0;
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
  const faceDetectionCancelledRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceMonitorRef = useRef<AssessmentFaceMonitor | null>(null);
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
  const lastEmitAtRef = useRef<Partial<Record<ProctoringEventType, number>>>({});
  const lastMetaKeyAtRef = useRef(0);
  const lastShiftKeyAtRef = useRef(0);
  const lastSKeyAtRef = useRef(0);
  const continuousViolationStateRef = useRef<Record<ContinuousViolationType, ContinuousViolationState>>({
    camera_obstructed: { timer: null, details: null },
    face_missing: { timer: null, details: null },
    multiple_faces: { timer: null, details: null },
    multiple_voices: { timer: null, details: null },
  });

  // ==================== CORE: emitEvent ====================
  // 1. Always queues event for backend (every event recorded)
  // 2. Emits UI warning via EventBus for every emitted violation
  const emitEvent = useCallback((
    eventType: ProctoringEventType,
    details?: Record<string, any>,
  ) => {
    if (!enabledRef.current) return;

    // Per-type cooldown (same idea as InterviewProctoringMonitor's table): a
    // condition that persists must not become hundreds of identical rows.
    // 0 = never throttled (discrete candidate actions).
    const cooldownMs = EVENT_COOLDOWN_MS[eventType] ?? 0;
    if (cooldownMs > 0) {
      const now = Date.now();
      const last = lastEmitAtRef.current[eventType] ?? 0;
      if (now - last < cooldownMs) return;
      lastEmitAtRef.current[eventType] = now;
    }

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

  const clearContinuousViolation = useCallback((eventType: ContinuousViolationType) => {
    const state = continuousViolationStateRef.current[eventType];
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.details = null;
  }, []);

  const syncContinuousViolation = useCallback((
    eventType: ContinuousViolationType,
    active: boolean,
    details?: Record<string, any>,
  ) => {
    if (!active) {
      clearContinuousViolation(eventType);
      return;
    }

    const state = continuousViolationStateRef.current[eventType];
    state.details = details || {};

    if (state.timer) {
      return;
    }

    emitEventRef.current(eventType, state.details);
    state.timer = setInterval(() => {
      if (!isMonitoringRef.current) return;
      const latest = continuousViolationStateRef.current[eventType].details;
      if (!latest) return;
      emitEventRef.current(eventType, latest);
    }, CONTINUOUS_WARNING_INTERVAL_MS);
  }, [clearContinuousViolation]);

  const clearAllContinuousViolations = useCallback(() => {
    (Object.keys(continuousViolationStateRef.current) as ContinuousViolationType[])
      .forEach(clearContinuousViolation);
  }, [clearContinuousViolation]);

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
  }, [screenshotBlocking]);

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
            syncContinuousViolation('camera_obstructed', true, {
              reason: data.reason,
              avgBrightness: data.avgBrightness,
              brightnessRange: data.brightnessRange,
              brightnessStdDev: data.brightnessStdDev,
              centerAvgBrightness: data.centerAvgBrightness,
              centerBrightnessRange: data.centerBrightnessRange,
              centerBrightnessStdDev: data.centerBrightnessStdDev,
              centerAdjacentDelta: data.centerAdjacentDelta,
            });
            clearContinuousViolation('face_missing');
          } else if (data.kind === 'obstruction') {
            isCameraObstructedRef.current = false;
            setState(prev => !prev.isCameraObstructed ? prev : { ...prev, isCameraObstructed: false });
            clearContinuousViolation('camera_obstructed');
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
        } else if (type === 'MULTI_VOICE_STATE_CHANGE') {
          if (data.multipleVoices) {
            syncContinuousViolation('multiple_voices', true, {
              averageVolume: data.averageVolume,
              threshold: data.threshold,
              peakCount: data.peakCount,
              spectralSpread: data.spectralSpread,
              spectralFlatness: data.spectralFlatness,
            });
          } else {
            clearContinuousViolation('multiple_voices');
          }
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
    // 2026-09-23: face presence / multiple faces / gaze / identity now run in
    // hooks/assessmentFaceMonitor.ts (MediaPipe on a 250 ms scheduler, identity
    // every 10 s) — the same stack the AI interview uses. The previous face-api
    // CPU pipeline (two passes + descriptors every 3 s) froze the page and
    // produced the "Can't reach the server" false offline banner.
    const currentStream = streamRef.current;
    if (!currentStream) return;
    if (currentStream.getVideoTracks().length === 0) return;

    faceDetectionCancelledRef.current = false;
    faceMonitorRef.current?.stop();
    faceMonitorRef.current = null;

    const video = document.createElement('video');
    video.srcObject = currentStream;
    video.muted = true;
    video.playsInline = true;
    faceVideoRef.current = video;

    video.play().then(async () => {
      if (faceDetectionCancelledRef.current) return;

      const NO_FACE_THRESHOLD = 2;          // 2 x 1.5 s = 3 s without a face before face_missing
      const DETECTION_FAILURE_THRESHOLD = 2;
      let consecutiveNoFace = 0;
      let consecutiveDetectionFailures = 0;
      const baseline = readAssessmentFaceBaseline(tokenRef.current);

      const handleFaceCount = (count: number, details: Record<string, unknown>) => {
        if (isCameraObstructedRef.current) {
          clearContinuousViolation('face_missing');
          clearContinuousViolation('multiple_faces');
          return;
        }
        consecutiveDetectionFailures = 0;
        if (count >= 2) {
          consecutiveNoFace = 0;
          clearContinuousViolation('face_missing');
          syncContinuousViolation('multiple_faces', true, { face_count: count, ...details });
        } else if (count === 0) {
          clearContinuousViolation('multiple_faces');
          consecutiveNoFace += 1;
          if (consecutiveNoFace >= NO_FACE_THRESHOLD) {
            syncContinuousViolation('face_missing', true, { reason: 'no_face_detected', ...details });
          }
        } else {
          consecutiveNoFace = 0;
          clearContinuousViolation('multiple_faces');
          clearContinuousViolation('face_missing');
        }
      };

      const monitor = createAssessmentFaceMonitor(video, {
        onFaceCount: handleFaceCount,
        onDetectionFailure: (error) => {
          consecutiveDetectionFailures += 1;
          if (consecutiveDetectionFailures >= DETECTION_FAILURE_THRESHOLD) {
            clearContinuousViolation('multiple_faces');
            syncContinuousViolation('face_missing', true, {
              reason: 'detection_failed',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
        onGazeAway: (direction, offsets) => {
          // One event per episode (monitor gates re-entry on a restored state);
          // emitEvent adds the per-type cooldown on top.
          emitEventRef.current('gaze_away', {
            direction,
            noseOffsetX: offsets.x,
            noseOffsetY: offsets.y,
            method: 'mediapipe_face_mesh',
          });
        },
        onGazeRestored: (episodeMs) => {
          console.log(`[PROCTORING] Gaze restored after ${Math.round(episodeMs / 1000)}s`);
        },
        onIdentityMismatch: (distance) => {
          if (Date.now() - lastIdentityMismatchEventAtRef.current < IDENTITY_EVENT_COOLDOWN_MS) return;
          lastIdentityMismatchEventAtRef.current = Date.now();
          emitEventRef.current('identity_mismatch', {
            distance,
            baseline_source: baseline?.source ?? 'assessment_bootstrap',
            baseline_created_at: baseline?.createdAt,
          });
        },
        onIdentityBaselineCaptured: (descriptor) => {
          writeAssessmentFaceBaseline(tokenRef.current, descriptor, 'assessment_bootstrap');
        },
        shouldSkip: () =>
          !isMonitoringRef.current || faceDetectionCancelledRef.current || isCameraObstructedRef.current,
      }, {
        identityBaseline: baseline?.descriptor ?? null,
        identityMismatchThreshold: IDENTITY_MISMATCH_THRESHOLD,
        identityConfirmations: IDENTITY_MISMATCH_CONFIRMATIONS,
        identityBootstrapCaptures: IDENTITY_BOOTSTRAP_CAPTURES,
      });

      faceMonitorRef.current = monitor;
      await monitor.start();
      if (faceDetectionCancelledRef.current) {
        monitor.stop();
        if (faceMonitorRef.current === monitor) faceMonitorRef.current = null;
        return;
      }
      console.log('[PROCTORING] Face detection started (assessmentFaceMonitor / MediaPipe)');
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
    const screenshotMode = screenshotBlocking ? 'best_effort_block' : 'detect_only';

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
          enforcement_mode: screenshotMode,
        });
        console.info('[PROCTORING] Screenshot shortcut detected', {
          mode: screenshotMode,
          key: buildPrintScreenLabel(e),
          phase,
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
          enforcement_mode: screenshotMode,
        });
        console.info('[PROCTORING] Screenshot shortcut detected', {
          mode: screenshotMode,
          key: 'Alt+Shift+S',
          phase,
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
          enforcement_mode: screenshotMode,
        });
        console.info('[PROCTORING] Screenshot shortcut detected', {
          mode: screenshotMode,
          key: 'Win+Shift+S',
          phase,
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
          enforcement_mode: screenshotMode,
        });
        console.info('[PROCTORING] Screenshot shortcut detected', {
          mode: screenshotMode,
          key: `Cmd+Shift+${e.key}`,
          phase,
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
          enforcement_mode: screenshotMode,
        });
        console.info('[PROCTORING] Screenshot shortcut detected', {
          mode: screenshotMode,
          key: 'Cmd+Shift+5',
          phase,
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
          enforcement_mode: screenshotMode,
        });
        console.info('[PROCTORING] Screenshot shortcut detected', {
          mode: screenshotMode,
          key: `Cmd+Ctrl+Shift+${e.key}`,
          phase,
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => handleScreenshotKeyEvent(e, 'keydown');
    const handleKeyUp = (e: KeyboardEvent) => handleScreenshotKeyEvent(e, 'keyup');

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    console.log(`[PROCTORING] Screenshot detection started (${screenshotMode})`);
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

    const screenRecordingMode = screenshotBlocking ? 'best_effort_block' : 'detect_only';
    const reportScreenCapture = (details?: Record<string, any>) => {
      emitScreenshotEvent({
        capture_type: 'screen_recording',
        enforcement_mode: screenRecordingMode,
        ...details,
      });
      console.info('[PROCTORING] Screen recording attempt detected', {
        mode: screenRecordingMode,
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
        // Let the app's OWN mandatory (re)share through untouched (portal sets
        // this flag around its getDisplayMedia) — otherwise re-share is blocked.
        if ((window as any).__tfAllowLegitimateShare) {
          return originalGetDisplayMedia.call(mediaDevices, constraints);
        }
        reportScreenCapture({ source: 'mediaDevices.getDisplayMedia' });
        if (screenshotBlocking) {
          throw new Error('Screen recording is not allowed during the assessment');
        }
        return originalGetDisplayMedia.call(mediaDevices, constraints);
      };
    }

    if (originalNavigatorGetDisplayMedia) {
      (navigator as any).getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
        if ((window as any).__tfAllowLegitimateShare) {
          return originalNavigatorGetDisplayMedia.call(navigator, constraints);
        }
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
      clearAllContinuousViolations();
      faceMonitorRef.current?.stop();
      faceMonitorRef.current = null;
      if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }
      if (voiceIntervalRef.current) { clearInterval(voiceIntervalRef.current); voiceIntervalRef.current = null; }
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
    assessment_terminated: 'high',
  };
  return map[type] || 'low';
}
