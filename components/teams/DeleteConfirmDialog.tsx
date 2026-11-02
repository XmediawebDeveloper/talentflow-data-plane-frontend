'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  /** Shown as the impact line ("This team has 5 members"). */
  memberCount?: number;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export default function DeleteConfirmDialog({
  open,
  onOpenChange,
  teamName,
  memberCount = 0,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  return (
    <AppModal
      tone="plain"
      open={open}
      onCancel={() => onOpenChange(false)}
      cancelDisabled={isDeleting}
      size="sm"
      zIndexClass="z-50"
      icon={<AlertTriangle />}
      title="Delete Team"
      actions={[
        {
          label: isDeleting ? 'Deleting...' : 'Delete Team',
          onClick: onConfirm,
          variant: 'destructive',
          disabled: isDeleting,
          loading: isDeleting,
          icon: <Trash2 className="h-4 w-4" />,
        },
      ]}
    >
      <p className="tf-card-desc max-sm:text-[13px]">
        Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-slate-50">&quot;{teamName}&quot;</span>?
        This action cannot be undone. All team data will be permanently removed.
      </p>
      {memberCount > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
          This team has{' '}
          <span className="font-semibold">{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>.
          {' '}They will become unassigned.
        </p>
      )}
    </AppModal>
  );
}
