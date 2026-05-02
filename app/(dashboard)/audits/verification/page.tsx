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
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuditVerification } from '@/lib/hooks/useAuditVerification';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import type { PendingVerification, VerificationStatus } from '@/lib/services/auditVerificationService';
import { formatIST } from '@/lib/utils/dateUtils';

const STATUS_CONFIG: Record<VerificationStatus, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-700 border border-gray-200', icon: Clock },
  MATCH: { label: 'Match', color: 'bg-green-100 text-green-800 border border-green-200', icon: CheckCircle2 },
  MISMATCH: { label: 'Mismatch', color: 'bg-red-100 text-red-800 border border-red-200', icon: XCircle },
  NOT_FOUND: { label: 'Not Found', color: 'bg-amber-100 text-amber-800 border border-amber-200', icon: AlertTriangle },
  ERROR: { label: 'Error', color: 'bg-red-100 text-red-800 border border-red-200', icon: XCircle },
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
    const confirmed = await dialog.confirm(
      `Clear ${verifiedCount} verified entries from history?`,
      'This will remove all verified entries. Pending entries will be kept.',
    );
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
    const confirmed = await dialog.confirm(
      `Clear ALL ${pending.length} entries?`,
      'This will permanently remove all verification history including pending entries.',
    );
    if (confirmed) {
      clearAll();
      toast.success('All verification entries cleared');
    }
  }, [pending, dialog, clearAll]);

  const getEntryStatus = (entry: PendingVerification): VerificationStatus => {
    if (!entry.verified) return 'PENDING';
    return entry.result?.status || 'ERROR';
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50/50">
      <div>
        {/* Header */}
        <div className="mb-5 sm:mb-6 lg:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-gray-300 flex-shrink-0">
                <ShieldCheck className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">Log Verification</h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Verify audit log consistency after data plane actions</p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                onClick={refresh}
                className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white border border-gray-200 rounded-lg sm:rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                <RefreshCw className="w-4 h-4 text-gray-600" />
                <span className="text-xs sm:text-sm font-medium text-gray-700">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 mb-5 sm:mb-6 lg:mb-8">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-5 lg:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-500">Pending</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">{stats.pending}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">Awaiting verification</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-gradient-to-br from-gray-500 to-gray-700 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-gray-300 flex-shrink-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-5 lg:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-500">Verified / Match</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-700 mt-1 sm:mt-2">{stats.match}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                  <span className="truncate">Audit logs confirmed</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-gradient-to-br from-green-600 to-green-800 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-green-200 flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-5 lg:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-500">Mismatches</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-700 mt-1 sm:mt-2">{stats.mismatch}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                  <span className="truncate">Field discrepancies found</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-gradient-to-br from-red-600 to-red-800 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-red-200 flex-shrink-0">
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-5 lg:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-500">Not Found</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-amber-700 mt-1 sm:mt-2">{stats.notFound}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1 sm:mt-2 flex items-center gap-1 truncate">
                  <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span className="truncate">{stats.error > 0 ? `+ ${stats.error} errors` : 'No matching audit entry'}</span>
                </p>
              </div>
              <div className="w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 bg-gradient-to-br from-amber-500 to-amber-700 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-amber-200 flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons & Filters */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button
                  onClick={handleVerifyAll}
                  disabled={isVerifying}
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-gray-900 text-white rounded-lg sm:rounded-xl hover:bg-gray-800 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white border border-gray-200 rounded-lg sm:rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Retry Not Found</span>
                </button>
                <button
                  onClick={handleClearVerified}
                  disabled={isVerifying}
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white border border-gray-200 rounded-lg sm:rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Clear Verified</span>
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={isVerifying}
                  className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 bg-white border border-red-200 rounded-lg sm:rounded-xl hover:bg-red-50 hover:border-red-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">Clear All</span>
                </button>
              </div>
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full font-medium">
                {filteredEntries.length} entries
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex-1 min-w-0 sm:min-w-[280px]">
                <div className="relative">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by action, entity, user email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-10 sm:pl-11 pr-3 sm:pr-4 bg-white border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all text-sm"
                  />
                </div>
              </div>
              <div className="relative w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none w-full sm:w-auto h-10 pl-3 sm:pl-4 pr-10 bg-white border border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-gray-400 transition-all text-sm cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="MATCH">Match</option>
                  <option value="MISMATCH">Mismatch</option>
                  <option value="NOT_FOUND">Not Found</option>
                  <option value="ERROR">Error</option>
                </select>
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Results Table */}
          {filteredEntries.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No verification entries</p>
              <p className="text-sm text-gray-400 mt-1">
                Entries are auto-queued when usage is recorded, or you can add them manually
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.map((entry) => {
                    const status = getEntryStatus(entry);
                    const config = STATUS_CONFIG[status];
                    const StatusIcon = config.icon;
                    const isExpanded = expandedId === entry.id;

                    return (
                      <tr key={entry.id} className="group">
                        {/* Main row */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span>{formatIST(entry.expected.timestamp)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                            {formatAction(entry.expected.action)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-700 capitalize">
                            {entry.expected.entity_type?.replace(/_/g, ' ') || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center text-[10px] font-semibold shadow-sm">
                              {(entry.expected.user_email || 'U').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-600 truncate max-w-[160px]" title={entry.expected.user_email}>
                              {entry.expected.user_email || entry.expected.user_id || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${config.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.verified && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
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
              {filteredEntries.map((entry) => {
                if (expandedId !== entry.id || !entry.result) return null;
                const status = getEntryStatus(entry);

                return (
                  <div key={`detail-${entry.id}`} className="border-t border-gray-100 bg-gray-50/80 px-6 py-5">
                    <div className="grid grid-cols-2 gap-6 max-w-4xl">
                      {/* Expected */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Expected</h4>
                        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                          <div className="flex items-start px-4 py-3 gap-4">
                            <span className="text-xs font-medium text-gray-500 min-w-[100px]">Action</span>
                            <span className="text-sm text-gray-900">{formatAction(entry.expected.action)}</span>
                          </div>
                          <div className="flex items-start px-4 py-3 gap-4">
                            <span className="text-xs font-medium text-gray-500 min-w-[100px]">Entity Type</span>
                            <span className="text-sm text-gray-900 capitalize">{entry.expected.entity_type?.replace(/_/g, ' ')}</span>
                          </div>
                          {entry.expected.entity_id && (
                            <div className="flex items-start px-4 py-3 gap-4">
                              <span className="text-xs font-medium text-gray-500 min-w-[100px]">Entity ID</span>
                              <span className="text-sm text-gray-900 font-mono truncate">{entry.expected.entity_id}</span>
                            </div>
                          )}
                          <div className="flex items-start px-4 py-3 gap-4">
                            <span className="text-xs font-medium text-gray-500 min-w-[100px]">User</span>
                            <span className="text-sm text-gray-900">{entry.expected.user_email || entry.expected.user_id || '—'}</span>
                          </div>
                          <div className="flex items-start px-4 py-3 gap-4">
                            <span className="text-xs font-medium text-gray-500 min-w-[100px]">Timestamp</span>
                            <span className="text-sm text-gray-900">{formatIST(entry.expected.timestamp)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actual */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          Actual Audit Log
                          {!entry.result.actual && <span className="text-amber-600 ml-2">(not found)</span>}
                        </h4>
                        {entry.result.actual ? (
                          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                            <div className="flex items-start px-4 py-3 gap-4">
                              <span className="text-xs font-medium text-gray-500 min-w-[100px]">Action</span>
                              <span className="text-sm text-gray-900">{formatAction(entry.result.actual.action)}</span>
                            </div>
                            <div className="flex items-start px-4 py-3 gap-4">
                              <span className="text-xs font-medium text-gray-500 min-w-[100px]">Entity Type</span>
                              <span className="text-sm text-gray-900 capitalize">{entry.result.actual.entity_type?.replace(/_/g, ' ') || '—'}</span>
                            </div>
                            {entry.result.actual.entity_id && (
                              <div className="flex items-start px-4 py-3 gap-4">
                                <span className="text-xs font-medium text-gray-500 min-w-[100px]">Entity ID</span>
                                <span className="text-sm text-gray-900 font-mono truncate">{entry.result.actual.entity_id}</span>
                              </div>
                            )}
                            <div className="flex items-start px-4 py-3 gap-4">
                              <span className="text-xs font-medium text-gray-500 min-w-[100px]">User</span>
                              <span className="text-sm text-gray-900">{entry.result.actual.user_email || entry.result.actual.user_id || '—'}</span>
                            </div>
                            <div className="flex items-start px-4 py-3 gap-4">
                              <span className="text-xs font-medium text-gray-500 min-w-[100px]">Timestamp</span>
                              <span className="text-sm text-gray-900">{formatIST(entry.result.actual.created_at)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white rounded-xl border border-amber-200 p-6 text-center">
                            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">
                              {entry.result.error || 'No matching audit log entry found within the search window.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mismatches */}
                    {entry.result.mismatches.length > 0 && (
                      <div className="mt-5 max-w-4xl">
                        <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3">Field Mismatches</h4>
                        <div className="bg-red-50 rounded-xl border border-red-200 divide-y divide-red-100 overflow-hidden">
                          {entry.result.mismatches.map((m, idx) => (
                            <div key={idx} className="flex items-start px-4 py-3 gap-6">
                              <span className="text-xs font-semibold text-red-700 min-w-[100px] capitalize">{m.field.replace(/_/g, ' ')}</span>
                              <div className="flex-1 grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-[10px] font-medium text-gray-400 uppercase">Expected</span>
                                  <p className="text-sm text-gray-900 mt-0.5">{m.expected || '—'}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] font-medium text-gray-400 uppercase">Actual</span>
                                  <p className="text-sm text-red-700 mt-0.5 font-medium">{m.actual || '—'}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Verified timestamp */}
                    {entry.result.verifiedAt && (
                      <p className="text-xs text-gray-400 mt-4 max-w-4xl">
                        Verified at {formatIST(entry.result.verifiedAt)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Last Report Summary */}
        {lastReport && (
          <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Last Reconciliation Report</h3>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-500">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                {formatIST(lastReport.completedAt)}
              </span>
              <span className="text-gray-700 font-medium">{lastReport.summary.total} checked</span>
              <span className="text-green-700 font-medium">{lastReport.summary.match} matched</span>
              {lastReport.summary.mismatch > 0 && (
                <span className="text-red-700 font-medium">{lastReport.summary.mismatch} mismatched</span>
              )}
              {lastReport.summary.notFound > 0 && (
                <span className="text-amber-700 font-medium">{lastReport.summary.notFound} not found</span>
              )}
              {lastReport.summary.error > 0 && (
                <span className="text-red-600 font-medium">{lastReport.summary.error} errors</span>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
