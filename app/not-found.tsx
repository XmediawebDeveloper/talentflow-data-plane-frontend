import Link from 'next/link';
import { Search, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="tf-card-soft w-full max-w-lg p-6 sm:p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 mb-5">
          <Search className="h-8 w-8 text-brand-blue" aria-hidden="true" />
        </div>
        <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-blue mb-2">
          404 — Not found
        </p>
        <h1 className="tf-page-title mb-2">
          We can&apos;t find that page
        </h1>
        <p className="mx-auto max-w-md tf-body-secondary mb-6">
          The page you&apos;re looking for has moved, was renamed, or never existed. Try heading back to your dashboard.
        </p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-blue-2 transition-colors"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
