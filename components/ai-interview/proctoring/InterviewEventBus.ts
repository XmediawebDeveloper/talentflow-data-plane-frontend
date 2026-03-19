/**
 * InterviewEventBus — Lightweight pub/sub for AI interview proctoring events.
 *
 * Forked from lib/ProctoringEventBus.ts to decouple AI interview proctoring
 * from assessment proctoring. Separate singleton prevents cross-contamination
 * if both systems ever run simultaneously.
 *
 * Producers:  useInterviewProctoringMonitor, useInterviewFaceDetection
 * Consumers:  InterviewProctoringWarnings (self-contained, own state)
 */

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
  | 'window_blur'
  | 'fullscreen_exit'
  | 'face_missing'
  | 'multiple_faces'
  | 'gaze_away'
  | 'face_mismatch'
  | 'face_identity_changed'
  | 'voice_mismatch'
  | 'voice_identity_changed';

export interface ProctoringEvent {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  details?: Record<string, any>;
}

// Warning messages
const WARNING_MESSAGES: Record<ProctoringEventType, string> = {
  tab_switch: 'Tab switching detected. Please stay on the interview page.',
  copy_attempt: 'Copying is not allowed during the interview.',
  paste_attempt: 'Pasting is not allowed during the interview.',
  voice_detected: 'Voice activity detected. Please maintain silence during the interview.',
  multiple_voices: 'Multiple voices detected. Please ensure you are alone.',
  camera_disabled: 'Camera has been disabled. Please enable your camera to continue.',
  microphone_disabled: 'Microphone has been disabled. Please enable your microphone.',
  camera_obstructed: 'Camera appears to be blocked. Please ensure your face is visible.',
  screenshot_attempt: 'Screenshot attempt detected. Screenshots are not allowed.',
  screen_recording_attempt: 'Screen recording detected. Recording is not allowed.',
  window_blur: 'You navigated away from the interview window.',
  fullscreen_exit: 'Fullscreen mode exited. Please return to fullscreen to continue.',
  face_missing: 'No face detected. Please ensure your face is visible to the camera.',
  multiple_faces: 'Multiple faces detected. Please ensure you are alone.',
  gaze_away: 'Looking away detected. Please keep your attention on the screen.',
  face_mismatch: 'Face verification warning. Please ensure you are the registered candidate.',
  face_identity_changed: 'A different person has been detected. Identity verification failed.',
  voice_mismatch: 'Voice verification warning. Voice pattern does not match the registered speaker.',
  voice_identity_changed: 'A different speaker has been detected. Voice verification failed.',
};

// Severity mapping
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
  fullscreen_exit: 'high',
  face_missing: 'high',
  multiple_faces: 'high',
  gaze_away: 'medium',
  face_mismatch: 'medium',
  face_identity_changed: 'high',
  voice_mismatch: 'medium',
  voice_identity_changed: 'high',
};

type Listener = (event: ProctoringEvent) => void;

class InterviewEventBusClass {
  private listeners = new Set<Listener>();

  /** Subscribe to proctoring events */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Emit a proctoring event to all subscribers */
  emit(type: ProctoringEventType, details?: Record<string, any>): ProctoringEvent {
    const event: ProctoringEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      message: WARNING_MESSAGES[type],
      severity: EVENT_SEVERITY[type],
      timestamp: new Date(),
      details,
    };
    this.listeners.forEach(fn => {
      try { fn(event); } catch (e) { console.error('[InterviewEventBus] Listener error:', e); }
    });
    return event;
  }

  /** Remove all listeners (cleanup) */
  clear(): void {
    this.listeners.clear();
  }
}

// Singleton — dedicated to AI interview (separate from assessment ProctoringEventBus)
export const InterviewEventBus = new InterviewEventBusClass();
