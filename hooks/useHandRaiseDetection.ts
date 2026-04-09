"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseHandRaiseDetectionConfig {
  onHandRaised?: () => void;
  onHandLowered?: () => void;
  onWaveDetected?: () => void;
  enabled?: boolean;
}

export function useHandRaiseDetection(config?: UseHandRaiseDetectionConfig) {
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handsRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastStateRef = useRef(false);
  const raisedCountRef = useRef(0);
  const loweredCountRef = useRef(0);
  const frameCountRef = useRef(0);
  const processingRef = useRef(false);

  // Store callbacks in ref to avoid recreation issues
  const callbacksRef = useRef(config);
  useEffect(() => {
    callbacksRef.current = config;
  }, [config]);

  // Wave detection
  const handPositionsRef = useRef<Array<{ x: number; timestamp: number }>>([]);
  const lastWaveTimeRef = useRef(0);

  // Stabilization settings - MORE LENIENT
  const FRAMES_TO_CONFIRM_RAISED = 2; // Faster response
  const FRAMES_TO_CONFIRM_LOWERED = 4; // Faster lowering
  const enabled = config?.enabled ?? true;

  // Detect if hand is raised - SIMPLER LOGIC
  const detectHandRaised = useCallback((landmarks: any[]): boolean => {
    if (!landmarks || landmarks.length === 0) return false;

    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];

    // Hand is "raised" when:
    // 1. Wrist is below finger bases (higher Y value = lower on screen)
    // 2. Finger tips are above finger bases (lower Y value = higher on screen)
    const wristBelowFingers = wrist.y > middleMcp.y + 0.03; // More lenient threshold
    const fingersPointingUp =
      indexTip.y < indexMcp.y - 0.02 &&
      middleTip.y < middleMcp.y - 0.02;

    return wristBelowFingers && fingersPointingUp;
  }, []);

  // Detect wave gesture - STRICT: Only after hand is raised and stable
  const detectWave = useCallback((landmarks: any[]): boolean => {
    if (!landmarks || landmarks.length === 0) return false;

    // MUST be in raised state already (from lastStateRef)
    if (!lastStateRef.current) {
      // Clear positions if hand not raised
      handPositionsRef.current = [];
      return false;
    }

    const now = Date.now();
    const wrist = landmarks[0];

    // Must still be raised
    const handIsRaised = detectHandRaised(landmarks);
    if (!handIsRaised) {
      handPositionsRef.current = [];
      return false;
    }

    // Track hand positions
    handPositionsRef.current.push({ x: wrist.x, timestamp: now });
    handPositionsRef.current = handPositionsRef.current.filter(
      (pos) => now - pos.timestamp < 1000
    );

    // Need more samples for reliable detection
    if (handPositionsRef.current.length < 12) return false;

    // Cooldown between waves
    if (now - lastWaveTimeRef.current < 2500) return false;

    const positions = handPositionsRef.current;
    let directionChanges = 0;
    let lastDirection = 0;

    for (let i = 1; i < positions.length; i++) {
      const deltaX = positions[i].x - positions[i - 1].x;

      // Require larger movement to count as direction change (ignore tiny jitter)
      if (Math.abs(deltaX) < 0.02) continue;

      const currentDirection = deltaX > 0 ? 1 : -1;

      if (lastDirection !== 0 && currentDirection !== lastDirection) {
        directionChanges++;
      }

      lastDirection = currentDirection;
    }

    // Need at least 3 direction changes for a clear wave
    const isWaving = directionChanges >= 3;

    if (isWaving) {
      lastWaveTimeRef.current = now;
      handPositionsRef.current = [];
    }

    return isWaving;
  }, [detectHandRaised]);

  // Set video element reference
  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

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

  // Initialize MediaPipe Hands (only once)
  useEffect(() => {
    let mounted = true;

    const initializeHands = async () => {
      try {
        // Load from CDN as a global script — @mediapipe legacy packages are not
        // proper ES modules and break when webpack tries to bundle them.
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");

        if (!mounted) return;

        const HandsClass = (window as any).Hands;
        if (!HandsClass) throw new Error("Hands global not found after CDN load");

        const hands = new HandsClass({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });

        hands.onResults((results: any) => {
          if (!mounted) return;

          frameCountRef.current++;
          const handDetected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

          if (!handDetected) {
            loweredCountRef.current++;
            raisedCountRef.current = 0;

            if (lastStateRef.current && loweredCountRef.current >= FRAMES_TO_CONFIRM_LOWERED) {
              lastStateRef.current = false;
              setIsHandRaised(false);
              callbacksRef.current?.onHandLowered?.();
            }
            return;
          }

          const landmarks = results.multiHandLandmarks[0];

          // Check wave first
          const isWaving = detectWave(landmarks);
          if (isWaving) {
            callbacksRef.current?.onWaveDetected?.();
            return;
          }

          // Check hand raise
          const handRaised = detectHandRaised(landmarks);

          if (handRaised) {
            raisedCountRef.current++;
            loweredCountRef.current = 0;
          } else {
            loweredCountRef.current++;
            raisedCountRef.current = 0;
          }

          // State transitions
          if (!lastStateRef.current && raisedCountRef.current >= FRAMES_TO_CONFIRM_RAISED) {
            lastStateRef.current = true;
            setIsHandRaised(true);
            callbacksRef.current?.onHandRaised?.();
          } else if (lastStateRef.current && loweredCountRef.current >= FRAMES_TO_CONFIRM_LOWERED) {
            lastStateRef.current = false;
            setIsHandRaised(false);
            callbacksRef.current?.onHandLowered?.();
          }
        });

        handsRef.current = hands;
        setIsLoading(false);

      } catch (err) {
        console.error("MediaPipe Hands init failed:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize MediaPipe");
          setIsLoading(false);
        }
      }
    };

    initializeHands();

    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (handsRef.current) {
        handsRef.current.close();
      }
    };
  }, []); // Empty deps - only initialize once

  // Process video frames
  useEffect(() => {
    if (!enabled || !handsRef.current || isLoading || processingRef.current) return;

    processingRef.current = true;

    let lastProcessTime = 0;
    const PROCESS_INTERVAL = 100; // 10 fps
    let retryCount = 0;
    const MAX_RETRIES = 30; // 3 seconds worth of retries

    const processFrame = async (timestamp: number) => {
      if (!processingRef.current) return;

      // Wait for video element
      if (!videoRef.current) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          animationFrameRef.current = requestAnimationFrame(processFrame);
        } else {
          processingRef.current = false;
        }
        return;
      }

      // Throttle processing
      if (timestamp - lastProcessTime < PROCESS_INTERVAL) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }
      lastProcessTime = timestamp;

      const video = videoRef.current;

      // Check if video is ready
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      try {
        if (handsRef.current) {
          await handsRef.current.send({ image: video });
        }
      } catch (e) {
        // Ignore processing errors
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      processingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enabled, isLoading]);

  return {
    isHandRaised,
    isLoading,
    error,
    setVideoElement,
  };
}
