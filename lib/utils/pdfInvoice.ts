/**
 * PDF Invoice/Receipt/Dispute generation utilities.
 * Uses html2pdf.js with the same pattern as JobDetailView.tsx.
 *
 * All three documents share one A4 layout (the TalentFlow invoice design):
 * brand bar, logo + title / number / status pill, a key-dates strip, From and
 * Bill-to cards, the items table, amount in words + payment details beside
 * the totals, and a terms / signatory footer.
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

/** The customer printed in the "Bill to" card. Empty fields are left out. */
export interface InvoiceParty {
  name?: string | null;
  company?: string | null;
  address?: (string | null | undefined)[];
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  tenantId?: string | null;
}

/** The signed-in tenant as the "Bill to" party. */
export function billToFromAuth(
  user: { name?: string; email?: string; phone?: string; tenantId?: string } | null | undefined,
  tenant: { name?: string; email?: string } | null | undefined,
): InvoiceParty {
  return {
    name: user?.name,
    company: tenant?.name,
    email: tenant?.email || user?.email,
    phone: user?.phone,
    // user.tenantId is the internal UUID — not printed; the readable tenant
    // code lives in the control plane.
  };
}

/**
 * The issuer printed in the "From" card, the footer and the signatory line.
 * Fill in the legal details here — every empty field (and the SAC column /
 * Place of supply when `sac` / `placeOfSupply` are empty) is simply omitted.
 */
export const SELLER = {
  name: 'TalentFlow',
  address: [] as string[],
  email: '',
  phone: '',
  gstin: '',
  pan: '',
  /** Services Accounting Code printed on each line item. */
  sac: '',
  /** e.g. "Karnataka (29)". */
  placeOfSupply: '',
};

// ── Palette (from the invoice design) ──────────────────────────────

const NAVY = '#0E3993';
const CYAN = '#079CC4';
const INK = '#101828';
const MUTED = '#667085';
const LINE = '#E3E8EF';
const TINT = '#F4F7FB';
const BLUE_TINT = '#EAF2FE';
const AMBER = '#B54708';
const AMBER_TINT = '#FFFAEB';
// Paid / settled pill — the control plane's invoice badge.
const TEAL = '#05779A';
const TEAL_TINT = '#E6F6FB';
const RED = '#B42318';
const RED_TINT = '#FEF3F2';
const ORANGE = '#C4320A';
const GREY_TINT = '#F2F4F7';

const STYLES = `
<style>
  .tfi { width: 718px; margin: 0 auto; font-family: Inter, 'Segoe UI', Arial, Helvetica, sans-serif; color: ${INK}; font-size: 11.5px; line-height: 1.5; background: #FFFFFF; }
  .tfi * { box-sizing: border-box; }
  .tfi table { border-collapse: collapse; width: 100%; }
  .tfi td, .tfi th { vertical-align: top; padding: 0; }
  .tfi-bar { height: 6px; background: linear-gradient(90deg, ${NAVY} 0%, ${NAVY} 45%, ${CYAN} 100%); border-radius: 3px; }
  .tfi-head { margin-top: 18px; }
  .tfi-logo { height: 34px; width: auto; display: block; }
  .tfi-brand { font-size: 20px; font-weight: 800; color: ${NAVY}; }
  .tfi-title { font-size: 22px; font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase; text-align: right; line-height: 1.2; }
  .tfi-number { font-size: 12.5px; font-weight: 600; color: ${INK}; text-align: right; margin-top: 2px; }
  /* The status pill is an SVG image (see pillImage) — html2canvas places HTML text a few
     pixels off depending on the font, which left the label low or clipped in the pill. */
  .tfi-pill { display: block; margin: 12px 0 0 auto; }
  .tfi table.tfi-meta, .tfi table.tfi-items { border-collapse: separate; border-spacing: 0; }
  .tfi-meta { margin-top: 18px; background: ${TINT}; border: 1px solid ${LINE}; border-radius: 10px; }
  .tfi-meta td { padding: 10px 14px; border-right: 1px solid ${LINE}; }
  .tfi-meta td:last-child { border-right: 0; }
  .tfi-meta-k { font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${MUTED}; }
  .tfi-meta-v { font-size: 12px; font-weight: 600; color: ${INK}; margin-top: 2px; white-space: nowrap; }
  .tfi-parties { margin-top: 16px; }
  .tfi-parties > tbody > tr > td { width: 50%; }
  .tfi-parties > tbody > tr > td:first-child { padding-right: 8px; }
  .tfi-parties > tbody > tr > td:last-child { padding-left: 8px; }
  .tfi-party { border: 1px solid ${LINE}; border-radius: 10px; padding: 12px 14px; min-height: 128px; color: ${MUTED}; }
  .tfi-party-bill { border-color: ${NAVY}33; background: ${BLUE_TINT}; }
  .tfi-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${NAVY}; margin-bottom: 6px; }
  .tfi-strong { font-weight: 700; color: ${INK}; }
  .tfi-company { font-weight: 600; color: ${INK}; }
  .tfi-kv { margin-top: 6px; }
  .tfi-kv td { padding: 1px 0; font-size: 11px; color: ${INK}; word-break: break-all; }
  .tfi-k { width: 72px; color: ${MUTED} !important; word-break: normal !important; }
  .tfi-mono { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; font-size: 10.5px; }
  .tfi-items { margin-top: 18px; border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden; }
  .tfi-items thead tr { background: ${NAVY}; }
  .tfi-items th { background: ${NAVY}; color: #FFFFFF; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 9px 10px; text-align: left; }
  .tfi-items th:first-child { border-top-left-radius: 9px; }
  .tfi-items th:last-child { border-top-right-radius: 9px; }
  .tfi-items td { padding: 10px; border-top: 1px solid ${LINE}; }
  .tfi-items tbody tr:nth-child(even) td { background: ${TINT}; }
  .tfi-desc { font-weight: 600; color: ${INK}; }
  .tfi-sub { font-size: 10.5px; color: ${MUTED}; margin-top: 1px; }
  .tfi-c { text-align: center; }
  .tfi-r { text-align: right !important; white-space: nowrap; }
  .tfi-muted { color: ${MUTED}; }
  .tfi-bottom { margin-top: 16px; }
  .tfi-bottom > tbody > tr > td:first-child { padding-right: 16px; }
  .tfi-box { border: 1px solid ${LINE}; border-radius: 10px; padding: 12px 14px; }
  .tfi-box + .tfi-box { margin-top: 10px; }
  .tfi-words { font-size: 11px; color: ${INK}; font-weight: 600; }
  .tfi-note { border-color: transparent; color: ${INK}; }
  .tfi-totals td { padding: 5px 0; font-size: 11.5px; color: ${MUTED}; }
  .tfi-totals td.tfi-r { color: ${INK}; }
  /* html2canvas draws text ~3px lower than the browser, so the total bar carries a tight
     line-height and more padding below than above — centred in the PDF. */
  .tfi-grand { display: flex; justify-content: space-between; line-height: 13px; padding: 11px 12px 15px; border-radius: 8px; color: #FFFFFF; font-size: 13px; font-weight: 800; white-space: nowrap; }
  .tfi-due td { padding-top: 8px !important; font-weight: 700; color: ${INK} !important; }
  .tfi-foot { margin-top: 22px; padding-top: 12px; border-top: 1px solid ${LINE}; color: ${MUTED}; font-size: 10px; }
  .tfi-foot b { color: ${INK}; }
  .tfi-sign { text-align: right; font-size: 10.5px; color: ${MUTED}; }
  .tfi-sign b { display: block; color: ${INK}; font-size: 11px; margin-bottom: 2px; }
  .tfi-bar-bottom { margin-top: 14px; height: 3px; background: linear-gradient(90deg, ${CYAN} 0%, ${NAVY} 100%); border-radius: 2px; }
</style>`;

// ── Private helpers ────────────────────────────────────────────────

let _logoCache: string | null = null;

async function loadLogoBase64(): Promise<string> {
  if (_logoCache !== null) return _logoCache;
  try {
    const res = await fetch('/logos/talent_flow_logo.png');
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
    type Options = NonNullable<Parameters<typeof html2pdf>[1]>;
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          // The app's CSS reset sets img { display: block }, which throws off
          // html2canvas's text-baseline measurement and drops every line of
          // text a few pixels low (pills, table header, totals bar).
          onclone: (doc: Document) => {
            const fix = doc.createElement('style');
            fix.textContent = 'img { display: inline-block; }';
            doc.head.appendChild(fix);
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        // Keep rows and cards whole across pages (html2pdf supports this;
        // its bundled types just leave it out).
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.tfi-box', '.tfi-party', '.tfi-totals'] },
      } as Options)
      .from(tempDiv)
      .save();
  } finally {
    document.body.removeChild(tempDiv);
  }
}

/** Escapes text from the API before it goes into the HTML. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  return formatISTDate(dateString) || '';
}

function fmtAmount(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Signed amount, with a true minus sign for refunds / credits. */
function fmtSigned(amount: number, negative: boolean): string {
  return `${negative ? '−' : ''}${fmtAmount(amount)}`;
}

/** "netbanking" → "Netbanking", "PLAN_UPGRADE" → "Plan upgrade". */
function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const s = String(value).replace(/_/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

/** Whole number in words, Indian grouping (thousand, lakh, crore). */
function integerInWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  n %= 100;
  if (n) parts.push(twoDigits(n));
  return parts.join(' ');
}

/** 6490.5 → "Rupees Six Thousand Four Hundred Ninety and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  return `Rupees ${integerInWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}

interface Pill { text: string; color: string; bg: string }

function pillFor(status: string | null | undefined): Pill {
  const s = (status || '').toLowerCase();
  // A refund reads as money going back, so it takes the amber of the design.
  if (s === 'refunded') return { text: 'Refunded', color: AMBER, bg: AMBER_TINT };
  if (['paid', 'completed', 'success', 'won', 'resolved', 'closed'].includes(s))
    return { text: humanize(s), color: TEAL, bg: TEAL_TINT };
  if (['open', 'pending', 'due', 'processing', 'under_review', 'needs_response', 'created'].includes(s))
    return { text: s === 'open' ? 'Due' : humanize(s), color: AMBER, bg: AMBER_TINT };
  if (['failed', 'lost', 'rejected', 'cancelled', 'canceled', 'void', 'overdue'].includes(s))
    return { text: humanize(s), color: RED, bg: RED_TINT };
  return { text: humanize(s) || '—', color: MUTED, bg: GREY_TINT };
}

/** The status pill as an SVG <img>, so its label is drawn exactly centred in the PDF. */
function pillImage(p: Pill): string {
  const text = p.text.toUpperCase();
  const fontFamily = "'Segoe UI', Arial, Helvetica, sans-serif";
  const spacing = 0.6; // 0.06em at 10px
  let textWidth = text.length * 7;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `700 10px ${fontFamily}`;
      textWidth = ctx.measureText(text).width;
    }
  } catch { /* keep the estimate */ }
  const w = Math.ceil(textWidth + spacing * text.length) + 24;
  const h = 22;
  // Drawn at 2x so it stays sharp at html2canvas's scale: 2.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" rx="${h / 2}" fill="${p.bg}"/>`
    + `<text x="${(w + spacing) / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central" fill="${p.color}" `
    + `font-family="${fontFamily.replace(/'/g, '')}" font-size="10" font-weight="700" letter-spacing="${spacing}">${esc(text)}</text></svg>`;
  return `<img class="tfi-pill" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="${w}" height="${h}" alt="${esc(text)}" />`;
}

/** key/value rows of a card; empty values are left out. */
function kvRows(rows: [string, string | null | undefined, boolean?][]): string {
  const kept = rows.filter(([, v]) => v && String(v).trim());
  if (!kept.length) return '';
  return `<table class="tfi-kv">${kept
    .map(([k, v, mono]) => `<tr><td class="tfi-k">${esc(k)}</td><td${mono ? ' class="tfi-mono"' : ''}>${esc(v)}</td></tr>`)
    .join('')}</table>`;
}

function normalizeParty(billTo?: InvoiceParty | string): InvoiceParty {
  if (!billTo) return {};
  return typeof billTo === 'string' ? { company: billTo } : billTo;
}

interface DocItem { description: string; sub?: string; qty: number | string; rate: number; amount: number }

interface DocSpec {
  logo: string;
  title: string;
  titleColor: string;
  number: string;
  status: string | null | undefined;
  pill?: Pill;
  meta: [string, string][];
  billTo: InvoiceParty;
  items: DocItem[];
  /** Credit documents (refunds) print amounts with a minus sign. */
  negative?: boolean;
  wordsAmount: number;
  payment: [string, string | null | undefined, boolean?][];
  paymentEmpty?: string;
  note?: { text: string; color: string; bg: string };
  totals: [string, string][];
  grand: { label: string; value: string; bg: string };
  after?: { label: string; value: string; strong?: boolean };
  terms?: string;
  kind: string;
}

function documentHTML(d: DocSpec): string {
  const pill = d.pill ?? pillFor(d.status);
  const showSac = !!SELLER.sac;
  const meta = d.meta.filter(([, v]) => v);

  const seller = `
    <div class="tfi-party">
      <div class="tfi-label">From</div>
      <div class="tfi-strong">${esc(SELLER.name)}</div>
      ${SELLER.address.map((l) => `<div>${esc(l)}</div>`).join('')}
      ${kvRows([['Email', SELLER.email], ['Phone', SELLER.phone], ['GSTIN', SELLER.gstin, true], ['PAN', SELLER.pan, true]])}
    </div>`;

  const b = d.billTo;
  const billLines = [
    b.name ? `<div class="tfi-strong">${esc(b.name)}</div>` : '',
    b.company && b.company !== b.name ? `<div class="${b.name ? 'tfi-company' : 'tfi-strong'}">${esc(b.company)}</div>` : '',
    ...(b.address || []).filter(Boolean).map((l) => `<div>${esc(l)}</div>`),
  ].join('');
  const buyer = `
    <div class="tfi-party tfi-party-bill">
      <div class="tfi-label">Bill to</div>
      ${billLines || '<div class="tfi-strong">—</div>'}
      ${kvRows([['Email', b.email], ['Phone', b.phone], ['GSTIN', b.gstin, true], ['Tenant ID', b.tenantId, true]])}
    </div>`;

  const itemRows = d.items.length
    ? d.items.map((it, i) => `
      <tr>
        <td class="tfi-c tfi-muted">${i + 1}</td>
        <td>
          <div class="tfi-desc">${esc(it.description)}</div>
          ${it.sub ? `<div class="tfi-sub">${esc(it.sub)}</div>` : ''}
        </td>
        ${showSac ? `<td class="tfi-c tfi-mono">${esc(SELLER.sac)}</td>` : ''}
        <td class="tfi-r">${esc(it.qty)}</td>
        <td class="tfi-r">${fmtSigned(it.rate, !!d.negative)}</td>
        <td class="tfi-r tfi-strong">${fmtSigned(it.amount, !!d.negative)}</td>
      </tr>`).join('')
    : `<tr><td colspan="${showSac ? 6 : 5}" class="tfi-c tfi-muted">No line items</td></tr>`;

  const paymentRows = kvRows(d.payment);
  const contact = [SELLER.email && `Write to <b>${esc(SELLER.email)}</b>`, SELLER.phone && `call <b>${esc(SELLER.phone)}</b>`]
    .filter(Boolean).join(' or ');

  return `
${STYLES}
<div class="tfi">
  <div class="tfi-bar"></div>

  <table class="tfi-head"><tbody><tr>
    <td style="width:55%">
      ${d.logo ? `<img class="tfi-logo" src="${d.logo}" alt="${esc(SELLER.name)}" />` : `<div class="tfi-brand">${esc(SELLER.name)}</div>`}
    </td>
    <td style="width:45%">
      <div class="tfi-title" style="color:${d.titleColor}">${esc(d.title)}</div>
      <div class="tfi-number"># ${esc(d.number)}</div>
      ${pillImage(pill)}
    </td>
  </tr></tbody></table>

  ${meta.length ? `
  <table class="tfi-meta"><tbody><tr>
    ${meta.map(([k, v]) => `<td><div class="tfi-meta-k">${esc(k)}</div><div class="tfi-meta-v">${esc(v)}</div></td>`).join('')}
  </tr></tbody></table>` : ''}

  <table class="tfi-parties"><tbody><tr>
    <td>${seller}</td>
    <td>${buyer}</td>
  </tr></tbody></table>

  <table class="tfi-items">
    <thead><tr>
      <th class="tfi-c" style="width:32px">#</th>
      <th>Description</th>
      ${showSac ? '<th class="tfi-c" style="width:70px">SAC</th>' : ''}
      <th class="tfi-r" style="width:48px">Qty</th>
      <th class="tfi-r" style="width:105px">Rate</th>
      <th class="tfi-r" style="width:115px">Amount</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="tfi-bottom"><tbody><tr>
    <td style="width:56%">
      <div class="tfi-box">
        <div class="tfi-label">Amount in words</div>
        <div class="tfi-words">${esc(amountInWords(d.wordsAmount))}</div>
      </div>
      <div class="tfi-box">
        <div class="tfi-label">Payment details</div>
        ${paymentRows || kvRows([['Method', d.paymentEmpty || '—']])}
      </div>
      ${d.note ? `
      <div class="tfi-box tfi-note" style="background:${d.note.bg}">
        <div class="tfi-label" style="color:${d.note.color}">Note</div>${esc(d.note.text)}
      </div>` : ''}
    </td>
    <td style="width:44%">
      <table class="tfi-totals"><tbody>
        ${d.totals.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="tfi-r">${v}</td></tr>`).join('')}
        <tr><td colspan="2" style="padding:4px 0"></td></tr>
        <tr><td colspan="2" style="padding:0"><div class="tfi-grand" style="background:${d.grand.bg}"><span>${esc(d.grand.label)}</span><span>${d.grand.value}</span></div></td></tr>
        ${d.after ? (d.after.strong
          ? `<tr class="tfi-due"><td>${esc(d.after.label)}</td><td class="tfi-r">${d.after.value}</td></tr>`
          : `<tr><td style="padding-top:8px">${esc(d.after.label)}</td><td class="tfi-r" style="padding-top:8px">${d.after.value}</td></tr>`) : ''}
      </tbody></table>
    </td>
  </tr></tbody></table>

  <table class="tfi-foot"><tbody><tr>
    <td style="width:65%">
      ${d.terms ? `<div><b>Terms:</b> ${esc(d.terms)}</div>` : ''}
      <div${d.terms ? ' style="margin-top:4px"' : ''}>This is a computer-generated ${esc(d.kind)} and does not require a signature.</div>
      ${contact ? `<div style="margin-top:4px">Questions? ${contact}.</div>` : ''}
      <div style="margin-top:4px">Generated on ${esc(fmtDate(new Date().toISOString()))}</div>
    </td>
    <td class="tfi-sign" style="width:35%">
      <b>For ${esc(SELLER.name)}</b>
      Authorised signatory
    </td>
  </tr></tbody></table>
  <div class="tfi-bar-bottom"></div>
</div>`;
}

function servicePeriod(start?: string | null, end?: string | null): string {
  const s = fmtDate(start);
  const e = fmtDate(end);
  return s && e ? `${s} – ${e}` : s || e;
}

// ── Exported generators ────────────────────────────────────────────

export async function generateBillingInvoicePDF(
  inv: BillingInvoice,
  billTo?: InvoiceParty | string
): Promise<void> {
  const logo = await loadLogoBase64();

  const status = (inv.status || '').toLowerCase();
  const isPaid = status === 'paid' || !!inv.paid_at;
  const paymentMethod = inv.payment_method || inv.metadata?.payment_method || null;
  const paymentRef = inv.razorpay_payment_id || inv.metadata?.razorpay_payment_id || inv.metadata?.payment_reference || null;
  const orderId = inv.razorpay_order_id || inv.metadata?.razorpay_order_id || null;
  const period = servicePeriod(inv.subscription_start_date, inv.subscription_end_date);
  const interval = humanize(inv.billing_interval);

  const items: DocItem[] = (inv.line_items || []).map((item) => {
    const amount = Math.abs(item.amount ?? item.total ?? (item.quantity || 0) * (item.unit_price || 0));
    const subParts = [
      item.unit && item.quantity ? `${item.quantity.toLocaleString('en-IN')} ${item.unit}` : '',
      !item.unit && period ? `Service period ${period}` : '',
    ].filter(Boolean);
    return {
      description: item.description,
      sub: subParts.join(' · ') || undefined,
      qty: item.unit ? 1 : item.quantity ?? 1,
      rate: item.unit ? amount : Math.abs(item.unit_price ?? amount),
      amount,
    };
  });

  const subtotal = inv.amount_inr || 0;
  const discount = inv.discount_amount_inr || 0;
  const tax = inv.tax_amount_inr || 0;
  const total = inv.total_amount_inr || 0;
  const taxable = subtotal - discount;
  const rate = taxable > 0 && tax > 0 ? Math.round((tax / taxable) * 1000) / 10 : 0;

  const totals: [string, string][] = [['Subtotal', fmtAmount(subtotal)]];
  if (discount > 0) totals.push(['Discount', `−${fmtAmount(discount)}`]);
  if (tax > 0) totals.push([rate ? `GST (${rate}%)` : 'GST', fmtAmount(tax)]);

  const reason = inv.reason || inv.metadata?.reason;
  const planName = (inv.plan_name || inv.metadata?.plan_name || '').trim();
  const noteParts = [
    reason ? humanize(reason) : '',
    inv.metadata?.from_plan_name && inv.metadata?.to_plan_name ? `${inv.metadata.from_plan_name} → ${inv.metadata.to_plan_name}` : '',
    planName ? `Plan: ${planName}${interval ? ` (${interval})` : ''}` : '',
    inv.next_billing_date ? `Next billing: ${fmtDate(inv.next_billing_date)}` : '',
  ].filter(Boolean);

  const html = documentHTML({
    logo,
    title: 'Tax Invoice',
    titleColor: NAVY,
    number: inv.invoice_number,
    status: isPaid ? 'paid' : inv.status,
    meta: [
      ['Invoice date', fmtDate(inv.issue_date)],
      ['Due date', isPaid ? '' : fmtDate(inv.due_date)],
      ['Service period', period],
      ['Place of supply', SELLER.placeOfSupply],
      ['Paid on', isPaid ? fmtDate(inv.paid_at) : ''],
    ],
    billTo: normalizeParty(billTo),
    items,
    wordsAmount: total,
    payment: [
      ['Method', humanize(paymentMethod)],
      ['Reference', paymentRef, true],
      ['Order ID', orderId, true],
    ],
    paymentEmpty: isPaid ? '—' : 'Awaiting payment',
    note: noteParts.length ? { text: noteParts.join(' · '), color: NAVY, bg: BLUE_TINT } : undefined,
    totals,
    grand: { label: 'Total', value: fmtAmount(total), bg: NAVY },
    after: isPaid
      ? { label: 'Amount paid', value: fmtAmount(total) }
      : { label: 'Balance due', value: fmtAmount(total), strong: true },
    terms: isPaid ? 'Thank you for your payment.' : 'Payment is due by the due date shown above.',
    kind: 'tax invoice',
  });

  await renderToPDF(html, `${inv.invoice_number || 'invoice'}.pdf`);
}

export async function generateRefundReceiptPDF(
  refund: RefundInvoice,
  billTo?: InvoiceParty | string
): Promise<void> {
  const logo = await loadLogoBase64();
  const pct = refund.metadata?.refund_percentage;

  const items: DocItem[] = (refund.line_items || []).map((item) => ({
    description: item.description,
    sub: [humanize(refund.metadata?.reason), pct ? `${pct}% refund` : ''].filter(Boolean).join(' · ') || undefined,
    qty: item.quantity ?? 1,
    rate: Math.abs(item.unit_price ?? item.amount ?? 0),
    amount: Math.abs(item.amount ?? 0),
  }));
  const total = Math.abs(refund.total_amount_inr || 0);
  const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
  const tax = items.length && total - subtotal > 0.005 ? total - subtotal : 0;

  const totals: [string, string][] = [];
  if (items.length) totals.push(['Subtotal', fmtSigned(subtotal, true)]);
  if (tax) totals.push(['GST', fmtSigned(tax, true)]);

  const html = documentHTML({
    logo,
    title: 'Refund Receipt',
    titleColor: AMBER,
    number: refund.invoice_number,
    status: refund.status,
    meta: [
      ['Refund date', fmtDate(refund.issue_date)],
      ['Original invoice', refund.metadata?.original_invoice_number || ''],
      ['Paid on', fmtDate(refund.paid_at)],
    ],
    billTo: normalizeParty(billTo),
    items,
    negative: true,
    wordsAmount: total,
    payment: [
      ['Method', humanize(refund.metadata?.refund_method) || 'Original payment method'],
      ['Reference', refund.metadata?.razorpay_refund_id, true],
      ['Payment ID', refund.razorpay_payment_id, true],
      ['Against', refund.metadata?.original_invoice_number, true],
      ['Processed by', refund.metadata?.processed_by],
    ],
    note: {
      text: refund.metadata?.notes
        || 'Refund issued to the original payment method. It can take 5–7 working days to show in your account.',
      color: AMBER,
      bg: AMBER_TINT,
    },
    totals,
    grand: { label: 'Total refund', value: fmtSigned(total, true), bg: NAVY },
    kind: 'refund receipt',
  });

  await renderToPDF(html, `${refund.invoice_number || 'refund'}.pdf`);
}

export async function generateDisputeRecordPDF(
  dispute: DisputeInvoice,
  billTo?: InvoiceParty | string
): Promise<void> {
  const logo = await loadLogoBase64();
  const disputeStatus = dispute.metadata?.dispute_status || dispute.dispute_status || dispute.status || '';
  const reason = dispute.metadata?.reason || dispute.reason;
  const claim = dispute.metadata?.customer_claim || dispute.customer_claim;

  const items: DocItem[] = (dispute.line_items || []).map((item) => ({
    description: item.description,
    sub: humanize(reason) || undefined,
    qty: item.quantity ?? 1,
    rate: Math.abs(item.unit_price ?? item.amount ?? 0),
    amount: Math.abs(item.amount ?? 0),
  }));
  const total = Math.abs(dispute.total_amount_inr || 0);

  const html = documentHTML({
    logo,
    title: 'Dispute Record',
    titleColor: ORANGE,
    number: dispute.invoice_number,
    status: disputeStatus,
    meta: [
      ['Raised on', fmtDate(dispute.issue_date)],
      ['Respond by', fmtDate(dispute.metadata?.deadline || dispute.deadline)],
      ['Original invoice', dispute.metadata?.original_invoice_number || ''],
      ['Paid on', fmtDate(dispute.paid_at)],
    ],
    billTo: normalizeParty(billTo),
    items,
    wordsAmount: total,
    payment: [
      ['Method', humanize(dispute.payment_method)],
      ['Payment ID', dispute.razorpay_payment_id, true],
      ['Dispute ID', dispute.metadata?.razorpay_dispute_id, true],
      ['Bank ref.', dispute.metadata?.bank_reference, true],
    ],
    note: {
      text: claim
        ? `Customer claim: ${claim}`
        : 'If you have questions about this dispute, please contact our support team for assistance.',
      color: ORANGE,
      bg: AMBER_TINT,
    },
    totals: [],
    grand: { label: 'Disputed amount', value: fmtAmount(total), bg: ORANGE },
    kind: 'dispute record',
  });

  await renderToPDF(html, `${dispute.invoice_number || 'dispute'}.pdf`);
}
