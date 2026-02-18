import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public routes that don't require authentication
const publicRoutes = [
  '/',
  '/pricing',
  '/features',
  '/how-it-works',
  '/about',
  '/careers',
  '/contact',
  '/faq',
  '/login',
  '/signup',
  '/assessment', // Candidate assessment portal (public)
  '/ai-interview', // Candidate AI interview portal (public)
];

// Define protected dashboard routes (authentication required)
const protectedRoutes = [
  '/dashboard',
  '/recruitment',
  '/organization',
  '/subscription',
  '/settings',
  '/analytics',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  // Check if route is protected (requires authentication)
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  // Get auth token from cookie
  const token = request.cookies.get('accessToken')?.value;

  // Diagnostic logging for cross-browser token debugging
  if (!isPublicRoute && isProtectedRoute && !token) {
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ua = userAgent.toLowerCase();

    // Detect specific browsers
    const browserType = ua.includes('firefox') ? 'Firefox'
      : ua.includes('safari') && !ua.includes('chrome') ? 'Safari'
      : /iphone|ipad|ipod/.test(ua) ? 'iOS Safari'
      : ua.includes('arc') ? 'Arc'
      : ua.includes('brave') ? 'Brave'
      : ua.includes('edg') ? 'Edge'
      : ua.includes('chrome') ? 'Chrome'
      : 'Unknown';

    console.log('[MIDDLEWARE] No token cookie found', {
      pathname,
      browser: browserType,
      userAgent: userAgent.substring(0, 100), // First 100 chars for debugging
      referer: request.headers.get('referer'),
    });
  }

  // If trying to access protected route without token, redirect to login
  if (!isPublicRoute && isProtectedRoute && !token) {
    console.log('[MIDDLEWARE] No token found, redirecting to login from:', pathname);
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // NOTE: We intentionally DO NOT check token expiry here in middleware
  // Reason: Middleware runs server-side BEFORE client-side token refresh can happen
  // If we redirect on expired tokens here, users get logged out even though their
  // refresh token might still be valid and the client could auto-refresh the access token.
  //
  // Instead, we let the backend API validate tokens and return 401 if invalid/expired,
  // which triggers the client-side axios interceptor to attempt token refresh.
  // Only if refresh fails does the user get logged out (handled by api.ts interceptor).
  //
  // This middleware only checks: "Does a token cookie exist?" not "Is it valid?"

  // Authorization (role/permission-based route access) is handled client-side
  // by AuthProvider + usePermissions hooks, which check user.permissions from
  // the backend API. tenant_admin bypasses all permissions; other roles are
  // granted access based on their explicitly assigned permissions.

  // If logged in and trying to access auth pages, redirect to dashboard
  if (token && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - logos (logo files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|logos).*)',
  ],
};
