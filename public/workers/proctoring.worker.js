/**
 * Proctoring Web Worker
 * Handles heavy processing for voice detection and camera obstruction analysis
 * Runs in a separate thread to prevent UI blocking
 */

// Voice detection state
let voiceConsecutiveFrames = 0;
const VOICE_FRAME_THRESHOLD = 10;

// Camera obstruction state
let obstructionConsecutiveFrames = 0;
const OBSTRUCTION_FRAME_THRESHOLD = 30;

/**
 * Analyze audio frequency data for voice detection
 * @param {Uint8Array} frequencyData - Audio frequency data from AnalyserNode
 * @param {number} threshold - Voice detection threshold (0-128)
 * @param {number} sampleRate - Audio sample rate (typically 48000)
 * @returns {Object} Analysis result
 */
function analyzeVoice(frequencyData, threshold, sampleRate = 48000) {
  const bufferLength = frequencyData.length;
  const binSize = sampleRate / (bufferLength * 2); // fftSize = bufferLength * 2

  // Calculate speech frequency range bins (300Hz - 3000Hz)
  const speechStartBin = Math.floor(300 / binSize);
  const speechEndBin = Math.min(Math.floor(3000 / binSize), bufferLength);

  // Calculate average volume in speech frequency range
  let sum = 0;
  for (let i = speechStartBin; i < speechEndBin; i++) {
    sum += frequencyData[i];
  }
  const average = sum / (speechEndBin - speechStartBin);

  // Check if voice detected
  if (average > threshold) {
    voiceConsecutiveFrames++;
    if (voiceConsecutiveFrames >= VOICE_FRAME_THRESHOLD) {
      voiceConsecutiveFrames = 0;
      return {
        detected: true,
        averageVolume: average,
        threshold: threshold
      };
    }
  } else {
    voiceConsecutiveFrames = Math.max(0, voiceConsecutiveFrames - 1);
  }

  return { detected: false };
}

/**
 * Analyze image data for camera obstruction
 * @param {Uint8ClampedArray} imageData - RGBA pixel data from canvas
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} obstructionThreshold - Brightness threshold for obstruction (0-255)
 * @returns {Object} Analysis result
 */
function analyzeCameraObstruction(imageData, width, height, obstructionThreshold) {
  const pixelCount = width * height;

  let totalBrightness = 0;
  let minBrightness = 255;
  let maxBrightness = 0;

  // Process every 4th pixel for performance (still accurate enough)
  for (let i = 0; i < imageData.length; i += 16) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const brightness = (r + g + b) / 3;

    totalBrightness += brightness;
    minBrightness = Math.min(minBrightness, brightness);
    maxBrightness = Math.max(maxBrightness, brightness);
  }

  const sampledPixels = Math.floor(imageData.length / 16);
  const avgBrightness = totalBrightness / sampledPixels;
  const brightnessRange = maxBrightness - minBrightness;

  // Detect obstruction:
  // 1. Very dark image (covered by hand/object)
  // 2. Very uniform color (covered by paper/tape)
  const isDark = avgBrightness < obstructionThreshold;
  const isUniform = brightnessRange < 20;

  if (isDark || isUniform) {
    obstructionConsecutiveFrames++;
    if (obstructionConsecutiveFrames >= OBSTRUCTION_FRAME_THRESHOLD) {
      obstructionConsecutiveFrames = 0;
      return {
        obstructed: true,
        avgBrightness: avgBrightness,
        brightnessRange: brightnessRange,
        reason: isDark ? 'too_dark' : 'too_uniform'
      };
    }
  } else {
    obstructionConsecutiveFrames = Math.max(0, obstructionConsecutiveFrames - 2);
  }

  return {
    obstructed: false,
    avgBrightness: avgBrightness,
    brightnessRange: brightnessRange
  };
}

/**
 * Reset detection states (called when monitoring restarts)
 */
function resetStates() {
  voiceConsecutiveFrames = 0;
  obstructionConsecutiveFrames = 0;
}

// Message handler
self.onmessage = function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'ANALYZE_VOICE': {
      const { frequencyData, threshold, sampleRate } = data;
      const result = analyzeVoice(
        new Uint8Array(frequencyData),
        threshold,
        sampleRate
      );
      self.postMessage({ type: 'VOICE_RESULT', data: result });
      break;
    }

    case 'ANALYZE_CAMERA': {
      const { imageData, width, height, obstructionThreshold } = data;
      const result = analyzeCameraObstruction(
        new Uint8ClampedArray(imageData),
        width,
        height,
        obstructionThreshold
      );
      self.postMessage({ type: 'CAMERA_RESULT', data: result });
      break;
    }

    case 'RESET': {
      resetStates();
      self.postMessage({ type: 'RESET_COMPLETE' });
      break;
    }

    default:
      console.warn('[WORKER] Unknown message type:', type);
  }
};

// Notify main thread that worker is ready
self.postMessage({ type: 'WORKER_READY' });
