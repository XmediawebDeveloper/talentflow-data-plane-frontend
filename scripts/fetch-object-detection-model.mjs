#!/usr/bin/env node
/**
 * Vendors the RF-DETR-Nano ONNX weights used by the live object detector
 * (components/ai-interview/proctoring/InterviewObjectDetection.ts) into
 * public/models/object-detection/.
 *
 *   node scripts/fetch-object-detection-model.mjs            # fp16 (default)
 *   node scripts/fetch-object-detection-model.mjs --dtype q8 # smaller, faster download
 *
 * Why vendored and not loaded from a CDN at runtime:
 *   - The candidate downloads this DURING an interview. A third-party CDN
 *     hiccup would silently disable proctoring for that session.
 *   - Same-origin keeps it inside the app's CSP.
 *   - The file is content-stable, so the immutable /_next-style caching the app
 *     already applies makes it a one-time cost per candidate.
 *
 * The weights are Apache-2.0 (Roboflow RF-DETR) — deliberately NOT the AGPL-3.0
 * Ultralytics YOLO family, since these ship to end users in a commercial app.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat, rename, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const REPO = 'onnx-community/rf-detr-nano-ONNX';
const DTYPE_FILES = {
  fp32: 'model.onnx',
  fp16: 'model_fp16.onnx',
  q8: 'model_quantized.onnx',
};

const dtypeArg = process.argv.indexOf('--dtype');
const dtype = dtypeArg !== -1 ? process.argv[dtypeArg + 1] : 'fp16';

const file = DTYPE_FILES[dtype];
if (!file) {
  console.error(`Unknown --dtype "${dtype}". Expected one of: ${Object.keys(DTYPE_FILES).join(', ')}`);
  process.exit(1);
}

const url = `https://huggingface.co/${REPO}/resolve/main/onnx/${file}?download=true`;
const outDir = path.resolve('public/models/object-detection');
const outPath = path.join(outDir, 'rf-detr-nano.onnx');
const tmpPath = `${outPath}.partial`;

async function main() {
  await mkdir(outDir, { recursive: true });

  try {
    const existing = await stat(outPath);
    console.log(`Already present: ${outPath} (${(existing.size / 1e6).toFixed(1)} MB)`);
    console.log('Delete it first if you want to re-download or switch dtype.');
    return;
  } catch {
    // not present — download it
  }

  console.log(`Downloading ${REPO} / ${file} (${dtype}) …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  // Stream to a .partial file and rename only on success, so an interrupted
  // download can never leave a truncated .onnx that fails at candidate runtime.
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpPath));
  await rename(tmpPath, outPath);

  const { size } = await stat(outPath);
  console.log(`Saved ${outPath} (${(size / 1e6).toFixed(1)} MB)`);
  console.log('\nMeasure before shipping: load an interview in Chrome and check the');
  console.log('[INTERVIEW_OBJECT_DETECTION] console lines for backend + inference timing.');
}

main().catch(async (err) => {
  await unlink(tmpPath).catch(() => {});
  console.error('Download failed:', err.message);
  console.error(`\nFetch it manually from https://huggingface.co/${REPO}/tree/main/onnx`);
  console.error(`and save it as ${outPath}`);
  process.exit(1);
});
