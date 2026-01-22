'use client';

import { Receipt, Download, Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, CreditCard, RefreshCw, ExternalLink, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';

// Use backend proxy instead of direct Admin API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface InvoiceMetadata {
  reason?: string;
  plan_id?: number;
  plan_name?: string;
  subscription_id?: string;
  initiated_by?: string;
  notes?: string;
  [key: string]: unknown;
}

interface BillingInvoice {
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
  metadata: InvoiceMetadata;
  reason?: string;
  new_plan_id?: number;
  previous_plan_id?: number;
  created_at: string;
}

interface BillingStats {
  total_invoices: number;
  total_amount: number;
  paid_count: number;
  open_count: number;
}

export default function BillingHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('Not authenticated. Please login again.');
        setLoading(false);
        return;
      }

      // Fetch billing history from backend proxy (which calls Admin API)
      const historyResponse = await fetch(`${API_URL}/billing/invoices/billing?skip=0&limit=100`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!historyResponse.ok) {
        throw new Error('Failed to fetch billing history');
      }

      const historyResult = await historyResponse.json();
      const invoiceData = historyResult.data?.invoices || [];
      setInvoices(invoiceData);

      // Calculate stats from invoices
      const paidInvoices = invoiceData.filter((inv: BillingInvoice) => inv.status.toUpperCase() === 'PAID');
      const openInvoices = invoiceData.filter((inv: BillingInvoice) => inv.status.toUpperCase() === 'OPEN');
      const totalAmount = invoiceData.reduce((sum: number, inv: BillingInvoice) => sum + (inv.total_amount_inr || 0), 0);

      setStats({
        total_invoices: invoiceData.length,
        total_amount: totalAmount,
        paid_count: paidInvoices.length,
        open_count: openInvoices.length,
      });
    } catch (err) {
      console.error('[BillingHistory] Error:', err);
      setError('Failed to load billing history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.metadata?.plan_name && inv.metadata.plan_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (inv.line_items?.[0]?.description && inv.line_items[0].description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
      case 'paid':
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed':
      case 'refunded':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'success':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'failed':
      case 'refunded':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type.toUpperCase()) {
      case 'BILLING':
      case 'SUBSCRIPTION':
        return 'bg-blue-100 text-blue-700';
      case 'ADDON':
        return 'bg-purple-100 text-purple-700';
      case 'REFUND':
        return 'bg-green-100 text-green-700';
      case 'DISPUTE':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const handleDownloadInvoice = (inv: BillingInvoice) => {
    const lineItemsText = inv.line_items?.map(item =>
      `  - ${item.description}: ${formatAmount(item.amount || item.unit_price)} (Qty: ${item.quantity})`
    ).join('\n') || '  No line items';

    const invoiceContent = `
INVOICE
==============================
Invoice Number: ${inv.invoice_number}
Issue Date: ${formatDate(inv.issue_date)}
Due Date: ${formatDate(inv.due_date)}
-------------------------------
Type: ${inv.invoice_type}
Reason: ${inv.reason || inv.metadata?.reason || '-'}
-------------------------------
LINE ITEMS:
${lineItemsText}
-------------------------------
Subtotal: ${formatAmount(inv.amount_inr || 0)}
Tax (GST): ${formatAmount(inv.tax_amount_inr || 0)}
Discount: -${formatAmount(inv.discount_amount_inr || 0)}
-------------------------------
TOTAL: ${formatAmount(inv.total_amount_inr || 0)}
-------------------------------
Status: ${inv.status?.toUpperCase() || 'UNKNOWN'}
==============================
Thank you for your business!
    `.trim();

    const blob = new Blob([invoiceContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${inv.invoice_number}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <Receipt className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Billing History</h1>
                <p className="text-sm text-gray-600">View and download your invoices and transactions</p>
              </div>
            </div>
            <button
              onClick={fetchBillingData}
              disabled={loading}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(stats.total_amount)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.total_invoices} invoices</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Paid</p>
              <p className="text-2xl font-bold text-green-600">{stats.paid_count}</p>
              <p className="text-xs text-gray-500 mt-1">Completed payments</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Open</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.open_count}</p>
              <p className="text-xs text-gray-500 mt-1">Pending invoices</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Total Invoices</p>
              <p className="text-2xl font-bold text-blue-600">{stats.total_invoices}</p>
              <p className="text-xs text-gray-500 mt-1">All time</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by invoice number, plan name, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            />
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
            <p className="mt-4 text-gray-500">Loading billing history...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredInvoices.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <Receipt className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Billing History</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {searchQuery
                ? 'No invoices match your search criteria.'
                : 'Your billing history will appear here once you make a subscription or addon purchase.'}
            </p>
          </div>
        )}

        {/* Invoices Table */}
        {!loading && !error && filteredInvoices.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Issue Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredInvoices.map((inv, index) => (
                    <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate" title={inv.invoice_number}>
                            {inv.invoice_number || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{formatDate(inv.issue_date)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{formatDate(inv.due_date)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900 truncate" title={inv.metadata?.plan_name || inv.line_items?.[0]?.description || ''}>
                          {inv.metadata?.plan_name || inv.line_items?.[0]?.description || '-'}
                        </div>
                        {inv.metadata?.reason && (
                          <div className="text-xs text-gray-500 truncate mt-0.5" title={inv.metadata.reason}>
                            {inv.metadata.reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getTypeStyles(inv.invoice_type || 'unknown')}`}>
                          {inv.invoice_type || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatAmount(inv.total_amount_inr || 0)}
                        </span>
                        {inv.tax_amount_inr > 0 && (
                          <div className="text-xs text-gray-500">
                            incl. {formatAmount(inv.tax_amount_inr)} tax
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusStyles(inv.status || 'unknown')}`}>
                          {getStatusIcon(inv.status || 'unknown')}
                          {inv.status || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Download Invoice"
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

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Invoice Details</h2>
                  <p className="text-sm text-gray-600">{selectedInvoice.invoice_number}</p>
                </div>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Issue Date</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedInvoice.issue_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Due Date</p>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Status</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(selectedInvoice.status)}`}>
                      {getStatusIcon(selectedInvoice.status)}
                      {selectedInvoice.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Type</p>
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getTypeStyles(selectedInvoice.invoice_type)}`}>
                      {selectedInvoice.invoice_type}
                    </span>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-500 uppercase">Line Items</p>
                  </div>
                  <div className="p-4 space-y-3">
                    {selectedInvoice.line_items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-sm text-gray-600">{item.description}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {item.quantity} x {formatAmount(item.unit_price)} = {formatAmount(item.amount)}
                        </span>
                      </div>
                    ))}
                    {selectedInvoice.metadata?.plan_name && (
                      <div className="flex justify-between border-t border-gray-100 pt-2">
                        <span className="text-sm text-gray-600">Plan</span>
                        <span className="text-sm font-medium text-gray-900">{selectedInvoice.metadata.plan_name}</span>
                      </div>
                    )}
                    {selectedInvoice.metadata?.reason && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Reason</span>
                        <span className="text-sm font-medium text-gray-900">{selectedInvoice.metadata.reason}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 border-t border-gray-200 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900">{formatAmount(selectedInvoice.amount_inr || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax (GST)</span>
                    <span className="text-gray-900">{formatAmount(selectedInvoice.tax_amount_inr || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="text-green-600">-{formatAmount(selectedInvoice.discount_amount_inr || 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold border-t border-gray-200 pt-2">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">{formatAmount(selectedInvoice.total_amount_inr || 0)}</span>
                  </div>
                </div>

                {selectedInvoice.metadata?.initiated_by && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600 font-medium">Initiated By</p>
                    <p className="text-sm text-blue-900">{selectedInvoice.metadata.initiated_by}</p>
                  </div>
                )}

                {selectedInvoice.metadata?.notes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 font-medium">Notes</p>
                    <p className="text-sm text-gray-900">{selectedInvoice.metadata.notes}</p>
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => handleDownloadInvoice(selectedInvoice)}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Invoice
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
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
