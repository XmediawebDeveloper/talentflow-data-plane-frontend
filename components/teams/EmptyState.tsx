'use client';

import { Users, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface EmptyStateProps {
  isTenantAdmin: boolean;
  canCreateTeams: boolean;
  onCreateTeam: () => void;
}

export default function EmptyState({
  isTenantAdmin,
  canCreateTeams,
  onCreateTeam,
}: EmptyStateProps) {
  return (
    <div className="col-span-full rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
        <Users className="h-8 w-8 text-brand-blue" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No teams yet</h3>
      <p className="mb-6 max-w-md mx-auto text-sm text-gray-600">
        {isTenantAdmin
          ? 'Create your first team to start organizing your recruitment workflow'
          : 'No teams have been created yet. Contact your administrator to create teams.'}
      </p>
      <button
        onClick={() => {
          if (!canCreateTeams) {
            toast.error('You do not have permission to create teams');
            return;
          }
          onCreateTeam();
        }}
        aria-disabled={!canCreateTeams}
        title={!canCreateTeams ? 'You do not have permission to create teams' : ''}
        className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all ${
          canCreateTeams
            ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/20 hover:-translate-y-0.5 hover:shadow-lg'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
        }`}
      >
        <Plus className="w-5 h-5" />
        Create Your First Team
      </button>
    </div>
  );
}
