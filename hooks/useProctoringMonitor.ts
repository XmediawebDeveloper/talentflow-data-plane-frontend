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

// ── Constants ────────────────────────────────────────────────────────────────
const BACKEND_FLUSH_INTERVAL = 5000; // ms — batch-flush proctoring events to backend

const UI_COOLDOWN_PER_TYPE: Record<ProctoringEventType, number> = {
  tab_switch:                5000,
  copy_attempt:              2000,
  paste_attempt:             2000,
  voice_detected:           10000,
  multiple_voices:          10000,
  camera_disabled:           5000,
  microphone_disabled:       5000,
  camera_obstructed:        10000,
  screenshot_attempt:        2000,
  screen_recording_attempt:  5000,
  window_blur:               5000,
  fullscreen_exit:           5000,
  face_missing:              8000,
  multiple_faces:            8000,
  gaze_away:                 8000,
};
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
  reportEvent?: (token: string, event: { event_type: string; timestamp: string; details: Record<string, any> }) => Promise<any>;
}

interface ProctoringState {
  isMonitoring: boolean;
  isCameraObstructed: boolean;
  isMicrophoneActive: boolean;
  isCameraActive: boolean;
}

// Backend logging cooldown — how often each event is sent to the backend (ms)
const BACKEND_COOLDOWNS: Record<ProctoringEventType, number> = {
  tab_switch: 2000,
  copy_attempt: 500,
  paste_attempt: 500,
  voice_detected: 30000,  // Send at most every 30 s (batched anyway)
  multiple_voices: 30000,
  multiple_faces: 10000,  // Send at most every 10 s
  camera_disabled: 1000,
  microphone_disabled: 1000,
  camera_obstructed: 3000,
  screenshot_attempt: 500,
  screen_recording_attempt: 2000,
  window_blur: 2000,
};

// Frontend warning cooldown — minimum gap between on-screen warning toasts (ms)
const FRONTEND_WARNING_COOLDOWN = 8000; // 8 s — visible but not spammy

// Voice detection specific settings (Throttle + Batch optimisation)
const VOICE_CHECK_INTERVAL = 1000;   // Sample every 1 s
const VOICE_BATCH_INTERVAL = 10000;  // Flush batch to backend every 10 s
const VOICE_LOG_ONLY = false;        // Show on-screen warnings for audio violations

// Warning messages for each event type
const WARNING_MESSAGES: Record<ProctoringEventType, string> = {
  tab_switch: 'Tab switching detected. Please stay on the assessment page.',
  copy_attempt: 'Copying is not allowed during the assessment.',
  paste_attempt: 'Pasting is not allowed during the assessment.',
  voice_detected: 'Voice activity detected. Please maintain silence during the assessment.',
  multiple_voices: 'Multiple voices detected. Please ensure you are alone.',
  multiple_faces: 'Multiple faces detected in camera. Only you should be visible.',
  camera_disabled: 'Camera has been disabled. Please enable your camera to continue.',
  microphone_disabled: 'Microphone has been disabled. Please enable your microphone.',
  camera_obstructed: 'Camera appears to be blocked. Please ensure your face is visible.',
  screenshot_attempt: 'Screenshot attempt detected. Screenshots are not allowed.',
  screen_recording_attempt: 'Screen recording detected. Recording is not allowed.',
  window_blur: 'You navigated away from the assessment window.',
};

// Severity levels for each event type
const EVENT_SEVERITY: Record<ProctoringEventType, 'low' | 'medium' | 'high'> = {
  tab_switch: 'low',
  copy_attempt: 'medium',
  paste_attempt: 'medium',
  voice_detected: 'medium',
  multiple_voices: 'high',
  multiple_faces: 'high',
  camera_disabled: 'high',
  microphone_disabled: 'high',
  camera_obstructed: 'high',
  screenshot_attempt: 'high',
  screen_recording_attempt: 'high',
  window_blur: 'low',
};

export function useProctoringMonitor({
  token,
  stream,
  enabled = true,
  voiceDetectionSensitivity = 50,
  obstructionThreshold = 30,
  reportEvent,
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
  const isMonitoringRef = useRef(false);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { reportEventRef.current = reportEvent; }, [reportEvent]);
  useEffect(() => { voiceSensitivityRef.current = voiceDetectionSensitivity; }, [voiceDetectionSensitivity]);
  useEffect(() => { obstructionThresholdRef.current = obstructionThreshold; }, [obstructionThreshold]);

  // Worker refs
  const videoWorkerRef = useRef<Worker | null>(null);
  const audioWorkerRef = useRef<Worker | null>(null);

  // Intervals & cleanup refs
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const batchFlushIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // ==================== CORE: emitEvent ====================
  // 1. Always queues event for backend (every event recorded)
  // 2. Emits UI warning via EventBus (with per-type cooldown)
  const emitEvent = useCallback((
    eventType: ProctoringEventType,
    details?: Record<string, any>,
  ) => {
    if (!enabledRef.current) return;

    const now = Date.now();
    const timestamp = new Date().toISOString();

    // 1. ALWAYS queue for backend — no event is ever lost
    backendQueueRef.current.push({
      event_type: eventType,
      timestamp,
      severity: getSeverity(eventType),
      details: details || {},
    });

    // 2. UI warning with per-type cooldown
    const lastShown = lastUiWarningTimeRef.current[eventType] || 0;
    const cooldown = UI_COOLDOWN_PER_TYPE[eventType] || 5000;
    if (now - lastShown >= cooldown) {
      lastUiWarningTimeRef.current[eventType] = now;
      ProctoringEventBus.emit(eventType, details);
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
        // Re-queue failed event for next flush
        backendQueueRef.current.push(event);
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

      console.log('[PROCTORING] Web Worker initialized (inline)');
    } catch (error) {
      console.error('[PROCTORING] Failed to initialize Web Worker:', error);
    }
  }, []);

  // ==================== MULTIPLE FACES DETECTION ====================
  const FACE_DETECTION_INTERVAL = 5000; // Check every 5 seconds
  // GitHub CDN hosts the actual weight files (npm package does not include them)
  const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/';

  const setupFaceDetection = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const videoTracks = currentStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    const video = document.createElement('video');
    video.srcObject = currentStream;
    video.muted = true;
    faceVideoRef.current = video;

    video.play().then(async () => {
      try {
        // ── Path A: Native FaceDetector (Chrome/Edge, no model download) ──
        if ('FaceDetector' in window) {
          const FaceDetectorAPI = (window as any).FaceDetector;
          const detector = new FaceDetectorAPI({ fastMode: true, maxDetectedFaces: 5 });

          faceIntervalRef.current = setInterval(async () => {
            if (!isMonitoringRef.current || !faceVideoRef.current) return;
            try {
              const faces = await detector.detect(faceVideoRef.current);
              if (faces.length >= 2) {
                logEventRef.current('multiple_faces', { face_count: faces.length, method: 'native' });
                console.log(`[PROCTORING] Multiple faces: ${faces.length} (native)`);
              }
            } catch { /* low-quality frames — ignore */ }
          }, FACE_DETECTION_INTERVAL);

          console.log('[PROCTORING] Face detection started (native FaceDetector — Chrome/Edge)');
          return;
        }

        // ── Path B: face-api.js with TinyFaceDetector (Firefox / Safari) ──
        const faceapi = await import('face-api.js');

        if (!faceapi.nets.tinyFaceDetector.isLoaded) {
          console.log('[PROCTORING] Loading TinyFaceDetector model (~190 KB)…');
          await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
          console.log('[PROCTORING] TinyFaceDetector model loaded');
        }

        const detectorOptions = new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 });

        faceIntervalRef.current = setInterval(async () => {
          if (!isMonitoringRef.current || !faceVideoRef.current) return;
          try {
            const detections = await faceapi.detectAllFaces(faceVideoRef.current, detectorOptions);
            if (detections.length >= 2) {
              logEventRef.current('multiple_faces', { face_count: detections.length, method: 'face-api.js' });
              console.log(`[PROCTORING] Multiple faces: ${detections.length} (face-api.js)`);
            }
          } catch { /* low-quality frames — ignore */ }
        }, FACE_DETECTION_INTERVAL);

        console.log('[PROCTORING] Face detection started (face-api.js — Firefox/Safari compatible)');
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
      if (document.hidden) emitEventRef.current('tab_switch', { hidden: true });
    };
    const handleBlur = () => emitEventRef.current('window_blur', {});

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    console.log('[PROCTORING] Tab switch detection started');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
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
    console.log('[PROCTORING] Copy/paste detection started');

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

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
    console.log('[PROCTORING] Screenshot detection started');
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const setupScreenRecordingDetection = useCallback(() => {
    // Mobile browsers (iOS/Android) do not support getDisplayMedia — screen
    // recording is handled at OS level (Control Centre / Quick Settings) and
    // is completely invisible to any browser API.  Log the limitation and
    // report it to the backend once so the proctor is aware.
    if (isMobileDevice()) {
      console.warn(
        '[PROCTORING] Screen recording detection is NOT available on mobile. ' +
        'iOS and Android handle screen recording at OS level — no browser API can intercept it.'
      );
      emitEventRef.current('screen_recording_attempt', {
        reason: 'mobile_unsupported',
        message: 'Screen recording detection unavailable on this device',
      });
      return () => {};
    }

    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
    if (originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = async function () {
        emitEventRef.current('screen_recording_attempt', {});
        throw new Error('Screen recording is not allowed during the interview');
      };
    } else {
      console.warn('[PROCTORING] getDisplayMedia not available in this browser — screen recording detection skipped.');
    }
    console.log('[PROCTORING] Screen recording detection started');
    return () => {
      if (originalGetDisplayMedia) navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
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
    console.log('[PROCTORING] Fullscreen detection started');
    return () => document.removeEventListener(eventName, handler);
  }, []);

  const setupMouseTracking = useCallback(() => {
    const handleMouseLeave = () => {
      emitEventRef.current('window_blur', { reason: 'mouse_left_window' });
    };
    document.addEventListener('mouseleave', handleMouseLeave);
    console.log('[PROCTORING] Mouse tracking started');
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, []);

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
    const cleanups = [
      setupTabSwitchDetection(),
      setupCopyPasteDetection(),
      setupScreenshotDetection(),
      setupScreenRecordingDetection(),
      setupFullscreenDetection(),
      setupMouseTracking(),
    ];

    // Stream-dependent: workers + track monitoring
    // (Face detection is handled by useFaceDetection hook, not here)
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

    console.log('[PROCTORING] All monitoring active (2-worker architecture)');

    return () => {
      isMonitoringRef.current = false;
      setState(prev => ({ ...prev, isMonitoring: false }));

      // Cleanup event listeners
      cleanups.forEach(fn => fn());

      // Cleanup intervals
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
    screenshot_attempt: 'high',
    screen_recording_attempt: 'high',
    window_blur: 'low',
    fullscreen_exit: 'high',
    face_missing: 'high',
    multiple_faces: 'high',
    gaze_away: 'medium',
  };
  return map[type] || 'low';
}
