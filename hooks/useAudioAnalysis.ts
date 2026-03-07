import { useRef, useCallback } from "react";
import type { VisemeWeights } from "@/components/ai-interview/avatar3d/avatar3d-types";
import { DEFAULT_VISEME_WEIGHTS } from "@/components/ai-interview/avatar3d/avatar3d-types";

/**
 * Real-time audio analysis hook that replaces random `Math.random() * 0.6 + 0.2`
 * mouth openness with actual RMS amplitude and spectral-centroid-based viseme mapping.
 */
export function useAudioAnalysis() {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const freqArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedRmsRef = useRef(0);
  const smoothedCentroidRef = useRef(0);

  /**
   * Attach an AnalyserNode to the existing audio context + source node.
   * Call this once when the playback AudioContext is created.
   * Returns the AnalyserNode so callers can insert it in the audio chain:
   *   source -> analyser -> destination
   */
  const attachToContext = useCallback(
    (ctx: AudioContext, sourceNode: AudioNode): AnalyserNode => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;

      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);

      analyserRef.current = analyser;
      dataArrayRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
      freqArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      return analyser;
    },
    []
  );

  /**
   * Called per-animation-frame. Returns current mouth openness and viseme weights.
   * Uses exponential moving average for smooth transitions.
   */
  const getVisemeWeights = useCallback((): {
    mouthOpenness: number;
    visemeWeights: VisemeWeights;
  } => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const freqArray = freqArrayRef.current;

    if (!analyser || !dataArray || !freqArray) {
      return { mouthOpenness: 0, visemeWeights: DEFAULT_VISEME_WEIGHTS };
    }

    // --- RMS amplitude for jaw openness ---
    analyser.getFloatTimeDomainData(dataArray);
    let sumSq = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSq += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSq / dataArray.length);

    // Exponential moving average smoothing
    const alpha = 0.3;
    smoothedRmsRef.current =
      smoothedRmsRef.current * (1 - alpha) + rms * alpha;

    // Map RMS to mouth openness (0-1), with a slight boost for responsiveness
    const mouthOpenness = Math.min(1, smoothedRmsRef.current * 8);

    // --- Spectral centroid for viseme mapping ---
    analyser.getByteFrequencyData(freqArray);
    let weightedSum = 0;
    let totalMag = 0;
    for (let i = 0; i < freqArray.length; i++) {
      weightedSum += i * freqArray[i];
      totalMag += freqArray[i];
    }

    const centroid = totalMag > 0 ? weightedSum / totalMag : 0;
    const normalizedCentroid = centroid / freqArray.length; // 0-1

    smoothedCentroidRef.current =
      smoothedCentroidRef.current * 0.7 + normalizedCentroid * 0.3;

    const c = smoothedCentroidRef.current;
    const o = mouthOpenness;

    // Map spectral centroid to viseme weights
    // High freq -> SS/FF (sibilants), Mid -> E/I, Low -> O/U/AA
    const weights: VisemeWeights = { ...DEFAULT_VISEME_WEIGHTS };
    weights.viseme_sil = Math.max(0, 1 - o * 2);

    if (o > 0.05) {
      if (c > 0.55) {
        // High frequency — sibilants
        weights.viseme_SS = o * 0.7;
        weights.viseme_FF = o * 0.4;
        weights.viseme_TH = o * 0.2;
      } else if (c > 0.35) {
        // Mid-high — front vowels
        weights.viseme_E = o * 0.7;
        weights.viseme_I = o * 0.5;
        weights.viseme_DD = o * 0.2;
      } else if (c > 0.2) {
        // Mid — open vowels
        weights.viseme_aa = o * 0.8;
        weights.viseme_nn = o * 0.3;
        weights.viseme_RR = o * 0.2;
      } else {
        // Low frequency — back vowels / bilabials
        weights.viseme_O = o * 0.7;
        weights.viseme_U = o * 0.5;
        weights.viseme_PP = o * 0.3;
      }
    }

    return { mouthOpenness, visemeWeights: weights };
  }, []);

  /** Detach and clean up the analyser */
  const detach = useCallback(() => {
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }
    dataArrayRef.current = null;
    freqArrayRef.current = null;
    smoothedRmsRef.current = 0;
    smoothedCentroidRef.current = 0;
  }, []);

  return { attachToContext, getVisemeWeights, detach };
}
