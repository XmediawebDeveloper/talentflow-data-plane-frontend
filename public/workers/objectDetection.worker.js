/**
 * Object Detection Web Worker — live "prohibited object" proctoring.
 *
 * Runs an RF-DETR-Nano ONNX model via onnxruntime-web entirely off the main
 * thread. The main thread is already saturated during an AI interview
 * (MediaPipe FaceDetection @1.5s + FaceMesh @2s + face-api verification @10s +
 * the TalkingHead avatar + MediaRecorder), so inference MUST NOT run there —
 * that is the whole reason this is a worker and not another main-thread hook
 * like InterviewFaceDetection.
 *
 * Contract
 * --------
 *   → { type: 'init', modelUrl, ortUrl, inputSize, watchedLabels, scoreFloor }
 *   ← { type: 'ready', backend, inputSize, labelSpace }
 *   ← { type: 'init-failed', error }
 *
 *   → { type: 'detect', bitmap: ImageBitmap, frameId }   (bitmap transferred)
 *   ← { type: 'detections', frameId, detections: [...], inferenceMs }
 *
 *   → { type: 'dispose' }
 *
 * Each detection: { label, score, box: [x, y, w, h] }  — box normalised 0–1.
 * `label` is the model's EXACT COCO class string; the hook maps it to a
 * recruiter-facing name. Nothing here ever emits a generic "object".
 *
 * WebGPU only, by design
 * ----------------------
 * RF-DETR is a Deformable-DETR derivative. Deformable attention is a known
 * pathological case for onnxruntime-web's WASM path (microsoft/onnxruntime
 * #22425 reports ~12 s/frame), which would be far worse than useless in a live
 * interview. If WebGPU is unavailable we fail init cleanly and the hook stays
 * dormant rather than silently degrading to a multi-second CPU stall.
 */

/* eslint-disable no-restricted-globals */

// ── COCO label spaces ──────────────────────────────────────────────────────
// DETR-family exports ship in BOTH the 80-class contiguous space and the
// 91-class sparse space. Guessing wrong shifts every class by a few indices —
// `cell phone` silently becomes `microwave`, and the recruiter sees a
// confidently-labelled lie. We pick the space from the model's actual class
// dimension at init (see resolveLabelSpace) instead of assuming.
const COCO_80 = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
  'toothbrush',
];

const NA = 'N/A';
const COCO_91 = [
  NA, 'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', NA, 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', NA, 'backpack',
  'umbrella', NA, NA, 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard',
  'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', NA, 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl',
  'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
  'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', NA, 'dining table', NA, NA,
  'toilet', NA, 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave',
  'oven', 'toaster', 'sink', 'refrigerator', NA, 'book', 'clock', 'vase', 'scissors',
  'teddy bear', 'hair drier', 'toothbrush',
];

// DINOv2-style backbone → ImageNet normalisation.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// ── State ──────────────────────────────────────────────────────────────────
let ort = null;
let session = null;
let inputName = null;
let inputSize = 384;
let labels = COCO_91;
let watched = new Set();
let scoreFloor = 0.4;
let canvas = null;
let ctx = null;
let disposed = false;

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Decide which COCO label space the model uses from its class dimension.
 * 80/81 → contiguous space; 90/91/92 → sparse space. Anything else is a custom
 * fine-tune, in which case we return null and the caller reports the ids
 * verbatim rather than inventing names for them.
 */
function resolveLabelSpace(numClasses) {
  if (numClasses === 80 || numClasses === 81) return { labels: COCO_80, name: 'coco80' };
  if (numClasses >= 90 && numClasses <= 92) return { labels: COCO_91, name: 'coco91' };
  return { labels: null, name: `custom-${numClasses}` };
}

/** Letterbox-free resize into an inputSize² NCHW float tensor. */
function preprocess(bitmap) {
  if (!canvas) {
    canvas = new OffscreenCanvas(inputSize, inputSize);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (canvas.width !== inputSize || canvas.height !== inputSize) {
    canvas.width = inputSize;
    canvas.height = inputSize;
  }

  // Stretch to square. RF-DETR is trained with aspect-distorting resize, and
  // keeping it simple avoids a letterbox offset that would have to be undone
  // in every box coordinate downstream.
  ctx.drawImage(bitmap, 0, 0, inputSize, inputSize);
  const { data } = ctx.getImageData(0, 0, inputSize, inputSize);

  const area = inputSize * inputSize;
  const out = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    const p = i * 4;
    out[i] = (data[p] / 255 - MEAN[0]) / STD[0];                 // R plane
    out[area + i] = (data[p + 1] / 255 - MEAN[1]) / STD[1];      // G plane
    out[2 * area + i] = (data[p + 2] / 255 - MEAN[2]) / STD[2];  // B plane
  }
  return new ort.Tensor('float32', out, [1, 3, inputSize, inputSize]);
}

/**
 * Locate the logits [1, Q, C] and boxes [1, Q, 4] tensors by SHAPE rather than
 * by name — RF-DETR exports have used `logits`/`pred_logits` and
 * `boxes`/`pred_boxes` across versions, and shape is the stable signal.
 */
function findOutputs(results) {
  let logits = null;
  let boxes = null;
  for (const key of Object.keys(results)) {
    const t = results[key];
    if (!t || !t.dims || t.dims.length !== 3) continue;
    if (t.dims[2] === 4 && !boxes) boxes = t;
    else if (t.dims[2] !== 4 && !logits) logits = t;
  }
  return { logits, boxes };
}

/**
 * DETR-style decode. RF-DETR is trained with focal loss, so per-class scores
 * are independent sigmoids — NOT a softmax over classes, and there is no
 * background class to strip. There is also no NMS: the set-prediction training
 * objective already yields one query per object.
 */
function postprocess(logits, boxes) {
  const [, numQueries, numClasses] = logits.dims;
  const L = logits.data;
  const B = boxes.data;
  const detections = [];

  for (let q = 0; q < numQueries; q++) {
    // Best class for this query.
    let bestClass = -1;
    let bestLogit = -Infinity;
    const base = q * numClasses;
    for (let c = 0; c < numClasses; c++) {
      const v = L[base + c];
      if (v > bestLogit) { bestLogit = v; bestClass = c; }
    }

    const score = sigmoid(bestLogit);
    if (score < scoreFloor) continue;

    const label = labels ? labels[bestClass] : null;
    // Discard anything outside the allowlist here, in the worker, so the main
    // thread never even sees the ~75 classes we don't act on.
    if (!label || label === NA || !watched.has(label)) continue;

    // cxcywh (normalised) → xywh (normalised)
    const o = q * 4;
    const cx = B[o], cy = B[o + 1], w = B[o + 2], h = B[o + 3];
    detections.push({
      label,
      score,
      box: [cx - w / 2, cy - h / 2, w, h],
    });
  }

  // Strongest first — the hook only acts on the top detection per class.
  detections.sort((a, b) => b.score - a.score);
  return detections;
}

async function init(msg) {
  inputSize = msg.inputSize || 384;
  watched = new Set(msg.watchedLabels || []);
  scoreFloor = typeof msg.scoreFloor === 'number' ? msg.scoreFloor : 0.4;

  if (!self.navigator || !self.navigator.gpu) {
    throw new Error(
      'WebGPU unavailable. RF-DETR uses deformable attention, which is ' +
      'pathologically slow on the onnxruntime-web WASM backend — refusing to ' +
      'run rather than stalling the interview.',
    );
  }

  // eslint-disable-next-line no-undef
  importScripts(msg.ortUrl);
  ort = self.ort;
  if (!ort) throw new Error('onnxruntime-web global not found after importScripts');

  // Serve the ORT .wasm/.mjs siblings from the same directory as the bundle.
  ort.env.wasm.wasmPaths = msg.ortUrl.slice(0, msg.ortUrl.lastIndexOf('/') + 1);
  ort.env.wasm.numThreads = 1; // WebGPU does the work; threads would only add contention

  session = await ort.InferenceSession.create(msg.modelUrl, {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all',
  });
  inputName = session.inputNames[0];

  // Prefer the model's own static input resolution when the export pins one —
  // RF-DETR resolutions are constrained (multiples of the patch size), so a
  // mismatched guess produces a shape error or silent garbage.
  try {
    const meta = session.inputMetadata;
    const dims = meta && (Array.isArray(meta) ? meta[0]?.shape : meta[inputName]?.dimensions);
    if (Array.isArray(dims) && dims.length === 4) {
      const h = dims[2];
      if (typeof h === 'number' && h > 0) inputSize = h;
    }
  } catch {
    // Metadata shape is advisory; the configured default already works.
  }

  // One warm-up pass. The first WebGPU run pays shader compilation (hundreds of
  // ms); doing it at init keeps it out of the first real detection window.
  let labelSpace = 'unknown';
  try {
    const zeros = new ort.Tensor(
      'float32', new Float32Array(3 * inputSize * inputSize), [1, 3, inputSize, inputSize],
    );
    const out = await session.run({ [inputName]: zeros });
    const { logits } = findOutputs(out);
    if (logits) {
      const resolved = resolveLabelSpace(logits.dims[2]);
      labels = resolved.labels;
      labelSpace = resolved.name;
    }
  } catch (e) {
    // A warm-up failure is not fatal — the real frames may still run.
    labelSpace = `warmup-failed: ${e && e.message ? e.message : e}`;
  }

  self.postMessage({ type: 'ready', backend: 'webgpu', inputSize, labelSpace });
}

async function detect(msg) {
  const bitmap = msg.bitmap;
  if (!session || disposed) { bitmap.close(); return; }

  const t0 = performance.now();
  try {
    const tensor = preprocess(bitmap);
    const results = await session.run({ [inputName]: tensor });
    const { logits, boxes } = findOutputs(results);
    const detections = logits && boxes ? postprocess(logits, boxes) : [];
    self.postMessage({
      type: 'detections',
      frameId: msg.frameId,
      detections,
      inferenceMs: performance.now() - t0,
    });
  } catch (e) {
    self.postMessage({
      type: 'detect-failed',
      frameId: msg.frameId,
      error: e && e.message ? e.message : String(e),
    });
  } finally {
    bitmap.close(); // never leak the transferred bitmap
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'init') {
    try {
      await init(msg);
    } catch (err) {
      self.postMessage({
        type: 'init-failed',
        error: err && err.message ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === 'detect') { await detect(msg); return; }

  if (msg.type === 'dispose') {
    disposed = true;
    try { session && session.release && session.release(); } catch {}
    session = null;
    canvas = null;
    ctx = null;
  }
};
