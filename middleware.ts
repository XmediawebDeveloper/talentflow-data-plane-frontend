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
  '/reset-password', // Invite-based first-login password setup
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

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || '0sms.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Extract tenant subdomain ---
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0]; // strip port for localhost:3000
  const hostParts = hostname.split('.');
  let tenantSubdomain: string | null = null;
  let isRealSubdomain = false; // true = from actual hostname (not ?org= dev param)

  // Real subdomain: acme.0sms.com → ['acme', '0sms', 'com']
  if (hostParts.length >= 3 && !['www', 'app'].includes(hostParts[0])) {
    tenantSubdomain = hostParts[0];
    isRealSubdomain = true;
  }
  // Local dev fallback: localhost:3000?org=acme (skip DB validation)
  if (!tenantSubdomain) {
    tenantSubdomain = request.nextUrl.searchParams.get('org');
  }
  // --- End subdomain extraction ---

  // --- Validate real subdomain against DB ---
  // Only for real hostnames (acme.0sms.com), not the ?org= dev shortcut
  if (tenantSubdomain && isRealSubdomain) {
    const cachedValid = request.cookies.get('tf-subdomain-valid')?.value;

    if (cachedValid !== tenantSubdomain) {
      // Not in cache — call backend to check if this org exists and is active
      try {
        const resp = await fetch(
          `${API_URL}/auth/validate-subdomain/${encodeURIComponent(tenantSubdomain)}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000), // 3 s max
          }
        );

        if (!resp.ok) {
          // Subdomain not found or inactive → redirect to root domain
          console.log(`[MIDDLEWARE] Unknown subdomain "${tenantSubdomain}", redirecting to root`);
          return NextResponse.redirect(`https://${BASE_DOMAIN}`);
        }
        // Valid — the cache cookie is set below on the final response
      } catch (err) {
        // Backend unreachable — allow through rather than blocking all traffic
        console.log('[MIDDLEWARE] Subdomain validation fetch error:', err);
      }
    }
  }
  // --- End subdomain validation ---

  // Root domain (0sms.com) is SIGNUP-ONLY — block /login, redirect to /signup
  if (!tenantSubdomain && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/signup';
    return NextResponse.redirect(url);
  }

  // Subdomain (acme.0sms.com) is LOGIN-ONLY — block /signup, redirect to /login
  if (tenantSubdomain && pathname === '/signup') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

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
      userAgent: userAgent.substring(0, 100),
      referer: request.headers.get('referer'),
    });
  }

  // If trying to access protected route without token, redirect to login
  if (!isPublicRoute && isProtectedRoute && !token) {
    console.log('[MIDDLEWARE] No token found, redirecting to login from:', pathname);
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    const redirectRes = NextResponse.redirect(url);
    // Preserve subdomain cookie so login page knows which tenant
    if (tenantSubdomain) {
      redirectRes.cookies.set('tf-subdomain', tenantSubdomain, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 3600,
      });
    }
    return redirectRes;
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

  // Forward subdomain as request header so server components can read it via headers()
  const requestHeaders = new Headers(request.headers);
  if (tenantSubdomain) {
    requestHeaders.set('x-tenant-subdomain', tenantSubdomain);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Set/clear tf-subdomain cookie for client-side access in Login component
  if (tenantSubdomain) {
    res.cookies.set('tf-subdomain', tenantSubdomain, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
    // Cache the validated subdomain for 5 minutes so we don't hit the DB on every request
    if (isRealSubdomain) {
      res.cookies.set('tf-subdomain-valid', tenantSubdomain, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 300, // 5 minutes
      });
    }
  } else {
    res.cookies.delete('tf-subdomain');
    res.cookies.delete('tf-subdomain-valid');
  }

  return res;
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
