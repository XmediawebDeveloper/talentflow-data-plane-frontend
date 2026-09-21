'use client';

import { Briefcase, Plus, Search, Sparkles, Eye, ChevronDown, CheckCircle2, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { PublishedJD } from '@/lib/services/aiInterviewService';
import { toast } from 'sonner';
import { AIInterviewStepIndicator } from './AIInterviewStepIndicator';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import ListPagination from '@/components/ListPagination';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { lineageKey, isSelectableVersion } from '@/lib/utils/jobOpeningDisplay';
import type { Job } from '@/lib/types/types';
import { publishedJdToJob as toJob } from '@/lib/utils/publishedJdToJob';
import { ListSkeleton } from '@/components/ui/skeleton-loader';

const normalizeSearchValue = (value?: string | null) => (value || '').toLowerCase().trim();
const normalizeIdentifier = (value?: string | null) => normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
const normalizeTitleSearch = (value?: string | null) =>
  normalizeSearchValue(value).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Newest version of a lineage first — publish count, then creation date as
 *  the tie-break for rows the endpoint sends without one. */
const latestVersionFirst = (a: PublishedJD, b: PublishedJD): number => {
  const versionDelta = (b.current_version ?? 1) - (a.current_version ?? 1);
  if (versionDelta !== 0) return versionDelta;
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  return bTime - aTime;
};

const JD_RADIO_GROUP = 'ai-interview-jd-version-selection';
const ADD_BUTTON_DISABLED = 'bg-slate-200 text-slate-400 ring-slate-300/60 shadow-none cursor-not-allowed';

/** Created / Not Created — the Assessments picker's per-version label. */
function InterviewCreatedLabel({ created }: { created: boolean }) {
  return (
    <span
      className={`px-2 sm:px-2.5 py-1 rounded text-xs inline-flex items-center gap-1 whitespace-nowrap ring-1 ${
        created
          ? 'bg-green-100 text-green-700 ring-green-200'
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
  const jdListRef = useRef<HTMLDivElement | null>(null);

  const loadJDs = useCallback(async () => {
    try {
      setLoadingJds(true);
      const result = await aiInterviewService.getPublishedJDs();
      setJds(result.items);
    } catch (error) {
      console.error('Failed to load JDs:', error);
      toast.error('Failed to load job descriptions');
    } finally {
      setLoadingJds(false);
    }
  }, []);

  useEffect(() => {
    loadJDs();
  }, [loadJDs]);

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
      } catch {
        /* the list still works; versions just read as Not Created */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const versionHasInterview = (versionId: string) => jdsWithInterview.has(versionId);

  // Only surface JDs that DON'T already have a published AI interview config —
  // a JD can't be configured twice, so configured ones are hidden entirely
  // (previously they showed disabled with an "AI Config Created" badge).
  const selectableJds = jds.filter(jd => jd.has_published_config !== true);
  const searchQuery = normalizeSearchValue(jdSearch);
  const titleSearchQuery = normalizeTitleSearch(jdSearch);
  const searchTerms = titleSearchQuery.split(/\s+/).filter(Boolean);
  const normalizedSearchIdentifier = normalizeIdentifier(jdSearch);
  const filteredJds = selectableJds.filter(jd => {
    if (!searchQuery) return true;

    const normalizedTitle = normalizeTitleSearch(jd.title);
    const matchesTitle = searchTerms.length > 0 && searchTerms.every(term => normalizedTitle.includes(term));
    const matchesIdentifier = normalizedSearchIdentifier
      ? normalizeIdentifier(jd.job_id).includes(normalizedSearchIdentifier)
      : false;

    return matchesTitle || matchesIdentifier;
  });
  // True when JDs exist but every one is already configured — lets the empty
  // state say something accurate instead of "create a JD first".
  const allConfigured = jds.length > 0 && selectableJds.length === 0;

  /* ONE CARD PER JOB, not per version.
     `/ai-interview/jds-for-interview` can return several versions of the same
     lineage, and every one of them carries the same `job_id` — which IS the
     lineage key the selection is held against. Rendered raw, ticking one
     card's radio lit every sibling card as selected (each matched
     `jdPick.lineage`) and pushed the rest of the list into its
     blocked-by-another-pick state. Collapsing restores this picker's contract,
     the same one the Assessments picker keeps: a card is a JOB, and its other
     versions are reached through View Versions. */
  const lineageBuckets = new Map<string, PublishedJD[]>();
  for (const jd of filteredJds) {
    const key = lineageKey(toJob(jd));
    const bucket = lineageBuckets.get(key);
    if (bucket) bucket.push(jd);
    else lineageBuckets.set(key, [jd]);
  }
  /* The row stands on the newest version that can still take an interview, so
     a job whose latest version is already configured still offers the one
     below it instead of dropping off the list. */
  const lineageJds = Array.from(lineageBuckets.values(), bucket => {
    const newestFirst = [...bucket].sort(latestVersionFirst);
    return newestFirst.find(jd => !versionHasInterview(jd.id)) ?? newestFirst[0];
  });

  const jdTotalPages = Math.max(1, Math.ceil(lineageJds.length / jdItemsPerPage));
  const jdSafePage = Math.min(jdPage, jdTotalPages);
  const pagedJds = lineageJds.slice((jdSafePage - 1) * jdItemsPerPage, jdSafePage * jdItemsPerPage);

  const jdPickOnThisPage = !!jdPick && pagedJds.some(jd => lineageKey(toJob(jd)) === jdPick.lineage);

  const handleCreateForVersion = (jdId: string) => {
    router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${jdId}`);
  };

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-3"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              { label: 'Select Job Description' },
            ]}
          />
          <AIInterviewStepIndicator currentStep={1} />

          <div className="w-full">
            <div className="mb-6 sm:mb-8">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 dark:text-slate-50 mb-2 tracking-tight">Create New AI Interview</h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-slate-400">
                Select a Job Description to create an AI-powered interview
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-slate-800/40 border border-brand-blue/15 ring-1 ring-brand-blue/10 shadow-sm shadow-brand-blue/10 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs sm:text-sm text-brand-blue font-medium mb-1">AI-Powered Interview</div>
                <div className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
                  The AI interviewer builds its rounds from the JD&apos;s must-have and nice-to-have skills, then runs a <strong>timed or conversational interview</strong> with each candidate and scores every round.
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
              <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-slate-700/60">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Select Job Description</h2>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mt-1">
                      Choose the JD that this AI interview will be based on
                    </p>
                  </div>
                  {canCreateJD && (
                    <button
                      onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                      className="px-3 sm:px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-all flex items-center gap-2 text-sm flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">Create New Job</span>
                      <span className="sm:hidden">New Job</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {loadingJds ? (
                  <ListSkeleton rows={5} />
                ) : (
                  <div className="space-y-3" ref={jdListRef}>
                    <div className="mb-4">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search Jobs</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search by JD number or title..."
                          value={jdSearch}
                          onChange={e => { setJdSearch(e.target.value); setJdPage(1); }}
                          className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                        />
                      </div>
                    </div>

                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                        Select a Job Opening
                        {lineageJds.length > 0 && (
                          <span className="ml-2 font-normal text-gray-500">
                            &mdash; {lineageJds.length} available
                          </span>
                        )}
                      </span>
                      {jdPick && (
                        <button
                          type="button"
                          onClick={() => setJdPick(null)}
                          className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>

                    {jdPick && !jdPickOnThisPage && (
                      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-gray-700">
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

                    {pagedJds.map(jd => {
                      const job = toJob(jd);
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
                      const latestSelectable = !latestHasInterview && !blockedByOtherPick;
                      /* The card's + builds against this job's picked version
                         when one is ticked, otherwise the latest. */
                      const cardTarget = lineageSelected ? jdPick!.job : job;
                      const cardAddEnabled = canCreateAIInterviews && !blockedByOtherPick && !versionHasInterview(cardTarget.id);
                      const cardAddLabel = !canCreateAIInterviews
                        ? 'You do not have permission to create AI interviews'
                        : blockedByOtherPick
                          ? otherPickReason!
                          : versionHasInterview(cardTarget.id)
                            ? `v${cardTarget.versionNumber ?? 1} already has an AI interview`
                            : `Create AI interview for v${cardTarget.versionNumber ?? 1}`;

                      return (
                        <div
                          key={jd.id}
                          title={blockedByOtherPick ? otherPickReason : undefined}
                          aria-disabled={blockedByOtherPick}
                          className={`rounded-lg border-2 p-3 sm:p-4 transition-all ${
                            blockedByOtherPick
                              ? 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-60'
                              : lineageSelected
                                ? 'bg-brand-blue/5 border-brand-blue/40 shadow-sm shadow-brand-blue/10'
                                : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                          }`}
                        >
                          <div className="flex items-start gap-2 sm:gap-4">
                            <label
                              className={`flex items-center pt-1 ${latestSelectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                              title={
                                blockedByOtherPick
                                  ? otherPickReason
                                  : latestHasInterview
                                    ? `v${job.versionNumber ?? 1} already has an AI interview — open View Versions to build against another version`
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
                                className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40 flex-shrink-0 disabled:cursor-not-allowed"
                              />
                              <span className="sr-only">Select the latest version of {job.title}</span>
                            </label>

                            <div className="flex-1 min-w-0">
                              <div
                                onClick={() => latestSelectable && pickJdVersion(job, versionKey)}
                                className={latestSelectable ? 'cursor-pointer' : 'cursor-default'}
                              >
                                <JobOpeningSummary job={job} metaSingleLine />
                              </div>
                              {pickedVersionOfThisJob && (
                                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2 py-1 text-xs font-medium text-brand-blue">
                                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                                  v{pickedVersionOfThisJob.versionNumber ?? 1} selected, chosen from Version History
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                              <InterviewCreatedLabel created={latestHasInterview} />
                              <button
                                type="button"
                                disabled={!cardAddEnabled}
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
                                  setVersionHistoryFor({ id: jd.id, title: jd.title });
                                }}
                                className="h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                                aria-label="View version history"
                                title="View version history"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* View Versions — always offered, bottom-right, as on
                              the Assessments picker. */}
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

                          {versionsExpanded && (
                            <JobVersionHistoryPanel
                              job={job}
                              versions={jdLineage.lineages[versionKey]}
                              loading={jdLineage.isLoading(versionKey)}
                              versionDetails={jdLineage.versionDetails}
                              versionApplicants={jdLineage.versionApplicants}
                              openInNewTab
                              staticRows
                              plainTitle
                              onSelectVersion={(versionJob) => pickJdVersion(versionJob, versionKey)}
                              selectedVersionId={jdPick?.job.id ?? null}
                              keepLatestWhenSelectable
                              radioGroupName={`${JD_RADIO_GROUP}-${versionKey}`}
                              selectHint={(versionJob) => `Select v${versionJob.versionNumber ?? 1}`}
                              versionSelectionState={(versionJob) => {
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
                                  && isSelectableVersion(versionJob)
                                  && !versionHasInterview(versionJob.id);
                                const label = !canCreateAIInterviews
                                  ? 'You do not have permission to create AI interviews'
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

                    {lineageJds.length === 0 && (
                      <div className="text-center py-8 sm:py-12 text-gray-500">
                        <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm sm:text-base">
                          {selectableJds.length > 0
                            ? 'No matching job descriptions found'
                            : allConfigured
                              ? 'No jobs available for a new AI interview'
                              : 'No published jobs available'}
                        </p>
                        <p className="text-xs sm:text-sm mt-1">
                          {selectableJds.length > 0
                            ? 'Try searching with a JD ID like JD-450 or a title like senior python developer'
                            : allConfigured
                              ? 'Every published job already has an AI interview. Publish a new job to create another one.'
                              : 'Create and publish a Job first to create AI interviews'}
                        </p>
                        {canCreateJD && selectableJds.length === 0 && (
                          <button
                            onClick={() => router.push('/recruitment/jd-creation?from=ai-interview')}
                            className="mt-4 px-3 sm:px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 rounded-lg transition-all flex items-center gap-2 mx-auto text-sm"
                          >
                            <Plus className="w-4 h-4" />
                            Create New Job
                          </button>
                        )}
                      </div>
                    )}

                    {lineageJds.length > 0 && (
                      <ListPagination
                        currentPage={jdSafePage}
                        itemsPerPage={jdItemsPerPage}
                        totalItems={lineageJds.length}
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
