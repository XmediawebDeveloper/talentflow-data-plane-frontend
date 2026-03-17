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
  '/reset-password', // Forgot-password OTP reset flow
  '/set-password',   // Invite-based first-login password setup
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
  '/audits',
  '/support-tickets',
  '/masters',
  '/help-desk',
];

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'talentflow.data.mo.vc';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Extract tenant subdomain ---
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0]; // strip port for localhost:3000
  const hostParts = hostname.split('.');
  let tenantSubdomain: string | null = null;
  let isRealSubdomain = false; // true = from actual hostname (not ?org= dev param)

  // Real subdomain: acme.talentflow.data.mo.vc → tenantSubdomain = 'acme'
  // The BASE_DOMAIN itself (e.g. talentflow.data.mo.vc) must NOT be treated as having
  // a subdomain — without this check, "talentflow" would be extracted and fail validation.
  // Skip subdomain extraction for raw IPv4 addresses (e.g. 192.168.1.100).
  const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  // Only treat as a real subdomain if the host is actually on the base domain.
  // e.g. stgdata.talentflow.mo.vc is NOT a subdomain of 0sms.com.
  const isOnBaseDomain = hostname === BASE_DOMAIN || hostname.endsWith(`.${BASE_DOMAIN}`);
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || isIPAddress;
  if (!isIPAddress && isOnBaseDomain && hostname !== BASE_DOMAIN && hostname.endsWith(`.${BASE_DOMAIN}`)) {
    const candidateSubdomain = hostname.slice(0, hostname.length - BASE_DOMAIN.length - 1);
    if (!['www', 'app'].includes(candidateSubdomain)) {
      tenantSubdomain = candidateSubdomain;
      isRealSubdomain = true;
    }
  }
  // Local dev fallback: localhost:3000?org=acme (skip DB validation)
  if (!tenantSubdomain) {
    tenantSubdomain = request.nextUrl.searchParams.get('org');
  }

  // Permanent fix: any request on a non-base-domain, non-localhost host
  // (e.g. stgdata.talentflow.mo.vc) redirects to the main site unconditionally.
  if (!isOnBaseDomain && !isLocalhost) {
    return NextResponse.redirect(`https://${BASE_DOMAIN}`);
  }
  // --- End subdomain extraction ---

  // --- Validate real subdomain against DB ---
  // Only for real hostnames (acme.talentflow.data.mo.vc), not the ?org= dev shortcut
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

  // Routing rules for auth pages:
  //   • Root domain  (talentflow.data.mo.vc / localhost without ?org=): /login  → /signup
  //   • Subdomain    (acme.talentflow.data.mo.vc / ?org=acme):         /signup → /login
  //   Signup is root-domain-only. Login is subdomain-only.

  // Root domain /login handling:
  // If no subdomain in URL/hostname, check the tf-subdomain cookie (set on last login).
  // This handles the case where an org user's logout goes to bare /login (no ?org=):
  //   - If cookie has org → redirect to /login?org=<org>  (returning org user)
  //   - If no cookie     → redirect to /signup            (brand new user)
  if (!tenantSubdomain && pathname === '/login') {
    const cookieSubdomain = request.cookies.get('tf-subdomain')?.value;
    if (cookieSubdomain) {
      // Org user without ?org= in URL — restore it from cookie
      const url = request.nextUrl.clone();
      url.searchParams.set('org', cookieSubdomain);
      return NextResponse.redirect(url);
    }
    // No org context at all → new user, send to signup
    const url = request.nextUrl.clone();
    url.pathname = '/signup';
    return NextResponse.redirect(url);
  }

  // Subdomain (acme.talentflow.data.mo.vc) is LOGIN-ONLY — block /signup, redirect to /login
  if (tenantSubdomain && pathname === '/signup') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Subdomain root (acme.0sms.com/) → redirect to login page
  if (tenantSubdomain && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Subdomain: only /login, /reset-password, /assessment, /ai-interview
  // and protected dashboard routes are allowed. Everything else (marketing pages
  // like /pricing, /features, /about, etc.) → redirect to /login.
  const subdomainAllowedPaths = [
    '/login',
    '/reset-password',
    '/set-password',
    '/complete-payment',
    '/assessment',
    '/ai-interview',
    ...protectedRoutes,
  ];
  if (tenantSubdomain) {
    const isAllowed = subdomainAllowedPaths.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (!isAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
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

    // Preserve org context in the redirect URL so /login doesn't get sent to /signup.
    // Use tenantSubdomain from URL/hostname first, fall back to tf-subdomain cookie
    // (cookie persists on protected routes — see cookie management below).
    const orgToPreserve = tenantSubdomain || request.cookies.get('tf-subdomain')?.value;
    if (orgToPreserve) {
      url.searchParams.set('org', orgToPreserve);
    }

    const redirectRes = NextResponse.redirect(url);
    // Keep the subdomain cookie alive in the redirect response
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

  // If logged in and trying to access auth pages, redirect to dashboard.
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

  // Set/clear tf-subdomain cookie for client-side access in Login component.
  //
  // IMPORTANT: On protected routes (dashboard, settings, etc.) we do NOT clear the cookie
  // even when there's no ?org= in the URL. This preserves the org context so that:
  //   1. If the session expires, the no-token redirect can include ?org= (see above).
  //   2. If logout redirects to bare /login, the cookie redirect above can find the org.
  //
  // We only clear it on public routes (home, pricing, signup) when there's no org context,
  // which handles the "truly new user" case cleanly.
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
  } else if (!isProtectedRoute && pathname !== '/reset-password' && pathname !== '/set-password') {
    // Only clear on non-protected public routes — never on /dashboard etc.
    // Also preserve on /reset-password and /set-password: they are part of the invite auth flow,
    // so the org context must survive the /login → /set-password → /dashboard journey.
    res.cookies.delete('tf-subdomain');
    res.cookies.delete('tf-subdomain-valid');
  } else if (pathname === '/reset-password' || pathname === '/set-password') {
    // Re-set the existing tf-subdomain cookie so it isn't lost during the
    // invite flow (login → set-password → dashboard).
    const existingSubdomain = request.cookies.get('tf-subdomain')?.value;
    if (existingSubdomain) {
      res.cookies.set('tf-subdomain', existingSubdomain, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 3600,
      });
    }
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
