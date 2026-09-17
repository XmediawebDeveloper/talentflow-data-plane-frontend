import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Sparkles, MapPin, Briefcase, Building2, Calendar, FileText, User, Users, Clock, ArrowRight, History, DollarSign, Award, TrendingUp, Search, Filter, ChevronDown, X, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';
import type { Job as SharedJob } from '@/lib/types/types';
/* The shared formatters, not local copies. Both fields arrive snake-cased from
   the JD record ("information_technology", "full_time"), and these are what the
   Resume Scoring rows this list was modelled on already run them through — so
   the same JD reads identically in both modules. */
import {
  formatEmploymentType,
  formatIndustryType,
  getDisplayStatus,
  getStatusConfig,
  groupByLineage,
  isVersionVisibleForScoring,
  lineageKey,
} from '@/lib/utils/jobOpeningDisplay';
import ListPagination from '@/components/ListPagination';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import JobVersionHistoryPanel from '@/components/jobs/JobVersionHistoryPanel';

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
  /** Raw lineage version number — see the route's own field of the same
   *  name. "View Versions" below groups/counts a job's siblings by this,
   *  not by `currentVersion` (which blends in the publish counter). */
  versionNumber?: number;
  /* Carried so the job rows can show what the Resume Scoring job rows show.
     All four already exist on the JD record; they were simply never mapped. */
  industryType?: string;
  remoteType?: string;
  postedBy?: string;
  postedDate?: string;
  createdAt?: string;
}

/**
 * This page's own `Job` → the shared `Job` type "View Versions" is built on
 * (`JobVersionHistoryPanel`, `groupByLineage`, `useJobVersionLineage` — the
 * exact same ones Resume Scoring's job picker uses), so the version history
 * shown here is that same, single implementation rather than a second one
 * that could drift from it. `daysActive`/`requiredMatch` are required by the
 * shared type but unused by anything version-history reads; 0 is a safe,
 * inert default.
 */
function toSharedJob(job: Job): SharedJob {
  return {
    id: job.id,
    job_id: job.jobId,
    title: job.title,
    status: job.status as SharedJob['status'],
    location: job.location,
    daysActive: 0,
    requiredMatch: 0,
    department: job.department,
    industry_type: job.industryType,
    experience: job.experience,
    applicants: job.applicants,
    postedDate: job.postedDate,
    postedBy: job.postedBy,
    employmentType: job.employmentType,
    workMode: job.remoteType,
    versionNumber: job.versionNumber,
    created_at: job.createdAt,
  };
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: any[];
}

interface AITalentMatchPageJobsListProps {
  jobs: Job[];
  matchHistory: MatchHistory[];
  onSelectJob: (jobId: string) => void;
  onViewHistory: () => void;
  onBack?: () => void;
}

export default function AITalentMatchPageJobsList({
  jobs,
  matchHistory,
  onSelectJob,
  onViewHistory,
  onBack
}: AITalentMatchPageJobsListProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [jobsView, setJobsView] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Radio-style single pick: choosing a job reveals its own "Run AI Match"
  // button and locks the rest of the list until it's unchecked again, rather
  // than letting several jobs be picked at once.
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const handleToggleJob = (jobId: string) => {
    setSelectedJobId(prev => (prev === jobId ? null : jobId));
  };

  // "View Versions" — the identical mechanism Resume Scoring's job picker
  // uses (JobOpeningPickerList): the shared hook/panel/lineage-grouping, over
  // EVERY version this page was handed (unfiltered — a lineage's older
  // versions are what the grouping needs to count, even though the cards
  // below only ever show the latest one per job).
  const sharedJobs = useMemo(() => jobs.map(toSharedJob), [jobs]);
  const versionGroups = useMemo(() => groupByLineage(sharedJobs), [sharedJobs]);
  const versionLineage = useJobVersionLineage();
  const { ensureVersionApplicants } = versionLineage;
  const archivedOrDisabledVersionIds = useMemo(
    () => sharedJobs
      .filter(v => ['archived', 'disabled'].includes((v.status || '').toLowerCase()))
      .map(v => v.id),
    [sharedJobs],
  );
  useEffect(() => {
    ensureVersionApplicants(archivedOrDisabledVersionIds);
  }, [archivedOrDisabledVersionIds, ensureVersionApplicants]);

  // Shared search/filter state. The selects commit as you pick, so this uses
  // `setFilter`; `onChange` returns to page 1 on every narrowing.
  const search = useListSearch({
    initialFilters: { department: '', location: '', employmentType: '' },
    onChange: () => setCurrentPage(1),
  });
  const searchQuery = search.appliedQuery;
  const {
    department: departmentFilter,
    location: locationFilter,
    employmentType: employmentTypeFilter,
  } = search.filters;


  // One row per JD LINEAGE — its latest version — kept only when THAT version
  // is Published/Active. Filtering `jobs` directly by status (the old code)
  // showed a lineage twice whenever an older version's own record was still
  // marked Published/Active in the backend even after being superseded (JD-141
  // v3 and v4 both read "Republished" and both passed the raw status test).
  // Collapsing to the latest version FIRST — the same `versionGroups` "View
  // Versions" above already builds — is what a lineage can only ever answer
  // once for.
  const publishedJobs = useMemo(() => {
    const reps: Job[] = [];
    versionGroups.forEach((bucket) => {
      // `bucket` is newest-version-first (groupByLineage's own sort).
      const latest = bucket[0];
      const localJob = jobs.find(j => j.id === latest.id);
      if (localJob && (localJob.status === 'Published' || localJob.status === 'Active')) {
        reps.push(localJob);
      }
    });
    return reps;
  }, [versionGroups, jobs]);

  // Apply filters
  const filteredJobs = publishedJobs.filter(job => {
    const matchesSearch = searchQuery === '' ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.department && job.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment = departmentFilter === '' || job.department === departmentFilter;
    const matchesLocation = locationFilter === '' || job.location === locationFilter;
    const matchesEmploymentType = employmentTypeFilter === '' || job.employmentType === employmentTypeFilter;

    return matchesSearch && matchesDepartment && matchesLocation && matchesEmploymentType;
  });

  // Get unique filter options
  const departments = Array.from(new Set(publishedJobs.map(j => j.department).filter(Boolean))) as string[];
  const locations = Array.from(new Set(publishedJobs.map(j => j.location)));
  const employmentTypes = Array.from(new Set(publishedJobs.map(j => j.employmentType).filter(Boolean))) as string[];

  // Get match history for each job
  const getJobMatchHistory = (jobId: string) => {
    return matchHistory.filter(h => h.jobId === jobId);
  };

  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // A search/filter change can hide the checked job from the list entirely —
  // every remaining row would then sit disabled with nothing checked in sight
  // to undo it. Derived rather than mirrored into its own state-plus-effect:
  // once the checked job scrolls back into view, it's still checked.
  const effectiveSelectedJobId = selectedJobId && filteredJobs.some(j => j.id === selectedJobId)
    ? selectedJobId
    : null;

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
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
            <button
              onClick={onBack}
              className="p-1.5 sm:p-2 bg-white hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200"
              aria-label="Back to Dashboard" title="Back to Dashboard"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 rotate-180" />
            </button>
          )}
          <div className="w-9 h-9 sm:w-12 sm:h-12 bg-brand-blue rounded-lg sm:rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
            <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 truncate tracking-tight">AI Talent Match - Select Job</h1>
            <p className="text-xs sm:text-sm text-gray-600 truncate">Choose a job to find the best matching candidates using AI</p>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 lg:p-5 mb-4 sm:mb-6">
        <ListToolbar
          searchValue={search.query}
          onSearchChange={search.setQuery}
          // The hook debounces into `appliedQuery`, so keystrokes pass through.
          searchDebounceMs={0}
          searchPlaceholder="Search by job title, department, or location..."
          viewMode={jobsView}
          onViewModeChange={setJobsView}
          onToggleFilters={() => setShowFilters(!showFilters)}
          filtersOpen={showFilters}
          activeFilterCount={search.activeFilterCount}
          filtersApplied={search.filtersApplied}
          onClearFilters={search.reset}
          className="mb-0"
          countBadge={
            <ListCountBadge
              filtered={filteredJobs.length}
              total={publishedJobs.length}
              noun="job"
            />
          }
        />

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Department
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => search.setFilter('department', e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white text-black"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Location
                </label>
                <select
                  value={locationFilter}
                  onChange={(e) => search.setFilter('location', e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white text-black"
                >
                  <option value="">All Locations</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Employment Type
                </label>
                <select
                  value={employmentTypeFilter}
                  onChange={(e) => search.setFilter('employmentType', e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white text-black"
                >
                  <option value="">All Types</option>
                  {employmentTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Panel footer: "Done" applies the selection and reveals the
                toolbar Clear — same flow as job-openings. Clearing lives on the
                toolbar so there is exactly one clear control. */}
            <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
              <button
                // The selects above commit as they change, so Done just closes.
                onClick={() => setShowFilters(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Jobs List */}
      {filteredJobs.length > 0 ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg lg:text-xl text-gray-900 font-medium">Available Jobs ({filteredJobs.length})</h2>
            {effectiveSelectedJobId ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue">
                  1 selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedJobId(null)}
                  className="text-sm font-medium text-brand-blue hover:text-brand-blue-2 transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-600">Check a job to run AI matching</p>
            )}
          </div>

          {jobsView === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedJobs.map((job) => {
              const jobHistory = getJobMatchHistory(job.id);
              const hasHistory = jobHistory.length > 0;
              const latestMatch = hasHistory ? jobHistory[jobHistory.length - 1] : null;
              const isSelected = effectiveSelectedJobId === job.id;
              const isDisabled = effectiveSelectedJobId !== null && !isSelected;

              // "View Versions" — see the setup above this list for what each
              // of these reads.
              const sharedJob = toSharedJob(job);
              const versionKey = lineageKey(sharedJob);
              const versionsExpanded = versionLineage.isExpanded(versionKey);
              const lineageSiblings = versionGroups.get(versionKey) ?? [sharedJob];
              const visibleVersionCount = new Set(
                lineageSiblings
                  .filter(sibling => isVersionVisibleForScoring(sibling.status, sibling.id, versionLineage.versionApplicants))
                  .map(sibling => sibling.versionNumber ?? 1),
              ).size;
              const hasVersionHistory = visibleVersionCount > 1;

              return (
                <div
                  key={job.id}
                  className={`rounded-xl border transition-all duration-150 flex flex-col ${
                    isDisabled
                      ? 'bg-gray-50 dark:bg-slate-900/60 border-gray-100 dark:border-slate-800 opacity-50 cursor-not-allowed'
                      : `bg-white dark:bg-slate-900 cursor-pointer ${
                          isSelected
                            ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30'
                            : 'border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'
                        }`
                  }`}
                  onClick={() => { if (!isDisabled) handleToggleJob(job.id); }}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (!isDisabled) handleToggleJob(job.id); }}
                          disabled={isDisabled}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
                          title={isSelected ? 'Deselect' : 'Select'}
                          aria-label={isSelected ? 'Deselect job' : 'Select job'}
                        >
                          <input
                            type="radio"
                            checked={isSelected}
                            disabled={isDisabled}
                            readOnly
                            className="w-4 h-4 text-brand-blue border-gray-300 focus:ring-brand-blue/40 cursor-pointer pointer-events-none disabled:cursor-not-allowed"
                          />
                        </button>
                        <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Briefcase className="h-4 w-4 text-brand-blue" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {job.currentVersion && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-cyan"></div>
                            v{job.currentVersion}
                          </span>
                        )}
                        {job.currentVersion && (
                          <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1.5 border ${
                            job.currentVersion > 1
                              ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                              : 'bg-green-50 text-green-700 border-green-200'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${job.currentVersion > 1 ? 'bg-brand-orange' : 'bg-green-500'}`}></div>
                            {job.currentVersion > 1 ? 'Republished' : 'Published'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {job.jobId && (
                        <JobIdBadge>{job.jobId}</JobIdBadge>
                      )}
                      <h3
                        className="text-sm sm:text-base font-medium text-gray-900 line-clamp-2 flex-1 min-w-0"
                        title={job.title}
                      >
                        {job.title}
                      </h3>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="space-y-2 mb-4">
                      {job.department && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{job.department}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{job.location && job.location.trim() ? job.location : '-'}</span>
                      </div>
                      {job.employmentType && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{job.employmentType}</span>
                        </div>
                      )}
                      {job.experience && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <TrendingUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span>{job.experience}</span>
                        </div>
                      )}
                    </div>

                    {/* Applicants */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-lg mb-3">
                      <User className="w-4 h-4 text-brand-blue" />
                      <span className="text-sm text-brand-blue font-medium">
                        {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </div>

                    {/* Match History */}
                    {hasHistory && latestMatch && (
                      <div className="bg-green-50 ring-1 ring-green-200 rounded-lg p-2.5 mb-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-[10px] text-gray-600 mb-0.5">Last Matched</div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                              <span className="text-xs text-gray-700 font-medium truncate">
                                {formatISTDate(latestMatch.matchedAt.toISOString())}
                              </span>
                            </div>
                          </div>
                          <div className="text-center flex-shrink-0 ml-2">
                            <div className="text-[10px] text-gray-600 mb-0.5">Candidates</div>
                            <div className="text-base font-bold text-green-700">{latestMatch.totalMatches}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* View Versions — same button/panel Resume Scoring's job
                        picker uses, only offered when this job actually has
                        more than one version worth showing. */}
                    {hasVersionHistory && (
                      <div className="mb-3 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); versionLineage.toggle(versionKey, job.id); }}
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
                    {versionsExpanded && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <JobVersionHistoryPanel
                          job={sharedJob}
                          versions={versionLineage.lineages[versionKey]}
                          loading={versionLineage.isLoading(versionKey)}
                          versionDetails={versionLineage.versionDetails}
                          versionApplicants={versionLineage.versionApplicants}
                          openInNewTab
                          staticRows
                          publishedOnly
                        />
                      </div>
                    )}

                    {/* Action Button - pinned to bottom, only once this job
                        is checked. Every other job is disabled until it's
                        unchecked again, so there is never more than one to
                        show a button for. */}
                    {isSelected && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectJob(job.id); }}
                        className="mt-auto w-full px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-lg hover:shadow-brand-blue/30 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                      >
                        <Sparkles className="w-4 h-4" />
                        Run AI Match
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
            <div className="space-y-3">
              {paginatedJobs.map((job) => {
                const jobHistory = getJobMatchHistory(job.id);
                const latestMatch = jobHistory.length > 0 ? jobHistory[jobHistory.length - 1] : null;
                const isSelected = effectiveSelectedJobId === job.id;
                const isDisabled = effectiveSelectedJobId !== null && !isSelected;

                /* The shared vocabulary, so a republished JD reads
                   "Republished" here exactly as it does on the JD list. */
                const statusLabel = getDisplayStatus(job.status || 'Published', job.currentVersion);
                const statusBadge = getStatusConfig(statusLabel);

                // "View Versions" — see the setup above this list for what
                // each of these reads.
                const sharedJob = toSharedJob(job);
                const versionKey = lineageKey(sharedJob);
                const versionsExpanded = versionLineage.isExpanded(versionKey);
                const lineageSiblings = versionGroups.get(versionKey) ?? [sharedJob];
                const visibleVersionCount = new Set(
                  lineageSiblings
                    .filter(sibling => isVersionVisibleForScoring(sibling.status, sibling.id, versionLineage.versionApplicants))
                    .map(sibling => sibling.versionNumber ?? 1),
                ).size;
                const hasVersionHistory = visibleVersionCount > 1;

                return (
                  <div
                    key={job.id}
                    onClick={() => { if (!isDisabled) handleToggleJob(job.id); }}
                    /* Same shell as the Resume Scoring job rows — card, hairline
                       border, hover lift — with the checked/locked states
                       layered on top. */
                    className={`rounded-xl border p-4 transition-all duration-150 ${
                      isDisabled
                        ? 'bg-gray-50 dark:bg-slate-900/60 border-gray-100 dark:border-slate-800 opacity-50 cursor-not-allowed'
                        : `cursor-pointer ${
                            isSelected
                              ? 'border-brand-blue/50 bg-brand-blue/[0.03] ring-1 ring-brand-blue/30'
                              : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'
                          }`
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start gap-3">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); if (!isDisabled) handleToggleJob(job.id); }}
                        disabled={isDisabled}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
                        aria-label={isSelected ? 'Deselect job' : 'Select job'}
                      >
                        <input
                          type="radio"
                          checked={isSelected}
                          disabled={isDisabled}
                          readOnly
                          className="h-4 w-4 cursor-pointer rounded-full border-gray-300 text-brand-blue focus:ring-brand-blue/40 pointer-events-none disabled:cursor-not-allowed"
                        />
                      </button>

                      <div className="flex-1 min-w-0 w-full">
                        {/* Title row: JD code, title, status, version */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {job.jobId && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-md text-xs font-bold font-mono border border-brand-blue/20 flex-shrink-0">
                              {job.jobId}
                            </span>
                          )}
                          <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate">
                            {job.title}
                          </h3>
                          <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs ${statusBadge.bg} ${statusBadge.text} border ${statusBadge.border} gap-1.5 flex-shrink-0`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></div>
                            {statusLabel}
                          </span>
                          {job.currentVersion && job.currentVersion >= 1 && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                              v{job.currentVersion}
                            </span>
                          )}
                        </div>

                        {/* One wrapping metadata line, each fact behind its own
                            icon — the Resume Scoring row's layout exactly. */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 dark:text-slate-400 mb-2">
                          {job.department && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {job.department}
                            </span>
                          )}
                          {job.industryType && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {formatIndustryType(job.industryType)}
                            </span>
                          )}
                          {job.location?.trim() && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {job.location}
                            </span>
                          )}
                          {job.employmentType && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {formatEmploymentType(job.employmentType)}
                            </span>
                          )}
                          {job.remoteType && (
                            <span className="flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              <span className="capitalize">{job.remoteType}</span>
                            </span>
                          )}
                          {job.experience && (
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              {job.experience}
                            </span>
                          )}
                          {job.postedBy && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              By {job.postedBy}
                            </span>
                          )}
                          {job.postedDate && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                              Posted {formatISTDate(job.postedDate)}
                            </span>
                          )}
                          {/* The two counts keep the tinted-chip treatment the
                              Resume Scoring row gives its "N candidates scored",
                              because they are results rather than attributes. */}
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                            <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {job.applicants} scored
                          </span>
                          {latestMatch && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 text-green-700 rounded-lg">
                              <Award className="w-4 h-4" />
                              {latestMatch.totalMatches} matched
                            </span>
                          )}
                        </div>

                        {/* View Versions — same button/panel Resume Scoring's
                            job picker uses, only offered when this job
                            actually has more than one version worth showing. */}
                        {hasVersionHistory && (
                          <div className="mt-2 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); versionLineage.toggle(versionKey, job.id); }}
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
                        {versionsExpanded && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <JobVersionHistoryPanel
                              job={sharedJob}
                              versions={versionLineage.lineages[versionKey]}
                              loading={versionLineage.isLoading(versionKey)}
                              versionDetails={versionLineage.versionDetails}
                              versionApplicants={versionLineage.versionApplicants}
                              openInNewTab
                              staticRows
                              publishedOnly
                            />
                          </div>
                        )}
                      </div>

                      {/* Actions, right-aligned and stacked as on the reference
                          rows. Run AI Match stays the row's primary action,
                          but only appears once this job is checked — every
                          other row is disabled until it's unchecked again. */}
                      {isSelected && (
                        <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); onSelectJob(job.id); }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-3 py-2 text-sm font-medium text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 transition-all hover:bg-brand-blue-2 hover:shadow-md hover:shadow-brand-blue/30"
                          >
                            <Sparkles className="h-4 w-4" />
                            Run AI Match
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <ListPagination
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredJobs.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            itemLabel="jobs"
          />
        </>
      ) : publishedJobs.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-12 lg:p-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 mx-auto mb-4 sm:mb-5 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
              <Briefcase className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-brand-blue" />
            </div>
            <h3 className="text-base sm:text-lg lg:text-xl text-gray-900 mb-2">No Published Jobs Available</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
              You need to publish at least one job before you can run AI matching. Create and publish jobs in the JD Creation module.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border-2 border-dashed border-brand-blue/20">
          <ListEmptyState
            icon={Search}
            isNarrowed={search.isNarrowed}
            query={search.appliedQuery}
            entityLabel="job"
            emptyTitle="No published jobs"
            emptyDescription="Publish a job description to run an AI talent match against it."
            onReset={search.reset}
          />
        </div>
      )}

      {/* How It Works */}
      <div className="mt-4 sm:mt-6 bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] border border-brand-blue/15 ring-1 ring-brand-blue/5 rounded-xl p-3 sm:p-4 lg:p-5 flex items-start gap-2.5 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-brand-blue rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm sm:text-base text-gray-900 font-medium mb-1">How AI Talent Match Works</h4>
          <ul className="text-xs sm:text-sm text-gray-700 space-y-1 sm:space-y-1.5">
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="text-brand-blue mt-0.5">•</span>
              <span><strong>Step 1:</strong> Check a job above, then click Run AI Match</span>
            </li>
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="text-brand-blue mt-0.5">•</span>
              <span><strong>Step 2:</strong> AI analyzes all candidates in the database against job requirements</span>
            </li>
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="text-brand-blue mt-0.5">•</span>
              <span><strong>Step 3:</strong> Review matched candidates ranked by AI match score (1 unit per match)</span>
            </li>
            <li className="flex items-start gap-1.5 sm:gap-2">
              <span className="text-brand-blue mt-0.5">•</span>
              <span><strong>Step 4:</strong> Select top candidates and submit them for detailed scoring</span>
            </li>
          </ul>
        </div>
        </div>
      </div>
      </div>
    </main>
  );
}
