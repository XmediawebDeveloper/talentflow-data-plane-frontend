/**
 * ProctoringEventBus — Lightweight pub/sub for proctoring events.
 *
 * Decouples proctoring detection (workers + monitors) from the UI
 * so that warning toasts never trigger InterviewUI re-renders.
 *
 * Producers:  useProctoringMonitor, useFaceDetection
 * Consumers:  ProctoringWarningModal (self-contained, own state)
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
  | 'mouse_movement'
  | 'fullscreen_exit'
  | 'face_missing'
  | 'multiple_faces'
  | 'gaze_away'
  | 'camera_frozen'
  | 'identity_mismatch';

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
  tab_switch: 'Tab switching detected. Please stay on the assessment page.',
  copy_attempt: 'Copying is not allowed during the assessment.',
  paste_attempt: 'Pasting is not allowed during the assessment.',
  voice_detected: 'Voice activity detected. Please maintain silence during the assessment.',
  multiple_voices: 'Multiple voices detected. Please ensure you are alone.',
  camera_disabled: 'Camera has been disabled. Please enable your camera to continue.',
  microphone_disabled: 'Microphone has been disabled. Please enable your microphone.',
  camera_obstructed: 'Camera appears to be blocked. Please ensure your face is visible.',
  screenshot_attempt: 'Screenshot attempt detected. This action is being monitored.',
  screen_recording_attempt: 'Screen recording attempt detected. This action is being monitored.',
  window_blur: 'The assessment window lost focus. Please return to the assessment window.',
  mouse_movement: 'Mouse moved outside the safe assessment area. Please keep it within the browser window.',
  fullscreen_exit: 'Fullscreen mode exited. Please return to fullscreen to continue.',
  face_missing: 'No face detected. Please ensure your face is visible to the camera.',
  multiple_faces: 'Multiple faces detected. Please ensure you are alone.',
  gaze_away: 'Looking away detected. Please keep your attention on the screen.',
  camera_frozen: 'Camera feed appears frozen. Please restore your live camera feed.',
  identity_mismatch: 'Identity mismatch detected. Please ensure the registered candidate remains on camera.',
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
  mouse_movement: 'low',
  fullscreen_exit: 'high',
  face_missing: 'high',
  multiple_faces: 'high',
  gaze_away: 'medium',
  camera_frozen: 'high',
  identity_mismatch: 'high',
};

type Listener = (event: ProctoringEvent) => void;

class ProctoringEventBusClass {
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
      try { fn(event); } catch (e) { console.error('[EventBus] Listener error:', e); }
    });
    return event;
  }

  /** Remove all listeners (cleanup) */
  clear(): void {
    this.listeners.clear();
  }
}

// Singleton — shared across the app
export const ProctoringEventBus = new ProctoringEventBusClass();
