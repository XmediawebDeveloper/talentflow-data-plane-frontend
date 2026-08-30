/**
 * cameraDeviceMonitor — decides whether the CURRENTLY live camera track is
 * still the one the candidate approved during System Check.
 *
 * Kept as a small pure function (mirrors virtualCameraDetection.ts's shape)
 * so InterviewUI's mid-interview device-swap effect can call one testable
 * decision point instead of inlining the comparison, and so it survives
 * independently of the (large, stateful) effect that calls it.
 */

import { isVirtualCameraLabel } from './virtualCameraDetection';

// Chrome's synthetic aliases for the "current default" input — never a real
// physical device id, so they can never count as a genuine device swap.
const PSEUDO_DEVICE_IDS = new Set(['default', 'communications']);

export interface CameraApprovalCheck {
  /** The deviceId approved during System Check (or captured at interview start). */
  approvedDeviceId: string | null | undefined;
  /** The currently live video track's `getSettings().deviceId`. */
  liveTrackDeviceId: string | null | undefined;
  /** The currently live video track's `label`. */
  liveTrackLabel: string | null | undefined;
}

export type CameraApprovalReason = 'virtual' | 'switched';

// A flat shape (rather than a `{valid:true} | {valid:false; reason}` union)
// so callers never need discriminant narrowing just to read `reason` — it's
// simply null whenever `valid` is true.
export interface CameraApprovalResult {
  valid: boolean;
  reason: CameraApprovalReason | null;
}

export function checkCameraApproval({
  approvedDeviceId,
  liveTrackDeviceId,
  liveTrackLabel,
}: CameraApprovalCheck): CameraApprovalResult {
  // Virtual/mobile-relay cameras are rejected outright, even if their
  // deviceId happens to match the approved one (an app could theoretically
  // be relaunched under the same OS-assigned id).
  if (isVirtualCameraLabel(liveTrackLabel)) {
    return { valid: false, reason: 'virtual' };
  }

  if (
    approvedDeviceId &&
    liveTrackDeviceId &&
    !PSEUDO_DEVICE_IDS.has(liveTrackDeviceId) &&
    liveTrackDeviceId !== approvedDeviceId
  ) {
    return { valid: false, reason: 'switched' };
  }

  return { valid: true, reason: null };
}
