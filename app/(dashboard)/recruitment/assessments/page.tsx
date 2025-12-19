'use client';

import Assessments from '@/components/Assessments';
import { mockJobs } from '@/lib/mockData';

export default function AssessmentsRoute() {
  return <Assessments jobs={mockJobs} />;
}
