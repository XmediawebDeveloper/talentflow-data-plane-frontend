'use client';

import { Users, UserPlus, Crown, ChevronRight } from 'lucide-react';
import { Team, TeamMember } from '@/lib/services/teamService';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import NameAvatar from '@/components/ui/name-avatar';
import { UNIT_KEYS, UNIT_LABELS, UNIT_CHART_COLOR, type UnitKey } from '@/lib/constants/unitColors';

export const teamInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

/** Team dates in IST, like the rest of the app (was the browser's locale and zone). */
export const formatTeamDate = (iso: string) => {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return '';
  return formatISTDate(iso);
};

/** "20 Oct 2026, 11:33 AM" (IST). */
export const formatTeamDateTime = (iso: string) => {
  if (!formatTeamDate(iso)) return '';
  return `${formatISTDate(iso)}, ${formatISTTime(iso).toUpperCase()}`;
};

const plural = (count: number, noun: string) => `${noun}${count === 1 ? '' : 's'}`;

export function TeamAvatar({ team, className }: { team: Pick<Team, 'id' | 'name'>; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        // Same brand-blue tile as the PageHeader icon.
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-sm font-semibold text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:text-blue-200 dark:ring-brand-blue/30',
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
          src={member.avatar_url}
          userId={member.id}
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

/** Amber "needs attention" pill — a team with no lead or no members. */
export function AttentionChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin bar: this team's size relative to the largest team. */
export function TeamSizeBar({ count, max, className }: { count: number; max: number; className?: string }) {
  if (max <= 0 || count <= 0) return null;
  const pct = Math.max(4, Math.round((count / max) * 100));
  return (
    <div
      className={cn('h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800', className)}
      title={`${count} of ${max} members (largest team)`}
      aria-hidden
    >
      <div className="h-full rounded-full bg-brand-blue/60 dark:bg-blue-400/60" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A team's units in the last 30 days, per unit type and in total. */
export type TeamUnits = Record<UnitKey, number> & { total: number };

/** Whole numbers stay whole; fractions get one decimal. */
export const formatTeamUnits = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

/**
 * "128 units" plus a bar split by unit type (same colours as Team Usage).
 * Clicking opens the team in Team Usage, when `onOpen` is given.
 * `units` undefined = no usage data for this team (e.g. not one of yours).
 */
export function TeamUnitsSummary({
  units,
  onOpen,
  className,
}: {
  units: TeamUnits | undefined;
  onOpen?: () => void;
  className?: string;
}) {
  if (!units) {
    return (
      <span className={cn('tf-body-muted', className)} title="Usage is shown for your teams only">
        —
      </span>
    );
  }
  const breakdown = UNIT_KEYS.map((k) => `${UNIT_LABELS[k]}: ${formatTeamUnits(units[k])}`).join(' · ');
  const body = (
    <>
      <span className="tf-row-title tabular-nums">
        {formatTeamUnits(units.total)}
        <span className="ml-1 text-xs font-normal text-gray-500 dark:text-slate-400">units</span>
      </span>
      {units.total > 0 && (
        <span className="mt-1 flex h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800" aria-hidden>
          {UNIT_KEYS.map((k) =>
            units[k] > 0 ? <span key={k} style={{ width: `${(units[k] / units.total) * 100}%`, backgroundColor: UNIT_CHART_COLOR[k] }} /> : null,
          )}
        </span>
      )}
    </>
  );
  if (!onOpen) {
    return <span className={cn('inline-flex flex-col', className)} title={breakdown}>{body}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${breakdown} — open in Team Usage`}
      className={cn('relative z-10 inline-flex flex-col items-start rounded-md text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40', className)}
    >
      {body}
    </button>
  );
}

export interface TeamActionHandlers {
  /** Opens the Team popup (details, with Edit and Delete inside). */
  onViewDetails: (teamId: string) => void;
  /** Opens the Team popup straight in edit mode — used by "Add members". */
  onManageTeam: (teamId: string) => void;
  canManage?: boolean;
  /** Member count of the largest team — scales the size bar. */
  maxMembers?: number;
  /** Units per team (last 30 days). null = not available to this user — hidden. */
  unitsByTeam?: Record<string, TeamUnits> | null;
  /** Opens the team in Team Usage. */
  onOpenUsage?: (teamId: string) => void;
  /** Who created each team (from the history's "Team Created" events). null = not available. */
  createdBy?: Record<string, string> | null;
}

interface TeamCardProps extends TeamActionHandlers {
  team: Team;
}

export function TeamCard({ team, onViewDetails, onManageTeam, canManage = false, maxMembers = 0, unitsByTeam = null, onOpenUsage, createdBy = null }: TeamCardProps) {
  const created = formatTeamDate(team.created_at);
  // Members + units only — the Teams module is about people and unit usage.
  const metrics = [
    { icon: Users, value: team.member_count, label: plural(team.member_count, 'member') },
  ];

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm shadow-brand-blue/5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 focus-within:border-brand-blue/40 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <TeamAvatar team={team} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate tf-section-title max-sm:text-sm tracking-tight">
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
          <p className="mt-0.5 flex items-center gap-1 truncate tf-meta">
            {team.team_lead ? (
              <>
                <Crown className="h-3 w-3 shrink-0 text-brand-blue/60 dark:text-blue-300/70" />
                <span className="truncate">{team.team_lead.name}</span>
              </>
            ) : (
              <AttentionChip>No lead assigned</AttentionChip>
            )}
          </p>
        </div>
        <ChevronRight
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-brand-blue dark:text-slate-600"
        />
      </div>

      {team.description && (
        <p className="mt-3 line-clamp-2 tf-body-secondary">{team.description}</p>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 tf-body-muted">
        {metrics.map(({ icon: Icon, value, label }) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <Icon className="h-4 w-4 text-gray-400 dark:text-slate-500" />
            <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{value.toLocaleString()}</span>
            {label}
          </li>
        ))}
      </ul>
      <TeamSizeBar count={team.member_count} max={maxMembers} className="mt-3" />
      {unitsByTeam && (
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="tf-meta">Units · last 30 days</span>
          <TeamUnitsSummary
            units={unitsByTeam[team.id]}
            onOpen={onOpenUsage ? () => onOpenUsage(team.id) : undefined}
            className="items-end"
          />
        </div>
      )}

      {/* pt-4 keeps the gap; mt-auto pins the footer to the bottom of a stretched card. */}
      <div className="mt-auto pt-4">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-slate-700/60">
        {team.member_count > 0 ? (
          <MemberStack members={team.members} total={team.member_count} />
        ) : canManage ? (
          <button
            type="button"
            onClick={() => onManageTeam(team.id)}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
          >
            <UserPlus className="h-4 w-4" />
            Add members
          </button>
        ) : (
          <AttentionChip>No members yet</AttentionChip>
        )}
        {created && (
          <span className="min-w-0 truncate text-right tf-hint">
            Created {created}
            {createdBy?.[team.id] && <> by <span className="text-gray-500 dark:text-slate-400">{createdBy[team.id]}</span></>}
          </span>
        )}
      </div>
      </div>
    </article>
  );
}

export function TeamCardSkeleton() {
  return (
    <div className="tf-card-soft flex flex-col p-5">
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
