'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { candidateService } from '@/lib/services/candidateService';

export type ProctoringEventType =
  | 'tab_switch'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'voice_detected'
  | 'multiple_voices'
  | 'multiple_faces'
  | 'camera_disabled'
  | 'microphone_disabled'
  | 'camera_obstructed'
  | 'screenshot_attempt'
  | 'screen_recording_attempt'
  | 'window_blur';

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
  onWarning?: (warning: ProctoringWarning) => void;
  voiceDetectionSensitivity?: number; // 0-100, default 50
  obstructionThreshold?: number; // 0-255, default 30
}

interface ProctoringState {
  isMonitoring: boolean;
  violationCount: number;
  lastVoiceDetected: Date | null;
  isCameraObstructed: boolean;
  isMicrophoneActive: boolean;
  isCameraActive: boolean;
}

// Backend logging cooldown - very short for critical violations, accurate tracking (in milliseconds)
const BACKEND_COOLDOWNS: Record<ProctoringEventType, number> = {
  tab_switch: 2000,
  copy_attempt: 500,  // Reduced: log copy attempts more frequently
  paste_attempt: 500, // Reduced: log paste attempts more frequently
  voice_detected: 10000, // Increased: only log voice every 10 seconds
  multiple_voices: 15000,
  multiple_faces: 10000,  // Log at most every 10 seconds
  camera_disabled: 1000,     // Reduced: immediate detection
  microphone_disabled: 1000, // Reduced: immediate detection
  camera_obstructed: 3000,   // Reduced: faster detection
  screenshot_attempt: 500,   // Reduced: immediate detection
  screen_recording_attempt: 2000, // Reduced: faster detection
  window_blur: 2000,
};

// Frontend warning cooldown - reduced for immediate feedback on violations
const FRONTEND_WARNING_COOLDOWN = 3000; // 3 seconds for all warning pop-ups (immediate but not spammy)

// Voice detection specific settings (Throttle + Batch optimization)
const VOICE_CHECK_INTERVAL = 1000; // Check every 1 second
const VOICE_BATCH_INTERVAL = 10000; // Batch and send events every 10 seconds
const VOICE_LOG_ONLY = true; // Log-only mode: don't trigger UI warnings for voice

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
  onWarning,
  voiceDetectionSensitivity = 50,
  obstructionThreshold = 30,
}: UseProctoringMonitorOptions) {
  const [state, setState] = useState<ProctoringState>({
    isMonitoring: false,
    violationCount: 0,
    lastVoiceDetected: null,
    isCameraObstructed: false,
    isMicrophoneActive: true,
    isCameraActive: true,
  });

  // Refs for cleanup
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastBackendEventTimeRef = useRef<Record<string, number>>({});
  const lastFrontendWarningTimeRef = useRef<number>(0); // Single timestamp for all frontend warnings
  const isMonitoringRef = useRef(false);

  // Web Worker ref for heavy processing
  const workerRef = useRef<Worker | null>(null);
  const voiceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Throttle flags to prevent message flooding to worker
  const isVoiceProcessingRef = useRef(false);
  const isCameraProcessingRef = useRef(false);

  // Voice batching: collect events and send periodically
  const voiceBatchRef = useRef<Array<{ timestamp: string; details: Record<string, any> }>>([]);
  const voiceBatchIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Face detection refs
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs for all props to prevent infinite re-renders
  const onWarningRef = useRef(onWarning);
  const tokenRef = useRef(token);
  const streamRef = useRef(stream);
  const enabledRef = useRef(enabled);

  // Keep refs up to date without triggering re-renders
  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Refs for worker processing params
  const voiceSensitivityRef = useRef(voiceDetectionSensitivity);
  const obstructionThresholdRef = useRef(obstructionThreshold);

  useEffect(() => {
    voiceSensitivityRef.current = voiceDetectionSensitivity;
  }, [voiceDetectionSensitivity]);

  useEffect(() => {
    obstructionThresholdRef.current = obstructionThreshold;
  }, [obstructionThreshold]);

  // Generate unique warning ID
  const generateWarningId = () => `warning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Check if backend logging is within cooldown (shorter cooldowns for accurate tracking)
  const isBackendInCooldown = useCallback((eventType: ProctoringEventType): boolean => {
    const lastTime = lastBackendEventTimeRef.current[eventType] || 0;
    const cooldown = BACKEND_COOLDOWNS[eventType];
    return Date.now() - lastTime < cooldown;
  }, []);

  // Check if frontend warning is within cooldown (60 seconds for all warnings)
  const isFrontendWarningInCooldown = useCallback((): boolean => {
    const lastTime = lastFrontendWarningTimeRef.current;
    return Date.now() - lastTime < FRONTEND_WARNING_COOLDOWN;
  }, []);

  // Ref for violation count to avoid re-renders
  const violationCountRef = useRef(0);

  // Log event with frontend warning (two-cooldown system)
  // - Backend: logs continuously with short cooldowns per event type
  // - Frontend: shows warning pop-up only once per 60 seconds (all events combined)
  // - Voice detection: uses log-only mode (no UI warnings) when VOICE_LOG_ONLY is true
  const logEvent = useCallback(async (
    eventType: ProctoringEventType,
    details?: Record<string, any>
  ) => {
    if (!enabledRef.current) return;

    // Check backend cooldown - if in cooldown, skip entirely
    if (isBackendInCooldown(eventType)) return;

    // Update backend cooldown timestamp
    lastBackendEventTimeRef.current[eventType] = Date.now();
    violationCountRef.current += 1;

    // Skip UI warning for voice detection in log-only mode
    const isVoiceLogOnly = VOICE_LOG_ONLY && (eventType === 'voice_detected' || eventType === 'multiple_voices');

    // Show frontend warning only if 60 seconds have passed since last warning
    // AND it's not a voice event in log-only mode
    const shouldShowWarning = !isFrontendWarningInCooldown() && !isVoiceLogOnly;
    if (shouldShowWarning) {
      lastFrontendWarningTimeRef.current = Date.now();

      const warning: ProctoringWarning = {
        id: generateWarningId(),
        type: eventType,
        message: WARNING_MESSAGES[eventType],
        timestamp: new Date(),
        severity: EVENT_SEVERITY[eventType],
      };

      // Notify via callback (use ref to avoid re-renders)
      onWarningRef.current?.(warning);
      console.log(`[PROCTORING] Frontend warning shown: ${eventType}`);
    } else if (isVoiceLogOnly) {
      console.log(`[PROCTORING] Voice warning skipped (log-only mode): ${eventType}`);
    } else {
      console.log(`[PROCTORING] Frontend warning skipped (cooldown): ${eventType}`);
    }

    // Always log to backend (use ref for token)
    try {
      await candidateService.reportProctorEvent(tokenRef.current, {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        details: details || {},
      });
      console.log(`[PROCTORING] Event logged to backend: ${eventType}`);
    } catch (error) {
      console.error(`[PROCTORING] Failed to log event: ${eventType}`, error);
    }
  }, [isBackendInCooldown, isFrontendWarningInCooldown]);

  // Store logEvent in ref for worker message handler
  const logEventRef = useRef(logEvent);
  useEffect(() => {
    logEventRef.current = logEvent;
  }, [logEvent]);

  // Flush voice batch to backend - sends aggregated voice events
  const flushVoiceBatch = useCallback(async () => {
    if (voiceBatchRef.current.length === 0) return;

    const batch = [...voiceBatchRef.current];
    voiceBatchRef.current = []; // Clear batch

    console.log(`[PROCTORING] Flushing voice batch: ${batch.length} events`);

    // Log as a single aggregated event to backend
    try {
      await candidateService.reportProctorEvent(tokenRef.current, {
        event_type: 'voice_detected',
        timestamp: new Date().toISOString(),
        details: {
          batch_count: batch.length,
          batch_start: batch[0]?.timestamp,
          batch_end: batch[batch.length - 1]?.timestamp,
          events: batch
        },
      });
      console.log(`[PROCTORING] Voice batch logged to backend: ${batch.length} events`);
    } catch (error) {
      console.error('[PROCTORING] Failed to log voice batch:', error);
    }
  }, []);

  // ==================== WEB WORKER SETUP ====================
  // Inline worker code for reliable loading (avoids Next.js file serving issues)
  const getWorkerCode = () => `
    // Voice detection state
    let voiceConsecutiveFrames = 0;
    const VOICE_FRAME_THRESHOLD = 3;

    // Camera obstruction state
    let obstructionConsecutiveFrames = 0;
    const OBSTRUCTION_FRAME_THRESHOLD = 30;

    function analyzeVoice(frequencyData, threshold, sampleRate) {
      const bufferLength = frequencyData.length;
      const binSize = sampleRate / (bufferLength * 2);
      const speechStartBin = Math.floor(300 / binSize);
      const speechEndBin = Math.min(Math.floor(3000 / binSize), bufferLength);

      let sum = 0;
      for (let i = speechStartBin; i < speechEndBin; i++) {
        sum += frequencyData[i];
      }
      const average = sum / (speechEndBin - speechStartBin);

      if (average > threshold) {
        voiceConsecutiveFrames++;
        if (voiceConsecutiveFrames >= VOICE_FRAME_THRESHOLD) {
          voiceConsecutiveFrames = 0;
          return { detected: true, averageVolume: average, threshold: threshold };
        }
      } else {
        voiceConsecutiveFrames = Math.max(0, voiceConsecutiveFrames - 1);
      }
      return { detected: false };
    }

    function analyzeCameraObstruction(imageData, width, height, obstructionThreshold) {
      let totalBrightness = 0;
      let minBrightness = 255;
      let maxBrightness = 0;

      for (let i = 0; i < imageData.length; i += 16) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const brightness = (r + g + b) / 3;
        totalBrightness += brightness;
        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
      }

      const sampledPixels = Math.floor(imageData.length / 16);
      const avgBrightness = totalBrightness / sampledPixels;
      const brightnessRange = maxBrightness - minBrightness;

      const isDark = avgBrightness < obstructionThreshold;
      const isUniform = brightnessRange < 20;

      if (isDark || isUniform) {
        obstructionConsecutiveFrames++;
        if (obstructionConsecutiveFrames >= OBSTRUCTION_FRAME_THRESHOLD) {
          obstructionConsecutiveFrames = 0;
          return {
            obstructed: true,
            avgBrightness: avgBrightness,
            brightnessRange: brightnessRange,
            reason: isDark ? 'too_dark' : 'too_uniform'
          };
        }
      } else {
        obstructionConsecutiveFrames = Math.max(0, obstructionConsecutiveFrames - 2);
      }

      return { obstructed: false, avgBrightness: avgBrightness, brightnessRange: brightnessRange };
    }

    self.onmessage = function(e) {
      const { type, data } = e.data;

      switch (type) {
        case 'ANALYZE_VOICE': {
          const result = analyzeVoice(
            new Uint8Array(data.frequencyData),
            data.threshold,
            data.sampleRate
          );
          self.postMessage({ type: 'VOICE_RESULT', data: result });
          break;
        }
        case 'ANALYZE_CAMERA': {
          const result = analyzeCameraObstruction(
            new Uint8ClampedArray(data.imageData),
            data.width,
            data.height,
            data.obstructionThreshold
          );
          self.postMessage({ type: 'CAMERA_RESULT', data: result });
          break;
        }
        case 'RESET': {
          voiceConsecutiveFrames = 0;
          obstructionConsecutiveFrames = 0;
          self.postMessage({ type: 'RESET_COMPLETE' });
          break;
        }
      }
    };

    self.postMessage({ type: 'WORKER_READY' });
  `;

  const setupWorker = useCallback(() => {
    if (workerRef.current) return; // Already initialized

    try {
      // Create inline worker using Blob (more reliable than file-based worker in Next.js)
      const blob = new Blob([getWorkerCode()], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      workerRef.current = new Worker(workerUrl);

      workerRef.current.onmessage = (e) => {
        const { type, data } = e.data;

        switch (type) {
          case 'WORKER_READY':
            console.log('[PROCTORING] Web Worker ready');
            break;

          case 'VOICE_RESULT':
            // Reset throttle flag - ready for next analysis
            isVoiceProcessingRef.current = false;
            if (data.detected) {
              // Add to batch instead of logging immediately
              voiceBatchRef.current.push({
                timestamp: new Date().toISOString(),
                details: {
                  averageVolume: data.averageVolume,
                  threshold: data.threshold
                }
              });
              console.log(`[PROCTORING] Voice detected - batched (${voiceBatchRef.current.length} events pending)`);
            }
            break;

          case 'CAMERA_RESULT':
            // Reset throttle flag - ready for next analysis
            isCameraProcessingRef.current = false;
            if (data.obstructed) {
              // Only update state if it actually changed
              setState(prev => {
                if (!prev.isCameraObstructed) {
                  return { ...prev, isCameraObstructed: true };
                }
                return prev;
              });
              logEventRef.current('camera_obstructed', {
                avgBrightness: data.avgBrightness,
                brightnessRange: data.brightnessRange,
                reason: data.reason
              });
            } else {
              setState(prev => {
                if (prev.isCameraObstructed) {
                  return { ...prev, isCameraObstructed: false };
                }
                return prev; // No state change needed
              });
            }
            break;

          case 'RESET_COMPLETE':
            console.log('[PROCTORING] Worker state reset');
            break;
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('[PROCTORING] Worker error:', error.message || error);
      };

      console.log('[PROCTORING] Web Worker initialized (inline)');
    } catch (error) {
      console.error('[PROCTORING] Failed to initialize Web Worker:', error);
    }
  }, []);

  // ==================== VOICE DETECTION (Web Worker) ====================
  const setupVoiceDetection = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream || !workerRef.current) return;

    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      audioContextRef.current = new AudioContext();
      // AudioContext may start suspended — resume it to allow processing
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const source = audioContextRef.current.createMediaStreamSource(currentStream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const sampleRate = audioContextRef.current.sampleRate;

      // Use setInterval with VOICE_CHECK_INTERVAL (2 seconds) for throttled voice detection
      // This dramatically reduces CPU usage while still detecting sustained voice activity
      voiceIntervalRef.current = setInterval(() => {
        if (!isMonitoringRef.current || !analyserRef.current || !workerRef.current) return;

        // Skip if previous analysis is still processing (prevents message flooding)
        if (isVoiceProcessingRef.current) return;
        isVoiceProcessingRef.current = true;

        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate threshold based on sensitivity
        const threshold = 128 - (voiceSensitivityRef.current * 1.28);

        // Send to worker for processing (transfer the buffer for performance)
        const dataToSend = new Uint8Array(dataArray);
        workerRef.current.postMessage({
          type: 'ANALYZE_VOICE',
          data: {
            frequencyData: dataToSend.buffer,
            threshold,
            sampleRate
          }
        }, [dataToSend.buffer]);
      }, VOICE_CHECK_INTERVAL);

      // Start batch flush interval - send batched voice events every VOICE_BATCH_INTERVAL
      voiceBatchIntervalRef.current = setInterval(() => {
        if (voiceBatchRef.current.length > 0) {
          flushVoiceBatch();
        }
      }, VOICE_BATCH_INTERVAL);

      console.log(`[PROCTORING] Voice detection started (Web Worker, check: ${VOICE_CHECK_INTERVAL}ms, batch: ${VOICE_BATCH_INTERVAL}ms, log-only: ${VOICE_LOG_ONLY})`);
    } catch (error) {
      console.error('[PROCTORING] Failed to setup voice detection:', error);
    }
  }, [flushVoiceBatch]); // flushVoiceBatch is stable (useCallback with no deps)

  // ==================== MULTIPLE FACES DETECTION ====================
  const FACE_DETECTION_INTERVAL = 5000; // Check every 5 seconds
  // CDN hosting tiny face detector model weights (~190 KB) — no local model files needed
  const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

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

  // ==================== CAMERA OBSTRUCTION DETECTION (Web Worker) ====================
  const setupCameraObstructionDetection = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream || !workerRef.current) return;

    const videoTracks = currentStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    // Create hidden video and canvas for analysis
    videoRef.current = document.createElement('video');
    videoRef.current.srcObject = currentStream;
    videoRef.current.muted = true;
    videoRef.current.play();

    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = 160; // Small resolution for performance
    canvasRef.current.height = 120;
    const ctx = canvasRef.current.getContext('2d');

    if (!ctx) return;

    // Use setInterval instead of setTimeout for better control
    // 200ms interval = 5 checks per second (reduced from 100ms for better performance)
    const startCameraCheck = () => {
      cameraIntervalRef.current = setInterval(() => {
        if (!isMonitoringRef.current || !videoRef.current || !canvasRef.current || !workerRef.current) return;

        // Skip if previous analysis is still processing (prevents message flooding)
        if (isCameraProcessingRef.current) return;
        isCameraProcessingRef.current = true;

        ctx.drawImage(videoRef.current, 0, 0, 160, 120);
        const imageData = ctx.getImageData(0, 0, 160, 120);

        // Send to worker for processing (transfer the buffer for performance)
        const dataToSend = new Uint8ClampedArray(imageData.data);
        workerRef.current.postMessage({
          type: 'ANALYZE_CAMERA',
          data: {
            imageData: dataToSend.buffer,
            width: 160,
            height: 120,
            obstructionThreshold: obstructionThresholdRef.current
          }
        }, [dataToSend.buffer]);
      }, 200);

      console.log('[PROCTORING] Camera obstruction detection started (Web Worker, 200ms interval, throttled)');
    };

    videoRef.current.onloadedmetadata = () => {
      startCameraCheck();
    };
  }, []); // No dependencies - uses refs internally

  // ==================== TRACK STATE MONITORING ====================
  const setupTrackMonitoring = useCallback(() => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    const videoTracks = currentStream.getVideoTracks();
    const audioTracks = currentStream.getAudioTracks();

    // Monitor video track
    videoTracks.forEach(track => {
      track.onended = () => {
        setState(prev => ({ ...prev, isCameraActive: false }));
        logEvent('camera_disabled', { reason: 'track_ended' });
      };
      track.onmute = () => {
        setState(prev => ({ ...prev, isCameraActive: false }));
        logEvent('camera_disabled', { reason: 'track_muted' });
      };
      track.onunmute = () => {
        setState(prev => ({ ...prev, isCameraActive: true }));
      };
    });

    // Monitor audio track
    audioTracks.forEach(track => {
      track.onended = () => {
        setState(prev => ({ ...prev, isMicrophoneActive: false }));
        logEvent('microphone_disabled', { reason: 'track_ended' });
      };
      track.onmute = () => {
        setState(prev => ({ ...prev, isMicrophoneActive: false }));
        logEvent('microphone_disabled', { reason: 'track_muted' });
      };
      track.onunmute = () => {
        setState(prev => ({ ...prev, isMicrophoneActive: true }));
      };
    });

    console.log('[PROCTORING] Track monitoring started');
  }, [logEvent]); // Removed stream - using ref

  // ==================== SCREENSHOT DETECTION ====================
  const setupScreenshotDetection = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        logEvent('screenshot_attempt', { key: 'PrintScreen' });
        // Clear clipboard
        navigator.clipboard?.writeText('').catch(() => {});
      }

      // Ctrl+PrintScreen or Alt+PrintScreen
      if ((e.ctrlKey || e.altKey) && e.key === 'PrintScreen') {
        e.preventDefault();
        logEvent('screenshot_attempt', { key: 'Ctrl/Alt+PrintScreen' });
        navigator.clipboard?.writeText('').catch(() => {});
      }

      // Windows Snipping Tool: Win+Shift+S
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        logEvent('screenshot_attempt', { key: 'Win+Shift+S' });
      }

      // Mac screenshot: Cmd+Shift+3 or Cmd+Shift+4
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) {
        e.preventDefault();
        logEvent('screenshot_attempt', { key: `Cmd+Shift+${e.key}` });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    console.log('[PROCTORING] Screenshot detection started');

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [logEvent]);

  // ==================== SCREEN RECORDING DETECTION ====================
  const setupScreenRecordingDetection = useCallback(() => {
    // Override getDisplayMedia to detect screen sharing attempts
    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;

    if (originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = async function(constraints) {
        logEvent('screen_recording_attempt', { constraints });
        throw new Error('Screen recording is not allowed during the assessment');
      };
    }

    console.log('[PROCTORING] Screen recording detection started');

    return () => {
      if (originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
    };
  }, [logEvent]);

  // ==================== COPY/PASTE DETECTION ====================
  const setupCopyPasteDetection = useCallback(() => {
    const handleCopy = (e: ClipboardEvent) => {
      // CRITICAL: Completely block copy - prevent default and stop all propagation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Clear clipboard data
      if (e.clipboardData) {
        e.clipboardData.clearData();
      }

      // Log the violation with selected text info
      logEvent('copy_attempt', {
        selectedText: window.getSelection()?.toString()?.substring(0, 100)
      });

      // Return false for extra safety (legacy support)
      return false;
    };

    const handlePaste = (e: ClipboardEvent) => {
      // CRITICAL: Completely block paste - prevent default and stop all propagation
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Clear clipboard data to ensure nothing gets pasted
      if (e.clipboardData) {
        e.clipboardData.clearData();
      }

      // Log the violation
      logEvent('paste_attempt', {
        clipboardDataLength: e.clipboardData?.getData('text')?.length || 0
      });

      // Return false for extra safety (legacy support)
      return false;
    };

    const handleCut = (e: ClipboardEvent) => {
      // Block cut as well (same as copy)
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      logEvent('copy_attempt', { action: 'cut' });
      return false;
    };

    // Block context menu (right-click) which can be used for copy/paste
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('[PROCTORING] Context menu blocked');
      return false;
    };

    // Block keyboard shortcuts for copy/paste/cut AND Alt+Tab
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Tab (switch window/tab) - CRITICAL BLOCKING
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('tab_switch', { method: 'alt_tab', blocked: true });
        console.log('[PROCTORING] Alt+Tab blocked');
        return false;
      }

      // Alt+F4 (close window)
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('window_blur', { method: 'alt_f4', blocked: true });
        console.log('[PROCTORING] Alt+F4 blocked');
        return false;
      }

      // Cmd+Tab (Mac - switch application)
      if (e.metaKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('tab_switch', { method: 'cmd_tab', blocked: true });
        console.log('[PROCTORING] Cmd+Tab blocked');
        return false;
      }

      // Ctrl+Tab (switch browser tab)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('tab_switch', { method: 'ctrl_tab', blocked: true });
        console.log('[PROCTORING] Ctrl+Tab blocked');
        return false;
      }

      // Windows key (brings up start menu)
      if (e.key === 'Meta' || e.key === 'OS') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('window_blur', { method: 'windows_key', blocked: true });
        console.log('[PROCTORING] Windows key blocked');
        return false;
      }

      // Ctrl+C or Cmd+C (copy)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('copy_attempt', { method: 'keyboard_shortcut' });
        return false;
      }

      // Ctrl+V or Cmd+V (paste)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('paste_attempt', { method: 'keyboard_shortcut' });
        return false;
      }

      // Ctrl+X or Cmd+X (cut)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        logEvent('copy_attempt', { method: 'keyboard_shortcut', action: 'cut' });
        return false;
      }

      // Ctrl+A or Cmd+A (select all) - also block to prevent bulk copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log('[PROCTORING] Select all blocked');
        return false;
      }
    };

    // Add all event listeners with capture phase (true) for maximum priority
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('cut', handleCut, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);

    console.log('[PROCTORING] Copy/paste/cut detection started (comprehensive blocking)');

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('cut', handleCut, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [logEvent]);

  // ==================== MOUSE MOVEMENT TRACKING ====================
  const setupMouseTracking = useCallback(() => {
    let lastMousePosition = { x: 0, y: 0 };
    let mouseIdleTime = 0;
    let mouseMoveCount = 0;
    const IDLE_THRESHOLD = 120; // 2 minutes of no mouse movement
    const SUSPICIOUS_MOVEMENT_THRESHOLD = 5000; // Very high movement count in short time

    const handleMouseMove = (e: MouseEvent) => {
      const currentX = e.clientX;
      const currentY = e.clientY;

      // Calculate movement distance
      const distance = Math.sqrt(
        Math.pow(currentX - lastMousePosition.x, 2) +
        Math.pow(currentY - lastMousePosition.y, 2)
      );

      // Only count significant movements (not micro jitters)
      if (distance > 10) {
        mouseMoveCount++;
        mouseIdleTime = 0; // Reset idle time
      }

      lastMousePosition = { x: currentX, y: currentY };
    };

    const handleMouseLeave = () => {
      console.log('[PROCTORING] Mouse left window - potential tab switch');
      logEvent('window_blur', { reason: 'mouse_left_window' });
    };

    // Check for suspicious patterns every 10 seconds
    const trackingInterval = setInterval(() => {
      mouseIdleTime += 10;

      // Detect prolonged idle (might indicate user left)
      if (mouseIdleTime >= IDLE_THRESHOLD) {
        console.log('[PROCTORING] Mouse idle for 2+ minutes');
        // Don't log event - just track (too many false positives)
        mouseIdleTime = 0; // Reset to avoid spam
      }

      // Detect bot-like behavior (too many movements)
      if (mouseMoveCount > SUSPICIOUS_MOVEMENT_THRESHOLD) {
        console.log('[PROCTORING] Suspicious mouse activity detected');
        mouseMoveCount = 0; // Reset counter
      } else {
        mouseMoveCount = 0; // Reset every interval
      }
    }, 10000);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    console.log('[PROCTORING] Mouse movement tracking started');

    return () => {
      clearInterval(trackingInterval);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [logEvent]);

  // ==================== TAB SWITCH / WINDOW BLUR DETECTION ====================
  const setupTabSwitchDetection = useCallback(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logEvent('tab_switch', { hidden: true });
      }
    };

    const handleBlur = () => {
      logEvent('window_blur', {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    console.log('[PROCTORING] Tab switch detection started');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [logEvent]);

  // ==================== MAIN EFFECT ====================
  useEffect(() => {
    if (!enabledRef.current) return;

    isMonitoringRef.current = true;
    setState(prev => ({ ...prev, isMonitoring: true }));

    // Initialize Web Worker first
    setupWorker();

    // Setup all detections (lightweight - stay on main thread)
    const cleanupScreenshot = setupScreenshotDetection();
    const cleanupScreenRecording = setupScreenRecordingDetection();
    const cleanupCopyPaste = setupCopyPasteDetection();
    const cleanupTabSwitch = setupTabSwitchDetection();
    const cleanupMouseTracking = setupMouseTracking();

    // Stream-dependent setups (heavy processing offloaded to Web Worker)
    if (streamRef.current) {
      // Small delay to ensure worker is ready
      setTimeout(() => {
        setupVoiceDetection();
        setupCameraObstructionDetection();
        setupTrackMonitoring();
        setupFaceDetection();
      }, 100);
    }

    console.log('[PROCTORING] All monitoring systems active (Web Worker enabled)');

    return () => {
      isMonitoringRef.current = false;
      setState(prev => ({ ...prev, isMonitoring: false }));

      // Reset throttle flags
      isVoiceProcessingRef.current = false;
      isCameraProcessingRef.current = false;

      // Cleanup voice detection interval
      if (voiceIntervalRef.current) {
        clearInterval(voiceIntervalRef.current);
        voiceIntervalRef.current = null;
      }

      // Cleanup voice batch interval and flush remaining events
      if (voiceBatchIntervalRef.current) {
        clearInterval(voiceBatchIntervalRef.current);
        voiceBatchIntervalRef.current = null;
      }
      // Flush any remaining batched voice events
      if (voiceBatchRef.current.length > 0) {
        console.log(`[PROCTORING] Flushing remaining ${voiceBatchRef.current.length} voice events on cleanup`);
        // Fire and forget - don't await since we're cleaning up
        candidateService.reportProctorEvent(tokenRef.current, {
          event_type: 'voice_detected',
          timestamp: new Date().toISOString(),
          details: {
            batch_count: voiceBatchRef.current.length,
            cleanup_flush: true,
            events: voiceBatchRef.current
          },
        }).catch(err => console.error('[PROCTORING] Failed to flush voice batch on cleanup:', err));
        voiceBatchRef.current = [];
      }

      // Cleanup camera detection interval
      if (cameraIntervalRef.current) {
        clearInterval(cameraIntervalRef.current);
        cameraIntervalRef.current = null;
      }

      // Cleanup face detection
      if (faceIntervalRef.current) {
        clearInterval(faceIntervalRef.current);
        faceIntervalRef.current = null;
      }
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = null;
        faceVideoRef.current = null;
      }

      // Cleanup audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Cleanup animation frame (legacy, kept for safety)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Cleanup video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }

      // Cleanup canvas
      canvasRef.current = null;

      // Terminate Web Worker
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        console.log('[PROCTORING] Web Worker terminated');
      }

      // Cleanup event listeners
      cleanupScreenshot();
      cleanupScreenRecording();
      cleanupCopyPaste();
      cleanupTabSwitch();
      cleanupMouseTracking();

      console.log('[PROCTORING] All monitoring systems stopped');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stream]); // Only re-run when enabled/stream actually change - setup functions use refs internally

  return {
    state,
    logEvent, // Expose for manual event logging if needed
  };
}
