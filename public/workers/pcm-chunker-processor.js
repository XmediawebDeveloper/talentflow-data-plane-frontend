/**
 * PCM Chunker AudioWorklet Processor
 *
 * Runs off the main thread. Forwards mic audio to the main thread in fixed
 * 4096-sample Float32 chunks — nothing else. NO noise suppression, NO WASM.
 * (This replaced the old "rnnoise-processor", which had been disabled to a
 * pure pass-through; the RNNoise WASM denoising was removed. Noise handling
 * now comes from the browser's built-in noiseSuppression + the mic gain
 * boost, not from a worklet.)
 *
 * Keeping the chunking OFF the main thread avoids UI jank during recording
 * (the deprecated ScriptProcessorNode fallback runs on the main thread).
 */

const POST_SIZE = 4096; // chunk size (samples) sent to the main thread

class PcmChunkerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Pre-allocated TypedArray ring buffer — no GC churn at the Web Audio
    // frame rate (128 samples/frame @ 48 kHz ≈ 375 calls/second).
    this._buf = new Float32Array(POST_SIZE);
    this._pos = 0;
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    let srcOff = 0;
    while (srcOff < ch.length) {
      const space = POST_SIZE - this._pos;
      const copy = Math.min(space, ch.length - srcOff);
      this._buf.set(ch.subarray(srcOff, srcOff + copy), this._pos);
      this._pos += copy;
      srcOff += copy;
      if (this._pos >= POST_SIZE) {
        // Transfer ownership — zero-copy postMessage.
        const chunk = new Float32Array(this._buf);
        this.port.postMessage(chunk, [chunk.buffer]);
        this._pos = 0;
      }
    }
    return true; // keep the processor alive
  }
}

registerProcessor('pcm-chunker', PcmChunkerProcessor);
