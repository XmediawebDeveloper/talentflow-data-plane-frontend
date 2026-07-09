'use client';

/**
 * InterviewFaceVerification — Face identity registration and continuous verification.
 *
 * Uses face-api.js (already in package.json) with:
 * - tiny_face_detector (already in /public/models/)
 * - face_landmark_68_model (needs to be present in /public/models/)
 * - face_recognition_model (needs to be present in /public/models/)
 *
 * During system check: captures 3 face descriptors and averages them into a baseline.
 * During interview: every 10s, extracts a descriptor and compares with baseline.
 *
 * Thresholds (euclidean distance):
 *   < 0.6 = same person
 *   0.6-0.8 = warning (face_mismatch)
 *   > 0.8 = different person (face_identity_changed)
 */

import { useRef, useCallback, useState } from 'react';
// Side-effect import: installs the global unhandledrejection guard for
// face-api.js / TF.js WebGL backend crashes. Safe to import anywhere.
import '@/lib/tfjs-rejection-guard';
import { ensureFaceApiCpuBackend, loadFaceApiWithCpuBackend, type FaceApiModule } from '@/lib/face-api-loader';

interface FaceVerificationCallbacks {
  onFaceMismatch?: (distance: number) => void;
  onFaceIdentityChanged?: (distance: number) => void;
}

// Models are self-hosted under /public/models/ (tiny_face_detector,
// face_landmark_68, face_recognition) — loading from the CDN caused
// intermittent enrollment failures when jsdelivr was slow or blocked by a
// candidate's network (15 s timeout → no baseline → face verification never
// starts → no events ever fire, face proctoring appears completely broken).
// '/models' is served by Next.js from the public/ folder.
const MODELS_URL = '/models';
const VERIFICATION_INTERVAL_MS = 10000; // 10 seconds
const MISMATCH_THRESHOLD = 0.6;
const IDENTITY_CHANGED_THRESHOLD = 0.8;
// Require this many CONSECUTIVE readings in the same band before emitting — a
// single bad frame (blur, head-turn, lighting) must not accuse the candidate.
const FACE_CONSECUTIVE_TO_FLAG = 2;
const REGISTRATION_CAPTURES = 3;
const CAPTURE_DELAY_MS = 1500; // delay between registration captures

// Global TF.js/face-api rejection guard lives in @/lib/tfjs-rejection-guard
// (imported at the top of this file as a side effect). Idempotent and safe
// to import from every face-api caller.

export function useInterviewFaceVerification(callbacks?: FaceVerificationCallbacks) {
  const faceApiRef = useRef<FaceApiModule | null>(null);
  const baselineDescriptorRef = useRef<Float32Array | null>(null);
  const verificationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadedRef = useRef(false);
  const loadPromiseRef = useRef<Promise<boolean> | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const isDetectingRef = useRef(false); // guard against concurrent TF.js calls
  const verificationActiveRef = useRef(false);
  const [baselineReady, setBaselineReady] = useState(false);

  const isTfjsBackendError = useCallback((err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return (
      msg.includes("reading 'backend'") ||
      msg.includes("reading 'moveData'") ||
      msg.includes('backend') ||
      msg.includes('moveData') ||
      msg.includes('WebGL') ||
      msg.includes('context')
    );
  }, []);

  const ensureFaceApiBackend = useCallback(async (faceapiOverride?: FaceApiModule | null): Promise<boolean> => {
    const faceapi = faceapiOverride ?? faceApiRef.current;
    try {
      if (!faceapi) return true;
      await ensureFaceApiCpuBackend(faceapi);
      return true;
    } catch (err) {
      console.warn('[FaceVerification] Failed to ensure TF backend readiness:', err);
      return false;
    }
  }, []);

  const detectFaceWithDescriptor = useCallback(async (
    input: HTMLVideoElement | HTMLImageElement,
    scoreThreshold: number,
  ) => {
    const faceapi = faceApiRef.current;
    if (!faceapi) return null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const backendReady = await ensureFaceApiBackend(faceapi);
      if (!backendReady) return null;
      try {
        if (!verificationActiveRef.current && input === videoElementRef.current) return null;
        return await Promise.resolve(
          faceapi
            .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold }))
            .withFaceLandmarks()
            .withFaceDescriptor()
        );
      } catch (err) {
        if (isTfjsBackendError(err) && attempt === 0) {
          console.warn('[FaceVerification] TF.js backend crashed during detectSingleFace — retrying after backend recovery');
          continue;
        }
        if (!isTfjsBackendError(err)) {
          console.warn('[FaceVerification] detectSingleFace failed:', err);
        }
        return null;
      }
    }

    return null;
  }, [ensureFaceApiBackend, isTfjsBackendError]);

  /**
   * Load face-api.js models (lazy — only when face verification is needed).
   */
  const loadModels = useCallback(async (): Promise<boolean> => {
    if (isLoadedRef.current && faceApiRef.current) return true;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      try {
        const faceapi = await loadFaceApiWithCpuBackend();
        faceApiRef.current = faceapi;
        const backendReady = await ensureFaceApiBackend(faceapi);
        if (!backendReady) {
          console.error('[FaceVerification] Failed to initialize TF backend before model load');
          return false;
        }

        // Timeout after 15s to prevent indefinite hang
        const loadPromise = Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
        ]);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Model loading timed out')), 15000)
        );
        await Promise.race([loadPromise, timeoutPromise]);
        const backendStillReady = await ensureFaceApiBackend(faceapi);
        if (!backendStillReady) {
          console.error('[FaceVerification] TF backend unavailable after model load');
          return false;
        }

        isLoadedRef.current = true;
        console.log('[FaceVerification] Models loaded successfully', {
          backend: typeof faceapi.tf?.getBackend === 'function' ? faceapi.tf.getBackend() : 'unknown',
        });
        return true;
      } catch (err) {
        faceApiRef.current = null;
        isLoadedRef.current = false;
        console.error('[FaceVerification] Failed to load models:', err);
        return false;
      } finally {
        loadPromiseRef.current = null;
      }
    })();

    return loadPromiseRef.current;
  }, []);

  /**
   * Extract a face descriptor from the current video frame.
   *
   * Guards against:
   *  - Concurrent TF.js calls (isDetectingRef lock).
   *  - Page hidden / WebGL context suspended — tensor ops fail with
   *    "Cannot read properties of undefined (reading 'backend')" because
   *    the TF.js backend is reset on context loss.
   *  - Un-awaited internal tensor tasks that surface as
   *    "Uncaught (in promise)" — we swap them onto the current async
   *    context by chaining .catch() on the raw promise.
   */
  const extractDescriptor = useCallback(async (): Promise<Float32Array | null> => {
    if (isDetectingRef.current) return null;
    const faceapi = faceApiRef.current;
    const video = videoElementRef.current;
    if (!faceapi || !video || !verificationActiveRef.current || video.paused || video.videoWidth === 0) return null;
    // Skip when tab is hidden — the WebGL context may have been
    // suspended/lost and the next tensor call will throw.
    if (typeof document !== 'undefined' && document.hidden) return null;

    isDetectingRef.current = true;
    try {
      const detection = await detectFaceWithDescriptor(video, 0.5);
      return (detection && (detection as { descriptor?: Float32Array }).descriptor) || null;
    } catch (err) {
      if (!isTfjsBackendError(err)) {
        console.warn('[FaceVerification] extractDescriptor outer error:', err);
      }
      return null;
    } finally {
      isDetectingRef.current = false;
    }
  }, [detectFaceWithDescriptor, isTfjsBackendError]);

  /**
   * Register the candidate's face from an image Blob (e.g. the identity photo).
   * Preferred over registerFace() — uses the verified identity image rather than live video.
   *
   * @param blob - Image blob (photo captured during identity verification)
   * @returns true if registration succeeded
   */
  const registerFaceFromBlob = useCallback(async (blob: Blob): Promise<boolean> => {
    const loaded = await loadModels();
    if (!loaded) return false;

    const faceapi = faceApiRef.current;
    if (!faceapi) return false;

    // Wait for any in-flight TF.js detection to finish, then claim the lock.
    // Concurrent WebGL calls corrupt the shared TF.js backend (tensor.backend → undefined → moveData crash).
    const deadline = Date.now() + 3000;
    while (isDetectingRef.current && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (isDetectingRef.current) return false; // still busy after timeout — skip

    isDetectingRef.current = true; // claim lock so extractDescriptor/startVerification waits
    try {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      try {
        await img.decode?.();
      } catch {
        // decode() is not available or needed in some browsers.
      }

      const detection = await detectFaceWithDescriptor(img, 0.4);
      URL.revokeObjectURL(url);

      if (!detection?.descriptor) {
        console.warn('[FaceVerification] No face detected in identity photo');
        return false;
      }

      baselineDescriptorRef.current = detection.descriptor;
      setBaselineReady(true);
      console.log('[FaceVerification] Face baseline registered from identity photo');
      return true;
    } catch (err) {
      console.error('[FaceVerification] registerFaceFromBlob failed:', err);
      return false;
    } finally {
      isDetectingRef.current = false; // release lock
    }
  }, [loadModels]);

  /**
   * Verify the current video frame against the registered baseline.
   * Used at system check to confirm the person in front of the camera matches identity.
   *
   * @param videoElement - The video element showing the webcam feed
   * @returns { matched, distance } or null if baseline/models not ready
   */
  const verifyCurrentFace = useCallback(async (
    videoElement: HTMLVideoElement,
  ): Promise<{ matched: boolean; distance: number } | null> => {
    const faceapi = faceApiRef.current;
    if (!faceapi || !baselineDescriptorRef.current) return null;

    videoElementRef.current = videoElement;
    const previousActive = verificationActiveRef.current;
    verificationActiveRef.current = true;
    try {
      const descriptor = await extractDescriptor();
      if (!descriptor) return null;

      const distance = faceapi.euclideanDistance(
        Array.from(baselineDescriptorRef.current),
        Array.from(descriptor),
      );

      return { matched: distance < MISMATCH_THRESHOLD, distance };
    } finally {
      verificationActiveRef.current = previousActive;
    }
  }, [extractDescriptor]);

  /**
   * Register the candidate's face during system check.
   * Captures multiple descriptors and averages them for a robust baseline.
   * Prefer registerFaceFromBlob() when the identity photo is available.
   *
   * @param videoElement - The video element showing the webcam feed
   * @returns true if registration succeeded
   */
  const registerFace = useCallback(async (videoElement: HTMLVideoElement): Promise<boolean> => {
    videoElementRef.current = videoElement;
    const previousActive = verificationActiveRef.current;
    verificationActiveRef.current = true;

    const loaded = await loadModels();
    if (!loaded) {
      verificationActiveRef.current = previousActive;
      return false;
    }

    try {
      const descriptors: Float32Array[] = [];

      for (let i = 0; i < REGISTRATION_CAPTURES; i++) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY_MS));
        }

        const descriptor = await extractDescriptor();
        if (descriptor) {
          descriptors.push(descriptor);
          console.log(`[FaceVerification] Registration capture ${i + 1}/${REGISTRATION_CAPTURES}`);
        }
      }

      if (descriptors.length === 0) {
        console.warn('[FaceVerification] No face detected during registration');
        return false;
      }

      // Average all captured descriptors
      const avg = new Float32Array(descriptors[0].length);
      for (const d of descriptors) {
        for (let i = 0; i < d.length; i++) {
          avg[i] += d[i];
        }
      }
      for (let i = 0; i < avg.length; i++) {
        avg[i] /= descriptors.length;
      }

      baselineDescriptorRef.current = avg;
      setBaselineReady(true);
      console.log(`[FaceVerification] Face registered (${descriptors.length} captures averaged)`);
      return true;
    } finally {
      verificationActiveRef.current = previousActive;
    }
  }, [loadModels, extractDescriptor]);

  /**
   * Start continuous face verification during the interview.
   *
   * @param videoElement - The video element showing the webcam feed
   */
  const startVerification = useCallback((videoElement: HTMLVideoElement, intervalMs: number = VERIFICATION_INTERVAL_MS) => {
    videoElementRef.current = videoElement;
    verificationActiveRef.current = true;

    if (!baselineDescriptorRef.current) {
      verificationActiveRef.current = false;
      console.warn('[FaceVerification] Cannot start verification — no baseline registered');
      return;
    }

    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
    }

    const faceapi = faceApiRef.current;
    if (!faceapi) {
      verificationActiveRef.current = false;
      return;
    }

    // Consecutive-agreement debounce (local to this run; reset on stop/restart).
    let mismatchStreak = 0;
    let changedStreak = 0;

    verificationIntervalRef.current = setInterval(async () => {
      try {
        const descriptor = await extractDescriptor();
        if (!descriptor || !baselineDescriptorRef.current) return;

        const distance = faceapi.euclideanDistance(
          Array.from(baselineDescriptorRef.current),
          Array.from(descriptor),
        );

        if (distance > IDENTITY_CHANGED_THRESHOLD) {
          changedStreak += 1;
          mismatchStreak = 0;
          if (changedStreak >= FACE_CONSECUTIVE_TO_FLAG) {
            console.warn(`[FaceVerification] IDENTITY CHANGED — distance: ${distance.toFixed(3)} (x${changedStreak})`);
            callbacks?.onFaceIdentityChanged?.(distance);
          }
        } else if (distance > MISMATCH_THRESHOLD) {
          mismatchStreak += 1;
          changedStreak = 0;
          if (mismatchStreak >= FACE_CONSECUTIVE_TO_FLAG) {
            console.warn(`[FaceVerification] MISMATCH — distance: ${distance.toFixed(3)} (x${mismatchStreak})`);
            callbacks?.onFaceMismatch?.(distance);
          }
        } else {
          // Clearly the same person — reset streaks.
          mismatchStreak = 0;
          changedStreak = 0;
        }
      } catch (err) {
        // Swallow TF.js backend errors (tensor disposal, WebGL context loss) so
        // a single bad frame does not halt continuous verification.
        console.warn('[FaceVerification] Verification frame skipped:', err);
      }
    }, intervalMs);

    console.log(`[FaceVerification] Continuous verification started (every ${Math.round(intervalMs / 1000)}s)`);
  }, [extractDescriptor, callbacks]);

  /**
   * Stop verification and clean up.
   */
  const stopVerification = useCallback(() => {
    verificationActiveRef.current = false;
    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
      verificationIntervalRef.current = null;
    }
  }, []);

  /**
   * Check if a baseline face has been registered.
   */
  const hasBaseline = useCallback(() => {
    return baselineDescriptorRef.current !== null;
  }, []);

  return {
    registerFace,
    registerFaceFromBlob,
    verifyCurrentFace,
    startVerification,
    stopVerification,
    hasBaseline,
    baselineReady,
    baselineDescriptorRef,
  };
}
