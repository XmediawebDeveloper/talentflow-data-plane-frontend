'use client';

import { AlertTriangle, Trash2 } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export default function DeleteConfirmDialog({
  open,
  onOpenChange,
  teamName,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  return (
    <AppModal
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
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-slate-50">&quot;{teamName}&quot;</span>?
        This action cannot be undone. All team data will be permanently removed.
      </p>
    </AppModal>
  );
}
