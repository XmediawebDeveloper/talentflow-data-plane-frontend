/**
 * Chat transcript PDF that mirrors the Transcript tab's Chat view bubble for
 * bubble: Bina's questions (with skip notes) on the left, the candidate's
 * Original (ASR) + Corrected pair on the right. Rendered from HTML with
 * html2pdf (same approach as the Q&A PDF export) so the browser shapes the
 * text — Tamil, Chinese, etc. in the Original ASR come out exactly as on
 * screen, which jsPDF's built-in fonts can't do.
 */
import { formatIST } from '@/lib/utils/dateUtils';

export type ChatPdfMessage =
  | {
      speaker: 'bina';
      /** Q1 / F1 / D1 / CL1 — empty for the opening, closing and nudges. */
      label: string;
      kind: 'main' | 'followup' | 'deepdive';
      text: string;
      /** "Skipped — candidate clicked “Next Question”" etc. */
      skipNote?: { text: string; amber: boolean };
      time?: string;
    }
  | {
      speaker: 'candidate';
      label: string;
      kind: 'main' | 'followup' | 'deepdive';
      language?: string;
      original: string;
      corrected: string;
      noScorableEnglish: boolean;
      fullSentenceRewrite: boolean;
      time?: string;
    };

export interface ChatPdfData {
  candidateName: string;
  status?: string;
  mode?: string;
  /** CID, email, job — shown on one line, pipe-separated. */
  identity: string[];
  /** Completed …, Time taken …, Duration … — shown on one line. */
  timing: string[];
  result?: { passed: boolean; score: number };
  messages: ChatPdfMessage[];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Chat-view colours as plain hex (html2canvas can't read the theme's oklch tokens).
const C = {
  brand: '#17378c',
  brandTint: '#eef2fb',
  brandLine: '#d0d8ec',
  cyan: '#0e7490', cyanTint: '#ecfeff', cyanLine: '#a5f3fc',
  teal: '#0f766e', tealTint: '#f0fdfa', tealLine: '#99f6e4',
  binaBubble: '#eff0f3', binaText: '#08132e',
  skyBubble: '#e3f2fc', skyText: '#0c4a6e', skyLabel: '#0369a1',
  greenBubble: '#e9f8ee', greenText: '#14532d', greenLabel: '#15803d',
  orange: '#c2410c',
  muted: '#6b7280', faint: '#9ca3af',
  amberBg: '#fffbeb', amberText: '#b45309', amberLine: '#fde68a',
  slateBg: '#f8fafc', slateText: '#64748b', slateLine: '#e2e8f0',
};

// Pills and avatars centre their text with flex rather than a tall line-height.
const pill = (text: string, bg: string, fg: string, line: string) =>
  `<span style="display:inline-flex;align-items:center;vertical-align:middle;height:16px;line-height:1;padding:0 6px;box-sizing:border-box;font-size:9px;font-weight:600;border-radius:4px;background:${bg};color:${fg};border:1px solid ${line};white-space:nowrap">${esc(text)}</span>`;

const labelPill = (label: string, kind: ChatPdfMessage['kind']) =>
  kind === 'deepdive' ? pill(label, C.tealTint, C.teal, C.tealLine)
    : kind === 'followup' ? pill(label, C.cyanTint, C.cyan, C.cyanLine)
      : pill(label, C.brandTint, C.brand, C.brandLine);

const avatar = (letter: string, filled: boolean) =>
  `<div style="flex:none;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;width:24px;height:24px;line-height:1;box-sizing:border-box;border-radius:50%;font-size:10px;font-weight:700;${
    filled ? `background:${C.brand};color:#fff` : `background:${C.brandTint};color:${C.brand};border:1px solid ${C.brandLine}`
  }">${esc(letter)}</div>`;

function messageHtml(m: ChatPdfMessage, initial: string): string {
  const isBina = m.speaker === 'bina';
  const indent = m.kind !== 'main'
    ? `padding-left:18px;margin-left:10px;border-left:2px solid ${m.kind === 'deepdive' ? C.tealLine : C.cyanLine};`
    : '';
  const metaPills = [
    m.label ? labelPill(m.label, m.kind) : '',
    !isBina && m.language ? pill(m.language, C.slateBg, C.slateText, C.slateLine) : '',
  ].filter(Boolean);
  const meta = metaPills.length
    ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;${isBina ? '' : 'flex-direction:row-reverse'}">${metaPills.join('')}</div>`
    : '';
  const bubble = (bg: string, fg: string, inner: string, extra = '') =>
    `<div style="padding:8px 12px;border-radius:14px;font-size:11.5px;line-height:1.55;background:${bg};color:${fg};white-space:pre-line;word-break:break-word;${extra}">${inner}</div>`;
  const caption = (text: string, color: string) =>
    `<div style="font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${color};margin-bottom:3px">${text}</div>`;

  let body: string;
  if (m.speaker === 'bina') {
    body = bubble(C.binaBubble, C.binaText, esc(m.text), 'border-top-left-radius:4px');
    if (m.skipNote) {
      const [bg, fg, line] = m.skipNote.amber ? [C.amberBg, C.amberText, C.amberLine] : [C.slateBg, C.slateText, C.slateLine];
      body += `<div style="margin-top:6px;display:inline-flex;align-items:center;height:20px;line-height:1;padding:0 9px;box-sizing:border-box;border-radius:8px;font-size:9.5px;font-weight:500;background:${bg};color:${fg};border:1px solid ${line}">&#9197; ${esc(m.skipNote.text)}</div>`;
    }
  } else {
    body = bubble(C.skyBubble, C.skyText, caption('Original (ASR)', C.skyLabel) + esc(m.original), 'border-top-right-radius:4px');
    body += bubble(
      C.greenBubble, C.greenText,
      caption('Corrected', C.greenLabel) + (m.noScorableEnglish
        ? `<span style="font-style:italic;color:${C.muted}">— no scorable English (not scored)</span>`
        : esc(m.corrected)),
      'margin-top:6px',
    );
    if (m.fullSentenceRewrite) {
      body += `<div style="font-size:9px;color:${C.orange};font-style:italic;text-align:right;margin-top:3px;padding-right:4px">full-sentence rewrite</div>`;
    }
  }
  const time = m.time
    ? `<div style="font-size:9px;color:${C.faint};margin-top:3px;${isBina ? 'padding-left:4px' : 'padding-right:4px;text-align:right'}">${esc(m.time)}</div>`
    : '';

  return `<div class="chat-msg" style="display:flex;gap:9px;padding-top:8px;margin-bottom:6px;${isBina ? '' : 'flex-direction:row-reverse;'}${indent}">
    ${avatar(isBina ? 'B' : initial, isBina)}
    <div style="max-width:75%;${isBina ? '' : 'display:flex;flex-direction:column;align-items:flex-end'}">${meta}${body}${time}</div>
  </div>`;
}

export async function downloadChatTranscriptPdf(data: ChatPdfData, filename: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const name = data.candidateName || 'Candidate';
  const initial = name.charAt(0).toUpperCase();

  const statusPills = [
    data.status ? pill(data.status, '#dcfce7', '#15803d', '#bbf7d0') : '',
    data.mode ? pill(data.mode, '#ffedd5', '#c2410c', '#fed7aa') : '',
  ].join(' ');
  const resultPill = data.result
    ? pill(`${data.result.passed ? 'Pass' : 'Fail'}  |  ${data.result.score}%`,
      data.result.passed ? '#dcfce7' : '#fee2e2', data.result.passed ? '#15803d' : '#b91c1c', data.result.passed ? '#bbf7d0' : '#fecaca')
    : '';

  const root = document.createElement('div');
  root.style.cssText = `width:720px;padding:8px 4px;font-family:Inter,'Segoe UI','Noto Sans','Noto Sans Tamil','Noto Sans CJK SC',Arial,sans-serif;color:${C.binaText};background:#fff`;
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
      <div style="font-size:18px;font-weight:700;color:${C.brand}">Chat Transcript</div>
      <div style="font-size:9.5px;color:${C.muted}">Exported ${esc(formatIST(new Date().toISOString()))}</div>
    </div>
    <div style="border:1px solid ${C.brandLine};background:${C.brandTint};border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:16px;font-weight:700;line-height:20px">${esc(name)}</span> ${statusPills}
        </div>
        ${resultPill}
      </div>
      <div style="font-size:11px;color:${C.muted};margin-top:6px">${data.identity.filter(Boolean).map(esc).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
      <div style="font-size:11px;color:${C.muted};margin-top:3px">${data.timing.filter(Boolean).map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;margin-bottom:14px;border-bottom:1px solid #f1f2f4">
      <div style="display:flex;align-items:center;gap:8px;font-size:10.5px;color:${C.muted}">
        ${avatar('B', true)} Bina (AI Interviewer) <span style="color:#e5e7eb">·</span> ${avatar(initial, false)} ${esc(name)}
      </div>
      <div style="font-size:10.5px;color:${C.faint}">${data.messages.length} messages</div>
    </div>
    ${data.messages.map(m => messageHtml(m, initial)).join('')}`;

  /* html2canvas finds the text baseline by measuring a 1x1 <img> it adds to
     <body>; Tailwind's preflight `img { display: block }` breaks that and every
     line of text lands a few px low (letters at the bottom of avatars and
     pills). Put that one image back inline for the capture only. */
  const baselineFix = document.createElement('style');
  baselineFix.textContent = 'body > div > img[width="1"][height="1"] { display: inline !important; }';
  document.head.appendChild(baselineFix);
  document.body.appendChild(root);
  try {
    await html2pdf().set({
      margin: [10, 10, 12, 10],
      filename: `${filename.replace(/\.pdf$/i, '')}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      // Keep each message whole on a page (a bubble taller than a page still splits).
      pagebreak: { mode: ['css'], avoid: '.chat-msg' },
    }).from(root).save();
  } finally {
    document.body.removeChild(root);
    baselineFix.remove();
  }
}
