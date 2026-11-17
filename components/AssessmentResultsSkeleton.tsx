import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton mirroring the Assessment Results page: breadcrumb, header,
 * 4 stat cards, tally, search/filter bar, and the wide results table.
 *
 * Shared by BOTH the route page (initial fetch) and AssessmentResults (its own
 * isLoading), so only ONE consistent skeleton shows — no two-skeleton flash.
 */
export default function AssessmentResultsSkeleton() {
  return (
    <div className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          {/* Breadcrumb */}
          <div className="mb-4 md:mb-6 flex items-center gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-3" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-3" />
            <Skeleton className="h-3.5 w-32" />
          </div>

          {/* Header */}
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-10 w-36 rounded-lg flex-shrink-0" />
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="tf-grid-stats mb-4 sm:mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="tf-card-soft p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-7 w-12" />
                  </div>
                  <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl" />
                </div>
              </div>
            ))}
          </div>

          {/* Tally */}
          <div className="mb-3 sm:mb-4 flex items-center justify-end">
            <Skeleton className="h-3.5 w-24" />
          </div>

          {/* Search + filter bar */}
          <div className="tf-card-soft p-3 sm:p-4 mb-3 sm:mb-4 space-y-3 sm:space-y-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Skeleton className="h-9 w-32 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>

          {/* Results table */}
          <div className="tf-card-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2040px] table-fixed">
                <thead className="bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
                  <tr>
                    <th className="tf-th-cell w-10"><Skeleton className="h-4 w-4 rounded" /></th>
                    {['w-24', 'w-48', 'w-64', 'w-56', 'w-36', 'w-36', 'w-28', 'w-28', 'w-28', 'w-96', 'w-32', 'w-28'].map((w, i) => (
                      <th key={i} className={`text-xs font-semibold text-gray-600 dark:text-slate-300 ${w} text-left px-4 py-3`}><Skeleton className="h-3 w-20" /></th>
                    ))}
                    <th className="tf-th-cell w-32"><Skeleton className="h-3 w-16 mx-auto" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {Array.from({ length: 8 }).map((_, r) => (
                    <tr key={r}>
                      <td className="tf-td w-10"><Skeleton className="h-4 w-4 rounded" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-16" /></td>
                      <td className="tf-td">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </td>
                      <td className="tf-td"><Skeleton className="h-4 w-48" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-40" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-28" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-24" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-12 mx-auto" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-12 mx-auto" /></td>
                      <td className="tf-td"><Skeleton className="h-5 w-20 rounded-full mx-auto" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-72" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-24" /></td>
                      <td className="tf-td"><Skeleton className="h-4 w-16 mx-auto" /></td>
                      <td className="tf-td">
                        <div className="flex items-center justify-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-md" />
                          <Skeleton className="h-7 w-7 rounded-md" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
