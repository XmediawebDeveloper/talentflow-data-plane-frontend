"use client";

/**
 * useServerProctorFrames — browser side of the server "proctor frame" pipeline.
 *
 * When the backend flag (PROCTOR_VISION_SERVER_ENABLED) is on, the page stops
 * running the heavy in-browser vision models (RF-DETR object detection,
 * MediaPipe FaceDetection face counting, face-api identity checks) and instead
 * posts one small JPEG of the webcam per `interval_ms` to the server, which
 * runs all three, PERSISTS the resulting proctoring events itself and returns
 * them so the page can raise the same candidate toasts.
 *
 * Gaze (MediaPipe FaceMesh) stays in the browser; it reads `latestRef` for the
 * "is a face visible" signal FaceDetection used to provide.
 *
 * Mode:
 *   'pending' → config not fetched yet; callers must not warm any detector.
 *   'server'  → stream frames; browser detectors stay off.
 *   'local'   → flag off / server unavailable; browser detectors as before.
 *               Latches for the rest of the session once reached.
 *
 * Rules:
 *   - at most ONE request in flight (a tick that finds one pending is skipped)
 *   - setTimeout chaining, never setInterval
 *   - 404 / 503 at any time, or 3 consecutive network errors before the first
 *     answer → fall back to 'local' for the session
 *   - 409 not_live → stop streaming (no fallback: the interview is over)
 *   - POST /end once when the interview ends or the page unmounts
 *
 * Shared by both modules: the AI interview uses the defaults; the assessment
 * passes its own `service` (/candidate/assessment/{token}/proctor-frame…),
 * `logTag` and `classifyRejection` (attempt not started yet → retry).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  candidateAIInterviewService,
  type ProctorFrameConfig,
  type ProctorFrameResponse,
  type ProctorFrameSendResult,
  type ProctorFrameServerEvent,
} from "@/lib/services/candidateAIInterviewService";

export type ProctorVisionMode = 'pending' | 'server' | 'local';

/** Endpoint set the hook talks to (one per module). Same contract for both. */
export interface ProctorFrameService {
  getProctorFrameConfig: (token: string) => Promise<ProctorFrameConfig>;
  sendProctorFrame: (token: string, blob: Blob, ts: number) => Promise<ProctorFrameSendResult>;
  endProctorFrames: (token: string) => Promise<void>;
}

/** What to do with a non-200/202/404/503 answer:
 *  'stop'  → stop streaming for the session (no fallback),
 *  'retry' → keep streaming, next frame after `retryMs`,
 *  'skip'  → drop this frame only (default for 400/413/…). */
export type ProctorFrameRejection = { action: 'stop' | 'retry' | 'skip'; retryMs?: number };

const AI_INTERVIEW_FRAME_SERVICE: ProctorFrameService = {
  getProctorFrameConfig: (t) => candidateAIInterviewService.getProctorFrameConfig(t),
  sendProctorFrame: (t, b, ts) => candidateAIInterviewService.sendProctorFrame(t, b, ts),
  endProctorFrames: (t) => candidateAIInterviewService.endProctorFrames(t),
};

/** Latest face reading from the server — consumed by the gaze path. */
export interface ServerFaceReading {
  faces: number;
  faceMissing: boolean;
  /** performance.now() when the answer arrived. */
  at: number;
}

interface UseServerProctorFramesOptions {
  token: string;
  /** Frames may be sent right now: socket connected, interview live, not
   *  paused for device loss, not closing. */
  streaming: boolean;
  /** Interview is over — POST /end once (if server mode ran). */
  ended: boolean;
  /** Resolve the LIVE webcam <video> each tick (same as the recording relay). */
  getVideoElement: () => HTMLVideoElement | null | undefined;
  /** Server-originated events (already persisted server-side — UI only). */
  onServerEvents: (events: ProctorFrameServerEvent[], resp: ProctorFrameResponse) => void;
  /** Config fetch cap; on timeout the session runs in 'local' mode. */
  configTimeoutMs?: number;
  /** Module endpoints — default: the AI interview's. Read once per mount. */
  service?: ProctorFrameService;
  /** Console prefix — default '[INTERVIEW-DEBUG]'. */
  logTag?: string;
  /** Override for answers other than 200/202/404/503. Return undefined to
   *  keep the default (409 → stop, anything else → skip the frame). */
  classifyRejection?: (status: number, body: ProctorFrameResponse | null) => ProctorFrameRejection | undefined;
}

const DEFAULT_LOG = '[INTERVIEW-DEBUG]';
const STATS_EVERY_MS = 60_000;
const MAX_START_NETWORK_ERRORS = 3;

export function useServerProctorFrames(opts: UseServerProctorFramesOptions) {
  const { token, streaming, ended } = opts;
  const LOG = opts.logTag ?? DEFAULT_LOG;
  const serviceRef = useRef<ProctorFrameService>(opts.service ?? AI_INTERVIEW_FRAME_SERVICE);
  const [mode, setMode] = useState<ProctorVisionMode>('pending');
  const modeRef = useRef<ProctorVisionMode>('pending');
  const configRef = useRef<ProctorFrameConfig | null>(null);
  const latestRef = useRef<ServerFaceReading | null>(null);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stoppedRef = useRef(false);   // 409 not_live
  const endSentRef = useRef(false);
  const sentAnyRef = useRef(false);
  const gotAnswerRef = useRef(false);
  const startNetErrorsRef = useRef(0);
  const statsRef = useRef({ sent: 0, ok: 0, dropped: 0, errors: 0, totalMs: 0, lastLogAt: 0 });

  const switchMode = useCallback((next: ProctorVisionMode, why: string) => {
    if (modeRef.current === next || modeRef.current === 'local') return;
    modeRef.current = next;
    setMode(next);
    if (next === 'server') {
      const c = configRef.current;
      console.log(
        `${LOG} Proctor vision: SERVER mode active (interval=${c?.interval_ms}ms, ` +
        `${c?.frame?.width}x${c?.frame?.height} q${c?.frame?.quality}) — browser object/face-count/identity models off`,
      );
    } else if (next === 'local') {
      latestRef.current = null;
      console.warn(`${LOG} Proctor vision: falling back to BROWSER detectors for this session — ${why}`);
    }
  }, [LOG]);

  // ── 1. Config (once per mount) ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const timeoutMs = optsRef.current.configTimeoutMs ?? 5000;
    const timer = setTimeout(() => {
      if (!cancelled && modeRef.current === 'pending') switchMode('local', `config timeout ${timeoutMs}ms`);
    }, timeoutMs);
    serviceRef.current.getProctorFrameConfig(token)
      .then(cfg => {
        if (cancelled || modeRef.current !== 'pending') return;
        if (cfg?.enabled) {
          configRef.current = cfg;
          switchMode('server', 'config enabled');
        } else {
          // Flag off is the normal case — quiet, no fallback line.
          modeRef.current = 'local';
          setMode('local');
        }
      })
      .catch(err => {
        if (!cancelled && modeRef.current === 'pending') switchMode('local', `config error: ${err?.message ?? err}`);
      })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [token, switchMode]);

  // ── 2. Frame loop ─────────────────────────────────────────────────────
  const active = mode === 'server' && streaming && !ended;
  useEffect(() => {
    if (!active) return;
    const cfg = configRef.current;
    if (!cfg) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const maxW = cfg.frame?.width || 384;
    const maxH = cfg.frame?.height || 288;
    const type = cfg.frame?.type || 'image/jpeg';
    const quality = cfg.frame?.quality ?? 0.7;
    const interval = Math.max(250, cfg.interval_ms || 1000);

    // One reusable surface. OffscreenCanvas (no DOM, convertToBlob) where
    // available; hidden <canvas> otherwise. Never captureStream()-ed, so the
    // screen-recording guard is not involved.
    const off: OffscreenCanvas | null =
      typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(maxW, maxH) : null;
    const el: HTMLCanvasElement | null = off ? null : document.createElement('canvas');
    const ctx = (off ? off.getContext('2d', { alpha: false }) : el!.getContext('2d', { alpha: false })) as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

    const toBlob = (): Promise<Blob | null> => {
      if (off) return off.convertToBlob({ type, quality }).catch(() => null);
      return new Promise(resolve => el!.toBlob(b => resolve(b), type, quality));
    };

    const maybeLogStats = () => {
      const s = statsRef.current;
      const now = performance.now();
      if (!s.lastLogAt) { s.lastLogAt = now; return; }
      if (now - s.lastLogAt < STATS_EVERY_MS) return;
      s.lastLogAt = now;
      const avg = s.ok ? Math.round(s.totalMs / s.ok) : 0;
      console.log(
        `${LOG} Proctor frames (server): sent=${s.sent} ok=${s.ok} dropped=${s.dropped} ` +
        `errors=${s.errors} avg=${avg}ms`,
      );
    };

    const schedule = (ms: number) => {
      if (!alive) return;
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (!alive) return;
      const startedAt = performance.now();
      maybeLogStats();
      if (inFlight || stoppedRef.current || modeRef.current !== 'server' || !ctx) {
        if (!stoppedRef.current && modeRef.current === 'server') schedule(interval);
        return;
      }
      const video = optsRef.current.getVideoElement();
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        schedule(interval);
        return;
      }
      inFlight = true;
      try {
        // Fit inside maxW×maxH keeping the camera's aspect: no stretch (hurts
        // the face model), no crop (would hide a 2nd person at the edge), no
        // bars (would skew the obstruction brightness).
        const scale = Math.min(maxW / video.videoWidth, maxH / video.videoHeight, 1);
        const w = Math.max(1, Math.round(video.videoWidth * scale));
        const h = Math.max(1, Math.round(video.videoHeight * scale));
        const surface = (off ?? el)!;
        if (surface.width !== w) surface.width = w;
        if (surface.height !== h) surface.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const blob = await toBlob();
        if (!alive) return;
        if (!blob) { schedule(interval); return; }

        const ts = Date.now();
        statsRef.current.sent++;
        sentAnyRef.current = true;
        let res;
        try {
          res = await serviceRef.current.sendProctorFrame(token, blob, ts);
        } catch (err) {
          statsRef.current.errors++;
          if (!gotAnswerRef.current) {
            startNetErrorsRef.current++;
            if (startNetErrorsRef.current >= MAX_START_NETWORK_ERRORS) {
              switchMode('local', `${startNetErrorsRef.current} consecutive network errors at start`);
              return;
            }
          }
          schedule(interval);
          return;
        }
        if (!alive) return;
        const { status, body } = res;

        if (status === 200 && body) {
          gotAnswerRef.current = true;
          startNetErrorsRef.current = 0;
          statsRef.current.ok++;
          statsRef.current.totalMs += performance.now() - startedAt;
          latestRef.current = {
            faces: typeof body.faces === 'number' ? body.faces : 0,
            faceMissing: !!body.state?.face_missing,
            at: performance.now(),
          };
          if (body.events && body.events.length) {
            try { optsRef.current.onServerEvents(body.events, body); } catch (e) {
              console.warn(`${LOG} Proctor frame event handler threw`, e);
            }
          }
        } else if (status === 202) {
          gotAnswerRef.current = true;
          statsRef.current.dropped++;
        } else if (status === 404 || status === 503) {
          statsRef.current.errors++;
          switchMode('local', `server answered ${status}`);
          return;
        } else {
          const custom = optsRef.current.classifyRejection?.(status, body);
          const action = custom?.action ?? (status === 409 ? 'stop' : 'skip');
          if (action === 'stop') {
            stoppedRef.current = true;
            console.log(`${LOG} Proctor frames stopped — server says ${body?.reason ?? (status === 409 ? 'not_live' : status)}`);
            return;
          }
          if (action === 'retry') {
            schedule(Math.max(interval, custom?.retryMs ?? interval));
            return;
          }
          // 400 bad image / 413 too big / anything else — skip this frame.
          statsRef.current.errors++;
          if (statsRef.current.errors <= 3) {
            console.warn(`${LOG} Proctor frame rejected (${status}, ${blob.size} B)`, body?.reason ?? '');
          }
        }
      } catch (err) {
        statsRef.current.errors++;
        if (statsRef.current.errors <= 3) console.warn(`${LOG} Proctor frame capture failed`, err);
      } finally {
        inFlight = false;
      }
      // Keep the cadence: subtract the time this tick took.
      schedule(Math.max(0, interval - (performance.now() - startedAt)));
    };

    schedule(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, token, switchMode, LOG]);

  // ── 3. /end once ──────────────────────────────────────────────────────
  const sendEnd = useCallback(() => {
    if (endSentRef.current || !sentAnyRef.current) return;
    endSentRef.current = true;
    const s = statsRef.current;
    console.log(
      `${LOG} Proctor frames end: sent=${s.sent} ok=${s.ok} dropped=${s.dropped} errors=${s.errors} ` +
      `avg=${s.ok ? Math.round(s.totalMs / s.ok) : 0}ms`,
    );
    void serviceRef.current.endProctorFrames(optsRef.current.token);
  }, [LOG]);

  useEffect(() => {
    if (ended) sendEnd();
  }, [ended, sendEnd]);
  useEffect(() => () => sendEnd(), [sendEnd]);

  return { mode, modeRef, latestRef };
}
