'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';
import { toast } from 'sonner';
import {
  FileCheck,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Monitor,
  Globe,
  User,
  Shield,
  CheckCircle,
  XCircle,
  Filter,
  FileText,
  AlertCircle,
  X,
} from 'lucide-react';
import agreementService, {
  AgreementLog,
  AgreementAuditLog,
  AgreementType,
  getAgreementTypeName,
} from '@/lib/services/agreementService';
import { formatIST } from '@/lib/utils/dateUtils';

interface AgreementLogsProps {
  compact?: boolean;
}

export default function AgreementLogs({ compact = false }: AgreementLogsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<AgreementLog[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AgreementLog | null>(null);
  const [auditTrail, setAuditTrail] = useState<AgreementAuditLog[]>([]);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(0);
  const [limit] = useState(10);

  useEffect(() => {
    loadLogs();
  }, [page, typeFilter, statusFilter, startDate, endDate]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const params: any = {
        limit,
        offset: page * limit,
      };
      if (typeFilter) params.agreement_type = typeFilter;
      if (statusFilter) params.agreement_status = statusFilter;
      if (emailFilter) params.user_email = emailFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const result = await agreementService.getAgreementLogs(params);
      setLogs(result.items);
      setTotal(result.total);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load agreement logs');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditTrail = async (agreementLogId: string) => {
    try {
      const result = await agreementService.getAgreementAuditTrail({
        agreement_log_id: agreementLogId,
        limit: 50,
      });
      setAuditTrail(result.items);
      setShowAuditTrail(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load audit trail');
    }
  };

  const handleSearch = () => {
    setPage(0);
    loadLogs();
  };

  const clearFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setEmailFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const getStatusBadge = (status: string, action: string) => {
    if (action === 'ACCEPT' || status === 'ACCEPTED') {
      return <Badge variant="success" className="gap-1.5"><CheckCircle className="w-3.5 h-3.5" />Accepted</Badge>;
    } else if (action === 'DECLINE' || status === 'DECLINED') {
      return <Badge variant="destructive" className="gap-1.5"><XCircle className="w-3.5 h-3.5" />Declined</Badge>;
    } else if (action === 'REVOKE' || status === 'REVOKED') {
      return <Badge variant="warning" className="gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Revoked</Badge>;
    }
    return <Badge variant="muted">{status || action}</Badge>;
  };

  const getAgreementTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      TERMS_OF_SERVICE: 'bg-blue-100 text-blue-700',
      PRIVACY_POLICY: 'bg-purple-100 text-purple-700',
      DATA_PROCESSING: 'bg-indigo-100 text-indigo-700',
      SUBSCRIPTION_AGREEMENT: 'bg-success-subtle text-success',
      SLA: 'bg-cyan-100 text-cyan-700',
      ACCEPTABLE_USE: 'bg-warning-subtle text-warning',
      GDPR_CONSENT: 'bg-pink-100 text-pink-700',
      BILLING_TERMS: 'bg-orange-100 text-orange-700',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
        {getAgreementTypeName(type)}
      </span>
    );
  };

  const totalPages = Math.ceil(total / limit);

  // 1-based text for the Go-to-page input — page itself stays 0-based.
  const [goToPage, setGoToPage] = useState(String(page + 1));
  useEffect(() => {
    setGoToPage(String(page + 1));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target - 1);
    } else {
      setGoToPage(String(page + 1));
    }
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 tf-loader-center">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="tf-section-title">Tenant Agreement Logs</h2>
              <p className="tf-body-muted">
                {total} agreement acceptance records for compliance reporting
              </p>
            </div>
          </div>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {!compact && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>

            <FilterSelect
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              ariaLabel="Agreement type"
              options={[
                { value: '', label: 'All Types' },
                { value: 'TERMS_OF_SERVICE', label: 'Terms of Service' },
                { value: 'PRIVACY_POLICY', label: 'Privacy Policy' },
                { value: 'DATA_PROCESSING', label: 'Data Processing' },
                { value: 'SUBSCRIPTION_AGREEMENT', label: 'Subscription Agreement' },
                { value: 'SLA', label: 'SLA' },
                { value: 'ACCEPTABLE_USE', label: 'Acceptable Use' },
                { value: 'GDPR_CONSENT', label: 'GDPR Consent' },
                { value: 'BILLING_TERMS', label: 'Billing Terms' },
              ]}
              className="px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg border-gray-300"
            />

            <FilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              ariaLabel="Status"
              options={[
                { value: '', label: 'All Status' },
                { value: 'ACCEPT', label: 'Accepted' },
                { value: 'DECLINE', label: 'Declined' },
                { value: 'REVOKE', label: 'Revoked' },
              ]}
              className="px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg border-gray-300"
            />

            <input
              type="text"
              placeholder="User email..."
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500"
            />

            <DateField
              aria-label="Start date"
              value={startDate}
              onChange={setStartDate}
              className="w-auto"
            />
            <span className="text-gray-400">to</span>
            <DateField
              aria-label="End date"
              value={endDate}
              onChange={setEndDate}
              className="w-auto"
            />

            <button
              onClick={handleSearch}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full">
          <thead className="bg-white">
            <tr>
              <th className="px-4 py-3 text-left tf-th">
                User
              </th>
              <th className="px-4 py-3 text-left tf-th">
                Agreement Type
              </th>
              <th className="px-4 py-3 text-left tf-th">
                Version
              </th>
              <th className="px-4 py-3 text-left tf-th">
                Status
              </th>
              <th className="px-4 py-3 text-left tf-th">
                Context
              </th>
              <th className="px-4 py-3 text-left tf-th">
                IP Address
              </th>
              <th className="px-4 py-3 text-left tf-th">
                Date
              </th>
              <th className="px-4 py-3 text-left tf-th">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {log.user_name || 'Unknown'}
                      </p>
                      <p className="tf-meta">{log.user_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {getAgreementTypeBadge(log.agreement_type)}
                </td>
                <td className="px-4 py-3">
                  <span className="tf-card-desc font-mono">
                    {log.agreement_version}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(log.agreement_status, log.agreement_action)}
                </td>
                <td className="px-4 py-3">
                  <span className="tf-card-desc">
                    {log.context_type || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <span className="tf-card-desc">{log.ip_address}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="tf-card-desc">
                      {formatIST(log.created_at)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      setSelectedLog(log);
                      loadAuditTrail(log.id);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {logs.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No agreement logs found</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="tf-body-muted">
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <span className="tf-card-desc whitespace-nowrap">Go to</span>
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
                className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
              />
            </div>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
              aria-label="Previous page" title="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
              <span className="text-brand-blue font-semibold">{page + 1}</span> / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
              aria-label="Next page" title="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && showAuditTrail && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75"
              onClick={() => {
                setSelectedLog(null);
                setShowAuditTrail(false);
              }}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80dvh] flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="tf-section-title">Agreement Log Details</h3>
                <button
                  onClick={() => {
                    setSelectedLog(null);
                    setShowAuditTrail(false);
                  }}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="tf-body-muted">User</p>
                    <p className="font-medium">{selectedLog.user_email}</p>
                    {selectedLog.user_name && (
                      <p className="tf-card-desc">{selectedLog.user_name}</p>
                    )}
                  </div>
                  <div>
                    <p className="tf-body-muted">Agreement Type</p>
                    <p className="font-medium">{getAgreementTypeName(selectedLog.agreement_type)}</p>
                  </div>
                  <div>
                    <p className="tf-body-muted">Version</p>
                    <p className="font-medium font-mono">{selectedLog.agreement_version}</p>
                  </div>
                  <div>
                    <p className="tf-body-muted">Status</p>
                    <p className={`font-medium ${
                      selectedLog.agreement_action === 'ACCEPT' ? 'text-success' :
                      selectedLog.agreement_action === 'DECLINE' ? 'text-destructive' :
                      'text-orange-600'
                    }`}>
                      {selectedLog.agreement_action === 'ACCEPT' ? 'Accepted' :
                       selectedLog.agreement_action === 'DECLINE' ? 'Declined' :
                       'Revoked'}
                    </p>
                  </div>
                  <div>
                    <p className="tf-body-muted">Context</p>
                    <p className="font-medium">{selectedLog.context_type || '-'}</p>
                  </div>
                  <div>
                    <p className="tf-body-muted">IP Address</p>
                    <p className="font-medium">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <p className="tf-body-muted">Device</p>
                    <p className="font-medium">
                      {selectedLog.device_type || 'Unknown'} / {selectedLog.browser_name || 'Unknown'} {selectedLog.browser_version || ''}
                    </p>
                  </div>
                  <div>
                    <p className="tf-body-muted">OS</p>
                    <p className="font-medium">
                      {selectedLog.os_name || 'Unknown'} {selectedLog.os_version || ''}
                    </p>
                  </div>
                  <div>
                    <p className="tf-body-muted">Date</p>
                    <p className="font-medium">
                      {formatIST(selectedLog.created_at)}
                    </p>
                  </div>
                  {selectedLog.agreement_document_url && (
                    <div>
                      <p className="tf-body-muted">Document URL</p>
                      <a
                        href={selectedLog.agreement_document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        View Document
                      </a>
                    </div>
                  )}
                </div>

                {/* Audit Trail */}
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 mb-3">Audit Trail</h4>
                  <div className="space-y-2">
                    {auditTrail.length === 0 ? (
                      <p className="tf-body-muted">No audit trail entries</p>
                    ) : (
                      auditTrail.map((audit) => (
                        <div
                          key={audit.id}
                          className="p-3 bg-gray-50 rounded-lg text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{audit.action}</span>
                            <span className="text-gray-500">
                              {formatIST(audit.created_at)}
                            </span>
                          </div>
                          <p className="text-gray-600 mt-1">
                            By {audit.actor_email || 'System'} ({audit.actor_type})
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
