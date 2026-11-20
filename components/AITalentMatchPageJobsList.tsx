import { Sparkles, ArrowLeft, Info, Plus } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
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
  const canCreateJD = isTenantAdmin || !!user?.permissions?.canCreateJD;
  const router = useRouter();

  // One job version at a time — the card's latest, or an older Published one
  // picked from its View Versions.
  const [selection, setSelection] = useState<JobSelection>(null);


  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet min-h-[calc(100dvh-7rem)]">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Talent Match', onClick: onViewHistory },
              { label: 'Select Job Description' },
            ]}
          />
      {/* Header — the shared PageHeader, same as Resume Scoring's Score Resumes. */}
      <PageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="AI Talent Match"
        description="Select a job and let AI find the best matching candidates."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            {onBack && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onBack}
                aria-label="Back to Dashboard" title="Back to Dashboard"
                icon={<ArrowLeft className="w-4 h-4" />}
              >
                Back
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!canCreateJD) return;
                router.push('/recruitment/jd-creation?from=ai-talent-match');
              }}
              aria-disabled={!canCreateJD}
              className={`w-full sm:w-auto${!canCreateJD ? ' opacity-60 cursor-not-allowed' : ''}`}
              title={!canCreateJD ? 'You do not have permission to create job descriptions' : undefined}
              icon={<Plus className="w-4 h-4" />}
            >
              Create New Job
            </Button>
          </div>
        }
      />

      {/* Job list — Score Resumes' card: Job Eligibility (with the status
          chips) on top, then the picker. */}
      <section className="tf-card mb-5 overflow-hidden" aria-label="Select Job Description">
        <div className="p-3 sm:p-4">
        <JobEligibilityNote className="mb-4" showLegend description={MATCH_ELIGIBILITY} />
        {/* Running a match is free — said up front, before a job is picked.
            The Resume Scoring units the results screen checks are spent only
            when matched resumes are submitted for scoring. Same info tokens
            as the eligibility card above it. */}
        <div className="mb-4 flex items-start gap-2 rounded-sm border border-[var(--info-line)] bg-[var(--info-subtle)] px-3 py-2.5">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-[var(--info-strong)]" />
          <p className="min-w-0 tf-meta leading-relaxed">
            <span className="font-semibold text-[var(--info-strong)]">Note:</span>{' '}
            Running AI Talent Match uses no units. Units are used only when you score matched resumes — 1 unit per resume.
          </p>
        </div>
        <JobOpeningPickerList
          /* Score Resumes' layout: "Select a Job Opening" + count left,
             Search Jobs right, on one row. */
          layout="page"
          excludeDraftsOnly
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
      </section>

      </div>
      </div>
    </main>
  );
}
