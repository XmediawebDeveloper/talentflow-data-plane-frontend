'use client';

import { Trash2, ShieldAlert, Lock, AlertCircle, HelpCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteResumeDialogProps {
  open: boolean;
  /** Display names of the resumes being deleted — one entry per resume. */
  names: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The one Delete Resume confirmation — Search Resume (Job Openings → ⋮ →
 * Search Resume) and My Resumes both render this, so the warnings, layout and
 * buttons can't drift apart again. No corner X (`hideClose`): it is dismissed
 * by the footer's Cancel (or Esc), next to the destructive Delete.
 */
export default function DeleteResumeDialog({ open, names, onCancel, onConfirm }: DeleteResumeDialogProps) {
  const count = names.length;
  const single = count <= 1;

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent className="sm:max-w-lg" hideClose>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1 pt-1">
              <AlertDialogTitle className="text-2xl font-bold text-gray-900">
                {single ? 'Delete Resume' : `Delete ${count} Resumes`}
              </AlertDialogTitle>
              <p className="mt-1 text-sm text-gray-500">This action is permanent and cannot be undone.</p>
            </div>
          </div>
          <AlertDialogDescription asChild>
            <div className="mt-2 space-y-4">
              <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                  <p className="text-sm text-gray-800">
                    This action is <span className="font-semibold text-red-600">permanent</span> and{' '}
                    <span className="font-semibold text-red-600">cannot be undone</span>.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <Lock className="h-4 w-4" />
                  </span>
                  <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                  <p className="text-sm text-gray-800">
                    {single ? 'Deleted resume' : 'Deleted resumes'}{' '}
                    <span className="font-semibold text-red-600">cannot be restored</span>.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                  <span className="h-6 w-px flex-shrink-0 bg-red-200" aria-hidden="true" />
                  <p className="text-sm text-gray-800">
                    All associated data will be <span className="font-semibold text-red-600">permanently removed</span>.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-brand-orange text-brand-orange">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-gray-900">
                    {single ? (
                      <>Are you sure you want to delete &ldquo;{names[0] ?? ''}&rdquo;?</>
                    ) : (
                      <>Are you sure you want to delete {count} resumes?</>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">This action cannot be reversed.</p>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t border-gray-100 pt-4">
          {/* The dialog focuses Cancel when it opens, so the base focus ring
              showed on every open. Ring only for keyboard focus. */}
          <AlertDialogCancel
            onClick={onCancel}
            className="focus:ring-0 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="gap-2 bg-red-600 text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            {single ? 'Delete Resume' : 'Delete Resumes'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
