'use client';

/**
 * ScreenRecorderHotkeys — the keyboard side of screen-recorder detection.
 *
 * A native recorder never asks the browser for permission, so the ONLY moment a
 * web page can see one start is the keystroke that starts it. The OS acts on
 * these combinations whether or not the page calls preventDefault(), so this is
 * DETECTION, never prevention — every match is reported with
 * enforcement:'detected'.
 *
 * Two honest caveats, both encoded in the table:
 *
 *  • Application hotkeys are user-configurable. These are the shipped defaults;
 *    a candidate who rebinds theirs is not caught here (the vision watch is).
 *  • Some defaults are BARE function keys (Bandicam F12, Fraps/Camtasia/Action!
 *    F9, Camtasia/Movavi F10). Those are simultaneously a real recorder default
 *    and an innocent keypress, so they are marked confidence:'low': they are
 *    logged and they ESCALATE the vision watch, but they never on their own
 *    accuse a candidate. Only unambiguous modifier combinations are 'high'.
 *
 * Deliberately NOT listed: F11 (fullscreen — already its own violation) and
 * Ctrl+Shift+I (DevTools), which would collide with existing detections.
 */

export type RecorderPlatform = 'windows' | 'macos' | 'linux' | 'other';

export interface RecorderHotkey {
  id: string;
  /** Shown to the candidate and stored on the recruiter timeline. */
  label: string;
  platforms: RecorderPlatform[];
  confidence: 'high' | 'low';
  match: (e: KeyboardEvent) => boolean;
}

const key = (e: KeyboardEvent) => (e.key || '').toLowerCase();
/** No modifier at all — used to keep bare function-key rules from matching combos. */
const bare = (e: KeyboardEvent) => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;

export const RECORDER_HOTKEYS: RecorderHotkey[] = [
  // ── Windows: OS-level capture ────────────────────────────────────────────
  {
    id: 'gamebar_record',
    label: 'Xbox Game Bar recording (Win+Alt+R)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.metaKey && e.altKey && key(e) === 'r',
  },
  {
    id: 'gamebar_replay',
    label: 'Xbox Game Bar "record last 30 seconds" (Win+Alt+G)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.metaKey && e.altKey && key(e) === 'g',
  },
  {
    id: 'gamebar_overlay',
    label: 'Xbox Game Bar overlay (Win+G)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.metaKey && !e.altKey && !e.shiftKey && !e.ctrlKey && key(e) === 'g',
  },
  {
    id: 'snipping_tool_record',
    label: 'Windows Snipping Tool screen recording (Win+Shift+R)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.metaKey && e.shiftKey && !e.altKey && key(e) === 'r',
  },

  // ── Windows: GPU vendor overlays ─────────────────────────────────────────
  {
    id: 'nvidia_overlay',
    label: 'NVIDIA App / GeForce Experience overlay (Alt+Z)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && key(e) === 'z',
  },
  {
    id: 'nvidia_shadowplay_record',
    label: 'NVIDIA ShadowPlay start/stop recording (Alt+F9)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.altKey && !e.ctrlKey && !e.metaKey && key(e) === 'f9',
  },
  {
    id: 'nvidia_instant_replay_save',
    label: 'NVIDIA Instant Replay save (Alt+F10)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.altKey && !e.ctrlKey && !e.metaKey && key(e) === 'f10',
  },
  {
    id: 'amd_record',
    label: 'AMD Adrenalin Record & Stream — start/stop (Ctrl+Shift+E)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && key(e) === 'e',
  },
  // NOTE: AMD Adrenalin "Instant Replay" save is Ctrl+Shift+R by default —
  // which is ALSO the universal browser HARD-RELOAD shortcut. We deliberately do
  // NOT flag it: it collides completely with an action ordinary candidates press
  // all the time (a false "Screen Recording Not Allowed" block + severe
  // violation for someone who just reloaded the page — observed in the wild,
  // often after the page felt slow). Detecting the SAVE hotkey buys almost no
  // security anyway: Instant Replay records continuously in the background
  // whether or not this key is pressed, and AMD's actual presence is caught by
  // the virtual-device / audio-loopback watch instead. Leaving it unmatched also
  // lets Ctrl+Shift+R behave like F5 / Ctrl+R — a normal reload the resume flow
  // already handles — rather than being preventDefault-blocked. (2026-08-24)

  // ── Windows: third-party recorders with unambiguous defaults ─────────────
  {
    id: 'sharex_record',
    label: 'ShareX screen recording (Ctrl+Shift+PrintScreen)',
    platforms: ['windows'], confidence: 'high',
    match: (e) => e.ctrlKey && e.shiftKey && key(e) === 'printscreen',
  },
  {
    id: 'loom_desktop_win',
    label: 'Loom desktop start/stop recording (Ctrl+Shift+L)',
    platforms: ['windows', 'linux'], confidence: 'high',
    match: (e) => e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && key(e) === 'l',
  },

  // ── macOS ────────────────────────────────────────────────────────────────
  {
    id: 'macos_screenshot_toolbar',
    label: 'macOS Screenshot / screen recording toolbar (Shift+Cmd+5)',
    platforms: ['macos'], confidence: 'high',
    match: (e) => e.metaKey && e.shiftKey && key(e) === '5',
  },
  {
    id: 'cleanshot_record',
    label: 'CleanShot X record screen (Shift+Cmd+6)',
    platforms: ['macos'], confidence: 'high',
    match: (e) => e.metaKey && e.shiftKey && key(e) === '6',
  },
  {
    id: 'quicktime_new_screen_recording',
    label: 'QuickTime Player new screen recording (Ctrl+Cmd+N)',
    platforms: ['macos'], confidence: 'high',
    match: (e) => e.metaKey && e.ctrlKey && !e.altKey && key(e) === 'n',
  },
  {
    id: 'camtasia_mac_record',
    label: 'Camtasia (Mac) start/stop recording (Shift+Cmd+2)',
    platforms: ['macos'], confidence: 'high',
    match: (e) => e.metaKey && e.shiftKey && key(e) === '2',
  },
  {
    id: 'loom_desktop_mac',
    label: 'Loom desktop start/stop recording (Shift+Cmd+L)',
    platforms: ['macos'], confidence: 'high',
    match: (e) => e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && key(e) === 'l',
  },

  // ── Linux ────────────────────────────────────────────────────────────────
  {
    id: 'gnome_builtin_recorder',
    label: 'GNOME built-in screen recorder (Ctrl+Alt+Shift+R)',
    platforms: ['linux'], confidence: 'high',
    match: (e) => e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey && key(e) === 'r',
  },
  {
    id: 'kazam_start',
    label: 'Kazam start recording (Super+Ctrl+R)',
    platforms: ['linux'], confidence: 'high',
    match: (e) => e.metaKey && e.ctrlKey && !e.altKey && key(e) === 'r',
  },
  {
    id: 'kazam_finish',
    label: 'Kazam finish recording (Super+Ctrl+F)',
    platforms: ['linux'], confidence: 'high',
    match: (e) => e.metaKey && e.ctrlKey && !e.altKey && key(e) === 'f',
  },
  {
    id: 'kde_spectacle_record',
    label: 'KDE Spectacle screen recording (Meta+Shift+R)',
    platforms: ['linux'], confidence: 'high',
    match: (e) => e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && key(e) === 'r',
  },

  // ── Bare function keys: real defaults, but innocent on their own ─────────
  // Corroborated by the vision watch rather than acted on directly.
  {
    id: 'fn_f9_record',
    label: 'F9 — default record key for Fraps, Camtasia, Mirillis Action!, EaseUS RecExperts, Wondershare DemoCreator',
    platforms: ['windows', 'linux'], confidence: 'low',
    match: (e) => bare(e) && key(e) === 'f9',
  },
  {
    id: 'fn_f10_record',
    label: 'F10 — default record/stop key for Camtasia, Movavi Screen Recorder, Icecream Screen Recorder',
    platforms: ['windows', 'linux'], confidence: 'low',
    match: (e) => bare(e) && key(e) === 'f10',
  },
  {
    id: 'fn_f12_record',
    label: 'F12 — default record key for Bandicam',
    platforms: ['windows', 'linux'], confidence: 'low',
    match: (e) => bare(e) && key(e) === 'f12',
  },
];

/**
 * Platform of the current browser. Gated per-rule because the SAME modifier
 * means different things per OS: on macOS the Windows key IS Cmd, so an ungated
 * "Meta+G" rule would report Cmd+G (find-next) as a Game Bar launch on every Mac.
 */
export function detectRecorderPlatform(): RecorderPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const legacyPlatform = (navigator as Navigator & { platform?: string }).platform || '';
  const ua = `${navigator.userAgent} ${legacyPlatform}`;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return 'other';
}

/** First hotkey rule this keystroke matches on this platform, or null. */
export function matchRecorderHotkey(
  e: KeyboardEvent,
  platform: RecorderPlatform = detectRecorderPlatform(),
): RecorderHotkey | null {
  for (const hotkey of RECORDER_HOTKEYS) {
    if (!hotkey.platforms.includes(platform)) continue;
    try {
      if (hotkey.match(e)) return hotkey;
    } catch { /* a malformed synthetic event must not break the listener */ }
  }
  return null;
}
