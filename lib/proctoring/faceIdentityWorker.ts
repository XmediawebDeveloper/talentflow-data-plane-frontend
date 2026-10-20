/**
 * faceIdentityWorker — runs the face-api.js identity descriptor (tiny detector
 * + 68 landmarks + ResNet face-recognition net) in a dedicated Web Worker.
 *
 * Why (2026-09-23, second round of the assessment hang): after moving face
 * presence and gaze to MediaPipe, the console still showed
 *   [FACE-MONITOR] … identity avg 6332 ms / max 8135 ms (n=3)
 * i.e. the CPU-backend descriptor took 5–8 s every 10 s ON THE MAIN THREAD —
 * the page was blocked most of the time. The computation cannot be made cheap
 * on that hardware, so it is moved off the thread instead: the main thread
 * only grabs a 320 px frame (~1–3 ms) and posts the pixels; the worker owns
 * TensorFlow (CPU backend) and answers with a 128-float descriptor.
 *
 * face-api.js 0.20 inside a worker: there is no `window`/`document`, so
 * `env.initialize()` leaves the environment undefined and every call throws.
 * The worker installs its own environment via `env.setEnv` (OffscreenCanvas,
 * dummy Image/Video classes, worker fetch). Input is passed as PixelData
 * ({data: Uint8Array, width, height}) → `tf.browser.fromPixels` → tensor, so
 * no canvas is needed on the input path; landmarks/descriptors use face-api's
 * tensor branch (`extractFaceTensors`).
 *
 * The UMD bundle is served same-origin from /vendor/face-api.min.js (copied
 * from node_modules/face-api.js/dist); models from /models with CDN fallbacks.
 */

export interface FaceIdentityWorker {
  /** Resolves true once models are loaded, false if the worker could not start. */
  ready: Promise<boolean>;
  /** Grab a frame from the video and compute its descriptor off-thread. */
  describe: (video: HTMLVideoElement, targetWidth?: number) => Promise<{ descriptor: Float32Array | null; workerMs: number; grabMs: number } | null>;
  /**
   * Like describe(), for a video OR an image, with the detection score and box
   * (in source pixels) — what the interview's frame-quality gate needs.
   * null = busy / not grabbable / timed out; found=false = ran, no face.
   */
  detect: (source: HTMLVideoElement | HTMLImageElement, opts?: FaceDetectOptions) => Promise<FaceDetectResult | null>;
  terminate: () => void;
}

export interface FaceDetectOptions {
  /** Downscale the grabbed frame to at most this width (default 320). */
  targetWidth?: number;
  /** TinyFaceDetector input size (default: the worker's inputSize). */
  inputSize?: number;
  /** TinyFaceDetector score threshold (default 0.5). */
  scoreThreshold?: number;
}

export interface FaceDetectResult {
  found: boolean;
  descriptor: Float32Array | null;
  score: number | null;
  /** Face box scaled back to the source's own pixel size. */
  box: { x: number; y: number; width: number; height: number } | null;
  sourceWidth: number;
  sourceHeight: number;
  workerMs: number;
  grabMs: number;
}

const WORKER_SOURCE = String.raw`
let faceapi = null;
self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') {
    try {
      importScripts(msg.vendorUrl);
      faceapi = self.faceapi;
      if (!faceapi) throw new Error('faceapi global missing after importScripts');
      class Dummy {}
      faceapi.env.setEnv({
        Canvas: (typeof OffscreenCanvas !== 'undefined') ? OffscreenCanvas : Dummy,
        CanvasRenderingContext2D: (typeof OffscreenCanvasRenderingContext2D !== 'undefined') ? OffscreenCanvasRenderingContext2D : Dummy,
        Image: Dummy,
        ImageData: (typeof ImageData !== 'undefined') ? ImageData : Dummy,
        Video: Dummy,
        createCanvasElement: () => new OffscreenCanvas(1, 1),
        createImageElement: () => { throw new Error('Image elements are not available in a worker'); },
        fetch: (...args) => self.fetch(...args),
        readFile: () => { throw new Error('readFile not available in a worker'); },
      });
      // tfjs-core 1.7 registers a platform only when IS_BROWSER (window+document)
      // or IS_NODE is true. Neither holds in a worker, so env().platform is
      // undefined and tf.io.loadWeights (used by loadFromUri) would crash on
      // platform.fetch. Install a minimal worker platform first.
      const tfEnv = typeof faceapi.tf.env === 'function' ? faceapi.tf.env() : faceapi.tf.ENV;
      if (tfEnv && !tfEnv.platform && typeof tfEnv.setPlatform === 'function') {
        tfEnv.setPlatform('worker', {
          fetch: (path, init) => self.fetch(path, init),
          now: () => performance.now(),
          encode: (text, encoding) => new TextEncoder().encode(text),
          decode: (bytes, encoding) => new TextDecoder(encoding || 'utf-8').decode(bytes),
        });
      }
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();
      const nets = [faceapi.nets.tinyFaceDetector, faceapi.nets.faceLandmark68Net, faceapi.nets.faceRecognitionNet];
      for (const net of nets) {
        let loaded = false, lastErr = null;
        for (const url of msg.modelUrls) {
          try { await net.loadFromUri(url); loaded = true; break; } catch (err) { lastErr = err; }
        }
        if (!loaded) throw new Error('model load failed: ' + (lastErr && lastErr.message || lastErr));
      }
      self.postMessage({ type: 'ready', backend: faceapi.tf.getBackend() });
    } catch (err) {
      self.postMessage({ type: 'init_error', error: String(err && err.message || err) });
    }
    return;
  }
  if (msg.type === 'describe') {
    const t0 = Date.now();
    let tensor = null;
    try {
      const pixels = { data: new Uint8Array(msg.data), width: msg.width, height: msg.height };
      tensor = faceapi.tf.browser.fromPixels(pixels, 3);
      const scoreThreshold = typeof msg.scoreThreshold === 'number' ? msg.scoreThreshold : 0.5;
      const det = await faceapi
        .detectSingleFace(tensor, new faceapi.TinyFaceDetectorOptions({ inputSize: msg.inputSize || 224, scoreThreshold }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      const descriptor = det && det.descriptor ? det.descriptor : null;
      const d = det && det.detection;
      const box = d && d.box ? { x: d.box.x, y: d.box.y, width: d.box.width, height: d.box.height } : null;
      const score = d && typeof d.score === 'number' ? d.score : null;
      self.postMessage({ type: 'descriptor', id: msg.id, descriptor, score, box, ms: Date.now() - t0 }, descriptor ? [descriptor.buffer] : []);
    } catch (err) {
      self.postMessage({ type: 'descriptor', id: msg.id, descriptor: null, error: String(err && err.message || err), ms: Date.now() - t0 });
    } finally {
      if (tensor) { try { tensor.dispose(); } catch (_) {} }
    }
  }
};
`;

export function createFaceIdentityWorker(options: {
  vendorUrl?: string;
  modelUrls: readonly string[];
  inputSize?: number;
  requestTimeoutMs?: number;
} ): FaceIdentityWorker {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const vendorUrl = options.vendorUrl || `${origin}/vendor/face-api.min.js`;
  const modelUrls = options.modelUrls.map((u) => (u.startsWith('/') ? `${origin}${u}` : u));
  const inputSize = options.inputSize ?? 224;
  const requestTimeoutMs = options.requestTimeoutMs ?? 20000;

  let worker: Worker | null = null;
  let seq = 0;
  let busy = false;
  const pending = new Map<number, { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> }>();
  let grabCanvas: HTMLCanvasElement | null = null;

  const ready = new Promise<boolean>((resolve) => {
    try {
      const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      worker = new Worker(url);
      const initTimer = setTimeout(() => {
        console.warn('[FACE-IDENTITY-WORKER] init timed out (60 s)');
        resolve(false);
      }, 60000);
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data || {};
        if (msg.type === 'ready') {
          clearTimeout(initTimer);
          console.log(`[FACE-IDENTITY-WORKER] ready (backend=${msg.backend})`);
          resolve(true);
        } else if (msg.type === 'init_error') {
          clearTimeout(initTimer);
          console.warn('[FACE-IDENTITY-WORKER] init failed:', msg.error);
          resolve(false);
        } else if (msg.type === 'descriptor') {
          const p = pending.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            pending.delete(msg.id);
            p.resolve(msg);
          }
          busy = false;
        }
      };
      worker.onerror = (err) => {
        console.warn('[FACE-IDENTITY-WORKER] error:', err.message || err);
        clearTimeout(initTimer);
        resolve(false);
      };
      worker.postMessage({ type: 'init', vendorUrl, modelUrls });
    } catch (err) {
      console.warn('[FACE-IDENTITY-WORKER] could not start:', err);
      resolve(false);
    }
  });

  const detect = async (
    source: HTMLVideoElement | HTMLImageElement,
    opts: FaceDetectOptions = {},
  ): Promise<FaceDetectResult | null> => {
    if (!worker || busy) return null;
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    const vw = isVideo ? (source as HTMLVideoElement).videoWidth : (source as HTMLImageElement).naturalWidth;
    const vh = isVideo ? (source as HTMLVideoElement).videoHeight : (source as HTMLImageElement).naturalHeight;
    if (!vw || !vh) return null;
    const t0 = performance.now();
    const scale = Math.min(1, (opts.targetWidth ?? 320) / vw);
    const w = Math.max(1, Math.round(vw * scale)), h = Math.max(1, Math.round(vh * scale));
    if (!grabCanvas) grabCanvas = document.createElement('canvas');
    if (grabCanvas.width !== w || grabCanvas.height !== h) { grabCanvas.width = w; grabCanvas.height = h; }
    const ctx = grabCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    let imageData: ImageData;
    try {
      ctx.drawImage(source, 0, 0, w, h);
      imageData = ctx.getImageData(0, 0, w, h);
    } catch {
      return null;
    }
    const grabMs = performance.now() - t0;
    const id = ++seq;
    busy = true;
    const buffer = imageData.data.buffer as ArrayBuffer;
    const result = await new Promise<any>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        busy = false;
        resolve(null);
      }, requestTimeoutMs);
      pending.set(id, { resolve, timer });
      worker!.postMessage({
        type: 'describe', id, data: buffer, width: w, height: h,
        inputSize: opts.inputSize ?? inputSize,
        scoreThreshold: opts.scoreThreshold,
      }, [buffer]);
    });
    if (!result) return null;
    if (result.error) {
      console.warn('[FACE-IDENTITY-WORKER] describe error:', result.error);
      return null;
    }
    const inv = 1 / scale;
    const box = result.box
      ? { x: result.box.x * inv, y: result.box.y * inv, width: result.box.width * inv, height: result.box.height * inv }
      : null;
    return {
      found: Boolean(result.descriptor && box),
      descriptor: result.descriptor ? new Float32Array(result.descriptor) : null,
      score: typeof result.score === 'number' ? result.score : null,
      box,
      sourceWidth: vw,
      sourceHeight: vh,
      workerMs: Number(result.ms) || 0,
      grabMs,
    };
  };

  const describe = async (video: HTMLVideoElement, targetWidth = 320) => {
    if (!worker || busy) return null;
    const t0 = performance.now();
    const r = await detect(video, { targetWidth });
    if (r) return { descriptor: r.descriptor, workerMs: r.workerMs, grabMs: r.grabMs };
    // Busy / not grabbable before posting → null, as before; a timeout or a
    // worker error after posting → no descriptor (callers count it as a miss).
    if (!worker || !video.videoWidth) return null;
    return { descriptor: null, workerMs: Math.round(performance.now() - t0), grabMs: 0 };
  };

  const terminate = () => {
    pending.forEach((p) => { clearTimeout(p.timer); p.resolve(null); });
    pending.clear();
    try { worker?.terminate(); } catch { /* ignore */ }
    worker = null;
  };

  return { ready, describe, detect, terminate };
}
