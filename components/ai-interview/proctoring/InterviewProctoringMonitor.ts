'use client';

/**
 * useInterviewProctoringMonitor — Performance-optimized proctoring hook for AI interviews.
 *
 * Forked from hooks/useProctoringMonitor.ts to decouple AI interview proctoring
 * from assessment proctoring. Uses InterviewEventBus instead of shared ProctoringEventBus.
 *
 * Architecture:
 *   Pipeline A (main thread): Interview UI — mic, TTS, WebSocket, avatar
 *   Pipeline B (workers):     Proctoring — video analysis, voice detection
 *
 * Key design rules:
 *   1. Workers post ONLY state changes, not per-frame results
 *   2. UI warnings go through InterviewEventBus (no React state in parent)
 *   3. Backend logging is batched (every 5s) — every event is recorded
 *   4. Only track-state (camera/mic active) uses React state (needed for overlays)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { InterviewEventBus, ProctoringEventType } from './InterviewEventBus';
import {
  isLegitimateShareInFlight,
  isDesktopCaptureConstraint,
  notifyScreenRecordingBlocked,
  SCREEN_RECORDING_BLOCKED_MESSAGE,
} from './ScreenRecordingGuard';

// Re-export for consumers that import from here
export type { ProctoringEventType } from './InterviewEventBus';

// Legacy type kept for compatibility with existing imports
export interface ProctoringWarning {
  id: string;
  type: ProctoringEventType;
  message: string;
  timestamp: Date;
  severity: 'minor' | 'moderate' | 'severe';
}

interface UseInterviewProctoringMonitorOptions {
  token: string;
  stream: MediaStream | null;
  enabled?: boolean;
  copyPasteBlocking?: boolean;
  voiceDetectionSensitivity?: number;
  obstructionThreshold?: number;
  reportEvent?: (token: string, event: { event_type: string; timestamp: string; severity: string; details: Record<string, any> }) => Promise<any>;
  // Returns true when voice-detection must be suppressed because the audio
  // currently in the candidate's mic is expected (Bina's TTS echo or the
  // candidate's own answer). Without this, both phases are misclassified as
  // "another voice detected" and the proctor floods the report with false
  // violations.
  shouldSuppressVoiceCheck?: () => boolean;
}

interface ProctoringState {
  isMonitoring: boolean;
  isCameraObstructed: boolean;
  isMicrophoneActive: boolean;
  isCameraActive: boolean;
  isHighBackgroundNoise: boolean;
  isPiPActive: boolean;
}

// ==================== CONSTANTS ====================

// UI warning cooldown per event TYPE (prevents toast spam while allowing different types)
const UI_COOLDOWN_PER_TYPE: Record<ProctoringEventType, number> = {
  tab_switch: 5000,
  copy_attempt: 2000,
  paste_attempt: 2000,
  voice_detected: 10000,
  multiple_voices: 10000,
  camera_disabled: 5000,
  microphone_disabled: 5000,
  camera_obstructed: 10000,
  screenshot_attempt: 2000,
  screen_recording_attempt: 5000,
  window_blur: 5000,
  fullscreen_exit: 5000,
  face_missing: 8000,
  multiple_faces: 8000,
  gaze_away: 8000,
  face_mismatch: 10000,
  face_identity_changed: 15000,
  voice_mismatch: 10000,
  voice_identity_changed: 15000,
  screen_share_stopped: 10000,
  // No cooldown headroom needed — enter/leave already gates repeats, and a
  // hard-block violation shouldn't be throttled away.
  picture_in_picture_detected: 0,
  background_noise: 30000,
  // Long windows: the object detector runs on a 2 s cadence and a phone left in
  // view stays in view. The per-CLASS re-arm gate in InterviewObjectDetection
  // already suppresses repeats; this is the belt-and-braces per-type throttle.
  phone_detected: 20000,
  unauthorized_object: 30000,
  // Fires at most once per session anyway.
  object_detection_unavailable: 600000,
};

// Backend batch flush interval
const BACKEND_FLUSH_INTERVAL = 5000; // Flush every 5 seconds

// Worker check intervals
const VIDEO_CHECK_INTERVAL = 500;    // Sample video at 2 FPS (main thread capture)
const VOICE_CHECK_INTERVAL = 3000;   // Check voice every 3 seconds

// Background noise detection (AIU-67)
// Threshold matches StepSystemCheck.tsx: avgFrequency >= 80 out of 0–255 → noisy
const NOISE_THRESHOLD = 80;
// Minimum gap between noise warning toasts — advisory only, don't spam candidate
const NOISE_WARNING_COOLDOWN = 30000; // 30 seconds

// UI-only event types — never sent to the backend, never counted as a
// violation. voice_detected is a coarse 300-3000 Hz energy check that fires
// on TV/fan/neighbour audio; the authoritative "another speaker" signal is
// voice_identity_changed/voice_mismatch from InterviewVoiceVerification.
const UI_ONLY_EVENT_TYPES: ReadonlySet<ProctoringEventType> = new Set<ProctoringEventType>(['voice_detected']);

// The mirror image of UI_ONLY: recorded for the recruiter but never shown to
// the candidate. object_detection_unavailable is an infrastructure diagnostic
// ("the phone detector couldn't start") — the candidate can do nothing about it
// and telling them a proctoring check is DOWN actively invites cheating.
const BACKEND_ONLY_EVENT_TYPES: ReadonlySet<ProctoringEventType> =
  new Set<ProctoringEventType>(['object_detection_unavailable']);
// Window during which a fresh speaker-identity event suppresses the
// voice_detected hint — the identity layer already covered it.
const IDENTITY_SUPPRESSION_MS = 5000;

// ==================== WORKER CODE ====================

const getVideoWorkerCode = () => `
  // Camera obstruction analysis — runs in worker, posts only state changes
  let isObstructed = false;
  let consecutiveObstructed = 0;
  let consecutiveClear = 0;
  const OBSTRUCT_THRESHOLD = 15;  // frames to confirm obstruction
  const CLEAR_THRESHOLD = 5;      // frames to confirm clear
  let reducedFrequency = false;

  function analyze(imageData, width, height, threshold) {
    let totalBrightness = 0;
    let minBrightness = 255;
    let maxBrightness = 0;
    const step = 16; // Sample every 16th pixel

    for (let i = 0; i < imageData.length; i += step * 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
    }

    const sampledPixels = Math.floor(imageData.length / (step * 4));
    const avgBrightness = totalBrightness / sampledPixels;
    const brightnessRange = maxBrightness - minBrightness;
    const isDark = avgBrightness < threshold;
    const isUniform = brightnessRange < 20;

    return { isDark, isUniform, avgBrightness, brightnessRange };
  }

  self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'ANALYZE_FRAME') {
      const result = analyze(
        new Uint8ClampedArray(data.imageData),
        data.width, data.height, data.threshold
      );
      const frameObstructed = result.isDark || result.isUniform;

      if (frameObstructed) {
        consecutiveObstructed++;
        consecutiveClear = 0;
        if (!isObstructed && consecutiveObstructed >= OBSTRUCT_THRESHOLD) {
          isObstructed = true;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: { obstructed: true, reason: result.isDark ? 'too_dark' : 'too_uniform',
                    avgBrightness: result.avgBrightness, brightnessRange: result.brightnessRange }
          });
        }
      } else {
        consecutiveClear++;
        consecutiveObstructed = 0;
        if (isObstructed && consecutiveClear >= CLEAR_THRESHOLD) {
          isObstructed = false;
          self.postMessage({
            type: 'STATE_CHANGE',
            data: { obstructed: false, avgBrightness: result.avgBrightness }
          });
        }
      }
    } else if (type === 'SET_FREQUENCY') {
      reducedFrequency = data.reduced;
    } else if (type === 'RESET') {
      isObstructed = false;
      consecutiveObstructed = 0;
      consecutiveClear = 0;
    }
  };
  self.postMessage({ type: 'READY' });
`;

const getAudioWorkerCode = () => `
  // Voice detection — runs in worker, posts only state changes
  let isVoiceActive = false;
  let consecutiveVoice = 0;
  let consecutiveSilent = 0;
  const VOICE_THRESHOLD_FRAMES = 2;   // 2 consecutive checks to confirm voice
  const SILENCE_THRESHOLD_FRAMES = 3; // 3 consecutive checks to confirm silence

  // Background noise detection (AIU-67) — full-spectrum analysis, separate from voice band
  let isNoisy = false;
  let consecutiveNoisy = 0;
  let consecutiveQuiet = 0;
  const NOISE_CONFIRM_FRAMES = 3;  // require 3 consecutive noisy frames before alerting
  const QUIET_CONFIRM_FRAMES = 5;  // require 5 quiet frames to clear noise state

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

  function analyzeFullSpectrum(frequencyData) {
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) sum += frequencyData[i];
    return frequencyData.length > 0 ? sum / frequencyData.length : 0;
  }

  self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'ANALYZE_VOICE') {
      const freqData = new Uint8Array(data.frequencyData);
      const avg = analyzeVoice(freqData, data.threshold, data.sampleRate);
      const detected = avg > data.threshold;

      if (detected) {
        consecutiveVoice++;
        consecutiveSilent = 0;
        // Edge-triggered: only post on the silent->voice transition. The
        // 300-3000 Hz band check is a coarse VAD (TV, fans, neighbours all
        // pass it), so emitting per-frame produced dozens of false-positive
        // voice_detected violations per session. Speaker identity is the
        // authoritative "another voice" signal — voice_detected is now a
        // UI-only hint, emitted at most once per voice burst.
        if (consecutiveVoice >= VOICE_THRESHOLD_FRAMES && !isVoiceActive) {
          isVoiceActive = true;
          consecutiveNoisy = 0;
          consecutiveQuiet = 0;
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
          // Don't post silence — we only care about voice presence
        }

        // Background noise: only measure when candidate is NOT speaking
        // Uses a second view of the same buffer — safe, ArrayBuffer is not consumed by Uint8Array
        const noiseLevel = analyzeFullSpectrum(freqData);
        const noisyFrame = noiseLevel >= (data.noiseThreshold || 80);

        if (noisyFrame) {
          consecutiveNoisy++;
          consecutiveQuiet = 0;
          if (!isNoisy && consecutiveNoisy >= NOISE_CONFIRM_FRAMES) {
            isNoisy = true;
            self.postMessage({
              type: 'NOISE_STATE_CHANGE',
              data: { noisy: true, avgNoise: noiseLevel }
            });
          }
        } else {
          consecutiveQuiet++;
          consecutiveNoisy = 0;
          if (isNoisy && consecutiveQuiet >= QUIET_CONFIRM_FRAMES) {
            isNoisy = false;
            self.postMessage({
              type: 'NOISE_STATE_CHANGE',
              data: { noisy: false, avgNoise: noiseLevel }
            });
          }
        }
      }
    } else if (type === 'RESET') {
      isVoiceActive = false;
      consecutiveVoice = 0;
      consecutiveSilent = 0;
      isNoisy = false;
      consecutiveNoisy = 0;
      consecutiveQuiet = 0;
    }
  };
  self.postMessage({ type: 'READY' });
`;

// ==================== HOOK ====================

export function useInterviewProctoringMonitor({
  token,
  stream,
  enabled = true,
  copyPasteBlocking = true,
  voiceDetectionSensitivity = 50,
  obstructionThreshold = 30,
  reportEvent,
  shouldSuppressVoiceCheck,
}: UseInterviewProctoringMonitorOptions) {
  // Minimal React state — only what InterviewUI overlays need
  const [state, setState] = useState<ProctoringState>({
    isMonitoring: false,
    isCameraObstructed: false,
    isMicrophoneActive: true,
    isCameraActive: true,
    isHighBackgroundNoise: false,
    isPiPActive: false,
  });

  // Refs for props (prevent re-render cascades)
  const tokenRef = useRef(token);
  const streamRef = useRef(stream);
  const enabledRef = useRef(enabled);
  const copyPasteBlockingRef = useRef(copyPasteBlocking);
  const reportEventRef = useRef(reportEvent);
  const voiceSensitivityRef = useRef(voiceDetectionSensitivity);
  const obstructionThresholdRef = useRef(obstructionThreshold);
  const isMonitoringRef = useRef(false);
  const shouldSuppressVoiceCheckRef = useRef(shouldSuppressVoiceCheck);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { copyPasteBlockingRef.current = copyPasteBlocking; }, [copyPasteBlocking]);
  useEffect(() => { reportEventRef.current = reportEvent; }, [reportEvent]);
  useEffect(() => { voiceSensitivityRef.current = voiceDetectionSensitivity; }, [voiceDetectionSensitivity]);
  useEffect(() => { obstructionThresholdRef.current = obstructionThreshold; }, [obstructionThreshold]);
  useEffect(() => { shouldSuppressVoiceCheckRef.current = shouldSuppressVoiceCheck; }, [shouldSuppressVoiceCheck]);

  // Worker refs
  const videoWorkerRef = useRef<Worker | null>(null);
  const audioWorkerRef = useRef<Worker | null>(null);

  // Intervals & cleanup refs
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const batchFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackHealthIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraDisabledRef = useRef<boolean>(false);
  const micDisabledRef = useRef<boolean>(false);
  // The audio deviceId recorded the first time monitoring starts for this
  // session — deliberately set ONCE and never overwritten by a later
  // reacquire, so a headset-disconnect episode isn't falsely cleared just
  // because the OS/reacquire falls back to a different working mic (e.g. the
  // laptop's built-in one). Recovery requires THIS specific device's id to
  // reappear as the active track's id, matching "reconnect the headset" —
  // not merely "some mic works again".
  const initialMicDeviceIdRef = useRef<string | null>(null);
  const permissionCleanupRef = useRef<(() => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  // UI warning cooldown per event type
  const lastUiWarningTimeRef = useRef<Record<string, number>>({});
  // Separate cooldown ref for background_noise advisory (not sent to backend)
  const lastNoiseWarningRef = useRef<number>(0);

  // ==================== CORE: emitEvent ====================
  // 1. Queues event for backend with per-type cooldown (prevents flooding)
  // 2. Emits UI warning via InterviewEventBus (with per-type cooldown)
  //
  // Backend cooldown: high-volume detectors like voice_detected can fire
  // multiple times per second during normal candidate speech. Without a
  // backend cooldown, a 20-minute interview produces 200+ POSTs to
  // /proctor-event, hammering the candidate's browser and freezing the UI
  // (observed in production: 185 voice_detected events / 1 min). Per-type
  // cooldown lets the recruiter still see a representative timeline without
  // drowning the page in network I/O.
  const lastBackendEnqueueTimeRef = useRef<Record<string, number>>({});
  const emitEvent = useCallback((
    eventType: ProctoringEventType,
    details?: Record<string, any>,
  ) => {
    if (!enabledRef.current) return;

    const now = Date.now();
    const timestamp = new Date().toISOString();
    const cooldown = UI_COOLDOWN_PER_TYPE[eventType] || 5000;

    // Suppress voice_detected if the smarter speaker-ID layer just fired —
    // it already produced a real violation, no need for a duplicate hint.
    if (eventType === 'voice_detected') {
      const lastIdentity = Math.max(
        lastBackendEnqueueTimeRef.current['voice_identity_changed'] || 0,
        lastBackendEnqueueTimeRef.current['voice_mismatch'] || 0,
      );
      if (lastIdentity && now - lastIdentity < IDENTITY_SUPPRESSION_MS) return;
    }

    // 1. Queue for backend, throttled to one event per cooldown window per type.
    //    Recovery events (e.g. fullscreen_exit_recovered) and rare events
    //    (camera_disabled, voice_mismatch) pass through fast since their
    //    natural firing rate is already low.
    //    UI-only events skip this branch entirely.
    const lastEnqueued = lastBackendEnqueueTimeRef.current[eventType] || 0;
    if (!UI_ONLY_EVENT_TYPES.has(eventType) && now - lastEnqueued >= cooldown) {
      lastBackendEnqueueTimeRef.current[eventType] = now;
      backendQueueRef.current.push({
        event_type: eventType,
        timestamp,
        severity: getSeverity(eventType),
        details: details || {},
      });
    }

    // 2. UI warning with per-type cooldown (same window — keeps toast and
    //    backend log in lockstep). Backend-only diagnostics never toast.
    if (BACKEND_ONLY_EVENT_TYPES.has(eventType)) return;
    const lastShown = lastUiWarningTimeRef.current[eventType] || 0;
    if (now - lastShown >= cooldown) {
      lastUiWarningTimeRef.current[eventType] = now;
      InterviewEventBus.emit(eventType, details);
    }
  }, []);

  const emitEventRef = useRef(emitEvent);
  useEffect(() => { emitEventRef.current = emitEvent; }, [emitEvent]);

  // ==================== BACKEND BATCH FLUSH ====================
  const flushBackendQueue = useCallback(async () => {
    if (backendQueueRef.current.length === 0) return;

    const batch = [...backendQueueRef.current];
    backendQueueRef.current = [];

    const reporter = reportEventRef.current;
    if (!reporter) return;

    // Send each event individually (backend API expects single events)
    // severity is top-level, NOT nested inside details
    for (const event of batch) {
      try {
        const result = await reporter(tokenRef.current, {
          event_type: event.event_type,
          timestamp: event.timestamp,
          severity: event.severity,
          details: event.details,
        });
        if (result && (result as any).success === false) {
          console.warn(`[INTERVIEW_PROCTORING] Backend rejected ${event.event_type}:`, result);
        }
      } catch (err) {
        console.error(`[INTERVIEW_PROCTORING] Failed to send event ${event.event_type}:`, err);
        // Re-queue failed event for next flush (max 3 retries via retry_count)
        const retryCount = (event.details?._retry ?? 0) as number;
        if (retryCount < 3) {
          backendQueueRef.current.push({
            ...event,
            details: { ...event.details, _retry: retryCount + 1 },
          });
        }
      }
    }

    console.log(`[INTERVIEW_PROCTORING] Flushed ${batch.length} event(s) to backend`);
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

      videoWorkerRef.current.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'STATE_CHANGE') {
          if (data.obstructed) {
            setState(prev => prev.isCameraObstructed ? prev : { ...prev, isCameraObstructed: true });
            emitEventRef.current('camera_obstructed', {
              reason: data.reason,
              avgBrightness: data.avgBrightness,
              brightnessRange: data.brightnessRange,
            });
          } else {
            setState(prev => !prev.isCameraObstructed ? prev : { ...prev, isCameraObstructed: false });
          }
        }
      };

      videoWorkerRef.current.onerror = (err) => {
        console.error('[INTERVIEW_PROCTORING] Video worker error:', err);
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
          }, [dataToSend.buffer] as Transferable[]);
        }, VIDEO_CHECK_INTERVAL);

        console.log(`[INTERVIEW_PROCTORING] Video worker started (${VIDEO_CHECK_INTERVAL}ms interval)`);
      };
    } catch (err) {
      console.error('[INTERVIEW_PROCTORING] Failed to setup video worker:', err);
    }
  }, []);

  // ==================== AUDIO WORKER ====================
  const setupAudioWorker = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[INTERVIEW_PROCTORING] No audio tracks — voice detection skipped');
      return;
    }

    try {
      const blob = new Blob([getAudioWorkerCode()], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      audioWorkerRef.current = new Worker(url);

      audioWorkerRef.current.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'STATE_CHANGE' && data.voiceDetected) {
          emitEventRef.current('voice_detected', {
            averageVolume: data.averageVolume,
            threshold: data.threshold,
          });
        } else if (type === 'NOISE_STATE_CHANGE') {
          setState(prev =>
            prev.isHighBackgroundNoise === data.noisy
              ? prev
              : { ...prev, isHighBackgroundNoise: data.noisy }
          );
          if (data.noisy) {
            // Route through emitEvent so it's queued to the backend as its own
            // violation type, distinct from voice_detected. UI cooldown still
            // prevents toast spam.
            emitEventRef.current('background_noise', {
              avgNoise: Math.round(data.avgNoise),
            });
          }
        }
      };

      audioWorkerRef.current.onerror = (err) => {
        console.error('[INTERVIEW_PROCTORING] Audio worker error:', err);
      };

      // Setup AudioContext + Analyser
      try {
        audioContextRef.current = new AudioContext();
      } catch (ctxErr) {
        console.error('[INTERVIEW_PROCTORING] AudioContext creation failed:', ctxErr);
        return;
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      const source = audioContextRef.current.createMediaStreamSource(currentStream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const sampleRate = audioContextRef.current.sampleRate;

      // Send frequency data to worker at low frequency
      voiceIntervalRef.current = setInterval(() => {
        if (!isMonitoringRef.current || !analyserRef.current || !audioWorkerRef.current) return;

        // Skip the check entirely while the audio in the mic is expected —
        // Bina's TTS echo or the candidate's own answer. Otherwise the
        // candidate's own speech is flagged as voice_detected (~60+ false
        // violations per session observed in production).
        // Worker state is reset so consecutive-frame counters don't carry
        // over across the suppression window.
        if (shouldSuppressVoiceCheckRef.current?.()) {
          audioWorkerRef.current.postMessage({ type: 'RESET' });
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        const threshold = 128 - (voiceSensitivityRef.current * 1.28);
        const dataToSend = new Uint8Array(dataArray);

        audioWorkerRef.current.postMessage({
          type: 'ANALYZE_VOICE',
          data: {
            frequencyData: dataToSend.buffer,
            threshold,
            sampleRate,
            noiseThreshold: NOISE_THRESHOLD,
          },
        }, [dataToSend.buffer] as Transferable[]);
      }, VOICE_CHECK_INTERVAL);

      console.log(`[INTERVIEW_PROCTORING] Audio worker started (${VOICE_CHECK_INTERVAL}ms interval)`);
    } catch (err) {
      console.error('[INTERVIEW_PROCTORING] Failed to setup audio worker:', err);
    }
  }, []);

  // ==================== EVENT-DRIVEN DETECTIONS (main thread, cheap) ====================

  // Debounce timers — onmute fires transiently on many browsers (tab
  // throttle, screen-share picker overlay, OS camera re-negotiation, etc.)
  // so we only report a persistent track loss after TRACK_MUTE_DEBOUNCE_MS
  // of continuous mute. onended is permanent (no recovery), so it fires
  // immediately. This eliminates false-positive "Camera Disabled" popups
  // that were appearing during normal interviews without the candidate
  // ever revoking permission.
  const TRACK_MUTE_DEBOUNCE_MS = 3000;
  const cameraMuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micMuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportCameraDisabled = useCallback((reason: string) => {
    if (cameraDisabledRef.current) return;
    cameraDisabledRef.current = true;
    setState(prev => ({ ...prev, isCameraActive: false }));
    emitEventRef.current('camera_disabled', { reason });
  }, []);

  const reportCameraRestored = useCallback(() => {
    // Cancel pending debounce if the track recovered within the window.
    if (cameraMuteTimerRef.current) {
      clearTimeout(cameraMuteTimerRef.current);
      cameraMuteTimerRef.current = null;
    }
    if (!cameraDisabledRef.current) return;
    cameraDisabledRef.current = false;
    setState(prev => ({ ...prev, isCameraActive: true }));
  }, []);

  const reportMicDisabled = useCallback((reason: string) => {
    if (micDisabledRef.current) return;
    micDisabledRef.current = true;
    setState(prev => ({ ...prev, isMicrophoneActive: false }));
    emitEventRef.current('microphone_disabled', { reason });
  }, []);

  const reportMicRestored = useCallback(() => {
    if (micMuteTimerRef.current) {
      clearTimeout(micMuteTimerRef.current);
      micMuteTimerRef.current = null;
    }
    if (!micDisabledRef.current) return;
    micDisabledRef.current = false;
    setState(prev => ({ ...prev, isMicrophoneActive: true }));
  }, []);

  const setupTrackMonitoring = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    // Record the baseline mic device ONCE per session (see the ref's own
    // comment) — never on a later reacquire, even though this function runs
    // again each time a fresh stream comes in.
    if (initialMicDeviceIdRef.current === null) {
      const firstAudioTrack = currentStream.getAudioTracks()[0];
      initialMicDeviceIdRef.current = firstAudioTrack?.getSettings?.().deviceId || null;
    }

    currentStream.getVideoTracks().forEach(track => {
      // onended = permanent track death (permission revoked, device unplugged).
      // Fire immediately — no recovery possible.
      track.onended = () => reportCameraDisabled('track_ended');
      // onmute = transient mute (tab throttle, OS re-negotiation, screen-share
      // picker). Only report if the track stays muted for TRACK_MUTE_DEBOUNCE_MS.
      track.onmute = () => {
        if (cameraMuteTimerRef.current) clearTimeout(cameraMuteTimerRef.current);
        cameraMuteTimerRef.current = setTimeout(() => {
          cameraMuteTimerRef.current = null;
          // Re-check: the track might have unmuted inside the debounce window
          // but AFTER our timeout was queued (race). readyState === 'live' and
          // !muted means the track is fine now — don't report.
          if (track.readyState === 'live' && !track.muted) return;
          reportCameraDisabled('track_muted');
        }, TRACK_MUTE_DEBOUNCE_MS);
      };
      track.onunmute = () => reportCameraRestored();
    });

    currentStream.getAudioTracks().forEach(track => {
      track.onended = () => reportMicDisabled('track_ended');
      track.onmute = () => {
        if (micMuteTimerRef.current) clearTimeout(micMuteTimerRef.current);
        micMuteTimerRef.current = setTimeout(() => {
          micMuteTimerRef.current = null;
          if (track.readyState === 'live' && !track.muted) return;
          reportMicDisabled('track_muted');
        }, TRACK_MUTE_DEBOUNCE_MS);
      };
      track.onunmute = () => reportMicRestored();
    });

    // Periodic health check — track events (onended/onmute) don't always fire
    // when the user disables camera/mic via browser site settings. Poll
    // readyState and track.enabled to catch those cases.
    trackHealthIntervalRef.current = setInterval(() => {
      const s = streamRef.current;
      if (!s) return;

      const vTracks = s.getVideoTracks();
      if (vTracks.length === 0) {
        reportCameraDisabled('no_track');
      } else {
        const vt = vTracks[0];
        if (vt.readyState === 'ended' || vt.muted || !vt.enabled) {
          reportCameraDisabled(
            vt.readyState === 'ended' ? 'readystate_ended'
            : vt.muted ? 'track_muted_poll'
            : 'track_disabled'
          );
        } else {
          reportCameraRestored();
        }
      }

      const aTracks = s.getAudioTracks();
      if (aTracks.length === 0) {
        reportMicDisabled('no_track');
      } else {
        const at = aTracks[0];
        if (at.readyState === 'ended' || at.muted || !at.enabled) {
          reportMicDisabled(
            at.readyState === 'ended' ? 'readystate_ended'
            : at.muted ? 'track_muted_poll'
            : 'track_disabled'
          );
        } else if (
          initialMicDeviceIdRef.current
          && at.getSettings?.().deviceId
          && at.getSettings().deviceId !== initialMicDeviceIdRef.current
        ) {
          // The track itself stays live/unmuted/enabled, but the OS silently
          // rerouted it to a DIFFERENT physical device — e.g. unplugging a
          // headset falls back to the laptop's built-in mic without ever
          // ending or muting the track. No onended/onmute fires for this at
          // all; comparing deviceId against the session's recorded baseline
          // is the only way to catch it. Recovery (see reportMicRestored
          // below) requires THIS SAME comparison to pass again — i.e. the
          // specific original device must come back, not just any mic.
          reportMicDisabled('device_swapped');
        } else {
          reportMicRestored();
        }
      }
    }, 2000);

    // Permissions API — catches browser-level permission revocation even when
    // the MediaStreamTrack events stay silent.
    const permCleanups: Array<() => void> = [];
    const watchPermission = async (name: 'camera' | 'microphone') => {
      try {
        const status = await navigator.permissions.query({ name: name as PermissionName });
        const onChange = () => {
          if (status.state !== 'granted') {
            if (name === 'camera') reportCameraDisabled(`permission_${status.state}`);
            else reportMicDisabled(`permission_${status.state}`);
          }
        };
        status.addEventListener('change', onChange);
        permCleanups.push(() => status.removeEventListener('change', onChange));
      } catch {
        /* Permissions API not supported for this name — skip */
      }
    };
    watchPermission('camera');
    watchPermission('microphone');
    permissionCleanupRef.current = () => permCleanups.forEach(fn => fn());

    console.log('[INTERVIEW_PROCTORING] Track monitoring started');
  }, [reportCameraDisabled, reportCameraRestored, reportMicDisabled, reportMicRestored]);

  const setupTabSwitchDetection = useCallback(() => {
    // A pending, not-yet-confirmed blur. window.blur fires not only on a real
    // tab/app switch but ALSO when the candidate interacts with browser-native
    // UI that is NOT a violation — most notably Chrome's "<site> is sharing your
    // screen" info bar and its Hide / Stop button. Clicking that bar briefly
    // moves focus to the browser chrome (→ window.blur) but never hides the page
    // and returns focus within a few hundred ms. So instead of flagging every
    // blur, we defer and re-check: a genuine leave either hides the document
    // (caught by visibilitychange → tab_switch) or leaves the window without
    // focus after the grace window; a screen-share-bar click regains focus and
    // is cancelled below.
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const BLUR_CONFIRM_MS = 600;

    const clearBlurTimer = () => {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) emitEventRef.current('tab_switch', { hidden: true });
    };

    const handleBlur = () => {
      clearBlurTimer();
      blurTimer = setTimeout(() => {
        blurTimer = null;
        // Only a real leave: the page is hidden, OR focus has NOT come back
        // after the grace window. A click on the screen-share info bar / Hide
        // button keeps the page visible and hands focus back, so handleFocus
        // will have cancelled this timer before it runs.
        if (document.hidden || !document.hasFocus()) {
          emitEventRef.current('window_blur', {});
        } else if (document.pictureInPictureElement) {
          // The apparent "return to focus" coincides with an active PiP
          // element — e.g. the candidate clicked the screen-share bar's Hide
          // button while a video is floating in Picture-in-Picture. That's a
          // real violation, not the benign transient blur this branch exists
          // to swallow. setupPiPDetection's own enter/leave listeners are the
          // primary signal; this is a synchronous belt-and-braces recheck at
          // exactly the moment a candidate is most likely to trigger it.
          emitEventRef.current('picture_in_picture_detected', { via: 'blur_recheck' });
        } else {
          console.log('[INTERVIEW_PROCTORING] Transient blur ignored (focus regained, page still visible) — likely the screen-share info bar / Hide button');
        }
      }, BLUR_CONFIRM_MS);
    };

    // Focus returned to the interview window — a pending blur was transient
    // (e.g. the screen-share bar). Cancel it so it never counts as a violation.
    const handleFocus = () => clearBlurTimer();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    console.log('[INTERVIEW_PROCTORING] Tab switch detection started');

    return () => {
      clearBlurTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const setupCopyPasteDetection = useCallback(() => {
    const block = (e: Event, type: ProctoringEventType, details?: Record<string, any>) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      emitEventRef.current(type, details);
      return false;
    };

    const handleCopy = (e: ClipboardEvent) => {
      if ((e as any).clipboardData) (e as any).clipboardData.clearData();
      return block(e, 'copy_attempt', { selectedText: window.getSelection()?.toString()?.substring(0, 100) });
    };
    const handlePaste = (e: ClipboardEvent) => {
      if ((e as any).clipboardData) (e as any).clipboardData.clearData();
      return block(e, 'paste_attempt', {});
    };
    const handleCut = (e: ClipboardEvent) => block(e, 'copy_attempt', { action: 'cut' });
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'Tab') return block(e, 'tab_switch', { method: 'alt_tab' });
      if (e.altKey && e.key === 'F4') return block(e, 'window_blur', { method: 'alt_f4' });
      if (e.metaKey && e.key === 'Tab') return block(e, 'tab_switch', { method: 'cmd_tab' });
      if (e.ctrlKey && e.key === 'Tab') return block(e, 'tab_switch', { method: 'ctrl_tab' });
      if (e.key === 'Meta' || e.key === 'OS') return block(e, 'window_blur', { method: 'windows_key' });
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') return block(e, 'copy_attempt', { method: 'keyboard' });
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return block(e, 'paste_attempt', { method: 'keyboard' });
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') return block(e, 'copy_attempt', { method: 'keyboard', action: 'cut' });
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        return false;
      }
    };

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);
    console.log('[INTERVIEW_PROCTORING] Copy/paste detection started');

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const setupScreenshotDetection = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        emitEventRef.current('screenshot_attempt', { key: 'PrintScreen' });
        navigator.clipboard?.writeText('').catch(() => {});
      }
      if ((e.ctrlKey || e.altKey) && e.key === 'PrintScreen') {
        e.preventDefault();
        emitEventRef.current('screenshot_attempt', { key: 'Ctrl/Alt+PrintScreen' });
        navigator.clipboard?.writeText('').catch(() => {});
      }
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        emitEventRef.current('screenshot_attempt', { key: 'Win+Shift+S' });
      }
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
        e.preventDefault();
        emitEventRef.current('screenshot_attempt', { key: `Cmd+Shift+${e.key}` });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    console.log('[INTERVIEW_PROCTORING] Screenshot detection started');
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Screen-recording attempts the browser can actually SEE — and therefore
  // actually REFUSE. Every one of these is blocked before a single frame is
  // captured, and raises the candidate-facing popup synchronously, in the same
  // task as the click (see ScreenRecordingGuard.notifyScreenRecordingBlocked).
  //
  // Three vectors are covered, because a getDisplayMedia-only guard leaks:
  //   1. navigator.mediaDevices.getDisplayMedia — the standard screen-capture API,
  //   2. navigator.getDisplayMedia — the legacy alias still shipped by some builds,
  //   3. getUserMedia with a chromeMediaSource: 'desktop' constraint — how every
  //      Chrome recorder EXTENSION (Loom, Screencastify, …) actually captures.
  //
  // A fourth vector is DETECTED but cannot be refused: the OS recording hotkeys
  // (Cmd+Shift+5, Win+Alt+R, Win+G). The keydown reaches the page, so the popup
  // is still immediate, but the OS owns the shortcut and starts recording
  // regardless — those are reported as observed, not blocked.
  //
  // What nothing here can see, by construction, is a recorder launched entirely
  // outside the browser (OBS opened from the dock, QuickTime's File menu). No
  // web API exposes those; they are covered separately by the portal's vision
  // poll over the shared-screen feed, which pauses the interview.
  const setupScreenRecordingDetection = useCallback(() => {
    const refuse = (source: string): Error => {
      // Popup first, synchronously — the candidate sees it the instant the
      // click lands, not after a render tick or a network round-trip.
      notifyScreenRecordingBlocked(source);
      // Recruiter timeline + backend violation record.
      emitEventRef.current('screen_recording_attempt', { source, blocked: true });
      console.warn(`[INTERVIEW_PROCTORING] Screen recording BLOCKED via ${source}`);
      const error = new Error(SCREEN_RECORDING_BLOCKED_MESSAGE);
      // NotAllowedError is what a denied permission looks like to a caller, so
      // recorders and extensions handle it on their existing failure path
      // instead of hanging on an unexpected error shape.
      error.name = 'NotAllowedError';
      return error;
    };

    const mediaDevices = navigator.mediaDevices;
    const originalGetDisplayMedia = mediaDevices?.getDisplayMedia;
    const originalNavigatorGetDisplayMedia = (navigator as any).getDisplayMedia as
      | ((constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>)
      | undefined;
    const originalGetUserMedia = mediaDevices?.getUserMedia;

    if (mediaDevices && originalGetDisplayMedia) {
      mediaDevices.getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
        // The app's OWN mandatory (re)share is the one caller allowed through.
        if (isLegitimateShareInFlight()) {
          return originalGetDisplayMedia.call(mediaDevices, constraints as any);
        }
        throw refuse('mediaDevices.getDisplayMedia');
      };
    }

    if (originalNavigatorGetDisplayMedia) {
      (navigator as any).getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
        if (isLegitimateShareInFlight()) {
          return originalNavigatorGetDisplayMedia.call(navigator, constraints);
        }
        throw refuse('navigator.getDisplayMedia');
      };
    }

    // Camera/mic getUserMedia must keep working untouched — only desktop-source
    // constraints are refused, so the interview's own devices are unaffected.
    if (mediaDevices && originalGetUserMedia) {
      mediaDevices.getUserMedia = async function (constraints?: MediaStreamConstraints) {
        if (isDesktopCaptureConstraint(constraints) && !isLegitimateShareInFlight()) {
          throw refuse('getUserMedia(chromeMediaSource:desktop)');
        }
        return originalGetUserMedia.call(mediaDevices, constraints as any);
      };
    }

    // OS-level recording HOTKEYS. These cannot be cancelled — the OS owns the
    // shortcut and acts on it whether or not the page calls preventDefault —
    // but the keydown itself is visible here, which makes this the one signal
    // that catches a native recorder the instant the candidate triggers it
    // instead of waiting for the portal's vision poll to see it on screen.
    // Reported as observed-not-blocked so the popup says "stop the recording"
    // rather than falsely claiming we stopped it.
    //   macOS  Cmd+Shift+5  — screenshot/recording toolbar
    //   Windows Win+Alt+R   — Game Bar start/stop recording
    //   Windows Win+G       — Game Bar overlay (where the record button lives)
    // Platform-gated, because the SAME modifier means different things per OS:
    // on macOS the Windows key is Cmd, so an ungated "Meta+G" rule would report
    // Cmd+G (find-next) as a Game Bar launch on every Mac.
    const ua = typeof navigator !== 'undefined' ? `${navigator.userAgent} ${(navigator as any).platform || ''}` : '';
    const isMac = /Mac|iPhone|iPad|iPod/i.test(ua);
    const isWindows = /Win/i.test(ua) && !isMac;
    const recordingHotkey = (e: KeyboardEvent): string | null => {
      const key = e.key?.toLowerCase();
      if (isMac && e.metaKey && e.shiftKey && key === '5') return 'Cmd+Shift+5 (macOS screen recording)';
      if (isWindows && e.metaKey && e.altKey && key === 'r') return 'Win+Alt+R (Game Bar recording)';
      if (isWindows && e.metaKey && !e.altKey && !e.shiftKey && !e.ctrlKey && key === 'g') return 'Win+G (Game Bar)';
      return null;
    };
    const handleRecordingHotkey = (e: KeyboardEvent) => {
      const hotkey = recordingHotkey(e);
      if (!hotkey) return;
      // Best effort: some builds do let the page swallow the combo.
      e.preventDefault();
      notifyScreenRecordingBlocked(hotkey, false);
      emitEventRef.current('screen_recording_attempt', { source: hotkey, blocked: false });
      console.warn(`[INTERVIEW_PROCTORING] Screen recording hotkey detected: ${hotkey}`);
    };
    window.addEventListener('keydown', handleRecordingHotkey, true);

    if (!originalGetDisplayMedia && !originalNavigatorGetDisplayMedia) {
      console.warn('[INTERVIEW_PROCTORING] getDisplayMedia unavailable — in-page screen recording block skipped.');
    }
    console.log('[INTERVIEW_PROCTORING] Screen recording detection started (block + popup)');
    return () => {
      window.removeEventListener('keydown', handleRecordingHotkey, true);
      if (mediaDevices && originalGetDisplayMedia) {
        mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
      if (originalNavigatorGetDisplayMedia) {
        (navigator as any).getDisplayMedia = originalNavigatorGetDisplayMedia;
      }
      if (mediaDevices && originalGetUserMedia) {
        mediaDevices.getUserMedia = originalGetUserMedia;
      }
    };
  }, []);

  // Picture-in-Picture — Webcam.tsx and Avatar.tsx already set
  // disablePictureInPicture on every video element they render, so this only
  // fires if that's bypassed (a page bug, or a browser-extension content
  // script forcing requestPictureInPicture() on our video). Listened for at
  // the document level with capture:true so it's caught regardless of which
  // element it fires on and regardless of bubbling — enterpictureinpicture /
  // leavepictureinpicture always pass through the capturing phase even when
  // they don't bubble.
  const setupPiPDetection = useCallback(() => {
    const handleEnter = () => {
      setState(prev => (prev.isPiPActive ? prev : { ...prev, isPiPActive: true }));
      emitEventRef.current('picture_in_picture_detected', {});
    };
    const handleLeave = () => {
      setState(prev => (!prev.isPiPActive ? prev : { ...prev, isPiPActive: false }));
    };

    document.addEventListener('enterpictureinpicture', handleEnter, true);
    document.addEventListener('leavepictureinpicture', handleLeave, true);
    console.log('[INTERVIEW_PROCTORING] Picture-in-Picture detection started');

    return () => {
      document.removeEventListener('enterpictureinpicture', handleEnter, true);
      document.removeEventListener('leavepictureinpicture', handleLeave, true);
    };
  }, []);

  const setupFullscreenDetection = useCallback(() => {
    let eventName = 'fullscreenchange';
    if ('onwebkitfullscreenchange' in document) eventName = 'webkitfullscreenchange';
    else if ('onmozfullscreenchange' in document) eventName = 'mozfullscreenchange';

    const handler = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isFs) emitEventRef.current('fullscreen_exit', {});
    };

    document.addEventListener(eventName, handler);
    console.log('[INTERVIEW_PROCTORING] Fullscreen detection started');
    return () => document.removeEventListener(eventName, handler);
  }, []);

  const setupMouseTracking = useCallback(() => {
    const handleMouseLeave = () => {
      emitEventRef.current('window_blur', { reason: 'mouse_left_window' });
    };
    document.addEventListener('mouseleave', handleMouseLeave);
    console.log('[INTERVIEW_PROCTORING] Mouse tracking started');
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, []);

  // ==================== LOAD SHEDDING ====================
  const setReducedFrequency = useCallback((reduced: boolean) => {
    videoWorkerRef.current?.postMessage({ type: 'SET_FREQUENCY', data: { reduced } });
    console.log(`[INTERVIEW_PROCTORING] Load shedding: ${reduced ? 'ON' : 'OFF'}`);
  }, []);

  // ==================== MAIN EFFECT ====================
  useEffect(() => {
    if (!enabledRef.current) return;

    isMonitoringRef.current = true;
    setState(prev => ({ ...prev, isMonitoring: true }));

    // Subscribe to face/voice identity events emitted by the verification hooks.
    // These bypass emitEvent (go directly to the bus), so we listen here and
    // queue them for backend logging without re-emitting to the bus.
    const IDENTITY_EVENTS: ProctoringEventType[] = [
      'face_mismatch', 'face_identity_changed',
      'voice_mismatch', 'voice_identity_changed',
    ];
    const unsubIdentity = InterviewEventBus.subscribe((event) => {
      if (IDENTITY_EVENTS.includes(event.type)) {
        backendQueueRef.current.push({
          event_type: event.type,
          timestamp: event.timestamp.toISOString(),
          severity: event.severity,
          details: event.details || {},
        });
      }
    });

    // Event-driven detections (lightweight, main thread)
    const cleanups = [
      unsubIdentity,
      setupTabSwitchDetection(),
      copyPasteBlockingRef.current ? setupCopyPasteDetection() : () => {},
      setupScreenshotDetection(),
      setupScreenRecordingDetection(),
      setupPiPDetection(),
      setupFullscreenDetection(),
      setupMouseTracking(),
    ];

    // Stream-dependent: workers + track monitoring
    // (Face detection is handled by useInterviewFaceDetection hook, not here)
    if (streamRef.current) {
      setTimeout(() => {
        setupVideoWorker();
        setupAudioWorker();
        setupTrackMonitoring();
      }, 100);
    }

    // Backend batch flush timer
    batchFlushIntervalRef.current = setInterval(() => {
      flushBackendQueue();
    }, BACKEND_FLUSH_INTERVAL);

    console.log('[INTERVIEW_PROCTORING] All monitoring active (2-worker architecture)');

    return () => {
      isMonitoringRef.current = false;
      setState(prev => ({ ...prev, isMonitoring: false }));

      // Cleanup event listeners
      cleanups.forEach(fn => fn());

      // Cleanup intervals
      if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }
      if (voiceIntervalRef.current) { clearInterval(voiceIntervalRef.current); voiceIntervalRef.current = null; }
      if (batchFlushIntervalRef.current) { clearInterval(batchFlushIntervalRef.current); batchFlushIntervalRef.current = null; }
      if (trackHealthIntervalRef.current) { clearInterval(trackHealthIntervalRef.current); trackHealthIntervalRef.current = null; }
      if (permissionCleanupRef.current) { permissionCleanupRef.current(); permissionCleanupRef.current = null; }
      // Cancel pending mute debounce timers so they can't fire into an unmounted tree
      if (cameraMuteTimerRef.current) { clearTimeout(cameraMuteTimerRef.current); cameraMuteTimerRef.current = null; }
      if (micMuteTimerRef.current) { clearTimeout(micMuteTimerRef.current); micMuteTimerRef.current = null; }

      // Final flush — send remaining events to backend
      if (backendQueueRef.current.length > 0) {
        console.log(`[INTERVIEW_PROCTORING] Final flush: ${backendQueueRef.current.length} events`);
        flushBackendQueue();
      }

      // Cleanup audio
      if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }

      // Cleanup video elements
      if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current = null; }
      canvasRef.current = null;

      // Terminate workers
      if (videoWorkerRef.current) { videoWorkerRef.current.terminate(); videoWorkerRef.current = null; }
      if (audioWorkerRef.current) { audioWorkerRef.current.terminate(); audioWorkerRef.current = null; }

      console.log('[INTERVIEW_PROCTORING] All monitoring stopped');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stream]);

  return {
    state,
    emitEvent,           // For external callers (face detection, etc.)
    setReducedFrequency, // For load shedding from InterviewUI
    flushEvents: flushBackendQueue, // Explicit pre-completion flush — call before interview ends
  };
}

// ==================== HELPERS ====================

function getSeverity(type: ProctoringEventType): 'minor' | 'moderate' | 'severe' {
  const map: Record<ProctoringEventType, 'minor' | 'moderate' | 'severe'> = {
    // Minor (1 pt) — low-friction accidental events
    tab_switch:               'minor',
    window_blur:              'minor',
    gaze_away:                'minor',
    copy_attempt:             'minor',
    paste_attempt:            'minor',
    fullscreen_exit:          'minor',
    // Moderate (2 pts) — suspicious but not conclusive
    camera_obstructed:        'moderate',
    voice_detected:           'minor',
    multiple_voices:          'moderate',
    screenshot_attempt:       'moderate',
    screen_recording_attempt: 'moderate',
    face_missing:             'moderate',
    face_mismatch:            'moderate',
    voice_mismatch:           'moderate',
    // Severe (3 pts) — strong integrity signals
    camera_disabled:          'severe',
    microphone_disabled:      'severe',
    multiple_faces:           'severe',
    face_identity_changed:    'severe',
    voice_identity_changed:   'severe',
    screen_share_stopped:     'severe',
    picture_in_picture_detected: 'severe',
    phone_detected:           'severe',
    unauthorized_object:      'moderate',
    // Advisory — not a proctoring violation (AIU-67)
    background_noise:         'minor',
    object_detection_unavailable: 'minor',
  };
  return map[type] ?? 'minor';
}
