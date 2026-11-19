/**
 * Screen-recording defence — unit coverage for the parts that are testable
 * without a real recorder installed.
 *
 * Scope, stated honestly up front. These tests exercise the REAL modules from
 * components/ai-interview/proctoring against stubbed browser globals. They prove
 * the blockable vectors are actually blocked, that the app's own screen share is
 * never mistaken for a candidate recording, and that the hotkey and device
 * tables match what they claim to match — including the near-misses that used to
 * produce false accusations (Cmd+G on macOS, PulseAudio monitor sources).
 *
 * They do NOT prove that OBS, Bandicam, Game Bar or ffmpeg are detected on a
 * real desktop: that path runs through a vision model looking at a real screen
 * and cannot be asserted from a headless runner. The manual matrix for those
 * lives in components/ai-interview/proctoring/SCREEN_RECORDING_COVERAGE.md, and
 * the coverage claims in this repo are limited to what one of the two can show.
 *
 * These cases never open a page, so run them without the dev server:
 *   E2E_EXTERNAL=1 npx playwright test e2e/screen-recording-guard.spec.ts
 */

import { test, expect } from '@playwright/test';

import {
  beginLegitimateShare,
  endLegitimateShare,
  installScreenCaptureGuard,
  isDesktopCaptureConstraint,
  isScreenCaptureGuardInstalled,
  onScreenRecordingAttempt,
  registerAppOwnedStream,
  resetLegitimateShareState,
  type ScreenRecordingAttempt,
} from '../components/ai-interview/proctoring/ScreenRecordingGuard';
import {
  matchRecorderHotkey,
  RECORDER_HOTKEYS,
  type RecorderPlatform,
} from '../components/ai-interview/proctoring/ScreenRecorderHotkeys';
import { listRecorderDevices } from '../components/ai-interview/proctoring/ScreenRecorderDevices';

// The app-owned-share window is module state with a trailing grace, exactly as
// it is in the browser. Without this, one case's legitimate share is still
// inside its grace when the next case asserts that a CANDIDATE attempt is
// refused, and that case passes or fails on test ordering.
test.beforeEach(() => resetLegitimateShareState());

// ── stubs ────────────────────────────────────────────────────────────────────

type FakeTrack = {
  id: string;
  kind: string;
  label: string;
  getSettings: () => Record<string, unknown>;
  addEventListener: () => void;
};

const displayTrack = (id: string, displaySurface = 'monitor'): FakeTrack => ({
  id, kind: 'video', label: '',
  getSettings: () => ({ displaySurface }),
  addEventListener: () => {},
});

const cameraTrack = (id: string): FakeTrack => ({
  id, kind: 'video', label: 'HD Pro Webcam C920',
  getSettings: () => ({ deviceId: id }),
  addEventListener: () => {},
});

const fakeStream = (tracks: FakeTrack[]) => ({
  getTracks: () => tracks,
  getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
}) as unknown as MediaStream;

const keyEvent = (init: Partial<KeyboardEvent>) => ({
  key: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init,
}) as KeyboardEvent;

/** Install fake browser globals; returns a restore function. */
function stubBrowserGlobals(overrides: {
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
} = {}) {
  const g = globalThis as any;
  // Node >= 21 defines globalThis.navigator as a getter-only accessor, so a
  // plain assignment throws. Swap the property descriptor instead, and put the
  // original descriptor back on restore.
  const define = (name: string, value: unknown) =>
    Object.defineProperty(g, name, { value, configurable: true, writable: true });
  const saved = {
    window: Object.getOwnPropertyDescriptor(g, 'window'),
    navigator: Object.getOwnPropertyDescriptor(g, 'navigator'),
    MediaRecorder: Object.getOwnPropertyDescriptor(g, 'MediaRecorder'),
  };
  const restoreOne = (name: keyof typeof saved) => {
    const descriptor = saved[name];
    if (descriptor) Object.defineProperty(g, name, descriptor);
    else delete g[name];
  };

  const nativeGetDisplayMedia = async (_constraints?: unknown) =>
    fakeStream([displayTrack('native-display')]);
  const nativeGetUserMedia = async (_constraints?: unknown) =>
    fakeStream([cameraTrack('native-camera')]);

  class NativeMediaRecorder {
    stream: MediaStream;
    constructor(stream: MediaStream) { this.stream = stream; }
    static isTypeSupported() { return true; }
  }

  const mediaDevices = {
    getDisplayMedia: nativeGetDisplayMedia,
    getUserMedia: nativeGetUserMedia,
    enumerateDevices: overrides.enumerateDevices || (async () => []),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  define('window', g);
  define('navigator', { mediaDevices, userAgent: 'test', platform: 'test' });
  define('MediaRecorder', NativeMediaRecorder);

  return {
    mediaDevices,
    natives: { nativeGetDisplayMedia, nativeGetUserMedia, NativeMediaRecorder },
    restore: () => {
      restoreOne('window');
      restoreOne('navigator');
      restoreOne('MediaRecorder');
    },
  };
}

/** Collect attempts raised while `fn` runs. */
async function captureAttempts(fn: () => Promise<void> | void): Promise<ScreenRecordingAttempt[]> {
  const seen: ScreenRecordingAttempt[] = [];
  const unsubscribe = onScreenRecordingAttempt((a) => seen.push(a));
  try { await fn(); } finally { unsubscribe(); }
  return seen;
}

// ── the blockable vectors ────────────────────────────────────────────────────

test.describe('capture guard — vectors a browser can actually refuse', () => {
  test('getDisplayMedia is refused with NotAllowedError and reported as blocked', async () => {
    const env = stubBrowserGlobals();
    const uninstall = installScreenCaptureGuard();
    try {
      const attempts = await captureAttempts(async () => {
        await expect(env.mediaDevices.getDisplayMedia()).rejects.toMatchObject({
          name: 'NotAllowedError',
        });
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        vector: 'getDisplayMedia', enforcement: 'blocked', confidence: 'high',
      });
    } finally { uninstall(); env.restore(); }
  });

  test("the app's OWN screen share still goes through and raises nothing", async () => {
    const env = stubBrowserGlobals();
    const uninstall = installScreenCaptureGuard();
    try {
      const attempts = await captureAttempts(async () => {
        beginLegitimateShare();
        try {
          const stream = await env.mediaDevices.getDisplayMedia();
          expect(stream.getVideoTracks()).toHaveLength(1);
        } finally { endLegitimateShare(); }
      });
      expect(attempts).toEqual([]);
    } finally { uninstall(); env.restore(); }
  });

  test('overlapping app-owned shares stay allowed (the ref-count regression)', async () => {
    // The old boolean flag let an inner share's `finally` revoke permission from
    // an outer one still awaiting the picker — and the app's own mandatory share
    // was then reported as a candidate recording attempt.
    const env = stubBrowserGlobals();
    const uninstall = installScreenCaptureGuard();
    try {
      const attempts = await captureAttempts(async () => {
        beginLegitimateShare();
        beginLegitimateShare();
        endLegitimateShare();                       // inner one finishes first
        await env.mediaDevices.getDisplayMedia();   // outer must still be allowed
        endLegitimateShare();
      });
      expect(attempts).toEqual([]);
    } finally { uninstall(); env.restore(); }
  });

  test('camera getUserMedia is untouched; desktop-source getUserMedia is refused', async () => {
    const env = stubBrowserGlobals();
    const uninstall = installScreenCaptureGuard();
    try {
      const attempts = await captureAttempts(async () => {
        // The interview's own camera/mic path must keep working exactly as before.
        const camera = await env.mediaDevices.getUserMedia({ video: true, audio: true } as any);
        expect(camera.getVideoTracks()).toHaveLength(1);

        // How a chrome.desktopCapture extension recorder captures.
        await expect(env.mediaDevices.getUserMedia({
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: 'screen:0' } },
        } as any)).rejects.toMatchObject({ name: 'NotAllowedError' });
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].vector).toBe('getUserMedia_desktop');
    } finally { uninstall(); env.restore(); }
  });

  test('MediaRecorder refuses a foreign display track but records the app-owned one', async () => {
    const env = stubBrowserGlobals();
    const uninstall = installScreenCaptureGuard();
    try {
      const foreign = fakeStream([displayTrack('someone-elses-screen')]);
      expect(() => new (globalThis as any).MediaRecorder(foreign))
        .toThrow(/not allowed/i);

      // The interview rebuilds a fresh MediaStream (its screen track + mixed
      // audio) before recording, so the guard has to key on the TRACK.
      const ownTrack = displayTrack('our-own-screen');
      registerAppOwnedStream(fakeStream([ownTrack]));
      const rebuilt = fakeStream([ownTrack]);
      expect(() => new (globalThis as any).MediaRecorder(rebuilt)).not.toThrow();

      // A webcam recording is not a screen recording and must stay unaffected.
      expect(() => new (globalThis as any).MediaRecorder(fakeStream([cameraTrack('cam')])))
        .not.toThrow();

      // Statics must survive the patch — the portal calls isTypeSupported().
      expect((globalThis as any).MediaRecorder.isTypeSupported('video/webm')).toBe(true);
    } finally { uninstall(); env.restore(); }
  });

  test('install is ref-counted and uninstall restores the originals', async () => {
    const env = stubBrowserGlobals();
    const first = installScreenCaptureGuard();
    const second = installScreenCaptureGuard();
    expect(isScreenCaptureGuardInstalled()).toBe(true);

    first();
    // Still held by the second caller — a StrictMode double-invoke must not
    // leave the page unguarded.
    expect(isScreenCaptureGuardInstalled()).toBe(true);
    expect(env.mediaDevices.getDisplayMedia).not.toBe(env.natives.nativeGetDisplayMedia);

    second();
    expect(isScreenCaptureGuardInstalled()).toBe(false);
    expect(env.mediaDevices.getDisplayMedia).toBe(env.natives.nativeGetDisplayMedia);
    expect(env.mediaDevices.getUserMedia).toBe(env.natives.nativeGetUserMedia);
    expect((globalThis as any).MediaRecorder).toBe(env.natives.NativeMediaRecorder);
    env.restore();
  });
});

test.describe('desktop-capture constraint shapes', () => {
  test('recognises the extension shapes and ignores ordinary media', () => {
    expect(isDesktopCaptureConstraint({
      video: { mandatory: { chromeMediaSource: 'desktop' } },
    } as any)).toBe(true);
    expect(isDesktopCaptureConstraint({
      audio: { mandatory: { chromeMediaSource: 'desktop' } },
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: 'window:12' } },
    } as any)).toBe(true);
    expect(isDesktopCaptureConstraint({ video: { chromeMediaSourceId: 'screen:0' } } as any)).toBe(true);

    expect(isDesktopCaptureConstraint({ video: true, audio: true })).toBe(false);
    expect(isDesktopCaptureConstraint({ video: { deviceId: { exact: 'abc' } } })).toBe(false);
    expect(isDesktopCaptureConstraint(undefined)).toBe(false);
  });
});

// ── the detection tables ─────────────────────────────────────────────────────

test.describe('recorder hotkeys', () => {
  const cases: Array<{
    product: string; platform: RecorderPlatform; event: Partial<KeyboardEvent>; id: string;
  }> = [
    { product: 'Xbox Game Bar record',      platform: 'windows', id: 'gamebar_record',            event: { key: 'r', metaKey: true, altKey: true } },
    { product: 'Xbox Game Bar overlay',     platform: 'windows', id: 'gamebar_overlay',           event: { key: 'g', metaKey: true } },
    { product: 'Snipping Tool recording',   platform: 'windows', id: 'snipping_tool_record',      event: { key: 'r', metaKey: true, shiftKey: true } },
    { product: 'NVIDIA overlay',            platform: 'windows', id: 'nvidia_overlay',            event: { key: 'z', altKey: true } },
    { product: 'NVIDIA ShadowPlay record',  platform: 'windows', id: 'nvidia_shadowplay_record',  event: { key: 'f9', altKey: true } },
    { product: 'AMD Adrenalin record',      platform: 'windows', id: 'amd_record',                event: { key: 'e', ctrlKey: true, shiftKey: true } },
    { product: 'ShareX screen recording',   platform: 'windows', id: 'sharex_record',             event: { key: 'printscreen', ctrlKey: true, shiftKey: true } },
    { product: 'Loom desktop (Windows)',    platform: 'windows', id: 'loom_desktop_win',          event: { key: 'l', ctrlKey: true, shiftKey: true } },
    { product: 'macOS Shift-Cmd-5',         platform: 'macos',   id: 'macos_screenshot_toolbar',  event: { key: '5', metaKey: true, shiftKey: true } },
    { product: 'CleanShot X',               platform: 'macos',   id: 'cleanshot_record',          event: { key: '6', metaKey: true, shiftKey: true } },
    { product: 'QuickTime screen recording',platform: 'macos',   id: 'quicktime_new_screen_recording', event: { key: 'n', metaKey: true, ctrlKey: true } },
    { product: 'Camtasia (Mac)',            platform: 'macos',   id: 'camtasia_mac_record',       event: { key: '2', metaKey: true, shiftKey: true } },
    { product: 'GNOME built-in recorder',   platform: 'linux',   id: 'gnome_builtin_recorder',    event: { key: 'r', ctrlKey: true, altKey: true, shiftKey: true } },
    { product: 'Kazam start',               platform: 'linux',   id: 'kazam_start',               event: { key: 'r', metaKey: true, ctrlKey: true } },
    { product: 'KDE Spectacle recording',   platform: 'linux',   id: 'kde_spectacle_record',      event: { key: 'r', metaKey: true, shiftKey: true } },
  ];

  for (const c of cases) {
    test(`${c.product} is matched on ${c.platform}`, () => {
      const hit = matchRecorderHotkey(keyEvent(c.event), c.platform);
      expect(hit?.id).toBe(c.id);
      expect(hit?.confidence).toBe('high');
    });
  }

  test('bare recorder function keys match, but only as low confidence', () => {
    for (const key of ['f9', 'f10', 'f12']) {
      const hit = matchRecorderHotkey(keyEvent({ key }), 'windows');
      expect(hit, `${key} should match a recorder default`).not.toBeNull();
      // Low confidence is what keeps a stray function key from accusing anyone:
      // it escalates the vision watch instead of raising the popup.
      expect(hit?.confidence).toBe('low');
    }
  });

  test('does not fire on ordinary shortcuts', () => {
    // Cmd+G is find-next on macOS. An ungated Meta+G rule read it as Game Bar.
    expect(matchRecorderHotkey(keyEvent({ key: 'g', metaKey: true }), 'macos')).toBeNull();
    // Windows-only combinations must not match on macOS and vice versa.
    expect(matchRecorderHotkey(keyEvent({ key: 'r', metaKey: true, altKey: true }), 'macos')).toBeNull();
    expect(matchRecorderHotkey(keyEvent({ key: '5', metaKey: true, shiftKey: true }), 'windows')).toBeNull();
    // Everyday editing keys.
    for (const key of ['c', 'v', 'a', 'z']) {
      expect(matchRecorderHotkey(keyEvent({ key, ctrlKey: true }), 'windows')).toBeNull();
    }
    // F11 is fullscreen and has its own violation; it must not be claimed here.
    expect(matchRecorderHotkey(keyEvent({ key: 'f11' }), 'windows')).toBeNull();
  });

  test('every rule declares at least one platform and a confidence', () => {
    for (const hotkey of RECORDER_HOTKEYS) {
      expect(hotkey.platforms.length, hotkey.id).toBeGreaterThan(0);
      expect(['high', 'low']).toContain(hotkey.confidence);
      expect(hotkey.label.length, hotkey.id).toBeGreaterThan(0);
    }
  });
});

test.describe('recorder virtual devices', () => {
  const device = (label: string, kind: MediaDeviceKind) =>
    ({ label, kind, deviceId: label, groupId: '' }) as MediaDeviceInfo;

  test('matches recorder virtual cameras and system-audio loopbacks', async () => {
    const env = stubBrowserGlobals({
      enumerateDevices: async () => [
        device('OBS Virtual Camera', 'videoinput'),
        device('BlackHole 2ch', 'audioinput'),
        device('Stereo Mix (Realtek High Definition Audio)', 'audioinput'),
        device('CABLE Output (VB-Audio Virtual Cable)', 'audioinput'),
      ],
    });
    try {
      const found = await listRecorderDevices();
      expect(found.map((d) => d.product).sort()).toEqual([
        'BlackHole audio loopback',
        'OBS Studio virtual camera',
        'Stereo Mix system-audio loopback',
        'VB-Audio Virtual Cable / Voicemeeter',
      ]);
    } finally { env.restore(); }
  });

  test('does not match ordinary devices or PulseAudio monitor sources', async () => {
    const env = stubBrowserGlobals({
      enumerateDevices: async () => [
        device('HD Pro Webcam C920', 'videoinput'),
        device('Default - Headset Microphone', 'audioinput'),
        // Present on every PulseAudio desktop whether or not anything records —
        // its presence is evidence of nothing and must never be flagged.
        device('Monitor of Built-in Audio Analog Stereo', 'audioinput'),
        device('', 'audioinput'), // label hidden (no permission) — nothing to match on
      ],
    });
    try {
      expect(await listRecorderDevices()).toEqual([]);
    } finally { env.restore(); }
  });
});
