'use client'

import { Plus, Search, MapPin, Eye, MoreVertical, Briefcase, Users, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, Settings, Archive, XCircle, AlertCircle, ArrowUpRight, Edit, Ban, RefreshCw, ArrowUpDown, CheckSquare, Square, Trash2, Download, ChevronLeft, ChevronRight, X, Brain, ClipboardList, ClipboardCheck, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Job } from '@/lib/types/types';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import ArchiveJobModal from '@/components/ArchiveJobModal';
import DisableJobModal from '@/components/DisableJobModal';
import DeleteJobModal from '@/components/DeleteJobModal';
import {
  formatEmploymentType,
  formatIndustryType,
  matchesStatusFilter,
  collapseToLatestVersions,
  groupByLineage,
  sortJobs,
  type JobSortBy,
} from '@/lib/utils/jobOpeningDisplay';
import { Button } from '@/components/ui/button';
import JobOpeningSummary from '@/components/jobs/JobOpeningSummary';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { useJobCandidateCounts } from '@/lib/hooks/useJobCandidateCounts';
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
/* Radix menu rather than the hand-rolled absolute dropdown the job rows use:
   the version table sits inside an overflow-x-auto shell, which would clip an
   absolutely positioned menu — Radix portals it out of the scroll container. */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  'Applicants'
];

interface JobsListingProps {
  jobs: Job[];
  /** Tenant-wide Total/Published/Draft/Archived, precomputed server-side so the
   *  stat cards can show the right number immediately instead of the wrong
   *  page-1-only tally `jobs` briefly holds while the rest of it loads. Used
   *  only until `jobsFullyLoaded` — see that prop. `null`/absent falls back to
   *  computing straight from `jobs`, the previous (flicker-prone) behaviour. */
  statusCounts?: { total?: number; published?: number; draft?: number; archived?: number } | null;
  /** Whether `jobs` itself holds every page yet. Once true, the stat cards
   *  switch from `statusCounts` to their own live tally over `jobs` — by then
   *  the two agree, so the switch is invisible, and it's what keeps the cards
   *  updating instantly after a publish/archive/delete action (those mutate
   *  `jobs` directly, not `statusCounts`). Defaults to true, so a host that
   *  doesn't pass it just gets the live tally, as before. */
  jobsFullyLoaded?: boolean;
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
  onPublishJob?: (job: Job) => void;
  onDisableJob?: (job: Job) => void;
  onRepublishJob?: (job: Job) => void;
  onArchiveJob?: (job: Job) => void;
  onUnarchiveJob?: (job: Job) => void;
  onDeleteJob?: (job: Job) => void;
  // Bulk delete: given the selected jobs, actually delete them (single confirm is
  // handled here in JobsListing before this is called).
  onBulkDelete?: (jobs: Job[]) => void | Promise<void>;
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
  // e.g. "View All Jobs" after publishing a JD, where stopping on the tiles (or on
  // a persisted narrowed view) hides the job the recruiter just created.
  // Unlike a status deep-link this also clears the restored search/status/page, so
  // "all jobs" really means all of them.
  forceListView?: boolean;
  /* Where the Config button goes. Undefined hides it — that is the permission
     gate, same as the master-data links it replaced. It used to open an inline
     panel of three links out to three near-identical pages; those three are now
     sections of one Configuration page, so this is a plain link. */
  configHref?: string;
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
  <span className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
    {count} {count === 1 ? 'version' : 'versions'}
  </span>
);

export default function JobsListing({ jobs, statusCounts = null, jobsFullyLoaded = true, onCreateNew, onCreateNewDisabled = false, onViewJob, onViewApplicants, onAIMatch, onAIMatchDisabled = false, onAIMatchDisabledReason = 'You do not have permission to run AI Talent Match', onScoreResumes, onScoreResumesDisabled = false, onScoreResumesDisabledReason = 'You do not have permission to run resume scoring', onUpdateJobStatus, onEditJob, versionStatusOverrides, onDisableJob, onRepublishJob, onArchiveJob, onUnarchiveJob, onDeleteJob, onBulkDelete, quotaInfo, initialStatusFilter, forceListView, configHref }: JobsListingProps) {
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
  // "N assessed" / "N interviewed" on each card — tallied client-side, since
  // the JD list endpoint carries neither count.
  const candidateCounts = useJobCandidateCounts();
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
  // Wraps the Actions dropdown so an outside click can close it.
  const bulkActionsRef = useRef<HTMLDivElement | null>(null);
  

  // Sort and Bulk Actions states
  const [sortBy, setSortBy] = useState<JobSortBy>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  // Dropdown for the single Select All control (current page / all pages / clear).
  const [showSelectMenu, setShowSelectMenu] = useState(false);

  // NEW: Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Quota modal state
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [listScrollRequest, setListScrollRequest] = useState(0);

  // Two-step view: 'cards' shows only the 4 stat tiles; 'list' shows the
  // toolbar + filters + jobs list. Initial render is 'cards' unless the URL
  // already carried a specific status (deep-link from a notification, etc.).
  // We deliberately ignore the default 'all' so a fresh visit lands on cards.
  // `forceListView` also opens on the list: it means "show me every job", which the
  // tiles can't do — and it survives the 'all' exclusion above, unlike a status filter.
  const [pageView, setPageView] = useState<'cards' | 'list'>(
    forceListView || (initialStatusFilter && initialStatusFilter !== 'all') ? 'list' : 'cards',
  );
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
      applicantsFilter, salaryRangeFilter, datePostedFromFilter, datePostedToFilter,
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
      if ((s.pageView === 'cards' || s.pageView === 'list')
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
      });
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy as JobSortBy);
      if (s.sortOrder === 'asc' || s.sortOrder === 'desc') setSortOrder(s.sortOrder);
      if (typeof s.currentPage === 'number') setCurrentPage(forceListView ? 1 : s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  const matchesCriteria = (job: Job) => {
    // Enhanced search - search across multiple fields
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' || (
      job.title.toLowerCase().includes(searchLower) ||
      job.job_id?.toLowerCase().includes(searchLower) ||
      job.location?.toLowerCase().includes(searchLower) ||
      job.industry_type?.toLowerCase().includes(searchLower) ||
      formatIndustryType(job.industry_type).toLowerCase().includes(searchLower) ||  // Also search formatted version (e.g., "Information Technology")
      job.department?.toLowerCase().includes(searchLower) ||
      job.employmentType?.toLowerCase().includes(searchLower) ||
      formatEmploymentType(job.employmentType).toLowerCase().includes(searchLower) ||  // Also search formatted version (e.g., "Full Time")
      job.experience?.toLowerCase().includes(searchLower) ||
      job.postedBy?.toLowerCase().includes(searchLower) ||  // Created by
      (job as any).workMode?.toLowerCase().includes(searchLower) ||  // Work mode (onsite, hybrid, remote)
      formatEmploymentType((job as any).workMode).toLowerCase().includes(searchLower)  // Also search formatted work mode
    );

    const matchesLocation = locationFilter === 'all' || job.location === locationFilter;
    const matchesDepartment = departmentFilter === 'all' || job.department === departmentFilter;
    const matchesIndustry = industryFilter === 'all' || job.industry_type === industryFilter;
    const matchesEmploymentType = employmentTypeFilter === 'all' || job.employmentType === employmentTypeFilter;

    // Creation method filter (Manual vs AI) - null means show all
    const matchesCreationMethod = creationMethodFilter === null ||
      (creationMethodFilter === 'ai' && (job as any).creation_method === 'ai_generated') ||
      (creationMethodFilter === 'manual' && (job as any).creation_method === 'manual');

    // Experience filter — compare actual year ranges, not digit substrings.
    // Each bucket is a [min, max] year span; a job matches if its own
    // [min, max] span overlaps the bucket's span.
    let matchesExperience = true;
    if (experienceFilter !== 'all') {
      const buckets: Record<string, [number, number]> = {
        entry: [0, 2],
        junior: [2, 4],
        mid: [5, 7],
        senior: [8, 10],
        architect: [10, Infinity],
        management: [10, Infinity],
      };
      const bucket = buckets[experienceFilter];
      if (bucket) {
        // Derive the job's year span from numeric fields, falling back to
        // parsing the experience string (e.g. "5-10", "10+", "3").
        let jobMin = job.experience_min;
        let jobMax = job.experience_max;
        if (jobMin == null && jobMax == null) {
          const exp = job.experience?.toLowerCase() || '';
          const nums = exp.match(/\d+/g)?.map(Number) ?? [];
          if (nums.length > 0) {
            jobMin = nums[0];
            jobMax = exp.includes('+') ? Infinity : (nums[1] ?? nums[0]);
          }
        }
        if (jobMin == null && jobMax == null) {
          // No experience data on the job — exclude when a specific level is selected.
          matchesExperience = false;
        } else {
          const lo = jobMin ?? jobMax ?? 0;
          const hi = jobMax ?? jobMin ?? Infinity;
          // Ranges overlap when each starts at/before the other ends.
          matchesExperience = lo <= bucket[1] && hi >= bucket[0];
        }
      }
    }

    // Date posted filter
    let matchesDatePosted = true;
    if (datePostedFromFilter || datePostedToFilter) {
      const jobDate = job.created_at ? new Date(job.created_at) : (job.postedDate ? new Date(job.postedDate) : null);
      if (jobDate) {
        if (datePostedFromFilter) {
          const fromDate = new Date(datePostedFromFilter);
          matchesDatePosted = matchesDatePosted && jobDate >= fromDate;
        }
        if (datePostedToFilter) {
          const toDate = new Date(datePostedToFilter);
          toDate.setHours(23, 59, 59, 999); // End of day
          matchesDatePosted = matchesDatePosted && jobDate <= toDate;
        }
      } else {
        matchesDatePosted = false;
      }
    }

    // Applicants filter
    let matchesApplicants = true;
    if (applicantsFilter !== 'all') {
      const count = job.applicants || 0;
      if (applicantsFilter === 'low') matchesApplicants = count < 10;
      else if (applicantsFilter === 'medium') matchesApplicants = count >= 10 && count < 50;
      else if (applicantsFilter === 'high') matchesApplicants = count >= 50;
    }

    /* Status is deliberately NOT here — see the lineage-aware selection below.
       It cannot be decided one row at a time, because the version that carries
       the status the pill asks for may not be among these rows at all. */
    return matchesSearch && matchesLocation && matchesDepartment &&
           matchesIndustry && matchesEmploymentType && matchesExperience && matchesDatePosted &&
           matchesApplicants && matchesCreationMethod;
  };

  /* ── One row per job on "All Jobs" — one row per MATCHING version on a status tab ──
     Every version of a JD is its own row in the API response (its own id,
     sharing the lineage's human-readable `job_id`).

     "All Jobs" collapses to one row per job_id (the latest version), so a job
     republished twice doesn't read as duplicates there.

     ── A status tab shows whichever version actually had that status ──
     Filter FIRST, then collapse WITHIN the matches — so a JD with v1 Published
     and v2 Disabled shows its v1 row under the Published tab AND its v2 row
     under the Disabled tab, each the version that was really in that state.
     (Deliberate: a job can therefore appear under more than one tab at once,
     and the stat tiles above — which still count distinct jobs by their LATEST
     version only — can disagree with a tab's row count. That's intentional
     here, not the bug this comment used to warn about.) */
  /* Version FIRST, criteria SECOND. Each job is represented by its latest
     version (All Jobs) or its latest version with the tab's status, and only
     THAT version is then tested against search and More Filters. Filtering
     every version before collapsing let a filter drop the newest version and
     promote an older one in its place — v4 listed under Published while v5
     was the job's latest published version, because v5 alone missed a filter.
     Now a job whose chosen version misses a filter is simply not listed. */
  const statusSelectedJobs = (statusFilter === 'all'
    ? collapseToLatestVersions(jobs)
    : collapseToLatestVersions(jobs.filter(job => matchesStatusFilter(job, statusFilter)))
  ).filter(matchesCriteria);

  const dedupedJobs = statusSelectedJobs;

  /* Grouped over the WHOLE list, not the filtered one, so the counts below
     describe the library rather than the current filter. The expanded history
     itself does not come from here — it is fetched per job from the lineage
     endpoint, which is authoritative about what versions exist. */
  const allVersionGroups = groupByLineage(jobs);

  /* Distinct jobs, ignoring filters — what the stat cards and the "of N jobs"
     badge count, so those numbers describe the same thing the list shows. */
  const distinctJobs = Array.from(allVersionGroups.values(), bucket => bucket[0]);

  // Apply sorting to filtered jobs
  // Assessed/interviewed counts come from the candidate-counts hook, not the
  // JD payload, so attach them before sorting on either.
  const sortedJobs = sortJobs(
    (sortBy === 'assessed' || sortBy === 'interviewed') && candidateCounts
      ? dedupedJobs.map(job => ({
          ...job,
          assessed: candidateCounts[job.id]?.assessed ?? 0,
          interviewed: candidateCounts[job.id]?.interviewed ?? 0,
        }))
      : dedupedJobs,
    sortBy,
    sortOrder,
  );

  // Debug: Log sorted jobs order - show first 5 with their departments
  console.log('Sorted by:', sortBy, 'Order:', sortOrder);
  console.table(sortedJobs.slice(0, 10).map((j, i) => ({
    '#': i + 1,
    title: j.title?.substring(0, 30),
    department: j.department || '(empty)',
    industry: j.industry_type || '(empty)'
  })));

  // Bulk action handlers
  /* The single Select All control offers both scopes through its dropdown:
     - current page: add the jobs visible on the active page (count tracks the
       Show: N per-page value);
     - all pages: select the whole filtered list across every page;
     - clear: empty the selection. */
  const selectCurrentPage = () =>
    setSelectedJobs(prev => {
      const next = new Set(prev);
      currentJobs.forEach(job => next.add(job.id));
      return next;
    });
  const selectAllPages = () => setSelectedJobs(new Set(sortedJobs.map(job => job.id)));
  const clearSelection = () => setSelectedJobs(new Set());

  const handleSelectJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  /* Bulk disable opens one shared DisableJobModal (showing the selected count),
     the same way bulk archive opens one ArchiveJobModal — rather than firing the
     per-row confirm once per job. It drives `onUpdateJobStatus` on confirm, the
     same mechanism bulk archive uses. */
  const [bulkDisableOpen, setBulkDisableOpen] = useState(false);

  const handleBulkDisable = () => {
    if (!onUpdateJobStatus || selectedJobs.size === 0) return;
    setBulkDisableOpen(true);
  };

  const confirmBulkDisable = () => {
    if (!onUpdateJobStatus) return;
    // Only Published JDs can be disabled — same rule as the per-row Disable action.
    const jobsToDisable = sortedJobs.filter(job => selectedJobs.has(job.id) && job.status === 'Published');
    jobsToDisable.forEach(job => onUpdateJobStatus(job.id, 'Disabled'));
    setBulkDisableOpen(false);
    setSelectedJobs(new Set());
    setShowBulkActions(false);
  };

  // Bulk unarchive — mirrors the per-row Unarchive (onUnarchiveJob per selected
  // Archived job); only the Archived tab surfaces it.
  const handleBulkUnarchive = () => {
    if (!onUnarchiveJob) return;
    const jobsToUnarchive = sortedJobs.filter(job => selectedJobs.has(job.id) && job.status === 'Archived');
    jobsToUnarchive.forEach(job => onUnarchiveJob(job));
    setSelectedJobs(new Set());
    setShowBulkActions(false);
  };

  /* Bulk archive is the one archive path that does NOT go through
     `onArchiveJob` — it drives `onUpdateJobStatus` per id — so it would have
     slipped past the confirm the parent wired to that prop. It opens the same
     `ArchiveJobModal` itself, in its plural wording, rather than being the one
     way to archive without being asked. */
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);

  const handleBulkArchive = () => {
    if (!onUpdateJobStatus || selectedJobs.size === 0) return;
    setBulkArchiveOpen(true);
  };

  const confirmBulkArchive = () => {
    if (!onUpdateJobStatus) return;
    /* Same eligibility rule as the per-row Archive Job action: a Draft has
       nothing published to retire, and an already-Archived job is a no-op. */
    const jobsToArchive = sortedJobs.filter(
      job => selectedJobs.has(job.id) && job.status !== 'Draft' && job.status !== 'Archived',
    );
    jobsToArchive.forEach(job => {
      onUpdateJobStatus(job.id, 'Archived');
    });
    setBulkArchiveOpen(false);
    setSelectedJobs(new Set());
    setShowBulkActions(false);
  };

  /* Bulk delete opens its own DeleteJobModal (the same popup component as the
     archive / disable confirms) rather than the generic global dialog, so the
     delete confirm matches that family exactly. */
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleBulkDelete = () => {
    if (!onBulkDelete || selectedJobs.size === 0) return;
    setShowBulkActions(false);
    setBulkDeleteOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!onBulkDelete) return;
    const selectedJobsData = sortedJobs.filter(job => selectedJobs.has(job.id));
    if (selectedJobsData.length === 0) { setBulkDeleteOpen(false); return; }
    setBulkDeleting(true);
    try {
      await onBulkDelete(selectedJobsData);
      setSelectedJobs(new Set());
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  // Export opens the CSV / Excel picker; the file is written in runBulkExport
  const handleBulkExport = () => setShowExportModal(true);

  const runBulkExport = async (format: ExportFileFormat) => {
    const selectedJobsData = sortedJobs.filter(job => selectedJobs.has(job.id));
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
  const byName = (a: unknown, b: unknown) => String(a).localeCompare(String(b));
  const uniqueLocations = Array.from(new Set(jobs.map(job => job.location).filter(Boolean))).sort(byName);
  const uniqueEmploymentTypes = Array.from(new Set(jobs.map(job => job.employmentType).filter(Boolean))).sort(byName);
  const uniqueIndustries = Array.from(new Set(jobs.map(job => job.industry_type).filter(Boolean))).sort(byName);

  // Calculate stats
  /* Each status card IS its tab's filter — clicking it opens that tab — so its
     number must be exactly the row count that tab shows (filters aside).
     They used to disagree: the cards counted a job only when its LATEST
     version had the status, while the tab lists a job when ANY version has it
     (filter versions first, then one row per job — see statusSelectedJobs).
     A job with v1 Published under a newer Draft/Disabled/Archived version
     was a Published row but not a Published count: "129" on the card,
     "135 of 216" after clicking it. Both now come from the same call.

     The versions pill counts the versions that HAVE the card's status —
     not every version of those jobs. A job holds at most one draft (always
     its latest version), so Drafts reads N jobs / N versions; Published
     counts each published version once, however many a job has. Counting
     all of a job's versions put a draft job's earlier published versions
     under "Drafts" (79 jobs, "82 versions"). */
  const jobsInStatusTab = (pill: string) =>
    collapseToLatestVersions(jobs.filter(job => matchesStatusFilter(job, pill)));
  const versionsWithStatus = (pill: string) =>
    jobs.filter(job => matchesStatusFilter(job, pill)).length;
  const publishedTabJobs = jobsInStatusTab('published');
  const draftTabJobs = jobsInStatusTab('draft');
  const archivedTabJobs = jobsInStatusTab('archived');
  const stats = {
    total: distinctJobs.length,
    published: publishedTabJobs.length,
    draft: draftTabJobs.length,
    closed: distinctJobs.filter(j => j.status === 'Closed').length,
    archived: archivedTabJobs.length,
    totalApplicants: distinctJobs.reduce((sum, j) => sum + (j.applicants || 0), 0),
    totalVersions: jobs.length,
    publishedVersions: versionsWithStatus('published'),
    draftVersions: versionsWithStatus('draft'),
    archivedVersions: versionsWithStatus('archived'),
  };

  /* The four headline numbers on the stat cards: `statusCounts` (server-
   * computed, right from first paint) until `jobs` itself is fully loaded and
   * can take over live — see the prop doc on `jobsFullyLoaded` above. Every
   * other stat (version pills, applicants, etc.) still reads `stats` directly;
   * only these four had a server-computed alternative to flicker against. */
  const headlineStats = (!jobsFullyLoaded && statusCounts)
    ? {
        total: statusCounts.total ?? stats.total,
        published: statusCounts.published ?? stats.published,
        draft: statusCounts.draft ?? stats.draft,
        archived: statusCounts.archived ?? stats.archived,
      }
    : stats;

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
      toast.error('You do not have permission to create job descriptions');
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
  const totalPages = Math.ceil(sortedJobs.length / itemsPerPage);
  const currentJobs = sortedJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  /* Whether every matching job (across all pages) is selected — drives the
     Select All button's "fully checked" icon. */
  const allPagesSelected = sortedJobs.length > 0 && sortedJobs.every(job => selectedJobs.has(job.id));

  /* Which Actions-dropdown options apply to the active tab. Export and Delete
     show on every tab; Disable only where disabling is meaningful (Published /
     Disabled); Archive only on Published; Unarchive only on Archived. */
  const actionsTab = statusFilter.toLowerCase();
  const showDisableAction = actionsTab === 'published' || actionsTab === 'disabled';
  const showArchiveAction = actionsTab === 'published';
  const showUnarchiveAction = actionsTab === 'archived' && !!onUnarchiveJob;

  // Reset to page 1 when filters change. Skipped on the mount pass: the
  // restored filters and the restored page arrive together, and resetting here
  // would throw away the page the user was on before opening a job.
  const skipPageResetRef = useRef(true);
  useEffect(() => {
    if (skipPageResetRef.current) { skipPageResetRef.current = false; return; }
    setCurrentPage(1);
  }, [searchQuery, statusFilter, creationMethodFilter, locationFilter, departmentFilter, industryFilter, experienceFilter, employmentTypeFilter, applicantsFilter, datePostedFromFilter, datePostedToFilter, sortBy, sortOrder]);

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
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Job Descriptions' }]} />
        {/* SaaS Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                <Briefcase className="h-4 w-4 text-brand-blue" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 mb-1 tracking-tight">Job Openings</h1>
                <p className="text-sm text-gray-600">Create and manage your job postings</p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              {/* Quota limit warning */}
              {quotaInfo && quotaInfo.remaining <= 0 && (
                <div className="flex items-start gap-2 px-3 py-1.5 bg-destructive-subtle border border-destructive-line rounded-lg text-destructive text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Job publishing limit reached ({quotaInfo.used}/{quotaInfo.limit}). <a href="/subscription/current-plan" className="underline font-medium">Upgrade your plan</a></span>
                </div>
              )}
              {(configHref || onCreateNew) && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                  {configHref && (
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
            <StatsCard tone="neutral" active={isOverviewCardActive('all')} showClickArrow icon={Briefcase} label="Total Jobs" value={headlineStats.total} sparkline={false} onClick={() => openListView('all')}>
              <StatVersions count={stats.totalVersions} />
            </StatsCard>
            <StatsCard tone="neutral" active={isOverviewCardActive('published')} showClickArrow icon={CheckCircle2} label="Published" value={headlineStats.published} sparkline={false} onClick={() => openListView('published')}>
              <StatVersions count={stats.publishedVersions} />
            </StatsCard>
            <StatsCard tone="neutral" active={isOverviewCardActive('draft')} showClickArrow icon={FileText} label="Drafts" value={headlineStats.draft} sparkline={false} onClick={() => openListView('draft')}>
              <StatVersions count={stats.draftVersions} />
            </StatsCard>
            <StatsCard tone="neutral" active={isOverviewCardActive('archived')} showClickArrow icon={Archive} label="Archived" value={headlineStats.archived} sparkline={false} onClick={() => openListView('archived')}>
              <StatVersions count={stats.archivedVersions} />
            </StatsCard>
          </StatsCardGrid>


        </div>

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Consolidated toolbar: Search + Filters + Tabs + Select all + Sort */}
        <div className="bg-white rounded-xl border border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
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
              <>
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
              </>
            }
            // Search flexes to fill the row; `controlsFollowSearch` gives the
            // search→control gap the same 8px as control→control, so Search,
            // Location, Industry and More Filters are evenly spaced on one line
            // and use the full available width.
            controlsFollowSearch
            onToggleFilters={() => setShowAdvancedFilters(!showAdvancedFilters)}
            filtersOpen={showAdvancedFilters}
            activeFilterCount={activeFiltersCount}
            filtersApplied={filtersActive}
            onClearFilters={clearAllFilters}
          />

          {/* More Filters Panel (collapsible) */}
          {showAdvancedFilters && (
            <div className="mb-3 pt-3 border-t border-brand-blue/10">
              {/* All four filters on one row on desktop (grid-cols-4), falling
                  back to a 2×2 grid on small screens and a single column on
                  phones — so the row stays clean and never overflows.
                  [&>div]:min-w-0 — grid items default to min-width:auto, so a long
                  <select> option (e.g. a full "City, State, Country" location) would
                  force its cell wider than the screen and overflow. min-w-0 lets the
                  cells (and the w-full selects inside) shrink to the grid track. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 [&>div]:min-w-0">
                {/* Location and Industry now live inline with Search (see the
                    toolbar's leadingActions above). Department was removed. */}
                {uniqueEmploymentTypes.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Job Type</label>
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
                  <label className="block text-sm text-gray-700 mb-1.5 font-medium">Experience</label>
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
                  <label className="block text-sm text-gray-700 mb-1.5 font-medium">Posted From</label>
                  {/* No className override — uses DateField's shared chrome, the
                      same as Search and the SearchableSelect filters. */}
                  <DateField
                    value={datePostedFromFilter}
                    onChange={(v) => search.setFilter('datePostedFrom', v)}
                    aria-label="Posted From"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5 font-medium">Posted To</label>
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
          <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-200 mb-3">
            {/* Select all + Bulk Actions — sits at the head of the row, where the
                "Show:" label used to be. */}
            {sortedJobs.length > 0 && (
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* One Select All button. Its dropdown carries BOTH scopes:
                    "this page (N)" — tracks the Show: N per-page value — and
                    "all jobs (N)" — the total across every page. */}
                <div className="relative">
                  <button
                    onClick={() => setShowSelectMenu((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={showSelectMenu}
                    className={tabPill(selectedJobs.size > 0)}
                  >
                    {allPagesSelected ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : selectedJobs.size > 0 ? (
                      <span className="h-2 w-2 rounded-full bg-current" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>{selectedJobs.size > 0 ? `${selectedJobs.size} Selected` : 'Select All'}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {showSelectMenu && (
                    <>
                      {/* Click-away layer so the menu closes on an outside click. */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowSelectMenu(false)} />
                      <div className="absolute top-full left-0 mt-2 w-60 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        <button
                          onClick={() => { selectCurrentPage(); setShowSelectMenu(false); }}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                        >
                          <Square className="w-4 h-4 text-gray-500" />
                          Select all on this page ({currentJobs.length})
                        </button>
                        <button
                          onClick={() => { selectAllPages(); setShowSelectMenu(false); }}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50"
                        >
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                          Select all jobs ({sortedJobs.length})
                        </button>
                        <div className="border-t border-gray-200 my-1" />
                        <button
                          onClick={() => { clearSelection(); setShowSelectMenu(false); }}
                          disabled={selectedJobs.size === 0}
                          className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                          Clear selection
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions Dropdown — shown whenever at least one job is selected. */}
                {selectedJobs.size > 0 && (
                  <div className="relative" ref={bulkActionsRef}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowBulkActions(!showBulkActions)}
                      className="rounded-full"
                    >
                      Actions
                      <ChevronDown className="w-4 h-4" />
                    </Button>

                    {showBulkActions && (
                      // Right-aligned + width clamped to the viewport so the menu
                      // never runs off the right edge on narrow/mobile screens.
                      <div className="absolute top-full right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {showDisableAction && (
                          <button
                            onClick={() => {
                              if (!canDisableJd) {
                                toast.error('You do not have permission to disable job descriptions');
                                return;
                              }
                              handleBulkDisable();
                            }}
                            aria-disabled={!canDisableJd}
                            title={!canDisableJd ? 'You do not have permission to disable job descriptions' : ''}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                              canDisableJd ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <Ban className={`w-4 h-4 ${canDisableJd ? 'text-destructive' : 'text-gray-400'}`} />
                            Disable Selected (Published)
                          </button>
                        )}
                        {showArchiveAction && (
                          <button
                            onClick={() => {
                              if (!canArchiveJd) {
                                toast.error('You do not have permission to archive job descriptions');
                                return;
                              }
                              handleBulkArchive();
                            }}
                            aria-disabled={!canArchiveJd}
                            title={!canArchiveJd ? 'You do not have permission to archive job descriptions' : ''}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                              canArchiveJd ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <Archive className="w-4 h-4 text-gray-600" />
                            Archive Selected
                          </button>
                        )}
                        {showUnarchiveAction && (
                          <button
                            onClick={() => {
                              if (!canArchiveJd) {
                                toast.error('You do not have permission to archive job descriptions');
                                return;
                              }
                              handleBulkUnarchive();
                            }}
                            aria-disabled={!canArchiveJd}
                            title={!canArchiveJd ? 'You do not have permission to archive job descriptions' : ''}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                              canArchiveJd ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <RefreshCw className={`w-4 h-4 ${canArchiveJd ? 'text-success' : 'text-gray-400'}`} />
                            Unarchive Selected
                          </button>
                        )}
                        {(showDisableAction || showArchiveAction || showUnarchiveAction) && (
                          <div className="border-t border-gray-200 my-2" />
                        )}
                        <button
                          onClick={() => {
                            if (!canExportJd) {
                              toast.error('You do not have permission to export job descriptions');
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
                          <Download className="w-4 h-4 text-gray-700" />
                          Export Selected
                        </button>
                        {onBulkDelete && (
                          <button
                            onClick={() => {
                              if (!canDeleteJd) {
                                toast.error('You do not have permission to delete job descriptions');
                                return;
                              }
                              handleBulkDelete();
                            }}
                            aria-disabled={!canDeleteJd}
                            title={!canDeleteJd ? 'You do not have permission to delete job descriptions' : ''}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                              canDeleteJd ? 'text-destructive hover:bg-destructive-subtle' : 'text-gray-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Selected
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Status tabs */}
            {['all', 'Published', 'Draft', 'Disabled', 'Archived'].map((status) => (
              <button
                key={status}
                onClick={() => search.setFilter('status', status.toLowerCase())}
                className={tabPill(statusFilter.toLowerCase() === status.toLowerCase())}
              >
                {status === 'all' ? 'All Jobs' : status}
              </button>
            ))}

            {/* Creation method: [ All | AI Generated | Manual ] — a single
                connected segmented toggle (shared tinted track; the active
                option lifts to a white chip). "All" clears the filter (null). */}
            <div className="flex items-center gap-2 sm:ml-2 sm:border-l sm:border-gray-200 sm:pl-3">
              <div className={SEGMENT_TOGGLE}>
                <button
                  onClick={() => search.setFilter('creationMethod', null)}
                  className={segmentBtn(creationMethodFilter === null)}
                >
                  All
                </button>
                <button
                  onClick={() => search.setFilter('creationMethod', creationMethodFilter === 'ai' ? null : 'ai')}
                  className={segmentBtn(creationMethodFilter === 'ai')}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">AI Generated</span>
                  <span className="sm:hidden">AI</span>
                </button>
                <button
                  onClick={() => search.setFilter('creationMethod', creationMethodFilter === 'manual' ? null : 'manual')}
                  className={segmentBtn(creationMethodFilter === 'manual')}
                >
                  <Edit className="w-3.5 h-3.5" />
                  Manual
                </button>
              </div>
            </div>

            {/* Sort by — pushed to the row's end */}
            {sortedJobs.length > 0 && (
              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="text-xs sm:text-sm text-gray-700">Sort by</span>
                {/* bg-brand-blue/5 + rounded-lg = the tab pills' resting style, so
                    the sort control belongs to the same pill system. */}
                <div className="inline-flex items-center bg-brand-blue/5 rounded-lg p-1 transition-all">
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        const value = e.target.value as JobSortBy;
                        setSortBy(value);
                      }}
                      className="appearance-none h-7 pl-2.5 pr-8 bg-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-xs sm:text-sm text-gray-700 cursor-pointer"
                    >
                      <option value="date">Date Posted</option>
                      <option value="applicants">Applicants</option>
                      <option value="assessed">Assessed</option>
                      <option value="interviewed">Interviewed</option>
                      <option value="title">Job Title</option>
                      <option value="status">Status</option>
                      <option value="industry">Industry Type</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  </div>
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
            )}
          </div>
        </div>

        {/* Jobs Grid/List */}
        {currentJobs.length > 0 ? (
            // List View
            <div className="space-y-3">
              {currentJobs.map(job => {
                const versionKey = job.job_id || job.id;
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
                   would just repeat the same row. Counted from siblings that
                   match the tab's status, not the whole lineage. */
                const lineageSiblings = allVersionGroups.get(versionKey) ?? [job];
                const hasVersionHistory = statusFilter === 'all'
                  ? (job.versionNumber ?? 1) > 1 ||
                    new Set(lineageSiblings.map((sibling) => sibling.versionNumber ?? 1)).size > 1
                  : new Set(
                      lineageSiblings
                        .filter((sibling) => matchesStatusFilter(sibling, statusFilter))
                        .map((sibling) => sibling.versionNumber ?? 1),
                    ).size > 1;

                /* Counts for the colored badge stack beside the row actions.
                   assessed/interviewed come from the candidate-counts hook (null
                   until it loads — same visibility rule the meta row used),
                   applicants from the job itself. */
                const applicantsCount = job.applicants;
                const assessedCount = candidateCounts ? candidateCounts[job.id]?.assessed ?? 0 : null;
                const interviewedCount = candidateCounts ? candidateCounts[job.id]?.interviewed ?? 0 : null;
                const hasCountBadges = applicantsCount != null || assessedCount != null || interviewedCount != null;

                return (
                  <div
                    key={job.id}
                    className={`relative bg-white rounded-xl border transition-[transform,box-shadow,border-color] duration-150 cursor-pointer p-4 ${activeDropdown === job.id ? 'z-30' : 'z-0'} ${selectedJobs.has(job.id) ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30' : 'border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'}`}
                    onClick={() => job.status.toLowerCase() === 'draft' && onEditJob && canUpdateJd ? onEditJob(job) : onViewJob(job)}
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                      {/* Individual Select — just the checkbox (the Briefcase
                          job icon that used to sit beside it was removed).
                          md:h-6 gives the checkbox the same 24px line-box as the
                          title row (text-base), so on the desktop row it centers
                          on the same line as the JD-ID / Role / Versions badges
                          instead of sitting a few px higher. */}
                      <div className="flex items-center flex-shrink-0 md:h-6">
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

                      {/* Actions — a full-height column: icon row pinned at
                          the top, View Versions pinned at the bottom-right
                          corner of the card. self-stretch + justify-between
                          make the column span the row's full height (set by
                          the job info beside it), so the button lands flush
                          with the right edge, level with the card's last
                          content row. */}
                      <div className="flex flex-col items-end justify-between gap-2 self-stretch flex-shrink-0">
                      {/* Top of the actions column: the count badges (vertical,
                          colored stack) sit to the LEFT of the Edit / View / ⋮
                          button row. */}
                      <div className="flex items-start gap-3">
                        {/* Applicants / Assessed / Interviewed — one below another,
                            equal width (items-stretch), colored with the shared
                            semantic tokens: info (applicants), success (assessed),
                            warning (interviewed). text-xs matches the app's other
                            chips/badges; capitalized labels. */}
                        {hasCountBadges && (
                          <div className="flex flex-col items-stretch gap-1.5 flex-shrink-0">
                            {applicantsCount != null && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-info-subtle text-info-strong">
                                <Users className="w-4 h-4" />
                                {applicantsCount} {applicantsCount === 1 ? 'Applicant' : 'Applicants'}
                              </span>
                            )}
                            {assessedCount != null && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-success-subtle text-success-strong">
                                <ClipboardCheck className="w-4 h-4" />
                                {assessedCount} Assessed
                              </span>
                            )}
                            {interviewedCount != null && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-warning-subtle text-warning-strong">
                                <Video className="w-4 h-4" />
                                {interviewedCount} Interviewed
                              </span>
                            )}
                          </div>
                        )}
                      <div className="flex flex-wrap gap-2 items-start justify-end">
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
                                  toast.error('You do not have permission to edit job descriptions');
                                  return;
                                }
                                onEditJob(job);
                              }}
                              aria-disabled={!canUpdateJd || atMaxVersions}
                              className={`h-9 w-9 p-0 rounded-md ${!canUpdateJd || atMaxVersions ? 'opacity-50 cursor-not-allowed' : ''}`}
                              aria-label="Edit"
                              title={
                                atMaxVersions
                                  ? 'Maximum of 5 versions reached'
                                  : !canUpdateJd
                                    ? 'You do not have permission to edit job descriptions'
                                    : 'Edit'
                              }
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          );
                        })()}

                        {/* View Button - icon only. Shown on every row for a
                            consistent action set. */}
                        <Button
                          variant="secondary"
                          onClick={(e) => { e.stopPropagation(); onViewJob(job); }}
                          className="h-9 w-9 p-0 rounded-md"
                          aria-label="View" title="View"
                        >
                          <Eye className="w-4 h-4" />
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
                            className="h-9 w-9 p-0 rounded-md"
                            aria-label="More actions"
                            title="More actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {activeDropdown === job.id && (
                            <div className="absolute right-0 top-full mt-1 w-52 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-40">
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
                                  <span className={MENU_ITEM_SCALE_CLASS}>View Applicants</span>
                                </button>
                              )}
                              {/* Quick Actions — mirror the Job Details "Quick Actions" panel */}
                              {onAIMatch && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onAIMatchDisabled) {
                                      toast.error(onAIMatchDisabledReason);
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
                                      toast.error(onScoreResumesDisabledReason);
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
                                      toast.error('You do not have permission to disable job descriptions');
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
                                      toast.error('You do not have permission to update job descriptions');
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
                                      toast.error('You do not have permission to archive job descriptions');
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
                                      toast.error('You do not have permission to archive job descriptions');
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
                                      toast.error('You do not have permission to delete job descriptions');
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
                      </div>
                        {/* View Versions — pinned at the bottom of the actions
                            column, i.e. the card's bottom-right corner. Shown
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
                            className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-all duration-200 ${
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
                              ? versionLineage.lineages[versionKey]
                              : versionLineage.lineages[versionKey]?.filter(
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
                          onRowClick={(versionId) => router.push(`/recruitment/job-details?id=${versionId}`)}
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
                                    <span className={MENU_ITEM_SCALE_CLASS}>View Applicants</span>
                                  </DropdownMenuItem>
                                )}
                                {/* Quick Actions — same gates as the latest-version menu */}
                                {onAIMatch && !['draft', 'disabled', 'archived'].includes(versionJob.status.toLowerCase()) && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      if (onAIMatchDisabled) {
                                        e.preventDefault();
                                        toast.error(onAIMatchDisabledReason);
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
                                        toast.error(onScoreResumesDisabledReason);
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
                                        toast.error('You do not have permission to disable job descriptions');
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
                                        toast.error('You do not have permission to update job descriptions');
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
                                        toast.error('You do not have permission to archive job descriptions');
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
                                        toast.error('You do not have permission to archive job descriptions');
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
                                        toast.error('You do not have permission to delete job descriptions');
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
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                {searchQuery || activeFiltersCount > 0 ? (
                  <Search className="w-5 h-5 text-brand-blue" />
                ) : (
                  <Briefcase className="w-5 h-5 text-brand-blue" />
                )}
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 tracking-tight">
                {searchQuery || activeFiltersCount > 0 ? 'No jobs found' : 'No jobs yet'}
              </h3>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
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
        {sortedJobs.length > 5 && (
          <div className="bg-white rounded-xl border border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              {/* Left: Items per page selector and showing info */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={40}>40</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-600">per page</span>
                </div>

                <div className="hidden sm:block h-6 w-px bg-gray-300" />

                <span className="text-xs sm:text-sm text-gray-600">
                  Showing <span className="font-medium text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * itemsPerPage, sortedJobs.length)}</span> of <span className="font-medium text-gray-900">{sortedJobs.length}</span> jobs
                </span>
              </div>

              {/* Right: Page navigation */}
              <div className="flex items-center justify-center sm:justify-end gap-2 sm:gap-3">
                {/* Go to page */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
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
                    className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
                  />
                </div>

                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>

                {/* Current / total */}
                <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                  <span className="text-brand-blue font-semibold">{currentPage}</span> / {totalPages}
                </span>

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
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

      <ArchiveJobModal
        isOpen={bulkArchiveOpen}
        count={selectedJobs.size}
        jobLabel={`${selectedJobs.size} Job Description Selected`}
        onConfirm={confirmBulkArchive}
        onCancel={() => setBulkArchiveOpen(false)}
      />

      <DisableJobModal
        isOpen={bulkDisableOpen}
        jobLabel={`${selectedJobs.size} Job Description Selected`}
        onConfirm={confirmBulkDisable}
        onCancel={() => setBulkDisableOpen(false)}
      />

      <DeleteJobModal
        isOpen={bulkDeleteOpen}
        count={selectedJobs.size}
        jobLabel={`${selectedJobs.size} Job Description Selected`}
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
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">Insufficient Units</h3>
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
                <p className="text-sm text-gray-600">
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
        recordCount={selectedJobs.size}
        selected
        columns={JOBS_EXPORT_HEADERS}
        onExport={runBulkExport}
      />
    </main>
  );
}
