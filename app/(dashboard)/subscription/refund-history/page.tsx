'use client';

import { RotateCcw, Download, Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, CreditCard, RefreshCw, ExternalLink, FileText, Filter, Calendar } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

// Use backend proxy instead of direct Admin API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface RefundMetadata {
  reason?: string;
  notes?: string;
  processed_by?: string;
  refund_method?: string;
  stripe_refund_id?: string | null;
  refund_percentage?: number;
  original_invoice_id?: number | null;
  original_invoice_number?: string;
  [key: string]: unknown;
}

interface RefundInvoice {
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
  metadata: RefundMetadata;
  created_at: string;
}

interface RefundStats {
  total_refunds: number;
  total_amount: number;
  completed_count: number;
  pending_count: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
];

export default function RefundHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState<RefundInvoice[]>([]);
  const [stats, setStats] = useState<RefundStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRefund, setSelectedRefund] = useState<RefundInvoice | null>(null);

  // New filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    fetchRefundData();
  }, []);

  const fetchRefundData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('Not authenticated. Please login again.');
        setLoading(false);
        return;
      }

      // Fetch refund invoices from backend proxy (which calls Admin API)
      const refundResponse = await fetch(`${API_URL}/billing/invoices/refunds?skip=0&limit=100`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!refundResponse.ok) {
        throw new Error('Failed to fetch refund history');
      }

      const refundResult = await refundResponse.json();
      const refundData = refundResult.data?.invoices || [];
      setRefunds(refundData);

      // Calculate stats from refunds
      const completedRefunds = refundData.filter((r: RefundInvoice) => ['PAID', 'REFUNDED', 'COMPLETED'].includes(r.status.toUpperCase()));
      const pendingRefunds = refundData.filter((r: RefundInvoice) => ['PENDING', 'PROCESSING'].includes(r.status.toUpperCase()));
      const totalAmount = refundData.reduce((sum: number, r: RefundInvoice) => sum + Math.abs(r.total_amount_inr || 0), 0);

      setStats({
        total_refunds: refundData.length,
        total_amount: totalAmount,
        completed_count: completedRefunds.length,
        pending_count: pendingRefunds.length,
      });
    } catch (err) {
      console.error('[RefundHistory] Error:', err);
      setError('Failed to load refund history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter refunds based on search, status, and date range
  const filteredRefunds = useMemo(() => {
    return refunds.filter(inv => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.metadata?.original_invoice_number && inv.metadata.original_invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inv.line_items?.[0]?.description && inv.line_items[0].description.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status filter
      const matchesStatus = statusFilter === 'all' ||
        inv.status.toLowerCase() === statusFilter.toLowerCase() ||
        (statusFilter === 'completed' && ['paid', 'refunded', 'completed', 'success'].includes(inv.status.toLowerCase()));

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
  }, [refunds, searchQuery, statusFilter, startDate, endDate]);

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
      case 'refunded':
      case 'completed':
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending':
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'refunded':
      case 'completed':
      case 'success':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':
      case 'processing':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'failed':
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleDownloadRefund = (inv: RefundInvoice) => {
    const refundContent = `
REFUND RECEIPT
==============================
Refund Number: ${inv.invoice_number}
Issue Date: ${formatDate(inv.issue_date)}
-------------------------------
Original Invoice: ${inv.metadata?.original_invoice_number || '-'}
Reason: ${inv.metadata?.reason || 'Refund'}
Refund Method: ${inv.metadata?.refund_method || '-'}
Processed By: ${inv.metadata?.processed_by || '-'}
-------------------------------
Description: ${inv.line_items?.[0]?.description || '-'}
-------------------------------
Refund Amount: ${formatAmount(Math.abs(inv.total_amount_inr))}
-------------------------------
Status: ${inv.status.toUpperCase()}
${inv.metadata?.notes ? `Notes: ${inv.metadata.notes}` : ''}
==============================
Refund processed successfully.
    `.trim();

    const blob = new Blob([refundContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${inv.invoice_number}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export filtered data to CSV
  const handleExportCSV = () => {
    const csvHeaders = ['Refund #', 'Date', 'Original Invoice', 'Reason', 'Amount', 'Status', 'Refund Method', 'Processed By'];
    const csvRows = filteredRefunds.map(r => [
      r.invoice_number || '',
      formatDate(r.issue_date),
      r.metadata?.original_invoice_number || '',
      r.metadata?.reason || r.line_items?.[0]?.description || '',
      Math.abs(r.total_amount_inr || 0).toFixed(2),
      r.status || '',
      r.metadata?.refund_method || '',
      r.metadata?.processed_by || '',
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
    link.download = `refund-history-${timestamp}.csv`;
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
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center shadow-lg">
                <RotateCcw className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Refund History</h1>
                <p className="text-sm text-gray-600">View your refund transactions and download receipts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                disabled={loading || filteredRefunds.length === 0}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={fetchRefundData}
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
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Total Refunded</p>
              <p className="text-2xl font-bold text-green-600">{formatAmount(stats.total_amount)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.total_refunds} refund{stats.total_refunds !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Completed</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completed_count}</p>
              <p className="text-xs text-gray-500 mt-1">Processed successfully</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending_count}</p>
              <p className="text-xs text-gray-500 mt-1">Being processed</p>
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
                placeholder="Search refunds..."
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
            <p className="mt-4 text-gray-500">Loading refund history...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredRefunds.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <RotateCcw className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Refunds</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {hasActiveFilters
                ? 'No refunds match your filter criteria. Try adjusting your filters.'
                : 'You have no refund transactions. Refunds will appear here when you cancel a subscription or request a refund.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Refunds Table */}
        {!loading && !error && filteredRefunds.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {filteredRefunds.length} refund{filteredRefunds.length !== 1 ? 's' : ''}
                {hasActiveFilters && ` (filtered from ${refunds.length})`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Refund #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">Original Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[140px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRefunds.map((refund, index) => (
                    <tr key={refund.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <RotateCcw className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate" title={refund.invoice_number || ''}>
                            {refund.invoice_number || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{formatDate(refund.issue_date)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900 truncate" title={refund.metadata?.original_invoice_number || ''}>
                          {refund.metadata?.original_invoice_number || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-600 truncate" title={refund.metadata?.reason || refund.line_items?.[0]?.description || ''}>
                          {refund.metadata?.reason || refund.line_items?.[0]?.description || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-green-600">
                          +{formatAmount(Math.abs(refund.total_amount_inr || 0))}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusStyles(refund.status || 'unknown')}`}>
                          {getStatusIcon(refund.status || 'unknown')}
                          {refund.status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedRefund(refund)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadRefund(refund)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Download Receipt"
                          >
                            <Download className="w-3.5 h-3.5" />
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

        {/* Refund Detail Modal */}
        {selectedRefund && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-green-50 rounded-t-xl">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Refund Details</h2>
                  <p className="text-sm text-gray-600">{selectedRefund.invoice_number}</p>
                </div>
                <button
                  onClick={() => setSelectedRefund(null)}
                  className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Issue Date</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedRefund.issue_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Original Invoice</p>
                    <p className="text-sm font-medium text-gray-900 font-mono">{selectedRefund.metadata?.original_invoice_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Status</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(selectedRefund.status)}`}>
                      {getStatusIcon(selectedRefund.status)}
                      {selectedRefund.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Refund Method</p>
                    <p className="text-sm font-medium text-gray-900">{selectedRefund.metadata?.refund_method || '-'}</p>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase">Refund Details</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Description</span>
                      <span className="text-sm font-medium text-gray-900">{selectedRefund.line_items?.[0]?.description || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Reason</span>
                      <span className="text-sm font-medium text-gray-900">{selectedRefund.metadata?.reason || '-'}</span>
                    </div>
                    {selectedRefund.metadata?.refund_percentage && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Refund Percentage</span>
                        <span className="text-sm font-medium text-gray-900">{selectedRefund.metadata.refund_percentage}%</span>
                      </div>
                    )}
                    {selectedRefund.metadata?.processed_by && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Processed By</span>
                        <span className="text-sm font-medium text-gray-900">{selectedRefund.metadata.processed_by}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Refund Amount</span>
                    <span className="text-2xl font-bold text-green-600">
                      +{formatAmount(Math.abs(selectedRefund.total_amount_inr || 0))}
                    </span>
                  </div>
                </div>

                {selectedRefund.metadata?.notes && (
                  <div className="p-3 bg-gray-50 rounded-lg mb-6">
                    <p className="text-xs text-gray-600 font-medium">Notes</p>
                    <p className="text-sm text-gray-900">{selectedRefund.metadata.notes}</p>
                  </div>
                )}

                {selectedRefund.metadata?.stripe_refund_id && (
                  <div className="p-3 bg-blue-50 rounded-lg mb-6">
                    <p className="text-xs text-blue-600 font-medium">Stripe Refund ID</p>
                    <p className="text-sm text-blue-900 font-mono">{selectedRefund.metadata.stripe_refund_id}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDownloadRefund(selectedRefund)}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Receipt
                  </button>
                  <button
                    onClick={() => setSelectedRefund(null)}
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
