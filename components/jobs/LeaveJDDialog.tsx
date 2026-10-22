'use client';

import { AlertTriangle, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import JobIdBadge from '@/components/jobs/JobIdBadge';

export interface LeaveJDDialogProps {
  open: boolean;
  /** Human-readable code (JD-076) once the job has a record; null before. */
  jobCode?: string | null;
  jobTitle?: string;
  /** Lineage version (1, 2, ...). A v2+ draft is its own row: Delete removes that
   *  version only, and the job's earlier versions stay. */
  versionNumber?: number;
  /**
   * What "Discard current changes" goes back to, phrased to finish the
   * sentence "Goes back to …" — e.g. "the version you opened" or "the version
   * saved when you finished Step 1". Null when there is nothing saved to go
   * back to (a brand-new job before its first step save): the button is then
   * disabled, because discarding would leave nothing and Delete is the honest
   * choice.
   */
  discardTarget: string | null;
  /** True when no record exists yet — discarding simply leaves the page. */
  nothingSavedYet: boolean;
  /** Why Delete is unavailable (published JD, no record yet); null = allowed. */
  deleteBlockedReason: string | null;
  /** Editing a published JD: Save writes the changes to it and it stays Published. */
  isPublishedJD?: boolean;
  /** Short name of the step the recruiter is on, e.g. "Step 2 (Extract)". */
  currentStepLabel: string;
  busy: 'save' | 'discard' | 'delete' | null;
  onCancel: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}

/**
 * The prompt shown when the recruiter leaves JD creation/editing (a breadcrumb,
 * the Dashboard, any menu link, browser Back) with work on screen.
 *
 * A JD gets its record — and its JD ID — while Step 1 is still being typed, so
 * "leave without saving" is not a thing: something IS saved, and the recruiter
 * has to say what happens to it. The old two-button prompt (Discard / Save
 * Draft) hid that, and its Discard quietly left the draft in Job Descriptions.
 * Each option here states exactly what it does to the record.
 */
export default function LeaveJDDialog({
  open,
  jobCode,
  jobTitle,
  versionNumber = 1,
  discardTarget,
  nothingSavedYet,
  deleteBlockedReason,
  isPublishedJD = false,
  currentStepLabel,
  busy,
  onCancel,
  onSave,
  onDiscard,
  onDelete,
}: LeaveJDDialogProps) {
  const isLaterVersion = versionNumber > 1;
  const deleteLabel = isLaterVersion ? `Delete version V${versionNumber}` : 'Delete this entire JD';
  const discardDisabled = busy !== null || (!nothingSavedYet && discardTarget === null);
  const deleteDisabled = busy !== null || deleteBlockedReason !== null;

  const discardHint = nothingSavedYet
    ? 'Nothing has been saved yet. You leave the page and what you typed is cleared.'
    : discardTarget
      ? `Undo what you changed and go back to ${discardTarget}. The JD stays in Job Descriptions.`
      : 'Nothing has been saved for this JD yet, so there is no earlier version to go back to. Use Delete to remove it.';

  return (
    <AppModal
      open={open}
      onCancel={onCancel}
      cancelDisabled={busy !== null}
      size="lg"
      zIndexClass="z-[10000]"
      icon={<AlertTriangle />}
      title="Leave this job description?"
      subtitle="Choose what happens to this JD before you go"
      // Save as Draft is the primary action, so it is last: rightmost on desktop and
      // on top when the buttons stack on a phone.
      actions={[
        {
          label: 'Discard current changes',
          variant: 'secondary',
          onClick: onDiscard,
          disabled: discardDisabled,
          loading: busy === 'discard',
        },
        {
          label: deleteLabel,
          variant: 'destructive',
          onClick: onDelete,
          disabled: deleteDisabled,
          loading: busy === 'delete',
          title: deleteBlockedReason ?? undefined,
        },
        {
          label: 'Save as Draft',
          variant: 'primary',
          icon: <Save className="h-4 w-4" />,
          onClick: onSave,
          disabled: busy !== null,
          loading: busy === 'save',
        },
      ]}
    >
      {(jobCode || jobTitle) && (
        <div className="mb-4 flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
          {jobCode && <JobIdBadge className="flex-shrink-0">{jobCode}</JobIdBadge>}
          {jobTitle && (
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{jobTitle}</span>
          )}
        </div>
      )}

      <ul className="space-y-3 text-sm">
        <li className="flex gap-3">
          <Save className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <p className="text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Save as Draft</span> —{' '}
            {isPublishedJD
              ? 'save everything you changed to this JD (it stays Published) and leave.'
              : <>keep everything as it is now and leave. Continue later from Job Descriptions → Draft; it reopens on {currentStepLabel}.</>}
          </p>
        </li>
        <li className="flex gap-3">
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-400" />
          <p className="text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Cancel</span> — stay on this page and keep working.
          </p>
        </li>
        <li className={`flex gap-3 ${discardDisabled && busy === null ? 'opacity-60' : ''}`}>
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
          <p className="text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Discard current changes</span> — {discardHint}
          </p>
        </li>
        <li className={`flex gap-3 ${deleteBlockedReason ? 'opacity-60' : ''}`}>
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">{deleteLabel}</span> —{' '}
            {deleteBlockedReason ?? (isLaterVersion ? (
              <>
                permanently remove only V{versionNumber}. The earlier versions of {jobCode ?? 'this job'} and everything
                they were used in are kept. This cannot be undone.
              </>
            ) : (
              <>
                permanently remove this JD{jobCode ? ` (${jobCode})` : ''} and all its steps. It will not appear under
                Draft in Job Descriptions. This cannot be undone.
              </>
            ))}
          </p>
        </li>
      </ul>
    </AppModal>
  );
}
