'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FileCheck,
  Search,
  RefreshCw,
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
  const [limit] = useState(20);

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
      return (
        <div className="flex items-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm text-green-700">Accepted</span>
        </div>
      );
    } else if (action === 'DECLINE' || status === 'DECLINED') {
      return (
        <div className="flex items-center gap-1.5">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700">Declined</span>
        </div>
      );
    } else if (action === 'REVOKE' || status === 'REVOKED') {
      return (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-orange-500" />
          <span className="text-sm text-orange-700">Revoked</span>
        </div>
      );
    }
    return (
      <span className="text-sm text-gray-500">{status || action}</span>
    );
  };

  const getAgreementTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      TERMS_OF_SERVICE: 'bg-blue-100 text-blue-700',
      PRIVACY_POLICY: 'bg-purple-100 text-purple-700',
      DATA_PROCESSING: 'bg-indigo-100 text-indigo-700',
      SUBSCRIPTION_AGREEMENT: 'bg-green-100 text-green-700',
      SLA: 'bg-cyan-100 text-cyan-700',
      ACCEPTABLE_USE: 'bg-yellow-100 text-yellow-700',
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

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
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
              <h2 className="text-lg font-semibold text-gray-900">Tenant Agreement Logs</h2>
              <p className="text-sm text-gray-500">
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

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="TERMS_OF_SERVICE">Terms of Service</option>
              <option value="PRIVACY_POLICY">Privacy Policy</option>
              <option value="DATA_PROCESSING">Data Processing</option>
              <option value="SUBSCRIPTION_AGREEMENT">Subscription Agreement</option>
              <option value="SLA">SLA</option>
              <option value="ACCEPTABLE_USE">Acceptable Use</option>
              <option value="GDPR_CONSENT">GDPR Consent</option>
              <option value="BILLING_TERMS">Billing Terms</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="ACCEPT">Accepted</option>
              <option value="DECLINE">Declined</option>
              <option value="REVOKE">Revoked</option>
            </select>

            <input
              type="text"
              placeholder="User email..."
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Agreement Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Version
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Context
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                IP Address
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
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
                      <p className="text-xs text-gray-500">{log.user_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {getAgreementTypeBadge(log.agreement_type)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600 font-mono">
                    {log.agreement_version}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(log.agreement_status, log.agreement_action)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    {log.context_type || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{log.ip_address}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
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
          <p className="text-sm text-gray-500">
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50"
            >
              Next
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
            <div className="relative bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Agreement Log Details</h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">User</p>
                    <p className="font-medium">{selectedLog.user_email}</p>
                    {selectedLog.user_name && (
                      <p className="text-sm text-gray-600">{selectedLog.user_name}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Agreement Type</p>
                    <p className="font-medium">{getAgreementTypeName(selectedLog.agreement_type)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Version</p>
                    <p className="font-medium font-mono">{selectedLog.agreement_version}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className={`font-medium ${
                      selectedLog.agreement_action === 'ACCEPT' ? 'text-green-600' :
                      selectedLog.agreement_action === 'DECLINE' ? 'text-red-600' :
                      'text-orange-600'
                    }`}>
                      {selectedLog.agreement_action === 'ACCEPT' ? 'Accepted' :
                       selectedLog.agreement_action === 'DECLINE' ? 'Declined' :
                       'Revoked'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Context</p>
                    <p className="font-medium">{selectedLog.context_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">IP Address</p>
                    <p className="font-medium">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Device</p>
                    <p className="font-medium">
                      {selectedLog.device_type || 'Unknown'} / {selectedLog.browser_name || 'Unknown'} {selectedLog.browser_version || ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">OS</p>
                    <p className="font-medium">
                      {selectedLog.os_name || 'Unknown'} {selectedLog.os_version || ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium">
                      {formatIST(selectedLog.created_at)}
                    </p>
                  </div>
                  {selectedLog.agreement_document_url && (
                    <div>
                      <p className="text-sm text-gray-500">Document URL</p>
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
                      <p className="text-sm text-gray-500">No audit trail entries</p>
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
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedLog(null);
                    setShowAuditTrail(false);
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
