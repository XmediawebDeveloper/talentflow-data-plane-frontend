'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const verifyApi = axios.create({ baseURL: API_BASE_URL });

type Phase =
  | 'loading'
  | 'expired'
  | 'error'
  | 'requesting_permission'
  | 'permission_denied'
  | 'recording_screen'
  | 'recording_pan'
  | 'uploading'
  | 'done';

const RECORD_SCREEN_MS = 5000;
const RECORD_PAN_MS = 5000;

interface MobileEnvironmentVerificationPortalProps {
  token: string;
}

/**
 * Mobile-browser page opened by scanning the laptop's QR code. Records a
 * ~10s landscape clip of the laptop screen + surroundings and uploads it.
 *
 * Deliberately does NOT fetch or display the anti-replay challenge
 * (color/ID) — that's shown only on the laptop, so the phone's job is purely
 * to film it, never to know the answer in advance.
 */
export function MobileEnvironmentVerificationPortal({ token }: MobileEnvironmentVerificationPortalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await verifyApi.get(`/candidate/environment-verify/${token}`);
        if (!cancelled) setPhase('requesting_permission');
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
        if (videoRef.current) videoRef.current.srcObject = stream;

        const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm']
          .find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => { void uploadRecording(); };
        recorderRef.current = recorder;
        recorder.start();

        setPhase('recording_screen');
        setTimeout(() => {
          if (cancelled) return;
          setPhase('recording_pan');
          setTimeout(() => {
            if (cancelled) return;
            recorderRef.current?.stop();
          }, RECORD_PAN_MS);
        }, RECORD_SCREEN_MS);
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

  const uploadRecording = async () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
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

      {(phase === 'recording_screen' || phase === 'recording_pan') && (
        <div className="w-full max-w-sm space-y-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video rounded-xl bg-black object-cover"
          />
          <div className="flex items-center justify-center gap-2 text-red-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording
          </div>
          <p className="text-sm leading-relaxed">
            {phase === 'recording_screen'
              ? 'Point your camera at your laptop screen and keep it steady.'
              : 'Slowly turn your phone left, then right, to show your surroundings.'}
          </p>
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
