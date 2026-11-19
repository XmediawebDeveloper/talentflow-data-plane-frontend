'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Shield, Search, Clock, CheckCircle2, XCircle, AlertCircle, Download, ExternalLink, RefreshCw, Plus, Copy } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { handleUnauthorized, getAccessToken } from '@/lib/services/api';
import { toast } from 'sonner';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { useAuth } from '@/lib/hooks/useAuth';
import ListPagination from '@/components/ListPagination';
import { RowActions } from '@/components/subscription/RowActionsMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import AppModal from '@/components/ui/app-modal';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { DateField } from '@/components/ui/date-field';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import FileDisputeModal, { type DisputeStateByRecord } from '@/components/subscription/unit-disputes/FileDisputeModal';
import {
  DisputeRecordSummary,
  ErrorOriginBadge,
  UnitTypeIcon,
  reasonLabel,
  unitLabel,
  type DisputeRecord,
} from '@/components/subscription/unit-disputes/disputeRecord';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// --- Types ---

type DisputeStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

interface UnitDispute {
  id: string;
  tenant_id: string;
  consumption_log_id?: string;
  unit_type: string;
  units_to_refund: number;
  reason: string;
  description?: string;
  status: DisputeStatus;
  requested_by_name: string | null;
  requested_by_email: string | null;
  resolution_notes?: string | null;
  units_restored: number | null;
  resolved_by_email?: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at?: string;
  /** What the disputed unit was spent on, added by our API (null for very old records). */
  record?: DisputeRecord | null;
}

// --- Constants ---

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'PENDING_REVIEW', label: 'Under review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Not approved' },
  { value: 'resolved', label: 'Decided (approved or not)' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'AIU', label: 'AI Interview' },
  { value: 'AS', label: 'Assessment' },
  { value: 'RS', label: 'Resume Scoring' },
];

const ORIGIN_EXPORT_LABEL: Record<string, string> = {
  SYSTEM: 'Platform error',
  TENANT: 'Candidate side',
  NONE: 'No error',
  UNKNOWN: 'Not recorded',
};

const EXPORT_HEADERS = [
  'Filed On', 'Type', 'Candidate', 'Candidate Email', 'Candidate ID', 'Job / Assessment', 'What Happened', 'Error Came From',
  'Units Requested', 'Reason', 'Description', 'Status', 'Units Returned', 'Reviewed On', 'Review Notes',
];

const DISPUTES_PAGE_SIZE = 100;

/** Short, shareable reference for support — not the raw ID. */
const shortRef = (id: string) => (id || '').replace(/-/g, '').slice(0, 8).toUpperCase();

const statusLabel = (status: string) =>
  status === 'PENDING_REVIEW' ? 'Under review' : status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Not approved' : status;

const statusVariant = (status: string): 'success' | 'warning' | 'destructive' | 'muted' =>
  status === 'APPROVED' ? 'success' : status === 'PENDING_REVIEW' ? 'warning' : status === 'REJECTED' ? 'destructive' : 'muted';

const StatusIcon = ({ status }: { status: string }) =>
  status === 'APPROVED' ? <CheckCircle2 className="h-3.5 w-3.5" />
    : status === 'PENDING_REVIEW' ? <Clock className="h-3.5 w-3.5" />
      : status === 'REJECTED' ? <XCircle className="h-3.5 w-3.5" />
        : <AlertCircle className="h-3.5 w-3.5" />;

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusVariant(status)}>
      <StatusIcon status={status} />
      {statusLabel(status)}
    </Badge>
  );
}

const formatDate = (v: string | null | undefined) => formatISTDate(v ?? undefined);
const formatDateTime = (v: string | null | undefined) => formatIST(v ?? undefined);

/** "Arun · ai developer" — falls back to the unit name for old records. */
const itemTitle = (d: UnitDispute) => {
  const r = d.record;
  return `${r?.unit_label || unitLabel(d.unit_type)}${r?.candidate_name ? ` · ${r.candidate_name}` : ''}`;
};

/** "arun@x.com · CID-0013" — whichever is known. */
const candidateLine = (d: UnitDispute) =>
  [d.record?.candidate_email, d.record?.candidate_cid].filter(Boolean).join(' · ');

// --- Component ---

/**
 * The Unit Disputes screen, shared by Subscription → Unit Disputes (full page)
 * and the Support Center's "Unit Disputes" tab (`embedded`: no page shell or
 * breadcrumb — the host page owns those).
 */
export default function UnitDisputesView({ embedded = false }: { embedded?: boolean }) {
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
  const [showFileModal, setShowFileModal] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Two-step view: 'cards' shows only the stat tiles; 'list' shows filters + table.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const openListView = (filter: string) => {
    setStatusFilter(filter);
    setPageView('list');
  };

  const persistKey = embedded ? 'support-unit-disputes' : 'sub-unit-disputes';
  const rootRef = useScrollRestoration<HTMLElement>(persistKey, !loading, [pageView]);
  useListStatePersistence(
    persistKey,
    { pageView, statusFilter, typeFilter, searchQuery, startDate, endDate, currentPage, itemsPerPage },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.statusFilter === 'string') setStatusFilter(s.statusFilter);
      if (typeof s.typeFilter === 'string') setTypeFilter(s.typeFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.startDate === 'string') setStartDate(s.startDate);
      if (typeof s.endDate === 'string') setEndDate(s.endDate);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  const getAuthHeaders = useCallback(() => {
    const token = getAccessToken();
    if (!token) return null;
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      if (!headers) {
        setError('Please sign in again.');
        return;
      }
      /* Page through every dispute (stat cards and filters work on the full set).
         A short page, the server's `total`, or a page with nothing new ends the walk. */
      const all: UnitDispute[] = [];
      const seen = new Set<string>();
      for (let offset = 0; ; offset += DISPUTES_PAGE_SIZE) {
        const response = await fetch(`${API_URL}/disputes?limit=${DISPUTES_PAGE_SIZE}&offset=${offset}`, { headers });
        if (response.status === 401) { handleUnauthorized(); return; }
        if (response.status === 403) { setError("You don't have permission to view unit disputes."); return; }
        if (!response.ok) throw new Error('Failed to fetch disputes');
        const result = await response.json();
        const page: UnitDispute[] = result.data?.disputes || result.data?.items || [];
        const fresh = page.filter(d => !seen.has(d.id));
        fresh.forEach(d => { seen.add(d.id); all.push(d); });
        const total = typeof result.data?.total === 'number' ? result.data.total : null;
        if (page.length < DISPUTES_PAGE_SIZE || fresh.length === 0 || (total !== null && all.length >= total)) break;
      }
      setDisputes(all);
    } catch (err) {
      console.error('[UnitDisputes] Error:', err);
      setError("We couldn't load your disputes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, typeFilter, startDate, endDate]);

  // --- Computed ---

  const stats = useMemo(() => ({
    total: disputes.length,
    pending: disputes.filter(d => d.status === 'PENDING_REVIEW').length,
    resolved: disputes.filter(d => d.status === 'APPROVED' || d.status === 'REJECTED').length,
  }), [disputes]);

  // Records with an open or approved dispute — the API refuses another one.
  // A record whose disputes were all rejected can be disputed again.
  const disputeStateByRecord: DisputeStateByRecord = useMemo(() => {
    const m: DisputeStateByRecord = new Map();
    for (const d of disputes) {
      if (!d.consumption_log_id) continue;
      if (d.status === 'APPROVED') m.set(d.consumption_log_id, 'APPROVED');
      else if (d.status === 'PENDING_REVIEW' && m.get(d.consumption_log_id) !== 'APPROVED') m.set(d.consumption_log_id, 'PENDING_REVIEW');
    }
    return m;
  }, [disputes]);

  const filteredDisputes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return disputes.filter(d => {
      const r = d.record;
      const matchesSearch = q === '' || [
        r?.candidate_name, r?.candidate_email, r?.candidate_cid, r?.title, r?.unit_label, unitLabel(d.unit_type),
        reasonLabel(d.reason || ''), d.description, shortRef(d.id),
      ].some(v => (v || '').toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all'
        || d.status === statusFilter
        || (statusFilter === 'resolved' && (d.status === 'APPROVED' || d.status === 'REJECTED'));
      const matchesType = typeFilter === 'all' || d.unit_type === typeFilter;

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
      return matchesSearch && matchesStatus && matchesType && matchesDate;
    });
  }, [disputes, searchQuery, statusFilter, typeFilter, startDate, endDate]);

  const paginatedDisputes = useMemo(
    () => filteredDisputes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filteredDisputes, currentPage, itemsPerPage],
  );

  // --- Actions ---

  const copyRef = (id: string) => {
    navigator.clipboard.writeText(shortRef(id)).then(() => toast.success('Reference copied'));
  };

  const handleExport = async (format: ExportFileFormat) => {
    const rows = filteredDisputes.map(d => [
      formatDate(d.created_at),
      d.record?.unit_label || unitLabel(d.unit_type),
      d.record?.candidate_name || '',
      d.record?.candidate_email || '',
      d.record?.candidate_cid || '',
      d.record?.title || '',
      d.record?.outcome || '',
      d.record ? ORIGIN_EXPORT_LABEL[d.record.error_origin] || '' : '',
      String(d.units_to_refund),
      reasonLabel(d.reason),
      d.description || '',
      statusLabel(d.status),
      d.units_restored ? String(d.units_restored) : '',
      d.resolved_at ? formatDate(d.resolved_at) : '',
      d.resolution_notes || '',
    ]);
    await exportRows(format, EXPORT_HEADERS, rows, `unit-disputes-${new Date().toISOString().split('T')[0]}`, {
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
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = !!(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || startDate || endDate);
  const formatChipDate = (v: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const activeFilterChips: FilterChip[] = [
    statusFilter !== 'all' && {
      key: 'status', label: 'Status',
      value: STATUS_OPTIONS.find(o => o.value === statusFilter)?.label ?? statusFilter,
      onRemove: () => setStatusFilter('all'),
    },
    typeFilter !== 'all' && {
      key: 'type', label: 'Type',
      value: TYPE_OPTIONS.find(o => o.value === typeFilter)?.label ?? typeFilter,
      onRemove: () => setTypeFilter('all'),
    },
    (startDate || endDate) && {
      key: 'date', label: 'Filed',
      value: startDate && endDate
        ? `${formatChipDate(startDate)} – ${formatChipDate(endDate)}`
        : startDate ? `From ${formatChipDate(startDate)}` : `Until ${formatChipDate(endDate)}`,
      onRemove: () => { setStartDate(''); setEndDate(''); },
    },
  ].filter(Boolean) as FilterChip[];

  /** Consumed → what happened to the units asked back: Returned / Rejected / Pending. */
  const unitsCell = (d: UnitDispute) => {
    const consumed = d.record?.units_consumed ?? d.units_to_refund;
    const asked = d.units_to_refund;
    const result =
      d.status === 'APPROVED'
        ? { label: 'Returned', value: d.units_restored || asked, cls: 'text-success-strong' }
        : d.status === 'REJECTED'
          ? { label: 'Rejected', value: asked, cls: 'text-destructive' }
          : { label: 'Pending', value: asked, cls: 'text-warning-strong' };
    return (
      <dl className="inline-grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-xs tabular-nums">
        <dt className="text-gray-500 dark:text-slate-400">Consumed</dt>
        <dd className="text-right font-semibold text-gray-800 dark:text-slate-200">{consumed}</dd>
        {asked !== consumed && (
          <>
            <dt className="text-gray-500 dark:text-slate-400">Asked back</dt>
            <dd className="text-right font-semibold text-gray-800 dark:text-slate-200">{asked}</dd>
          </>
        )}
        <dt className={result.cls}>{result.label}</dt>
        <dd className={`text-right font-semibold ${result.cls}`}>{result.value}</dd>
      </dl>
    );
  };

  /** Date with the time underneath. */
  const filedOnCell = (d: UnitDispute) => (
    <span className="whitespace-nowrap">
      <span className="block tf-body">{formatDate(d.created_at)}</span>
      <span className="block tf-meta">{formatISTTime(d.created_at)}</span>
    </span>
  );

  const viewAction = (d: UnitDispute) => (
    <RowActions
      menuLabel="Dispute actions"
      actions={[{ key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedDispute(d) }]}
    />
  );

  const statCard = (
    filter: string, label: string, value: number, hint: string,
    tone: { text: string; bg: string; ring: string; border: string }, Icon: typeof Shield,
  ) => (
    <button
      type="button"
      onClick={() => openListView(filter)}
      className={`h-full rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 text-left shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${
        pageView === 'list' && statusFilter === filter ? `${tone.border} ${tone.ring}` : 'border-gray-100 dark:border-slate-700/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tf-eyebrow tracking-wider">{label}</p>
          {loading
            ? <Skeleton className="mt-2 h-8 w-12" />
            : <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${tone.text}`}>{value}</p>}
          <p className="mt-1 tf-meta">{hint}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tone.bg}`}>
          <Icon className={`h-5 w-5 ${tone.text}`} />
        </span>
      </div>
    </button>
  );

  // --- Render ---

  const body = (
      <>
        <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {embedded
            ? <h2 className="min-w-0 tf-section-title">Unit Disputes</h2>
            : <h1 className="min-w-0 tf-page-title">Unit Disputes</h1>}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => { if (canExportDisputes) setShowExportModal(true); }}
              disabled={loading || filteredDisputes.length === 0 || !canExportDisputes}
              title={!canExportDisputes ? "You don't have permission to export disputes" : ''}
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
              onClick={() => { if (canFileDispute) setShowFileModal(true); }}
              aria-disabled={!canFileDispute}
              title={!canFileDispute ? "You don't have permission to file disputes" : ''}
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
        <p className="mt-1 max-w-3xl tf-body-muted">
          Ask for units back when an interview, assessment or scoring failed because of a platform problem. Each request is reviewed within 2&ndash;3 business days.
        </p>
        </div>

        {/* Stat cards — clicking one opens the list with that filter */}
        <div className="tf-grid-3 mb-5">
          {statCard('all', 'All Disputes', stats.total, 'Since you started',
            { text: 'text-brand-blue', bg: 'bg-brand-blue/10 ring-brand-blue/15', ring: 'ring-brand-blue/20', border: 'border-brand-blue/40' }, Shield)}
          {statCard('PENDING_REVIEW', 'Under Review', stats.pending, 'Waiting for a decision',
            { text: 'text-brand-orange-deep', bg: 'bg-brand-orange/10 ring-brand-orange/20', ring: 'ring-brand-orange/20', border: 'border-brand-orange/40' }, Clock)}
          {statCard('resolved', 'Decided', stats.resolved, 'Approved or not approved',
            { text: 'text-brand-teal', bg: 'bg-brand-teal/10 ring-brand-teal/15', ring: 'ring-brand-teal/20', border: 'border-brand-teal/40' }, CheckCircle2)}
        </div>

        {pageView === 'list' && (
          <>
        {/* Filters */}
        <div className="tf-card-soft mb-6 p-4 sm:p-5">
          {/* 1 col on phones, 2 on tablets, 3 on laptops / zoomed-in, all 5 in one row on wide screens */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search candidate, email, CID, job"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="tf-input pl-9 pr-3"
              />
            </div>
            <FilterSelect
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              ariaLabel="Filter by status"
              options={STATUS_OPTIONS}
              className="w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
            />
            <FilterSelect
              value={typeFilter}
              onChange={v => setTypeFilter(v)}
              ariaLabel="Filter by type"
              options={TYPE_OPTIONS}
              className="w-full sm:w-full pl-3 sm:pl-3 pr-3 sm:pr-3 py-2.5 sm:py-2.5 rounded-lg sm:rounded-lg"
            />
            <DateField aria-label="Filed from" value={startDate} onChange={setStartDate} />
            <DateField aria-label="Filed until" value={endDate} onChange={setEndDate} />
          </div>
          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilterChips.length > 0 && <FilterChips chips={activeFilterChips} />}
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-blue/[0.06] px-3 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10 transition-colors hover:bg-brand-blue/[0.12]"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Loading — mirrors the table columns */}
        {loading && (
          <div className="tf-panel overflow-hidden">
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, r) => (
                <div key={r} className="grid grid-cols-[minmax(220px,2fr)_110px_150px_130px_80px_130px_80px] items-center gap-4 px-4 py-4">
                  <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-xl" /><div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="ml-auto h-4 w-6" />
                  <Skeleton className="mx-auto h-6 w-24 rounded-full" />
                  <Skeleton className="ml-auto h-7 w-14 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && filteredDisputes.length === 0 && (
          <div className="tf-card-soft p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Shield className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="tf-section-title">No disputes</h3>
            <p className="mx-auto mt-1 max-w-md tf-body-muted">
              {hasActiveFilters
                ? 'Nothing matches these filters. Try changing them.'
                : "You haven't asked for any units back. If an interview, assessment or scoring failed because of a platform problem, you can file a dispute."}
            </p>
            {hasActiveFilters ? (
              <button onClick={clearFilters}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] px-4 py-2 text-sm font-medium text-brand-blue transition-all hover:bg-brand-blue/[0.08]">
                Clear all filters
              </button>
            ) : (
              <button
                onClick={() => { if (canFileDispute) setShowFileModal(true); }}
                aria-disabled={!canFileDispute}
                title={!canFileDispute ? "You don't have permission to file disputes" : ''}
                className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-md transition-all ${
                  canFileDispute ? 'bg-brand-blue text-white shadow-brand-blue/25 hover:-translate-y-0.5 hover:shadow-lg' : 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed opacity-60'
                }`}
              >
                <Plus className="h-4 w-4" />
                File a Dispute
              </button>
            )}
          </div>
        )}

        {!loading && !error && filteredDisputes.length > 0 && (
          <div className="tf-card-soft overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6">
              <div>
                <h2 className="tf-row-title">Disputes</h2>
                <p className="tf-meta">
                  Showing {filteredDisputes.length} dispute{filteredDisputes.length !== 1 ? 's' : ''}
                  {hasActiveFilters && ` (of ${disputes.length})`}
                </p>
              </div>
            </div>
            <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full min-w-[900px]">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="tf-th-cell tf-th w-[34%] min-w-[260px]"><span className="pl-12">Disputed item</span></th>
                    <th className="tf-th-cell tf-th w-[120px]">Filed on</th>
                    <th className="tf-th-cell tf-th">Reason</th>
                    <th className="tf-th-cell tf-th w-[140px]" title="From the activity log">Error came from</th>
                    <th className="tf-th-cell text-right tf-th w-[130px]">Units</th>
                    <th className="tf-th-cell text-center tf-th w-[140px]">Status</th>
                    <th className="tf-th-cell text-right tf-th w-[90px] tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {paginatedDisputes.map(d => (
                    <tr key={d.id} className="transition-colors hover:bg-brand-blue/[0.02]">
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-3">
                          <UnitTypeIcon unitType={d.unit_type} />
                          <div className="min-w-0">
                            <p className="truncate tf-row-title" title={itemTitle(d)}>{itemTitle(d)}</p>
                            {candidateLine(d) && <p className="truncate tf-meta" title={candidateLine(d)}>{candidateLine(d)}</p>}
                            <p className="truncate tf-meta" title={d.record?.title || ''}>
                              {d.record?.title || 'Details not available'}
                              {d.record?.consumed_at ? ` · used ${formatDate(d.record.consumed_at)}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="tf-td">{filedOnCell(d)}</td>
                      <td className="tf-td"><span className="block truncate tf-body-secondary">{reasonLabel(d.reason)}</span></td>
                      <td className="tf-td">{d.record ? <ErrorOriginBadge origin={d.record.error_origin} /> : <span className="tf-meta">—</span>}</td>
                      <td className="tf-td text-right">{unitsCell(d)}</td>
                      <td className="tf-td text-center"><StatusBadge status={d.status} /></td>
                      <td className="tf-td text-right tf-sticky-col">{viewAction(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MobileRecordList>
              {paginatedDisputes.map(d => (
                <MobileRecordCard
                  key={d.id}
                  badges={
                    <>
                      <StatusBadge status={d.status} />
                      {d.record && <ErrorOriginBadge origin={d.record.error_origin} />}
                    </>
                  }
                  title={<span className="inline-flex min-w-0 items-center gap-2"><UnitTypeIcon unitType={d.unit_type} className="h-7 w-7" /><span className="truncate">{itemTitle(d)}</span></span>}
                  actions={viewAction(d)}
                  fields={[
                    ...(candidateLine(d) ? [{ label: 'Candidate', value: candidateLine(d) }] : []),
                    { label: 'For', value: d.record?.title || '—' },
                    { label: 'Filed on', value: formatDateTime(d.created_at) },
                    { label: 'Reason', value: reasonLabel(d.reason) },
                    { label: 'Units', value: unitsCell(d) },
                  ]}
                />
              ))}
            </MobileRecordList>
          </div>
        )}

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

        {/* Dispute details (read-only) */}
        <AppModal
          open={!!selectedDispute}
          onCancel={() => setSelectedDispute(null)}
          size="md"
          closeButton
          mobileSheet
          icon={<Shield className="h-5 w-5" />}
          title="Dispute details"
          subtitle={selectedDispute ? `${itemTitle(selectedDispute)} · filed ${formatDate(selectedDispute.created_at)}` : undefined}
        >
          {selectedDispute && (
            <div className="space-y-5">
              <DecisionBanner dispute={selectedDispute} />

              {selectedDispute.record ? (
                <DisputeRecordSummary record={selectedDispute.record} title="What was disputed" />
              ) : (
                <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 px-4 py-3 tf-body-secondary">
                  {unitLabel(selectedDispute.unit_type)} · {selectedDispute.units_to_refund} unit{selectedDispute.units_to_refund === 1 ? '' : 's'}.
                  The session details for this older record are no longer available.
                </div>
              )}

              <section className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60">
                <header className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Your request</p>
                </header>
                <dl className="divide-y divide-gray-100 dark:divide-slate-700/60 px-4 py-1.5">
                  <DetailRow label="Reason">{reasonLabel(selectedDispute.reason)}</DetailRow>
                  <DetailRow label="Units asked for">{selectedDispute.units_to_refund}</DetailRow>
                  <DetailRow label="Filed by">
                    {selectedDispute.requested_by_name || '—'}
                    {selectedDispute.requested_by_email && <span className="block tf-meta">{selectedDispute.requested_by_email}</span>}
                  </DetailRow>
                  <DetailRow label="Filed on">{formatDateTime(selectedDispute.created_at)}</DetailRow>
                </dl>
                {selectedDispute.description && (
                  <p className="mx-4 mb-4 whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 tf-body ring-1 ring-gray-100 dark:ring-slate-700/60">
                    {selectedDispute.description}
                  </p>
                )}
              </section>

              <div className="flex items-center justify-between gap-3 tf-meta">
                <span>Reference <span className="font-mono">{shortRef(selectedDispute.id)}</span> — quote this if you contact support</span>
                <button
                  onClick={() => copyRef(selectedDispute.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-brand-blue/[0.06] hover:text-brand-blue"
                  aria-label="Copy reference" title="Copy reference"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </AppModal>

        <FileDisputeModal
          open={showFileModal}
          onClose={() => setShowFileModal(false)}
          onSubmitted={() => { setShowFileModal(false); fetchDisputes(); }}
          disputeStateByRecord={disputeStateByRecord}
        />
      </>
  );

  if (embedded) return <section ref={rootRef}>{body}</section>;

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Unit Disputes' }]} />
        {body}
      </div>
      </div>
    </main>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 tf-body-secondary">{label}</dt>
      <dd className="min-w-0 text-right tf-row-name break-words">{children}</dd>
    </div>
  );
}

/** The decision in one sentence, with the reviewer's note. */
function DecisionBanner({ dispute }: { dispute: UnitDispute }) {
  const restored = dispute.units_restored ?? 0;
  const label = dispute.record?.unit_label || unitLabel(dispute.unit_type);
  const text =
    dispute.status === 'APPROVED'
      ? `Approved — ${restored || dispute.units_to_refund} ${label} unit${(restored || dispute.units_to_refund) === 1 ? '' : 's'} returned to your balance${dispute.resolved_at ? ` on ${formatDate(dispute.resolved_at)}` : ''}.`
      : dispute.status === 'REJECTED'
        ? `Not approved${dispute.resolved_at ? ` on ${formatDate(dispute.resolved_at)}` : ''}. No units were returned.`
        : "Under review — we'll decide within 2–3 business days.";
  const tone =
    dispute.status === 'APPROVED' ? 'border-success-line bg-success-subtle/60 text-success-strong'
      : dispute.status === 'REJECTED' ? 'border-destructive-line bg-destructive-subtle/60 text-destructive'
        : 'border-warning-line bg-warning-subtle/60 text-warning-strong';
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="flex items-center gap-2 text-sm font-semibold"><StatusIcon status={dispute.status} />{text}</p>
      {dispute.resolution_notes && (
        <p className="mt-1.5 text-sm opacity-90"><span className="font-medium">Review note:</span> {dispute.resolution_notes}</p>
      )}
    </div>
  );
}
