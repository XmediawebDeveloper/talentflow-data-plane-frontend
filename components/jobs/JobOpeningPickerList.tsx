'use client';

import { Search, CheckCircle, Briefcase, Loader2, Eye, ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Job } from '@/lib/types/types';
import { jdService } from '@/lib/services/jdService';
import {
  getPublishedJobs,
  groupByLineage,
  isVersionVisibleForScoring,
  lineageKey,
  mapJDToJob,
  sortJobs,
} from '@/lib/utils/jobOpeningDisplay';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { useJobCandidateCounts } from '@/lib/hooks/useJobCandidateCounts';
import ListPagination from '@/components/ListPagination';
import { Skeleton } from '@/components/ui/skeleton';
import { onListCacheInvalidate } from '@/lib/utils/listCache';
import { getTokens } from '@/lib/services/api';
import { FolderIconIllustration, IllustratedEmptyState } from '@/components/ui/illustrated-empty-state';

/** Same rows-per-page the Job Openings list starts on. */
const DEFAULT_ITEMS_PER_PAGE = 10;

/* The last full job list this session read, so reopening the picker (Resume
   Scoring, Apply, Talent Match) paints instantly from it while a fresh read
   runs behind it — stale-while-revalidate. Dropped whenever the shared list
   cache is invalidated (every JD create/edit/publish/status change does). */
let lastFullJobList: { scope: string; jobs: Job[] } | null = null;
if (typeof window !== 'undefined') {
  onListCacheInvalidate(() => { lastFullJobList = null; });
}
/* Tied to the signed-in session (the same scope the shared list cache uses),
   so a different login in the same tab never sees the previous one's jobs. */
const sessionScope = (): string | null => {
  try {
    return typeof window === 'undefined' ? null : getTokens().accessToken || null;
  } catch {
    return null;
  }
};
const cachedJobsForSession = (): Job[] | null => {
  const scope = sessionScope();
  return scope && lastFullJobList?.scope === scope ? lastFullJobList.jobs : null;
};

export type JobSelection = { job: Job; lineage: string } | null;

export interface JobOpeningPickerListProps {
  /**
   * Jobs the host already had. Shown immediately so the list isn't empty on
   * mount, then replaced by this component's own fetch — the same request,
   * mapping and ordering the Job Openings page uses, so the list here matches
   * that page field for field rather than whatever subset a host happened to
   * map.
   */
  jobs?: Job[];
  /**
   * The one JD version picked. Held as the record itself rather than an id,
   * because the pick can be an older version chosen from a job's Version
   * History, and those versions are not in the list below — the history
   * fetches them from its own endpoint. `lineage` records which job's card
   * the pick belongs to, so that card reads as selected whichever of its
   * versions was picked. Controlled: the host owns this state, since it also
   * needs it for its own footer/summary/submit logic.
   */
  selection: JobSelection;
  onSelectionChange: (next: JobSelection) => void;
  /**
   * The radio group name — share it with sibling controls (another job list
   * on the same page/dialog) so picking one releases the other. Defaults to
   * a name unique enough not to collide with anything else on a page that
   * only ever renders one of these.
   */
  radioGroupName?: string;
  /**
   * Root of the block a page-change should scroll back to the top of. Pass
   * the scrollable ancestor inside a modal; omit on a plain static page
   * section, where the page itself scrolls and there's nothing to reset.
   */
  scrollContainerRef?: RefObject<HTMLDivElement>;
  /**
   * Puts a button right on the selected job's own card, so the next step
   * fires from where the pick was just made instead of a summary the host
   * shows further down the page — the button a host without one of its own
   * (ApplyToJobModal has its footer button instead) can ask for. Fires with
   * no argument; the host already holds the pick via `selection`.
   */
  onProceed?: () => void;
  /** Label for the `onProceed` button. Defaults to "Select Resumes". */
  proceedLabel?: string;
  /** When true, the proceed button stays visible (once a job is picked) but
   *  renders disabled — the host lacks the permission to proceed, but
   *  `onProceed` is still supplied (guarded internally) so the button is
   *  never removed from the DOM. */
  proceedDisabled?: boolean;
  /**
   * List a lineage by its latest PUBLISHED version, not strictly its latest
   * version overall. A job being re-drafted (a draft v3 sitting over a
   * published v2) still shows here — as v2, Published, exactly as pickable
   * as any other row — instead of the whole job reading as unusable because
   * its newest version happens to be a draft; the draft itself stays
   * reachable, and clearly marked as one, only inside Version History. A
   * lineage with no published version anywhere (a lone draft, or every
   * version drafted) is left off the list entirely, since there is nothing
   * on it a recruiter could actually pick. Off by default: every other host
   * (ApplyToJobModal's Apply/Score/Match flows) keeps its existing
   * published-only listing, unchanged.
   */
  showAllStatuses?: boolean;
  /**
   * The Job Descriptions page's All Jobs listing, drafts left out: each
   * lineage by its latest Published version, or — when it has
   * none — its latest NON-DRAFT version, whatever that version's status.
   * A Disabled / Archived job is listed — so it does not silently go missing —
   * but greyed out and unselectable, with the reason on hover; only a
   * Published one can be picked from its card. Its Version History still
   * offers any older Published version, and shows Disabled / Archived ones
   * greyed (drafts stay hidden there too). A lineage with only drafts is left
   * off. Takes precedence over `showAllStatuses`. Off by default — every
   * other host keeps its existing listing.
   */
  excludeDraftsOnly?: boolean;
  /**
   * Anchor placed immediately above the first job card, for a host that wants
   * to scroll this list to the top of the screen when it opens (Resume
   * Scoring's "Score Resumes" does). Sits above the cards rather than on the
   * first one so it holds its position while the jobs are still loading —
   * they render below it.
   */
  listAnchorRef?: RefObject<HTMLDivElement | null>;
  /**
   * Add the "N assessed" / "N interviewed" chips the Job Descriptions cards
   * carry (AI Talent Match's job list). Off by default, so other hosts don't
   * pay for the tally.
   */
  showCandidateCounts?: boolean;
  /** Colour the applicants / assessed / interviewed chips like the Job
   *  Openings badges (Resume Scoring). Off by default. */
  coloredCountBadges?: boolean;
  /** Hide the ✓ badge a picked card shows beside its version / status
   *  pills (Resume Scoring — the radio and highlight already mark it). */
  hideSelectedTick?: boolean;
  /** The applicant count's label on the cards and the version table
   *  ("Scored" on Resume Scoring). Omitted = "applicants" / "Applicants". */
  applicantsLabel?: string;
}

/**
 * The job list at the heart of "Apply to Job" / "Score Resume" / "AI Talent
 * Match": search, one row per lineage's latest published version, expandable
 * Version History, pagination. Lifted out of `ApplyToJobModal` so a host that
 * wants this exact picker WITHOUT the modal's candidate panel and chrome —
 * Resume Scoring's job-selection step, rendered statically on the page — gets
 * the identical search/cards/history/pagination behaviour rather than a
 * second, drifting implementation.
 */
export default function JobOpeningPickerList({
  jobs,
  selection,
  onSelectionChange,
  radioGroupName = 'job-opening-picker-selection',
  scrollContainerRef,
  onProceed,
  proceedLabel = 'Select Resumes',
  proceedDisabled = false,
  showAllStatuses = false,
  excludeDraftsOnly = false,
  listAnchorRef,
  showCandidateCounts = false,
  coloredCountBadges = false,
  hideSelectedTick = false,
  applicantsLabel,
}: JobOpeningPickerListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const candidateCounts = useJobCandidateCounts(showCandidateCounts);

  /* The job list, read the way the Job Openings page reads it: `source:
     'my-jds'`, in pages of 100, mapped through the shared mapper. Every host
     used to hand in its own partially-mapped list, which is why the publish
     count, the lineage version and the experience line were missing here. The
     host's list still seeds the state so the list opens with content.

     EVERY VERSION, unfiltered — deliberately. Asking the endpoint for
     `status: 'published'` instead looks like the cheaper way to get a published
     list, and it is wrong: it strips a lineage's draft v3 before the versions
     can be collapsed, so the published v2 stands in as the latest and the job
     counts as published here while the Job Openings page — which sees the v3 —
     calls it a draft. That was the 226-vs-223 gap. The published test belongs
     AFTER the collapse, in `getPublishedJobs`, on the full list. */
  const [fetchedJobs, setFetchedJobs] = useState<Job[] | null>(() => cachedJobsForSession());
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /* Progressive: the first 10 jobs are put on screen the moment they land,
     and the 100-row pages are read in parallel behind them, the list swapping
     to the full set when they're all in. The old loop awaited every page one after another before
     drawing anything — 4 pages of 100 sat behind a skeleton for 10s+. The
     small "Loading jobs..." spinner beside the heading stays up until the
     full set is in, since a lineage's older versions can still be on a later
     page (the View Versions button may appear a moment later). */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingJobs(true);
      setJobsError(null);
      try {
        /* The first screen's worth of jobs (one picker page) is read on its
           own and painted the moment it lands, then every 100-row page is
           read in parallel behind it. Only painted when there's nothing
           better on screen already — replacing a cached full list with ten
           rows would make the rest vanish and come back. */
        const items = await jdService.listAllMineProgressive((firstItems) => {
          if (cancelled || cachedJobsForSession()) return;
          setFetchedJobs(firstItems.map(mapJDToJob));
        }, DEFAULT_ITEMS_PER_PAGE);
        if (cancelled) return;
        const full = items.map(mapJDToJob);
        const scope = sessionScope();
        lastFullJobList = scope ? { scope, jobs: full } : null;
        setFetchedJobs(full);
      } catch (error) {
        if (cancelled) return;
        console.error('[JobOpeningPickerList] Failed to load job openings:', error);
        // Keep whatever is already on screen (cached list, page 1, or the
        // host's jobs) rather than emptying the list — the recruiter can still
        // pick from it while the retry is offered.
        setJobsError('Could not load job openings.');
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [reloadToken]);

  /* Version history — the same hook and endpoints behind the Job Openings
     page's own "View Versions", so the history opened from this list is the
     history that page shows. */
  const versionLineage = useJobVersionLineage();

  /* The eye on a job row opens the Job Details page's Version History popup
     over this list — literally that component, so the cards, badges,
     Published/Republished labels, compare and per-version JD view are the
     same ones that page shows. It fetches its own lineage, so all this has to
     hold is which job was asked for.

     The "View Versions" table below is untouched: it stays the place where a
     version is PICKED. This is the place a version is READ. */
  const [versionHistoryFor, setVersionHistoryFor] = useState<Job | null>(null);
  /* Set by a version row's eye, so the popup opens on that version. */
  const [versionHistoryVersion, setVersionHistoryVersion] = useState<number | null>(null);

  /* Every job is listed; the search narrows it. Matching only `job.title`
     meant a JD number typed in full returned nothing — the number lives on
     `job_id`, and departments and locations are searched for just as often.

     Two passes per field. The plain one is a straight substring, so "77" finds
     JD-77 and "develop" finds Developer. The second strips everything that
     isn't a letter or a digit from BOTH sides first, so the separator a
     recruiter types doesn't have to match the one the record was stored with:
     "jd-77", "JD 77", "jd_77" and "jd77" all find the same job. */
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const jobSearch = searchQuery.trim().toLowerCase();
  const jobSearchCompact = normalize(searchQuery);

  const matchesSearch = (job: Job) => {
    if (!jobSearch) return true;
    // Hosts hand in rows carrying the JD number under several names.
    const j = job as Job & Record<string, unknown>;
    return [
      job.title,
      j.job_id,
      j.jobId,
      j.jd_number,
      j.jd_id,
      j.reference_id,
      j.industry_type,
      j.department,
      job.location,
      j.employment_type,
      j.employmentType,
    ]
      .filter(Boolean)
      .some(field => {
        const raw = String(field).toLowerCase();
        if (raw.includes(jobSearch)) return true;
        // Guard against a punctuation-only query matching everything.
        return !!jobSearchCompact && normalize(String(field)).includes(jobSearchCompact);
      });
  };

  /* Every version, as fetched — what the lineage grouping needs to know which
     version of a job is the latest one. Also what the "View Versions" test
     below counts, exactly as the Job Openings list counts it. */
  const allVersions = useMemo(() => fetchedJobs ?? jobs ?? [], [fetchedJobs, jobs]);
  const versionGroups = useMemo(() => groupByLineage(allVersions), [allVersions]);

  /* Learn whether every archived/disabled version across the whole dataset
     was ever scored — isVersionVisibleForScoring (and so the "does this
     lineage have anything worth a View Versions button" check below) needs
     that count to decide whether such a version belongs in the history at
     all. Scoped to archived/disabled ids only: published and draft versions
     don't need this count for that decision. */
  const { ensureVersionApplicants } = versionLineage;
  const archivedOrDisabledVersionIds = useMemo(
    () => allVersions
      .filter(v => ['archived', 'disabled'].includes((v.status || '').toLowerCase()))
      .map(v => v.id),
    [allVersions],
  );
  useEffect(() => {
    ensureVersionApplicants(archivedOrDisabledVersionIds);
  }, [archivedOrDisabledVersionIds, ensureVersionApplicants]);

  /* The listed jobs, and the number reported above them: one row per
     lineage.
     - Default: the lineage's LATEST version, kept only where that version is
       Published. `getPublishedJobs` is the same call behind the Job Openings
       page's Published stat card, over the same request — so the count here
       is that card's count, not a second opinion.
     - `showAllStatuses`: the lineage's latest PUBLISHED version — which may
       not be its latest version at all. A job currently being re-drafted
       (say v3 draft over a published v2) still shows here as v2, Published,
       exactly as eligible as any other row; the draft stays reachable, and
       clearly marked as such, only inside Version History. A lineage with NO
       published version anywhere (a lone draft, or every version drafted) is
       dropped from the list entirely rather than shown disabled — nothing on
       it can be scored yet, so there is nothing useful to show.

     Applied BEFORE the search, so a query can never promote an older version to
     stand in for its lineage. */
  const listedJobs = useMemo(() => {
    if (excludeDraftsOnly) {
      const reps: Job[] = [];
      versionGroups.forEach(bucket => {
        // Newest-version-first: the card shows the latest Published
        // version, falling back to the latest non-draft one
        // (Disabled / Archived, greyed out) when none is published.
        const rep = bucket.find(v => v.status === 'Published') ?? bucket.find(v => v.status !== 'Draft');
        if (rep) reps.push(rep);
      });
      return reps;
    }
    if (!showAllStatuses) return getPublishedJobs(allVersions);
    const reps: Job[] = [];
    versionGroups.forEach(bucket => {
      // `bucket` is newest-version-first (see groupByLineage), so the first
      // Published entry found is that lineage's latest published version.
      const latestPublished = bucket.find(v => v.status === 'Published');
      if (latestPublished) reps.push(latestPublished);
    });
    return reps;
  }, [allVersions, showAllStatuses, excludeDraftsOnly, versionGroups]);

  const filteredJobs = useMemo(
    () => listedJobs.filter(matchesSearch),
    // matchesSearch closes over the query, which is the only thing that changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listedJobs, jobSearch, jobSearchCompact],
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
  const currentPage = pageState.query === jobSearch ? pageState.page : 1;
  const setCurrentPage = (page: number) => setPageState({ query: jobSearch, page });

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / itemsPerPage));
  // A shrinking result set (a new search, a narrower list) can leave the
  // current page past the end; clamp on read so the rows never come back empty
  // while the page number still points somewhere.
  const safePage = Math.min(currentPage, totalPages);
  const currentJobs = sortedJobs.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  /* One role at a time. The pick survives paging and searching, since it is
     held outside the list (in the host, via `selection`/`onSelectionChange`). */
  const selectedJobId = selection?.job.id ?? null;
  const selectionOnThisPage = !!selection && currentJobs.some(job => lineageKey(job) === selection.lineage);

  /* Pick a version — the card's own radio passes the latest, the Version
     History rows pass an older one. Clicking the picked one lets go of it. */
  const pickVersion = (job: Job, lineage: string) => {
    onSelectionChange(selection?.job.id === job.id ? null : { job, lineage });
  };

  return (
    <>
    <div>
      {/* Job Search */}
      <div className="mb-4">
        <label className="block tf-label mb-2">Search Jobs</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search by JD number, role, department or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // Shared filter-input chrome — the same h-9 / gray-200 border /
            // rounded-lg / brand-blue focus + hover that ListToolbar's search,
            // SearchableSelect and DateField use on the Job Openings page, so
            // this picker's search reads as the same control family.
            className="tf-input pl-10 pr-4"
          />
        </div>
      </div>

      {/* Job Selection */}
      <div className="mb-4">
        {/* flex-wrap: on a phone the heading keeps its width and the
            "1 selected · Clear Selection" pair drops to the next line,
            instead of squeezing the heading into a word-per-line column. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-3">
          <label className="min-w-0 tf-label">
            Select a Job Opening
            {/* The published-job count — the Job Openings page's own
                derivation, via getPublishedJobs. No total beside it and
                nothing hardcoded. It follows the search, so it always
                describes exactly what is listed. */}
            {/* Held back while loading: the first screen is only a partial
                list, and "— 10 jobs" beside the spinner would read as the total. */}
            {sortedJobs.length > 0 && !loadingJobs && (
              <span className="ml-2 font-normal text-gray-500 dark:text-slate-400 whitespace-nowrap">
                &mdash; {sortedJobs.length} {excludeDraftsOnly ? `job${sortedJobs.length === 1 ? '' : 's'}` : 'available'}
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
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Only ever 0 or 1 here — one job is picked at a time — but
                  shown as a count for the same reason every other selection
                  UI in the app states it as a number rather than just "a job
                  is selected". */}
              <span className="tf-badge text-brand-blue bg-brand-blue/10">
                1 selected
              </span>
              <button
                onClick={() => onSelectionChange(null)}
                className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium whitespace-nowrap"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {/* The pick survives paging and searching, so say what it is when it
            isn't on screen — otherwise a selected-but-elsewhere job reads as
            no selection at all. */}
        {selection && !selectionOnThisPage && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 tf-meta">
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
            <span>{jobsError} {listedJobs.length > 0 ? 'Showing the jobs already loaded.' : ''}</span>
            <button
              onClick={() => setReloadToken(t => t + 1)}
              className="inline-flex items-center gap-1 font-medium text-amber-900 hover:underline dark:text-amber-100"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        <div ref={listAnchorRef} data-list-anchor className="scroll-mt-4" aria-hidden="true" />

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
                 inert, so the pick can't turn into two answers. Clicking the
                 picked one lets go of it. Status never blocks a row here:
                 `listedJobs` only ever contains a lineage's PUBLISHED
                 version (its latest, or — under `showAllStatuses` — the
                 latest one that's actually published, if the true latest is
                 a draft), so every row reaching this point is already
                 eligible to be picked directly. */
              const blockedByOtherPick = !!selection && !lineageSelected;
              /* `excludeDraftsOnly` lists Disabled / Archived jobs too; those
                 are shown but cannot be picked from their card. */
              const inactiveJob = excludeDraftsOnly && job.status !== 'Published';
              const selectable = !blockedByOtherPick && !inactiveJob;
              const reason = inactiveJob
                ? `This job is ${String(job.status).toLowerCase()} — it can't be selected`
                : blockedByOtherPick
                  ? 'Only one job can be picked at a time — clear the current selection to choose this one'
                  : undefined;

              /* Every version in this lineage, not just the published one
                 represented here — what Version History below lists,
                 including any draft ahead of the published row on screen. */
              const lineageSiblings = versionGroups.get(versionKey) ?? [job];

              /* Only jobs with MORE THAN ONE version visible to Resume
                 Scoring get the control — the exact same
                 isVersionVisibleForScoring test resolveVersionHistoryRows
                 applies to the table itself below, so the button's guess
                 never disagrees with what opening it actually shows: a
                 draft is never counted, and an archived/disabled version
                 counts only once its scored-count has come back positive
                 (ensureVersionApplicants above). Counted from
                 `lineageSiblings`, which already carries the full,
                 already-fetched lineage — no extra request needed beyond
                 that applicant-count prefetch. */
              const visibleVersionCount = new Set(
                lineageSiblings
                  .filter(sibling => isVersionVisibleForScoring(sibling.status, sibling.id, versionLineage.versionApplicants, true))
                  .map(sibling => sibling.versionNumber ?? 1),
              ).size;
              const hasVersionHistory = visibleVersionCount > 1;

              /* Rendered in two places: beside the eye on phones (one row,
                 instead of a lone button on a row of its own under it), and
                 in the card's bottom-right corner from sm up. */
              const viewVersionsButton = hasVersionHistory ? (
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
              ) : null;

              return (
                <div
                  key={job.id}
                  /* A row the user can't pick — another job is already
                     chosen — stays visible but inert, with the reason in
                     the title attribute. */
                  title={selectable ? undefined : reason}
                  aria-disabled={!selectable}
                  className={`rounded-lg border-2 p-3 sm:p-4 transition-all ${
                    blockedByOtherPick || inactiveJob
                      ? `bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 ${blockedByOtherPick ? 'opacity-60' : ''}`
                      : lineageSelected
                        ? 'bg-brand-blue/5 border-brand-blue/40 shadow-sm shadow-brand-blue/10'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03]'
                  }`}
                >
                  {/* flex-wrap below sm: radio + job info share the first row,
                      level with the Job ID / Job Name line; the buttons wrap
                      under them at full width. */}
                  {/* An archived / disabled job fades only its radio and
                      details, not the card: the eye and the expanded Version
                      History (whose Published versions stay pickable) keep
                      their normal colours. */}
                  <div className="flex flex-wrap lg:flex-nowrap items-start gap-3 sm:gap-4">
                    {/* A radio, because exactly one job is picked at a time.
                        Wrapped in its own label rather than the whole card:
                        the card now carries links and a versions toggle,
                        and a label around those would swallow their
                        clicks. */}
                    <label
                      className={`flex items-center h-5 sm:h-auto sm:pt-1 ${selectable ? 'cursor-pointer' : 'cursor-not-allowed'} ${inactiveJob && !blockedByOtherPick ? 'opacity-60' : ''}`}
                      title={selectable ? `Select the latest version (v${job.versionNumber ?? 1})` : reason}
                    >
                      <input
                        type="radio"
                        name={radioGroupName}
                        checked={isSelected}
                        disabled={!selectable}
                        onChange={() => selectable && pickVersion(job, versionKey)}
                        onClick={() => isSelected && pickVersion(job, versionKey)}
                        /* .tf-radio-tinted (globals.css): a plain CSS rule,
                           not a Tailwind arbitrary-value class — browsers
                           ignore `background-color` on a native radio
                           outright, so an exact fill colour needs
                           `appearance: none` and a hand-drawn checked state,
                           which is more reliable as real CSS than a bracketed
                           radial-gradient() Tailwind has to extract from a
                           class string. */
                        className="tf-radio-tinted focus:ring-brand-blue/40 flex-shrink-0"
                      />
                      <span className="sr-only">Select {job.title}</span>
                    </label>

                    <div className={`flex-1 min-w-0 ${inactiveJob && !blockedByOtherPick ? 'opacity-60' : ''}`}>
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
                          job={candidateCounts
                            ? { ...job, assessed: candidateCounts[job.id]?.assessed ?? 0, interviewed: candidateCounts[job.id]?.interviewed ?? 0 }
                            : job}
                          metaSingleLine
                          // No '-' placeholders for a job with no salary/location —
                          // the fields are simply omitted (same rule as the Job
                          // Openings cards). Icons and the count chips stay at
                          // their defaults so the picker keeps its own identity.
                          hideEmptyFields
                          coloredCountBadges={coloredCountBadges}
                          applicantsLabel={applicantsLabel?.toLowerCase()}
                          trailingBadges={
                            /* No ml-auto: that was reaching across the row to line
                               up with the eye icon back when it sat beside this
                               summary. The eye button (and the Select Resumes
                               button under it) now live in their own column to
                               the right, so the tick just reads as one more
                               badge alongside v1/Published/AI instead of
                               chasing an element it no longer shares a row with. */
                            lineageSelected && !hideSelectedTick ? (
                              <CheckCircle className="w-5 h-5 text-brand-blue flex-shrink-0" />
                            ) : null
                          }
                        />
                      </div>

                      {/* The headline above describes the LATEST version, so
                          when the pick is an older one, name it — otherwise
                          a highlighted card would imply the pick is on the
                          version on display. */}
                      {selectedVersionOfThisJob && (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-blue/10 px-2 py-1 text-xs font-medium text-brand-blue">
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          Picked v{selectedVersionOfThisJob.versionNumber ?? 1}, chosen from Version History
                        </p>
                      )}
                    </div>

                    {/* Right side: once this job is the pick, the next-step
                        button sits right before the eye icon, both on one
                        row — so it fires from right where the pick was just
                        made instead of a summary further down the page.
                        Phones: three controls don't fit one row, so once the
                        job is picked the next-step button + eye share the row
                        and View Versions drops to its own line below. */}
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0 basis-full sm:max-lg:flex-nowrap sm:max-lg:justify-end sm:max-lg:pt-3 sm:max-lg:border-t sm:max-lg:border-gray-200 dark:sm:max-lg:border-slate-700 lg:flex-nowrap lg:basis-auto">
                      {lineageSelected && onProceed && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Permission-locked: tooltip only, no-op click.
                            if (proceedDisabled) return;
                            onProceed();
                          }}
                          /* aria-disabled (not native `disabled`) so the
                             permission tooltip still shows on hover. */
                          aria-disabled={proceedDisabled || undefined}
                          title={proceedDisabled ? 'You do not have permission to proceed' : undefined}
                          className={`h-7 px-2.5 max-sm:flex-1 max-lg:h-9 max-lg:px-3 rounded-md transition-all text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap ${
                            proceedDisabled
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'
                              : 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30'
                          }`}
                        >
                          {proceedLabel}
                        </button>
                      )}

                      {/* The eye on the latest version opens the Version
                          History popup — a button, not a link, so nothing
                          navigates and the pick survives. Unconditional,
                          unlike the View Versions button below: a
                          single-version job opens here too, and the popup
                          shows that one version. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVersionHistoryVersion(null);
                          setVersionHistoryFor(job);
                        }}
                        className="h-9 w-9 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                        aria-label="View version history"
                        title="View version history"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {viewVersionsButton && (
                        <div className={`lg:hidden sm:order-first sm:mr-auto sm:ml-0 sm:basis-auto sm:[&>button]:w-auto [&>button]:h-9 [&>button]:px-3 ${lineageSelected && onProceed ? 'max-sm:basis-full [&>button]:w-full [&>button]:justify-center' : 'ml-auto'}`}>{viewVersionsButton}</div>
                      )}
                    </div>
                  </div>

                  {/* View Versions — the card's bottom-right corner, on its
                      own single horizontal row so it clears the details
                      above it whatever they wrap to. */}
                  {hasVersionHistory && (
                    <div className="mt-3 hidden lg:flex items-center justify-end gap-2">
                      {viewVersionsButton}
                    </div>
                  )}

                  {/* Version history, expanded in place — the same panel
                      the Job Openings list opens, minus the action menu
                      (nothing here changes a JD). Titles open the job in
                      this same tab. */}
                  {hasVersionHistory && versionsExpanded && (
                    <JobVersionHistoryPanel
                      job={job}
                      versions={versionLineage.lineages[versionKey]}
                      loading={versionLineage.isLoading(versionKey)}
                      versionDetails={versionLineage.versionDetails}
                      versionApplicants={versionLineage.versionApplicants}
                      applicantsLabel={applicantsLabel}
                      /* The rows are things you TICK here, so the title's
                         hover scale comes off — on a selectable row that
                         little movement reads as the control twitching. */
                      staticRows
                      /* Action column: the card's Eye on every version
                         row, opening the popup on that row's version (as
                         the AI Interview / Assessment pickers do). Plus a
                         Select radio per row, sharing the job rows' radio
                         group so picking a version releases whatever else
                         was chosen. */
                      renderAction={(versionJob) => (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setVersionHistoryVersion(versionJob.versionNumber ?? 1);
                            setVersionHistoryFor(versionJob);
                          }}
                          className="h-7 w-7 flex items-center justify-center bg-white dark:bg-slate-900 text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all flex-shrink-0"
                          aria-label={`View v${versionJob.versionNumber ?? 1} details`}
                          title={`View v${versionJob.versionNumber ?? 1} details`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      onSelectVersion={(versionJob) => pickVersion(versionJob, versionKey)}
                      selectedVersionId={selectedJobId}
                      /* A card that is inert because another job is picked
                         keeps its version radios inert too, or expanding it
                         would offer a back door around the one-at-a-time
                         rule the card itself enforces. The panel runs its
                         own per-version published check independently, so
                         this only ever needs to carry the one-at-a-time
                         block through — never anything about THIS card's own
                         status, which `listedJobs` already guarantees is
                         Published. */
                      selectionDisabled={blockedByOtherPick}
                      selectionDisabledReason={reason}
                      radioGroupName={radioGroupName}
                      publishedOnly
                      /* Every archived/disabled version is listed, greyed
                         out and unselectable, so a recruiter sees it was
                         taken out of service instead of it going missing. */
                      includeInactiveVersions
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : loadingJobs ? (
          /* Skeleton mirrors the job picker rows: the same
             `space-y-2 sm:space-y-3` stack of `rounded-lg border-2 p-3 sm:p-4`
             cards, each with the leading radio, the job summary (title + meta
             line) and the trailing eye/version-history button column. */
          <div className="space-y-2 sm:space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:p-4"
              >
                <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                  <Skeleton className="mt-1 h-4 w-4 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <div className="flex flex-wrap items-center gap-3">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <IllustratedEmptyState
            bordered={false}
            illustration={<FolderIconIllustration icon={searchQuery ? Search : Briefcase} />}
            description={showAllStatuses || excludeDraftsOnly
              ? (searchQuery ? 'No jobs found matching your search' : 'No jobs available')
              : (searchQuery ? 'No published jobs found matching your search' : 'No published jobs available')}
          />
        )}
      </div>

      {/* Pagination — the shared control, so page sizes, the page-number run
          and the "Showing X to Y of N" line all behave as they do on the Job
          Openings list. `compact` is the shared control's smaller build —
          shorter select and page buttons, smaller labels, no card chrome —
          so it reads as part of whatever surface hosts this list rather than
          a card floating on its own.

          Rendered only past the same row count ListPagination itself draws
          at, so it never becomes an empty band. */}
      {sortedJobs.length > 5 && (
        <ListPagination
          compact
          currentPage={safePage}
          itemsPerPage={itemsPerPage}
          totalItems={sortedJobs.length}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
          itemLabel={excludeDraftsOnly ? 'jobs' : 'published jobs'}
          scrollContainerRef={scrollContainerRef}
        />
      )}
    </div>

    {/* The Job Details page's Version History popup, unchanged and unwrapped
        — one implementation, so the two surfaces cannot drift apart. */}
    {versionHistoryFor && (
      <JDVersionHistoryModal
        isOpen
        onClose={() => { setVersionHistoryFor(null); setVersionHistoryVersion(null); }}
        jdId={versionHistoryFor.id}
        jdTitle={versionHistoryFor.title}
        initialVersionNumber={versionHistoryVersion ?? undefined}
      />
    )}
    </>
  );
}
