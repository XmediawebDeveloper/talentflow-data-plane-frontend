'use client';

import { Users, UserCheck, Layers3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="w-12 h-12 rounded-xl" />
            </div>
            <Skeleton className="h-9 w-16 mb-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const cardClass = (key: TeamStatsCardKey, accentShadow: string) =>
    `text-left rounded-2xl border bg-white p-6 shadow-sm ${accentShadow} ring-1 ring-black/[0.02] ${
      onCardClick ? 'transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : ''
    } ${
      activeCard === key ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100'
    }`;

  const CardTag = (onCardClick ? 'button' : 'div') as 'button' | 'div';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
      <CardTag
        type={onCardClick ? 'button' : undefined}
        onClick={onCardClick ? () => onCardClick('total') : undefined}
        className={cardClass('total', 'shadow-brand-blue/5')}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <Users className="w-6 h-6 text-brand-blue" />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-1">{stats.total_teams}</p>
        <p className="text-sm text-gray-600">Total Teams</p>
      </CardTag>

      <CardTag
        type={onCardClick ? 'button' : undefined}
        onClick={onCardClick ? () => onCardClick('members') : undefined}
        className={cardClass('members', 'shadow-brand-cyan/5')}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 shadow-sm shadow-brand-cyan/10">
            <UserCheck className="w-6 h-6 text-brand-cyan" />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-1">{stats.total_members}</p>
        <p className="text-sm text-gray-600">Team Members</p>
      </CardTag>

      <CardTag
        type={onCardClick ? 'button' : undefined}
        onClick={onCardClick ? () => onCardClick('avg') : undefined}
        className={cardClass('avg', 'shadow-brand-teal/5')}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
            <Layers3 className="w-6 h-6 text-brand-teal" />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-1">
          {stats.avg_members_per_team.toFixed(1)}
        </p>
        <p className="text-sm text-gray-600">Avg Members/Team</p>
      </CardTag>
    </div>
  );
}
