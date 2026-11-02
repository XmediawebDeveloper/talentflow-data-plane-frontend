import Link from 'next/link';
import { Search, Home } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 mb-5">
            <Search className="h-8 w-8 text-brand-blue" aria-hidden="true" />
          </div>
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-brand-blue mb-2">
            404 — Not found
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
            This page doesn&apos;t exist
          </h1>
          <p className="mx-auto max-w-md tf-card-desc mb-6">
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
