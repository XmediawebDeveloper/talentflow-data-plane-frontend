'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  RefreshCw,
  Ban,
  MoreVertical,
  Filter,
  ChevronDown,
  Loader2,
  Building2,
  TrendingUp
} from 'lucide-react';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';

type FilterStatus = 'all' | 'published' | 'draft' | 'closed' | 'disabled' | 'archived';

export default function JobOpeningsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JDResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

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

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await jdService.list({
        status: activeFilter !== 'all' ? activeFilter : undefined,
        search: searchQuery || undefined,
        page: currentPage,
        page_size: 12,
      });
      setJobs(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);

      // Calculate stats from multiple API calls
      const [allRes, publishedRes, draftRes] = await Promise.all([
        jdService.list({ page_size: 1 }),
        jdService.list({ status: 'published', page_size: 1 }),
        jdService.list({ status: 'draft', page_size: 1 }),
      ]);

      // Get applicants count from current page items
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

  useEffect(() => {
    fetchJobs();
  }, [activeFilter, currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchJobs();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleStatusChange = async (jobId: string, newStatus: string) => {
    try {
      await jdService.updateStatus(jobId, newStatus);
      toast.success(`Job status updated to ${newStatus}`);
      fetchJobs();
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
          <button
            onClick={() => router.push('/recruitment/jd-creation')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create New Job
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Jobs</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalJobs}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-blue-600" />
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
                <p className="text-2xl font-semibold text-purple-600">{stats.totalApplicants}</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
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
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
          </div>
        </div>

        {/* Jobs Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
              <button
                onClick={() => router.push('/recruitment/jd-creation')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Create New Job
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-200 group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-base mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
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
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                        <button
                          onClick={() => { router.push(`/recruitment/job-details?id=${job.id}`); setActiveDropdown(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                        {job.status === 'draft' && (
                          <button
                            onClick={() => handleStatusChange(job.id, 'published')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Publish
                          </button>
                        )}
                        {job.status === 'published' && (
                          <button
                            onClick={() => handleStatusChange(job.id, 'disabled')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Ban className="w-4 h-4" />
                            Disable
                          </button>
                        )}
                        {job.status === 'disabled' && (
                          <button
                            onClick={() => handleStatusChange(job.id, 'published')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Republish
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
                  {job.location && (
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
                  <button
                    onClick={() => router.push(`/recruitment/job-details?id=${job.id}`)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                </div>
              </div>
            ))}
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
    </div>
  );
}
