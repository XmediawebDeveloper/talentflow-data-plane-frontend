'use client';

/**
 * Cross-subdomain auth handoff.
 *
 * When a user completes paid signup, the backend issues access + refresh tokens
 * for the new tenant admin (see /api/v1/signup/process-payment). The new tokens
 * must land in localStorage of the NEW tenant's subdomain (e.g.
 * https://ajith.talentflow.data.mo.vc), not the marketing/main domain where
 * the signup form lives.
 *
 * localStorage is per-origin, so we can't write the tokens from the signup
 * origin. The signup page redirects here with the tokens in the URL fragment
 * (`#access_token=...&refresh_token=...`). Fragments are never sent to the
 * server — they exist only in the browser, which keeps the tokens out of
 * access logs, proxies, and referrer headers.
 *
 * This page reads the fragment, persists the tokens, scrubs the URL, and then
 * sends the user to the dashboard. If the fragment is missing or malformed,
 * we fall back to /login.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { setTokens } from '@/lib/services/api';

export default function AuthHandoffPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const fragment = typeof window !== 'undefined' ? window.location.hash : '';
      if (!fragment || fragment.length <= 1) {
        router.replace('/login');
        return;
      }

      const params = new URLSearchParams(fragment.slice(1));
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');

      if (!access || !refresh) {
        router.replace('/login');
        return;
      }

      // Strip the fragment so the tokens don't sit in the address bar / history.
      window.history.replaceState(null, '', window.location.pathname);

      // Hard redirect once the session cookie is saved, so all providers/contexts
      // re-initialize with the new session (matches a fresh login).
      setTokens(access, refresh).finally(() => {
        window.location.href = '/dashboard';
      });
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-600">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Signing you in…</span>
      </div>
    </div>
  );
}
