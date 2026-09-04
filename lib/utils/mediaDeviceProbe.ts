/**
 * Authoritative "is this device actually usable right now?" probe.
 *
 * ONE implementation, shared by every pre-interview gate (system check,
 * practice, identity, fullscreen prompt, share-bar gate, start). Each gate used
 * to roll its own check and they drifted — which is exactly how an OS-disabled
 * microphone slipped through to the interview screen.
 *
 * Two rules this encodes, both learned the hard way:
 *
 *  1. `readyState === 'live'` is NOT enough. Disabling a mic or camera in
 *     Windows (rather than unplugging it) leaves the device enumerable, and
 *     getUserMedia still RESOLVES — it just hands back a track that is live and
 *     MUTED. The interview's own reconnect probe already had to learn this
 *     ("Windows can disable a mic at the OS level while Chrome keeps it
 *     listed... the track just goes to muted"). So `muted` is checked too.
 *
 *  2. Video and audio are opened in SEPARATE getUserMedia calls, never one
 *     combined `{video, audio}` request. A combined request is all-or-nothing,
 *     so one missing device masks the other and the candidate gets told to fix
 *     the wrong thing — and on a machine where both are peripherals, a dead mic
 *     takes a working camera down with it.
 *
 * Probe tracks are always stopped immediately: this only answers "can it
 * open?", it never holds a device the interview is about to want.
 */

/** How long a freshly-opened track may report `muted` before we believe it. */
const MUTED_SETTLE_MS = 500;
const MUTED_POLL_MS = 50;

export type MissingDevice = 'camera' | 'microphone' | 'both' | null;

/**
 * True when the constraint opens a track that is live AND not muted.
 *
 * A just-opened track can report `muted: true` for a moment before the first
 * frame/sample arrives, so a mute is re-checked briefly before being trusted —
 * otherwise a perfectly good device would be rejected on timing alone.
 */
export async function canOpenDevice(
  constraints: MediaStreamConstraints,
  kind: 'video' | 'audio',
): Promise<boolean> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = (kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks())[0];
    if (!track || track.readyState !== 'live') return false;
    if (!track.muted) return true;
    const deadline = Date.now() + MUTED_SETTLE_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, MUTED_POLL_MS));
      if (track.readyState !== 'live') return false;
      if (!track.muted) return true;
    }
    // Still muted after the settle window — the device is present but not
    // delivering (OS-disabled, held exclusively by another app, hardware mute).
    return false;
  } catch {
    return false;
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
}

/**
 * Which device — if any — cannot be used right now. `null` means both are fine.
 */
export async function probeMediaDevices(): Promise<MissingDevice> {
  const camOk = await canOpenDevice({ video: true }, 'video');
  const micOk = await canOpenDevice({ audio: true }, 'audio');
  if (!camOk && !micOk) return 'both';
  if (!camOk) return 'camera';
  if (!micOk) return 'microphone';
  return null;
}

/** Shared candidate-facing wording, so every gate says the same thing. */
export function deviceMissingMessage(missing: Exclude<MissingDevice, null>): string {
  const what = missing === 'both' ? 'camera and microphone' : missing;
  const isAre = missing === 'both' ? 'are' : 'is';
  const itThem = missing === 'both' ? 'them' : 'it';
  return `Your ${what} ${isAre} not available. Please reconnect or re-enable ` +
    `${itThem}, then try again — the interview cannot start without ` +
    `${missing === 'both' ? 'both' : itThem}.`;
}

/* ── Verified device set ───────────────────────────────────────────────────
 * The microphones that were present and working when the candidate passed the
 * system check. The interview pins ONE device and treats a change as a
 * proctoring event, but a change to a mic from THIS set is an acceptable
 * fallback: the candidate had it connected before the interview began, so it
 * cannot be a device introduced mid-interview to reroute audio.
 *
 * Anything not in this set — a virtual audio cable plugged in after the start,
 * say — still pauses the interview exactly as before.
 *
 * Stored per interview token in sessionStorage: it must survive the reload
 * between the pre-interview steps and the interview UI, but must NOT leak
 * across interviews or browser sessions.
 */
const verifiedAudioKey = (token: string) => `tf_verified_audio_inputs_${token}`;

/** Device ids of every audio input currently enumerable (labels need permission). */
export async function enumerateAudioInputIds(): Promise<string[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'audioinput' && d.deviceId
        && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map(d => d.deviceId);
  } catch {
    return [];
  }
}

/** Record the mics verified at system-check time, for the interview to trust later. */
export function saveVerifiedAudioInputs(token: string, ids: string[]): void {
  try {
    if (typeof window === 'undefined' || ids.length === 0) return;
    window.sessionStorage.setItem(verifiedAudioKey(token), JSON.stringify(ids));
  } catch { /* storage unavailable — the interview just falls back to strict pinning */ }
}

/**
 * The mics verified at system-check time. An EMPTY set means "unknown", and
 * every caller must treat that as "no fallback allowed" — failing closed, so a
 * storage failure can never silently weaken the device pinning.
 */
export function loadVerifiedAudioInputs(token: string): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = window.sessionStorage.getItem(verifiedAudioKey(token));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}
