'use client';

import { AlertTriangle, ArrowRight, Calendar, FileText, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatIST } from '@/lib/utils/dateUtils';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionChip } from '@/components/assessments/AssessmentVersionHistoryPanel';

/** The draft version the popup points at - the fields it shows. */
export interface ExistingDraftAssessment {
  id: string;
  version?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
}

/**
 * "Draft already exists" - shown when a job already holds an unpublished
 * assessment version and another one is about to be made.
 *
 * Lifted unchanged out of the Assessments page's Duplicate flow, where it was
 * written inline, so Duplicate, the Assessments page's Create and the Job
 * Details page's Create all show the one popup. `message` is the only thing a
 * caller may change: Duplicate offers to continue the draft; Create asks for it
 * to be published before another version is created.
 */
export default function DraftAssessmentExistsModal({
  draft,
  jdShortId,
  jobTitle,
  jobVersion,
  message = 'A draft version already exists for this assessment. Open the existing draft to continue editing, or cancel to stay here.',
  onClose,
  onOpenDraft,
}: {
  draft: ExistingDraftAssessment;
  jdShortId?: string | null;
  jobTitle: string;
  jobVersion: number;
  message?: string;
  onClose: () => void;
  onOpenDraft: () => void;
}) {
  const lastEdited = draft.updated_at || draft.created_at;
  const draftVersion = draft.version ?? 1;
  return (
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 w-fit min-w-[min(95vw,36rem)] max-w-[95vw] max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 pt-5 sm:pt-7 pb-5 sm:pb-6">
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="px-2 -mr-1.5 -mt-1"
              aria-label="Close"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
          </div>

          <div className="flex flex-col items-center text-center -mt-4">
            <div className="w-14 h-14 rounded-full bg-warning-subtle flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <h3 className="mt-4 text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">
              Draft already exists
            </h3>
            <p className="mt-2 max-w-md text-sm sm:text-base text-gray-500 dark:text-slate-400 leading-snug">
              {message}
            </p>
          </div>

          <div className="mt-5 sm:mt-6 rounded-xl border border-gray-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-brand-blue dark:text-blue-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-500 dark:text-slate-400">Existing Draft</p>
                {/* ONE LINE: JD ID | job name | job version | assessment version + Draft.
                    The app's own pieces - the shared JobIdBadge, the job list's
                    name typography, VersionChip (blue = job, cyan = assessment)
                    and the Assessment Versions table's Draft pill. The name is
                    always shown whole on one line; the popup widens to fit it
                    (up to the screen), and only a phone lets the badges wrap. */}
                <div className="mt-1.5 flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0">
                  {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                  {/* The whole name on ONE line - never wrapped, never cut. A
                      long name widens the popup instead (it sizes to this row). */}
                  <span className="flex-shrink-0 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-50">
                    {jobTitle}
                  </span>
                  <span title="Job version" className="flex-shrink-0 inline-flex">
                    <VersionChip kind="job" version={jobVersion} />
                  </span>
                  <span aria-hidden="true" className="flex-shrink-0 text-gray-300 dark:text-slate-600">|</span>
                  <span className="flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-xs text-gray-500 dark:text-slate-400">Assessment</span>
                    <VersionChip kind="assessment" version={draftVersion} />
                  </span>
                  <span className="flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ring-1 bg-warning-subtle text-warning-strong ring-warning-line">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    Draft
                  </span>
                </div>
                {/* ONE LINE: Last edited on … | Created by … - each half kept whole;
                    only a phone lets the two halves stack. */}
                <div className="mt-2 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-slate-400 min-w-0">
                  {lastEdited && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      Last edited on {formatIST(lastEdited)}
                    </span>
                  )}
                  {draft.created_by_name && (
                    <>
                      {lastEdited && <span aria-hidden="true" className="text-gray-300 dark:text-slate-600">|</span>}
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Users className="w-3.5 h-3.5 flex-shrink-0" />
                        Created by {draft.created_by_name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-slate-700 px-4 sm:px-7 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={onOpenDraft}
          >
            Open Draft
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
