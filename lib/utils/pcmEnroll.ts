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
}

const TARGET_RATE = 16000;

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
 * Record `durationMs` of PCM from `stream` and return a 16 kHz Int16 blob.
 * Uses ScriptProcessorNode (deprecated but universally supported, and already
 * used elsewhere in this app for the same reason).
 */
export async function recordPcm16(
  stream: MediaStream,
  durationMs = 12000,
): Promise<Pcm16Capture | null> {
  if (!stream.getAudioTracks().length) return null;

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

  const noiseFloor = estimateNoiseFloor(combined, nativeRate);
  const down = downsampleTo16k(combined, nativeRate);
  const pcm16 = floatToInt16(down);
  return {
    blob: new Blob([pcm16.buffer], { type: 'application/octet-stream' }),
    sampleRate: TARGET_RATE,
    noiseFloor,
    durationSec: down.length / TARGET_RATE,
  };
}
