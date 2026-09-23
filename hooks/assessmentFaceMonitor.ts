/**
 * assessmentFaceMonitor — face presence, multiple-face, gaze and identity
 * monitoring for the ASSESSMENT module, built the way the AI interview does it.
 *
 * Why this replaced the face-api.js pipeline in useProctoringMonitor (2026-09-23):
 * the old pipeline ran face-api.js on the TensorFlow CPU backend TWICE every
 * 3 s (tiny detector + landmarks + 128-d descriptors for every face, plus
 * snapshot re-runs) on the main thread. On a normal laptop one pass took 1–3 s,
 * so the page froze for most of every cycle: candidates reported "totally
 * hanging", stuck clicks, and the API client mistook the blocked thread for a
 * dead network ("Can't reach the server" while every request returned 200).
 *
 * What runs now (same cadence and models as
 * components/ai-interview/proctoring/InterviewFaceDetection.ts and
 * InterviewFaceVerification.ts, which candidates run without hanging):
 *   - MediaPipe FaceDetection (short model, WASM/WebGL, CDN) every 1.5 s → face count
 *   - MediaPipe FaceMesh every 2 s → gaze direction (interview thresholds,
 *     3 away / 2 restored confirmations, ONE event per episode)
 *   - face-api.js identity descriptor every 10 s, ONLY when exactly one face
 *     is present and the page is visible; never per-cycle, never on snapshots
 *   - a single 250 ms setTimeout scheduler with timestamp gates and a busy
 *     flag, so passes never overlap and the thread gets long idle gaps
 *   - every pass is timed; a rolling summary is logged every 30 s so a slow
 *     machine shows up in the console instead of as a mystery hang
 *
 * Works in every browser MediaPipe supports (Chrome, Edge, Firefox, Safari).
 * If MediaPipe cannot load (offline CDN), face presence falls back to the
 * face-api tiny detector at 3 s — still single pass, no descriptors.
 */

import { loadFaceApiWithCpuBackend, type FaceApiModule } from '@/lib/face-api-loader';
import { loadFaceApiNetWithFallback, FACE_API_MODEL_URLS } from '@/lib/proctoring/faceDetection';
import { createFaceIdentityWorker, type FaceIdentityWorker } from '@/lib/proctoring/faceIdentityWorker';

export type GazeDirection = 'left' | 'right' | 'up' | 'left_up' | 'right_up' | 'center';

export interface FaceMonitorCallbacks {
  /** Called on every detection tick (~1.5 s) with the plausible face count. */
  onFaceCount: (count: number, details: Record<string, unknown>) => void;
  /** Detector threw or produced nothing usable. */
  onDetectionFailure?: (error: unknown) => void;
  /** Gaze left the screen for ≥ 3 consecutive checks (~6 s). Once per episode. */
  onGazeAway?: (direction: GazeDirection, offsets: { x: number; y: number }) => void;
  /** Gaze came back for ≥ 2 consecutive checks. Carries the episode length. */
  onGazeRestored?: (episodeMs: number) => void;
  /** Descriptor distance to the baseline exceeded the threshold twice in a row. */
  onIdentityMismatch?: (distance: number) => void;
  /** No baseline existed; three captures were averaged into one. */
  onIdentityBaselineCaptured?: (descriptor: Float32Array) => void;
  /** Return true to skip this tick entirely (camera obstructed, page hidden…). */
  shouldSkip?: () => boolean;
}

export interface FaceMonitorOptions {
  faceIntervalMs?: number;      // default 1500
  gazeIntervalMs?: number;      // default 2000
  identityIntervalMs?: number;  // default 10000
  pollMs?: number;              // default 250
  enableGaze?: boolean;         // default true
  enableIdentity?: boolean;     // default true
  identityBaseline?: Float32Array | null;
  identityMismatchThreshold?: number;   // default 0.8 (euclidean, face-api)
  identityConfirmations?: number;       // default 2
  identityBootstrapCaptures?: number;   // default 3
  perfLogIntervalMs?: number;           // default 30000
}

export interface AssessmentFaceMonitor {
  start: () => Promise<void>;
  stop: () => void;
  /** Replace the identity baseline at runtime (e.g. after registration). */
  setIdentityBaseline: (descriptor: Float32Array | null) => void;
  /** Last plausible face count seen by the detector. */
  getLastFaceCount: () => number;
}

const MIN_FACE_BOX_AREA = 0.025;   // ≥2.5 % of the frame — filters spurious boxes
const MIN_DETECTION_CONFIDENCE = 0.6;
const FRAMES_GAZE_AWAY = 3;
const FRAMES_GAZE_RESTORED = 2;
const FALLBACK_FACE_INTERVAL_MS = 3000;
// When the identity worker cannot start, the main-thread descriptor (5–8 s on
// slow CPUs) runs only this often so the page is never blocked for long.
const IDENTITY_MAIN_THREAD_FALLBACK_INTERVAL_MS = 60000;

const MP_FACE_DETECTION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection';
const MP_FACE_MESH_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh';

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no document')); return; }
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });

class PassTimer {
  private samples: Record<string, { total: number; max: number; n: number }> = {};
  private lastLogAt = 0;
  constructor(private readonly logEveryMs: number) {}
  record(name: string, ms: number) {
    const s = this.samples[name] || (this.samples[name] = { total: 0, max: 0, n: 0 });
    s.total += ms; s.n += 1; if (ms > s.max) s.max = ms;
  }
  maybeLog(now: number) {
    if (now - this.lastLogAt < this.logEveryMs) return;
    this.lastLogAt = now;
    const parts = Object.entries(this.samples).map(([k, s]) =>
      `${k} avg ${(s.total / Math.max(1, s.n)).toFixed(0)} ms / max ${s.max.toFixed(0)} ms (n=${s.n})`);
    if (parts.length) console.log(`[FACE-MONITOR] main-thread cost last ${this.logEveryMs / 1000}s: ${parts.join(' | ')}`);
    this.samples = {};
  }
}

const euclidean = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
};

const average = (descs: Float32Array[]): Float32Array => {
  const out = new Float32Array(descs[0].length);
  for (const d of descs) for (let i = 0; i < out.length; i += 1) out[i] += d[i];
  for (let i = 0; i < out.length; i += 1) out[i] /= descs.length;
  return out;
};

export function createAssessmentFaceMonitor(
  video: HTMLVideoElement,
  callbacks: FaceMonitorCallbacks,
  options: FaceMonitorOptions = {},
): AssessmentFaceMonitor {
  const faceIntervalMs = options.faceIntervalMs ?? 1500;
  const gazeIntervalMs = options.gazeIntervalMs ?? 2000;
  const identityIntervalMs = options.identityIntervalMs ?? 10000;
  const pollMs = options.pollMs ?? 250;
  const enableGaze = options.enableGaze ?? true;
  const enableIdentity = options.enableIdentity ?? true;
  const identityThreshold = options.identityMismatchThreshold ?? 0.8;
  const identityConfirmations = options.identityConfirmations ?? 2;
  const bootstrapCaptures = options.identityBootstrapCaptures ?? 3;
  const perf = new PassTimer(options.perfLogIntervalMs ?? 30000);

  let running = false;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let faceDetector: any = null;
  let faceMesh: any = null;
  let faceApi: FaceApiModule | null = null;
  let faceApiLoad: Promise<FaceApiModule | null> | null = null;
  let usingFallbackDetector = false;
  let identityWorker: FaceIdentityWorker | null = null;
  let identityWorkerReady: boolean | null = null; // null = still starting

  let lastFaceAt = 0;
  let lastGazeAt = 0;
  let lastIdentityAt = 0;
  let lastFaceCount = 1;

  // gaze episode state
  let gazeAwayCount = 0;
  let gazeRestoredCount = 0;
  let gazeOnScreen = true;
  let gazeEpisodeStartedAt = 0;

  // identity state
  let identityBaseline: Float32Array | null = options.identityBaseline ?? null;
  let identityMismatches = 0;
  const bootstrap: Float32Array[] = [];

  // MediaPipe results arrive through onResults; we resolve a promise per send
  // so the scheduler can await the pass and time it.
  let pendingFaceResolve: (() => void) | null = null;
  let pendingMeshResolve: (() => void) | null = null;

  const handleFaceResults = (results: any) => {
    const detections = (results?.detections || []).filter((d: any) => {
      const bb = d?.boundingBox;
      if (!bb) return true;
      return ((bb.width || 0) * (bb.height || 0)) >= MIN_FACE_BOX_AREA;
    });
    lastFaceCount = detections.length;
    callbacks.onFaceCount(lastFaceCount, {
      method: 'mediapipe_face_detection',
      raw_face_count: (results?.detections || []).length,
    });
  };

  const handleMeshResults = (results: any) => {
    const lm = results?.multiFaceLandmarks?.[0];
    if (!lm) return; // no face → face-count path owns the alarm
    const noseTip = lm[1];
    const leftEyeOuter = lm[33];
    const rightEyeOuter = lm[263];
    const forehead = lm[10];
    const chin = lm[152];
    if (!noseTip || !leftEyeOuter || !rightEyeOuter || !forehead || !chin) return;

    const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const noseOffset = noseTip.x - eyeMidX;
    const faceMidY = (forehead.y + chin.y) / 2;
    const noseVerticalOffset = noseTip.y - faceMidY;

    // Same thresholds as the interview (normalised MediaPipe coordinates).
    const horizontal = Math.abs(noseOffset) > 0.06;
    const upward = noseVerticalOffset < -0.08;
    const lookingAway = horizontal || upward;

    let direction: GazeDirection = 'center';
    if (horizontal) direction = noseOffset > 0 ? 'right' : 'left';
    if (upward) direction = direction === 'center' ? 'up' : (`${direction}_up` as GazeDirection);

    if (lookingAway) {
      gazeAwayCount += 1;
      gazeRestoredCount = 0;
      if (gazeOnScreen && gazeAwayCount >= FRAMES_GAZE_AWAY) {
        gazeOnScreen = false;
        gazeEpisodeStartedAt = Date.now();
        callbacks.onGazeAway?.(direction, {
          x: Number(noseOffset.toFixed(3)),
          y: Number(noseVerticalOffset.toFixed(3)),
        });
      }
    } else {
      gazeRestoredCount += 1;
      gazeAwayCount = 0;
      if (!gazeOnScreen && gazeRestoredCount >= FRAMES_GAZE_RESTORED) {
        gazeOnScreen = true;
        callbacks.onGazeRestored?.(Date.now() - gazeEpisodeStartedAt);
        gazeEpisodeStartedAt = 0;
      }
    }
  };

  const initMediaPipe = async (): Promise<boolean> => {
    try {
      await loadScript(`${MP_FACE_DETECTION_URL}/face_detection.js`);
      const FaceDetectionClass = (window as any).FaceDetection;
      if (!FaceDetectionClass) throw new Error('FaceDetection global missing after CDN load');
      const fd = new FaceDetectionClass({ locateFile: (f: string) => `${MP_FACE_DETECTION_URL}/${f}` });
      fd.setOptions({ model: 'short', minDetectionConfidence: MIN_DETECTION_CONFIDENCE });
      fd.onResults((r: any) => {
        try { handleFaceResults(r); } finally { pendingFaceResolve?.(); pendingFaceResolve = null; }
      });
      faceDetector = fd;
    } catch (err) {
      console.warn('[FACE-MONITOR] MediaPipe FaceDetection unavailable, falling back to face-api tiny detector:', err);
      return false;
    }

    if (enableGaze) {
      try {
        await loadScript(`${MP_FACE_MESH_URL}/face_mesh.js`);
        const FaceMeshClass = (window as any).FaceMesh;
        if (!FaceMeshClass) throw new Error('FaceMesh global missing after CDN load');
        const fm = new FaceMeshClass({ locateFile: (f: string) => `${MP_FACE_MESH_URL}/${f}` });
        fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        fm.onResults((r: any) => {
          try { handleMeshResults(r); } finally { pendingMeshResolve?.(); pendingMeshResolve = null; }
        });
        faceMesh = fm;
      } catch (err) {
        console.warn('[FACE-MONITOR] FaceMesh unavailable — gaze tracking disabled:', err);
        faceMesh = null;
      }
    }
    return true;
  };

  const ensureFaceApi = (): Promise<FaceApiModule | null> => {
    if (faceApi) return Promise.resolve(faceApi);
    if (faceApiLoad) return faceApiLoad;
    faceApiLoad = (async () => {
      try {
        const api = await loadFaceApiWithCpuBackend();
        await Promise.all([
          loadFaceApiNetWithFallback(api.nets.tinyFaceDetector, FACE_API_MODEL_URLS),
          loadFaceApiNetWithFallback(api.nets.faceLandmark68Net, FACE_API_MODEL_URLS),
          loadFaceApiNetWithFallback(api.nets.faceRecognitionNet, FACE_API_MODEL_URLS),
        ]);
        faceApi = api;
        return api;
      } catch (err) {
        console.warn('[FACE-MONITOR] face-api identity models unavailable:', err);
        return null;
      } finally {
        faceApiLoad = null;
      }
    })();
    return faceApiLoad;
  };

  const sendWithTimeout = (send: () => Promise<void>, setResolve: (r: () => void) => void, ms: number) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      setResolve(finish);
      const t = setTimeout(finish, ms);
      send().catch(finish).finally(() => clearTimeout(t));
    });

  const runFacePass = async () => {
    const t0 = performance.now();
    try {
      if (faceDetector) {
        await sendWithTimeout(() => faceDetector.send({ image: video }), (r) => { pendingFaceResolve = r; }, 1500);
      } else if (faceApi) {
        // Fallback: one tiny-detector pass, no landmarks, no descriptors.
        const dets = await faceApi.detectAllFaces(
          video,
          new faceApi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
        );
        lastFaceCount = (dets || []).length;
        callbacks.onFaceCount(lastFaceCount, { method: 'face-api_fallback', raw_face_count: lastFaceCount });
      }
    } catch (err) {
      callbacks.onDetectionFailure?.(err);
    } finally {
      perf.record('detect', performance.now() - t0);
    }
  };

  const runGazePass = async () => {
    if (!faceMesh) return;
    const t0 = performance.now();
    try {
      await sendWithTimeout(() => faceMesh.send({ image: video }), (r) => { pendingMeshResolve = r; }, 1500);
    } catch { /* gaze is best-effort */ } finally {
      perf.record('gaze', performance.now() - t0);
    }
  };

  const applyDescriptor = (descriptor: Float32Array) => {
      if (identityBaseline) {
        const distance = euclidean(identityBaseline, descriptor);
        if (distance > identityThreshold) {
          identityMismatches += 1;
          if (identityMismatches >= identityConfirmations) {
            identityMismatches = 0;
            callbacks.onIdentityMismatch?.(Number(distance.toFixed(3)));
          }
        } else {
          identityMismatches = 0;
        }
      } else {
        bootstrap.push(descriptor);
        if (bootstrap.length >= bootstrapCaptures) {
          identityBaseline = average(bootstrap.slice(0, bootstrapCaptures));
          bootstrap.length = 0;
          callbacks.onIdentityBaselineCaptured?.(identityBaseline);
        }
      }
  };

  const runIdentityPass = async () => {
    if (!enableIdentity || lastFaceCount !== 1) return;
    // Preferred path: descriptor computed in the Web Worker. The main thread
    // only pays for a 320 px frame grab (~1–3 ms); the 5–8 s inference that
    // used to freeze the page runs off-thread.
    if (identityWorker && identityWorkerReady) {
      const t0 = performance.now();
      const result = await identityWorker.describe(video, 320);
      perf.record('identity-grab(main)', performance.now() - t0);
      if (!result) return;
      perf.record('identity-infer(worker, off-thread)', result.workerMs);
      if (result.descriptor) applyDescriptor(result.descriptor);
      return;
    }
    if (identityWorkerReady === null) return; // worker still starting — wait
    // Fallback (worker failed to start): main thread, but rarely.
    const api = await ensureFaceApi();
    if (!api || !running) return;
    const t0 = performance.now();
    try {
      const det = await api
        .detectSingleFace(video, new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      const descriptor = (det as { descriptor?: Float32Array } | undefined)?.descriptor;
      if (descriptor) applyDescriptor(descriptor);
    } catch (err) {
      console.warn('[FACE-MONITOR] identity pass skipped:', err);
    } finally {
      perf.record('identity(main-thread fallback)', performance.now() - t0);
    }
  };

  const tick = async () => {
    if (!running) return;
    const now = performance.now();
    const videoReady = video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
    const skip = !videoReady || (typeof document !== 'undefined' && document.hidden) || callbacks.shouldSkip?.() === true;

    if (!busy && !skip) {
      busy = true;
      try {
        const faceEvery = usingFallbackDetector ? FALLBACK_FACE_INTERVAL_MS : faceIntervalMs;
        if (now - lastFaceAt >= faceEvery) { lastFaceAt = now; await runFacePass(); }
        if (running && faceMesh && now - lastGazeAt >= gazeIntervalMs) { lastGazeAt = now; await runGazePass(); }
        const identityEvery = (identityWorker && identityWorkerReady) ? identityIntervalMs : IDENTITY_MAIN_THREAD_FALLBACK_INTERVAL_MS;
        if (running && now - lastIdentityAt >= identityEvery) { lastIdentityAt = now; await runIdentityPass(); }
      } finally {
        busy = false;
      }
    }
    perf.maybeLog(Date.now());
    if (running) timer = setTimeout(tick, pollMs);
  };

  return {
    async start() {
      if (running) return;
      running = true;
      const ok = await initMediaPipe();
      if (!running) return;
      if (!ok) {
        usingFallbackDetector = true;
        await ensureFaceApi();
      }
      if (enableIdentity) {
        identityWorker = createFaceIdentityWorker({ modelUrls: FACE_API_MODEL_URLS, inputSize: 224 });
        void identityWorker.ready.then((ok) => {
          identityWorkerReady = ok;
          if (!ok) {
            console.warn(`[FACE-MONITOR] identity worker unavailable — falling back to main-thread descriptor every ${IDENTITY_MAIN_THREAD_FALLBACK_INTERVAL_MS / 1000}s`);
            void ensureFaceApi();
          }
        });
      }
      lastIdentityAt = performance.now(); // first identity pass after one interval, not immediately
      console.log(`[FACE-MONITOR] started (detector=${faceDetector ? 'mediapipe' : 'face-api-fallback'}, gaze=${faceMesh ? 'on' : 'off'}, identity=${enableIdentity ? `${identityIntervalMs / 1000}s via worker` : 'off'})`);
      timer = setTimeout(tick, pollMs);
    },
    stop() {
      running = false;
      if (timer) { clearTimeout(timer); timer = null; }
      pendingFaceResolve?.(); pendingFaceResolve = null;
      pendingMeshResolve?.(); pendingMeshResolve = null;
      try { faceDetector?.close?.(); } catch { /* ignore */ }
      try { faceMesh?.close?.(); } catch { /* ignore */ }
      faceDetector = null;
      faceMesh = null;
      identityWorker?.terminate();
      identityWorker = null;
      identityWorkerReady = null;
    },
    setIdentityBaseline(descriptor) {
      identityBaseline = descriptor;
      identityMismatches = 0;
      bootstrap.length = 0;
    },
    getLastFaceCount: () => lastFaceCount,
  };
}
