import { Plus, Search, MapPin, Calendar, Target, Eye, MoreVertical, Briefcase, Users, Filter, TrendingUp, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, SlidersHorizontal, LayoutGrid, List, Archive, XCircle, Building2, DollarSign, AlertCircle, ArrowUpRight, Heart, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Job } from '@/lib/types';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';

interface JobsListingProps {
  jobs: Job[];
  onCreateNew: () => void;
  onViewJob: (job: Job) => void;
  onAIMatch?: (job: Job) => void;
  onUpdateJobStatus?: (jobId: string, status: Job['status']) => void;
}

export default function JobsListing({ jobs, onCreateNew, onViewJob, onAIMatch, onUpdateJobStatus }: JobsListingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAIMatchModal, setShowAIMatchModal] = useState(false);
  const [selectedJobForAIMatch, setSelectedJobForAIMatch] = useState<Job | null>(null);
  
  // Advanced filter states
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [datePostedFilter, setDatePostedFilter] = useState<string>('all');
  const [salaryRangeFilter, setSalaryRangeFilter] = useState<string>('all');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>('all');
  const [applicantsFilter, setApplicantsFilter] = useState<string>('all');

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesLocation = locationFilter === 'all' || job.location === locationFilter;
    const matchesDepartment = departmentFilter === 'all' || job.department === departmentFilter;
    const matchesEmploymentType = employmentTypeFilter === 'all' || job.employmentType === employmentTypeFilter;
    
    // Experience filter
    let matchesExperience = true;
    if (experienceFilter !== 'all') {
      const exp = job.experience?.toLowerCase() || '';
      if (experienceFilter === 'entry') matchesExperience = exp.includes('0-2') || exp.includes('entry');
      else if (experienceFilter === 'mid') matchesExperience = exp.includes('2-5') || exp.includes('mid');
      else if (experienceFilter === 'senior') matchesExperience = exp.includes('5+') || exp.includes('senior');
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
           matchesEmploymentType && matchesExperience && matchesApplicants;
  });

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

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Published':
        return {
          bg: 'bg-green-50',
          text: 'text-green-700',
          border: 'border-green-200',
          dot: 'bg-green-500'
        };
      case 'Draft':
        return {
          bg: 'bg-yellow-50',
          text: 'text-yellow-700',
          border: 'border-yellow-200',
          dot: 'bg-yellow-500'
        };
      case 'Closed':
        return {
          bg: 'bg-gray-50',
          text: 'text-gray-600',
          border: 'border-gray-200',
          dot: 'bg-gray-400'
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
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          dot: 'bg-blue-500'
        };
    }
  };

  // Get unique values for filters
  const uniqueLocations = Array.from(new Set(jobs.map(job => job.location)));
  const uniqueDepartments = Array.from(new Set(jobs.map(job => job.department).filter(Boolean)));
  const uniqueEmploymentTypes = Array.from(new Set(jobs.map(job => job.employmentType).filter(Boolean)));

  // Calculate stats
  const stats = {
    total: jobs.length,
    published: jobs.filter(j => j.status === 'Published').length,
    draft: jobs.filter(j => j.status === 'Draft').length,
    closed: jobs.filter(j => j.status === 'Closed').length,
    totalApplicants: jobs.reduce((sum, j) => sum + (j.applicants || 0), 0)
  };

  const activeFiltersCount = [
    statusFilter !== 'all',
    locationFilter !== 'all',
    departmentFilter !== 'all',
    experienceFilter !== 'all',
    employmentTypeFilter !== 'all',
    applicantsFilter !== 'all',
    salaryRangeFilter !== 'all',
    datePostedFilter !== 'all'
  ].filter(Boolean).length;

  return (
    <main className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-8 max-w-7xl mx-auto">
        {/* Simple Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-gray-900 mb-2">Job Openings</h1>
              <p className="text-gray-600">Create and manage your job postings</p>
            </div>
            <button
              onClick={onCreateNew}
              className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create New Job</span>
            </button>
          </div>

          {/* Simple Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg p-5 border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-gray-600">Total Jobs</span>
              </div>
              <div className="text-3xl text-gray-900">{stats.total}</div>
            </div>

            <div className="bg-white rounded-lg p-5 border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-sm text-gray-600">Active</span>
              </div>
              <div className="text-3xl text-gray-900">{stats.published}</div>
            </div>

            <div className="bg-white rounded-lg p-5 border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-yellow-600" />
                </div>
                <span className="text-sm text-gray-600">Drafts</span>
              </div>
              <div className="text-3xl text-gray-900">{stats.draft}</div>
            </div>

            <div className="bg-white rounded-lg p-5 border border-gray-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-sm text-gray-600">Applicants</span>
              </div>
              <div className="text-3xl text-gray-900">{stats.totalApplicants}</div>
            </div>
          </div>

          {/* Simple Search and Filters */}
          <div className="bg-white rounded-lg p-5 border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${
                    viewMode === 'grid'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${
                    viewMode === 'list'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* More Filters Button */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  activeFiltersCount > 0 || showAdvancedFilters
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>More Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-xs">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Show:</span>
              {['all', 'Published', 'Draft', 'Closed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status === 'all' ? 'All Jobs' : status}
                </button>
              ))}

              {/* Clear Filters */}
              {(searchQuery || activeFiltersCount > 0) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setLocationFilter('all');
                    setDepartmentFilter('all');
                    setExperienceFilter('all');
                    setEmploymentTypeFilter('all');
                    setApplicantsFilter('all');
                    setDatePostedFilter('all');
                    setSalaryRangeFilter('all');
                  }}
                  className="ml-auto text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {/* More Filters Panel */}
            {showAdvancedFilters && (
              <div className="mt-5 pt-5 border-t border-gray-200">
                <div className="grid grid-cols-3 gap-4">
                  {/* Location */}
                  {uniqueLocations.length > 1 && (
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Location</label>
                      <select
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="all">All Locations</option>
                        {uniqueLocations.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Department */}
                  {uniqueDepartments.length > 0 && (
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Department</label>
                      <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="all">All Departments</option>
                        {uniqueDepartments.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Employment Type */}
                  {uniqueEmploymentTypes.length > 0 && (
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Job Type</label>
                      <select
                        value={employmentTypeFilter}
                        onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="all">All Types</option>
                        {uniqueEmploymentTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Showing {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'}
            {filteredJobs.length !== jobs.length && ` (filtered from ${jobs.length} total)`}
          </p>
        </div>

        {/* Jobs Grid/List */}
        {filteredJobs.length > 0 ? (
          viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredJobs.map(job => {
                const statusConfig = getStatusConfig(job.status);

                return (
                  <div
                    key={job.id}
                    className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer overflow-hidden"
                    onClick={() => onViewJob(job)}
                  >
                    {/* Card Header */}
                    <div className="p-5 border-b border-gray-100">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
                          {job.status}
                        </span>
                      </div>
                      <h3 className="text-lg text-gray-900 mb-2 line-clamp-2">
                        {job.title}
                      </h3>
                    </div>

                    {/* Card Body */}
                    <div className="p-5">
                      <div className="space-y-2 mb-4">
                        {job.department && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span>{job.department}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span>{job.location}</span>
                        </div>
                        {job.employmentType && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span>{job.employmentType}</span>
                          </div>
                        )}
                      </div>

                      {/* Applicants */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-4">
                        <Users className="w-4 h-4 text-gray-600" />
                        <span className="text-sm text-gray-700">
                          {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewJob(job);
                          }}
                          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium"
                        >
                          View Details
                        </button>
                        {job.status === 'Published' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJobForAIMatch(job);
                              setShowAIMatchModal(true);
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5 text-sm font-medium"
                          >
                            <Sparkles className="w-4 h-4" />
                            AI Match
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // List View
            <div className="space-y-3">
              {filteredJobs.map(job => {
                const statusConfig = getStatusConfig(job.status);

                return (
                  <div
                    key={job.id}
                    className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer p-5"
                    onClick={() => onViewJob(job)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Job Icon */}
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-6 h-6 text-blue-600" />
                      </div>

                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg text-gray-900 truncate">
                            {job.title}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 flex-shrink-0`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></div>
                            {job.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          {job.department && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              {job.department}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            {job.location}
                          </span>
                          {job.employmentType && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-gray-400" />
                              {job.employmentType}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded">
                            <Users className="w-4 h-4 text-gray-400" />
                            {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewJob(job);
                          }}
                          className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium"
                        >
                          View Details
                        </button>
                        {job.status === 'Published' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJobForAIMatch(job);
                              setShowAIMatchModal(true);
                            }}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 font-medium"
                          >
                            <Sparkles className="w-5 h-5" />
                            AI Match
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // Empty State
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-5 bg-gray-100 rounded-full flex items-center justify-center">
                {searchQuery || activeFiltersCount > 0 ? (
                  <Search className="w-10 h-10 text-gray-400" />
                ) : (
                  <Briefcase className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <h3 className="text-xl text-gray-900 mb-2">
                {searchQuery || activeFiltersCount > 0 ? 'No jobs found' : 'No jobs yet'}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchQuery || activeFiltersCount > 0
                  ? 'Try changing your search or filters'
                  : 'Create your first job opening to get started'
                }
              </p>
              {searchQuery || activeFiltersCount > 0 ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setLocationFilter('all');
                    setDepartmentFilter('all');
                    setExperienceFilter('all');
                    setEmploymentTypeFilter('all');
                    setApplicantsFilter('all');
                    setDatePostedFilter('all');
                    setSalaryRangeFilter('all');
                  }}
                  className="px-5 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all inline-flex items-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={onCreateNew}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all inline-flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Job
                </button>
              )}
            </div>
          </div>
        )}
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
    </main>
  );
}
