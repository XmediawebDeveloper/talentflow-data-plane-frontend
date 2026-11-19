'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { Search, FileText, CreditCard, ExternalLink, Download, BarChart3 } from 'lucide-react';
import { formatIST } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import ListPagination from '@/components/ListPagination';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { RowActions } from '@/components/subscription/RowActionsMenu';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

// Structural subset of the billing-history invoice — only what the reports read.
export interface ReportInvoice {
  id: number;
  invoice_number: string;
  invoice_type?: string;
  status: string;
  issue_date: string;
  total_amount_inr: number;
  tax_amount_inr: number;
  plan_name?: string;
}

interface BillingReportsProps<T extends ReportInvoice> {
  invoices: T[];
  downloadingId: number | null;
  onView: (inv: T) => void;
  onDownload: (inv: T) => void;
  getDescription: (inv: T) => string;
  getPaymentLabel: (inv: T) => string;
  getStatusVariant: (status: string) => 'success' | 'warning' | 'destructive' | 'info' | 'muted';
  getStatusIcon: (status: string) => React.ReactNode;
}

// Modules an invoice can be attributed to, matched against its description.
// Order matters: the first pattern that matches wins.
const MODULES = [
  { key: 'Resume Scoring', pattern: /resume scor/i, color: 'var(--brand-blue)', badge: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' },
  { key: 'AI Interview', pattern: /ai interview/i, color: 'var(--brand-cyan)', badge: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20' },
  { key: 'Resume Upload', pattern: /resume (upload|storage)/i, color: '#7c3aed', badge: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { key: 'Assessment', pattern: /assessment/i, color: '#10b981', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { key: 'Max Users', pattern: /max (users|seats)|seat/i, color: 'var(--brand-orange)', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' },
  { key: 'Subscription', pattern: /plan|subscription|upgrade|renew/i, color: 'var(--brand-teal)', badge: 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20' },
] as const;
const OTHERS = { key: 'Others', color: '#94a3b8', badge: 'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' };

const STATUSES = [
  { key: 'PAID', label: 'Paid', color: '#10b981' },
  { key: 'PENDING', label: 'Pending', color: 'var(--brand-orange)' },
  { key: 'FAILED', label: 'Failed', color: '#f87171' },
  { key: 'REFUNDED', label: 'Refunded', color: '#94a3b8' },
] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Invoice dates are shown in IST everywhere else, so bucket them in IST too.
const istParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' });
function getYearMonth(iso: string): { year: number; month: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = istParts.formatToParts(d);
  return {
    year: Number(parts.find(p => p.type === 'year')?.value),
    month: Number(parts.find(p => p.type === 'month')?.value) - 1,
  };
}

// Pending/open invoices share one bucket, as in the stat cards above.
function normalizeStatus(status: string) {
  const s = (status || '').toUpperCase();
  return s === 'OPEN' ? 'PENDING' : s;
}

const inr = (n: number, fraction = 0) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}`;
const inrCompact = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`;

const cardClass =
  'tf-card-soft p-4 sm:p-5';

function Select({ label, value, onChange, options }: { label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="inline-flex items-center gap-2 tf-meta">
      {label}
      <FilterSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
        className="w-auto sm:w-auto py-2 sm:py-2 pl-3 sm:pl-3 rounded-lg sm:rounded-lg text-gray-800 dark:text-slate-100"
      />
    </label>
  );
}

export default function BillingReports<T extends ReportInvoice>({
  invoices, downloadingId, onView, onDownload, getDescription, getPaymentLabel, getStatusVariant, getStatusIcon,
}: BillingReportsProps<T>) {
  const getModule = (inv: T) => {
    const text = `${getDescription(inv)} ${inv.invoice_type || ''}`;
    return MODULES.find(m => m.pattern.test(text)) ?? OTHERS;
  };

  const years = useMemo(() => {
    const set = new Set<number>();
    invoices.forEach(inv => { const ym = getYearMonth(inv.issue_date); if (ym) set.add(ym.year); });
    return Array.from(set).sort((a, b) => b - a);
  }, [invoices]);

  const [groupBy, setGroupBy] = useState<'month' | 'quarter'>('month');
  const [year, setYear] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Until the user picks one, show the most recent year that has invoices.
  const activeYear = year || (years.length ? String(years[0]) : "");

  // Any filter change goes back to the first page of the table.
  const withPageReset = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };
  const changeYear = withPageReset(setYear);
  const changeModule = withPageReset(setModuleFilter);
  const changeStatus = withPageReset(setStatusFilter);
  const changeSearch = withPageReset(setSearch);

  // Invoices in scope for the charts: selected year + module.
  const scoped = useMemo(() => invoices.filter(inv => {
    const ym = getYearMonth(inv.issue_date);
    if (activeYear && ym?.year !== Number(activeYear)) return false;
    if (moduleFilter !== 'all' && getModule(inv).key !== moduleFilter) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [invoices, activeYear, moduleFilter]);

  // Billing amounts count only paid invoices — what was actually charged.
  const paidScoped = useMemo(() => scoped.filter(inv => normalizeStatus(inv.status) === 'PAID'), [scoped]);

  const periodData = useMemo(() => {
    const labels = groupBy === 'month' ? MONTHS : ['Q1', 'Q2', 'Q3', 'Q4'];
    const totals = labels.map(label => ({ label, amount: 0 }));
    paidScoped.forEach(inv => {
      const ym = getYearMonth(inv.issue_date);
      if (!ym) return;
      const idx = groupBy === 'month' ? ym.month : Math.floor(ym.month / 3);
      totals[idx].amount += inv.total_amount_inr || 0;
    });
    return totals;
  }, [paidScoped, groupBy]);

  const moduleData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    paidScoped.forEach(inv => {
      const m = getModule(inv);
      const entry = map.get(m.key) ?? { name: m.key, value: 0, color: m.color };
      entry.value += inv.total_amount_inr || 0;
      map.set(m.key, entry);
    });
    return Array.from(map.values()).filter(e => e.value > 0).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidScoped]);
  const moduleTotal = moduleData.reduce((s, m) => s + m.value, 0);

  const statusData = STATUSES.map(s => ({
    label: s.label,
    color: s.color,
    count: scoped.filter(inv => normalizeStatus(inv.status) === s.key).length,
  }));

  const tableRows = scoped.filter(inv => {
    if (statusFilter !== 'all' && normalizeStatus(inv.status) !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.plan_name?.toLowerCase().includes(q) ?? false) ||
      getDescription(inv).toLowerCase().includes(q)
    );
  });
  const pageRows = tableRows.slice((page - 1) * pageSize, page * pageSize);

  const moduleOptions = [{ value: 'all', label: 'All Modules' }, ...[...MODULES, OTHERS].map(m => ({ value: m.key, label: m.key }))];
  const hasFilters = statusFilter !== 'all' || moduleFilter !== 'all' || search !== '';
  // Active filter tags for the table: Status and Module (search shows in its box).
  const tableFilterChips: FilterChip[] = [
    statusFilter !== 'all' && { key: 'status', label: 'Status', value: STATUSES.find(s => s.key === statusFilter)?.label ?? statusFilter, onRemove: () => changeStatus('all') },
    moduleFilter !== 'all' && { key: 'module', label: 'Module', value: moduleFilter, onRemove: () => changeModule('all') },
  ].filter(Boolean) as FilterChip[];

  const emptyChart = (
    <div className="flex h-full items-center justify-center tf-body-muted">No paid invoices in this period</div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Report filters */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Select label="Group by" value={groupBy} onChange={(v) => setGroupBy(v as 'month' | 'quarter')} options={[{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }]} />
        <Select label="Year" value={activeYear} onChange={changeYear} options={(years.length ? years : [new Date().getFullYear()]).map(y => ({ value: String(y), label: String(y) }))} />
        <Select label="Module" value={moduleFilter} onChange={changeModule} options={moduleOptions} />
      </div>

      {/* Charts */}
      <div className="tf-grid-3">
        <div className={cardClass}>
          <h3 className="tf-row-title">{groupBy === 'month' ? 'Monthly' : 'Quarterly'} Billing Amount</h3>
          <div className="mt-3 h-52">
            {paidScoped.length === 0 ? emptyChart : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--raw-e5e7eb)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--raw-6b7280)' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--raw-6b7280)' }} axisLine={false} tickLine={false} tickFormatter={inrCompact} width={52} />
                  <ReTooltip
                    cursor={{ fill: 'var(--raw-e5e7eb)', opacity: 0.4 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--raw-e5e7eb)', fontSize: 12 }}
                    formatter={(v) => [inr(Number(v), 2), 'Billed']}
                  />
                  <Bar dataKey="amount" fill="var(--brand-blue)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="tf-row-title">Amount by Module</h3>
          <div className="mt-3 flex h-52 items-center gap-4">
            {moduleData.length === 0 ? emptyChart : (
              <>
                <div className="relative h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={moduleData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1} stroke="none">
                        {moduleData.map(m => <Cell key={m.name} fill={m.color} />)}
                      </Pie>
                      <ReTooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--raw-e5e7eb)', fontSize: 12 }} formatter={(v, n) => [inr(Number(v), 2), String(n)]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="tf-row-title tabular-nums">{inr(moduleTotal)}</span>
                    <span className="tf-micro-hint">Total</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {moduleData.map(m => (
                    <li key={m.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 text-gray-700 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-slate-50">
                        {Math.round((m.value / moduleTotal) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="tf-row-title">Invoices by Status</h3>
          <div className="mt-3 h-52">
            {scoped.length === 0 ? (
              <div className="flex h-full items-center justify-center tf-body-muted">No invoices in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} margin={{ top: 20, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--raw-6b7280)' }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <ReTooltip cursor={{ fill: 'var(--raw-e5e7eb)', opacity: 0.4 }} contentStyle={{ borderRadius: 8, border: '1px solid var(--raw-e5e7eb)', fontSize: 12 }} formatter={(v) => [String(v), 'Invoices']} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={44} minPointSize={3}>
                    {statusData.map(s => <Cell key={s.label} fill={s.color} />)}
                    <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--raw-6b7280)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Table filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search by invoice number, plan name, or description"
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            className="tf-input pl-10 pr-4"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onChange={changeStatus} options={[{ value: 'all', label: 'All Status' }, ...STATUSES.map(s => ({ value: s.key, label: s.label }))]} />
          <Select value={moduleFilter} onChange={changeModule} options={moduleOptions} />
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setModuleFilter('all'); setSearch(''); setPage(1); }}
              className="text-sm font-medium text-brand-blue hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {tableFilterChips.length > 0 && (
        <FilterChips className="-mt-2" chips={tableFilterChips} />
      )}

      {/* Invoice table */}
      {tableRows.length === 0 ? (
        <div className="tf-card-soft p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
            <BarChart3 className="h-7 w-7 text-brand-blue" />
          </div>
          <h3 className="tf-section-title sm:text-lg">No invoices found</h3>
          <p className="mx-auto mt-1 max-w-md tf-body-muted">Try a different year, module, status or search.</p>
        </div>
      ) : (
        <div className="overflow-hidden tf-card-soft">
          <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
            <table className="w-full min-w-[900px] tf-premium-table">
              <thead className="bg-white dark:bg-slate-900">
                <tr className="text-left">
                  <th className="tf-th-cell tf-th w-[200px]">Invoice</th>
                  <th className="tf-th-cell tf-th w-[160px]">Date</th>
                  <th className="tf-th-cell tf-th">Description</th>
                  <th className="tf-th-cell tf-th w-[140px]">Module</th>
                  <th className="tf-th-cell tf-th w-[160px]">Payment Method</th>
                  <th className="tf-th-cell text-right tf-th w-[130px]">Amount</th>
                  <th className="tf-th-cell text-center tf-th w-[100px]">Status</th>
                  <th className="tf-th-cell text-right tf-th w-[100px] tf-sticky-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(inv => {
                  const mod = getModule(inv);
                  return (
                    <tr key={inv.id}>
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                          <span className="min-w-0 truncate tf-row-title" title={inv.invoice_number}>{inv.invoice_number}</span>
                        </div>
                      </td>
                      <td className="tf-td whitespace-nowrap tf-body">{formatIST(inv.issue_date)}</td>
                      <td className="tf-td">
                        <div className="truncate tf-row-name" title={getDescription(inv)}>{getDescription(inv)}</div>
                      </td>
                      <td className="tf-td">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-2xs font-medium ring-1 ${mod.badge}`}>{mod.key}</span>
                      </td>
                      <td className="tf-td">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
                          <span className="min-w-0 truncate tf-body" title={getPaymentLabel(inv)}>{getPaymentLabel(inv)}</span>
                        </div>
                      </td>
                      <td className="tf-td text-right">
                        <span className="tf-row-title">{inr(inv.total_amount_inr || 0, 2)}</span>
                        {(inv.tax_amount_inr || 0) > 0 && (
                          <div className="tf-meta">incl. {inr(inv.tax_amount_inr, 2)} tax</div>
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
                            { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => onView(inv) },
                            { key: 'download', label: 'Download Invoice', icon: Download, loading: downloadingId === inv.id, onClick: () => onDownload(inv) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <MobileRecordList>
            {pageRows.map(inv => {
              const mod = getModule(inv);
              return (
                <MobileRecordCard
                  key={inv.id}
                  badges={
                    <>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-2xs font-medium ring-1 ${mod.badge}`}>{mod.key}</span>
                      <Badge variant={getStatusVariant(inv.status)} className="capitalize">
                        {getStatusIcon(inv.status)}
                        {inv.status}
                      </Badge>
                    </>
                  }
                  title={inv.invoice_number}
                  actions={
                    <RowActions
                      menuLabel="Invoice actions"
                      actions={[
                        { key: 'view', label: 'View', icon: ExternalLink, variant: 'primary', onClick: () => onView(inv) },
                        { key: 'download', label: 'Download Invoice', icon: Download, loading: downloadingId === inv.id, onClick: () => onDownload(inv) },
                      ]}
                    />
                  }
                  meta={[
                    { icon: <FileText className="h-3.5 w-3.5" />, label: getDescription(inv) },
                    { icon: <CreditCard className="h-3.5 w-3.5" />, label: getPaymentLabel(inv) },
                  ]}
                  fields={[
                    { label: 'Date', value: formatIST(inv.issue_date) },
                    {
                      label: 'Amount',
                      value: (
                        <>
                          {inr(inv.total_amount_inr || 0, 2)}
                          {(inv.tax_amount_inr || 0) > 0 && ` (incl. ${inr(inv.tax_amount_inr, 2)} tax)`}
                        </>
                      ),
                    },
                  ]}
                />
              );
            })}
          </MobileRecordList>
          <ListPagination
            currentPage={page}
            itemsPerPage={pageSize}
            totalItems={tableRows.length}
            onPageChange={setPage}
            onItemsPerPageChange={setPageSize}
            itemLabel="invoices"
          />
        </div>
      )}
    </div>
  );
}
