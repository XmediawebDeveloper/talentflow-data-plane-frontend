import { Sparkles, MapPin, Briefcase, User, Clock, ArrowRight, History, DollarSign, Award, TrendingUp, Search, Filter, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
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
  
  // Filter jobs: Only show Published/Active jobs, exclude Disabled jobs
  const publishedJobs = jobs.filter(j =>
    (j.status === 'Published' || j.status === 'Active') && j.status !== 'Disabled'
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

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-blue-50 to-white">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200"
              title="Back to Dashboard"
            >
              <ArrowRight className="w-5 h-5 text-gray-700 rotate-180" />
            </button>
          )}
          <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-lg">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-gray-900">AI Talent Match - Select Job</h1>
            <p className="text-sm text-gray-600">Choose a job to find the best matching candidates using AI</p>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by job title, department, or location..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600"
              />
            </div>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-5 py-2.5 rounded-lg border-2 transition-all flex items-center gap-2 font-medium ${
              activeFiltersCount > 0
                ? 'bg-gray-50 border-gray-800 text-gray-900 shadow-sm'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-5 h-5" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 bg-gray-800 text-white rounded-full text-xs font-medium">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          <div className="text-sm text-gray-700 bg-gray-100 px-4 py-2.5 rounded-lg whitespace-nowrap font-medium border border-gray-200">
            <span className="text-gray-800">{filteredJobs.length}</span> of {publishedJobs.length} jobs
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-5 pt-5 border-t border-gray-200">
            <div className="grid grid-cols-4 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
                >
                  <option value="">All Locations</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Employment Type
                </label>
                <select
                  value={employmentTypeFilter}
                  onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white"
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
                  className="w-full px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium"
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl text-gray-900 font-medium">Available Jobs ({filteredJobs.length})</h2>
            <p className="text-sm text-gray-600">Click any job to run AI matching</p>
          </div>

          <div className="grid gap-4">
            {filteredJobs.map((job) => {
              const jobHistory = getJobMatchHistory(job.id);
              const hasHistory = jobHistory.length > 0;
              const latestMatch = hasHistory ? jobHistory[jobHistory.length - 1] : null;

              return (
                <div
                  key={job.id}
                  className={`bg-white rounded-xl border-2 transition-all p-6 ${
                    selectedJobs.includes(job.id)
                      ? 'border-gray-300 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
                  }`}
                >
                  <div className="flex items-start gap-6">
                    {/* Checkbox */}
                    <div className="flex items-center pt-2">
                      <input
                        type="checkbox"
                        checked={selectedJobs.includes(job.id)}
                        onChange={() => handleSelectJob(job.id)}
                        className="w-5 h-5 text-gray-800 rounded border-gray-300 focus:ring-gray-500 cursor-pointer"
                      />
                    </div>
                    
                    {/* Job Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-4 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                          <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl text-gray-900 mb-2">
                            {job.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-4 h-4" />
                              {job.location}
                            </span>
                            {job.department && (
                              <span className="flex items-center gap-1.5">
                                <Briefcase className="w-4 h-4" />
                                {job.department}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-full text-gray-900 font-medium">
                              <User className="w-4 h-4" />
                              {job.applicants} applicants
                            </span>
                            {job.employmentType && (
                              <span className="px-2.5 py-1 bg-gray-100 border border-gray-300 rounded-full text-gray-700 text-xs font-medium">
                                {job.employmentType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Match History Badge */}
                      {hasHistory && latestMatch && (
                        <div className="mt-3 flex items-center gap-3">
                          <div className="flex-1 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-xs text-gray-600 mb-1">Last Matched</div>
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                                  <span className="text-sm text-gray-700 font-medium">
                                    {new Date(latestMatch.matchedAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-600 mb-1">Candidates</div>
                                <div className="text-2xl font-bold text-green-700">{latestMatch.totalMatches}</div>
                              </div>
                            </div>
                          </div>
                          <div className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-xs font-medium text-gray-900">
                            Matched {jobHistory.length}x
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Button - Always show for Active/Published JDs */}
                    <div className="flex-shrink-0 flex items-center justify-center">
                      <button
                        onClick={() => onSelectJob(job.id)}
                        className="px-6 py-3 bg-gradient-to-r from-gray-800 to-gray-800 text-white rounded-lg hover:from-gray-700 hover:to-gray-900 transition-all font-medium shadow-md group-hover:shadow-lg flex items-center gap-2 whitespace-nowrap"
                      >
                        <Sparkles className="w-5 h-5" />
                        Run AI Match
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : publishedJobs.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
              <Briefcase className="w-10 h-10 text-gray-800" />
            </div>
            <h3 className="text-xl text-gray-900 mb-2">No Published Jobs Available</h3>
            <p className="text-gray-600 mb-6">
              You need to publish at least one job before you can run AI matching. Create and publish jobs in the JD Creation module.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-100 to-gray-100 rounded-full flex items-center justify-center">
              <Search className="w-10 h-10 text-gray-800" />
            </div>
            <h3 className="text-xl text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-600 mb-6">
              No jobs match your current filters. Try adjusting your search criteria.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setDepartmentFilter('');
                setLocationFilter('');
                setEmploymentTypeFilter('');
              }}
              className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium shadow-sm hover:shadow-md inline-flex items-center gap-2"
            >
              <X className="w-5 h-5" />
              Clear All Filters
            </button>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-start gap-3">
        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="text-gray-900 font-medium mb-1">How AI Talent Match Works</h4>
          <ul className="text-sm text-gray-700 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-gray-800 mt-0.5">•</span>
              <span><strong>Step 1:</strong> Click on any job card above to select it</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-800 mt-0.5">•</span>
              <span><strong>Step 2:</strong> AI analyzes all candidates in the database against job requirements</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-800 mt-0.5">•</span>
              <span><strong>Step 3:</strong> Review matched candidates ranked by AI match score (1 unit per match)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-800 mt-0.5">•</span>
              <span><strong>Step 4:</strong> Select top candidates and submit them for detailed scoring</span>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}