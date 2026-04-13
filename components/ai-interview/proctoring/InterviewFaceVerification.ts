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

import { useRef, useCallback } from 'react';

// face-api.js types (dynamically loaded)
type FaceApiModule = typeof import('face-api.js');

interface FaceVerificationCallbacks {
  onFaceMismatch?: (distance: number) => void;
  onFaceIdentityChanged?: (distance: number) => void;
}

const MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const VERIFICATION_INTERVAL_MS = 10000; // 10 seconds
const MISMATCH_THRESHOLD = 0.6;
const IDENTITY_CHANGED_THRESHOLD = 0.8;
const REGISTRATION_CAPTURES = 3;
const CAPTURE_DELAY_MS = 1500; // delay between registration captures

export function useInterviewFaceVerification(callbacks?: FaceVerificationCallbacks) {
  const faceApiRef = useRef<FaceApiModule | null>(null);
  const baselineDescriptorRef = useRef<Float32Array | null>(null);
  const verificationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadedRef = useRef(false);
  const loadPromiseRef = useRef<Promise<boolean> | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const isDetectingRef = useRef(false); // guard against concurrent TF.js calls

  /**
   * Load face-api.js models (lazy — only when face verification is needed).
   */
  const loadModels = useCallback(async (): Promise<boolean> => {
    if (isLoadedRef.current && faceApiRef.current) return true;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      try {
        const faceapi = await import('face-api.js');
        faceApiRef.current = faceapi;

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

        isLoadedRef.current = true;
        console.log('[FaceVerification] Models loaded successfully');
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
   */
  const extractDescriptor = useCallback(async (): Promise<Float32Array | null> => {
    if (isDetectingRef.current) return null; // skip if a detection is already in flight
    const faceapi = faceApiRef.current;
    const video = videoElementRef.current;
    if (!faceapi || !video || video.paused || video.videoWidth === 0) return null;

    isDetectingRef.current = true;
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      return detection?.descriptor || null;
    } catch {
      return null;
    } finally {
      isDetectingRef.current = false;
    }
  }, []);

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

      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      URL.revokeObjectURL(url);

      if (!detection?.descriptor) {
        console.warn('[FaceVerification] No face detected in identity photo');
        return false;
      }

      baselineDescriptorRef.current = detection.descriptor;
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
    const descriptor = await extractDescriptor();
    if (!descriptor) return null;

    const distance = faceapi.euclideanDistance(
      Array.from(baselineDescriptorRef.current),
      Array.from(descriptor),
    );

    return { matched: distance < MISMATCH_THRESHOLD, distance };
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

    const loaded = await loadModels();
    if (!loaded) return false;

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
    console.log(`[FaceVerification] Face registered (${descriptors.length} captures averaged)`);
    return true;
  }, [loadModels, extractDescriptor]);

  /**
   * Start continuous face verification during the interview.
   *
   * @param videoElement - The video element showing the webcam feed
   */
  const startVerification = useCallback((videoElement: HTMLVideoElement) => {
    videoElementRef.current = videoElement;

    if (!baselineDescriptorRef.current) {
      console.warn('[FaceVerification] Cannot start verification — no baseline registered');
      return;
    }

    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
    }

    const faceapi = faceApiRef.current;
    if (!faceapi) return;

    verificationIntervalRef.current = setInterval(async () => {
      try {
        const descriptor = await extractDescriptor();
        if (!descriptor || !baselineDescriptorRef.current) return;

        const distance = faceapi.euclideanDistance(
          Array.from(baselineDescriptorRef.current),
          Array.from(descriptor),
        );

        if (distance > IDENTITY_CHANGED_THRESHOLD) {
          console.warn(`[FaceVerification] IDENTITY CHANGED — distance: ${distance.toFixed(3)}`);
          callbacks?.onFaceIdentityChanged?.(distance);
        } else if (distance > MISMATCH_THRESHOLD) {
          console.warn(`[FaceVerification] MISMATCH — distance: ${distance.toFixed(3)}`);
          callbacks?.onFaceMismatch?.(distance);
        }
      } catch (err) {
        // Swallow TF.js backend errors (tensor disposal, WebGL context loss) so
        // a single bad frame does not halt continuous verification.
        console.warn('[FaceVerification] Verification frame skipped:', err);
      }
    }, VERIFICATION_INTERVAL_MS);

    console.log('[FaceVerification] Continuous verification started');
  }, [extractDescriptor, callbacks]);

  /**
   * Stop verification and clean up.
   */
  const stopVerification = useCallback(() => {
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
    baselineDescriptorRef,
  };
}
