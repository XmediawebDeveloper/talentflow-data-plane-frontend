export { useInterviewProctoringMonitor } from './InterviewProctoringMonitor';
export { useInterviewFaceDetection } from './InterviewFaceDetection';
export { useInterviewObjectDetection } from './InterviewObjectDetection';
export type { DetectedObjectEvent } from './InterviewObjectDetection';
export { DETECTABLE_OBJECTS, objectDisplayLabel } from './detectableObjects';
export type { ObjectEventType } from './detectableObjects';
export { useInterviewFaceVerification } from './InterviewFaceVerification';
export { useInterviewVoiceVerification } from './InterviewVoiceVerification';
export { InterviewProctoringWarnings } from './InterviewProctoringWarnings';
export { ScreenRecordingBlockedModal } from './ScreenRecordingBlockedModal';
export { useScreenRecordingDefense, RECORDER_SUSPICION_TTL_MS } from './useScreenRecordingDefense';
export type { ScreenRecordingDefenseState } from './useScreenRecordingDefense';
export {
  beginLegitimateShare,
  endLegitimateShare,
  isLegitimateShareInFlight,
  resetLegitimateShareState,
  registerAppOwnedStream,
  unregisterAppOwnedStream,
  markAppOwnedCanvas,
  installScreenCaptureGuard,
  isScreenCaptureGuardInstalled,
  isDesktopCaptureConstraint,
  onScreenRecordingAttempt,
  reportScreenRecordingAttempt,
  SCREEN_RECORDING_BLOCKED_MESSAGE,
} from './ScreenRecordingGuard';
export type {
  ScreenRecordingAttempt,
  ScreenRecordingVector,
  ScreenRecordingEnforcement,
} from './ScreenRecordingGuard';
export { RECORDER_HOTKEYS, matchRecorderHotkey, detectRecorderPlatform } from './ScreenRecorderHotkeys';
export type { RecorderHotkey, RecorderPlatform } from './ScreenRecorderHotkeys';
export { listRecorderDevices, recorderDeviceKey } from './ScreenRecorderDevices';
export type { RecorderDeviceMatch } from './ScreenRecorderDevices';
export { EnvironmentVerificationOverlay } from './EnvironmentVerificationOverlay';
export { InterviewEventBus } from './InterviewEventBus';
export type { ProctoringEventType, ProctoringEvent } from './InterviewEventBus';
