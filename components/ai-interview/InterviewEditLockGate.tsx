'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import AppModal from '@/components/ui/app-modal';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import {
  AI_INTERVIEW_BEING_EDITED_EVENT,
  type InterviewBeingEditedDetail,
} from '@/lib/utils/aiInterviewEditSession';

/**
 * "Being edited by X" for the AI Interview wizard - the same choice the JD editor
 * gives. Another user changed this config's pending edits in the last 30 minutes.
 *
 * Event-driven, so no wizard step has to thread lock state through its save code:
 * aiInterviewService announces it (AI_INTERVIEW_BEING_EDITED_EVENT) when a wizard
 * load reports another editor, and when any staged save / Save as Draft / Discard
 * / Publish is refused with 409 INTERVIEW_BEING_EDITED - which is how the user who
 * was taken over finds out. Mount one per wizard step with the config's id.
 *
 *   View only  -> the interview's details page, nothing changes.
 *   Take over  -> this user becomes the editor; the other user's pending edits are
 *                 KEPT and carried on from, and their next save is refused.
 */
export default function InterviewEditLockGate({ configId }: { configId: string | null | undefined }) {
  const router = useRouter();
  const [lock, setLock] = useState<InterviewBeingEditedDetail | null>(null);
  const [takingOver, setTakingOver] = useState(false);

  useEffect(() => {
    if (!configId) return;
    const onBeingEdited = (event: Event) => {
      const detail = (event as CustomEvent<InterviewBeingEditedDetail>).detail;
      if (detail?.id === configId) setLock(detail);
    };
    window.addEventListener(AI_INTERVIEW_BEING_EDITED_EVENT, onBeingEdited);
    return () => window.removeEventListener(AI_INTERVIEW_BEING_EDITED_EVENT, onBeingEdited);
  }, [configId]);

  if (!lock || lock.id !== configId) return null;

  const since = lock.since ? new Date(lock.since).toLocaleString() : null;
  const editor = lock.editorName || 'Another user';

  const takeOver = async () => {
    setTakingOver(true);
    try {
      await aiInterviewService.takeOverEditing(lock.id);
      setLock(null);
      toast.success('You are now editing this interview', {
        description: `${editor}'s unsaved changes were kept. Continue from here.`,
      });
    } catch (error) {
      toast.error('Could not take over this interview', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setTakingOver(false);
    }
  };

  return (
    <AppModal
      open
      size="sm"
      zIndexClass="z-[10001]"
      icon={<AlertTriangle />}
      title="Being edited by someone else"
      subtitle={editor}
      cancelLabel="View only"
      cancelDisabled={takingOver}
      onCancel={() => router.push(`/recruitment/ai-interviews/${encodeURIComponent(lock.id)}`)}
      actions={[{ label: 'Take over', onClick: () => void takeOver(), loading: takingOver, disabled: takingOver }]}
    >
      <p className="text-sm text-gray-700 dark:text-slate-300">
        <span className="font-semibold">{editor}</span> is editing this AI interview
        {since ? ` (last change ${since})` : ''}.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-slate-400">
        <li><span className="font-semibold">View only</span> — open the interview without editing it.</li>
        <li>
          <span className="font-semibold">Take over</span> — their unsaved changes are kept and you continue
          from there. They will not be able to save further changes.
        </li>
      </ul>
    </AppModal>
  );
}
