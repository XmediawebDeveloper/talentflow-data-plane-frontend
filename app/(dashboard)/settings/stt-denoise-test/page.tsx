'use client';

/**
 * DeepFilterNet denoise test tool (dashboard-only).
 *
 * Record a short clip, then compare the RAW mic audio against the
 * DeepFilterNet-enhanced version returned by the backend. Both are playable
 * and downloadable. This is a throwaway testing UI — the backend URL + auth
 * token are read directly (hardcoded fallback) so it works without extra wiring.
 *
 * Capture deliberately DISABLES browser noise suppression so there's real noise
 * for DeepFilterNet to remove.
 */

import { useCallback, useRef, useState } from 'react';

// Hardcoded for testing (falls back to localhost). Matches lib/services/api.ts.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const TARGET_SAMPLE_RATE = 16000;

function encodeWav16(float32: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + float32.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  const dataLen = float32.length * 2;
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);      // PCM chunk size
  view.setUint16(20, 1, true);       // PCM format
  view.setUint16(22, 1, true);       // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono, 16-bit)
  view.setUint16(32, 2, true);       // block align
  view.setUint16(34, 16, true);      // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < float32.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = input[Math.floor(i * ratio)];
  return out;
}

export default function SttDenoiseTestPage() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [dfnLoaded, setDfnLoaded] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const inRateRef = useRef<number>(48000);

  const cleanup = useCallback(() => {
    try { procRef.current?.disconnect(); } catch {}
    try { ctxRef.current?.close(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    procRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setRawUrl(null);
    setEnhancedUrl(null);
    setDfnLoaded(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      inRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(proc);
      proc.connect(ctx.destination);
      procRef.current = proc;
      setRecording(true);
    } catch (err) {
      setError(`Mic error: ${(err as Error).message}`);
    }
  }, []);

  const stop = useCallback(async () => {
    setRecording(false);
    // Concatenate captured frames.
    const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let o = 0;
    for (const c of chunksRef.current) { merged.set(c, o); o += c.length; }
    const inRate = inRateRef.current;
    cleanup();

    if (total === 0) { setError('No audio captured.'); return; }

    // Raw → 16 kHz WAV (playable + uploadable).
    const pcm16k = downsample(merged, inRate, TARGET_SAMPLE_RATE);
    const rawBlob = encodeWav16(pcm16k, TARGET_SAMPLE_RATE);
    setRawUrl(URL.createObjectURL(rawBlob));

    // Send to backend for DeepFilterNet enhancement.
    setBusy(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const fd = new FormData();
      fd.append('file', rawBlob, 'raw.wav');
      const res = await fetch(`${API_BASE}/stt-denoise-test/denoise`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`${res.status} ${txt}`);
      }
      setDfnLoaded(res.headers.get('x-dfn-loaded') === 'true');
      const enhancedBlob = await res.blob();
      setEnhancedUrl(URL.createObjectURL(enhancedBlob));
    } catch (err) {
      setError(`Enhance failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [cleanup]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">DeepFilterNet Denoise Test</h1>
        <p className="text-sm text-gray-500 mt-1">
          Record a clip (with background noise), then compare raw vs DeepFilterNet-enhanced audio.
          Capture runs with browser noise suppression <b>off</b> so DeepFilterNet has real noise to remove.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            onClick={start}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium disabled:opacity-50"
          >
            ● Record
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium animate-pulse"
          >
            ■ Stop
          </button>
        )}
        {busy && <span className="text-sm text-gray-500">Enhancing…</span>}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      {dfnLoaded === false && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          ⚠️ DeepFilterNet is <b>not installed</b> on the backend (<code>pip install deepfilternet</code>),
          so the enhanced clip is identical to the raw one. Install it and restart the backend to hear a difference.
        </div>
      )}
      {dfnLoaded === true && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          ✓ DeepFilterNet ran on the backend.
        </div>
      )}

      {rawUrl && (
        <div className="space-y-2 border rounded-lg p-4">
          <div className="font-medium">Raw (as captured)</div>
          <audio controls src={rawUrl} className="w-full" />
          <a href={rawUrl} download="raw.wav" className="text-sm text-purple-600 underline">Download raw.wav</a>
        </div>
      )}

      {enhancedUrl && (
        <div className="space-y-2 border rounded-lg p-4">
          <div className="font-medium">Enhanced (DeepFilterNet)</div>
          <audio controls src={enhancedUrl} className="w-full" />
          <a href={enhancedUrl} download="enhanced.wav" className="text-sm text-purple-600 underline">Download enhanced.wav</a>
        </div>
      )}
    </div>
  );
}
