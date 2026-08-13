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
  // The candidate detached a video into a floating always-on-top window
  // (manual "Picture in Picture" or Chrome's auto-PiP on tab switch). Own
  // video elements set disablePictureInPicture, so this only fires via a
  // forced/extension-driven request — a genuine escape-the-monitored-view
  // signal, not an accidental blur.
  | 'picture_in_picture_detected'
  | 'background_noise'
  // Live object detection (see InterviewObjectDetection). Split into two types
  // rather than one "object_detected" so severity is carried by the type, the
  // same way every other event here works. The specific class ("cell phone",
  // "laptop", …) travels in details.object_class / details.object_label.
  | 'phone_detected'
  | 'unauthorized_object'
  // Diagnostic, NOT a violation: the object detector could not start (no
  // WebGPU, model missing on the server, ORT unreachable). Recorded so the
  // recruiter can tell "no phone was seen" apart from "we never looked" —
  // otherwise a broken detector reads as a clean interview.
  | 'object_detection_unavailable';

export interface ProctoringEvent {
  id: string;
  type: ProctoringEventType;
  message: string;
  severity: 'minor' | 'moderate' | 'severe';
  timestamp: Date;
  details?: Record<string, any>;
}

// Warning messages
// Copy uses the neutral word "session" so the same bus serves both the
// AI Interview surface and the candidate-Assessment surface — saying
// "interview window" on an MCQ assessment confused candidates.
const WARNING_MESSAGES: Record<ProctoringEventType, string> = {
  tab_switch: 'Tab switching detected. Please stay on this page.',
  copy_attempt: 'Copying is not allowed during this session.',
  paste_attempt: 'Pasting is not allowed during this session.',
  voice_detected: 'Voice activity detected. Please maintain silence during this session.',
  multiple_voices: 'Multiple voices detected. Please ensure you are alone.',
  camera_disabled: 'Camera has been disabled. Please enable your camera to continue.',
  microphone_disabled: 'Microphone has been disabled. Please enable your microphone.',
  camera_obstructed: 'Camera appears to be blocked. Please ensure your face is visible.',
  screenshot_attempt: 'Screenshot attempt detected. Screenshots are not allowed.',
  screen_recording_attempt: 'Screen recording detected. Recording is not allowed.',
  window_blur: 'You navigated away from this window.',
  fullscreen_exit: 'Fullscreen mode exited. Please return to fullscreen to continue.',
  face_missing: 'No face detected. Please ensure your face is visible to the camera.',
  multiple_faces: 'Multiple faces detected. Please ensure you are alone.',
  gaze_away: 'Looking away detected. Please keep your attention on the screen.',
  face_mismatch: 'Face verification warning. Please ensure you are the registered candidate.',
  face_identity_changed: 'A different person has been detected. Identity verification failed.',
  voice_mismatch: 'Voice verification warning. Voice pattern does not match the registered speaker.',
  voice_identity_changed: 'A different speaker has been detected. Voice verification failed.',
  screen_share_stopped: 'Screen sharing was stopped. Screen sharing is mandatory throughout this session.',
  picture_in_picture_detected: 'Picture-in-Picture detected. Please exit Picture-in-Picture mode to continue.',
  background_noise: 'Excessive background noise detected. Please move to a quieter environment for a better experience.',
  phone_detected: 'A mobile phone was detected. Please put it away — phones are not allowed during this session.',
  unauthorized_object: 'An unauthorised item was detected in view. Please remove it from your workspace.',
  // Never shown to the candidate — see BACKEND_ONLY_EVENT_TYPES in the monitor.
  object_detection_unavailable: '',
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
  picture_in_picture_detected: 'severe',
  // A phone in view is a direct, unambiguous integrity breach — the candidate
  // can read or be fed answers from it. Ranked alongside the identity signals.
  phone_detected:           'severe',
  // Other prohibited items (second screen, book, ambiguous handheld) are
  // suspicious but have innocent explanations, so they stay moderate.
  unauthorized_object:      'moderate',
  // Advisory — not a proctoring violation, just a UX nudge (AIU-67)
  background_noise:         'minor',
  // Diagnostic only; the backend maps this to "info" so it never scores.
  object_detection_unavailable: 'minor',
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
