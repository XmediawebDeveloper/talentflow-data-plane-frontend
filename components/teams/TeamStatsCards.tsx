'use client';

import { Users, UserCheck, UserMinus, Crown } from 'lucide-react';
import type { TeamStats } from '@/lib/services/teamService';
import { useAuth } from '@/components/providers/AuthProvider';
import { TOTAL_UNITS_ICON } from '@/lib/constants/unitColors';
import { UnitStatCard, UNIT_STAT_GRID } from './reportControls';

export type TeamStatsCardKey = 'total' | 'members' | 'unassigned' | 'no-lead' | 'units';

interface TeamStatsCardsProps {
  stats: TeamStats;
  /** Active users in no team. null = the user list couldn't be loaded — card hidden. */
  unassignedUsers?: number | null;
  /** Teams with no team lead. */
  noLeadTeams?: number;
  /** Units used by all teams in the last 30 days. null = not loaded — card hidden. */
  units30?: number | null;
  isLoading?: boolean;
  // When provided, each card becomes a button that calls back with its key —
  // lets the team-management page drill into a list view (mirrors the
  // /recruitment/job-openings + /organization/role-management pattern).
  onCardClick?: (card: TeamStatsCardKey) => void;
  activeCard?: TeamStatsCardKey | null;
  /** Cards shown but not clickable (e.g. Units when the user can't open Team Usage). */
  nonClickable?: TeamStatsCardKey[];
}

const CARD_TITLES: Record<TeamStatsCardKey, string> = {
  total: 'Show all teams',
  members: 'Show team members',
  unassigned: 'Show users in no team',
  'no-lead': 'Show teams without a lead',
  units: 'Open Team Usage for the last 30 days',
};

/**
 * Teams tab summary — five cards in the same card and grid as Team Usage and
 * Analytics, so all three tabs line up.
 */
export default function TeamStatsCards({ stats, unassignedUsers = null, noLeadTeams = 0, units30 = null, isLoading, onCardClick, activeCard, nonClickable = [] }: TeamStatsCardsProps) {
  const { isTenantAdmin } = useAuth();
  const cards: { key: TeamStatsCardKey; label: string; value: number | null; icon: typeof Users }[] = [
    { key: 'total', label: 'Total Teams', value: stats.total_teams, icon: Users },
    { key: 'members', label: 'Team Members', value: stats.total_members, icon: UserCheck },
    // Optional cards: shown only when their number is actually known.
    { key: 'unassigned', label: 'Unassigned Users', value: unassignedUsers, icon: UserMinus },
    { key: 'no-lead', label: 'Teams Without Lead', value: noLeadTeams, icon: Crown },
    { key: 'units', label: 'Units · Last 30 Days', value: units30, icon: TOTAL_UNITS_ICON },
  ];

  return (
    <div className={`${UNIT_STAT_GRID} mb-4 sm:mb-6`}>
      {cards
        // Loading: as many placeholders as cards that usually show — all five for
        // admins; others normally get no Unassigned card — so the row doesn't jump.
        .filter((c) => (isLoading ? isTenantAdmin || c.key !== 'unassigned' : c.value !== null))
        .map((c) => (
          <UnitStatCard
            key={c.key}
            label={c.label}
            value={(c.value ?? 0).toLocaleString()}
            icon={c.icon}
            strong={c.key === 'total'}
            loading={isLoading}
            onClick={onCardClick && !nonClickable.includes(c.key) ? () => onCardClick(c.key) : undefined}
            active={activeCard === c.key}
            title={CARD_TITLES[c.key]}
          />
        ))}
    </div>
  );
}
