import { cn } from "./utils";

/**
 * Loading skeletons that mirror the REAL page chrome so there is no layout jump
 * when content loads. The structure matches:
 *   PageBreadcrumb → PageHeader → StatsCardGrid → PageToolbar → tf-table-shell
 * (master reference: /recruitment/job-openings).
 * All surfaces are neutral gray and dark-mode aware.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-gray-200/80 dark:bg-slate-700/50 animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

/** Matches PageBreadcrumb + PageHeader (icon + title + description | actions). NOT a hero banner. */
function HeaderSkeleton({ actions = 2, className }: { actions?: number; className?: string }) {
  return (
    <div className={cn("mb-5", className)}>
      {/* breadcrumb */}
      <Skeleton className="h-3 w-44 mb-4" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-2 pt-0.5">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        {actions > 0 && (
          <div className="flex gap-2 shrink-0">
            {Array.from({ length: actions }).map((_, i) => (
              <Skeleton key={i} className={cn("h-9 rounded-lg", i === actions - 1 ? "w-32" : "w-24")} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Back-compat alias — old callers imported PageHeroSkeleton. */
const PageHeroSkeleton = HeaderSkeleton;

/** Matches StatsCardGrid (2-col mobile, N-col desktop). */
function StatsGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 mb-5",
        count >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5"
        >
          <Skeleton className="h-3.5 w-20 mb-3" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24 mt-3" />
        </div>
      ))}
    </div>
  );
}

/** Matches PageToolbar — a bordered card with search + filter buttons and an optional tabs row. */
function ToolbarSkeleton({
  tabs = 4,
  showTabs = true,
  filters = 2,
  className,
}: {
  tabs?: number;
  showTabs?: boolean;
  filters?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm p-3 sm:p-4 mb-4",
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Skeleton className="h-9 flex-1 min-w-0 rounded-lg" />
        {Array.from({ length: filters }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-lg" />
        ))}
      </div>
      {showTabs && (
        <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
          {Array.from({ length: tabs }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 shrink-0 rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Matches the .tf-table-shell table. `toolbar` renders an in-shell toolbar row (for standalone use). */
function TableSkeleton({
  rows = 6,
  columns = 5,
  toolbar = true,
  className,
}: {
  rows?: number;
  columns?: number;
  toolbar?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm",
        className,
      )}
    >
      {toolbar && (
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 px-4 py-3 sm:px-6">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      )}

      {/* Table header */}
      <div
        className="hidden md:grid border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30 px-4 py-3 sm:px-6 gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-20" />
        ))}
      </div>

      {/* Desktop rows */}
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="hidden md:grid items-center gap-4 px-4 py-4 sm:px-6"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-4" style={{ width: `${50 + ((r + c) * 7) % 45}%` }} />
            ))}
          </div>
        ))}

        {/* Mobile card-style rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`m-${r}`} className="md:hidden p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches a responsive card grid (1/2/3 cols). */
function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-5/6 mb-2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Matches a sectioned form card (two-column fields + footer actions). */
function FormSkeleton({ fields = 6, className }: { fields?: number; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-6 lg:p-8",
        className,
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Full-page skeleton mirroring the real chrome:
 *   Header → Stats → Toolbar → (Table | Cards | Form).
 * Props let a page match its exact structure (column count, tab presence, stats count).
 */
function PageSkeleton({
  variant = "table",
  showStats = true,
  showToolbar = true,
  showTabs = true,
  columns = 5,
  statsCount = 4,
  className,
}: {
  variant?: "table" | "cards" | "form";
  showStats?: boolean;
  showToolbar?: boolean;
  showTabs?: boolean;
  columns?: number;
  statsCount?: number;
  className?: string;
}) {
  const isForm = variant === "form";
  return (
    <main className={cn("flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8", className)}>
      <div className="mx-auto max-w-7xl">
        <HeaderSkeleton />
        {showStats && !isForm && <StatsGridSkeleton count={statsCount} />}
        {showToolbar && !isForm && <ToolbarSkeleton showTabs={showTabs} />}
        {variant === "table" && <TableSkeleton toolbar={false} columns={columns} />}
        {variant === "cards" && <CardGridSkeleton />}
        {isForm && <FormSkeleton />}
      </div>
    </main>
  );
}

export {
  Skeleton,
  HeaderSkeleton,
  PageHeroSkeleton,
  StatsGridSkeleton,
  ToolbarSkeleton,
  TableSkeleton,
  CardGridSkeleton,
  FormSkeleton,
  PageSkeleton,
};
