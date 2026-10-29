/**
 * The text an error toast shows for a caught error.
 *
 * Services throw `ApiError(detail)` (see handleApiError in lib/services/api.ts),
 * so `error.message` is usually the backend's own `detail`, written for
 * recruiters ("This JD is used in Resume Scoring"): that passes through.
 * When there is no detail, axios's transport text ("Request failed with status
 * code 500", "Network Error") or a code error ("Cannot read properties of
 * undefined") ends up there instead, and blank / "Unknown error" happen too.
 * Those fall back to `fallback`, which names what failed.
 *
 * Accepts an Error, an axios error, a parsed response body ({ detail }), a
 * bare detail object ({ message }) or a string.
 */

const TECHNICAL: RegExp[] = [
  /^request failed with status code/i,
  /^network error$/i,
  /^failed to fetch$/i,
  /^timeout of \d+ms exceeded/i,
  /\b(undefined|null|NaN)\b/,
  /\[object \w+\]/,
  /^\w*Error\b/, // "TypeError: …", "AxiosError …"
  /cannot read propert/i,
  /is not a function/i,
  /is not defined/i,
  /unexpected token/i,
  /traceback|exception|stack trace/i,
  /internal server error/i,
  /^an unexpected error occurred\.?$/i,
  /^unknown error\.?$/i,
  /^something went wrong\.?$/i,
  /^validation error$/i,
  /^(field required|value is not a valid|input should be)/i,
  /^[[{<]/, // JSON or HTML bodies
];

const MAX_LENGTH = 200;

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message;
  }
  return '';
};

/** The most specific message an error carries: backend detail first, then its own message. */
export const errorText = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';
  const e = error as { response?: { data?: { detail?: unknown } }; detail?: unknown; message?: unknown };
  return (
    asText(e.response?.data?.detail) ||
    asText(e.detail) ||
    (typeof e.message === 'string' ? e.message : '')
  ).trim();
};

export const isFriendlyErrorText = (text: string): boolean =>
  !!text && text.length <= MAX_LENGTH && !TECHNICAL.some(re => re.test(text));

export const friendlyErrorMessage = (error: unknown, fallback: string): string => {
  const text = errorText(error);
  return isFriendlyErrorText(text) ? text : fallback;
};
