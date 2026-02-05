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

// Define admin-only routes (tenant_admin required)
const adminRoutes = [
  '/organization',
  '/subscription',
  '/settings',
  '/analytics/team-usage',
  '/analytics/activity-logs',
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
function decodeJwtPayload(token: string): { role?: string; exp?: number } | null {
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

  // Check if route is admin-only
  const isAdminRoute = adminRoutes.some(route =>
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

  // Validate token if present
  if (token) {
    const payload = decodeJwtPayload(token);

    // Check if token is expired
    if (payload?.exp && payload.exp * 1000 < Date.now()) {
      console.log('[MIDDLEWARE] Token expired, redirecting to login');
      const response = NextResponse.redirect(new URL('/login', request.url));
      // Clear the expired cookie
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }

    // Check admin routes - only tenant_admin can access
    if (isAdminRoute && payload?.role !== 'tenant_admin') {
      console.log('[MIDDLEWARE] Unauthorized access to admin route:', pathname, 'role:', payload?.role);
      // Redirect non-admins to dashboard with error
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(url);
    }
  }

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
