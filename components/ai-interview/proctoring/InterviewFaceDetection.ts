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
  /** Multiple-faces episode ended (back to one face, or a confirmed no-face stretch). */
  onMultipleFacesCleared?: () => void;
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
  const FRAMES_FACE_RESTORED = 1;  // Unblock immediately on first face detection (blocking is still 2 frames)
  // Require 2 consecutive frames (~3 s) of ≥2 faces before alarming, so a brief
  // hand-raise / someone walking past the background doesn't false-trigger.
  const FRAMES_MULTIPLE_FACES = 2;
  // Minimum bounding-box area (fraction of frame) for a detection to count as a
  // real face — filters small spurious boxes.
  const MIN_FACE_BOX_AREA = 0.025;
  const FRAMES_GAZE_AWAY = 3;
  // 1 check (<=2s at the 2s gaze cadence): the "looking away" warning is held on
  // screen for the whole episode, so it should clear promptly once they look back.
  const FRAMES_GAZE_RESTORED = 1;

  // Looking DOWN (notes / phone on the desk). Unlike left/right/up this can't
  // use a fixed threshold: webcams usually sit ABOVE the screen, so a candidate
  // reading the screen already tilts slightly down, and the amount differs per
  // setup. So we learn each candidate's own neutral pitch first and flag only a
  // clear drop below it.
  //   pitch ratio = where the nose tip sits between forehead (0) and chin (1),
  //   normalised by face height so distance from the camera doesn't matter.
  // Looking down pushes the projected nose tip toward the chin → ratio rises.
  const DOWN_BASELINE_SAMPLES = 8;     // ~16s of forward-facing frames (2s cadence)
  const LOOK_DOWN_RATIO_DELTA = 0.10;  // rise above the candidate's own neutral
  const downBaselineSamplesRef = useRef<number[]>([]);
  const downBaselineRef = useRef<number | null>(null);

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
          // Raised from 0.4 → 0.6: a low threshold made non-face objects (a
          // raised palm/hand) score as "faces" and trip the multiple-people
          // alarm. 0.6 still finds the real face reliably in normal lighting.
          minDetectionConfidence: 0.6,
        });

        faceDetection.onResults((results: any) => {
          if (!mounted) return;
          // Only count detections that are plausibly a real face: a bounding
          // box of meaningful size (≥ ~2.5% of the frame). Filters out small
          // spurious boxes. Combined with the higher confidence + the 2-frame
          // debounce below, this stops a hand-raise being read as a 2nd person.
          const detections = (results.detections || []).filter((d: any) => {
            const bb = d?.boundingBox;
            if (!bb) return true; // if the SDK doesn't expose a box, keep it
            const area = (bb.width || 0) * (bb.height || 0); // normalized 0–1
            return area >= MIN_FACE_BOX_AREA;
          });
          const numFaces = detections.length;

          if (numFaces === 0) {
            faceMissingCountRef.current++;
            faceRestoredCountRef.current = 0;
            multipleFacesCountRef.current = 0;
            // A confirmed no-face stretch also ends any multiple-faces episode,
            // so 2 faces → no face → 2 faces raises a fresh alert. Previously
            // only a 1-face frame re-armed it and the second episode was lost.
            if (faceMissingCountRef.current >= FRAMES_FACE_MISSING && lastMultipleFacesStateRef.current) {
              lastMultipleFacesStateRef.current = false;
              callbacksRef.current?.onMultipleFacesCleared?.();
            }
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
            if (lastMultipleFacesStateRef.current) {
              lastMultipleFacesStateRef.current = false;
              callbacksRef.current?.onMultipleFacesCleared?.();
            }
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

              const isTurned = Math.abs(noseOffset) > 0.06;
              const isUp = noseVerticalOffset < -0.08;

              // Pitch ratio for looking-down (see DOWN_BASELINE_SAMPLES).
              const faceHeight = chin.y - forehead.y;
              const pitchRatio = faceHeight > 0.05 ? (noseTip.y - forehead.y) / faceHeight : null;
              let isDown = false;
              if (pitchRatio != null) {
                if (downBaselineRef.current == null) {
                  // Calibrate only on frames where the candidate is facing the
                  // screen, so the baseline is their normal reading posture.
                  if (!isTurned && !isUp) {
                    const samples = downBaselineSamplesRef.current;
                    samples.push(pitchRatio);
                    if (samples.length >= DOWN_BASELINE_SAMPLES) {
                      const sorted = [...samples].sort((a, b) => a - b);
                      downBaselineRef.current = sorted[Math.floor(sorted.length / 2)];
                      console.log("[INTERVIEW_FACE_DETECTION] Look-down baseline set", {
                        baseline: Number(downBaselineRef.current.toFixed(3)),
                      });
                    }
                  }
                } else {
                  isDown = pitchRatio - downBaselineRef.current > LOOK_DOWN_RATIO_DELTA;
                }
              }

              const isLookingAway = isTurned || isUp || isDown;

              let gazeDirection = "";
              if (isTurned) gazeDirection = noseOffset > 0 ? "right" : "left";
              if (isUp) gazeDirection = gazeDirection ? `${gazeDirection}_up` : "up";
              else if (isDown) gazeDirection = gazeDirection ? `${gazeDirection}_down` : "down";

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
    //
    // Phase 1 perf (2026-05-28): the previous implementation woke the main
    // thread via requestAnimationFrame at 60 Hz just to check whether the
    // 1.5 s face-detect or 2 s gaze-check window had elapsed. On candidates
    // like ABISHEK (50+ proctor violations / 25 min, constant head/face
    // movement) this loop was burning ~60 main-thread wake-ups/sec on top
    // of the actual MediaPipe `.send()` calls. Switched to a self-scheduling
    // setTimeout @ 250 ms (4 Hz) — still well under the 1.5 s / 2 s detection
    // cadence, but ~15× fewer main-thread wake-ups. Detection accuracy is
    // unchanged because MediaPipe `.send()` fires on the same timestamp
    // gates. `cancelAnimationFrame` in cleanup is replaced with the timer
    // clear.
    const startProcessingLoop = () => {
      if (processingRef.current) return; // Already running
      processingRef.current = true;
      let lastFaceDetectTime = 0;
      let lastGazeTime = 0;
      const FACE_DETECT_INTERVAL = 1500; // check every 1.5 s (was 3 s) for faster detection
      const GAZE_CHECK_INTERVAL = 2000;
      const POLL_INTERVAL_MS = 250; // 4 Hz wake-up; cheap timestamp check
      let retryCount = 0;

      const processFrame = async () => {
        if (!processingRef.current || !mounted) return;
        const timestamp = performance.now();

        if (!videoRef.current) {
          retryCount++;
          if (retryCount < 30) {
            animationFrameRef.current = (setTimeout(processFrame, POLL_INTERVAL_MS) as unknown) as number;
          } else {
            processingRef.current = false;
          }
          return;
        }

        const video = videoRef.current;
        if (video.readyState < 2 || video.videoWidth === 0) {
          animationFrameRef.current = (setTimeout(processFrame, POLL_INTERVAL_MS) as unknown) as number;
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

        animationFrameRef.current = (setTimeout(processFrame, POLL_INTERVAL_MS) as unknown) as number;
      };

      animationFrameRef.current = (setTimeout(processFrame, POLL_INTERVAL_MS) as unknown) as number;
      console.log("[INTERVIEW_FACE_DETECTION] Processing loop started (250 ms poll, ≥1.5 s detect)");
    };

    initialize();

    return () => {
      mounted = false;
      processingRef.current = false;
      // Phase 1 perf: scheduler switched from requestAnimationFrame to
      // setTimeout (see startProcessingLoop), so clearTimeout is the
      // correct cancel call. cancelAnimationFrame on a timer id is a
      // no-op, leaving the scheduled callback to run after unmount.
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
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
