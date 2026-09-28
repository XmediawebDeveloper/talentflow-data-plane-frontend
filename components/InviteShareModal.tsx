'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { assessmentService } from '@/lib/services/assessmentService';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds } from '@/lib/utils/assessmentUtils';
import InviteToAssessmentFlow from './InviteToAssessmentFlow';
import ShareAssessmentModal from './ShareAssessmentModal';
import type { Resume } from '@/lib/types/types';

// Shape ShareAssessmentModal expects for an assessment.
interface ShareAssessment {
  id: string;
  title: string;
  duration: string;
  questions: number;
  type: string;
  short_id?: string;
  version?: number;
  jd_short_id?: string;
  jd_title?: string;
  jd_version?: number;
  hr_enabled?: boolean;
  technical_enabled?: boolean;
  coding_enabled?: boolean;
}

interface InviteCandidate {
  id?: string;
  resumeId?: string;
  candidateName?: string;
  name?: string;
  email: string;
  phone?: string;
}

interface InviteShareModalProps {
  candidate: InviteCandidate;
  jobId: string;
  jobTitle: string;
  onClose: () => void;
}

// Map a raw assessment API item into the shape ShareAssessmentModal consumes.
// Mirrors mapAssessmentFromApi in Assessments.tsx (only the fields the modal reads).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toShareAssessment(a: any): ShareAssessment {
  return {
    id: a.id,
    title: a.title,
    duration: `${a.duration_minutes} min`,
    questions: (a.hr_enabled ? 10 : 0) + (a.technical_enabled ? 10 : 0) + (a.coding_enabled ? 5 : 0),
    type: a.technical_enabled ? 'Technical' : a.hr_enabled ? 'Behavioral' : 'Aptitude',
    short_id: a.short_id,
    version: a.version,
    jd_short_id: a.jd_short_id,
    jd_title: a.jd_title,
    jd_version: a.jd_version,
    hr_enabled: a.hr_enabled,
    technical_enabled: a.technical_enabled,
    coding_enabled: a.coding_enabled,
  };
}

/**
 * The resume-scoring Invite → Assessment action: the shared Invite to
 * Assessment dialog (InviteToAssessmentFlow — the Invite to AI Interview
 * dialog's layout), opened on the row's own job so it lists that job
 * version's assessments as cards, with "Browse all assessments instead" for
 * the rest; then the SAME ShareAssessmentModal the Assessment module uses,
 * with this candidate prefilled.
 *
 * One assessment per invite, as this action has always sent. Only published,
 * non-archived, non-revoked assessments are offered — the rule this action
 * has always applied — loaded across every job (like AI Talent Match's and a
 * resume's Invite → Assessment) so "Browse all" really is all of them.
 */
export default function InviteShareModal({ candidate, jobId, onClose }: InviteShareModalProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [picked, setPicked] = useState<any[]>([]);
  const [selected, setSelected] = useState<ShareAssessment | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await assessmentService.list({ status: 'published', page_size: 100 });
        const revokedIds = getLocallyRevokedAssessmentIds();
        const active = (response.items || []).filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any) =>
            a.status === 'published' &&
            !a.is_archived &&
            !isAssessmentRevoked(a, revokedIds)
        );
        if (!cancelled) setAssessments(active);
      } catch (error) {
        console.error('Failed to load assessments for invite:', error);
        if (cancelled) return;
        toast.error('Failed to load assessments');
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Only email is actually required to prefill — a candidate scored without a
  // name on file used to blank the WHOLE form (name AND email empty) because
  // this required both, when only the email is what an invite can't be sent
  // without. Missing just the name shouldn't cost the email too.
  const candidateName = candidate.candidateName || candidate.name || '';
  const candidateId = candidate.resumeId || candidate.id || '1';
  const prefilledCandidates =
    candidate.email
      ? [{
          id: candidateId,
          name: candidateName,
          email: candidate.email,
          phone: candidate.phone,
          source: 'manual' as const,
          resumeId: candidate.resumeId,
        }]
      : undefined;

  // Once an assessment is picked, hand off to the shared ShareAssessmentModal.
  if (selected) {
    return (
      <ShareAssessmentModal
        isOpen
        onClose={onClose}
        assessment={selected}
        prefilledCandidates={prefilledCandidates}
        inviteSource="Resume Scoring"
      />
    );
  }

  return (
    <InviteToAssessmentFlow
      open
      onClose={onClose}
      assessments={assessments}
      loading={loading}
      selectedAssessments={picked}
      onSelectedAssessmentsChange={setPicked}
      candidates={[{ id: candidateId, name: candidateName || 'Unknown', email: candidate.email || undefined }]}
      resumes={[{
        id: candidateId,
        name: candidateName || 'Unknown',
        email: candidate.email,
        phone: candidate.phone,
      } as unknown as Resume]}
      onProceed={() => {
        if (picked[0]) setSelected(toShareAssessment(picked[0]));
      }}
      jobId={jobId && jobId !== 'global' ? jobId : undefined}
    />
  );
}
