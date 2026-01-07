'use client';

import { Plus, Search, MapPin, Calendar, Eye, MoreVertical, Users, Filter, CheckCircle2, FileText, Archive, Edit2, Trash2, Loader2, X, User, Briefcase, Monitor, AlertTriangle, AlertCircle, Clock, ArrowUpDown, Power } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { jdService, JDResponse, JDAccessCheckResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';

// JD03: Status tabs for filtering
const STATUS_TABS = [
  { id: 'all', label: 'All JDs' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'archived', label: 'Archived' },
];

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
  // JD04: Sort state
  const [sortBy, setSortBy] = useState<string>('latest');

  // JD01 & JD03: Access check state
  const [accessCheck, setAccessCheck] = useState<JDAccessCheckResponse | null>(null);
  const [accessCheckLoading, setAccessCheckLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  // JD01 & JD03: Pre-flight access check on mount
  useEffect(() => {
    const checkAccess = async () => {
      setAccessCheckLoading(true);
      try {
        const response = await jdService.accessCheck();
        setAccessCheck(response);

        // Show warnings if any
        if (response.warnings && response.warnings.length > 0) {
          response.warnings.forEach(warning => toast.warning(warning));
        }

        // Show blocking error
        if (!response.can_create_jd && response.blocking_error) {
          setAccessError(response.blocking_error);
        }
      } catch (error) {
        console.error('Access check failed:', error);
        // Don't block on access check failure - allow viewing JDs
      } finally {
        setAccessCheckLoading(false);
      }
    };

    checkAccess();
  }, []);

  // Fetch JDs from API
  const fetchJDs = async () => {
    setLoading(true);
    try {
      const response = await jdService.list({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery || undefined,
        sort_by: sortBy,
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
  }, [statusFilter, currentPage, sortBy]);

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

  // JD04: Publish draft JD
  const handlePublish = async (jdId: string) => {
    try {
      await jdService.publish(jdId);
      toast.success('Job description published');
      fetchJDs();
    } catch (error) {
      toast.error('Failed to publish');
    }
    setActiveDropdown(null);
  };

  // JD04: Disable published JD
  const handleDisable = async (jdId: string) => {
    try {
      await jdService.updateStatus(jdId, 'disabled');
      toast.success('Job description disabled');
      fetchJDs();
    } catch (error) {
      toast.error('Failed to disable');
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

  const getStatusBadge = (status: string, currentVersion?: number) => {
    // Show "Republished" if published and version > 1
    const isRepublished = status === 'published' && currentVersion && currentVersion > 1;
    const displayStatus = isRepublished ? 'republished' : status;

    const configs: Record<string, { bg: string; text: string; dot: string }> = {
      draft: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
      published: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
      republished: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
      archived: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
      disabled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
    };
    const config = configs[displayStatus] || configs.draft;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></span>
        {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
      </span>
    );
  };

  const getCreationMethodBadge = (creationMethod: string) => {
    const isAI = creationMethod === 'ai_generated';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isAI ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isAI ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
        {isAI ? 'AI' : 'Manual'}
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

  // JD03: Check if user can create JD
  const canCreateJD = accessCheck?.can_create_jd !== false;

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* JD01 & JD03: Access Error Banner */}
        {accessError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Access Restricted</h3>
              <p className="text-sm text-red-700 mt-1">{accessError}</p>
              {accessCheck?.failed_checks && accessCheck.failed_checks.length > 0 && (
                <ul className="text-sm text-red-600 mt-2 list-disc list-inside">
                  {accessCheck.failed_checks.map((check, idx) => (
                    <li key={idx}>{check}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* JD03: Unit availability warning */}
        {accessCheck && !accessCheck.units.passed && accessCheck.can_create_jd && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Low Unit Availability</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Some units are running low. You can still create JDs, but scoring/assessment features may be limited.
              </p>
              <div className="flex gap-4 mt-2 text-xs text-yellow-700">
                {!accessCheck.units.RS.sufficient && (
                  <span>Resume Scoring: {accessCheck.units.RS.available} remaining</span>
                )}
                {!accessCheck.units.AS.sufficient && (
                  <span>Assessments: {accessCheck.units.AS.available} remaining</span>
                )}
                {!accessCheck.units.AIU.sufficient && (
                  <span>AI Interviews: {accessCheck.units.AIU.available} remaining</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Job Descriptions</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage your job descriptions ({total} total)
            </p>
          </div>
          <button
            onClick={() => canCreateJD && router.push('/recruitment/jd-creation')}
            disabled={!canCreateJD || accessCheckLoading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              canCreateJD
                ? 'bg-gray-800 text-white hover:bg-gray-900'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            title={!canCreateJD ? accessError || 'Cannot create JD' : 'Create a new job description'}
          >
            <Plus className="w-4 h-4" />
            Create New JD
          </button>
        </div>

        {/* JD03: Status Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white rounded-lg border border-gray-200 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
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

        {/* Search Bar */}
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
            {/* JD04: Sort dropdown */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                <option value="latest">Latest Updated</option>
                <option value="oldest">Oldest Updated</option>
                <option value="a-z">Title A-Z</option>
                <option value="z-a">Title Z-A</option>
                <option value="created_latest">Recently Created</option>
                <option value="created_oldest">Oldest Created</option>
              </select>
            </div>
            {/* Results count */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="px-2 py-1 bg-gray-100 rounded">
                {total} results
              </span>
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
            {!searchQuery && statusFilter === 'all' && canCreateJD && (
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
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <div className="flex items-start gap-4 flex-1 min-w-0 overflow-hidden">
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
                        {getStatusBadge(jd.status, jd.current_version)}
                        {jd.creation_method && getCreationMethodBadge(jd.creation_method)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {jd.industry_type || '-'}
                        </span>
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
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Created {formatDate(jd.created_at)}
                        </span>
                        {/* JD04: Last Updated */}
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Updated {formatDate(jd.updated_at)}
                        </span>
                        {jd.published_at && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Posted {formatDate(jd.published_at)}
                          </span>
                        )}
                        {jd.created_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Created by {jd.created_by_name}
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

                  {/* Actions - View, Edit buttons and 3-dot menu */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* View Button */}
                    <button
                      onClick={() => router.push(`/recruitment/jd-details?id=${jd.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 whitespace-nowrap"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="text-sm">View</span>
                    </button>

                    {/* Edit Button */}
                    <button
                      onClick={() => router.push(`/recruitment/jd-creation?id=${jd.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 whitespace-nowrap"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span className="text-sm">Edit</span>
                    </button>

                    {/* More Actions Dropdown (3-dot menu) */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown === jd.id ? null : jd.id);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300 bg-white"
                        title="More actions"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-700" />
                      </button>
                      {activeDropdown === jd.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          {/* View Applicants */}
                          <button
                            onClick={() => { router.push(`/recruitment/jd-details?id=${jd.id}&tab=applicants`); setActiveDropdown(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Users className="w-4 h-4" />
                            View Applicants
                          </button>
                          {/* JD04: Publish action for draft JDs */}
                          {jd.status === 'draft' && (
                            <button
                              onClick={() => { handlePublish(jd.id); setActiveDropdown(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Publish
                            </button>
                          )}
                          {/* JD04: Disable action for published JDs */}
                          {jd.status === 'published' && (
                            <button
                              onClick={() => { handleDisable(jd.id); setActiveDropdown(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-orange-700 hover:bg-orange-50"
                            >
                              <Power className="w-4 h-4" />
                              Disable Job
                            </button>
                          )}
                          {/* Archive action */}
                          {jd.status !== 'archived' && (
                            <button
                              onClick={() => { handleArchive(jd.id); setActiveDropdown(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Archive className="w-4 h-4" />
                              Archive Job
                            </button>
                          )}
                          {/* Delete action */}
                          <button
                            onClick={() => { handleDelete(jd.id); setActiveDropdown(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
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
