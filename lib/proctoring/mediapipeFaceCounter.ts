/**
 * mediapipeFaceCounter — counts the people in a camera frame with MediaPipe
 * FaceDetection, the SAME model and thresholds the live proctoring uses during
 * the assessment (hooks/assessmentFaceMonitor.ts) and the AI interview
 * (components/ai-interview/proctoring/InterviewFaceDetection.ts).
 *
 * Used by the pre-start System Checks as a second opinion on "Multiple People".
 * Their main detector (face-api TinyFaceDetector, 224 px input on a 320 px
 * frame — sized so Windows Chrome's CPU path doesn't freeze the page) regularly
 * misses a smaller or partly covered second face, e.g. someone behind the
 * candidate holding a phone to their face — the system check then passed with
 * two people in frame. Counting with the in-test model also means what blocks
 * at the gate matches what is flagged during the test.
 *
 * Best-effort: resolves null when MediaPipe can't load (offline CDN) or a pass
 * times out, so callers fall back to their own detector alone.
 */

const MP_FACE_DETECTION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection';
// Same as the in-test monitors: 0.6 keeps a raised hand from scoring as a face;
// a box under 2.5 % of the frame is a poster / reflection, not a person.
const MIN_DETECTION_CONFIDENCE = 0.6;
const MIN_FACE_BOX_AREA = 0.025;
const PASS_TIMEOUT_MS = 2000;

export interface MediaPipeFaceCounter {
  /** Plausible face count in the current frame, or null if unavailable. */
  count(video: HTMLVideoElement): Promise<number | null>;
  close(): void;
}

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no document')); return; }
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });

export function createMediaPipeFaceCounter(): MediaPipeFaceCounter {
  let detector: any = null;
  let loading: Promise<any> | null = null;
  let unavailable = false;
  let closed = false;
  let pending: ((n: number | null) => void) | null = null;

  const settle = (n: number | null) => {
    const cb = pending;
    pending = null;
    cb?.(n);
  };

  const load = (): Promise<any> => {
    if (detector) return Promise.resolve(detector);
    if (!loading) {
      loading = (async () => {
        await loadScript(`${MP_FACE_DETECTION_URL}/face_detection.js`);
        const FaceDetectionClass = (window as any).FaceDetection;
        if (!FaceDetectionClass) throw new Error('FaceDetection global missing after CDN load');
        const fd = new FaceDetectionClass({ locateFile: (f: string) => `${MP_FACE_DETECTION_URL}/${f}` });
        fd.setOptions({ model: 'short', minDetectionConfidence: MIN_DETECTION_CONFIDENCE });
        fd.onResults((results: any) => {
          const n = (results?.detections || []).filter((d: any) => {
            const bb = d?.boundingBox;
            if (!bb) return true;
            return ((bb.width || 0) * (bb.height || 0)) >= MIN_FACE_BOX_AREA;
          }).length;
          settle(n);
        });
        detector = fd;
        return fd;
      })();
    }
    return loading;
  };

  return {
    async count(video) {
      if (closed || unavailable) return null;
      if (video.readyState < 2 || video.videoWidth === 0) return null;
      // Never make a caller wait for the CDN download: until the model is
      // ready, answer null (the caller's own detector stands alone) and let it
      // load in the background for the next tick.
      if (!detector) {
        load().catch((err) => {
          unavailable = true;
          console.warn('[FACE-COUNT] MediaPipe unavailable — multiple-people check uses the fallback detector only:', err);
        });
        return null;
      }
      const fd = detector;
      settle(null); // never leave an earlier caller hanging
      return new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => { if (pending) settle(null); }, PASS_TIMEOUT_MS);
        pending = (n) => { clearTimeout(timer); resolve(n); };
        Promise.resolve(fd.send({ image: video })).catch(() => settle(null));
      });
    },
    close() {
      closed = true;
      settle(null);
      try { detector?.close?.(); } catch { /* ignore */ }
      detector = null;
    },
  };
}
