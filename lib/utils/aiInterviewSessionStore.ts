/**
 * Candidate AI Interview session-state storage.
 *
 * WHY this exists
 * ----------------
 * The candidate portal stores "which pre-interview step am I on" client-side.
 * Originally this was a direct sessionStorage call, which had two failure modes:
 *   1. sessionStorage throws (private browsing, disabled storage) — UI crashes.
 *   2. Tab closes / browser crashes — step state is wiped, even though the
 *      backend may still mark the session valid. The candidate lands on a
 *      re-auth screen and has to re-do OTP for no real security benefit.
 *
 * This wrapper:
 *   - never throws (all storage calls are try/caught);
 *   - mirrors the step to localStorage with a short TTL so an accidental tab
 *     close within the recovery window restores cleanly;
 *   - falls back to an in-memory map when both storages are unavailable.
 *
 * SECURITY NOTE: the step name alone is not sensitive — it's "intro_video" or
 * "sample_practice". The session-auth key (SESSION_AUTH_KEY, OTP-gated) is
 * intentionally NOT mirrored to localStorage. Browser close still forces OTP.
 */

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

type Persisted = { value: string; expiresAt: number };

// In-memory fallback used only when neither storage works.
const memoryStore = new Map<string, Persisted>();

function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeSessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function safeLocalGet(key: string): Persisted | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || typeof parsed.value !== 'string' || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    if (parsed.expiresAt < Date.now()) {
      try { window.localStorage.removeItem(key); } catch { /* ignore */ }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string, ttlMs: number): void {
  try {
    const payload: Persisted = { value, expiresAt: Date.now() + ttlMs };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function safeLocalRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Read the persisted step for this interview token.
 * Prefers sessionStorage (current tab), then localStorage mirror (tab was
 * reopened within the recovery window), then in-memory fallback.
 */
export function readInterviewStep(token: string): string | null {
  const sessionKey = `tf_ai_step_${token}`;
  const localKey = `tf_ai_step_mirror_${token}`;

  const fromSession = safeSessionGet(sessionKey);
  if (fromSession) return fromSession;

  const fromLocal = safeLocalGet(localKey);
  if (fromLocal) {
    // Re-hydrate sessionStorage so subsequent calls hit the fast path.
    safeSessionSet(sessionKey, fromLocal.value);
    return fromLocal.value;
  }

  const fromMemory = memoryStore.get(sessionKey);
  if (fromMemory && fromMemory.expiresAt > Date.now()) return fromMemory.value;

  return null;
}

export function writeInterviewStep(token: string, step: string, ttlMs: number = DEFAULT_TTL_MS): void {
  const sessionKey = `tf_ai_step_${token}`;
  const localKey = `tf_ai_step_mirror_${token}`;
  safeSessionSet(sessionKey, step);
  safeLocalSet(localKey, step, ttlMs);
  memoryStore.set(sessionKey, { value: step, expiresAt: Date.now() + ttlMs });
}

export function clearInterviewStep(token: string): void {
  const sessionKey = `tf_ai_step_${token}`;
  const localKey = `tf_ai_step_mirror_${token}`;
  safeSessionRemove(sessionKey);
  safeLocalRemove(localKey);
  memoryStore.delete(sessionKey);
}
