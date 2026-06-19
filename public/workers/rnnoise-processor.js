/**
 * RNNoise AudioWorklet Processor
 *
 * Runs off the main thread. Fetches /workers/rnnoise.wasm on first
 * construction and processes mic audio through RNNoise before forwarding
 * 4096-sample chunks to the main thread (same contract as the old
 * inline pcm-processor blob).
 *
 * Graceful degradation: if the WASM binary is missing or fails to
 * instantiate, the processor falls back to pass-through so recording
 * continues unaffected.
 *
 * RNNoise API contract:
 *   - Frame size : 480 float32 samples (≈10 ms @ 48 kHz)
 *   - PCM range  : [-32768, 32768]  (NOT the [-1, 1] Web Audio range)
 *   - Supports both named exports and minified Emscripten exports from
 *     vendored rnnoise.wasm builds
 */

const RNN_FRAME  = 480;    // RNNoise input/output frame size (samples)
const POST_SIZE  = 4096;   // chunk size sent to main thread
const SCALE      = 32768.0;
const WASM_PAGE_BYTES = 64 * 1024;

function pickExport(ex, names) {
  for (const name of names) {
    if (typeof ex[name] === 'function') return ex[name];
  }
  return null;
}

function pickMemory(ex, fallback) {
  return ex.memory || ex.c || fallback;
}

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Input ring – accumulates raw mic samples waiting for a full RNN_FRAME
    this._inBuf  = [];
    // Output ring – accumulates denoised samples waiting for POST_SIZE
    this._outBuf = [];

    // WASM state (null until _initWasm resolves)
    this._rnn        = null;   // { ex, state, inPtr, outPtr }
    this._ready      = false;
    this._passthrough = false; // set true on unrecoverable WASM error

    // Frames received before WASM is ready are queued here and replayed
    // as pass-through once _initWasm settles (avoids dropping the first
    // ~200 ms of speech that arrives during WASM load).
    this._earlyFrames = [];

    this._initWasm();

    this.port.onmessage = ({ data }) => {
      // Ping from main thread — reply with current readiness state
      if (data?.type === 'ping') {
        this.port.postMessage({ type: 'pong', ready: this._ready });
      }
    };
  }

  // ---------------------------------------------------------------------------
  // WASM initialisation
  // ---------------------------------------------------------------------------

  async _initWasm() {
    try {
      const resp = await fetch('/workers/rnnoise.wasm');
      if (!resp.ok) throw new Error(`fetch /workers/rnnoise.wasm → HTTP ${resp.status}`);
      const buf  = await resp.arrayBuffer();

      // Build a generous env import object covering both legacy Emscripten ABI
      // (needs env.__memory_base / memory / table) and modern standalone builds.
      // Unknown imports are stubs so instantiation never throws on extras.
      const sharedMemory = new WebAssembly.Memory({ initial: 256, maximum: 256 });
      let activeMemory   = sharedMemory;
      const copyBytes = (dest, src, n) => {
        const view = new Uint8Array(activeMemory.buffer);
        view.copyWithin(dest, src, src + n);
      };
      const resizeHeap = (requestedSize) => {
        const currentSize = activeMemory.buffer.byteLength;
        if (requestedSize <= currentSize) return 1;
        const growByPages = Math.ceil((requestedSize - currentSize) / WASM_PAGE_BYTES);
        try {
          activeMemory.grow(growByPages);
          return 1;
        } catch {
          return 0;
        }
      };

      const env = {
        // Legacy Emscripten asm.js-style
        memory           : sharedMemory,
        table            : new WebAssembly.Table({ initial: 8, element: 'anyfunc' }),
        __memory_base    : 0,
        __table_base     : 0,
        // Runtime helpers — implement the ones rnnoise actually calls
        abort            : () => { throw new Error('rnnoise WASM abort()'); },
        emscripten_memcpy_big: copyBytes,
        emscripten_resize_heap: resizeHeap,
        // Catch-all stubs for any other env imports the build may declare
        _emscripten_memcpy_big     : copyBytes,
        _emscripten_resize_heap    : resizeHeap,
        _abort                     : () => { throw new Error('rnnoise _abort'); },
        ___setErrNo                : () => {},
        ___syscall3                : () => -1,
        ___syscall5                : () => -1,
        ___syscall54               : () => 0,
        ___syscall6                : () => -1,
        ___syscall140              : () => -1,
        ___syscall146              : () => -1,
      };

      let instance;
      // First try with no imports (modern standalone / WASI builds)
      try {
        ({ instance } = await WebAssembly.instantiate(buf, {}));
      } catch {
        try {
          // Fall back to legacy Emscripten env imports
          ({ instance } = await WebAssembly.instantiate(buf, { env }));
        } catch {
          // Some published rnnoise.wasm builds minify the module/import names.
          ({ instance } = await WebAssembly.instantiate(buf, {
            a: {
              a: resizeHeap,
              b: copyBytes,
            },
          }));
        }
      }

      const ex = instance.exports;
      activeMemory = pickMemory(ex, sharedMemory);

      const ctorFn    = pickExport(ex, ['___wasm_call_ctors', '__wasm_call_ctors', 'd']);
      const createFn  = pickExport(ex, ['rnnoise_create', 'f']);
      const processFn = pickExport(ex, ['rnnoise_process_frame', 'j']);
      const destroyFn = pickExport(ex, ['rnnoise_destroy', 'h']);
      const mallocFn  = pickExport(ex, ['malloc', 'g']);
      const freeFn    = pickExport(ex, ['free', 'i']);

      if (ctorFn) ctorFn();

      if (!createFn || !processFn || !destroyFn || !mallocFn || !freeFn) {
        throw new Error('rnnoise_create not exported — wrong WASM binary?');
      }

      const state  = createFn(0);
      const inPtr  = mallocFn(RNN_FRAME * 4);  // 4 bytes per float32
      const outPtr = mallocFn(RNN_FRAME * 4);

      this._rnn = { ex, memory: activeMemory, state, inPtr, outPtr, processFn };
      this._ready = true;
      this.port.postMessage({ type: 'rnnoise-ready' });

      // Replay early frames as pass-through (no denoising retroactively —
      // these arrived before WASM was ready, so we just forward them).
      for (const f of this._earlyFrames) this._drain(f, /* passthrough */ true);
      this._earlyFrames = [];

    } catch (err) {
      this._passthrough = true;
      this.port.postMessage({ type: 'rnnoise-fallback', reason: String(err) });

      // Flush pre-init queue as raw pass-through
      for (const f of this._earlyFrames) this._drain(f, true);
      this._earlyFrames = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Per-frame denoising
  // ---------------------------------------------------------------------------

  _denoise(samples) {
    const { memory, processFn, state, inPtr, outPtr } = this._rnn;

    // Write float32 samples scaled to PCM range into WASM heap
    const inOff = inPtr >>> 2;
    const heap  = new Float32Array(memory.buffer);
    for (let i = 0; i < RNN_FRAME; i++) heap[inOff + i] = samples[i] * SCALE;

    processFn(state, outPtr, inPtr);

    // Read back denoised samples — re-read heap in case memory grew
    const outOff   = outPtr >>> 2;
    const heap2    = new Float32Array(memory.buffer);
    const out      = new Float32Array(RNN_FRAME);
    for (let i = 0; i < RNN_FRAME; i++) out[i] = heap2[outOff + i] / SCALE;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Ring-buffer drain: accumulate → process → post
  // ---------------------------------------------------------------------------

  _drain(inputFrame, passthrough) {
    for (let i = 0; i < inputFrame.length; i++) this._inBuf.push(inputFrame[i]);

    const frameSize = passthrough ? POST_SIZE : RNN_FRAME;

    while (this._inBuf.length >= frameSize) {
      const frame     = new Float32Array(this._inBuf.splice(0, frameSize));
      const processed = (!passthrough && this._rnn) ? this._denoise(frame) : frame;
      for (let i = 0; i < processed.length; i++) this._outBuf.push(processed[i]);

      while (this._outBuf.length >= POST_SIZE) {
        const chunk = new Float32Array(this._outBuf.splice(0, POST_SIZE));
        this.port.postMessage(chunk, [chunk.buffer]);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // AudioWorkletProcessor interface
  // ---------------------------------------------------------------------------

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    const frame = new Float32Array(ch);

    if (!this._ready && !this._passthrough) {
      // WASM still loading — queue raw frame, replay after init
      this._earlyFrames.push(frame);
    } else {
      this._drain(frame, this._passthrough);
    }

    return true; // keep processor alive
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
