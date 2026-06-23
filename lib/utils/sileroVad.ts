'use client';

/**
 * Silero VAD wrapper (neural voice-activity detection).
 *
 * WHY: the interview's amplitude-based VAD mis-reads quiet mics (wired/Bluetooth
 * headsets) — opening words clipped, and quiet ongoing speech mistaken for
 * silence so the turn is cut mid-answer. Silero is a tiny neural VAD (~1.8 MB
 * model, ~1 ms per 32 ms frame, ~2-5% of one core) that decides speech-vs-silence
 * from the audio itself, not its loudness — so it works the same on any device.
 *
 * This wrapper is OPT-IN and DEVICE-GATED: InterviewUI only starts it when
 * deviceCapability.useNeuralVad is true (capable CPU). It runs ALONGSIDE the
 * existing amplitude VAD as the accurate "is the candidate speaking right now?"
 * signal; the proven silence-clock / turn-timing logic is unchanged. If the
 * package or model assets fail to load, createSileroVad() returns null and the
 * caller silently falls back to the amplitude VAD — so a bad load can never
 * break the interview.
 *
 * ── PRODUCTION INSTALL (do this in your dev/build environment) ───────────────
 *   1. Install the packages:
 *        npm install @ricky0123/vad-web onnxruntime-web
 *
 *   2. Self-host the model + wasm assets (your CSP blocks the default CDN).
 *      Copy these into  public/silero/  so they're served from /silero/:
 *        - from node_modules/@ricky0123/vad-web/dist/:
 *            vad.worklet.bundle.min.js
 *            silero_vad_v5.onnx        (or silero_vad.onnx, depending on version)
 *            silero_vad_legacy.onnx    (if present)
 *        - from node_modules/onnxruntime-web/dist/:
 *            ort-wasm-simd-threaded.wasm   (and any other ort-wasm*.wasm files)
 *
 *      A copy script in package.json keeps them in sync, e.g.:
 *        "postinstall": "node scripts/copy-silero-assets.js"
 *      or just copy once by hand. ASSET_BASE_PATH below must match the folder.
 *
 *   3. Deploy. No .env change is required — the feature is gated purely by
 *      deviceCapability.useNeuralVad in the client.
 */

export interface SileroVadHandle {
  /** Stop detection and release the worklet/model. Idempotent. */
  destroy: () => void;
  /** True while the VAD is actively listening. */
  isRunning: () => boolean;
}

export interface SileroVadOptions {
  /** The candidate's recording MediaStream (reused — Silero does NOT open its own mic). */
  stream: MediaStream;
  /** Fired when neural VAD confirms speech has started. */
  onSpeechStart: () => void;
  /** Fired when neural VAD confirms speech has ended (a genuine pause/answer end). */
  onSpeechEnd: () => void;
  /** Optional: fired on a misfire (too-short blip rejected) — usually ignored. */
  onMisfire?: () => void;
  /** Base path for the self-hosted model + wasm assets. Default '/silero/'. */
  assetBasePath?: string;
}

const ASSET_BASE_PATH = '/silero/';

/**
 * Create and start a Silero VAD bound to an existing MediaStream.
 * Returns a handle, or null if the package/assets are unavailable (caller
 * must fall back to the amplitude VAD).
 */
export async function createSileroVad(opts: SileroVadOptions): Promise<SileroVadHandle | null> {
  if (typeof window === 'undefined') return null;

  const base = opts.assetBasePath ?? ASSET_BASE_PATH;

  let vad: { start: () => void; pause: () => void; destroy?: () => void } | null = null;
  let running = false;

  try {
    // Dynamic import via a non-literal specifier so TypeScript does NOT try to
    // resolve the module at build time — this lets the project compile even
    // before the package is installed, and avoids version-specific option-type
    // mismatches breaking the build. Resolved/typed as `any` at runtime.
    const pkg = '@ricky0123/vad-web';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* @vite-ignore */ pkg).catch(() => null);
    if (!mod || !mod.MicVAD) {
      console.warn('[SileroVAD] @ricky0123/vad-web not available — falling back to amplitude VAD');
      return null;
    }

    vad = await mod.MicVAD.new({
      // Reuse the interview's existing recording stream — no second getUserMedia.
      stream: opts.stream,

      // Self-hosted assets (CSP blocks the default jsDelivr CDN).
      baseAssetPath: base,
      onnxWASMBasePath: base,

      // ── Tuning for interview answers ────────────────────────────────────
      // positive/negative thresholds: standard Silero defaults work well.
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      // minSpeechFrames: reject sub-~100ms blips (coughs, clicks).
      minSpeechFrames: 3,
      // preSpeechPadFrames: include a little audio before detection so the
      // onSpeechStart isn't late (the interview keeps its own pre-speech ring
      // too, so this is belt-and-suspenders).
      preSpeechPadFrames: 10,
      // redemptionFrames: how many silent frames (≈32ms each) before declaring
      // speech ended. Kept MODERATE (~0.8s) on purpose: the interview's own
      // silence clock provides the long pause tolerance — Silero just needs to
      // flip "not speaking" so that clock can start counting. A huge value here
      // would delay end-of-turn unnecessarily.
      redemptionFrames: 24,

      onSpeechStart: () => {
        try { opts.onSpeechStart(); } catch (e) { console.warn('[SileroVAD] onSpeechStart cb error', e); }
      },
      onSpeechEnd: () => {
        try { opts.onSpeechEnd(); } catch (e) { console.warn('[SileroVAD] onSpeechEnd cb error', e); }
      },
      onVADMisfire: () => {
        try { opts.onMisfire?.(); } catch { /* ignore */ }
      },
    });

    vad.start();
    running = true;
    console.log('[SileroVAD] neural VAD started (assets:', base, ')');
  } catch (err) {
    console.warn('[SileroVAD] init failed — falling back to amplitude VAD:', err);
    try { vad?.destroy?.(); } catch { /* ignore */ }
    return null;
  }

  return {
    destroy: () => {
      if (!running) return;
      running = false;
      try { vad?.pause(); } catch { /* ignore */ }
      try { vad?.destroy?.(); } catch { /* ignore */ }
      console.log('[SileroVAD] neural VAD destroyed');
    },
    isRunning: () => running,
  };
}
