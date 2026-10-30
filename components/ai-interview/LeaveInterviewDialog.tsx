'use client';

import { useState } from 'react';
import { AlertTriangle, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import AppModal from '@/components/ui/app-modal';
import { deleteWizardConfig, discardWizardChanges, keepWizardChanges } from '@/lib/utils/aiInterviewWizardExit';
import { LEAVE_BACK } from './useInterviewLeaveGuard';

export type LeaveInterviewBusy = 'save' | 'discard' | 'delete' | null;

export interface LeaveInterviewDialogProps {
  open: boolean;
  /** The job's code (JD-076). Accepted but not shown — the prompt carries only
   *  the four actions, like LeaveJDDialog. */
  jdCode?: string | null;
  /** Accepted but not shown, like `jdCode`. */
  title?: string;
  /** Lineage version (1, 2, ...) of the interview on screen. */
  versionNumber?: number;
  /** Nothing is stored yet (Configure before its first save): Discard just leaves. */
  nothingSavedYet: boolean;
  /** The config was created in this visit (a new interview, or the version
   *  Duplicate just minted) and never kept: Discard deletes it. */
  createdThisVisit: boolean;
  /** Editing a PUBLISHED config: Save keeps the changes pending and it stays live. */
  isPublished: boolean;
  /** Offer "Delete this interview" — a saved DRAFT nobody was invited to. Left
   *  out for a published config, and for one created this visit, where Discard
   *  already deletes it. */
  canDelete: boolean;
  /** Short name of the step the recruiter is on, e.g. "Clusters". */
  currentStepLabel: string;
  busy: LeaveInterviewBusy;
  onCancel: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}

/**
 * The prompt shown when the recruiter leaves the AI Interview wizard
 * (Configure, Clusters or Preview & Publish — a breadcrumb, a menu link,
 * browser Back, or the popup's Cancel) with something unsaved: edits not yet
 * kept, or a new interview never saved. The AI interview counterpart of
 * LeaveJDDialog, and laid out the same way.
 *
 * Editing an existing config no longer writes into it as you go — the wizard's
 * saves are held as PENDING edits beside it (lib/utils/aiInterviewEditSession)
 * — so every option here really does what it says: Discard drops them and the
 * interview is exactly as it was, Save as Draft keeps them, and a published
 * interview stays live either way.
 */
export default function LeaveInterviewDialog({
  open,
  versionNumber = 1,
  nothingSavedYet,
  createdThisVisit,
  isPublished,
  canDelete,
  currentStepLabel,
  busy,
  onCancel,
  onSave,
  onDiscard,
  onDelete,
}: LeaveInterviewDialogProps) {
  const isLaterVersion = versionNumber > 1;
  const earlierVersions = versionNumber === 2 ? 'V1 is' : `V1–V${versionNumber - 1} are`;

  const discardHint = nothingSavedYet
    ? 'nothing has been saved yet, so you just leave the page and what you set up is cleared.'
    : createdThisVisit
      ? isLaterVersion
        ? `delete this new V${versionNumber} draft — it was never saved. ${earlierVersions} not affected.`
        : 'delete this new interview — it was never saved, so nothing is kept.'
      : isPublished
        ? 'drop every change you have not published. The live interview stays exactly as it is.'
        : 'drop the changes since this draft was last saved. The draft stays in AI Interviews as it was.';

  const saveHint = isPublished
    ? 'keep your changes and leave. The interview stays live as it is now; your changes go live when you publish.'
    : <>keep everything as it is now and leave. Continue later from AI Interviews → Draft; it reopens on {currentStepLabel}.</>;

  return (
    <AppModal
      open={open}
      onCancel={onCancel}
      cancelDisabled={busy !== null}
      size="md"
      tone="warning"
      compactFooter
      zIndexClass="z-[10000]"
      icon={<AlertTriangle />}
      title="Leave this AI interview?"
      subtitle="Choose what happens to your changes before you go"
      // Save as Draft is the primary action, so it is last: rightmost on desktop and
      // on top when the buttons stack on a phone.
      actions={[
        {
          label: 'Discard current changes',
          variant: 'secondary',
          onClick: onDiscard,
          disabled: busy !== null,
          loading: busy === 'discard',
        },
        ...(canDelete
          ? [{
              label: 'Delete this interview',
              variant: 'destructive' as const,
              onClick: onDelete,
              disabled: busy !== null,
              loading: busy === 'delete',
            }]
          : []),
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
      <ul className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/15 dark:bg-orange-500/15 dark:text-orange-300">
            <Save className="h-4 w-4" />
          </span>
          <p className="pt-1 text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Save as Draft</span> — {saveHint}
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
            <Undo2 className="h-4 w-4" />
          </span>
          <p className="pt-1 text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Cancel</span> — stay on this page and keep working.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 bg-brand-teal/10 text-brand-teal ring-brand-teal/15 dark:bg-brand-teal/15">
            <RotateCcw className="h-4 w-4" />
          </span>
          <p className="pt-1 text-gray-700 dark:text-slate-300">
            <span className="font-semibold text-gray-900 dark:text-slate-100">Discard current changes</span> — {discardHint}
          </p>
        </li>
        {canDelete && (
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 bg-red-50 text-red-600 ring-red-100 dark:bg-red-500/15 dark:text-red-400 dark:ring-red-500/20">
              <Trash2 className="h-4 w-4" />
            </span>
            <p className="pt-1 text-gray-700 dark:text-slate-300">
              <span className="font-semibold text-gray-900 dark:text-slate-100">Delete this interview</span> —{' '}
              {isLaterVersion
                ? <>permanently remove this V{versionNumber} draft. {earlierVersions} kept. This cannot be undone.</>
                : 'permanently remove this draft interview. It will not appear under Draft in AI Interviews. This cannot be undone.'}
            </p>
          </li>
        )}
      </ul>
    </AppModal>
  );
}

/**
 * LeaveInterviewDialog wired to a step's leave guard (useInterviewLeaveGuard) —
 * what Clusters and Preview & Publish render. Each option settles the config
 * the same way the step's own footer buttons do (lib/utils/aiInterviewWizardExit),
 * then carries out the held leave.
 */
export function WizardLeavePrompt({
  target,
  onStay,
  onLeave,
  configId,
  status,
  createdThisVisit,
  canDelete,
  versionNumber,
  jdCode,
  title,
  currentStepLabel,
  saveState,
  afterDeleteHref,
}: {
  /** The held leave (an address, LEAVE_BACK or LEAVE_EXIT); null = closed. */
  target: string | null;
  onStay: () => void;
  onLeave: (target: string) => void;
  configId: string;
  status: string | null | undefined;
  createdThisVisit: boolean;
  canDelete: boolean;
  versionNumber?: number;
  jdCode?: string | null;
  title?: string;
  currentStepLabel: string;
  /** Write the step's current state (staged on an existing config). False =
   *  it failed and the step has already said why. */
  saveState: () => Promise<boolean>;
  /** Where Back goes once the config is gone: the page before may be one of
   *  its own wizard steps, which could no longer load it. */
  afterDeleteHref: string;
}) {
  const [busy, setBusy] = useState<LeaveInterviewBusy>(null);

  const handleSave = async () => {
    if (!target) return;
    setBusy('save');
    try {
      if (!(await saveState())) return;
      toast.success(await keepWizardChanges(configId, status));
      onLeave(target);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, 'Failed to save draft'));
    } finally {
      setBusy(null);
    }
  };

  const handleDiscard = async () => {
    if (!target) return;
    setBusy('discard');
    const ok = await discardWizardChanges(configId, createdThisVisit);
    if (ok && createdThisVisit) toast.success('Draft discarded');
    setBusy(null);
    onLeave(createdThisVisit && target === LEAVE_BACK ? afterDeleteHref : target);
  };

  const handleDelete = async () => {
    if (!target) return;
    setBusy('delete');
    try {
      await deleteWizardConfig(configId);
      toast.success('AI interview deleted');
      onLeave(target === LEAVE_BACK ? afterDeleteHref : target);
    } catch (err) {
      toast.error(friendlyErrorMessage(err, 'Failed to delete AI interview'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <LeaveInterviewDialog
      open={target !== null}
      jdCode={jdCode}
      title={title}
      versionNumber={versionNumber}
      nothingSavedYet={false}
      createdThisVisit={createdThisVisit}
      isPublished={status === 'published'}
      canDelete={canDelete && !createdThisVisit && status === 'draft'}
      currentStepLabel={currentStepLabel}
      busy={busy}
      onCancel={onStay}
      onSave={() => void handleSave()}
      onDiscard={() => void handleDiscard()}
      onDelete={() => void handleDelete()}
    />
  );
}
