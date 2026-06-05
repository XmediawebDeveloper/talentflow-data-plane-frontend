"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback, memo } from "react";
import { Loader2 } from 'lucide-react';

interface WebcamProps {
  onStream?: (stream: MediaStream) => void;
  onVideoReady?: (video: HTMLVideoElement) => void;
  className?: string;
  showHandIndicator?: boolean;
  isHandRaised?: boolean;
}

export interface WebcamRef {
  getVideoElement: () => HTMLVideoElement | null;
  // Re-acquire the webcam+mic stream (device-recovery after unplug / permission
  // re-grant). Resolves true when a fresh live stream was obtained.
  reacquire: () => Promise<boolean>;
}

export const Webcam = memo(forwardRef<WebcamRef, WebcamProps>(function Webcam(
  { onStream, onVideoReady, className = "", showHandIndicator = false, isHandRaised = false },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Guard: ensure onVideoReady is called exactly once even if both effects fire
  const videoReadyCalledRef = useRef(false);

  // Acquire (or RE-acquire on device recovery) the webcam+mic stream. On SUCCESS
  // it swaps in the fresh stream and stops the old one; on FAILURE it leaves the
  // existing stream untouched, so a still-denied mic never tears down a working
  // camera. Returns true when a live stream was obtained.
  const startWebcam = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: true, // Required for proctoring voice detection
      });

      const old = streamRef.current;
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const finish = () => {
          videoRef.current?.play().then(() => {
            setIsActive(true);
            onStream?.(stream);
            if (videoRef.current && !videoReadyCalledRef.current) {
              videoReadyCalledRef.current = true;
              onVideoReady?.(videoRef.current);
            }
          }).catch(() => {});
        };
        // On a re-acquire the element is already loaded — fire immediately.
        if (videoRef.current.readyState >= 1) finish();
        else videoRef.current.onloadedmetadata = finish;
      } else {
        onStream?.(stream);
      }

      // Swap complete — now stop the OLD (possibly dead) stream's tracks.
      if (old && old !== stream) {
        old.getTracks().forEach((t) => t.stop());
      }
      setError(null);
      return true;
    } catch (err) {
      // Keep the existing stream as-is — do NOT kill a working device when the
      // OTHER one is still unavailable (e.g. mic still denied, camera fine).
      console.error("❌ Webcam error:", err);
      setError(err instanceof Error ? err.message : "Failed to access webcam");
      return false;
    }
  }, [onStream, onVideoReady]);

  // Expose video element + reacquire() (device-recovery) via ref.
  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
    reacquire: () => startWebcam(),
  }), [startWebcam]);

  useEffect(() => {
    startWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    if (isActive && videoRef.current && streamRef.current) {
      onStream?.(streamRef.current);

      // Only call onVideoReady once when video becomes active
      if (!videoReadyCalledRef.current) {
        onVideoReady?.(videoRef.current);
        videoReadyCalledRef.current = true;
      }
    }
  }, [onStream, onVideoReady, isActive]);

  if (error) {
    return (
      <div className={`bg-gray-800 rounded-xl flex items-center justify-center ${className}`}>
        <p className="text-red-400 text-sm">Camera unavailable</p>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl bg-gray-800 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Hand raised indicator */}
      {showHandIndicator && isHandRaised && (
        <div className="absolute top-2 right-2 bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg">
          <span className="text-lg">🖐️</span>
          Hand Raised!
        </div>
      )}
    </div>
  );
}));
