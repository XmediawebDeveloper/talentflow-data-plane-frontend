import { Skeleton } from '@/components/ui/skeleton';
import TeamStatsCards from './TeamStatsCards';
import { TeamCardSkeleton } from './TeamCard';

const EMPTY_TEAM_STATS = {
  total_teams: 0,
  total_members: 0,
  avg_members_per_team: 0,
};

/**
 * Loading state for /organization/team-management — the tab panel's CONTENT
 * only (header, stats, cards). The card, breadcrumb and organization tabs are
 * drawn by app/(dashboard)/organization/layout.tsx and stay on screen while
 * this shows. Used by both the route's loading.tsx and the page's own
 * `isLoading` branch so they never differ.
 */
export default function TeamManagementSkeleton() {
  return (
    <div>
      {/* PageHeader shape: icon + title/description, one action button */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="space-y-2 pt-0.5">
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <TeamStatsCards stats={EMPTY_TEAM_STATS} isLoading />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((index) => (
          <TeamCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
