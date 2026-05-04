import { Sparkles, MapPin, Briefcase, User, Clock, ArrowRight, History, DollarSign, Award, TrendingUp, Search, Filter, ChevronDown, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatISTDate } from '@/lib/utils/dateUtils';
import ListPagination from '@/components/ListPagination';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, departmentFilter, locationFilter, employmentTypeFilter]);

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

  const activeFiltersCount = [
    searchQuery !== '',
    departmentFilter !== '',
    locationFilter !== '',
    employmentTypeFilter !== '',
  ].filter(Boolean).length;

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
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 sm:p-2 bg-white hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200"
              title="Back to Dashboard"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 rotate-180" />
            </button>
          )}
          <div className="w-9 h-9 sm:w-12 sm:h-12 bg-gradient-to-br from-brand-blue to-brand-blue-2 rounded-lg sm:rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-brand-blue/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by job title, department, or location..."
                className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 text-sm sm:text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-black placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg border transition-all flex items-center justify-center gap-2 font-medium text-sm sm:text-base ${
                activeFiltersCount > 0
                  ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue shadow-sm shadow-brand-blue/5'
                  : 'bg-brand-blue/5 border-brand-blue/10 text-gray-700 hover:bg-brand-blue/10 hover:border-brand-blue/20 hover:text-brand-blue'
              }`}
            >
              <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Filters</span>
              <span className="sm:hidden">Filter</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 sm:px-2 py-0.5 bg-brand-blue text-white rounded-full text-xs font-medium">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            <div className="text-xs sm:text-sm text-gray-700 bg-brand-blue/5 ring-1 ring-brand-blue/10 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg whitespace-nowrap font-medium">
              <span className="text-brand-blue font-semibold">{filteredJobs.length}</span> of {publishedJobs.length}
            </div>
          </div>
        </div>

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
                  onChange={(e) => setDepartmentFilter(e.target.value)}
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
                  onChange={(e) => setLocationFilter(e.target.value)}
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
                  onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 sm:py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white text-black"
                >
                  <option value="">All Types</option>
                  {employmentTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setDepartmentFilter('');
                    setLocationFilter('');
                    setEmploymentTypeFilter('');
                  }}
                  disabled={activeFiltersCount === 0}
                  className="w-full px-4 py-2 sm:py-2.5 border border-gray-200 text-gray-700 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium text-sm"
                >
                  <X className="w-4 h-4" />
                  Clear All
                </button>
              </div>
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

          <div className="grid gap-3 sm:gap-4">
            {paginatedJobs.map((job) => {
              const jobHistory = getJobMatchHistory(job.id);
              const hasHistory = jobHistory.length > 0;
              const latestMatch = hasHistory ? jobHistory[jobHistory.length - 1] : null;

              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-xl border transition-all p-3 sm:p-4 lg:p-6 ${
                    selectedJobs.includes(job.id)
                      ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30'
                      : 'border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 duration-150'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 lg:gap-6">
                    {/* Checkbox + Job Icon row on mobile */}
                    <div className="flex items-start gap-3 sm:contents">
                      {/* Checkbox */}
                      <div className="flex items-center pt-1 sm:pt-2">
                        <input
                          type="checkbox"
                          checked={selectedJobs.includes(job.id)}
                          onChange={() => handleSelectJob(job.id)}
                          className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue rounded border-gray-300 focus:ring-brand-blue/40 cursor-pointer"
                        />
                      </div>

                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 sm:gap-4 mb-2 sm:mb-3">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-brand-blue/10 to-brand-cyan/10 ring-1 ring-brand-blue/15 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-brand-blue" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                              {job.jobId && (
                                <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold font-mono bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
                                  {job.jobId}
                                </span>
                              )}
                              {job.currentVersion && (
                                <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
                                  v{job.currentVersion}
                                </span>
                              )}
                              {job.currentVersion && (
                                <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium border ${
                                  job.currentVersion > 1
                                    ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                                    : 'bg-green-50 text-green-700 border-green-200'
                                }`}>
                                  {job.currentVersion > 1 ? 'Republished' : 'Published'}
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm sm:text-base lg:text-xl text-gray-900 mb-1.5 sm:mb-2 line-clamp-2">
                              {job.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm text-gray-600">
                              <span className="flex items-center gap-1 sm:gap-1.5">
                                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span className="truncate max-w-[120px] sm:max-w-none">{job.location}</span>
                              </span>
                              {job.department && (
                                <span className="flex items-center gap-1 sm:gap-1.5">
                                  <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  <span className="truncate max-w-[120px] sm:max-w-none">{job.department}</span>
                                </span>
                              )}
                              <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-brand-blue/5 border border-brand-blue/15 rounded-full text-brand-blue font-medium">
                                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                {job.applicants} applicants
                              </span>
                              {job.employmentType && (
                                <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-gray-50 border border-gray-200 rounded-full text-gray-700 text-[10px] sm:text-xs font-medium">
                                  {job.employmentType}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Match History Badge */}
                        {hasHistory && latestMatch && (
                          <div className="mt-2 sm:mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                            <div className="flex-1 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-2.5 sm:p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Last Matched</div>
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-500" />
                                    <span className="text-xs sm:text-sm text-gray-700 font-medium">
                                      {formatISTDate(latestMatch.matchedAt.toISOString())}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-[10px] sm:text-xs text-gray-600 mb-0.5 sm:mb-1">Candidates</div>
                                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-green-700">{latestMatch.totalMatches}</div>
                                </div>
                              </div>
                            </div>
                            <div className="px-3 py-1.5 bg-brand-blue/5 border border-brand-blue/15 rounded-lg text-xs font-medium text-brand-blue text-center sm:text-left">
                              Matched {jobHistory.length}x
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex-shrink-0 flex items-center justify-center sm:justify-end">
                      <button
                        onClick={() => onSelectJob(job.id)}
                        className="w-full sm:w-auto px-4 sm:px-5 lg:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-brand-blue to-brand-blue-2 hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-lg hover:shadow-brand-blue/30 flex items-center justify-center gap-2 whitespace-nowrap text-sm sm:text-base"
                      >
                        <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                        Run AI Match
                        <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

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
            <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 mx-auto mb-4 sm:mb-5 bg-gradient-to-br from-brand-blue/10 to-brand-cyan/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
              <Briefcase className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-brand-blue" />
            </div>
            <h3 className="text-base sm:text-lg lg:text-xl text-gray-900 mb-2">No Published Jobs Available</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
              You need to publish at least one job before you can run AI matching. Create and publish jobs in the JD Creation module.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-12 lg:p-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 mx-auto mb-4 sm:mb-5 bg-gradient-to-br from-brand-blue/10 to-brand-cyan/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
              <Search className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-brand-blue" />
            </div>
            <h3 className="text-base sm:text-lg lg:text-xl text-gray-900 mb-2">No Results Found</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
              No jobs match your current filters. Try adjusting your search criteria.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setDepartmentFilter('');
                setLocationFilter('');
                setEmploymentTypeFilter('');
              }}
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-brand-blue to-brand-blue-2 hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg transition-all font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 inline-flex items-center gap-2 text-sm sm:text-base"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
              Clear All Filters
            </button>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="mt-4 sm:mt-6 bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] border border-brand-blue/15 ring-1 ring-brand-blue/5 rounded-xl p-3 sm:p-4 lg:p-5 flex items-start gap-2.5 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-brand-blue to-brand-blue-2 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
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
    </main>
  );
}
