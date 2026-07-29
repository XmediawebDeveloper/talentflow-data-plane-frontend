"use client";

/**
 * useInterviewObjectDetection — live detection of prohibited objects (phones,
 * second screens, books) in the candidate's camera feed.
 *
 * Mirrors the shape of InterviewFaceDetection.ts on purpose — same refs-only
 * state (zero re-renders), same `setVideoElement` handoff, same callback-out
 * design — so the two read as one system to anyone maintaining them.
 *
 * The one structural difference: inference runs in a Web Worker
 * (public/workers/objectDetection.worker.js), not on the main thread. MediaPipe
 * needs DOM/WebGL and has no choice; onnxruntime-web does not, and the main
 * thread already carries two MediaPipe graphs, face-api verification, the
 * TalkingHead avatar and MediaRecorder.
 *
 * Load profile
 * ------------
 *   - Inference: one frame every DETECT_INTERVAL (3 s; 6 s on low-tier), and
 *     automatically slower on weak GPUs — see DUTY_CYCLE_DIVISOR. Measured
 *     inference on Intel Gen-9 integrated graphics is ~2.1 s/frame, so the
 *     cadence has to follow the hardware rather than assume it. Object
 *     detection at video framerate would buy nothing regardless — using a
 *     phone takes seconds, not milliseconds.
 *   - Main thread: only `createImageBitmap` + a postMessage transfer per cycle.
 *   - WebGPU is REQUIRED. See the worker header for why WASM is not an
 *     acceptable fallback for this model family.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  DETECTABLE_OBJECTS,
  WATCHED_COCO_LABELS,
  WORKER_SCORE_FLOOR,
  type ObjectEventType,
} from "./detectableObjects";

/** Payload handed to the caller; mirrors what gets persisted in `details`. */
export interface DetectedObjectEvent {
  /** EXACT class string the model emitted, e.g. "cell phone". Persisted as-is. */
  object_class: string;
  /** Recruiter-facing name, e.g. "Mobile phone". */
  object_label: string;
  confidence: number;
  /** Normalised [x, y, w, h] within the camera frame. */
  box: [number, number, number, number];
  consecutive_frames: number;
  detector: string;
}

interface UseInterviewObjectDetectionConfig {
  enabled?: boolean;
  /** Slower cadence for weak machines, matching the face-verification pattern. */
  lowTier?: boolean;
  /** Fired once per confirmed object, already de-duplicated per class. */
  onObjectDetected?: (eventType: ObjectEventType, details: DetectedObjectEvent) => void;
  /** Fired once if the detector can't start (no WebGPU, model 404, etc.). */
  onUnavailable?: (reason: string) => void;
}

const DETECT_INTERVAL = 3000;
const DETECT_INTERVAL_LOW_TIER = 6000;
const POLL_INTERVAL_MS = 250; // cheap timestamp check, same as InterviewFaceDetection

/**
 * Keep the detector's GPU duty cycle at roughly 1/N by spacing frames at
 * N× the last measured inference time.
 *
 * The fixed 2 s cadence assumed inference was ~50–150 ms. Measured reality on
 * Intel Gen-9 integrated graphics is **1.8–8.2 s per frame** — RF-DETR's
 * deformable attention is expensive on WebGPU (cf. onnxruntime#22425). A fixed
 * cadence there would queue frames back-to-back and starve the interview's own
 * rendering, so the interval follows the hardware instead of assuming it.
 */
const DUTY_CYCLE_DIVISOR = 3;
const MAX_DETECT_INTERVAL = 20000;

/**
 * Cycles a class must be ABSENT before it can raise a second event. Without
 * this, a phone left on the desk in view would re-fire every cadence tick for
 * the whole interview and bury the Integrity Check tab in duplicates. The
 * proctoring monitor also applies a per-type backend cooldown; this is the
 * per-CLASS half of the same idea, so a phone and a book don't suppress
 * each other.
 */
const REARM_AFTER_ABSENT_CYCLES = 5;

const MODEL_URL =
  process.env.NEXT_PUBLIC_OBJECT_DETECTION_MODEL_URL ||
  "/models/object-detection/rf-detr-nano.onnx";

/**
 * ORT runtime sources, tried in order.
 *
 * Same-origin FIRST, CDN only as a backstop. An earlier build loaded ORT solely
 * from jsDelivr and a candidate's network blocked it — importScripts threw and
 * object detection was silently disabled for that entire interview. Proctoring
 * must not depend on a third-party CDN being reachable from wherever the
 * candidate happens to be sitting.
 *
 * `npm run fetch:od-model` vendors the same-origin copy. The version in the CDN
 * fallback is pinned to the onnxruntime-web version in package.json.
 */
const ORT_URLS = [
  process.env.NEXT_PUBLIC_ORT_WEBGPU_URL,
  "/ort/ort.webgpu.min.js",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.webgpu.min.js",
].filter(Boolean) as string[];

const DETECTOR_NAME = "rf-detr-nano";

/**
 * Warm the HTTP cache with the detector weights.
 *
 * The model is tens of MB and the candidate would otherwise download it at
 * interview start — the exact moment they are on the clock and the main thread
 * is busiest. Call this from the System Check step so it lands during the
 * minute the candidate spends checking their camera and mic.
 *
 * Deliberately fire-and-forget: a failed prefetch costs nothing (the worker
 * fetches normally at init), so this must never surface an error or block the
 * System Check flow. Skips entirely without WebGPU, since the detector won't
 * run on that browser anyway and the bytes would be pure waste.
 */
export function prefetchObjectDetectionModel(): void {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return;
  fetch(MODEL_URL, { method: "GET", cache: "force-cache", priority: "low" } as RequestInit)
    .then(res => res.arrayBuffer())
    .then(buf => console.log(
      `[INTERVIEW_OBJECT_DETECTION] Model prefetched (${(buf.byteLength / 1e6).toFixed(1)} MB)`,
    ))
    .catch(() => { /* best-effort warm-up only */ });
}

interface ClassState {
  hits: number;
  absent: number;
  armed: boolean;
}

export function useInterviewObjectDetection(config?: UseInterviewObjectDetectionConfig) {
  // Refs only — no React state, so detection never re-renders the interview UI.
  const isReadyRef = useRef(false);
  const isUnavailableRef = useRef(false);
  const lastDetectionsRef = useRef<DetectedObjectEvent[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const frameIdRef = useRef(0);
  const classStateRef = useRef<Record<string, ClassState>>({});
  const lastInferenceMsRef = useRef(0);
  const loggedTimingRef = useRef(false);

  const callbacksRef = useRef(config);
  useEffect(() => { callbacksRef.current = config; }, [config]);

  const enabled = config?.enabled ?? true;
  const lowTier = config?.lowTier ?? false;

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    const markUnavailable = (reason: string) => {
      if (!mounted || isUnavailableRef.current) return;
      isUnavailableRef.current = true;
      console.warn("[INTERVIEW_OBJECT_DETECTION] Unavailable:", reason);
      callbacksRef.current?.onUnavailable?.(reason);
    };

    // Gate on WebGPU before spawning anything. On a browser without it the
    // worker would only fail at init anyway, and this keeps the failure cheap.
    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      markUnavailable("WebGPU not supported in this browser");
      return;
    }

    // Space frames at DUTY_CYCLE_DIVISOR× the last measured inference so slow
    // GPUs back off instead of queueing. Before the first result this is just
    // the base interval.
    const effectiveInterval = () =>
      Math.min(
        MAX_DETECT_INTERVAL,
        Math.max(baseInterval, lastInferenceMsRef.current * DUTY_CYCLE_DIVISOR),
      );

    /**
     * Confirm a class across consecutive cycles before raising it. A single
     * frame is not evidence — RF-DETR will occasionally fire one confident box
     * on a dark rectangle. Requiring N consecutive cycles (~4 s at the default
     * cadence) is what makes the signal defensible to a recruiter.
     */
    const consider = (detections: DetectedObjectEvent[]) => {
      const seen = new Set(detections.map(d => d.object_class));

      // Age out classes that were not seen this cycle.
      for (const [cls, st] of Object.entries(classStateRef.current)) {
        if (seen.has(cls)) continue;
        st.hits = 0;
        st.absent += 1;
        if (st.absent >= REARM_AFTER_ABSENT_CYCLES) st.armed = true;
      }

      for (const det of detections) {
        const def = DETECTABLE_OBJECTS[det.object_class];
        if (!def) continue;
        if (det.confidence < def.minConfidence) continue;
        const area = det.box[2] * det.box[3];
        if (area < def.minBoxArea) continue;

        const st = classStateRef.current[det.object_class] ??= {
          hits: 0, absent: 0, armed: true,
        };
        st.hits += 1;
        st.absent = 0;

        if (st.armed && st.hits >= def.framesToConfirm) {
          st.armed = false;
          callbacksRef.current?.onObjectDetected?.(def.eventType, {
            ...det,
            consecutive_frames: st.hits,
          });
        }
      }
    };

    let worker: Worker;
    try {
      worker = new Worker("/workers/objectDetection.worker.js");
    } catch (err) {
      markUnavailable(`Worker failed to start: ${(err as Error)?.message ?? err}`);
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      if (!mounted) return;
      const msg = e.data;

      if (msg.type === "ready") {
        isReadyRef.current = true;
        console.log(
          `[INTERVIEW_OBJECT_DETECTION] Ready — ${msg.backend}, ` +
          `input ${msg.inputSize}px, labels ${msg.labelSpace}, ort ${msg.ortUrl}`,
        );
        startLoop();
        return;
      }

      if (msg.type === "init-failed") {
        markUnavailable(msg.error);
        return;
      }

      if (msg.type === "detections") {
        inFlightRef.current = false;
        if (typeof msg.inferenceMs === "number") {
          lastInferenceMsRef.current = msg.inferenceMs;
          if (!loggedTimingRef.current) {
            loggedTimingRef.current = true;
            console.log(
              `[INTERVIEW_OBJECT_DETECTION] First inference ${Math.round(msg.inferenceMs)} ms ` +
              `→ cadence ${Math.round(effectiveInterval())} ms`,
            );
          }
        }
        const mapped: DetectedObjectEvent[] = (msg.detections || []).map((d: any) => ({
          object_class: d.label,
          object_label: DETECTABLE_OBJECTS[d.label]?.displayLabel ?? d.label,
          confidence: d.score,
          box: d.box,
          consecutive_frames: 0,
          detector: DETECTOR_NAME,
        }));
        lastDetectionsRef.current = mapped;
        consider(mapped);
        return;
      }

      if (msg.type === "detect-failed") {
        inFlightRef.current = false;
        console.warn("[INTERVIEW_OBJECT_DETECTION] Frame failed:", msg.error);
      }
    };

    worker.onerror = (err) => {
      inFlightRef.current = false;
      markUnavailable(`Worker error: ${err.message || "unknown"}`);
    };

    worker.postMessage({
      type: "init",
      modelUrl: MODEL_URL,
      ortUrls: ORT_URLS,
      // 384×384 — matches preprocessor_config.json for rfdetr_nano-ONNX. The
      // worker overrides this from the model's own static input shape if the
      // export pins one, so a different export can't silently run at the
      // wrong resolution.
      inputSize: 384,
      watchedLabels: WATCHED_COCO_LABELS,
      scoreFloor: WORKER_SCORE_FLOOR,
    });

    // Self-scheduling timer rather than requestAnimationFrame — same reasoning
    // as InterviewFaceDetection's Phase 1 perf fix: rAF would wake the main
    // thread 60×/s just to read a clock.
    const baseInterval = lowTier ? DETECT_INTERVAL_LOW_TIER : DETECT_INTERVAL;
    const startLoop = () => {
      if (timerRef.current !== null) return;
      let lastDetect = 0;

      const tick = async () => {
        if (!mounted) return;
        const now = performance.now();
        const video = videoRef.current;

        const due = now - lastDetect >= effectiveInterval();
        const capturable = video && video.readyState >= 2 && video.videoWidth > 0;

        // Skip rather than queue when the previous frame is still running —
        // a backlog would turn a transient slowdown into permanent lag.
        if (due && capturable && !inFlightRef.current && isReadyRef.current) {
          lastDetect = now;
          inFlightRef.current = true;
          try {
            const bitmap = await createImageBitmap(video as HTMLVideoElement);
            const frameId = ++frameIdRef.current;
            workerRef.current?.postMessage({ type: "detect", bitmap, frameId }, [bitmap]);
          } catch {
            inFlightRef.current = false; // camera not ready yet; retry next tick
          }
        }

        timerRef.current = setTimeout(tick, POLL_INTERVAL_MS) as unknown as number;
      };

      timerRef.current = setTimeout(tick, POLL_INTERVAL_MS) as unknown as number;
      console.log(
        `[INTERVIEW_OBJECT_DETECTION] Loop started (${interval} ms cadence` +
        `${lowTier ? ", low-tier" : ""})`,
      );
    };

    return () => {
      mounted = false;
      isReadyRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        worker.postMessage({ type: "dispose" });
        worker.terminate();
      } catch {}
      workerRef.current = null;
      classStateRef.current = {};
    };
  }, [enabled, lowTier]);

  return {
    isReadyRef,
    isUnavailableRef,
    lastDetectionsRef,
    setVideoElement,
  };
}
