'use client';

import { Resume, Job } from '@/lib/types/types';
import ApplyToJobModal from './ApplyToJobModal';

interface AITalentMatchSelectJobModalProps {
  resumes: Resume[];
  jobs: Job[];
  onClose: () => void;
  /** The third argument is the job record itself — see ApplyToJobModal.onApply. */
  onMatch: (resumeIds: string[], jobId: string, jobRecord?: Job) => void;
  stayOnCurrentPage?: boolean;
  confirmLabel?: string;
}

/**
 * AI Talent Match's job picker.
 *
 * This was a near-copy of the Apply to Job dialog that drifted from it — no
 * candidate checkboxes, no resume versions, no preview, its own search that
 * only matched titles, and ineligible jobs hidden rather than explained. It is
 * now a thin adapter over that dialog, so the two stay identical by
 * construction; only the wording and the callback shape differ.
 */
export default function AITalentMatchSelectJobModal({
  resumes,
  jobs,
  onClose,
  onMatch,
  stayOnCurrentPage = false,
  confirmLabel,
}: AITalentMatchSelectJobModalProps) {
  return (
    <ApplyToJobModal
      mode="match"
      resumes={resumes}
      jobs={jobs}
      onClose={onClose}
      stayOnCurrentPage={stayOnCurrentPage}
      confirmLabel={confirmLabel}
      // One job at a time here too, so the first id is the whole answer.
      onApply={(resumeIds, jobIds, selectedJobRecords) => {
        if (resumeIds.length === 0 || !jobIds[0]) return;
        onMatch(resumeIds, jobIds[0], selectedJobRecords?.[0]);
      }}
    />
  );
}
