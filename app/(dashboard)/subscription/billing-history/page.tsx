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
import { showErrorToast } from '@/lib/utils/errorToast';
import ListPagination from '@/components/ListPagination';
import { RowActions } from '@/components/subscription/RowActionsMenu';
import BillingReports from '@/components/subscription/BillingReports';
import { useRouter } from 'next/navigation';
import {
  normalizeBillingInvoice, invoicePageUrl, type BillingInvoice,
} from '@/lib/utils/billingInvoices';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { IconButton } from '@/components/ui/icon-button';

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
  const { user, tenant, isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  // Billing actions need Subscription & Billing Access (2026-11-10): retrying a
  // paid add-on is a purchase (Upgrade Plan, as the server checks); the CSV is
  // an export (usage:export). View-only roles (Viewer) see both greyed.
  const canRetryPurchase = isTenantAdmin || hasPermission('canUpgradePlan');
  const canExportBilling = isTenantAdmin || hasPermissionCode('usage:export');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  /** An invoice opens on its own page (was a popup). */
  const openInvoice = (inv: BillingInvoice) => router.push(invoicePageUrl(inv.invoice_number));
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

  // Old links to the popup (…?invoice=<number>) now go to the invoice page.
  useEffect(() => {
    const legacy = new URLSearchParams(window.location.search).get('invoice');
    if (legacy) router.replace(invoicePageUrl(legacy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      showErrorToast(err, "Couldn't load add-on transactions", { id: 'billing-addon-transactions', retry: fetchAddonTransactions });
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
      showErrorToast(err, "Couldn't activate the add-on");
    } finally {
      setRetryingId(null);
    }
  };

  const getDescription = (inv: BillingInvoice) => {
    return inv.line_items?.[0]?.description || inv.metadata?.reason || inv.reason || '-';
  };

  const activeStatusFilter = STATUS_FILTERS.find(f => f.value === statusFilter) ?? STATUS_FILTERS[0];
  const hasInvoiceFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || dateFrom !== '' || dateTo !== '';
  // Active filter tags: Status and the date range as one tag (the search shows
  // in its own box). Each removes just its own filter via the toolbar's setters.
  const formatChipDate = (v: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const invoiceFilterChips: FilterChip[] = [
    statusFilter !== 'all' && { key: 'status', label: 'Status', value: activeStatusFilter.label, onRemove: () => changeStatus('all') },
    (dateFrom !== '' || dateTo !== '') && {
      key: 'date',
      label: 'Date',
      value: dateFrom && dateTo
        ? `${formatChipDate(dateFrom)} – ${formatChipDate(dateTo)}`
        : dateFrom ? `From ${formatChipDate(dateFrom)}` : `Until ${formatChipDate(dateTo)}`,
      onRemove: () => { changeDateFrom(''); changeDateTo(''); },
    },
  ].filter(Boolean) as FilterChip[];

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
    } catch (err) {
      showErrorToast(err, "Couldn't copy invoice number");
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
      // Audit trail: invoice PDF downloaded (built in the browser, so report it).
      api.post('/billing/log-view', { kind: 'invoice_downloaded', invoice_number: inv.invoice_number }).catch(() => {});
    } catch (error) {
      console.error('PDF generation failed:', error);
      showErrorToast(error, `Couldn't download invoice ${inv.invoice_number}`, { retry: () => handleDownloadInvoice(inv) });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <main ref={rootRef} className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="tf-page-sheet">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Billing History' }]} />

        {/* Header — title + actions (matches Payment Disputes) */}
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
              className="tf-btn tf-btn-secondary border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-70 whitespace-normal"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards — clicking a card drills into the invoice list with the matching filter applied */}
        {stats && (
          <div className="tf-grid-4 mb-5">
            <button
              type="button"
              onClick={() => openListView('all')}
              className={`h-full text-left rounded-xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:-translate-y-0.5 hover:shadow-md ${pageView === 'list' && billingTab === 'invoices' && statusFilter ==='all' ? 'border-brand-blue/40 ring-brand-blue/20' : 'border-gray-100 dark:border-slate-700/60 hover:border-brand-blue/25'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tf-eyebrow tracking-wider">Total Amount</p>
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
                  <p className="tf-eyebrow tracking-wider">Paid</p>
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
                  <p className="tf-eyebrow tracking-wider">Open / Pending</p>
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
                  <p className="tf-eyebrow tracking-wider">Total Invoices</p>
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
                    className={`tf-tab-line -mb-px ${
                      active
                        ? 'tf-tab-line-active'
                        : ''
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
            <div className="mb-5 flex flex-col gap-3 tf-card-soft p-4 sm:p-5 xl:flex-row xl:flex-wrap xl:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by invoice number, plan name, or description"
                  value={searchQuery}
                  onChange={(e) => changeSearch(e.target.value)}
                  className="tf-input pl-10 pr-4"
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
                <span className="tf-hint">to</span>
                <DateField aria-label="To date" placeholder="To" value={dateTo} onChange={changeDateTo} min={dateFrom || undefined} className="w-[140px]" />
                {hasInvoiceFilters && (
                  <button type="button" onClick={clearInvoiceFilters} className="px-1 text-sm font-medium text-brand-blue hover:underline">
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportInvoices}
                  disabled={filteredInvoices.length === 0 || !canExportBilling}
                  title={canExportBilling ? 'Download the filtered invoices as CSV' : "Your role can't export billing records"}
                  className="tf-btn tf-btn-secondary border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:border-brand-blue/30 hover:bg-brand-blue/5 hover:text-brand-blue whitespace-normal justify-start"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
              {/* Active filter tags — the card's last line (so a status picked from a stat
                  card is never hidden); the card's gap-3 spaces them from the row. */}
              {invoiceFilterChips.length > 0 && (
                <FilterChips className="w-full xl:basis-full" chips={invoiceFilterChips} />
              )}
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

        {/* Loading State — mirrors the invoices table columns (Invoice, Date, Description, Payment, Amount, Status, Actions).
            Only on first load; a Refresh keeps the current rows on screen. */}
        {loading && invoices.length === 0 && (
          <div className="overflow-hidden tf-card-soft">
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
          <div className="tf-card-soft p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <Receipt className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="tf-section-title sm:text-lg">
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
          <div className="overflow-hidden tf-card-soft">
            {/* Phone: one card per invoice instead of a sideways-scrolling table */}
            <MobileRecordList className="p-3">
              {paginatedInvoices.map((inv) => (
                <MobileRecordCard
                  key={inv.id}
                  idBadge={
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1 tf-id-chip">
                      <span className="min-w-0 truncate">{inv.invoice_number}</span>
                      <IconButton bare label="Copy invoice number" type="button" onClick={() => copyInvoiceNumber(inv.invoice_number)} className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-slate-800">
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                    </span>
                  }
                  title={getDescription(inv)}
                  badges={
                    <Badge variant={getStatusVariant(inv.status)} className="shrink-0 capitalize">
                      {getStatusIcon(inv.status)}
                      {inv.status}
                    </Badge>
                  }
                  meta={[
                    { icon: <Calendar className="h-3.5 w-3.5" />, label: formatIST(inv.issue_date) },
                    { icon: <CreditCard className="h-3.5 w-3.5" />, label: <span title={getPaymentTitle(inv)}>{getPaymentLabel(inv)}</span> },
                  ]}
                  footer={
                    <>
                      <MobileStatChip tone="info">{formatAmount(inv.total_amount_inr || 0)}</MobileStatChip>
                      {(inv.tax_amount_inr || 0) > 0 && (
                        <MobileStatChip tone="neutral">incl. {formatAmount(inv.tax_amount_inr)} tax</MobileStatChip>
                      )}
                    </>
                  }
                  actions={
                    <RowActions
                      menuLabel="Invoice actions"
                      actions={[
                        { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => openInvoice(inv) },
                        { key: 'download', label: 'Download Invoice', icon: Download, loading: downloadingId === inv.id, onClick: () => handleDownloadInvoice(inv) },
                      ]}
                    />
                  }
                />
              ))}
            </MobileRecordList>

            <div className="hidden overflow-x-auto tf-table-shell lg:block">
              <table className="w-full min-w-[800px] tf-premium-table">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="tf-th-cell tf-th w-[200px]">Invoice</th>
                    <th className="tf-th-cell tf-th w-[160px]" aria-sort={invoiceSort?.key === 'date' ? (invoiceSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 hover:text-brand-blue">
                        Date
                      </button>
                    </th>
                    <th className="tf-th-cell tf-th">Description</th>
                    <th className="tf-th-cell tf-th w-[160px]">Payment</th>
                    <th className="tf-th-cell text-right tf-th w-[130px]" aria-sort={invoiceSort?.key === 'amount' ? (invoiceSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" onClick={() => toggleSort('amount')} className="inline-flex items-center gap-1 hover:text-brand-blue">
                        Amount
                      </button>
                    </th>
                    <th className="tf-th-cell text-center tf-th w-[100px]">Status</th>
                    <th className="tf-th-cell text-right tf-th w-[100px] tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                            <FileText className="h-4 w-4 text-brand-blue" />
                          </span>
                          <span className="min-w-0 truncate tf-row-title" title={inv.invoice_number}>
                            {inv.invoice_number}
                          </span>
                          <IconButton bare label="Copy invoice number"
                            type="button"
                            onClick={() => copyInvoiceNumber(inv.invoice_number)}
                            className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-blue dark:text-slate-500 dark:hover:bg-slate-800"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </td>
                      <td className="tf-td whitespace-nowrap tf-body">
                        {formatIST(inv.issue_date)}
                      </td>
                      <td className="tf-td">
                        <div className="truncate tf-row-name" title={getDescription(inv)}>
                          {getDescription(inv)}
                        </div>
                        {inv.plan_name && (
                          <div className="mt-0.5 truncate tf-meta">{inv.plan_name.trim()}</div>
                        )}
                        {inv.subscription_start_date && (
                          <div className="mt-0.5 flex items-center gap-1 tf-hint">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {formatISTDate(inv.subscription_start_date)} – {formatISTDate(inv.subscription_end_date)}
                          </div>
                        )}
                      </td>
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-slate-500" />
                          <span className="min-w-0 truncate tf-body" title={getPaymentTitle(inv)}>
                            {getPaymentLabel(inv)}
                          </span>
                        </div>
                      </td>
                      <td className="tf-td text-right">
                        <span className="tf-row-title">
                          {formatAmount(inv.total_amount_inr || 0)}
                        </span>
                        {(inv.tax_amount_inr || 0) > 0 && (
                          <div className="tf-meta">incl. {formatAmount(inv.tax_amount_inr)} tax</div>
                        )}
                      </td>
                      <td className="tf-td text-center">
                        <Badge variant={getStatusVariant(inv.status)} className="capitalize">
                          {getStatusIcon(inv.status)}
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="tf-td text-right tf-sticky-col">
                        <RowActions
                          menuLabel="Invoice actions"
                          actions={[
                            { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => openInvoice(inv) },
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
            <div className="mb-5 tf-card-soft p-4 sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by invoice number or add-on name"
                  value={addonSearch}
                  onChange={(e) => changeAddonSearch(e.target.value)}
                  className="tf-input pl-10 pr-4"
                />
              </div>
            </div>

            {filteredAddonTransactions.length > 0 ? (
          <div className="overflow-hidden tf-card-soft">
            <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
              <table className="w-full min-w-[750px] tf-premium-table">
                <thead className="bg-white dark:bg-slate-900">
                  <tr className="text-left">
                    <th className="tf-th-cell tf-th">Invoice</th>
                    <th className="tf-th-cell tf-th">Date</th>
                    <th className="tf-th-cell tf-th">Description</th>
                    <th className="tf-th-cell text-right tf-th w-[110px]">Amount</th>
                    <th className="tf-th-cell text-center tf-th w-[130px]">Activation</th>
                    <th className="tf-th-cell text-center tf-th w-[120px] tf-sticky-col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAddonTransactions.map((txn) => (
                    <tr key={txn.id}>
                      <td className="tf-td">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15">
                            <FileText className="h-4 w-4 text-brand-cyan" />
                          </span>
                          <span className="block max-w-[160px] truncate tf-row-name" title={txn.invoice_number}>
                            {txn.invoice_number}
                          </span>
                        </div>
                      </td>
                      <td className="tf-td whitespace-nowrap tf-body-secondary">
                        {txn.transaction_date ? formatISTDate(txn.transaction_date) : '-'}
                      </td>
                      <td className="tf-td">
                        <span className="block max-w-[220px] truncate tf-body" title={txn.addon_name}>
                          {txn.addon_name}
                        </span>
                      </td>
                      <td className="tf-td text-right">
                        <span className="tf-row-title">
                          ₹{Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="tf-td text-center">
                        {txn.activation_status === 'activated' && (
                          <span className="tf-badge bg-brand-teal/10 text-2xs text-brand-teal ring-1 ring-brand-teal/20">
                            <CheckCircle2 className="h-3 w-3" />
                            Activated
                          </span>
                        )}
                        {txn.activation_status === 'failed' && (
                          <span className="tf-badge bg-destructive-subtle text-2xs text-destructive ring-1 ring-destructive-line">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </span>
                        )}
                        {txn.activation_status === 'processing' && (
                          <span className="tf-badge bg-warning-subtle text-2xs text-warning ring-1 ring-warning-line">
                            <Clock className="h-3 w-3" />
                            Processing
                          </span>
                        )}
                        {txn.activation_status === 'unknown' && (
                          <span className="tf-hint">—</span>
                        )}
                      </td>
                      <td className="tf-td text-center tf-sticky-col">
                        {txn.activation_status === 'failed' ? (
                          <button
                            onClick={() => handleRetryActivation(txn.id)}
                            disabled={retryingId === txn.id || !canRetryPurchase}
                            title={canRetryPurchase ? undefined : "Your role can't retry purchases. Ask the account owner or a Billing Manager."}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-orange/25 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {retryingId === txn.id
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Retrying...</>
                              : <><RotateCcw className="h-3 w-3" /> Retry</>}
                          </button>
                        ) : (
                          <span className="tf-hint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MobileRecordList className="p-3">
              {paginatedAddonTransactions.map((txn) => (
                <MobileRecordCard
                  key={txn.id}
                  idBadge={
                    <span className="inline-block max-w-full truncate tf-id-chip">
                      {txn.invoice_number}
                    </span>
                  }
                  badges={
                    <>
                      {txn.activation_status === 'activated' && (
                        <span className="tf-badge bg-brand-teal/10 text-2xs text-brand-teal ring-1 ring-brand-teal/20">
                          <CheckCircle2 className="h-3 w-3" />
                          Activated
                        </span>
                      )}
                      {txn.activation_status === 'failed' && (
                        <span className="tf-badge bg-destructive-subtle text-2xs text-destructive ring-1 ring-destructive-line">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                      {txn.activation_status === 'processing' && (
                        <span className="tf-badge bg-warning-subtle text-2xs text-warning ring-1 ring-warning-line">
                          <Clock className="h-3 w-3" />
                          Processing
                        </span>
                      )}
                    </>
                  }
                  title={
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Package className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="min-w-0 break-words">{txn.addon_name}</span>
                    </span>
                  }
                  meta={[{ icon: <Calendar className="h-3.5 w-3.5" />, label: txn.transaction_date ? formatISTDate(txn.transaction_date) : '-' }]}
                  footer={
                    <MobileStatChip tone="info">{`₹${Math.abs(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</MobileStatChip>
                  }
                  actions={
                    txn.activation_status === 'failed' ? (
                      <button
                        onClick={() => handleRetryActivation(txn.id)}
                        disabled={retryingId === txn.id || !canRetryPurchase}
                        title={canRetryPurchase ? undefined : "Your role can't retry purchases. Ask the account owner or a Billing Manager."}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-brand-orange/25 transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {retryingId === txn.id
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Retrying...</>
                          : <><RotateCcw className="h-3 w-3" /> Retry</>}
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </MobileRecordList>
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
              <div className="tf-card-soft p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 dark:bg-slate-800 ring-1 ring-gray-200 dark:ring-slate-700">
                  <Search className="h-7 w-7 text-gray-500 dark:text-slate-500" />
                </div>
                <h3 className="tf-section-title sm:text-lg">No matching purchases</h3>
                <p className="mx-auto mt-1 max-w-md tf-body-muted">
                  No add-on purchases match your search. Try a different invoice number or add-on name.
                </p>
              </div>
            )}
              </>
              ) : (
                <div className="tf-card-soft p-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15">
                    <Package className="h-7 w-7 text-brand-orange-deep" />
                  </div>
                  <h3 className="tf-section-title sm:text-lg">No Add-on Purchases</h3>
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
                <div className="tf-grid-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
                </div>
              ) : (
                <BillingReports<BillingInvoice>
                  invoices={invoices}
                  downloadingId={downloadingId}
                  onView={openInvoice}
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

      </div>
      </div>
    </main>
  );
}
