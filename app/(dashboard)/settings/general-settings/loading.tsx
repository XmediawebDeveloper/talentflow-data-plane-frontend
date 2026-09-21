import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Recruiter Settings page: hero, left tab
// sidebar and the My Profile form (avatar + labelled input fields).
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          <Skeleton className="h-4 w-56 mb-4 md:mb-6" />

          {/* Hero */}
          <section className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32 rounded-full" />
                <Skeleton className="h-8 w-60" />
                <Skeleton className="h-4 w-full max-w-lg" />
              </div>
            </div>
          </section>

          {/* Tabs + Content */}
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Left tab sidebar */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <div className="rounded-xl border border-gray-100 bg-white p-2 space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
            </div>

            {/* Content: My Profile form */}
            <div className="flex-1 rounded-xl border border-gray-100 bg-white p-5 sm:p-6 lg:p-8">
              <Skeleton className="h-6 w-40 mb-1" />
              <Skeleton className="h-4 w-64 mb-6" />

              {/* Profile picture */}
              <Skeleton className="h-3.5 w-28 mb-3" />
              <div className="flex items-center gap-4 mb-6">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>

              {/* Full Name / Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>

              {/* Phone / Job Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>

              {/* Department */}
              <div className="space-y-2 mb-6">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>

              <div className="flex justify-end">
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
