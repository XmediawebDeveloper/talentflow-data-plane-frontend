"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback, memo } from "react";
import { Loader2 } from 'lucide-react';
import { checkVirtualCamera, virtualCameraMessage } from '@/lib/proctoring/virtualCameraDetection';

interface WebcamProps {
  onStream?: (stream: MediaStream) => void;
  onVideoReady?: (video: HTMLVideoElement) => void;
  /**
   * Fired SYNCHRONOUSLY, immediately after a fresh getUserMedia stream is
   * acquired (initial mount AND every reacquire) — BEFORE the previous
   * stream's tracks are stopped. Lets a long-lived consumer (e.g. a
   * MediaRecorder built once from the first stream's tracks) swap onto the
   * new tracks in place instead of being silently left recording from tracks
   * that are about to be permanently ended. Unlike onStream (which fires
   * after an async video.play() resolves, i.e. too late relative to the
   * old-track teardown below), this fires before any teardown happens.
   */
  onTracksReplaced?: (newStream: MediaStream) => void;
  className?: string;
  showHandIndicator?: boolean;
  isHandRaised?: boolean;
}

export interface WebcamRef {
  getVideoElement: () => HTMLVideoElement | null;
  // Re-acquire the webcam+mic stream (device-recovery after unplug / permission
  // re-grant). Resolves true when a fresh live stream was obtained.
  reacquire: () => Promise<boolean>;
  // Re-acquire ONLY the microphone — used when it's specifically the mic
  // that dropped (camera still fine). Unlike reacquire(), this never touches
  // the live camera track at all: no new getUserMedia video request, no
  // stream swap on the <video> element, nothing that could cause the still-
  // healthy camera to transiently mute/re-negotiate and trip a false
  // "Camera Disabled". Resolves true when a fresh live audio track was
  // obtained and swapped in.
  // Pass `deviceId` to target a SPECIFIC input (e.g. the original headset
  // once it's reconnected) instead of whatever the OS currently calls
  // "default" — falls back to the unconstrained default request if that
  // exact device can't be opened. Omit for the old default-only behavior.
  reacquireAudio: (deviceId?: string) => Promise<boolean>;
}

export const Webcam = memo(forwardRef<WebcamRef, WebcamProps>(function Webcam(
  { onStream, onVideoReady, onTracksReplaced, className = "", showHandIndicator = false, isHandRaised = false },
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
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }, // Required for proctoring voice detection and webcam recording
      });

      // Reject mobile-camera-relay virtual drivers (Motorola Smart Connect,
      // DroidCam, Iriun, EpocCam, Camo, OBS Virtual Camera, etc.) before
      // wiring the stream up anywhere — a phone's camera relayed over Wi-Fi
      // registers as a normal video input device with no API-level flag
      // distinguishing it from real hardware, so the driver's name is the
      // only signal available short of a native lockdown client. Checked on
      // every acquire (including reacquire), so swapping to a virtual camera
      // mid-interview is caught the same way a genuine device swap is.
      const newVideoTrack = stream.getVideoTracks()[0];
      const camCheck = checkVirtualCamera(newVideoTrack);
      if (camCheck.flagged) {
        stream.getTracks().forEach((t) => t.stop());
        setError(virtualCameraMessage(camCheck.label));
        return false;
      }

      const old = streamRef.current;

      // Give any long-lived consumer (the interview's MediaRecorder) a chance
      // to swap onto these NEW tracks before `old`'s tracks are stopped below.
      // Must fire here, synchronously — onStream below only runs after an
      // async video.play() resolves, which is too late: the old-track
      // teardown a few lines down would already have run by then.
      onTracksReplaced?.(stream);

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
  }, [onStream, onVideoReady, onTracksReplaced]);

  // Re-acquire ONLY the audio track and swap it into the EXISTING stream
  // object in place (removeTrack/addTrack) — the video track is never
  // requested, read, or reassigned, so the live camera feed is completely
  // undisturbed. Mirrors the same "swap in place" approach InterviewUI's
  // handleTracksReplaced uses for the recording graph, applied here to the
  // stream object itself.
  const reacquireAudio = useCallback(async (deviceId?: string): Promise<boolean> => {
    const current = streamRef.current;
    if (!current) return false;
    const baseAudio = {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    try {
      let audioStream: MediaStream;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { ...baseAudio, deviceId: { exact: deviceId } } : baseAudio,
        });
      } catch (err) {
        // Requested device may have gone away again between the caller's
        // presence check and this call — fall back to whatever the OS
        // currently calls "default" rather than failing the whole reacquire.
        if (!deviceId) throw err;
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
      }
      const newAudioTrack = audioStream.getAudioTracks()[0];
      if (!newAudioTrack) return false;

      const oldAudioTracks = current.getAudioTracks();
      oldAudioTracks.forEach((t) => current.removeTrack(t));
      current.addTrack(newAudioTrack);

      // Let the recording graph pick up the new mic track the same way it
      // does on a full reacquire — current's video track list is unchanged,
      // so this is a no-op on the video side.
      onTracksReplaced?.(current);

      oldAudioTracks.forEach((t) => t.stop());

      // Give consumers (the proctoring monitor) a NEW stream reference — same
      // live video track, fresh audio track — purely so the effect watching
      // this prop re-runs and re-attaches onended/onmute to the new audio
      // track. The video track object itself is untouched throughout, so the
      // <video> element and the actual camera input never see this at all.
      onStream?.(new MediaStream([...current.getVideoTracks(), newAudioTrack]));

      return true;
    } catch (err) {
      console.error("❌ Webcam audio reacquire error:", err);
      return false;
    }
  }, [onStream, onTracksReplaced]);

  // Expose video element + reacquire() (device-recovery) via ref.
  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
    reacquire: () => startWebcam(),
    reacquireAudio: (deviceId?: string) => reacquireAudio(deviceId),
  }), [startWebcam, reacquireAudio]);

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
      <div className={`bg-gray-800 rounded-xl flex items-center justify-center p-4 text-center ${className}`}>
        <p className="text-red-400 text-sm">{error}</p>
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
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback nopictureinpicture"
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
