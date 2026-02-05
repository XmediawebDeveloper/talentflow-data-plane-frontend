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
      {/* Members Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Team Members
        </label>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
          />
        </div>

        {/* User List */}
        <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
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
                  className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                    isSelected ? 'bg-gray-50' : ''
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-gray-800 border-gray-800'
                        : 'border-gray-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  {user.role && (
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      {user.role}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-gray-500">
              <p className="text-sm">
                {searchQuery ? 'No users found matching your search' : 'No users available'}
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-2">
          {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {/* Team Lead Selection */}
      {showTeamLeadSelector && selectedMemberIds.length > 0 && onTeamLeadChange && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Team Lead (Optional)
          </label>
          <select
            value={teamLeadId}
            onChange={(e) => onTeamLeadChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
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
