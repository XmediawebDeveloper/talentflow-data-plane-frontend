'use client';

import { Receipt, Download, Search, Filter, Calendar, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, ShoppingCart, CreditCard, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BillingTransaction {
  id: string;
  invoice_number: string;
  transaction_id: string | null;
  external_transaction_id: string | null;
  transaction_type: string;
  status: string;
  amount: number;
  currency: string;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  plan_id: number | null;
  plan_name: string | null;
  addon_id: number | null;
  addon_name: string | null;
  billing_interval: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  payment_method: string | null;
  card_last_four: string | null;
  card_brand: string | null;
  description: string | null;
  transaction_date: string;
  created_at: string;
}

export default function BillingHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

  useEffect(() => {
    fetchBillingHistory();
  }, [filterType]);

  const fetchBillingHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('Not authenticated. Please log in again.');
        setLoading(false);
        return;
      }

      let url = `${API_BASE}/billing/history?limit=50`;
      if (filterType !== 'all') {
        url += `&transaction_type=${filterType}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        const data = result.data || result;
        setTransactions(data.transactions || []);
        setTotalCount(data.total || 0);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || 'Failed to fetch billing history');
      }
    } catch (err) {
      console.error('[BillingHistory] Error:', err);
      setError('Failed to load billing history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(txn =>
    txn.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (txn.plan_name && txn.plan_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (txn.addon_name && txn.addon_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatAmount = (amount: number, currency: string = 'INR') => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'refunded':
        return <RefreshCw className="w-4 h-4 text-gray-600" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusStyles = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'failed':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'refunded':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'subscription':
        return <CreditCard className="w-4 h-4" />;
      case 'addon':
        return <ShoppingCart className="w-4 h-4" />;
      case 'refund':
        return <RefreshCw className="w-4 h-4" />;
      default:
        return <Receipt className="w-4 h-4" />;
    }
  };

  const getTypeStyles = (type: string) => {
    switch (type.toLowerCase()) {
      case 'subscription':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'addon':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'refund':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleDownloadInvoice = (transaction: BillingTransaction) => {
    // Generate a simple text invoice for now
    const invoiceContent = `
INVOICE
==============================
Invoice Number: ${transaction.invoice_number}
Date: ${formatDate(transaction.transaction_date)}
-------------------------------
Type: ${transaction.transaction_type.toUpperCase()}
${transaction.plan_name ? `Plan: ${transaction.plan_name}` : ''}
${transaction.addon_name ? `Addon: ${transaction.addon_name}` : ''}
${transaction.billing_interval ? `Billing: ${transaction.billing_interval}` : ''}
-------------------------------
Amount: ${formatAmount(transaction.amount)}
Tax: ${formatAmount(transaction.tax_amount)}
Discount: ${formatAmount(transaction.discount_amount)}
-------------------------------
TOTAL: ${formatAmount(transaction.total_amount)}
-------------------------------
Status: ${transaction.status.toUpperCase()}
Payment Method: ${transaction.payment_method || 'Card'}
Transaction ID: ${transaction.transaction_id || 'N/A'}
==============================
Thank you for your business!
    `.trim();

    const blob = new Blob([invoiceContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${transaction.invoice_number}.txt`;
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
              onClick={fetchBillingHistory}
              disabled={loading}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="mb-6 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by invoice number, plan, or addon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white"
          >
            <option value="all">All Types</option>
            <option value="subscription">Subscriptions</option>
            <option value="addon">Addons</option>
            <option value="refund">Refunds</option>
          </select>
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
        {!loading && !error && filteredTransactions.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <Receipt className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Billing History</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {searchQuery || filterType !== 'all'
                ? 'No transactions match your search or filter criteria.'
                : 'Your billing history will appear here once you make a subscription or addon purchase.'}
            </p>
          </div>
        )}

        {/* Transactions Table */}
        {!loading && !error && filteredTransactions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {filteredTransactions.length} of {totalCount} transactions
              </p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map((txn, index) => (
                  <tr key={txn.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{txn.invoice_number}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDate(txn.transaction_date)}</div>
                      {txn.billing_interval && (
                        <div className="text-xs text-gray-500">{txn.billing_interval}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getTypeStyles(txn.transaction_type)}`}>
                        {getTypeIcon(txn.transaction_type)}
                        {txn.transaction_type.charAt(0).toUpperCase() + txn.transaction_type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {txn.plan_name || txn.addon_name || txn.description || '-'}
                      </div>
                      {txn.plan_name && txn.billing_interval && (
                        <div className="text-xs text-gray-500">{txn.billing_interval} billing</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatAmount(txn.total_amount, txn.currency)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyles(txn.status)}`}>
                        {getStatusIcon(txn.status)}
                        {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleDownloadInvoice(txn)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Card */}
        {!loading && !error && transactions.length > 0 && (
          <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Billing Summary</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 uppercase">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 uppercase">Subscriptions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {transactions.filter(t => t.transaction_type === 'subscription').length}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 uppercase">Addon Purchases</p>
                <p className="text-2xl font-bold text-gray-900">
                  {transactions.filter(t => t.transaction_type === 'addon').length}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 uppercase">Total Spent</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatAmount(transactions.reduce((sum, t) => sum + (t.status === 'paid' ? t.total_amount : 0), 0))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
