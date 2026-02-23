'use client';

import { useParams } from 'next/navigation';
import { CandidateAIInterviewPortal } from '@/components/candidate/CandidateAIInterviewPortal';

export default function AIInterviewPage() {
  const params = useParams();
  const token = params.token as string;

  return <CandidateAIInterviewPortal token={token} />;
}
