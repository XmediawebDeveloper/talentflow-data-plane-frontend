/**
 * Subdomain detection utility for multi-tenant subdomain-scoped login.
 *
 * Production:  acme.talentflow.io  → "acme"
 * Local dev:   acme.localhost:3000 → "acme"  (add to /etc/hosts: 127.0.0.1 acme.localhost)
 * Dev fallback: localhost:3000?org=acme → "acme"
 */

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || '0sms.com';

/**
 * Extracts tenant subdomain from the current window hostname.
 * Returns null on root domain, www, or plain localhost.
 */
export function getSubdomain(): string | null {
  if (typeof window === 'undefined') return null;

  const host = window.location.hostname;

  // Plain root domain or www → no subdomain
  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;

  // Plain localhost (no prefix) → no subdomain
  if (host === 'localhost') return null;

  // Local dev: acme.localhost → "acme"
  if (host.endsWith('.localhost')) {
    return host.slice(0, -'.localhost'.length) || null;
  }

  // Production: acme.talentflow.io → "acme"
  if (host.endsWith(`.${BASE_DOMAIN}`)) {
    return host.slice(0, -(BASE_DOMAIN.length + 1)) || null;
  }

  return null;
}

/**
 * Reads ?org=<subdomain> from URL search params (local dev fallback).
 */
export function getSubdomainFromSearchParams(searchParams: URLSearchParams): string | null {
  return searchParams.get('org') || null;
}

/**
 * Reads the tf-subdomain cookie set by Next.js middleware.
 * Useful when user was redirected to /login from a protected page.
 */
export function getSubdomainFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('tf-subdomain='))
      ?.split('=')[1] || null
  );
}

/**
 * Detects subdomain using priority order:
 * 1. window.location.hostname (real subdomain)
 * 2. ?org= query param (local dev without /etc/hosts)
 * 3. tf-subdomain cookie (set by middleware on redirect)
 */
export function detectSubdomain(searchParams?: URLSearchParams): string | null {
  return (
    getSubdomain() ||
    (searchParams ? getSubdomainFromSearchParams(searchParams) : null) ||
    getSubdomainFromCookie()
  );
}
