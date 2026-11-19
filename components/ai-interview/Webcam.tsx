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
  /**
   * Microphone approved at System Check. The proctoring stream opens THIS
   * device rather than the OS default, so the audio the monitor watches is the
   * mic the candidate actually chose — mirroring the camera pin above. Falls
   * back to the default when the exact device cannot be opened.
   */
  audioDeviceId?: string | null;
  className?: string;
  showHandIndicator?: boolean;
  isHandRaised?: boolean;
  /**
   * The camera deviceId to pin every acquire to (initial mount, full
   * reacquire, and reacquireVideo when no deviceId is passed to it
   * explicitly) — set from System Check's approved camera. Omitted/undefined
   * preserves the old unconstrained-default behavior. If the exact device
   * can't be opened (e.g. unplugged since System Check), falls back to an
   * unconstrained request rather than failing outright.
   */
  initialCameraDeviceId?: string;
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
  // Re-acquire ONLY the camera — the mirror image of reacquireAudio, used when
  // it's specifically the CAMERA that dropped. Never requests audio, so it can
  // restore the camera on a machine that currently has NO working microphone.
  //
  // This matters because reacquire() asks for video AND audio in ONE
  // getUserMedia call, which is all-or-nothing: on a machine with no built-in
  // devices, unplugging both peripherals and replugging only the camera left
  // that call still failing on the audio constraint, so the camera stayed dark
  // until the headset came back too.
  // Pass `deviceId` to target a SPECIFIC camera (the one approved during
  // System Check) instead of whatever the OS currently calls "default" —
  // falls back to the unconstrained default request if that exact device
  // can't be opened. Omit to fall back to initialCameraDeviceId (if any),
  // then to the old default-only behavior.
  reacquireVideo: (deviceId?: string) => Promise<boolean>;
}

export const Webcam = memo(forwardRef<WebcamRef, WebcamProps>(function Webcam(
  { onStream, onVideoReady, onTracksReplaced, audioDeviceId, className = "", showHandIndicator = false, isHandRaised = false, initialCameraDeviceId },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Captured ONCE from the initialCameraDeviceId prop and never reassigned —
  // every acquire (mount, full reacquire, and reacquireVideo's implicit
  // target) retries this SAME approved device rather than drifting onto
  // whatever a fallback happened to land on last time.
  const pinnedCameraDeviceIdRef = useRef<string | undefined>(initialCameraDeviceId);

  // Guard: ensure onVideoReady is called exactly once even if both effects fire
  const videoReadyCalledRef = useRef(false);
  // A stream that was acquired while videoRef.current was null, waiting to be
  // attached once the element exists (see startWebcam's else branch).
  const pendingAttachRef = useRef<MediaStream | null>(null);

  // Acquire (or RE-acquire on device recovery) the webcam+mic stream. On SUCCESS
  // it swaps in the fresh stream and stops the old one; on FAILURE it leaves the
  // existing stream untouched, so a still-denied mic never tears down a working
  // camera. Returns true when a live stream was obtained.
  const startWebcam = useCallback(async (): Promise<boolean> => {
    try {
      const baseVideo = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" as const };
      const audioConstraint = {
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }; // Required for proctoring voice detection and webcam recording
      const pinnedAudio = audioDeviceId
        ? { ...audioConstraint, deviceId: { exact: audioDeviceId } }
        : audioConstraint;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: pinnedCameraDeviceIdRef.current
            ? { ...baseVideo, deviceId: { exact: pinnedCameraDeviceIdRef.current } }
            : baseVideo,
          audio: pinnedAudio,
        });
      } catch (err) {
        // An approved device may be gone (unplugged since System Check, or a
        // stale id from a fresh session). Retry with the OS default rather than
        // failing the whole acquire — and retry EACH device independently, so a
        // vanished mic can't cost us the camera or vice versa.
        if (!pinnedCameraDeviceIdRef.current && !audioDeviceId) throw err;
        console.warn('[Webcam] Approved device unavailable — retrying with defaults');
        stream = await navigator.mediaDevices.getUserMedia({ video: baseVideo, audio: audioConstraint });
      }

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
        // No element to attach to right now. Remember the stream so the effect
        // below can wire it up the moment the element exists — otherwise this
        // acquire silently produces a live-but-invisible camera (the preview
        // stays black and isActive never flips true).
        pendingAttachRef.current = stream;
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

  // Re-acquire ONLY the video track and swap it into the EXISTING stream object
  // in place. The audio side is never requested, so this works on a machine
  // whose only microphone is currently unplugged — which is the entire point:
  // the combined reacquire() cannot restore the camera while the mic is missing.
  const reacquireVideo = useCallback(async (deviceId?: string): Promise<boolean> => {
    const current = streamRef.current;
    if (!current) return false;
    const targetId = deviceId ?? pinnedCameraDeviceIdRef.current;
    const baseVideo = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" as const };
    try {
      let videoStream: MediaStream;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: targetId ? { ...baseVideo, deviceId: { exact: targetId } } : baseVideo,
        });
      } catch (err) {
        // Targeted device may have gone away again between the caller's
        // presence check and this call — fall back to whatever the OS
        // currently calls "default" rather than failing the whole reacquire.
        if (!targetId) throw err;
        videoStream = await navigator.mediaDevices.getUserMedia({ video: baseVideo });
      }
      const newVideoTrack = videoStream.getVideoTracks()[0];
      if (!newVideoTrack) return false;

      // Same virtual-camera gate as the full acquire — a device swapped in
      // mid-interview must be screened exactly like the original.
      const camCheck = checkVirtualCamera(newVideoTrack);
      if (camCheck.flagged) {
        videoStream.getTracks().forEach((t) => t.stop());
        setError(virtualCameraMessage(camCheck.label));
        return false;
      }

      const oldVideoTracks = current.getVideoTracks();
      oldVideoTracks.forEach((t) => current.removeTrack(t));
      current.addTrack(newVideoTrack);

      // Repaint the preview. Unlike the audio path, the element genuinely needs
      // the new track wired up, and re-assigning srcObject is the reliable way
      // to make the element pick up a swapped video track.
      if (videoRef.current) {
        videoRef.current.srcObject = current;
        videoRef.current.play().then(() => setIsActive(true)).catch(() => { /* retried next tick */ });
      }

      onTracksReplaced?.(current);
      oldVideoTracks.forEach((t) => t.stop());

      // Hand consumers a NEW stream identity so the proctoring monitor's effect
      // re-runs and re-attaches onended/onmute to the NEW video track. Without
      // this it keeps watching the ENDED old track and isCameraActive never
      // recovers, so the overlay would stay up over a working camera.
      onStream?.(new MediaStream([newVideoTrack, ...current.getAudioTracks()]));

      setError(null);
      return true;
    } catch (err) {
      console.error("❌ Webcam video reacquire error:", err);
      return false;
    }
  }, [onStream, onTracksReplaced]);

  // Expose video element + reacquire() (device-recovery) via ref.
  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
    reacquire: () => startWebcam(),
    reacquireAudio: (deviceId?: string) => reacquireAudio(deviceId),
    reacquireVideo: (deviceId?: string) => reacquireVideo(deviceId),
  }), [startWebcam, reacquireAudio, reacquireVideo]);

  useEffect(() => {
    startWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Attach a stream that arrived while the element was missing. Runs on every
  // render, so it catches the element as soon as it appears.
  useEffect(() => {
    const pending = pendingAttachRef.current;
    if (!pending || !videoRef.current) return;
    pendingAttachRef.current = null;
    if (pending.getVideoTracks().every((t) => t.readyState !== 'live')) return;
    videoRef.current.srcObject = pending;
    videoRef.current.play().then(() => {
      setIsActive(true);
      onStream?.(pending);
    }).catch(() => { /* autoplay refused — the next acquire retries */ });
  });

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

  // NOTE: the error state is rendered as an OVERLAY, never as a replacement for
  // the <video> element. Returning a different tree on error used to UNMOUNT the
  // video, which nulled videoRef.current — and startWebcam only assigns
  // srcObject when that ref exists. On a machine with no built-in camera,
  // unplugging the only webcam makes getUserMedia throw (nothing to fall back
  // to), so the error branch rendered; when the camera came back, the successful
  // reacquire had no element to attach to and silently took its `else` path.
  // The preview then stayed black for the rest of the interview even though the
  // camera was live and proctoring had cleared. Keeping the element mounted at
  // all times makes reacquire able to reattach.
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
      {!isActive && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Device error — an overlay, so the <video> underneath stays mounted and
          a later successful reacquire can attach its stream to it. */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 p-4 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Hand raised indicator */}
      {showHandIndicator && isHandRaised && (
        <div className="absolute top-2 right-2 max-w-[calc(100%-1rem)] whitespace-nowrap bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg">
          <span className="text-lg">🖐️</span>
          Hand Raised!
        </div>
      )}
    </div>
  );
}));
