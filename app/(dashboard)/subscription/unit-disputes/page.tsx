'use client';

import { Shield, Search, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Download, ExternalLink, RefreshCw, Filter, Calendar, Plus, Copy, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// --- Types ---

interface UnitDispute {
  id: string;
  tenant_id: string;
  control_plane_dispute_id: string;
  consumption_log_id: string;
  unit_type: 'RS' | 'AS' | 'AIU';
  units_to_refund: number;
  reason: string;
  description: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  requested_by_id: string;
  requested_by_name: string;
  requested_by_email: string;
  requested_by_role: string;
  audit_trail: Record<string, unknown> | null;
  resolution_notes: string | null;
  units_restored: number | null;
  refund_transaction_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
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

  useEffect(() => {
    fetchDisputes();
  }, []);

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
      setDisputes(result.data?.items || []);
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

  // --- Helpers ---

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const truncateId = (id: string) => {
    if (id.length <= 12) return id;
    return `${id.slice(0, 8)}...${id.slice(-4)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'PENDING_REVIEW': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'REJECTED': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-100 text-green-700 border-green-200';
      case 'PENDING_REVIEW': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
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
      RS: 'bg-blue-100 text-blue-700 border-blue-200',
      AS: 'bg-purple-100 text-purple-700 border-purple-200',
      AIU: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[unitType] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
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
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Unit Consumption Disputes</h1>
                <p className="text-sm text-gray-600">File and track unit refund requests</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                disabled={loading || filteredDisputes.length === 0}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={fetchDisputes}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={openFileModal}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                File Dispute
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 uppercase mb-1">Total Disputes</p>
            <p className="text-2xl font-bold text-indigo-600">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">All time</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 uppercase mb-1">Pending Review</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-gray-500 mt-1">Awaiting decision</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs text-gray-500 uppercase mb-1">Resolved</p>
            <p className="text-2xl font-bold text-gray-900">{stats.resolved}</p>
            <p className="text-xs text-gray-500 mt-1">Approved or rejected</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="ml-auto text-xs text-blue-600 hover:text-blue-800">
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID, reason, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
            <p className="mt-4 text-gray-500">Loading unit disputes...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filteredDisputes.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Unit Disputes</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {hasActiveFilters
                ? 'No disputes match your filter criteria. Try adjusting your filters.'
                : 'You have no unit consumption disputes. If you believe units were incorrectly consumed, you can file a dispute.'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-4 text-sm text-blue-600 hover:text-blue-800">
                Clear all filters
              </button>
            )}
            {!hasActiveFilters && (
              <button
                onClick={openFileModal}
                className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                File a Dispute
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && !error && filteredDisputes.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredDisputes.length} dispute{filteredDisputes.length !== 1 ? 's' : ''}
                {hasActiveFilters && ` (filtered from ${disputes.length})`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Dispute ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">Unit Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px]">Units</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Reason</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[130px]">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDisputes.map((dispute, index) => (
                    <tr key={dispute.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono text-gray-900 truncate" title={dispute.id}>
                            {truncateId(dispute.id)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(dispute.id)}
                            className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
                            title="Copy full ID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-900">{formatDate(dispute.created_at)}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {getUnitTypeBadge(dispute.unit_type)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-indigo-600">{dispute.units_to_refund}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600 truncate block" title={dispute.reason}>
                          {getReasonLabel(dispute.reason)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusStyles(dispute.status)}`}>
                          {getStatusIcon(dispute.status)}
                          {getStatusLabel(dispute.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => setSelectedDispute(dispute)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
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

        {/* Detail Modal */}
        {selectedDispute && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-indigo-50 rounded-t-xl">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Dispute Details</h2>
                  <p className="text-sm text-gray-600 font-mono">{truncateId(selectedDispute.id)}</p>
                </div>
                <button
                  onClick={() => setSelectedDispute(null)}
                  className="p-2 hover:bg-indigo-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                {/* Top info */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Created</p>
                    <p className="text-sm font-medium text-gray-900">{formatDateTime(selectedDispute.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Unit Type</p>
                    <div className="mt-0.5">{getUnitTypeBadge(selectedDispute.unit_type)}</div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Status</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(selectedDispute.status)}`}>
                      {getStatusIcon(selectedDispute.status)}
                      {getStatusLabel(selectedDispute.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Consumption Log ID</p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-gray-900 font-mono">{truncateId(selectedDispute.consumption_log_id)}</p>
                      <button onClick={() => copyToClipboard(selectedDispute.consumption_log_id)} className="p-0.5 text-gray-400 hover:text-gray-600">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reason & Description */}
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase">Dispute Information</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Reason</span>
                      <span className="text-sm font-medium text-gray-900">{getReasonLabel(selectedDispute.reason)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Description</span>
                      <p className="text-sm text-gray-900 mt-1 bg-gray-50 rounded p-2">{selectedDispute.description}</p>
                    </div>
                  </div>
                </div>

                {/* Units Info */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Units Requested</span>
                    <span className="text-lg font-bold text-indigo-600">{selectedDispute.units_to_refund}</span>
                  </div>
                  {selectedDispute.units_restored !== null && selectedDispute.units_restored !== undefined && (
                    <div className="flex justify-between items-center pt-2 border-t border-indigo-200">
                      <span className="text-sm text-gray-600">Units Restored</span>
                      <span className="text-lg font-bold text-green-600">{selectedDispute.units_restored}</span>
                    </div>
                  )}
                </div>

                {/* Resolution Info */}
                {(selectedDispute.resolution_notes || selectedDispute.resolved_by || selectedDispute.resolved_at) && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <p className="text-xs font-medium text-gray-500 uppercase">Resolution</p>
                    </div>
                    <div className="p-4 space-y-3">
                      {selectedDispute.resolution_notes && (
                        <div>
                          <span className="text-sm text-gray-600">Notes</span>
                          <p className="text-sm text-gray-900 mt-1 bg-gray-50 rounded p-2">{selectedDispute.resolution_notes}</p>
                        </div>
                      )}
                      {selectedDispute.resolved_by && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Resolved By</span>
                          <span className="text-sm font-medium text-gray-900">{selectedDispute.resolved_by}</span>
                        </div>
                      )}
                      {selectedDispute.resolved_at && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Resolved At</span>
                          <span className="text-sm font-medium text-gray-900">{formatDateTime(selectedDispute.resolved_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Refund Transaction ID */}
                {selectedDispute.refund_transaction_id && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-6">
                    <p className="text-xs text-green-600 font-medium">Refund Transaction ID</p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm text-green-900 font-mono">{selectedDispute.refund_transaction_id}</p>
                      <button onClick={() => copyToClipboard(selectedDispute.refund_transaction_id!)} className="p-0.5 text-green-600 hover:text-green-800">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Requested By */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg mb-6">
                  <p className="text-xs text-gray-500 font-medium mb-1">Requested By</p>
                  <p className="text-sm text-gray-900">{selectedDispute.requested_by_name} ({selectedDispute.requested_by_email})</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-indigo-50 rounded-t-xl">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">File a Unit Dispute</h2>
                  <p className="text-sm text-gray-600">Step {fileStep} of 2: {fileStep === 1 ? 'Select consumption record' : 'Provide dispute details'}</p>
                </div>
                <button onClick={closeFileModal} className="p-2 hover:bg-indigo-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                {/* Step 1: Select consumption log */}
                {fileStep === 1 && (
                  <>
                    <p className="text-sm text-gray-600 mb-4">Select the consumption record you want to dispute:</p>

                    {loadingLogs && (
                      <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                        <p className="mt-3 text-sm text-gray-500">Loading consumption history...</p>
                      </div>
                    )}

                    {!loadingLogs && consumptionLogs.length === 0 && (
                      <div className="text-center py-10">
                        <p className="text-sm text-gray-500">No consumption records found.</p>
                      </div>
                    )}

                    {!loadingLogs && consumptionLogs.length > 0 && (
                      <>
                        <div className="space-y-2 mb-4">
                          {consumptionLogs.map(log => (
                            <button
                              key={log.id}
                              onClick={() => {
                                setSelectedLog(log);
                                setDisputeUnits(log.units_consumed.toString());
                                setFileStep(2);
                              }}
                              className={`w-full text-left p-3 rounded-lg border transition-colors hover:border-indigo-300 hover:bg-indigo-50 ${
                                selectedLog?.id === log.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {getUnitTypeBadge(log.unit_type)}
                                  <span className="text-sm font-medium text-gray-900">
                                    {log.units_consumed} unit{log.units_consumed !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </div>
                              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                                <span>{formatDateTime(log.created_at)}</span>
                                {log.entity_name && <span>| {log.entity_name}</span>}
                                {log.user_name && <span>| {log.user_name}</span>}
                              </div>
                              <div className="mt-1 text-xs text-gray-400 font-mono">{truncateId(log.id)}</div>
                            </button>
                          ))}
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                          <p className="text-xs text-gray-500">
                            {logTotal} total record{logTotal !== 1 ? 's' : ''}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => fetchConsumptionLogs(logPage - 1)}
                              disabled={logPage === 0}
                              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs text-gray-600">
                              Page {logPage + 1} of {Math.max(1, Math.ceil(logTotal / LOG_PAGE_SIZE))}
                            </span>
                            <button
                              onClick={() => fetchConsumptionLogs(logPage + 1)}
                              disabled={(logPage + 1) * LOG_PAGE_SIZE >= logTotal}
                              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronRight className="w-4 h-4" />
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
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-indigo-600 font-medium">Selected Record</span>
                        <button
                          onClick={() => setFileStep(1)}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          Change
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {getUnitTypeBadge(selectedLog.unit_type)}
                        <span className="text-sm font-medium text-gray-900">{selectedLog.units_consumed} units</span>
                        <span className="text-xs text-gray-500">| {formatDateTime(selectedLog.created_at)}</span>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                      <select
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      >
                        <option value="">Select a reason...</option>
                        {REASON_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                      <textarea
                        value={disputeDescription}
                        onChange={(e) => setDisputeDescription(e.target.value)}
                        placeholder="Describe the issue in detail (min 10 characters)..."
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">{disputeDescription.length}/1000 characters</p>
                    </div>

                    {/* Units */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Units to Refund <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        value={disputeUnits}
                        onChange={(e) => setDisputeUnits(e.target.value)}
                        min={0.01}
                        max={selectedLog.units_consumed}
                        step={0.01}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">Max: {selectedLog.units_consumed} units (total consumed)</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setFileStep(1)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSubmitDispute}
                        disabled={submitting || !disputeReason || disputeDescription.length < 10 || !disputeUnits}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4" />
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
