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
