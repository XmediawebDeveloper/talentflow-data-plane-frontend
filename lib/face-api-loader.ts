'use client';

/**
 * Shared face-api.js loader that pins TF.js to the CPU backend.
 *
 * Why CPU?
 * face-api.js 0.20 / TF.js 1.x intermittently crashes on WebGL with
 * "Cannot read properties of undefined (reading 'backend')" when tabs are
 * hidden, the device sleeps, or a component unmounts mid-inference.
 *
 * Our face-detection workload is light enough that CPU is the better tradeoff:
 * slightly slower inference, but dramatically more stable across browsers and
 * laptop power-state changes.
 */

export type FaceApiModule = typeof import('face-api.js');

type TfLike = {
  ready?: () => Promise<unknown>;
  getBackend?: () => string;
  setBackend?: (backendName: string) => unknown;
  tensor1d?: (values: number[]) => { dispose?: () => void };
};

let faceApiPromise: Promise<FaceApiModule> | null = null;
let backendReadyPromise: Promise<void> | null = null;

export async function ensureFaceApiCpuBackend(faceapi: FaceApiModule): Promise<void> {
  const tf = (faceapi as { tf?: TfLike } | null)?.tf;
  if (!tf) return;

  if (typeof tf.ready === 'function') {
    try {
      await tf.ready();
    } catch {
      // Continue — some builds still recover fine after setBackend().
    }
  }

  let backendName = '';
  try {
    backendName = typeof tf.getBackend === 'function' ? String(tf.getBackend() || '') : '';
  } catch {
    backendName = '';
  }

  if (backendName !== 'cpu' && typeof tf.setBackend === 'function') {
    await Promise.resolve(tf.setBackend('cpu'));
    backendName = typeof tf.getBackend === 'function' ? String(tf.getBackend() || '') : 'cpu';
  }

  if (!backendName) {
    throw new Error('TF backend unavailable after CPU pin');
  }

  // Probe once so a broken backend fails here, not deep inside a later
  // detectAllFaces/detectSingleFace call.
  const probe = typeof tf.tensor1d === 'function' ? tf.tensor1d([0]) : null;
  probe?.dispose?.();
}

export async function loadFaceApiWithCpuBackend(): Promise<FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = import('face-api.js');
  }

  const faceapi = await faceApiPromise;
  if (!backendReadyPromise) {
    backendReadyPromise = ensureFaceApiCpuBackend(faceapi).catch((err) => {
      backendReadyPromise = null;
      throw err;
    });
  }
  await backendReadyPromise;
  return faceapi;
}
