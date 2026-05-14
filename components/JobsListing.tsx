'use client'

import { Plus, Search, MapPin, Calendar, Target, Eye, MoreVertical, Briefcase, Users, User, Filter, TrendingUp, Clock, CheckCircle2, FileText, Sparkles, ChevronDown, SlidersHorizontal, LayoutGrid, List, Archive, XCircle, Building2, DollarSign, AlertCircle, ArrowUpRight, Heart, Star, Edit, Send, Ban, RefreshCw, ArrowUpDown, CheckSquare, Square, Trash2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Job } from '@/lib/types/types';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatISTDate, parseIST } from '@/lib/utils/dateUtils';
import { useAuth } from '@/components/providers/AuthProvider';
import PageBreadcrumb from '@/components/PageBreadcrumb';

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
  // Quick links to master-data screens — surfaced on this page instead of the sidebar
  masterDataLinks?: { id: string; label: string; href: string; icon: LucideIcon }[];
}

export default function JobsListing({ jobs, onCreateNew, onViewJob, onViewApplicants, onAIMatch, onUpdateJobStatus, onEditJob, onPublishJob, onDisableJob, onRepublishJob, onArchiveJob, onUnarchiveJob, onDeleteJob, quotaInfo, initialStatusFilter, masterDataLinks }: JobsListingProps) {
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
  const [itemsPerPage, setItemsPerPage] = useState(10);

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
      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-8">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5">
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Job Descriptions' }]} />
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
              {onCreateNew && (
                <button
                  onClick={() => {
                    if (quotaInfo && quotaInfo.remaining <= 0) {
                      setShowQuotaModal(true);
                      return;
                    }
                    onCreateNew();
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Job</span>
                </button>
              )}
            </div>
          </div>

          {/* Master-data quick links (moved here from the sidebar) */}
          {masterDataLinks && masterDataLinks.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {masterDataLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.id}
                    href={link.href}
                    className="group flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 group-hover:text-brand-blue">{link.label}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-brand-blue" />
                  </Link>
                );
              })}
            </div>
          )}

          {/* SaaS Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
            <div className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-blue-50/50 px-3.5 py-3.5 sm:px-4 sm:py-4 shadow-[0_10px_26px_-22px_rgba(37,99,235,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue/25 hover:shadow-[0_16px_30px_-22px_rgba(37,99,235,0.45)]">
              <div className="absolute inset-y-0 right-0 w-20 bg-[radial-gradient(circle_at_right,rgba(37,99,235,0.10),transparent_70%)]" aria-hidden />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand-blue ring-1 ring-blue-100 shadow-sm">
                    <Briefcase className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">Total Jobs</p>
                    <div className="mt-0.5 text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-slate-950">{stats.total}</div>
                  </div>
                </div>
              </div>
              <div className="relative mt-2.5 flex items-end justify-end">
                <svg viewBox="0 0 88 34" className="h-7 w-20 text-brand-blue/85" aria-hidden="true">
                  <path d="M4 27C12 26 15 20 22 20C29 20 31 23 38 18C45 13 49 17 56 14C63 11 66 4 84 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 27C12 26 15 20 22 20C29 20 31 23 38 18C45 13 49 17 56 14C63 11 66 4 84 4V34H4Z" fill="url(#jobs-spark)" opacity="0.18" />
                  <defs>
                    <linearGradient id="jobs-spark" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="currentColor" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-white via-white to-emerald-50/60 px-3.5 py-3.5 sm:px-4 sm:py-4 shadow-[0_10px_26px_-22px_rgba(22,163,74,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_16px_30px_-22px_rgba(22,163,74,0.38)]">
              <div className="absolute inset-y-0 right-0 w-20 bg-[radial-gradient(circle_at_right,rgba(34,197,94,0.12),transparent_70%)]" aria-hidden />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 shadow-sm">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">Active</p>
                    <div className="mt-0.5 text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-slate-950">{stats.published}</div>
                  </div>
                </div>
              </div>
              <div className="relative mt-2.5 flex items-end justify-end">
                <svg viewBox="0 0 88 34" className="h-7 w-20 text-emerald-500/85" aria-hidden="true">
                  <path d="M4 25C11 25 14 16 21 16C30 16 32 22 40 22C50 22 50 10 58 10C67 10 71 17 84 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 25C11 25 14 16 21 16C30 16 32 22 40 22C50 22 50 10 58 10C67 10 71 17 84 5V34H4Z" fill="url(#active-spark)" opacity="0.18" />
                  <defs>
                    <linearGradient id="active-spark" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="currentColor" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-orange-200/80 bg-gradient-to-br from-white via-white to-orange-50/60 px-3.5 py-3.5 sm:px-4 sm:py-4 shadow-[0_10px_26px_-22px_rgba(249,115,22,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_16px_30px_-22px_rgba(249,115,22,0.38)]">
              <div className="absolute inset-y-0 right-0 w-20 bg-[radial-gradient(circle_at_right,rgba(249,115,22,0.12),transparent_70%)]" aria-hidden />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-brand-orange-deep ring-1 ring-orange-100 shadow-sm">
                    <FileText className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">Drafts</p>
                    <div className="mt-0.5 text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-slate-950">{stats.draft}</div>
                  </div>
                </div>
              </div>
              <div className="relative mt-2.5 flex items-end justify-end">
                <svg viewBox="0 0 88 34" className="h-7 w-20 text-orange-500/85" aria-hidden="true">
                  <path d="M4 27C14 27 15 18 24 18C31 18 30 22 38 22C46 22 47 12 55 12C64 12 67 4 84 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 27C14 27 15 18 24 18C31 18 30 22 38 22C46 22 47 12 55 12C64 12 67 4 84 4V34H4Z" fill="url(#draft-spark)" opacity="0.18" />
                  <defs>
                    <linearGradient id="draft-spark" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="currentColor" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-cyan-200/80 bg-gradient-to-br from-white via-white to-cyan-50/60 px-3.5 py-3.5 sm:px-4 sm:py-4 shadow-[0_10px_26px_-22px_rgba(6,182,212,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_16px_30px_-22px_rgba(6,182,212,0.38)]">
              <div className="absolute inset-y-0 right-0 w-20 bg-[radial-gradient(circle_at_right,rgba(6,182,212,0.12),transparent_70%)]" aria-hidden />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-brand-cyan ring-1 ring-cyan-100 shadow-sm">
                    <Users className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">Applicants</p>
                    <div className="mt-0.5 text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-slate-950">{stats.totalApplicants}</div>
                  </div>
                </div>
              </div>
              <div className="relative mt-2.5 flex items-end justify-end">
                <svg viewBox="0 0 88 34" className="h-7 w-20 text-cyan-500/85" aria-hidden="true">
                  <path d="M4 28C14 23 19 25 28 22C35 19 39 21 45 16C52 11 57 15 64 12C72 9 76 4 84 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M4 28C14 23 19 25 28 22C35 19 39 21 45 16C52 11 57 15 64 12C72 9 76 4 84 4V34H4Z" fill="url(#applicants-spark)" opacity="0.18" />
                  <defs>
                    <linearGradient id="applicants-spark" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="currentColor" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>

          {/* SaaS Search and Filters */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-brand-blue/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full pl-9 pr-4 py-2 text-sm text-black border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* View Toggle */}
                <div className="flex items-center gap-1 bg-brand-blue/5 ring-1 ring-brand-blue/10 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded transition-all ${
                      viewMode === 'grid'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-brand-blue shadow-sm shadow-brand-blue/10'
                        : 'text-gray-600 hover:text-brand-blue'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>

                {/* More Filters Button */}
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${
                    activeFiltersCount > 0 || showAdvancedFilters
                      ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20'
                      : 'bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">More Filters</span>
                  <span className="sm:hidden">Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-brand-blue text-white rounded text-xs">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Show:</span>
              {['all', 'Published', 'Draft', 'Disabled', 'Archived'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status.toLowerCase())}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                    statusFilter.toLowerCase() === status.toLowerCase()
                      ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                      : 'bg-brand-blue/5 text-gray-700 hover:bg-brand-blue/10 hover:text-brand-blue'
                  }`}
                >
                  {status === 'all' ? 'All Jobs' : status}
                </button>
              ))}

              {/* Creation Method Toggle - AI vs Manual */}
              <div className="flex items-center gap-2 sm:ml-2 sm:border-l sm:border-gray-200 sm:pl-3">
                <div className="flex items-center bg-brand-blue/5 ring-1 ring-brand-blue/10 rounded-lg p-1">
                  <button
                    onClick={() => setCreationMethodFilter(creationMethodFilter === 'ai' ? null : 'ai')}
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
                    onClick={() => setCreationMethodFilter(creationMethodFilter === 'manual' ? null : 'manual')}
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
                  className="ml-auto text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <XCircle className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {/* More Filters Panel */}
            {showAdvancedFilters && (
              <div className="mt-4 pt-4 border-t border-brand-blue/10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {/* Location */}
                  {uniqueLocations.length > 1 && (
                    <div>
                      <label className="block text-sm text-gray-700 mb-1.5 font-medium">Location</label>
                      <select
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
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
                      <label className="block text-sm text-gray-700 mb-1.5 font-medium">Department</label>
                      <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
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
                      <label className="block text-sm text-gray-700 mb-1.5 font-medium">Job Type</label>
                      <select
                        value={employmentTypeFilter}
                        onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
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
                      <label className="block text-sm text-gray-700 mb-1.5 font-medium">Industry</label>
                      <select
                        value={industryFilter}
                        onChange={(e) => setIndustryFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
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
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Experience</label>
                    <select
                      value={experienceFilter}
                      onChange={(e) => setExperienceFilter(e.target.value)}
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

                  {/* Posted From Date */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Posted From</label>
                    <input
                      type="date"
                      value={datePostedFromFilter}
                      onChange={(e) => setDatePostedFromFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                    />
                  </div>

                  {/* Posted To Date */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Posted To</label>
                    <input
                      type="date"
                      value={datePostedToFilter}
                      onChange={(e) => setDatePostedToFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
                    />
                  </div>
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
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              {/* Left: Bulk Selection */}
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  {selectedJobs.size === sortedJobs.length && sortedJobs.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-brand-blue" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
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
                      className="px-3 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-sm shadow-brand-blue/25 transition-all flex items-center gap-2 text-sm"
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
                        {(canExportJd || canDeleteJd) && <div className="border-t border-gray-200 my-2" />}
                        {canExportJd && (
                          <button
                            onClick={handleBulkExport}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Download className="w-4 h-4 text-gray-700" />
                            Export Selected to CSV
                          </button>
                        )}
                        {canDeleteJd && (
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

              {/* Right: Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const value = e.target.value as 'date' | 'applicants' | 'title' | 'status' | 'industry';
                    console.log('Sort by changed to:', value);
                    setSortBy(value);
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black cursor-pointer"
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
                  className="p-2 border border-gray-200 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-gray-700 cursor-pointer"
                  title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
                >
                  <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'asc' ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>
          </div>
        )}

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
                    className={`bg-white rounded-xl border transition-all duration-150 cursor-pointer ${selectedJobs.has(job.id) ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30' : 'border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'}`}
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
                          {job.currentVersion && job.currentVersion >= 1 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                              v{job.currentVersion}
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
                            <span>{job.experience} years</span>
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
            <div className="space-y-3">
              {currentJobs.map(job => {
                const displayStatus = getDisplayStatus(job.status, job.currentVersion);
                const statusConfig = getStatusConfig(displayStatus);
                const creationMethodConfig = getCreationMethodConfig(job.creation_method);

                return (
                  <div
                    key={job.id}
                    className={`bg-white rounded-xl border transition-all duration-150 cursor-pointer p-4 ${selectedJobs.has(job.id) ? 'border-brand-blue/50 shadow-md shadow-brand-blue/10 ring-1 ring-brand-blue/30' : 'border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5'}`}
                    onClick={() => job.status.toLowerCase() === 'draft' && onEditJob ? onEditJob(job) : onViewJob(job)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
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
                          {job.currentVersion && job.currentVersion >= 1 && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-700 border border-gray-200 flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                              v{job.currentVersion}
                            </span>
                          )}
                        </div>

                        {/* Primary Info Row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 mb-2">
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
                          {job.experience && (
                            <span className="flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-gray-400" />
                              {job.experience} years
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

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 flex-shrink-0 items-center">
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
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setLocationFilter('all');
                    setDepartmentFilter('all');
                    setExperienceFilter('all');
                    setEmploymentTypeFilter('all');
                    setApplicantsFilter('all');
                    setDatePostedFromFilter('');
                    setDatePostedToFilter('');
                    setSalaryRangeFilter('all');
                  }}
                  className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
                >
                  <XCircle className="w-4 h-4" />
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
                  className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-sm shadow-brand-blue/25 hover:shadow-md hover:shadow-brand-blue/30 transition-all text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
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
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              {/* Left: Items per page selector and showing info */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black"
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
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
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
                          : 'border border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
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
                      : 'border-gray-200 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue'
                  }`}
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
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
          <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] p-5 max-w-md w-full shadow-2xl shadow-brand-blue/10 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 ring-1 ring-red-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <Briefcase className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 tracking-tight">Insufficient Units</h3>
              <p className="text-sm text-gray-600 mb-4">
                You've used {quotaInfo?.used}/{quotaInfo?.limit} job slots. Upgrade your plan to create more jobs.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
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
                  className="px-4 py-2 bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg shadow-sm shadow-brand-blue/25 text-sm font-medium transition-all"
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
