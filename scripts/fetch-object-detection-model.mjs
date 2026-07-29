#!/usr/bin/env node
/**
 * Vendors everything the live object detector needs into public/:
 *
 *   public/models/object-detection/rf-detr-nano.onnx   (weights)
 *   public/ort/ort.webgpu.min.js + *.wasm/*.mjs        (onnxruntime-web runtime)
 *
 * See components/ai-interview/proctoring/OBJECT_DETECTION.md.
 *
 *   node scripts/fetch-object-detection-model.mjs                 # fp16, ~54 MB
 *   node scripts/fetch-object-detection-model.mjs --dtype q8      # ~28 MB
 *   node scripts/fetch-object-detection-model.mjs --dtype fp32    # ~108 MB
 *
 * Both are vendored same-origin rather than loaded from a CDN at runtime,
 * because this runs DURING a live interview: a CDN that is slow, blocked by the
 * candidate's network, or briefly down silently disables proctoring for that
 * session. That is not hypothetical — an earlier build loaded onnxruntime-web
 * from jsDelivr and a candidate's network blocked it, taking object detection
 * down for the whole interview with only one warning line to show for it.
 *
 * The weights are Apache-2.0 (Roboflow RF-DETR) — deliberately NOT the AGPL-3.0
 * Ultralytics YOLO family, since these ship to end users in a commercial app.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat, rename, unlink, copyFile, readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

// NOTE: underscores, not hyphens — `onnx-community/rf-detr-nano-ONNX` does not
// exist. Verified against the HF model index.
const REPO = 'onnx-community/rfdetr_nano-ONNX';
const DTYPE_FILES = {
  fp32: 'model.onnx',
  fp16: 'model_fp16.onnx',
  q8: 'model_quantized.onnx',
};

const ORT_VERSION = '1.27.0';
// ort.webgpu.min.js loads these siblings at runtime from the same directory.
const ORT_ASSETS = [
  'ort.webgpu.min.js',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
];

const dtypeArg = process.argv.indexOf('--dtype');
const dtype = dtypeArg !== -1 ? process.argv[dtypeArg + 1] : 'fp16';

const file = DTYPE_FILES[dtype];
if (!file) {
  console.error(`Unknown --dtype "${dtype}". Expected one of: ${Object.keys(DTYPE_FILES).join(', ')}`);
  process.exit(1);
}

const modelDir = path.resolve('public/models/object-detection');
const modelPath = path.join(modelDir, 'rf-detr-nano.onnx');
const ortDir = path.resolve('public/ort');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

/** Stream to .partial then rename, so an interrupted download never leaves a
 *  truncated file that fails at candidate runtime. */
async function download(url, dest) {
  const tmp = `${dest}.partial`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    await rename(tmp, dest);
    const { size } = await stat(dest);
    return size;
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

async function fetchModel() {
  await mkdir(modelDir, { recursive: true });

  if (await exists(modelPath)) {
    const { size } = await stat(modelPath);
    console.log(`✓ Model already present (${(size / 1e6).toFixed(1)} MB) — delete to re-download`);
    return;
  }

  const url = `https://huggingface.co/${REPO}/resolve/main/onnx/${file}?download=true`;
  console.log(`↓ Model: ${REPO} / ${file} (${dtype}) …`);
  const size = await download(url, modelPath);
  console.log(`✓ Model saved → ${path.relative(process.cwd(), modelPath)} (${(size / 1e6).toFixed(1)} MB)`);
}

/**
 * Vendor the ORT runtime. Prefer copying from node_modules (already a
 * dependency, so the version always matches package.json); fall back to the CDN
 * when node_modules isn't installed.
 */
async function fetchOrt() {
  await mkdir(ortDir, { recursive: true });

  const distDir = path.resolve('node_modules/onnxruntime-web/dist');
  const haveLocal = await exists(distDir);
  let localFiles = [];
  if (haveLocal) localFiles = await readdir(distDir);

  for (const asset of ORT_ASSETS) {
    const dest = path.join(ortDir, asset);
    if (await exists(dest)) {
      console.log(`✓ ORT ${asset} already present`);
      continue;
    }

    if (haveLocal && localFiles.includes(asset)) {
      await copyFile(path.join(distDir, asset), dest);
      const { size } = await stat(dest);
      console.log(`✓ ORT ${asset} copied from node_modules (${(size / 1e6).toFixed(1)} MB)`);
      continue;
    }

    const url = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/${asset}`;
    try {
      const size = await download(url, dest);
      console.log(`✓ ORT ${asset} downloaded (${(size / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      // The .wasm sibling names shift between ORT releases; a miss on one of
      // them is not fatal because the runtime resolves what it actually needs
      // relative to the .js. A miss on the .js itself is fatal.
      const fatal = asset.endsWith('.js');
      console[fatal ? 'error' : 'warn'](
        `${fatal ? '✗' : '!'} ORT ${asset}: ${err.message}`,
      );
      if (fatal) throw err;
    }
  }
}

async function main() {
  await fetchModel();
  await fetchOrt();

  console.log('\nDone. Next: load an interview in Chrome and confirm the console shows');
  console.log('  [INTERVIEW_OBJECT_DETECTION] Ready — webgpu, input 384px, labels coco91, ort /ort/...');
  console.log('If it says "Unavailable:", read the reason — that is the whole diagnosis.');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  console.error(`\nFetch the model manually from https://huggingface.co/${REPO}/tree/main/onnx`);
  console.error(`and save it as ${modelPath}`);
  process.exit(1);
});
