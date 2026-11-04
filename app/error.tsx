'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GLOBAL ERROR]', error);
  }, [error]);

  return (
    <main className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="tf-card-soft w-full max-w-lg p-6 sm:p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 mb-5">
          <AlertTriangle className="h-7 w-7 text-red-600" aria-hidden="true" />
        </div>
        <h1 className="tf-page-title mb-2">
          Something went wrong
        </h1>
        <p className="tf-body-secondary mb-1">
          We hit an unexpected error and couldn&apos;t complete your request.
        </p>
        <p className="tf-body-muted mx-auto mb-6 max-w-sm">
          Try again, or head back to the dashboard. If this keeps happening, please contact support.
        </p>

        {error?.digest && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="tf-micro-hint uppercase tracking-wide">Error reference</p>
            <p className="font-mono tf-meta mt-0.5 break-all">{error.digest}</p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 tf-label hover:bg-gray-50 hover:border-brand-blue/30 transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Go to dashboard
          </Link>
          <button
            onClick={reset}
            className="tf-btn tf-btn-primary flex-1 bg-brand-blue px-4 py-2.5 text-sm hover:bg-brand-blue-2 transition-colors whitespace-normal shadow-none"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
