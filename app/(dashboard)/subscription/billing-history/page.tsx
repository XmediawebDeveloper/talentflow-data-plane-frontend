'use client';

import { Receipt, Download, Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, CreditCard, RefreshCw, ExternalLink, FileText, Calendar, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/services/api';
import { generateBillingInvoicePDF } from '@/lib/utils/pdfInvoice';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ListPagination from '@/components/ListPagination';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount?: number;
  total?: number;
  unit?: string;
}

interface InvoiceMetadata {
  reason?: string;
  source?: string;
  purchase_type?: string;
  total_credits?: number;
  payment_method?: string;
  payment_reference?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  to_plan_name?: string;
  from_plan_name?: string;
  subscription_id?: number | null;
  new_plan_id?: number | null;
  previous_plan_id?: number | null;
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
  paid_at?: string | null;
  line_items: LineItem[];
  metadata: InvoiceMetadata;
  payment_method?: string | null;
  payment_status?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  subscription_start_date?: string;
  subscription_end_date?: string;
  next_billing_date?: string;
  billing_interval?: string;
  created_at: string;
  reason?: string;
  plan_name?: string;
  plan_type?: string;
  previous_plan_id?: number | null;
  new_plan_id?: number | null;
  subscription_id?: number | null;
}

interface BillingStats {
  total_invoices: number;
  total_amount: number;
  paid_count: number;
  open_count: number;
}

interface AddonTransaction {
  id: string;
  invoice_number: string;
  addon_name: string;
  amount: number;
  currency: string;
  transaction_type: string;
  status: string;
  activation_status: 'activated' | 'failed' | 'processing' | 'unknown';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  transaction_date?: string;
  created_at?: string;
}

export default function BillingHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [addonTransactions, setAddonTransactions] = useState<AddonTransaction[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Pagination state
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(10);
  const [addonPage, setAddonPage] = useState(1);
  const [addonPageSize, setAddonPageSize] = useState(10);

  useEffect(() => {
    fetchBillingData();
    fetchAddonTransactions();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setInvoicePage(1);
  }, [searchQuery]);

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/billing/invoices/billing');

      const result = res.data;
      const invoiceData: BillingInvoice[] = result.data?.invoices || [];
      setInvoices(invoiceData);

      const paid = invoiceData.filter(inv => inv.status.toUpperCase() === 'PAID');
      const open = invoiceData.filter(inv => ['OPEN', 'PENDING'].includes(inv.status.toUpperCase()));
      const totalAmount = invoiceData.reduce((sum, inv) => sum + (inv.total_amount_inr || 0), 0);

      setStats({
        total_invoices: invoiceData.length,
        total_amount: totalAmount,
        paid_count: paid.length,
        open_count: open.length,
      });
    } catch (err) {
      console.error('[BillingHistory] Error:', err);
      setError('Failed to load billing history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAddonTransactions = async () => {
    try {
      const res = await api.get('/addons/transactions');
      setAddonTransactions(res.data?.data || []);
    } catch (err) {
      console.error('[BillingHistory] Addon transactions fetch error:', err);
    }
  };

  const handleRetryActivation = async (txnId: string) => {
    setRetryingId(txnId);
    try {
      const res = await api.post('/addons/retry-activation', { billing_txn_id: txnId });
      toast.success(res.data?.message || 'Activation successful!');
      setAddonTransactions(prev =>
        prev.map(t => t.id === txnId ? { ...t, status: 'paid', activation_status: 'activated' } : t)
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Retry failed. Please try again.';
      toast.error(msg);
    } finally {
      setRetryingId(null);
    }
  };

  const getDescription = (inv: BillingInvoice) => {
    return inv.line_items?.[0]?.description || inv.metadata?.reason || inv.reason || '-';
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.plan_name && inv.plan_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    getDescription(inv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedInvoices = filteredInvoices.slice(
    (invoicePage - 1) * invoicePageSize,
    invoicePage * invoicePageSize
  );

  const paginatedAddonTransactions = addonTransactions.slice(
    (addonPage - 1) * addonPageSize,
    addonPage * addonPageSize
  );

  const formatAmount = (amount: number) =>
    `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': case 'success': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed': case 'refunded': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <CheckCircle2 className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': case 'success': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'failed': case 'refunded': return 'bg-red-100 text-red-700 border-red-200';
      case 'open': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPaymentLabel = (inv: BillingInvoice) => {
    const method = inv.payment_method || inv.metadata?.payment_method;
    const ref = inv.razorpay_payment_id || inv.metadata?.payment_reference;
    if (!method && !ref) return '-';
    if (method && ref) return `${method.charAt(0).toUpperCase() + method.slice(1)} • ${ref.slice(-8)}`;
    return method ? method.charAt(0).toUpperCase() + method.slice(1) : (ref ? `••${ref.slice(-8)}` : '-');
  };

  const handleDownloadInvoice = async (inv: BillingInvoice) => {
    setDownloadingId(inv.id);
    try {
      await generateBillingInvoicePDF(inv);
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <Receipt className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Billing History</h1>
                <p className="text-sm text-gray-600">View and download your invoices and transactions</p>
              </div>
            </div>
            <button
              onClick={() => { fetchBillingData(); fetchAddonTransactions(); }}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
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
              <p className="text-xs text-gray-500 uppercase mb-1">Open / Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.open_count}</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting payment</p>
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
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[160px]">Payment</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[130px]">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedInvoices.map((inv, index) => (
                    <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate" title={inv.invoice_number}>
                            {inv.invoice_number}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">
                        {formatIST(inv.issue_date)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900 truncate" title={getDescription(inv)}>
                          {getDescription(inv)}
                        </div>
                        {inv.plan_name && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate">{inv.plan_name.trim()}</div>
                        )}
                        {inv.subscription_start_date && (
                          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            {formatISTDate(inv.subscription_start_date)} – {formatISTDate(inv.subscription_end_date)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 truncate" title={getPaymentLabel(inv)}>
                            {getPaymentLabel(inv)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatAmount(inv.total_amount_inr || 0)}
                        </span>
                        {(inv.tax_amount_inr || 0) > 0 && (
                          <div className="text-xs text-gray-500">incl. {formatAmount(inv.tax_amount_inr)} tax</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusStyles(inv.status)}`}>
                          {getStatusIcon(inv.status)}
                          {inv.status}
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
                            disabled={downloadingId === inv.id}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download Invoice"
                          >
                            {downloadingId === inv.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Download className="w-3.5 h-3.5" />}
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

        {/* Invoices Pagination */}
        {!loading && !error && filteredInvoices.length > 0 && (
          <ListPagination
            currentPage={invoicePage}
            itemsPerPage={invoicePageSize}
            totalItems={filteredInvoices.length}
            onPageChange={setInvoicePage}
            onItemsPerPageChange={setInvoicePageSize}
            itemLabel="invoices"
          />
        )}

        {/* Purchase History (addons, seats, subscriptions) */}
        {addonTransactions.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-600" />
              <h2 className="text-base font-semibold text-gray-800">Purchase History</h2>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[130px]">Activation Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedAddonTransactions.map((txn, index) => (
                      <tr key={txn.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[160px]" title={txn.invoice_number}>
                              {txn.invoice_number}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {txn.transaction_date ? formatISTDate(txn.transaction_date) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-800 truncate block max-w-[220px]" title={txn.addon_name}>
                            {txn.addon_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {txn.activation_status === 'activated' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Activated
                            </span>
                          )}
                          {txn.activation_status === 'failed' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                              <XCircle className="w-3.5 h-3.5" />
                              Failed
                            </span>
                          )}
                          {txn.activation_status === 'processing' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
                              <Clock className="w-3.5 h-3.5" />
                              Processing
                            </span>
                          )}
                          {txn.activation_status === 'unknown' && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {txn.activation_status === 'failed' ? (
                            <button
                              onClick={() => handleRetryActivation(txn.id)}
                              disabled={retryingId === txn.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                              {retryingId === txn.id
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Retrying...</>
                                : <><RotateCcw className="w-3 h-3" /> Retry</>}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <ListPagination
              currentPage={addonPage}
              itemsPerPage={addonPageSize}
              totalItems={addonTransactions.length}
              onPageChange={setAddonPage}
              onItemsPerPageChange={setAddonPageSize}
              itemLabel="transactions"
            />
          </div>
        )}

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl sticky top-0">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Invoice Details</h2>
                  <p className="text-sm text-gray-500 font-mono">{selectedInvoice.invoice_number}</p>
                </div>
                <button onClick={() => setSelectedInvoice(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <XCircle className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Key Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Issue Date</p>
                    <p className="text-sm font-medium text-gray-900">{formatISTDate(selectedInvoice.issue_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
                    <p className="text-sm font-medium text-gray-900">{formatISTDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(selectedInvoice.status)}`}>
                      {getStatusIcon(selectedInvoice.status)}
                      {selectedInvoice.status}
                    </span>
                  </div>
                  {selectedInvoice.paid_at && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Paid At</p>
                      <p className="text-sm font-medium text-gray-900">{formatISTDate(selectedInvoice.paid_at)}</p>
                    </div>
                  )}
                  {selectedInvoice.billing_interval && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Billing Interval</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">{selectedInvoice.billing_interval.toLowerCase()}</p>
                    </div>
                  )}
                  {(selectedInvoice.payment_method || selectedInvoice.metadata?.payment_method) && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Payment</p>
                      <p className="text-sm font-medium text-gray-900">{getPaymentLabel(selectedInvoice)}</p>
                    </div>
                  )}
                </div>

                {/* Plan Info */}
                {(selectedInvoice.plan_name || selectedInvoice.plan_type) && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">Plan</p>
                      <p className="text-sm font-semibold text-blue-900">{selectedInvoice.plan_name?.trim()}</p>
                    </div>
                    {selectedInvoice.plan_type && (
                      <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                        {selectedInvoice.plan_type}
                      </span>
                    )}
                  </div>
                )}

                {/* Subscription Period */}
                {selectedInvoice.subscription_start_date && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subscription Period</p>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Start</p>
                        <p className="text-sm font-medium text-gray-900">{formatISTDate(selectedInvoice.subscription_start_date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">End</p>
                        <p className="text-sm font-medium text-gray-900">{formatISTDate(selectedInvoice.subscription_end_date)}</p>
                      </div>
                      {selectedInvoice.next_billing_date && (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Next Billing</p>
                          <p className="text-sm font-medium text-gray-900">{formatISTDate(selectedInvoice.next_billing_date)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Line Items */}
                {selectedInvoice.line_items?.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Line Items</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {selectedInvoice.line_items.map((item, idx) => (
                        <div key={idx} className="px-4 py-3 flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-700 flex-1">{item.description}</span>
                          <span className="text-sm text-gray-500 shrink-0">
                            {item.quantity} × {formatAmount(item.unit_price)}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 shrink-0 min-w-[80px] text-right">
                            {formatAmount(Math.abs(item.amount ?? item.total ?? 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-900">{formatAmount(selectedInvoice.amount_inr || 0)}</span>
                  </div>
                  {(selectedInvoice.tax_amount_inr || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tax (GST)</span>
                      <span className="text-gray-900">{formatAmount(selectedInvoice.tax_amount_inr)}</span>
                    </div>
                  )}
                  {(selectedInvoice.discount_amount_inr || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Discount</span>
                      <span className="text-green-600">-{formatAmount(selectedInvoice.discount_amount_inr)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-2 mt-1">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">{formatAmount(selectedInvoice.total_amount_inr || 0)}</span>
                  </div>
                </div>

                {/* Payment Reference */}
                {(selectedInvoice.razorpay_payment_id || selectedInvoice.razorpay_order_id) && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
                    {selectedInvoice.razorpay_payment_id && (
                      <div>
                        <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Payment ID</p>
                        <p className="text-sm text-blue-900 font-mono mt-0.5">{selectedInvoice.razorpay_payment_id}</p>
                      </div>
                    )}
                    {selectedInvoice.razorpay_order_id && (
                      <div>
                        <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Order ID</p>
                        <p className="text-sm text-blue-900 font-mono mt-0.5">{selectedInvoice.razorpay_order_id}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Reason */}
                {(selectedInvoice.reason || selectedInvoice.metadata?.reason) && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Reason</p>
                    <p className="text-sm text-gray-800">{selectedInvoice.reason || selectedInvoice.metadata?.reason}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => handleDownloadInvoice(selectedInvoice)}
                    disabled={downloadingId === selectedInvoice.id}
                    className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingId === selectedInvoice.id
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>
                      : <><Download className="w-4 h-4" /> Download Invoice</>}
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
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
