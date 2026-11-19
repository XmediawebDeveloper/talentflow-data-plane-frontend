import { NextRequest, NextResponse } from 'next/server';

/**
 * Login session cookies (security sheet "full application" #5).
 *
 * The refresh token used to sit in localStorage and in a JS-readable cookie,
 * so one injected script could copy a 30-day session. It now lives ONLY in an
 * httpOnly cookie on this app's own host (first-party - the API is on another
 * site, where browsers block third-party cookies). Scripts never see it; the
 * /api/session routes read it server-side. The short-lived access token is
 * kept in page memory (lib/services/api.ts) and re-issued on every page load.
 *
 *   tf_rt       refresh token  httpOnly, SameSite=Strict, path /api/session
 *   tf_session  "1" marker     httpOnly, SameSite=Lax,    path /  (proxy.ts
 *                              route protection reads it server-side)
 *
 * Cookies stay host-only (no Domain): each tenant subdomain has its own
 * session, as before.
 */
export const REFRESH_COOKIE = 'tf_rt';
export const SESSION_MARKER_COOKIE = 'tf_session';
const REFRESH_PATH = '/api/session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // backend JWT_REFRESH_TOKEN_EXPIRE_DAYS

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

const isHttps = (request: NextRequest) =>
  request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';

export function setSessionCookies(request: NextRequest, response: NextResponse, refreshToken: string) {
  const secure = isHttps(request);
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true, secure, sameSite: 'strict', path: REFRESH_PATH, maxAge: MAX_AGE_SECONDS,
  });
  response.cookies.set(SESSION_MARKER_COOKIE, '1', {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, path: REFRESH_PATH, maxAge: 0 });
  response.cookies.set(SESSION_MARKER_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  // Pre-#5 JS-written token cookies, so proxy.ts and old code stop seeing them.
  response.cookies.set('accessToken', '', { path: '/', maxAge: 0 });
  response.cookies.set('refreshToken', '', { path: '/', maxAge: 0 });
}

/**
 * CSRF guard for the session routes: a custom header (a cross-site page can't
 * send one without a CORS preflight, which these routes never answer) and,
 * when the browser sends Origin, it must be this host.
 */
export function isTrustedSessionRequest(request: NextRequest): boolean {
  if (request.headers.get('x-tf-session') !== '1') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/** Client IP for the backend's per-IP refresh limit (it trusts this only from
 *  proxies listed in TRUSTED_PROXY_IPS). */
export function forwardedFor(request: NextRequest): Record<string, string> {
  const xff = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const value = xff || real;
  return value ? { 'X-Forwarded-For': value } : {};
}
