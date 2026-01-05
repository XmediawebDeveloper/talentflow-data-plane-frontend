'use client';

import { useParams } from 'next/navigation';
import { CandidateAssessmentPortal } from '@/components/candidate/CandidateAssessmentPortal';

export default function AssessmentPage() {
  const params = useParams();
  const token = params.token as string;

  return <CandidateAssessmentPortal token={token} />;
}
