/**
 * virtualCameraDetection — flags mobile-camera-relay virtual webcam drivers
 * (Motorola Smart Connect, DroidCam, Iriun, EpocCam, Camo, OBS Virtual Camera,
 * etc.) so they can be rejected as the interview's camera source.
 *
 * These apps install a virtual video driver on the PC that registers as a
 * normal camera device — the browser's Media Capture API has no flag
 * distinguishing "hardware camera" from "software-relayed camera", so the
 * driver's advertised name is the only signal available short of a native
 * lockdown client with real OS-level device enumeration. This is therefore a
 * name-pattern heuristic, not a guarantee: an app shipping a generic/renamed
 * label evades it.
 */

const VIRTUAL_CAMERA_PATTERNS: RegExp[] = [
  /motorola\s*smart\s*connect/i,
  /moto\s*connect/i,
  /droidcam/i,
  /iriun/i,
  /epoccam/i,
  /\bcamo\b/i,
  /ivcam/i,
  /obs\s*virtual\s*camera/i,
  /manycam/i,
  /xsplit\s*vcam/i,
  /ndi\s*(video|cam)/i,
  /snap\s*camera/i,
  /reincubate/i,
  /elgato\s*camera\s*hub/i,
  /\bvcam\b/i,
  /virtual\s*camera/i,
];

export function isVirtualCameraLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return VIRTUAL_CAMERA_PATTERNS.some((re) => re.test(label));
}

/**
 * NOT used to gate anything — kept only as a diagnostic/logging signal.
 *
 * This was originally meant as a weak secondary signal (a real laptop/USB
 * webcam supposedly never reports a facingMode capability), but that doesn't
 * hold here: Webcam.tsx's getUserMedia call explicitly REQUESTS
 * `facingMode: "user"`, so Chrome can legitimately echo a facingMode
 * capability back for an ordinary built-in laptop camera too. Gating on this
 * (as an earlier version of this file did, via `||` into `flagged`) silently
 * rejected real cameras — breaking the interview's webcam stream entirely,
 * which is far worse than the phone-relay bypass this was meant to catch.
 * Label matching is the only signal reliable enough to block on.
 */
export function hasPhoneFacingModeCapability(track: MediaStreamTrack | undefined | null): boolean {
  if (!track) return false;
  try {
    const caps = track.getCapabilities?.();
    const facingMode = caps?.facingMode;
    return Array.isArray(facingMode) && facingMode.length > 0;
  } catch {
    return false;
  }
}

export interface VirtualCameraCheckResult {
  flagged: boolean;
  label: string;
  reason: 'label_match' | null;
}

export function checkVirtualCamera(track: MediaStreamTrack | undefined | null): VirtualCameraCheckResult {
  const label = track?.label || '';
  if (isVirtualCameraLabel(label)) {
    return { flagged: true, label, reason: 'label_match' };
  }
  return { flagged: false, label, reason: null };
}

export function virtualCameraMessage(label: string): string {
  const device = label ? `"${label}"` : 'an unrecognized virtual device';
  return `Virtual/phone camera detected (${device}). Please switch to your laptop's built-in camera or a standard USB webcam to continue.`;
}

/**
 * Candidate-facing message shown wherever an unsupported camera is selected
 * or attempted (dropdown, Run Check, mid-interview switch detection) — kept
 * as a single exported string so all three call sites show identical text.
 */
export const INVALID_CAMERA_SELECTION_MESSAGE = 'Please select a valid camera.';
