import { NextRequest, NextResponse } from 'next/server';
import {
  API_BASE_URL, clearSessionCookies, forwardedFor, isTrustedSessionRequest, setSessionCookies,
} from '@/lib/server/sessionCookies';

// POST { refresh_token }: start a session - the refresh token goes into the
// httpOnly cookie and is never stored by the page (lib/services/api.ts setTokens).
//
// POST { refresh_token, validate: true }: same, but the token is first checked
// by the backend (/auth/refresh). Used by the cross-subdomain /auth/handoff
// page, whose tokens arrive in a URL anyone could craft: nothing is stored
// unless the backend accepts the token, and the response carries a fresh
// access token (never the refresh token).
export async function POST(request: NextRequest) {
  if (!isTrustedSessionRequest(request)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
  if (!refreshToken || refreshToken.split('.').length !== 3) {
    return NextResponse.json({ detail: 'refresh_token is required' }, { status: 400 });
  }
  if (body?.validate === true) {
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
      return NextResponse.json({ detail: 'Session service unavailable' }, { status: 502 });
    }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || typeof data?.access_token !== 'string' || !data.access_token) {
      const response = NextResponse.json(
        { detail: 'Sign-in link is invalid or has expired' },
        { status: upstream.status >= 500 ? 502 : 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    const { refresh_token: rotated, ...rest } = data;
    const response = NextResponse.json(rest, { headers: { 'Cache-Control': 'no-store' } });
    setSessionCookies(request, response, typeof rotated === 'string' && rotated ? rotated : refreshToken);
    return response;
  }
  const response = new NextResponse(null, { status: 204 });
  setSessionCookies(request, response, refreshToken);
  return response;
}

// DELETE: end the session on this browser (logout, session expired).
export async function DELETE(request: NextRequest) {
  if (!isTrustedSessionRequest(request)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}
