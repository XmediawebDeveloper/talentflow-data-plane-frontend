"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

interface WebcamProps {
  onStream?: (stream: MediaStream) => void;
  onVideoReady?: (video: HTMLVideoElement) => void;
  className?: string;
  showHandIndicator?: boolean;
  isHandRaised?: boolean;
}

export interface WebcamRef {
  getVideoElement: () => HTMLVideoElement | null;
}

export const Webcam = forwardRef<WebcamRef, WebcamProps>(function Webcam(
  { onStream, onVideoReady, className = "", showHandIndicator = false, isHandRaised = false },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Expose video element via ref
  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
  }));

  // Guard: ensure onVideoReady is called exactly once even if both effects fire
  const videoReadyCalledRef = useRef(false);

  useEffect(() => {
    const startWebcam = async () => {
      try {
        console.log("📷 Starting webcam...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: true, // Required for proctoring voice detection
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // Wait for video to be ready
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => {
              setIsActive(true);
              console.log("✅ Webcam active");
              onStream?.(stream);

              // Notify when video is fully ready for processing (guard against double-call)
              if (videoRef.current && !videoReadyCalledRef.current) {
                videoReadyCalledRef.current = true;
                onVideoReady?.(videoRef.current);
              }
            });
          };
        }
      } catch (err) {
        console.error("❌ Webcam error:", err);
        setError(err instanceof Error ? err.message : "Failed to access webcam");
      }
    };

    startWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        console.log("📷 Webcam stopped");
      }
    };
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
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
});
