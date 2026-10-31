'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[DASHBOARD ERROR]', error);
  }, [error]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 mb-5">
              <AlertTriangle className="h-8 w-8 text-red-600" aria-hidden="true" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
              We couldn&apos;t load this page
            </h1>
            <p className="max-w-md tf-card-desc mb-1">
              Something unexpected happened while rendering this view.
            </p>
            <p className="max-w-md tf-body-muted mb-6">
              You can retry, return to a previous page, or jump back to the dashboard.
            </p>

            {error?.digest && (
              <div className="mb-6 w-full max-w-sm rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left">
                <p className="text-2xs font-medium uppercase tracking-wide text-gray-500">
                  Error reference
                </p>
                <p className="font-mono text-xs text-gray-700 mt-0.5 break-all">{error.digest}</p>
              </div>
            )}

            <div className="flex w-full max-w-md flex-col-reverse gap-3 sm:flex-row">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-brand-blue/30 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Go back
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-brand-blue/30 transition-colors"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Dashboard
              </Link>
              <button
                onClick={reset}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-blue-2 transition-colors"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
