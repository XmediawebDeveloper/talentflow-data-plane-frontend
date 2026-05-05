import { cn } from "./utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-gray-200/80 animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

function PageHeroSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue/90 via-brand-blue-2/90 to-brand-teal/90 p-5 sm:p-6 lg:p-7 ring-1 ring-white/10",
        className,
      )}
    >
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex w-full max-w-3xl flex-col gap-3">
          <div className="h-5 w-40 rounded-full bg-white/15 animate-pulse" />
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-white/15 animate-pulse" />
            <div className="flex w-full flex-col gap-2">
              <div className="h-7 w-56 rounded-md bg-white/20 animate-pulse" />
              <div className="h-4 w-full max-w-lg rounded bg-white/12 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-white/12 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="h-10 w-28 rounded-xl bg-white/20 animate-pulse" />
      </div>
    </section>
  );
}

function StatsGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 mb-5 sm:mb-6 lg:mb-8",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5"
        >
          <Skeleton className="h-3.5 w-20 mb-3" />
          <Skeleton className="h-7 sm:h-8 w-16" />
          <Skeleton className="h-3 w-24 mt-3" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white overflow-hidden",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/60 px-4 py-4 sm:px-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Table header */}
      <div
        className="hidden md:grid border-b border-gray-100 px-4 py-3 sm:px-6"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-20" />
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="hidden md:grid items-center gap-4 px-4 py-4 sm:px-6"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-4"
                style={{ width: `${50 + ((r + c) * 7) % 45}%` }}
              />
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

function CardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6"
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

function FormSkeleton({
  fields = 6,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 lg:p-8",
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

function PageSkeleton({
  variant = "table",
  showStats = true,
  className,
}: {
  variant?: "table" | "cards" | "form";
  showStats?: boolean;
  className?: string;
}) {
  return (
    <main className={cn("flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8", className)}>
      <div className="mx-auto max-w-7xl">
        <PageHeroSkeleton />
        {showStats && <StatsGridSkeleton />}
        {variant === "table" && <TableSkeleton />}
        {variant === "cards" && <CardGridSkeleton />}
        {variant === "form" && <FormSkeleton />}
      </div>
    </main>
  );
}

export {
  Skeleton,
  PageHeroSkeleton,
  StatsGridSkeleton,
  TableSkeleton,
  CardGridSkeleton,
  FormSkeleton,
  PageSkeleton,
};
