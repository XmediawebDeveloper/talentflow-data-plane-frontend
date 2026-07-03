'use client';

/**
 * STT accuracy comparison test (dashboard-only, TEMP — remove after testing).
 *
 * LIVE models (deepgram / openai realtime): streamed over a WebSocket in REAL
 * TIME — interim transcripts appear as you speak, exactly like the interview /
 * provider playground.
 * BATCH models (gpt-4o-transcribe / gemini / sarvam / assemblyai): transcribed
 * from the recorded clip AFTER you stop.
 *
 * Both paths return RAW provider text — no enhancer, no corrections, no gain.
 * The clip is resampled cleanly to 16 kHz for the batch call.
 */

import { useCallback, useRef, useState } from 'react';
import { STT_MODELS, type SttModelOption } from '@/lib/constants/aiInterviewSttModels';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const WS_BASE = API_BASE.replace(/^http/, 'ws');
const TARGET_SR = 16000;

// Test-only extras — NOT added to the recruiter interview dropdown (STT_MODELS).
const EXTRA_TEST_MODELS: SttModelOption[] = [
  { value: 'deepgram-flux', label: 'Deepgram Flux (live)', liveTranscript: true },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'soniox', label: 'Soniox' },
];
const TEST_MODELS: SttModelOption[] = [...STT_MODELS, ...EXTRA_TEST_MODELS];
const LIVE_MODELS = TEST_MODELS.filter((m) => m.liveTranscript);
const BATCH_MODELS = TEST_MODELS.filter((m) => !m.liveTranscript);
const labelFor = (t: string) => TEST_MODELS.find((m) => m.value === t)?.label || t;

interface BatchResult { model: string; text?: string; ms?: number; path?: string; error?: string; }
interface LiveState { text: string; done: boolean; error?: string; }

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

// Real-time per-chunk downsample (linear interp) for the live WS stream.
function downsampleRealtime(input: Float32Array, inRate: number): Float32Array {
  if (inRate <= TARGET_SR) return input;
  const ratio = inRate / TARGET_SR;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio, idx = Math.floor(pos), frac = pos - idx;
    const a = input[idx] ?? 0, b = input[Math.min(idx + 1, input.length - 1)] ?? 0;
    out[i] = a + frac * (b - a);
  }
  return out;
}

export default function SttCompareTestPage() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [batch, setBatch] = useState<BatchResult[] | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketsRef = useRef<Record<string, WebSocket>>({});
  const nativePcmRef = useRef<Float32Array[]>([]);   // native-rate buffer for the clean batch WAV
  const inRateRef = useRef<number>(48000);

  const teardownAudio = useCallback(() => {
    try { procRef.current?.disconnect(); } catch {}
    try { ctxRef.current?.close(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    procRef.current = null; ctxRef.current = null; streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null); setBatch(null); setAudioUrl(null);
    nativePcmRef.current = [];
    const jwt = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const initLive: Record<string, LiveState> = {};
    LIVE_MODELS.forEach((m) => { initLive[m.value] = { text: '', done: false }; });
    setLive(initLive);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      inRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);

      // Open a live WebSocket per streaming model.
      socketsRef.current = {};
      LIVE_MODELS.forEach((m) => {
        const url = `${WS_BASE}/stt-denoise-test/ws-live?model=${encodeURIComponent(m.value)}&token=${encodeURIComponent(jwt || '')}`;
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        ws.onmessage = (ev) => {
          try {
            const d = JSON.parse(ev.data);
            if (d.type === 'partial') setLive((p) => ({ ...p, [m.value]: { ...p[m.value], text: d.text } }));
            else if (d.type === 'final') setLive((p) => ({ ...p, [m.value]: { text: d.text || p[m.value]?.text || '', done: true } }));
            else if (d.type === 'error') setLive((p) => ({ ...p, [m.value]: { ...(p[m.value] || { text: '', done: false }), done: true, error: d.error } }));
          } catch {}
        };
        ws.onerror = () => setLive((p) => ({ ...p, [m.value]: { ...(p[m.value] || { text: '', done: false }), error: 'websocket error' } }));
        socketsRef.current[m.value] = ws;
      });

      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        nativePcmRef.current.push(new Float32Array(input));   // keep native rate for clean batch WAV
        const ds = downsampleRealtime(new Float32Array(input), inRateRef.current);
        const i16 = new Int16Array(ds.length);
        for (let i = 0; i < ds.length; i++) { const s = Math.max(-1, Math.min(1, ds[i])); i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
        Object.values(socketsRef.current).forEach((ws) => { if (ws.readyState === WebSocket.OPEN) ws.send(i16.buffer); });
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
    const inRate = inRateRef.current;
    teardownAudio();

    // Ask each live WS to finalize; close after a short grace (final arrives via onmessage).
    Object.values(socketsRef.current).forEach((ws) => {
      try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' })); } catch {}
    });
    setTimeout(() => { Object.values(socketsRef.current).forEach((ws) => { try { ws.close(); } catch {} }); }, 4000);

    // Build a CLEAN 16 kHz WAV from the native-rate buffer (OfflineAudioContext resample).
    const totalNative = nativePcmRef.current.reduce((n, c) => n + c.length, 0);
    if (totalNative === 0) { setError('No audio captured.'); return; }
    const mergedNative = new Float32Array(totalNative);
    let o = 0; for (const c of nativePcmRef.current) { mergedNative.set(c, o); o += c.length; }

    setBusy(true);
    try {
      const off = new OfflineAudioContext(1, Math.ceil(totalNative * TARGET_SR / inRate), TARGET_SR);
      const nbuf = off.createBuffer(1, totalNative, inRate);
      nbuf.copyToChannel(mergedNative, 0);
      const src = off.createBufferSource(); src.buffer = nbuf; src.connect(off.destination); src.start();
      const rendered = await off.startRendering();
      const wav = encodeWav16(rendered.getChannelData(0), TARGET_SR);
      setAudioUrl(URL.createObjectURL(wav));

      const jwt = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const fd = new FormData();
      fd.append('file', wav, 'clip.wav');
      fd.append('models', BATCH_MODELS.map((m) => m.value).join(','));
      const res = await fetch(`${API_BASE}/stt-denoise-test/transcribe-compare`, {
        method: 'POST',
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        body: fd,
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
      const data = await res.json();
      setBatch(data.results as BatchResult[]);
    } catch (err) {
      setError(`Batch transcription failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [teardownAudio]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">STT Accuracy Comparison</h1>
        <p className="text-sm text-gray-500 mt-1">
          <b>Live</b> models stream over WebSocket in real time (interims as you speak).
          <b> Batch</b> models transcribe the recorded clip after you stop. All output is
          <b> raw</b> — no enhancer, no corrections.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {!recording ? (
          <button onClick={start} disabled={busy} className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium disabled:opacity-50">● Record</button>
        ) : (
          <button onClick={stop} className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium animate-pulse">■ Stop</button>
        )}
        {busy && <span className="text-sm text-gray-500">Transcribing batch models…</span>}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="space-y-3">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Live (WebSocket, real-time)</div>
        {LIVE_MODELS.map((m) => {
          const st = live[m.value];
          return (
            <div key={m.value} className="border rounded-lg p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.label}</span>
                <span className={`text-xs ${recording && !st?.done ? 'text-emerald-500' : 'text-gray-400'}`}>
                  {st?.error ? 'error' : st?.done ? 'final' : recording ? 'listening…' : ''}
                </span>
              </div>
              {st?.error ? (
                <div className="text-sm text-red-600">⚠️ {st.error}</div>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{st?.text || <span className="text-gray-400 italic">(waiting)</span>}</p>
              )}
            </div>
          );
        })}
      </div>

      {audioUrl && (
        <div className="space-y-2 border rounded-lg p-4">
          <div className="font-medium text-sm">Recorded clip (16 kHz)</div>
          <audio controls src={audioUrl} className="w-full" />
          <a href={audioUrl} download="clip.wav" className="text-sm text-purple-600 underline">Download</a>
        </div>
      )}

      {batch && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Batch (after recording)</div>
          {batch.map((r) => (
            <div key={r.model} className="border rounded-lg p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{labelFor(r.model)}</span>
                <span className="text-xs text-gray-400">{r.path ? `${r.path} · ` : ''}{typeof r.ms === 'number' ? `${r.ms} ms` : ''}</span>
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
