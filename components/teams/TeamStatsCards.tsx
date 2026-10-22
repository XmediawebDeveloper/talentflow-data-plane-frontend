'use client';

import { Users, UserCheck, Briefcase } from 'lucide-react';
import { StatsGridSkeleton } from '@/components/ui/skeleton';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';

interface TeamStats {
  total_teams: number;
  total_members: number;
  avg_members_per_team: number;
}

export type TeamStatsCardKey = 'total' | 'members' | 'jobs';

interface TeamStatsCardsProps {
  stats: TeamStats;
  /** Sum of active jobs across all teams — the stats endpoint doesn't return it. */
  activeJobs?: number;
  isLoading?: boolean;
  // When provided, each card becomes a button that calls back with its key —
  // lets the team-management page drill into a list view (mirrors the
  // /recruitment/job-openings + /organization/role-management pattern).
  onCardClick?: (card: TeamStatsCardKey) => void;
  activeCard?: TeamStatsCardKey | null;
}

export default function TeamStatsCards({ stats, activeJobs = 0, isLoading, onCardClick, activeCard }: TeamStatsCardsProps) {
  if (isLoading) {
    // Shared stats skeleton, laid out like StatsCardGrid columns={3}.
    return <StatsGridSkeleton count={3} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />;
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
        label="Active Jobs"
        value={activeJobs.toLocaleString()}
        icon={Briefcase}
        tone="neutral"
        sparkline={false}
        onClick={onCardClick ? () => onCardClick('jobs') : undefined}
        active={activeCard === 'jobs'}
        showClickArrow={!!onCardClick}
      />
    </StatsCardGrid>
  );
}
