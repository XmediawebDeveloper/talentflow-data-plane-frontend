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
    <div className="col-span-full tf-card-soft p-8 sm:p-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
        <Users className="h-8 w-8 text-brand-blue" />
      </div>
      <h3 className="tf-section-title max-sm:text-sm mb-2">No teams yet</h3>
      <p className="mb-6 max-w-md mx-auto tf-body-secondary">
        {isTenantAdmin || canCreateTeams
          ? 'Create your first team to start organizing your recruitment workflow'
          : 'No teams have been created yet. Contact your administrator to create teams.'}
      </p>
      <Button
        variant="primary"
        size="md"
        icon={<Plus className="w-4 h-4" />}
        onClick={() => {
          if (!canCreateTeams) return;
          onCreateTeam();
        }}
        aria-disabled={!canCreateTeams}
        title={!canCreateTeams ? 'You do not have permission to create teams' : ''}
        className={`${(canCreateTeams ? '' : 'opacity-60 cursor-not-allowed')} disabled:opacity-50`}
      >
        Create Your First Team
      </Button>
    </div>
  );
}
