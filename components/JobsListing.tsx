'use client'

import { Plus, Search, MapPin, Calendar, Target, Eye, MoreVertical, Briefcase, Users, User, TrendingUp, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, Settings, Archive, XCircle, Building2, DollarSign, AlertCircle, ArrowUpRight, Edit, Send, Ban, RefreshCw, ArrowUpDown, CheckSquare, Square, Trash2, Download, ChevronLeft, ChevronRight, X, Brain } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Job } from '@/lib/types/types';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatISTDate, parseIST } from '@/lib/utils/dateUtils';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ModuleInfoBanner from '@/components/ModuleInfoBanner';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { jdService, JDLineageVersion, JDResponse } from '@/lib/services/jdService';
import { formatJobExperienceText } from '@/lib/utils/jobExperience';
/* Radix menu rather than the hand-rolled absolute dropdown the job rows use:
   the version table sits inside an overflow-x-auto shell, which would clip an
   absolutely positioned menu — Radix portals it out of the scroll container. */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Utility function to format employment type for display
// Converts "full_time" -> "Full Time", "part_time" -> "Part Time", etc.
const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '-';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Utility function to format industry type for display
// Converts "information_technology" -> "Information Technology", "oil_gas" -> "Oil Gas", etc.
const formatIndustryType = (type: string | undefined): string => {
  if (!type) return '-';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Utility function to format last updated time
// Within 24 hours: show "X hours ago"
// More than 24 hours: show actual date
// Server returns UTC time, add 5:30 hours for IST
const formatLastUpdated = (dateString: string | undefined): string => {
  if (!dateString) return '-';

  const istDate = parseIST(dateString);

  const now = new Date();

  const diffInSeconds = Math.floor((now.getTime() - istDate.getTime()) / 1000);
  const diffInHours = Math.floor(diffInSeconds / 3600);

  // Within 24 hours - show hours ago
  if (diffInHours >= 0 && diffInHours < 24) {
    if (diffInHours === 0) {
      const minutes = Math.floor(diffInSeconds / 60);
      if (minutes < 1) return 'Just now';
      return `${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`;
    }
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }

  // More than 24 hours - show actual date
  return formatISTDate(dateString);
};

interface JobsListingProps {
  jobs: Job[];
  onCreateNew: () => void;
  onViewJob: (job: Job) => void;
  onViewApplicants?: (job: Job) => void;
  onAIMatch?: (job: Job) => void;
  onScoreResumes?: (job: Job) => void;
  onUpdateJobStatus?: (jobId: string, status: Job['status']) => void;
  onEditJob?: (job: Job) => void;
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
  // Quick links to master-data screens — surfaced on this page instead of the sidebar
  masterDataLinks?: { id: string; label: string; href: string; icon: LucideIcon }[];
}

export default function JobsListing({ jobs, onCreateNew, onViewJob, onViewApplicants, onAIMatch, onScoreResumes, onUpdateJobStatus, onEditJob, onPublishJob, onDisableJob, onRepublishJob, onArchiveJob, onUnarchiveJob, onDeleteJob, onBulkDelete, quotaInfo, initialStatusFilter, forceListView, masterDataLinks }: JobsListingProps) {
  const dialog = useGlobalDialog();
  const { isTenantAdmin, user } = useAuth();
  const canUpdateJd = isTenantAdmin || (user?.permissions?.canUpdateJd ?? false);
  const canDeleteJd = isTenantAdmin || (user?.permissions?.canDeleteJd ?? false);
  const canArchiveJd = isTenantAdmin || (user?.permissions?.canArchiveJd ?? false);
  const canDisableJd = isTenantAdmin || (user?.permissions?.canDisableJd ?? false);
  const canExportJd = isTenantAdmin || (user?.permissions?.canExport ?? false);
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

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  /* Jobs whose version history is expanded in place, keyed by lineage (job_id,
     or the row's own id when it has none). A Set so several can be open at
     once — collapsing one must not close the rest. */
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  /* Lineage per expanded job, from GET /jd/{id}/lineage — the authoritative
     answer to "what versions does this job have". Deliberately NOT derived from
     the rows on screen: whether the list returns every version or only the
     latest is the list endpoint's business, and gating the feature on that made
     the action disappear whenever the list returned one row per job. Cached by
     lineage key so re-expanding is instant and never refetches. */
  const [versionLineages, setVersionLineages] = useState<Record<string, JDLineageVersion[]>>({});
  const [loadingLineages, setLoadingLineages] = useState<Set<string>>(new Set());
  /* Full JD record per lineage version id. The lineage endpoint only carries
     id/title/version/status/dates, but the expanded Version History table also
     shows experience, industry, applicants and author — fetched once per
     version when its lineage first loads. A version whose fetch fails simply
     shows dashes in those cells; nothing is invented client-side. */
  const [versionDetails, setVersionDetails] = useState<Record<string, JDResponse>>({});

  const loadLineage = async (key: string, jobId: string) => {
    if (versionLineages[key] || loadingLineages.has(key)) return;
    setLoadingLineages(prev => new Set(prev).add(key));
    try {
      const lineage = await jdService.getLineageVersions(jobId);
      setVersionLineages(prev => ({ ...prev, [key]: lineage || [] }));
      // Enrich each version with its own JD record, in parallel; every result
      // lands as it arrives so the table fills in progressively.
      (lineage || []).forEach((version) => {
        jdService
          .getById(version.id)
          .then((full) => {
            setVersionDetails(prev => (prev[version.id] ? prev : { ...prev, [version.id]: full }));
          })
          .catch(() => { /* row falls back to the lineage fields + dashes */ });
      });
    } catch {
      // Leave it uncached so the next expand retries rather than showing an
      // empty history as if the job genuinely had one version.
      setVersionLineages(prev => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingLineages(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleVersions = (key: string, jobId: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!expandedVersions.has(key)) void loadLineage(key, jobId);
  };
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAIMatchModal, setShowAIMatchModal] = useState(false);
  const [selectedJobForAIMatch, setSelectedJobForAIMatch] = useState<Job | null>(null);
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  

  // Sort and Bulk Actions states
  const [sortBy, setSortBy] = useState<'date' | 'applicants' | 'title' | 'status' | 'industry'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

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
  const [showConfig, setShowConfig] = useState(false);

  // Persist this list's view state (filters / search / sort / pagination / view
  // toggles) so returning from a job-details page restores it. Declared after the
  // useState + URL-sync effects above so restore wins over the mount-time resets.
  useListStatePersistence(
    'job-openings-list',
    {
      searchQuery, statusFilter, creationMethodFilter, locationFilter, viewMode,
      departmentFilter, industryFilter, experienceFilter, employmentTypeFilter,
      applicantsFilter, salaryRangeFilter, datePostedFromFilter, datePostedToFilter,
      sortBy, sortOrder, currentPage, itemsPerPage, pageView,
    },
    (s) => {
      // "Show all jobs" outranks the saved snapshot: restoring a stale search,
      // status or page here is what hid a just-published JD behind the previous
      // narrowed view. Everything else (sort, density, column prefs) still restores.
      if (typeof s.searchQuery === 'string') search.setQuery(forceListView ? '' : s.searchQuery);
      if (s.viewMode === 'grid' || s.viewMode === 'list') setViewMode(s.viewMode);
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
      if (typeof s.sortBy === 'string') setSortBy(s.sortBy as 'date' | 'applicants' | 'title' | 'status' | 'industry');
      if (s.sortOrder === 'asc' || s.sortOrder === 'desc') setSortOrder(s.sortOrder);
      if (typeof s.currentPage === 'number') setCurrentPage(forceListView ? 1 : s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  const filteredJobs = jobs.filter(job => {
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

    const matchesStatus = statusFilter === 'all' || job.status.toLowerCase() === statusFilter.toLowerCase();
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

    return matchesSearch && matchesStatus && matchesLocation && matchesDepartment &&
           matchesIndustry && matchesEmploymentType && matchesExperience && matchesDatePosted &&
           matchesApplicants && matchesCreationMethod;
  });

  /* ── One row per job, not one per version ─────────────────────────────
     Every version of a JD is its own row in the API response (its own id,
     sharing the lineage's human-readable `job_id`), so a job republished twice
     arrived here three times and the list read as duplicates.

     Collapsed AFTER filtering rather than before, deliberately: with a status
     filter on, the representative is the newest version that PASSED the filter,
     so filtering to Published still shows a job whose newest version happens to
     be a draft. Collapsing first would have made the whole job vanish.

     Keyed on `job_id` because that is what the lineage shares; rows without one
     (drafts that never got an ID) fall back to their own id and so stay
     individual. "Latest" is the highest version_number present — read from the
     data, never assumed to be first or last in the response. */
  const lineageKey = (job: Job) => job.job_id || job.id;

  const groupByLineage = (list: Job[]) => {
    const groups = new Map<string, Job[]>();
    for (const job of list) {
      const key = lineageKey(job);
      const bucket = groups.get(key);
      if (bucket) bucket.push(job);
      else groups.set(key, [job]);
    }
    // Newest first inside each group, so [0] is the one that represents it.
    groups.forEach(bucket => bucket.sort((a, b) => (b.versionNumber ?? 1) - (a.versionNumber ?? 1)));
    return groups;
  };

  const dedupedJobs = Array.from(groupByLineage(filteredJobs).values(), bucket => bucket[0]);

  /* Grouped over the WHOLE list, not the filtered one, so the counts below
     describe the library rather than the current filter. The expanded history
     itself does not come from here — it is fetched per job from the lineage
     endpoint, which is authoritative about what versions exist. */
  const allVersionGroups = groupByLineage(jobs);

  /* Distinct jobs, ignoring filters — what the stat cards and the "of N jobs"
     badge count, so those numbers describe the same thing the list shows. */
  const distinctJobs = Array.from(allVersionGroups.values(), bucket => bucket[0]);

  // Apply sorting to filtered jobs
  const sortedJobs = [...dedupedJobs].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        // Use created_at if available, fallback to postedDate
        const dateA = a.created_at ? new Date(a.created_at).getTime() : (a.postedDate ? new Date(a.postedDate).getTime() : 0);
        const dateB = b.created_at ? new Date(b.created_at).getTime() : (b.postedDate ? new Date(b.postedDate).getTime() : 0);
        comparison = dateA - dateB; // Natural ascending (oldest first), desc will flip to newest first
        break;
      case 'applicants':
        comparison = (a.applicants || 0) - (b.applicants || 0); // Natural ascending
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'industry':
        // Case-insensitive industry sort, empty industries always at end
        const indA = (a.industry_type || '').trim().toLowerCase();
        const indB = (b.industry_type || '').trim().toLowerCase();
        // Empty industries always go to end
        if (!indA && indB) return 1;
        if (indA && !indB) return -1;
        if (!indA && !indB) return 0;
        // Both have values - normal comparison respects sortOrder
        comparison = indA.localeCompare(indB);
        break;
      default:
        comparison = 0;
    }

    // 'desc' inverts the comparison (largest/newest first), 'asc' keeps natural order
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Debug: Log sorted jobs order - show first 5 with their departments
  console.log('Sorted by:', sortBy, 'Order:', sortOrder);
  console.table(sortedJobs.slice(0, 10).map((j, i) => ({
    '#': i + 1,
    title: j.title?.substring(0, 30),
    department: j.department || '(empty)',
    industry: j.industry_type || '(empty)'
  })));

  // Bulk action handlers
  const handleSelectAll = () => {
    if (selectedJobs.size === sortedJobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(sortedJobs.map(job => job.id)));
    }
  };

  const handleSelectJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const handleBulkPublish = () => {
    if (!onPublishJob) return;
    const jobsToPublish = sortedJobs.filter(job => selectedJobs.has(job.id) && job.status === 'Draft');
    jobsToPublish.forEach(job => onPublishJob(job));
    setSelectedJobs(new Set());
    setShowBulkActions(false);
  };

  const handleBulkDisable = () => {
    if (!onDisableJob) return;
    const jobsToDisable = sortedJobs.filter(job => selectedJobs.has(job.id) && job.status === 'Published');
    jobsToDisable.forEach(job => onDisableJob(job));
    setSelectedJobs(new Set());
    setShowBulkActions(false);
  };

  const handleBulkArchive = () => {
    if (!onUpdateJobStatus) return;
    selectedJobs.forEach(jobId => {
      onUpdateJobStatus(jobId, 'Archived');
    });
    setSelectedJobs(new Set());
    setShowBulkActions(false);
  };

  const handleBulkDelete = async () => {
    if (!onBulkDelete) return;
    const selectedJobsData = sortedJobs.filter(job => selectedJobs.has(job.id));
    if (selectedJobsData.length === 0) return;
    if (await dialog.confirm({ title: 'Delete Jobs', message: `Are you sure you want to delete ${selectedJobsData.length} job(s)? This action cannot be undone.`, variant: 'error', confirmText: 'Delete' })) {
      await onBulkDelete(selectedJobsData);
      setSelectedJobs(new Set());
      setShowBulkActions(false);
    }
  };

  const handleBulkExport = () => {
    const selectedJobsData = sortedJobs.filter(job => selectedJobs.has(job.id));
    const headers = [
      'JD ID', 'Title', 'Status', 'Creation Method', 'Version',
      'Industry', 'Department', 'Employment Type', 'Work Mode',
      'Experience (Min Years)', 'Experience (Max Years)', 'Experience',
      'Salary', 'Location', 'Job Level', 'Education',
      'Posted Date', 'Created Date', 'Last Updated', 'Created By',
      'Applicants'
    ];
    const escape = (val: any) => {
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csvContent = [
      headers.join(','),
      ...selectedJobsData.map(job => [
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
        (job as any).education || '',
        job.postedDate || '',
        (job as any).created_at ? new Date((job as any).created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
        (job as any).updated_at ? new Date((job as any).updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
        job.postedBy || '',
        job.applicants || 0
      ].map(escape).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobs-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Get display status - show "Republished" if published and version > 1
  const getDisplayStatus = (status: string, currentVersion?: number) => {
    if (status === 'Published' && currentVersion && currentVersion > 1) {
      return 'Republished';
    }
    return status;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Published':
        return {
          bg: 'bg-green-50',
          text: 'text-green-700',
          border: 'border-green-200',
          dot: 'bg-green-500'
        };
      case 'Republished':
        return {
          bg: 'bg-brand-blue/10',
          text: 'text-brand-blue',
          border: 'border-brand-blue/20',
          dot: 'bg-brand-blue'
        };
      case 'Draft':
        return {
          bg: 'bg-brand-orange/10',
          text: 'text-brand-orange-deep',
          border: 'border-brand-orange/20',
          dot: 'bg-brand-orange'
        };
      case 'Closed':
        return {
          bg: 'bg-gray-50',
          text: 'text-gray-600',
          border: 'border-gray-200',
          dot: 'bg-gray-400'
        };
      case 'Disabled':
        return {
          bg: 'bg-red-50',
          text: 'text-red-600',
          border: 'border-red-200',
          dot: 'bg-red-500'
        };
      case 'Archived':
        return {
          bg: 'bg-gray-50',
          text: 'text-gray-500',
          border: 'border-gray-200',
          dot: 'bg-gray-400'
        };
      default:
        return {
          bg: 'bg-gray-50',
          text: 'text-gray-700',
          border: 'border-gray-200',
          dot: 'bg-gray-500'
        };
    }
  };

  const getCreationMethodConfig = (method: string | undefined) => {
    if (method === 'ai_generated') {
      return {
        bg: 'bg-brand-blue-2/10',
        text: 'text-brand-blue-2',
        border: 'border-brand-blue-2/20',
        dot: 'bg-brand-blue-2',
        label: 'AI'
      };
    }
    return {
      bg: 'bg-brand-cyan/10',
      text: 'text-brand-cyan',
      border: 'border-brand-cyan/20',
      dot: 'bg-brand-cyan',
      label: 'Manual'
    };
  };

  // Get unique values for filters
  const uniqueLocations = Array.from(new Set(jobs.map(job => job.location)));
  const uniqueDepartments = Array.from(new Set(jobs.map(job => job.department).filter(Boolean)));
  const uniqueEmploymentTypes = Array.from(new Set(jobs.map(job => job.employmentType).filter(Boolean)));
  const uniqueIndustries = Array.from(new Set(jobs.map(job => job.industry_type).filter(Boolean)));

  // Calculate stats
  /* Counted over `distinctJobs`, not raw `jobs` — one entry per job, matching
     the list. Counting versions made the cards read higher than the rows
     underneath them the moment anything was republished. */
  const stats = {
    total: distinctJobs.length,
    published: distinctJobs.filter(j => j.status === 'Published').length,
    draft: distinctJobs.filter(j => j.status === 'Draft').length,
    closed: distinctJobs.filter(j => j.status === 'Closed').length,
    archived: distinctJobs.filter(j => j.status === 'Archived').length,
    totalApplicants: distinctJobs.reduce((sum, j) => sum + (j.applicants || 0), 0)
  };

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

  // Reset to page 1 when filters change. Skipped on the mount pass: the
  // restored filters and the restored page arrive together, and resetting here
  // would throw away the page the user was on before opening a job.
  const skipPageResetRef = useRef(true);
  useEffect(() => {
    if (skipPageResetRef.current) { skipPageResetRef.current = false; return; }
    setCurrentPage(1);
  }, [searchQuery, statusFilter, creationMethodFilter, locationFilter, departmentFilter, industryFilter, experienceFilter, employmentTypeFilter, applicantsFilter, datePostedFromFilter, datePostedToFilter, sortBy, sortOrder]);

  // Update items per page based on view mode. Also skipped on mount, so it
  // can't overwrite a restored page size / page number either.
  const skipViewModeResetRef = useRef(true);
  useEffect(() => {
    if (skipViewModeResetRef.current) { skipViewModeResetRef.current = false; return; }
    setItemsPerPage(10);
    setCurrentPage(1); // Reset to first page when view mode changes
  }, [viewMode]);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const startPage = Math.max(2, currentPage - 1);
      const endPage = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  return (
    <main className="flex-1 overflow-x-hidden bg-slate-50">
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
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>Job publishing limit reached ({quotaInfo.used}/{quotaInfo.limit}). <a href="/subscription/current-plan" className="underline font-medium">Upgrade your plan</a></span>
                </div>
              )}
              {(masterDataLinks?.length || onCreateNew) && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                  {masterDataLinks && masterDataLinks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowConfig(!showConfig)}
                      aria-expanded={showConfig}
                      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-all sm:w-auto ${
                        showConfig
                          ? 'bg-brand-blue text-white border-brand-blue shadow-md shadow-brand-blue/25'
                          : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      Config
                      <ChevronDown className={`w-4 h-4 transition-transform ${showConfig ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {onCreateNew && (
                    <button
                      onClick={handleCreateNewJob}
                      className="w-full sm:w-auto px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create New Job</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Config Panel (collapsible) - Experience/Education/Industry quick links */}
          {showConfig && masterDataLinks && masterDataLinks.length > 0 && (
            <div className="mb-5 flex justify-end">
              <div className="grid w-full grid-cols-1 gap-2.5 sm:w-auto sm:grid-cols-3 sm:gap-3">
                {masterDataLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.id}
                      href={link.href}
                      className="group flex items-center gap-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 shadow-sm transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/40 hover:shadow-md sm:min-w-48"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 dark:bg-brand-blue/20 dark:ring-brand-blue/30">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-slate-200 group-hover:text-brand-blue">{link.label}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-slate-500 transition-colors group-hover:text-brand-blue" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <ModuleInfoBanner
            icon={<FileText className="h-4 w-4" />}
            title="AI-Powered Job Descriptions"
            description="Create clear, role-specific job descriptions with responsibilities, required skills, experience, location, and hiring criteria. Published jobs become the foundation for AI Talent Match, Resume Scoring, Assessments, and AI Interviews."
          />

          <StatsCardGrid>
            <StatsCard tone="neutral" active={isOverviewCardActive('all')} showClickArrow icon={Briefcase} label="Total Jobs" value={stats.total} sparkline={false} onClick={() => openListView('all')} />
            <StatsCard tone="neutral" active={isOverviewCardActive('published')} showClickArrow icon={CheckCircle2} label="Published" value={stats.published} sparkline={false} onClick={() => openListView('published')} />
            <StatsCard tone="neutral" active={isOverviewCardActive('draft')} showClickArrow icon={FileText} label="Drafts" value={stats.draft} sparkline={false} onClick={() => openListView('draft')} />
            <StatsCard tone="neutral" active={isOverviewCardActive('archived')} showClickArrow icon={Archive} label="Archived" value={stats.archived} sparkline={false} onClick={() => openListView('archived')} />
          </StatsCardGrid>


        </div>

        {pageView === 'list' && (
        <>
        <div ref={listSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Consolidated toolbar: Search + Filters + Tabs + Select all + Sort */}
        <div className="bg-white rounded-xl border border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
          {/* Row 1: Search + View toggle + More Filters — the canonical toolbar,
              now shared via <ListToolbar> so other list pages match this one. */}
          <ListToolbar
            searchValue={search.query}
            onSearchChange={search.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search jobs..."
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onToggleFilters={() => setShowAdvancedFilters(!showAdvancedFilters)}
            filtersOpen={showAdvancedFilters}
            activeFilterCount={activeFiltersCount}
            filtersApplied={filtersActive}
            onClearFilters={clearAllFilters}
            countBadge={
              <ListCountBadge
                filtered={sortedJobs.length}
                total={distinctJobs.length}
                noun="job"
                selected={selectedJobs.size}
              />
            }
          />

          {/* Row 2: Status tabs + AI/Manual + Clear */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-sm text-gray-600">Show:</span>
            {['all', 'Published', 'Draft', 'Disabled', 'Archived'].map((status) => (
              <button
                key={status}
                onClick={() => search.setFilter('status', status.toLowerCase())}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                  statusFilter.toLowerCase() === status.toLowerCase()
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : 'bg-brand-blue/5 text-gray-700 hover:bg-brand-blue/10 hover:text-brand-blue'
                }`}
              >
                {status === 'all' ? 'All Jobs' : status}
              </button>
            ))}
            <div className="flex items-center gap-2 sm:ml-2 sm:border-l sm:border-gray-200 sm:pl-3">
              <div className="flex items-center bg-brand-blue/5 ring-1 ring-brand-blue/10 rounded-lg p-1">
                <button
                  onClick={() => search.setFilter('creationMethod', creationMethodFilter === 'ai' ? null : 'ai')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    creationMethodFilter === 'ai'
                      ? 'bg-white text-brand-blue-2 shadow-sm shadow-brand-blue/10'
                      : 'text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">AI Generated</span>
                  <span className="sm:hidden">AI</span>
                </button>
                <button
                  onClick={() => search.setFilter('creationMethod', creationMethodFilter === 'manual' ? null : 'manual')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    creationMethodFilter === 'manual'
                      ? 'bg-white text-brand-blue-2 shadow-sm shadow-brand-blue/10'
                      : 'text-gray-600 hover:text-brand-blue'
                  }`}
                >
                  <Edit className="w-3.5 h-3.5" />
                  Manual
                </button>
              </div>
            </div>
          </div>

          {/* More Filters Panel (collapsible) */}
          {showAdvancedFilters && (
            <div className="mb-3 pt-3 border-t border-brand-blue/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {uniqueLocations.length > 1 && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Location</label>
                    <select
                      value={locationFilter}
                      onChange={(e) => search.setFilter('location', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                    >
                      <option value="all">All Locations</option>
                      {uniqueLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                )}
                {uniqueDepartments.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Department</label>
                    <select
                      value={departmentFilter}
                      onChange={(e) => search.setFilter('department', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                    >
                      <option value="all">All Departments</option>
                      {uniqueDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                )}
                {uniqueEmploymentTypes.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Job Type</label>
                    <select
                      value={employmentTypeFilter}
                      onChange={(e) => search.setFilter('employmentType', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                    >
                      <option value="all">All Types</option>
                      {uniqueEmploymentTypes.map(type => (
                        <option key={type} value={type}>{formatEmploymentType(type)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {uniqueIndustries.length > 0 && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Industry</label>
                    <select
                      value={industryFilter}
                      onChange={(e) => search.setFilter('industry', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                    >
                      <option value="all">All Industries</option>
                      {uniqueIndustries.map(industry => (
                        <option key={industry} value={industry}>{formatIndustryType(industry)}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5 font-medium">Experience</label>
                  <select
                    value={experienceFilter}
                    onChange={(e) => search.setFilter('experience', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                  >
                    <option value="all">All Levels</option>
                    <option value="entry">Entry Level (0-2 years)</option>
                    <option value="junior">Junior Level (2-4 years)</option>
                    <option value="mid">Mid Level (5-7 years)</option>
                    <option value="senior">Senior Level (8-10 years)</option>
                    <option value="architect">Architect Level (10+ years)</option>
                    <option value="management">Management Level (10+ years)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5 font-medium">Posted From</label>
                  <input
                    type="date"
                    value={datePostedFromFilter}
                    onChange={(e) => search.setFilter('datePostedFrom', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5 font-medium">Posted To</label>
                  <input
                    type="date"
                    value={datePostedToFilter}
                    onChange={(e) => search.setFilter('datePostedTo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                  />
                </div>
              </div>

              {/* Panel footer: "Done" applies the selected filters and reveals
                  the Clear button next to the More Filters button. */}
              <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                <button
                  // The controls above commit as they change, so Done just closes.
                  onClick={() => setShowAdvancedFilters(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Row 3: Select all + Bulk Actions + count + Sort */}
          {sortedJobs.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button
                  onClick={handleSelectAll}
                  className={`group inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full border text-sm font-medium transition-all ${
                    selectedJobs.size > 0
                      ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
                      : 'bg-white text-gray-700 border-gray-400 hover:border-brand-blue/40 hover:text-brand-blue'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                    selectedJobs.size > 0 ? 'bg-white/20' : 'bg-gray-100 group-hover:bg-brand-blue/10'
                  }`}>
                    {selectedJobs.size === sortedJobs.length && sortedJobs.length > 0 ? (
                      <CheckSquare className={`w-3.5 h-3.5 ${selectedJobs.size > 0 ? 'text-white' : 'text-brand-blue'}`} />
                    ) : selectedJobs.size > 0 ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-blue" />
                    )}
                  </span>
                  <span>
                    {selectedJobs.size > 0
                      ? `${selectedJobs.size} selected`
                      : 'Select all'}
                  </span>
                </button>

                {/* Bulk Actions Dropdown */}
                {selectedJobs.size > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowBulkActions(!showBulkActions)}
                      className="h-9 px-3.5 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-full shadow-sm shadow-brand-blue/25 transition-all flex items-center gap-1.5 text-sm font-medium"
                    >
                      <span>Bulk Actions</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {showBulkActions && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {canUpdateJd && (
                          <button
                            onClick={handleBulkPublish}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Send className="w-4 h-4 text-green-600" />
                            Publish Selected (Drafts)
                          </button>
                        )}
                        {canDisableJd && (
                          <button
                            onClick={handleBulkDisable}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Ban className="w-4 h-4 text-red-600" />
                            Disable Selected (Published)
                          </button>
                        )}
                        {canArchiveJd && (
                          <button
                            onClick={handleBulkArchive}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Archive className="w-4 h-4 text-gray-600" />
                            Archive Selected
                          </button>
                        )}
                        {(canExportJd || (canDeleteJd && onBulkDelete)) && <div className="border-t border-gray-200 my-2" />}
                        {canExportJd && (
                          <button
                            onClick={handleBulkExport}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Download className="w-4 h-4 text-gray-700" />
                            Export Selected to CSV
                          </button>
                        )}
                        {canDeleteJd && onBulkDelete && (
                          <button
                            onClick={handleBulkDelete}
                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
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

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500">Sort by</span>
                <div className="inline-flex items-center bg-gray-50 border border-gray-400 rounded-full p-0.5 hover:border-brand-blue/30 transition-colors">
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        const value = e.target.value as 'date' | 'applicants' | 'title' | 'status' | 'industry';
                        setSortBy(value);
                      }}
                      className="appearance-none h-8 pl-3 pr-8 bg-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-sm font-medium text-gray-800 cursor-pointer"
                    >
                      <option value="date">Date Posted</option>
                      <option value="applicants">Applicants</option>
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
                    className="ml-0.5 h-8 w-8 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-brand-blue/10 hover:border-brand-blue/30 hover:text-brand-blue transition-colors cursor-pointer"
                    title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                  >
                    <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${sortOrder === 'asc' ? '' : 'rotate-180'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Jobs Grid/List */}
        {currentJobs.length > 0 ? (
          viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentJobs.map(job => {
                const displayStatus = getDisplayStatus(job.status, job.currentVersion);
                const statusConfig = getStatusConfig(displayStatus);
                const creationMethodConfig = getCreationMethodConfig(job.creation_method);

                return (
                  <div
                    key={job.id}
                    className={`relative bg-white rounded-xl border transition-all duration-150 cursor-pointer ${activeDropdown === job.id ? 'z-[9999]' : 'z-0'} ${selectedJobs.has(job.id) ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30' : 'border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'}`}
                    onClick={() => job.status.toLowerCase() === 'draft' && onEditJob ? onEditJob(job) : onViewJob(job)}
                  >
                    {/* Card Header */}
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {/* Individual Select */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                            className="flex-shrink-0"
                            title={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                          >
                            {selectedJobs.has(job.id)
                              ? <CheckSquare className="w-4 h-4 text-brand-blue" />
                              : <Square className="w-4 h-4 text-gray-400 hover:text-brand-blue" />
                            }
                          </button>
                          <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Briefcase className="h-4 w-4 text-brand-blue" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
                            {displayStatus}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${creationMethodConfig.bg} ${creationMethodConfig.text} border ${creationMethodConfig.border} flex items-center gap-1.5`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${creationMethodConfig.dot}`}></div>
                            {creationMethodConfig.label}
                          </span>
                          {job.versionNumber && job.versionNumber >= 1 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                              v{job.versionNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        {job.job_id && (
                          <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20">
                            {job.job_id}
                          </span>
                        )}
                        <h3 className="text-sm sm:text-base font-medium text-gray-900 line-clamp-2">
                          {job.title}
                        </h3>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4">
                      <div className="space-y-2 mb-4">
                        {job.department && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{job.department}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{formatIndustryType(job.industry_type)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{job.location && job.location.trim() ? job.location : '-'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{formatEmploymentType(job.employmentType)}</span>
                        </div>
                        {(job as any).workMode && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="capitalize">{(job as any).workMode}</span>
                          </div>
                        )}
                        {job.experience && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <TrendingUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span>{job.experience}</span>
                          </div>
                        )}
                        {job.postedDate && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span>Posted {formatISTDate(job.postedDate)}</span>
                          </div>
                        )}
                        {job.postedBy && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">By {job.postedBy}</span>
                          </div>
                        )}
                        {job.updated_at && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">Last Updated: {formatLastUpdated(job.updated_at)}</span>
                          </div>
                        )}
                      </div>

                      {/* Salary & Skills Info */}
                      <div className="space-y-2 mb-4">
                        {(job as any).salary && (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
                            <DollarSign className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-green-700">{(job as any).salary}</span>
                          </div>
                        )}
                        {((job as any).mustHaveSkills?.length > 0 || (job as any).niceToHaveSkills?.length > 0) && (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                            <Target className="w-4 h-4 text-gray-700" />
                            <span className="text-sm text-gray-700">
                              {(job as any).mustHaveSkills?.length || 0} required + {(job as any).niceToHaveSkills?.length || 0} preferred skills
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Applicants */}
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg mb-4">
                        <Users className="w-4 h-4 text-gray-600" />
                        <span className="text-sm text-gray-700">
                          {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 items-center">
                        {/* Edit Button - icon only (hidden for Disabled JDs) */}
                        {onEditJob && !['disabled', 'archived'].includes(job.status.toLowerCase()) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditJob(job); }}
                            className="p-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            aria-label="Edit" title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* View Button - icon only, hide for Draft */}
                        {job.status.toLowerCase() !== 'draft' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewJob(job); }}
                            className="p-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            aria-label="View" title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}

                        {/* Three-dot Menu - Grid View */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === job.id ? null : job.id);
                            }}
                            className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                          {activeDropdown === job.id && (
                            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999]">
                              {/* View Applicants - Hide for Draft */}
                              {job.status.toLowerCase() !== 'draft' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    (onViewApplicants || onViewJob)(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Users className="w-4 h-4" />
                                  View Applicants
                                </button>
                              )}
                              {/* Quick Actions — mirror the Job Details "Quick Actions" panel */}
                              {onAIMatch && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAIMatch(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Brain className="w-4 h-4" />
                                  AI Talent Match
                                </button>
                              )}
                              {onScoreResumes && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onScoreResumes(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Target className="w-4 h-4" />
                                  Score Resumes
                                </button>
                              )}
                              {/* Disable Job for Published */}
                              {job.status === 'Published' && onDisableJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDisableJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  <Ban className="w-4 h-4" />
                                  Disable Job
                                </button>
                              )}
                              {/* Re-enable JD for Disabled */}
                              {job.status === 'Disabled' && onRepublishJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRepublishJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-green-700 hover:bg-green-50"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Re-enable JD
                                </button>
                              )}
                              {/* Archive Job */}
                              {job.status !== 'Archived' && onArchiveJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onArchiveJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Archive className="w-4 h-4" />
                                  Archive Job
                                </button>
                              )}
                              {/* Unarchive Job */}
                              {job.status === 'Archived' && onUnarchiveJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnarchiveJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-green-700 hover:bg-green-50"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                  Unarchive Job
                                </button>
                              )}
                              {/* Delete Job */}
                              {onDeleteJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Job
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // List View
            <div className="space-y-3">
              {currentJobs.map(job => {
                const displayStatus = getDisplayStatus(job.status, job.currentVersion);
                const statusConfig = getStatusConfig(displayStatus);
                const creationMethodConfig = getCreationMethodConfig(job.creation_method);
                const versionKey = job.job_id || job.id;
                const versionsExpanded = expandedVersions.has(versionKey);
                /* Only jobs with MORE THAN ONE version get the control.
                   `versionNumber` is the row's own place in the lineage — the
                   number already on screen in the vN chip — so anything past v1
                   has earlier versions to show. The second test catches the
                   case where the list returned the siblings itself and this row
                   happens to be v1 — counting DISTINCT version numbers, not
                   rows: a republished JD arrives as several rows sharing the
                   same job_id and the same v1, and a raw row count read those
                   duplicates as "multiple versions", putting View Versions on
                   single-version jobs. */
                const distinctVersionCount = new Set(
                  (allVersionGroups.get(versionKey) ?? [job]).map((sibling) => sibling.versionNumber ?? 1),
                ).size;
                const hasVersionHistory =
                  (job.versionNumber ?? 1) > 1 || distinctVersionCount > 1;
                const lineage = versionLineages[versionKey];
                const lineageLoading = loadingLineages.has(versionKey);
                /* The row above IS the latest version — repeating it in the
                   history would duplicate what the user is already looking at,
                   so only previous versions are listed. The id check backstops
                   a lineage row whose is_latest_version flag is missing. */
                const jobVersions = (lineage ?? []).filter(
                  (v) => !v.is_latest_version && v.id !== job.id,
                );

                return (
                  <div
                    key={job.id}
                    className={`relative bg-white rounded-xl border transition-all duration-150 cursor-pointer p-4 ${activeDropdown === job.id ? 'z-[9999]' : 'z-0'} ${selectedJobs.has(job.id) ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30' : 'border-gray-300 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'}`}
                    onClick={() => job.status.toLowerCase() === 'draft' && onEditJob ? onEditJob(job) : onViewJob(job)}
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                      {/* Individual Select + Job Icon */}
                      <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                          title={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                        >
                          {selectedJobs.has(job.id)
                            ? <CheckSquare className="w-4 h-4 text-brand-blue" />
                            : <Square className="w-4 h-4 text-gray-400 hover:text-brand-blue" />
                          }
                        </button>
                        <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center">
                          <Briefcase className="h-4 w-4 text-brand-blue" />
                        </div>
                      </div>

                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {job.job_id && (
                            <span className="px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20 flex-shrink-0">
                              {job.job_id}
                            </span>
                          )}
                          <h3 className="text-sm sm:text-base font-medium text-gray-900 truncate">
                            {job.title}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
                            {displayStatus}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${creationMethodConfig.bg} ${creationMethodConfig.text} border ${creationMethodConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${creationMethodConfig.dot}`}></div>
                            {creationMethodConfig.label}
                          </span>
                          {job.versionNumber && job.versionNumber >= 1 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                              v{job.versionNumber}
                            </span>
                          )}
                        </div>

                        {/* Primary Info Row 1 - Company / Role / Location / Employment */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 mb-1.5">
                          {job.department && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-gray-400" />
                              {job.department}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            {formatIndustryType(job.industry_type)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            {job.location && job.location.trim() ? job.location : '-'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4 text-gray-400" />
                            {formatEmploymentType(job.employmentType)}
                          </span>
                          {(job as any).workMode && (
                            <span className="flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-gray-400" />
                              <span className="capitalize">{(job as any).workMode}</span>
                            </span>
                          )}
                        </div>

                        {/* Primary Info Row 2 - Experience / Dates / Posted By / Applicants */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 mb-2">
                          {job.experience && (
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-gray-400" />
                              {job.experience}
                            </span>
                          )}
                          {job.postedDate && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              Posted {formatISTDate(job.postedDate)}
                            </span>
                          )}
                          {job.postedBy && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-gray-400" />
                              By {job.postedBy}
                            </span>
                          )}
                          {job.updated_at && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-400" />
                              Last Updated: {formatLastUpdated(job.updated_at)}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 rounded-lg">
                            <Users className="w-4 h-4 text-gray-400" />
                            {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                          </span>
                        </div>

                        {/* Additional Info Row - Salary & Skills */}
                        <div className="flex items-center flex-wrap gap-2">
                          {(job as any).salary && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 rounded-lg text-sm">
                              <DollarSign className="w-4 h-4 text-green-600" />
                              <span className="text-green-700">{(job as any).salary}</span>
                            </div>
                          )}
                          {((job as any).mustHaveSkills?.length > 0 || (job as any).niceToHaveSkills?.length > 0) && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-lg text-sm">
                              <Target className="w-4 h-4 text-gray-700" />
                              <span className="text-gray-700">
                                {(job as any).mustHaveSkills?.length || 0} required + {(job as any).niceToHaveSkills?.length || 0} preferred
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions — a full-height column: icon row pinned at
                          the top, View Versions pinned at the bottom-right
                          corner of the card. self-stretch + justify-between
                          make the column span the row's full height (set by
                          the job info beside it), so the button lands flush
                          with the right edge, level with the card's last
                          content row. */}
                      <div className="flex flex-col items-end justify-between gap-2 self-stretch flex-shrink-0">
                      <div className="flex flex-wrap gap-2 items-start justify-end">
                        {/* Edit Button - icon only (hidden for Disabled JDs) */}
                        {onEditJob && !['disabled', 'archived'].includes(job.status.toLowerCase()) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditJob(job); }}
                            className="h-7 w-7 flex items-center justify-center bg-white text-brand-orange border border-brand-orange/40 rounded-md hover:bg-brand-orange/10 hover:border-brand-orange transition-all"
                            aria-label="Edit" title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* View Button - icon only, hide for Draft */}
                        {job.status.toLowerCase() !== 'draft' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewJob(job); }}
                            className="h-7 w-7 flex items-center justify-center bg-white text-brand-blue border border-brand-blue/40 rounded-md hover:bg-brand-blue/10 hover:border-brand-blue transition-all"
                            aria-label="View" title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Three-dot Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === job.id ? null : job.id);
                            }}
                            className="h-7 w-7 flex items-center justify-center bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-all"
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
                          </button>
                          {activeDropdown === job.id && (
                            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]">
                              {/* View Applicants - Hide for Draft */}
                              {job.status.toLowerCase() !== 'draft' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    (onViewApplicants || onViewJob)(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Users className="w-4 h-4" />
                                  View Applicants
                                </button>
                              )}
                              {/* Quick Actions — mirror the Job Details "Quick Actions" panel */}
                              {onAIMatch && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAIMatch(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Brain className="w-4 h-4" />
                                  AI Talent Match
                                </button>
                              )}
                              {onScoreResumes && !['draft', 'disabled', 'archived'].includes(job.status.toLowerCase()) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onScoreResumes(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Target className="w-4 h-4" />
                                  Score Resumes
                                </button>
                              )}
                              {/* Disable Job for Published */}
                              {job.status === 'Published' && onDisableJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDisableJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  <Ban className="w-4 h-4" />
                                  Disable Job
                                </button>
                              )}
                              {/* Re-enable JD for Disabled */}
                              {job.status === 'Disabled' && onRepublishJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRepublishJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  Re-enable JD
                                </button>
                              )}
                              {/* Archive Job */}
                              {job.status !== 'Archived' && onArchiveJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onArchiveJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Archive className="w-4 h-4" />
                                  Archive Job
                                </button>
                              )}
                              {/* Unarchive Job */}
                              {job.status === 'Archived' && onUnarchiveJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnarchiveJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                  Unarchive Job
                                </button>
                              )}
                              {/* Delete Job */}
                              {onDeleteJob && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteJob(job);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Job
                                </button>
                              )}
                            </div>
                          )}
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
                                ? 'bg-brand-sky text-brand-blue border-brand-blue/30 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10'
                                : 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/30 hover:bg-brand-blue-2'
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
                        gains a second entry for the same job. The connector is
                        drawn per row rather than as one spine: each row owns a
                        vertical segment down to its own centre plus a stub, and
                        the last row omits the segment below centre, which is
                        what turns the run into a tree that closes off instead
                        of a line dangling past the final version.

                        Click is stopped here — the card itself opens the job,
                        and a click meant for a version must not be read as a
                        click on the row behind it. */}
                    {versionsExpanded && (
                      <div
                        className="mt-3 pt-3 border-t border-gray-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2 mb-2.5">
                          <FileText className="w-4 h-4 text-brand-blue" />
                          <p className="text-sm font-semibold text-gray-900">Version History</p>
                        </div>
                        {lineageLoading && !lineage ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Loading versions...
                          </div>
                        ) : jobVersions.length === 0 ? (
                          <p className="py-2 text-xs text-gray-500">No other versions of this job.</p>
                        ) : (
                          /* Table format mirrors the main list's columns so a
                             version row reads like the job row above it. Every
                             cell is real data — lineage fields plus the
                             version's own JD record; anything still loading or
                             unavailable shows a dash, never a placeholder. */
                          /* Full container width: the table fills the card and
                             distributes its columns across the available
                             space, so there is no dead white strip on the
                             right. The min-width keeps narrow screens
                             scrolling inside the shell instead of crushing the
                             columns. The brand-tinted border marks this as the
                             ACTIVE version table — it only exists while View
                             Versions is open. */
                          /* One shell owns BOTH scroll axes (x on narrow
                             screens, y past 3 rows), so header and body live
                             in one <table> and their columns can never drift
                             apart. The y-cap only exists when there are more
                             than 3 versions: header (~37px) + 3 typical
                             two-line rows (~66px each). The header row is
                             sticky top; the Action column is sticky right;
                             the Action HEADER is pinned on both axes so the
                             corner never scrolls away. */
                          <div
                            className={`overflow-x-auto rounded-lg border border-brand-blue/50 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 ${
                              jobVersions.length > 3 ? 'overflow-y-auto max-h-[240px] overscroll-contain' : ''
                            }`}
                          >
                            <table className="w-full min-w-[960px] text-left">
                              <thead>
                                {/* Header tint: bg-brand-sky (light sky blue).
                                    To revert to the peach, swap bg-brand-sky
                                    back to bg-brand-peach — it is on every th
                                    below, NOT on the tr: a sticky th only
                                    carries a background painted on the cell
                                    itself, and a bg-less th lets body text
                                    show through (the mobile header-overlap
                                    bug). The bottom hairline is an inset
                                    shadow, not border-b — collapsed-table
                                    borders detach from sticky cells and would
                                    scroll away with the body. Each column
                                    declares a min width so the auto layout
                                    can't crush headings into each other on
                                    narrow screens. */}
                                <tr>
                                  {[
                                    { label: 'Version', minW: 'min-w-[72px]' },
                                    { label: 'Job Title', minW: 'min-w-[160px]' },
                                    { label: 'Status', minW: 'min-w-[110px]' },
                                    { label: 'Experience / Industry', minW: 'min-w-[150px]' },
                                    { label: 'Location', minW: 'min-w-[120px]' },
                                    { label: 'Work Mode / Type', minW: 'min-w-[130px]' },
                                    { label: 'Posted On / By', minW: 'min-w-[130px]' },
                                    { label: 'Last Updated', minW: 'min-w-[110px]' },
                                    { label: 'Applicants', minW: 'min-w-[90px]' },
                                    { label: 'Action', minW: 'min-w-[64px]' },
                                  ].map(({ label, minW }) => (
                                    <th
                                      key={label}
                                      /* z order, back to front: body cells
                                         (auto) < sticky Action td (5) <
                                         sticky header (7) < Action corner (8)
                                         — so rows slide under the header and
                                         the header slides under nothing. */
                                      className={`sticky top-0 py-2.5 px-3 text-xs font-bold text-gray-900 whitespace-nowrap bg-brand-sky ${minW} ${
                                        label === 'Action'
                                          ? 'right-0 z-[8] shadow-[inset_0_-1px_0_#e5e7eb,-1px_0_0_0_#e5e7eb]'
                                          : 'z-[7] shadow-[inset_0_-1px_0_#e5e7eb]'
                                      }`}
                                    >
                                      {label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {jobVersions.map((version) => {
                                  /* Lineage rows carry the raw DB status ('published');
                                     the status helpers here speak the Job type's
                                     capitalised form. */
                                  const rawStatus = version.status || '';
                                  const versionStatus = getDisplayStatus(
                                    rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase(),
                                    version.current_version,
                                  );
                                  const versionStatusConfig = getStatusConfig(versionStatus);
                                  /* A Job-shaped stand-in pointed at THIS
                                     version's id, so the ⋮ menu below reuses
                                     the exact same handlers the latest-version
                                     row's menu calls — no duplicate logic. The
                                     plain capitalised status (not the display
                                     label, which can read "Republished")
                                     drives the same per-status gates. */
                                  const versionPlainStatus = rawStatus
                                    ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()
                                    : job.status;
                                  const versionJob: Job = {
                                    ...job,
                                    id: version.id,
                                    title: version.title || job.title,
                                    status: versionPlainStatus as Job['status'],
                                    currentVersion: version.current_version ?? job.currentVersion,
                                    versionNumber: version.version_number,
                                  };
                                  const detail = versionDetails[version.id];
                                  const experienceText = detail
                                    ? formatJobExperienceText({
                                        jobLevel: detail.job_level || detail.experience_level,
                                        experienceMin: detail.experience_min,
                                        experienceMax: detail.experience_max,
                                      })
                                    : '';
                                  const postedOn = version.published_at || detail?.published_at || version.created_at || detail?.created_at;
                                  const lastUpdated = detail?.updated_at || version.published_at || version.created_at;
                                  /* NO transform on the row itself: a
                                     transformed <tr> becomes the containing
                                     block for its cells, which silently kills
                                     position:sticky on the pinned Action cell.
                                     The hover pop lives on the Job Title text
                                     instead (group-hover below). */
                                  return (
                                    <tr
                                      key={version.id}
                                      className="group transition-colors duration-200 ease-out hover:bg-brand-blue/[0.03]"
                                    >
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20">
                                            v{version.version_number ?? 1}
                                          </span>
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-sm text-gray-900 max-w-[220px] overflow-hidden align-middle" title={version.title || detail?.title || ''}>
                                        {/* The "job role" pops on row hover — a
                                            gentle scale from the left edge with
                                            a smooth transition. Scoped to this
                                            span so the sticky Action column is
                                            unaffected. */}
                                        <span className="inline-block max-w-full truncate transform-gpu transition-transform duration-200 ease-out origin-left group-hover:scale-105">
                                          {version.title || detail?.title || '—'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                        <div className="flex flex-col items-start gap-1">
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${versionStatusConfig.bg} ${versionStatusConfig.text} border ${versionStatusConfig.border}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${versionStatusConfig.dot}`} />
                                            {versionStatus}
                                          </span>
                                          {/* AI / Manual — same badge the job rows
                                              carry, from this version's own record.
                                              Rendered only once the detail fetch
                                              lands so a loading row doesn't claim
                                              "Manual" by default. */}
                                          {detail && (() => {
                                            const methodConfig = getCreationMethodConfig(detail.creation_method);
                                            return (
                                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${methodConfig.bg} ${methodConfig.text} border ${methodConfig.border}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${methodConfig.dot}`} />
                                                {methodConfig.label}
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </td>
                                      {/* Experience / Industry — one column,
                                          stacked, same space-saving treatment
                                          as Posted On / By below. Industry is
                                          run through the same formatter as the
                                          job rows so it never shows the raw
                                          snake_case value. */}
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                        <div className="text-sm text-gray-700">
                                          {experienceText || '—'}
                                        </div>
                                        <div className="text-xs text-gray-500 max-w-[180px] truncate" title={detail?.industry_type ? formatIndustryType(detail.industry_type) : ''}>
                                          {detail?.industry_type ? formatIndustryType(detail.industry_type) : '—'}
                                        </div>
                                      </td>
                                      {/* Location — this version's own record;
                                          single field first, else the cities
                                          from the locations list. */}
                                      {(() => {
                                        const locationText =
                                          detail?.location
                                          || (detail?.locations || []).map((loc: any) => loc?.city).filter(Boolean).join(', ');
                                        return (
                                          <td className="py-2.5 px-3 text-sm text-gray-700 whitespace-nowrap max-w-[160px] truncate align-middle" title={locationText || ''}>
                                            {locationText || '—'}
                                          </td>
                                        );
                                      })()}
                                      {/* Work Mode / Type — stacked: employment
                                          type over remote mode, from this
                                          version's own record. A missing half
                                          simply drops out; nothing is invented. */}
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                        <div className="text-sm text-gray-700">
                                          {detail?.employment_type ? formatEmploymentType(detail.employment_type) : '—'}
                                        </div>
                                        {detail?.remote_type && (
                                          <div className="text-xs text-gray-500">
                                            {formatEmploymentType(detail.remote_type)}
                                          </div>
                                        )}
                                      </td>
                                      {/* Posted On / By — one column, date over
                                          author, so the table stays narrower
                                          without dropping either fact. */}
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                        <div className="text-sm text-gray-700">
                                          {postedOn ? formatISTDate(postedOn) : '—'}
                                        </div>
                                        <div className="text-xs text-gray-500 max-w-[160px] truncate" title={detail?.created_by_name || ''}>
                                          {detail?.created_by_name || '—'}
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3 text-sm text-gray-700 whitespace-nowrap align-middle">
                                        {lastUpdated ? formatISTDate(lastUpdated) : '—'}
                                      </td>
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                                          <Users className="w-4 h-4 text-gray-400" />
                                          {detail?.applicants_count ?? '—'}
                                        </span>
                                      </td>
                                      {/* Action — pinned right so it stays
                                          reachable while the table scrolls
                                          sideways. Opaque background (plus a
                                          solid hover tint matching the row's
                                          translucent one) so content sliding
                                          underneath never shows through; the
                                          left hairline makes it read as
                                          floating over the scrolling cells. */}
                                      <td className="py-2.5 px-3 whitespace-nowrap align-middle sticky right-0 z-[5] bg-white group-hover:bg-[#f8f9fc] shadow-[-1px_0_0_0_#e5e7eb] transition-colors duration-200">
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-colors"
                                                title="More actions"
                                                aria-label="More actions"
                                              >
                                                <MoreVertical className="w-4 h-4" />
                                              </button>
                                            </DropdownMenuTrigger>
                                            {/* Same options, gates and handlers
                                                as the latest-version row's ⋮
                                                menu, driven by versionJob so
                                                every action targets this
                                                version's own id. */}
                                            <DropdownMenuContent align="end" className="w-52">
                                              <DropdownMenuItem asChild>
                                                <Link href={`/recruitment/job-details?id=${version.id}`}>
                                                  <Eye className="w-4 h-4" />
                                                  View Details
                                                </Link>
                                              </DropdownMenuItem>
                                              {/* View Applicants - Hide for Draft */}
                                              {versionJob.status.toLowerCase() !== 'draft' && (
                                                <DropdownMenuItem onSelect={() => (onViewApplicants || onViewJob)(versionJob)}>
                                                  <Users className="w-4 h-4" />
                                                  View Applicants
                                                </DropdownMenuItem>
                                              )}
                                              {/* Quick Actions — same gates as the latest-version menu */}
                                              {onAIMatch && !['draft', 'disabled', 'archived'].includes(versionJob.status.toLowerCase()) && (
                                                <DropdownMenuItem onSelect={() => onAIMatch(versionJob)}>
                                                  <Brain className="w-4 h-4" />
                                                  AI Talent Match
                                                </DropdownMenuItem>
                                              )}
                                              {onScoreResumes && !['draft', 'disabled', 'archived'].includes(versionJob.status.toLowerCase()) && (
                                                <DropdownMenuItem onSelect={() => onScoreResumes(versionJob)}>
                                                  <Target className="w-4 h-4" />
                                                  Score Resumes
                                                </DropdownMenuItem>
                                              )}
                                              {/* Disable Job for Published */}
                                              {versionJob.status === 'Published' && onDisableJob && (
                                                <DropdownMenuItem
                                                  onSelect={() => onDisableJob(versionJob)}
                                                  className="text-orange-700 focus:text-orange-700"
                                                >
                                                  <Ban className="w-4 h-4" />
                                                  Disable Job
                                                </DropdownMenuItem>
                                              )}
                                              {/* Re-enable JD for Disabled */}
                                              {versionJob.status === 'Disabled' && onRepublishJob && (
                                                <DropdownMenuItem
                                                  onSelect={() => onRepublishJob(versionJob)}
                                                  className="text-green-700 focus:text-green-700"
                                                >
                                                  <CheckCircle2 className="w-4 h-4" />
                                                  Re-enable JD
                                                </DropdownMenuItem>
                                              )}
                                              {/* Archive Job */}
                                              {versionJob.status !== 'Archived' && onArchiveJob && (
                                                <DropdownMenuItem onSelect={() => onArchiveJob(versionJob)}>
                                                  <Archive className="w-4 h-4" />
                                                  Archive Job
                                                </DropdownMenuItem>
                                              )}
                                              {/* Unarchive Job */}
                                              {versionJob.status === 'Archived' && onUnarchiveJob && (
                                                <DropdownMenuItem
                                                  onSelect={() => onUnarchiveJob(versionJob)}
                                                  className="text-green-700 focus:text-green-700"
                                                >
                                                  <RefreshCw className="w-4 h-4" />
                                                  Unarchive Job
                                                </DropdownMenuItem>
                                              )}
                                              {/* Delete Job */}
                                              {onDeleteJob && (
                                                <DropdownMenuItem
                                                  onSelect={() => onDeleteJob(versionJob)}
                                                  className="text-red-600 focus:text-red-600"
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                  Delete Job
                                                </DropdownMenuItem>
                                              )}
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
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
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                >
                  <XCircle className="w-4 h-4" />
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={handleCreateNewJob}
                  className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 hover:shadow-md hover:shadow-brand-blue/30 transition-all text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Job
                </button>
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
              <div className="flex items-center justify-center sm:justify-end gap-1.5">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`p-2 rounded-lg border transition-all ${
                    currentPage === 1
                      ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {getPageNumbers().map((page, index) => (
                    <button
                      key={index}
                      onClick={() => typeof page === 'number' && handlePageChange(page)}
                      disabled={page === '...'}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-sm transition-all ${
                        page === currentPage
                          ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                          : page === '...'
                          ? 'text-gray-400 cursor-default'
                          : 'border border-gray-300 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`p-2 rounded-lg border transition-all ${
                    currentPage === totalPages
                      ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
      </div>

      {/* AI Match Modal */}
      {showAIMatchModal && selectedJobForAIMatch && (
        <AITalentMatchProgressPanel
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
                <div className="w-12 h-12 bg-red-100 ring-1 ring-red-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Briefcase className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-sm text-gray-600">
                  You've used {quotaInfo?.used}/{quotaInfo?.limit} job slots. Upgrade your plan to create more jobs.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row gap-2 justify-center shrink-0">
              <button
                onClick={() => setShowQuotaModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowQuotaModal(false);
                  window.location.href = '/subscription/current-plan';
                }}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-sm shadow-brand-blue/25 text-sm font-medium transition-all"
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
