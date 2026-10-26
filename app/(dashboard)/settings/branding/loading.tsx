import { Skeleton } from '@/components/ui/skeleton';

// Neutral-gray skeleton mirroring the Branding page: hero banner + three section
// cards (Logo / Colors / Domain) inside the max-w-[1400px] white card shell.
export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Hero */}
          <section className="relative mb-4 sm:mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32 rounded-full" />
                  <Skeleton className="h-6 w-52" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </section>
          {/* Section cards: header + fields, mirroring Logo / Colors / Domain */}
          {[2, 2, 1].map((fields, s) => (
            <div key={s} className="mb-4 sm:mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 sm:px-6">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${fields > 1 ? 'sm:grid-cols-2' : ''}`}>
                  {Array.from({ length: fields }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
