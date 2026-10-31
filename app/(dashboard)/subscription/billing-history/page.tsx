'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Receipt, Download, Search, Loader2, AlertCircle, CheckCircle2, Clock, XCircle, CreditCard, RefreshCw, ExternalLink, FileText, Calendar, RotateCcw, Package, Sparkles, X, Copy, FileSpreadsheet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DateField } from '@/components/ui/date-field';
import { exportRowsToCSV } from '@/lib/utils/exportUtils';
import api from '@/lib/services/api';
import { billToFromAuth, generateBillingInvoicePDF } from '@/lib/utils/pdfInvoice';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import { toast } from 'sonner';
import ListPagination from '@/components/ListPagination';
import { RowActions } from '@/components/subscription/RowActionsMenu';
import BillingReports from '@/components/subscription/BillingReports';
import InvoiceDetailModal from '@/components/subscription/InvoiceDetailModal';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';

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

// Invoice list status filter. 'open' covers both OPEN and PENDING, as on the stat card.
const STATUS_FILTERS = [
  { value: 'all', label: 'All Status', statuses: [] },
  { value: 'paid', label: 'Paid', statuses: ['PAID'] },
  { value: 'open', label: 'Open / Pending', statuses: ['OPEN', 'PENDING'] },
  { value: 'failed', label: 'Failed', statuses: ['FAILED'] },
  { value: 'refunded', label: 'Refunded', statuses: ['REFUNDED'] },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

// Issue date as 'YYYY-MM-DD' in IST, comparable with the DateField values.
const toISTDateKey = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function BillingHistoryPage() {
  const { user, tenant } = useAuth();
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Issue-date range for the Invoices list, as 'YYYY-MM-DD' ('' = open-ended).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // null keeps the order the API returned.
  const [invoiceSort, setInvoiceSort] = useState<{ key: 'date' | 'amount'; dir: 'asc' | 'desc' } | null>(null);
  // Which table the list view shows — formal invoices or add-on purchase history.
  const [billingTab, setBillingTab] = useState<'invoices' | 'purchases' | 'reports'>('invoices');
  // Separate search for the Purchase History tab — the two tabs match on
  // different fields, so they keep independent queries.
  const [addonSearch, setAddonSearch] = useState('');

  const openListView = (filter: StatusFilter, tab: 'invoices' | 'reports' = 'invoices') => {
    setStatusFilter(filter);
    setInvoicePage(1);
    setPageView('list');
    // The stat cards all drill into invoice data, so always surface an invoice
    // tab — otherwise a click from the Purchase History tab changes nothing the
    // user can see.
    setBillingTab(tab);
  };

  // Filter changes reset to page 1 here, in the handlers — not in an effect,
  // which would also fire when the persisted page is restored and clobber it.
  const changeSearch = (value: string) => { setSearchQuery(value); setInvoicePage(1); };
  const changeStatus = (value: StatusFilter) => { setStatusFilter(value); setInvoicePage(1); };
  const changeDateFrom = (value: string) => { setDateFrom(value); setInvoicePage(1); };
  const changeDateTo = (value: string) => { setDateTo(value); setInvoicePage(1); };
  const changeAddonSearch = (value: string) => { setAddonSearch(value); setAddonPage(1); };
  const clearInvoiceFilters = () => {
    setSearchQuery(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setInvoicePage(1);
  };
  const toggleSort = (key: 'date' | 'amount') => {
    setInvoiceSort(prev => (prev?.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
    setInvoicePage(1);
  };

  // Persist/restore list view state + scroll position across navigation.
  // Re-detect the scroll container when the two-step view flips.
  const rootRef = useScrollRestoration<HTMLElement>('sub-billing-history', !loading, [pageView]);
  useListStatePersistence(
    'sub-billing-history',
    { pageView, billingTab, statusFilter, searchQuery, dateFrom, dateTo, addonSearch, invoicePage, invoicePageSize, addonPage, addonPageSize },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (s.billingTab === 'invoices' || s.billingTab === 'purchases' || s.billingTab === 'reports') setBillingTab(s.billingTab);
      if (STATUS_FILTERS.some(f => f.value === s.statusFilter)) setStatusFilter(s.statusFilter as StatusFilter);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.dateFrom === 'string') setDateFrom(s.dateFrom);
      if (typeof s.dateTo === 'string') setDateTo(s.dateTo);
      if (typeof s.addonSearch === 'string') setAddonSearch(s.addonSearch);
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

  // Deep link: ?invoice=<invoice number> opens that invoice's detail once loaded.
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('invoice') : null,
  );
  if (pendingDeepLink && invoices.length > 0) {
    setPendingDeepLink(null);
    const match = invoices.find(inv => inv.invoice_number === pendingDeepLink);
    if (match) setSelectedInvoice(match);
  }

  // Keep ?invoice= in sync with the open modal so the URL can be shared.
  // Wait while a deep link is still pending, or the param is dropped before
  // the invoices arrive.
  useEffect(() => {
    if (pendingDeepLink) return;
    const url = new URL(window.location.href);
    if (selectedInvoice) url.searchParams.set('invoice', selectedInvoice.invoice_number);
    else url.searchParams.delete('invoice');
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.toString());
  }, [selectedInvoice, pendingDeepLink]);

  // Esc closes the invoice detail modal.
  useEffect(() => {
    if (!selectedInvoice) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedInvoice(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedInvoice]);

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

  const activeStatusFilter = STATUS_FILTERS.find(f => f.value === statusFilter) ?? STATUS_FILTERS[0];
  const hasInvoiceFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || dateFrom !== '' || dateTo !== '';

  const filteredInvoices = invoices.filter(inv => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (inv.invoice_number?.toLowerCase().includes(q) ?? false) ||
      (inv.plan_name?.toLowerCase().includes(q) ?? false) ||
      getDescription(inv).toLowerCase().includes(q);

    const statuses: readonly string[] = activeStatusFilter.statuses;
    const matchesStatus = statusFilter === 'all' || statuses.includes((inv.status || '').toUpperCase());

    const day = inv.issue_date ? toISTDateKey(inv.issue_date) : '';
    const matchesDate = (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);

    return matchesSearch && matchesStatus && matchesDate;
  });

  if (invoiceSort) {
    const dir = invoiceSort.dir === 'asc' ? 1 : -1;
    filteredInvoices.sort((a, b) =>
      invoiceSort.key === 'amount'
        ? ((a.total_amount_inr || 0) - (b.total_amount_inr || 0)) * dir
        : (new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime()) * dir,
    );
  }

  const handleExportInvoices = () => {
    exportRowsToCSV(
      ['Invoice', 'Date', 'Description', 'Plan', 'Payment Method', 'Payment Reference', 'Amount (INR)', 'Tax (INR)', 'Status'],
      filteredInvoices.map(inv => [
        inv.invoice_number,
        formatIST(inv.issue_date),
        getDescription(inv),
        inv.plan_name?.trim() || '',
        inv.payment_method || inv.metadata?.payment_method || '',
        inv.razorpay_payment_id || inv.metadata?.payment_reference || '',
        (inv.total_amount_inr || 0).toFixed(2),
        (inv.tax_amount_inr || 0).toFixed(2),
        inv.status,
      ]),
      `invoices-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const copyInvoiceNumber = async (invoiceNumber: string) => {
    try {
      await navigator.clipboard.writeText(invoiceNumber);
      toast.success('Invoice number copied');
    } catch {
      toast.error('Could not copy invoice number');
    }
  };

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

  // Hover text for the payment cell — the full reference the label truncates.
  const getPaymentTitle = (inv: BillingInvoice) => {
    const method = inv.payment_method || inv.metadata?.payment_method;
    const ref = inv.razorpay_payment_id || inv.metadata?.payment_reference;
    return [method && method.charAt(0).toUpperCase() + method.slice(1), ref].filter(Boolean).join(' • ') || '-';
  };

  const handleDownloadInvoice = async (inv: BillingInvoice) => {
    setDownloadingId(inv.id);
    try {
      await generateBillingInvoicePDF(inv, billToFromAuth(user, tenant));
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
            <h1 className="tf-page-title">Billing History</h1>
            <p className="mt-1 tf-body-muted">
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
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && billingTab === 'invoices' && statusFilter ==='all' ? 'border-brand-blue/40 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Total Amount</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-gray-900 dark:text-slate-50">{formatAmount(stats.total_amount)}</p>
                  <p className="mt-1 tf-meta">{stats.total_invoices} invoices</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                  <Receipt className="h-5 w-5 text-brand-blue" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('paid')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-teal/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && billingTab === 'invoices' && statusFilter ==='paid' ? 'border-brand-teal/40 ring-brand-teal/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-teal/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Paid</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-teal">{stats.paid_count}</p>
                  <p className="mt-1 tf-meta">Completed payments</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                  <CheckCircle2 className="h-5 w-5 text-brand-teal" />
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openListView('open')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-orange/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && billingTab === 'invoices' && statusFilter ==='open' ? 'border-brand-orange/40 ring-brand-orange/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-orange/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Open / Pending</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-orange-deep">{stats.open_count}</p>
                  <p className="mt-1 tf-meta">Awaiting payment</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                  <Clock className="h-5 w-5 text-brand-orange-deep" />
                </span>
              </div>
            </button>
            {/* Opens the Reports tab, so it doesn't duplicate the Total Amount card. */}
            <button
              type="button"
              onClick={() => openListView('all', 'reports')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-cyan/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && billingTab === 'reports' ? 'border-brand-cyan/40 ring-brand-cyan/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-cyan/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-slate-500">Total Invoices</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums break-words text-brand-blue">{stats.total_invoices}</p>
                  <p className="mt-1 tf-meta">All time · View reports</p>
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
                { id: 'invoices', label: 'Invoices', count: filteredInvoices.length },
                { id: 'purchases', label: 'Purchase History', count: filteredAddonTransactions.length },
                { id: 'reports', label: 'Reports', count: null },
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
                    {t.count !== null && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        active
                          ? 'bg-brand-blue/10 text-brand-blue'
                          : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {billingTab === 'invoices' && (
              <>
            {/* Search + filters */}
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5 xl:flex-row xl:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by invoice number, plan name, or description"
                  value={searchQuery}
                  onChange={(e) => changeSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  ariaLabel="Filter by status"
                  value={statusFilter}
                  onChange={(v) => changeStatus(v as StatusFilter)}
                  options={STATUS_FILTERS.map(f => ({ value: f.value, label: f.label }))}
                  className="w-auto sm:w-auto py-2.5 sm:py-2.5 pl-3 sm:pl-3 rounded-lg sm:rounded-lg text-gray-800 dark:text-slate-100"
                />
                <DateField aria-label="From date" placeholder="From" value={dateFrom} onChange={changeDateFrom} max={dateTo || undefined} className="w-[140px]" />
                <span className="text-xs text-gray-400 dark:text-slate-500">to</span>
                <DateField aria-label="To date" placeholder="To" value={dateTo} onChange={changeDateTo} min={dateFrom || undefined} className="w-[140px]" />
                {hasInvoiceFilters && (
                  <button type="button" onClick={clearInvoiceFilters} className="px-1 text-sm font-medium text-brand-blue hover:underline">
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportInvoices}
                  disabled={filteredInvoices.length === 0}
                  title="Download the filtered invoices as CSV"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:border-brand-blue/30 hover:bg-brand-blue/5 hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Active filter chip — so a status picked from a stat card is never hidden */}
            {statusFilter !== 'all' && (
              <div className="-mt-2 mb-4 flex items-center gap-2 tf-meta">
                Showing:
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 py-1 pl-2.5 pr-1 font-medium text-brand-blue ring-1 ring-brand-blue/15">
                  {activeStatusFilter.label}
                  <button
                    type="button"
                    onClick={() => changeStatus('all')}
                    aria-label={`Remove ${activeStatusFilter.label} filter`}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-blue/15"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}

        {/* Error State */}
        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {/* Loading State — mirrors the invoices table columns (Invoice, Date, Description, Payment, Amount, Status, Actions).
            Only on first load; a Refresh keeps the current rows on screen. */}
        {loading && invoices.length === 0 && (
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
        {(!loading || invoices.length > 0) && !error && filteredInvoices.length === 0 && (
          <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Receipt className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="tf-section-title">
              {hasInvoiceFilters ? 'No matching invoices' : 'No Billing History'}
            </h3>
            <p className="mx-auto mt-1 max-w-md tf-body-muted">
              {hasInvoiceFilters
                ? 'No invoices match the current search, status or date filters.'
                : 'Your billing history will appear here once you make a subscription or addon purchase.'}
            </p>
            {hasInvoiceFilters && (
              <button type="button" onClick={clearInvoiceFilters} className="mt-4 text-sm font-medium text-brand-blue hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Invoices Table */}
        {(!loading || invoices.length > 0) && !error && filteredInvoices.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            {/* Phone: one card per invoice instead of a sideways-scrolling table */}
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/60 sm:hidden">
              {paginatedInvoices.map((inv) => (
                <li key={inv.id} className="space-y-2 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate tf-cell-name">{inv.invoice_number}</span>
                      <button type="button" onClick={() => copyInvoiceNumber(inv.invoice_number)} aria-label="Copy invoice number" className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Badge variant={getStatusVariant(inv.status)} className="shrink-0 capitalize">
                      {getStatusIcon(inv.status)}
                      {inv.status}
                    </Badge>
                  </div>
                  <p className="truncate tf-body">{getDescription(inv)}</p>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0 tf-meta">
                      <p>{formatIST(inv.issue_date)}</p>
                      <p className="truncate" title={getPaymentTitle(inv)}>{getPaymentLabel(inv)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tf-cell-name">{formatAmount(inv.total_amount_inr || 0)}</p>
                      {(inv.tax_amount_inr || 0) > 0 && (
                        <p className="tf-meta">incl. {formatAmount(inv.tax_amount_inr)} tax</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <RowActions
                      menuLabel="Invoice actions"
                      actions={[
                        { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => setSelectedInvoice(inv) },
                        { key: 'download', label: 'Download Invoice', icon: Download, loading: downloadingId === inv.id, onClick: () => handleDownloadInvoice(inv) },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto tf-table-shell sm:block">
              <table className="w-full min-w-[800px] tf-premium-table">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="px-5 py-4 tf-th w-[200px]">Invoice</th>
                    <th className="px-5 py-4 tf-th w-[160px]" aria-sort={invoiceSort?.key === 'date' ? (invoiceSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-brand-blue">
                        Date
                      </button>
                    </th>
                    <th className="px-5 py-4 tf-th">Description</th>
                    <th className="px-5 py-4 tf-th w-[160px]">Payment</th>
                    <th className="px-5 py-4 text-right tf-th w-[130px]" aria-sort={invoiceSort?.key === 'amount' ? (invoiceSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 hover:text-brand-blue">
                        Amount
                      </button>
                    </th>
                    <th className="px-5 py-4 text-center tf-th w-[100px]">Status</th>
                    <th className="px-5 py-4 text-right tf-th w-[100px] tf-sticky-col">Actions</th>
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
                          <span className="min-w-0 truncate tf-cell-name" title={inv.invoice_number}>
                            {inv.invoice_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyInvoiceNumber(inv.invoice_number)}
                            aria-label="Copy invoice number"
                            title="Copy invoice number"
                            className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-blue dark:text-slate-500 dark:hover:bg-slate-800"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5 tf-td">
                        {formatIST(inv.issue_date)}
                      </td>
                      <td className="px-5 py-5">
                        <div className="truncate text-sm font-medium text-gray-900 dark:text-slate-50" title={getDescription(inv)}>
                          {getDescription(inv)}
                        </div>
                        {inv.plan_name && (
                          <div className="mt-0.5 truncate tf-meta">{inv.plan_name.trim()}</div>
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
                          <span className="min-w-0 truncate tf-body" title={getPaymentTitle(inv)}>
                            {getPaymentLabel(inv)}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <span className="tf-cell-name">
                          {formatAmount(inv.total_amount_inr || 0)}
                        </span>
                        {(inv.tax_amount_inr || 0) > 0 && (
                          <div className="tf-meta">incl. {formatAmount(inv.tax_amount_inr)} tax</div>
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
        {(!loading || invoices.length > 0) && !error && filteredInvoices.length > 0 && (
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
                  onChange={(e) => changeAddonSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                />
              </div>
            </div>

            {filteredAddonTransactions.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full min-w-[750px] tf-premium-table">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="px-5 py-4 tf-th">Invoice</th>
                    <th className="px-5 py-4 tf-th">Date</th>
                    <th className="px-5 py-4 tf-th">Description</th>
                    <th className="px-5 py-4 text-right tf-th w-[110px]">Amount</th>
                    <th className="px-5 py-4 text-center tf-th w-[130px]">Activation</th>
                    <th className="px-5 py-4 text-center tf-th w-[120px] tf-sticky-col">Action</th>
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
                      <td className="whitespace-nowrap px-5 py-5 tf-card-desc">
                        {txn.transaction_date ? formatISTDate(txn.transaction_date) : '-'}
                      </td>
                      <td className="px-5 py-5">
                        <span className="block max-w-[220px] truncate text-sm text-gray-800 dark:text-slate-100" title={txn.addon_name}>
                          {txn.addon_name}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <span className="tf-cell-name">
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
                <h3 className="tf-section-title">No matching purchases</h3>
                <p className="mx-auto mt-1 max-w-md tf-body-muted">
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
                  <h3 className="tf-section-title">No Add-on Purchases</h3>
                  <p className="mx-auto mt-1 max-w-md tf-body-muted">
                    Add-ons, seats and one-time purchases will appear here once you buy them.
                  </p>
                </div>
              )
            )}

            {billingTab === 'reports' && (
              error ? (
                <div className="flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <p className="text-sm font-medium text-destructive">{error}</p>
                </div>
              ) : loading && invoices.length === 0 ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
                </div>
              ) : (
                <BillingReports<BillingInvoice>
                  invoices={invoices}
                  downloadingId={downloadingId}
                  onView={setSelectedInvoice}
                  onDownload={handleDownloadInvoice}
                  getDescription={getDescription}
                  getPaymentLabel={getPaymentLabel}
                  getStatusVariant={getStatusVariant}
                  getStatusIcon={getStatusIcon}
                />
              )
            )}
          </>
        )}

        {/* Invoice Detail Modal */}
        {selectedInvoice && (
          <InvoiceDetailModal<BillingInvoice>
            invoice={selectedInvoice}
            downloading={downloadingId === selectedInvoice.id}
            onClose={() => setSelectedInvoice(null)}
            onDownload={handleDownloadInvoice}
            formatAmount={formatAmount}
            getPaymentLabel={getPaymentLabel}
            getStatusVariant={getStatusVariant}
            getStatusIcon={getStatusIcon}
          />
        )}
      </div>
      </div>
    </main>
  );
}
