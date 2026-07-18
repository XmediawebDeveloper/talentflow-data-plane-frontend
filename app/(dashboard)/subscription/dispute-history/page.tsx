'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { AlertTriangle, Search, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Download, ExternalLink, MessageSquare, RefreshCw, Shield, Filter, Calendar, X, ChevronDown, ChevronLeft } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { generateDisputeRecordPDF } from '@/lib/utils/pdfInvoice';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ListPagination from '@/components/ListPagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

// Use backend proxy instead of direct Admin API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface DisputeMetadata {
  reason?: string;
  deadline?: string;
  bank_reference?: string;
  customer_claim?: string;
  dispute_status?: string;
  dispute_evidence?: string | null;
  razorpay_dispute_id?: string;
  original_invoice_id?: number | null;
  original_invoice_number?: string;
  [key: string]: unknown;
}

interface DisputeInvoice {
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
  metadata: DisputeMetadata;
  created_at: string;
  reason?: string;
  dispute_status?: string;
  customer_claim?: string;
  deadline?: string;
  payment_method?: string;
  payment_status?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  payment_amount?: number;
  payment_currency?: string;
  paid_at?: string;
}

interface DisputeStats {
  total_disputes: number;
  total_amount: number;
  open_count: number;
  resolved_count: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'resolved', label: 'Resolved' },
];

export default function DisputeHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [disputes, setDisputes] = useState<DisputeInvoice[]>([]);
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<DisputeInvoice | null>(null);
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
  const rootRef = useScrollRestoration<HTMLElement>('sub-dispute-history', !loading, [pageView]);
  useListStatePersistence(
    'sub-dispute-history',
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
    fetchDisputeData();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, startDate, endDate]);

  const fetchDisputeData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('Not authenticated. Please login again.');
        setLoading(false);
        return;
      }

      // Fetch dispute invoices from backend proxy (which calls Admin API)
      const disputeResponse = await fetch(`${API_URL}/billing/invoices/disputes`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (disputeResponse.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!disputeResponse.ok) {
        throw new Error('Failed to fetch dispute history');
      }

      const disputeResult = await disputeResponse.json();
      const disputeData = disputeResult.data?.invoices || [];
      setDisputes(disputeData);

      // Calculate stats from disputes
      const openDisputes = disputeData.filter((d: DisputeInvoice) =>
        ['OPEN', 'PENDING', 'UNDER_REVIEW'].includes((d.metadata?.dispute_status || d.dispute_status || d.status || '').toUpperCase())
      );
      const resolvedDisputes = disputeData.filter((d: DisputeInvoice) =>
        ['WON', 'LOST', 'RESOLVED', 'REJECTED', 'VOID'].includes((d.metadata?.dispute_status || d.dispute_status || d.status || '').toUpperCase())
      );
      const totalAmount = disputeData.reduce((sum: number, d: DisputeInvoice) => sum + (d.total_amount_inr || 0), 0);

      setStats({
        total_disputes: disputeData.length,
        total_amount: totalAmount,
        open_count: openDisputes.length,
        resolved_count: resolvedDisputes.length,
      });
    } catch (err) {
      console.error('[DisputeHistory] Error:', err);
      setError('Failed to load dispute history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter disputes based on search, status, and date range
  const filteredDisputes = useMemo(() => {
    return disputes.filter(inv => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.metadata?.original_invoice_number && inv.metadata.original_invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inv.line_items?.[0]?.description && inv.line_items[0].description.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status filter
      const disputeStatus = (inv.metadata?.dispute_status || inv.dispute_status || inv.status || '').toLowerCase();
      const matchesStatus = statusFilter === 'all' ||
        disputeStatus === statusFilter.toLowerCase() ||
        (statusFilter === 'open' && ['open', 'pending', 'under_review'].includes(disputeStatus)) ||
        (statusFilter === 'resolved' && ['won', 'lost', 'resolved', 'rejected'].includes(disputeStatus));

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
  }, [disputes, searchQuery, statusFilter, startDate, endDate]);

  const paginatedDisputes = useMemo(
    () => filteredDisputes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredDisputes, currentPage, itemsPerPage]
  );

  const formatAmount = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'won':
      case 'resolved':
        return <CheckCircle2 className="h-3.5 w-3.5 text-brand-teal" />;
      case 'open':
      case 'pending':
      case 'under_review':
        return <Clock className="h-3.5 w-3.5 text-amber-600" />;
      case 'lost':
      case 'rejected':
        return <XCircle className="h-3.5 w-3.5 text-red-600" />;
      default:
        return <AlertTriangle className="h-3.5 w-3.5 text-brand-orange-deep" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'won':
      case 'resolved':
        return 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20';
      case 'open':
      case 'pending':
      case 'under_review':
        return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
      case 'lost':
      case 'rejected':
        return 'bg-red-100 text-red-700 ring-1 ring-red-200';
      default:
        return 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20';
    }
  };

  const handleDownloadDispute = async (inv: DisputeInvoice) => {
    setDownloadingId(inv.id);
    try {
      await generateDisputeRecordPDF(inv);
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Export filtered data to CSV
  const handleExportCSV = () => {
    const csvHeaders = ['Dispute #', 'Date', 'Deadline', 'Original Invoice', 'Reason', 'Customer Claim', 'Amount', 'Status', 'Bank Reference'];
    const csvRows = filteredDisputes.map(d => [
      d.invoice_number || '',
      formatISTDate(d.issue_date),
      formatISTDate(d.metadata?.deadline || d.deadline || null),
      d.metadata?.original_invoice_number || '',
      d.metadata?.reason || d.reason || d.line_items?.[0]?.description || '',
      d.metadata?.customer_claim || d.customer_claim || '',
      (d.total_amount_inr || 0).toFixed(2),
      d.metadata?.dispute_status || d.dispute_status || d.status || '',
      d.metadata?.bank_reference || '',
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `dispute-history-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || startDate || endDate;

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Dispute History' }]} />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">Dispute History</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Track chargebacks and payment disputes raised against your account, monitor deadlines, and download dispute records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={loading || filteredDisputes.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/25 hover:text-brand-blue disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              onClick={fetchDisputeData}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-70"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards — clicking a card drills into the dispute list with the matching filter applied */}
        {stats && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => openListView('all')}
              className={`text-left rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'all' ? 'border-brand-orange/40 ring-brand-orange/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-orange/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Total Disputed</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-orange-deep">{formatAmount(stats.total_amount)}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">{stats.total_disputes} dispute{stats.total_disputes !== 1 ? 's' : ''}</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                  <AlertTriangle className="h-5 w-5 text-brand-orange-deep" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('open')}
              className={`text-left rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'open' ? 'border-brand-orange/40 ring-brand-orange/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-orange/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Open Disputes</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-orange-deep">{stats.open_count}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Under review</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 shadow-sm shadow-brand-orange/10">
                  <Clock className="h-5 w-5 text-brand-orange-deep" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('resolved')}
              className={`text-left rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'resolved' ? 'border-brand-teal/40 ring-brand-teal/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-teal/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Resolved</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-teal">{stats.resolved_count}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Completed disputes</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                  <CheckCircle2 className="h-5 w-5 text-brand-teal" />
                </span>
              </div>
            </button>
          </div>
        )}

        {pageView === 'list' && (
          <>
            {/* Back to overview */}
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                onClick={() => setPageView('cards')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to overview
              </button>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {statusFilter === 'open' && 'Showing open disputes'}
                {statusFilter === 'resolved' && 'Showing resolved disputes'}
                {statusFilter === 'all' && 'Showing all disputes'}
              </span>
            </div>

        {/* Filters Section */}
        <div className="mb-6 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Filter className="h-3.5 w-3.5 text-brand-blue" />
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-blue/[0.06] px-3 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10 transition-colors hover:bg-brand-blue/[0.12]"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search disputes"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 pr-9 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            </div>

            {/* Start Date */}
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                placeholder="From date"
              />
            </div>

            {/* End Date */}
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                placeholder="To date"
              />
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 ring-1 ring-red-100">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && <TableSkeleton rows={6} columns={6} />}

        {/* Empty State */}
        {!loading && !error && filteredDisputes.length === 0 && (
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-teal/10 ring-1 ring-brand-teal/15">
              <Shield className="h-7 w-7 text-brand-teal" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50">No Disputes</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-slate-500">
              {hasActiveFilters
                ? 'No disputes match your filter criteria. Try adjusting your filters.'
                : 'Great news! You have no payment disputes. Disputes will appear here if any payment issues are raised.'}
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
              <div className="mx-auto mt-6 flex max-w-md items-start gap-3 rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.05] px-4 py-3 text-left">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/15 text-brand-cyan">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <p className="text-sm text-gray-700 dark:text-slate-300">
                  <span className="font-semibold text-gray-900 dark:text-slate-50">Need help?</span> If you have concerns about a payment, please contact our support team.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Disputes Table */}
        {!loading && !error && filteredDisputes.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Disputes</h2>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  Showing {filteredDisputes.length} dispute{filteredDisputes.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ` (filtered from ${disputes.length})`}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                  <tr className="text-left">
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[160px]">Dispute #</th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[110px]">Date</th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[150px]">Original Invoice</th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[180px]">Reason</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[110px]">Amount</th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[120px]">Status</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500 w-[140px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {paginatedDisputes.map((dispute) => (
                    <tr key={dispute.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10 ring-1 ring-brand-orange/15">
                            <AlertTriangle className="h-4 w-4 text-brand-orange-deep" />
                          </span>
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50" title={dispute.invoice_number || ''}>
                            {dispute.invoice_number || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700 dark:text-slate-300">
                        {formatISTDate(dispute.issue_date)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="truncate font-mono text-sm text-gray-900 dark:text-slate-50" title={dispute.metadata?.original_invoice_number || ''}>
                          {dispute.metadata?.original_invoice_number || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="truncate text-sm text-gray-600 dark:text-slate-400" title={dispute.metadata?.reason || dispute.reason || dispute.line_items?.[0]?.description || ''}>
                          {dispute.metadata?.reason || dispute.reason || dispute.line_items?.[0]?.description || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-brand-orange-deep">
                          {formatAmount(dispute.total_amount_inr || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusStyles(dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || 'unknown')}`}>
                          {getStatusIcon(dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || 'unknown')}
                          {dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedDispute(dispute)}
                            className="inline-flex items-center gap-1 rounded-lg border border-brand-blue/15 bg-brand-blue/[0.04] px-2.5 py-1.5 text-xs font-medium text-brand-blue transition-all hover:-translate-y-0.5 hover:bg-brand-blue/[0.08]"
                            aria-label="View Details" title="View Details"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadDispute(dispute)}
                            disabled={downloadingId === dispute.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 transition-[border-color,box-shadow,color,background-color] hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue disabled:opacity-50"
                            aria-label="Download Record" title="Download Record"
                          >
                            {downloadingId === dispute.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          </button>
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

        {/* Dispute Detail Modal */}
        {selectedDispute && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
              <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <AlertTriangle className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">Dispute Details</h2>
                      <p className="mt-0.5 font-mono text-sm text-white/75">{selectedDispute.invoice_number}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="max-h-[calc(90vh-92px)] space-y-5 overflow-y-auto p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Issue Date</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedDispute.issue_date)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Deadline</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedDispute.metadata?.deadline || selectedDispute.deadline || null)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Dispute Status</p>
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusStyles(selectedDispute.metadata?.dispute_status || selectedDispute.dispute_status || selectedDispute.status)}`}>
                      {getStatusIcon(selectedDispute.metadata?.dispute_status || selectedDispute.dispute_status || selectedDispute.status)}
                      {selectedDispute.metadata?.dispute_status || selectedDispute.dispute_status || selectedDispute.status}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Original Invoice</p>
                    <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-900 dark:text-slate-50">{selectedDispute.metadata?.original_invoice_number || '-'}</p>
                  </div>
                  {selectedDispute.payment_method && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Payment Method</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-gray-900 dark:text-slate-50">{selectedDispute.payment_method}</p>
                    </div>
                  )}
                  {selectedDispute.paid_at && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Paid At</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedDispute.paid_at)}</p>
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500">Dispute Details</p>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Description</span>
                      <span className="text-right text-sm font-medium text-gray-900 dark:text-slate-50">{selectedDispute.line_items?.[0]?.description || '-'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Reason</span>
                      <span className="text-right text-sm font-medium text-gray-900 dark:text-slate-50">{selectedDispute.metadata?.reason || selectedDispute.reason || '-'}</span>
                    </div>
                    {(selectedDispute.metadata?.customer_claim || selectedDispute.customer_claim) && (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Customer Claim</span>
                        <span className="max-w-xs text-right text-sm font-medium text-gray-900 dark:text-slate-50">{selectedDispute.metadata?.customer_claim || selectedDispute.customer_claim}</span>
                      </div>
                    )}
                    {selectedDispute.metadata?.bank_reference && (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Bank Reference</span>
                        <span className="break-all text-right font-mono text-sm font-medium text-gray-900 dark:text-slate-50">{selectedDispute.metadata.bank_reference}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-brand-orange p-4 text-white shadow-md shadow-brand-orange/20 ring-1 ring-white/10">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-3xl" />
                  <div className="relative flex items-center justify-between">
                    <span className="text-base font-semibold">Disputed Amount</span>
                    <span className="text-2xl font-bold">
                      {formatAmount(selectedDispute.total_amount_inr || 0)}
                    </span>
                  </div>
                </div>

                {selectedDispute.metadata?.razorpay_dispute_id && (
                  <div className="rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.05] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-cyan">Razorpay Dispute ID</p>
                    <p className="mt-1 break-all font-mono text-sm text-gray-900 dark:text-slate-50">{selectedDispute.metadata.razorpay_dispute_id}</p>
                  </div>
                )}

                <div className="flex items-start gap-3 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4 ring-1 ring-brand-orange/10">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-brand-orange-deep">Need Assistance?</p>
                    <p className="mt-0.5 text-sm text-gray-700 dark:text-slate-300">
                      If you have questions about this dispute, please contact our support team for assistance.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
                  <button
                    onClick={() => handleDownloadDispute(selectedDispute)}
                    disabled={downloadingId === selectedDispute.id}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {downloadingId === selectedDispute.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF...</>
                    ) : (
                      <><Download className="h-4 w-4" /> Download Record</>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
                  >
                    Close
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
