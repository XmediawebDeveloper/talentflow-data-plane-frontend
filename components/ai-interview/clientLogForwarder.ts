/**
 * Client log forwarder — ships the candidate's browser diagnostic console lines
 * to the backend so they land in journald tagged by session id, readable next to
 * the backend logs with:  journalctl -u <unit> | grep "ai-<token8>"
 *
 * Design notes:
 *  - ALLOWLIST only. We forward a small set of diagnostic prefixes (VAD / silence
 *    / recording / mic / WebSocket-close) — NOT arbitrary console output — to keep
 *    journald volume sane.
 *  - PII GUARD. Any line mentioning transcript/answer text is dropped, so the
 *    candidate's spoken words never leave the browser through this channel.
 *  - Best-effort. Never throws into the app; a logging failure must not affect the
 *    interview. Batched every few seconds + flushed via a keepalive fetch on unload so the
 *    connection-loss diagnostics survive even when the WebSocket/page is gone.
 */
import { candidateAIInterviewService } from '@/lib/services/candidateAIInterviewService';

// Diagnostic line prefixes worth forwarding (start-of-line match).
const ALLOW_PREFIXES = [
  '[INTERVIEW-DEBUG]',   // VAD, silence timeout, stopRecording, speech-detected, timers
  '[Recording',          // recording start/stop
  '[Timer',              // question timer lifecycle
  '[InterviewUI]',       // mic profile, RNNoise, AudioContext, worklet
  '[TalkingHead]',       // avatar/audio playback
  '[AUDIO-SEND-FAILED]', // upstream PCM send failures
  '[INTERVIEW_OBJECT_DETECTION]', // phone/object detector: init, backend, failures
];
// Connection diagnostics that may not carry a known prefix.
const CONN_SUBSTR = ['close code', 'WebSocket', 'Connection lost', 'onclose', 'WS closed', 'reconnect'];
// PII / noise guard — never forward lines that could contain the candidate's
// spoken words or answer text.
const DENY_SUBSTR = ['transcript', 'Transcript', 'text:', 'live_transcript', 'currentTranscript'];

const MAX_BUFFER = 400;   // ring-buffer cap (older lines dropped)
const MAX_BATCH = 100;    // matches the backend per-request cap
const FLUSH_MS = 3000;

let installed = false;
let token: string | null = null;
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let inCapture = false;    // re-entrancy guard

const orig = {
  log: typeof console !== 'undefined' ? console.log.bind(console) : (() => {}),
  warn: typeof console !== 'undefined' ? console.warn.bind(console) : (() => {}),
  error: typeof console !== 'undefined' ? console.error.bind(console) : (() => {}),
};

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(' ');
}

function shouldForward(line: string): boolean {
  if (DENY_SUBSTR.some((s) => line.includes(s))) return false;
  if (ALLOW_PREFIXES.some((p) => line.startsWith(p))) return true;
  if (CONN_SUBSTR.some((s) => line.includes(s))) return true;
  return false;
}

function capture(level: 'log' | 'warn' | 'error', args: unknown[]): void {
  if (inCapture) return;
  inCapture = true;
  try {
    const line = fmt(args);
    if (shouldForward(line)) {
      const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
      const prefix = level === 'log' ? '' : level.toUpperCase() + ' ';
      buffer.push(`${ts} ${prefix}${line}`.slice(0, 500));
      if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
    }
  } catch {
    /* ignore */
  } finally {
    inCapture = false;
  }
}

async function flush(): Promise<void> {
  if (!token || buffer.length === 0) return;
  const batch = buffer.splice(0, MAX_BATCH);
  await candidateAIInterviewService.reportClientLog(token, batch);
}

/** Begin capturing + periodically flushing. Idempotent; safe to call on connect. */
export function startClientLogForwarder(interviewToken: string): void {
  token = interviewToken;
  if (!installed && typeof console !== 'undefined') {
    installed = true;
    console.log = (...a: unknown[]) => { capture('log', a); orig.log(...a); };
    console.warn = (...a: unknown[]) => { capture('warn', a); orig.warn(...a); };
    console.error = (...a: unknown[]) => { capture('error', a); orig.error(...a); };
  }
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => { void flush(); }, FLUSH_MS);
}

/**
 * Flush whatever is buffered in a way that survives page close / WS drop.
 *
 * Uses `fetch(..., { keepalive: true, credentials: 'omit' })` rather than
 * `navigator.sendBeacon`.
 *
 * sendBeacon CANNOT work here: the spec sends it with credentials mode
 * "include", and the API replies `Access-Control-Allow-Origin: *` (with
 * allow_credentials=False, which is the correct pairing for its Bearer-token
 * auth). A credentialed request may never accept a wildcard ACAO, so every
 * beacon was rejected at preflight:
 *
 *   "The value of the 'Access-Control-Allow-Origin' header ... must not be the
 *    wildcard '*' when the request's credentials mode is 'include'."
 *
 * That silently threw away the LAST batch of logs from every interview —
 * precisely the teardown lines you most want when diagnosing a session. No
 * amount of content-type fiddling fixes it, because credentials mode isn't
 * configurable on sendBeacon.
 *
 * `keepalive: true` gives the same outlive-the-page guarantee while letting us
 * set `credentials: 'omit'`, which the wildcard ACAO accepts. Its 64 KB body cap
 * is comfortably above our worst case (MAX_BATCH 100 lines × 500 chars ≈ 50 KB).
 */
export function flushClientLogBeacon(): void {
  try {
    if (!token || buffer.length === 0) return;
    if (typeof fetch !== 'function') { void flush(); return; }
    const batch = buffer.splice(0, MAX_BATCH);
    const url = candidateAIInterviewService.clientLogBeaconUrl(token);
    void fetch(url, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: batch }),
    }).catch(() => { /* best-effort logging channel */ });
  } catch {
    /* ignore */
  }
}

/** Stop the periodic timer and flush remaining lines. Console stays patched
 *  (harmless) so late lines during teardown are still captured for the beacon. */
export function stopClientLogForwarder(): void {
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  void flush();
}
