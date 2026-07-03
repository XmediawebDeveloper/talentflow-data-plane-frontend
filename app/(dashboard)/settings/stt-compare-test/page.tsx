'use client';

/**
 * STT accuracy comparison test (dashboard-only, TEMP — remove after testing).
 *
 * Records a clip, resamples it CLEANLY to 16 kHz (OfflineAudioContext — proper
 * anti-aliasing, no gain, no aliasing), and sends it to the backend which
 * transcribes it with deepgram-nova, openai-realtime, and gemini-2.5-pro and
 * returns the RAW text (no enhancer, no corrections). Mirrors "pure audio→text"
 * like each provider's playground so you can compare model accuracy fairly.
 */

import { useCallback, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const TARGET_SR = 16000;

interface ModelResult {
  model: string;
  label?: string;
  text?: string;
  ms?: number;
  error?: string;
}

function encodeWav16(f32: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + f32.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  const dl = f32.length * 2;
  w(0, 'RIFF'); v.setUint32(4, 36 + dl, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, dl, true);
  let o = 44;
  for (let i = 0; i < f32.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export default function SttCompareTestPage() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [results, setResults] = useState<ModelResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(null); setResults(null); setAudioUrl(null);
    chunksRef.current = [];
    try {
      // Browser defaults (like a typical playground mic) — no custom gain.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      setError(`Mic error: ${(err as Error).message}`);
    }
  }, []);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
    });
    rec.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const webmBlob = await done;
    setAudioUrl(URL.createObjectURL(webmBlob));

    setBusy(true);
    try {
      // Decode → resample cleanly to 16 kHz mono via OfflineAudioContext.
      const arr = await webmBlob.arrayBuffer();
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const decoded = await new AC().decodeAudioData(arr.slice(0));
      const frames = Math.ceil(decoded.duration * TARGET_SR);
      const offline = new OfflineAudioContext(1, frames, TARGET_SR);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      const wav = encodeWav16(rendered.getChannelData(0), TARGET_SR);

      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const fd = new FormData();
      fd.append('file', wav, 'clip.wav');
      const res = await fetch(`${API_BASE}/stt-denoise-test/transcribe-compare`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
      const data = await res.json();
      setResults(data.results as ModelResult[]);
    } catch (err) {
      setError(`Transcription failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">STT Accuracy Comparison</h1>
        <p className="text-sm text-gray-500 mt-1">
          Record a clip → it&apos;s resampled cleanly to 16 kHz and transcribed by all three
          models with <b>raw</b> output (no enhancer, no corrections, no gain) — so you can
          compare accuracy like each provider&apos;s playground.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {!recording ? (
          <button onClick={start} disabled={busy}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium disabled:opacity-50">● Record</button>
        ) : (
          <button onClick={stop}
            className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium animate-pulse">■ Stop</button>
        )}
        {busy && <span className="text-sm text-gray-500">Transcribing with all 3 models…</span>}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {audioUrl && (
        <div className="space-y-2 border rounded-lg p-4">
          <div className="font-medium text-sm">Your recording</div>
          <audio controls src={audioUrl} className="w-full" />
          <a href={audioUrl} download="clip.webm" className="text-sm text-purple-600 underline">Download</a>
        </div>
      )}

      {results && (
        <div className="space-y-3">
          {results.map((r) => (
            <div key={r.model} className="border rounded-lg p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.label || r.model}</span>
                {typeof r.ms === 'number' && <span className="text-xs text-gray-400">{r.ms} ms</span>}
              </div>
              {r.error ? (
                <div className="text-sm text-red-600">⚠️ {r.error}</div>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.text || <span className="text-gray-400 italic">(empty)</span>}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
