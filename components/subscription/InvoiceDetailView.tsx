'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CreditCard, Package, RefreshCw, Download, Loader2, CheckCircle, Clock, AlertCircle, Circle, Copy, Hash, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  BILLING_HISTORY_URL, formatInvoiceAmount, getInvoicePaymentLabel, getInvoiceStatusVariant, type BillingInvoice,
} from '@/lib/utils/billingInvoices';

const DAY_MS = 24 * 60 * 60 * 1000;

const PAYMENT_STATE_CLASS: Record<'paid' | 'overdue' | 'unpaid' | 'other', string> = {
  paid: 'bg-success-subtle text-success-strong',
  overdue: 'bg-destructive-subtle text-destructive-strong',
  unpaid: 'bg-warning-subtle text-warning-strong',
  other: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300',
};

/** Copy-to-clipboard for ids. */
function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`Copied ${label}`);
        } catch {
          toast.error(`Could not copy the ${label}`);
        }
      }}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

/** One label / value row in the side panel. */
function InfoRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-gray-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-slate-50">{children}</dd>
      </div>
    </div>
  );
}

/**
 * One invoice as a page — the admin console's invoice view: a header with the
 * number, status and actions; the invoice document itself (masthead, billed to,
 * items, totals, terms); and a side panel with the payment state, details and
 * timeline.
 */
export default function InvoiceDetailView({
  invoice, downloading, onDownload,
}: {
  invoice: BillingInvoice;
  downloading: boolean;
  onDownload: (inv: BillingInvoice) => void;
}) {
  const { tenant, user } = useAuth();
  // "Due in N days" is measured from when the page opened.
  const [openedAt] = useState(() => Date.now());
  const formatAmount = formatInvoiceAmount;

  const subtotal = invoice.amount_inr || 0;
  const tax = invoice.tax_amount_inr || 0;
  const discount = invoice.discount_amount_inr || 0;
  const total = invoice.total_amount_inr || 0;
  const taxPct = subtotal > 0 && tax > 0 ? Math.round((tax / subtotal) * 100) : null;
  const reason = invoice.reason || invoice.metadata?.reason;
  const method = invoice.payment_method || invoice.metadata?.payment_method ? getInvoicePaymentLabel(invoice) : '';
  const lineItems = invoice.line_items ?? [];

  const statusKey = String(invoice.status ?? '').toUpperCase();
  const paid = statusKey === 'PAID' || !!invoice.paid_at;
  const unpaid = !paid && ['OPEN', 'PENDING', 'OVERDUE', 'DUE', 'UNPAID'].includes(statusKey);
  const dueTime = invoice.due_date ? Date.parse(invoice.due_date) : NaN;
  const daysToDue = Number.isNaN(dueTime) ? null : Math.ceil((dueTime - openedAt) / DAY_MS);
  const overdue = statusKey === 'OVERDUE' || (unpaid && daysToDue !== null && daysToDue < 0);
  const statusLabel = overdue ? 'Overdue' : statusKey.charAt(0) + statusKey.slice(1).toLowerCase();
  const dueNote = !unpaid || daysToDue === null
    ? null
    : daysToDue < 0 ? `overdue by ${-daysToDue} day${daysToDue === -1 ? '' : 's'}`
      : daysToDue === 0 ? 'due today'
        : `due in ${daysToDue} day${daysToDue === 1 ? '' : 's'}`;
  const paymentState: keyof typeof PAYMENT_STATE_CLASS = paid ? 'paid' : overdue ? 'overdue' : unpaid ? 'unpaid' : 'other';

  // Issued → paid (or still waiting).
  const timeline: { label: string; date?: string | null; state: 'done' | 'current' | 'late' }[] = [
    { label: 'Issued', date: invoice.issue_date, state: 'done' },
    paid
      ? { label: 'Paid', date: invoice.paid_at, state: 'done' }
      : unpaid
        ? { label: overdue ? 'Payment overdue' : 'Payment due', date: invoice.due_date, state: overdue ? 'late' : 'current' }
        : { label: statusLabel, date: null, state: 'done' },
  ];

  const billedToName = tenant?.name || 'Your organization';
  const billedToEmail = tenant?.email || user?.email;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href={BILLING_HISTORY_URL}
        className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing History
      </Link>

      {/* Header — number, status, key dates, actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-all text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">{invoice.invoice_number}</h1>
            <CopyButton value={invoice.invoice_number} label="invoice number" />
            <Badge variant={overdue ? 'destructive' : getInvoiceStatusVariant(invoice.status)} className="uppercase">{statusLabel}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            {billedToName} · Issued {formatISTDate(invoice.issue_date)}
            {invoice.due_date && <> · Due {formatISTDate(invoice.due_date)}</>}
            {dueNote && <span className={`ml-1 font-medium ${overdue ? 'text-destructive' : 'text-warning-strong'}`}>({dueNote})</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDownload(invoice)}
          disabled={downloading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:bg-brand-blue-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            {/* ── The invoice document ── */}
            <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
              {/* Masthead */}
              <div className="flex flex-col gap-4 border-b border-gray-100 px-4 pb-5 pt-5 dark:border-slate-700/60 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:pt-8">
                <div className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logos/talent_flow_logo.png" alt="BION TalentFlow" className="h-8 w-auto object-contain" />
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-slate-400">Invoice</p>
                  <p className="mt-1 break-all text-base font-semibold text-gray-900 dark:text-slate-50 sm:text-lg">{invoice.invoice_number}</p>
                  <dl className="mt-3 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-1 text-sm sm:justify-end">
                    <dt className="text-gray-500 dark:text-slate-400">Issue date</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatISTDate(invoice.issue_date)}</dd>
                    <dt className="text-gray-500 dark:text-slate-400">Due date</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatISTDate(invoice.due_date)}</dd>
                    {invoice.paid_at && (
                      <>
                        <dt className="text-gray-500 dark:text-slate-400">Paid on</dt>
                        <dd className="font-medium tabular-nums text-success-strong">{formatISTDate(invoice.paid_at)}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>

              {/* Billed to + service period */}
              <div className="grid grid-cols-1 gap-4 border-b border-gray-100 px-4 py-5 dark:border-slate-700/60 sm:grid-cols-2 sm:gap-6 sm:px-8 sm:py-6">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Billed to</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900 [overflow-wrap:anywhere] dark:text-slate-50">{billedToName}</p>
                  {billedToEmail && <p className="break-all text-sm text-gray-500 dark:text-slate-400">{billedToEmail}</p>}
                </div>
                {(invoice.subscription_start_date || invoice.subscription_end_date) && (
                  <div className="min-w-0 sm:text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Service period</p>
                    <p className="mt-2 text-sm tabular-nums text-gray-900 dark:text-slate-50">
                      {invoice.subscription_start_date ? formatISTDate(invoice.subscription_start_date) : '—'} – {invoice.subscription_end_date ? formatISTDate(invoice.subscription_end_date) : '—'}
                    </p>
                    {invoice.next_billing_date && (
                      <p className="text-xs text-gray-500 dark:text-slate-400">Next billing {formatISTDate(invoice.next_billing_date)}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Reason (e.g. add-on purchase, plan change) */}
              {reason && (
                <div className="mx-4 mt-5 rounded-lg border border-brand-blue/15 bg-brand-blue/[0.04] px-4 py-3 sm:mx-8 sm:mt-6">
                  <p className="text-sm font-medium text-brand-blue">{reason}</p>
                </div>
              )}

              {/* Line items */}
              <div className="overflow-x-auto px-4 pt-5 sm:px-8 sm:pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">Description</th>
                      <th className="hidden px-3 pb-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400 sm:table-cell">Qty</th>
                      <th className="hidden whitespace-nowrap px-3 pb-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400 sm:table-cell">Unit price</th>
                      <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.length > 0 ? (
                      lineItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100 last:border-0 dark:border-slate-700/60">
                          <td className="py-3 pr-3 text-gray-900 [overflow-wrap:anywhere] dark:text-slate-50">
                            {item.description || '—'}
                            {/* Qty × price under the description on phones, where those columns hide. */}
                            <span className="block text-xs text-gray-500 dark:text-slate-400 sm:hidden">
                              {item.quantity} × {formatAmount(item.unit_price)}
                            </span>
                          </td>
                          <td className="hidden px-3 py-3 text-center tabular-nums text-gray-700 dark:text-slate-300 sm:table-cell">{item.quantity}</td>
                          <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-700 dark:text-slate-300 sm:table-cell">{formatAmount(item.unit_price)}</td>
                          <td className="whitespace-nowrap py-3 text-right font-medium tabular-nums text-gray-900 dark:text-slate-50">
                            {formatAmount(Math.abs(item.amount ?? item.total ?? 0))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-3 pr-3 text-gray-900 dark:text-slate-50">{invoice.plan_name?.trim() || 'Subscription'}</td>
                        <td className="hidden px-3 py-3 text-center sm:table-cell">1</td>
                        <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums sm:table-cell">{formatAmount(subtotal)}</td>
                        <td className="whitespace-nowrap py-3 text-right font-medium tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(subtotal)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end px-4 py-5 sm:px-8 sm:py-6">
                <dl className="w-full space-y-2 text-sm sm:w-80">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-slate-400">Subtotal</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(subtotal)}</dd>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-slate-400">Discount</dt>
                      <dd className="tabular-nums text-brand-teal">−{formatAmount(discount)}</dd>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 dark:text-slate-400">GST{taxPct !== null ? ` (${taxPct}%)` : ''}</dt>
                      <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(tax)}</dd>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between gap-4 border-t border-gray-200 pt-3 dark:border-slate-700">
                    <dt className="font-semibold text-gray-900 dark:text-slate-50">Total (INR)</dt>
                    <dd className="text-lg font-semibold tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(total)}</dd>
                  </div>
                  {unpaid && (
                    <div className="flex justify-between gap-4 rounded-md bg-gray-100 px-3 py-2 dark:bg-slate-800">
                      <dt className="font-medium text-gray-900 dark:text-slate-50">Amount due</dt>
                      <dd className={`font-semibold tabular-nums ${overdue ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>{formatAmount(total)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Terms */}
              <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-4 dark:border-slate-700/60 dark:bg-slate-800/40 sm:px-8">
                <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                  <span className="font-medium text-gray-700 dark:text-slate-300">Terms &amp; Conditions:</span> Payment is due within 30 days.
                  Late payments may be subject to a service fee. For questions about this invoice, please contact billing@talentflow.com.
                </p>
              </div>
            </article>

            {/* ── Side panel: amount, payment state, details, timeline ── */}
            <aside className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900 sm:p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  {paid ? 'Amount paid' : unpaid ? 'Amount due' : 'Total'}
                </p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${overdue ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>{formatAmount(total)}</p>
                <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${PAYMENT_STATE_CLASS[paymentState]}`}>
                  {paid ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : unpaid ? <Clock className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>
                    {paid
                      ? <>Paid{invoice.paid_at && <> on {formatISTDate(invoice.paid_at)}</>}{method && <> via {method}</>}</>
                      : unpaid
                        ? <>Waiting for payment{dueNote && <> · {dueNote}</>}</>
                        : <>This invoice is {statusLabel.toLowerCase()}.</>}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white px-4 py-1.5 dark:border-slate-700/60 dark:bg-slate-900 sm:px-5">
                <dl className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {(invoice.plan_name || invoice.plan_type) && (
                    <InfoRow icon={Package} label="Plan">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {invoice.plan_name?.trim()}
                        {invoice.plan_type && (
                          <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-brand-blue">{invoice.plan_type}</span>
                        )}
                      </span>
                    </InfoRow>
                  )}
                  {invoice.billing_interval && (
                    <InfoRow icon={RefreshCw} label="Billing interval">
                      <span className="capitalize">{invoice.billing_interval.toLowerCase()}</span>
                    </InfoRow>
                  )}
                  <InfoRow icon={CreditCard} label="Payment method">
                    {method || <span className="text-gray-400 dark:text-slate-500">{paid ? 'Not recorded' : '—'}</span>}
                  </InfoRow>
                  {invoice.razorpay_payment_id && (
                    <InfoRow icon={Hash} label="Payment ID">
                      <span className="flex items-center gap-1">
                        <span className="min-w-0 break-all font-mono text-xs">{invoice.razorpay_payment_id}</span>
                        <CopyButton value={invoice.razorpay_payment_id} label="payment ID" />
                      </span>
                    </InfoRow>
                  )}
                  {invoice.razorpay_order_id && (
                    <InfoRow icon={Hash} label="Order ID">
                      <span className="flex items-center gap-1">
                        <span className="min-w-0 break-all font-mono text-xs">{invoice.razorpay_order_id}</span>
                        <CopyButton value={invoice.razorpay_order_id} label="order ID" />
                      </span>
                    </InfoRow>
                  )}
                  {invoice.subscription_start_date && (
                    <InfoRow icon={CalendarDays} label="Service period">
                      {formatISTDate(invoice.subscription_start_date)} – {invoice.subscription_end_date ? formatISTDate(invoice.subscription_end_date) : '—'}
                    </InfoRow>
                  )}
                </dl>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900 sm:p-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">Timeline</p>
                <ol className="space-y-3">
                  {timeline.map((step, i) => (
                    <li key={i} className="relative flex gap-3">
                      {i < timeline.length - 1 && <span aria-hidden className="absolute bottom-[-12px] left-[7px] top-5 w-px bg-gray-200 dark:bg-slate-700" />}
                      <span className="mt-0.5 shrink-0">
                        {step.state === 'done' ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : step.state === 'late' ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Circle className="h-4 w-4 text-warning" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-50">{step.label}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{step.date ? formatISTDate(step.date) : '—'}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
      </div>
    </div>
  );
}
