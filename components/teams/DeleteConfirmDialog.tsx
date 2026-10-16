'use client';

import { Loader2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

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
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[95vw] flex-col rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:max-w-md">
        <AlertDialogHeader className="shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive-subtle ring-1 ring-destructive-line">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <div className="flex-1 overflow-y-auto">
          <AlertDialogDescription className="text-left">
            Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-slate-50">&quot;{teamName}&quot;</span>?
            This action cannot be undone. All team data will be permanently removed.
          </AlertDialogDescription>
        </div>
        <AlertDialogFooter className="shrink-0">
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-white hover:opacity-90 focus:ring-destructive/40"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete Team'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
