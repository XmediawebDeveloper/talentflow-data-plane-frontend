/**
 * Chat transcript PDF that mirrors the Transcript tab's Chat view: the
 * candidate header card on top, then Bina's bubbles on the left and the
 * candidate's on the right, each with its Q/F label and time. jsPDF is
 * loaded on demand so it stays out of the page bundle.
 */
import { formatIST } from '@/lib/utils/dateUtils';

export interface ChatPdfMessage {
  speaker: 'bina' | 'candidate';
  /** Q1 / F1 / D1 / CL1 / End — empty for interstitial nudges. */
  label: string;
  text: string;
  /** Candidate's raw ASR when it differs from the corrected text. */
  original?: string;
  language?: string;
  time?: string;
}

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

type RGB = [number, number, number];
const BRAND: RGB = [23, 55, 140];
const BRAND_TINT: RGB = [241, 244, 251];
const BRAND_LINE: RGB = [208, 216, 236];
const GRAY_BUBBLE: RGB = [243, 244, 246];
const TEXT: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const WHITE: RGB = [255, 255, 255];
const ON_BRAND_MUTED: RGB = [205, 215, 240];
const GREEN: [RGB, RGB] = [[220, 252, 231], [21, 128, 61]];
const ORANGE: [RGB, RGB] = [[255, 237, 213], [194, 65, 12]];
const RED: [RGB, RGB] = [[254, 226, 226], [185, 28, 28]];

export async function downloadChatTranscriptPdf(data: ChatPdfData, filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const BOTTOM = H - 14;
  let y = M;

  const font = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color: RGB = TEXT) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const pill = (text: string, x: number, yMid: number, [bg, fg]: [RGB, RGB], align: 'left' | 'right' = 'left') => {
    font(7.5, 'bold', fg);
    const w = doc.getTextWidth(text) + 5;
    const left = align === 'right' ? x - w : x;
    doc.setFillColor(...bg);
    doc.roundedRect(left, yMid - 2.6, w, 5.2, 2.6, 2.6, 'F');
    doc.text(text, left + 2.5, yMid + 1);
    return w;
  };
  const initial = (data.candidateName || 'C').charAt(0).toUpperCase();
  const avatar = (letter: string, cx: number, cy: number, filled: boolean) => {
    if (filled) {
      doc.setFillColor(...BRAND);
      doc.circle(cx, cy, 3.5, 'F');
      font(8, 'bold', WHITE);
    } else {
      doc.setFillColor(...BRAND_TINT);
      doc.setDrawColor(...BRAND_LINE);
      doc.circle(cx, cy, 3.5, 'FD');
      font(8, 'bold', BRAND);
    }
    doc.text(letter, cx, cy + 1.1, { align: 'center' });
  };

  // ── Title bar ─────────────────────────────────────────────
  font(15, 'bold', BRAND);
  doc.text('Chat Transcript', M, y + 5);
  font(8, 'normal', MUTED);
  doc.text(`Exported ${formatIST(new Date().toISOString())}`, W - M, y + 5, { align: 'right' });
  y += 10;

  // ── Candidate card ────────────────────────────────────────
  const cardTop = y;
  const cardH = 26;
  doc.setFillColor(...BRAND_TINT);
  doc.setDrawColor(...BRAND_LINE);
  doc.roundedRect(M, cardTop, W - 2 * M, cardH, 3, 3, 'FD');

  let x = M + 5;
  font(14, 'bold');
  const name = data.candidateName || 'Unknown Candidate';
  doc.text(name, x, cardTop + 8);
  x += doc.getTextWidth(name) + 3;
  if (data.status) x += pill(data.status, x, cardTop + 6.8, GREEN) + 2;
  if (data.mode) pill(data.mode, x, cardTop + 6.8, ORANGE);
  if (data.result) {
    pill(`${data.result.passed ? 'Pass' : 'Fail'}  |  ${data.result.score}%`, W - M - 5, cardTop + 6.8, data.result.passed ? GREEN : RED, 'right');
  }
  font(9, 'normal', MUTED);
  doc.text(data.identity.filter(Boolean).join('   |   '), M + 5, cardTop + 15);
  doc.text(data.timing.filter(Boolean).join('     ·     '), M + 5, cardTop + 21);
  y = cardTop + cardH + 7;

  // ── Participants row ──────────────────────────────────────
  avatar('B', M + 3.5, y, true);
  font(8.5, 'normal', MUTED);
  doc.text('Bina (AI Interviewer)', M + 9, y + 1.2);
  const binaW = doc.getTextWidth('Bina (AI Interviewer)');
  avatar(initial, M + 15 + binaW, y, false);
  font(8.5, 'normal', MUTED);
  doc.text(data.candidateName || 'Candidate', M + 20.5 + binaW, y + 1.2);
  doc.text(`${data.messages.length} messages`, W - M, y + 1.2, { align: 'right' });
  y += 5;
  doc.setDrawColor(229, 231, 235);
  doc.line(M, y, W - M, y);
  y += 6;

  // ── Bubbles ───────────────────────────────────────────────
  const maxBubbleW = (W - 2 * M) * 0.72;
  const PAD = 3.5;
  type Line = { text: string; small: boolean };
  const lineH = (l: Line) => (l.small ? 3.6 : 4.3);
  const setLineFont = (l: Line, isBina: boolean) => {
    if (l.small) font(7.5, 'italic', isBina ? MUTED : ON_BRAND_MUTED);
    else font(9.5, 'normal', isBina ? TEXT : WHITE);
  };

  for (const m of data.messages) {
    const isBina = m.speaker === 'bina';
    const inner = maxBubbleW - 2 * PAD;
    font(9.5);
    const lines: Line[] = (doc.splitTextToSize(m.text || '', inner) as string[]).map(text => ({ text, small: false }));
    if (m.original) {
      font(7.5, 'italic');
      lines.push(...(doc.splitTextToSize(`Original: ${m.original}`, inner) as string[]).map(text => ({ text, small: true })));
    }
    const widest = Math.max(...lines.map(l => { setLineFont(l, isBina); return doc.getTextWidth(l.text); }));
    const bubbleW = Math.min(maxBubbleW, widest + 2 * PAD);
    const bubbleLeft = isBina ? M + 10 : W - M - 10 - bubbleW;

    // Keep the meta line with at least the first few lines of the bubble.
    const firstLines = lines.slice(0, 3).reduce((h, l) => h + lineH(l), 0);
    if (y + 6 + firstLines + 2 * PAD > BOTTOM) { doc.addPage(); y = M; }

    // Meta line: avatar, label · time · language.
    const metaY = y + 2;
    if (isBina) avatar('B', M + 3.5, metaY + 3.5, true);
    else avatar(initial, W - M - 3.5, metaY + 3.5, false);
    const meta = [m.label, m.time, !isBina && m.language && m.language !== 'English' ? m.language : '']
      .filter(Boolean).join('  ·  ');
    if (meta) {
      font(7.5, 'bold', MUTED);
      doc.text(meta, isBina ? bubbleLeft : bubbleLeft + bubbleW, metaY, { align: isBina ? 'left' : 'right' });
    }
    y = metaY + 2;

    // Bubble, drawn page by page so a long answer can span pages.
    let i = 0;
    while (i < lines.length) {
      const room = BOTTOM - y - 2 * PAD;
      let h = 0;
      let j = i;
      while (j < lines.length && h + lineH(lines[j]) <= room) h += lineH(lines[j++]);
      if (j === i) { doc.addPage(); y = M; continue; }
      doc.setFillColor(...(isBina ? GRAY_BUBBLE : BRAND));
      doc.roundedRect(bubbleLeft, y, bubbleW, h + 2 * PAD - 1, 3, 3, 'F');
      let ty = y + PAD + 2.4;
      for (const l of lines.slice(i, j)) {
        setLineFont(l, isBina);
        doc.text(l.text, bubbleLeft + PAD, ty);
        ty += lineH(l);
      }
      y += h + 2 * PAD - 1;
      i = j;
      if (i < lines.length) { doc.addPage(); y = M; }
    }
    y += 5;
  }

  // ── Footer on every page ──────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(7.5, 'normal', MUTED);
    doc.text(`${data.candidateName} · Chat Transcript`, M, H - 7);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 7, { align: 'right' });
  }

  doc.save(`${filename.replace(/\.pdf$/i, '')}.pdf`);
}
