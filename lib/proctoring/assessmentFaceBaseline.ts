export type AssessmentFaceBaselineSource = 'system_check' | 'assessment_bootstrap';

interface StoredAssessmentFaceBaseline {
  version: 1;
  source: AssessmentFaceBaselineSource;
  createdAt: string;
  descriptor: number[];
}

export interface AssessmentFaceBaselineRecord {
  descriptor: Float32Array;
  source: AssessmentFaceBaselineSource;
  createdAt: string;
}

const STORAGE_PREFIX = 'assessment_face_baseline:';

function getStorageKey(token: string): string {
  return `${STORAGE_PREFIX}${token}`;
}

export function readAssessmentFaceBaseline(token: string): AssessmentFaceBaselineRecord | null {
  if (!token || typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(token));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredAssessmentFaceBaseline> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.descriptor) ||
      typeof parsed.createdAt !== 'string' ||
      (parsed.source !== 'system_check' && parsed.source !== 'assessment_bootstrap')
    ) {
      return null;
    }

    return {
      descriptor: new Float32Array(parsed.descriptor),
      source: parsed.source,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function writeAssessmentFaceBaseline(
  token: string,
  descriptor: Float32Array,
  source: AssessmentFaceBaselineSource,
): void {
  if (!token || typeof window === 'undefined') return;

  try {
    const payload: StoredAssessmentFaceBaseline = {
      version: 1,
      source,
      createdAt: new Date().toISOString(),
      descriptor: Array.from(descriptor),
    };
    window.sessionStorage.setItem(getStorageKey(token), JSON.stringify(payload));
  } catch {
    // Ignore session storage failures.
  }
}

export function clearAssessmentFaceBaseline(token: string): void {
  if (!token || typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(getStorageKey(token));
  } catch {
    // Ignore session storage failures.
  }
}
