'use client';

import { Briefcase, Plus, Search, Sparkles, Eye, ChevronDown, CheckCircle2, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { isJdDisabled, JD_DISABLED_ACTION_MESSAGE, isJdArchived, JD_ARCHIVED_ACTION_MESSAGE } from '@/lib/services/aiInterviewService';
import type { PublishedJD } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { AIInterviewStepIndicator, useBreadcrumbOffset } from './AIInterviewStepIndicator';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import { Button } from '@/components/ui/button';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import ListPagination from '@/components/ListPagination';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { lineageKey, isSelectableVersion, mapJDToJob, jobSearchMatcher, sortJobs, buildAssessmentJobList, needsVersionPicker, groupByLineage } from '@/lib/utils/jobOpeningDisplay';
import type { Job } from '@/lib/types/types';
import { publishedJdToJob } from '@/lib/utils/publishedJdToJob';
import { jdService } from '@/lib/services';
import { useJobCandidateCounts } from '@/lib/hooks/useJobCandidateCounts';
import JobEligibilityNote from '@/components/jobs/JobEligibilityNote';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAllRows } from '@/lib/utils/fetchAllRows';

const JD_RADIO_GROUP = 'ai-interview-jd-version-selection';
const ADD_BUTTON_DISABLED = 'bg-slate-200 text-slate-400 ring-slate-300/60 shadow-none cursor-not-allowed';

/** Created / Not Created — the Assessments picker's per-version label. */
function InterviewCreatedLabel({ created }: { created: boolean }) {
  return (
    <span
      className={`px-2 sm:px-2.5 py-1 rounded text-xs inline-flex items-center gap-1 whitespace-nowrap ring-1 ${
        created
          ? 'bg-success-subtle text-success ring-success-line'
          : 'bg-slate-100 text-slate-500 ring-slate-200'
      }`}
    >
      {created && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
      {created ? 'Created' : 'Not Created'}
    </span>
  );
}

export default function AIInterviewJDSelection() {
  const router = useRouter();
  /* Step indicator pins below the sticky breadcrumb rather than under it. */
  const [breadcrumbBarRef, breadcrumbHeight] = useBreadcrumbOffset();
  const { user, isTenantAdmin } = useAuth();
  const canCreateJD = isTenantAdmin || !!user?.permissions?.canCreateJD;
  const canCreateAIInterviews = isTenantAdmin || !!user?.permissions?.canCreateAIInterviews;
  const [jds, setJds] = useState<PublishedJD[]>([]);
  const [loadingJds, setLoadingJds] = useState(true);
  const [jdSearch, setJdSearch] = useState('');
  const [jdPage, setJdPage] = useState(1);
  const [jdItemsPerPage, setJdItemsPerPage] = useState(10);
  const [versionHistoryFor, setVersionHistoryFor] = useState<{ id: string; title: string } | null>(null);
  const [versionHistoryVersion, setVersionHistoryVersion] = useState<number | null>(null);
  const jdLineage = useJobVersionLineage();
  /* The JD version ticked in the picker — the card's radio picks the latest,
     a Version History row picks an older one. Held with its lineage so every
     other job's radios go inert while one is set, as on the Assessments picker. */
  const [jdPick, setJdPick] = useState<{ lineage: string; job: Job } | null>(null);
  const pickJdVersion = (job: Job, lineage: string) =>
    setJdPick(prev => (prev?.job.id === job.id ? null : { job, lineage }));
  /* JD version ids that already carry an AI interview — one per version. */
  const [jdsWithInterview, setJdsWithInterview] = useState<Set<string>>(new Set());
  const [eligibilityLoaded, setEligibilityLoaded] = useState(false);
  /* The full Job Openings rows, by version id. The interview endpoint sends a
     slimmer JD (no salary, work mode, applicants, last updated or lineage
     version number), so each card is drawn from the same row the Assessments
     picker draws, falling back to the slim one where the list lacks it. */
  const [fullJobsById, setFullJobsById] = useState<Map<string, Job>>(new Map());
  const [loadError, setLoadError] = useState<'jobs' | 'eligibility' | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const candidateCounts = useJobCandidateCounts();
  const jdListRef = useRef<HTMLDivElement | null>(null);

  /* Loading is raised by whoever asks for the read (initial state, Retry), not
     here — setState only lands once the requests settle. */
  useEffect(() => {
    let cancelled = false;
    const jdParams = { source: 'my-jds' as const };
    Promise.allSettled([
      aiInterviewService.getPublishedJDs(),
      fetchAllRows((page_size, page) => jdService.list({ ...jdParams, page_size, page })),
    ]).then(([published, full]) => {
      if (cancelled) return;
      if (published.status === 'fulfilled') {
        setJds(published.value.items);
        setLoadError(prev => (prev === 'jobs' ? null : prev));
      } else {
        console.error('Failed to load JDs:', published.reason);
        setLoadError('jobs');
      }
      if (full.status === 'fulfilled' && full.value?.items) {
        setFullJobsById(new Map(full.value.items.map((row: Parameters<typeof mapJDToJob>[0]) => [row.id, mapJDToJob(row)] as const)));
      }
      setLoadingJds(false);
    });
    return () => { cancelled = true; };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const PAGE_SIZE = 20;
        const first = await aiInterviewService.listConfigs({ page: 1, page_size: PAGE_SIZE, compact: true });
        const totalPages = Math.max(1, first.total_pages || Math.ceil(first.total / PAGE_SIZE));
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            aiInterviewService.listConfigs({ page: i + 2, page_size: PAGE_SIZE, compact: true }),
          ),
        );
        if (cancelled) return;
        const items = [...first.items, ...rest.flatMap((page) => page.items)];
        setJdsWithInterview(new Set(items.map((c) => c.jd_id).filter((id): id is string => !!id)));
        setEligibilityLoaded(true);
        setLoadError(prev => (prev === 'eligibility' ? null : prev));
      } catch {
        if (!cancelled) setLoadError(prev => prev ?? 'eligibility');
      }
    })();
    return () => { cancelled = true; };
  }, [reloadToken]);

  const versionHasInterview = (versionId: string) => jdsWithInterview.has(versionId);
  /* Add stays off until we know which versions are taken — before that every
     version reads as free, and a press would carry a taken one into Configure. */
  const addReady = eligibilityLoaded && loadError !== 'eligibility';

  const toJob = (jd: PublishedJD): Job => fullJobsById.get(jd.id)
    ?? (isJdDisabled(jd.status)
      ? { ...publishedJdToJob(jd), status: 'Disabled' }
      : isJdArchived(jd.status)
        ? { ...publishedJdToJob(jd), status: 'Archived' }
        : publishedJdToJob(jd));
  const isJobDisabled = (job: Pick<Job, 'status'>) => isJdDisabled(String(job.status || ''));
  const isJobArchived = (job: Pick<Job, 'status'>) => isJdArchived(String(job.status || ''));

  // Versions with a published AI interview config never reach the list — a JD
  // can't be configured twice. Disabled and Archived JDs are listed
  // separately, read-only.
  const selectableJds = jds.filter(jd => jd.has_published_config !== true && !isJdDisabled(jd.status) && !isJdArchived(jd.status));

  /* ONE CARD PER JOB, on the Assessments picker's own rule and through its
     own helper, so the two lists cannot drift: each job is listed on its
     newest version that is Published (or Republished) AND has no AI
     interview yet — draft config or published. A job with no such version
     gets no card; its versions, taken ones included, are still in Job
     Openings and in View Versions. Newest job first. */
  const buildableJobs = buildAssessmentJobList(selectableJds.map(toJob), version => versionHasInterview(version.id));
  /* Disabled and Archived jobs stay visible exactly as before the status
     changed — one card per job, on its newest non-draft version, read-only
     until the job is enabled/restored. Grouped from the FULL fetched list
     (not just the ones already filtered to one status) so a lineage with
     more than one non-published version still gets exactly one row, on
     whichever is actually newest — never a stale Disabled row sitting under
     a job whose latest version has since been archived, or the reverse. */
  const buildableLineages = new Set(buildableJobs.map(lineageKey));
  const inactiveJobs = new Map<string, Job>();
  groupByLineage(jds.map(toJob)).forEach((bucket, key) => {
    if (buildableLineages.has(key)) return;
    const latestNonDraft = bucket.find(job => job.status !== 'Draft');
    if (latestNonDraft && (isJobDisabled(latestNonDraft) || isJobArchived(latestNonDraft))) {
      inactiveJobs.set(key, latestNonDraft);
    }
  });
  const availableJobs = sortJobs([...buildableJobs, ...inactiveJobs.values()], 'date', 'desc');
  // True when published versions exist but every one already has an AI
  // interview — the empty state then says so instead of "create a JD first".
  const allConfigured = jds.length > 0 && availableJobs.length === 0;
  /* The shared matcher: JD number, role, department, location — the fields the
     Assessments picker and the Apply to Job dialog search. */
  const lineageJobs = availableJobs.filter(jobSearchMatcher(jdSearch));

  const jdTotalPages = Math.max(1, Math.ceil(lineageJobs.length / jdItemsPerPage));
  const jdSafePage = Math.min(jdPage, jdTotalPages);
  const pagedJobs = lineageJobs.slice((jdSafePage - 1) * jdItemsPerPage, jdSafePage * jdItemsPerPage);

  const jdPickOnThisPage = !!jdPick && pagedJobs.some(job => lineageKey(job) === jdPick.lineage);
  /* Every version we hold, for the View Versions test below. */
  const allVersions = [...fullJobsById.values()];

  const handleCreateForVersion = (jdId: string) => {
    const status = jds.find(jd => jd.id === jdId)?.status;
    if (isJdDisabled(status)) {
      toast.error(JD_DISABLED_ACTION_MESSAGE);
      return;
    }
    if (isJdArchived(status)) {
      toast.error(JD_ARCHIVED_ACTION_MESSAGE);
      return;
    }
    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${jdId}`);
  };

  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet min-h-[calc(100dvh-7rem)]">
          <PageBreadcrumb
            barRef={breadcrumbBarRef}
            className="mb-3"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: 'Select Job Description' },
            ]}
          />
          <AIInterviewStepIndicator currentStep={1} topOffset={breadcrumbHeight} />

          <div className="w-full">
            <div className="mb-6 sm:mb-8">
              <h1 className="tf-page-title mb-2">Create New AI Interview</h1>
              <p className="tf-body-secondary sm:text-base">
                Select a Job Description to create an AI-powered interview
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-slate-800/40 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm text-brand-blue font-medium mb-1">AI-Powered Interview</div>
                <div className="tf-body">
                  The AI interviewer builds its rounds from the JD&apos;s must-have and nice-to-have skills, then runs a <strong>timed or conversational interview</strong> with each candidate and scores every round.
                </div>
              </div>
            </div>

            <div className="tf-card-soft">
              <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="min-w-0">
                    <h2 className="tf-section-title sm:text-lg tracking-tight">Select Job Description</h2>
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      if (!canCreateJD) return;
                      router.push('/recruitment/jd-creation?from=ai-interview');
                    }}
                    aria-disabled={!canCreateJD}
                    title={!canCreateJD ? 'You do not have permission to create job descriptions' : ''}
                    icon={<Plus className="w-4 h-4" />}
                    className={`flex-shrink-0 ${!canCreateJD ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="hidden sm:inline">Create New Job</span>
                    <span className="sm:hidden">New Job</span>
                  </Button>
                </div>
                <JobEligibilityNote
                  className="mt-3"
                  description="Published (or Republished) job versions without an AI interview can be selected. Disabled and Archived jobs are shown read-only; Draft and already-configured jobs are hidden. A job with only one available version is selected straight from its card; View Versions appears when there are versions to choose from, and the eye icon shows a job's full history."
                />
              </div>

              <div className="p-4 sm:p-6">
                {loadingJds || (!eligibilityLoaded && loadError !== 'eligibility') ? (
                  <div className="space-y-3">
                    <div className="mb-4 space-y-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                    <div className="mb-3 flex items-center justify-between">
                      <Skeleton className="h-4 w-40" />
                    </div>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="rounded-lg border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:p-4">
                        <div className="flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-4">
                          <Skeleton className="w-4 h-4 rounded-full mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0 space-y-2">
                            <Skeleton className="h-4 w-56 max-w-full" />
                            <Skeleton className="h-3 w-72 max-w-full" />
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <Skeleton className="h-7 w-7 rounded-md" />
                            <Skeleton className="h-7 w-7 rounded-md" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3" ref={jdListRef}>
                    <div className="mb-4">
                      <label className="block tf-label mb-2">Search Jobs</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search by JD number, role, department or location..."
                          value={jdSearch}
                          onChange={e => { setJdSearch(e.target.value); setJdPage(1); }}
                          className="tf-input pl-10 pr-4"
                        />
                      </div>
                    </div>

                    {/* A failed read, with a way to retry — without it a network
                        error read as "no published jobs". */}
                    {loadError && (
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <span>
                          {loadError === 'jobs'
                            ? `Could not load job openings.${jds.length > 0 ? ' Showing the jobs already loaded.' : ''}`
                            : 'Could not check which job versions already have an AI interview. Add is turned off until this loads.'}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setLoadingJds(true); setReloadToken(t => t + 1); }}
                          className="inline-flex items-center gap-1 font-medium text-amber-900 hover:underline"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </button>
                      </div>
                    )}

                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="tf-label">
                        Select a Job Opening
                        {lineageJobs.length > 0 && (
                          <span className="ml-2 font-normal text-gray-500 whitespace-nowrap">
                            &mdash; {lineageJobs.filter(job => !isJobDisabled(job) && !isJobArchived(job)).length} available
                          </span>
                        )}
                      </span>
                      {jdPick && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="tf-badge text-brand-blue bg-brand-blue/10">
                            1 selected
                          </span>
                          <button
                            type="button"
                            onClick={() => setJdPick(null)}
                            className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium whitespace-nowrap"
                          >
                            Clear Selection
                          </button>
                        </div>
                      )}
                    </div>

                    {jdPick && !jdPickOnThisPage && (
                      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 tf-meta">
                        <CheckCircle2 className="w-4 h-4 text-brand-blue flex-shrink-0" />
                        <span>
                          Selected: <span className="font-medium">
                            {jdPick.job.job_id ? `${jdPick.job.job_id} · ` : ''}{jdPick.job.title}
                            {' '}(v{jdPick.job.versionNumber ?? 1})
                          </span>
                          {' '}(on another page)
                        </span>
                      </div>
                    )}

                    {pagedJobs.map(job => {
                      const versionKey = lineageKey(job);
                      const versionsExpanded = jdLineage.isExpanded(versionKey);
                      const isPicked = jdPick?.job.id === job.id;
                      const lineageSelected = jdPick?.lineage === versionKey;
                      const pickedVersionOfThisJob = lineageSelected && !isPicked ? jdPick!.job : null;
                      const blockedByOtherPick = !!jdPick && !lineageSelected;
                      const otherPickReason = blockedByOtherPick
                        ? `v${jdPick!.job.versionNumber ?? 1} of "${jdPick!.job.title}" is selected — clear it to choose a version here`
                        : undefined;
                      const latestHasInterview = versionHasInterview(job.id);
                      const jobDisabled = isJobDisabled(job);
                      const jobArchived = isJobArchived(job);
                      const latestSelectableStatus = isSelectableVersion(job);
                      const latestSelectable = !latestHasInterview && !blockedByOtherPick && latestSelectableStatus && !jobDisabled && !jobArchived;
                      const latestUnpublishedReason = `v${job.versionNumber ?? 1} is ${String(job.status || 'not published').toLowerCase()} — open View Versions to build against a published version`;
                      /* Only when another version could be picked — a job whose
                         card version is its one available version is picked
                         straight from the card. */
                      const showVersionPicker = needsVersionPicker(job, allVersions, version => versionHasInterview(version.id));
                      /* The card's + builds against this job's picked version
                         when one is ticked, otherwise the latest. */
                      const cardTarget = lineageSelected ? jdPick!.job : job;
                      const cardAddEnabled = canCreateAIInterviews && addReady && !blockedByOtherPick
                        && isSelectableVersion(cardTarget) && !versionHasInterview(cardTarget.id) && !isJobDisabled(cardTarget) && !isJobArchived(cardTarget);
                      const cardAddLabel = !canCreateAIInterviews
                        ? 'You do not have permission to create AI interviews'
                        : isJobDisabled(cardTarget)
                          ? JD_DISABLED_ACTION_MESSAGE
                        : isJobArchived(cardTarget)
                          ? JD_ARCHIVED_ACTION_MESSAGE
                        : blockedByOtherPick
                          ? otherPickReason!
                          : versionHasInterview(cardTarget.id)
                            ? `v${cardTarget.versionNumber ?? 1} already has an AI interview`
                            : !isSelectableVersion(cardTarget)
                              ? 'Only published versions can have an AI interview'
                              : `Create AI interview for v${cardTarget.versionNumber ?? 1}`;

                      return (
                        <div
                          key={job.id}
                          title={
                            blockedByOtherPick
                              ? otherPickReason
                              : jobDisabled
                                ? `${JD_DISABLED_ACTION_MESSAGE} View Versions still shows this job's version history.`
                              : jobArchived
                                ? `${JD_ARCHIVED_ACTION_MESSAGE} View Versions still shows this job's version history.`
                              : !latestSelectableStatus
                                ? `${latestUnpublishedReason}. View Versions opens this job's full version history.`
                                : showVersionPicker
                                  ? 'View Versions opens this job’s version history — every version of this job, and the one to build the AI interview against.'
                                  : `v${job.versionNumber ?? 1} is this job’s only available version — select it to build the AI interview against it.`
                          }
                          aria-disabled={blockedByOtherPick || jobArchived}
                          className={`rounded-lg border-2 p-3 sm:p-4 transition-all ${
                            blockedByOtherPick || jobArchived
                              ? 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-60'
                              : lineageSelected
                                ? 'bg-brand-blue/5 border-brand-blue/40 shadow-sm shadow-brand-blue/10'
                                : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                          }`}
                        >
                          <div className="flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-4">
                            <label
                              className={`flex items-center h-5 sm:h-auto sm:pt-1 ${latestSelectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                              title={
                                blockedByOtherPick
                                  ? otherPickReason
                                  : jobDisabled
                                    ? JD_DISABLED_ACTION_MESSAGE
                                  : jobArchived
                                    ? JD_ARCHIVED_ACTION_MESSAGE
                                  : latestHasInterview
                                    ? `v${job.versionNumber ?? 1} already has an AI interview — open View Versions to build against another version`
                                    : !latestSelectableStatus
                                      ? latestUnpublishedReason
                                      : `Select the latest version (v${job.versionNumber ?? 1})`
                              }
                            >
                              <input
                                type="radio"
                                name={JD_RADIO_GROUP}
                                checked={isPicked}
                                disabled={!latestSelectable}
                                onChange={() => latestSelectable && pickJdVersion(job, versionKey)}
                                onClick={() => isPicked && pickJdVersion(job, versionKey)}
                                className="tf-radio focus:ring-brand-blue/40"
                              />
                              <span className="sr-only">Select the latest version of {job.title}</span>
                            </label>

                            <div className="flex-1 min-w-0">
                              <div
                                onClick={() => latestSelectable && pickJdVersion(job, versionKey)}
                                className={latestSelectable ? 'cursor-pointer' : 'cursor-default'}
                              >
                                <JobOpeningSummary
                                  job={candidateCounts
                                    ? { ...job, assessed: candidateCounts[job.id]?.assessed ?? 0, interviewed: candidateCounts[job.id]?.interviewed ?? 0 }
                                    : job}
                                  metaSingleLine
                                  /* Coloured like the Job Openings badges; applicants read "scored". */
                                  coloredCountBadges
                                  applicantsLabel="scored"
                                  trailingBadges={lineageSelected ? (
                                    <CheckCircle2 className="w-5 h-5 text-brand-blue flex-shrink-0" />
                                  ) : jobDisabled ? (
                                    <span
                                      className="tf-badge bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"
                                      title={JD_DISABLED_ACTION_MESSAGE}
                                    >
                                      Disabled
                                    </span>
                                  ) : jobArchived ? (
                                    <span
                                      className="tf-badge bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"
                                      title={JD_ARCHIVED_ACTION_MESSAGE}
                                    >
                                      Archived
                                    </span>
                                  ) : null}
                                />
                              </div>
                              {pickedVersionOfThisJob && (
                                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2 py-1 text-xs font-medium text-brand-blue max-w-full">
                                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                                  v{pickedVersionOfThisJob.versionNumber ?? 1} selected, chosen from Version History
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto sm:flex-shrink-0">
                              <button
                                type="button"
                                /* Permission lock: aria-disabled (not native) so the
                                   tooltip still shows on hover. */
                                disabled={!cardAddEnabled && canCreateAIInterviews}
                                aria-disabled={!cardAddEnabled}
                                onClick={() => cardAddEnabled && handleCreateForVersion(cardTarget.id)}
                                className={`h-7 w-7 flex items-center justify-center rounded-md ring-1 transition-all flex-shrink-0 ${
                                  cardAddEnabled
                                    ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-white/10'
                                    : ADD_BUTTON_DISABLED
                                }`}
                                aria-label={cardAddLabel}
                                title={cardAddLabel}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVersionHistoryVersion(null);
                                  setVersionHistoryFor({ id: job.id, title: job.title });
                                }}
                                className="h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                                aria-label="View version history"
                                title="View version history"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* View Versions — bottom-right, only when this job has
                              another version to pick (needsVersionPicker). */}
                          {showVersionPicker && (
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  jdLineage.toggle(versionKey, job.id);
                                }}
                                aria-expanded={versionsExpanded}
                                className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-colors duration-200 ${
                                  versionsExpanded
                                    ? 'bg-brand-sky text-brand-blue border-brand-blue/30 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10'
                                    : 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
                                }`}
                                title={versionsExpanded ? 'Hide version history' : 'View version history — every version of this job, and the one to build the AI interview against'}
                              >
                                {versionsExpanded ? 'Hide Versions' : 'View Versions'}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionsExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          )}

                          {showVersionPicker && versionsExpanded && (
                            <JobVersionHistoryPanel
                              job={job}
                              versions={jdLineage.lineages[versionKey]}
                              loading={jdLineage.isLoading(versionKey)}
                              versionDetails={jdLineage.versionDetails}
                              versionApplicants={jdLineage.versionApplicants}
                              applicantsLabel="Scored"
                              openInNewTab
                              staticRows
                              plainTitle
                              onSelectVersion={(versionJob) => pickJdVersion(versionJob, versionKey)}
                              selectedVersionId={jdPick?.job.id ?? null}
                              keepLatestWhenSelectable
                              radioGroupName={`${JD_RADIO_GROUP}-${versionKey}`}
                              selectHint={(versionJob) => `Select v${versionJob.versionNumber ?? 1}`}
                              versionSelectionState={(versionJob) => {
                                if (isJobDisabled(versionJob)) return JD_DISABLED_ACTION_MESSAGE;
                                if (isJobArchived(versionJob)) return JD_ARCHIVED_ACTION_MESSAGE;
                                if (versionHasInterview(versionJob.id)) {
                                  return `v${versionJob.versionNumber ?? 1} already has an AI interview`;
                                }
                                if (!isSelectableVersion(versionJob)) {
                                  return `v${versionJob.versionNumber ?? 1} is ${String(versionJob.status || 'not published').toLowerCase()} — an AI interview can only be created against a published or republished version`;
                                }
                                return null;
                              }}
                              selectionDisabled={blockedByOtherPick}
                              selectionDisabledReason={otherPickReason}
                              extraColumns={[
                                {
                                  label: 'AI Interview',
                                  minW: 'min-w-[120px]',
                                  render: (versionJob) => (
                                    <InterviewCreatedLabel created={versionHasInterview(versionJob.id)} />
                                  ),
                                },
                              ]}
                              renderAction={(versionJob) => {
                                const enabled = canCreateAIInterviews
                                  && addReady
                                  && isSelectableVersion(versionJob)
                                  && !isJobDisabled(versionJob)
                                  && !isJobArchived(versionJob)
                                  && !versionHasInterview(versionJob.id);
                                const label = !canCreateAIInterviews
                                  ? 'You do not have permission to create AI interviews'
                                  : isJobDisabled(versionJob)
                                    ? JD_DISABLED_ACTION_MESSAGE
                                  : isJobArchived(versionJob)
                                    ? JD_ARCHIVED_ACTION_MESSAGE
                                  : versionHasInterview(versionJob.id)
                                    ? `v${versionJob.versionNumber ?? 1} already has an AI interview`
                                    : !isSelectableVersion(versionJob)
                                      ? `Only published versions can have an AI interview`
                                      : `Create AI interview for v${versionJob.versionNumber ?? 1}`;
                                return (
                                  <>
                                    <button
                                      type="button"
                                      disabled={!enabled}
                                      onClick={() => enabled && handleCreateForVersion(versionJob.id)}
                                      className={`h-7 w-7 flex items-center justify-center rounded-md ring-1 transition-all ${
                                        enabled
                                          ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-white/10'
                                          : ADD_BUTTON_DISABLED
                                      }`}
                                      aria-label={label}
                                      title={label}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setVersionHistoryVersion(versionJob.versionNumber ?? 1);
                                        setVersionHistoryFor({ id: versionJob.id, title: versionJob.title });
                                      }}
                                      className="h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                                      aria-label={`View v${versionJob.versionNumber ?? 1} details`}
                                      title={`View v${versionJob.versionNumber ?? 1} details`}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                );
                              }}
                            />
                          )}
                        </div>
                      );
                    })}

                    {lineageJobs.length === 0 && !(loadError === 'jobs' && jds.length === 0) && (
                      <div className="text-center py-8 sm:py-12 text-gray-500">
                        <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm sm:text-base">
                          {availableJobs.length > 0
                            ? 'No matching job descriptions found'
                            : allConfigured
                              ? 'No jobs available for a new AI interview'
                              : 'No published jobs available'}
                        </p>
                        <p className="text-sm mt-1">
                          {availableJobs.length > 0
                            ? 'Try searching with a JD ID like JD-450 or a title like senior python developer'
                            : allConfigured
                              ? 'Every published job already has an AI interview. Publish a new job to create another one.'
                              : 'Create and publish a Job first to create AI interviews'}
                        </p>
                        {availableJobs.length === 0 && (
                          <Button
                            variant="primary"
                            size="md"
                            onClick={() => {
                              if (!canCreateJD) return;
                              router.push('/recruitment/jd-creation?from=ai-interview');
                            }}
                            aria-disabled={!canCreateJD}
                            title={!canCreateJD ? 'You do not have permission to create job descriptions' : ''}
                            icon={<Plus className="w-4 h-4" />}
                            className={`mx-auto ${!canCreateJD ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            Create New Job
                          </Button>
                        )}
                      </div>
                    )}

                    {lineageJobs.length > 0 && (
                      <ListPagination
                        currentPage={jdSafePage}
                        itemsPerPage={jdItemsPerPage}
                        totalItems={lineageJobs.length}
                        onPageChange={setJdPage}
                        onItemsPerPageChange={(size) => { setJdItemsPerPage(size); setJdPage(1); }}
                        itemLabel="published jobs"
                        scrollContainerRef={jdListRef}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {versionHistoryFor && (
        <JDVersionHistoryModal
          isOpen
          onClose={() => { setVersionHistoryFor(null); setVersionHistoryVersion(null); }}
          jdId={versionHistoryFor.id}
          jdTitle={versionHistoryFor.title}
          initialVersionNumber={versionHistoryVersion ?? undefined}
        />
      )}
    </main>
  );
}
