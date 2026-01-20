'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { candidateService } from '@/lib/services/candidateService';

export type ProctoringEventType =
  | 'tab_switch'
  | 'copy_attempt'
  | 'paste_attempt'
  | 'voice_detected'
  | 'multiple_voices'
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

// Cooldown periods to prevent spam (in milliseconds)
const EVENT_COOLDOWNS: Record<ProctoringEventType, number> = {
  tab_switch: 2000,
  copy_attempt: 1000,
  paste_attempt: 1000,
  voice_detected: 5000, // 5 second cooldown for voice
  multiple_voices: 10000, // 10 second cooldown
  camera_disabled: 2000,
  microphone_disabled: 2000,
  camera_obstructed: 3000,
  screenshot_attempt: 1000,
  screen_recording_attempt: 5000,
  window_blur: 2000,
};

// Warning messages for each event type
const WARNING_MESSAGES: Record<ProctoringEventType, string> = {
  tab_switch: 'Tab switching detected. Please stay on the assessment page.',
  copy_attempt: 'Copying is not allowed during the assessment.',
  paste_attempt: 'Pasting is not allowed during the assessment.',
  voice_detected: 'Voice activity detected. Please maintain silence during the assessment.',
  multiple_voices: 'Multiple voices detected. Please ensure you are alone.',
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
  const lastEventTimeRef = useRef<Record<string, number>>({});
  const isMonitoringRef = useRef(false);

  // Generate unique warning ID
  const generateWarningId = () => `warning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Check if event is within cooldown
  const isInCooldown = useCallback((eventType: ProctoringEventType): boolean => {
    const lastTime = lastEventTimeRef.current[eventType] || 0;
    const cooldown = EVENT_COOLDOWNS[eventType];
    return Date.now() - lastTime < cooldown;
  }, []);

  // Log event to backend
  const logEvent = useCallback(async (
    eventType: ProctoringEventType,
    details?: Record<string, any>
  ) => {
    if (!enabled || isInCooldown(eventType)) return;

    lastEventTimeRef.current[eventType] = Date.now();

    // Create warning
    const warning: ProctoringWarning = {
      id: generateWarningId(),
      type: eventType,
      message: WARNING_MESSAGES[eventType],
      timestamp: new Date(),
      severity: EVENT_SEVERITY[eventType],
    };

    // Update state
    setState(prev => ({
      ...prev,
      violationCount: prev.violationCount + 1,
    }));

    // Notify via callback
    onWarning?.(warning);

    // Log to backend
    try {
      await candidateService.reportProctorEvent(token, {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        details: details || {},
      });
      console.log(`[PROCTORING] Event logged: ${eventType}`);
    } catch (error) {
      console.error(`[PROCTORING] Failed to log event: ${eventType}`, error);
    }
  }, [token, enabled, onWarning, isInCooldown]);

  // ==================== VOICE DETECTION ====================
  const setupVoiceDetection = useCallback(() => {
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Voice detection threshold based on sensitivity
      const threshold = 128 - (voiceDetectionSensitivity * 1.28); // 0-128 range

      let consecutiveVoiceFrames = 0;
      const voiceFrameThreshold = 10; // Need 10 consecutive frames to confirm voice

      const detectVoice = () => {
        if (!isMonitoringRef.current || !analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume in speech frequency range (300Hz - 3000Hz)
        // With 256 fftSize and 48kHz sample rate, each bin is ~187.5Hz
        const speechStartBin = Math.floor(300 / 187.5);
        const speechEndBin = Math.floor(3000 / 187.5);

        let sum = 0;
        for (let i = speechStartBin; i < speechEndBin && i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / (speechEndBin - speechStartBin);

        if (average > threshold) {
          consecutiveVoiceFrames++;
          if (consecutiveVoiceFrames >= voiceFrameThreshold) {
            setState(prev => ({ ...prev, lastVoiceDetected: new Date() }));
            logEvent('voice_detected', { averageVolume: average, threshold });
            consecutiveVoiceFrames = 0;
          }
        } else {
          consecutiveVoiceFrames = Math.max(0, consecutiveVoiceFrames - 1);
        }

        animationFrameRef.current = requestAnimationFrame(detectVoice);
      };

      detectVoice();
      console.log('[PROCTORING] Voice detection started');
    } catch (error) {
      console.error('[PROCTORING] Failed to setup voice detection:', error);
    }
  }, [stream, voiceDetectionSensitivity, logEvent]);

  // ==================== CAMERA OBSTRUCTION DETECTION ====================
  const setupCameraObstructionDetection = useCallback(() => {
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    // Create hidden video and canvas for analysis
    videoRef.current = document.createElement('video');
    videoRef.current.srcObject = stream;
    videoRef.current.muted = true;
    videoRef.current.play();

    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = 160; // Small resolution for performance
    canvasRef.current.height = 120;
    const ctx = canvasRef.current.getContext('2d');

    if (!ctx) return;

    let consecutiveObstructedFrames = 0;
    const obstructionFrameThreshold = 30; // 30 frames (~1 second at 30fps)

    const checkObstruction = () => {
      if (!isMonitoringRef.current || !videoRef.current || !canvasRef.current) return;

      ctx.drawImage(videoRef.current, 0, 0, 160, 120);
      const imageData = ctx.getImageData(0, 0, 160, 120);
      const data = imageData.data;

      // Calculate average brightness and color variance
      let totalBrightness = 0;
      let minBrightness = 255;
      let maxBrightness = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;

        totalBrightness += brightness;
        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
      }

      const avgBrightness = totalBrightness / (data.length / 4);
      const brightnessRange = maxBrightness - minBrightness;

      // Detect obstruction:
      // 1. Very dark image (covered by hand/object)
      // 2. Very uniform color (covered by paper/tape)
      const isDark = avgBrightness < obstructionThreshold;
      const isUniform = brightnessRange < 20; // Very little variation

      if (isDark || isUniform) {
        consecutiveObstructedFrames++;
        if (consecutiveObstructedFrames >= obstructionFrameThreshold) {
          setState(prev => ({ ...prev, isCameraObstructed: true }));
          logEvent('camera_obstructed', {
            avgBrightness,
            brightnessRange,
            reason: isDark ? 'too_dark' : 'too_uniform',
          });
          consecutiveObstructedFrames = 0;
        }
      } else {
        consecutiveObstructedFrames = Math.max(0, consecutiveObstructedFrames - 2);
        setState(prev => ({ ...prev, isCameraObstructed: false }));
      }

      setTimeout(checkObstruction, 100); // Check every 100ms
    };

    videoRef.current.onloadedmetadata = () => {
      checkObstruction();
      console.log('[PROCTORING] Camera obstruction detection started');
    };
  }, [stream, obstructionThreshold, logEvent]);

  // ==================== TRACK STATE MONITORING ====================
  const setupTrackMonitoring = useCallback(() => {
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

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
  }, [stream, logEvent]);

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
      e.preventDefault();
      logEvent('copy_attempt', {
        selectedText: window.getSelection()?.toString()?.substring(0, 100)
      });
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logEvent('paste_attempt', {});
    };

    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('paste', handlePaste, true);
    console.log('[PROCTORING] Copy/paste detection started');

    return () => {
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('paste', handlePaste, true);
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
    if (!enabled) return;

    isMonitoringRef.current = true;
    setState(prev => ({ ...prev, isMonitoring: true }));

    // Setup all detections
    const cleanupScreenshot = setupScreenshotDetection();
    const cleanupScreenRecording = setupScreenRecordingDetection();
    const cleanupCopyPaste = setupCopyPasteDetection();
    const cleanupTabSwitch = setupTabSwitchDetection();

    // Stream-dependent setups
    if (stream) {
      setupVoiceDetection();
      setupCameraObstructionDetection();
      setupTrackMonitoring();
    }

    console.log('[PROCTORING] All monitoring systems active');

    return () => {
      isMonitoringRef.current = false;
      setState(prev => ({ ...prev, isMonitoring: false }));

      // Cleanup audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Cleanup animation frame
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

      // Cleanup event listeners
      cleanupScreenshot();
      cleanupScreenRecording();
      cleanupCopyPaste();
      cleanupTabSwitch();

      console.log('[PROCTORING] All monitoring systems stopped');
    };
  }, [
    enabled,
    stream,
    setupVoiceDetection,
    setupCameraObstructionDetection,
    setupTrackMonitoring,
    setupScreenshotDetection,
    setupScreenRecordingDetection,
    setupCopyPasteDetection,
    setupTabSwitchDetection,
  ]);

  return {
    state,
    logEvent, // Expose for manual event logging if needed
  };
}
