'use client';

import { X, Search, CheckCircle, Briefcase, Loader2, Eye, ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Resume, Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import {
  getPublishedJobs,
  groupByLineage,
  jobSearchMatcher,
  lineageKey,
  mapJDToJob,
  sortJobs,
} from '@/lib/utils/jobOpeningDisplay';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import ListPagination from './ListPagination';
import SelectedCandidatesPanel from './SelectedCandidatesPanel';

/** Same page size the Job Openings page reads the JD list in. */
const JD_BATCH_SIZE = 100;
/** Same rows-per-page the Job Openings list starts on. */
const DEFAULT_ITEMS_PER_PAGE = 10;
/**
 * One radio group across the whole dialog — the job cards AND every Version
 * History row inside them. Exactly one JD version can be picked, and the
 * browser enforces it alongside the state.
 */
const JOB_RADIO_GROUP = 'apply-to-job-selection';

interface ApplyToJobModalProps {
  resumes: Resume[];
  /**
   * Jobs the host already had. Shown immediately so the list isn't empty on
   * open, then replaced by this dialog's own fetch — the same request, mapping
   * and ordering the Job Openings page uses, so the list here matches that page
   * field for field rather than whatever subset a host happened to map.
   */
  jobs?: Job[];
  onClose: () => void;
  /**
   * The picked candidates and job. The third argument hands back the selected
   * Job records themselves: this dialog now reads the job list from the API
   * rather than from the host, so a host that needs the object (a title for a
   * toast, a job to hand to a progress panel) can no longer be sure to find it
   * in whatever list it passed in.
   */
  onApply: (resumeIds: string[], jobIds: string[], selectedJobRecords?: Job[]) => void;
  mode?: 'apply' | 'assessment' | 'scoring' | 'match';
  title?: string; // New: Custom title
  description?: string; // New: Custom description
  stayOnCurrentPage?: boolean;
  /** Overrides the confirm button's label — "Run AI Talent Match" and friends. */
  confirmLabel?: string;
  /**
   * Run the dialog as a JOB PICKER: the Candidates Selected panel is dropped
   * and the confirm needs only a job.
   *
   * For flows that choose the JOB FIRST and the candidates after it — Resume
   * Scoring picks the job, then opens its own resume selection. Everything
   * else is untouched: the same shell, header, search, job cards, version
   * history, pagination and footer, so the picker reads as the dialog it is.
   * `onApply` is then called with an empty resume list.
   */
  jobOnly?: boolean;
  /** Replaces the Next Steps list when a flow ends somewhere different. */
  nextSteps?: string[];
}

export default function ApplyToJobModal({
  resumes,
  jobs,
  onClose,
  onApply,
  mode = 'apply',
  title,
  description,
  stayOnCurrentPage = false,
  confirmLabel,
  nextSteps,
  jobOnly = false,
}: ApplyToJobModalProps) {
  // Default titles based on mode
  const defaultTitle =
    mode === 'assessment' ? 'Create Assessment'
    : mode === 'scoring' ? 'Resume Scoring'
    : mode === 'match' ? 'AI Talent Match'
    : 'Apply to Job';
  const defaultDescription =
    mode === 'assessment' ? 'Select a job description for the assessment'
    : mode === 'scoring' ? 'Select job description to score resumes'
    : mode === 'match' ? 'Select a job description to find the best-matched candidates'
    : 'Select a job to apply candidates';

  const modalTitle = title || defaultTitle;
  const modalDescription = description || defaultDescription;
  const isScoringMode = mode === 'scoring';
  const isMatchMode = mode === 'match';
  const [searchQuery, setSearchQuery] = useState('');
  /* The one JD version the candidates go to.
     Held as the record itself rather than an id, because the pick can now be an
     older version chosen from a job's Version History, and those versions are
     not in the list below — the history fetches them from its own endpoint.
     `lineage` records which job's card the pick belongs to, so that card reads
     as selected whichever of its versions was picked. */
  const [selection, setSelection] = useState<{ job: Job; lineage: string } | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  /* The job list, read the way the Job Openings page reads it: `source:
     'my-jds'`, in pages of 100, mapped through the shared mapper. Every host
     used to hand in its own partially-mapped list, which is why the publish
     count, the lineage version and the experience line were missing here. The
     host's list still seeds the state so the dialog opens with content.

     EVERY VERSION, unfiltered — deliberately. Asking the endpoint for
     `status: 'published'` instead looks like the cheaper way to get a published
     list, and it is wrong: it strips a lineage's draft v3 before the versions
     can be collapsed, so the published v2 stands in as the latest and the job
     counts as published here while the Job Openings page — which sees the v3 —
     calls it a draft. That was the 226-vs-223 gap. The published test belongs
     AFTER the collapse, in `getPublishedJobs`, on the full list. */
  const [fetchedJobs, setFetchedJobs] = useState<Job[] | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingJobs(true);
      setJobsError(null);
      try {
        const firstPage = await jdService.list({ page: 1, page_size: JD_BATCH_SIZE, source: 'my-jds' });
        const items = [...firstPage.items];
        const totalPages = Math.max(
          firstPage.total_pages || Math.ceil(firstPage.total / JD_BATCH_SIZE),
          1,
        );
        for (let page = 2; page <= totalPages; page += 1) {
          const nextPage = await jdService.list({ page, page_size: JD_BATCH_SIZE, source: 'my-jds' });
          items.push(...nextPage.items);
        }
        if (cancelled) return;
        setFetchedJobs(items.map(mapJDToJob));
      } catch (error) {
        if (cancelled) return;
        console.error('[ApplyToJobModal] Failed to load job openings:', error);
        // Keep whatever the host handed in rather than emptying the list — the
        // recruiter can still pick from it while the retry is offered.
        setJobsError('Could not load job openings.');
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [reloadToken]);

  /* Version history — the same hook and endpoints behind the Job Openings
     page's own "View Versions", so the history opened from this dialog is the
     history that page shows. */
  const versionLineage = useJobVersionLineage();

  /* The eye on a job row opens the Job Details page's Version History popup
     over this dialog — literally that component, so the cards, badges,
     Published/Republished labels, compare and per-version JD view are the same
     ones that page shows. It fetches its own lineage, so all this has to hold
     is which job was asked for.

     The "View Versions" table below is untouched: it stays the place where a
     version is PICKED for the candidates. This is the place a version is READ. */
  const [versionHistoryFor, setVersionHistoryFor] = useState<Job | null>(null);

  /* Candidate list state. Everything handed in starts ticked — the user
     already chose these on the previous screen — and unticking here is how you
     drop one without going back. */
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const isIncluded = (id: string) => !excludedIds.includes(id);
  const includedResumes = resumes.filter(r => isIncluded(r.id));

  const toggleCandidate = (id: string) => {
    setExcludedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  /* Version chosen per candidate, keyed by the candidate's own resume id.
     Nothing here means "the latest", which is the default the tip promises.
     A version is itself a resume record, so applying a chosen version means
     sending ITS id — the substitution the resume table makes too. */
  const [versionChoice, setVersionChoice] = useState<Record<string, { id: string; number: number; total: number }>>({});

  const submittedIdFor = (resume: Resume) => versionChoice[resume.id]?.id || resume.id;

  /* Every job is listed; the search narrows it — through the shared matcher,
     so this dialog and the assessment JD picker answer a query identically. */
  const jobSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = jobSearchMatcher(searchQuery);

  /* Every version, as fetched — what the lineage grouping needs to know which
     version of a job is the latest one. Also what the "View Versions" test
     below counts, exactly as the Job Openings list counts it. */
  const allVersions = useMemo(() => fetchedJobs ?? jobs ?? [], [fetchedJobs, jobs]);
  const versionGroups = useMemo(() => groupByLineage(allVersions), [allVersions]);

  /* The selectable jobs, and the number reported above them: one row per
     lineage, the latest version representing it, kept only where that latest
     version is Published. `getPublishedJobs` is the same call behind the Job
     Openings page's Published stat card, over the same request — so the count
     in this dialog is that card's count, not a second opinion.

     Applied BEFORE the search, so a query can never promote an older version to
     stand in for its lineage. */
  const publishedJobs = useMemo(() => getPublishedJobs(allVersions), [allVersions]);

  const filteredJobs = useMemo(
    () => publishedJobs.filter(matchesSearch),
    // matchesSearch closes over the query, which is the only thing that changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishedJobs, jobSearch],
  );

  /* Newest first — the Job Openings list's own default sort. Every row is a
     published job, so there is no eligible-first partition to make. */
  const sortedJobs = useMemo(() => sortJobs(filteredJobs, 'date', 'desc'), [filteredJobs]);

  /* Pagination — same shape and page size as the Job Openings list. The page
     is stored WITH the search it belongs to, so a new query starts back at page
     one by comparison rather than by an effect that resets it a render later
     (which would flash one page of the wrong rows). */
  const [pageState, setPageState] = useState({ query: '', page: 1 });
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  const currentPage = pageState.query === jobSearch ? pageState.page : 1;
  const setCurrentPage = (page: number) => setPageState({ query: jobSearch, page });

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / itemsPerPage));
  // A shrinking result set (a new search, a narrower list) can leave the
  // current page past the end; clamp on read so the rows never come back empty
  // while the page number still points somewhere.
  const safePage = Math.min(currentPage, totalPages);
  const currentJobs = sortedJobs.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  /* One role at a time. Candidates are applied to a single job, so picking a
     second would be ambiguous rather than useful — the other rows go inert
     until the current pick is cleared or swapped by clicking it again. The pick
     survives paging and searching, since it is held outside the list. */
  const selectedJobId = selection?.job.id ?? null;
  const selectionOnThisPage = !!selection && currentJobs.some(job => lineageKey(job) === selection.lineage);

  /* Pick a version — the card's own radio passes the latest, the Version
     History rows pass an older one. Clicking the picked one lets go of it. */
  const pickVersion = (job: Job, lineage: string) => {
    setSelection(prev => (prev?.job.id === job.id ? null : { job, lineage }));
  };

  /* A job picker has no candidates to require — the flow that opened it picks
     them next. Everywhere else both halves are still needed. */
  const canSubmit = !!selection && (jobOnly || includedResumes.length > 0);

  const handleApply = async () => {
    if (canSubmit) {
      setIsApplying(true);
      // Only the candidates still ticked, each on its chosen version (the
      // latest unless one was picked from the version list).
      const resumeIds = includedResumes.map(submittedIdFor);

      /* The picked version's own id is what the candidates are applied to —
         a version IS a JD record with its own id, so an older version chosen
         from the history is submitted as itself, not as its lineage's latest. */
      const picked = selection!.job;

      /* A job picker hands the choice back and closes: there is nothing to
         submit yet, so the confirm must not sit in a pending state pretending
         there is. */
      if (jobOnly) {
        setIsApplying(false);
        onApply([], [picked.id], [picked]);
        return;
      }

      // Simulate API call
      setTimeout(() => {
        onApply(resumeIds, [picked.id], [picked]);
        setIsApplying(false);
      }, 800);
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6">
      {/* Wider than a plain picker: the rows carry the Job Openings list's own
          fields, and the version history table underneath them needs the room. */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
              <Briefcase className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">{modalTitle}</h2>
              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{modalDescription}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 rounded-md transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Candidates Selected — shared with every other flow that acts
              on a set of candidates, so they all read the same. Dropped in
              job-picker mode, where no candidates have been chosen yet and an
              empty panel would only say so. */}
          {!jobOnly && (
            <SelectedCandidatesPanel
              resumes={resumes}
              excludedIds={excludedIds}
              onToggleCandidate={toggleCandidate}
              versionChoice={versionChoice}
              onVersionChosen={(resumeId, choice) =>
                setVersionChoice(prev => ({ ...prev, [resumeId]: choice }))
              }
            />
          )}

          {/* Job Search */}
          <div className="mb-4">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Search Jobs</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search by JD number, role, department or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
              />
            </div>
          </div>

          {/* Job Selection */}
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300">
                Select a Job Opening
                {/* The published-job count — the Job Openings page's own
                    derivation, via getPublishedJobs. No total beside it and
                    nothing hardcoded. It follows the search, so it always
                    describes exactly what is listed. */}
                {sortedJobs.length > 0 && (
                  <span className="ml-2 font-normal text-gray-500 dark:text-slate-400">
                    &mdash; {sortedJobs.length} available
                  </span>
                )}
                {loadingJobs && (
                  <span className="ml-2 inline-flex items-center gap-1 font-normal text-gray-500 dark:text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading jobs...
                  </span>
                )}
              </label>
              {selection && (
                <button
                  onClick={() => setSelection(null)}
                  className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* The pick survives paging and searching, so say what it is when it
                isn't on screen — otherwise a selected-but-elsewhere job reads as
                no selection at all. */}
            {selection && !selectionOnThisPage && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs text-gray-700 dark:text-slate-300">
                <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                <span>
                  Selected: <span className="font-medium">
                    {selection.job.job_id ? `${selection.job.job_id} · ` : ''}{selection.job.title}
                    {' '}(v{selection.job.versionNumber ?? 1})
                  </span>
                  {' '}(on another page)
                </span>
              </div>
            )}

            {jobsError && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                <span>{jobsError} {publishedJobs.length > 0 ? 'Showing the jobs already loaded.' : ''}</span>
                <button
                  onClick={() => setReloadToken(t => t + 1)}
                  className="inline-flex items-center gap-1 font-medium text-amber-900 hover:underline dark:text-amber-100"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}

            {currentJobs.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {currentJobs.map(job => {
                  const versionKey = lineageKey(job);
                  const versionsExpanded = versionLineage.isExpanded(versionKey);
                  /* Two states, not one: `isSelected` is "this card's own
                     latest version is the pick" (the card radio), while
                     `lineageSelected` is "some version of this job is the pick"
                     — which is what makes the card read as chosen when the pick
                     came from its Version History. */
                  const isSelected = selectedJobId === job.id;
                  const lineageSelected = selection?.lineage === versionKey;
                  const selectedVersionOfThisJob = lineageSelected && !isSelected ? selection!.job : null;
                  /* One role at a time: once a job is picked the others go
                     inert, so "apply these candidates to that job" can't turn
                     into two answers. Clicking the picked one lets go of it.
                     This is now the ONLY thing that can block a row — every
                     job in the list is published, so status never does. */
                  const blockedByOtherPick = !!selection && !lineageSelected;
                  const selectable = !blockedByOtherPick;
                  const reason = blockedByOtherPick
                    ? 'Only one job can be applied at a time — clear the current selection to choose this one'
                    : undefined;

                  /* Only jobs with MORE THAN ONE version get the control — the
                     same test the Job Openings list applies, counting DISTINCT
                     version numbers rather than rows (a republished JD arrives
                     as several rows sharing one job_id and one v1). */
                  const distinctVersionCount = new Set(
                    (versionGroups.get(versionKey) ?? [job]).map(sibling => sibling.versionNumber ?? 1),
                  ).size;
                  const hasVersionHistory = (job.versionNumber ?? 1) > 1 || distinctVersionCount > 1;

                  return (
                    <div
                      key={job.id}
                      /* A row the user can't pick — another job is already
                         chosen — stays visible but inert, with the reason in
                         the title attribute. */
                      title={selectable ? undefined : reason}
                      aria-disabled={!selectable}
                      className={`rounded-lg border-2 p-3 sm:p-4 transition-all ${
                        !selectable
                          ? 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-60'
                          : lineageSelected
                            ? 'bg-brand-blue/5 border-brand-blue/40 shadow-sm shadow-brand-blue/10'
                            : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:gap-4">
                        {/* A radio, because exactly one job is applied to.
                            Wrapped in its own label rather than the whole card:
                            the card now carries links and a versions toggle,
                            and a label around those would swallow their
                            clicks. */}
                        <label
                          className={`flex items-center pt-1 ${selectable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                          title={selectable ? `Apply to the latest version (v${job.versionNumber ?? 1})` : undefined}
                        >
                          <input
                            type="radio"
                            name={JOB_RADIO_GROUP}
                            checked={isSelected}
                            disabled={!selectable}
                            onChange={() => selectable && pickVersion(job, versionKey)}
                            onClick={() => isSelected && pickVersion(job, versionKey)}
                            className="w-4 h-4 text-brand-blue border-gray-300 dark:border-slate-700 focus:ring-brand-blue/40 flex-shrink-0 disabled:cursor-not-allowed"
                          />
                          <span className="sr-only">Select {job.title}</span>
                        </label>

                        <div className="flex-1 min-w-0">
                          {/* The job opening exactly as the Job Openings list
                              renders it — same fields in the same places.

                              `metaSingleLine` is the one layout difference:
                              experience / posted / author / last updated /
                              applicants stay on one horizontal row here instead
                              of wrapping onto two.

                              Clicking the headline picks the job, so the whole
                              block is a target without a <label> wrapping the
                              controls beside it. */}
                          <div
                            onClick={() => selectable && pickVersion(job, versionKey)}
                            className={selectable ? 'cursor-pointer' : 'cursor-not-allowed'}
                          >
                            <JobOpeningSummary
                              job={job}
                              metaSingleLine
                              trailingBadges={
                                lineageSelected ? (
                                  <CheckCircle className="w-5 h-5 text-brand-blue ml-auto flex-shrink-0" />
                                ) : null
                              }
                            />
                          </div>

                          {/* The headline above describes the LATEST version, so
                              when the pick is an older one, name it — otherwise
                              a highlighted card would imply the candidates are
                              going to the version on display. */}
                          {selectedVersionOfThisJob && (
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2 py-1 text-xs font-medium text-brand-blue">
                              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              Applying to v{selectedVersionOfThisJob.versionNumber ?? 1}, chosen from Version History
                            </p>
                          )}
                        </div>

                        {/* The eye on the latest version opens the Version
                            History popup — a button, not a link, so nothing
                            navigates and the candidates and the pick survive.
                            Unconditional, unlike the View Versions button below:
                            a single-version job opens here too, and the popup
                            shows that one version. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVersionHistoryFor(job);
                          }}
                          className="h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                          aria-label="View version history"
                          title="View version history"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* View Versions — the card's bottom-right corner, on its
                          own single horizontal row so it clears the details
                          above it whatever they wrap to. */}
                      {hasVersionHistory && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              versionLineage.toggle(versionKey, job.id);
                            }}
                            aria-expanded={versionsExpanded}
                            className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-colors duration-200 ${
                              versionsExpanded
                                ? 'bg-brand-sky text-brand-blue border-brand-blue/30 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 dark:bg-slate-800 dark:text-slate-100 dark:border-brand-blue/50'
                                : 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
                            }`}
                            title={versionsExpanded ? 'Hide version history' : 'View version history'}
                          >
                            {versionsExpanded ? 'Hide Versions' : 'View Versions'}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionsExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      )}

                      {/* Version history, expanded in place — the same panel
                          the Job Openings list opens, minus the action menu
                          (nothing here changes a JD). Titles open in a new tab
                          so the dialog isn't thrown away mid-selection. */}
                      {versionsExpanded && (
                        <JobVersionHistoryPanel
                          job={job}
                          versions={versionLineage.lineages[versionKey]}
                          loading={versionLineage.isLoading(versionKey)}
                          versionDetails={versionLineage.versionDetails}
                          versionApplicants={versionLineage.versionApplicants}
                          openInNewTab
                          /* The rows are things you TICK here, so the title's
                             hover scale comes off — on a selectable row that
                             little movement reads as the control twitching. */
                          staticRows
                          /* No renderAction, so the panel drops its Action
                             column here — nothing in this dialog acts on a
                             version. What it gets instead is a Select radio per
                             row, sharing the job rows' radio group so picking a
                             version releases whatever else was chosen. */
                          onSelectVersion={(versionJob) => pickVersion(versionJob, versionKey)}
                          selectedVersionId={selectedJobId}
                          /* A card that is inert because another job is picked
                             keeps its version radios inert too, or expanding it
                             would offer a back door around the one-at-a-time
                             rule the card itself enforces. */
                          selectionDisabled={!selectable}
                          selectionDisabledReason={reason}
                          radioGroupName={JOB_RADIO_GROUP}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-slate-500">
                {loadingJobs ? (
                  <>
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-brand-blue" />
                    <p className="text-xs sm:text-sm">Loading job openings...</p>
                  </>
                ) : (
                  <>
                    <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-400 dark:text-slate-500" />
                    <p className="text-xs sm:text-sm">
                      {searchQuery ? 'No published jobs found matching your search' : 'No published jobs available'}
                    </p>
                  </>
                )}
              </div>
            )}

          </div>

          {/* Info Box */}
          {selection && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-r from-gray-50 to-gray-50 dark:from-slate-800/50 dark:to-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-start gap-2 sm:gap-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-slate-50 mb-1">Next Steps</h4>
                  <ul className="text-xs text-gray-700 dark:text-slate-300 space-y-1">
                    {nextSteps ? (
                      <>
                        {nextSteps.map(step => <li key={step}>&bull; {step}</li>)}
                      </>
                    ) : isMatchMode ? (
                      <>
                        <li>&bull; {includedResumes.length} candidate{includedResumes.length === 1 ? '' : 's'} will be matched against the selected job</li>
                        <li>&bull; {stayOnCurrentPage ? 'AI Talent Match will run on this page' : "You'll be taken to the AI Talent Match page"}</li>
                        <li>&bull; AI will rank the candidates for that role</li>
                      </>
                    ) : isScoringMode ? (
                      <>
                        <li>&bull; {includedResumes.length} resume{includedResumes.length === 1 ? '' : 's'} will be scored against the selected job</li>
                        <li>&bull; {stayOnCurrentPage ? 'Scoring progress will run on this resume page' : "You'll see the Resume Scoring page"}</li>
                        <li>&bull; AI will analyze the fit for that role</li>
                      </>
                    ) : (
                      <>
                        <li>• {includedResumes.length} candidate{includedResumes.length === 1 ? '' : 's'} will be added to the selected job</li>
                        <li>• You&apos;ll be navigated to the job&apos;s applicant list</li>
                        <li>• You can review and manage applications there</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pagination — the shared control, so page sizes, the page-number run
            and the "Showing X to Y of N" line all behave as they do on the Job
            Openings list. Clicking a page scrolls the rows above back to the
            top.

            Its own band OUTSIDE the scrolling body, between the rows and the
            footer, so it is always visible and can never be overlapped by a row
            — which a sticky bar inside the scroller was: `position: sticky`
            pins the bottom MARGIN edge, so the negative margin used to bleed it
            into the body's padding parked it short of the bottom with the next
            row showing underneath.

            `compact` is the shared control's smaller build — shorter select
            and page buttons, smaller labels, no card chrome — so it reads as
            part of the dialog like the footer beneath it rather than a card
            floating in a band. Off everywhere else, so no other list changes.

            Rendered only past the same row count ListPagination itself draws
            at, so it never becomes an empty band. */}
        {sortedJobs.length > 5 && (
          <div className="flex-shrink-0 border-t border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-3 sm:px-5 py-1.5">
            <ListPagination
              compact
              currentPage={safePage}
              itemsPerPage={itemsPerPage}
              totalItems={sortedJobs.length}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemLabel="published jobs"
              scrollContainerRef={listRef}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0">
          <div className="text-xs sm:text-sm text-gray-700 dark:text-slate-300">
            {jobOnly
              ? !selection
                ? 'Select one job to continue'
                : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    Selected: {selection.job.job_id ? `${selection.job.job_id} · ` : ''}
                    {selection.job.title} (v{selection.job.versionNumber ?? 1})
                  </span>
                )
              : includedResumes.length === 0
              ? 'Select at least one candidate to continue'
              : !selection
                ? 'Select one job to continue'
                : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                    {isScoringMode
                      ? `Ready to score ${includedResumes.length} resume${includedResumes.length === 1 ? '' : 's'} against 1 job`
                      : isMatchMode
                        ? `Ready to match ${includedResumes.length} candidate${includedResumes.length === 1 ? '' : 's'} against 1 job`
                        : `Ready to apply ${includedResumes.length} candidate${includedResumes.length === 1 ? '' : 's'} to 1 job`}
                  </span>
                )}
          </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canSubmit || isApplying}
              className="flex-1 sm:flex-none px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  {isScoringMode ? 'Scoring...' : isMatchMode ? 'Matching...' : 'Applying...'}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {confirmLabel
                    ? confirmLabel
                    : isScoringMode ? 'Score Resume'
                    : isMatchMode ? 'Continue to AI Talent Match'
                    : 'Apply to Job'}
                </>
              )}
            </button>
          </div>
        </div>

      </div>

    </div>

    {/* The Job Details page's Version History popup, unchanged and unwrapped —
        one implementation, so the two surfaces cannot drift apart. */}
    {versionHistoryFor && (
      <JDVersionHistoryModal
        isOpen
        onClose={() => setVersionHistoryFor(null)}
        jdId={versionHistoryFor.id}
        jdTitle={versionHistoryFor.title}
      />
    )}
    </>
  );
}
