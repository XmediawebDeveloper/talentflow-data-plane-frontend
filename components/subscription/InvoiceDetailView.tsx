'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Loader2, CheckCircle, Clock, AlertCircle, Circle, Copy, Package, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import {
  BILLING_HISTORY_URL, formatInvoiceAmount, getInvoiceStatusVariant, type BillingInvoice,
} from '@/lib/utils/billingInvoices';
import { SELLER, amountInWords, type InvoiceParty } from '@/lib/utils/pdfInvoice';
import { IconButton } from '@/components/ui/icon-button';

const DAY_MS = 24 * 60 * 60 * 1000;

const PAYMENT_STATE_CLASS: Record<'paid' | 'overdue' | 'unpaid' | 'other', string> = {
  paid: 'bg-success-subtle text-success-strong',
  overdue: 'bg-destructive-subtle text-destructive-strong',
  unpaid: 'bg-warning-subtle text-warning-strong',
  other: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300',
};

const LABEL = 'text-2xs font-bold uppercase tracking-[0.08em] text-brand-blue';

const capitalize = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

/** Copy-to-clipboard for ids. */
function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <IconButton bare label={`Copy ${label}`}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`Copied ${label}`);
        } catch (err) {
          showErrorToast(err, `Couldn't copy the ${label}`);
        }
      }}
      className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <Copy className="h-3.5 w-3.5" />
    </IconButton>
  );
}

/** Label / value rows inside a party or payment card; empty values are left out. */
function KeyValues({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  const kept = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!kept.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
      {kept.map(([k, v, mono]) => (
        <div key={k} className="contents">
          <dt className="text-gray-500 dark:text-slate-400">{k}</dt>
          <dd className={`text-gray-900 [overflow-wrap:anywhere] dark:text-slate-100 ${mono ? 'font-mono text-[11px]' : ''}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One invoice as a page, laid out like the downloadable tax invoice (the same
 * design as the PDF): title + status, key dates, From / Bill to with both
 * companies' addresses, line items, amount in words, payment details and
 * totals. The side panel keeps the payment state, plan and timeline.
 */
export default function InvoiceDetailView({
  invoice, billTo, downloading, onDownload,
}: {
  invoice: BillingInvoice;
  /** The tenant as printed in "Bill to" (company profile + signed-in user). */
  billTo: InvoiceParty;
  downloading: boolean;
  onDownload: (inv: BillingInvoice) => void;
}) {
  // "Due in N days" is measured from when the page opened.
  const [openedAt] = useState(() => Date.now());
  const formatAmount = formatInvoiceAmount;

  const subtotal = invoice.amount_inr || 0;
  const tax = invoice.tax_amount_inr || 0;
  const discount = invoice.discount_amount_inr || 0;
  const total = invoice.total_amount_inr || 0;
  const taxable = subtotal - discount;
  const taxPct = taxable > 0 && tax > 0 ? Math.round((tax / taxable) * 1000) / 10 : null;
  const reason = invoice.reason || invoice.metadata?.reason;
  const paymentMethod = invoice.payment_method || invoice.metadata?.payment_method || '';
  const paymentRef = invoice.razorpay_payment_id || invoice.metadata?.razorpay_payment_id || invoice.metadata?.payment_reference || '';
  const orderId = invoice.razorpay_order_id || invoice.metadata?.razorpay_order_id || '';
  const lineItems = invoice.line_items ?? [];

  const statusKey = String(invoice.status ?? '').toUpperCase();
  const paid = statusKey === 'PAID' || !!invoice.paid_at;
  const unpaid = !paid && ['OPEN', 'PENDING', 'OVERDUE', 'DUE', 'UNPAID'].includes(statusKey);
  const dueTime = invoice.due_date ? Date.parse(invoice.due_date) : NaN;
  const daysToDue = Number.isNaN(dueTime) ? null : Math.ceil((dueTime - openedAt) / DAY_MS);
  const overdue = statusKey === 'OVERDUE' || (unpaid && daysToDue !== null && daysToDue < 0);
  const statusLabel = overdue ? 'Overdue' : capitalize(statusKey);
  const dueNote = !unpaid || daysToDue === null
    ? null
    : daysToDue < 0 ? `overdue by ${-daysToDue} day${daysToDue === -1 ? '' : 's'}`
      : daysToDue === 0 ? 'due today'
        : `due in ${daysToDue} day${daysToDue === 1 ? '' : 's'}`;
  const paymentState: keyof typeof PAYMENT_STATE_CLASS = paid ? 'paid' : overdue ? 'overdue' : unpaid ? 'unpaid' : 'other';

  const period = invoice.subscription_start_date || invoice.subscription_end_date
    ? `${invoice.subscription_start_date ? formatISTDate(invoice.subscription_start_date) : '—'} – ${invoice.subscription_end_date ? formatISTDate(invoice.subscription_end_date) : '—'}`
    : '';

  // Same key dates as the PDF; empty ones drop out.
  const meta = ([
    ['Invoice date', formatISTDate(invoice.issue_date)],
    ['Due date', paid ? '' : formatISTDate(invoice.due_date)],
    ['Service period', period],
    ['Place of supply', SELLER.placeOfSupply],
    ['Paid on', paid && invoice.paid_at ? formatISTDate(invoice.paid_at) : ''],
  ] as [string, string][]).filter(([, v]) => v);

  // Issued → paid (or still waiting).
  const timeline: { label: string; date?: string | null; state: 'done' | 'current' | 'late' }[] = [
    { label: 'Issued', date: invoice.issue_date, state: 'done' },
    paid
      ? { label: 'Paid', date: invoice.paid_at, state: 'done' }
      : unpaid
        ? { label: overdue ? 'Payment overdue' : 'Payment due', date: invoice.due_date, state: overdue ? 'late' : 'current' }
        : { label: statusLabel, date: null, state: 'done' },
  ];

  const billedToName = billTo.company || billTo.name || 'Your organization';
  const billAddress = (billTo.address || []).filter(Boolean) as string[];
  const items = lineItems.length > 0
    ? lineItems.map((item) => {
        const amount = Math.abs(item.amount ?? item.total ?? (item.quantity || 0) * (item.unit_price || 0));
        return {
          description: item.description || '—',
          sub: item.unit && item.quantity ? `${item.quantity.toLocaleString('en-IN')} ${item.unit}` : period ? `Service period ${period}` : '',
          qty: item.unit ? 1 : item.quantity ?? 1,
          rate: item.unit ? amount : Math.abs(item.unit_price ?? amount),
          amount,
        };
      })
    : [{ description: invoice.plan_name?.trim() || 'Subscription', sub: period ? `Service period ${period}` : '', qty: 1, rate: subtotal, amount: subtotal }];

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
        {/* ── The invoice document (same layout as the PDF) ── */}
        <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900">
          <div aria-hidden className="h-1.5 bg-gradient-to-r from-brand-blue via-brand-blue to-[var(--raw-079cc4)]" />

          <div className="space-y-5 px-4 py-5 sm:px-8 sm:py-7">
            {/* Logo | title, number, status */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/talent_flow_logo.png" alt="BION TalentFlow" className="h-8 w-auto self-start object-contain" />
              <div className="sm:text-right">
                <p className="text-xl font-extrabold uppercase tracking-[0.02em] text-brand-blue">Tax Invoice</p>
                <p className="mt-0.5 break-all text-sm font-semibold text-gray-900 dark:text-slate-50"># {invoice.invoice_number}</p>
              </div>
            </div>

            {/* Key dates */}
            {meta.length > 0 && (
              <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
                {meta.map(([k, v]) => (
                  <div key={k} className="border-b border-r border-gray-200 px-4 py-2.5 last:border-r-0 dark:border-slate-700/60 sm:border-b-0 [&:last-child:nth-child(odd)]:col-span-2 sm:[&:last-child:nth-child(odd)]:col-span-1">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.06em] text-gray-500 dark:text-slate-400">{k}</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-50">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* From | Bill to — both companies with their addresses */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 px-4 py-3.5 text-sm text-gray-500 dark:border-slate-700/60 dark:text-slate-400">
                <p className={`${LABEL} mb-1.5`}>From</p>
                <p className="font-bold text-gray-900 dark:text-slate-50">{SELLER.name}</p>
                {SELLER.address.map((line) => <p key={line}>{line}</p>)}
                <KeyValues rows={[['Email', SELLER.email], ['Phone', SELLER.phone], ['GSTIN', SELLER.gstin, true], ['PAN', SELLER.pan, true]]} />
              </div>
              <div className="rounded-xl border border-brand-blue/20 bg-brand-blue/[0.05] px-4 py-3.5 text-sm text-gray-500 dark:border-brand-blue/30 dark:bg-brand-blue/10 dark:text-slate-400">
                <p className={`${LABEL} mb-1.5`}>Bill to</p>
                <p className="font-bold text-gray-900 [overflow-wrap:anywhere] dark:text-slate-50">{billedToName}</p>
                {billTo.name && billTo.name !== billedToName && (
                  <p className="font-medium text-gray-900 dark:text-slate-100">{billTo.name}</p>
                )}
                {billAddress.length > 0
                  ? billAddress.map((line) => <p key={line} className="[overflow-wrap:anywhere]">{line}</p>)
                  : (
                    <p className="text-xs italic text-gray-500 dark:text-slate-500">
                      No address yet — add it in{' '}
                      <Link href="/organization/company-profile" className="not-italic text-brand-blue hover:underline">Company Profile</Link>.
                    </p>
                  )}
                <KeyValues rows={[['Email', billTo.email], ['Phone', billTo.phone], ['GSTIN', billTo.gstin, true]]} />
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-blue text-left text-2xs font-bold uppercase tracking-[0.06em] text-white">
                    <th className="hidden w-10 px-3 py-2.5 text-center sm:table-cell">#</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="hidden px-3 py-2.5 text-right sm:table-cell">Qty</th>
                    <th className="hidden px-3 py-2.5 text-right sm:table-cell">Rate</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-200 even:bg-slate-50 dark:border-slate-700/60 dark:even:bg-slate-800/40">
                      <td className="hidden px-3 py-3 text-center align-top text-gray-500 dark:text-slate-400 sm:table-cell">{idx + 1}</td>
                      <td className="px-3 py-3 align-top [overflow-wrap:anywhere]">
                        <p className="font-semibold text-gray-900 dark:text-slate-50">{item.description}</p>
                        {item.sub && <p className="text-xs text-gray-500 dark:text-slate-400">{item.sub}</p>}
                        {/* Qty × rate under the description on phones, where those columns hide. */}
                        <p className="text-xs text-gray-500 dark:text-slate-400 sm:hidden">{item.qty} × {formatAmount(item.rate)}</p>
                      </td>
                      <td className="hidden px-3 py-3 text-right align-top tabular-nums text-gray-700 dark:text-slate-300 sm:table-cell">{item.qty}</td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right align-top tabular-nums text-gray-700 dark:text-slate-300 sm:table-cell">{formatAmount(item.rate)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right align-top font-semibold tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Amount in words + payment | totals */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] sm:gap-6">
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-slate-700/60">
                  <p className={`${LABEL} mb-1`}>Amount in words</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">{amountInWords(total)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-slate-700/60">
                  <p className={LABEL}>Payment details</p>
                  <KeyValues
                    rows={[
                      ['Method', capitalize(paymentMethod) || (paid ? '—' : 'Awaiting payment')],
                      ['Reference', paymentRef && (
                        <span className="inline-flex items-center gap-1"><span className="break-all">{paymentRef}</span><CopyButton value={paymentRef} label="payment ID" /></span>
                      ), true],
                      ['Order ID', orderId && (
                        <span className="inline-flex items-center gap-1"><span className="break-all">{orderId}</span><CopyButton value={orderId} label="order ID" /></span>
                      ), true],
                    ]}
                  />
                </div>
                {reason && (
                  <div className="rounded-xl bg-brand-blue/[0.06] px-4 py-3 dark:bg-brand-blue/10">
                    <p className={`${LABEL} mb-1`}>Note</p>
                    <p className="text-sm text-gray-900 dark:text-slate-100">{capitalize(String(reason).replace(/_/g, ' '))}</p>
                  </div>
                )}
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-slate-400">Subtotal</dt>
                  <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(subtotal)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-slate-400">Discount</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-slate-50">−{formatAmount(discount)}</dd>
                  </div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-slate-400">GST{taxPct !== null ? ` (${taxPct}%)` : ''}</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(tax)}</dd>
                  </div>
                )}
                <div className="!mt-3 flex justify-between gap-4 rounded-lg bg-brand-blue px-3 py-2.5 text-white">
                  <dt className="font-bold">Total (INR)</dt>
                  <dd className="text-base font-extrabold tabular-nums">{formatAmount(total)}</dd>
                </div>
                {paid ? (
                  <div className="flex justify-between gap-4 pt-1">
                    <dt className="text-gray-500 dark:text-slate-400">Amount paid</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(total)}</dd>
                  </div>
                ) : unpaid && (
                  <div className="flex justify-between gap-4 pt-1 font-bold">
                    <dt className="text-gray-900 dark:text-slate-50">Balance due</dt>
                    <dd className={`tabular-nums ${overdue ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>{formatAmount(total)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-4 text-xs text-gray-500 dark:border-slate-700/60 dark:text-slate-400 sm:flex-row sm:items-end sm:justify-between sm:px-8">
            <div className="space-y-1">
              {(paid || unpaid) && (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">Terms:</span>{' '}
                  {paid ? 'Thank you for your payment.' : 'Payment is due by the due date shown above.'}
                </p>
              )}
              <p>This is a computer-generated tax invoice and does not require a signature.</p>
              {(SELLER.email || SELLER.phone) && (
                <p>
                  Questions? {[SELLER.email && `Write to ${SELLER.email}`, SELLER.phone && `call ${SELLER.phone}`].filter(Boolean).join(' or ')}.
                </p>
              )}
            </div>
            <p className="shrink-0 sm:text-right">
              <span className="block font-semibold text-gray-900 dark:text-slate-100">For {SELLER.name}</span>
              Authorised signatory
            </p>
          </div>
          <div aria-hidden className="h-1 bg-gradient-to-r from-[var(--raw-079cc4)] to-brand-blue" />
        </article>

        {/* ── Side panel: amount, payment state, plan, timeline ── */}
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
                  ? <>Paid{invoice.paid_at && <> on {formatISTDate(invoice.paid_at)}</>}{paymentMethod && <> via {capitalize(paymentMethod)}</>}</>
                  : unpaid
                    ? <>Waiting for payment{dueNote && <> · {dueNote}</>}</>
                    : <>This invoice is {statusLabel.toLowerCase()}.</>}
              </span>
            </div>
          </div>

          {(invoice.plan_name || invoice.billing_interval) && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900 sm:p-5">
              {invoice.plan_name && (
                <div className="flex items-start gap-3">
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-slate-400">Plan</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-900 dark:text-slate-50">
                      {invoice.plan_name.trim()}
                      {invoice.plan_type && (
                        <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-brand-blue">{invoice.plan_type}</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
              {invoice.billing_interval && (
                <div className="flex items-start gap-3">
                  <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-500" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Billing interval</p>
                    <p className="text-sm text-gray-900 dark:text-slate-50">{capitalize(invoice.billing_interval)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

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
