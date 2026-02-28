'use client';

import { AlertTriangle, Search, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Download, ExternalLink, MessageSquare, RefreshCw, Shield, Filter, Calendar } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { generateDisputeRecordPDF } from '@/lib/utils/pdfInvoice';
import { toast } from 'sonner';

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

  useEffect(() => {
    fetchDisputeData();
  }, []);

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatAmount = (amount: number) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'won':
      case 'resolved':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'open':
      case 'pending':
      case 'under_review':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'lost':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'won':
      case 'resolved':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'open':
      case 'pending':
      case 'under_review':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'lost':
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-orange-100 text-orange-700 border-orange-200';
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
      formatDate(d.issue_date),
      formatDate(d.metadata?.deadline || d.deadline || null),
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
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                <AlertTriangle className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Dispute History</h1>
                <p className="text-sm text-gray-600">View and manage payment disputes</p>
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
                onClick={fetchDisputeData}
                disabled={loading}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Total Disputed</p>
              <p className="text-2xl font-bold text-orange-600">{formatAmount(stats.total_amount)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.total_disputes} dispute{stats.total_disputes !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Open Disputes</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.open_count}</p>
              <p className="text-xs text-gray-500 mt-1">Under review</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Resolved</p>
              <p className="text-2xl font-bold text-gray-900">{stats.resolved_count}</p>
              <p className="text-xs text-gray-500 mt-1">Completed disputes</p>
            </div>
          </div>
        )}

        {/* Filters Section */}
        <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search disputes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 appearance-none bg-white"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                placeholder="From date"
              />
            </div>

            {/* End Date */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                placeholder="To date"
              />
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
            <p className="mt-4 text-gray-500">Loading dispute history...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredDisputes.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Disputes</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {hasActiveFilters
                ? 'No disputes match your filter criteria. Try adjusting your filters.'
                : 'Great news! You have no payment disputes. Disputes will appear here if any payment issues are raised.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </button>
            )}
            {!hasActiveFilters && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
                <p className="text-sm text-blue-700">
                  <strong>Need help?</strong> If you have concerns about a payment, please contact our support team.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Disputes Table */}
        {!loading && !error && filteredDisputes.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredDisputes.length} dispute{filteredDisputes.length !== 1 ? 's' : ''}
                {hasActiveFilters && ` (filtered from ${disputes.length})`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Dispute #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">Original Transaction</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[140px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDisputes.map((dispute, index) => (
                    <tr key={dispute.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate" title={dispute.invoice_number || ''}>
                            {dispute.invoice_number || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{formatDate(dispute.issue_date)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900 truncate" title={dispute.metadata?.original_invoice_number || ''}>
                          {dispute.metadata?.original_invoice_number || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-600 truncate" title={dispute.metadata?.reason || dispute.reason || dispute.line_items?.[0]?.description || ''}>
                          {dispute.metadata?.reason || dispute.reason || dispute.line_items?.[0]?.description || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-orange-600">
                          {formatAmount(dispute.total_amount_inr || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusStyles(dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || 'unknown')}`}>
                          {getStatusIcon(dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || 'unknown')}
                          {dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedDispute(dispute)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadDispute(dispute)}
                            disabled={downloadingId === dispute.id}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download Record"
                          >
                            {downloadingId === dispute.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
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

        {/* Dispute Detail Modal */}
        {selectedDispute && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-orange-50 rounded-t-xl">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Dispute Details</h2>
                  <p className="text-sm text-gray-600">{selectedDispute.invoice_number}</p>
                </div>
                <button
                  onClick={() => setSelectedDispute(null)}
                  className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Issue Date</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedDispute.issue_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Deadline</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedDispute.metadata?.deadline || selectedDispute.deadline || null)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Dispute Status</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(selectedDispute.metadata?.dispute_status || selectedDispute.dispute_status || selectedDispute.status)}`}>
                      {getStatusIcon(selectedDispute.metadata?.dispute_status || selectedDispute.dispute_status || selectedDispute.status)}
                      {selectedDispute.metadata?.dispute_status || selectedDispute.dispute_status || selectedDispute.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Original Invoice</p>
                    <p className="text-sm font-medium text-gray-900 font-mono">{selectedDispute.metadata?.original_invoice_number || '-'}</p>
                  </div>
                  {selectedDispute.payment_method && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Payment Method</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">{selectedDispute.payment_method}</p>
                    </div>
                  )}
                  {selectedDispute.paid_at && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Paid At</p>
                      <p className="text-sm font-medium text-gray-900">{formatDate(selectedDispute.paid_at)}</p>
                    </div>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase">Dispute Details</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Description</span>
                      <span className="text-sm font-medium text-gray-900">{selectedDispute.line_items?.[0]?.description || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Reason</span>
                      <span className="text-sm font-medium text-gray-900">{selectedDispute.metadata?.reason || selectedDispute.reason || '-'}</span>
                    </div>
                    {(selectedDispute.metadata?.customer_claim || selectedDispute.customer_claim) && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Customer Claim</span>
                        <span className="text-sm font-medium text-gray-900 text-right max-w-xs">{selectedDispute.metadata?.customer_claim || selectedDispute.customer_claim}</span>
                      </div>
                    )}
                    {selectedDispute.metadata?.bank_reference && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Bank Reference</span>
                        <span className="text-sm font-medium text-gray-900 font-mono">{selectedDispute.metadata.bank_reference}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Disputed Amount</span>
                    <span className="text-2xl font-bold text-orange-600">
                      {formatAmount(selectedDispute.total_amount_inr || 0)}
                    </span>
                  </div>
                </div>

                {selectedDispute.metadata?.razorpay_dispute_id && (
                  <div className="p-3 bg-blue-50 rounded-lg mb-6">
                    <p className="text-xs text-blue-600 font-medium">Razorpay Dispute ID</p>
                    <p className="text-sm text-blue-900 font-mono">{selectedDispute.metadata.razorpay_dispute_id}</p>
                  </div>
                )}

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Need Assistance?</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        If you have questions about this dispute, please contact our support team for assistance.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDownloadDispute(selectedDispute)}
                    disabled={downloadingId === selectedDispute.id}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingId === selectedDispute.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>
                    ) : (
                      <><Download className="w-4 h-4" /> Download Record</>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedDispute(null)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
