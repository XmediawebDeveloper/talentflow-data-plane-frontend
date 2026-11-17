'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import '@/lib/tfjs-rejection-guard';
import { ensureFaceApiCpuBackend, loadFaceApiWithCpuBackend, type FaceApiModule } from '@/lib/face-api-loader';
import { createFaceIdentityWorker } from '@/lib/proctoring/faceIdentityWorker';
import {
  createVideoFrameCanvas,
  FACE_API_MODEL_URLS,
  loadFaceApiNetWithFallback,
  MIN_CONFIDENT_FACE_SCORE,
  pickPrimaryFace,
} from '@/lib/proctoring/faceDetection';
import {
  clearAssessmentFaceBaseline,
  readAssessmentFaceBaseline,
  writeAssessmentFaceBaseline,
} from '@/lib/proctoring/assessmentFaceBaseline';

const REGISTRATION_CAPTURES = 3;
const CAPTURE_DELAY_MS = 1200;
const MISMATCH_THRESHOLD = 0.6;

interface UseAssessmentFaceBaselineResult {
  baselineReady: boolean;
  registerFace: (videoElement: HTMLVideoElement) => Promise<boolean>;
  verifyCurrentFace: (videoElement: HTMLVideoElement) => Promise<{ matched: boolean; distance: number } | null>;
  hasBaseline: () => boolean;
  clearBaseline: () => void;
}

export function useAssessmentFaceBaseline(token: string): UseAssessmentFaceBaselineResult {
  const faceApiRef = useRef<FaceApiModule | null>(null);
  const baselineDescriptorRef = useRef<Float32Array | null>(null);
  const loadPromiseRef = useRef<Promise<boolean> | null>(null);
  const isLoadedRef = useRef(false);
  const isDetectingRef = useRef(false);
  const [baselineReady, setBaselineReady] = useState(false);

  useEffect(() => {
    const stored = readAssessmentFaceBaseline(token);
    baselineDescriptorRef.current = stored?.descriptor ?? null;
    setBaselineReady(Boolean(stored?.descriptor));
  }, [token]);

  const ensureBackend = useCallback(async (faceapiOverride?: FaceApiModule | null): Promise<boolean> => {
    const faceapi = faceapiOverride ?? faceApiRef.current;
    if (!faceapi) return false;

    try {
      await ensureFaceApiCpuBackend(faceapi);
      return true;
    } catch (error) {
      console.warn('[AssessmentFaceBaseline] Failed to ensure face-api backend:', error);
      return false;
    }
  }, []);

  const loadModels = useCallback(async (): Promise<boolean> => {
    if (isLoadedRef.current && faceApiRef.current) return true;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      try {
        const faceapi = await loadFaceApiWithCpuBackend();
        faceApiRef.current = faceapi;

        const backendReady = await ensureBackend(faceapi);
        if (!backendReady) return false;

        await Promise.all([
          loadFaceApiNetWithFallback(faceapi.nets.tinyFaceDetector, FACE_API_MODEL_URLS),
          loadFaceApiNetWithFallback(faceapi.nets.faceLandmark68Net, FACE_API_MODEL_URLS),
          loadFaceApiNetWithFallback(faceapi.nets.faceRecognitionNet, FACE_API_MODEL_URLS),
        ]);

        const backendStillReady = await ensureBackend(faceapi);
        if (!backendStillReady) return false;

        isLoadedRef.current = true;
        return true;
      } catch (error) {
        faceApiRef.current = null;
        isLoadedRef.current = false;
        console.error('[AssessmentFaceBaseline] Failed to load face-api models:', error);
        return false;
      } finally {
        loadPromiseRef.current = null;
      }
    })();

    return loadPromiseRef.current;
  }, [ensureBackend]);

  const detectDescriptor = useCallback(async (videoElement: HTMLVideoElement): Promise<Float32Array | null> => {
    if (isDetectingRef.current) return null;

    const loaded = await loadModels();
    if (!loaded || !faceApiRef.current) return null;
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return null;
    if (typeof document !== 'undefined' && document.hidden) return null;

    isDetectingRef.current = true;
    try {
      const faceapi = faceApiRef.current;
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
      let frameWidth = videoElement.videoWidth;
      let frameHeight = videoElement.videoHeight;
      let usedSnapshot = false;
      let detections;

      try {
        detections = await faceapi
          .detectAllFaces(videoElement, options)
          .withFaceLandmarks()
          .withFaceDescriptors();
      } catch (videoError) {
        const snapshot = createVideoFrameCanvas(videoElement);
        if (!snapshot) {
          throw videoError;
        }
        detections = await faceapi
          .detectAllFaces(snapshot, options)
          .withFaceLandmarks()
          .withFaceDescriptors();
        frameWidth = snapshot.width;
        frameHeight = snapshot.height;
        usedSnapshot = true;
      }

      if (!detections.length && !usedSnapshot) {
        const snapshot = createVideoFrameCanvas(videoElement);
        if (snapshot) {
          detections = await faceapi
            .detectAllFaces(snapshot, options)
            .withFaceLandmarks()
            .withFaceDescriptors();
          frameWidth = snapshot.width;
          frameHeight = snapshot.height;
        }
      }

      const typedDetections = detections as Array<{
        detection: {
          box: { x: number; y: number; width: number; height: number };
          score?: number;
        };
        descriptor: Float32Array;
      }>;
      const confidentDetections = typedDetections.filter((detection) => {
        const score = detection.detection?.score;
        return typeof score !== 'number' || score >= MIN_CONFIDENT_FACE_SCORE;
      });
      const primaryDetection = pickPrimaryFace(
        confidentDetections,
        (detection) => {
          const box = detection.detection?.box;
          return box
            ? {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                score: detection.detection?.score,
              }
            : null;
        },
        frameWidth,
        frameHeight,
      );

      return primaryDetection?.descriptor ?? null;
    } catch (error) {
      console.warn('[AssessmentFaceBaseline] Face descriptor extraction failed:', error);
      return null;
    } finally {
      isDetectingRef.current = false;
    }
  }, [loadModels]);

  const registerFace = useCallback(async (videoElement: HTMLVideoElement): Promise<boolean> => {
    const descriptors: Float32Array[] = [];
    // 2026-09-24: the three registration captures ran face-api on the CPU
    // backend ON THE MAIN THREAD (5-8 s each on slow laptops) right as the
    // coding-language picker appeared - the "cannot click anything for a
    // while" hang after System Check. They now run in the identity Web Worker
    // (same descriptors, same model); the main thread only grabs frames.
    // Main-thread fallback (worker unavailable) takes a single capture.
    const worker = createFaceIdentityWorker({ modelUrls: FACE_API_MODEL_URLS, inputSize: 224 });
    let usedWorker = false;
    try {
      const ready = await Promise.race([
        worker.ready,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25000)),
      ]);
      if (ready) {
        usedWorker = true;
        for (let index = 0; index < REGISTRATION_CAPTURES; index += 1) {
          if (index > 0) await new Promise((resolve) => setTimeout(resolve, CAPTURE_DELAY_MS));
          if (videoElement.readyState < 2 || videoElement.videoWidth === 0) continue;
          const result = await worker.describe(videoElement, 320);
          if (result?.descriptor) descriptors.push(result.descriptor);
        }
      }
    } catch (error) {
      console.warn('[AssessmentFaceBaseline] worker registration failed, falling back to main thread:', error);
    } finally {
      worker.terminate();
    }
    if (!usedWorker) {
      const descriptor = await detectDescriptor(videoElement);
      if (descriptor) descriptors.push(descriptor);
    }

    if (descriptors.length === 0) {
      console.warn('[AssessmentFaceBaseline] No face descriptor captured during registration');
      return false;
    }

    const average = new Float32Array(descriptors[0].length);
    for (const descriptor of descriptors) {
      for (let i = 0; i < descriptor.length; i += 1) {
        average[i] += descriptor[i];
      }
    }
    for (let i = 0; i < average.length; i += 1) {
      average[i] /= descriptors.length;
    }

    baselineDescriptorRef.current = average;
    writeAssessmentFaceBaseline(token, average, 'system_check');
    setBaselineReady(true);
    return true;
  }, [detectDescriptor, token]);

  const verifyCurrentFace = useCallback(async (
    videoElement: HTMLVideoElement,
  ): Promise<{ matched: boolean; distance: number } | null> => {
    const baseline = baselineDescriptorRef.current;
    if (!baseline) return null;

    const loaded = await loadModels();
    const faceapi = faceApiRef.current;
    if (!loaded || !faceapi) return null;

    const descriptor = await detectDescriptor(videoElement);
    if (!descriptor) return null;

    const distance = faceapi.euclideanDistance(Array.from(baseline), Array.from(descriptor));
    return { matched: distance < MISMATCH_THRESHOLD, distance };
  }, [detectDescriptor]);

  const hasBaseline = useCallback(() => baselineDescriptorRef.current !== null, []);

  const clearBaseline = useCallback(() => {
    baselineDescriptorRef.current = null;
    clearAssessmentFaceBaseline(token);
    setBaselineReady(false);
  }, [token]);

  return {
    baselineReady,
    registerFace,
    verifyCurrentFace,
    hasBaseline,
    clearBaseline,
  };
}
