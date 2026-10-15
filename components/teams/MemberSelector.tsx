'use client';

import { useState, useMemo } from 'react';
import { Search, Check } from 'lucide-react';
import { ApiUser } from '@/lib/services/userService';

interface MemberSelectorProps {
  availableUsers: ApiUser[];
  selectedMemberIds: string[];
  onToggleMember: (userId: string) => void;
  teamLeadId?: string;
  onTeamLeadChange?: (userId: string) => void;
  showTeamLeadSelector?: boolean;
}

export default function MemberSelector({
  availableUsers,
  selectedMemberIds,
  onToggleMember,
  teamLeadId = '',
  onTeamLeadChange,
  showTeamLeadSelector = true,
}: MemberSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = useMemo(() => {
    return availableUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableUsers, searchQuery]);

  const selectedMembers = useMemo(() => {
    return availableUsers.filter((user) => selectedMemberIds.includes(user.id));
  }, [availableUsers, selectedMemberIds]);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Team Members</label>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
          />
        </div>

        <div className="max-h-60 overflow-y-auto rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user) => {
              const isSelected = selectedMemberIds.includes(user.id);
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
                  className={`flex cursor-pointer items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 p-3 transition-colors last:border-b-0 ${
                    isSelected ? 'bg-brand-blue/[0.04] dark:bg-brand-blue/10' : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      isSelected
                        ? 'border-brand-blue bg-brand-blue'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-50">{user.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-500">{user.email}</p>
                  </div>
                  {user.role && (
                    <span className="shrink-0 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-gray-700 dark:text-slate-300">
                      {user.role}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-gray-500 dark:text-slate-500">
              <p className="text-sm">
                {searchQuery ? 'No users found matching your search' : 'No users available'}
              </p>
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">
          {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {showTeamLeadSelector && selectedMemberIds.length > 0 && onTeamLeadChange && (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Team Lead (Optional)</label>
          <select
            value={teamLeadId}
            onChange={(e) => onTeamLeadChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
          >
            <option value="">No team lead</option>
            {selectedMembers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
