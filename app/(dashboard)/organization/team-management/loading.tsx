import { TeamStatsCards, TeamCardSkeleton } from '@/components/teams';

// Route-level Suspense fallback. Renders the SAME skeleton as the page's own
// `if (isLoading)` branch (gradient hero + stats + card grid) so refresh/
// navigation does not flash a different layout ("double skeleton" bug).
const EMPTY_TEAM_STATS = {
  total_teams: 0,
  total_members: 0,
  avg_members_per_team: 0,
};

export default function Loading() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <div className="w-full">
            <div className="mb-5">
              <div className="mb-3 h-9 w-64 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
              <div className="h-5 w-72 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
            </div>

            <TeamStatsCards stats={EMPTY_TEAM_STATS} isLoading={true} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((index) => (
                <TeamCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
