'use client';

import { Plus, Search, MapPin, Calendar, Eye, MoreVertical, Users, Filter, CheckCircle2, FileText, Archive, Edit2, Trash2, Loader2, X, User, Briefcase, Monitor } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';

export default function JDListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jds, setJds] = useState<JDResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedJds, setSelectedJds] = useState<string[]>([]);

  // Read status from URL query parameter on mount
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && ['published', 'draft', 'archived', 'disabled'].includes(statusParam)) {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);

  // Fetch JDs from API
  const fetchJDs = async () => {
    setLoading(true);
    try {
      const response = await jdService.list({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery || undefined,
        page: currentPage,
        page_size: 20,
      });
      setJds(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to fetch JDs:', error);
      toast.error('Failed to load job descriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJDs();
  }, [statusFilter, currentPage]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchJDs();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedJds([]);
  }, [jds]);

  const handleArchive = async (jdId: string) => {
    try {
      await jdService.archive(jdId);
      toast.success('Job description archived');
      fetchJDs();
    } catch (error) {
      toast.error('Failed to archive');
    }
    setActiveDropdown(null);
  };

  const handleDelete = async (jdId: string) => {
    if (!confirm('Are you sure you want to delete this job description?')) return;
    try {
      await jdService.delete(jdId);
      toast.success('Job description deleted');
      fetchJDs();
    } catch (error) {
      toast.error('Failed to delete');
    }
    setActiveDropdown(null);
  };

  const handleBulkDelete = async () => {
    if (selectedJds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedJds.length} job description(s)?`)) return;

    try {
      let successCount = 0;
      let failCount = 0;

      for (const jdId of selectedJds) {
        try {
          await jdService.delete(jdId);
          successCount++;
        } catch (error) {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} job description(s) deleted`);
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} job description(s)`);
      }

      setSelectedJds([]);
      fetchJDs();
    } catch (error) {
      toast.error('Failed to delete job descriptions');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedJds(jds.map(jd => jd.id));
    } else {
      setSelectedJds([]);
    }
  };

  const handleSelectJd = (jdId: string) => {
    setSelectedJds(prev =>
      prev.includes(jdId)
        ? prev.filter(id => id !== jdId)
        : [...prev, jdId]
    );
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string; dot: string }> = {
      draft: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
      published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
      archived: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
      disabled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
    };
    const config = configs[status] || configs.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
        {status.charAt(0).toUpperCase() + status.slice(1)}
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

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Job Descriptions</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage your job descriptions ({total} total)
            </p>
          </div>
          <button
            onClick={() => router.push('/recruitment/jd-creation')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Create New JD
          </button>
        </div>

        {/* Bulk Actions Bar */}
        {selectedJds.length > 0 && (
          <div className="bg-gray-800 text-white rounded-lg p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-medium">{selectedJds.length} selected</span>
              <button
                onClick={() => setSelectedJds([])}
                className="text-gray-300 hover:text-white flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            </div>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            {/* Select All Checkbox */}
            {jds.length > 0 && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedJds.length === jds.length && jds.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-500"
                />
              </div>
            )}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search job descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* JD List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
            <span className="ml-3 text-gray-600">Loading job descriptions...</span>
          </div>
        ) : jds.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No job descriptions found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first job description to get started'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button
                onClick={() => router.push('/recruitment/jd-creation')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
              >
                <Plus className="w-4 h-4" />
                Create New JD
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {jds.map((jd) => (
              <div
                key={jd.id}
                className={`bg-white rounded-xl border ${selectedJds.includes(jd.id) ? 'border-gray-400 ring-1 ring-gray-400' : 'border-gray-200'} p-6 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between">
                  {/* Checkbox */}
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={selectedJds.includes(jd.id)}
                      onChange={() => handleSelectJd(jd.id)}
                      className="w-4 h-4 mt-1 text-gray-800 border-gray-300 rounded focus:ring-gray-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {jd.job_id && (
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium border border-blue-200">
                            {jd.job_id}
                          </span>
                        )}
                        <h3 className="text-lg font-semibold text-gray-900">{jd.title}</h3>
                        {getStatusBadge(jd.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3 flex-wrap">
                        {jd.department && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {jd.department}
                          </span>
                        )}
                        {jd.employment_type && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" />
                            <span className="capitalize">{jd.employment_type.replace('_', ' ')}</span>
                          </span>
                        )}
                        {jd.remote_type && (
                          <span className="flex items-center gap-1">
                            <Monitor className="w-4 h-4" />
                            <span className="capitalize">{jd.remote_type.replace('_', ' ')}</span>
                          </span>
                        )}
                        {jd.created_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Posted by {jd.created_by_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Created {formatDate(jd.created_at)}
                        </span>
                        {jd.published_at && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Published {formatDate(jd.published_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-2">
                        {jd.description?.substring(0, 200)}...
                      </p>
                      {/* Stats */}
                      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{jd.applicants_count || 0} applicants</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{jd.scored_resumes_count || 0} scored</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">{jd.assessments_count || 0} assessments</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 ml-4">
                    {/* Delete Button */}
                    <button
                      onClick={() => handleDelete(jd.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-sm">Delete</span>
                    </button>

                    {/* More Actions Dropdown */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown === jd.id ? null : jd.id);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-400" />
                      </button>
                      {activeDropdown === jd.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          <button
                            onClick={() => { router.push(`/recruitment/jd-details?id=${jd.id}`); setActiveDropdown(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="w-4 h-4" />
                            View Details
                          </button>
                          <button
                            onClick={() => { router.push(`/recruitment/jd-creation?id=${jd.id}&edit=true`); setActiveDropdown(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </button>
                          {jd.status !== 'archived' && (
                            <button
                              onClick={() => handleArchive(jd.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Archive className="w-4 h-4" />
                              Archive
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-gray-600">
              Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
