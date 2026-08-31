/**
 * AI Interview webcam validation — unit coverage for the pure decision
 * modules behind "restrict mobile/virtual cameras" (see
 * lib/proctoring/virtualCameraDetection.ts and
 * lib/proctoring/cameraDeviceMonitor.ts).
 *
 * Scope, stated honestly up front. These are pure label/deviceId decision
 * functions — no getUserMedia, no real page. They prove the label-pattern
 * heuristic actually flags the named virtual-camera apps (and does NOT
 * false-positive on ordinary hardware names), and that the mid-interview
 * camera-approval check correctly distinguishes "same device", "switched to
 * a different device", and "switched to a virtual camera".
 *
 * They do NOT prove the System Check dropdown actually disables a virtual
 * device in a real browser, or that the interview overlay actually renders
 * "Please select a valid camera." on screen — this repo's Playwright suite
 * has no fake-media (getUserMedia) mocking configured anywhere (Firefox-only
 * project, no --use-fake-ui-for-media-stream / media.navigator.streams.fake),
 * and real-camera/proctoring UI flows are already excluded from the
 * data-driven smoke suite for the same reason (see e2e/TEST-PLAN.md). Wiring
 * that up is a pre-existing, cross-cutting gap in the suite, not something
 * fixed by this feature.
 *
 * Runs without the dev server:
 *   E2E_EXTERNAL=1 npx playwright test e2e/camera-validation.spec.ts
 */

import { test, expect } from '@playwright/test';

import {
  checkVirtualCamera,
  isVirtualCameraLabel,
  INVALID_CAMERA_SELECTION_MESSAGE,
} from '../lib/proctoring/virtualCameraDetection';
import { checkCameraApproval } from '../lib/proctoring/cameraDeviceMonitor';

// A minimal fake MediaStreamTrack — checkVirtualCamera only ever reads .label.
const fakeTrack = (label: string) => ({ label }) as unknown as Parameters<typeof checkVirtualCamera>[0];

test.describe('isVirtualCameraLabel / checkVirtualCamera — known virtual/mobile-relay drivers', () => {
  const virtualLabels = [
    'Motorola Smart Connect',
    'Moto Connect Camera',
    'DroidCam Source 2',
    'Iriun Webcam',
    'EpocCam Camera',
    'Camo',
    'iVCam',
    'OBS Virtual Camera',
    'ManyCam Virtual Webcam',
    'XSplit VCam',
    'NDI Video Input',
    'Snap Camera',
  ];

  for (const label of virtualLabels) {
    test(`flags "${label}" as virtual`, () => {
      expect(isVirtualCameraLabel(label)).toBe(true);
      const result = checkVirtualCamera(fakeTrack(label));
      expect(result.flagged).toBe(true);
      expect(result.reason).toBe('label_match');
    });
  }

  const realLabels = [
    'HP TrueVision HD Camera',
    'Integrated Webcam',
    'Logitech C920 HD Pro Webcam',
    'USB2.0 HD UVC WebCam',
    'FaceTime HD Camera',
  ];

  for (const label of realLabels) {
    test(`does NOT flag "${label}"`, () => {
      expect(isVirtualCameraLabel(label)).toBe(false);
      const result = checkVirtualCamera(fakeTrack(label));
      expect(result.flagged).toBe(false);
    });
  }

  test('empty/missing label is never flagged (nothing to match against)', () => {
    expect(isVirtualCameraLabel('')).toBe(false);
    expect(isVirtualCameraLabel(null)).toBe(false);
    expect(isVirtualCameraLabel(undefined)).toBe(false);
  });

  test('INVALID_CAMERA_SELECTION_MESSAGE is the exact candidate-facing string', () => {
    expect(INVALID_CAMERA_SELECTION_MESSAGE).toBe('Please select a valid camera.');
  });
});

test.describe('checkCameraApproval — mid-interview camera-switch detection', () => {
  test('same approved device stays valid', () => {
    const result = checkCameraApproval({
      approvedDeviceId: 'device-abc',
      liveTrackDeviceId: 'device-abc',
      liveTrackLabel: 'HP TrueVision HD Camera',
    });
    expect(result).toEqual({ valid: true, reason: null });
  });

  test('switching to a different (but real) device is rejected as "switched"', () => {
    const result = checkCameraApproval({
      approvedDeviceId: 'device-abc',
      liveTrackDeviceId: 'device-xyz',
      liveTrackLabel: 'Logitech C920 HD Pro Webcam',
    });
    expect(result).toEqual({ valid: false, reason: 'switched' });
  });

  test('a virtual camera is rejected even if its deviceId matches the approved one', () => {
    const result = checkCameraApproval({
      approvedDeviceId: 'device-abc',
      liveTrackDeviceId: 'device-abc',
      liveTrackLabel: 'DroidCam Source 2',
    });
    expect(result).toEqual({ valid: false, reason: 'virtual' });
  });

  test('a virtual camera is rejected regardless of deviceId mismatch too', () => {
    const result = checkCameraApproval({
      approvedDeviceId: 'device-abc',
      liveTrackDeviceId: 'device-xyz',
      liveTrackLabel: 'OBS Virtual Camera',
    });
    expect(result).toEqual({ valid: false, reason: 'virtual' });
  });

  test('no approvedDeviceId set + non-virtual camera stays valid (system-check skipped)', () => {
    const result = checkCameraApproval({
      approvedDeviceId: null,
      liveTrackDeviceId: 'device-xyz',
      liveTrackLabel: 'Integrated Webcam',
    });
    expect(result).toEqual({ valid: true, reason: null });
  });

  test("Chrome's 'default'/'communications' pseudo deviceIds never count as a switch", () => {
    const result = checkCameraApproval({
      approvedDeviceId: 'device-abc',
      liveTrackDeviceId: 'default',
      liveTrackLabel: 'HP TrueVision HD Camera',
    });
    expect(result).toEqual({ valid: true, reason: null });
  });
});
