'use client';

import { Users, Plus } from 'lucide-react';

interface EmptyStateProps {
  isTenantAdmin: boolean;
  canCreateTeams: boolean;
  isAtTeamLimit: boolean;
  maxTeams: number;
  onCreateTeam: () => void;
}

export default function EmptyState({
  isTenantAdmin,
  canCreateTeams,
  isAtTeamLimit,
  maxTeams,
  onCreateTeam,
}: EmptyStateProps) {
  return (
    <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Users className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No teams yet</h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        {isTenantAdmin
          ? canCreateTeams && isAtTeamLimit
            ? `You have reached the maximum number of teams (${maxTeams}) for your plan. Please upgrade to create teams.`
            : 'Create your first team to start organizing your recruitment workflow'
          : 'No teams have been created yet. Contact your administrator to create teams.'}
      </p>
      {isTenantAdmin && !(canCreateTeams && isAtTeamLimit) && (
        <button
          onClick={onCreateTeam}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-all"
        >
          <Plus className="w-5 h-5" />
          Create Your First Team
        </button>
      )}
    </div>
  );
}
