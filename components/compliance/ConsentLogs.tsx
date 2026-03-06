'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FileCheck,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Calendar,
  Monitor,
  Globe,
  User,
  Shield,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
  Filter,
} from 'lucide-react';
import consentService, { ConsentLog, ConsentAuditLog } from '@/lib/services/consentService';
import { formatIST } from '@/lib/utils/dateUtils';

interface ConsentLogsProps {
  compact?: boolean;
}

export default function ConsentLogs({ compact = false }: ConsentLogsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<ConsentLog[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ConsentLog | null>(null);
  const [auditTrail, setAuditTrail] = useState<ConsentAuditLog[]>([]);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  // Filters
  const [featureFilter, setFeatureFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(0);
  const [limit] = useState(20);

  useEffect(() => {
    loadLogs();
  }, [page, featureFilter, statusFilter, startDate, endDate]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const params: any = {
        limit,
        offset: page * limit,
      };
      if (featureFilter) params.feature_name = featureFilter;
      if (statusFilter) params.consent_status = statusFilter === 'accepted';
      if (emailFilter) params.candidate_email = emailFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const result = await consentService.getConsentLogs(params);
      setLogs(result.items);
      setTotal(result.total);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load consent logs');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditTrail = async (consentLogId: string) => {
    try {
      const result = await consentService.getConsentAuditTrail({
        consent_log_id: consentLogId,
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
    setFeatureFilter('');
    setStatusFilter('');
    setEmailFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
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
            <div className="p-2 bg-purple-100 rounded-lg">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Candidate Consent Logs</h2>
              <p className="text-sm text-gray-500">
                {total} consent records for compliance reporting
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
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Features</option>
              <option value="ASSESSMENT">Assessment</option>
              <option value="AI_INTERVIEW">AI Interview</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Status</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>

            <input
              type="text"
              placeholder="Candidate email..."
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-purple-500"
            />

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
            />

            <button
              onClick={handleSearch}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
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
                Candidate
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Feature
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Device
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
                        {log.candidate_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">{log.candidate_email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    log.feature_name === 'ASSESSMENT'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {log.feature_name === 'ASSESSMENT' ? 'Assessment' : 'AI Interview'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {log.consent_status ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-700">Accepted</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-sm text-red-700">Declined</span>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {log.device_type || 'Unknown'} / {log.browser_name || 'Unknown'}
                    </span>
                  </div>
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
                    className="text-purple-600 hover:text-purple-800 text-sm font-medium"
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
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No consent logs found</p>
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
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Consent Log Details</h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Candidate</p>
                    <p className="font-medium">{selectedLog.candidate_email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Feature</p>
                    <p className="font-medium">{selectedLog.feature_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className={`font-medium ${selectedLog.consent_status ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedLog.consent_status ? 'Accepted' : 'Declined'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Proctoring Consent</p>
                    <p className="font-medium">
                      {selectedLog.proctoring_consent ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">IP Address</p>
                    <p className="font-medium">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Device</p>
                    <p className="font-medium">
                      {selectedLog.device_type} / {selectedLog.browser_name} {selectedLog.browser_version}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">OS</p>
                    <p className="font-medium">
                      {selectedLog.os_name} {selectedLog.os_version}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium">
                      {formatIST(selectedLog.created_at)}
                    </p>
                  </div>
                </div>

                {/* Audit Trail */}
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 mb-3">Audit Trail</h4>
                  <div className="space-y-2">
                    {auditTrail.map((audit) => (
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
                    ))}
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
