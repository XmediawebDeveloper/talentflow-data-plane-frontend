'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { RotateCcw, Download, Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, RefreshCw, ExternalLink, Filter, Sparkles, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { handleUnauthorized, getAccessToken } from '@/lib/services/api';
import { billToFromAuth, generateRefundReceiptPDF } from '@/lib/utils/pdfInvoice';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { showErrorToast } from '@/lib/utils/errorToast';
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

// Use backend proxy instead of direct Admin API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface RefundMetadata {
  reason?: string;
  notes?: string;
  processed_by?: string;
  refund_method?: string;
  razorpay_refund_id?: string | null;
  refund_percentage?: number;
  original_invoice_id?: number | null;
  original_invoice_number?: string;
  [key: string]: unknown;
}

interface RefundInvoice {
  id: number;
  invoice_number: string;
  invoice_type: string;
  tenant_id: string;
  amount_inr: number;
  tax_amount_inr: number;
  discount_amount_inr: number;
  total_amount_inr: number;
  status: string;
  issue_date: string;
  due_date: string;
  line_items: LineItem[];
  metadata: RefundMetadata;
  created_at: string;
  payment_method?: string;
  payment_status?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  payment_amount?: number;
  payment_currency?: string;
  paid_at?: string;
}

interface RefundStats {
  total_refunds: number;
  total_amount: number;
  completed_count: number;
  pending_count: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
];

/* One status rule for the filter dropdown and the stat cards that open it.
   "Completed" gathers every settled spelling; every other option (Pending,
   Processing, …) is its own status, as the dropdown lists them separately. */
const COMPLETED_REFUND_STATUSES = ['paid', 'refunded', 'completed', 'success'];
const matchesRefundStatus = (status: string, filter: string) => {
  const s = status.toLowerCase();
  return filter === 'completed' ? COMPLETED_REFUND_STATUSES.includes(s) : s === filter.toLowerCase();
};

const EXPORT_HEADERS = ['Refund #', 'Date', 'Original Invoice', 'Reason', 'Amount', 'Status', 'Refund Method', 'Processed By'];

export default function RefundHistoryPage() {
  const { hasPermission, user, tenant } = useAuth();
  const canExportRefundHistory = hasPermission('canExportUsage');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [refunds, setRefunds] = useState<RefundInvoice[]>([]);
  const [stats, setStats] = useState<RefundStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRefund, setSelectedRefund] = useState<RefundInvoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // New filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pagination state
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
  const rootRef = useScrollRestoration<HTMLElement>('sub-refund-history', !loading, [pageView]);
  useListStatePersistence(
    'sub-refund-history',
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
    fetchRefundData();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, startDate, endDate]);

  const fetchRefundData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = getAccessToken();
      if (!token) {
        setError('Not authenticated. Please login again.');
        setLoading(false);
        return;
      }

      // Fetch refund invoices from backend proxy (which calls Admin API)
      const refundResponse = await fetch(`${API_URL}/billing/invoices/refunds`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (refundResponse.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!refundResponse.ok) {
        throw new Error('Failed to fetch refund history');
      }

      const refundResult = await refundResponse.json();
      const refundData = refundResult.data?.invoices || [];
      setRefunds(refundData);

      // Calculate stats from refunds — with the same rule as the status filter
      // each card opens (`matchesRefundStatus`), so a card's count always
      // equals the rows its list shows. The cards used to leave SUCCESS out of
      // Completed and fold PROCESSING into Pending, which the filter (with its
      // own Processing option) didn't.
      const completedRefunds = refundData.filter((r: RefundInvoice) => matchesRefundStatus(r.status, 'completed'));
      const pendingRefunds = refundData.filter((r: RefundInvoice) => matchesRefundStatus(r.status, 'pending'));
      const totalAmount = refundData.reduce((sum: number, r: RefundInvoice) => sum + Math.abs(r.total_amount_inr || 0), 0);

      setStats({
        total_refunds: refundData.length,
        total_amount: totalAmount,
        completed_count: completedRefunds.length,
        pending_count: pendingRefunds.length,
      });
    } catch (err) {
      console.error('[RefundHistory] Error:', err);
      setError('Failed to load refund history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter refunds based on search, status, and date range
  const filteredRefunds = useMemo(() => {
    return refunds.filter(inv => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.metadata?.original_invoice_number && inv.metadata.original_invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inv.line_items?.[0]?.description && inv.line_items[0].description.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status filter
      const matchesStatus = statusFilter === 'all' || matchesRefundStatus(inv.status, statusFilter);

      // Date filter
      let matchesDate = true;
      if (inv.issue_date) {
        const itemDate = new Date(inv.issue_date);
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
  }, [refunds, searchQuery, statusFilter, startDate, endDate]);

  const paginatedRefunds = useMemo(
    () => filteredRefunds.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredRefunds, currentPage, itemsPerPage]
  );

  const formatAmount = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'refunded':
      case 'completed':
      case 'success':
      case 'paid':
        return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'pending':
      case 'processing':
        return <Clock className="h-3.5 w-3.5" />;
      case 'failed':
      case 'rejected':
        return <XCircle className="h-3.5 w-3.5" />;
      default:
        return <Clock className="h-3.5 w-3.5" />;
    }
  };

  // Canonical status → shared Badge variant (same status looks the same everywhere).
  const getStatusVariant = (status: string): 'success' | 'warning' | 'destructive' | 'muted' => {
    switch (status.toLowerCase()) {
      case 'refunded':
      case 'completed':
      case 'success':
      case 'paid':
        return 'success';
      case 'pending':
      case 'processing':
        return 'warning';
      case 'failed':
      case 'rejected':
        return 'destructive';
      default:
        return 'muted';
    }
  };

  const handleDownloadRefund = async (inv: RefundInvoice) => {
    setDownloadingId(inv.id);
    try {
      await generateRefundReceiptPDF(inv, billToFromAuth(user, tenant));
    } catch (error) {
      console.error('PDF generation failed:', error);
      showErrorToast(error, "Couldn't download the refund receipt", { retry: () => handleDownloadRefund(inv) });
    } finally {
      setDownloadingId(null);
    }
  };

  // Export filtered data — runs from the CSV / Excel format picker
  const handleExport = async (format: ExportFileFormat) => {
    const csvRows = filteredRefunds.map(r => [
      r.invoice_number || '',
      formatISTDate(r.issue_date),
      r.metadata?.original_invoice_number || '',
      r.metadata?.reason || r.line_items?.[0]?.description || '',
      Math.abs(r.total_amount_inr || 0).toFixed(2),
      r.status || '',
      r.metadata?.refund_method || '',
      r.metadata?.processed_by || '',
    ]);

    await exportRows(format, EXPORT_HEADERS, csvRows, `refund-history-${new Date().toISOString().split('T')[0]}`, {
      sheetName: 'Refund History',
    });
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

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Refund History' }]} />

        {/* Header — title + actions (matches Dispute History) */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="tf-page-title">Refund History</h1>
            <p className="mt-1 tf-body-muted">
              Review refunds issued to your account, track their status, and download refund records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (!canExportRefundHistory) return;
              setShowExportModal(true);
            }}
            disabled={loading || filteredRefunds.length === 0 || !canExportRefundHistory}
            title={!canExportRefundHistory ? 'You do not have permission to export refund history' : ''}
            className="tf-btn tf-btn-secondary border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-60 whitespace-normal"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <ExportFormatModal
            open={showExportModal}
            onClose={() => setShowExportModal(false)}
            title="Export Refund History"
            recordCount={filteredRefunds.length}
            columns={EXPORT_HEADERS}
            onExport={handleExport}
          />
          <button
            onClick={fetchRefundData}
            disabled={loading}
            className="tf-btn tf-btn-secondary border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-70 whitespace-normal"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          </div>
        </div>

        {/* Stats Cards — clicking a card drills into the refund list with the matching filter applied */}
        {stats && (
          <div className="tf-grid-3 mb-5">
            <button
              type="button"
              onClick={() => openListView('all')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'all' ? 'border-brand-teal/40 ring-brand-teal/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-teal/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tf-eyebrow tracking-wider">Total Refunded</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-teal">{formatAmount(stats.total_amount)}</p>
                  <p className="mt-1 tf-meta">{stats.total_refunds} refund{stats.total_refunds !== 1 ? 's' : ''}</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                  <RotateCcw className="h-5 w-5 text-brand-teal" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('completed')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'completed' ? 'border-brand-blue/40 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tf-eyebrow tracking-wider">Completed</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-gray-900 dark:text-slate-50">{stats.completed_count}</p>
                  <p className="mt-1 tf-meta">Processed successfully</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                  <CheckCircle2 className="h-5 w-5 text-brand-blue" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('pending')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'pending' ? 'border-brand-orange/40 ring-brand-orange/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-orange/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tf-eyebrow tracking-wider">Pending</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-orange-deep">{stats.pending_count}</p>
                  <p className="mt-1 tf-meta">Being processed</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                  <Clock className="h-5 w-5 text-brand-orange-deep" />
                </span>
              </div>
            </button>
          </div>
        )}

        {pageView === 'list' && (
          <>
        {/* Filters Section */}
        <div className="mb-5 tf-card-soft p-4 sm:p-5">
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
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search refunds"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="tf-input pl-9 pr-3"
              />
            </div>

            {/* Status Filter */}
            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              ariaLabel="Filter by status"
              options={STATUS_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
              className="w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
            />

            {/* Start Date */}
            <DateField
              aria-label="From date"
              placeholder="From date"
              value={startDate}
              onChange={setStartDate}
            />

            {/* End Date */}
            <DateField
              aria-label="To date"
              placeholder="To date"
              value={endDate}
              onChange={setEndDate}
            />
          </div>
          {activeFilterChips.length > 0 && (
            <FilterChips className="mt-3" chips={activeFilterChips} />
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Loading State — mirrors the refunds table columns (Refund #, Date, Original Invoice, Reason, Amount, Status, Actions) */}
        {loading && (
          <div className="overflow-hidden tf-card-soft">
            <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3.5 sm:px-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header */}
                <div className="grid grid-cols-[160px_110px_150px_180px_110px_110px_140px] gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/80 dark:bg-slate-800/50 px-4 py-3.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="ml-auto h-3 w-16" />
                  <Skeleton className="mx-auto h-3 w-14" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </div>
                {/* Rows */}
                <div className="divide-y divide-gray-100">
                  {Array.from({ length: 6 }).map((_, r) => (
                    <div key={r} className="grid grid-cols-[160px_110px_150px_180px_110px_110px_140px] items-center gap-4 px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="ml-auto h-4 w-16" />
                      <Skeleton className="mx-auto h-6 w-20 rounded-full" />
                      <div className="ml-auto flex items-center gap-1.5">
                        <Skeleton className="h-7 w-14 rounded-md" />
                        <Skeleton className="h-7 w-7 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredRefunds.length === 0 && (
          <div className="tf-card-soft p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15">
              <RotateCcw className="h-7 w-7 text-brand-teal" />
            </div>
            <h3 className="tf-section-title sm:text-lg">No Refunds</h3>
            <p className="mx-auto mt-1 max-w-md tf-body-muted">
              {hasActiveFilters
                ? 'No refunds match your filter criteria. Try adjusting your filters.'
                : 'You have no refund transactions. Refunds will appear here when you cancel a subscription or request a refund.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-brand-blue/15 bg-brand-blue/[0.04] px-4 py-2 text-sm font-medium text-brand-blue transition-all hover:bg-brand-blue/[0.08]"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Refunds Table */}
        {!loading && !error && filteredRefunds.length > 0 && (
          <div className="overflow-hidden tf-card-soft">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3.5 sm:px-6">
              <div>
                <h2 className="tf-row-title">Refunds</h2>
                <p className="tf-meta">
                  Showing {filteredRefunds.length} refund{filteredRefunds.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ` (filtered from ${refunds.length})`}
                </p>
              </div>
            </div>
            <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full min-w-[800px] tf-premium-table">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="tf-th-cell tf-th w-[160px]">Refund #</th>
                    <th className="tf-th-cell tf-th w-[110px]">Date</th>
                    <th className="tf-th-cell tf-th w-[150px]">Original Invoice</th>
                    <th className="tf-th-cell tf-th w-[180px]">Reason</th>
                    <th className="tf-th-cell text-right tf-th w-[110px]">Amount</th>
                    <th className="tf-th-cell text-center tf-th w-[110px]">Status</th>
                    <th className="tf-th-cell text-right tf-th w-[140px] tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRefunds.map((refund) => (
                    <tr key={refund.id}>
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15">
                            <RotateCcw className="h-4 w-4 text-brand-teal" />
                          </span>
                          <span className="min-w-0 truncate tf-row-title" title={refund.invoice_number || ''}>
                            {refund.invoice_number || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="tf-td whitespace-nowrap tf-body">
                        {formatISTDate(refund.issue_date)}
                      </td>
                      <td className="tf-td">
                        <div className="truncate font-mono tf-body" title={refund.metadata?.original_invoice_number || ''}>
                          {refund.metadata?.original_invoice_number || '-'}
                        </div>
                      </td>
                      <td className="tf-td">
                        <div className="truncate tf-body-secondary" title={refund.metadata?.reason || refund.line_items?.[0]?.description || ''}>
                          {refund.metadata?.reason || refund.line_items?.[0]?.description || '-'}
                        </div>
                      </td>
                      <td className="tf-td text-right">
                        <span className="text-sm font-semibold text-brand-teal">
                          +{formatAmount(Math.abs(refund.total_amount_inr || 0))}
                        </span>
                      </td>
                      <td className="tf-td text-center">
                        <Badge variant={getStatusVariant(refund.status || 'unknown')} className="capitalize">
                          {getStatusIcon(refund.status || 'unknown')}
                          {refund.status || '-'}
                        </Badge>
                      </td>
                      <td className="tf-td text-right tf-sticky-col">
                        <RowActions
                          menuLabel="Refund actions"
                          actions={[
                            { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedRefund(refund) },
                            { key: 'download', label: 'Download Receipt', icon: Download, loading: downloadingId === refund.id, onClick: () => handleDownloadRefund(refund) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MobileRecordList>
              {paginatedRefunds.map((refund) => (
                <MobileRecordCard
                  key={refund.id}
                  badges={
                    <Badge variant={getStatusVariant(refund.status || 'unknown')} className="capitalize">
                      {getStatusIcon(refund.status || 'unknown')}
                      {refund.status || '-'}
                    </Badge>
                  }
                  title={refund.invoice_number || '-'}
                  actions={
                    <RowActions
                      menuLabel="Refund actions"
                      actions={[
                        { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedRefund(refund) },
                        { key: 'download', label: 'Download Receipt', icon: Download, loading: downloadingId === refund.id, onClick: () => handleDownloadRefund(refund) },
                      ]}
                    />
                  }
                  fields={[
                    { label: 'Date', value: formatISTDate(refund.issue_date) },
                    { label: 'Original Invoice', value: <span className="font-mono">{refund.metadata?.original_invoice_number || '-'}</span> },
                    { label: 'Reason', value: refund.metadata?.reason || refund.line_items?.[0]?.description || '-' },
                    { label: 'Amount', value: <span className="font-semibold text-brand-teal">+{formatAmount(Math.abs(refund.total_amount_inr || 0))}</span> },
                  ]}
                />
              ))}
            </MobileRecordList>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && filteredRefunds.length > 0 && (
          <ListPagination
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredRefunds.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            itemLabel="refunds"
          />
        )}
          </>
        )}

        {/* Refund Detail Modal */}
        {selectedRefund && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90dvh] flex flex-col w-full max-w-[95vw] sm:max-w-2xl overflow-hidden rounded-2xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
              <div className="flex-shrink-0 relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <RotateCcw className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">Refund Details</h2>
                      <p className="mt-0.5 break-all font-mono text-sm text-white/75">{selectedRefund.invoice_number}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedRefund(null)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
                <div className="tf-grid-2">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Issue Date</p>
                    <p className="mt-1 tf-row-title">{formatISTDate(selectedRefund.issue_date)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Original Invoice</p>
                    <p className="mt-1 break-all font-mono tf-row-title">{selectedRefund.metadata?.original_invoice_number || '-'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Status</p>
                    <Badge variant={getStatusVariant(selectedRefund.status)} className="mt-1 capitalize">
                      {getStatusIcon(selectedRefund.status)}
                      {selectedRefund.status}
                    </Badge>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="tf-micro-hint uppercase tracking-wider">Refund Method</p>
                    <p className="mt-1 tf-row-title">{selectedRefund.metadata?.refund_method || '-'}</p>
                  </div>
                  {selectedRefund.payment_method && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="tf-micro-hint uppercase tracking-wider">Payment Method</p>
                      <p className="mt-1 tf-row-title capitalize">{selectedRefund.payment_method}</p>
                    </div>
                  )}
                  {selectedRefund.paid_at && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="tf-micro-hint uppercase tracking-wider">Paid At</p>
                      <p className="mt-1 tf-row-title">{formatISTDate(selectedRefund.paid_at)}</p>
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Refund Details</p>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <span className="tf-body-secondary">Description</span>
                      <span className="text-right tf-row-name">{selectedRefund.line_items?.[0]?.description || '-'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="tf-body-secondary">Reason</span>
                      <span className="text-right tf-row-name">{selectedRefund.metadata?.reason || '-'}</span>
                    </div>
                    {selectedRefund.metadata?.refund_percentage && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="tf-body-secondary">Refund Percentage</span>
                        <span className="tf-row-name">{selectedRefund.metadata.refund_percentage}%</span>
                      </div>
                    )}
                    {selectedRefund.metadata?.processed_by && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="tf-body-secondary">Processed By</span>
                        <span className="tf-row-name">{selectedRefund.metadata.processed_by}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-brand-teal p-4 text-white shadow-md shadow-brand-teal/20 ring-1 ring-white/10">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-3xl" />
                  <div className="relative flex items-center justify-between">
                    <span className="text-base font-semibold">Refund Amount</span>
                    <span className="text-2xl font-bold">
                      +{formatAmount(Math.abs(selectedRefund.total_amount_inr || 0))}
                    </span>
                  </div>
                </div>

                {selectedRefund.metadata?.notes && (
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Notes</p>
                    <p className="mt-1 tf-body">{selectedRefund.metadata.notes}</p>
                  </div>
                )}

                {selectedRefund.metadata?.razorpay_refund_id && (
                  <div className="rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.05] p-4">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-brand-cyan">Razorpay Refund ID</p>
                    <p className="mt-1 break-all font-mono tf-body">{selectedRefund.metadata.razorpay_refund_id}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
                  <button
                    onClick={() => handleDownloadRefund(selectedRefund)}
                    disabled={downloadingId === selectedRefund.id}
                    className="tf-btn tf-btn-primary flex flex-1 rounded-xl bg-brand-blue px-4 py-2.5 text-sm shadow-md shadow-brand-blue/25 hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-70 whitespace-normal hover:bg-brand-blue"
                  >
                    {downloadingId === selectedRefund.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF...</>
                    ) : (
                      <><Download className="h-4 w-4" /> Download Receipt</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
