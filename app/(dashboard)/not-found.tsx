import Link from 'next/link';
import { Search, Home } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <main className="tf-page tf-page-pad overflow-y-auto">
      <div className="mx-auto max-w-2xl">
        <div className="tf-card-soft p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 mb-5">
            <Search className="h-8 w-8 text-brand-blue" aria-hidden="true" />
          </div>
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-blue mb-2">
            404 — Not found
          </p>
          <h1 className="tf-page-title mb-2">
            This page doesn&apos;t exist
          </h1>
          <p className="mx-auto max-w-md tf-body-secondary mb-6">
            The page you tried to open has moved or was removed. Use the navigation on the left, or return to the dashboard.
          </p>
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
