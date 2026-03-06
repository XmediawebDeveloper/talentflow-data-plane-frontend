/**
 * PDF Invoice/Receipt/Dispute generation utilities.
 * Uses html2pdf.js with the same pattern as JobDetailView.tsx.
 */

import { formatISTDate } from '@/lib/utils/dateUtils';

// ── Types (match the interfaces in the billing pages) ──────────────

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface BillingLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount?: number;
  total?: number;
  unit?: string;
}

interface BillingInvoice {
  id: number;
  invoice_number: string;
  invoice_type: string;
  amount_inr: number;
  tax_amount_inr: number;
  discount_amount_inr: number;
  total_amount_inr: number;
  status: string;
  issue_date: string;
  due_date: string;
  paid_at?: string | null;
  line_items: BillingLineItem[];
  metadata: {
    reason?: string;
    plan_name?: string;
    payment_method?: string;
    payment_reference?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    to_plan_name?: string;
    from_plan_name?: string;
    [key: string]: unknown;
  };
  payment_method?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
  subscription_start_date?: string;
  subscription_end_date?: string;
  next_billing_date?: string;
  billing_interval?: string;
  plan_name?: string;
  plan_type?: string;
  reason?: string;
}

interface RefundInvoice {
  id: number;
  invoice_number: string;
  invoice_type: string;
  total_amount_inr: number;
  status: string;
  issue_date: string;
  due_date: string;
  line_items: LineItem[];
  metadata: {
    reason?: string;
    notes?: string;
    processed_by?: string;
    refund_method?: string;
    razorpay_refund_id?: string | null;
    refund_percentage?: number;
    original_invoice_number?: string;
    [key: string]: unknown;
  };
  payment_method?: string;
  razorpay_payment_id?: string;
  paid_at?: string;
}

interface DisputeInvoice {
  id: number;
  invoice_number: string;
  invoice_type: string;
  total_amount_inr: number;
  status: string;
  issue_date: string;
  due_date: string;
  line_items: LineItem[];
  metadata: {
    reason?: string;
    deadline?: string;
    bank_reference?: string;
    customer_claim?: string;
    dispute_status?: string;
    razorpay_dispute_id?: string;
    original_invoice_number?: string;
    [key: string]: unknown;
  };
  reason?: string;
  dispute_status?: string;
  customer_claim?: string;
  deadline?: string;
  payment_method?: string;
  razorpay_payment_id?: string;
  paid_at?: string;
}

// ── Private helpers ────────────────────────────────────────────────

let _logoCache: string | null = null;

async function loadLogoBase64(): Promise<string> {
  if (_logoCache !== null) return _logoCache;
  try {
    const res = await fetch('/talent_flow_logo.png');
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataUri = canvas.toDataURL('image/png');
        _logoCache = dataUri;
        resolve(dataUri);
      };
      img.onerror = () => {
        _logoCache = '';
        resolve('');
      };
      img.src = URL.createObjectURL(blob);
    });
  } catch {
    _logoCache = '';
    return '';
  }
}

async function renderToPDF(html: string, filename: string): Promise<void> {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  document.body.appendChild(tempDiv);
  try {
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(tempDiv)
      .save();
  } finally {
    document.body.removeChild(tempDiv);
  }
}

function fmtDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return formatISTDate(dateString) || '-';
}

function fmtAmount(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function headerHTML(logo: string, title: string, accent: string, number: string, companyName?: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #1f2937; padding-bottom: 8px;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 3px solid ${accent}; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${logo ? `<img src="${logo}" style="height: 38px; width: auto; display: block;" />` : ''}
          <div style="line-height: 1.2;">
            <div style="font-size: 20px; font-weight: 700; color: #111827;">TalentFlow</div>
            ${companyName ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${companyName}</div>` : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 22px; font-weight: 700; color: ${accent}; letter-spacing: 1px;">${title}</div>
          <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">${number}</div>
        </div>
      </div>`;
}

function footerHTML(): string {
  return `
      <!-- Footer -->
      <div style="margin-top: 28px; padding-top: 16px; padding-bottom: 28px; border-top: 1px solid #e5e7eb; text-align: center;">
        <div style="font-size: 13px; color: #6b7280;">Thank you for your business!</div>
        <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Generated on ${fmtDate(new Date().toISOString())}</div>
      </div>
    </div>`;
}

function infoGrid(rows: [string, string][]): string {
  const cells = rows
    .filter(([, v]) => v && v !== '-')
    .map(
      ([label, value]) =>
        `<div style="padding: 8px 4px; overflow: visible;">
          <div style="font-size: 10px; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.5px; margin-bottom: 4px;">${label}</div>
          <div style="font-size: 13px; font-weight: 500; color: #1f2937;">${value}</div>
        </div>`
    )
    .join('');

  return `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 16px; margin-bottom: 20px; background: #f9fafb; padding: 12px 16px; border-radius: 8px; overflow: visible;">
      ${cells}
    </div>`;
}

function statusBadge(status: string, color: string): string {
  return `<span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: ${color}20; color: ${color}; border: 1px solid ${color}40;">${status.toUpperCase()}</span>`;
}

// ── Exported generators ────────────────────────────────────────────

export async function generateBillingInvoicePDF(
  inv: BillingInvoice,
  companyName?: string
): Promise<void> {
  const logo = await loadLogoBase64();

  const statusColor =
    inv.status?.toLowerCase() === 'paid' ? '#16a34a' :
    inv.status?.toLowerCase() === 'open' ? '#2563eb' :
    inv.status?.toLowerCase() === 'pending' ? '#ca8a04' : '#6b7280';

  const paymentMethod = inv.payment_method || inv.metadata?.payment_method || null;
  const paymentRef = inv.razorpay_payment_id || inv.metadata?.razorpay_payment_id || null;
  const orderId = inv.razorpay_order_id || inv.metadata?.razorpay_order_id || null;

  // Subscription period section
  let subscriptionHTML = '';
  if (inv.subscription_start_date || inv.billing_interval) {
    const parts: string[] = [];
    if (inv.subscription_start_date)
      parts.push(`<span style="font-weight:500;">${fmtDate(inv.subscription_start_date)}</span> → <span style="font-weight:500;">${fmtDate(inv.subscription_end_date)}</span>`);
    if (inv.billing_interval)
      parts.push(`<span style="text-transform:capitalize;">${inv.billing_interval.toLowerCase()}</span>`);
    if (inv.next_billing_date)
      parts.push(`Next billing: ${fmtDate(inv.next_billing_date)}`);
    subscriptionHTML = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 16px;margin-bottom:20px;font-size:13px;color:#1e40af;">
        <span style="font-weight:600;">Subscription Period:</span> ${parts.join(' | ')}
      </div>`;
  }

  // Line items rows
  const lineRows = (inv.line_items || []).map(item => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${item.description}</td>
      <td style="padding:8px 12px;font-size:13px;color:#374151;text-align:center;border-bottom:1px solid #f3f4f6;">${item.quantity}</td>
      <td style="padding:8px 12px;font-size:13px;color:#374151;text-align:right;border-bottom:1px solid #f3f4f6;">${fmtAmount(item.unit_price)}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1f2937;text-align:right;border-bottom:1px solid #f3f4f6;">${fmtAmount(Math.abs(item.amount ?? item.total ?? 0))}</td>
    </tr>`).join('');

  const html = `
    ${headerHTML(logo, 'INVOICE', '#1f2937', inv.invoice_number, companyName)}

    ${infoGrid([
      ['Issue Date', fmtDate(inv.issue_date)],
      ['Due Date', fmtDate(inv.due_date)],
      ['Status', statusBadge(inv.status || '-', statusColor)],
      ['Payment Method', paymentMethod ? paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1) : '-'],
      ['Paid At', fmtDate(inv.paid_at)],
      ['Plan', (inv.plan_name || '').trim() || '-'],
    ])}

    ${subscriptionHTML}

    <!-- Line Items -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Unit Price</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:13px;">No line items</td></tr>'}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
      <div style="width:260px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
          <span style="color:#6b7280;">Subtotal</span>
          <span style="color:#1f2937;">${fmtAmount(inv.amount_inr || 0)}</span>
        </div>
        ${(inv.tax_amount_inr || 0) > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
          <span style="color:#6b7280;">Tax (GST)</span>
          <span style="color:#1f2937;">${fmtAmount(inv.tax_amount_inr)}</span>
        </div>` : ''}
        ${(inv.discount_amount_inr || 0) > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
          <span style="color:#6b7280;">Discount</span>
          <span style="color:#16a34a;">-${fmtAmount(inv.discount_amount_inr)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:6px;border-top:2px solid #1f2937;font-size:16px;font-weight:700;">
          <span style="color:#1f2937;">TOTAL</span>
          <span style="color:#1f2937;">${fmtAmount(inv.total_amount_inr || 0)}</span>
        </div>
      </div>
    </div>

    ${paymentRef || orderId ? `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 16px;margin-bottom:16px;">
      ${paymentRef ? `
      <div style="margin-bottom:${orderId ? '8px' : '0'};">
        <div style="font-size:10px;text-transform:uppercase;color:#3b82f6;font-weight:600;margin-bottom:2px;">Payment ID</div>
        <div style="font-size:13px;color:#1e3a5f;font-family:monospace;">${paymentRef}</div>
      </div>` : ''}
      ${orderId ? `
      <div>
        <div style="font-size:10px;text-transform:uppercase;color:#3b82f6;font-weight:600;margin-bottom:2px;">Order ID</div>
        <div style="font-size:13px;color:#1e3a5f;font-family:monospace;">${orderId}</div>
      </div>` : ''}
    </div>` : ''}

    ${inv.reason || inv.metadata?.reason ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin-bottom:16px;">
      <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:600;margin-bottom:2px;">Reason</div>
      <div style="font-size:13px;color:#374151;">${inv.reason || inv.metadata?.reason}</div>
    </div>` : ''}

    ${footerHTML()}
  `;

  await renderToPDF(html, `${inv.invoice_number || 'invoice'}.pdf`);
}

export async function generateRefundReceiptPDF(
  refund: RefundInvoice,
  companyName?: string
): Promise<void> {
  const logo = await loadLogoBase64();
  const GREEN = '#16a34a';

  const statusColor =
    ['refunded', 'completed', 'success'].includes(refund.status?.toLowerCase()) ? '#16a34a' :
    ['pending', 'processing'].includes(refund.status?.toLowerCase()) ? '#ca8a04' : '#dc2626';

  const html = `
    ${headerHTML(logo, 'REFUND RECEIPT', GREEN, refund.invoice_number, companyName)}

    ${infoGrid([
      ['Refund #', refund.invoice_number],
      ['Issue Date', fmtDate(refund.issue_date)],
      ['Original Invoice', refund.metadata?.original_invoice_number || '-'],
      ['Status', statusBadge(refund.status || '-', statusColor)],
      ['Refund Method', refund.metadata?.refund_method || '-'],
      ['Payment Method', refund.payment_method ? refund.payment_method.charAt(0).toUpperCase() + refund.payment_method.slice(1) : '-'],
      ['Paid At', fmtDate(refund.paid_at)],
    ])}

    <!-- Details -->
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
      <div style="background: #f9fafb; padding: 8px 16px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.5px;">Refund Details</div>
      </div>
      <div style="padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Description</span>
          <span style="color: #1f2937; font-weight: 500;">${refund.line_items?.[0]?.description || '-'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Reason</span>
          <span style="color: #1f2937; font-weight: 500;">${refund.metadata?.reason || '-'}</span>
        </div>
        ${refund.metadata?.refund_percentage ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Refund Percentage</span>
          <span style="color: #1f2937; font-weight: 500;">${refund.metadata.refund_percentage}%</span>
        </div>` : ''}
        ${refund.metadata?.processed_by ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Processed By</span>
          <span style="color: #1f2937; font-weight: 500;">${refund.metadata.processed_by}</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Refund Amount Card -->
    <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 16px; font-weight: 600; color: #1f2937;">Refund Amount</span>
      <span style="font-size: 24px; font-weight: 700; color: ${GREEN};">+${fmtAmount(Math.abs(refund.total_amount_inr || 0))}</span>
    </div>

    ${refund.metadata?.razorpay_refund_id ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;">
      <div style="font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 600; margin-bottom: 2px;">Razorpay Refund ID</div>
      <div style="font-size: 13px; color: #1e3a5f; font-family: monospace;">${refund.metadata.razorpay_refund_id}</div>
    </div>` : ''}

    ${refund.razorpay_payment_id ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;">
      <div style="font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 600; margin-bottom: 2px;">Razorpay Payment ID</div>
      <div style="font-size: 13px; color: #1e3a5f; font-family: monospace;">${refund.razorpay_payment_id}</div>
    </div>` : ''}

    ${refund.metadata?.notes ? `
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;">
      <div style="font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 2px;">Notes</div>
      <div style="font-size: 13px; color: #374151;">${refund.metadata.notes}</div>
    </div>` : ''}

    ${footerHTML()}
  `;

  await renderToPDF(html, `${refund.invoice_number || 'refund'}.pdf`);
}

export async function generateDisputeRecordPDF(
  dispute: DisputeInvoice,
  companyName?: string
): Promise<void> {
  const logo = await loadLogoBase64();
  const ORANGE = '#ea580c';

  const disputeStatus = dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || '-';
  const statusColor =
    ['won', 'resolved'].includes(disputeStatus.toLowerCase()) ? '#16a34a' :
    ['open', 'pending', 'under_review'].includes(disputeStatus.toLowerCase()) ? '#ca8a04' :
    ['lost', 'rejected'].includes(disputeStatus.toLowerCase()) ? '#dc2626' : '#ea580c';

  const html = `
    ${headerHTML(logo, 'DISPUTE RECORD', ORANGE, dispute.invoice_number, companyName)}

    ${infoGrid([
      ['Dispute #', dispute.invoice_number],
      ['Issue Date', fmtDate(dispute.issue_date)],
      ['Deadline', fmtDate(dispute.metadata?.deadline || dispute.deadline)],
      ['Status', statusBadge(disputeStatus, statusColor)],
      ['Original Invoice', dispute.metadata?.original_invoice_number || '-'],
      ['Payment Method', dispute.payment_method ? dispute.payment_method.charAt(0).toUpperCase() + dispute.payment_method.slice(1) : '-'],
      ['Paid At', fmtDate(dispute.paid_at)],
    ])}

    <!-- Details -->
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
      <div style="background: #f9fafb; padding: 8px 16px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.5px;">Dispute Details</div>
      </div>
      <div style="padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Description</span>
          <span style="color: #1f2937; font-weight: 500;">${dispute.line_items?.[0]?.description || '-'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Reason</span>
          <span style="color: #1f2937; font-weight: 500;">${dispute.metadata?.reason || dispute.reason || '-'}</span>
        </div>
        ${(dispute.metadata?.customer_claim || dispute.customer_claim) ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Customer Claim</span>
          <span style="color: #1f2937; font-weight: 500; max-width: 350px; text-align: right;">${dispute.metadata?.customer_claim || dispute.customer_claim}</span>
        </div>` : ''}
        ${dispute.metadata?.bank_reference ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #6b7280;">Bank Reference</span>
          <span style="color: #1f2937; font-weight: 500; font-family: monospace;">${dispute.metadata.bank_reference}</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Disputed Amount Card -->
    <div style="background: #fff7ed; border: 2px solid #fdba74; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 16px; font-weight: 600; color: #1f2937;">Disputed Amount</span>
      <span style="font-size: 24px; font-weight: 700; color: ${ORANGE};">${fmtAmount(dispute.total_amount_inr || 0)}</span>
    </div>

    ${dispute.metadata?.razorpay_dispute_id ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;">
      <div style="font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 600; margin-bottom: 2px;">Razorpay Dispute ID</div>
      <div style="font-size: 13px; color: #1e3a5f; font-family: monospace;">${dispute.metadata.razorpay_dispute_id}</div>
    </div>` : ''}

    ${dispute.razorpay_payment_id ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px;">
      <div style="font-size: 10px; text-transform: uppercase; color: #3b82f6; font-weight: 600; margin-bottom: 2px;">Razorpay Payment ID</div>
      <div style="font-size: 13px; color: #1e3a5f; font-family: monospace;">${dispute.razorpay_payment_id}</div>
    </div>` : ''}

    <!-- Support Note -->
    <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
      <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 4px;">Need Assistance?</div>
      <div style="font-size: 12px; color: #a16207;">If you have questions about this dispute, please contact our support team for assistance.</div>
    </div>

    ${footerHTML()}
  `;

  await renderToPDF(html, `${dispute.invoice_number || 'dispute'}.pdf`);
}
