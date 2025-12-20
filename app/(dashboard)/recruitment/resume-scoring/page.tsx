'use client';

import ResumeScoringPage from '@/components/ResumeScoringPage';
import { mockJobs, mockResumes, mockFolders } from '@/lib/mockData';

export default function ResumeScoringRoute() {
  return (
    <ResumeScoringPage
      jobs={mockJobs}
      resumes={mockResumes}
      folders={mockFolders}
    />
  );
}
