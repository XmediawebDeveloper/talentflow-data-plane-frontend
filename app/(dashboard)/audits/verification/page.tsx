'use client';

import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  Zap,
  XCircle,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuditVerification } from '@/lib/hooks/useAuditVerification';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import type { PendingVerification, VerificationStatus } from '@/lib/services/auditVerificationService';
import { formatIST } from '@/lib/utils/dateUtils';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips from '@/components/ui/filter-chips';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

const STATUS_CONFIG: Record<VerificationStatus, { label: string; color: string; icon: LucideIcon }> = {
  PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-700 border border-gray-200', icon: Clock },
  MATCH: { label: 'Match', color: 'bg-success-subtle text-success-strong border border-success-line', icon: CheckCircle2 },
  MISMATCH: { label: 'Mismatch', color: 'bg-destructive-subtle text-destructive-strong border border-destructive-line', icon: XCircle },
  NOT_FOUND: { label: 'Not Found', color: 'bg-warning-subtle text-warning-strong border border-warning-line', icon: AlertTriangle },
  ERROR: { label: 'Error', color: 'bg-destructive-subtle text-destructive-strong border border-destructive-line', icon: XCircle },
};

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function LogVerificationPage() {
  const {
    pending,
    isVerifying,
    progress,
    lastReport,
    verifyPending,
    retryNotFound,
    clearVerified,
    clearAll,
    refresh,
  } = useAuditVerification();
  const dialog = useGlobalDialog();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  // Drill-in: cards-first overview. Clicking a card opens the list pre-filtered
  // by that status (PENDING / MATCH / MISMATCH / NOT_FOUND).
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const openListView = (filter: string) => {
    setStatusFilter(filter);
    setPageView('list');
  };

  // Persist the cards<->list view, status filter and search + scroll position
  // so returning to this page restores exactly where the user left off. The
  // cards overview and the list differ a lot in height, so re-detect the scroll
  // container when pageView flips.
  const rootRef = useScrollRestoration<HTMLElement>('audits-verification', true, [pageView]);
  useListStatePersistence(
    'audits-verification',
    { pageView, statusFilter, searchQuery },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (typeof s.statusFilter === 'string') setStatusFilter(s.statusFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
    },
  );

  // Refresh on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Stats
  const stats = useMemo(() => {
    const pendingCount = pending.filter(e => !e.verified).length;
    const matchCount = pending.filter(e => e.result?.status === 'MATCH').length;
    const mismatchCount = pending.filter(e => e.result?.status === 'MISMATCH').length;
    const notFoundCount = pending.filter(e => e.result?.status === 'NOT_FOUND').length;
    const errorCount = pending.filter(e => e.result?.status === 'ERROR').length;
    return { pending: pendingCount, match: matchCount, mismatch: mismatchCount, notFound: notFoundCount, error: errorCount };
  }, [pending]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let entries = [...pending].reverse(); // newest first

    if (statusFilter) {
      entries = entries.filter(e => {
        if (statusFilter === 'PENDING') return !e.verified;
        return e.result?.status === statusFilter;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        e.expected.action.toLowerCase().includes(q) ||
        e.expected.entity_type.toLowerCase().includes(q) ||
        (e.expected.user_email && e.expected.user_email.toLowerCase().includes(q)) ||
        (e.expected.entity_id && e.expected.entity_id.toLowerCase().includes(q))
      );
    }

    return entries;
  }, [pending, statusFilter, searchQuery]);

  // Active filter tag for the Status dropdown (search shows in its own box).
  const VERIFICATION_STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending', MATCH: 'Match', MISMATCH: 'Mismatch', NOT_FOUND: 'Not Found', ERROR: 'Error',
  };
  const activeFilterChips = statusFilter
    ? [{ key: 'status', label: 'Status', value: VERIFICATION_STATUS_LABELS[statusFilter] ?? statusFilter, onRemove: () => setStatusFilter('') }]
    : [];

  const handleVerifyAll = useCallback(async () => {
    const unverifiedCount = pending.filter(e => !e.verified).length;
    if (unverifiedCount === 0) {
      toast.info('No pending entries to verify');
      return;
    }
    const report = await verifyPending();
    toast.success(`Verified ${report.summary.total} entries: ${report.summary.match} matched, ${report.summary.mismatch} mismatched, ${report.summary.notFound} not found`);
  }, [pending, verifyPending]);

  const handleRetryNotFound = useCallback(async () => {
    const notFoundCount = pending.filter(e => e.result?.status === 'NOT_FOUND').length;
    if (notFoundCount === 0) {
      toast.info('No NOT_FOUND entries to retry');
      return;
    }
    const report = await retryNotFound();
    toast.success(`Retried ${report.summary.total} entries: ${report.summary.match} now matched, ${report.summary.notFound} still not found`);
  }, [pending, retryNotFound]);

  const handleClearVerified = useCallback(async () => {
    const verifiedCount = pending.filter(e => e.verified).length;
    if (verifiedCount === 0) {
      toast.info('No verified entries to clear');
      return;
    }
    const confirmed = await dialog.confirm({
      title: `Clear ${verifiedCount} verified entries from history?`,
      message: 'This will remove all verified entries. Pending entries will be kept.',
    });
    if (confirmed) {
      clearVerified();
      toast.success(`Cleared ${verifiedCount} verified entries`);
    }
  }, [pending, dialog, clearVerified]);

  const handleClearAll = useCallback(async () => {
    if (pending.length === 0) {
      toast.info('No entries to clear');
      return;
    }
    const confirmed = await dialog.confirm({
      title: `Clear ALL ${pending.length} entries?`,
      message: 'This will permanently remove all verification history including pending entries.',
    });
    if (confirmed) {
      clearAll();
      toast.success('All verification entries cleared');
    }
  }, [pending, dialog, clearAll]);

  const getEntryStatus = (entry: PendingVerification): VerificationStatus => {
    if (!entry.verified) return 'PENDING';
    return entry.result?.status || 'ERROR';
  };

  // One expanded entry's Expected / Actual / Mismatch panel (shared by the table and the phone cards).
  const renderEntryDetail = (entry: PendingVerification) => {
    if (expandedId !== entry.id || !entry.result) return null;
    const status = getEntryStatus(entry);

    return (
      <div key={`detail-${entry.id}`} className="border-t border-gray-100 dark:border-slate-700/60 bg-gray-50/80 dark:bg-slate-800/50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="tf-grid-2 max-w-4xl">
          {/* Expected */}
          <div>
            <h4 className="tf-eyebrow mb-3">Expected</h4>
            <div className="tf-panel divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
              <div className="flex items-start px-4 py-3 gap-4">
                <span className="tf-caption min-w-[100px]">Action</span>
                <span className="tf-body">{formatAction(entry.expected.action)}</span>
              </div>
              <div className="flex items-start px-4 py-3 gap-4">
                <span className="tf-caption min-w-[100px]">Entity Type</span>
                <span className="tf-body capitalize">{entry.expected.entity_type?.replace(/_/g, ' ')}</span>
              </div>
              {entry.expected.entity_id && (
                <div className="flex items-start px-4 py-3 gap-4">
                  <span className="tf-caption min-w-[100px]">Entity ID</span>
                  <span className="tf-body font-mono truncate">{entry.expected.entity_id}</span>
                </div>
              )}
              <div className="flex items-start px-4 py-3 gap-4">
                <span className="tf-caption min-w-[100px]">User</span>
                <span className="tf-body">{entry.expected.user_email || entry.expected.user_id || '—'}</span>
              </div>
              <div className="flex items-start px-4 py-3 gap-4">
                <span className="tf-caption min-w-[100px]">Timestamp</span>
                <span className="tf-body">{formatIST(entry.expected.timestamp)}</span>
              </div>
            </div>
          </div>

          {/* Actual */}
          <div>
            <h4 className="tf-eyebrow mb-3">
              Actual Audit Log
              {!entry.result.actual && <span className="text-warning ml-2">(not found)</span>}
            </h4>
            {entry.result.actual ? (
              <div className="tf-panel divide-y divide-gray-100 dark:divide-slate-700/60 overflow-hidden">
                <div className="flex items-start px-4 py-3 gap-4">
                  <span className="tf-caption min-w-[100px]">Action</span>
                  <span className="tf-body">{formatAction(entry.result.actual.action)}</span>
                </div>
                <div className="flex items-start px-4 py-3 gap-4">
                  <span className="tf-caption min-w-[100px]">Entity Type</span>
                  <span className="tf-body capitalize">{entry.result.actual.entity_type?.replace(/_/g, ' ') || '—'}</span>
                </div>
                {entry.result.actual.entity_id && (
                  <div className="flex items-start px-4 py-3 gap-4">
                    <span className="tf-caption min-w-[100px]">Entity ID</span>
                    <span className="tf-body font-mono truncate">{entry.result.actual.entity_id}</span>
                  </div>
                )}
                <div className="flex items-start px-4 py-3 gap-4">
                  <span className="tf-caption min-w-[100px]">User</span>
                  <span className="tf-body">{entry.result.actual.user_email || entry.result.actual.user_id || '—'}</span>
                </div>
                <div className="flex items-start px-4 py-3 gap-4">
                  <span className="tf-caption min-w-[100px]">Timestamp</span>
                  <span className="tf-body">{formatIST(entry.result.actual.created_at)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-warning-line p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
                <p className="tf-body-secondary">
                  {entry.result.error || 'No matching audit log entry found within the search window.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Mismatches */}
        {entry.result.mismatches.length > 0 && (
          <div className="mt-5 max-w-4xl">
            <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-3">Field Mismatches</h4>
            <div className="bg-destructive-subtle rounded-xl border border-destructive-line divide-y divide-red-100 overflow-hidden">
              {entry.result.mismatches.map((m, idx) => (
                <div key={idx} className="flex items-start px-4 py-3 gap-6">
                  <span className="text-xs font-semibold text-destructive min-w-[100px] capitalize">{m.field.replace(/_/g, ' ')}</span>
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase">Expected</span>
                      <p className="tf-body mt-0.5">{m.expected || '—'}</p>
                    </div>
                    <div>
                      <span className="text-2xs font-medium text-gray-500 dark:text-slate-500 uppercase">Actual</span>
                      <p className="text-sm text-destructive mt-0.5 font-medium">{m.actual || '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verified timestamp */}
        {entry.result.verifiedAt && (
          <p className="tf-hint mt-4 max-w-4xl">
            Verified at {formatIST(entry.result.verifiedAt)}
          </p>
        )}
      </div>
    );
  };

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audits' }, { label: 'Log Verification' }]} />
        {/* SaaS Hero Header */}
        <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-5 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="tf-badge mb-2 gap-1.5 bg-white/10 text-2xs text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                  <Sparkles className="h-3 w-3 text-brand-orange" />
                  Integrity check
                </div>
                <h1 className="tf-page-title">Log Verification</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Verify audit log consistency after data plane actions.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                onClick={refresh}
                className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                <span className="text-sm font-medium text-white">Refresh</span>
              </button>
            </div>
          </div>
        </section>

        {/* Stats Cards — clicking a card drills into the list filtered by that status */}
        <div className="tf-grid-stats mb-5 sm:mb-6 lg:mb-8">
          <button
            type="button"
            onClick={() => openListView('PENDING')}
            className={`text-left w-full rounded-2xl border bg-white dark:bg-slate-900 p-3 sm:p-5 lg:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'PENDING' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tf-label">Pending</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-slate-50 mt-1 sm:mt-2">{stats.pending}</p>
                <p className="tf-hint mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">Awaiting verification</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-brand-blue" />
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openListView('MATCH')}
            className={`text-left w-full rounded-2xl border bg-white dark:bg-slate-900 p-3 sm:p-5 lg:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'MATCH' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tf-label">Verified / Match</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-brand-teal mt-1 sm:mt-2">{stats.match}</p>
                <p className="tf-hint mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                  <span className="truncate">Audit logs confirmed</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-brand-teal/10 ring-1 ring-brand-teal/15 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-brand-teal" />
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openListView('MISMATCH')}
            className={`text-left w-full rounded-2xl border bg-white dark:bg-slate-900 p-3 sm:p-5 lg:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'MISMATCH' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tf-label">Mismatches</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-destructive mt-1 sm:mt-2">{stats.mismatch}</p>
                <p className="tf-hint mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <XCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                  <span className="truncate">Field discrepancies found</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-destructive-subtle ring-1 ring-destructive-line rounded-xl flex items-center justify-center flex-shrink-0">
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-destructive" />
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openListView('NOT_FOUND')}
            className={`text-left w-full rounded-2xl border bg-white dark:bg-slate-900 p-3 sm:p-5 lg:p-6 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'NOT_FOUND' ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="tf-label">Not Found</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-warning mt-1 sm:mt-2">{stats.notFound}</p>
                <p className="tf-hint mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <AlertTriangle className="w-3 h-3 text-warning flex-shrink-0" />
                  <span className="truncate">{stats.error > 0 ? `+ ${stats.error} errors` : 'No matching audit entry'}</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-brand-orange/10 ring-1 ring-brand-orange/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-brand-orange-deep" />
              </div>
            </div>
          </button>
        </div>

        {pageView === 'list' && (
        <>
        {/* Action Buttons & Filters */}
        <div className="tf-card-soft overflow-hidden">
          <div className="px-3 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-gray-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button
                  onClick={handleVerifyAll}
                  disabled={isVerifying}
                  className="tf-btn tf-btn-primary h-10 px-3 sm:px-4 bg-brand-blue rounded-xl ring-1 ring-white/10 shadow-md hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 text-sm whitespace-normal hover:bg-brand-blue"
                >
                  {isVerifying ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {isVerifying && progress
                      ? `Verifying ${progress.current}/${progress.total}...`
                      : 'Verify All Pending'}
                  </span>
                </button>
                <button
                  onClick={handleRetryNotFound}
                  disabled={isVerifying || stats.notFound === 0}
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 dark:border-slate-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                  <span className="tf-label">Retry Not Found</span>
                </button>
                <button
                  onClick={handleClearVerified}
                  disabled={isVerifying}
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 dark:border-slate-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                  <span className="tf-label">Clear Verified</span>
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={isVerifying}
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white dark:bg-slate-900 border border-destructive-line rounded-lg sm:rounded-xl hover:bg-destructive-subtle hover:border-destructive-line transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">Clear All</span>
                </button>
              </div>
              <span className="tf-label bg-gray-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                {filteredEntries.length} entries
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/50 dark:bg-slate-800/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex-1 min-w-0 sm:min-w-[280px]">
                <div className="relative">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by action, entity, user email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="tf-input h-10 pl-10 sm:pl-11 pr-3 sm:pr-4"
                  />
                </div>
              </div>
              <FilterSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                ariaLabel="Filter by status"
                options={[
                  { value: '', label: 'All Statuses' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'MATCH', label: 'Match' },
                  { value: 'MISMATCH', label: 'Mismatch' },
                  { value: 'NOT_FOUND', label: 'Not Found' },
                  { value: 'ERROR', label: 'Error' },
                ]}
                className="h-10 data-[size=default]:h-10 sm:data-[size=default]:h-10 py-0 sm:py-0 pl-3 sm:pl-4"
              />
            </div>
            {activeFilterChips.length > 0 && (
              <FilterChips className="mt-3" chips={activeFilterChips} />
            )}
          </div>

          {/* Results Table */}
          {filteredEntries.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-gray-500 dark:text-slate-500" />
              </div>
              <p className="text-gray-600 dark:text-slate-400 font-medium">No verification entries</p>
              <p className="tf-body-muted mt-1">
                Entries are auto-queued when usage is recorded, or you can add them manually
              </p>
            </div>
          ) : (
            <>
            <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full">
                <thead>
                  <tr className="bg-white dark:bg-slate-900">
                    <th className="tf-th-cell text-left tf-th">Timestamp</th>
                    <th className="tf-th-cell text-left tf-th">Action</th>
                    <th className="tf-th-cell text-left tf-th">Entity Type</th>
                    <th className="tf-th-cell text-left tf-th">User</th>
                    <th className="tf-th-cell text-left tf-th">Status</th>
                    <th className="tf-th-cell text-left tf-th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {filteredEntries.map((entry) => {
                    const status = getEntryStatus(entry);
                    const config = STATUS_CONFIG[status];
                    const StatusIcon = config.icon;
                    const isExpanded = expandedId === entry.id;

                    return (
                      <tr key={entry.id} className="group">
                        {/* Main row */}
                        <td className="tf-td whitespace-nowrap">
                          <div className="flex items-center gap-2 tf-body-secondary">
                            <Clock className="w-4 h-4 text-gray-500 dark:text-slate-500" />
                            <span>{formatIST(entry.expected.timestamp)}</span>
                          </div>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="inline-flex px-3 py-1.5 rounded-lg tf-caption bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                            {formatAction(entry.expected.action)}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className="tf-body capitalize">
                            {entry.expected.entity_type?.replace(/_/g, ' ') || '—'}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-2xs font-semibold shadow-sm">
                              {(entry.expected.user_email || 'U').charAt(0).toUpperCase()}
                            </div>
                            <span className="tf-body-secondary truncate max-w-[160px]" title={entry.expected.user_email}>
                              {entry.expected.user_email || entry.expected.user_id || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${config.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {config.label}
                          </span>
                        </td>
                        <td className="tf-td whitespace-nowrap">
                          {entry.verified && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 dark:text-slate-300 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Expanded detail panels (rendered outside table for layout) */}
              {filteredEntries.map((entry) => renderEntryDetail(entry))}
            </div>
            <MobileRecordList className="p-3">
              {filteredEntries.map((entry) => {
                const status = getEntryStatus(entry);
                const config = STATUS_CONFIG[status];
                const StatusIcon = config.icon;
                const isExpanded = expandedId === entry.id;
                return (
                  <MobileRecordCard
                    key={entry.id}
                    badges={
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${config.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {config.label}
                      </span>
                    }
                    title={formatAction(entry.expected.action)}
                    meta={[
                      { icon: <Clock className="w-3.5 h-3.5" />, label: formatIST(entry.expected.timestamp) },
                      { icon: <User className="w-3.5 h-3.5" />, label: entry.expected.user_email || entry.expected.user_id || '—' },
                    ]}
                    fields={[
                      { label: 'Entity Type', value: <span className="capitalize">{entry.expected.entity_type?.replace(/_/g, ' ') || '—'}</span> },
                    ]}
                    footer={
                      entry.verified ? (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 dark:text-slate-300 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          Details
                        </button>
                      ) : undefined
                    }
                  >
                    {renderEntryDetail(entry)}
                  </MobileRecordCard>
                );
              })}
            </MobileRecordList>
            </>
          )}
        </div>
        </>
        )}

        {/* Last Report Summary */}
        {lastReport && (
          <div className="tf-card-soft mt-6 p-6">
            <h3 className="tf-row-title mb-3">Last Reconciliation Report</h3>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-500 dark:text-slate-500">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                {formatIST(lastReport.completedAt)}
              </span>
              <span className="text-gray-700 dark:text-slate-300 font-medium">{lastReport.summary.total} checked</span>
              <span className="text-success font-medium">{lastReport.summary.match} matched</span>
              {lastReport.summary.mismatch > 0 && (
                <span className="text-destructive font-medium">{lastReport.summary.mismatch} mismatched</span>
              )}
              {lastReport.summary.notFound > 0 && (
                <span className="text-warning font-medium">{lastReport.summary.notFound} not found</span>
              )}
              {lastReport.summary.error > 0 && (
                <span className="text-destructive font-medium">{lastReport.summary.error} errors</span>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
