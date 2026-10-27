import { Sparkles, ArrowRight, Info } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import JobOpeningPickerList, { type JobSelection } from '@/components/jobs/JobOpeningPickerList';
import JobEligibilityNote, { MATCH_ELIGIBILITY } from '@/components/jobs/JobEligibilityNote';

/* AI TALENT MATCH — SELECT JOB.

   The job list is the shared `JobOpeningPickerList` (Resume Scoring's job
   picker), in its `excludeDraftsOnly` mode: the Job Descriptions page's All
   Jobs listing without drafts. Each job by its latest non-draft version, the
   same rows the Job Descriptions page draws (one `JobOpeningSummary`), newest
   first, every job fetched rather than the first page; Disabled / Archived
   jobs shown but not selectable, and their older Published versions still
   pickable from View Versions. Picking one puts Run AI Match on that card.

   This page keeps only its own chrome around it: breadcrumb, header and the
   no-units note above the list. */

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
  jobId?: string;
  currentVersion?: number;
  versionNumber?: number;
  industryType?: string;
  remoteType?: string;
  postedBy?: string;
  postedDate?: string;
  createdAt?: string;
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: unknown[];
}

interface AITalentMatchPageJobsListProps {
  /** Kept for the host's call site. The picker fetches the full job list
   *  itself, the way the Job Descriptions page does. */
  jobs: Job[];
  matchHistory: MatchHistory[];
  /** Runs the match for the picked JD version's id. */
  onSelectJob: (jobId: string) => void;
  onViewHistory: () => void;
  onBack?: () => void;
}

export default function AITalentMatchPageJobsList({
  onSelectJob,
  onViewHistory,
  onBack,
}: AITalentMatchPageJobsListProps) {
  const { user, isTenantAdmin } = useAuth();
  const canRunAiMatch = isTenantAdmin || (user?.permissions?.canRunAiMatch ?? false);

  // One job version at a time — the card's latest, or an older Published one
  // picked from its View Versions.
  const [selection, setSelection] = useState<JobSelection>(null);


  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Talent Match', onClick: onViewHistory },
              { label: 'Select Job Description' },
            ]}
          />
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
          {onBack && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onBack}
              className="px-2"
              aria-label="Back to Dashboard" title="Back to Dashboard"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 rotate-180" />
            </Button>
          )}
          <div className="w-9 h-9 sm:w-12 sm:h-12 bg-brand-blue rounded-lg sm:rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
            <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 truncate tracking-tight">AI Talent Match - Select Job</h1>
            <p className="text-sm text-gray-600 truncate">Choose a job to find the best matching candidates using AI</p>
          </div>
        </div>
      </div>

      {/* Running a match is free — said up front, before a job is picked. The
          Resume Scoring units the results screen checks are spent only when
          matched resumes are submitted for scoring. */}
      <div className="mb-4 sm:mb-6 flex items-start gap-2.5 rounded-xl border border-brand-blue/15 bg-gradient-to-r from-brand-blue/[0.07] via-brand-cyan/[0.05] to-white dark:from-brand-blue/10 dark:via-brand-cyan/5 dark:to-slate-900 px-3 sm:px-4 py-3 ring-1 ring-black/[0.02]">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand-blue" />
        <p className="min-w-0 text-sm text-gray-700 dark:text-slate-300">
          <span className="font-semibold text-gray-900 dark:text-slate-50">Note:</span>{' '}
          Running AI Talent Match uses no units. Units are used only when you score matched resumes — 1 unit per resume.
        </p>
      </div>

      {/* Job list */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 lg:p-5">
        <JobEligibilityNote className="mb-3" description={MATCH_ELIGIBILITY} />
        <JobOpeningPickerList
          excludeDraftsOnly
          availableVersionsOnly
          showCandidateCounts
          /* Coloured like the Job Openings badges, applicants read "scored". */
          coloredCountBadges
          applicantsLabel="Scored"
          selection={selection}
          onSelectionChange={setSelection}
          radioGroupName="ai-talent-match-job"
          onProceed={() => { if (selection && canRunAiMatch) onSelectJob(selection.job.id); }}
          proceedLabel="Run AI Match"
          proceedDisabled={!canRunAiMatch}
        />
      </div>

      </div>
      </div>
    </main>
  );
}
