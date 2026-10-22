import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading state for /organization/team-chat — the chat window only
 * (conversation list | conversation). The card, breadcrumb and organization
 * tabs come from app/(dashboard)/organization/layout.tsx and stay on screen.
 */
export default function TeamChatSkeleton() {
  return (
    <div className="flex flex-1 min-h-[480px] overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="hidden w-72 shrink-0 flex-col gap-3 border-r border-gray-200 p-3 md:flex lg:w-80 dark:border-slate-700">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-[38px] w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-1">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-gray-200 px-4 dark:border-slate-700">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 bg-slate-50/60 p-5 dark:bg-slate-950/30">
          {[false, true, false, true].map((isSender, i) => (
            <div key={i} className={`flex gap-2.5 ${isSender ? 'justify-end' : ''}`}>
              {!isSender && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
              <Skeleton className={`h-10 rounded-2xl ${i % 2 === 0 ? 'w-56' : 'w-40'}`} />
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 p-3 dark:border-slate-700">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
