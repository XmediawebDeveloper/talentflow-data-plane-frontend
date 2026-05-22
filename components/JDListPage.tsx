'use client';

import { Plus, Search, MapPin, Calendar, Eye, MoreVertical, Users, Filter, CheckCircle2, FileText, Archive, Edit2, Trash2, Loader2, X, User, Briefcase, Monitor, AlertTriangle, AlertCircle, Clock, ArrowUpDown, Power, Target, Download } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { exportToCSV, ExportColumn } from '@/lib/utils/exportUtils';
import { jdService, JDResponse, JDAccessCheckResponse } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
// FIX-003: Import Sheet for inline JD creation
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import JDCreation from '@/components/JDCreation';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import PageBreadcrumb from '@/components/PageBreadcrumb';
// ✅ PERMISSION FIX: Import permission hook for CRUD checks
import { useModulePermissions } from '@/lib/hooks/usePermissions';
import { useAuth } from '@/components/providers/AuthProvider';

// Utility function to format employment type for display
// Converts "full_time" -> "Full Time", "part_time" -> "Part Time", etc.
const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

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
  const dialog = useGlobalDialog();
  // ✅ PERMISSION FIX: Get JD CRUD permissions
  const jdPerms = useModulePermissions('jd');
  const { isTenantAdmin, user } = useAuth();
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);
  const canDeleteJd = isTenantAdmin || (user?.permissions?.canDeleteJd ?? false);
  const canExportJd = isTenantAdmin || (user?.permissions?.canExport ?? false);
  const [jds, setJds] = useState<JDResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const bulkActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bulkActionsRef.current && !bulkActionsRef.current.contains(e.target as Node)) {
        setBulkActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedJds, setSelectedJds] = useState<string[]>([]);
  // Track which JDs can be deleted (no active assessments)
  // null = still checking, true = can delete, false = cannot delete (has active assessments)
  const [jdDeletionStatus, setJdDeletionStatus] = useState<Record<string, { canDelete: boolean; activeCount: number } | null>>({});

  // FIX-003: State for inline JD creation/editing
  const [showJDSheet, setShowJDSheet] = useState(false);
  const [editingJDId, setEditingJDId] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'disable' | 'archive' | 'delete' | null;
    jdId: string | null;
    jdTitle: string;
  }>({
    isOpen: false,
    type: null,
    jdId: null,
    jdTitle: '',
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Read status from URL query parameter on mount
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && ['published', 'draft', 'archived', 'disabled'].includes(statusParam)) {
      setStatusFilter(statusParam);
    }

    // Check if create=true parameter is present to auto-open JD creation sheet
    const createParam = searchParams.get('create');
    if (createParam === 'true') {
      setShowJDSheet(true);
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
      } catch (error: any) {
        console.error('Access check failed:', error);
        // Parse error response for suspension/expiry messages
        const errorResponse = error?.response?.data;
        if (errorResponse) {
          // Handle tenant suspended/expired errors from backend
          if (errorResponse.error === 'TENANT_SUSPENDED') {
            setAccessError(errorResponse.message || 'Your organization\'s account has been suspended.');
            setAccessCheck({
              can_access: false,
              can_create_jd: false,
              all_checks_passed: false,
              blocking_error: 'Subscription Inactive',
              blocking_error_code: 'SUBSCRIPTION_INACTIVE',
              failed_checks: ['Subscription Inactive'],
            } as any);
          } else if (errorResponse.error === 'TENANT_EXPIRED') {
            setAccessError(errorResponse.message || 'Your organization\'s subscription plan has expired.');
            setAccessCheck({
              can_access: false,
              can_create_jd: false,
              all_checks_passed: false,
              blocking_error: 'Subscription Expired',
              blocking_error_code: 'SUBSCRIPTION_EXPIRED',
              failed_checks: ['Subscription Expired'],
            } as any);
          } else if (errorResponse.error === 'TENANT_INACTIVE') {
            setAccessError(errorResponse.message || 'Your organization\'s account is inactive.');
            setAccessCheck({
              can_access: false,
              can_create_jd: false,
              all_checks_passed: false,
              blocking_error: 'Account Inactive',
              blocking_error_code: 'TENANT_INACTIVE',
              failed_checks: ['Account Inactive'],
            } as any);
          } else if (errorResponse.detail) {
            // Handle other structured errors
            const detail = typeof errorResponse.detail === 'string'
              ? errorResponse.detail
              : errorResponse.detail.message || JSON.stringify(errorResponse.detail);
            setAccessError(detail);
          }
        }
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
        source: 'my-jds',  // Only show JDs created by the logged-in user
        sort_by: sortBy,
        page: currentPage,
        page_size: 20,
      });
      setJds(response.items);
      setTotalPages(response.total_pages);
      setTotal(response.total);

      // Initially mark all JDs as null (checking) — delete button hidden until confirmed safe
      const initialStatusMap: Record<string, null> = {};
      response.items.forEach((jd) => { initialStatusMap[jd.id] = null; });
      setJdDeletionStatus(initialStatusMap);

      // Check assessment status for each JD to determine if deletion is allowed
      const deletionStatusChecks = await Promise.allSettled(
        response.items.map(async (jd) => {
          try {
            const assessmentStatus = await jdService.checkAssessmentStatus(jd.id);
            return { jdId: jd.id, canDelete: assessmentStatus.can_delete, activeCount: assessmentStatus.active_count };
          } catch (error) {
            console.error(`Failed to check assessment status for JD ${jd.id}:`, error);
            // Fail-CLOSED: if check fails, do NOT allow deletion — safer than allowing it
            return { jdId: jd.id, canDelete: false, activeCount: 0 };
          }
        })
      );

      const statusMap: Record<string, { canDelete: boolean; activeCount: number }> = {};
      deletionStatusChecks.forEach((result) => {
        if (result.status === 'fulfilled') {
          statusMap[result.value.jdId] = {
            canDelete: result.value.canDelete,
            activeCount: result.value.activeCount,
          };
        }
      });
      setJdDeletionStatus(statusMap);
    } catch (error: any) {
      console.error('Failed to fetch JDs:', error);
      // Handle tenant suspended/expired errors
      const errorResponse = error?.response?.data;
      if (errorResponse?.error === 'TENANT_SUSPENDED') {
        setAccessError(errorResponse.message || 'Your organization\'s account has been suspended.');
      } else if (errorResponse?.error === 'TENANT_EXPIRED') {
        setAccessError(errorResponse.message || 'Your organization\'s subscription plan has expired.');
      } else if (errorResponse?.error === 'TENANT_INACTIVE') {
        setAccessError(errorResponse.message || 'Your organization\'s account is inactive.');
      } else {
        toast.error('Failed to load job descriptions');
      }
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
    setConfirmLoading(true);
    try {
      await jdService.archive(jdId);
      toast.success('Job description archived');
      fetchJDs();
      setConfirmDialog({ isOpen: false, type: null, jdId: null, jdTitle: '' });
    } catch (error) {
      toast.error('Failed to archive');
    } finally {
      setConfirmLoading(false);
    }
    setActiveDropdown(null);
  };

  const handleDelete = async (jdId: string) => {
    setConfirmLoading(true);
    try {
      await jdService.delete(jdId);
      toast.success('Job description deleted successfully');
      fetchJDs();
      setConfirmDialog({ isOpen: false, type: null, jdId: null, jdTitle: '' });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete job description');
    } finally {
      setConfirmLoading(false);
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
    setConfirmLoading(true);
    try {
      await jdService.disable(jdId);
      toast.success('Job description disabled');
      fetchJDs();
      setConfirmDialog({ isOpen: false, type: null, jdId: null, jdTitle: '' });
    } catch (error) {
      toast.error('Failed to disable');
    } finally {
      setConfirmLoading(false);
    }
    setActiveDropdown(null);
  };

  const handleBulkDelete = async () => {
    if (selectedJds.length === 0) return;
    if (!await dialog.confirm({ title: 'Delete Job Descriptions', message: `Are you sure you want to delete ${selectedJds.length} job description(s)?`, variant: 'error', confirmText: 'Delete' })) return;

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

  const handleExportJDs = () => {
    const jdsToExport = selectedJds.length > 0
      ? jds.filter(jd => selectedJds.includes(jd.id))
      : jds;

    if (jdsToExport.length === 0) {
      toast.error('No job descriptions to export');
      return;
    }

    const exportData = jdsToExport.map(jd => ({
      job_id: jd.job_id || '-',
      title: jd.title,
      status: jd.status.charAt(0).toUpperCase() + jd.status.slice(1),
      creation_method: jd.creation_method === 'ai_generated' ? 'AI' : 'Manual',
      current_version: jd.current_version ? `v${jd.current_version}` : 'v1',
      industry_type: jd.industry_type || '-',
      department: jd.department || '-',
      employment_type: jd.employment_type ? formatEmploymentType(jd.employment_type) : '-',
      remote_type: jd.remote_type ? formatEmploymentType(jd.remote_type) : '-',
      experience: jd.experience_min != null && jd.experience_max != null
        ? `${jd.experience_min}-${jd.experience_max} years`
        : jd.experience_min != null
        ? `${jd.experience_min}+ years`
        : '-',
      salary: jd.salary_min && jd.salary_max
        ? `${jd.salary_currency || ''} ${jd.salary_min}-${jd.salary_max}`.trim()
        : '-',
      location: jd.location || '-',
      job_level: jd.job_level || '-',
      published_at: jd.published_at ? formatISTDate(jd.published_at) : '-',
      created_at: formatISTDate(jd.created_at),
      updated_at: formatISTDate(jd.updated_at),
      created_by_name: jd.created_by_name || '-',
      applicants_count: jd.applicants_count || 0,
      scored_resumes_count: jd.scored_resumes_count || 0,
      assessments_count: jd.assessments_count || 0,
    }));

    const columns: ExportColumn[] = [
      { key: 'job_id', header: 'JD ID' },
      { key: 'title', header: 'Title' },
      { key: 'status', header: 'Status' },
      { key: 'creation_method', header: 'Creation Method' },
      { key: 'current_version', header: 'Version' },
      { key: 'industry_type', header: 'Industry' },
      { key: 'department', header: 'Department' },
      { key: 'employment_type', header: 'Employment Type' },
      { key: 'remote_type', header: 'Work Mode' },
      { key: 'experience', header: 'Experience' },
      { key: 'salary', header: 'Salary Range' },
      { key: 'location', header: 'Location' },
      { key: 'job_level', header: 'Job Level' },
      { key: 'published_at', header: 'Posted Date' },
      { key: 'created_at', header: 'Created Date' },
      { key: 'updated_at', header: 'Last Updated' },
      { key: 'created_by_name', header: 'Created By' },
      { key: 'applicants_count', header: 'Applicants' },
      { key: 'scored_resumes_count', header: 'Scored Resumes' },
      { key: 'assessments_count', header: 'Assessments' },
    ];

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCSV(exportData, columns, `job-descriptions-${dateStr}`);
    toast.success(`Exported ${jdsToExport.length} job description${jdsToExport.length !== 1 ? 's' : ''}`);
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

  // JD03: Check if user can create JD
  const canCreateJD = accessCheck?.can_create_jd !== false;

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="w-full p-4 md:p-8 bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'JD List' },
            ]}
          />
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJDs}
              disabled={jds.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={selectedJds.length > 0 ? `Export ${selectedJds.length} selected JDs` : 'Export all JDs'}
            >
              <Download className="w-4 h-4" />
              {selectedJds.length > 0 ? `Export (${selectedJds.length})` : 'Export CSV'}
            </button>
            <button
              onClick={() => {
                // FIX-003: Open sheet instead of navigating
                if (canCreateJD) {
                  setEditingJDId(null);
                  setShowJDSheet(true);
                }
              }}
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
                onClick={() => { setSelectedJds([]); setBulkActionsOpen(false); }}
                className="text-gray-300 hover:text-white flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            </div>
            <div className="relative" ref={bulkActionsRef}>
              <button
                onClick={() => setBulkActionsOpen(prev => !prev)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Bulk Actions
                <svg className={`w-4 h-4 transition-transform ${bulkActionsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {bulkActionsOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  {canExportJd && (
                    <button
                      onClick={() => { handleExportJDs(); setBulkActionsOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="w-4 h-4 text-gray-500" />
                      Export Selected to CSV
                    </button>
                  )}
                  {canDeleteJd && (
                    <>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => { handleBulkDelete(); setBulkActionsOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Selected
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
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
                onClick={() => {
                  // FIX-003: Open sheet instead of navigating
                  setEditingJDId(null);
                  setShowJDSheet(true);
                }}
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
                      {/* FIX-008: Responsive metadata - primary info visible, secondary hidden on mobile */}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {jd.industry_type || '-'}
                        </span>
                        {jd.employment_type && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-4 h-4" />
                            <span>{formatEmploymentType(jd.employment_type)}</span>
                          </span>
                        )}
                        {/* Hidden on mobile - secondary info */}
                        {jd.remote_type && (
                          <span className="hidden sm:flex items-center gap-1">
                            <Monitor className="w-4 h-4" />
                            <span>{formatEmploymentType(jd.remote_type)}</span>
                          </span>
                        )}
                        <span className="hidden sm:flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Created {formatISTDate(jd.created_at)}
                        </span>
                        {/* JD04: Last Updated - hidden on mobile */}
                        <span className="hidden md:flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Updated {formatISTDate(jd.updated_at)}
                        </span>
                        {jd.published_at && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            Posted {formatISTDate(jd.published_at)}
                          </span>
                        )}
                        {/* Hidden on mobile */}
                        {jd.created_by_name && (
                          <span className="hidden md:flex items-center gap-1">
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

                  {/* Actions - View, Edit buttons and 3-dot menu - FIX-008: Mobile-friendly */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* View Button - icon only on mobile */}
                    <button
                      onClick={() => router.push(`/recruitment/jd-details?id=${jd.id}`)}
                      className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 whitespace-nowrap"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="text-sm hidden sm:inline">View</span>
                    </button>

                    {/* Edit Button - FIX-003: Open in sheet, icon only on mobile */}
                    {/* ✅ PERMISSION FIX: Only show Edit button if user has canUpdateJD permission */}
                    {jdPerms.canUpdate && (
                      <button
                        onClick={() => {
                          setEditingJDId(jd.id);
                          setShowJDSheet(true);
                        }}
                        className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 whitespace-nowrap"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span className="text-sm hidden sm:inline">Edit</span>
                      </button>
                    )}

                    {/* More Actions Dropdown (3-dot menu) */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdown(activeDropdown === jd.id ? null : jd.id);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300 bg-white"
                        aria-label="More actions" title="More actions"
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
                          {/* Score Resumes - only for published JDs + scoring permission */}
                          {jd.status === 'published' && canRunScoring && (
                            <button
                              onClick={() => { router.push(`/recruitment/resume-scoring?jd_id=${jd.id}&mode=new`); setActiveDropdown(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Target className="w-4 h-4" />
                              Score Resumes
                            </button>
                          )}
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
                          {/* JD04: Disable action — only for users with disable permission */}
                          {jdPerms.canDisable && jd.status === 'published' && (
                            <button
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'disable',
                                  jdId: jd.id,
                                  jdTitle: jd.title,
                                });
                                setActiveDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-orange-700 hover:bg-orange-50"
                            >
                              <Power className="w-4 h-4" />
                              Disable Job
                            </button>
                          )}
                          {/* Archive action — only for users with archive permission */}
                          {jdPerms.canArchive && jd.status !== 'archived' && (
                            <button
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'archive',
                                  jdId: jd.id,
                                  jdTitle: jd.title,
                                });
                                setActiveDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Archive className="w-4 h-4" />
                              Archive Job
                            </button>
                          )}
                          {/* Delete section — only shown if user has delete permission */}
                          {jdPerms.canDelete && (() => {
                            const delStatus = jdDeletionStatus[jd.id];

                            // Still loading — show nothing (delete button stays hidden)
                            if (delStatus === null || delStatus === undefined) return null;

                            // Has active assessments — show ONLY the warning message, NO delete button
                            if (!delStatus.canDelete) {
                              return (
                                <div className="w-full px-4 py-3 text-sm bg-orange-50 border-t border-orange-100">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-500" />
                                    <div>
                                      <p className="font-semibold text-orange-800">Cannot Delete</p>
                                      <p className="text-xs mt-0.5 text-orange-700">
  You have assigned the assessment for this JD. So you will not be able to delete this JD.
</p>

                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            // No active assessments — show delete button
                            return (
                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    isOpen: true,
                                    type: 'delete',
                                    jdId: jd.id,
                                    jdTitle: jd.title,
                                  });
                                  setActiveDropdown(null);
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            );
                          })()}
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

      {/* FIX-003: JD Creation/Edit Sheet */}
      <Sheet open={showJDSheet} onOpenChange={(open) => {
        setShowJDSheet(open);
        if (!open) setEditingJDId(null);
      }}>
        <SheetContent side="right" className="w-full max-w-6xl sm:max-w-6xl p-0 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <JDCreation
              editingJDId={editingJDId}
              onClose={() => {
                setShowJDSheet(false);
                setEditingJDId(null);
              }}
              onSuccess={(jdId) => {
                setShowJDSheet(false);
                setEditingJDId(null);

                // Check if returnUrl is provided - redirect back to that page
                const returnUrl = searchParams.get('returnUrl');
                if (returnUrl) {
                  // If JD was published (not just saved as draft), redirect to assessment creation with JD pre-selected
                  if (jdId) {
                    toast.success('JD published successfully. Redirecting to create assessment...');
                    setTimeout(() => {
                      router.push(`${returnUrl}/create?jd_id=${jdId}`);
                    }, 500);
                  } else {
                    // Draft saved - just redirect back
                    toast.success(editingJDId ? 'JD updated successfully. Redirecting...' : 'JD saved successfully. Redirecting...');
                    setTimeout(() => {
                      router.push(returnUrl);
                    }, 500);
                  }
                } else {
                  // Refresh the JD list if staying on this page
                  fetchJDs();
                  toast.success(editingJDId ? 'JD updated successfully' : 'JD created successfully');
                }
              }}
              isEmbedded={true}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialogs */}
      {confirmDialog.type === 'disable' && (
        <ConfirmationDialog
          isOpen={confirmDialog.isOpen}
          title="Disable Job Description?"
          message={`Are you sure you want to disable "${confirmDialog.jdTitle}"? This will remove the JD from Resume Scoring, AI Talent Match, Assessment Generator, and Reporting. The JD can be re-enabled later.`}
          type="warning"
          confirmText="Yes, Disable"
          cancelText="Cancel"
          onConfirm={() => confirmDialog.jdId && handleDisable(confirmDialog.jdId)}
          onCancel={() => setConfirmDialog({ isOpen: false, type: null, jdId: null, jdTitle: '' })}
          isLoading={confirmLoading}
        />
      )}

      {confirmDialog.type === 'archive' && (
        <ConfirmationDialog
          isOpen={confirmDialog.isOpen}
          title="Archive Job Description?"
          message={`Are you sure you want to archive "${confirmDialog.jdTitle}"? This will remove the JD from all active modules. Archived JDs can be restored later.`}
          type="warning"
          confirmText="Yes, Archive"
          cancelText="Cancel"
          onConfirm={() => confirmDialog.jdId && handleArchive(confirmDialog.jdId)}
          onCancel={() => setConfirmDialog({ isOpen: false, type: null, jdId: null, jdTitle: '' })}
          isLoading={confirmLoading}
        />
      )}

      {confirmDialog.type === 'delete' && (
        <ConfirmationDialog
          isOpen={confirmDialog.isOpen}
          title="Delete Job Description?"
          message={`Are you sure you want to permanently delete "${confirmDialog.jdTitle}"? This action cannot be undone.`}
          type="danger"
          confirmText="Yes, Delete"
          cancelText="Cancel"
          onConfirm={() => confirmDialog.jdId && handleDelete(confirmDialog.jdId)}
          onCancel={() => setConfirmDialog({ isOpen: false, type: null, jdId: null, jdTitle: '' })}
          isLoading={confirmLoading}
        />
      )}
    </main>
  );
}
