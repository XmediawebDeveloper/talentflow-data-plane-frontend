'use client';

export const FACE_API_MODEL_URLS = [
  '/models',
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/0.22.2/weights',
] as const;

export const MIN_CONFIDENT_FACE_SCORE = 0.6;

const MIN_ABSOLUTE_FACE_AREA_RATIO = 0.008;
const MIN_RELATIVE_FACE_AREA_RATIO = 0.25;
const MIN_FACE_WIDTH_RATIO = 0.08;
const MIN_FACE_HEIGHT_RATIO = 0.12;
const MIN_CANDIDATE_FACE_AREA_RATIO = 0.02;
const MIN_CANDIDATE_FACE_WIDTH_RATIO = 0.13;
const MIN_CANDIDATE_FACE_HEIGHT_RATIO = 0.16;
const MIN_CANDIDATE_FACE_CENTER_X_RATIO = 0.18;
const MAX_CANDIDATE_FACE_CENTER_X_RATIO = 0.82;
const MIN_CANDIDATE_FACE_CENTER_Y_RATIO = 0.16;
const MAX_CANDIDATE_FACE_CENTER_Y_RATIO = 0.84;

export interface FaceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  score?: number | null;
}

export interface FaceVisibilityMetrics {
  areaRatio: number;
  widthRatio: number;
  heightRatio: number;
  centerXRatio: number;
  centerYRatio: number;
}

export interface FaceVisibilityAssessment {
  visible: boolean;
  reason: 'ok' | 'face_too_small' | 'face_off_center' | 'invalid_frame';
  metrics: FaceVisibilityMetrics;
}

interface LoadableFaceApiNet {
  isLoaded: boolean;
  loadFromUri: (uri: string) => Promise<void>;
}

type FrameSource = HTMLVideoElement | HTMLCanvasElement;

function getRegionArea(region: FaceRegion): number {
  return Math.max(region.width, 0) * Math.max(region.height, 0);
}

function normalizeRegion(region: FaceRegion | null | undefined): FaceRegion | null {
  if (!region) return null;
  if (!Number.isFinite(region.x) || !Number.isFinite(region.y)) return null;
  if (!Number.isFinite(region.width) || !Number.isFinite(region.height)) return null;
  if (region.width <= 0 || region.height <= 0) return null;
  return region;
}

export async function loadFaceApiNetWithFallback(
  net: LoadableFaceApiNet,
  urls: readonly string[] = FACE_API_MODEL_URLS,
): Promise<void> {
  if (net.isLoaded) return;

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      await net.loadFromUri(url);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Face-api model unavailable');
}

export function getFrameDimensions(source: FrameSource): { width: number; height: number } | null {
  if (source instanceof HTMLVideoElement) {
    if (source.videoWidth <= 0 || source.videoHeight <= 0) return null;
    return { width: source.videoWidth, height: source.videoHeight };
  }

  if (source.width <= 0 || source.height <= 0) return null;
  return { width: source.width, height: source.height };
}

export function getFaceVisibilityMetrics(
  region: FaceRegion,
  frameWidth: number,
  frameHeight: number,
): FaceVisibilityMetrics {
  const safeFrameWidth = Math.max(frameWidth, 1);
  const safeFrameHeight = Math.max(frameHeight, 1);
  const centerX = region.x + (region.width / 2);
  const centerY = region.y + (region.height / 2);

  return {
    areaRatio: getRegionArea(region) / Math.max(safeFrameWidth * safeFrameHeight, 1),
    widthRatio: region.width / safeFrameWidth,
    heightRatio: region.height / safeFrameHeight,
    centerXRatio: centerX / safeFrameWidth,
    centerYRatio: centerY / safeFrameHeight,
  };
}

export function assessCandidateFaceVisibility(
  region: FaceRegion | null,
  frameWidth: number,
  frameHeight: number,
): FaceVisibilityAssessment {
  const fallbackMetrics: FaceVisibilityMetrics = {
    areaRatio: 0,
    widthRatio: 0,
    heightRatio: 0,
    centerXRatio: 0,
    centerYRatio: 0,
  };

  const normalized = normalizeRegion(region);
  if (!normalized || frameWidth <= 0 || frameHeight <= 0) {
    return {
      visible: false,
      reason: 'invalid_frame',
      metrics: fallbackMetrics,
    };
  }

  const metrics = getFaceVisibilityMetrics(normalized, frameWidth, frameHeight);
  const sizeVisible =
    metrics.areaRatio >= MIN_CANDIDATE_FACE_AREA_RATIO &&
    metrics.widthRatio >= MIN_CANDIDATE_FACE_WIDTH_RATIO &&
    metrics.heightRatio >= MIN_CANDIDATE_FACE_HEIGHT_RATIO;

  if (!sizeVisible) {
    return {
      visible: false,
      reason: 'face_too_small',
      metrics,
    };
  }

  const centeredVisible =
    metrics.centerXRatio >= MIN_CANDIDATE_FACE_CENTER_X_RATIO &&
    metrics.centerXRatio <= MAX_CANDIDATE_FACE_CENTER_X_RATIO &&
    metrics.centerYRatio >= MIN_CANDIDATE_FACE_CENTER_Y_RATIO &&
    metrics.centerYRatio <= MAX_CANDIDATE_FACE_CENTER_Y_RATIO;

  if (!centeredVisible) {
    return {
      visible: false,
      reason: 'face_off_center',
      metrics,
    };
  }

  return {
    visible: true,
    reason: 'ok',
    metrics,
  };
}

export function createVideoFrameCanvas(
  videoElement: HTMLVideoElement,
  maxWidth = 640,
): HTMLCanvasElement | null {
  const frame = getFrameDimensions(videoElement);
  if (!frame) return null;
  if (typeof document === 'undefined') return null;

  const scale = frame.width > maxWidth ? maxWidth / frame.width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(frame.width * scale));
  canvas.height = Math.max(1, Math.round(frame.height * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch {
    return null;
  }
}

export function filterSignificantFaces<T>(
  items: T[],
  getRegion: (item: T) => FaceRegion | null,
  frameWidth: number,
  frameHeight: number,
): T[] {
  if (frameWidth <= 0 || frameHeight <= 0) return [];

  const normalized = items
    .map((item) => {
      const region = normalizeRegion(getRegion(item));
      return region ? { item, region } : null;
    })
    .filter((value): value is { item: T; region: FaceRegion } => value !== null);

  if (normalized.length === 0) return [];

  const frameArea = frameWidth * frameHeight;
  const largestArea = normalized.reduce((largest, { region }) => {
    return Math.max(largest, getRegionArea(region));
  }, 0);

  const minArea = Math.max(
    frameArea * MIN_ABSOLUTE_FACE_AREA_RATIO,
    largestArea * MIN_RELATIVE_FACE_AREA_RATIO,
  );
  const minWidth = frameWidth * MIN_FACE_WIDTH_RATIO;
  const minHeight = frameHeight * MIN_FACE_HEIGHT_RATIO;

  return normalized
    .filter(({ region }) => {
      const area = getRegionArea(region);
      return area >= minArea && region.width >= minWidth && region.height >= minHeight;
    })
    .sort((left, right) => getRegionArea(right.region) - getRegionArea(left.region))
    .map(({ item }) => item);
}

export function pickPrimaryFace<T>(
  items: T[],
  getRegion: (item: T) => FaceRegion | null,
  frameWidth: number,
  frameHeight: number,
): T | null {
  const candidates = filterSignificantFaces(items, getRegion, frameWidth, frameHeight);
  if (candidates.length === 0) return null;

  const frameArea = Math.max(frameWidth * frameHeight, 1);
  const frameCenterX = frameWidth / 2;
  const frameCenterY = frameHeight / 2;
  const frameDiagonal = Math.max(Math.hypot(frameWidth, frameHeight), 1);

  let bestCandidate: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const item of candidates) {
    const region = normalizeRegion(getRegion(item));
    if (!region) continue;

    const areaRatio = getRegionArea(region) / frameArea;
    const centerX = region.x + (region.width / 2);
    const centerY = region.y + (region.height / 2);
    const distanceFromCenter = Math.hypot(centerX - frameCenterX, centerY - frameCenterY) / frameDiagonal;
    const centerScore = 1 - Math.min(Math.max(distanceFromCenter, 0), 1);
    const confidenceScore = typeof region.score === 'number' ? Math.min(Math.max(region.score, 0), 1) : 0.5;
    const compositeScore = (areaRatio * 0.65) + (centerScore * 0.25) + (confidenceScore * 0.1);

    if (compositeScore > bestScore) {
      bestScore = compositeScore;
      bestCandidate = item;
    }
  }

  return bestCandidate;
}
