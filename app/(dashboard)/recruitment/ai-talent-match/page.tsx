'use client';

import AITalentMatchPage from '@/components/AITalentMatchPage';
import { mockJobs } from '@/lib/mockData';

export default function AITalentMatchRoute() {
  // Cast mockJobs to match the component's expected type
  const jobs = mockJobs.map(job => ({
    ...job,
    applicants: job.applicants ?? 0,
  }));

  return <AITalentMatchPage jobs={jobs} />;
}
