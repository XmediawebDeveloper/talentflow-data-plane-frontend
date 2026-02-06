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

// Helper to decode JWT payload (without verification - just to read claims)
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

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

  // If trying to access protected route without token, redirect to login
  if (!isPublicRoute && isProtectedRoute && !token) {
    console.log('[MIDDLEWARE] No token found, redirecting to login from:', pathname);
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // Validate token expiry if present
  if (token) {
    const payload = decodeJwtPayload(token);

    // Check if token is expired
    if (payload?.exp && payload.exp * 1000 < Date.now()) {
      console.log('[MIDDLEWARE] Token expired, redirecting to login');
      const response = NextResponse.redirect(new URL('/login', request.url));
      // Clear the expired cookies with proper path
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.set('accessToken', '', { path: '/', maxAge: 0 });
      response.cookies.set('refreshToken', '', { path: '/', maxAge: 0 });
      return response;
    }
  }

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
