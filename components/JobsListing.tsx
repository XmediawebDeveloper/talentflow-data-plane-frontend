'use client'

import { Plus, Search, MapPin, Eye, MoreVertical, Briefcase, Users, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, Settings, Archive, XCircle, AlertCircle, ArrowUpRight, Edit, Ban, RefreshCw, ArrowUpDown, CheckSquare, Square, Trash2, Download, ChevronLeft, ChevronRight, X, Brain, ClipboardList, ClipboardCheck, Video, Loader2, Info, ArrowUp, ArrowDown } from 'lucide-react';
import { StickyBulkBar } from '@/components/ui/sticky-bulk-bar';
import type { LucideIcon } from 'lucide-react';
import { centerMenuOnPhoneRef } from '@/lib/hooks/useCenteredMenuOnPhone';
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Job } from '@/lib/types/types';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import ArchiveJobModal from '@/components/ArchiveJobModal';
import DisableJobModal from '@/components/DisableJobModal';
import DeleteJobModal from '@/components/DeleteJobModal';
import {
  formatEmploymentType,
  formatIndustryType,
  matchesStatusFilter,
  lineageKey,
  mapJDToJob,
  mapJDStatus,
  type JobSortBy,
} from '@/lib/utils/jobOpeningDisplay';
import { jdService, type JobOpeningsFilters, type JobOpeningsStats, type JobOpeningsTab } from '@/lib/services/jdService';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { fetchRemainingPages } from '@/lib/utils/fetchPagesParallel';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';
import JobOpeningSummary, { JobOpeningPrimaryItems, JobOpeningDatesGrid } from '@/components/jobs/JobOpeningSummary';
import JobIdBadge, { JOB_ID_BADGE_FIT } from '@/components/jobs/JobIdBadge';
import { getCreationMethodConfig, getDisplayStatus, getStatusConfig } from '@/lib/utils/jobOpeningDisplay';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { useJobCandidateCountsFor } from '@/lib/hooks/useJobCandidateCounts';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import SearchableSelect from '@/components/ui/searchable-select';
import { DateField } from '@/components/ui/date-field';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ListToolbar from '@/components/ui/list-toolbar';
/* The toolbar pill/segment style helpers now live in a shared module so other
   job-opening surfaces can reuse the exact status-tab and segmented-toggle
   chrome rather than re-deriving it. */
import { tabPill, SEGMENT_TOGGLE, segmentBtn } from '@/components/ui/filter-pills';
import { useListSearch } from '@/lib/hooks/useListSearch';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, ExportFileFormat } from '@/lib/utils/exportUtils';
import { Tooltip } from '@/components/ui/tooltip';
/* Radix menu rather than the hand-rolled absolute dropdown the job rows use:
   the version table sits inside an overflow-x-auto shell, which would clip an
   absolutely positioned menu — Radix portals it out of the scroll container. */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** The fields the job list sorts by — one list for the Sort control and the phone Sort menu. */
const JOB_SORT_OPTIONS: { value: JobSortBy; label: string }[] = [
  { value: 'date', label: 'Date Posted' },
  { value: 'applicants', label: 'Scored' },
  { value: 'assessed', label: 'Assessed' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'title', label: 'Job Title' },
  { value: 'status', label: 'Status' },
  { value: 'industry', label: 'Industry Type' },
];

/** The two sort orders, worded for the field: dates newest / oldest, counts highest / lowest,
 *  text A → Z / Z → A. */
const sortOrderLabels = (field: JobSortBy): { desc: string; asc: string } =>
  field === 'date'
    ? { desc: 'Newest first', asc: 'Oldest first' }
    : field === 'applicants' || field === 'assessed' || field === 'interviewed'
      ? { desc: 'Highest first', asc: 'Lowest first' }
      : { desc: 'Z → A', asc: 'A → Z' };

const viewVersionsMenuItemClass = 'group text-gray-700 dark:text-slate-200';
const viewVersionsMenuItemOrangeClass = 'group text-orange-700 dark:text-orange-300 [&_svg]:!text-current';
const viewVersionsMenuItemGreenClass = 'group text-success [&_svg]:!text-current';
const viewVersionsMenuItemRedClass = 'group text-destructive [&_svg]:!text-current';

/* Formatting, badge tokens, lineage grouping and the list sort all live in
   lib/utils/jobOpeningDisplay — this page is the reference listing, and the
   Apply to Job dialog renders the same jobs from the same helpers. */

// Columns in the job-openings export file (CSV or Excel)
const JOBS_EXPORT_HEADERS = [
  'JD ID', 'Title', 'Status', 'Creation Method', 'Version',
  'Industry', 'Department', 'Employment Type', 'Work Mode',
  'Experience (Min Years)', 'Experience (Max Years)', 'Experience',
  // 'Education' removed 2026-08-21. Education is a requirement, and requirements
  // live in Must-Have / Nice-to-Have Additional Requirements now. This export is
  // JD METADATA - it carries no skills or requirements columns at all - so a lone
  // Education column was the odd one out. Keep this list and the row values in runBulkExport
  // in the SAME order: they are joined positionally, so dropping one without the
  // other silently shifts every following column.
  'Salary', 'Location', 'Job Level',
  'Posted Date', 'Created Date', 'Last Updated', 'Created By',
  'Scored'
];

/* The list loads itself, one page at a time (GET /jd?view=jobs) with the stat
   cards beside it (GET /jd/stats) — both built server-side from one filter, so
   a card always equals the total its tab lists. The host no longer passes
   `jobs`: it used to download every JD version to compute all of this here. */
interface JobsListingProps {
  onCreateNew: () => void;
  /** Permission gate for onCreateNew — action/icon must stay visible and only
   *  become non-clickable (with a toast on click) when this is true, never
   *  hidden entirely. Create has no internal canCreateJd check in this file
   *  (unlike Edit/Disable/Archive/Delete below, which reuse canUpdateJd/
   *  canDisableJd/canArchiveJd/canDeleteJd computed from useAuth() directly),
   *  so the host must pass this explicitly. */
  onCreateNewDisabled?: boolean;
  onViewJob: (job: Job) => void;
  onViewApplicants?: (job: Job) => void;
  onAIMatch?: (job: Job) => void;
  onAIMatchDisabled?: boolean;
  /** Hover/toast text when onAIMatchDisabled — e.g. the plan-locked message.
   *  Defaults to the permission message. */
  onAIMatchDisabledReason?: string;
  onScoreResumes?: (job: Job) => void;
  onScoreResumesDisabled?: boolean;
  onScoreResumesDisabledReason?: string;
  onUpdateJobStatus?: (jobId: string, status: Job['status']) => void;
  onEditJob?: (job: Job) => void;
  /**
   * Statuses the host has successfully written since the version lineage was
   * fetched, by version id. Forwarded straight to the View Versions table, whose
   * cached lineage would otherwise keep showing a version's pre-action badge
   * until the panel was reopened. See JobVersionHistoryPanel.statusOverrides.
   */
  versionStatusOverrides?: Record<string, string>;
  /**
   * Version ids the host has successfully deleted since the lineage was
   * fetched. Dropped from the View Versions table so a deleted version
   * disappears at once instead of lingering until a page refresh.
   */
  deletedVersionIds?: Set<string>;
  onPublishJob?: (job: Job) => void;
  onDisableJob?: (job: Job) => void;
  onRepublishJob?: (job: Job) => void;
  onArchiveJob?: (job: Job) => void;
  onUnarchiveJob?: (job: Job) => void;
  onDeleteJob?: (job: Job) => void;
  // Bulk delete: given the selected jobs, actually delete them (single confirm is
  // handled here in JobsListing before this is called).
  onBulkDelete?: (jobs: Job[]) => void | Promise<void>;
  /** Bulk Disable / Re-enable / Archive / Unarchive: applies the status change to
   *  every given job and reports one summary toast. */
  onBulkStatusChange?: (jobs: Job[], action: BulkStatusAction) => Promise<void>;
  /** Ids of the given jobs that are in use (scored, matched, assessed or
   *  interviewed) — checked before the bulk Delete confirm opens. */
  onCheckJobsInUse?: (jobs: Job[]) => Promise<Set<string>>;
  /** Every selected job is in use: show the row Delete's "Cannot Delete"
   *  popup for them (a toast is the fallback when not given). */
  onAllJobsInUse?: (jobs: Job[]) => void;
  // Quota information for showing limit reached message
  quotaInfo?: {
    remaining: number;
    limit: number;
    used: number;
  };
  // Initial status filter from URL
  initialStatusFilter?: string;
  // Land straight on the full jobs list instead of the stat-tile overview, showing
  // every job. Set when the caller's intent is explicitly "show me all the jobs" —
  // e.g. "Go to All Jobs" after publishing a JD, where stopping on the tiles (or on
  // a persisted narrowed view) hides the job the recruiter just created.
  // Unlike a status deep-link this also clears the restored search/status/page, so
  // "all jobs" really means all of them.
  forceListView?: boolean;
  /* Where the Config button goes. It used to open an inline panel of three
     links out to three near-identical pages; those three are now sections of
     one Configuration page, so this is a plain link. */
  configHref?: string;
  /** RBAC: the viewer may not manage the job masters. Config stays VISIBLE but
   *  greyed out with a hover tooltip (never hidden) and does not navigate. */
  configDisabled?: boolean;
  /** Refetches the job list. When given, the toolbar shows a Refresh button. */
  onRefresh?: () => Promise<unknown> | void;
}

/**
 * The version count that sits under a stat tile's number.
 *
 * Every tile carries two populations, and collapsing them into one is what made
 * the tiles disagree with the list: a job republished twice is ONE job and THREE
 * versions. The headline number stays the JOB count — the same figure the rows
 * and the "of N jobs" badge show — and this pill carries the versions behind
 * it, rather than competing with it.
 *
 * Styled as the house grey pill (`bg-gray-100 / text-gray-600 / ring-gray-200`,
 * with the slate dark pairing), the same token the AI Interview, Assessment and
 * Talent Match views use for a neutral metadata chip — written out rather than
 * abstracted because that is how every other caller carries it.
 */
const StatVersions = ({ count }: { count: number }) => (
  <span className="tf-badge mt-1.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
    {count} {count === 1 ? 'version' : 'versions'}
  </span>
);

/* Placeholders sized like the number and the pill, in the page skeleton's
   pulse style, so the cards don't shift when the counts arrive. */
const StatValuePlaceholder = () => (
  <span role="status" aria-label="Loading count" className="my-1 block h-6 w-12 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
);
const StatVersionsPlaceholder = () => (
  <span aria-hidden className="mt-1.5 block h-5 w-20 rounded-full bg-gray-100 dark:bg-slate-800 animate-pulse" />
);

/** A list row plus the server's per-row version counts (GET /jd?view=jobs). */
type JobRow = Job & { versionCount?: number; tabVersionCount?: number };

/* The rows' placeholder while the first page loads — card-shaped pulses, so
   the cards above (which have their own placeholders) and the list arrive
   without a layout jump. */
const JobsListLoading = () => (
  <div className="space-y-3" role="status" aria-label="Loading job openings">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 dark:bg-slate-900 dark:border-slate-700">
        <div className="h-4 w-40 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="mt-3 h-3 w-3/4 rounded bg-gray-100 dark:bg-slate-800 animate-pulse" />
        <div className="mt-2 h-3 w-1/2 rounded bg-gray-100 dark:bg-slate-800 animate-pulse" />
      </div>
    ))}
  </div>
);

/** The status transitions the bulk Actions menu can apply. */
export type BulkStatusAction = 'disable' | 'reenable' | 'archive' | 'unarchive';

export default function JobsListing({ onCreateNew, onCreateNewDisabled = false, onViewJob, onViewApplicants, onAIMatch, onAIMatchDisabled = false, onAIMatchDisabledReason = 'You do not have permission to run AI Talent Match', onScoreResumes, onScoreResumesDisabled = false, onScoreResumesDisabledReason = 'You do not have permission to run resume scoring', onUpdateJobStatus, onEditJob, versionStatusOverrides, deletedVersionIds, onDisableJob, onRepublishJob, onArchiveJob, onUnarchiveJob, onDeleteJob, onBulkDelete, onBulkStatusChange, onCheckJobsInUse, onAllJobsInUse, quotaInfo, initialStatusFilter, forceListView, configHref, configDisabled = false, onRefresh }: JobsListingProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Assigned once the paged list exists (below); Refresh re-reads it bypassing the cache.
  const refreshListRef = useRef<() => void>(() => {});
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      refreshListRef.current();
      await onRefresh?.();
    } finally {
      setIsRefreshing(false);
    }
  };
  const router = useRouter();
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  // NOTE: canUpdateJD/canDeleteJD/canArchiveJD/canDisableJD (capital JD) are the
  // real, populated fields — AuthProvider never sets the deprecated lowercase
  // canUpdateJd/etc. aliases, so checking those left every non-admin's Edit/
  // Disable/Archive/Delete permanently denied regardless of their actual grant.
  const canUpdateJd = isTenantAdmin || (user?.permissions?.canUpdateJD ?? false);
  const canDeleteJd = isTenantAdmin || (user?.permissions?.canDeleteJD ?? false);
  const canArchiveJd = isTenantAdmin || (user?.permissions?.canArchiveJD ?? false);
  const canDisableJd = isTenantAdmin || (user?.permissions?.canDisableJD ?? false);
  const canExportJd = isTenantAdmin || hasPermissionCode('jd:export');
  // Search + all eleven filters, in the shared hook. The controls commit as they
  // change, so this uses `setFilter` and leaves the draft pair alone.
  const search = useListSearch({
    initialFilters: {
      status: initialStatusFilter || 'all',
      creationMethod: null as 'manual' | 'ai' | null,
      location: 'all',
      department: 'all',
      industry: 'all',
      experience: 'all',
      employmentType: 'all',
      applicants: 'all',
      salaryRange: 'all',
      datePostedFrom: '',
      datePostedTo: '',
      createdBy: 'all',
      workMode: 'all',
    },
    countFilters: (f) =>
      [
        f.status !== 'all',
        f.creationMethod !== null,
        f.location !== 'all',
        f.department !== 'all',
        f.industry !== 'all',
        f.experience !== 'all',
        f.employmentType !== 'all',
        f.applicants !== 'all',
        f.salaryRange !== 'all',
        f.datePostedFrom !== '',
        f.datePostedTo !== '',
        f.createdBy !== 'all',
        f.workMode !== 'all',
      ].filter(Boolean).length,
  });
  const searchQuery = search.appliedQuery;
  const {
    status: statusFilter,
    creationMethod: creationMethodFilter,
    location: locationFilter,
    department: departmentFilter,
    industry: industryFilter,
    experience: experienceFilter,
    employmentType: employmentTypeFilter,
    applicants: applicantsFilter,
    salaryRange: salaryRangeFilter,
    datePostedFrom: datePostedFromFilter,
    datePostedTo: datePostedToFilter,
    createdBy: createdByFilter,
    workMode: workModeFilter,
  } = search.filters;

  // Sync status filter with URL parameter changes
  useEffect(() => {
    if (initialStatusFilter) {
      search.setFilter('status', initialStatusFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatusFilter]);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  /* Version history — expand state, lineage, per-version JD records and
     applicant counts, all from the shared hook so the Apply to Job dialog opens
     the same history from the same endpoints. */
  const versionLineage = useJobVersionLineage();
  /* No lineage is fetched to answer a status pill any more. The pill reads the
     job's representative row, which the list already has, so selecting one
     costs zero requests — where it used to fire one per job on the page. The
     history is still fetched on demand by "View Versions" below. */
  const toggleVersions = versionLineage.toggle;

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAIMatchModal, setShowAIMatchModal] = useState(false);
  const [selectedJobForAIMatch, setSelectedJobForAIMatch] = useState<Job | null>(null);
  /* Closing the three-dot menu and opening the confirmation live in one
     function so they always land in the same state update/paint — the menu
     can never be caught still painted while the "Disable Job Description?"
     dialog is coming up. Every Disable Job trigger — grid card, list row and
     the expanded version rows — goes through here. */
  const requestDisableJob = (job: Job) => {
    setActiveDropdown(null);
    onDisableJob?.(job);
  };
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  // Phones scroll a card click to the jobs themselves (see the scroll effect);
  // the sticky breadcrumb's real height is the offset they land under.
  const jobsListRef = useRef<HTMLDivElement | null>(null);
  const breadcrumbRef = useRef<HTMLElement | null>(null);
  // Wraps the Actions dropdown so an outside click can close it.
  const bulkActionsRef = useRef<HTMLDivElement | null>(null);
  

  // Sort and Bulk Actions states
  const [sortBy, setSortBy] = useState<JobSortBy>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  /* Per-version ticks from the View Versions table, by version id: true =
     ticked, false = unticked. A version with no entry follows its job row's
     checkbox. */
  const [versionPicks, setVersionPicks] = useState<Map<string, boolean>>(new Map());
  const [showBulkActions, setShowBulkActions] = useState(false);
  // Dropdown for the single Select All control (current page / all pages / clear).
  const [showSelectMenu, setShowSelectMenu] = useState(false);

  // NEW: Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Quota modal state
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [listScrollRequest, setListScrollRequest] = useState(0);

  // Every module lands on its Total card with the list already open (same as
  // Resume Scoring / AI Talent Match): the tiles stay on top, the list renders
  // under them without a click. 'cards' is kept in the type only so an old
  // persisted snapshot still parses.
  const [pageView, setPageView] = useState<'cards' | 'list'>('list');
  // When URL changes to include a specific status filter, jump to list view.
  useEffect(() => {
    if (initialStatusFilter && initialStatusFilter !== 'all') setPageView('list');
  }, [initialStatusFilter]);
  // Same for the explicit "show all jobs" entry (?view=list).
  useEffect(() => {
    if (forceListView) setPageView('list');
  }, [forceListView]);

  const openListView = (statusFilterValue: string) => {
    search.setFilter('status', statusFilterValue);
    setCurrentPage(1);
    setPageView('list');
    setListScrollRequest((request) => request + 1);
  };

  const isOverviewCardActive = (filterValue: string) =>
    pageView === 'list' && statusFilter.toLowerCase() === filterValue.toLowerCase();

  useEffect(() => {
    if (listScrollRequest === 0 || pageView !== 'list') return;

    const frame = window.requestAnimationFrame(() => {
      /* Below `sm` the toolbar stacks into ~460px of search, filters, tabs and
         sort, so landing on `listSectionRef` (above the toolbar) left the jobs
         below the fold and the recruiter looking at the tab pills. Phones land
         on the list instead, clear of the sticky breadcrumb; from `sm` up the
         toolbar is short enough to keep in view, so desktop is unchanged. */
      if (window.matchMedia('(max-width: 639px)').matches && jobsListRef.current) {
        jobsListRef.current.style.scrollMarginTop = `${(breadcrumbRef.current?.offsetHeight ?? 0) + 12}px`;
        jobsListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      listSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [listScrollRequest, pageView, statusFilter]);

  // Show/hide the Experience/Education/Industry quick-links group.

  // Persist this list's view state (filters / search / sort / pagination / view
  // toggles) so returning from a job-details page restores it. Declared after the
  // useState + URL-sync effects above so restore wins over the mount-time resets.
  useListStatePersistence(
    'job-openings-list',
    {
      searchQuery, statusFilter, creationMethodFilter, locationFilter,
      departmentFilter, industryFilter, experienceFilter, employmentTypeFilter,
      applicantsFilter, salaryRangeFilter, datePostedFromFilter, datePostedToFilter, createdByFilter, workModeFilter,
      sortBy, sortOrder, currentPage, itemsPerPage, pageView,
    },
    (s) => {
      // "Show all jobs" outranks the saved snapshot: restoring a stale search,
      // status or page here is what hid a just-published JD behind the previous
      // narrowed view. Everything else (sort, density, column prefs) still restores.
      if (typeof s.searchQuery === 'string') search.setQuery(forceListView ? '' : s.searchQuery);
      // Restore the two-step view too. Without this, coming back from a
      // job-details page always remounted on 'cards' — the filters and page
      // were restored but the whole list stayed hidden behind the stat tiles,
      // which read as "the table vanished". A deep link carrying an explicit
      // status still wins: it means "show me that list".
      if (s.pageView === 'list'
        && !forceListView
        && !(initialStatusFilter && initialStatusFilter !== 'all')) {
        setPageView(s.pageView);
      }
      // One hydrate instead of eleven setters. `setFilters` also marks them
      // committed, so the More Filters highlight and Reset survive the round
      // trip without persisting a separate applied flag.
      search.setFilters({
        status: forceListView
          ? 'all'
          : typeof s.statusFilter === 'string' ? s.statusFilter : 'all',
        creationMethod:
          s.creationMethodFilter === 'manual' || s.creationMethodFilter === 'ai'
            ? s.creationMethodFilter
            : null,
        location: typeof s.locationFilter === 'string' ? s.locationFilter : 'all',
        department: typeof s.departmentFilter === 'string' ? s.departmentFilter : 'all',
        industry: typeof s.industryFilter === 'string' ? s.industryFilter : 'all',
        experience: typeof s.experienceFilter === 'string' ? s.experienceFilter : 'all',
        employmentType: typeof s.employmentTypeFilter === 'string' ? s.employmentTypeFilter : 'all',
        applicants: typeof s.applicantsFilter === 'string' ? s.applicantsFilter : 'all',
        salaryRange: typeof s.salaryRangeFilter === 'string' ? s.salaryRangeFilter : 'all',
        datePostedFrom: typeof s.datePostedFromFilter === 'string' ? s.datePostedFromFilter : '',
        datePostedTo: typeof s.datePostedToFilter === 'string' ? s.datePostedToFilter : '',
        createdBy: typeof s.createdByFilter === 'string' ? s.createdByFilter : 'all',
        workMode: typeof s.workModeFilter === 'string' ? s.workModeFilter : 'all',
      });
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy as JobSortBy);
      if (s.sortOrder === 'asc' || s.sortOrder === 'desc') setSortOrder(s.sortOrder);
      if (typeof s.currentPage === 'number') setCurrentPage(forceListView ? 1 : s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  /* ── The list: one page from the server ─────────────────────────────────
     GET /jd?view=jobs returns exactly the rows this page used to compute from
     every JD version: on "All Jobs" each job's latest version, on a status tab
     each job's latest version WITH that status; search / More Filters /
     creation method then test that chosen row (they never pick it). Sort and
     paging run server-side too. GET /jd/stats answers the cards, tab badges,
     creation-method badges and the filter dropdown options for the same
     filters, from the same server-side filter, so a card equals its tab. */
  const statusTab = (statusFilter || 'all').toLowerCase();
  const serverFilters = useMemo<JobOpeningsFilters>(() => ({
    search: searchQuery.trim() || undefined,
    creation_method: creationMethodFilter ?? undefined,
    location: locationFilter,
    department: departmentFilter,
    industry: industryFilter,
    employment_type: employmentTypeFilter,
    work_mode: workModeFilter,
    created_by_name: createdByFilter,
    experience: experienceFilter,
    applicants: applicantsFilter,
    date_from: datePostedFromFilter || undefined,
    date_to: datePostedToFilter || undefined,
  }), [searchQuery, creationMethodFilter, locationFilter, departmentFilter, industryFilter, employmentTypeFilter, workModeFilter, createdByFilter, experienceFilter, applicantsFilter, datePostedFromFilter, datePostedToFilter]);
  const hasCriteria = Object.values(serverFilters).some((v) => v !== undefined && v !== null && v !== '' && v !== 'all');
  const listQuery = useMemo(() => ({
    ...serverFilters,
    status_tab: statusTab,
    sort_by: sortBy,
    sort_order: sortOrder,
    page: currentPage,
    page_size: itemsPerPage,
  }), [serverFilters, statusTab, sortBy, sortOrder, currentPage, itemsPerPage]);

  const paged = usePagedList<JobRow, JobOpeningsStats, typeof listQuery>({
    name: 'job-openings',
    query: listQuery,
    fetchPage: async (q) => {
      const res = await jdService.listJobs(q);
      const meta = res.versions_meta ?? {};
      return {
        items: (res.items ?? []).map((jd) => ({
          ...mapJDToJob(jd),
          versionCount: meta[jd.id]?.version_count,
          tabVersionCount: meta[jd.id]?.tab_version_count,
        })),
        total: res.total ?? 0,
      };
    },
    // Each card is a tab, so the tab is not a stats filter.
    fetchStats: (f) => {
      const { status_tab: _tab, ...filters } = f as typeof f & { status_tab?: string };
      void _tab;
      return jdService.getJobStats(filters as JobOpeningsFilters);
    },
  });
  refreshListRef.current = paged.refresh;
  const serverStats = paged.stats;

  useEffect(() => {
    if (paged.error) toast.error('Failed to load job openings');
  }, [paged.error]);

  /* Statuses / deletes the host has just written show at once; the refetch
     the write triggers (any write clears the list cache) then confirms them. */
  const withOverride = <J extends Job>(job: J): J => {
    const override = versionStatusOverrides?.[job.id];
    return override ? { ...job, status: mapJDStatus(override) } : job;
  };
  const pageRows: JobRow[] = paged.items
    .filter((row) => !deletedVersionIds?.has(row.id))
    .map(withOverride);
  const totalMatching = paged.total;
  const currentJobs = pageRows;

  // Assessed / interviewed for the rows on screen only (GET /jd/candidate-counts).
  const candidateCounts = useJobCandidateCountsFor(pageRows.map((row) => row.id));

  /* Every JD row this page has seen (page rows, "select all" fetches, ticked
     versions), so a selection that spans pages can still name its jobs for
     the bulk actions and the export. */
  const knownJobsRef = useRef(new Map<string, Job>());
  pageRows.forEach((row) => knownJobsRef.current.set(row.id, row));
  const rememberJobs = (list: Job[]) => list.forEach((job) => knownJobsRef.current.set(job.id, job));
  const knownJob = (id: string): Job | undefined => {
    const job = knownJobsRef.current.get(id);
    return job ? withOverride(job) : undefined;
  };

  // Bulk action handlers
  /* The single Select All control offers these scopes through its dropdown:
     - current page: add the jobs visible on the active page (count tracks the
       Show: N per-page value);
     - all pages: every job matching the filters, across every page (fetched
       from the server with the same filters);
     - all versions: every version of every matching job, not just the row's own;
     - clear: empty the selection.
     A job row's checkbox selects that row's own version only; other versions
     are ticked in View Versions or through "Select all versions". */
  const rowVersionsOf = (row: Job): Job[] => {
    const key = lineageKey(row);
    const versions = Array.from(knownJobsRef.current.keys())
      .map(knownJob)
      .filter((version): version is Job =>
        !!version &&
        lineageKey(version) === key &&
        !deletedVersionIds?.has(version.id) &&
        (statusFilter === 'all' || matchesStatusFilter(version, statusFilter)));
    return versions.length ? versions : [row];
  };
  /* Drop per-version ticks: the rows' own versions only, or every version of
     those jobs. */
  const resetVersionPicks = (rows: Job[], wholeJob = false) => {
    const ids = wholeJob ? rows.flatMap(rowVersionsOf).map(version => version.id) : rows.map(row => row.id);
    setVersionPicks(prev => {
      const next = new Map(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  };
  const selectCurrentPage = () => {
    resetVersionPicks(currentJobs);
    setSelectedJobs(prev => {
      const next = new Set(prev);
      currentJobs.forEach(job => next.add(job.id));
      return next;
    });
  };
  const deselectCurrentPage = () => {
    resetVersionPicks(currentJobs, true);
    setSelectedJobs(prev => {
      const next = new Set(prev);
      currentJobs.forEach(job => next.delete(job.id));
      return next;
    });
  };

  /* Ids of every matching job / every version of them, once "Select all
     jobs" / "Select all versions" has fetched them for the current filters. */
  const [allMatchingIds, setAllMatchingIds] = useState<string[] | null>(null);
  const [allVersionIds, setAllVersionIds] = useState<string[] | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  /** Every job the list matches, all pages, in list order (pages of 100). */
  const fetchAllMatching = async (): Promise<Job[]> => {
    const PAGE = 100;
    const base = { ...serverFilters, status_tab: statusTab, sort_by: sortBy, sort_order: sortOrder };
    const first = await jdService.listJobs({ ...base, page: 1, page_size: PAGE });
    const pages = Math.max(1, Math.ceil((first.total ?? 0) / PAGE));
    const rest = await fetchRemainingPages(pages, (page) => jdService.listJobs({ ...base, page, page_size: PAGE }));
    return [first, ...rest].flatMap((res) => (res.items ?? []).map(mapJDToJob));
  };
  const selectAllPages = async () => {
    if (selectingAll) return;
    setSelectingAll(true);
    try {
      const rows = await fetchAllMatching();
      rememberJobs(rows);
      const ids = rows.map((row) => row.id).filter((id) => !deletedVersionIds?.has(id));
      setAllMatchingIds(ids);
      setVersionPicks(new Map());
      setSelectedJobs(new Set(ids));
    } catch {
      toast.error('Could not select all jobs. Please try again.');
    } finally {
      setSelectingAll(false);
    }
  };
  const clearSelection = () => {
    setVersionPicks(new Map());
    setSelectedJobs(new Set());
  };
  const selectAllVersions = async () => {
    if (selectingAll) return;
    setSelectingAll(true);
    try {
      const [rows, versions] = await Promise.all([
        fetchAllMatching(),
        jdService.listJobVersions({ ...serverFilters, status_tab: statusTab }),
      ]);
      const versionJobs = versions.map(mapJDToJob);
      rememberJobs(rows);
      rememberJobs(versionJobs);
      const rowIds = rows.map((row) => row.id).filter((id) => !deletedVersionIds?.has(id));
      const versionIds = versionJobs.map((version) => version.id).filter((id) => !deletedVersionIds?.has(id));
      setAllMatchingIds(rowIds);
      setAllVersionIds(versionIds);
      setVersionPicks(new Map(versionIds.map((id) => [id, true])));
      setSelectedJobs(new Set(rowIds));
    } catch {
      toast.error('Could not select all versions. Please try again.');
    } finally {
      setSelectingAll(false);
    }
  };

  const handleSelectJob = (jobId: string) => {
    const row = pageRows.find(job => job.id === jobId);
    if (row) resetVersionPicks([row]);
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  /* A selection belongs to the tab — and the filters — it was made on.
     Changing either clears it, so the "N Selected" count, the confirm popups
     and the action itself all describe the same jobs, rather than counting
     rows the list no longer shows that the action would then act on. */
  const selectionScope = `${statusFilter}|${JSON.stringify(serverFilters)}`;
  const [selectionTab, setSelectionTab] = useState(selectionScope);
  if (selectionTab !== selectionScope) {
    setSelectionTab(selectionScope);
    setSelectedJobs(new Set());
    setVersionPicks(new Map());
    setAllMatchingIds(null);
    setAllVersionIds(null);
    setShowBulkActions(false);
  }

  /* The selected jobs, and the ones each bulk action applies to — the same
     eligibility rules as each job's three-dot menu. A version is selected when
     ticked in View Versions (or by "Select all versions"); with no tick of its
     own, a row follows its checkbox. */
  const selectedVisibleJobs: Job[] = Array.from(new Set([...selectedJobs, ...versionPicks.keys()]))
    .filter(id => (versionPicks.get(id) ?? selectedJobs.has(id)) && !deletedVersionIds?.has(id))
    .map(knownJob)
    .filter((job): job is Job => !!job);
  const isPicked = (id: string) => versionPicks.get(id) ?? selectedJobs.has(id);
  const allVersionsSelected = !!allVersionIds && allVersionIds.length > 0 && allVersionIds.every(isPicked);
  /* "Select all versions (N)": exact once fetched; before that, with no
     search/filter the stats already know it (versions with the tab's status). */
  const allVersionsCount: number | null = allVersionIds
    ? allVersionIds.length
    : !hasCriteria && serverStats
      ? serverStats.versions?.[statusTab as JobOpeningsTab] ?? null
      : null;
  const checkedVersionIds = new Set(selectedVisibleJobs.map(job => job.id));
  const hasSelection = selectedJobs.size > 0 || selectedVisibleJobs.length > 0;
  const toggleVersionChecked = (versionJob: Job) => {
    if (!knownJobsRef.current.has(versionJob.id)) {
      const detail = versionLineage.versionDetails[versionJob.id];
      rememberJobs([detail?.id ? { ...mapJDToJob(detail), status: versionJob.status } : versionJob]);
    }
    setVersionPicks(prev => new Map(prev).set(versionJob.id, !checkedVersionIds.has(versionJob.id)));
  };
  const bulkDisableJobs = selectedVisibleJobs.filter(job => job.status === 'Published');
  const bulkReenableJobs = selectedVisibleJobs.filter(job => job.status === 'Disabled');
  const bulkArchiveJobs = selectedVisibleJobs.filter(job => job.status !== 'Draft' && job.status !== 'Archived');
  const bulkUnarchiveJobs = selectedVisibleJobs.filter(job => job.status === 'Archived');
  const bulkSelectionLabel = (count: number) => `${count} Job Description${count === 1 ? '' : 's'} Selected`;

  const [bulkStatusBusy, setBulkStatusBusy] = useState(false);
  const runBulkStatus = async (targets: Job[], action: BulkStatusAction) => {
    if (!onBulkStatusChange || targets.length === 0) return;
    setBulkStatusBusy(true);
    try {
      await onBulkStatusChange(targets, action);
      clearSelection();
    } finally {
      setBulkStatusBusy(false);
    }
  };

  /* Bulk disable / archive open the shared DisableJobModal / ArchiveJobModal
     (in their plural wording) — never a status change without being asked. */
  const [bulkDisableOpen, setBulkDisableOpen] = useState(false);
  const handleBulkDisable = () => {
    if (bulkDisableJobs.length === 0) return;
    setShowBulkActions(false);
    setBulkDisableOpen(true);
  };
  const confirmBulkDisable = async () => {
    await runBulkStatus(bulkDisableJobs, 'disable');
    setBulkDisableOpen(false);
  };

  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const handleBulkArchive = () => {
    if (bulkArchiveJobs.length === 0) return;
    setShowBulkActions(false);
    setBulkArchiveOpen(true);
  };
  const confirmBulkArchive = async () => {
    await runBulkStatus(bulkArchiveJobs, 'archive');
    setBulkArchiveOpen(false);
  };

  // Bulk re-enable mirrors the per-row "Re-enable JD", which has no confirm.
  const handleBulkReenable = () => {
    setShowBulkActions(false);
    void runBulkStatus(bulkReenableJobs, 'reenable');
  };

  // Bulk unarchive puts the jobs back live, so it asks first.
  const dialog = useGlobalDialog();
  const handleBulkUnarchive = async () => {
    const targets = bulkUnarchiveJobs;
    if (targets.length === 0) return;
    setShowBulkActions(false);
    const many = targets.length > 1;
    const confirmed = await dialog.confirm({
      title: many ? 'Unarchive Job Openings' : 'Unarchive Job Opening',
      message: many
        ? `Are you sure you want to unarchive these ${targets.length} job openings?\nThey will be published again.`
        : 'Are you sure you want to unarchive this job opening?\nIt will be published again.',
      variant: 'confirm',
      confirmText: 'Unarchive',
      item: many
        ? { label: 'JOB OPENINGS', name: bulkSelectionLabel(targets.length) }
        : {
            label: 'JOB OPENING',
            name: [targets[0].job_id, targets[0].title].filter(Boolean).join(' – ') || targets[0].title,
            badge: targets[0].versionNumber ? `V${targets[0].versionNumber}` : undefined,
          },
    });
    if (!confirmed) return;
    await runBulkStatus(targets, 'unarchive');
  };

  /* Bulk delete checks which selected jobs are in use BEFORE the confirm, so
     the popup can say up front which ones will be skipped (the single-job
     Delete checks first too). Then it opens its own DeleteJobModal. */
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [checkingBulkDelete, setCheckingBulkDelete] = useState(false);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Job[]>([]);
  const [bulkDeleteSkipped, setBulkDeleteSkipped] = useState(0);

  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedVisibleJobs.length === 0 || checkingBulkDelete) return;
    const selected = selectedVisibleJobs;
    let targets = selected;
    if (onCheckJobsInUse) {
      setCheckingBulkDelete(true);
      try {
        const inUse = await onCheckJobsInUse(selected);
        targets = selected.filter(job => !inUse.has(job.id));
      } finally {
        setCheckingBulkDelete(false);
      }
    }
    setShowBulkActions(false);
    const skipped = selected.length - targets.length;
    if (targets.length === 0) {
      // Nothing deletable: the same popup the row's Delete Job shows.
      if (onAllJobsInUse) {
        onAllJobsInUse(selected);
        return;
      }
      toast.error(
        skipped === 1
          ? 'This job is in use and cannot be deleted. Archive it instead.'
          : `All ${skipped} selected jobs are in use and cannot be deleted. Archive them instead.`,
      );
      return;
    }
    setBulkDeleteTargets(targets);
    setBulkDeleteSkipped(skipped);
    setBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!onBulkDelete || bulkDeleteTargets.length === 0) { setBulkDeleteOpen(false); return; }
    setBulkDeleting(true);
    try {
      await onBulkDelete(bulkDeleteTargets);
      clearSelection();
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  // Export opens the CSV / Excel picker; the file is written in runBulkExport
  const handleBulkExport = () => setShowExportModal(true);

  const runBulkExport = async (format: ExportFileFormat) => {
    const selectedJobsData = selectedVisibleJobs;
    const rows = selectedJobsData.map(job => [
      (job as any).job_id || '',
      job.title,
      job.status,
      (job as any).creation_method === 'ai_generated' ? 'AI' : (job as any).creation_method === 'manual' ? 'Manual' : '',
      (job as any).versionNumber ? `v${(job as any).versionNumber}` : '',
      (job as any).industry_type || '',
      job.department || '',
      job.employmentType || '',
      (job as any).workMode || '',
      (job as any).experience_min !== undefined ? (job as any).experience_min : '',
      (job as any).experience_max !== undefined ? (job as any).experience_max : '',
      job.experience || '',
      (job as any).salary || '',
      job.location || '',
      (job as any).experience_level || '',
      job.postedDate || '',
      (job as any).created_at ? new Date((job as any).created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      (job as any).updated_at ? new Date((job as any).updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      job.postedBy || '',
      job.applicants || 0
    ]);

    await exportRows(format, JOBS_EXPORT_HEADERS, rows, `jobs-export-${new Date().toISOString().split('T')[0]}`, { sheetName: 'Job Openings' });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (activeDropdown) {
        setActiveDropdown(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeDropdown]);

  // Close the Actions dropdown on an outside click. Scoped to the dropdown via a
  // ref and only listens while it is open; it merely closes the menu (no
  // preventDefault/stopPropagation), so the click still reaches whatever was
  // clicked — job selection, filters, pagination and other buttons keep working.
  useEffect(() => {
    if (!showBulkActions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bulkActionsRef.current && !bulkActionsRef.current.contains(e.target as Node)) {
        setShowBulkActions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBulkActions]);


  // Get unique values for filters — drop empty/blank values (so the dropdowns
  // don't show a blank option) and sort alphabetically so the lists are ordered
  // rather than appearing in random job-fetch order.
  // Filter dropdown options — every value in the tenant's JDs (all versions),
  // from GET /jd/stats, already de-blanked and sorted.
  const uniqueLocations = serverStats?.facets?.locations ?? [];
  const uniqueEmploymentTypes = serverStats?.facets?.employment_types ?? [];
  const uniqueIndustries = serverStats?.facets?.industries ?? [];
  const uniqueCreators = serverStats?.facets?.creators ?? [];
  const uniqueWorkModes = serverStats?.facets?.work_modes ?? [];

  /* Each status card IS its tab — clicking it opens that tab — so its number
     is exactly the row count that tab lists for the current search/filters
     (GET /jd/stats builds it from the same server-side filter as the list).
     The versions pill counts the versions that HAVE the card's status.
     With no search/filter these are the same numbers the page showed when it
     computed them from every JD version in the browser. */
  const statusPillCount = (pill: string): number | null =>
    serverStats ? serverStats.jobs?.[pill.toLowerCase() as JobOpeningsTab] ?? 0 : null;
  const methodPillCount = (method: 'ai' | 'manual' | null): number | null => {
    if (!serverStats) return null;
    const row = serverStats.by_method?.[statusTab as JobOpeningsTab];
    return row ? row[method ?? 'all'] ?? 0 : 0;
  };
  const pillCountBadge = (active: boolean, n: number | null) => (
    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${
      active ? 'bg-white/20 text-white' : 'bg-white text-brand-blue ring-1 ring-brand-blue/15 dark:bg-slate-800'
    }`}>
      {n == null ? '–' : n.toLocaleString()}
    </span>
  );
  const stats = {
    total: serverStats?.total ?? 0,
    published: serverStats?.published ?? 0,
    draft: serverStats?.draft ?? 0,
    archived: serverStats?.archived ?? 0,
    totalVersions: serverStats?.versions?.all ?? 0,
    publishedVersions: serverStats?.versions?.published ?? 0,
    draftVersions: serverStats?.versions?.draft ?? 0,
    archivedVersions: serverStats?.versions?.archived ?? 0,
  };

  /* The stat cards show a placeholder until the counts land — never a
   * partial tally that would then jump. */
  const statValue = (count: number) => (serverStats ? count : <StatValuePlaceholder />);
  const statVersions = (count: number) => (serverStats ? <StatVersions count={count} /> : <StatVersionsPlaceholder />);

  const activeFiltersCount = search.activeFilterCount;
  const filtersActive = search.filtersApplied;

  // Reset every filter AND the search box. Shared by the toolbar's Reset, the
  // panel's "Clear Filters", and the empty state, so all three stay in step —
  // the empty state's own version used to miss creation method, industry and
  // the applied flag, leaving the list filtered after a "clear".
  const clearAllFilters = search.reset;

  // Create New Job. Before navigating away, drop this list's saved view-state so
  // returning from the Create Job page starts clean (no stale More Filters).
  // Unlike the job-details drill-down — which intentionally restores state — a
  // fresh "Create" should not carry the previous filter selection back.
  const handleCreateNewJob = () => {
    if (onCreateNewDisabled) {
      // Locked: tooltip only (no toast).
      return;
    }
    if (quotaInfo && quotaInfo.remaining <= 0) {
      setShowQuotaModal(true);
      return;
    }
    try {
      sessionStorage.removeItem('listState:job-openings-list');
      sessionStorage.removeItem('listScroll:job-openings');
    } catch { /* ignore unavailable storage */ }
    onCreateNew();
  };

  // NEW: Pagination logic
  const totalPages = Math.ceil(totalMatching / itemsPerPage);

  /* Whether every matching job (across all pages) is selected — drives the
     Select All button's "fully checked" icon. Known for certain once "Select
     all jobs" has fetched them, or when every match is on this page. */
  const allPagesSelected = totalMatching > 0 && (
    allMatchingIds && allMatchingIds.length >= totalMatching
      ? allMatchingIds.every(id => selectedJobs.has(id))
      : totalMatching <= pageRows.length && pageRows.every(job => selectedJobs.has(job.id))
  );
  /* Same for the active page — drives the "this page" menu checkbox. */
  const currentPageSelected = currentJobs.length > 0 && currentJobs.every(job => selectedJobs.has(job.id));

  /* Which Actions-dropdown options apply to the active tab. Export and Delete
     show on every tab. Status actions follow the job status flow:
     Published → Disable / Archive; Disabled → Re-enable / Archive;
     Archived → Unarchive; Draft → none (nothing is published).
     All Jobs mixes statuses, so it offers every status action, each acting
     only on the selected jobs it applies to and showing "(N of M)". */
  const actionsTab = statusFilter.toLowerCase();
  const isAllJobsTab = actionsTab === 'all';
  const canBulkStatus = !!onBulkStatusChange;
  const showDisableAction = canBulkStatus && (isAllJobsTab || actionsTab === 'published');
  const showReenableAction = canBulkStatus && (isAllJobsTab || actionsTab === 'disabled');
  const showArchiveAction = canBulkStatus && (isAllJobsTab || actionsTab === 'published' || actionsTab === 'disabled');
  const showUnarchiveAction = canBulkStatus && (isAllJobsTab || actionsTab === 'archived');
  const hasStatusActions = showDisableAction || showReenableAction || showArchiveAction || showUnarchiveAction;

  /* One status item in the Actions dropdown. Greyed out when the user lacks
     the permission (hover tooltip explains why) or when none of the selected
     jobs can take this action. */
  const renderBulkStatusItem = ({
    label,
    icon: Icon,
    iconClass,
    eligible,
    allowed,
    deniedMessage,
    noneEligibleMessage,
    onSelect,
  }: {
    label: string;
    icon: LucideIcon;
    iconClass: string;
    eligible: number;
    allowed: boolean;
    deniedMessage: string;
    noneEligibleMessage: string;
    onSelect: () => void;
  }) => {
    const unavailable = !allowed || eligible === 0 || bulkStatusBusy;
    const countSuffix = isAllJobsTab ? ` (${eligible} of ${selectedVisibleJobs.length})` : '';
    /* Why the count is short — behind an ⓘ at the row's end, on hover.
       Nothing when every selected job takes the action. */
    const skipped = selectedVisibleJobs.length - eligible;
    const reason = !allowed
      ? null
      : eligible === 0
        ? noneEligibleMessage
        : skipped > 0
          ? `Applies to ${eligible} of ${selectedVisibleJobs.length} selected jobs. ${noneEligibleMessage}; the other ${skipped} will be skipped.`
          : null;
    return (
      <div key={label} className={`flex items-center pr-3 ${unavailable ? '' : 'hover:bg-gray-50'}`}>
        <button
          type="button"
          onClick={() => {
            if (!allowed) {
              // Locked: tooltip only (no toast).
              return;
            }
            if (eligible === 0 || bulkStatusBusy) return;
            onSelect();
          }}
          aria-disabled={unavailable}
          title={!allowed ? deniedMessage : undefined}
          className={`flex-1 min-w-0 pl-3 py-2 text-left text-sm flex items-center gap-2 ${
            unavailable ? 'text-gray-400 cursor-not-allowed opacity-60' : 'text-gray-700'
          }`}
        >
          <Icon className={`w-4 h-4 flex-shrink-0 ${unavailable ? 'text-gray-400' : iconClass}`} />
          <span className="tabular-nums">{label}{countSuffix}</span>
        </button>
        {reason && (
          <Tooltip content={reason} position="left">
            <span
              aria-label={reason}
              className="flex w-5 h-5 items-center justify-center rounded-full text-gray-400 hover:text-brand-blue cursor-help"
            >
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </Tooltip>
        )}
      </div>
    );
  };

  // Reset to page 1 when filters change. Skipped on the mount pass: the
  // restored filters and the restored page arrive together, and resetting here
  // would throw away the page the user was on before opening a job.
  const skipPageResetRef = useRef(true);
  useEffect(() => {
    if (skipPageResetRef.current) { skipPageResetRef.current = false; return; }
    setCurrentPage(1);
  }, [searchQuery, statusFilter, creationMethodFilter, locationFilter, departmentFilter, industryFilter, experienceFilter, employmentTypeFilter, applicantsFilter, datePostedFromFilter, datePostedToFilter, createdByFilter, workModeFilter, sortBy, sortOrder]);

  // Keep the current page in range when the list shrinks (e.g. after deleting the
  // jobs on the last page), so the view never gets stuck on an empty page past
  // the new last page.
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  // "Go to page" input — local text so a partial edit isn't clobbered by the
  // currentPage prop until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(currentPage));
  useEffect(() => {
    setGoToPage(String(currentPage));
  }, [currentPage]);

  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      handlePageChange(page);
    } else {
      setGoToPage(String(currentPage));
    }
  };

  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb barRef={breadcrumbRef} className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Job Descriptions' }]} />
        {/* SaaS Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Briefcase className="h-4 w-4 text-brand-blue" />
              </div>
              <div>
                <h1 className="tf-page-title mb-1">Job Openings</h1>
                <p className="tf-body-secondary">Create and manage your job postings</p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              {/* Quota limit warning */}
              {quotaInfo && quotaInfo.remaining <= 0 && (
                <div className="flex items-start gap-2 px-3 py-1.5 bg-destructive-subtle border border-destructive-line rounded-lg tf-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Job publishing limit reached ({quotaInfo.used}/{quotaInfo.limit}). <a href="/subscription/current-plan" className="underline font-medium">Upgrade your plan</a></span>
                </div>
              )}
              {(configHref || onCreateNew) && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                  {configHref && configDisabled && (
                    // Permission-locked: same Button, greyed out, tooltip only.
                    <Button
                      variant="secondary"
                      size="md"
                      aria-disabled
                      onClick={() => { /* locked: tooltip only */ }}
                      title="You do not have permission to manage job configuration"
                      className="w-full sm:w-auto opacity-50 cursor-not-allowed disabled:opacity-50"
                    >
                      <Settings className="w-4 h-4" />
                      Config
                    </Button>
                  )}
                  {configHref && !configDisabled && (
                    // Config shares Create New Job's exact size/shape by using the
                    // same Button (size md). It stays `secondary` — a neutral nav
                    // action — against Create's `primary` CTA, per the design system.
                    <Button asChild variant="secondary" size="md" className="w-full sm:w-auto">
                      <Link href={configHref}>
                        <Settings className="w-4 h-4" />
                        Config
                      </Link>
                    </Button>
                  )}
                  {onCreateNew && (
                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleCreateNewJob}
                      aria-disabled={onCreateNewDisabled}
                      title={onCreateNewDisabled ? 'You do not have permission to create job descriptions' : undefined}
                      icon={<Plus className="w-4 h-4" />}
                      className={`w-full sm:w-auto ${onCreateNewDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Create New Job
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <StatsCardGrid>
            <StatsCard tone="neutral" active={isOverviewCardActive('all')} showClickArrow icon={Briefcase} label="Total Jobs" value={statValue(stats.total)} sparkline={false} onClick={() => openListView('all')}>
              {statVersions(stats.totalVersions)}
            </StatsCard>
            <StatsCard tone="neutral" active={isOverviewCardActive('published')} showClickArrow icon={CheckCircle2} label="Published" value={statValue(stats.published)} sparkline={false} onClick={() => openListView('published')}>
              {statVersions(stats.publishedVersions)}
            </StatsCard>
            <StatsCard tone="neutral" active={isOverviewCardActive('draft')} showClickArrow icon={FileText} label="Drafts" value={statValue(stats.draft)} sparkline={false} onClick={() => openListView('draft')}>
              {statVersions(stats.draftVersions)}
            </StatsCard>
            <StatsCard tone="neutral" active={isOverviewCardActive('archived')} showClickArrow icon={Archive} label="Archived" value={statValue(stats.archived)} sparkline={false} onClick={() => openListView('archived')}>
              {statVersions(stats.archivedVersions)}
            </StatsCard>
          </StatsCardGrid>


        </div>

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Consolidated toolbar: Search + Filters + Tabs + Select all + Sort.
            Phones (globals.css, `.tf-jobs-toolbar`): search · filter icon, the
            Location / Industry / Creator pills (scrolling), the status tabs
            (underlined, scrolling), All / AI / Manual, then Select all · Sort ·
            Refresh. From sm the layout below is unchanged. */}
        <div className="tf-jobs-toolbar tf-card p-3 sm:p-4 mb-4">
          {/* Row 1: Search + More Filters — the canonical toolbar, now shared
              via <ListToolbar> so other list pages match this one. */}
          <ListToolbar
            searchValue={search.query}
            onSearchChange={search.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search jobs..."
            // Location + Industry sit inline with Search, ahead of More Filters,
            // so the three primary filters read as one row. They are the same
            // SearchableSelect controls as before — relocated out of the More
            // Filters panel, not new ones, so behaviour is unchanged.
            // `w-full sm:w-48` sets their width; height/border/background/focus
            // all come from the shared SearchableSelect chrome, so they match the
            // Search input and the date fields. They stack full-width on mobile.
            leadingActions={
              <div className="tf-jobs-filter-pills contents">
                {uniqueLocations.length > 1 && (
                  <SearchableSelect
                    className="w-full sm:w-48"
                    value={locationFilter === 'all' ? '' : locationFilter}
                    onChange={(v) => search.setFilter('location', v || 'all')}
                    options={uniqueLocations.map((loc) => ({ value: String(loc), label: String(loc) }))}
                    allLabel="All Locations"
                    placeholder="All Locations"
                    searchPlaceholder="Search location..."
                    ariaLabel="Filter by location"
                  />
                )}
                {uniqueIndustries.length > 0 && (
                  <SearchableSelect
                    className="w-full sm:w-48"
                    value={industryFilter === 'all' ? '' : industryFilter}
                    onChange={(v) => search.setFilter('industry', v || 'all')}
                    options={uniqueIndustries.map((industry) => ({ value: String(industry), label: formatIndustryType(industry) }))}
                    allLabel="All Industries"
                    placeholder="All Industries"
                    searchPlaceholder="Search industry..."
                    ariaLabel="Filter by industry"
                  />
                )}
                {uniqueCreators.length > 0 && (
                  <SearchableSelect
                    className="w-full sm:w-48"
                    value={createdByFilter === 'all' ? '' : createdByFilter}
                    onChange={(v) => search.setFilter('createdBy', v || 'all')}
                    options={uniqueCreators.map((name) => ({ value: String(name), label: String(name) }))}
                    allLabel="All Creators"
                    placeholder="All Creators"
                    searchPlaceholder="Search user..."
                    ariaLabel="Filter by created by"
                  />
                )}
              </div>
            }
            // Search flexes to fill the row; `controlsFollowSearch` gives the
            // search→control gap the same 8px as control→control, so Search,
            // Location, Industry and More Filters are evenly spaced on one line
            // and use the full available width.
            controlsFollowSearch
            compactOnMobile
            onToggleFilters={() => setShowAdvancedFilters(!showAdvancedFilters)}
            filtersOpen={showAdvancedFilters}
            activeFilterCount={activeFiltersCount}
            filtersApplied={filtersActive}
            onClearFilters={clearAllFilters}
            // Sort by sits right after More Filters, in the search row.
            afterFiltersActions={
            totalMatching > 0 ? (
              <div className="tf-jobs-sort flex items-center gap-2">
                <span className="tf-body">Sort by</span>
                {/* bg-brand-blue/5 + rounded-lg = the tab pills' resting style, so
                    the sort control belongs to the same pill system. One size at
                    every width (36px, 14px text) — the toolbar type standard. */}
                <div className="inline-flex items-center bg-brand-blue/5 rounded-lg p-1 transition-all">
                  <FilterSelect
                    value={sortBy}
                    onChange={(v) => {
                      const value = v as JobSortBy;
                      setSortBy(value);
                    }}
                    ariaLabel="Sort jobs by"
                    className="w-auto data-[size=default]:h-7 sm:data-[size=default]:h-7 py-0 sm:py-0 pl-2.5 sm:pl-2.5 pr-2 sm:pr-2 bg-transparent dark:bg-transparent border-0 shadow-none rounded-md sm:rounded-md text-gray-700"
                    options={JOB_SORT_OPTIONS}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    }}
                    className="ml-0.5 h-7 w-7 flex items-center justify-center rounded-md bg-white text-gray-700 hover:bg-brand-blue/10 hover:text-brand-blue transition-colors cursor-pointer"
                    title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                  >
                    <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${sortOrder === 'asc' ? '' : 'rotate-180'}`} />
                  </button>
                </div>
              </div>
            ) : null
            }
          />

          {/* More Filters Panel (collapsible) */}
          {showAdvancedFilters && (
            <div className="mb-3 pt-3 border-t border-brand-blue/10">
              {/* All five filters on one row on desktop (grid-cols-5), falling
                  back to a 2×2 grid on small screens and a single column on
                  phones — so the row stays clean and never overflows.
                  [&>div]:min-w-0 — grid items default to min-width:auto, so a long
                  <select> option (e.g. a full "City, State, Country" location) would
                  force its cell wider than the screen and overflow. min-w-0 lets the
                  cells (and the w-full selects inside) shrink to the grid track. */}
              <div className="tf-grid-4 [&>div]:min-w-0">
                {/* Location and Industry now live inline with Search (see the
                    toolbar's leadingActions above). Department was removed. */}
                {uniqueWorkModes.length > 0 && (
                  <div>
                    <label className="block tf-label mb-1.5">Work Mode</label>
                    <SearchableSelect
                      value={workModeFilter === 'all' ? '' : workModeFilter}
                      onChange={(v) => search.setFilter('workMode', v || 'all')}
                      options={uniqueWorkModes.map((mode) => ({ value: String(mode), label: formatEmploymentType(mode) }))}
                      allLabel="All Modes"
                      placeholder="All Modes"
                      searchPlaceholder="Search mode..."
                      ariaLabel="Filter by work mode"
                    />
                  </div>
                )}
                {uniqueEmploymentTypes.length > 0 && (
                  <div>
                    <label className="block tf-label mb-1.5">Job Type</label>
                    <SearchableSelect
                      value={employmentTypeFilter === 'all' ? '' : employmentTypeFilter}
                      onChange={(v) => search.setFilter('employmentType', v || 'all')}
                      options={uniqueEmploymentTypes.map((type) => ({ value: String(type), label: formatEmploymentType(type) }))}
                      allLabel="All Types"
                      placeholder="All Types"
                      searchPlaceholder="Search type..."
                      ariaLabel="Filter by job type"
                    />
                  </div>
                )}
                <div>
                  <label className="block tf-label mb-1.5">Experience</label>
                  <SearchableSelect
                    value={experienceFilter === 'all' ? '' : experienceFilter}
                    onChange={(v) => search.setFilter('experience', v || 'all')}
                    options={[
                      { value: 'entry', label: 'Entry Level (0-2 years)' },
                      { value: 'junior', label: 'Junior Level (2-4 years)' },
                      { value: 'mid', label: 'Mid Level (5-7 years)' },
                      { value: 'senior', label: 'Senior Level (8-10 years)' },
                      { value: 'architect', label: 'Architect Level (10+ years)' },
                      { value: 'management', label: 'Management Level (10+ years)' },
                    ]}
                    allLabel="All Levels"
                    placeholder="All Levels"
                    searchPlaceholder="Search level..."
                    ariaLabel="Filter by experience level"
                  />
                </div>
                <div>
                  <label className="block tf-label mb-1.5">Posted From</label>
                  {/* No className override — uses DateField's shared chrome, the
                      same as Search and the SearchableSelect filters. */}
                  <DateField
                    value={datePostedFromFilter}
                    onChange={(v) => search.setFilter('datePostedFrom', v)}
                    aria-label="Posted From"
                  />
                </div>
                <div>
                  <label className="block tf-label mb-1.5">Posted To</label>
                  <DateField
                    value={datePostedToFilter}
                    onChange={(v) => search.setFilter('datePostedTo', v)}
                    aria-label="Posted To"
                  />
                </div>
              </div>

            </div>
          )}

          {/* Single toolbar row: Select all + Status tabs + Creation method + Sort.
              The row itself always renders (so the status tabs stay reachable even
              when a filter yields no rows); Select all and Sort render only when
              there are jobs to act on. */}
          <div className="tf-jobs-row2 flex items-center gap-2 lg:gap-1.5 flex-wrap pt-3 border-t border-gray-200 mb-3">
            {/* Select all + Bulk Actions — sits at the head of the row, where the
                "Show:" label used to be. */}
            {totalMatching > 0 && (
              <div className="tf-jobs-select flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* One Select All button. Its dropdown carries BOTH scopes:
                    "this page (N)" — tracks the Show: N per-page value — and
                    "all jobs (N)" — the total across every page. */}
                <div className="relative">
                  <button
                    onClick={() => setShowSelectMenu((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={showSelectMenu}
                    className={`tf-jobs-selectall ${tabPill(hasSelection)} h-9`}
                    data-active={hasSelection || undefined}
                  >
                    {allPagesSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : hasSelection ? (
                      <span className="h-2 w-2 rounded-full bg-current" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>{hasSelection ? `${selectedVisibleJobs.length} Selected` : 'Select All'}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {showSelectMenu && (
                    <>
                      {/* Click-away layer so the menu closes on an outside click. */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowSelectMenu(false)} />
                      <div className="absolute top-full left-0 mt-2 w-60 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {/* Checkbox items mirroring the real selection: unchecked
                            until every job in scope is ticked; clicking a checked
                            item unticks that scope. */}
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={currentPageSelected}
                          onClick={() => {
                            if (currentPageSelected) deselectCurrentPage();
                            else selectCurrentPage();
                            setShowSelectMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                        >
                          {currentPageSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand-blue" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-500" />
                          )}
                          Select all on this page ({currentJobs.length})
                        </button>
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={allPagesSelected}
                          onClick={() => {
                            if (allPagesSelected) clearSelection();
                            else void selectAllPages();
                            setShowSelectMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                        >
                          {allPagesSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand-blue" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-500" />
                          )}
                          {selectingAll ? 'Selecting…' : `Select all jobs (${totalMatching})`}
                        </button>
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={allVersionsSelected}
                          onClick={() => {
                            if (allVersionsSelected) clearSelection();
                            else void selectAllVersions();
                            setShowSelectMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                        >
                          {allVersionsSelected ? (
                            <CheckSquare className="w-4 h-4 text-brand-blue" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-500" />
                          )}
                          {selectingAll ? 'Selecting…' : allVersionsCount != null ? `Select all versions (${allVersionsCount})` : 'Select all versions'}
                        </button>
                        <div className="border-t border-gray-200 my-1" />
                        <button
                          onClick={() => { clearSelection(); setShowSelectMenu(false); }}
                          disabled={!hasSelection}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                          Clear selection
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Actions + Clear — their own full-width row BELOW the Select All
                button (not inline beside it), matching the Resume Scoring toolbar.
                `basis-full order-last` drops this group onto its own line at the
                bottom of the wrap-row. */}
            {totalMatching > 0 && hasSelection && (
              <StickyBulkBar className="basis-full order-last flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">

                {/* Actions Dropdown — shown whenever at least one job is selected. */}
                {hasSelection && (
                  <div className="relative" ref={bulkActionsRef}>
                    <button
                      type="button"
                      onClick={() => setShowBulkActions(!showBulkActions)}
                      aria-label={`Actions for ${selectedVisibleJobs.length} selected`}
                      className={`relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 shadow-sm animate-in fade-in zoom-in-95 duration-300 ${showBulkActions ? 'bg-gray-200' : ''}`}
                    >
                      <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                      </span>
                      Actions ({selectedVisibleJobs.length})
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {showBulkActions && (
                      // Left-aligned: Actions now sits at the left of its own
                      // row, so the menu opens rightward (left-0) and width is
                      // clamped to the viewport, keeping it on-screen on every
                      // size instead of running off the left edge.
                      <div className="absolute top-full left-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {showDisableAction && renderBulkStatusItem({
                          label: 'Disable Selected',
                          icon: Ban,
                          iconClass: 'text-destructive',
                          eligible: bulkDisableJobs.length,
                          allowed: canDisableJd,
                          deniedMessage: 'You do not have permission to disable job descriptions',
                          noneEligibleMessage: 'Only Published jobs can be disabled',
                          onSelect: handleBulkDisable,
                        })}
                        {showReenableAction && renderBulkStatusItem({
                          label: 'Re-enable Selected',
                          icon: CheckCircle2,
                          iconClass: 'text-success',
                          eligible: bulkReenableJobs.length,
                          allowed: canUpdateJd,
                          deniedMessage: 'You do not have permission to update job descriptions',
                          noneEligibleMessage: 'Only Disabled jobs can be re-enabled',
                          onSelect: handleBulkReenable,
                        })}
                        {showArchiveAction && renderBulkStatusItem({
                          label: 'Archive Selected',
                          icon: Archive,
                          iconClass: 'text-gray-600',
                          eligible: bulkArchiveJobs.length,
                          allowed: canArchiveJd,
                          deniedMessage: 'You do not have permission to archive job descriptions',
                          noneEligibleMessage: 'Only Published or Disabled jobs can be archived',
                          onSelect: handleBulkArchive,
                        })}
                        {showUnarchiveAction && renderBulkStatusItem({
                          label: 'Unarchive Selected',
                          icon: RefreshCw,
                          iconClass: 'text-success',
                          eligible: bulkUnarchiveJobs.length,
                          allowed: canArchiveJd,
                          deniedMessage: 'You do not have permission to archive job descriptions',
                          noneEligibleMessage: 'Only Archived jobs can be unarchived',
                          onSelect: () => { void handleBulkUnarchive(); },
                        })}
                        {hasStatusActions && (
                          <div className="border-t border-gray-200 my-2" />
                        )}
                        <button
                          onClick={() => {
                            if (!canExportJd) {
                              // Locked: tooltip only (no toast).
                              return;
                            }
                            handleBulkExport();
                          }}
                          aria-disabled={!canExportJd}
                          title={!canExportJd ? 'You do not have permission to export job descriptions' : ''}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                            canExportJd ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed opacity-60'
                          }`}
                        >
                          <Download className={`w-4 h-4 ${canExportJd ? 'text-gray-700' : 'text-gray-400'}`} />
                          Export Selected
                        </button>
                        {onBulkDelete && (
                          <button
                            onClick={() => {
                              if (!canDeleteJd) {
                                // Locked: tooltip only (no toast).
                                return;
                              }
                              void handleBulkDelete();
                            }}
                            aria-disabled={!canDeleteJd || checkingBulkDelete}
                            title={!canDeleteJd ? 'You do not have permission to delete job descriptions' : ''}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                              canDeleteJd ? 'text-destructive hover:bg-destructive-subtle' : 'text-gray-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            {checkingBulkDelete ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            {checkingBulkDelete ? 'Checking selected jobs…' : 'Delete Selected'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Clear — a standalone button beside Actions, matching the
                    Resume Scoring selection toolbar. */}
                {hasSelection && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    title="Clear the selection"
                    className="h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 shadow-sm"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </StickyBulkBar>
            )}

            {/* Status tabs */}
            <div className="tf-jobs-status-tabs contents" role="tablist" aria-label="Job status">
            {['all', 'Published', 'Draft', 'Disabled', 'Archived'].map((status) => (
              <button
                key={status}
                role="tab"
                aria-selected={statusFilter.toLowerCase() === status.toLowerCase()}
                onClick={() => search.setFilter('status', status.toLowerCase())}
                className={`${tabPill(statusFilter.toLowerCase() === status.toLowerCase())} h-9`}
              >
                {status === 'all' ? 'All Jobs' : status}
                {pillCountBadge(statusFilter.toLowerCase() === status.toLowerCase(), statusPillCount(status))}
              </button>
            ))}
            </div>

            {/* Creation method: [ All | AI Generated | Manual ] — a single
                connected segmented toggle (shared tinted track; the active
                option lifts to a white chip). "All" clears the filter (null).
                Phones: the toggle takes the full row, each option sized to its
                label + count plus an even share of the rest (Manual is widest),
                no icons, tighter badge gap. From sm: the inline toggle as before. */}
            <div className="tf-jobs-method flex items-center gap-2 w-full sm:w-auto sm:ml-0.5 sm:border-l sm:border-gray-200 sm:pl-2">
              <div className={`${SEGMENT_TOGGLE} w-full sm:w-auto`}>
                <button
                  onClick={() => search.setFilter('creationMethod', null)}
                  className={`${segmentBtn(creationMethodFilter === null)} flex-auto sm:flex-none justify-center whitespace-nowrap !gap-1 sm:!gap-1.5 [&>span]:!ml-0 sm:[&>span]:!ml-1.5 !px-1.5 sm:!px-2.5`}
                >
                  All
                  {pillCountBadge(false, methodPillCount(null))}
                </button>
                <button
                  onClick={() => search.setFilter('creationMethod', creationMethodFilter === 'ai' ? null : 'ai')}
                  className={`${segmentBtn(creationMethodFilter === 'ai')} flex-auto sm:flex-none justify-center whitespace-nowrap !gap-1 sm:!gap-1.5 [&>span]:!ml-0 sm:[&>span]:!ml-1.5 !px-1.5 sm:!px-2.5`}
                >
                  <Sparkles className="hidden sm:block w-3.5 h-3.5" />
                  <span className="hidden sm:inline">AI Generated</span>
                  <span className="sm:hidden">AI</span>
                  {pillCountBadge(false, methodPillCount('ai'))}
                </button>
                <button
                  onClick={() => search.setFilter('creationMethod', creationMethodFilter === 'manual' ? null : 'manual')}
                  className={`${segmentBtn(creationMethodFilter === 'manual')} flex-auto sm:flex-none justify-center whitespace-nowrap !gap-1 sm:!gap-1.5 [&>span]:!ml-0 sm:[&>span]:!ml-1.5 !px-1.5 sm:!px-2.5`}
                >
                  <Edit className="hidden sm:block w-3.5 h-3.5" />
                  Manual
                  {pillCountBadge(false, methodPillCount('manual'))}
                </button>
              </div>
            </div>

            {/* Phones: one "Sort" button that opens a menu — the fields, then the order
                (worded for the field). From sm the inline Sort control above is used. */}
            {sortedJobs.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="tf-jobs-sortmenu sm:hidden inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:border-brand-blue/40 hover:text-brand-blue data-[state=open]:border-brand-blue/40 data-[state=open]:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    aria-label={`Sort: ${JOB_SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? ''}, ${sortOrderLabels(sortBy)[sortOrder]}`}
                  >
                    <ArrowUpDown className="w-4 h-4 text-brand-blue" />
                    Sort
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900">
                  <DropdownMenuLabel className="text-xs text-gray-500">Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as JobSortBy)}>
                    {JOB_SORT_OPTIONS.map((o) => (
                      <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-gray-500">Order</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sortOrder} onValueChange={(v) => setSortOrder(v as 'asc' | 'desc')}>
                    <DropdownMenuRadioItem value="desc">
                      <ArrowDown className="w-3.5 h-3.5 text-gray-500" />
                      {sortOrderLabels(sortBy).desc}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="asc">
                      <ArrowUp className="w-3.5 h-3.5 text-gray-500" />
                      {sortOrderLabels(sortBy).asc}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Refresh — right corner of the pill row, as on AI Interviews. */}
            {(
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh"
                aria-label="Refresh"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
                className="tf-jobs-refresh flex-shrink-0 !h-9 sm:ml-auto"
              >
                <span className="hidden 2xl:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Jobs Grid/List — `jobsListRef` is the phone scroll target. */}
        <div ref={jobsListRef} aria-hidden="true" />
        {paged.loading && currentJobs.length === 0 ? (
          <JobsListLoading />
        ) : currentJobs.length > 0 ? (
            // List View
            <div className="space-y-3">
              {currentJobs.map(job => {
                const versionKey = job.job_id || job.id;
                /* The cached lineage minus versions deleted since it was fetched. */
                const liveLineage = deletedVersionIds?.size
                  ? versionLineage.lineages[versionKey]?.filter((v) => !deletedVersionIds.has(v.id))
                  : versionLineage.lineages[versionKey];
                /* A Draft only opens in the JD editor, so without Edit permission
                   the card and its View icon are greyed and do nothing (RBAC:
                   tooltip only) — the user stays on this list. */
                const draftLocked = job.status.toLowerCase() === 'draft' && !canUpdateJd;
                const versionsExpanded = versionLineage.isExpanded(versionKey);
                /* Only jobs with MORE THAN ONE version get the control.
                   `versionNumber` is the row's own place in the lineage — the
                   number already on screen in the vN chip — so anything past v1
                   has earlier versions to show. The second test catches the
                   case where the list returned the siblings itself and this row
                   happens to be v1 — counting DISTINCT version numbers, not
                   rows: a republished JD arrives as several rows sharing the
                   same job_id and the same v1, and a raw row count read those
                   duplicates as "multiple versions", putting View Versions on
                   single-version jobs.

                   On a specific status tab (not "All Jobs"), the button is
                   scoped further: a job's lineage can have several versions
                   overall but only ONE of them matching the active tab (e.g.
                   v1 Published / v2 Draft, viewed on the Published tab) — the
                   card already shows that one version in full, so expanding it
                   would just repeat the same row. Counted server-side (GET /jd?view=jobs → versions_meta):
                   distinct versions in the lineage, or with the tab's status. */
                const hasVersionHistory = statusFilter === 'all'
                  ? (job.versionNumber ?? 1) > 1 || (job.versionCount ?? 1) > 1
                  : (job.tabVersionCount ?? 1) > 1;

                /* Counts for the colored badge stack beside the row actions.
                   assessed/interviewed come from the candidate-counts hook (null
                   until it loads — same visibility rule the meta row used),
                   applicants from the job itself. */
                const applicantsCount = job.applicants;
                const assessedCount = candidateCounts ? candidateCounts[job.id]?.assessed ?? 0 : null;
                const interviewedCount = candidateCounts ? candidateCounts[job.id]?.interviewed ?? 0 : null;
                const hasCountBadges = applicantsCount != null || assessedCount != null || interviewedCount != null;

                /* Edit / View / More - built once and placed in both layouts below
                   (the phone/tablet card and the desktop row), so the two can
                   never drift apart. Only one layout is visible at a time. */
                const rowActions = (
                  <div className={`order-last ml-auto flex flex-nowrap items-center gap-2 ${hasVersionHistory ? 'lg:ml-0' : ''}`}>
                    {/* Edit Button - icon only. Shown on every row except
                        Archived/Disabled ones — those are already retired,
                        so there is nothing on them to edit in place.
                        Greyed out (not hidden) once a lineage has reached
                        5 versions — that is the cap on how many versions
                        one JD can have. */}
                    {onEditJob && job.status !== 'Archived' && job.status !== 'Disabled' && (() => {
                      const atMaxVersions = (job.versionNumber ?? 1) >= 5;
                      return (
                        <Button
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (atMaxVersions) {
                              toast.error('This JD has reached the maximum of 5 versions and cannot be edited further.');
                              return;
                            }
                            if (!canUpdateJd) {
                              // Locked: tooltip only (no toast).
                              return;
                            }
                            onEditJob(job);
                          }}
                          aria-disabled={!canUpdateJd || atMaxVersions}
                          className={`!h-7 !w-7 !p-0 rounded-md ${!canUpdateJd || atMaxVersions ? 'opacity-50 cursor-not-allowed' : ''}`}
                          aria-label="Edit"
                          title={
                            atMaxVersions
                              ? 'Maximum of 5 versions reached'
                              : !canUpdateJd
                                ? 'You do not have permission to edit job descriptions'
                                : 'Edit'
                          }
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      );
                    })()}

                    {/* View Button - icon only. Shown on every row for a
                        consistent action set. */}
                    <Button
                      variant="secondary"
                      onClick={(e) => { e.stopPropagation(); if (!draftLocked) onViewJob(job); }}
                      aria-disabled={draftLocked || undefined}
                      className={`!h-7 !w-7 !p-0 rounded-md ${draftLocked ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
                      aria-label="View" title={draftLocked ? 'You do not have permission to edit draft job descriptions' : 'View'}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>

                    {/* Three-dot Menu */}
                    <div className="relative">
                      {/* Same Button (secondary, h-9 w-9) as Edit and View, so
                          all three row actions share one border, background,
                          icon color, hover state and shape. */}
                      <Button
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown === job.id ? null : job.id);
                        }}
                        className="!h-7 !w-7 !p-0 rounded-md"
                        aria-label="More actions"
                        title="More actions"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </Button>
                      {activeDropdown === job.id && (
                        <div ref={centerMenuOnPhoneRef} className="absolute right-0 top-full mt-1 w-52 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40">
                          {/* View Applicants - Hide for Draft */}
                          {job.status.toLowerCase() !== 'draft' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                (onViewApplicants || onViewJob)(job);
                                setActiveDropdown(null);
                              }}
                              className="group w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700"
                            >
                              <Users className="w-4 h-4 text-menu-icon-secondary" />
                              <span className={MENU_ITEM_SCALE_CLASS}>View Scored</span>
                            </button>
                          )}
                          {/* Quick Actions — mirror the Job Details "Quick Actions" panel */}
                          {onAIMatch && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onAIMatchDisabled) {
                                  // Permission lock: tooltip only. Plan lock keeps its toast.
                                  if (onAIMatchDisabledReason === PLAN_LOCKED_MESSAGE) toast.error(onAIMatchDisabledReason);
                                  return;
                                }
                                setActiveDropdown(null);
                                onAIMatch(job);
                              }}
                              aria-disabled={onAIMatchDisabled}
                              title={onAIMatchDisabled ? onAIMatchDisabledReason : ''}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${onAIMatchDisabled ? 'text-gray-400 cursor-not-allowed opacity-60' : 'text-gray-700'}`}
                            >
                              <Brain className={`w-4 h-4 ${onAIMatchDisabled ? 'text-gray-400' : 'text-menu-icon-ai'}`} />
                              <span className={MENU_ITEM_SCALE_CLASS}>AI Talent Match</span>
                            </button>
                          )}
                          {onScoreResumes && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onScoreResumesDisabled) {
                                  // Permission lock: tooltip only. Plan lock keeps its toast.
                                  if (onScoreResumesDisabledReason === PLAN_LOCKED_MESSAGE) toast.error(onScoreResumesDisabledReason);
                                  return;
                                }
                                onScoreResumes(job);
                                setActiveDropdown(null);
                              }}
                              aria-disabled={onScoreResumesDisabled}
                              title={onScoreResumesDisabled ? onScoreResumesDisabledReason : ''}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${onScoreResumesDisabled ? 'text-gray-400 cursor-not-allowed opacity-60' : 'text-gray-700'}`}
                            >
                              <ClipboardList className={`w-4 h-4 ${onScoreResumesDisabled ? 'text-gray-400' : 'text-menu-icon-score'}`} />
                              <span className={MENU_ITEM_SCALE_CLASS}>Score Resumes</span>
                            </button>
                          )}
                          {/* Disable Job for Published */}
                          {job.status === 'Published' && onDisableJob && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canDisableJd) {
                                  // Locked: tooltip only (no toast).
                                  return;
                                }
                                requestDisableJob(job);
                              }}
                              aria-disabled={!canDisableJd}
                              title={!canDisableJd ? 'You do not have permission to disable job descriptions' : undefined}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${canDisableJd ? 'text-orange-700' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                            >
                              <Ban className="w-4 h-4" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Disable Job</span>
                            </button>
                          )}
                          {/* Re-enable JD for Disabled */}
                          {job.status === 'Disabled' && onRepublishJob && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canUpdateJd) {
                                  // Locked: tooltip only (no toast).
                                  return;
                                }
                                onRepublishJob(job);
                                setActiveDropdown(null);
                              }}
                              aria-disabled={!canUpdateJd}
                              title={!canUpdateJd ? 'You do not have permission to update job descriptions' : undefined}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${canUpdateJd ? 'text-success' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Re-enable JD</span>
                            </button>
                          )}
                          {/* Archive Job — not offered on a Draft: there is
                              nothing published to retire, Delete already
                              covers removing a draft outright. */}
                          {job.status !== 'Archived' && job.status !== 'Draft' && onArchiveJob && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canArchiveJd) {
                                  // Locked: tooltip only (no toast).
                                  return;
                                }
                                onArchiveJob(job);
                                setActiveDropdown(null);
                              }}
                              aria-disabled={!canArchiveJd}
                              title={!canArchiveJd ? 'You do not have permission to archive job descriptions' : undefined}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${canArchiveJd ? 'text-gray-700' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                            >
                              <Archive className={`w-4 h-4 ${canArchiveJd ? 'text-menu-icon-archive' : 'text-gray-400'}`} />
                              <span className={MENU_ITEM_SCALE_CLASS}>Archive Job</span>
                            </button>
                          )}
                          {/* Unarchive Job */}
                          {job.status === 'Archived' && onUnarchiveJob && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canArchiveJd) {
                                  // Locked: tooltip only (no toast).
                                  return;
                                }
                                onUnarchiveJob(job);
                                setActiveDropdown(null);
                              }}
                              aria-disabled={!canArchiveJd}
                              title={!canArchiveJd ? 'You do not have permission to archive job descriptions' : undefined}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${canArchiveJd ? 'text-success' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                            >
                              <RefreshCw className="w-4 h-4" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Unarchive Job</span>
                            </button>
                          )}
                          {/* Delete Job */}
                          {onDeleteJob && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canDeleteJd) {
                                  // Locked: tooltip only (no toast).
                                  return;
                                }
                                onDeleteJob(job);
                                setActiveDropdown(null);
                              }}
                              aria-disabled={!canDeleteJd}
                              title={!canDeleteJd ? 'You do not have permission to delete job descriptions' : undefined}
                              className={`group w-full flex items-center gap-2 px-3 py-2 text-sm ${canDeleteJd ? 'text-destructive' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Delete Job</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );

                return (
                  <div
                    key={job.id}
                    aria-disabled={draftLocked || undefined}
                    title={draftLocked ? 'You do not have permission to edit draft job descriptions' : undefined}
                    className={`relative bg-white rounded-xl border transition-[transform,box-shadow,border-color] duration-150 ${draftLocked ? 'cursor-not-allowed' : 'cursor-pointer'} p-3 xs:p-4 ${activeDropdown === job.id ? 'z-30' : 'z-0'} ${selectedJobs.has(job.id) ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30' : 'border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'}`}
                    onClick={() => {
                      if (draftLocked) return;
                      if (job.status.toLowerCase() === 'draft' && onEditJob) onEditJob(job);
                      else onViewJob(job);
                    }}
                  >
                    {/* flex-wrap: checkbox + job info (+ the counts column from
                        md) share the first row, so the checkbox sits on the Job
                        ID / Job Name line; the footer wraps under at full width. */}
                    {/* ── Phones and tablets (below lg): the JD card ─────────────────────
                        Dense flow, no column gaps:
                        1. checkbox · JD ID · source · status
                        2. job name (one line, "…") · version · Edit / View / ⋮ on the right
                        3. experience · industry · type · work mode (flowing)
                        4. Created | Posted / By | Last Updated — two aligned columns
                        5. divider, then Scored / Assessed / Interviewed — three tiles */}
                    <div className="lg:hidden">
                      <div className="tf-jd-card-top">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                          title={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                          aria-label={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                          className="flex-shrink-0"
                        >
                          {selectedJobs.has(job.id)
                            ? <CheckSquare className="w-5 h-5 text-brand-blue" />
                            : <Square className="w-5 h-5 text-gray-400 hover:text-brand-blue" />}
                        </button>
                        {job.job_id && <JobIdBadge className={JOB_ID_BADGE_FIT} title={job.job_id}>{job.job_id}</JobIdBadge>}
                        {(() => {
                          const method = getCreationMethodConfig(job.creation_method);
                          const shown = getDisplayStatus(job.status, job.currentVersion);
                          const tone = getStatusConfig(shown);
                          return (
                            <>
                              <span className={`tf-jd-card-pill ${method.bg} ${method.text}`}>
                                <span className={`tf-jd-card-dot ${method.dot}`} />
                                {method.label}
                              </span>
                              <span className={`tf-jd-card-pill ${tone.bg} ${tone.text}`}>
                                <span className={`tf-jd-card-dot ${tone.dot}`} />
                                {shown}
                              </span>
                            </>
                          );
                        })()}
                      </div>

                      <div className="tf-jd-card-head">
                        <div className="tf-jd-card-name">
                          <h3 className="tf-jd-card-title" title={job.title}>{job.title}</h3>
                          {job.versionNumber && job.versionNumber >= 1 ? (
                            hasVersionHistory ? (
                              /* Version dropdown: opens / closes this job's version history. */
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleVersions(versionKey, job.id); }}
                                aria-expanded={versionsExpanded}
                                title={versionsExpanded ? 'Hide version history' : 'View version history'}
                                className={`tf-jd-card-version tf-jd-card-version-btn ${versionsExpanded ? 'tf-jd-card-version-open' : ''}`}
                              >
                                <span className="tf-jd-card-dot bg-gray-400" />
                                v{job.versionNumber}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionsExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            ) : (
                              <span className="tf-jd-card-version">
                                <span className="tf-jd-card-dot bg-gray-400" />
                                v{job.versionNumber}
                              </span>
                            )
                          ) : null}
                        </div>
                        <div className="tf-jd-card-actions">{rowActions}</div>
                      </div>

                      <div className="tf-jd-card-meta">
                        <div className="tf-jd-card-info">
                          <JobOpeningPrimaryItems job={job} hideEmpty breakBeforeType />
                        </div>
                        <JobOpeningDatesGrid job={job} />
                      </div>

                      {hasCountBadges && (
                        <div className="tf-jd-card-counts">
                          {applicantsCount != null && (
                            <span className="tf-count-tile bg-info-subtle text-info-strong">
                              <Users className="tf-count-tile-icon" />
                              <span className="tf-count-tile-num">{applicantsCount}</span>
                              <span>Scored</span>
                            </span>
                          )}
                          {assessedCount != null && (
                            <span className="tf-count-tile bg-success-subtle text-success-strong">
                              <ClipboardCheck className="tf-count-tile-icon" />
                              <span className="tf-count-tile-num">{assessedCount}</span>
                              <span>Assessed</span>
                            </span>
                          )}
                          {interviewedCount != null && (
                            <span className="tf-count-tile bg-warning-subtle text-warning-strong">
                              <Video className="tf-count-tile-icon" />
                              <span className="tf-count-tile-num">{interviewedCount}</span>
                              <span>Interviewed</span>
                            </span>
                          )}
                        </div>
                      )}

                    </div>

                    {/* ── Laptop / desktop (lg and up): the row layout, unchanged ── */}
                    <div className="hidden lg:flex flex-wrap items-start gap-3 md:gap-x-4">
                      {/* Individual Select — just the checkbox (the Briefcase
                          job icon that used to sit beside it was removed).
                          h-5 / sm:h-6 give the checkbox the title row's own
                          line-box (text-sm 20px, text-base 24px from sm), so it
                          centers on the same line as the JD-ID / Role / Versions
                          badges instead of sitting a few px higher. */}
                      <div className="flex items-center flex-shrink-0 h-5 sm:h-6">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                          title={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                        >
                          {selectedJobs.has(job.id)
                            ? <CheckSquare className="w-4 h-4 text-brand-blue" />
                            : <Square className="w-4 h-4 text-gray-400 hover:text-brand-blue" />
                          }
                        </button>
                      </div>

                      {/* Job Info — the shared job-opening summary, so the
                          Apply to Job dialog's list renders the identical set
                          of fields from the identical helpers. */}
                      <div className="flex-1 min-w-0">
                        <JobOpeningSummary
                          job={candidateCounts
                            ? { ...job, assessed: candidateCounts[job.id]?.assessed ?? 0, interviewed: candidateCounts[job.id]?.interviewed ?? 0 }
                            : job}
                          // Job Openings cards: Posted / By / Last Updated as plain
                          // text (no icons), and Salary / Location only when present.
                          showMetaIcons={false}
                          hideEmptyFields
                          // The Applicants / Assessed / Interviewed counts are drawn
                          // as a colored stack beside the row actions instead.
                          showCountBadges={false}
                        />
                      </div>

                    {/* Applicants / Assessed / Interviewed — one below another,
                        equal width (items-stretch), colored with the shared
                        semantic tokens: info (applicants), success (assessed),
                        warning (interviewed). text-xs matches the app's other
                        chips/badges; capitalized labels. From md: the card's
                        right-hand column. Below md: one nowrap line across the
                        card, under the job info, in the micro tier
                        (text-2xs, 14px icons, tighter padding); under 360px
                        the icons drop so all three still fit a 320px phone —
                        the label and colour still name each count. */}
                    {hasCountBadges && (
                      <div className="flex basis-full md:basis-auto flex-nowrap gap-1 md:flex-col md:items-stretch md:gap-1.5 flex-shrink-0">
                        {applicantsCount != null && (
                          <span className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 rounded-md text-xs whitespace-nowrap bg-info-subtle text-info-strong">
                            <Users className="max-2xs:hidden w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                            {applicantsCount} Scored
                          </span>
                        )}
                        {assessedCount != null && (
                          <span className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 rounded-md text-xs whitespace-nowrap bg-success-subtle text-success-strong">
                            <ClipboardCheck className="max-2xs:hidden w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                            {assessedCount} Assessed
                          </span>
                        )}
                        {interviewedCount != null && (
                          <span className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 rounded-md text-xs whitespace-nowrap bg-warning-subtle text-warning-strong">
                            <Video className="max-2xs:hidden w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                            {interviewedCount} Interviewed
                          </span>
                        )}
                      </div>
                    )}

                      {/* Footer — one row along the card's bottom edge at every
                          width: View Versions bottom-left, Edit / View / ⋮
                          bottom-right (ml-auto, so they stay right when a job
                          has no View Versions). basis-full puts it on its own
                          line of the wrapping card row. All four controls are
                          28px (h-7 / rounded-md / 1px border, 14px glyphs) so
                          they read as one straight line. */}
                      <div className="flex basis-full items-center gap-2">
                      <div className="contents">
                      {/* From lg (laptop / desktop) View Versions moves beside
                          Edit and takes over the ml-auto that pushes the pair
                          right; below lg the footer is unchanged. */}
                      {rowActions}
                      </div>
                        {/* View Versions — first in the footer, i.e. the card's
                            bottom-left corner, level with the icons. Shown
                            only for jobs that have earlier versions: on a v1
                            job it would open onto a single entry repeating the
                            row above it. The label flips so the control says
                            what the next click does. Closed it's a solid
                            brand-blue button with white text (same idiom as
                            the Select All active state); open it flips to the
                            brand-sky tint (plus the table shell's ring and
                            shadow) matching the version table's header, so the
                            active button and the panel it opened read as one
                            unit. stopPropagation because the card behind it
                            opens the job. */}
                        {hasVersionHistory && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleVersions(versionKey, job.id);
                            }}
                            aria-expanded={versionsExpanded}
                            className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-all duration-200 lg:order-[9998] lg:ml-auto ${
                              versionsExpanded
                                ? 'bg-brand-sky text-brand-blue border-brand-blue/30 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 dark:bg-slate-800 dark:text-slate-100 dark:border-brand-blue/50 dark:ring-brand-blue/30 dark:shadow-black/20 dark:hover:bg-slate-700'
                                : 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2 dark:bg-brand-blue dark:text-white dark:border-brand-blue dark:hover:bg-brand-blue-2'
                            }`}
                            title={versionsExpanded ? 'Hide version history' : 'View version history'}
                          >
                            {versionsExpanded ? 'Hide Versions' : 'View Versions'}
                            {/* Chevron after the label; flips while the history
                                is open so the button reads as a collapser. */}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${versionsExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Version history, expanded in place ───────────────
                        Same card, below the latest version, so the list never
                        gains a second entry for the same job.

                        The panel itself is shared with the Apply to Job dialog
                        — same columns, same lineage endpoints. Only the Action
                        cell differs, and it is passed in: the ⋮ menu below runs
                        this page's own handlers against a Job pointed at the
                        version's id.

                        Click is stopped here — the card itself opens the job,
                        and a click meant for a version must not be read as a
                        click on the row behind it. */}
                    {versionsExpanded && hasVersionHistory && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <JobVersionHistoryPanel
                          job={job}
                          versions={
                            statusFilter === 'all'
                              ? liveLineage
                              : liveLineage?.filter(
                                  /* The cached lineage can be older than the status tab
                                     being viewed — e.g. this version was archived just now,
                                     but the lineage fetched before that still says
                                     "published". Resolve `versionStatusOverrides` first (the
                                     same per-version-id override JobVersionHistoryPanel's own
                                     rows read via `statusOverrides`) so a version just moved
                                     into this tab doesn't get filtered OUT of it on stale
                                     data — the exact gap that showed "No versions recorded for
                                     this job." right after archiving/disabling/republishing. */
                                  (v) => (versionStatusOverrides?.[v.id] || v.status || '').toLowerCase() === statusFilter.toLowerCase()
                                )
                          }
                          loading={versionLineage.isLoading(versionKey)}
                          versionDetails={versionLineage.versionDetails}
                          versionApplicants={versionLineage.versionApplicants}
                          statusOverrides={versionStatusOverrides}
                          checkedVersionIds={checkedVersionIds}
                          onToggleVersionChecked={toggleVersionChecked}
                          onRowClick={(versionId) => {
                            // A Draft version opens in the JD editor — blocked without Edit permission.
                            const clicked = versionLineage.lineages[versionKey]?.find((v) => v.id === versionId);
                            const clickedStatus = (versionStatusOverrides?.[versionId] || clicked?.status || '').toLowerCase();
                            if (clickedStatus === 'draft' && !canUpdateJd) return;
                            router.push(`/recruitment/job-details?id=${versionId}`);
                          }}
                          renderAction={(versionJob) => (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                                  title="More actions"
                                  aria-label="More actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              {/* Same action options, gates and handlers as the
                                  latest-version row's ⋮ menu, except View
                                  Details lives on the Job Role link in the
                                  table. versionJob keeps every remaining action
                                  scoped to this version's own id. */}
                              <DropdownMenuContent align="end" className="w-52">
                                {/* View Applicants - Hide for Draft */}
                                {versionJob.status.toLowerCase() !== 'draft' && (
                                  <DropdownMenuItem onSelect={() => (onViewApplicants || onViewJob)(versionJob)} className={viewVersionsMenuItemClass}>
                                    <Users className="w-4 h-4 text-menu-icon-secondary" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>View Scored</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Quick Actions — same gates as the latest-version menu */}
                                {onAIMatch && !['draft', 'disabled', 'archived'].includes(versionJob.status.toLowerCase()) && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (onAIMatchDisabled) {
                                        e.preventDefault();
                                        // Permission lock: tooltip only. Plan lock keeps its toast.
                                        if (onAIMatchDisabledReason === PLAN_LOCKED_MESSAGE) toast.error(onAIMatchDisabledReason);
                                        return;
                                      }
                                      onAIMatch(versionJob);
                                    }}
                                    aria-disabled={onAIMatchDisabled}
                                    title={onAIMatchDisabled ? onAIMatchDisabledReason : undefined}
                                    className={onAIMatchDisabled ? `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed` : viewVersionsMenuItemClass}
                                  >
                                    <Brain className="w-4 h-4 text-menu-icon-ai" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>AI Talent Match</span>
                                  </DropdownMenuItem>
                                )}
                                {onScoreResumes && !['draft', 'disabled', 'archived'].includes(versionJob.status.toLowerCase()) && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (onScoreResumesDisabled) {
                                        e.preventDefault();
                                        // Permission lock: tooltip only. Plan lock keeps its toast.
                                        if (onScoreResumesDisabledReason === PLAN_LOCKED_MESSAGE) toast.error(onScoreResumesDisabledReason);
                                        return;
                                      }
                                      onScoreResumes(versionJob);
                                    }}
                                    aria-disabled={onScoreResumesDisabled}
                                    title={onScoreResumesDisabled ? onScoreResumesDisabledReason : undefined}
                                    className={onScoreResumesDisabled ? `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed` : viewVersionsMenuItemClass}
                                  >
                                    <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Score Resumes</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Disable Job for Published */}
                                {versionJob.status === 'Published' && onDisableJob && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (!canDisableJd) {
                                        e.preventDefault();
                                        // Locked: tooltip only (no toast).
                                        return;
                                      }
                                      requestDisableJob(versionJob);
                                    }}
                                    aria-disabled={!canDisableJd}
                                    title={!canDisableJd ? 'You do not have permission to disable job descriptions' : undefined}
                                    className={canDisableJd ? viewVersionsMenuItemOrangeClass : `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed`}
                                  >
                                    <Ban className="w-4 h-4" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Disable Job</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Re-enable JD for Disabled */}
                                {versionJob.status === 'Disabled' && onRepublishJob && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (!canUpdateJd) {
                                        e.preventDefault();
                                        // Locked: tooltip only (no toast).
                                        return;
                                      }
                                      onRepublishJob(versionJob);
                                    }}
                                    aria-disabled={!canUpdateJd}
                                    title={!canUpdateJd ? 'You do not have permission to update job descriptions' : undefined}
                                    className={canUpdateJd ? viewVersionsMenuItemGreenClass : `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed`}
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Re-enable JD</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Archive Job — not offered on a Draft version, same
                                    reasoning as the main card menu above. */}
                                {versionJob.status !== 'Archived' && versionJob.status !== 'Draft' && onArchiveJob && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (!canArchiveJd) {
                                        e.preventDefault();
                                        // Locked: tooltip only (no toast).
                                        return;
                                      }
                                      onArchiveJob(versionJob);
                                    }}
                                    aria-disabled={!canArchiveJd}
                                    title={!canArchiveJd ? 'You do not have permission to archive job descriptions' : undefined}
                                    className={canArchiveJd ? viewVersionsMenuItemClass : `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed`}
                                  >
                                    <Archive className="w-4 h-4 text-menu-icon-archive" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Archive Job</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Unarchive Job */}
                                {versionJob.status === 'Archived' && onUnarchiveJob && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (!canArchiveJd) {
                                        e.preventDefault();
                                        // Locked: tooltip only (no toast).
                                        return;
                                      }
                                      onUnarchiveJob(versionJob);
                                    }}
                                    aria-disabled={!canArchiveJd}
                                    title={!canArchiveJd ? 'You do not have permission to archive job descriptions' : undefined}
                                    className={canArchiveJd ? viewVersionsMenuItemGreenClass : `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed`}
                                  >
                                    <RefreshCw className="w-4 h-4" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Unarchive Job</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Delete Job */}
                                {onDeleteJob && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (!canDeleteJd) {
                                        e.preventDefault();
                                        // Locked: tooltip only (no toast).
                                        return;
                                      }
                                      onDeleteJob(versionJob);
                                    }}
                                    aria-disabled={!canDeleteJd}
                                    title={!canDeleteJd ? 'You do not have permission to delete job descriptions' : undefined}
                                    className={canDeleteJd ? viewVersionsMenuItemRedClass : `${viewVersionsMenuItemClass} opacity-50 cursor-not-allowed`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Delete Job</span>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        ) : (
          // Empty State
          <div className="tf-card-soft p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                {searchQuery || activeFiltersCount > 0 ? (
                  <Search className="w-5 h-5 text-brand-blue" />
                ) : (
                  <Briefcase className="w-5 h-5 text-brand-blue" />
                )}
              </div>
              <h3 className="tf-section-title sm:text-lg mb-2 tracking-tight">
                {searchQuery || activeFiltersCount > 0 ? 'No jobs found' : 'No jobs yet'}
              </h3>
              <p className="tf-body-secondary mb-4 leading-relaxed">
                {searchQuery || activeFiltersCount > 0
                  ? 'Try changing your search or filters'
                  : 'Create your first job opening to get started'
                }
              </p>
              {searchQuery || activeFiltersCount > 0 ? (
                <Button variant="secondary" size="md" onClick={clearAllFilters} icon={<XCircle className="w-4 h-4" />}>
                  Clear Filters
                </Button>
              ) : (
                <Button variant="primary" size="md" onClick={handleCreateNewJob} icon={<Plus className="w-4 h-4" />}>
                  Create Job
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Pagination Controls */}
        {totalMatching > 5 && (
          <div className="tf-card p-3 sm:p-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              {/* Left: Items per page selector and showing info */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="tf-body-secondary">Show:</span>
                  <FilterSelect
                    value={String(itemsPerPage)}
                    onChange={(v) => handleItemsPerPageChange(Number(v))}
                    ariaLabel="Items per page"
                    className="w-auto px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
                    options={[5, 10, 20, 40, 100].map((n) => ({ value: String(n), label: String(n) }))}
                  />
                  <span className="tf-body-secondary">per page</span>
                </div>

                <div className="hidden sm:block h-6 w-px bg-gray-300" />

                <span className="tf-body-secondary">
                  Showing <span className="font-medium text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * itemsPerPage, totalMatching)}</span> of <span className="font-medium text-gray-900">{totalMatching}</span> jobs
                </span>
              </div>

              {/* Right: Page navigation */}
              <div className="flex items-center justify-center sm:justify-end gap-2 sm:gap-3">
                {/* Go to page */}
                <div className="flex items-center gap-1.5">
                  <span className="tf-body-secondary whitespace-nowrap">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={goToPage}
                    onChange={(e) => setGoToPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                        commitGoToPage();
                      }
                    }}
                    onBlur={commitGoToPage}
                    aria-label="Go to page"
                    className="tf-input w-14 h-8 sm:h-9 px-2 text-center"
                  />
                </div>

                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="tf-btn tf-btn-secondary w-8 h-8 sm:w-9 sm:h-9 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                {/* Current / total */}
                <span className="tf-label px-1 whitespace-nowrap">
                  <span className="text-brand-blue font-semibold">{currentPage}</span> / {totalPages}
                </span>

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="tf-btn tf-btn-secondary w-8 h-8 sm:w-9 sm:h-9 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
      </div>

      {/* Counts are the jobs each action will actually change. */}
      <ArchiveJobModal
        isOpen={bulkArchiveOpen}
        count={bulkArchiveJobs.length}
        jobLabel={bulkSelectionLabel(bulkArchiveJobs.length)}
        onConfirm={() => { void confirmBulkArchive(); }}
        onCancel={() => setBulkArchiveOpen(false)}
        isLoading={bulkStatusBusy}
      />

      <DisableJobModal
        isOpen={bulkDisableOpen}
        jobLabel={bulkSelectionLabel(bulkDisableJobs.length)}
        onConfirm={() => { void confirmBulkDisable(); }}
        onCancel={() => setBulkDisableOpen(false)}
        isLoading={bulkStatusBusy}
      />

      <DeleteJobModal
        isOpen={bulkDeleteOpen}
        count={bulkDeleteTargets.length}
        jobLabel={bulkSelectionLabel(bulkDeleteTargets.length)}
        note={bulkDeleteSkipped > 0
          ? `${bulkDeleteSkipped} of ${bulkDeleteTargets.length + bulkDeleteSkipped} selected jobs ${bulkDeleteSkipped === 1 ? 'is' : 'are'} in use and will be skipped. Archive ${bulkDeleteSkipped === 1 ? 'it' : 'them'} instead.`
          : undefined}
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
        isLoading={bulkDeleting}
      />

      {/* AI Match Modal */}
      {showAIMatchModal && selectedJobForAIMatch && (
        <AITalentMatchProgressPanel
          // jobId is required and feeds aiMatchService.run(jobId, ...); it was never
          // passed, so the match ran with undefined.
          jobId={selectedJobForAIMatch.id}
          jobTitle={selectedJobForAIMatch.title}
          onComplete={(results) => {
            console.log('AI Match completed with results:', results);
            setShowAIMatchModal(false);
            setSelectedJobForAIMatch(null);
          }}
        />
      )}

      {/* Quota Exceeded Modal */}
      {showQuotaModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] max-w-[95vw] sm:max-w-md w-full shadow-2xl shadow-brand-blue/10 max-h-[calc(100dvh-2rem)] flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="tf-section-title sm:text-lg tracking-tight">Insufficient Units</h3>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1">
              <div className="text-center">
                <div className="w-12 h-12 bg-destructive-subtle ring-1 ring-destructive-line rounded-full flex items-center justify-center mx-auto mb-3">
                  <Briefcase className="w-5 h-5 text-destructive" />
                </div>
                <p className="tf-body-secondary">
                  You've used {quotaInfo?.used}/{quotaInfo?.limit} job slots. Upgrade your plan to create more jobs.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row gap-2 justify-center shrink-0">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setShowQuotaModal(false);
                  window.location.href = '/subscription/current-plan';
                }}
              >
                Upgrade Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      <ExportFormatModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Job Openings"
        recordCount={selectedVisibleJobs.length}
        selected
        columns={JOBS_EXPORT_HEADERS}
        onExport={runBulkExport}
      />
    </main>
  );
}
