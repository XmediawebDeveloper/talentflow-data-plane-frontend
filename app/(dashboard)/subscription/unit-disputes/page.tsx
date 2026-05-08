'use client';

import { Shield, Search, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Download, ExternalLink, RefreshCw, Filter, Calendar, Plus, Copy, ChevronRight, ChevronLeft, X, Sparkles, ChevronDown, ArrowUpRight } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { toast } from 'sonner';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { useAuth } from '@/lib/hooks/useAuth';
import ListPagination from '@/components/ListPagination';
import { TableSkeleton } from '@/components/ui/skeleton';

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
];

const REASON_OPTIONS = [
  { value: 'SYSTEM_ERROR', label: 'System Error' },
  { value: 'TECHNICAL_FAILURE', label: 'Technical Failure' },
  { value: 'BILLING_ERROR', label: 'Billing Error' },
  { value: 'INTERRUPTED', label: 'Interrupted' },
];

const UNIT_TYPE_LABELS: Record<string, string> = {
  RU: 'Resume Upload',
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
  max_seats: 'Max Users',
};

// --- Component ---

export default function UnitDisputesPage() {
  const { hasPermission } = useAuth();
  const canExportDisputes = hasPermission('canExportUsage');
  const canFileDispute = hasPermission('canUpgradePlan');
  const [loading, setLoading] = useState(true);
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

  // Pagination state for the main disputes list
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

      const response = await fetch(`${API_URL}/disputes?limit=100&offset=0`, { headers });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch disputes');

      const result = await response.json();
      setDisputes(result.data?.disputes || result.data?.items || []);
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

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const detail = errData?.detail || '';
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
      toast.error(err instanceof Error ? err.message : 'Failed to submit dispute');
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

  const filteredDisputes = useMemo(() => {
    return disputes.filter(d => {
      const matchesSearch = searchQuery === '' ||
        d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;

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
      case 'APPROVED': return <CheckCircle2 className="h-3.5 w-3.5 text-brand-teal" />;
      case 'PENDING_REVIEW': return <Clock className="h-3.5 w-3.5 text-amber-600" />;
      case 'REJECTED': return <XCircle className="h-3.5 w-3.5 text-red-600" />;
      default: return <AlertCircle className="h-3.5 w-3.5 text-gray-500" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20';
      case 'PENDING_REVIEW': return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
      case 'REJECTED': return 'bg-red-100 text-red-700 ring-1 ring-red-200';
      default: return 'bg-gray-100 text-gray-700 ring-1 ring-gray-200';
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
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[unitType] || 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'}`}>
        {unitType}
      </span>
    );
  };

  const getReasonLabel = (reason: string) => {
    return REASON_OPTIONS.find(r => r.value === reason)?.label || reason;
  };

  const handleExportCSV = () => {
    const csvHeaders = ['Dispute ID', 'Date', 'Unit Type', 'Units Requested', 'Reason', 'Description', 'Status', 'Units Restored', 'Resolved At'];
    const csvRows = filteredDisputes.map(d => [
      d.id,
      formatDate(d.created_at),
      d.unit_type,
      d.units_to_refund.toString(),
      getReasonLabel(d.reason),
      d.description,
      getStatusLabel(d.status),
      d.units_restored?.toString() || '',
      d.resolved_at ? formatDate(d.resolved_at) : '',
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unit-disputes-${new Date().toISOString().split('T')[0]}.csv`;
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

  // --- Render ---

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50">
      <div className="w-full max-w-[1400px] mx-auto p-4 md:p-8">
        {/* SaaS Hero Header */}
        <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-4 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-brand-orange" />
                Unit refund requests
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                  <Shield className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Unit Consumption Disputes</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
                    File refund requests for units consumed in error and track the review status. Each request is reviewed within 2&ndash;3 business days.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canExportDisputes && (
                <button
                  onClick={handleExportCSV}
                  disabled={loading || filteredDisputes.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15 disabled:translate-y-0 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              )}
              <button
                onClick={fetchDisputes}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15 disabled:translate-y-0 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              {canFileDispute && (
                <button
                  onClick={openFileModal}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  File Dispute
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Total Disputes</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-blue">{stats.total}</p>
                <p className="mt-1 text-xs text-gray-500">All time</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                <Shield className="h-5 w-5 text-brand-blue" />
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Pending Review</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-orange-deep">{stats.pending}</p>
                <p className="mt-1 text-xs text-gray-500">Awaiting decision</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/20 shadow-sm shadow-brand-orange/10">
                <Clock className="h-5 w-5 text-brand-orange-deep" />
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Resolved</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-teal">{stats.resolved}</p>
                <p className="mt-1 text-xs text-gray-500">Approved or rejected</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                <CheckCircle2 className="h-5 w-5 text-brand-teal" />
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Filter className="h-3.5 w-3.5 text-brand-blue" />
            </span>
            <span className="text-sm font-semibold text-gray-900">Filters</span>
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID, reason, description"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm text-gray-900 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 ring-1 ring-red-100">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && <TableSkeleton rows={6} columns={5} />}

        {/* Empty */}
        {!loading && !error && filteredDisputes.length === 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Shield className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No Unit Disputes</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
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
            {!hasActiveFilters && canFileDispute && (
              <button
                onClick={openFileModal}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Plus className="h-4 w-4" />
                File a Dispute
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && !error && filteredDisputes.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Disputes</h2>
                <p className="text-xs text-gray-500">
                  Showing {filteredDisputes.length} dispute{filteredDisputes.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ` (filtered from ${disputes.length})`}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50/80">
                  <tr className="text-left">
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[160px]">Dispute ID</th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[110px]">Date</th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[90px]">Unit Type</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[90px]">Units</th>
                    <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[160px]">Reason</th>
                    <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[140px]">Status</th>
                    <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedDisputes.map((dispute) => (
                    <tr key={dispute.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-sm font-semibold text-gray-900" title={dispute.id}>
                            {truncateId(dispute.id)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(dispute.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                            aria-label="Copy full ID" title="Copy full ID"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700">
                        {formatDate(dispute.created_at)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {getUnitTypeBadge(dispute.unit_type)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-brand-blue">{dispute.units_to_refund}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="block truncate text-sm text-gray-600" title={dispute.reason}>
                          {getReasonLabel(dispute.reason)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusStyles(dispute.status)}`}>
                          {getStatusIcon(dispute.status)}
                          {getStatusLabel(dispute.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => setSelectedDispute(dispute)}
                          className="inline-flex items-center gap-1 rounded-lg border border-brand-blue/15 bg-brand-blue/[0.04] px-2.5 py-1.5 text-xs font-medium text-brand-blue transition-all hover:-translate-y-0.5 hover:bg-brand-blue/[0.08]"
                          aria-label="View Details" title="View Details"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </button>
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

        {/* Detail Modal */}
        {selectedDispute && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl ring-1 ring-black/5">
              <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Shield className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">Dispute Details</h2>
                      <p className="mt-0.5 font-mono text-sm text-white/75">{truncateId(selectedDispute.id)}</p>
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
                {/* Top info */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-gray-100">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Created</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{formatDateTime(selectedDispute.created_at)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-gray-100">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Unit Type</p>
                    <div className="mt-1">{getUnitTypeBadge(selectedDispute.unit_type)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-gray-100">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Status</p>
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusStyles(selectedDispute.status)}`}>
                      {getStatusIcon(selectedDispute.status)}
                      {getStatusLabel(selectedDispute.status)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-gray-100">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Consumption Log ID</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="break-all font-mono text-sm font-semibold text-gray-900">{truncateId(selectedDispute.consumption_log_id)}</p>
                      <button onClick={() => copyToClipboard(selectedDispute.consumption_log_id ?? '')} className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-brand-blue/[0.06] hover:text-brand-blue">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reason & Description */}
                <div className="overflow-hidden rounded-xl border border-gray-100 ring-1 ring-black/[0.02]">
                  <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Dispute Information</p>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm text-gray-600">Reason</span>
                      <span className="text-right text-sm font-medium text-gray-900">{getReasonLabel(selectedDispute.reason)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Description</span>
                      <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-gray-900 ring-1 ring-gray-100">{selectedDispute.description}</p>
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
                  <div className="overflow-hidden rounded-xl border border-gray-100 ring-1 ring-black/[0.02]">
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Resolution</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {selectedDispute.resolution_notes && (
                        <div>
                          <span className="text-sm text-gray-600">Notes</span>
                          <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-gray-900 ring-1 ring-gray-100">{selectedDispute.resolution_notes}</p>
                        </div>
                      )}
                      {selectedDispute.resolved_by_email && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-sm text-gray-600">Resolved By</span>
                          <span className="break-all text-right text-sm font-medium text-gray-900">{selectedDispute.resolved_by_email}</span>
                        </div>
                      )}
                      {selectedDispute.resolved_at && (
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-sm text-gray-600">Resolved At</span>
                          <span className="text-right text-sm font-medium text-gray-900">{formatDateTime(selectedDispute.resolved_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Requested By */}
                <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Requested By</p>
                  <p className="mt-1 text-sm text-gray-900">{selectedDispute.requested_by_name} <span className="text-gray-500">({selectedDispute.requested_by_email})</span></p>
                </div>

                <div className="flex pt-1">
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* File Dispute Modal */}
        {showFileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl ring-1 ring-black/5">
              <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Shield className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">File a Unit Dispute</h2>
                      <p className="mt-0.5 text-sm text-white/75">Step {fileStep} of 2 &middot; {fileStep === 1 ? 'Select consumption record' : 'Provide dispute details'}</p>
                    </div>
                  </div>
                  <button onClick={closeFileModal} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15" aria-label="Close">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Step indicator */}
                <div className="relative mt-4 flex items-center gap-2">
                  <div className={`h-1 flex-1 rounded-full ${fileStep >= 1 ? 'bg-white' : 'bg-white/20'}`} />
                  <div className={`h-1 flex-1 rounded-full ${fileStep >= 2 ? 'bg-white' : 'bg-white/20'}`} />
                </div>
              </div>

              <div className="max-h-[calc(90vh-128px)] overflow-y-auto p-5 sm:p-6">
                {/* Step 1: Select consumption log */}
                {fileStep === 1 && (
                  <>
                    <p className="mb-4 text-sm text-gray-600">Select the consumption record you want to dispute.</p>

                    {loadingLogs && (
                      <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                        <p className="mt-3 text-sm font-medium text-gray-600">Loading consumption history...</p>
                      </div>
                    )}

                    {!loadingLogs && consumptionLogs.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-10 text-center">
                        <Shield className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        <p className="text-sm text-gray-500">No consumption records found.</p>
                      </div>
                    )}

                    {!loadingLogs && consumptionLogs.length > 0 && (
                      <>
                        <div className="mb-4 space-y-2">
                          {consumptionLogs.map(log => (
                            <button
                              key={log.id}
                              onClick={() => {
                                setSelectedLog(log);
                                setDisputeUnits(log.units_consumed.toString());
                                setFileStep(2);
                              }}
                              className={`group w-full rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                                selectedLog?.id === log.id
                                  ? 'border-brand-blue/30 bg-brand-blue/[0.04] shadow-sm shadow-brand-blue/10'
                                  : 'border-gray-200 bg-white hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {getUnitTypeBadge(log.unit_type)}
                                  <span className="text-sm font-semibold text-gray-900">
                                    {log.units_consumed} unit{log.units_consumed !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                <span>{formatDateTime(log.created_at)}</span>
                                {log.entity_name && <span className="text-gray-400">·</span>}
                                {log.entity_name && <span>{log.entity_name}</span>}
                                {log.user_name && <span className="text-gray-400">·</span>}
                                {log.user_name && <span>{log.user_name}</span>}
                              </div>
                              <div className="mt-1 font-mono text-[11px] text-gray-400">{truncateId(log.id)}</div>
                            </button>
                          ))}
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                          <p className="text-xs text-gray-500">
                            {logTotal} total record{logTotal !== 1 ? 's' : ''}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => fetchConsumptionLogs(logPage - 1)}
                              disabled={logPage === 0}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-all hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-xs font-medium text-gray-600">
                              Page {logPage + 1} of {Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE))}
                            </span>
                            <button
                              onClick={() => fetchConsumptionLogs(logPage + 1)}
                              disabled={(logPage + 1) * LOG_PAGE_SIZE >= logTotal}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-all hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
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
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-blue">Selected Record</span>
                        <button
                          onClick={() => setFileStep(1)}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/15 transition-colors hover:bg-brand-blue/[0.06]"
                        >
                          Change
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {getUnitTypeBadge(selectedLog.unit_type)}
                        <span className="text-sm font-semibold text-gray-900">{selectedLog.units_consumed} units</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-500">{formatDateTime(selectedLog.created_at)}</span>
                      </div>
                    </div>

                    <div className="space-y-5">
                      {/* Reason */}
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Reason <span className="text-brand-orange">*</span></span>
                        <div className="relative">
                          <select
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-sm text-gray-900 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                          >
                            <option value="">Select a reason</option>
                            {REASON_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        </div>
                      </label>

                      {/* Description */}
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Description <span className="text-brand-orange">*</span></span>
                        <textarea
                          value={disputeDescription}
                          onChange={(e) => setDisputeDescription(e.target.value)}
                          placeholder="Describe the issue in detail (min 10 characters)"
                          rows={4}
                          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                        />
                        <p className="mt-1 text-xs text-gray-400">{disputeDescription.length}/1000 characters</p>
                      </label>

                      {/* Units */}
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-700">Units to Refund <span className="text-brand-orange">*</span></span>
                        <input
                          type="number"
                          value={disputeUnits}
                          onChange={(e) => setDisputeUnits(e.target.value)}
                          min={0.01}
                          max={selectedLog.units_consumed}
                          step={0.01}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                        />
                        <p className="mt-1 text-xs text-gray-400">Max: {selectedLog.units_consumed} units (total consumed)</p>
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                      <button
                        onClick={() => setFileStep(1)}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSubmitDispute}
                        disabled={submitting || !disputeReason || disputeDescription.length < 10 || !disputeUnits}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
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
    </main>
  );
}
