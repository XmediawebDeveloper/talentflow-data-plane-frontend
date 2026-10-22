import { HeaderSkeleton } from '@/components/ui/skeleton';
import TeamStatsCards from './TeamStatsCards';
import { TeamCardSkeleton } from './TeamCard';

const EMPTY_TEAM_STATS = {
  total_teams: 0,
  total_members: 0,
  avg_members_per_team: 0,
};

/**
 * Loading state for /organization/team-management. Used by BOTH the route's
 * loading.tsx and the page's own `isLoading` branch so refresh/navigation never
 * flashes two different skeletons. Header and stats come from the shared
 * skeletons; the cards keep TeamCardSkeleton because it mirrors TeamCard exactly.
 */
export default function TeamManagementSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <HeaderSkeleton actions={1} />
          <TeamStatsCards stats={EMPTY_TEAM_STATS} isLoading />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <TeamCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
