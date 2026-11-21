/**
 * SegmentedRecorder — MediaRecorder → MinIO multipart upload, as one reusable
 * object (2026-09-23, assessment recording port).
 *
 * The AI interview implements this twice inline (camera in InterviewUI.tsx,
 * screen in CandidateAIInterviewPortal.tsx). This class carries the same
 * hard-won rules so the assessment does not re-learn them:
 *
 *  - timeslice 5 s; chunks are buffered and shipped once 5 s after start,
 *    then every 30 s, and on tab hide / pagehide / flushNow() — ONLY once ≥ 5 MiB + 256 KiB is buffered — S3 refuses smaller
 *    non-final parts. The trailing remainder ships as the final part.
 *  - segment_index is monotonic and PERSISTED in sessionStorage: a reload must
 *    continue numbering, because index 0 makes the backend abort the earlier
 *    multipart upload and discard that footage.
 *  - a failed segment's chunks go back to the front of the buffer and are
 *    retried under the same index (backend overwrites the same part number).
 *  - the final flush is SINGLE-FLIGHT, waits out an in-flight checkpoint,
 *    stops the recorder, then retries the final upload 4× with backoff. Parts
 *    already in MinIO are never lost — server-side salvage assembles them.
 *  - the recorder's MediaStream track set is NEVER mutated (that discards the
 *    whole recording, BUG25). For a camera, feed it a canvas relay track via
 *    createCanvasRelayTrack() so device swaps do not touch the recorded track.
 *  - the checkpoint timer belongs to the instance: a re-share builds a new
 *    instance, so it can never "lose" its timer (an interview defect not copied).
 */

import { markAppOwnedCanvas } from '@/components/ai-interview/proctoring/ScreenRecordingGuard';

export const MIN_SEGMENT_BYTES = 5 * 1024 * 1024 + 256 * 1024;

export type UploadSegment = (blob: Blob, segmentIndex: number, isFinal: boolean) => Promise<unknown>;

export interface SegmentedRecorderOptions {
  stream: MediaStream;
  upload: UploadSegment;
  /** sessionStorage key that persists the next segment index across reloads. */
  storageKey: string;
  label: string;
  mimeCandidates?: string[];
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  timesliceMs?: number;
  checkpointMs?: number;
  /** One-off early checkpoint after start (default 5 s) so a very short attempt
   *  that is closed before the first regular checkpoint still has footage on
   *  the server. Pass 0 to disable. */
  firstCheckpointMs?: number;
  /** Minimum buffered bytes before a checkpoint uploads. Default = S3 part minimum;
   *  pass 0 when the backend stages small segments (assessment) so every 30 s flushes. */
  minSegmentBytes?: number;
  onError?: (errorName: string) => void;
}

const DEFAULT_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4',
];

const readIndex = (key: string): number => {
  try {
    const v = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
    const n = v != null ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
};
const writeIndex = (key: string, next: number) => {
  try { window.sessionStorage.setItem(key, String(next)); } catch { /* ignore */ }
};
const clearIndex = (key: string) => {
  try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
};

/** Forget persisted segment numbering (call when a NEW attempt starts). */
export function resetRecorderSegments(...storageKeys: string[]): void {
  storageKeys.forEach(clearIndex);
}

export function pickSupportedMime(candidates: string[] = DEFAULT_MIME_CANDIDATES): string {
  for (const m of candidates) {
    try { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m; } catch { /* next */ }
  }
  return '';
}

export class SegmentedRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private segmentIndex: number;
  private checkpointTimer: ReturnType<typeof setInterval> | null = null;
  private firstCheckpointTimer: ReturnType<typeof setTimeout> | null = null;
  private checkpointInFlight = false;
  private finalizing = false;
  private finalPromise: Promise<void> | null = null;
  private readonly visHandler = () => { if (document.hidden) void this.checkpoint(); };
  // pagehide = the tab is going away. Best effort: the browser may cancel the
  // upload, but anything already sent by an earlier checkpoint is safe.
  private readonly pageHideHandler = () => { void this.checkpoint(); };

  constructor(private readonly opts: SegmentedRecorderOptions) {
    this.segmentIndex = readIndex(opts.storageKey);
  }

  get state(): RecordingState | 'inactive' { return this.recorder?.state ?? 'inactive'; }
  get nextSegmentIndex(): number { return this.segmentIndex; }

  start(): void {
    if (this.recorder) return;
    const mime = pickSupportedMime(this.opts.mimeCandidates);
    const recorder = new MediaRecorder(this.opts.stream, {
      ...(mime ? { mimeType: mime } : {}),
      ...(this.opts.videoBitsPerSecond ? { videoBitsPerSecond: this.opts.videoBitsPerSecond } : {}),
      ...(this.opts.audioBitsPerSecond ? { audioBitsPerSecond: this.opts.audioBitsPerSecond } : {}),
    });
    recorder.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    recorder.onerror = (e: Event) => {
      const name = (e as unknown as { error?: { name?: string } }).error?.name ?? 'unknown';
      console.error(`[${this.opts.label}] MediaRecorder error (${name}); state=${recorder.state}`);
      this.opts.onError?.(name);
      void this.checkpoint();
    };
    recorder.start(this.opts.timesliceMs ?? 5000);
    this.recorder = recorder;
    this.checkpointTimer = setInterval(() => { void this.checkpoint(); }, this.opts.checkpointMs ?? 30_000);
    const firstMs = this.opts.firstCheckpointMs ?? 5000;
    if (firstMs > 0) {
      this.firstCheckpointTimer = setTimeout(() => {
        this.firstCheckpointTimer = null;
        void this.checkpoint();
      }, firstMs);
    }
    document.addEventListener('visibilitychange', this.visHandler);
    window.addEventListener('pagehide', this.pageHideHandler);
    console.log(`[${this.opts.label}] started mime=${recorder.mimeType || mime || 'default'} segment=${this.segmentIndex}`);
  }

  /** Force ondataavailable now (one-shot), with a safety timeout for throttled tabs. */
  private requestData(recorder: MediaRecorder): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const original = recorder.ondataavailable;
      const finish = () => { if (done) return; done = true; recorder.ondataavailable = original; resolve(); };
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
        finish();
      };
      try { recorder.requestData(); } catch { finish(); return; }
      setTimeout(finish, 1500);
    });
  }

  /** Upload what is buffered right now (submit, leave-page prompt). Same rules
   *  as a timed checkpoint; a no-op while one is in flight or after stop(). */
  flushNow(): Promise<void> {
    return this.checkpoint();
  }

  /** Flush pending frames; upload a segment when ≥ MIN_SEGMENT_BYTES is buffered. */
  async checkpoint(): Promise<void> {
    if (this.checkpointInFlight || this.finalizing) return;
    const recorder = this.recorder;
    if (!recorder || recorder.state !== 'recording') return;
    this.checkpointInFlight = true;
    try {
      await this.requestData(recorder);
      const buffered = this.chunks.reduce((sum, c) => sum + c.size, 0);
      const minBytes = this.opts.minSegmentBytes ?? MIN_SEGMENT_BYTES;
      if (buffered === 0 || buffered < minBytes) return;
      const chunks = this.chunks;
      this.chunks = [];
      const index = this.segmentIndex;
      const blob = new Blob(chunks, { type: (recorder.mimeType || 'video/webm').split(';')[0] });
      try {
        await this.opts.upload(blob, index, false);
        this.segmentIndex = index + 1;
        writeIndex(this.opts.storageKey, this.segmentIndex);
        console.log(`[${this.opts.label}] segment ${index} uploaded (${(blob.size / 1048576).toFixed(1)} MB)`);
      } catch (err) {
        this.chunks = chunks.concat(this.chunks); // retry later under the same index
        console.warn(`[${this.opts.label}] segment ${index} upload failed — will retry:`, err);
      }
    } finally {
      this.checkpointInFlight = false;
    }
  }

  /** Stop recording and ship the final part. Single-flight; safe to call twice. */
  stop(): Promise<void> {
    if (this.finalPromise) return this.finalPromise;
    this.finalizing = true;
    if (this.checkpointTimer) { clearInterval(this.checkpointTimer); this.checkpointTimer = null; }
    if (this.firstCheckpointTimer) { clearTimeout(this.firstCheckpointTimer); this.firstCheckpointTimer = null; }
    document.removeEventListener('visibilitychange', this.visHandler);
    window.removeEventListener('pagehide', this.pageHideHandler);
    const recorder = this.recorder;
    this.recorder = null;

    this.finalPromise = (async () => {
      for (let i = 0; i < 60 && this.checkpointInFlight; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (recorder && recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          recorder.onstop = done;
          const t = setTimeout(done, 3000);
          try { recorder.stop(); } catch { clearTimeout(t); resolve(); }
        });
      }
      const chunks = this.chunks;
      this.chunks = [];
      const index = this.segmentIndex;
      const nothingRecorded = chunks.length === 0 && index === 0;
      if (nothingRecorded) {
        console.log(`[${this.opts.label}] nothing recorded — no final upload`);
        return;
      }
      const blob = new Blob(chunks, { type: ((recorder?.mimeType) || 'video/webm').split(';')[0] });
      const attempts = 4;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await this.opts.upload(blob, index, true);
          this.segmentIndex = index + 1;
          clearIndex(this.opts.storageKey);
          console.log(`[${this.opts.label}] final segment ${index} uploaded (${(blob.size / 1048576).toFixed(1)} MB)${attempt > 1 ? ` on attempt ${attempt}` : ''}`);
          return;
        } catch (err) {
          if (attempt < attempts) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
            continue;
          }
          console.error(`[${this.opts.label}] final upload FAILED after ${attempts} attempts — server-side salvage will assemble the uploaded parts:`, err);
        }
      }
    })();
    return this.finalPromise;
  }
}

/**
 * A canvas that repaints from a <video> element at `fps` and exposes a
 * captureStream() video track. The track never changes identity, so the
 * recorder survives camera swaps/unplugs; when no live frame is available a
 * "Camera disconnected" placeholder is painted so the file stays continuous.
 */
export function createCanvasRelayTrack(
  getVideo: () => HTMLVideoElement | null,
  isLive: () => boolean,
  fps = 15,
): { track: MediaStreamTrack | null; stop: () => void } {
  try {
    const src0 = getVideo();
    const canvas = document.createElement('canvas');
    canvas.width = src0?.videoWidth || 640;
    canvas.height = src0?.videoHeight || 480;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return { track: null, stop: () => {} };
    markAppOwnedCanvas(canvas);
    const timer = setInterval(() => {
      const src = getVideo();
      if (src && src.readyState >= 2 && isLive()) {
        if (src.videoWidth && (canvas.width !== src.videoWidth || canvas.height !== src.videoHeight)) {
          canvas.width = src.videoWidth; canvas.height = src.videoHeight;
        }
        try { ctx.drawImage(src, 0, 0, canvas.width, canvas.height); } catch { /* frame skipped */ }
      } else {
        const { width: w, height: h } = canvas;
        ctx.fillStyle = '#0f1929';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.max(12, Math.round(h / 18))}px system-ui, sans-serif`;
        ctx.fillText('Camera disconnected', w / 2, h / 2);
      }
    }, Math.round(1000 / fps));
    const track = canvas.captureStream(fps).getVideoTracks()[0] ?? null;
    return { track, stop: () => { clearInterval(timer); try { track?.stop(); } catch { /* ignore */ } } };
  } catch (e) {
    console.warn('[Recording] canvas relay unavailable:', e);
    return { track: null, stop: () => {} };
  }
}
