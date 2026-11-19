/**
 * Token recovery utility (retired).
 *
 * It copied tokens from localStorage into JS-readable cookies. Since security
 * sheet item #5 the refresh token lives only in an httpOnly cookie set by
 * /api/session and the access token only in memory (lib/services/api.ts), so
 * there is nothing to copy - and copying would put the tokens back where
 * scripts can read them. Kept as a no-op for existing callers.
 */
export const ensureTokenCookies = (): boolean => false;
