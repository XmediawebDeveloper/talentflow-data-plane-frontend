/**
 * Transient network-failure helpers.
 *
 * Axios reports "Network Error" (code ERR_NETWORK, no `response`) whenever the
 * request never reached the server — the tab went offline, the laptop woke from
 * sleep before WiFi re-associated, a VPN blipped, or the browser aborted an
 * in-flight XHR because the page navigated away. None of those mean the endpoint
 * is broken, so background pollers should retry quietly instead of logging an
 * error (which also pops the Next.js dev error overlay) and instead of wiping
 * already-loaded state.
 */

/** True when the request never got an HTTP response back. */
export const isTransientNetworkError = (error: unknown): boolean => {
  const e = error as { code?: string; message?: string; response?: unknown } | null;
  if (!e || typeof e !== 'object') return false;

  // A real HTTP response (4xx/5xx) is NOT transient — the server answered.
  if (e.response) return false;

  const code = e.code ?? '';
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ERR_CANCELED') return true;

  return typeof e.message === 'string' && /network error|timeout|aborted|failed to fetch/i.test(e.message);
};

/** Browser online check that never throws during SSR. */
export const isOnline = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  /** Extra attempts after the first one. Default 2 (3 requests total). */
  retries?: number;
  /** Delay before the first retry, doubled each time. Default 1500ms. */
  baseDelayMs?: number;
}

/**
 * Runs `fn`, retrying with exponential backoff only on transient network
 * failures. HTTP errors (401/403/5xx) are rethrown immediately so the existing
 * interceptors and callers keep handling them exactly as before.
 */
export async function withNetworkRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 1500 } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === retries) throw error;
      // No point burning retries while the browser knows it is offline —
      // the caller's `online` listener will re-trigger the fetch.
      if (!isOnline()) throw error;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
