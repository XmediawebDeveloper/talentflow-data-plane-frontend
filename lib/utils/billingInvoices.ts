/**
 * Billing invoices — the shape `/billing/invoices/billing` returns and the
 * helpers both the Billing History list and the invoice page use.
 * (Kept out of the page files: a Next.js page may only export its component.)
 */

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount?: number;
  total?: number;
  unit?: string;
}

export interface InvoiceMetadata {
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

export interface BillingInvoice {
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

export type InvoiceStatusVariant = 'success' | 'warning' | 'destructive' | 'info' | 'muted';

/** A paid recurring invoice's "due date" is really its next billing date. */
export function normalizeBillingInvoice(inv: BillingInvoice): BillingInvoice {
  const status = (inv.status || '').toUpperCase();
  const normalizedDueDate =
    status === 'PAID' && inv.billing_interval && (inv.next_billing_date || inv.subscription_end_date)
      ? (inv.next_billing_date || inv.subscription_end_date || inv.due_date)
      : inv.due_date;

  return normalizedDueDate === inv.due_date
    ? inv
    : { ...inv, due_date: normalizedDueDate };
}

export const formatInvoiceAmount = (amount: number) =>
  `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Canonical status → shared Badge variant (same status looks the same everywhere). */
export const getInvoiceStatusVariant = (status: string): InvoiceStatusVariant => {
  switch (status.toLowerCase()) {
    case 'paid': case 'success': return 'success';
    case 'pending': return 'warning';
    case 'failed': case 'refunded': return 'destructive';
    case 'open': return 'info';
    default: return 'muted';
  }
};

/** "Upi • mvtaeqoh" — the method plus the last 8 of the payment reference. */
export const getInvoicePaymentLabel = (inv: BillingInvoice) => {
  const method = inv.payment_method || inv.metadata?.payment_method;
  const ref = inv.razorpay_payment_id || inv.metadata?.payment_reference;
  if (!method && !ref) return '-';
  if (method && ref) return `${method.charAt(0).toUpperCase() + method.slice(1)} • ${ref.slice(-8)}`;
  return method ? method.charAt(0).toUpperCase() + method.slice(1) : (ref ? `••${ref.slice(-8)}` : '-');
};

/** The invoice's own page. */
export const invoicePageUrl = (invoiceNumber: string) =>
  `/subscription/invoices/${encodeURIComponent(invoiceNumber)}`;

/** Billing History — a section of the Current Plan page. */
export const BILLING_HISTORY_URL = '/subscription/current-plan?section=billing-history';
