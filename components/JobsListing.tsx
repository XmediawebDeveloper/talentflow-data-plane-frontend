'use client'

import { Plus, Search, MapPin, Calendar, Target, Eye, MoreVertical, Briefcase, Users, Filter, TrendingUp, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, SlidersHorizontal, LayoutGrid, List, Archive, XCircle, Building2, DollarSign, AlertCircle, ArrowUpRight, Heart, Star, Edit, Send, Ban, RefreshCw, ArrowUpDown, CheckSquare, Square, Trash2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Job } from '@/lib/types/types';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';

interface JobsListingProps {
  jobs: Job[];
  onCreateNew: () => void;
  onViewJob: (job: Job) => void;
  onAIMatch?: (job: Job) => void;
  onUpdateJobStatus?: (jobId: string, status: Job['status']) => void;
  onEditJob?: (job: Job) => void;
  onPublishJob?: (job: Job) => void;
  onDisableJob?: (job: Job) => void;
  onRepublishJob?: (job: Job) => void;
}

export default function JobsListing({ jobs, onCreateNew, onViewJob, onAIMatch, onUpdateJobStatus, onEditJob, onPublishJob, onDisableJob, onRepublishJob }: JobsListingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
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

  // Sort and Bulk Actions states
  const [sortBy, setSortBy] = useState<'date' | 'applicants' | 'title' | 'status' | 'department'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // NEW: Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

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

  // Apply sorting to filtered jobs
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'date':
        const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
        const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
        comparison = dateB - dateA; // Default newest first
        break;
      case 'applicants':
        comparison = (b.applicants || 0) - (a.applicants || 0);
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      case 'department':
        comparison = (a.department || '').localeCompare(b.department || '');
        break;
      default:
        comparison = 0;
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });

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

  const handleBulkDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${selectedJobs.size} job(s)? This action cannot be undone.`)) {
      // In a real implementation, you'd call a delete handler
      console.log('Deleting jobs:', Array.from(selectedJobs));
      setSelectedJobs(new Set());
      setShowBulkActions(false);
    }
  };

  const handleBulkExport = () => {
    const selectedJobsData = sortedJobs.filter(job => selectedJobs.has(job.id));
    const csvContent = [
      ['Title', 'Status', 'Department', 'Location', 'Type', 'Experience', 'Applicants', 'Posted Date'].join(','),
      ...selectedJobsData.map(job => [
        job.title,
        job.status,
        job.department || '',
        job.location,
        job.employmentType || '',
        job.experience || '',
        job.applicants || 0,
        job.postedDate || ''
      ].join(','))
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

  // NEW: Pagination logic
  const totalPages = Math.ceil(sortedJobs.length / itemsPerPage);
  const currentJobs = sortedJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, locationFilter, departmentFilter, experienceFilter, employmentTypeFilter, applicantsFilter, sortBy, sortOrder]);

  // Update items per page based on view mode
  useEffect(() => {
    setItemsPerPage(viewMode === 'grid' ? 9 : 10);
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
              {['all', 'Published', 'Draft', 'Closed', 'Disabled', 'Archived'].map((status) => (
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

        {/* Sort and Bulk Actions Bar */}
        {sortedJobs.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between">
              {/* Left: Bulk Selection */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  {selectedJobs.size === sortedJobs.length && sortedJobs.length > 0 ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
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
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 text-sm"
                    >
                      <span>Bulk Actions</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {showBulkActions && (
                      <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        <button
                          onClick={handleBulkPublish}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Send className="w-4 h-4 text-green-600" />
                          Publish Selected (Drafts)
                        </button>
                        <button
                          onClick={handleBulkDisable}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Ban className="w-4 h-4 text-red-600" />
                          Disable Selected (Published)
                        </button>
                        <button
                          onClick={handleBulkArchive}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Archive className="w-4 h-4 text-gray-600" />
                          Archive Selected
                        </button>
                        <div className="border-t border-gray-200 my-2" />
                        <button
                          onClick={handleBulkExport}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Download className="w-4 h-4 text-blue-600" />
                          Export Selected to CSV
                        </button>
                        <button
                          onClick={handleBulkDelete}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Selected
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Sort Controls */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="date">Date Posted</option>
                  <option value="applicants">Applicants</option>
                  <option value="title">Job Title</option>
                  <option value="status">Status</option>
                  <option value="department">Department</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'desc' ? 'rotate-180' : ''} transition-transform`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Jobs Grid/List */}
        {currentJobs.length > 0 ? (
          viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentJobs.map(job => {
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
                        {job.experience && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <TrendingUp className="w-4 h-4 text-gray-400" />
                            <span>{job.experience} years</span>
                          </div>
                        )}
                        {job.postedDate && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span>Posted {new Date(job.postedDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {/* Salary & Skills Info */}
                      <div className="space-y-2 mb-4">
                        {(job as any).salary && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                            <DollarSign className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-green-700">{(job as any).salary}</span>
                          </div>
                        )}
                        {((job as any).mustHaveSkills?.length > 0 || (job as any).niceToHaveSkills?.length > 0) && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                            <Target className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-blue-700">
                              {(job as any).mustHaveSkills?.length || 0} required + {(job as any).niceToHaveSkills?.length || 0} preferred skills
                            </span>
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
                      <div className="flex flex-col gap-2">
                        {/* View Button - Always visible */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewJob(job);
                          }}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>

                        {/* Edit Button - Only for Draft */}
                        {job.status === 'Draft' && onEditJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditJob(job);
                            }}
                            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm font-medium flex items-center justify-center gap-1.5"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                        )}

                        {/* Publish Button - Only for Draft */}
                        {job.status === 'Draft' && onPublishJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPublishJob(job);
                            }}
                            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-sm font-medium flex items-center justify-center gap-1.5"
                          >
                            <Send className="w-4 h-4" />
                            Publish
                          </button>
                        )}

                        {/* Disable Button - Only for Published */}
                        {job.status === 'Published' && onDisableJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisableJob(job);
                            }}
                            className="w-full px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all text-sm font-medium flex items-center justify-center gap-1.5"
                          >
                            <Ban className="w-4 h-4" />
                            Disable
                          </button>
                        )}

                        {/* Republish Button - Only for Closed */}
                        {job.status === 'Closed' && onRepublishJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRepublishJob(job);
                            }}
                            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-sm font-medium flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Republish
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
              {currentJobs.map(job => {
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
                        
                        {/* Primary Info Row */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
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
                          {job.experience && (
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-gray-400" />
                              {job.experience} years
                            </span>
                          )}
                          {job.postedDate && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              Posted {new Date(job.postedDate).toLocaleDateString()}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded">
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
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 rounded-lg text-sm">
                              <Target className="w-4 h-4 text-blue-600" />
                              <span className="text-blue-700">
                                {(job as any).mustHaveSkills?.length || 0} required + {(job as any).niceToHaveSkills?.length || 0} preferred
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {/* View Button - Always visible */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewJob(job);
                          }}
                          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium flex items-center justify-center gap-2"
                        >
                          <Eye className="w-5 h-5" />
                          View
                        </button>

                        {/* Edit Button - Only for Draft */}
                        {job.status === 'Draft' && onEditJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditJob(job);
                            }}
                            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium flex items-center justify-center gap-2"
                          >
                            <Edit className="w-5 h-5" />
                            Edit
                          </button>
                        )}

                        {/* Publish Button - Only for Draft */}
                        {job.status === 'Draft' && onPublishJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPublishJob(job);
                            }}
                            className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium flex items-center justify-center gap-2"
                          >
                            <Send className="w-5 h-5" />
                            Publish
                          </button>
                        )}

                        {/* Disable Button - Only for Published */}
                        {job.status === 'Published' && onDisableJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisableJob(job);
                            }}
                            className="px-5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all font-medium flex items-center justify-center gap-2"
                          >
                            <Ban className="w-5 h-5" />
                            Disable
                          </button>
                        )}

                        {/* Republish Button - Only for Closed */}
                        {job.status === 'Closed' && onRepublishJob && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRepublishJob(job);
                            }}
                            className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium flex items-center justify-center gap-2"
                          >
                            <RefreshCw className="w-5 h-5" />
                            Republish
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

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mt-6">
            <div className="flex items-center justify-between">
              {/* Left: Items per page selector and showing info */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm text-gray-600">per page</span>
                </div>
                
                <div className="h-6 w-px bg-gray-300" />
                
                <span className="text-sm text-gray-600">
                  Showing <span className="text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-gray-900">{Math.min(currentPage * itemsPerPage, sortedJobs.length)}</span> of <span className="text-gray-900">{sortedJobs.length}</span> jobs
                </span>
              </div>

              {/* Right: Page navigation */}
              <div className="flex items-center gap-2">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`p-2 rounded-lg border transition-all ${
                    currentPage === 1
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Previous page"
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
                      className={`min-w-[36px] h-9 px-3 rounded-lg text-sm transition-all ${
                        page === currentPage
                          ? 'bg-blue-600 text-white shadow-sm'
                          : page === '...'
                          ? 'text-gray-400 cursor-default'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
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
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
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