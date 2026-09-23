'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

/**
 * Minimal Access Denied page — the redirect target for RouteGuard
 * (components/RouteGuard.tsx) when the current user's live permissions
 * don't allow the route they navigated to, including a direct URL entry
 * for a module the Owner has disabled for them.
 *
 * Kept deliberately generic (no page-specific messaging) since it's reached
 * from any protected route; styling mirrors the existing "Access Restricted"
 * card in components/PreConditionGuard.tsx so it matches the app's design.
 */
export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100dvh-200px)] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-gray-900 text-2xl mb-2">Access Denied</h2>
        <p className="text-gray-600 mb-6">
          You don&apos;t have permission to access this page. Please contact your
          Admin if you believe this is a mistake.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
