'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Eye, ClipboardList, X, Calendar, User, Mail, FileText, Briefcase } from 'lucide-react';
import { format } from 'date-fns';

interface ExistingResumeInfo {
  id: string;
  candidate_name: string;
  email?: string;
  current_title?: string;
  folder_name?: string;
  uploaded_at?: string;
  version?: number;
}

interface DuplicateResumeDetectedModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  existingResume: ExistingResumeInfo;
  jobTitle?: string;
  onViewExisting: (resumeId: string) => void;
  onProceedWithScoring: (resumeId: string) => void;
}

export function DuplicateResumeDetectedModal({
  isOpen,
  onClose,
  fileName,
  existingResume,
  jobTitle,
  onViewExisting,
  onProceedWithScoring,
}: DuplicateResumeDetectedModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Compact dialog — DialogContent's own sm:max-w-lg (512px). The previous
          max-w-md override also clobbered the base mobile width guard via
          tailwind-merge, so it is dropped rather than replaced. The footer's
          wrap guards below handle the three buttons at this width. */}
      <DialogContent className="mx-2 sm:mx-auto max-h-[90dvh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-amber-600 text-base sm:text-lg">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            Resume Already Exists
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 sm:py-4 overflow-y-auto flex-1">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3 sm:mb-4">
            This resume already exists in your Internal Resume Database.
            {jobTitle && (
              <> Do you still want to submit for scoring against <span className="font-medium text-gray-900 dark:text-slate-50">{jobTitle}</span>?</>
            )}
          </p>

          {/* Uploaded File Info */}
          <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
              <span className="font-medium">Uploaded File:</span>
              <span className="truncate">{fileName}</span>
            </div>
          </div>

          {/* Existing Resume Info */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-amber-50 border-b border-amber-200">
              <span className="text-2xs sm:text-xs font-medium text-amber-700">Existing Record in Database</span>
            </div>
            <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate">{existingResume.candidate_name || 'Unknown Candidate'}</span>
                {existingResume.version && existingResume.version > 1 && (
                  <span className="px-2 py-0.5 text-xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 rounded-full">
                    v{existingResume.version}
                  </span>
                )}
              </div>

              {existingResume.email && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  <span className="truncate">{existingResume.email}</span>
                </div>
              )}

              {existingResume.current_title && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                  <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  <span className="truncate">{existingResume.current_title}</span>
                </div>
              )}

              {existingResume.folder_name && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-slate-500">
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  <span className="truncate">Folder: {existingResume.folder_name}</span>
                </div>
              )}

              {existingResume.uploaded_at && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-slate-500">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  <span>Uploaded: {format(new Date(existingResume.uploaded_at), 'MMM d, yyyy')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* flex-wrap + shrink-0: Button carries whitespace-nowrap and no shrink
            guard, so without these the labels overflow their boxes instead of
            wrapping to a second row when space is tight. */}
        <DialogFooter className="flex flex-col sm:flex-row sm:flex-wrap gap-2 shrink-0 [&>button]:shrink-0">
          {/* Cancel Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 order-3 sm:order-1"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </Button>

          {/* View Existing Record Button */}
          <Button
            variant="outline"
            onClick={() => {
              onViewExisting(existingResume.id);
              onClose();
            }}
            size="sm"
            className="flex items-center justify-center gap-1.5 order-2"
          >
            <Eye className="w-3.5 h-3.5" />
            View Existing Record
          </Button>

          {/* Proceed with Scoring Button */}
          <Button
            onClick={() => {
              onProceedWithScoring(existingResume.id);
              onClose();
            }}
            size="sm"
            className="flex items-center justify-center gap-1.5 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 order-1 sm:order-3"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Proceed with Scoring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DuplicateResumeDetectedModal;
