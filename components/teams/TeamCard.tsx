'use client';

import { Users, Briefcase, FileText, UserPlus, Crown, ChevronRight } from 'lucide-react';
import { Team, TeamMember } from '@/lib/services/teamService';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import NameAvatar from '@/components/ui/name-avatar';

export const teamInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export const formatTeamDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const plural = (count: number, noun: string) => `${noun}${count === 1 ? '' : 's'}`;

export function TeamAvatar({ team, className }: { team: Pick<Team, 'id' | 'name'>; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        // Same brand-blue tile as the PageHeader icon.
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-sm max-sm:text-[13px] font-semibold text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:text-blue-200 dark:ring-brand-blue/30',
        className,
      )}
    >
      {teamInitials(team.name)}
    </div>
  );
}

export function MemberStack({
  members,
  total,
  max = 4,
  size = 'md',
}: {
  members: TeamMember[];
  total: number;
  max?: number;
  size?: 'sm' | 'md';
}) {
  const shown = members.slice(0, max);
  const extra = Math.max(0, total - shown.length);
  const dim = size === 'sm' ? 'h-7 min-w-7 text-2xs' : 'h-8 min-w-8 text-xs';

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((member) => (
        <NameAvatar
          key={member.id}
          name={member.name}
          fallback={member.email}
          size="sm"
          className={cn('ring-2 ring-white dark:ring-slate-900', size === 'sm' && 'h-7 w-7 text-2xs')}
        />
      ))}
      {extra > 0 && (
        <span
          title={members.slice(max).map((m) => m.name).join(', ') || `${extra} more`}
          className={cn(
            'flex items-center justify-center rounded-full bg-gray-100 px-1.5 font-semibold text-gray-600 ring-2 ring-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-900',
            dim,
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export interface TeamActionHandlers {
  /** Opens the Team popup (details, with Edit and Delete inside). */
  onViewDetails: (teamId: string) => void;
  /** Opens the Team popup straight in edit mode — used by "Add members". */
  onManageTeam: (teamId: string) => void;
  canManage?: boolean;
}

interface TeamCardProps extends TeamActionHandlers {
  team: Team;
}

export function TeamCard({ team, onViewDetails, onManageTeam, canManage = false }: TeamCardProps) {
  const created = formatTeamDate(team.created_at);
  const metrics = [
    { icon: Users, value: team.member_count, label: plural(team.member_count, 'member') },
    { icon: Briefcase, value: team.active_jobs_count, label: plural(team.active_jobs_count, 'active job') },
    { icon: FileText, value: team.resumes_count, label: plural(team.resumes_count, 'resume') },
  ];

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm shadow-brand-blue/5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 focus-within:border-brand-blue/40 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <TeamAvatar team={team} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base max-sm:text-sm font-semibold tracking-tight text-gray-900 dark:text-slate-50">
            {/* Stretched button: the whole card opens the Team popup, while Add
                members sits above it (z-10) and keeps its own click. */}
            <button
              type="button"
              onClick={() => onViewDetails(team.id)}
              className="text-left after:absolute after:inset-0 after:rounded-xl after:content-[''] focus:outline-none group-hover:text-brand-blue"
            >
              {team.name}
            </button>
          </h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-slate-400">
            {team.team_lead ? (
              <>
                <Crown className="h-3 w-3 shrink-0 text-brand-blue/60 dark:text-blue-300/70" />
                <span className="truncate">{team.team_lead.name}</span>
              </>
            ) : (
              <span className="italic">No lead assigned</span>
            )}
          </p>
        </div>
        <ChevronRight
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-brand-blue dark:text-slate-600"
        />
      </div>

      {team.description && (
        <p className="mt-3 line-clamp-2 text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">{team.description}</p>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-400">
        {metrics.map(({ icon: Icon, value, label }) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <Icon className="h-4 w-4 text-gray-400 dark:text-slate-500" />
            <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{value.toLocaleString()}</span>
            {label}
          </li>
        ))}
      </ul>

      {/* pt-4 keeps the gap; mt-auto pins the footer to the bottom of a stretched card. */}
      <div className="mt-auto pt-4">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-slate-700/60">
        {team.member_count > 0 ? (
          <MemberStack members={team.members} total={team.member_count} />
        ) : canManage ? (
          <button
            type="button"
            onClick={() => onManageTeam(team.id)}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-md text-sm max-sm:text-[13px] font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
          >
            <UserPlus className="h-4 w-4" />
            Add members
          </button>
        ) : (
          <span className="text-sm max-sm:text-[13px] italic text-gray-400 dark:text-slate-500">No members yet</span>
        )}
        {created && <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500">Created {created}</span>}
      </div>
      </div>
    </article>
  );
}

export function TeamCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm shadow-brand-blue/5 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="mt-4 flex gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 dark:border-slate-700/60">
        <div className="flex -space-x-1.5">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-900" />
          ))}
        </div>
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export default TeamCard;
