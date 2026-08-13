'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const verifyApi = axios.create({ baseURL: API_BASE_URL });

type Phase =
  | 'loading'
  | 'expired'
  | 'error'
  | 'instructions'
  | 'requesting_permission'
  | 'get_ready'
  | 'permission_denied'
  | 'recording_screen'
  | 'recording_pan'
  | 'ready_to_submit'
  | 'uploading'
  | 'done';

const RECORD_SCREEN_MS = 5000;
const RECORD_PAN_MS = 5000;
const GET_READY_SECONDS = 3;

interface MobileEnvironmentVerificationPortalProps {
  token: string;
}

/**
 * Mobile-browser page opened by scanning the laptop's QR code. Follows the
 * "AI Interview-Proxy Integrity Verification" spec's Steps 2-6:
 *   2. Camera/mic permission (no app install)
 *   3. Guided instructions screen (candidate taps Next to proceed)
 *   4. Recording phase 1 (5s) — capture the laptop's dynamic color+ID panel
 *   5. Recording phase 2 (5s) — pan the surroundings
 *   6. Explicit submit — candidate reviews and taps Upload rather than an
 *      automatic upload, so they know their recording is going somewhere.
 *
 * Deliberately does NOT fetch or display the anti-replay challenge
 * (color/ID) — that's shown only on the laptop, so the phone's job is purely
 * to film it, never to know the answer in advance.
 */
export function MobileEnvironmentVerificationPortal({ token }: MobileEnvironmentVerificationPortalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [getReadyCount, setGetReadyCount] = useState(GET_READY_SECONDS);
  // Two SEPARATE 5s countdowns (resets at the phase switch), not one
  // continuous 10s countdown — matches the spec's own wording ("start 5 secs
  // timer" for phase 1, "another 5 secs timer" for phase 2).
  const [recordingCountdown, setRecordingCountdown] = useState(5);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await verifyApi.get(`/candidate/environment-verify/${token}`);
        if (!cancelled) setPhase('instructions');
      } catch (err: unknown) {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 410) {
          setErrorMessage('This verification link has expired or was already used.');
          setPhase('expired');
        } else {
          setErrorMessage('Verification link not found.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (phase !== 'requesting_permission') return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        // The <video> element is always mounted (see render below) precisely
        // so this ref is guaranteed non-null here — it used to only render
        // during the recording_screen/recording_pan phases, which hadn't
        // started yet at this point in the effect, leaving srcObject unset
        // and the preview permanently black even though recording worked.
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* autoplay may need a user gesture on some browsers; recording still proceeds */ });
        }

        const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm']
          .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        // Recording stops after both timed phases complete — hand control to
        // the candidate instead of auto-uploading, per spec Step 6 ("the
        // candidate have to submit the recordings").
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach(t => t.stop());
          if (!cancelled) setPhase('ready_to_submit');
        };
        recorderRef.current = recorder;

        // Brief "Get Ready" countdown before recording actually starts, so the
        // candidate has a moment to position their phone after granting
        // permission rather than recording starting the instant it's granted.
        setGetReadyCount(GET_READY_SECONDS);
        setPhase('get_ready');
        let remaining = GET_READY_SECONDS;
        const countdownInterval = setInterval(() => {
          remaining -= 1;
          if (cancelled) { clearInterval(countdownInterval); return; }
          if (remaining <= 0) {
            clearInterval(countdownInterval);
            recorderRef.current?.start();
            runPhase('recording_screen', RECORD_SCREEN_MS, () => {
              runPhase('recording_pan', RECORD_PAN_MS, () => {
                recorderRef.current?.stop();
              });
            });
          } else {
            setGetReadyCount(remaining);
          }
        }, 1000);

        // Drives both the visible countdown ("5s" ticking to "0s") and the
        // phase transition itself from a single interval, so the on-screen
        // number and the actual timing can never drift apart. Resets to 5
        // fresh for each phase rather than continuing from the prior phase.
        function runPhase(nextPhase: Phase, durationMs: number, onDone: () => void) {
          if (cancelled) return;
          setPhase(nextPhase);
          let secondsLeft = Math.round(durationMs / 1000);
          setRecordingCountdown(secondsLeft);
          const phaseInterval = setInterval(() => {
            secondsLeft -= 1;
            if (cancelled) { clearInterval(phaseInterval); return; }
            if (secondsLeft <= 0) {
              clearInterval(phaseInterval);
              onDone();
            } else {
              setRecordingCountdown(secondsLeft);
            }
          }, 1000);
        }
      } catch {
        if (!cancelled) setPhase('permission_denied');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleSubmit = async () => {
    setPhase('uploading');
    try {
      const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'video/webm' });
      const formData = new FormData();
      formData.append('file', blob, 'env_verify.webm');
      await verifyApi.post(`/candidate/environment-verify/${token}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPhase('done');
    } catch {
      setErrorMessage('Upload failed. Please close this page and rescan the QR code to try again.');
      setPhase('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1929] text-white flex flex-col items-center justify-center p-6 text-center">
      {phase === 'loading' && <p className="text-[#94a3b8]">Loading verification…</p>}

      {(phase === 'expired' || phase === 'error') && (
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Unable to verify</h1>
          <p className="text-sm text-[#94a3b8]">{errorMessage}</p>
        </div>
      )}

      {phase === 'instructions' && (
        <div className="max-w-sm space-y-5">
          <h1 className="text-lg font-semibold">Environment Verification</h1>
          <div className="text-sm text-[#cbd5e1] leading-relaxed text-left space-y-3 bg-white/5 rounded-xl p-4 border border-white/10">
            <p>
              Please record a <strong className="text-white">10-second video</strong> of your interview
              setup in <strong className="text-white">landscape mode</strong>. Ensure your laptop screen
              is visible throughout the recording.
            </p>
            <p>Slowly move your mobile phone:</p>
            <ul className="list-disc list-inside space-y-1 text-[#94a3b8]">
              <li>Left to Right</li>
              <li>Right to Left</li>
            </ul>
            <p>Keep your recording steady until instructed.</p>
          </div>
          <button
            type="button"
            onClick={() => setPhase('requesting_permission')}
            className="w-full py-3 rounded-xl bg-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Next
          </button>
        </div>
      )}

      {phase === 'requesting_permission' && (
        <p className="text-[#94a3b8]">Requesting camera access…</p>
      )}

      {phase === 'permission_denied' && (
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Camera access needed</h1>
          <p className="text-sm text-[#94a3b8]">
            Please allow camera and microphone access in your browser settings, then rescan the QR code.
          </p>
        </div>
      )}

      {/* Always mounted (not conditional on phase) so videoRef.current is
          already available the instant getUserMedia resolves, above —
          otherwise the stream has nowhere to attach to and the preview
          stays black even though recording is happening. Hidden outside
          the get-ready/recording phases via `hidden` rather than unmounted. */}
      <div className={`w-full max-w-sm space-y-4 ${(phase === 'get_ready' || phase === 'recording_screen' || phase === 'recording_pan') ? '' : 'hidden'}`}>
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video rounded-xl bg-black object-cover"
          />
          {phase === 'get_ready' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
              <span className="text-6xl font-bold text-white drop-shadow-lg">{getReadyCount}</span>
            </div>
          )}
        </div>
        {phase === 'get_ready' ? (
          <p className="text-sm leading-relaxed font-medium">Get ready — recording starts now…</p>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording
              <span className="text-white font-mono">· {recordingCountdown}s</span>
            </div>
            <p className="text-sm leading-relaxed">
              {phase === 'recording_screen'
                ? 'Recording your screen with this frame — point your camera at your laptop screen and keep it steady.'
                : 'Now slowly turn your mobile from left to right, and right to left.'}
            </p>
          </>
        )}
      </div>

      {phase === 'ready_to_submit' && (
        <div className="max-w-sm space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="text-lg font-semibold">Recording complete</h1>
          <p className="text-sm text-[#94a3b8]">
            Your 10-second verification video is ready. Tap Upload to submit it and resume your interview.
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl bg-brand-blue text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Upload
          </button>
        </div>
      )}

      {phase === 'uploading' && <p className="text-[#94a3b8]">Uploading…</p>}

      {phase === 'done' && (
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Verification submitted</h1>
          <p className="text-sm text-[#94a3b8]">
            You can put your phone down — your interview is resuming on your laptop.
          </p>
        </div>
      )}
    </div>
  );
}
