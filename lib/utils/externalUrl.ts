/**
 * Turn a URL extracted from a resume (often scheme-less, e.g.
 * "linkedin.com/in/jane" or "www.github.com/jane") into an absolute href.
 *
 * Without a scheme the browser treats the value as a RELATIVE path, so
 * <a href="linkedin.com/in/jane"> on /recruitment/resume-view/<id> resolves
 * to /recruitment/resume-view/linkedin.com/in/jane → 404.
 *
 * Returns undefined for empty / unsafe values (javascript:, data:, …).
 */
export function toExternalUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;

  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^mailto:/i.test(value)) return value;
  // Any other explicit scheme (javascript:, data:, vbscript:, …) is rejected.
  // "(?!\d)" keeps host:port values like "example.com:8080/x" allowed.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return undefined;

  return `https://${value.replace(/^\/+/, '')}`;
}
