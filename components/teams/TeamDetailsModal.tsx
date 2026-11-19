'use client';

import { Users, Shield, Pencil, Trash2, Crown, BarChart3, Clock } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';
import { Team } from '@/lib/services/teamService';
import NameAvatar from '@/components/ui/name-avatar';
import { TeamUnitsSummary, formatTeamDateTime, type TeamUnits } from './TeamCard';

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
  /** This team's units in the last 30 days; omitted when the user can't see usage. */
  units?: TeamUnits;
  /** Shows the units box even with no data for this team (`units` undefined → "—"). */
  showUnits?: boolean;
  /** Name of whoever created the team, when known. */
  createdByName?: string;
}

export default function TeamDetailsModal({
  isOpen,
  onClose,
  team,
  onEdit,
  canEdit = false,
  onDelete,
  canDelete = false,
  isPreparingEdit = false,
  units,
  showUnits = false,
  createdByName,
}: TeamDetailsModalProps) {
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


  // The lead first, then everyone else A–Z.
  const leadId = team.team_lead?.id;
  const members = [...(team.members ?? [])].sort((a, b) =>
    a.id === leadId ? -1 : b.id === leadId ? 1 : (a.name || a.email || '').localeCompare(b.name || b.email || ''),
  );
  const initials = (team.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const statTile = 'rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-slate-700/60 dark:bg-slate-800/40';
  const statLabel = 'flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400';

  return (
    <AppModal
      tone="plain"
      open={isOpen}
      onCancel={onClose}
      // Shared with the edit form, so switching modes doesn't resize the popup.
      widthClassName={TEAM_MODAL_WIDTH}
      zIndexClass="z-50"
      closeButton
      // The header is the team itself: its initials and name.
      icon={<span className="text-sm font-bold tracking-wide">{initials || <Shield />}</span>}
      title={team.name}
      subtitle={`Team · ${team.member_count.toLocaleString()} ${team.member_count === 1 ? 'member' : 'members'}`}
      ariaLabel={`Team details: ${team.name}`}
      actions={actions}
      footerStart={
        <span className="flex items-center gap-1.5 text-xs">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Created {formatTeamDateTime(team.created_at)}{createdByName ? ` by ${createdByName}` : ''} · Updated {formatTeamDateTime(team.updated_at)}
          </span>
        </span>
      }
    >
      <div className="space-y-5">
        {team.description && (
          <p className="whitespace-pre-line break-words border-l-2 border-brand-blue/30 pl-3 text-sm text-gray-600 dark:text-slate-400">
            {team.description}
          </p>
        )}

        {/* Summary strip — who leads it, how many people, what it used. */}
        <dl className={`grid grid-cols-1 gap-2 sm:gap-3 ${showUnits ? 'sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)]' : 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}>
          <div className={statTile}>
            <dt className={statLabel}>
              <Crown className="h-3.5 w-3.5 text-brand-orange-deep" />
              Team Lead
            </dt>
            <dd className="mt-2">
              {team.team_lead ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <NameAvatar name={team.team_lead.name} fallback={team.team_lead.email} userId={team.team_lead.id} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{team.team_lead.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">{team.team_lead.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Not assigned
                  {onEdit && canEdit && <span className="block text-xs text-gray-400 dark:text-slate-500">Pick one with Edit Team.</span>}
                </p>
              )}
            </dd>
          </div>
          <div className={statTile}>
            <dt className={statLabel}>
              <Users className="h-3.5 w-3.5 text-brand-blue" />
              Members
            </dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">
              {team.member_count.toLocaleString()}
            </dd>
          </div>
          {showUnits && (
            <div className={statTile}>
              <dt className={statLabel}>
                <BarChart3 className="h-3.5 w-3.5 text-brand-blue" />
                Units · 30 days
              </dt>
              <dd className="mt-1.5">
                <TeamUnitsSummary units={units} />
              </dd>
            </div>
          )}
        </dl>

        {/* Members — one divided list, the lead pinned first. */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Members</h4>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600 dark:bg-slate-800 dark:text-slate-400">
              {members.length}
            </span>
          </div>
          {members.length > 0 ? (
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100 dark:divide-slate-700/60 dark:border-slate-700/60">
              {members.map((member) => {
                const isLead = member.id === leadId;
                return (
                  <li
                    key={member.id}
                    className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${isLead ? 'bg-brand-orange/[0.04] dark:bg-orange-500/[0.06]' : ''}`}
                  >
                    <NameAvatar name={member.name} fallback={member.email} src={member.avatar_url} userId={member.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-50">{member.name}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-slate-400">{member.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isLead && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2 py-0.5 text-xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/20">
                          <Crown className="h-3 w-3" />
                          Lead
                        </span>
                      )}
                      {member.role && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                          {member.role.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-gray-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              <Users className="h-5 w-5" />
              <p className="text-sm font-medium">No members yet</p>
              {onEdit && canEdit && <p className="text-xs text-gray-400 dark:text-slate-500">Add people with Edit Team.</p>}
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}
