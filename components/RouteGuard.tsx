'use client';

/**
 * RouteGuard — centralized module-level authorization for dashboard routes.
 *
 * Hiding a module from the sidebar (lib/navigation/menuSections.ts) is a UX
 * convenience, not authorization. This component is the enforcement point:
 * it re-checks the SAME permission keys against the current user's live
 * permission state (lib/navigation/routeAccess.ts) on every route change, so
 * typing a protected URL directly behaves identically to clicking a hidden
 * menu item — the page is redirected to /unauthorized and never rendered.
 *
 * Mounted once in app/(dashboard)/layout.tsx, wrapping {children}. That
 * layout already guarantees isLoading=false and isAuthenticated=true by the
 * time this renders, so no separate loading/auth handling is needed here.
 *
 * This is a UX/defense-in-depth layer, not the security boundary — the
 * user's cached (localStorage-restored) permission snapshot can briefly lag
 * a change the Owner just made until the background session refresh lands.
 * The actual boundary is the backend's permission dependencies, which query
 * the current DB state on every request regardless of what the frontend
 * shows.
 */

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { isRouteAuthorized, UNAUTHORIZED_PATH } from '@/lib/navigation/routeAccess';

/* Where a refused page sends you, when somewhere better than the Dashboard
   fits: Teams without View Teams → Chat (/chat), which everyone can use. */
const UNAUTHORIZED_FALLBACKS: { prefix: string; to: string }[] = [
  { prefix: '/organization/team-management', to: '/chat' },
];

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isTenantAdmin, hasPermission } = useAuth();

  const authorized = useMemo(
    () => isRouteAuthorized(pathname || '', { isTenantAdmin, hasPermission }),
    [pathname, isTenantAdmin, hasPermission]
  );

  useEffect(() => {
    if (!authorized) {
      const fallback = UNAUTHORIZED_FALLBACKS.find((f) => (pathname || '').startsWith(f.prefix));
      router.replace(fallback?.to ?? UNAUTHORIZED_PATH);
    }
  }, [authorized, router, pathname]);

  // Never mount the protected page component when the check fails — the
  // effect above kicks off the redirect in the same tick.
  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
