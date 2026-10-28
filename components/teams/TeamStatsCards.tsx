'use client';

import { Users, UserCheck, Briefcase, UserMinus, MailPlus } from 'lucide-react';
import { StatsGridSkeleton } from '@/components/ui/skeleton';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import type { TeamStats } from '@/lib/services/teamService';

export type TeamStatsCardKey = 'total' | 'members' | 'jobs' | 'unassigned';

interface TeamStatsCardsProps {
  stats: TeamStats;
  /** Sum of active jobs across all teams — the stats endpoint doesn't return it. */
  activeJobs?: number;
  /** Active users in no team. null = the user list couldn't be loaded — card hidden. */
  unassignedUsers?: number | null;
  isLoading?: boolean;
  // When provided, each card becomes a button that calls back with its key —
  // lets the team-management page drill into a list view (mirrors the
  // /recruitment/job-openings + /organization/role-management pattern).
  onCardClick?: (card: TeamStatsCardKey) => void;
  activeCard?: TeamStatsCardKey | null;
}

export default function TeamStatsCards({ stats, activeJobs = 0, unassignedUsers = null, isLoading, onCardClick, activeCard }: TeamStatsCardsProps) {
  // Optional cards: shown only when their number is actually known.
  const showUnassigned = unassignedUsers !== null;
  const showInvitations = typeof stats.pending_invitations === 'number';
  const columns = (3 + (showUnassigned ? 1 : 0) + (showInvitations ? 1 : 0)) as 3 | 4 | 5;

  if (isLoading) {
    // Shared stats skeleton, laid out like StatsCardGrid columns={3}.
    return <StatsGridSkeleton count={3} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />;
  }

  const clickable = (key: TeamStatsCardKey) => ({
    onClick: onCardClick ? () => onCardClick(key) : undefined,
    active: activeCard === key,
    showClickArrow: !!onCardClick,
  });

  return (
    <StatsCardGrid columns={columns}>
      <StatsCard label="Total Teams" value={stats.total_teams} icon={Users} tone="neutral" sparkline={false} {...clickable('total')} />
      <StatsCard label="Team Members" value={stats.total_members} icon={UserCheck} tone="neutral" sparkline={false} {...clickable('members')} />
      <StatsCard label="Active Jobs" value={activeJobs.toLocaleString()} icon={Briefcase} tone="neutral" sparkline={false} {...clickable('jobs')} />
      {showUnassigned && (
        <StatsCard label="Unassigned Users" value={unassignedUsers!.toLocaleString()} icon={UserMinus} tone="neutral" sparkline={false} {...clickable('unassigned')} />
      )}
      {/* Information only — there's no invitations list to drill into. */}
      {showInvitations && (
        <StatsCard label="Pending Invitations" value={stats.pending_invitations!.toLocaleString()} icon={MailPlus} tone="neutral" sparkline={false} />
      )}
    </StatsCardGrid>
  );
}
