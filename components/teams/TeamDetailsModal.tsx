'use client';

import { useEffect, useState } from 'react';
import { Users, Shield, Briefcase, FileText, Pencil, Trash2, Crown, History, Loader2 } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';
import teamService, { Team, TeamHistoryEntry } from '@/lib/services/teamService';
import { EVENT_CONFIG, eventLabel, entryTime } from './TeamHistory';
import { formatISTDate } from '@/lib/utils/dateUtils';
import NameAvatar from '@/components/ui/name-avatar';

/** Width of the Team popup in both modes (details + edit form): ~25% wider than `md`. */
export const TEAM_MODAL_WIDTH = 'sm:max-w-[840px]';

interface TeamDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  userRole?: string;
  /** Switches the popup to the edit form. Omit to hide the button. */
  onEdit?: () => void;
  /** false = no teams:update — Edit stays visible but greyed with a tooltip. */
  canEdit?: boolean;
  onDelete?: () => void;
  /** false = no teams:delete — Delete stays visible but greyed with a tooltip. */
  canDelete?: boolean;
  /** True while the edit form is loading its user list. */
  isPreparingEdit?: boolean;
  /** Show the team's latest history events (only for those who can read the history). */
  showActivity?: boolean;
}

/** How far back the popup looks for this team's events (the API can't filter by team). */
const ACTIVITY_SCAN = 200;

export default function TeamDetailsModal({
  isOpen,
  onClose,
  team,
  onEdit,
  canEdit = false,
  onDelete,
  canDelete = false,
  isPreparingEdit = false,
  showActivity = false,
}: TeamDetailsModalProps) {
  // This team's last few events, read from the latest history.
  const [activity, setActivity] = useState<TeamHistoryEntry[] | null>(null);
  const teamId = isOpen && showActivity ? team?.id : undefined;
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setActivity(null);
    teamService
      .getTeamsHistory(ACTIVITY_SCAN, 0, 'ALL')
      .then((r) => { if (!cancelled) setActivity(r.items.filter((e) => e.team_id === teamId).slice(0, 5)); })
      .catch(() => { if (!cancelled) setActivity([]); });
    return () => { cancelled = true; };
  }, [teamId]);

  if (!isOpen || !team) return null;

  const actions: AppModalAction[] = [];
  if (onDelete) {
    actions.push({
      label: 'Delete Team',
      onClick: canDelete ? onDelete : () => {},
      variant: 'destructive',
      icon: <Trash2 className="h-4 w-4" />,
      disabled: !canDelete || isPreparingEdit,
      title: !canDelete ? 'You do not have permission to delete teams' : undefined,
    });
  }
  if (onEdit) {
    actions.push({
      label: 'Edit Team',
      onClick: canEdit ? onEdit : () => {},
      icon: <Pencil className="h-4 w-4" />,
      disabled: !canEdit,
      loading: isPreparingEdit,
      title: !canEdit ? 'You do not have permission to edit teams' : undefined,
    });
  }

  const stats = [
    { label: 'Members', value: team.member_count, Icon: Users },
    { label: 'Active Jobs', value: team.active_jobs_count, Icon: Briefcase },
    { label: 'Resumes', value: team.resumes_count, Icon: FileText },
  ];

  return (
    <AppModal
      open={isOpen}
      onCancel={onClose}
      // Shared with the edit form, so switching modes doesn't resize the popup.
      widthClassName={TEAM_MODAL_WIDTH}
      zIndexClass="z-50"
      closeButton
      icon={<Shield />}
      title="Team Details"
      subtitle="Review team composition, lead ownership, and core activity indicators."
      actions={actions}
      footerStart={
        <span className="text-xs">
          Created {formatISTDate(team.created_at)} · Updated {formatISTDate(team.updated_at)}
        </span>
      }
    >
      <div className="space-y-5">
        {/* Name + lead on one line, stats beside them on wide screens. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base max-sm:text-sm font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.name}</h3>
            {team.description && <p className="mt-1 line-clamp-2 text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">{team.description}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-400">
              <Crown className="h-3.5 w-3.5 text-brand-blue/60 dark:text-blue-300/70" />
              {team.team_lead ? (
                <>
                  <span className="font-medium text-gray-900 dark:text-slate-100">{team.team_lead.name}</span>
                  <span className="truncate">· {team.team_lead.email}</span>
                </>
              ) : (
                <span className="italic">No lead assigned</span>
              )}
            </p>
          </div>

          <dl className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3">
            {stats.map(({ label, value, Icon }) => (
              <div key={label} className="min-w-[7rem] rounded-xl border border-gray-100 bg-white px-3 py-2.5 dark:border-slate-700/60 dark:bg-slate-900">
                <dt className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
                  <Icon className="h-3.5 w-3.5 text-brand-blue" />
                  {label}
                </dt>
                <dd className="mt-0.5 text-xl max-sm:text-lg font-semibold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">
                  {value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">
            Team Members ({team.members?.length || 0})
          </h4>
          {team.members && team.members.length > 0 ? (
            // Two columns on the wider popup — roughly halves the list's height.
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {team.members.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/50">
                  <NameAvatar name={member.name} fallback={member.email} src={member.avatar_url} userId={member.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50">{member.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-500">{member.email}</p>
                  </div>
                  {team.team_lead?.id === member.id ? (
                    <span className="shrink-0 rounded-full bg-brand-blue px-2 py-0.5 text-xs font-medium text-white">Lead</span>
                  ) : member.role ? (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700">
                      {member.role}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-6 text-gray-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500">
              <Users className="mr-2 h-4 w-4" />
              <p className="text-sm max-sm:text-[13px]">No members</p>
            </div>
          )}
        </div>

        {showActivity && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">
              <History className="h-3.5 w-3.5" /> Recent Activity
            </h4>
            {activity === null ? (
              <p className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : activity.length === 0 ? (
              <p className="text-xs italic text-gray-400 dark:text-slate-500">No recent activity for this team.</p>
            ) : (
              <ul className="space-y-1.5">
                {activity.map((e) => {
                  const config = EVENT_CONFIG[e.event_type];
                  return (
                    <li key={e.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${config ? `${config.bg} ${config.color}` : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                        {eventLabel(e.event_type)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {e.target_user_name && <span className="font-medium text-gray-800 dark:text-slate-200">{e.target_user_name}</span>}
                        {e.actor_name && <>{e.target_user_name ? ' · ' : ''}by {e.actor_name}</>}
                      </span>
                      <span className="shrink-0 text-gray-400 dark:text-slate-500">{entryTime(e.event_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );
}
