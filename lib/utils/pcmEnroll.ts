/**
 * pcmEnroll — capture raw 16 kHz mono 16-bit PCM from a live MediaStream for
 * server-side voice enrollment.
 *
 * The backend speaker-verification endpoint (`/ai-interview/{token}/enroll-voice`)
 * expects the SAME audio format the interview WebSocket already streams: mono,
 * little-endian 16-bit PCM at 16 kHz. Capturing PCM here (rather than a
 * webm/opus MediaRecorder blob) means the backend needs no ffmpeg/codec step —
 * it can `np.frombuffer(..., '<i2')` directly.
 *
 * We downsample the hardware rate (usually 48 kHz) to 16 kHz with linear
 * interpolation, and compute a noise-floor estimate (low-percentile frame
 * energy) the backend can use to calibrate silence detection.
 */

export interface Pcm16Capture {
  blob: Blob;          // raw little-endian Int16 PCM bytes
  sampleRate: 16000;
  noiseFloor: number;  // mean-abs energy of the quietest ~10% of frames (0..1)
  durationSec: number;
  gainApplied: number; // software gain multiplier used (1 = none)
  speechSeconds: number;    // estimated seconds of genuine speech
  speechDetected: boolean;  // false when the capture is silence / noise only
}

// Minimum genuine speech required for a valid enrollment capture.
const MIN_SPEECH_SECONDS = 1.5;

const TARGET_RATE = 16000;

// Mirror the AI interview's capture config so the enrolled voiceprint is
// measured under the SAME conditions the interview verifies against — otherwise
// levels differ and verification/VAD degrade. See InterviewUI.tsx:
//   - getDedicatedRecordingAudioStream(): headset-friendly constraints,
//     autoGainControl OFF (AGC distorts levels for ASR).
//   - Adaptive mic gain: boost quiet headset/Bluetooth mics toward a per-device
//     target avg-abs level (see MIC_GAIN_TARGET below).
const MIC_GAIN_PEAK_FLOOR = 0.012;  // never divide by less than this

// Per-device gain target — MUST match InterviewUI.applyMicProfile so the enrolled
// voiceprint is captured at the SAME loudness the interview verifies against.
// Headphone/earbud mics run quiet, so they get a higher target (= louder).
type MicType = 'builtin' | 'wired_headphone' | 'bluetooth' | 'unknown';
const MIC_GAIN_TARGET: Record<MicType, number> = {
  bluetooth: 0.090,
  wired_headphone: 0.10,   // louder for quiet wired headset mics (kept in sync with InterviewUI)
  builtin: 0.045,
  unknown: 0.055,
};
const MIC_GAIN_MAX: Record<MicType, number> = {
  bluetooth: 12,
  wired_headphone: 10,
  builtin: 6,
  unknown: 8,
};

/** Classify the mic from its device label — same heuristic as InterviewUI.classifyMicType. */
function classifyMicType(label: string): MicType {
  const l = (label || '').toLowerCase();
  if (!l) return 'unknown';
  if (/bluetooth|hands[\s-]?free|\bhfp\b|\bhsp\b|airpod|earpods|galaxy buds|\bbuds\b|\bwh-|\bwf-/.test(l)) return 'bluetooth';
  if (/headset|headphone|earphone|earbud|jabra|\bplantronics\b|\bsennheiser\b/.test(l)) return 'wired_headphone';
  if (/built[\s-]?in|internal|realtek|macbook|microphone array|digital microphone|intel smart sound|default/.test(l)) return 'builtin';
  return 'unknown';
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_RATE) return input;
  const ratio = inputRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac; // linear interpolation
  }
  return out;
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Mean-abs energy of the quietest 10% of 100 ms frames → ambient noise floor. */
function estimateNoiseFloor(audio: Float32Array, rate: number): number {
  const frame = Math.max(1, Math.floor(rate * 0.1));
  const energies: number[] = [];
  for (let start = 0; start + frame <= audio.length; start += frame) {
    let acc = 0;
    for (let i = start; i < start + frame; i++) acc += Math.abs(audio[i]);
    energies.push(acc / frame);
  }
  if (!energies.length) return 0;
  energies.sort((a, b) => a - b);
  const cut = Math.max(1, Math.floor(energies.length * 0.1));
  let sum = 0;
  for (let i = 0; i < cut; i++) sum += energies[i];
  return sum / cut;
}

/**
 * Client-side speech guard. Returns { speechSeconds, dynamic }.
 *
 * IMPORTANT: this is a HEURISTIC stopgap, not a real VAD. Energy alone can't
 * perfectly separate speech from noise — the robust detector is the server's
 * Silero neural VAD. This uses two cues to reject the common false-pass cases:
 *   1. LOUDNESS  — a 100 ms frame is "loud" only when it clearly exceeds the
 *      room noise floor AND a speech-level absolute minimum (reading aloud is
 *      well above ambient/breathing).
 *   2. DYNAMICS  — real speech is PEAKY (loud syllables + quiet gaps), so its
 *      high-percentile energy is several× its median. Steady background noise
 *      (fan/AC/hum) is FLAT (peak≈median) and is rejected even if it's loud.
 */
function analyzeSpeech(audio: Float32Array, noiseFloor: number): { speechSeconds: number; dynamic: boolean } {
  const frame = Math.max(1, Math.floor(TARGET_RATE * 0.1)); // 100 ms
  const SPEECH_RATIO = 4;       // loud frame ≥ 4× the noise floor …
  const SPEECH_ABS_MIN = 0.02;  // … and above a speech-level absolute floor
  const threshold = Math.max(noiseFloor * SPEECH_RATIO, SPEECH_ABS_MIN);

  const energies: number[] = [];
  let loudFrames = 0;
  for (let start = 0; start + frame <= audio.length; start += frame) {
    let acc = 0;
    for (let i = start; i < start + frame; i++) acc += Math.abs(audio[i]);
    const e = acc / frame;
    energies.push(e);
    if (e >= threshold) loudFrames++;
  }
  if (!energies.length) return { speechSeconds: 0, dynamic: false };

  const sorted = [...energies].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] || 1e-9;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  // Peaky (speech) → p90 >> median. Flat (steady noise/silence) → p90 ≈ median.
  const dynamic = p90 >= median * 3.5;

  return { speechSeconds: (loudFrames * frame) / TARGET_RATE, dynamic };
}

/**
 * Record `durationMs` of PCM from `stream` and return a 16 kHz Int16 blob.
 * Uses ScriptProcessorNode (deprecated but universally supported, and already
 * used elsewhere in this app for the same reason).
 */
export async function recordPcm16(
  stream: MediaStream,
  durationMs = 12000,
): Promise<Pcm16Capture | null> {
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return null;

  // Classify the device up-front — drives the per-device gain target (below).
  const micType = classifyMicType(audioTracks[0]?.label || '');

  // Start capturing IMMEDIATELY on click. We build the AudioContext + processor
  // FIRST so audio flows from t≈0 — the previous code `await`ed applyConstraints
  // (a mic re-negotiation that costs ~1-2s) BEFORE starting capture, so the
  // candidate's first words (spoken the moment they saw "Recording…") were
  // dropped. Constraints are now applied in the BACKGROUND (best-effort) below.
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(ctx.destination);
  // The context can start 'suspended' under autoplay policy — resume it. We're
  // inside the Start-recording user gesture, so this resolves immediately.
  try { await ctx.resume(); } catch { /* already running */ }

  // Capture config for enrollment, applied in the BACKGROUND so it never delays
  // capture start. Echo cancellation is OFF for ALL devices here: during the
  // read-aloud NOTHING is playing (Linda isn't speaking), so there is no echo to
  // cancel — EC would only DUCK/attenuate the candidate's own (often quiet, on a
  // headset) speech. AGC stays off (distorts levels for ASR); light noise
  // suppression stays on. Best-effort — some devices reject this.
  void Promise.all(
    audioTracks.map((t) => t.applyConstraints({
      channelCount: { ideal: 1 },
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
    }).catch(() => {})),
  );

  await new Promise((r) => setTimeout(r, durationMs));

  processor.disconnect();
  source.disconnect();
  const nativeRate = ctx.sampleRate || 48000;
  await ctx.close();

  const total = chunks.reduce((s, c) => s + c.length, 0);
  if (total === 0) return null;
  const combined = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    combined.set(c, off);
    off += c.length;
  }

  const noiseFloor = estimateNoiseFloor(combined, nativeRate); // ambient, pre-gain
  const down = downsampleTo16k(combined, nativeRate);

  // Lightweight client-side speech-presence hint (energy loudness + dynamics).
  // This is ONLY a fallback signal for when the server voice-ID feature is
  // disabled — when it's enabled, the SERVER content check (transcript must match
  // the sentence) is the authoritative gate, so the caller does NOT block on this
  // (that previously false-rejected quiet headset reads). Measured pre-gain.
  const h = analyzeSpeech(down, noiseFloor);
  const speechSeconds = h.speechSeconds;
  const speechDetected = h.speechSeconds >= MIN_SPEECH_SECONDS && h.dynamic;

  // ── Adaptive mic gain — same PER-DEVICE normalization the interview applies ──
  // Quiet headset/Bluetooth mics (with AGC off) produce low-amplitude audio;
  // boost toward the device's target (higher for headphones) so the enrolled
  // voiceprint is captured at the same loudness the interview verifies against.
  const target = MIC_GAIN_TARGET[micType];   // micType classified up-front
  const gainMax = MIC_GAIN_MAX[micType];
  let meanAbs = 0;
  for (let i = 0; i < down.length; i++) meanAbs += Math.abs(down[i]);
  meanAbs = down.length ? meanAbs / down.length : 0;
  const gain = Math.min(
    gainMax,
    Math.max(1, target / Math.max(meanAbs, MIC_GAIN_PEAK_FLOOR)),
  );
  if (gain > 1) {
    for (let i = 0; i < down.length; i++) {
      down[i] = Math.max(-1, Math.min(1, down[i] * gain)); // boost + clip
    }
  }

  const pcm16 = floatToInt16(down);
  return {
    blob: new Blob([pcm16.buffer], { type: 'application/octet-stream' }),
    sampleRate: TARGET_RATE,
    noiseFloor,
    durationSec: down.length / TARGET_RATE,
    gainApplied: gain,
    speechSeconds,
    speechDetected,
  };
}
