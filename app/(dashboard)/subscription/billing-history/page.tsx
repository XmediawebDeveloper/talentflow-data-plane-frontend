'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Receipt, Download, Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, CreditCard, RefreshCw, ExternalLink, FileText, Calendar, RotateCcw, Package, Sparkles, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/services/api';
import { generateBillingInvoicePDF } from '@/lib/utils/pdfInvoice';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ListPagination from '@/components/ListPagination';
import { RowActions } from '@/components/subscription/RowActionsMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';

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

function normalizeBillingInvoice(inv: BillingInvoice): BillingInvoice {
  const status = (inv.status || '').toUpperCase();
  const normalizedDueDate =
    status === 'PAID' && inv.billing_interval && (inv.next_billing_date || inv.subscription_end_date)
      ? (inv.next_billing_date || inv.subscription_end_date || inv.due_date)
      : inv.due_date;

  return normalizedDueDate === inv.due_date
    ? inv
    : { ...inv, due_date: normalizedDueDate };
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

  // Two-step view: 'cards' shows only the 4 stat tiles; 'list' shows the
  // search + invoice list + addon transactions. Initial render is 'cards'
  // so the user explicitly drills in by clicking a stat card.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'open'>('all');
  // Which table the list view shows — formal invoices or add-on purchase history.
  const [billingTab, setBillingTab] = useState<'invoices' | 'purchases'>('invoices');
  // Separate search for the Purchase History tab — the two tabs match on
  // different fields, so they keep independent queries.
  const [addonSearch, setAddonSearch] = useState('');

  const openListView = (filter: 'all' | 'paid' | 'open') => {
    setStatusFilter(filter);
    setPageView('list');
    // The stat cards all filter invoice data, so always surface the Invoices
    // tab — otherwise a click from the Purchase History tab changes nothing the
    // user can see.
    setBillingTab('invoices');
  };

  // Persist/restore list view state + scroll position across navigation.
  // Re-detect the scroll container when the two-step view flips.
  const rootRef = useScrollRestoration<HTMLElement>('sub-billing-history', !loading, [pageView]);
  useListStatePersistence(
    'sub-billing-history',
    { pageView, statusFilter, searchQuery, invoicePage, invoicePageSize, addonPage, addonPageSize },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (s.statusFilter === 'all' || s.statusFilter === 'paid' || s.statusFilter === 'open') setStatusFilter(s.statusFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.invoicePage === 'number') setInvoicePage(s.invoicePage);
      if (typeof s.invoicePageSize === 'number') setInvoicePageSize(s.invoicePageSize);
      if (typeof s.addonPage === 'number') setAddonPage(s.addonPage);
      if (typeof s.addonPageSize === 'number') setAddonPageSize(s.addonPageSize);
    },
  );

  useEffect(() => {
    fetchBillingData();
    fetchAddonTransactions();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setInvoicePage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    setAddonPage(1);
  }, [addonSearch]);

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/billing/invoices/billing');

      const result = res.data;
      const invoiceData: BillingInvoice[] = ((result.data?.invoices || []) as BillingInvoice[]).map(normalizeBillingInvoice);
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

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch =
      inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.plan_name && inv.plan_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      getDescription(inv).toLowerCase().includes(searchQuery.toLowerCase());

    const statusUpper = inv.status.toUpperCase();
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'paid' && statusUpper === 'PAID') ||
      (statusFilter === 'open' && ['OPEN', 'PENDING'].includes(statusUpper));

    return matchesSearch && matchesStatus;
  });

  const paginatedInvoices = filteredInvoices.slice(
    (invoicePage - 1) * invoicePageSize,
    invoicePage * invoicePageSize
  );

  const filteredAddonTransactions = addonTransactions.filter(txn => {
    const q = addonSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (txn.invoice_number?.toLowerCase().includes(q) ?? false) ||
      (txn.addon_name?.toLowerCase().includes(q) ?? false)
    );
  });

  const paginatedAddonTransactions = filteredAddonTransactions.slice(
    (addonPage - 1) * addonPageSize,
    addonPage * addonPageSize
  );

  const formatAmount = (amount: number) =>
    `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid': case 'success': return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'pending': return <Clock className="h-3.5 w-3.5" />;
      case 'failed': case 'refunded': return <XCircle className="h-3.5 w-3.5" />;
      default: return <CheckCircle2 className="h-3.5 w-3.5" />;
    }
  };

  // Canonical status → shared Badge variant (same status looks the same everywhere).
  const getStatusVariant = (status: string): 'success' | 'warning' | 'destructive' | 'info' | 'muted' => {
    switch (status.toLowerCase()) {
      case 'paid': case 'success': return 'success';
      case 'pending': return 'warning';
      case 'failed': case 'refunded': return 'destructive';
      case 'open': return 'info';
      default: return 'muted';
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
    <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Billing History' }]} />

        {/* Header — title + actions (matches Dispute History) */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-50">Billing History</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              View and download your invoices, track payments, and review your add-on purchase history.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { fetchBillingData(); fetchAddonTransactions(); }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-70"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards — clicking a card drills into the invoice list with the matching filter applied */}
        {stats && (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => openListView('all')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'all' ? 'border-brand-blue/40 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Total Amount</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-gray-900 dark:text-slate-50">{formatAmount(stats.total_amount)}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">{stats.total_invoices} invoices</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                  <Receipt className="h-5 w-5 text-brand-blue" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('paid')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'paid' ? 'border-brand-teal/40 ring-brand-teal/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-teal/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Paid</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-teal">{stats.paid_count}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Completed payments</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                  <CheckCircle2 className="h-5 w-5 text-brand-teal" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('open')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'open' ? 'border-brand-orange/40 ring-brand-orange/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-orange/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Open / Pending</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-orange-deep">{stats.open_count}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">Awaiting payment</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                  <Clock className="h-5 w-5 text-brand-orange-deep" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('all')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-cyan/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && statusFilter === 'all' ? 'border-brand-cyan/40 ring-brand-cyan/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-cyan/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Total Invoices</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-blue">{stats.total_invoices}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">All time</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 shadow-sm shadow-brand-cyan/10">
                  <FileText className="h-5 w-5 text-brand-cyan" />
                </span>
              </div>
            </button>
          </div>
        )}

        {pageView === 'list' && (
          <>
            {/* Sub-tabs — switch the list between formal invoices and add-on
                purchase history. Light underline style so it reads as a level
                below the subscription folder-tabs this page sits under. */}
            <div role="tablist" aria-label="Billing sections" className="mb-5 flex items-center gap-6 border-b border-gray-200 dark:border-slate-700">
              {([
                { id: 'invoices', label: 'Invoices', count: invoices.length },
                { id: 'purchases', label: 'Purchase History', count: addonTransactions.length },
              ] as const).map((t) => {
                const active = billingTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setBillingTab(t.id)}
                    className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                      active
                        ? 'border-brand-blue text-brand-blue'
                        : 'border-transparent text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600 hover:text-brand-blue'
                    }`}
                  >
                    {t.label}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      active
                        ? 'bg-brand-blue/10 text-brand-blue'
                        : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {billingTab === 'invoices' && (
              <>
            {/* Search */}
            <div className="mb-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by invoice number, plan name, or description"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                />
              </div>
            </div>

        {/* Error State */}
        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Loading State — mirrors the invoices table columns (Invoice, Timestamp, Description, Payment, Amount, Status, Actions) */}
        {loading && (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3.5 sm:px-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header */}
                <div className="grid grid-cols-[200px_160px_minmax(0,1fr)_160px_130px_100px_100px] gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50/80 dark:bg-slate-800/50 px-4 py-3.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="ml-auto h-3 w-16" />
                  <Skeleton className="mx-auto h-3 w-14" />
                  <Skeleton className="ml-auto h-3 w-14" />
                </div>
                {/* Rows */}
                <div className="divide-y divide-gray-100">
                  {Array.from({ length: 6 }).map((_, r) => (
                    <div key={r} className="grid grid-cols-[200px_160px_minmax(0,1fr)_160px_130px_100px_100px] items-center gap-4 px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-40" />
                      <div className="flex items-center gap-1.5">
                        <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="ml-auto h-4 w-16" />
                      <Skeleton className="mx-auto h-6 w-16 rounded-full" />
                      <div className="ml-auto flex items-center gap-1.5">
                        <Skeleton className="h-7 w-14 rounded-md" />
                        <Skeleton className="h-7 w-7 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredInvoices.length === 0 && (
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Receipt className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">No Billing History</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-slate-500">
              {searchQuery
                ? 'No invoices match your search criteria.'
                : 'Your billing history will appear here once you make a subscription or addon purchase.'}
            </p>
          </div>
        )}

        {/* Invoices Table */}
        {!loading && !error && filteredInvoices.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3.5 sm:px-6">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Invoices</h2>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  Showing {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full min-w-[800px] tf-premium-table">
                <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                  <tr className="text-left">
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[200px]">Invoice</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[160px]">Timestamp</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Description</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[160px]">Payment</th>
                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[130px]">Amount</th>
                    <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[100px]">Status</th>
                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[100px] tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-5 py-5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                            <FileText className="h-4 w-4 text-brand-blue" />
                          </span>
                          <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-slate-50" title={inv.invoice_number}>
                            {inv.invoice_number}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5 text-sm text-gray-700 dark:text-slate-300">
                        {formatIST(inv.issue_date)}
                      </td>
                      <td className="px-5 py-5">
                        <div className="truncate text-sm font-medium text-gray-900 dark:text-slate-50" title={getDescription(inv)}>
                          {getDescription(inv)}
                        </div>
                        {inv.plan_name && (
                          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-500">{inv.plan_name.trim()}</div>
                        )}
                        {inv.subscription_start_date && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {formatISTDate(inv.subscription_start_date)} – {formatISTDate(inv.subscription_end_date)}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
                          <span className="min-w-0 truncate text-sm text-gray-700 dark:text-slate-300" title={getPaymentLabel(inv)}>
                            {getPaymentLabel(inv)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">
                          {formatAmount(inv.total_amount_inr || 0)}
                        </span>
                        {(inv.tax_amount_inr || 0) > 0 && (
                          <div className="text-xs text-gray-500 dark:text-slate-500">incl. {formatAmount(inv.tax_amount_inr)} tax</div>
                        )}
                      </td>
                      <td className="px-5 py-5 text-center">
                        <Badge variant={getStatusVariant(inv.status)} className="capitalize">
                          {getStatusIcon(inv.status)}
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-5 text-right tf-sticky-col">
                        <RowActions
                          menuLabel="Invoice actions"
                          actions={[
                            { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedInvoice(inv) },
                            { key: 'download', label: 'Download Invoice', icon: Download, loading: downloadingId === inv.id, onClick: () => handleDownloadInvoice(inv) },
                          ]}
                        />
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
              </>
            )}

            {billingTab === 'purchases' && (
              addonTransactions.length > 0 ? (
              <>
            {/* Search */}
            <div className="mb-5 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by invoice number or add-on name"
                  value={addonSearch}
                  onChange={(e) => setAddonSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                />
              </div>
            </div>

            {filteredAddonTransactions.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-3.5 sm:px-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                <Package className="h-5 w-5 text-brand-orange-deep" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Purchase History</h2>
                <p className="text-xs text-gray-500 dark:text-slate-500">Addons, seats &amp; one-time purchases</p>
              </div>
            </div>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full min-w-[750px] tf-premium-table">
                <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                  <tr className="text-left">
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Invoice</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Date</th>
                    <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Description</th>
                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[110px]">Amount</th>
                    <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[130px]">Activation</th>
                    <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500 w-[120px] tf-sticky-col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAddonTransactions.map((txn) => (
                    <tr key={txn.id}>
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15">
                            <FileText className="h-4 w-4 text-brand-cyan" />
                          </span>
                          <span className="block max-w-[160px] truncate text-sm font-medium text-gray-900 dark:text-slate-50" title={txn.invoice_number}>
                            {txn.invoice_number}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5 text-sm text-gray-600 dark:text-slate-400">
                        {txn.transaction_date ? formatISTDate(txn.transaction_date) : '-'}
                      </td>
                      <td className="px-5 py-5">
                        <span className="block max-w-[220px] truncate text-sm text-gray-800 dark:text-slate-100" title={txn.addon_name}>
                          {txn.addon_name}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">
                          ₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-center">
                        {txn.activation_status === 'activated' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-2xs font-medium text-brand-teal ring-1 ring-brand-teal/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Activated
                          </span>
                        )}
                        {txn.activation_status === 'failed' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive-subtle px-2.5 py-1 text-2xs font-medium text-destructive ring-1 ring-destructive-line">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </span>
                        )}
                        {txn.activation_status === 'processing' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2.5 py-1 text-2xs font-medium text-warning ring-1 ring-warning-line">
                            <Clock className="h-3 w-3" />
                            Processing
                          </span>
                        )}
                        {txn.activation_status === 'unknown' && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-5 py-5 text-center tf-sticky-col">
                        {txn.activation_status === 'failed' ? (
                          <button
                            onClick={() => handleRetryActivation(txn.id)}
                            disabled={retryingId === txn.id}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-orange/25 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {retryingId === txn.id
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Retrying...</>
                              : <><RotateCcw className="h-3 w-3" /> Retry</>}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              currentPage={addonPage}
              itemsPerPage={addonPageSize}
              totalItems={filteredAddonTransactions.length}
              onPageChange={setAddonPage}
              onItemsPerPageChange={setAddonPageSize}
              itemLabel="transactions"
            />
          </div>
            ) : (
              <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-800 ring-1 ring-gray-200 dark:ring-slate-700">
                  <Search className="h-7 w-7 text-gray-400 dark:text-slate-500" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">No matching purchases</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-slate-500">
                  No add-on purchases match your search. Try a different invoice number or add-on name.
                </p>
              </div>
            )}
              </>
              ) : (
                <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15">
                    <Package className="h-7 w-7 text-brand-orange-deep" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50">No Add-on Purchases</h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-slate-500">
                    Add-ons, seats and one-time purchases will appear here once you buy them.
                  </p>
                </div>
              )
            )}
          </>
        )}

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90dvh] flex flex-col w-full max-w-[95vw] sm:max-w-2xl overflow-hidden rounded-2xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
              {/* Modal Header */}
              <div className="flex-shrink-0 relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
                <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                      <Receipt className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold">Invoice Details</h2>
                      <p className="mt-0.5 break-all font-mono text-sm text-white/75">{selectedInvoice.invoice_number}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
                {/* Key Info Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-2xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Issue Date</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedInvoice.issue_date)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-2xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Due Date</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedInvoice.due_date)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                    <p className="text-2xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Status</p>
                    <Badge variant={getStatusVariant(selectedInvoice.status)} className="mt-1 capitalize">
                      {getStatusIcon(selectedInvoice.status)}
                      {selectedInvoice.status}
                    </Badge>
                  </div>
                  {selectedInvoice.paid_at && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="text-2xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Paid At</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedInvoice.paid_at)}</p>
                    </div>
                  )}
                  {selectedInvoice.billing_interval && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="text-2xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Billing Interval</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-gray-900 dark:text-slate-50">{selectedInvoice.billing_interval.toLowerCase()}</p>
                    </div>
                  )}
                  {(selectedInvoice.payment_method || selectedInvoice.metadata?.payment_method) && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
                      <p className="text-2xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Payment</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-50">{getPaymentLabel(selectedInvoice)}</p>
                    </div>
                  )}
                </div>

                {/* Plan Info */}
                {(selectedInvoice.plan_name || selectedInvoice.plan_type) && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] px-4 py-3">
                    <div>
                      <p className="text-2xs uppercase tracking-wider text-brand-blue/70">Plan</p>
                      <p className="mt-0.5 text-sm font-semibold text-brand-blue">{selectedInvoice.plan_name?.trim()}</p>
                    </div>
                    {selectedInvoice.plan_type && (
                      <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-2xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
                        {selectedInvoice.plan_type}
                      </span>
                    )}
                  </div>
                )}

                {/* Subscription Period */}
                {selectedInvoice.subscription_start_date && (
                  <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                    <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Subscription Period</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 p-4">
                      <div>
                        <p className="text-2xs text-gray-400 dark:text-slate-500">Start</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedInvoice.subscription_start_date)}</p>
                      </div>
                      <div>
                        <p className="text-2xs text-gray-400 dark:text-slate-500">End</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedInvoice.subscription_end_date)}</p>
                      </div>
                      {selectedInvoice.next_billing_date && (
                        <div>
                          <p className="text-2xs text-gray-400 dark:text-slate-500">Next Billing</p>
                          <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-slate-50">{formatISTDate(selectedInvoice.next_billing_date)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Line Items */}
                {selectedInvoice.line_items?.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                    <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 py-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Line Items</p>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
                      {selectedInvoice.line_items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-4 px-4 py-3">
                          <span className="flex-1 text-sm text-gray-700 dark:text-slate-300">{item.description}</span>
                          <span className="shrink-0 text-sm text-gray-500 dark:text-slate-500">
                            {item.quantity} × {formatAmount(item.unit_price)}
                          </span>
                          <span className="min-w-[80px] shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-slate-50">
                            {formatAmount(Math.abs(item.amount ?? item.total ?? 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="space-y-2 border-t border-gray-100 dark:border-slate-700/60 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-slate-500">Subtotal</span>
                    <span className="text-gray-900 dark:text-slate-50">{formatAmount(selectedInvoice.amount_inr || 0)}</span>
                  </div>
                  {(selectedInvoice.tax_amount_inr || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-slate-500">Tax (GST)</span>
                      <span className="text-gray-900 dark:text-slate-50">{formatAmount(selectedInvoice.tax_amount_inr)}</span>
                    </div>
                  )}
                  {(selectedInvoice.discount_amount_inr || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-slate-500">Discount</span>
                      <span className="text-brand-teal">-{formatAmount(selectedInvoice.discount_amount_inr)}</span>
                    </div>
                  )}
                  <div className="relative mt-2 flex items-center justify-between overflow-hidden rounded-xl bg-brand-blue px-4 py-3 text-white shadow-md shadow-brand-blue/20 ring-1 ring-white/10">
                    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-cyan/25 blur-3xl" />
                    <span className="relative text-sm font-semibold">Total</span>
                    <span className="relative text-base font-bold">{formatAmount(selectedInvoice.total_amount_inr || 0)}</span>
                  </div>
                </div>

                {/* Payment Reference */}
                {(selectedInvoice.razorpay_payment_id || selectedInvoice.razorpay_order_id) && (
                  <div className="space-y-2 rounded-xl border border-brand-cyan/20 bg-brand-cyan/[0.05] p-4">
                    {selectedInvoice.razorpay_payment_id && (
                      <div>
                        <p className="text-2xs font-semibold uppercase tracking-wider text-brand-cyan">Payment ID</p>
                        <p className="mt-0.5 break-all font-mono text-sm text-gray-900 dark:text-slate-50">{selectedInvoice.razorpay_payment_id}</p>
                      </div>
                    )}
                    {selectedInvoice.razorpay_order_id && (
                      <div>
                        <p className="text-2xs font-semibold uppercase tracking-wider text-brand-cyan">Order ID</p>
                        <p className="mt-0.5 break-all font-mono text-sm text-gray-900 dark:text-slate-50">{selectedInvoice.razorpay_order_id}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Reason */}
                {(selectedInvoice.reason || selectedInvoice.metadata?.reason) && (
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-500">Reason</p>
                    <p className="mt-1 text-sm text-gray-800 dark:text-slate-100">{selectedInvoice.reason || selectedInvoice.metadata?.reason}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
                  <button
                    onClick={() => handleDownloadInvoice(selectedInvoice)}
                    disabled={downloadingId === selectedInvoice.id}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {downloadingId === selectedInvoice.id
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF...</>
                      : <><Download className="h-4 w-4" /> Download Invoice</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
