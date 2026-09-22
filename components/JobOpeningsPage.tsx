'use client';

import { formatISTDate } from '@/lib/utils/dateUtils';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Plus,
  Briefcase,
  CheckCircle,
  FileText,
  Users,
  Eye,
  Edit2,
  RefreshCw,
  Ban,
  MoreVertical,
  Filter,
  ChevronDown,
  TrendingUp,
  Archive,
  Power,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';
import api from '@/lib/services/api';
import { useAuth } from '@/components/providers/AuthProvider';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type FilterStatus = 'all' | 'published' | 'draft' | 'closed' | 'disabled' | 'archived';

export default function JobOpeningsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ RBAC: Get user permissions (bypass for tenant admin)
  const { user, isTenantAdmin } = useAuth();
  const canCreateJd = isTenantAdmin || (user?.permissions?.canCreateJD ?? false);
  const canUpdateJd = isTenantAdmin || (user?.permissions?.canUpdateJD ?? false);
  const canDeleteJd = isTenantAdmin || (user?.permissions?.canDeleteJD ?? false);

  const [jobs, setJobs] = useState<JDResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // "Go to page" input — local text so a partial edit isn't clobbered by the
  // currentPage state until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState('1');
  useEffect(() => {
    setGoToPage(String(currentPage));
  }, [currentPage]);
  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    } else {
      setGoToPage(String(currentPage));
    }
  };
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  // Quota info for job publishing limit
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; limit: number; used: number } | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);

  // Unit quotas for JD creation blocking
  const [unitQuotas, setUnitQuotas] = useState<{
    RS: number;  // Resume Scoring
    RU: number;  // Resume Upload
    AS: number;  // Assessment
  } | null>(null);
  const [showInsufficientUnitsModal, setShowInsufficientUnitsModal] = useState(false);

  // Check if all units are 0 - block JD creation
  const hasInsufficientUnits = unitQuotas !== null &&
    unitQuotas.RS === 0 &&
    unitQuotas.RU === 0 &&
    unitQuotas.AS === 0;

  // Stats
  const [stats, setStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    draftJobs: 0,
    totalApplicants: 0
  });

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All Jobs' },
    { key: 'published', label: 'Published' },
    { key: 'draft', label: 'Draft' },
    { key: 'disabled', label: 'Disabled' },
    { key: 'archived', label: 'Archived' },
  ];

  // Sync activeFilter with URL on mount and URL changes
  useEffect(() => {
    const statusFromUrl = searchParams.get('status') as FilterStatus | null;
    if (statusFromUrl && ['published', 'draft', 'closed', 'disabled', 'archived'].includes(statusFromUrl)) {
      setActiveFilter(statusFromUrl);
    }
  }, [searchParams]);

  // Fetch jobs when filter changes
  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      try {
        // Build params - only include status if not 'all'
        const params: { status?: string; search?: string; source?: string; page: number; page_size: number } = {
          page: currentPage,
          page_size: 12,
          source: 'my-jds',  // Only show JDs created by the logged-in user
        };

        if (activeFilter !== 'all') {
          params.status = activeFilter;
        }

        if (searchQuery) {
          params.search = searchQuery;
        }

        const response = await jdService.list(params);
        setJobs(response.items);
        setTotalPages(response.total_pages);
        setTotal(response.total);

        // Calculate stats from multiple API calls (also filtered by user)
        const [allRes, publishedRes, draftRes] = await Promise.all([
          jdService.list({ page_size: 1, source: 'my-jds' }),
          jdService.list({ status: 'published', page_size: 1, source: 'my-jds' }),
          jdService.list({ status: 'draft', page_size: 1, source: 'my-jds' }),
        ]);

        const totalApplicants = response.items.reduce((sum, j) => sum + (j.applicants_count || 0), 0);

        setStats({
          totalJobs: allRes.total,
          activeJobs: publishedRes.total,
          draftJobs: draftRes.total,
          totalApplicants: totalApplicants
        });
      } catch (error) {
        console.error('Failed to fetch jobs:', error);
        toast.error('Failed to load job openings');
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [activeFilter, currentPage, searchQuery, refetchKey]);

  // Fetch quota status for job publishing limit and unit quotas
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await api.get('/usage/quota-status');
        if (response.data?.status === 'success' && response.data.data?.quotas) {
          const quotas = response.data.data.quotas;

          // Job quota
          if (quotas.max_jobs) {
            const maxJobs = quotas.max_jobs;
            setQuotaInfo({
              remaining: maxJobs.total_remaining || 0,
              limit: (maxJobs.subscription?.limit || 0) + (maxJobs.addon?.total_purchased || 0),
              used: maxJobs.subscription?.used || 0,
            });
          }

          // Unit quotas (RS, RU, AS) for JD creation blocking
          setUnitQuotas({
            RS: quotas.RS?.total_remaining || 0,
            RU: quotas.RU?.total_remaining || 0,
            AS: quotas.AS?.total_remaining || 0,
          });
        }
      } catch (error) {
        console.error('Failed to fetch quota:', error);
      }
    };
    fetchQuota();
  }, []);

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    try {
      await jdService.updateStatus(jobId, newStatus);
      toast.success(`Job status updated to ${newStatus}`);
      // Trigger refetch
      setRefetchKey(prev => prev + 1);
    } catch (error) {
      toast.error('Failed to update status');
    }
    setActiveDropdown(null);
  };

  // `republishedAt` is passed separately rather than folded into `status` on purpose:
  // the filter tabs and every backend query key off status === 'published', so a
  // distinct 'republished' status would drop these JDs out of the Published tab.
  // A JD edited into a NEW VERSION is a fresh row and stays 'Published'; only one
  // edited and published IN PLACE carries republished_at.
  const getStatusBadge = (status: string, republishedAt?: string | null) => {
    if (status === 'published' && republishedAt) {
      return <Badge variant="success">Republished</Badge>;
    }
    const map: Record<string, { variant: 'success' | 'info' | 'destructive' | 'muted'; label: string }> = {
      published: { variant: 'success', label: 'Published' },
      draft: { variant: 'info', label: 'Draft' },
      closed: { variant: 'muted', label: 'Closed' },
      disabled: { variant: 'destructive', label: 'Disabled' },
      archived: { variant: 'muted', label: 'Archived' },
    };
    const config = map[status] || map.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };


  const getExperienceText = (min?: number, max?: number) => {
    if (min && max) return `${min}-${max} years`;
    if (min) return `${min}+ years`;
    if (max) return `Up to ${max} years`;
    return 'Not specified';
  };

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Job Openings</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and track all your job postings</p>
          </div>
          <div className="flex flex-col items-stretch md:items-end gap-1 w-full md:w-auto">
            <Button
              variant="primary"
              onClick={() => {
                if (!canCreateJd) {
                  toast.error('You do not have permission to create job descriptions');
                  return;
                }
                if (hasInsufficientUnits) {
                  setShowInsufficientUnitsModal(true);
                  return;
                }
                if (quotaInfo && quotaInfo.remaining <= 0) {
                  setShowQuotaModal(true);
                  return;
                }
                router.push('/recruitment/jd-creation');
              }}
              disabled={!canCreateJd || hasInsufficientUnits}
              icon={<Plus className="w-4 h-4" />}
              title={!canCreateJd ? 'You do not have permission to create job descriptions' : ''}
            >
              Create New Job
            </Button>
            {!canCreateJd && (
              <span className="text-xs text-destructive font-medium">No create permission</span>
            )}
            {canCreateJd && hasInsufficientUnits && (
              <span className="text-xs text-destructive font-medium">Insufficient units</span>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3 md:gap-4 mb-6">
          <div className="bg-white rounded-md sm:rounded-lg md:rounded-xl border border-gray-200 p-1.5 sm:p-3 md:p-5">
            <div className="flex flex-col gap-1 sm:gap-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs sm:text-xs md:text-sm text-gray-500 leading-tight">Total Jobs</p>
                <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gray-50 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-800" />
                </div>
              </div>
              <p className="text-sm sm:text-xl md:text-2xl font-semibold text-gray-900 whitespace-nowrap">{stats.totalJobs}</p>
            </div>
          </div>

          <div className="bg-white rounded-md sm:rounded-lg md:rounded-xl border border-gray-200 p-1.5 sm:p-3 md:p-5">
            <div className="flex flex-col gap-1 sm:gap-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs sm:text-xs md:text-sm text-gray-500 leading-tight">Active</p>
                <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-success-subtle rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-success" />
                </div>
              </div>
              <p className="text-sm sm:text-xl md:text-2xl font-semibold text-success whitespace-nowrap">{stats.activeJobs}</p>
            </div>
          </div>

          <div className="bg-white rounded-md sm:rounded-lg md:rounded-xl border border-gray-200 p-1.5 sm:p-3 md:p-5">
            <div className="flex flex-col gap-1 sm:gap-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs sm:text-xs md:text-sm text-gray-500 leading-tight">Drafts</p>
                <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-warning-subtle rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-warning" />
                </div>
              </div>
              <p className="text-sm sm:text-xl md:text-2xl font-semibold text-warning whitespace-nowrap">{stats.draftJobs}</p>
            </div>
          </div>

          <div className="bg-white rounded-md sm:rounded-lg md:rounded-xl border border-gray-200 p-1.5 sm:p-3 md:p-5">
            <div className="flex flex-col gap-1 sm:gap-2">
              <div className="flex items-center justify-between">
                <p className="text-2xs sm:text-xs md:text-sm text-gray-500 leading-tight">Applicants</p>
                <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-gray-50 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-800" />
                </div>
              </div>
              <p className="text-sm sm:text-xl md:text-2xl font-semibold text-gray-800 whitespace-nowrap">{stats.totalApplicants}</p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search jobs by title, department, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-lg">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => { setActiveFilter(filter.key); setCurrentPage(1); }}
                  className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                    activeFilter === filter.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Jobs Display */}
        {loading ? (
          /* Skeleton mirrors the jobs table below: same white card + table
             shell, the same 7 columns in the same order (Job Title,
             Department, Experience, Status, Applicants, Created, Actions) with
             the same responsive-hide breakpoints, and 8 body rows sized per
             column (status/applicants as chips, actions as icon buttons). */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 sm:px-6 py-3 sm:py-4"><Skeleton className="h-3 w-20" /></th>
                    <th className="text-left px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell"><Skeleton className="h-3 w-24" /></th>
                    <th className="text-left px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell"><Skeleton className="h-3 w-20" /></th>
                    <th className="text-left px-3 sm:px-6 py-3 sm:py-4"><Skeleton className="h-3 w-16" /></th>
                    <th className="text-left px-3 sm:px-6 py-3 sm:py-4 hidden lg:table-cell"><Skeleton className="h-3 w-20" /></th>
                    <th className="text-left px-3 sm:px-6 py-3 sm:py-4 hidden lg:table-cell"><Skeleton className="h-3 w-16" /></th>
                    <th className="text-right px-3 sm:px-6 py-3 sm:py-4 tf-sticky-col"><Skeleton className="h-3 w-16 ml-auto" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 sm:px-6 py-3 sm:py-4"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden md:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden lg:table-cell"><Skeleton className="h-4 w-10" /></td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden lg:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-2 sm:px-6 py-3 sm:py-4 tf-sticky-col">
                        <div className="flex items-center justify-end gap-0.5 sm:gap-2">
                          <Skeleton className="h-7 w-7 sm:w-14 rounded" />
                          <Skeleton className="h-7 w-7 sm:w-14 rounded" />
                          <Skeleton className="h-7 w-7 rounded" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No job openings found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || activeFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first job posting to get started'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!canCreateJd) {
                      toast.error('You do not have permission to create job descriptions');
                      return;
                    }
                    if (hasInsufficientUnits) {
                      setShowInsufficientUnitsModal(true);
                      return;
                    }
                    if (quotaInfo && quotaInfo.remaining <= 0) {
                      setShowQuotaModal(true);
                      return;
                    }
                    router.push('/recruitment/jd-creation');
                  }}
                  disabled={!canCreateJd || hasInsufficientUnits}
                  icon={<Plus className="w-4 h-4" />}
                  title={!canCreateJd ? 'You do not have permission to create job descriptions' : ''}
                >
                  Create New Job
                </Button>
                {!canCreateJd && (
                  <span className="text-xs text-destructive font-medium">No create permission</span>
                )}
                {canCreateJd && hasInsufficientUnits && (
                  <span className="text-xs text-destructive font-medium">Insufficient units</span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Title</th>
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Department</th>
                  {/* Location column hidden for now */}
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Experience</th>
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Applicants</th>
                  <th className="text-left px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                  <th className="text-right px-3 sm:px-6 py-3 sm:py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider tf-sticky-col">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <button
                        onClick={() => router.push(`/recruitment/job-details?id=${job.id}`)}
                        className="font-medium text-xs sm:text-sm text-gray-900 hover:text-gray-800 transition-colors text-left"
                      >
                        {job.title}
                      </button>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600 hidden sm:table-cell">
                      {job.department || '-'}
                    </td>
                    {/* Location column hidden for now */}
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-600 hidden md:table-cell">
                      {getExperienceText(job.experience_min, job.experience_max)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      {getStatusBadge(job.status, job.republished_at)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                        <span>{job.applicants_count || 0}</span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-500 hidden lg:table-cell">
                      {formatISTDate(job.created_at)}
                    </td>
                    <td className="px-2 sm:px-6 py-3 sm:py-4 text-right tf-sticky-col">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => {
                            if (!canUpdateJd) {
                              toast.error('You do not have permission to edit job descriptions');
                              return;
                            }
                            router.push(`/recruitment/jd-creation?id=${job.id}`);
                          }}
                          disabled={!canUpdateJd}
                          className={`flex items-center justify-center gap-0 sm:gap-1 p-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm rounded transition-colors border ${
                            canUpdateJd
                              ? 'text-gray-600 hover:bg-gray-100 border-gray-200 cursor-pointer'
                              : 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                          }`}
                          title={!canUpdateJd ? 'You do not have permission to edit job descriptions' : 'Edit'}
                        >
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        {/* View Button */}
                        <button
                          onClick={() => router.push(`/recruitment/job-details?id=${job.id}`)}
                          className="flex items-center justify-center gap-0 sm:gap-1 p-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors border border-gray-200"
                          aria-label="View" title="View"
                        >
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">View</span>
                        </button>
                        {/* More Actions Dropdown */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === job.id ? null : job.id);
                            }}
                            className="p-1 sm:p-2 hover:bg-gray-100 rounded transition-colors border border-gray-200"
                            aria-label="More actions" title="More actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                          </button>
                          {activeDropdown === job.id && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                              {/* View Applicants */}
                              <button
                                onClick={() => { router.push(`/recruitment/job-details?id=${job.id}&tab=applicants`); setActiveDropdown(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Users className="w-4 h-4" />
                                View Applicants
                              </button>
                              {/* Publish for drafts */}
                              {job.status === 'draft' && (
                                <button
                                  onClick={() => handleStatusChange(job.id, 'published')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success hover:bg-success-subtle"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Publish
                                </button>
                              )}
                              {/* Disable Job for published */}
                              {job.status === 'published' && canUpdateJd && (
                                <button
                                  onClick={() => {
                                    if (!canUpdateJd) {
                                      toast.error('You do not have permission to update job descriptions');
                                      return;
                                    }
                                    handleStatusChange(job.id, 'disabled');
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  <Power className="w-4 h-4" />
                                  Disable Job
                                </button>
                              )}
                              {/* Re-enable JD for disabled */}
                              {job.status === 'disabled' && canUpdateJd && (
                                <button
                                  onClick={() => {
                                    if (!canUpdateJd) {
                                      toast.error('You do not have permission to update job descriptions');
                                      return;
                                    }
                                    handleStatusChange(job.id, 'published');
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success hover:bg-success-subtle"
                                >
                                  <Power className="w-4 h-4" />
                                  Re-enable JD
                                </button>
                              )}
                              {/* Archive Job */}
                              {job.status !== 'archived' && canDeleteJd && (
                                <button
                                  onClick={() => {
                                    if (!canDeleteJd) {
                                      toast.error('You do not have permission to archive job descriptions');
                                      return;
                                    }
                                    handleStatusChange(job.id, 'archived');
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <Archive className="w-4 h-4" />
                                  Archive Job
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <p className="text-xs sm:text-sm text-gray-600">
              Showing {(currentPage - 1) * 12 + 1} to {Math.min(currentPage * 12, total)} of {total} jobs
            </p>
            <div className="flex items-center gap-2 sm:gap-3">
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
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                aria-label="Previous page" title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{currentPage}</span> / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                aria-label="Next page" title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Job Quota Exceeded Modal */}
      {showQuotaModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-xl border border-gray-200 max-w-[95vw] sm:max-w-md w-full shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col">
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Job Quota Exceeded</h3>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 sm:px-6 py-5 overflow-y-auto flex-1">
              <div className="text-center">
                <div className="w-16 h-16 bg-destructive-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-destructive" />
                </div>
                <p className="text-gray-600">
                  You've used {quotaInfo?.used}/{quotaInfo?.limit} job slots. Upgrade your plan to create more jobs.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 sm:px-6 py-4 border-t border-gray-200 flex gap-3 justify-center shrink-0">
              <Button
                variant="secondary"
                onClick={() => setShowQuotaModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowQuotaModal(false);
                  router.push('/subscription/current-plan');
                }}
              >
                Upgrade Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Units Modal - when RS, RU, AS are all 0 */}
      {showInsufficientUnitsModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-xl border border-gray-200 max-w-[95vw] sm:max-w-md w-full shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col">
            {/* Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Insufficient Units</h3>
              <button
                onClick={() => setShowInsufficientUnitsModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 sm:px-6 py-5 overflow-y-auto flex-1">
              <div className="text-center">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-orange-600" />
                </div>
                <p className="text-gray-600 mb-4">
                  You cannot create a new job because all your units have been exhausted.
                </p>

                {/* Unit Details */}
                <div className="bg-gray-50 rounded-lg p-4 text-left">
                  <p className="text-sm font-medium text-gray-700 mb-2">Current Unit Balance:</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Resume Storage (RU)</span>
                      <span className={`font-medium ${unitQuotas?.RU === 0 ? 'text-destructive' : 'text-success'}`}>
                        {unitQuotas?.RU || 0} units
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Resume Scoring (RS)</span>
                      <span className={`font-medium ${unitQuotas?.RS === 0 ? 'text-destructive' : 'text-success'}`}>
                        {unitQuotas?.RS || 0} units
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Assessment (AS)</span>
                      <span className={`font-medium ${unitQuotas?.AS === 0 ? 'text-destructive' : 'text-success'}`}>
                        {unitQuotas?.AS || 0} units
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    At least one unit type must have available units to create a job.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 sm:px-6 py-4 border-t border-gray-200 flex gap-3 justify-center shrink-0">
              <Button
                variant="secondary"
                onClick={() => setShowInsufficientUnitsModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowInsufficientUnitsModal(false);
                  router.push('/subscription/usage-quotas');
                }}
              >
                Buy Units
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
