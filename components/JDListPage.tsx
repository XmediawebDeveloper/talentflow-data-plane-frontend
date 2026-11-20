'use client';

import { formatJdExperience, formatExperienceLevelName } from '@/lib/utils/jobExperience';
import { Plus, Search, MapPin, Calendar, Eye, MoreVertical, Users, Filter, CheckCircle2, FileText, Archive, Edit2, Trash2, X, User, Briefcase, Monitor, AlertTriangle, AlertCircle, Clock, ArrowUpDown, Power, ClipboardList, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { exportData, ExportColumn, ExportFileFormat } from '@/lib/utils/exportUtils';
import ExportFormatModal from '@/components/ExportFormatModal';
import { jdService, JDResponse, JDAccessCheckResponse } from '@/lib/services/jdService';
import { formatSalaryRange } from '@/lib/utils/salary';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
// FIX-003: Import Sheet for inline JD creation
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import FilterSelect from '@/components/ui/filter-select';
import JDCreation from '@/components/JDCreation';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import DisableJobModal from '@/components/DisableJobModal';
import { formatJobVersionLabel } from '@/lib/utils/jobOpeningDisplay';
import PageBreadcrumb from '@/components/PageBreadcrumb';
// ✅ PERMISSION FIX: Import permission hook for CRUD checks
import { useModulePermissions } from '@/lib/hooks/usePermissions';
import { useAuth } from '@/components/providers/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { safeReturnUrl } from '@/lib/utils/safeReturnUrl';

// Utility function to format employment type for display
// Converts "full_time" -> "Full Time", "part_time" -> "Part Time", etc.
const formatEmploymentType = (type: string | undefined): string => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Columns in the JD export file (CSV or Excel)
const JD_EXPORT_COLUMNS: ExportColumn[] = [
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

// JD03: Status tabs for filtering
const STATUS_TABS = [
  { id: 'all', label: 'All JDs' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'archived', label: 'Archived' },
];

// JD versions a job can have (backend MAX_JD_VERSIONS = 5)
const VERSION_OPTIONS = [
  { value: 'all', label: 'All Versions' },
  ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `v${n}` })),
];

export default function JDListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useGlobalDialog();
  // ✅ PERMISSION FIX: Get JD CRUD permissions
  const jdPerms = useModulePermissions('jd');
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);
  const canDeleteJd = isTenantAdmin || (user?.permissions?.canDeleteJd ?? false);
  const canExportJd = isTenantAdmin || hasPermissionCode('jd:export');
  const [jds, setJds] = useState<JDResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
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
    /** Human JD-xxx code and lineage version, for the disable confirm's chip. */
    jdCode?: string;
    jdVersion?: number;
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
    // Applied — clear both, so closing the sheet / changing the status filter
    // isn't contradicted by a ?create=true / ?status=… still in the address bar.
    if (statusParam !== null || createParam !== null) {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('create');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
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
        version: versionFilter !== 'all' ? Number(versionFilter) : undefined,
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
        showErrorToast(error, "Couldn't load job descriptions", { id: 'jd-list-load', retry: fetchJDs });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJDs();
  }, [statusFilter, currentPage, sortBy, versionFilter]);

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
      showErrorToast(error, "Couldn't archive the job description");
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
      showErrorToast(error, "Couldn't delete the job description");
    } finally {
      setConfirmLoading(false);
    }
    setActiveDropdown(null);
  };

  // JD04: Publish draft JD
  const handlePublish = async (jdId: string) => {
    if (!jdPerms.canUpdate) {
      toast.error('You do not have permission to publish job descriptions');
      setActiveDropdown(null);
      return;
    }
    try {
      await jdService.publish(jdId);
      toast.success('Job description published');
      fetchJDs();
    } catch (error) {
      showErrorToast(error, "Couldn't publish the job description");
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
      showErrorToast(error, "Couldn't disable the job description");
    } finally {
      setConfirmLoading(false);
    }
    setActiveDropdown(null);
  };

  const handleBulkDelete = async () => {
    if (selectedJds.length === 0) return;
    if (!await dialog.confirm({
      title: 'Delete Job Descriptions',
      message: `Are you sure you want to delete ${selectedJds.length} job description(s)?\nThis action cannot be undone.`,
      variant: 'delete',
      confirmText: 'Delete',
      warningNote: 'Deleting these job descriptions will permanently remove them and cannot be restored.',
    })) return;

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
        showErrorToast(null, `Couldn't delete ${failCount} job description(s)`);
      }

      // Keep the selection when every delete failed so the user can retry;
      // otherwise clear it and reload the list (the jds effect would also clear it).
      if (successCount > 0) {
        setSelectedJds([]);
        setBulkActionsOpen(false);
        fetchJDs();
      }
    } catch (error) {
      showErrorToast(error, "Couldn't delete the job descriptions");
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

  const getJdsToExport = () => (selectedJds.length > 0
    ? jds.filter(jd => selectedJds.includes(jd.id))
    : jds);

  // Export opens the CSV / Excel picker; the file is written in runExportJDs
  const handleExportJDs = () => {
    if (getJdsToExport().length === 0) {
      toast.error('No job descriptions to export');
      return;
    }
    setShowExportModal(true);
  };

  const runExportJDs = async (format: ExportFileFormat) => {
    const jdsToExport = getJdsToExport();
    const rows = jdsToExport.map(jd => ({
      job_id: jd.job_id || '-',
      title: jd.title,
      status: jd.status.charAt(0).toUpperCase() + jd.status.slice(1),
      creation_method: jd.creation_method === 'ai_generated' ? 'AI' : 'Manual',
      current_version: jd.current_version ? `v${jd.current_version}` : 'v1',
      industry_type: jd.industry_type || '-',
      department: jd.department || '-',
      employment_type: jd.employment_type ? formatEmploymentType(jd.employment_type) : '-',
      remote_type: jd.remote_type ? formatEmploymentType(jd.remote_type) : '-',
      experience: formatJdExperience({
        jobLevel: jd.job_level || jd.experience_level,
        experienceMin: jd.experience_min,
        experienceMax: jd.experience_max,
      }) || '-',
      salary: jd.salary_min || jd.salary_max
        ? formatSalaryRange({
            min: jd.salary_min,
            max: jd.salary_max,
            currency: jd.salary_currency,
          })
        : '-',
      location: jd.location || '-',
      job_level: formatExperienceLevelName(jd.job_level || jd.experience_level) || jd.job_level || '-',
      published_at: jd.published_at ? formatISTDate(jd.published_at) : '-',
      created_at: formatISTDate(jd.created_at),
      updated_at: formatISTDate(jd.updated_at),
      created_by_name: jd.created_by_name || '-',
      applicants_count: jd.applicants_count || 0,
      scored_resumes_count: jd.scored_resumes_count || 0,
      assessments_count: jd.assessments_count || 0,
    }));


    const dateStr = new Date().toISOString().split('T')[0];
    await exportData(format, rows, JD_EXPORT_COLUMNS, `job-descriptions-${dateStr}`, { sheetName: 'Job Descriptions' });
    toast.success(`Exported ${jdsToExport.length} job description${jdsToExport.length !== 1 ? 's' : ''}`);
    // Export succeeded: clear the selection and close the bulk menu. No refresh — nothing changed.
    setSelectedJds([]);
    setBulkActionsOpen(false);
  };

  const getStatusBadge = (status: string, currentVersion?: number) => {
    // Show "Republished" if published and version > 1
    const isRepublished = status === 'published' && currentVersion && currentVersion > 1;
    const displayStatus = isRepublished ? 'republished' : status;

    const variants: Record<string, 'success' | 'info' | 'destructive' | 'muted'> = {
      draft: 'info', published: 'success', republished: 'success', archived: 'muted', disabled: 'destructive',
    };
    return (
      <Badge variant={variants[displayStatus] || 'info'}>
        {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
      </Badge>
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
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'JD List' },
            ]}
          />
        {/* JD01 & JD03: Access Error Banner */}
        {accessError && (
          <div className="mb-6 p-4 bg-destructive-subtle border border-destructive-line rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-destructive-strong">Access Restricted</h3>
              <p className="text-sm text-destructive mt-1">{accessError}</p>
              {accessCheck?.failed_checks && accessCheck.failed_checks.length > 0 && (
                <ul className="text-sm text-destructive mt-2 list-disc list-inside">
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
          <div className="mb-6 p-4 bg-warning-subtle border border-warning-line rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-warning-strong">Low Unit Availability</h3>
              <p className="text-sm text-warning mt-1">
                Some units are running low. You can still create JDs, but scoring/assessment features may be limited.
              </p>
              <div className="flex gap-4 mt-2 text-xs text-warning">
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-6">
          <div>
            <h1 className="tf-page-title">Job Descriptions</h1>
            <p className="tf-body-secondary mt-1">
              Manage your job descriptions ({total} total)
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={handleExportJDs}
              disabled={jds.length === 0}
              icon={<Download className="w-4 h-4" />}
              title={selectedJds.length > 0 ? `Export ${selectedJds.length} selected JDs` : 'Export all JDs'}
            >
              {selectedJds.length > 0 ? `Export (${selectedJds.length})` : 'Export'}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                // FIX-003: Open sheet instead of navigating
                if (!canCreateJD) {
                  toast.error(accessError || 'You do not have permission to create job descriptions');
                  return;
                }
                setEditingJDId(null);
                setShowJDSheet(true);
              }}
              disabled={accessCheckLoading}
              aria-disabled={!canCreateJD}
              icon={<Plus className="w-4 h-4" />}
              title={!canCreateJD ? accessError || 'Cannot create JD' : 'Create a new job description'}
              className={`${(!canCreateJD ? 'opacity-50 cursor-not-allowed' : '')} disabled:opacity-50`}
            >
              Create New JD
            </Button>
          </div>
        </div>

        {/* JD03: Status Tabs */}
        <div className="tf-panel flex items-center gap-1 mb-6 p-1 overflow-x-auto scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
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
          <div className="bg-gray-800 text-white rounded-lg p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
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
                <div className="absolute right-0 top-full mt-1 w-52 max-w-[calc(100vw-1.5rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  {canExportJd && (
                    <button
                      onClick={() => { handleExportJDs(); setBulkActionsOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="w-4 h-4 text-gray-500" />
                      Export Selected
                    </button>
                  )}
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      if (!canDeleteJd) {
                        toast.error('You do not have permission to delete job descriptions');
                        return;
                      }
                      handleBulkDelete();
                      setBulkActionsOpen(false);
                    }}
                    aria-disabled={!canDeleteJd}
                    title={!canDeleteJd ? 'You do not have permission to delete job descriptions' : ''}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                      canDeleteJd
                        ? 'text-destructive hover:bg-destructive-subtle'
                        : 'text-gray-400 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Selected
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="tf-panel p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
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
            <div className="flex-1 relative min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search job descriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="tf-input pl-10 pr-4"
              />
            </div>
            {/* JD04: Sort dropdown */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
              <FilterSelect
                value={sortBy}
                onChange={(v) => { setSortBy(v); setCurrentPage(1); }}
                ariaLabel="Sort by"
                className="w-auto px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
                options={[
                  { value: 'latest', label: 'Latest Updated' },
                  { value: 'oldest', label: 'Oldest Updated' },
                  { value: 'a-z', label: 'Title A-Z' },
                  { value: 'z-a', label: 'Title Z-A' },
                  { value: 'created_latest', label: 'Recently Created' },
                  { value: 'created_oldest', label: 'Oldest Created' },
                ]}
              />
            </div>
            {/* JD version filter */}
            <FilterSelect
              value={versionFilter}
              onChange={(v) => { setVersionFilter(v); setCurrentPage(1); }}
              ariaLabel="Filter by version"
              className="w-auto px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
              options={VERSION_OPTIONS}
            />
            {/* Results count */}
            <div className="flex items-center gap-2 tf-body-muted">
              <span className="px-2 py-1 bg-gray-100 rounded">
                {total} results
              </span>
            </div>
          </div>
        </div>

        {/* JD List */}
        {loading ? (
          /* Skeleton mirrors the JD card list below: same `space-y-4` stack of
             `bg-white rounded-xl border p-6` cards, each with the checkbox, the
             header row (JD chip + title + status/method badges), the meta chip
             row, a two-line description, and the three-stat footer, plus the
             right-hand View / Edit / more-actions controls. */
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="tf-panel p-6">
                <div className="flex items-start gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0 overflow-hidden">
                    <Skeleton className="w-4 h-4 mt-1 rounded" />
                    <div className="flex-1">
                      {/* Header row: JD id chip, title, status + method badges */}
                      <div className="flex items-center gap-3 mb-2">
                        <Skeleton className="h-6 w-16 rounded-md" />
                        <Skeleton className="h-6 w-56" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-14 rounded-full" />
                      </div>
                      {/* Meta chip row */}
                      <div className="flex items-center gap-4 mb-3 flex-wrap">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="hidden sm:block h-4 w-24" />
                        <Skeleton className="hidden sm:block h-4 w-28" />
                      </div>
                      {/* Description (two lines) */}
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-4/5" />
                      {/* Stats footer */}
                      <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </div>
                  </div>
                  {/* Right-hand actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Skeleton className="h-8 w-16 rounded-lg" />
                    <Skeleton className="h-8 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-9 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : jds.length === 0 ? (
          <div className="tf-panel p-8 sm:p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No job descriptions found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || statusFilter !== 'all' || versionFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first job description to get started'}
            </p>
            {!searchQuery && statusFilter === 'all' && versionFilter === 'all' && (
              <Button
                variant="primary"
                onClick={() => {
                  // FIX-003: Open sheet instead of navigating
                  if (!canCreateJD) {
                    toast.error(accessError || 'You do not have permission to create job descriptions');
                    return;
                  }
                  setEditingJDId(null);
                  setShowJDSheet(true);
                }}
                aria-disabled={!canCreateJD}
                title={!canCreateJD ? accessError || 'Cannot create JD' : 'Create a new job description'}
                className={`${(!canCreateJD ? 'opacity-50 cursor-not-allowed' : '')} disabled:opacity-50`}
                icon={<Plus className="w-4 h-4" />}
              >
                Create New JD
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {jds.map((jd) => (
              <div
                key={jd.id}
                className={`bg-white rounded-xl border ${selectedJds.includes(jd.id) ? 'border-gray-400 ring-1 ring-gray-400' : 'border-gray-200'} p-4 sm:p-6 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* Checkbox */}
                  <div className="flex items-start gap-4 flex-1 min-w-0 overflow-hidden">
                    <input
                      type="checkbox"
                      checked={selectedJds.includes(jd.id)}
                      onChange={() => handleSelectJd(jd.id)}
                      className="tf-checkbox mt-1 focus:ring-gray-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                        {jd.job_id && (
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium border border-blue-200 shrink-0">
                            {jd.job_id}
                          </span>
                        )}
                        <h3 className="tf-section-title sm:text-lg break-words min-w-0">{jd.title}</h3>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs font-medium shrink-0">
                          v{jd.version_number ?? 1}
                        </span>
                        {getStatusBadge(jd.status, jd.current_version)}
                        {jd.creation_method && getCreationMethodBadge(jd.creation_method)}
                      </div>
                      {/* FIX-008: Responsive metadata - primary info visible, secondary hidden on mobile */}
                      <div className="flex items-center gap-4 tf-body-muted mb-3 flex-wrap">
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
                            <CheckCircle2 className="w-4 h-4 text-success" />
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
                      <p className="tf-body-secondary line-clamp-2">
                        {jd.description?.substring(0, 200)}...
                      </p>
                      {/* Stats */}
                      <div className="flex items-center gap-x-6 gap-y-2 flex-wrap mt-4 pt-4 border-t border-gray-100">
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
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/recruitment/jd-details?id=${jd.id}`)}
                      icon={<Eye className="w-4 h-4" />}
                      className="whitespace-nowrap"
                    >
                      <span className="hidden sm:inline">View</span>
                    </Button>

                    {/* Edit Button - FIX-003: Open in sheet, icon only on mobile */}
                    {/* Always visible; disabled (non-clickable) without canUpdateJD permission */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!jdPerms.canUpdate) {
                          toast.error('You do not have permission to edit job descriptions');
                          return;
                        }
                        setEditingJDId(jd.id);
                        setShowJDSheet(true);
                      }}
                      disabled={!jdPerms.canUpdate}
                      title={!jdPerms.canUpdate ? 'You do not have permission to edit job descriptions' : 'Edit'}
                      icon={<Edit2 className="w-4 h-4" />}
                      className="whitespace-nowrap"
                    >
                      <span className="hidden sm:inline">Edit</span>
                    </Button>

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
                        <>
                          <div className="fixed inset-0 z-[9]" onClick={() => setActiveDropdown(null)} />
                          <div className="absolute right-0 top-full mt-1 w-48 max-w-[calc(100vw-1.5rem)] max-h-[70dvh] overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
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
                              <ClipboardList className="w-4 h-4" />
                              Score Resumes
                            </button>
                          )}
                          {/* JD04: Publish action for draft JDs — always visible; disabled without update permission */}
                          {jd.status === 'draft' && (
                            <button
                              onClick={() => { handlePublish(jd.id); setActiveDropdown(null); }}
                              disabled={!jdPerms.canUpdate}
                              title={!jdPerms.canUpdate ? 'You do not have permission to publish job descriptions' : ''}
                              className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                                jdPerms.canUpdate
                                  ? 'text-success hover:bg-success-subtle'
                                  : 'text-gray-400 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Publish
                            </button>
                          )}
                          {/* JD04: Disable action — always visible; disabled without disable permission */}
                          {jd.status === 'published' && (
                            <button
                              onClick={() => {
                                if (!jdPerms.canDisable) {
                                  toast.error('You do not have permission to disable job descriptions');
                                  return;
                                }
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'disable',
                                  jdId: jd.id,
                                  jdTitle: jd.title,
                                  jdCode: jd.job_id,
                                  jdVersion: jd.current_version,
                                });
                                setActiveDropdown(null);
                              }}
                              disabled={!jdPerms.canDisable}
                              title={!jdPerms.canDisable ? 'You do not have permission to disable job descriptions' : ''}
                              className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                                jdPerms.canDisable
                                  ? 'text-orange-700 hover:bg-orange-50'
                                  : 'text-gray-400 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <Power className="w-4 h-4" />
                              Disable Job
                            </button>
                          )}
                          {/* Archive action — always visible; disabled without archive permission */}
                          {jd.status !== 'archived' && (
                            <button
                              onClick={() => {
                                if (!jdPerms.canArchive) {
                                  toast.error('You do not have permission to archive job descriptions');
                                  return;
                                }
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'archive',
                                  jdId: jd.id,
                                  jdTitle: jd.title,
                                });
                                setActiveDropdown(null);
                              }}
                              disabled={!jdPerms.canArchive}
                              title={!jdPerms.canArchive ? 'You do not have permission to archive job descriptions' : ''}
                              className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                                jdPerms.canArchive
                                  ? 'text-gray-700 hover:bg-gray-50'
                                  : 'text-gray-400 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <Archive className="w-4 h-4" />
                              Archive Job
                            </button>
                          )}
                          {/* Delete section — always shown; disabled without delete permission */}
                          {(() => {
                            if (!jdPerms.canDelete) {
                              return (
                                <button
                                  onClick={() => toast.error('You do not have permission to delete job descriptions')}
                                  disabled
                                  title="You do not have permission to delete job descriptions"
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 cursor-not-allowed opacity-60"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              );
                            }

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
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive-subtle"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            );
                          })()}
                          </div>
                        </>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6">
            <p className="tf-body-secondary max-sm:text-center">
              Showing {(currentPage - 1) * 20 + 1} to {Math.min(currentPage * 20, total)} of {total}
            </p>
            <div className="flex items-center max-sm:justify-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="tf-body-secondary whitespace-nowrap">Go to</span>
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
                  className="tf-input w-14 h-8 sm:h-9 px-2 text-center"
                />
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="tf-btn tf-btn-secondary w-8 h-8 sm:w-9 sm:h-9 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
                aria-label="Previous page" title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="tf-label px-1 whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{currentPage}</span> / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="tf-btn tf-btn-secondary w-8 h-8 sm:w-9 sm:h-9 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
                aria-label="Next page" title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                // Same-site paths only (security sheet N4).
                const returnUrl = safeReturnUrl(searchParams.get('returnUrl'));
                if (returnUrl) {
                  // If JD was published (not just saved as draft), redirect to assessment creation with JD pre-selected
                  if (jdId) {
                    toast.success('JD published successfully. Redirecting to create assessment...');
                    setTimeout(() => {
                      router.push(`${returnUrl}/create?jd_id=${encodeURIComponent(String(jdId))}`);
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
      {/* Disable confirm — the shared component, not the generic
          `ConfirmationDialog`. That one flattened the consequences into a
          sentence and named a fourth module ("Reporting") the other two
          surfaces never mentioned, so the app answered "what does disabling
          do?" two different ways depending on where you asked. */}
      {confirmDialog.type === 'disable' && (
        <DisableJobModal
          isOpen={confirmDialog.isOpen}
          jobLabel={formatJobVersionLabel({
            job_id: confirmDialog.jdCode,
            title: confirmDialog.jdTitle,
            versionNumber: confirmDialog.jdVersion,
          })}
          job={{
            job_id: confirmDialog.jdCode,
            title: confirmDialog.jdTitle,
            versionNumber: confirmDialog.jdVersion,
          }}
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

      <ExportFormatModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Job Descriptions"
        recordCount={showExportModal ? getJdsToExport().length : undefined}
        selected={selectedJds.length > 0}
        columns={JD_EXPORT_COLUMNS.map(c => c.header)}
        onExport={runExportJDs}
      />
    </main>
  );
}
