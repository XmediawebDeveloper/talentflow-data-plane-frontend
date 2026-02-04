'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Plus,
  Briefcase,
  CheckCircle,
  FileText,
  Users,
  MapPin,
  Calendar,
  Clock,
  Eye,
  Edit2,
  RefreshCw,
  Ban,
  MoreVertical,
  Filter,
  ChevronDown,
  Loader2,
  Building2,
  TrendingUp,
  LayoutGrid,
  List,
  Archive,
  Power,
  AlertCircle
} from 'lucide-react';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';
import api from '@/lib/services/api';

type FilterStatus = 'all' | 'published' | 'draft' | 'closed' | 'disabled' | 'archived';
type ViewMode = 'grid' | 'list';

export default function JobOpeningsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jobs, setJobs] = useState<JDResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
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
    { key: 'closed', label: 'Closed' },
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

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      published: { bg: 'bg-green-100', text: 'text-green-700', label: 'Published' },
      draft: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Draft' },
      closed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Closed' },
      disabled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Disabled' },
      archived: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Archived' },
    };
    const config = configs[status] || configs.draft;
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getExperienceText = (min?: number, max?: number) => {
    if (min && max) return `${min}-${max} years`;
    if (min) return `${min}+ years`;
    if (max) return `Up to ${max} years`;
    return 'Not specified';
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Job Openings</h1>
            <p className="text-sm text-gray-500 mt-1">Manage and track all your job postings</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => {
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
              disabled={hasInsufficientUnits}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors font-medium shadow-sm ${
                hasInsufficientUnits
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-800 text-white hover:bg-gray-900'
              }`}
            >
              <Plus className="w-4 h-4" />
              Create New Job
            </button>
            {hasInsufficientUnits && (
              <span className="text-xs text-red-600 font-medium">Insufficient units</span>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Jobs</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalJobs}</p>
              </div>
              <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-gray-800" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Active</p>
                <p className="text-2xl font-semibold text-green-600">{stats.activeJobs}</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Drafts</p>
                <p className="text-2xl font-semibold text-yellow-600">{stats.draftJobs}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-50 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Applicants</p>
                <p className="text-2xl font-semibold text-gray-800">{stats.totalApplicants}</p>
              </div>
              <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-gray-800" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              {filters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => { setActiveFilter(filter.key); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeFilter === filter.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Jobs Display */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
            <span className="ml-3 text-gray-600">Loading job openings...</span>
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
                <button
                  onClick={() => {
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
                  disabled={hasInsufficientUnits}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
                    hasInsufficientUnits
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-800 text-white hover:bg-gray-900'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  Create New Job
                </button>
                {hasInsufficientUnits && (
                  <span className="text-xs text-red-600 font-medium">Insufficient units</span>
                )}
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-200 group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-base mb-1 line-clamp-1 group-hover:text-gray-800 transition-colors">
                      {job.title}
                    </h3>
                    {getStatusBadge(job.status)}
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === job.id ? null : job.id);
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
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
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Publish
                          </button>
                        )}
                        {/* Disable Job for published */}
                        {job.status === 'published' && (
                          <button
                            onClick={() => handleStatusChange(job.id, 'disabled')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                          >
                            <Power className="w-4 h-4" />
                            Disable Job
                          </button>
                        )}
                        {/* Re-enable JD for disabled */}
                        {job.status === 'disabled' && (
                          <button
                            onClick={() => handleStatusChange(job.id, 'published')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                          >
                            <Power className="w-4 h-4" />
                            Re-enable JD
                          </button>
                        )}
                        {/* Archive Job */}
                        {job.status !== 'archived' && (
                          <button
                            onClick={() => handleStatusChange(job.id, 'archived')}
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

                {/* Info */}
                <div className="space-y-2 mb-4">
                  {job.department && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span>{job.department}</span>
                    </div>
                  )}
                  {/* Location hidden for now */}
                  {false && job.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>{job.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>{getExperienceText(job.experience_min, job.experience_max)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{formatDate(job.created_at)}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{job.applicants_count || 0} applicants</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Edit Button */}
                    <button
                      onClick={() => router.push(`/recruitment/jd-creation?id=${job.id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    {/* View Button */}
                    <button
                      onClick={() => router.push(`/recruitment/job-details?id=${job.id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Title</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  {/* Location column hidden for now */}
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Experience</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Applicants</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/recruitment/job-details?id=${job.id}`)}
                        className="font-medium text-gray-900 hover:text-gray-800 transition-colors text-left"
                      >
                        {job.title}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {job.department || '-'}
                    </td>
                    {/* Location column hidden for now */}
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {getExperienceText(job.experience_min, job.experience_max)}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(job.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span>{job.applicants_count || 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => router.push(`/recruitment/jd-creation?id=${job.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        {/* View Button */}
                        <button
                          onClick={() => router.push(`/recruitment/job-details?id=${job.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        {/* More Actions Dropdown */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === job.id ? null : job.id);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-500" />
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
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Publish
                                </button>
                              )}
                              {/* Disable Job for published */}
                              {job.status === 'published' && (
                                <button
                                  onClick={() => handleStatusChange(job.id, 'disabled')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  <Power className="w-4 h-4" />
                                  Disable Job
                                </button>
                              )}
                              {/* Re-enable JD for disabled */}
                              {job.status === 'disabled' && (
                                <button
                                  onClick={() => handleStatusChange(job.id, 'published')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                                >
                                  <Power className="w-4 h-4" />
                                  Re-enable JD
                                </button>
                              )}
                              {/* Archive Job */}
                              {job.status !== 'archived' && (
                                <button
                                  onClick={() => handleStatusChange(job.id, 'archived')}
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
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-gray-600">
              Showing {(currentPage - 1) * 12 + 1} to {Math.min(currentPage * 12, total)} of {total} jobs
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Job Quota Exceeded Modal */}
      {showQuotaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Job Quota Exceeded</h3>
              <p className="text-gray-600 mb-6">
                You've used {quotaInfo?.used}/{quotaInfo?.limit} job slots. Upgrade your plan to create more jobs.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowQuotaModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowQuotaModal(false);
                    router.push('/subscription/current-plan');
                  }}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium"
                >
                  Upgrade Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Units Modal - when RS, RU, AS are all 0 */}
      {showInsufficientUnitsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Insufficient Units</h3>
              <p className="text-gray-600 mb-4">
                You cannot create a new job because all your units have been exhausted.
              </p>

              {/* Unit Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm font-medium text-gray-700 mb-2">Current Unit Balance:</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Resume Upload (RU)</span>
                    <span className={`font-medium ${unitQuotas?.RU === 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {unitQuotas?.RU || 0} units
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Resume Scoring (RS)</span>
                    <span className={`font-medium ${unitQuotas?.RS === 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {unitQuotas?.RS || 0} units
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Assessment (AS)</span>
                    <span className={`font-medium ${unitQuotas?.AS === 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {unitQuotas?.AS || 0} units
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  At least one unit type must have available units to create a job.
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowInsufficientUnitsModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowInsufficientUnitsModal(false);
                    router.push('/subscription/usage-quotas');
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
                >
                  Buy Units
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
