'use client';

import { Users, UserCheck, Layers3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';

interface TeamStats {
  total_teams: number;
  total_members: number;
  avg_members_per_team: number;
}

export type TeamStatsCardKey = 'total' | 'members' | 'avg';

interface TeamStatsCardsProps {
  stats: TeamStats;
  isLoading?: boolean;
  // When provided, each card becomes a button that calls back with its key —
  // lets the team-management page drill into a list view (mirrors the
  // /recruitment/job-openings + /organization/role-management pattern).
  onCardClick?: (card: TeamStatsCardKey) => void;
  activeCard?: TeamStatsCardKey | null;
}

export default function TeamStatsCards({ stats, isLoading, onCardClick, activeCard }: TeamStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 mb-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 sm:p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="flex items-start gap-2.5">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <StatsCardGrid columns={3}>
      <StatsCard
        label="Total Teams"
        value={stats.total_teams}
        icon={Users}
        tone="neutral"
        sparkline={false}
        onClick={onCardClick ? () => onCardClick('total') : undefined}
        active={activeCard === 'total'}
        showClickArrow={!!onCardClick}
      />
      <StatsCard
        label="Team Members"
        value={stats.total_members}
        icon={UserCheck}
        tone="neutral"
        sparkline={false}
        onClick={onCardClick ? () => onCardClick('members') : undefined}
        active={activeCard === 'members'}
        showClickArrow={!!onCardClick}
      />
      <StatsCard
        label="Avg Members/Team"
        value={stats.avg_members_per_team.toFixed(1)}
        icon={Layers3}
        tone="neutral"
        sparkline={false}
        onClick={onCardClick ? () => onCardClick('avg') : undefined}
        active={activeCard === 'avg'}
        showClickArrow={!!onCardClick}
      />
    </StatsCardGrid>
  );
}
