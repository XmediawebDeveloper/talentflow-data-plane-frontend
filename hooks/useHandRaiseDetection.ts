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
      console.log("👋 Wave detected: " + directionChanges + " direction changes");
    }

    return isWaving;
  }, [detectHandRaised]);

  // Set video element reference
  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    console.log("🎥 setVideoElement called");
    videoRef.current = video;

    if (video) {
      console.log("✅ Video element connected:", {
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused
      });
    }
  }, []);

  // Initialize MediaPipe Hands (only once)
  useEffect(() => {
    let mounted = true;
    console.log("🚀 Initializing MediaPipe Hands...");

    const initializeHands = async () => {
      try {
        // Dynamic import
        const { Hands } = await import("@mediapipe/hands");

        if (!mounted) {
          console.log("⚠️ Component unmounted during init");
          return;
        }

        console.log("✅ MediaPipe module imported");

        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          },
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.4, // More lenient
          minTrackingConfidence: 0.4,  // More lenient
        });

        console.log("⚙️ MediaPipe options set");

        hands.onResults((results: any) => {
          if (!mounted) return;

          frameCountRef.current++;
          const handDetected = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

          // Log first 10 frames, then every 60 frames
          if (frameCountRef.current <= 10 || frameCountRef.current % 60 === 0) {
            console.log(`📊 Frame ${frameCountRef.current}: Hand = ${handDetected}`);
          }

          if (!handDetected) {
            loweredCountRef.current++;
            raisedCountRef.current = 0;

            if (lastStateRef.current && loweredCountRef.current >= FRAMES_TO_CONFIRM_LOWERED) {
              lastStateRef.current = false;
              setIsHandRaised(false);
              console.log("✋ Hand lowered");
              callbacksRef.current?.onHandLowered?.();
            }
            return;
          }

          const landmarks = results.multiHandLandmarks[0];

          // Check wave first
          const isWaving = detectWave(landmarks);
          if (isWaving) {
            console.log("👋 Wave detected!");
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
            console.log("🖐️ Hand raised!");
            callbacksRef.current?.onHandRaised?.();
          } else if (lastStateRef.current && loweredCountRef.current >= FRAMES_TO_CONFIRM_LOWERED) {
            lastStateRef.current = false;
            setIsHandRaised(false);
            console.log("✋ Hand lowered");
            callbacksRef.current?.onHandLowered?.();
          }
        });

        handsRef.current = hands;
        setIsLoading(false);
        console.log("✅ MediaPipe Hands ready!");

      } catch (err) {
        console.error("❌ MediaPipe error:", err);
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize MediaPipe");
          setIsLoading(false);
        }
      }
    };

    initializeHands();

    return () => {
      mounted = false;
      console.log("🧹 Cleaning up MediaPipe");
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
    if (!enabled || !handsRef.current || isLoading || processingRef.current) {
      console.log("⏸️ Not ready for processing:", { enabled, hands: !!handsRef.current, isLoading, processing: processingRef.current });
      return;
    }

    processingRef.current = true;
    console.log("▶️ Starting frame processing");

    let lastProcessTime = 0;
    const PROCESS_INTERVAL = 100; // 10 fps
    let processCount = 0;
    let retryCount = 0;
    const MAX_RETRIES = 30; // 3 seconds worth of retries

    const processFrame = async (timestamp: number) => {
      // Check if we should stop
      if (!processingRef.current) {
        console.log("⏹️ Processing stopped");
        return;
      }

      // Wait for video element
      if (!videoRef.current) {
        retryCount++;
        if (retryCount <= 5 || retryCount % 10 === 0) {
          console.log(`⏳ Waiting for video element (retry ${retryCount}/${MAX_RETRIES})`);
        }

        if (retryCount < MAX_RETRIES) {
          animationFrameRef.current = requestAnimationFrame(processFrame);
        } else {
          console.error("❌ Video element never connected");
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
        if (processCount === 0) {
          console.log("⏳ Video not ready:", {
            readyState: video.readyState,
            dimensions: `${video.videoWidth}x${video.videoHeight}`
          });
        }
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Process frame
      processCount++;
      if (processCount === 1) {
        console.log("✅ First frame processing started!");
      }
      if (processCount <= 5 || processCount % 100 === 0) {
        console.log(`🎬 Processing frame ${processCount}`);
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
      console.log("⏹️ Stopping frame processing");
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
