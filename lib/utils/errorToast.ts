import { toast } from 'sonner';
import { errorText, isFriendlyErrorText } from './friendlyError';

/**
 * An error toast that says what failed AND what to do next.
 *
 *   showErrorToast(error, "Couldn't load scores for this job", { retry: () => load(jdId) })
 *
 *   ┌───────────────────────────────────────────┐
 *   │ ✕ Couldn't load scores for this job        │  ← title: what failed (the caller's words)
 *   │   Check your internet connection and try   │  ← description: why / next step, picked
 *   │   again.                         [Retry]   │    from the error; Retry when given
 *   └───────────────────────────────────────────┘
 *
 * The description, most specific first:
 *   - offline / network error / timeout  → check your connection
 *   - 401  → session expired, sign in again
 *   - 403  → no permission, ask an admin (with the backend's reason when it has one)
 *   - 404  → it may have been deleted, refresh
 *   - 429  → too many requests, wait a moment
 *   - 5xx  → problem on our side, try again in a minute
 *   - a readable backend detail ("Not enough Resume Scoring units") → shown as-is
 *   - otherwise → try again / contact support
 * Technical text (stack traces, "Request failed with status code 500") never
 * reaches the user — friendlyError's filter decides what is readable.
 */

export interface ErrorToastOptions {
  /** Adds a Retry button that runs this. */
  retry?: () => unknown;
  /** Same id = the toast is replaced, not stacked (polling, repeated loads). */
  id?: string | number;
  /** Override the picked next-step text. */
  description?: string;
}

const statusOf = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { status?: unknown; response?: { status?: unknown } };
  const status = typeof e.status === 'number' ? e.status : e.response?.status;
  return typeof status === 'number' ? status : undefined;
};

const isNetworkError = (error: unknown, text: string): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') return true;
  return /network error|failed to fetch|timeout of \d+ms|load failed/i.test(text);
};

/** The "why / what next" line for an error. Exported for inline error states. */
export function errorNextStep(error: unknown): string {
  const raw = errorText(error);
  // handleApiError prefixes 403s; the reason after it is what the user needs.
  const detail = raw.replace(/^permission denied:\s*/i, '').trim();
  const readable = isFriendlyErrorText(detail) ? detail : '';
  const status = statusOf(error);

  if (isNetworkError(error, raw)) return 'Check your internet connection and try again.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) {
    return readable
      ? `${readable.replace(/\.?$/, '.')} Ask your admin if you need access.`
      : "You don't have permission for this. Ask your admin for access.";
  }
  if (status === 404) return 'It may have been deleted or moved. Refresh the page and try again.';
  if (status === 429) return 'Too many requests right now. Wait a moment and try again.';
  if (status !== undefined && status >= 500) return 'Something went wrong on our side. Please try again in a minute.';
  if (readable) return readable;
  return 'Please try again. If it keeps happening, contact support.';
}

/** Shows the toast; returns its id. */
export function showErrorToast(error: unknown, title: string, options: ErrorToastOptions = {}): string | number {
  const { retry, id, description } = options;
  return toast.error(title, {
    id,
    description: description ?? errorNextStep(error),
    duration: retry ? 10000 : 6000,
    action: retry ? { label: 'Retry', onClick: () => { void retry(); } } : undefined,
  });
}
