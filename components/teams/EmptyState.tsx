'use client';

import { Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="col-span-full rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-8 sm:p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
        <Users className="h-8 w-8 text-brand-blue" />
      </div>
      <h3 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-2">No teams yet</h3>
      <p className="mb-6 max-w-md mx-auto text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">
        {isTenantAdmin
          ? 'Create your first team to start organizing your recruitment workflow'
          : 'No teams have been created yet. Contact your administrator to create teams.'}
      </p>
      <Button
        variant="primary"
        size="lg"
        icon={<Plus className="w-5 h-5" />}
        onClick={() => {
          if (!canCreateTeams) return;
          onCreateTeam();
        }}
        aria-disabled={!canCreateTeams}
        title={!canCreateTeams ? 'You do not have permission to create teams' : ''}
        className={canCreateTeams ? '' : 'opacity-60 cursor-not-allowed'}
      >
        Create Your First Team
      </Button>
    </div>
  );
}
