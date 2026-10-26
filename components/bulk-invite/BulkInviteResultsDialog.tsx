'use client';

import { Send } from 'lucide-react';
import AppModal from '@/components/ui/app-modal';
import BulkInviteProgressPanel from './BulkInviteProgressPanel';
import type { TrackedBulkInvite } from '@/contexts/BulkInviteProgressContext';

/**
 * A bulk send's progress and results, opened from the floating progress
 * widget anywhere in the app (the popup that started the send may be long
 * closed). The standard AppModal: Cancel in the footer, no ✕.
 */
export default function BulkInviteResultsDialog({
  job,
  onClose,
}: {
  job: TrackedBulkInvite;
  onClose: () => void;
}) {
  const kindLabel = job.kind === 'assessment' ? 'Assessment' : 'AI Interview';
  return (
    <AppModal
      open
      onCancel={onClose}
      cancelLabel="Close"
      size="lg"
      icon={<Send className="w-4 h-4 text-brand-blue" />}
      title={`${kindLabel} invitations`}
      subtitle={[job.jdCode, job.jdTitle, job.version_label].filter(Boolean).join(' · ') || undefined}
      zIndexClass="z-[70]"
    >
      <BulkInviteProgressPanel jobId={job.job_id} initialJob={job} />
    </AppModal>
  );
}
