'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { ArrowLeft, Shield, Search, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Download, ExternalLink, RefreshCw, Filter, Plus, Copy, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { useAuth } from '@/lib/hooks/useAuth';
import ListPagination from '@/components/ListPagination';
import { RowActions } from '@/components/subscription/RowActionsMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { DateField } from '@/components/ui/date-field';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// --- Types ---

interface UnitDispute {
  id: string;
  tenant_id: string;
  consumption_log_id?: string;
  unit_type: string;
  units_to_refund: number;
  reason: string;
  description?: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  requested_by_name: string | null;
  requested_by_email: string | null;
  resolution_notes?: string | null;
  units_restored: number | null;
  resolved_by_email?: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at?: string;
}

interface ConsumptionLog {
  id: string;
  unit_type: 'RU' | 'RS' | 'AS' | 'AIU' | 'max_seats';
  units_consumed: number;
  status: string;
  user_email: string | null;
  user_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  created_at: string;
}

interface DisputeStats {
  total: number;
  pending: number;
  resolved: number;
}

// --- Constants ---

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'resolved', label: 'Resolved (Approved or Rejected)' },
];

const REASON_OPTIONS = [
  { value: 'SYSTEM_ERROR', label: 'System Error' },
  { value: 'TECHNICAL_FAILURE', label: 'Technical Failure' },
  { value: 'BILLING_ERROR', label: 'Billing Error' },
  { value: 'INTERRUPTED', label: 'Interrupted' },
];

const getReasonLabel = (reason: string) => {
  return REASON_OPTIONS.find(r => r.value === reason)?.label || reason;
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  RU: 'Resume Storage',
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
  max_seats: 'Max Users',
};

const EXPORT_HEADERS = ['Dispute ID', 'Date', 'Unit Type', 'Units Requested', 'Reason', 'Description', 'Status', 'Units Restored', 'Resolved At'];

// --- Component ---

export default function UnitDisputesPage() {
  // RBAC (Subscription & Billing → Usage & Quotas), enforced again by the API:
  //   view = View Usage (route + tab), File Dispute = Upgrade Plan, Export = Export Usage.
  const { hasPermission } = useAuth();
  const canExportDisputes = hasPermission('canExportUsage');
  const canFileDispute = hasPermission('canUpgradePlan');
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [disputes, setDisputes] = useState<UnitDispute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<UnitDispute | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // File dispute modal
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileStep, setFileStep] = useState<1 | 2>(1);
  const [consumptionLogs, setConsumptionLogs] = useState<ConsumptionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ConsumptionLog | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeUnits, setDisputeUnits] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pagination for consumption logs
  const [logPage, setLogPage] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const LOG_PAGE_SIZE = 10;
  // Page size for walking every dispute in fetchDisputes (the API's old fixed limit).
  const DISPUTES_PAGE_SIZE = 100;
  const logTotalPages = Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE));

  // 1-based text for the Go-to-page input — logPage itself stays 0-based.
  const [logGoToPage, setLogGoToPage] = useState(String(logPage + 1));
  useEffect(() => {
    setLogGoToPage(String(logPage + 1));
  }, [logPage]);

  const commitLogGoToPage = () => {
    const target = Math.round(Number(logGoToPage));
    if (Number.isFinite(target) && target >= 1 && target <= logTotalPages) {
      fetchConsumptionLogs(target - 1);
    } else {
      setLogGoToPage(String(logPage + 1));
    }
  };

  // Pagination state for the main disputes list
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Two-step view: 'cards' shows only the stat tiles; 'list' shows filters + table.
  // Initial render is 'cards' so the user explicitly drills in by clicking a stat card.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');

  const openListView = (filter: string) => {
    setStatusFilter(filter);
    setPageView('list');
  };

  // Persist/restore list view state + scroll position across navigation.
  // Re-detect the scroll container when the two-step view flips.
  const rootRef = useScrollRestoration<HTMLElement>('sub-unit-disputes', !loading, [pageView]);
  useListStatePersistence(
    'sub-unit-disputes',
    { pageView, statusFilter, searchQuery, startDate, endDate, currentPage, itemsPerPage },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.statusFilter === 'string') setStatusFilter(s.statusFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.startDate === 'string') setStartDate(s.startDate);
      if (typeof s.endDate === 'string') setEndDate(s.endDate);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  useEffect(() => {
    fetchDisputes();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, startDate, endDate]);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }, []);

  const fetchDisputes = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      if (!headers) {
        setError('Not authenticated. Please login again.');
        setLoading(false);
        return;
      }

      /* Page through every dispute. Only the first 100 used to load, so the
         stat cards and the list both silently stopped at 100. A page shorter
         than the limit (or the server's `total`, when it sends one) ends the
         walk; a page that brings nothing new — a server ignoring `offset` —
         ends it too, so this can't loop. */
      const all: UnitDispute[] = [];
      const seen = new Set<string>();
      for (let offset = 0; ; offset += DISPUTES_PAGE_SIZE) {
        const response = await fetch(`${API_URL}/disputes?limit=${DISPUTES_PAGE_SIZE}&offset=${offset}`, { headers });

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (response.status === 403) {
          setError('You do not have permission to view unit disputes.');
          return;
        }

        if (!response.ok) throw new Error('Failed to fetch disputes');

        const result = await response.json();
        const page: UnitDispute[] = result.data?.disputes || result.data?.items || [];
        const fresh = page.filter((d) => !seen.has(d.id));
        fresh.forEach((d) => { seen.add(d.id); all.push(d); });
        const total = typeof result.data?.total === 'number' ? result.data.total : null;
        if (page.length < DISPUTES_PAGE_SIZE || fresh.length === 0 || (total !== null && all.length >= total)) break;
      }
      setDisputes(all);
    } catch (err) {
      console.error('[UnitDisputes] Error:', err);
      setError('Failed to load unit disputes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchConsumptionLogs = async (page = 0) => {
    setLoadingLogs(true);
    try {
      const headers = getAuthHeaders();
      if (!headers) return;

      const offset = page * LOG_PAGE_SIZE;
      const response = await fetch(
        `${API_URL}/unit-pool/consumption-history?limit=${LOG_PAGE_SIZE}&offset=${offset}&status=SUCCESS`,
        { headers }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch consumption history');

      const result = await response.json();
      setConsumptionLogs(result.items || []);
      setLogTotal(result.total || 0);
      setLogPage(page);
    } catch (err) {
      console.error('[UnitDisputes] Error fetching logs:', err);
      toast.error('Failed to load consumption history');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!selectedLog) return;
    if (!disputeReason) { toast.error('Please select a reason'); return; }
    if (disputeDescription.length < 10) { toast.error('Description must be at least 10 characters'); return; }
    if (disputeDescription.length > 1000) { toast.error('Description cannot exceed 1000 characters'); return; }
    const units = parseFloat(disputeUnits);
    if (isNaN(units) || units <= 0) { toast.error('Please enter a valid number of units'); return; }
    if (units > selectedLog.units_consumed) { toast.error('Units cannot exceed consumed amount'); return; }

    setSubmitting(true);
    try {
      const headers = getAuthHeaders();
      if (!headers) return;

      const response = await fetch(`${API_URL}/disputes/request-refund`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          consumption_log_id: selectedLog.id,
          unit_type: selectedLog.unit_type,
          units_to_refund: units,
          reason: disputeReason,
          description: disputeDescription,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.status === 403) {
        toast.error('You do not have permission to file disputes');
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        // A validation error (422) sends `detail` as a list of {msg} objects, not a string.
        const rawDetail = errData?.detail;
        const detail: string = Array.isArray(rawDetail)
          ? rawDetail.map((d: { msg?: string }) => d?.msg).filter(Boolean).join('; ')
          : typeof rawDetail === 'string' ? rawDetail : '';
        if (detail.toLowerCase().includes('already exists') || detail.toLowerCase().includes('duplicate')) {
          toast.error('A dispute has already been filed for this consumption record. Please check your existing disputes.');
          closeFileModal();
          fetchDisputes();
          return;
        }
        throw new Error(detail || 'Failed to submit dispute');
      }

      toast.success('Dispute submitted successfully! It will be reviewed within 2-3 business days.');
      closeFileModal();
      fetchDisputes();
    } catch (err) {
      console.error('[UnitDisputes] Submit error:', err);
      toast.error(friendlyErrorMessage(err, "Couldn't submit dispute. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setFileStep(1);
    setSelectedLog(null);
    setDisputeReason('');
    setDisputeDescription('');
    setDisputeUnits('');
    setConsumptionLogs([]);
  };

  const openFileModal = () => {
    setShowFileModal(true);
    setFileStep(1);
    fetchConsumptionLogs(0);
  };

  // --- Computed ---

  const stats: DisputeStats = useMemo(() => {
    const pending = disputes.filter(d => d.status === 'PENDING_REVIEW').length;
    const resolved = disputes.filter(d => d.status === 'APPROVED' || d.status === 'REJECTED').length;
    return { total: disputes.length, pending, resolved };
  }, [disputes]);

  // Consumption records that already have a dispute — the API refuses a second one.
  const disputedLogIds = useMemo(
    () => new Set(disputes.map(d => d.consumption_log_id).filter((id): id is string => !!id)),
    [disputes]
  );

  const filteredDisputes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return disputes.filter(d => {
      // description is optional, and reasons match by label too ("System Error").
      const matchesSearch = q === '' ||
        (d.id || '').toLowerCase().includes(q) ||
        (d.reason || '').toLowerCase().includes(q) ||
        getReasonLabel(d.reason || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all'
        || d.status === statusFilter
        || (statusFilter === 'resolved' && (d.status === 'APPROVED' || d.status === 'REJECTED'));

      let matchesDate = true;
      if (d.created_at) {
        const itemDate = new Date(d.created_at);
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (itemDate < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (itemDate > end) matchesDate = false;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [disputes, searchQuery, statusFilter, startDate, endDate]);

  const paginatedDisputes = useMemo(
    () => filteredDisputes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredDisputes, currentPage, itemsPerPage]
  );

  // --- Helpers ---

  const formatDate = (dateString: string | null) => formatISTDate(dateString ?? undefined);
  const formatDateTime = (dateString: string | null) => formatIST(dateString ?? undefined);

  const truncateId = (id: string | null | undefined) => {
    if (!id) return '—';
    if (id.length <= 12) return id;
    return `${id.slice(0, 8)}...${id.slice(-4)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'PENDING_REVIEW': return <Clock className="h-3.5 w-3.5" />;
      case 'REJECTED': return <XCircle className="h-3.5 w-3.5" />;
      default: return <AlertCircle className="h-3.5 w-3.5" />;
    }
  };

  // Canonical status → shared Badge variant (same status looks the same everywhere).
  const getStatusVariant = (status: string): 'success' | 'warning' | 'destructive' | 'muted' => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'PENDING_REVIEW': return 'warning';
      case 'REJECTED': return 'destructive';
      default: return 'muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING_REVIEW': return 'Pending Review';
      case 'APPROVED': return 'Approved';
      case 'REJECTED': return 'Rejected';
      default: return status;
    }
  };

  const getUnitTypeBadge = (unitType: string) => {
    const styles: Record<string, string> = {
      RU: 'bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20',
      RS: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20',
      AS: 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20',
      AIU: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20',
      max_seats: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold ${styles[unitType] || 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'}`}>
        {unitType}
      </span>
    );
  };

  const handleExport = async (format: ExportFileFormat) => {
    const csvRows = filteredDisputes.map(d => [
      d.id,
      formatDate(d.created_at),
      d.unit_type,
      d.units_to_refund.toString(),
      getReasonLabel(d.reason),
      d.description || '',
      getStatusLabel(d.status),
      d.units_restored?.toString() || '',
      d.resolved_at ? formatDate(d.resolved_at) : '',
    ]);

    await exportRows(format, EXPORT_HEADERS, csvRows, `unit-disputes-${new Date().toISOString().split('T')[0]}`, {
      sheetName: 'Unit Disputes',
    });

    // Audit trail for the client-built file (the API re-checks Export Usage).
    try {
      const headers = getAuthHeaders();
      if (headers) {
        await fetch(`${API_URL}/disputes/export/log`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            format,
            record_count: filteredDisputes.length,
            status_filter: statusFilter,
            ids: filteredDisputes.map(d => d.id),
          }),
        });
      }
    } catch (err) {
      console.warn('[UnitDisputes] export audit log failed:', err);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || startDate || endDate;
  // Active filter tags: Status and the date range as one tag (the search
  // shows in its own box). Each removes just its own filter.
  const formatChipDate = (v: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const activeFilterChips: FilterChip[] = [
    statusFilter !== 'all' && {
      key: 'status',
      label: 'Status',
      value: STATUS_OPTIONS.find(opt => opt.value === statusFilter)?.label ?? statusFilter,
      onRemove: () => setStatusFilter('all'),
    },
    (startDate || endDate) && {
      key: 'date',
      label: 'Date',
      value: startDate && endDate
        ? `${formatChipDate(startDate)} – ${formatChipDate(endDate)}`
        : startDate ? `From ${formatChipDate(startDate)}` : `Until ${formatChipDate(endDate)}`,
      onRemove: () => { setStartDate(''); setEndDate(''); },
    },
  ].filter(Boolean) as FilterChip[];

  // --- Render ---

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Unit Disputes' }]} />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="tf-page-title">Unit Consumption Disputes</h1>
            <p className="mt-1 tf-body-muted">
              File refund requests for units consumed in error and track the review status. Each request is reviewed within 2&ndash;3 business days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (!canExportDisputes) return;
                setShowExportModal(true);
              }}
              disabled={loading || filteredDisputes.length === 0 || !canExportDisputes}
              title={!canExportDisputes ? 'You do not have permission to export disputes' : ''}
              className="inline-flex items-center justify-center gap-2 tf-panel px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/25 hover:text-brand-blue disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <ExportFormatModal
              open={showExportModal}
              onClose={() => setShowExportModal(false)}
              title="Export Unit Disputes"
              recordCount={filteredDisputes.length}
              columns={EXPORT_HEADERS}
              onExport={handleExport}
            />
            <button
              onClick={fetchDisputes}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 tf-panel px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/25 hover:text-brand-blue disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => {
                if (!canFileDispute) return;
                openFileModal();
              }}
              aria-disabled={!canFileDispute}
              title={!canFileDispute ? 'You do not have permission to file disputes' : ''}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-md transition-all ${
                canFileDispute
                  ? 'bg-brand-blue text-white shadow-brand-blue/25 hover:-translate-y-0.5 hover:shadow-lg'
                  : 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed opacity-60'
              }`}
            >
              <Plus className="h-4 w-4" />
              File Dispute
            </button>
          </div>
        </div>

        {/* Stats Cards — clicking a card drills into the dispute list with the matching filter applied */}
        <div className="tf-grid-3 mb-5">
          <button
            type="button"
            onClick={() => openListView('all')}
            className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'all' ? 'border-brand-blue/40 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/25'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="tf-eyebrow tracking-wider">Total Disputes</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-blue">{stats.total}</p>
                <p className="mt-1 tf-meta">All time</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                <Shield className="h-5 w-5 text-brand-blue" />
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openListView('PENDING_REVIEW')}
            className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'PENDING_REVIEW' ? 'border-brand-orange/40 ring-brand-orange/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-orange/25'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="tf-eyebrow tracking-wider">Pending Review</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-orange-deep">{stats.pending}</p>
                <p className="mt-1 tf-meta">Awaiting decision</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 shadow-sm shadow-brand-orange/10">
                <Clock className="h-5 w-5 text-brand-orange-deep" />
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openListView('resolved')}
            className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'resolved' ? 'border-brand-teal/40 ring-brand-teal/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-teal/25'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="tf-eyebrow tracking-wider">Resolved</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-teal">{stats.resolved}</p>
                <p className="mt-1 tf-meta">Approved or rejected</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                <CheckCircle2 className="h-5 w-5 text-brand-teal" />
              </span>
            </div>
          </button>
        </div>

        {pageView === 'list' && (
          <>
        {/* Filters */}
        <div className="tf-card-soft mb-6 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Filter className="h-3.5 w-3.5 text-brand-blue" />
            </span>
            <span className="tf-row-title">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-blue/[0.06] px-3 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10 transition-colors hover:bg-brand-blue/[0.12]"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="tf-grid-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search by ID, reason, description"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="tf-input pl-9 pr-3"
              />
            </div>
            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              ariaLabel="Filter by status"
              options={STATUS_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
              className="w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
            />
            <DateField
              aria-label="Start date"
              value={startDate}
              onChange={setStartDate}
            />
            <DateField
              aria-label="End date"
              value={endDate}
              onChange={setEndDate}
            />
          </div>
          {activeFilterChips.length > 0 && (
            <FilterChips className="mt-3" chips={activeFilterChips} />
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Loading — mirrors the disputes table columns (ID, Date, Unit Type, Units, Reason, Status, Actions) */}
        {loading && (
          <div className="tf-panel overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                {/* Header */}
                <div className="grid grid-cols-[160px_110px_90px_90px_160px_140px_100px] gap-4 border-b border-gray-100 px-4 py-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="mx-auto h-3 w-16" />
                  <Skeleton className="ml-auto h-3 w-12" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mx-auto h-3 w-14" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </div>
                {/* Rows */}
                <div className="divide-y divide-gray-100">
                  {Array.from({ length: 6 }).map((_, r) => (
                    <div key={r} className="grid grid-cols-[160px_110px_90px_90px_160px_140px_100px] items-center gap-4 px-4 py-4">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="mx-auto h-5 w-12 rounded-full" />
                      <Skeleton className="ml-auto h-4 w-8" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mx-auto h-6 w-20 rounded-full" />
                      <Skeleton className="ml-auto h-7 w-14 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filteredDisputes.length === 0 && (
          <div className="tf-card-soft p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Shield className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="tf-section-title">No Unit Disputes</h3>
            <p className="mx-auto mt-1 max-w-md tf-body-muted">
              {hasActiveFilters
                ? 'No disputes match your filter criteria. Try adjusting your filters.'
                : 'You have no unit consumption disputes. If you believe units were incorrectly consumed, you can file a dispute.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] px-4 py-2 text-sm font-medium text-brand-blue transition-all hover:bg-brand-blue/[0.08]"
              >
                Clear all filters
              </button>
            )}
            {!hasActiveFilters && (
              <button
                onClick={() => {
                  if (!canFileDispute) return;
                  openFileModal();
                }}
                aria-disabled={!canFileDispute}
                title={!canFileDispute ? 'You do not have permission to file disputes' : ''}
                className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-md transition-all ${
                  canFileDispute
                    ? 'bg-brand-blue text-white shadow-brand-blue/25 hover:-translate-y-0.5 hover:shadow-lg'
                    : 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed opacity-60'
                }`}
              >
                <Plus className="h-4 w-4" />
                File a Dispute
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && !error && filteredDisputes.length > 0 && (
          <div className="tf-card-soft overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
              <div>
                <h2 className="tf-row-title">Disputes</h2>
                <p className="tf-meta">
                  Showing {filteredDisputes.length} dispute{filteredDisputes.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ` (filtered from ${disputes.length})`}
                </p>
              </div>
            </div>
            <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full min-w-[900px]">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="tf-th-cell tf-th w-[160px]">Dispute ID</th>
                    <th className="tf-th-cell tf-th w-[110px]">Date</th>
                    <th className="tf-th-cell text-center tf-th w-[90px]">Unit Type</th>
                    <th className="tf-th-cell text-right tf-th w-[90px]">Units</th>
                    <th className="tf-th-cell tf-th w-[160px]">Reason</th>
                    <th className="tf-th-cell text-center tf-th w-[140px]">Status</th>
                    <th className="tf-th-cell text-right tf-th w-[100px] tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {paginatedDisputes.map((dispute) => (
                    <tr key={dispute.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate font-mono tf-row-title" title={dispute.id}>
                            {truncateId(dispute.id)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(dispute.id)}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 dark:text-slate-500 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                            aria-label="Copy full ID" title="Copy full ID"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="tf-td whitespace-nowrap tf-body">
                        {formatDate(dispute.created_at)}
                      </td>
                      <td className="tf-td text-center">
                        {getUnitTypeBadge(dispute.unit_type)}
                      </td>
                      <td className="tf-td text-right">
                        <span className="text-sm font-semibold text-brand-blue">{dispute.units_to_refund}</span>
                      </td>
                      <td className="tf-td">
                        <span className="block truncate tf-body-secondary" title={dispute.reason}>
                          {getReasonLabel(dispute.reason)}
                        </span>
                      </td>
                      <td className="tf-td text-center">
                        <Badge variant={getStatusVariant(dispute.status)}>
                          {getStatusIcon(dispute.status)}
                          {getStatusLabel(dispute.status)}
                        </Badge>
                      </td>
                      <td className="tf-td text-right tf-sticky-col">
                        <RowActions
                          menuLabel="Dispute actions"
                          actions={[
                            { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedDispute(dispute) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MobileRecordList>
              {paginatedDisputes.map((dispute) => (
                <MobileRecordCard
                  key={dispute.id}
                  badges={
                    <>
                      {getUnitTypeBadge(dispute.unit_type)}
                      <Badge variant={getStatusVariant(dispute.status)}>
                        {getStatusIcon(dispute.status)}
                        {getStatusLabel(dispute.status)}
                      </Badge>
                    </>
                  }
                  title={
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-mono" title={dispute.id}>{truncateId(dispute.id)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(dispute.id); }}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 dark:text-slate-500 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                        aria-label="Copy full ID" title="Copy full ID"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  }
                  actions={
                    <RowActions
                      menuLabel="Dispute actions"
                      actions={[
                        { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedDispute(dispute) },
                      ]}
                    />
                  }
                  fields={[
                    { label: 'Date', value: formatDate(dispute.created_at) },
                    { label: 'Units', value: <span className="font-semibold text-brand-blue">{dispute.units_to_refund}</span> },
                    { label: 'Reason', value: getReasonLabel(dispute.reason) },
                  ]}
                />
              ))}
            </MobileRecordList>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && filteredDisputes.length > 0 && (
          <ListPagination
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredDisputes.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            itemLabel="disputes"
          />
        )}
          </>
        )}

        {/* Detail Modal */}
        {selectedDispute && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90dvh] flex flex-col w-full max-w-[95vw] sm:max-w-2xl overflow-hidden rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
              <div className="flex-shrink-0 relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Shield className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">Dispute Details</h2>
                      <p className="mt-0.5 font-mono text-sm text-white/75">{truncateId(selectedDispute.id)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
                {/* Top info */}
                <div className="tf-grid-2">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Created</p>
                    <p className="mt-1 tf-row-title">{formatDateTime(selectedDispute.created_at)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Unit Type</p>
                    <div className="mt-1">{getUnitTypeBadge(selectedDispute.unit_type)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Status</p>
                    <Badge variant={getStatusVariant(selectedDispute.status)} className="mt-1">
                      {getStatusIcon(selectedDispute.status)}
                      {getStatusLabel(selectedDispute.status)}
                    </Badge>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Consumption Log ID</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="break-all font-mono tf-row-title">{truncateId(selectedDispute.consumption_log_id)}</p>
                      <button onClick={() => copyToClipboard(selectedDispute.consumption_log_id ?? '')} className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-brand-blue/[0.06] hover:text-brand-blue">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reason & Description */}
                <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Dispute Information</p>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <span className="tf-body-secondary">Reason</span>
                      <span className="text-right tf-row-name">{getReasonLabel(selectedDispute.reason)}</span>
                    </div>
                    <div>
                      <span className="tf-body-secondary">Description</span>
                      <p className="mt-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 tf-body ring-1 ring-gray-100 dark:ring-slate-700/60">{selectedDispute.description}</p>
                    </div>
                  </div>
                </div>

                {/* Units Info */}
                <div className="relative overflow-hidden rounded-xl bg-brand-blue p-4 text-white shadow-md shadow-brand-blue/20 ring-1 ring-white/10">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-cyan/25 blur-3xl" />
                  <div className="relative flex items-center justify-between">
                    <span className="text-sm font-semibold">Units Requested</span>
                    <span className="text-2xl font-bold">{selectedDispute.units_to_refund}</span>
                  </div>
                  {selectedDispute.units_restored !== null && selectedDispute.units_restored !== undefined && (
                    <div className="relative mt-3 flex items-center justify-between border-t border-white/15 pt-3">
                      <span className="text-sm text-white/85">Units Restored</span>
                      <span className="inline-flex items-center gap-2 text-2xl font-bold">
                        <CheckCircle2 className="h-5 w-5" />
                        {selectedDispute.units_restored}
                      </span>
                    </div>
                  )}
                </div>

                {/* Resolution Info */}
                {(selectedDispute.resolution_notes || selectedDispute.resolved_by_email || selectedDispute.resolved_at) && (
                  <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                    <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Resolution</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {selectedDispute.resolution_notes && (
                        <div>
                          <span className="tf-body-secondary">Notes</span>
                          <p className="mt-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 tf-body ring-1 ring-gray-100 dark:ring-slate-700/60">{selectedDispute.resolution_notes}</p>
                        </div>
                      )}
                      {selectedDispute.resolved_by_email && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="tf-body-secondary">Resolved By</span>
                          <span className="break-all text-right tf-row-name">{selectedDispute.resolved_by_email}</span>
                        </div>
                      )}
                      {selectedDispute.resolved_at && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="tf-body-secondary">Resolved At</span>
                          <span className="text-right tf-row-name">{formatDateTime(selectedDispute.resolved_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Requested By */}
                <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 p-4">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Requested By</p>
                  <p className="mt-1 tf-body">{selectedDispute.requested_by_name} <span className="text-gray-500 dark:text-slate-500">({selectedDispute.requested_by_email})</span></p>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* File Dispute Modal */}
        {showFileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90dvh] flex flex-col w-full max-w-[95vw] sm:max-w-2xl overflow-hidden rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
              <div className="flex-shrink-0 relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Shield className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">File a Unit Dispute</h2>
                      <p className="mt-0.5 text-sm text-white/75">Step {fileStep} of 2 &middot; {fileStep === 1 ? 'Select consumption record' : 'Provide dispute details'}</p>
                    </div>
                  </div>
                  <button onClick={closeFileModal} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15" aria-label="Close">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Step indicator */}
                <div className="relative mt-4 flex items-center gap-2">
                  <div className={`h-1 flex-1 rounded-full ${fileStep >= 1 ? 'bg-white' : 'bg-white/20'}`} />
                  <div className={`h-1 flex-1 rounded-full ${fileStep >= 2 ? 'bg-white' : 'bg-white/20'}`} />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
                {/* Step 1: Select consumption log */}
                {fileStep === 1 && (
                  <>
                    <p className="mb-4 tf-body-secondary">Select the consumption record you want to dispute.</p>

                    {loadingLogs && (
                      <div className="mb-4 space-y-2">
                        {/* Mirrors each consumption-log card: unit badge +
                            units, a meta line, and the id line. */}
                        {Array.from({ length: LOG_PAGE_SIZE }).map((_, i) => (
                          <div key={i} className="tf-panel p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-10 rounded-full" />
                                <Skeleton className="h-4 w-16" />
                              </div>
                              <Skeleton className="h-4 w-4" />
                            </div>
                            <Skeleton className="mt-1.5 h-3 w-2/3" />
                            <Skeleton className="mt-1 h-3 w-28" />
                          </div>
                        ))}
                      </div>
                    )}

                    {!loadingLogs && consumptionLogs.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-10 text-center">
                        <Shield className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        <p className="tf-body-muted">No consumption records found.</p>
                      </div>
                    )}

                    {!loadingLogs && consumptionLogs.length > 0 && (
                      <>
                        <div className="mb-4 space-y-2">
                          {consumptionLogs.map(log => {
                            const alreadyDisputed = disputedLogIds.has(log.id);
                            return (
                            <button
                              key={log.id}
                              onClick={() => {
                                if (alreadyDisputed) return;
                                setSelectedLog(log);
                                setDisputeUnits(log.units_consumed.toString());
                                setFileStep(2);
                              }}
                              aria-disabled={alreadyDisputed}
                              title={alreadyDisputed ? 'A dispute has already been filed for this record' : undefined}
                              className={`group w-full rounded-xl border p-3 text-left transition-all ${
                                alreadyDisputed
                                  ? 'cursor-not-allowed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 opacity-60'
                                  : selectedLog?.id === log.id
                                    ? 'hover:-translate-y-0.5 border-brand-blue/30 bg-brand-blue/[0.04] shadow-sm shadow-brand-blue/10'
                                    : 'hover:-translate-y-0.5 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {getUnitTypeBadge(log.unit_type)}
                                  <span className="tf-row-title">
                                    {log.units_consumed} unit{log.units_consumed !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                {alreadyDisputed ? (
                                  <span className="tf-meta">Dispute filed</span>
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-400 dark:text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                                )}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 tf-meta">
                                <span>{formatDateTime(log.created_at)}</span>
                                {log.entity_name && <span className="text-gray-400 dark:text-slate-500">·</span>}
                                {log.entity_name && <span>{log.entity_name}</span>}
                                {log.user_name && <span className="text-gray-400 dark:text-slate-500">·</span>}
                                {log.user_name && <span>{log.user_name}</span>}
                              </div>
                              <div className="mt-1 font-mono tf-micro-hint">{truncateId(log.id)}</div>
                            </button>
                            );
                          })}
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-700/60 pt-3 max-sm:flex-col max-sm:justify-center max-sm:gap-2">
                          <p className="tf-meta max-sm:text-center">
                            {logTotal} total record{logTotal !== 1 ? 's' : ''}
                          </p>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="tf-meta whitespace-nowrap">Go to</span>
                              <input
                                type="number"
                                min={1}
                                max={logTotalPages}
                                value={logGoToPage}
                                onChange={(e) => setLogGoToPage(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                    commitLogGoToPage();
                                  }
                                }}
                                onBlur={commitLogGoToPage}
                                aria-label="Go to page"
                                className="tf-input w-12 h-8 px-1.5 text-xs text-center"
                              />
                            </div>
                            <button
                              onClick={() => fetchConsumptionLogs(logPage - 1)}
                              disabled={logPage === 0}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 transition-all hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="tf-caption whitespace-nowrap">
                              <span className="text-brand-blue font-semibold">{logPage + 1}</span> / {logTotalPages}
                            </span>
                            <button
                              onClick={() => fetchConsumptionLogs(logPage + 1)}
                              disabled={(logPage + 1) * LOG_PAGE_SIZE >= logTotal}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 transition-all hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Step 2: Fill details */}
                {fileStep === 2 && selectedLog && (
                  <>
                    {/* Selected log summary */}
                    <div className="mb-5 rounded-xl border border-brand-blue/20 bg-brand-blue/[0.04] p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-2xs font-semibold uppercase tracking-wider text-brand-blue">Selected Record</span>
                        <button
                          onClick={() => setFileStep(1)}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15 transition-colors hover:bg-brand-blue/[0.06]"
                        >
                          Change
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {getUnitTypeBadge(selectedLog.unit_type)}
                        <span className="tf-row-title">{selectedLog.units_consumed} units</span>
                        <span className="tf-hint">·</span>
                        <span className="tf-meta">{formatDateTime(selectedLog.created_at)}</span>
                      </div>
                    </div>

                    <div className="space-y-5">
                      {/* Reason */}
                      <label className="block">
                        <span className="mb-2 block tf-label">Reason <span className="text-brand-orange">*</span></span>
                        <FilterSelect
                          value={disputeReason}
                          onChange={(v) => setDisputeReason(v)}
                          ariaLabel="Reason"
                          options={[
                            { value: '', label: 'Select a reason' },
                            ...REASON_OPTIONS.map(opt => ({ value: opt.value, label: opt.label })),
                          ]}
                          className="w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2.5 sm:py-2.5 rounded-xl sm:rounded-xl"
                        />
                      </label>

                      {/* Description */}
                      <label className="block">
                        <span className="mb-2 block tf-label">Description <span className="text-brand-orange">*</span></span>
                        <textarea
                          value={disputeDescription}
                          onChange={(e) => setDisputeDescription(e.target.value)}
                          placeholder="Describe the issue in detail (min 10 characters)"
                          rows={4}
                          maxLength={1000}
                          className="tf-textarea resize-none rounded-xl py-2.5"
                        />
                        <p className="mt-1 tf-hint">{disputeDescription.length}/1000 characters</p>
                      </label>

                      {/* Units */}
                      <label className="block">
                        <span className="mb-2 block tf-label">Units to Refund <span className="text-brand-orange">*</span></span>
                        <input
                          type="number"
                          value={disputeUnits}
                          onChange={(e) => setDisputeUnits(e.target.value)}
                          min={0.01}
                          max={selectedLog.units_consumed}
                          step={0.01}
                          className="tf-input rounded-xl"
                        />
                        <p className="mt-1 tf-hint">Max: {selectedLog.units_consumed} units (total consumed)</p>
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                      <button
                        onClick={() => setFileStep(1)}
                        className="flex items-center justify-center gap-2 tf-panel px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                      <button
                        onClick={handleSubmitDispute}
                        disabled={submitting || !disputeReason || disputeDescription.length < 10 || !disputeUnits}
                        className="tf-btn tf-btn-primary flex flex-1 rounded-xl bg-brand-blue px-4 py-2.5 text-sm shadow-md shadow-brand-blue/25 hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-70 whitespace-normal hover:bg-brand-blue"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4" />
                            Submit Dispute
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
