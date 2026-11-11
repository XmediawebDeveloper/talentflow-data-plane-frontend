'use client';

import { IconTileIllustration, IllustratedEmptyState } from '@/components/ui/illustrated-empty-state';

interface EmptyStateProps {
  isTenantAdmin: boolean;
  canCreateTeams: boolean;
  onCreateTeam: () => void;
}

/** Three filled figures — the mockup's team mark (lucide has no filled group). */
function TeamGroupIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="5" cy="8" r="2.6" opacity="0.85" />
      <circle cx="19" cy="8" r="2.6" opacity="0.85" />
      <path d="M0.5 18c0-3 2-5 4.5-5s4.5 2 4.5 5zM14.5 18c0-3 2-5 4.5-5s4.5 2 4.5 5z" opacity="0.85" />
      <circle cx="12" cy="7" r="3.2" />
      <path d="M6.5 19.5c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6z" />
    </svg>
  );
}

export default function EmptyState({
  isTenantAdmin,
  canCreateTeams,
  onCreateTeam,
}: EmptyStateProps) {
  return (
    <IllustratedEmptyState
      className="col-span-full"
      illustration={<IconTileIllustration icon={TeamGroupIcon} solid badge />}
      title="No teams yet"
      description={
        isTenantAdmin || canCreateTeams
          ? 'Create your first team to start organizing your recruitment workflow.'
          : 'No teams have been created yet. Contact your administrator to create teams.'
      }
      action={{
        label: 'Create Your First Team',
        onClick: onCreateTeam,
        disabledReason: canCreateTeams ? undefined : 'You do not have permission to create teams',
      }}
    />
  );
}
