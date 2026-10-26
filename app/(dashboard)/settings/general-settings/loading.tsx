import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Recruiter Settings (general-settings) page:
// breadcrumb + hero banner + two-column layout (left tab sidebar with 5 tabs and a
// role box, right form panel) inside the max-w-[1400px] white card shell.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-28" />
          </div>

          {/* Hero Header */}
          <section className="relative mb-4 sm:mb-6 overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40 rounded-full" />
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-full max-w-2xl" />
              </div>
            </div>
          </section>

          {/* Tabs + Content Layout */}
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Left Sidebar - Tabs */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] p-2">
                <nav className="flex lg:flex-col gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="w-full flex items-center gap-3 px-4 py-2">
                      <Skeleton className="w-5 h-5 rounded" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  ))}
                </nav>
                {/* Role Info */}
                <div className="hidden lg:block mt-4 p-3 rounded-lg bg-brand-blue/5 border border-brand-blue/15 space-y-2">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </div>

            {/* Right Content Area */}
            <div className="flex-1">
              <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] p-4 sm:p-6 lg:p-8">
                {/* Section heading */}
                <div className="mb-6 space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
                {/* Save row */}
                <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-200 dark:border-slate-700 flex justify-end">
                  <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
