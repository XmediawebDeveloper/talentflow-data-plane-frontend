'use client';

import { Users } from 'lucide-react';
import TabEmptyState, { TAB_EMPTY_ACTION_CLASS } from '@/components/ui/tab-empty-state';

export default function TmpModalPreview() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 p-8">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
        <TabEmptyState
          icon={Users}
          imageSrc="/scored-resumes-empty-state.png"
          imageAlt="Scored resumes illustration"
          title="No Scored Resumes"
          description="Score resumes against this job description to see the candidates here."
          action={<button className={TAB_EMPTY_ACTION_CLASS}>Score Resumes</button>}
        />
      </div>
    </div>
  );
}
