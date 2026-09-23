import { Skeleton } from '@/components/ui/skeleton';

// Route-level Suspense fallback. The RoleManagement client component never
// renders a full matching skeleton — it immediately paints a gradient hero + 4
// stat cards and uses inline spinners for the body. To avoid a "double
// skeleton" reshuffle on the hand-off, this fallback mimics that real chrome:
// gradient-hero-shaped block + 4 stat-card skeletons + a list/table body
// skeleton. Shapes mirror components/roles/RoleManagement.tsx.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-32" />
          </div>

          {/* Gradient hero — matches the real hero shape/color so the hand-off
              does not reshuffle. */}
          <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 h-6 w-52 animate-pulse rounded-full bg-white/20" />
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-white/20" />
                  <div className="flex-1">
                    <div className="mb-2 h-8 w-56 animate-pulse rounded bg-white/20" />
                    <div className="h-4 w-full max-w-xl animate-pulse rounded bg-white/15" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="grid grid-cols-2 gap-2 sm:min-w-[240px]">
                  <div className="h-14 animate-pulse rounded-xl bg-white/10" />
                  <div className="h-14 animate-pulse rounded-xl bg-white/10" />
                </div>
                <div className="h-11 w-36 animate-pulse rounded-xl bg-white/20" />
              </div>
            </div>
          </section>

          {/* Tab switcher */}
          <div className="mb-6 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-2 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>

          {/* Stat cards — 4 tiles matching the real overview grid. */}
          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-11 w-11 rounded-xl" />
                </div>
              </div>
            ))}
          </section>

          {/* Body — list/table skeleton. */}
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4 md:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
