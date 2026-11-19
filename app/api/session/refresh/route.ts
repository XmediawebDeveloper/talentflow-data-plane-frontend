import { NextRequest, NextResponse } from 'next/server';
import {
  API_BASE_URL, REFRESH_COOKIE, clearSessionCookies, forwardedFor,
  isTrustedSessionRequest, setSessionCookies,
} from '@/lib/server/sessionCookies';

// POST: new access token from the httpOnly refresh cookie. The backend's
// /auth/refresh is called from here, so the refresh token never reaches the
// page. Returns the backend's TokenResponse WITHOUT refresh_token.
export async function POST(request: NextRequest) {
  if (!isTrustedSessionRequest(request)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const response = NextResponse.json({ detail: 'No session' }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardedFor(request) },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // Network trouble is not a logout: keep the cookie, let the page retry.
    return NextResponse.json({ detail: 'Session service unavailable' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({}));
  if (upstream.status === 401 || upstream.status === 403) {
    // Revoked / expired / logged out elsewhere - the session is gone.
    const response = NextResponse.json({ detail: data?.detail || 'Session ended' }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  if (!upstream.ok || !data?.access_token) {
    return NextResponse.json({ detail: data?.detail || 'Could not refresh session' }, { status: upstream.status >= 500 ? 502 : upstream.status });
  }

  const { refresh_token: rotated, ...rest } = data;
  const response = NextResponse.json(rest, { headers: { 'Cache-Control': 'no-store' } });
  setSessionCookies(request, response, rotated || refreshToken);
  return response;
}
