'use client';

/**
 * InterviewVoiceVerification — Voice pattern enrollment and verification.
 *
 * Uses Web Audio API to extract MFCC-like features from audio for speaker
 * comparison. This is a client-side heuristic — not forensic-grade, but
 * effective as a deterrent and early warning system.
 *
 * During system check: Records ~10s of speech, extracts spectral baseline.
 * During interview: After each ASR turn, compares the audio's spectral
 * profile with the enrolled baseline using cosine similarity.
 *
 * Thresholds (cosine similarity):
 *   > 0.85 = same speaker
 *   0.65-0.85 = acceptable / warning (voice_mismatch)
 *   < 0.65 = different speaker (voice_identity_changed)
 */

import { useRef, useCallback } from 'react';

const NUM_MFCC_COEFFICIENTS = 13;
const FFT_SIZE = 2048;
const SAME_SPEAKER_THRESHOLD = 0.85;
const DIFFERENT_SPEAKER_THRESHOLD = 0.65;

interface VoiceVerificationCallbacks {
  onVoiceMismatch?: (similarity: number) => void;
  onVoiceIdentityChanged?: (similarity: number) => void;
}

/**
 * Compute a simplified MFCC-like feature vector from PCM audio data.
 * Uses mel-scale filter banks applied to the FFT magnitude spectrum.
 */
/**
 * Pre-compute Hanning window (avoids repeated cos() calls).
 */
const HANN_WINDOW = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANN_WINDOW[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

/**
 * Pre-compute DFT twiddle factors (cos/sin lookup table).
 * Eliminates repeated Math.cos/sin calls in the inner loop.
 */
const HALF_FFT = FFT_SIZE / 2;
const DFT_COS = new Float32Array(HALF_FFT * FFT_SIZE);
const DFT_SIN = new Float32Array(HALF_FFT * FFT_SIZE);
for (let k = 0; k < HALF_FFT; k++) {
  for (let n = 0; n < FFT_SIZE; n++) {
    const angle = (2 * Math.PI * k * n) / FFT_SIZE;
    DFT_COS[k * FFT_SIZE + n] = Math.cos(angle);
    DFT_SIN[k * FFT_SIZE + n] = Math.sin(angle);
  }
}

/**
 * Max frames to process — limits CPU usage.
 * 20 evenly-spaced frames is enough for a stable spectral fingerprint.
 */
const MAX_SAMPLE_FRAMES = 20;

function extractMFCC(audioData: Float32Array, sampleRate: number): Float32Array | null {
  if (audioData.length < FFT_SIZE) return null;

  const hopSize = FFT_SIZE / 2;
  const totalFrames = Math.floor((audioData.length - FFT_SIZE) / hopSize) + 1;
  if (totalFrames <= 0) return null;

  // Sample up to MAX_SAMPLE_FRAMES evenly spaced across the audio
  const framesToProcess = Math.min(totalFrames, MAX_SAMPLE_FRAMES);
  const frameStep = totalFrames <= MAX_SAMPLE_FRAMES ? 1 : Math.floor(totalFrames / MAX_SAMPLE_FRAMES);

  const avgSpectrum = new Float32Array(HALF_FFT);
  const windowed = new Float32Array(FFT_SIZE);

  for (let fi = 0; fi < framesToProcess; fi++) {
    const frame = fi * frameStep;
    const start = frame * hopSize;

    // Hanning window (pre-computed)
    for (let i = 0; i < FFT_SIZE; i++) {
      windowed[i] = (audioData[start + i] || 0) * HANN_WINDOW[i];
    }

    // DFT magnitude using pre-computed twiddle factors
    for (let k = 0; k < HALF_FFT; k++) {
      let real = 0;
      let imag = 0;
      const kOffset = k * FFT_SIZE;
      for (let n = 0; n < FFT_SIZE; n++) {
        real += windowed[n] * DFT_COS[kOffset + n];
        imag -= windowed[n] * DFT_SIN[kOffset + n];
      }
      avgSpectrum[k] += Math.sqrt(real * real + imag * imag) / framesToProcess;
    }
  }

  // Apply mel-scale filter bank
  const melCoeffs = new Float32Array(NUM_MFCC_COEFFICIENTS);
  const maxFreq = sampleRate / 2;
  const melMax = 2595 * Math.log10(1 + maxFreq / 700);

  for (let i = 0; i < NUM_MFCC_COEFFICIENTS; i++) {
    const melLow = (melMax * i) / (NUM_MFCC_COEFFICIENTS + 1);
    const melHigh = (melMax * (i + 2)) / (NUM_MFCC_COEFFICIENTS + 1);
    const freqLow = 700 * (Math.pow(10, melLow / 2595) - 1);
    const freqHigh = 700 * (Math.pow(10, melHigh / 2595) - 1);

    const binLow = Math.floor((freqLow / maxFreq) * (FFT_SIZE / 2));
    const binHigh = Math.min(Math.ceil((freqHigh / maxFreq) * (FFT_SIZE / 2)), FFT_SIZE / 2 - 1);

    let energy = 0;
    for (let b = binLow; b <= binHigh; b++) {
      energy += avgSpectrum[b];
    }
    melCoeffs[i] = energy > 0 ? Math.log(energy) : -10;
  }

  return melCoeffs;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

export function useInterviewVoiceVerification(callbacks?: VoiceVerificationCallbacks) {
  const baselineMFCCRef = useRef<Float32Array | null>(null);
  const isEnrolledRef = useRef(false);

  /**
   * Enroll the candidate's voice during system check.
   * Records audio from the stream for the specified duration, then extracts MFCC baseline.
   *
   * @param stream - MediaStream from getUserMedia
   * @param durationMs - How long to record (default: 10000ms = 10s)
   * @returns true if enrollment succeeded
   */
  const enrollVoice = useCallback(async (
    stream: MediaStream,
    durationMs: number = 10000,
  ): Promise<boolean> => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessorNode to collect raw audio
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      const audioChunks: Float32Array[] = [];

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        audioChunks.push(new Float32Array(data));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Record for the specified duration
      await new Promise(resolve => setTimeout(resolve, durationMs));

      // Disconnect and close
      processor.disconnect();
      source.disconnect();
      await audioContext.close();

      // Concatenate all chunks
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (totalLength === 0) {
        console.warn('[VoiceVerification] No audio captured during enrollment');
        return false;
      }

      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Extract MFCC baseline — yield to main thread first to avoid UI freeze
      const sr = audioContext.sampleRate || 44100;
      await new Promise(resolve => setTimeout(resolve, 0));
      const mfcc = extractMFCC(combined, sr);
      if (!mfcc) {
        console.warn('[VoiceVerification] Failed to extract MFCC from enrollment audio');
        return false;
      }

      baselineMFCCRef.current = mfcc;
      isEnrolledRef.current = true;
      console.log(`[VoiceVerification] Voice enrolled (${(totalLength / sr).toFixed(1)}s, ${NUM_MFCC_COEFFICIENTS} coefficients)`);
      return true;
    } catch (err) {
      console.error('[VoiceVerification] Enrollment failed:', err);
      return false;
    }
  }, []);

  /**
   * Verify a voice sample against the enrolled baseline.
   * Call this after each ASR turn with the raw audio data.
   *
   * @param audioData - Float32Array of PCM audio samples
   * @param sampleRate - Sample rate of the audio
   */
  const verifyVoice = useCallback((audioData: Float32Array, sampleRate: number) => {
    if (!baselineMFCCRef.current || !isEnrolledRef.current) return;

    const mfcc = extractMFCC(audioData, sampleRate);
    if (!mfcc) return;

    const similarity = cosineSimilarity(baselineMFCCRef.current, mfcc);

    if (similarity < DIFFERENT_SPEAKER_THRESHOLD) {
      console.warn(`[VoiceVerification] IDENTITY CHANGED — similarity: ${similarity.toFixed(3)}`);
      callbacks?.onVoiceIdentityChanged?.(similarity);
    } else if (similarity < SAME_SPEAKER_THRESHOLD) {
      console.warn(`[VoiceVerification] MISMATCH — similarity: ${similarity.toFixed(3)}`);
      callbacks?.onVoiceMismatch?.(similarity);
    }
  }, [callbacks]);

  /**
   * Check if a voice baseline has been enrolled.
   */
  const hasBaseline = useCallback(() => {
    return isEnrolledRef.current;
  }, []);

  /**
   * Reset enrollment.
   */
  const reset = useCallback(() => {
    baselineMFCCRef.current = null;
    isEnrolledRef.current = false;
  }, []);

  return {
    enrollVoice,
    verifyVoice,
    hasBaseline,
    reset,
  };
}
