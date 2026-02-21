'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { CandidateAssessmentPortal } from '@/components/candidate/CandidateAssessmentPortal';

export default function TakeAssessmentPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const candidateName = searchParams.get('c') || undefined;
  const role = searchParams.get('r') || undefined;

  return <CandidateAssessmentPortal token={token} candidateName={candidateName} role={role} />;
}
