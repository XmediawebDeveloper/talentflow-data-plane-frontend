/**
 * Open-redirect guard (security sheet N4) — the ONE check every
 * `returnUrl` / `redirect` value goes through before the app navigates to it,
 * whether it came from the query string or from a backend response.
 *
 * Accepted: a same-site relative path — starts with "/", but not "//" or "/\"
 * (both mean "another host" to a browser), no control characters or
 * backslashes (browsers drop tab/newline and read "\" as "/", so
 * "/\t/evil.com" or "/\evil.com" become "//evil.com"), and it must still
 * resolve to this origin.
 *
 * Returns the path unchanged when safe, otherwise `fallback` (default null).
 */
export function safeReturnUrl(value: unknown): string | null;
export function safeReturnUrl(value: unknown, fallback: string): string;
export function safeReturnUrl(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(url)) return fallback;
  try {
    const base = 'https://return-url.invalid';
    if (new URL(url, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return url;
}
