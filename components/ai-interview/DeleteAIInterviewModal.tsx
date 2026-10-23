'use client';

import { JD_DISABLED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import DeleteRecordModal from '@/components/recruitment/DeleteRecordModal';

export interface DeleteAIInterviewModalProps {
  isOpen: boolean;
  /** The config being deleted — rendered in the Job Details card below the message. */
  jobShortId?: string;
  jobTitle: string;
  jobVersion?: number;
  version?: number;
  createdAt?: string;
  createdBy?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  /** The interview's job is disabled: Confirm stays off until it is enabled again. */
  jdDisabled?: boolean;
}

/**
 * The confirm shown before an AI interview configuration is permanently
 * deleted — the shared Recruitment delete confirm (`DeleteRecordModal`), so it
 * matches the Assessments one.
 */
export default function DeleteAIInterviewModal({
  isOpen,
  jobShortId,
  jobTitle,
  jobVersion,
  version,
  createdAt,
  createdBy,
  onConfirm,
  onCancel,
  isLoading = false,
  jdDisabled = false,
}: DeleteAIInterviewModalProps) {
  return (
    <DeleteRecordModal
      isOpen={isOpen}
      kind="AI Interview"
      target={{ jobShortId, jobTitle, jobVersion, version, createdAt, createdBy }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isLoading}
      disabledReason={jdDisabled ? JD_DISABLED_ACTION_MESSAGE : undefined}
    />
  );
}
