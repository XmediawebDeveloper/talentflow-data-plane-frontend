"use client";

/**
 * useInterviewFaceDetection — MediaPipe-based face presence + gaze tracking.
 *
 * Forked from hooks/useFaceDetection.ts for AI interview isolation.
 * This hook is standalone (no proctoring imports).
 *
 * Performance rules:
 *   - MediaPipe needs WebGL/DOM so stays on main thread
 *   - Runs at very low FPS (every 3 seconds) to minimize CPU impact
 *   - Uses REFS for detection state (no React state -> no re-renders)
 *   - Emits events via callback (caller routes to InterviewEventBus)
 */

import { useEffect, useRef, useCallback } from "react";

interface UseInterviewFaceDetectionConfig {
  enabled?: boolean;
  enableGazeTracking?: boolean;
  onFaceMissing?: () => void;
  onFaceRestored?: () => void;
  onMultipleFaces?: (count: number) => void;
  onGazeAway?: (direction: string) => void;
  onGazeRestored?: () => void;
}

export function useInterviewFaceDetection(config?: UseInterviewFaceDetectionConfig) {
  // ALL state stored in refs — zero re-renders
  const isFaceDetectedRef = useRef(true);
  const faceCountRef = useRef(0);
  const isGazeOnScreenRef = useRef(true);
  const isLoadingRef = useRef(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceDetectorRef = useRef<any>(null);
  const faceMeshRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processingRef = useRef(false);

  const callbacksRef = useRef(config);
  useEffect(() => { callbacksRef.current = config; }, [config]);

  const enabled = config?.enabled ?? true;
  const enableGazeTracking = config?.enableGazeTracking ?? true;

  // Stabilization counters
  const faceMissingCountRef = useRef(0);
  const faceRestoredCountRef = useRef(0);
  const multipleFacesCountRef = useRef(0);
  const gazeAwayCountRef = useRef(0);
  const gazeRestoredCountRef = useRef(0);
  const lastFaceStateRef = useRef(true);
  const lastMultipleFacesStateRef = useRef(false);
  const lastGazeStateRef = useRef(true);

  const FRAMES_FACE_MISSING = 2;
  const FRAMES_FACE_RESTORED = 2;
  const FRAMES_MULTIPLE_FACES = 1; // trigger on first detection (was 2 = 6 s worst-case)
  const FRAMES_GAZE_AWAY = 3;
  const FRAMES_GAZE_RESTORED = 2;

  // Load a CDN script tag (idempotent — skips if already loaded)
  const loadScript = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
    });

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  // Initialize MediaPipe models + start processing loop (merged into one effect
  // so the loop starts immediately after models load — refs can't trigger effects)
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const initialize = async () => {
      try {
        // Load from CDN — @mediapipe legacy packages break when webpack bundles them
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js");
        if (!mounted) return;

        const FaceDetectionClass = (window as any).FaceDetection;
        if (!FaceDetectionClass) throw new Error("FaceDetection global not found after CDN load");

        const faceDetection = new FaceDetectionClass({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
        });

        faceDetection.setOptions({
          model: "short",
          minDetectionConfidence: 0.4, // lower threshold catches more faces
        });

        faceDetection.onResults((results: any) => {
          if (!mounted) return;
          const numFaces = (results.detections || []).length;

          if (numFaces === 0) {
            faceMissingCountRef.current++;
            faceRestoredCountRef.current = 0;
            multipleFacesCountRef.current = 0;
            if (lastFaceStateRef.current && faceMissingCountRef.current >= FRAMES_FACE_MISSING) {
              lastFaceStateRef.current = false;
              isFaceDetectedRef.current = false;
              faceCountRef.current = 0;
              callbacksRef.current?.onFaceMissing?.();
            }
          } else if (numFaces === 1) {
            faceRestoredCountRef.current++;
            faceMissingCountRef.current = 0;
            multipleFacesCountRef.current = 0;
            if (!lastFaceStateRef.current && faceRestoredCountRef.current >= FRAMES_FACE_RESTORED) {
              lastFaceStateRef.current = true;
              isFaceDetectedRef.current = true;
              callbacksRef.current?.onFaceRestored?.();
            }
            if (lastMultipleFacesStateRef.current) lastMultipleFacesStateRef.current = false;
            faceCountRef.current = 1;
          } else {
            multipleFacesCountRef.current++;
            faceMissingCountRef.current = 0;
            faceRestoredCountRef.current = 0;
            if (!lastMultipleFacesStateRef.current && multipleFacesCountRef.current >= FRAMES_MULTIPLE_FACES) {
              lastMultipleFacesStateRef.current = true;
              lastFaceStateRef.current = true;
              isFaceDetectedRef.current = true;
              faceCountRef.current = numFaces;
              callbacksRef.current?.onMultipleFaces?.(numFaces);
            }
          }
        });

        faceDetectorRef.current = faceDetection;
        console.log("[INTERVIEW_FACE_DETECTION] Initialized");

        // Gaze tracking (FaceMesh)
        if (enableGazeTracking) {
          try {
            await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js");
            if (!mounted) return;

            const FaceMeshClass = (window as any).FaceMesh;
            if (!FaceMeshClass) throw new Error("FaceMesh global not found after CDN load");

            const faceMesh = new FaceMeshClass({
              locateFile: (file: string) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
            });

            faceMesh.setOptions({
              maxNumFaces: 1,
              refineLandmarks: true,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });

            faceMesh.onResults((results: any) => {
              if (!mounted || !results.multiFaceLandmarks?.length) return;

              const lm = results.multiFaceLandmarks[0];
              const noseTip = lm[1];
              const leftEyeOuter = lm[33];
              const rightEyeOuter = lm[263];
              const forehead = lm[10];
              const chin = lm[152];

              const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
              const noseOffset = noseTip.x - eyeMidX;
              const faceMidY = (forehead.y + chin.y) / 2;
              const noseVerticalOffset = noseTip.y - faceMidY;

              const isLookingAway = Math.abs(noseOffset) > 0.06 || noseVerticalOffset < -0.08;

              let gazeDirection = "";
              if (Math.abs(noseOffset) > 0.06) gazeDirection = noseOffset > 0 ? "right" : "left";
              if (noseVerticalOffset < -0.08) gazeDirection = gazeDirection ? `${gazeDirection}_up` : "up";

              if (isLookingAway) {
                gazeAwayCountRef.current++;
                gazeRestoredCountRef.current = 0;
                if (lastGazeStateRef.current && gazeAwayCountRef.current >= FRAMES_GAZE_AWAY) {
                  lastGazeStateRef.current = false;
                  isGazeOnScreenRef.current = false;
                  callbacksRef.current?.onGazeAway?.(gazeDirection);
                }
              } else {
                gazeRestoredCountRef.current++;
                gazeAwayCountRef.current = 0;
                if (!lastGazeStateRef.current && gazeRestoredCountRef.current >= FRAMES_GAZE_RESTORED) {
                  lastGazeStateRef.current = true;
                  isGazeOnScreenRef.current = true;
                  callbacksRef.current?.onGazeRestored?.();
                }
              }
            });

            faceMeshRef.current = faceMesh;
            console.log("[INTERVIEW_FACE_DETECTION] Gaze tracking initialized");
          } catch (err) {
            console.warn("[INTERVIEW_FACE_DETECTION] FaceMesh failed:", err);
          }
        }

        if (mounted) {
          isLoadingRef.current = false;
          // Start processing loop immediately after models are ready
          startProcessingLoop();
        }
      } catch (err) {
        console.error("[INTERVIEW_FACE_DETECTION] Init error:", err);
        if (mounted) isLoadingRef.current = false;
      }
    };

    // Processing loop — sends video frames to MediaPipe at low FPS
    const startProcessingLoop = () => {
      if (processingRef.current) return; // Already running
      processingRef.current = true;
      let lastFaceDetectTime = 0;
      let lastGazeTime = 0;
      const FACE_DETECT_INTERVAL = 1500; // check every 1.5 s (was 3 s) for faster detection
      const GAZE_CHECK_INTERVAL = 2000;
      let retryCount = 0;

      const processFrame = async (timestamp: number) => {
        if (!processingRef.current || !mounted) return;

        if (!videoRef.current) {
          retryCount++;
          if (retryCount < 30) animationFrameRef.current = requestAnimationFrame(processFrame);
          else processingRef.current = false;
          return;
        }

        const video = videoRef.current;
        if (video.readyState < 2 || video.videoWidth === 0) {
          animationFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        if (timestamp - lastFaceDetectTime >= FACE_DETECT_INTERVAL && faceDetectorRef.current) {
          lastFaceDetectTime = timestamp;
          try { await faceDetectorRef.current.send({ image: video }); } catch {}
        }

        if (enableGazeTracking && faceMeshRef.current && timestamp - lastGazeTime >= GAZE_CHECK_INTERVAL) {
          lastGazeTime = timestamp;
          try { await faceMeshRef.current.send({ image: video }); } catch {}
        }

        animationFrameRef.current = requestAnimationFrame(processFrame);
      };

      animationFrameRef.current = requestAnimationFrame(processFrame);
      console.log("[INTERVIEW_FACE_DETECTION] Processing loop started");
    };

    initialize();

    return () => {
      mounted = false;
      processingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      faceDetectorRef.current?.close();
      faceDetectorRef.current = null;
      faceMeshRef.current?.close();
      faceMeshRef.current = null;
    };
  }, [enabled, enableGazeTracking]);

  return {
    // Refs — read .current, no re-renders
    isFaceDetectedRef,
    faceCountRef,
    isGazeOnScreenRef,
    setVideoElement,
  };
}
