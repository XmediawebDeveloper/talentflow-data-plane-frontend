'use client';

import type { ReactNode } from 'react';
import { X, Calendar, CalendarCheck, CalendarClock, RefreshCw, CreditCard, Package, FileText, Receipt, FileSignature, Download, Loader2 } from 'lucide-react';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';

type StatusVariant = 'success' | 'warning' | 'destructive' | 'info' | 'muted';

// Structural subset of the billing-history invoice — only what the modal reads.
export interface InvoiceDetail {
  id: number;
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  paid_at?: string | null;
  billing_interval?: string;
  payment_method?: string | null;
  plan_name?: string;
  plan_type?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  next_billing_date?: string;
  line_items: { description: string; quantity: number; unit_price: number; amount?: number; total?: number }[];
  amount_inr: number;
  tax_amount_inr: number;
  discount_amount_inr: number;
  total_amount_inr: number;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
  reason?: string;
  metadata?: { reason?: string; payment_method?: string };
}

interface InvoiceDetailModalProps<T extends InvoiceDetail> {
  invoice: T;
  downloading: boolean;
  onClose: () => void;
  onDownload: (inv: T) => void;
  formatAmount: (amount: number) => string;
  getPaymentLabel: (inv: T) => string;
  getStatusVariant: (status: string) => StatusVariant;
  getStatusIcon: (status: string) => ReactNode;
}

const STATUS_TILE_ICON: Record<StatusVariant, string> = {
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
  warning: 'bg-warning-subtle text-warning',
  destructive: 'bg-destructive-subtle text-destructive',
  info: 'bg-brand-blue/10 text-brand-blue',
  muted: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400',
};

function InfoTile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-gray-100 dark:bg-slate-800/50 dark:ring-slate-700/60">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="tf-meta">{label}</p>
        <div className="mt-0.5 truncate tf-cell-name">{children}</div>
      </div>
    </div>
  );
}

function Section({ icon, title, children, className = '' }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 ${className}`}>
      <h3 className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 tf-subsection-title dark:border-slate-700/60 dark:bg-slate-800/50">
        <span className="text-gray-500 dark:text-slate-400">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

const tileIcon = 'h-[18px] w-[18px] text-gray-500 dark:text-slate-400';

export default function InvoiceDetailModal<T extends InvoiceDetail>({
  invoice, downloading, onClose, onDownload, formatAmount, getPaymentLabel, getStatusVariant, getStatusIcon,
}: InvoiceDetailModalProps<T>) {
  const subtotal = invoice.amount_inr || 0;
  const tax = invoice.tax_amount_inr || 0;
  const discount = invoice.discount_amount_inr || 0;
  const taxPct = subtotal > 0 && tax > 0 ? Math.round((tax / subtotal) * 100) : null;
  const reason = invoice.reason || invoice.metadata?.reason;
  const hasPaymentMethod = Boolean(invoice.payment_method || invoice.metadata?.payment_method);
  const hasPaymentRefs = Boolean(invoice.razorpay_payment_id || invoice.razorpay_order_id);
  const statusVariant = getStatusVariant(invoice.status);

  return (
    // Read-only view, so a backdrop click closes it (nothing to lose); Esc is handled by the page.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-detail-title"
        className="flex max-h-[90dvh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 sm:max-w-3xl"
      >
        {/* Header — title, invoice number */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 bg-brand-blue px-5 py-4 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
              <Receipt className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <h2 id="invoice-detail-title" className="text-lg font-semibold">Invoice Details</h2>
              <p className="mt-0.5 break-all text-sm text-white/80">{invoice.invoice_number}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {/* Key info */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
            <InfoTile icon={<Calendar className={tileIcon} />} label="Issue Date">{formatISTDate(invoice.issue_date)}</InfoTile>
            <InfoTile icon={<CalendarClock className={tileIcon} />} label="Due Date">{formatISTDate(invoice.due_date)}</InfoTile>
            <InfoTile
              icon={
                <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${STATUS_TILE_ICON[statusVariant]}`}>
                  {getStatusIcon(invoice.status)}
                </span>
              }
              label="Status"
            >
              <Badge variant={statusVariant} className="mt-0.5 uppercase">{invoice.status}</Badge>
            </InfoTile>
            {invoice.paid_at && (
              <InfoTile icon={<CalendarCheck className={tileIcon} />} label="Paid At">{formatISTDate(invoice.paid_at)}</InfoTile>
            )}
            {invoice.billing_interval && (
              <InfoTile icon={<RefreshCw className={tileIcon} />} label="Billing Interval">
                <span className="capitalize">{invoice.billing_interval.toLowerCase()}</span>
              </InfoTile>
            )}
            {hasPaymentMethod && (
              <InfoTile icon={<CreditCard className={tileIcon} />} label="Payment Method">
                <span title={getPaymentLabel(invoice)}>{getPaymentLabel(invoice)}</span>
              </InfoTile>
            )}
          </div>

          {/* Plan */}
          {(invoice.plan_name || invoice.plan_type) && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Package className="h-6 w-6 shrink-0 text-brand-blue" />
                <div className="min-w-0">
                  <p className="tf-meta">Plan</p>
                  <p className="truncate text-sm font-semibold text-brand-blue">{invoice.plan_name?.trim()}</p>
                </div>
              </div>
              {invoice.plan_type && (
                <span className="shrink-0 rounded-full bg-brand-blue/10 px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-brand-blue">
                  {invoice.plan_type}
                </span>
              )}
            </div>
          )}

          {/* Subscription period */}
          {invoice.subscription_start_date && (
            <Section icon={<Calendar className="h-4 w-4" />} title="Subscription Period">
              <div className="grid grid-cols-1 divide-y divide-gray-100 px-4 py-3 dark:divide-slate-700/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  { label: 'Start', value: invoice.subscription_start_date },
                  { label: 'End', value: invoice.subscription_end_date },
                  ...(invoice.next_billing_date ? [{ label: 'Next Billing', value: invoice.next_billing_date }] : []),
                ].map((p, i) => (
                  <div key={p.label} className={`py-2 sm:py-0 ${i > 0 ? 'sm:pl-5' : ''}`}>
                    <p className="tf-meta">{p.label}</p>
                    <p className="mt-0.5 tf-cell-name">{formatISTDate(p.value)}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Invoice items */}
          {invoice.line_items?.length > 0 && (
            <Section icon={<FileText className="h-4 w-4" />} title="Invoice Items">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-white text-xs text-gray-600 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="w-10 px-4 py-2 text-left font-semibold">#</th>
                      <th className="px-4 py-2 text-left font-semibold">Description</th>
                      <th className="px-4 py-2 text-right font-semibold">Quantity</th>
                      <th className="px-4 py-2 text-right font-semibold">Unit Price</th>
                      <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                    {invoice.line_items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-gray-800 dark:text-slate-100">{item.description}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-slate-300">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-slate-300">{formatAmount(item.unit_price)}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900 dark:text-slate-50">
                          {formatAmount(Math.abs(item.amount ?? item.total ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Payment info + reason | summary + download */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {hasPaymentRefs && (
                <Section icon={<CreditCard className="h-4 w-4" />} title="Payment Information">
                  <dl className="space-y-2 px-4 py-3">
                    {invoice.razorpay_payment_id && (
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-slate-400">Payment ID</dt>
                        <dd className="break-all text-sm text-gray-900 dark:text-slate-50">{invoice.razorpay_payment_id}</dd>
                      </div>
                    )}
                    {invoice.razorpay_order_id && (
                      <div>
                        <dt className="text-xs text-gray-500 dark:text-slate-400">Order ID</dt>
                        <dd className="break-all text-sm text-gray-900 dark:text-slate-50">{invoice.razorpay_order_id}</dd>
                      </div>
                    )}
                  </dl>
                </Section>
              )}
              {reason && (
                <Section icon={<FileSignature className="h-4 w-4" />} title="Reason">
                  <p className="px-4 py-3 text-sm text-gray-800 dark:text-slate-100">{reason}</p>
                </Section>
              )}
            </div>

            <div className="space-y-4">
              <Section icon={<Receipt className="h-4 w-4" />} title="Summary">
                <div className="space-y-1.5 px-4 pt-3 pb-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-slate-400">Subtotal</span>
                    <span className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(subtotal)}</span>
                  </div>
                  {tax > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-slate-400">Tax (GST{taxPct !== null ? ` ${taxPct}%` : ''})</span>
                      <span className="tabular-nums text-gray-900 dark:text-slate-50">{formatAmount(tax)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-slate-400">Discount</span>
                      <span className="tabular-nums text-brand-teal">-{formatAmount(discount)}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between bg-brand-blue/[0.06] px-4 py-2.5">
                  <span className="text-sm font-semibold text-brand-blue">Total (INR)</span>
                  <span className="text-base font-bold tabular-nums text-brand-blue">{formatAmount(invoice.total_amount_inr || 0)}</span>
                </div>
              </Section>

              <button
                type="button"
                onClick={() => onDownload(invoice)}
                disabled={downloading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-3 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {downloading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF...</>
                  : <><Download className="h-4 w-4" /> Download Invoice (PDF)</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
