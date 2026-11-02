'use client';

import { useState, useMemo } from 'react';
import { Search, Check, Loader2, Crown, X } from 'lucide-react';
import { ApiUser } from '@/lib/services/userService';
import NameAvatar from '@/components/ui/name-avatar';

/** A user who can't be picked because they're already in another team. */
export interface UnavailableUser {
  user: ApiUser;
  teamName: string;
}

interface MemberSelectorProps {
  availableUsers: ApiUser[];
  /** Users are still loading — show a loader instead of the (stale or empty) list. */
  isLoading?: boolean;
  selectedMemberIds: string[];
  onToggleMember: (userId: string) => void;
  /** Replaces the whole selection (Select all / Clear). */
  onSetMembers: (userIds: string[]) => void;
  teamLeadId?: string;
  onTeamLeadChange?: (userId: string) => void;
  showTeamLeadSelector?: boolean;
  /** Shown greyed under the list with their team, so it's clear why they can't be picked. */
  unavailableUsers?: UnavailableUser[];
}

/** "tenant_admin" → "Tenant Admin". */
const formatRole = (role: string) =>
  role.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const matches = (user: ApiUser, q: string) =>
  !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);

export default function MemberSelector({
  availableUsers,
  isLoading = false,
  selectedMemberIds,
  onToggleMember,
  onSetMembers,
  teamLeadId = '',
  onTeamLeadChange,
  showTeamLeadSelector = true,
  unavailableUsers = [],
}: MemberSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const q = searchQuery.trim().toLowerCase();
  const canPickLead = showTeamLeadSelector && !!onTeamLeadChange;

  const filteredUsers = useMemo(() => availableUsers.filter((u) => matches(u, q)), [availableUsers, q]);
  const filteredUnavailable = useMemo(() => unavailableUsers.filter(({ user }) => matches(user, q)), [unavailableUsers, q]);
  const selectedMembers = useMemo(
    () => availableUsers.filter((user) => selectedMemberIds.includes(user.id)),
    [availableUsers, selectedMemberIds],
  );
  const lead = selectedMembers.find((m) => m.id === teamLeadId);
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedMemberIds.includes(u.id));

  // Select all = every user matching the search (keeps anyone already picked).
  const selectAllFiltered = () =>
    onSetMembers(Array.from(new Set([...selectedMemberIds, ...filteredUsers.map((u) => u.id)])));

  return (
    <div className="space-y-3">
      {/* The section heading above names this; here just the running count. */}
      <div className="flex items-center gap-2">
        <span className="sr-only">Team Members</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
            selectedMemberIds.length > 0
              ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:text-blue-300'
              : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {selectedMemberIds.length} selected
        </span>
      </div>

      {/* Picked members as chips — visible without scrolling the list; × removes. */}
      {selectedMembers.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {selectedMembers.map((m) => (
            <span
              key={m.id}
              className={`inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-1 pr-1.5 text-xs ring-1 ${
                m.id === teamLeadId
                  ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                  : 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
              }`}
            >
              <NameAvatar name={m.name} fallback={m.email} src={m.avatar_url} userId={m.id} size="xs" className="h-5 w-5 text-[9px]" />
              {m.id === teamLeadId && <Crown className="h-3 w-3 shrink-0" aria-label="Team lead" />}
              <span className="truncate">{m.name}</span>
              <button
                type="button"
                onClick={() => onToggleMember(m.id)}
                aria-label={`Remove ${m.name}`}
                className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by name or email..."
          className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm max-sm:text-[13px] text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
        />
      </div>

      {/* Count + bulk actions */}
      {!isLoading && availableUsers.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-gray-500 dark:text-slate-500">
            {q ? `${filteredUsers.length} of ${availableUsers.length} users` : `${availableUsers.length} users`}
          </span>
          <span className="flex items-center gap-3">
            {filteredUsers.length > 0 && !allFilteredSelected && (
              <button type="button" onClick={selectAllFiltered} className="font-semibold text-brand-blue hover:underline">
                {q ? 'Select matching' : 'Select all'}
              </button>
            )}
            {selectedMemberIds.length > 0 && (
              <button
                type="button"
                onClick={() => onSetMembers([])}
                className="font-semibold text-gray-500 hover:text-gray-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </span>
        </div>
      )}

      <div className="max-h-60 overflow-y-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-6 tf-body-muted max-sm:text-[13px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading users…
          </div>
        ) : filteredUsers.length === 0 && filteredUnavailable.length === 0 ? (
          <div className="p-6 text-center text-gray-500 dark:text-slate-500">
            <p className="text-sm max-sm:text-[13px]">
              {searchQuery ? 'No users found matching your search' : 'No users available'}
            </p>
          </div>
        ) : (
          <>
            {filteredUsers.map((user) => {
              const isSelected = selectedMemberIds.includes(user.id);
              const isLead = user.id === teamLeadId;
              return (
                <div
                  key={user.id}
                  onClick={() => onToggleMember(user.id)}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleMember(user.id);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 px-3 py-2.5 transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40 ${
                    isSelected
                      ? 'bg-brand-blue/[0.05] shadow-[inset_3px_0_0_0_var(--brand-blue)] dark:bg-brand-blue/10'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      isSelected ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50">{user.name}</p>
                    <p className="truncate tf-meta">{user.email}</p>
                  </div>
                  {user.role && (
                    <span className="hidden shrink-0 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-gray-700 dark:text-slate-300 sm:inline">
                      {formatRole(user.role)}
                    </span>
                  )}
                  {/* The lead is picked right on the row (selected members only). */}
                  {canPickLead && isSelected && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTeamLeadChange!(isLead ? '' : user.id);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      title={isLead ? 'Team lead — click to remove' : 'Make team lead'}
                      aria-label={isLead ? `Remove ${user.name} as team lead` : `Make ${user.name} team lead`}
                      aria-pressed={isLead}
                      className={`shrink-0 rounded-md p-1.5 transition-colors ${
                        isLead
                          ? 'bg-brand-blue text-white'
                          : 'text-gray-300 hover:bg-brand-blue/10 hover:text-brand-blue dark:text-slate-600'
                      }`}
                    >
                      <Crown className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {/* Already in another team — listed greyed, so it's clear why they can't be picked. */}
            {filteredUnavailable.map(({ user, teamName }) => (
              <div
                key={user.id}
                aria-disabled="true"
                title="A user can belong to one team"
                className="flex cursor-not-allowed items-center gap-3 border-b border-gray-100 p-3 opacity-60 last:border-b-0 dark:border-slate-700/60"
              >
                <div className="h-5 w-5 shrink-0 rounded border-2 border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800" />
                <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300">{user.name}</p>
                  <p className="truncate tf-meta">{user.email}</p>
                </div>
                <span className="max-w-[40%] shrink-0 truncate rounded-full bg-gray-100 px-2.5 py-1 tf-meta-strong dark:bg-slate-800">
                  In {teamName}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Lead summary, plus a nudge when there's exactly one member and no lead. */}
      {canPickLead && selectedMembers.length > 0 && (
        <p className="tf-meta">
          {lead ? (
            <>
              <Crown className="mr-1 inline h-3 w-3 text-brand-blue" />
              Team lead: <span className="font-medium text-gray-800 dark:text-slate-200">{lead.name}</span>
            </>
          ) : selectedMembers.length === 1 ? (
            <>
              No team lead yet.{' '}
              <button
                type="button"
                onClick={() => onTeamLeadChange!(selectedMembers[0].id)}
                className="font-semibold text-brand-blue hover:underline"
              >
                Make {selectedMembers[0].name} the lead
              </button>
            </>
          ) : (
            <>
              Team lead is optional — use <Crown className="mx-0.5 inline h-3 w-3" /> on a selected member.
            </>
          )}
        </p>
      )}
    </div>
  );
}
