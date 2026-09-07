import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Sparkles, MapPin, Briefcase, User, Clock, ArrowRight, History, DollarSign, Award, TrendingUp, Search, Filter, ChevronDown, X, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';
import ListPagination from '@/components/ListPagination';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ModuleInfoBanner from '@/components/ModuleInfoBanner';
import JDVersionHistory from '@/components/JDVersionHistory';

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
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [jobsView, setJobsView] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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


  // Filter jobs: Only show Published/Active jobs, exclude Disabled jobs
  const publishedJobs = jobs.filter(j =>
    j.status === 'Published' || j.status === 'Active'
  );

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


  const handleSelectJob = (jobId: string) => {
    setSelectedJobs(prev =>
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  const handleSelectAll = () => {
    if (selectedJobs.length === filteredJobs.length) {
      setSelectedJobs([]);
    } else {
      setSelectedJobs(filteredJobs.map(j => j.id));
    }
  };

  const paginatedJobs = filteredJobs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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

      <ModuleInfoBanner
        icon={<Sparkles className="h-4 w-4" />}
        title="AI-Powered Talent Matching"
        description="Select a published job and let AI compare its skills, experience, and requirements against your candidate pool. Review ranked matches to quickly focus on the most relevant people for the role."
      />

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
              selected={selectedJobs.length}
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
            <p className="text-xs sm:text-sm text-gray-600">Click any job to run AI matching</p>
          </div>

          {jobsView === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedJobs.map((job) => {
              const jobHistory = getJobMatchHistory(job.id);
              const hasHistory = jobHistory.length > 0;
              const latestMatch = hasHistory ? jobHistory[jobHistory.length - 1] : null;
              const isSelected = selectedJobs.includes(job.id);

              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-xl border transition-all duration-150 cursor-pointer flex flex-col ${
                    isSelected
                      ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30'
                      : 'border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'
                  }`}
                  onClick={() => onSelectJob(job.id)}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                          className="flex-shrink-0"
                          title={isSelected ? 'Deselect' : 'Select'}
                          aria-label={isSelected ? 'Deselect job' : 'Select job'}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40 cursor-pointer pointer-events-none"
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

                    {/* Action Button - pinned to bottom */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectJob(job.id); }}
                      className="mt-auto w-full px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-lg hover:shadow-brand-blue/30 flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                    >
                      <Sparkles className="w-4 h-4" />
                      Run AI Match
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
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
                const isSelected = selectedJobs.includes(job.id);

                return (
                  <div
                    key={job.id}
                    onClick={() => onSelectJob(job.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-brand-blue/50 bg-brand-blue/[0.03] ring-1 ring-brand-blue/30'
                        : 'border-gray-100 bg-white shadow-sm hover:border-brand-blue/30 hover:shadow-md'
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); handleSelectJob(job.id); }}
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center"
                        aria-label={isSelected ? 'Deselect job' : 'Select job'}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-blue focus:ring-brand-blue/40 pointer-events-none"
                        />
                      </button>
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
                          <Briefcase className="h-5 w-5 text-brand-blue" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {job.jobId && <JobIdBadge>{job.jobId}</JobIdBadge>}
                            <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base" title={job.title}>{job.title}</h3>
                            {job.currentVersion && <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">{job.currentVersion > 1 ? 'Republished' : 'Published'}</span>}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-600">
                            {job.department && <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-gray-400" />{job.department}</span>}
                            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gray-400" />{job.location?.trim() || '-'}</span>
                            {job.employmentType && <span>{job.employmentType}</span>}
                            {job.experience && <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-gray-400" />{job.experience}</span>}
                          </div>
                          <JDVersionHistory jdId={job.id} version={job.currentVersion} className="mt-2" />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
                        <span className="flex items-center gap-1.5 rounded-lg bg-brand-blue/5 px-3 py-1.5 text-sm font-medium text-brand-blue ring-1 ring-brand-blue/15"><User className="h-4 w-4" />{job.applicants}</span>
                        {latestMatch && <span className="text-xs text-green-700">{latestMatch.totalMatches} matched</span>}
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onSelectJob(job.id); }}
                          className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-3 py-2 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:bg-brand-blue-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          Run AI Match
                        </button>
                      </div>
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
              <span><strong>Step 1:</strong> Click on any job card above to select it</span>
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
