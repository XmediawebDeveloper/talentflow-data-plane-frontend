'use client'

import { Plus, Search, MapPin, Calendar, Target, Eye, MoreVertical, Briefcase, Users, User, Filter, TrendingUp, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, SlidersHorizontal, LayoutGrid, List, Archive, XCircle, Building2, DollarSign, AlertCircle, ArrowUpRight, Heart, Star, Edit, Send, Ban, RefreshCw, ArrowUpDown, CheckSquare, Square, Trash2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Job } from '@/lib/types/types';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { useAuth } from '@/components/providers/AuthProvider';

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

  // Server returns UTC, convert to IST by adding 5:30 hours
  const utcDate = new Date(dateString);
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes
  const istDate = new Date(utcDate.getTime() + istOffsetMs);

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
  return istDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

interface JobsListingProps {
  jobs: Job[];
  onCreateNew: () => void;
  onViewJob: (job: Job) => void;
  onViewApplicants?: (job: Job) => void;
  onAIMatch?: (job: Job) => void;
  onUpdateJobStatus?: (jobId: string, status: Job['status']) => void;
  onEditJob?: (job: Job) => void;
  onPublishJob?: (job: Job) => void;
  onDisableJob?: (job: Job) => void;
  onRepublishJob?: (job: Job) => void;
  onArchiveJob?: (job: Job) => void;
  onUnarchiveJob?: (job: Job) => void;
  onDeleteJob?: (job: Job) => void;
  // Quota information for showing limit reached message
  quotaInfo?: {
    remaining: number;
    limit: number;
    used: number;
  };
  // Initial status filter from URL
  initialStatusFilter?: string;
}

export default function JobsListing({ jobs, onCreateNew, onViewJob, onViewApplicants, onAIMatch, onUpdateJobStatus, onEditJob, onPublishJob, onDisableJob, onRepublishJob, onArchiveJob, onUnarchiveJob, onDeleteJob, quotaInfo, initialStatusFilter }: JobsListingProps) {
  const dialog = useGlobalDialog();
  const { isTenantAdmin, user } = useAuth();
  const canUpdateJd = isTenantAdmin || (user?.permissions?.canUpdateJd ?? false);
  const canDeleteJd = isTenantAdmin || (user?.permissions?.canDeleteJd ?? false);
  const canArchiveJd = isTenantAdmin || (user?.permissions?.canArchiveJd ?? false);
  const canDisableJd = isTenantAdmin || (user?.permissions?.canDisableJd ?? false);
  const canExportJd = isTenantAdmin || (user?.permissions?.canExport ?? false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'all');
  const [creationMethodFilter, setCreationMethodFilter] = useState<'manual' | 'ai' | null>(null);

  // Sync status filter with URL parameter changes
  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAIMatchModal, setShowAIMatchModal] = useState(false);
  const [selectedJobForAIMatch, setSelectedJobForAIMatch] = useState<Job | null>(null);
  
  // Advanced filter states
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [datePostedFromFilter, setDatePostedFromFilter] = useState<string>('');
  const [datePostedToFilter, setDatePostedToFilter] = useState<string>('');
  const [salaryRangeFilter, setSalaryRangeFilter] = useState<string>('all');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>('all');
  const [applicantsFilter, setApplicantsFilter] = useState<string>('all');

  // Sort and Bulk Actions states
  const [sortBy, setSortBy] = useState<'date' | 'applicants' | 'title' | 'status' | 'industry'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // NEW: Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Quota modal state
  const [showQuotaModal, setShowQuotaModal] = useState(false);

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

    // Experience filter
    let matchesExperience = true;
    if (experienceFilter !== 'all') {
      const exp = job.experience?.toLowerCase() || '';
      if (experienceFilter === 'entry') matchesExperience = exp.includes('0') || exp.includes('1') || exp.includes('entry');
      else if (experienceFilter === 'junior') matchesExperience = exp.includes('2') || exp.includes('3') || exp.includes('4') || exp.includes('junior');
      else if (experienceFilter === 'mid') matchesExperience = exp.includes('5') || exp.includes('6') || exp.includes('7') || exp.includes('mid');
      else if (experienceFilter === 'senior') matchesExperience = exp.includes('8') || exp.includes('9') || exp.includes('10') || exp.includes('senior');
      else if (experienceFilter === 'architect') matchesExperience = exp.includes('architect');
      else if (experienceFilter === 'management') matchesExperience = exp.includes('management') || exp.includes('manager');
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

  // Apply sorting to filtered jobs
  const sortedJobs = [...filteredJobs].sort((a, b) => {
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
    if (await dialog.confirm({ title: 'Delete Jobs', message: `Are you sure you want to delete ${selectedJobs.size} job(s)? This action cannot be undone.`, variant: 'error', confirmText: 'Delete' })) {
      // In a real implementation, you'd call a delete handler
      console.log('Deleting jobs:', Array.from(selectedJobs));
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
        (job as any).currentVersion ? `v${(job as any).currentVersion}` : '',
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
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          dot: 'bg-blue-500'
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
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dot: 'bg-purple-500',
        label: 'AI'
      };
    }
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      dot: 'bg-blue-500',
      label: 'Manual'
    };
  };

  // Get unique values for filters
  const uniqueLocations = Array.from(new Set(jobs.map(job => job.location)));
  const uniqueDepartments = Array.from(new Set(jobs.map(job => job.department).filter(Boolean)));
  const uniqueEmploymentTypes = Array.from(new Set(jobs.map(job => job.employmentType).filter(Boolean)));
  const uniqueIndustries = Array.from(new Set(jobs.map(job => job.industry_type).filter(Boolean)));

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
    creationMethodFilter !== null,
    locationFilter !== 'all',
    departmentFilter !== 'all',
    industryFilter !== 'all',
    experienceFilter !== 'all',
    employmentTypeFilter !== 'all',
    applicantsFilter !== 'all',
    salaryRangeFilter !== 'all',
    datePostedFromFilter !== '',
    datePostedToFilter !== ''
  ].filter(Boolean).length;

  // NEW: Pagination logic
  const totalPages = Math.ceil(sortedJobs.length / itemsPerPage);
  const currentJobs = sortedJobs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, creationMethodFilter, locationFilter, departmentFilter, industryFilter, experienceFilter, employmentTypeFilter, applicantsFilter, datePostedFromFilter, datePostedToFilter, sortBy, sortOrder]);

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
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Simple Header */}
        <div className="mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 lg:mb-8">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1 sm:mb-2">Job Openings</h1>
              <p className="text-sm sm:text-base text-gray-600">Create and manage your job postings</p>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              {/* Quota limit warning */}
              {quotaInfo && quotaInfo.remaining <= 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Job publishing limit reached ({quotaInfo.used}/{quotaInfo.limit}). <a href="/subscription/current-plan" className="underline font-medium">Upgrade your plan</a></span>
                </div>
              )}
              {onCreateNew && (
                <button
                  onClick={() => {
                    if (quotaInfo && quotaInfo.remaining <= 0) {
                      setShowQuotaModal(true);
                      return;
                    }
                    onCreateNew();
                  }}
                  className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-3.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all flex items-center justify-center gap-2 text-sm sm:text-base font-medium"
                >
                  <Plus className="w-5 h-5" />
                  <span>Create New Job</span>
                </button>
              )}
            </div>
          </div>

          {/* Simple Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6">
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                </div>
                <span className="text-sm sm:text-base text-gray-600">Total Jobs</span>
              </div>
              <div className="text-2xl sm:text-4xl font-semibold text-gray-900">{stats.total}</div>
            </div>

            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                </div>
                <span className="text-sm sm:text-base text-gray-600">Active</span>
              </div>
              <div className="text-2xl sm:text-4xl font-semibold text-gray-900">{stats.published}</div>
            </div>

            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
                </div>
                <span className="text-sm sm:text-base text-gray-600">Drafts</span>
              </div>
              <div className="text-2xl sm:text-4xl font-semibold text-gray-900">{stats.draft}</div>
            </div>

            <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
              <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                </div>
                <span className="text-sm sm:text-base text-gray-600">Applicants</span>
              </div>
              <div className="text-2xl sm:text-4xl font-semibold text-gray-900">{stats.totalApplicants}</div>
            </div>
          </div>

          {/* Simple Search and Filters */}
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 text-sm sm:text-base text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 sm:p-1.5 rounded-lg">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 sm:p-2.5 rounded ${
                      viewMode === 'grid'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 sm:p-2.5 rounded ${
                      viewMode === 'list'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    <List className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>

                {/* More Filters Button */}
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg font-medium transition-all flex items-center gap-2 text-sm sm:text-base ${
                    activeFiltersCount > 0 || showAdvancedFilters
                      ? 'bg-gray-100 text-gray-800 border border-gray-300'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">More Filters</span>
                  <span className="sm:hidden">Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-1.5 sm:px-2 py-0.5 bg-gray-800 text-white rounded text-xs sm:text-sm">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="text-sm sm:text-base text-gray-600">Show:</span>
              {['all', 'Published', 'Draft', 'Disabled', 'Archived'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status.toLowerCase())}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base transition-all ${
                    statusFilter.toLowerCase() === status.toLowerCase()
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status === 'all' ? 'All Jobs' : status}
                </button>
              ))}

              {/* Creation Method Toggle - AI vs Manual */}
              <div className="flex items-center gap-2 sm:ml-4 sm:border-l sm:border-gray-300 sm:pl-4">
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setCreationMethodFilter(creationMethodFilter === 'ai' ? null : 'ai')}
                    className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 sm:gap-2 ${
                      creationMethodFilter === 'ai'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">AI Generated</span>
                    <span className="sm:hidden">AI</span>
                  </button>
                  <button
                    onClick={() => setCreationMethodFilter(creationMethodFilter === 'manual' ? null : 'manual')}
                    className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 sm:gap-2 ${
                      creationMethodFilter === 'manual'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Manual
                  </button>
                </div>
              </div>

              {/* Clear Filters */}
              {(searchQuery || activeFiltersCount > 0) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCreationMethodFilter(null);
                    setLocationFilter('all');
                    setDepartmentFilter('all');
                    setIndustryFilter('all');
                    setExperienceFilter('all');
                    setEmploymentTypeFilter('all');
                    setApplicantsFilter('all');
                    setDatePostedFromFilter('');
                    setDatePostedToFilter('');
                    setSalaryRangeFilter('all');
                  }}
                  className="ml-auto text-sm sm:text-base text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  Clear
                </button>
              )}
            </div>

            {/* More Filters Panel */}
            {showAdvancedFilters && (
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                  {/* Location */}
                  {uniqueLocations.length > 1 && (
                    <div>
                      <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Location</label>
                      <select
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
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
                      <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Department</label>
                      <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
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
                      <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Job Type</label>
                      <select
                        value={employmentTypeFilter}
                        onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
                      >
                        <option value="all">All Types</option>
                        {uniqueEmploymentTypes.map(type => (
                          <option key={type} value={type}>{formatEmploymentType(type)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Industry */}
                  {uniqueIndustries.length > 0 && (
                    <div>
                      <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Industry</label>
                      <select
                        value={industryFilter}
                        onChange={(e) => setIndustryFilter(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
                      >
                        <option value="all">All Industries</option>
                        {uniqueIndustries.map(industry => (
                          <option key={industry} value={industry}>{formatIndustryType(industry)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Experience */}
                  <div>
                    <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Experience</label>
                    <select
                      value={experienceFilter}
                      onChange={(e) => setExperienceFilter(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
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

                  {/* Posted From Date */}
                  <div>
                    <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Posted From</label>
                    <input
                      type="date"
                      value={datePostedFromFilter}
                      onChange={(e) => setDatePostedFromFilter(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
                    />
                  </div>

                  {/* Posted To Date */}
                  <div>
                    <label className="block text-sm sm:text-base text-gray-700 mb-1.5 sm:mb-2 font-medium">Posted To</label>
                    <input
                      type="date"
                      value={datePostedToFilter}
                      onChange={(e) => setDatePostedToFilter(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base text-black"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4 sm:mb-5">
          <p className="text-sm sm:text-base text-gray-600">
            Showing {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'}
            {filteredJobs.length !== jobs.length && ` (filtered from ${jobs.length} total)`}
          </p>
        </div>

        {/* Sort and Bulk Actions Bar */}
        {sortedJobs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 mb-4 sm:mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              {/* Left: Bulk Selection */}
              <div className="flex items-center gap-3 sm:gap-5">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-sm sm:text-base text-gray-700 hover:text-gray-900"
                >
                  {selectedJobs.size === sortedJobs.length && sortedJobs.length > 0 ? (
                    <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
                  ) : (
                    <Square className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
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
                      className="px-3 sm:px-5 py-2 sm:py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all flex items-center gap-2 text-sm sm:text-base"
                    >
                      <span>Bulk Actions</span>
                      <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>

                    {showBulkActions && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                        {canUpdateJd && (
                          <button
                            onClick={handleBulkPublish}
                            className="w-full px-5 py-3 text-left text-base text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                          >
                            <Send className="w-5 h-5 text-green-600" />
                            Publish Selected (Drafts)
                          </button>
                        )}
                        {canDisableJd && (
                          <button
                            onClick={handleBulkDisable}
                            className="w-full px-5 py-3 text-left text-base text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                          >
                            <Ban className="w-5 h-5 text-red-600" />
                            Disable Selected (Published)
                          </button>
                        )}
                        {canArchiveJd && (
                          <button
                            onClick={handleBulkArchive}
                            className="w-full px-5 py-3 text-left text-base text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                          >
                            <Archive className="w-5 h-5 text-gray-600" />
                            Archive Selected
                          </button>
                        )}
                        {(canExportJd || canDeleteJd) && <div className="border-t border-gray-200 my-2" />}
                        {canExportJd && (
                          <button
                            onClick={handleBulkExport}
                            className="w-full px-5 py-3 text-left text-base text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                          >
                            <Download className="w-5 h-5 text-gray-700" />
                            Export Selected to CSV
                          </button>
                        )}
                        {canDeleteJd && (
                          <button
                            onClick={handleBulkDelete}
                            className="w-full px-5 py-3 text-left text-base text-red-600 hover:bg-red-50 flex items-center gap-3"
                          >
                            <Trash2 className="w-5 h-5" />
                            Delete Selected
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Sort Controls */}
              <div className="flex items-center gap-2 sm:gap-4">
                <span className="text-sm sm:text-base text-gray-600">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const value = e.target.value as 'date' | 'applicants' | 'title' | 'status' | 'industry';
                    console.log('Sort by changed to:', value);
                    setSortBy(value);
                  }}
                  className="px-2 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm sm:text-base  text-black cursor-pointer"
                >
                  <option value="date">Date Posted</option>
                  <option value="applicants">Applicants</option>
                  <option value="title">Job Title</option>
                  <option value="status">Status</option>
                  <option value="industry">Industry Type</option>
                </select>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Sort order button clicked! Current order:', sortOrder, 'Switching to:', sortOrder === 'asc' ? 'desc' : 'asc');
                    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  }}
                  className="p-2 sm:p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-black cursor-pointer"
                  title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                >
                  <ArrowUpDown className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${sortOrder === 'asc' ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Jobs Grid/List */}
        {currentJobs.length > 0 ? (
          viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {currentJobs.map(job => {
                const displayStatus = getDisplayStatus(job.status, job.currentVersion);
                const statusConfig = getStatusConfig(displayStatus);
                const creationMethodConfig = getCreationMethodConfig(job.creation_method);

                return (
                  <div
                    key={job.id}
                    className={`bg-white rounded-xl border transition-all cursor-pointer ${selectedJobs.has(job.id) ? 'border-gray-700 shadow-md' : 'border-gray-200 hover:border-gray-400 hover:shadow-md'}`}
                    onClick={() => job.status.toLowerCase() === 'draft' && onEditJob ? onEditJob(job) : onViewJob(job)}
                  >
                    {/* Card Header */}
                    <div className="p-4 sm:p-6 border-b border-gray-100">
                      <div className="flex items-start justify-between mb-3 sm:mb-4">
                        <div className="flex items-center gap-2">
                          {/* Individual Select */}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                            className="flex-shrink-0"
                            title={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                          >
                            {selectedJobs.has(job.id)
                              ? <CheckSquare className="w-5 h-5 text-gray-800" />
                              : <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                            }
                          </button>
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Briefcase className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
                          <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 sm:gap-2`}>
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${statusConfig.dot}`}></div>
                            {displayStatus}
                          </span>
                          <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${creationMethodConfig.bg} ${creationMethodConfig.text} border ${creationMethodConfig.border} flex items-center gap-1.5 sm:gap-2`}>
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${creationMethodConfig.dot}`}></div>
                            {creationMethodConfig.label}
                          </span>
                          {job.currentVersion && job.currentVersion >= 1 && (
                            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 sm:gap-2">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gray-500"></div>
                              v{job.currentVersion}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        {job.job_id && (
                          <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm font-bold font-mono border border-blue-200">
                            {job.job_id}
                          </span>
                        )}
                        <h3 className="text-base sm:text-xl font-medium text-gray-900 line-clamp-2">
                          {job.title}
                        </h3>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 sm:p-6">
                      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-5">
                        {job.department && (
                          <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{job.department}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                          <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{formatIndustryType(job.industry_type)}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                          <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{job.location && job.location.trim() ? job.location : '-'}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                          <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{formatEmploymentType(job.employmentType)}</span>
                        </div>
                        {(job as any).workMode && (
                          <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span className="capitalize">{(job as any).workMode}</span>
                          </div>
                        )}
                        {job.experience && (
                          <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span>{job.experience} years</span>
                          </div>
                        )}
                        {job.postedDate && (
                          <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span>Posted {formatISTDate(job.postedDate)}</span>
                          </div>
                        )}
                        {job.postedBy && (
                          <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                            <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">By {job.postedBy}</span>
                          </div>
                        )}
                        {job.updated_at && (
                          <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-gray-600">
                            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">Last Updated: {formatLastUpdated(job.updated_at)}</span>
                          </div>
                        )}
                      </div>

                      {/* Salary & Skills Info */}
                      <div className="space-y-3 mb-5">
                        {(job as any).salary && (
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 rounded-lg">
                            <DollarSign className="w-5 h-5 text-green-600" />
                            <span className="text-base text-green-700">{(job as any).salary}</span>
                          </div>
                        )}
                        {((job as any).mustHaveSkills?.length > 0 || (job as any).niceToHaveSkills?.length > 0) && (
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-100 rounded-lg">
                            <Target className="w-5 h-5 text-gray-700" />
                            <span className="text-base text-gray-700">
                              {(job as any).mustHaveSkills?.length || 0} required + {(job as any).niceToHaveSkills?.length || 0} preferred skills
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Applicants */}
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-50 rounded-lg mb-4 sm:mb-5">
                        <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                        <span className="text-sm sm:text-base text-gray-700">
                          {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 items-center">
                        {/* Edit Button - icon only */}
                        {onEditJob && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditJob(job); }}
                            className="p-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* View Button - icon only, hide for Draft */}
                        {job.status.toLowerCase() !== 'draft' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewJob(job); }}
                            className="p-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            title="View"
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
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[100]">
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
            <div className="space-y-3 sm:space-y-4">
              {currentJobs.map(job => {
                const displayStatus = getDisplayStatus(job.status, job.currentVersion);
                const statusConfig = getStatusConfig(displayStatus);
                const creationMethodConfig = getCreationMethodConfig(job.creation_method);

                return (
                  <div
                    key={job.id}
                    className={`bg-white rounded-xl border transition-all cursor-pointer p-4 sm:p-6 ${selectedJobs.has(job.id) ? 'border-gray-700 shadow-md' : 'border-gray-200 hover:border-gray-400 hover:shadow-md'}`}
                    onClick={() => job.status.toLowerCase() === 'draft' && onEditJob ? onEditJob(job) : onViewJob(job)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
                      {/* Individual Select + Job Icon */}
                      <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectJob(job.id); }}
                          title={selectedJobs.has(job.id) ? 'Deselect' : 'Select'}
                        >
                          {selectedJobs.has(job.id)
                            ? <CheckSquare className="w-5 h-5 text-gray-800" />
                            : <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                          }
                        </button>
                        <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Briefcase className="w-7 h-7 text-gray-700" />
                        </div>
                      </div>

                      {/* Job Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-2 sm:mb-3">
                          {job.job_id && (
                            <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-blue-100 text-blue-700 rounded-md text-xs sm:text-sm font-bold font-mono border border-blue-200 flex-shrink-0">
                              {job.job_id}
                            </span>
                          )}
                          <h3 className="text-base sm:text-xl font-medium text-gray-900 truncate">
                            {job.title}
                          </h3>
                          <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} flex items-center gap-1.5 sm:gap-2 flex-shrink-0`}>
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${statusConfig.dot}`}></div>
                            {displayStatus}
                          </span>
                          <span className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm ${creationMethodConfig.bg} ${creationMethodConfig.text} border ${creationMethodConfig.border} flex items-center gap-1.5 sm:gap-2 flex-shrink-0`}>
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${creationMethodConfig.dot}`}></div>
                            {creationMethodConfig.label}
                          </span>
                          {job.currentVersion && job.currentVersion >= 1 && (
                            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gray-500"></div>
                              v{job.currentVersion}
                            </span>
                          )}
                        </div>

                        {/* Primary Info Row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-5 text-sm sm:text-base text-gray-600 mb-2 sm:mb-3">
                          {job.department && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              {job.department}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 sm:gap-2">
                            <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {formatIndustryType(job.industry_type)}
                          </span>
                          <span className="flex items-center gap-1.5 sm:gap-2">
                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {job.location && job.location.trim() ? job.location : '-'}
                          </span>
                          <span className="flex items-center gap-1.5 sm:gap-2">
                            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {formatEmploymentType(job.employmentType)}
                          </span>
                          {(job as any).workMode && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              <span className="capitalize">{(job as any).workMode}</span>
                            </span>
                          )}
                          {job.experience && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              {job.experience} years
                            </span>
                          )}
                          {job.postedDate && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              Posted {formatISTDate(job.postedDate)}
                            </span>
                          )}
                          {job.postedBy && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              By {job.postedBy}
                            </span>
                          )}
                          {job.updated_at && (
                            <span className="flex items-center gap-1.5 sm:gap-2">
                              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              Last Updated: {formatLastUpdated(job.updated_at)}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-50 rounded-lg">
                            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                            {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                          </span>
                        </div>

                        {/* Additional Info Row - Salary & Skills */}
                        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
                          {(job as any).salary && (
                            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 bg-green-50 rounded-lg text-sm sm:text-base">
                              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                              <span className="text-green-700">{(job as any).salary}</span>
                            </div>
                          )}
                          {((job as any).mustHaveSkills?.length > 0 || (job as any).niceToHaveSkills?.length > 0) && (
                            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 bg-gray-100 rounded-lg text-sm sm:text-base">
                              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                              <span className="text-gray-700">
                                {(job as any).mustHaveSkills?.length || 0} required + {(job as any).niceToHaveSkills?.length || 0} preferred
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 flex-shrink-0 items-center">
                        {/* Edit Button - icon only */}
                        {onEditJob && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditJob(job); }}
                            className="p-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* View Button - icon only, hide for Draft */}
                        {job.status.toLowerCase() !== 'draft' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewJob(job); }}
                            className="p-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}

                        {/* Three-dot Menu */}
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
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
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
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // Empty State
          <div className="bg-white rounded-xl border border-gray-200 p-10 sm:p-20 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                {searchQuery || activeFiltersCount > 0 ? (
                  <Search className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400" />
                ) : (
                  <Briefcase className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400" />
                )}
              </div>
              <h3 className="text-xl sm:text-2xl font-medium text-gray-900 mb-2 sm:mb-3">
                {searchQuery || activeFiltersCount > 0 ? 'No jobs found' : 'No jobs yet'}
              </h3>
              <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8">
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
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all inline-flex items-center gap-2 text-base font-medium"
                >
                  <XCircle className="w-5 h-5" />
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (quotaInfo && quotaInfo.remaining <= 0) {
                      setShowQuotaModal(true);
                      return;
                    }
                    onCreateNew();
                  }}
                  className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all inline-flex items-center gap-2 text-base font-medium"
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
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 mt-4 sm:mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              {/* Left: Items per page selector and showing info */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-sm sm:text-base text-gray-600">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="px-2 sm:px-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base text-black"
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-sm sm:text-base text-gray-600">per page</span>
                </div>

                <div className="hidden sm:block h-6 w-px bg-gray-300" />

                <span className="text-xs sm:text-base text-gray-600">
                  Showing <span className="font-medium text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * itemsPerPage, sortedJobs.length)}</span> of <span className="font-medium text-gray-900">{sortedJobs.length}</span> jobs
                </span>
              </div>

              {/* Right: Page navigation */}
              <div className="flex items-center justify-center sm:justify-end gap-1.5 sm:gap-2">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`p-2 sm:p-2.5 rounded-lg border transition-all ${
                    currentPage === 1
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {getPageNumbers().map((page, index) => (
                    <button
                      key={index}
                      onClick={() => typeof page === 'number' && handlePageChange(page)}
                      disabled={page === '...'}
                      className={`min-w-[34px] sm:min-w-[42px] h-8 sm:h-10 px-2 sm:px-4 rounded-lg text-sm sm:text-base transition-all ${
                        page === currentPage
                          ? 'bg-gray-800 text-white shadow-sm'
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
                  className={`p-2 sm:p-2.5 rounded-lg border transition-all ${
                    currentPage === totalPages
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
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

      {/* Quota Exceeded Modal */}
      {showQuotaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 sm:p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Insufficient Units</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                You've used {quotaInfo?.used}/{quotaInfo?.limit} job slots. Upgrade your plan to create more jobs.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                <button
                  onClick={() => setShowQuotaModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowQuotaModal(false);
                    window.location.href = '/subscription/current-plan';
                  }}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-sm sm:text-base font-medium"
                >
                  Upgrade Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}