import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookies, isTrustedSessionRequest, setSessionCookies } from '@/lib/server/sessionCookies';

// POST { refresh_token }: start a session - the refresh token goes into the
// httpOnly cookie and is never stored by the page (lib/services/api.ts setTokens).
export async function POST(request: NextRequest) {
  if (!isTrustedSessionRequest(request)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
  if (!refreshToken || refreshToken.split('.').length !== 3) {
    return NextResponse.json({ detail: 'refresh_token is required' }, { status: 400 });
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
