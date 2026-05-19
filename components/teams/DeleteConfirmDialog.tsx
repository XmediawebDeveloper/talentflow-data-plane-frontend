'use client';

import { Loader2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
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
      <AlertDialogContent className="max-w-md max-h-[90vh] rounded-3xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        <AlertDialogHeader className="shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange/[0.12] ring-1 ring-brand-orange/20">
              <AlertTriangle className="w-5 h-5 text-brand-orange-deep" />
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
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-brand-orange-deep hover:bg-brand-orange focus:ring-brand-orange"
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
