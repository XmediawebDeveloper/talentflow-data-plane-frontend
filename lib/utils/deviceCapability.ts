/**
 * Device capability detection for the AI interview.
 *
 * Many candidates join from old / low-end machines. Heavy client-side features
 * (neural VAD, 3D talking-head avatar, RNNoise WASM, frequent face verification)
 * can overload such systems → dropped audio frames, UI freeze, worse accuracy.
 *
 * This module classifies the candidate's device into a tier during the system
 * check and derives feature flags from it, so the interview runs the HEAVY,
 * most-accurate path only where the hardware can afford it and a LIGHTWEIGHT
 * path everywhere else. Detection uses cheap, synchronous browser signals plus
 * an optional tiny micro-benchmark — it never loads any heavy library to decide.
 */

export type DeviceTier = 'low' | 'mid' | 'high';

export interface DeviceCapability {
  tier: DeviceTier;
  cores: number;
  /** RAM in GB if the browser exposes it (Chrome only), else null. */
  memoryGB: number | null;
  /** ms taken by the micro-benchmark (lower = faster CPU); null if not run. */
  benchmarkMs: number | null;

  // ── Derived feature flags (read by the interview UI) ──────────────────────
  /** Silero / neural VAD — only on 'high'. Otherwise amplitude VAD + server EndOfTurn. */
  useNeuralVad: boolean;
  /** 3D TalkingHead avatar — off on 'low' (falls back to a static image). */
  use3DAvatar: boolean;
  /** RNNoise WASM noise suppression — off on 'low' (server-side denoise covers it). */
  useNoiseSuppression: boolean;
  /** Face-verification poll interval — longer on weaker devices to save CPU. */
  faceVerifyIntervalMs: number;
}

const LOW_CORES = 2;
const HIGH_CORES = 8;
const LOW_MEMORY_GB = 2;
const HIGH_MEMORY_GB = 8;
// Micro-benchmark ceiling for the 'high' tier (fast modern CPU).
const BENCH_SLOW_MS = 12;
// Separate, MUCH more lenient ceiling for neural (Silero) VAD. Silero is tiny
// (~1.8MB model, ~1ms per 32ms chunk, ~2-5% of one core) — it runs fine on a
// typical 4-core machine. We only DISABLE it on a genuinely slow CPU, judged
// by the benchmark rather than core count, so most candidates (4-core) still
// get accurate neural turn detection. Above this many ms = too slow → fall
// back to the lightweight amplitude VAD.
const BENCH_NEURAL_VAD_MAX_MS = 35;
// A ≤4-core machine is demoted to 'low' (2D Bina, no noise suppression) only
// when the benchmark is CLEARLY slow, not merely over the 'high' line.
// Prod log 2026-10-13: "tier=low cores=4 ram=16GB bench=13.8ms" — 13.8 vs the
// old 12ms cut-off is run-to-run noise (system check is still busy with face
// detection and the model prefetch), so the same PC got 3D Bina on one visit
// and 2D on the next.
const BENCH_LOW_TIER_MS = 25;
const BENCH_RUNS = 3;
const NEURAL_VAD_MIN_CORES = 4;

/**
 * Tiny CPU micro-benchmark (~a few ms even on slow machines). Pure arithmetic,
 * no allocation, so it measures raw single-core speed without janking the page.
 * Returns elapsed ms. Uses performance.now() (always available in browsers).
 */
export function runCpuMicroBenchmark(iterations = 2_000_000): number {
  const start = performance.now();
  let acc = 0;
  for (let i = 0; i < iterations; i++) {
    acc += Math.sqrt(i) * 1.0000001;
  }
  // Prevent the loop being optimized away.
  if (acc === -1) console.debug('bench', acc);
  return performance.now() - start;
}

/**
 * Classify the device. Pass `runBenchmark: false` to skip the micro-benchmark
 * and decide from cores + memory only (instant). The benchmark refines the
 * tier when core count alone is misleading (e.g. a CPU-throttled old laptop
 * reporting 8 logical cores).
 */
export function detectDeviceCapability(opts: { runBenchmark?: boolean } = {}): DeviceCapability {
  const runBenchmark = opts.runBenchmark ?? true;

  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 2;
  const memoryGB =
    typeof navigator !== 'undefined' && typeof (navigator as { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as { deviceMemory?: number }).deviceMemory ?? null
      : null;

  // Best of a few short runs: a background spike only ever makes a run SLOWER,
  // so the fastest run is the truest reading of the CPU.
  let benchmarkMs: number | null = null;
  if (runBenchmark) {
    for (let i = 0; i < BENCH_RUNS; i++) {
      const ms = runCpuMicroBenchmark();
      benchmarkMs = benchmarkMs === null ? ms : Math.min(benchmarkMs, ms);
    }
  }

  // ── Tier decision ─────────────────────────────────────────────────────────
  // Start optimistic from cores+memory, then DOWNGRADE on any weak signal so a
  // single strong number can't promote a genuinely slow machine.
  let tier: DeviceTier = 'mid';

  const coreHigh = cores >= HIGH_CORES;
  const coreLow = cores <= LOW_CORES;
  const memHigh = memoryGB === null ? true : memoryGB >= HIGH_MEMORY_GB; // unknown → don't penalize
  const memLow = memoryGB !== null && memoryGB <= LOW_MEMORY_GB;
  const benchSlow = benchmarkMs !== null && benchmarkMs > BENCH_SLOW_MS;

  // Tier is driven PRIMARILY by hardware (cores + RAM). The benchmark only
  // refines borderline cases — it must NOT demote strong hardware on its own.
  // BUG observed: an 8-core/16GB machine was classed 'low' because the benchmark
  // (run during the heavy system-check: face-api + voice enroll) spiked to 19ms
  // > the 12ms 'high' threshold. A transient benchmark blip must never force a
  // capable machine into lite mode. New rule:
  //   • genuinely weak hardware (≤2 cores OR ≤2GB)        → low
  //   • strong hardware (≥8 cores AND ≥8GB) + fast bench  → high
  //   • borderline hardware (≤4 cores) AND CLEARLY slow bench (>BENCH_LOW_TIER_MS) → low
  //   • everything else                                   → mid
  const benchVerySlow = benchmarkMs !== null && benchmarkMs > BENCH_LOW_TIER_MS;
  if (coreLow || memLow) {
    tier = 'low';
  } else if (coreHigh && memHigh && !benchSlow) {
    tier = 'high';
  } else if (benchVerySlow && cores <= 4) {
    tier = 'low';
  } else {
    tier = 'mid';
  }

  // Neural (Silero) VAD is judged SEPARATELY from tier because it is light
  // enough for most machines — gating it on tier==='high' would deny it to the
  // majority of candidates who run 4-core systems. Enable it whenever the CPU
  // has at least NEURAL_VAD_MIN_CORES cores AND the benchmark isn't genuinely
  // slow. A fast benchmark alone also qualifies a strong 2-core machine.
  const benchKnown = benchmarkMs !== null;
  const benchOkForNeural = benchKnown ? benchmarkMs! <= BENCH_NEURAL_VAD_MAX_MS : true;
  const useNeuralVad =
    benchOkForNeural && (cores >= NEURAL_VAD_MIN_CORES || (benchKnown && benchmarkMs! <= BENCH_SLOW_MS));

  return {
    tier,
    cores,
    memoryGB,
    benchmarkMs,
    useNeuralVad,
    // Heavy WebGL/face work scales with tier (these ARE the real CPU hogs).
    use3DAvatar: tier !== 'low',
    useNoiseSuppression: tier !== 'low',
    faceVerifyIntervalMs: tier === 'high' ? 10_000 : tier === 'mid' ? 15_000 : 30_000,
  };
}

/** One-line human summary for logs / the dev monitor. */
export function describeCapability(cap: DeviceCapability): string {
  return (
    `tier=${cap.tier} cores=${cap.cores} ram=${cap.memoryGB ?? '?'}GB ` +
    `bench=${cap.benchmarkMs?.toFixed(1) ?? '?'}ms ` +
    `[neuralVad=${cap.useNeuralVad} avatar3d=${cap.use3DAvatar} ` +
    `noiseSuppress=${cap.useNoiseSuppression} faceVerify=${cap.faceVerifyIntervalMs / 1000}s]`
  );
}
