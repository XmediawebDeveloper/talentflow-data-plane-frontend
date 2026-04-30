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
  | 'voice_identity_changed'
  | 'screen_share_stopped'
  | 'background_noise';

export interface ProctoringEvent {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'minor' | 'moderate' | 'severe';
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
  screen_share_stopped: 'Screen sharing was stopped. Screen sharing is mandatory throughout the interview.',
  background_noise: 'Excessive background noise detected. Please move to a quieter environment for a better experience.',
};

// Severity mapping — Minor / Moderate / Severe
const EVENT_SEVERITY: Record<ProctoringEventType, 'minor' | 'moderate' | 'severe'> = {
  // Minor (1 pt) — low-friction accidental events
  tab_switch:               'minor',
  window_blur:              'minor',
  gaze_away:                'minor',
  copy_attempt:             'minor',
  paste_attempt:            'minor',
  fullscreen_exit:          'minor',
  // Moderate (2 pts) — suspicious but not conclusive
  camera_obstructed:        'moderate',
  voice_detected:           'moderate',
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
  // Advisory — not a proctoring violation, just a UX nudge (AIU-67)
  background_noise:         'minor',
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
