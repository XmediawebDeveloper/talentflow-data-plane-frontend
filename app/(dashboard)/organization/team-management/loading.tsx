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
      <div className="w-full max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="w-full">
          <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-4 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-5 lg:p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative">
              <div className="mb-4 h-6 w-36 animate-pulse rounded-full bg-white/20" />
              <div className="mb-3 h-9 w-64 animate-pulse rounded bg-white/20" />
              <div className="h-5 w-72 animate-pulse rounded bg-white/15" />
            </div>
          </section>

          <TeamStatsCards stats={EMPTY_TEAM_STATS} isLoading={true} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((index) => (
              <TeamCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
