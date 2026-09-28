// Combined "Eval" tab — the union of the Overview and Evaluation Report tabs,
// deduplicated into a single premium report, plus a full-report PDF export.
//
// Why this exists: Overview and Evaluation Report each rendered the verdict,
// the MHS/NHS/Overall scores, and the candidate/interview meta — so those
// appeared 2–3× across the two tabs. This component shows each piece exactly
// ONCE while keeping every unique section from both:
//   • Overview-unique : interview stats, skill radar, cluster coverage
//   • EvalReport-unique: executive summary, full per-skill table,
//                        question-by-question, recommendations, methodology
// All values derive from the same DashboardData the other tabs use, so the
// numbers stay identical across tabs.
import type { ReactNode } from 'react';
import {
  CheckCircle, XCircle, Play, Clock, Sparkles, Target, Info, Star, Network,
  Layers, ListChecks, ClipboardList, FileText, AlertTriangle, Lightbulb, BarChart3,
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from 'recharts';
import type { DashboardData } from './types';
import { buildRationaleLines } from './types';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

interface Props {
  data: DashboardData;
  aiConfidence?: number | null;
  candidateImage?: string | null;
  avgResponseSeconds?: number | null;
  evaluationId?: string | null;
  /** The AI interview session id - only used to log the PDF download for the
   *  Audit Log, since the PDF itself is built entirely client-side below. */
  sessionId?: string | null;
}

const MHS_THRESHOLD = 6.0;

function priorityLabel(p: 'High' | 'Medium' | 'Low'): { tag: 'P1' | 'P2' | 'P3'; weight: number } {
  if (p === 'High')   return { tag: 'P1', weight: 10 };
  if (p === 'Medium') return { tag: 'P2', weight: 7 };
  return                   { tag: 'P3', weight: 4 };
}

// Project status tokens (globals.css), not raw Tailwind hues.
function scoreColor(score: number) {
  if (score >= 8.0) return { text: 'text-success', bar: 'bg-success' };
  if (score >= MHS_THRESHOLD) return { text: 'text-warning', bar: 'bg-warning' };
  return                   { text: 'text-destructive', bar: 'bg-destructive' };
}

/**
 * Builds and saves the full evaluation report PDF — the one behind this
 * candidate page header's "Download Report" button. Standalone so the results lists'
 * row Download button produces exactly the same file. Throws on failure;
 * the caller decides how to surface it. `save: false` returns the PDF as a
 * Blob instead of downloading it (the bulk Download PDFs zip).
 */
export async function exportEvalReportPDF(
  data: DashboardData,
  { evaluationId, sessionId, save = true }: { evaluationId?: string | null; sessionId?: string | null; save?: boolean } = {},
): Promise<{ blob: Blob | null; fileName: string }> {
  const {
    candidate, interview, scores, finalResult, sectionsPresent,
    perQuestionDetails, aiSummary, strengths, weaknesses, isPartialEvaluation,
    mustHaveClusters, niceToHaveClusters,
  } = data;
  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = (finalResult ?? (isPassed ? 'Pass' : 'Fail')).toUpperCase();
  const confidence = Math.round(scores.mustHave * 10);
  const reportGenerated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const evalId = evaluationId
    ?? `EV-${(interview.date || '').replace(/[^0-9]/g, '').slice(0, 8) || 'XXXXXXXX'}`;

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = 210, pageH = 297, M = 12, CW = pageW - M * 2;
  let y = M;
  type RGB = [number, number, number];
  const ink: RGB = [17, 24, 39], sub: RGB = [107, 114, 128], faint: RGB = [156, 163, 175];
  const line: RGB = [229, 231, 235], bgc: RGB = [249, 250, 251], white: RGB = [255, 255, 255];
  const indigo: RGB = [79, 70, 229], indigoDk: RGB = [67, 56, 202];
  const green: RGB = [16, 185, 129], teal: RGB = [16, 160, 120], red: RGB = [239, 68, 68], amber: RGB = [245, 158, 11];
  const amberBg: RGB = [255, 251, 235], amberBd: RGB = [253, 230, 138], amberDk: RGB = [146, 64, 14];
  const pass = isPassed;
  const verdict: RGB = isPartialEvaluation ? amber : (pass ? green : red);
  const scoreRGB = (s: number): RGB => (s >= 8 ? green : s >= 5 ? teal : s >= 3 ? amber : red);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const txt = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > pageH - M) { doc.addPage(); y = M; } };
  const bar = (x: number, by: number, w: number, score: number, c: RGB) => {
    fill(line); doc.roundedRect(x, by, w, 2, 1, 1, 'F');
    const fw = Math.max(0, Math.min(w, (score / 10) * w));
    if (fw > 0.1) { fill(c); doc.roundedRect(x, by, fw, 2, 1, 1, 'F'); }
  };
  const QUESTION_LINE_H = 4.0;
  const SKILL_LINE_H = 3.6;
  const SKILL_ROW_GAP = 0.8;
  const RATIONALE_LINE_H = 3.4;
  const RATIONALE_PARAGRAPH_GAP = 0.6;
  const ANSWER_LINE_H = 3.6;
  const splitLines = (
    value: string,
    width: number,
    fontSize: number,
    fontStyle: 'normal' | 'bold' = 'normal',
  ): string[] => {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    const raw = doc.splitTextToSize(value || '', width);
    const lines = (Array.isArray(raw) ? raw : [raw]).map((line) => String(line));
    return lines.length > 0 ? lines : [''];
  };

  // Header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); txt(ink);
  doc.text('AI Interview Evaluation Report', M, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); txt(sub);
  doc.text(`${candidate.name}  ·  ${candidate.role}`, M, y + 9.5);
  doc.setFontSize(7.5); txt(faint);
  doc.text(`#${evalId}`, pageW - M, y + 2, { align: 'right' });
  doc.text(reportGenerated, pageW - M, y + 6, { align: 'right' });
  y += 13; stroke(indigo); doc.setLineWidth(0.7); doc.line(M, y, pageW - M, y); doc.setLineWidth(0.2); y += 5;

  // Final result + Match Score
  fill(isPartialEvaluation ? [255, 251, 235] : (pass ? [236, 253, 245] : [254, 242, 242])); stroke(verdict); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 18, 2, 2, 'FD'); doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); txt(verdict);
  doc.text(isPartialEvaluation ? 'Partial Evaluation' : `Final Result: ${finalResultLabel}`, M + 4, y + 7.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); txt(ink);
  doc.text(
    isPartialEvaluation
      ? 'This interview ended before completion. The AI evaluated only the attended questions.'
      : `${pass ? 'Recommended to Hire' : 'Does Not Meet Requirements'} · Must-Have ${scores.mustHave.toFixed(2)} / Threshold ${MHS_THRESHOLD.toFixed(1)}`,
    M + 4,
    y + 13.5,
  );
  if (!isPartialEvaluation) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); txt(verdict);
    doc.text(`${confidence}%`, pageW - M - 4, y + 8, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); txt(sub);
    doc.text('Match Score (Must-Have)', pageW - M - 4, y + 13, { align: 'right' });
  }
  y += 23;

  // Section scores summary
  fill(bgc); stroke(line); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(ink);
  let sx = M + 3;
  if (sectionsPresent.mustHave) {
    doc.text(`Must-Have Section: `, sx, y + 6); sx += doc.getTextWidth('Must-Have Section: ');
    const mustHaveLabel = isPartialEvaluation
      ? `${scores.mustHave.toFixed(2)}/10 (Partial)`
      : `${scores.mustHave.toFixed(2)}/10 (${pass ? 'PASS' : 'FAIL'})`;
    txt(isPartialEvaluation ? amber : (pass ? green : red)); doc.text(mustHaveLabel, sx, y + 6);
    sx += doc.getTextWidth(mustHaveLabel) + 8; txt(ink);
  }
  if (sectionsPresent.niceToHave) {
    doc.text(`Nice-to-Have Section: `, sx, y + 6); sx += doc.getTextWidth('Nice-to-Have Section: ');
    txt(indigo); doc.text(`${scores.niceToHave.toFixed(2)}/10 (Info)`, sx, y + 6); txt(ink);
  }
  y += 13;

  // ── Per-section question + skill breakdown ────────────────────────
  const drawSection = (key: 'mth' | 'nth' | 'hr', title: string, scoreVal: number, scored: boolean, badge: string, badgeColor: RGB) => {
    const qs = perQuestionDetails.filter(q => q.section === key);
    if (qs.length === 0) return;
    ensure(16);
    fill(indigo); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(white);
    doc.text(title, M + 3, y + 6);
    doc.setFontSize(9);
    doc.text(scored ? `Section Score: ${scoreVal.toFixed(2)}/10 · ${badge}` : 'Not Scored', pageW - M - 3, y + 6, { align: 'right' });
    y += 12;

    qs.forEach((q) => {
      const rt = (q.responseType || '').toLowerCase();
      const src = (q.skipSource || '').toLowerCase();
      let status: { label: string; color: RGB; isScore: boolean };
      if (key === 'hr') status = { label: 'Not Scored', color: faint, isScore: false };
      else if (q.notDelivered) status = { label: `Not Delivered · ${q.questionScore.toFixed(2)}/10`, color: scoreRGB(q.questionScore), isScore: false };
      else if (rt === 'skipped' || src === 'candidate') status = { label: 'Skipped', color: sub, isScore: false };
      else if (['not_answered', 'idk', 'timeout', 'low_coverage'].includes(rt)) status = { label: 'Not Answered', color: faint, isScore: false };
      else status = { label: `${q.questionScore.toFixed(2)}/10`, color: scoreRGB(q.questionScore), isScore: true };

      const qSkills = key === 'hr' ? [] : q.skills;
      const qText = splitLines(q.question || `Question ${q.qNum}`, CW - 28, 8.5);
      // Candidate's answer — recruiters need the actual response to validate
      // the score, not just the question/skills/rationale. Derive a clear
      // placeholder for the no-answer cases so a blank never reads as "the
      // candidate said nothing scorable" when they were simply never asked.
      const _rawAns = String(q.answer || '').trim();
      const _rt = (q.responseType || '').toLowerCase();
      const _src = (q.skipSource || '').toLowerCase();
      let answerDisplay: string;
      if (q.notDelivered) {
        answerDisplay = 'Not asked — the interview ended before this question was reached.';
      } else if (!_rawAns || _rawAns.toUpperCase() === '[SKIPPED]' || _rawAns.toUpperCase() === '[NOT ASKED]') {
        answerDisplay = _src === 'candidate'
          ? 'Skipped — candidate moved to the next question.'
          : _rt === 'idk'
            ? 'Candidate answered "I don\'t know".'
            : 'No response — no answer was given.';
      } else {
        answerDisplay = _rawAns;
      }
      const ansLines = splitLines(answerDisplay, CW - 10, 8);
      const answerBlockH = 4.5 + ansLines.length * ANSWER_LINE_H;
      const skillRows = qSkills.map((s) => {
        const lines = splitLines(s.name, CW - 62, 8);
        return {
          skill: s,
          lines,
          rowHeight: lines.length * SKILL_LINE_H + SKILL_ROW_GAP,
        };
      });
      // "Why this score" rationale — regenerated from the SAME qSkills the
      // score bars above render, so the PDF's per-skill scores and its
      // rationale are single-sourced (identical to the on-screen dashboard).
      // HR: none.
      const ratRaw = key !== 'hr' ? buildRationaleLines(qSkills, q.scoreRationale) : [];
      const rationaleBlocks = ratRaw.map((rl) => splitLines(rl, CW - 8, 7.5));
      const ratContentH = rationaleBlocks.reduce((sum, lines, idx) => (
        sum
        + lines.length * RATIONALE_LINE_H
        + (idx < rationaleBlocks.length - 1 ? RATIONALE_PARAGRAPH_GAP : 0)
      ), 0);
      const ratBoxH = rationaleBlocks.length > 0 ? ratContentH + 10.5 : 0;
      const questionTextH = qText.length * QUESTION_LINE_H + 1;
      const skillsBlockH = skillRows.reduce((sum, row) => sum + row.rowHeight, 0);
      const blockH = 5 + questionTextH + answerBlockH + skillsBlockH + (rationaleBlocks.length > 0 ? ratBoxH + 1 : 0) + 3.5;
      ensure(blockH);

      let cursorY = y;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(indigo);
      doc.text(`Q${q.qNum}`, M, cursorY + 3);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(status.color);
      doc.text(status.label, pageW - M, cursorY + 3, { align: 'right' });
      cursorY += 5;

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); txt(ink);
      qText.forEach((lineText, idx) => {
        doc.text(lineText, M, cursorY + 2.5 + idx * QUESTION_LINE_H);
      });
      cursorY += questionTextH;

      // Candidate's Answer block (label + wrapped response / placeholder).
      const _ansTop = cursorY;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); txt(sub);
      doc.text('Answer', M, _ansTop + 2.5);
      const _ansIsPlaceholder = q.notDelivered
        || !_rawAns
        || _rawAns.toUpperCase() === '[SKIPPED]'
        || _rawAns.toUpperCase() === '[NOT ASKED]';
      doc.setFont('helvetica', _ansIsPlaceholder ? 'italic' : 'normal');
      doc.setFontSize(8); txt(_ansIsPlaceholder ? faint : ink);
      ansLines.forEach((lineText, idx) => {
        doc.text(lineText, M + 12, _ansTop + 2.5 + idx * ANSWER_LINE_H);
      });
      cursorY += answerBlockH;

      skillRows.forEach(({ skill, lines, rowHeight }) => {
        const rowTop = cursorY;
        // Priority tag P1/P2/P3 (High/Medium/Low → weights 10/7/4) — was missing.
        const pLabel = skill.priority === 'High' ? 'P1' : skill.priority === 'Medium' ? 'P2' : 'P3';
        const pColor: RGB = skill.priority === 'High' ? indigo : skill.priority === 'Medium' ? amber : faint;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(sub);
        lines.forEach((lineText, idx) => {
          const prefix = idx === 0 ? '•  ' : '   ';
          doc.text(`${prefix}${lineText}`, M + 2, rowTop + 2.5 + idx * SKILL_LINE_H);
        });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); txt(pColor);
        doc.text(pLabel, pageW - M - 41, rowTop + 2.5, { align: 'right' });
        if (skill.is_unscored) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(faint);
          doc.text('Not evaluated', pageW - M, rowTop + 2.5, { align: 'right' });
        } else {
          bar(pageW - M - 38, rowTop + 0.8, 22, skill.score, scoreRGB(skill.score));
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); txt(scoreRGB(skill.score));
          doc.text(`${skill.score.toFixed(1)}/10`, pageW - M, rowTop + 2.5, { align: 'right' });
        }
        cursorY += rowHeight;
      });

      // "Why this score" — skill-wise rationale in an amber callout (was
      // omitted from the PDF; recruiters need the per-skill reasoning here).
      if (rationaleBlocks.length > 0) {
        fill(amberBg); stroke(amberBd); doc.roundedRect(M, cursorY + 0.5, CW, ratBoxH, 1.2, 1.2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(amberDk);
        doc.text('Why this score', M + 3, cursorY + 4.7);
        let cy = cursorY + 8.4;
        rationaleBlocks.forEach((wrapped, idx) => {
          doc.setFont('helvetica', 'normal'); txt(ink);
          wrapped.forEach((lineText, lineIdx) => {
            doc.text(lineText, M + 3, cy + lineIdx * RATIONALE_LINE_H);
          });
          cy += wrapped.length * RATIONALE_LINE_H + (idx < rationaleBlocks.length - 1 ? RATIONALE_PARAGRAPH_GAP : 0);
        });
        cursorY += ratBoxH + 1;
      }

      cursorY += 2.5;
      stroke(line); doc.setLineWidth(0.1); doc.line(M, cursorY - 1, pageW - M, cursorY - 1); doc.setLineWidth(0.2);
      y = cursorY;
    });
    y += 3;
  };

  drawSection('mth', 'MUST-HAVE SECTION', scores.mustHave, true, isPartialEvaluation ? 'Partial' : (pass ? 'PASS' : 'FAIL'), verdict);
  drawSection('nth', 'NICE-TO-HAVE SECTION', scores.niceToHave, true, 'Informational only', indigo);
  drawSection('hr', 'HR SECTION', 0, false, '', faint);

  // AI Analysis — header bar
  ensure(20);
  fill(indigo); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(white);
  doc.text(
    isPartialEvaluation
      ? 'AI ANALYSIS — Partial Interview Review'
      : `AI ANALYSIS — Why this candidate ${pass ? 'Passed' : 'Failed'}`,
    M + 3,
    y + 6,
  ); y += 13;

  // Verdict callout — tinted by result with a colored left accent bar so the
  // headline decision reads at a glance (was flat, unstyled paragraph text).
  // Point-wise — the same sentences as before, one per point, each with a
  // verdict-coloured dot; the AI narrative is the last point.
  const verdictPoints: string[] = isPartialEvaluation
    ? [
        `${candidate.name}'s interview ended before completion.`,
        `The Must-Have score of ${scores.mustHave.toFixed(2)}/10 and the Nice-to-Have score of ${scores.niceToHave.toFixed(2)}/10 summarize only the attended questions.`,
        'HR is not scored, and no final pass/fail or match score is generated for this report.',
      ]
    : [
        `${candidate.name} ${pass ? 'meets' : 'does not meet'} the Must-Have bar — ${scores.mustHave.toFixed(2)}/10 vs the ${MHS_THRESHOLD.toFixed(1)} threshold (${pass ? '+' : '-'}${Math.abs(scores.mustHave - MHS_THRESHOLD).toFixed(2)}).`,
        `This drives the ${finalResultLabel} decision; Nice-to-Have (${scores.niceToHave.toFixed(2)}/10) is informational and HR is not scored.`,
      ];
  if (aiSummary) verdictPoints.push(aiSummary);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const pointLines = verdictPoints.map((pt) => doc.splitTextToSize(pt, CW - 14) as string[]);
  const vBoxH = pointLines.reduce((h, ls) => h + ls.length * 4.4 + 1.5, 0) + 5;
  ensure(vBoxH + 3);
  const vTint: RGB = isPartialEvaluation ? [255, 251, 235] : (pass ? [236, 253, 245] : [254, 242, 242]);
  fill(vTint); stroke(verdict); doc.setLineWidth(0.35); doc.roundedRect(M, y, CW, vBoxH, 1.5, 1.5, 'FD'); doc.setLineWidth(0.2);
  fill(verdict); doc.roundedRect(M, y, 1.6, vBoxH, 0.8, 0.8, 'F'); // left accent bar
  let py = y + 5;
  pointLines.forEach((ls) => {
    fill(verdict); doc.circle(M + 6, py - 1.1, 0.8, 'F');
    txt(ink); doc.text(ls, M + 9, py);
    py += ls.length * 4.4 + 1.5;
  });
  y += vBoxH + 4;
  const columnGap = 4;
  const columnWidth = (CW - columnGap) / 2;
  const measureInsightCard = (items: string[], width: number) => {
    let height = 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const safeItems = items.length > 0 ? items.slice(0, 5) : ['No items captured.'];
    safeItems.forEach((item) => {
      const lines = doc.splitTextToSize(`• ${item}`, width - 8);
      height += lines.length * 4 + 1;
    });
    return Math.max(height + 3, 22);
  };
  const drawInsightCard = (
    x: number,
    topY: number,
    width: number,
    height: number,
    title: string,
    items: string[],
    accent: RGB,
    background: RGB,
  ) => {
    fill(background); stroke(accent); doc.roundedRect(x, topY, width, height, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); txt(accent);
    doc.text(title, x + 3, topY + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(ink);
    let cy = topY + 9;
    const safeItems = items.length > 0 ? items.slice(0, 5) : ['No items captured.'];
    safeItems.forEach((item) => {
      const lines = doc.splitTextToSize(`• ${item}`, width - 8);
      doc.text(lines, x + 3, cy + 3);
      cy += lines.length * 4 + 1;
    });
  };
  const strengthsHeight = measureInsightCard(strengths, columnWidth);
  const weaknessesHeight = measureInsightCard(weaknesses, columnWidth);
  const insightHeight = Math.max(strengthsHeight, weaknessesHeight);
  ensure(insightHeight + 2);
  drawInsightCard(M, y, columnWidth, insightHeight, 'Key Strengths', strengths, [4, 120, 87], [236, 253, 245]);
  drawInsightCard(M + columnWidth + columnGap, y, columnWidth, insightHeight, 'Areas of Concern', weaknesses, [185, 28, 28], [254, 242, 242]);
  y += insightHeight + 4;

  // Section header bar — same style as the AI Analysis bar above.
  const sectionBar = (title: string, color: RGB) => {
    ensure(20);
    fill(color); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(white);
    doc.text(title, M + 3, y + 6); y += 13;
  };

  // Executive Summary — the same three paragraphs as the on-screen report.
  const pdfQuestions = perQuestionDetails.length;
  const pdfSkills = [...mustHaveClusters, ...niceToHaveClusters].reduce((n, c) => n + c.skills.length, 0);
  // The original summary sentences, one per point with a drawn tick —
  // matching the on-screen Executive Summary (helvetica has no ✓ glyph).
  const nhStrength = scores.niceToHave >= 7.5 ? 'strong' : 'adequate';
  const execPoints: string[] = [
    `${candidate.name} completed an AI-powered technical interview for the ${candidate.role} position on ${interview.date || 'the scheduled date'}.`,
    `The evaluation consisted of ${pdfQuestions} question${pdfQuestions !== 1 ? 's' : ''} covering ${pdfSkills} skill${pdfSkills !== 1 ? 's' : ''} across multiple priority levels.`,
  ];
  if (sectionsPresent.mustHave) {
    execPoints.push(`The candidate achieved a Must-Have Section Score of ${scores.mustHave.toFixed(2)}/10, ` + (isPartialEvaluation
      ? 'based only on the questions the candidate attended before the interview ended.'
      : pass
        ? `which exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(scores.mustHave - MHS_THRESHOLD).toFixed(2)} points.`
        : `which falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)} points.`));
    if (sectionsPresent.niceToHave) {
      execPoints.push(`The Nice-to-Have Section Score was ${scores.niceToHave.toFixed(2)}/10, demonstrating ${nhStrength} proficiency in supplementary skills.`);
    }
  }
  execPoints.push(isPartialEvaluation
    ? 'Because the interview was terminated early, this report provides question-by-question and skill-by-skill analysis only; it does not generate a final hiring recommendation or match score.'
    : `Based on this evaluation, the assessment recommends ${pass ? 'proceeding with the hiring process' : 'not proceeding with the current application'} with a match score of ${confidence}%.`);
  sectionBar('EXECUTIVE SUMMARY', indigo);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const tickIndent = 6;
  execPoints.forEach((text) => {
    const lines = doc.splitTextToSize(text, CW - tickIndent);
    ensure(lines.length * 4.4 + 2);
    // Tick: a short down-stroke then a long up-stroke.
    stroke(indigo); doc.setLineWidth(0.5);
    doc.line(M + 0.6, y + 1.8, M + 1.6, y + 2.9);
    doc.line(M + 1.6, y + 2.9, M + 3.6, y + 0.4);
    doc.setLineWidth(0.2);
    txt(ink); doc.text(lines, M + tickIndent, y + 3);
    y += lines.length * 4.4 + 2;
  });
  txt(ink);
  y += 3;

  // Recommendations & Next Steps — the same bullets as the on-screen report.
  const recs: [string, string][] = pass
    ? [
        ['Proceed to next round:', 'Candidate demonstrates strong technical competency across must-have skills'],
        ['Technical interview:', 'Consider a deeper assessment in core architecture and design topics'],
        ['Cultural fit:', 'Schedule a behavioral interview to assess team alignment'],
        ['Areas to explore:', 'Skills showing medium-level proficiency can benefit from additional validation'],
      ]
    : [
        ['Do not proceed:', 'Candidate did not meet the minimum requirements for must-have skills'],
        ['Skills gap identified:', 'Significant development needed in core technical areas'],
        ['Alternative path:', 'Consider for junior positions or recommend additional training'],
      ];
  sectionBar('RECOMMENDATIONS & NEXT STEPS', pass && !isPartialEvaluation ? teal : indigo);
  doc.setFontSize(8.5);
  recs.forEach(([label, text]) => {
    doc.setFont('helvetica', 'bold');
    const labelW = doc.getTextWidth(`• ${label} `);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, CW - labelW - 2);
    ensure(lines.length * 4.4 + 2);
    doc.setFont('helvetica', 'bold'); txt(ink); doc.text(`• ${label}`, M, y + 3);
    doc.setFont('helvetica', 'normal'); txt(sub); doc.text(lines, M + labelW, y + 3);
    y += lines.length * 4.4 + 2;
  });
  txt(ink); y += 3;

  // Footer
  ensure(18);
  fill([238, 242, 255]); doc.roundedRect(M, y, CW, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); txt(indigoDk);
  const foot = isPartialEvaluation
    ? `Scoring: This terminated interview report evaluates only the attended questions. No final result or match score is generated. Nice-to-Have is informational; HR is not scored. Question Score = Sum(Skill x Weight) / Sum(Weights), where P1=10, P2=7, P3=4. All scores are 0-10.   Confidentiality: proprietary — for authorized hiring personnel only.`
    : `Scoring: Must-Have Section Score (Pass >= ${MHS_THRESHOLD.toFixed(1)}) drives the final result; Nice-to-Have is informational; HR is not scored. Question Score = Sum(Skill x Weight) / Sum(Weights), where P1=10, P2=7, P3=4. All scores are 0-10.   Confidentiality: proprietary — for authorized hiring personnel only.`;
  doc.text(doc.splitTextToSize(foot, CW - 6), M + 3, y + 4);

  const fileName = `eval_report_${candidate.name || 'candidate'}_${evalId}`.replace(/\s+/g, '_') + '.pdf';
  if (save) doc.save(fileName);

  if (sessionId) {
    aiInterviewService.logReportDownload(sessionId, 'evaluation');
  }
  return { blob: save ? null : doc.output('blob'), fileName };
}

type CoverageStats = { total: number; covered: number; demonstrated: number; pct: number };
type FlatSkill = { name: string; score: number; tag: string; weight: number };

/** One Section Score row: the bar carries the pass threshold as a dashed marker. */
function SectionRow({ label, value, Icon, bar, iconTone, badge }: {
  label: string; value: number; Icon: typeof Target; bar: string; iconTone: string; badge: ReactNode;
}) {
  return (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(160px,1.2fr)_minmax(0,2fr)_64px_96px] items-center gap-x-4 gap-y-2 px-5 py-4">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconTone}`}><Icon className="w-4 h-4" /></div>
      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{label}</div>
    </div>
    <div className="relative col-span-2 sm:col-span-1 order-last sm:order-none">
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }} />
      </div>
      <div className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-gray-400 dark:border-slate-500" style={{ left: `${MHS_THRESHOLD * 10}%` }} title={`Pass threshold ${MHS_THRESHOLD.toFixed(1)}`} />
    </div>
    <div className="hidden sm:block text-lg font-bold text-gray-900 dark:text-slate-50 tabular-nums text-right">{value.toFixed(2)}</div>
    <div className="flex items-center justify-end gap-2">
      <span className="sm:hidden text-base font-bold text-gray-900 dark:text-slate-50 tabular-nums">{value.toFixed(2)}</span>
      {badge}
    </div>
  </div>
  );
}

/** Coverage block for one section of the Cluster Coverage card. */
function CoverageBlock({ label, cov, tone, Icon }: {
  label: string; cov: CoverageStats; tone: { icon: string; bar: string }; Icon: typeof Target;
}) {
  return (
  <div className="py-4 first:pt-0 last:pb-0">
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone.icon}`}><Icon className="w-3.5 h-3.5" /></div>
        <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{label}</div>
      </div>
      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${
        cov.pct === 100 ? 'bg-success-subtle text-success-strong ring-success-line'
        : cov.pct === 0 ? 'bg-destructive-subtle text-destructive ring-destructive-line'
        : 'bg-warning-subtle text-warning-strong ring-warning-line'}`}>
        {cov.pct}% Coverage
      </span>
    </div>
    <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden mb-1.5">
      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${cov.pct}%` }} />
    </div>
    <div className="text-xs text-gray-500 dark:text-slate-400">
      {cov.covered} of {cov.total} skills asked · <span className="font-semibold text-gray-700 dark:text-slate-300">{cov.demonstrated} demonstrated</span> (score ≥ 5)
    </div>
  </div>
  );
}

/** Skill table for one section of the Skills Assessment Summary. */
function SkillTable({ title, rows, tagClass }: {
  title: string; rows: FlatSkill[]; tagClass: (tag: string) => string;
}) {
  return (
  <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-hidden min-w-0">
    <div className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-gray-500 dark:text-slate-400">
            <th className="text-left font-medium px-4 py-2">Skill</th>
            <th className="text-center font-medium px-2 py-2 w-14">Type</th>
            <th className="text-center font-medium px-2 py-2 w-16">Weight</th>
            <th className="text-right font-medium px-4 py-2 w-16">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
          {rows.map((s, i) => (
            <tr key={i}>
              <td className="px-4 py-2 text-gray-800 dark:text-slate-200">{s.name}</td>
              <td className="px-2 py-2 text-center"><span className={`inline-block text-2xs font-bold px-1.5 py-0.5 rounded ${tagClass(s.tag)}`}>{s.tag}</span></td>
              <td className="px-2 py-2 text-center text-gray-500 dark:text-slate-400 tabular-nums">{s.weight}</td>
              <td className={`px-4 py-2 text-right font-bold tabular-nums ${scoreColor(s.score).text}`}>{s.score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
  );
}


export function EvalReportCombined({
  data,
  aiConfidence,
  candidateImage,
  avgResponseSeconds,
  evaluationId,
  sessionId,
}: Props) {
  const {
    candidate, interview, scores, finalResult, sectionsPresent,
    mustHaveClusters, niceToHaveClusters, interviewResponses, perQuestionDetails,
    aiSummary, strengths, weaknesses, isPartialEvaluation,
  } = data;


  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = (finalResult ?? (isPassed ? 'Pass' : 'Fail')).toUpperCase();
  // Match Score is MUST-HAVE based only (2026-05-30) — the Must-Have section is
  // the Pass/Fail gate, so the headline % must track it, NOT the NTH-weighted
  // overall (scores.final). MHS is 0-10 → ×10 for a 0-100%.
  const confidence = Math.round(scores.mustHave * 10);

  const reportGenerated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const evalId = evaluationId
    ?? `EV-${(interview.date || '').replace(/[^0-9]/g, '').slice(0, 8) || 'XXXXXXXX'}`;

  // ── Skills (flattened, with priority tag/weight) ──────────────────────
  const flatMustHave = mustHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name, score: s.score, ...priorityLabel(c.priority),
  })));
  const flatNiceToHave = niceToHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name, score: s.score, ...priorityLabel(c.priority),
  })));
  const allSkills = [...mustHaveClusters, ...niceToHaveClusters].flatMap(c => c.skills);
  const totalSkills = flatMustHave.length + flatNiceToHave.length;
  const totalQuestions = perQuestionDetails.length;
  const niceToHaveStrong = scores.niceToHave >= 7.5 ? 'strong' : 'adequate';

  // ── Radar (top 6 scored skills; pad to keep polygon readable) ─────────
  const scoredSkills = allSkills.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  const topSkills = scoredSkills.slice(0, 6);
  const radarBase = topSkills.length >= 3
    ? topSkills
    : [...topSkills, ...allSkills.filter(s => s.score === 0).slice(0, Math.max(0, 3 - topSkills.length))];
  const radarData = radarBase.map(s => ({ skill: s.name, score: s.score, fullMark: 10 }));

  // ── Coverage per section ──────────────────────────────────────────────
  // Use the SAME definition as the Cluster Coverage tab (CoverageV2) so the two
  // views never disagree: "covered" = the skill was ASKED/probed (s.asked),
  // NOT how the candidate scored. "demonstrated" = score ≥ 5 (Medium+). A skill
  // can be covered (asked) but not demonstrated. (Previously this used
  // score > 0, which gave 64% here vs 100% in the Cluster Coverage tab.)
  const coverage = (clusters: typeof mustHaveClusters) => {
    const total = clusters.reduce((n, c) => n + c.skills.length, 0);
    const covered = clusters.reduce((n, c) => n + c.skills.filter(s => s.asked).length, 0);
    // Gate on `asked` exactly as CoverageV2.isDemonstrated does. A recovered
    // score (the candidate showed the skill in some OTHER answer, while this
    // skill's own question was never delivered) is evidence but not coverage,
    // so it must not inflate this count either — otherwise the report and the
    // Cluster Coverage tab disagree, which is what this shared definition is
    // here to prevent.
    const demonstrated = clusters.reduce((n, c) => n + c.skills.filter(s => s.asked && s.score >= 5).length, 0);
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    return { total, covered, demonstrated, pct, clusters: clusters.length };
  };
  const mhCov = coverage(mustHaveClusters);
  const nhCov = coverage(niceToHaveClusters);

  // ── Palette: the project's tokens only (globals.css) ─────────────────
  // Must-Have = brand blue, Nice-to-Have = brand orange, verdicts use the
  // success / destructive / warning status tokens.
  const verdictTone = isPartialEvaluation
    ? { tile: 'bg-warning-subtle/60 border-warning-line', icon: 'bg-warning text-white', text: 'text-warning-strong', pill: 'bg-warning-subtle text-warning-strong ring-warning-line' }
    : isPassed
      ? { tile: 'bg-success-subtle/60 border-success-line', icon: 'bg-success text-white', text: 'text-success', pill: 'bg-success-subtle text-success-strong ring-success-line' }
      : { tile: 'bg-destructive-subtle/60 border-destructive-line', icon: 'bg-destructive text-white', text: 'text-destructive', pill: 'bg-destructive-subtle text-destructive ring-destructive-line' };
  const card = 'rounded-2xl border border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5';
  const cardHeader = 'flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-slate-700/60';
  const headerIcon = 'w-9 h-9 rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 flex items-center justify-center shrink-0';
  const cardTitle = 'text-base font-semibold text-gray-900 dark:text-slate-50';

  const statTiles = [
    { label: 'Questions Answered', value: String(interviewResponses.length), Icon: Play,
      tile: 'bg-brand-blue/5 border-brand-blue/15', icon: 'bg-brand-blue text-white' },
    { label: 'Avg Response Time', value: avgResponseSeconds && avgResponseSeconds > 0 ? `${Math.round(avgResponseSeconds)}s` : '—', Icon: Clock,
      tile: 'bg-brand-cyan/5 border-brand-cyan/20', icon: 'bg-brand-cyan text-white' },
    { label: 'Skills Evaluated', value: `${allSkills.filter(s => s.score > 0).length} / ${allSkills.length}`, Icon: CheckCircle,
      tile: 'bg-success-subtle/50 border-success-line', icon: 'bg-success text-white' },
    { label: isPartialEvaluation ? 'Partial Evaluation' : 'Overall Score', value: isPartialEvaluation ? '—' : `${confidence}%`, Icon: BarChart3,
      tile: verdictTone.tile, icon: verdictTone.icon, valueClass: verdictTone.text },
  ];

  return (
    <div className="space-y-5">
      {/* 1. Report header — title and the photo + verdict (Download Report lives in the page header) */}
      <div className={`${card} p-5`} style={{ pageBreakInside: 'avoid' }}>
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-brand-blue text-white flex items-center justify-center shadow-sm shadow-brand-blue/25 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-lg font-bold text-gray-900 dark:text-slate-50 leading-tight">AI Interview Evaluation Report</div>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ring-1 ${verdictTone.pill}`}>
                  {isPartialEvaluation ? 'PARTIAL' : <>{isPassed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{finalResultLabel}</>}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} · {totalSkills} skill{totalSkills !== 1 ? 's' : ''} · ID #{evalId}
              </div>
            </div>
          </div>
        </div>
        {/* Candidate photo (identity check; initials when none) with the
            verdict beside it — result, the Must-Have vs threshold line and the
            Match Score — then the meta strip full width underneath. */}
        <div className="mt-5 flex items-stretch gap-4">
          <div className="w-24 sm:w-28 min-h-[96px] shrink-0 rounded-xl overflow-hidden bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center">
            {candidateImage
              ? <img src={candidateImage} alt={candidate.name} className="w-full h-full object-cover" />
              : <span className="text-3xl font-bold text-brand-blue">
                  {candidate.name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C'}
                </span>}
          </div>
          <div className={`flex-1 min-w-0 rounded-xl border px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-4 ${verdictTone.tile}`}>
            <div className="min-w-0">
              {isPartialEvaluation ? (
                <>
                  <div className={`text-lg font-bold ${verdictTone.text}`}>Partial Evaluation</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1 max-w-xl">
                    This interview ended before completion. The AI evaluated only the questions the candidate attended, so no final pass/fail or match score is generated.
                  </div>
                </>
              ) : (
                <>
                  <div className={`flex items-center gap-1.5 flex-wrap ${verdictTone.text}`}>
                    {isPassed
                      ? <CheckCircle className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                      : <XCircle className="w-5 h-5 shrink-0" strokeWidth={2.5} />}
                    <span className="text-lg font-bold">{finalResultLabel}</span>
                    <span className="text-sm font-medium">· {isPassed ? 'Recommended to Hire' : 'Does Not Meet Requirements'}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-slate-400 mt-1.5 tabular-nums">
                    Must-Have {scores.mustHave.toFixed(2)} / Threshold {MHS_THRESHOLD.toFixed(1)}
                    {isPassed
                      ? ` · +${(scores.mustHave - MHS_THRESHOLD).toFixed(2)} above`
                      : ` · Below by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)}`}
                  </div>
                </>
              )}
            </div>
            {!isPartialEvaluation && (
              <div className={`px-5 py-2.5 rounded-xl text-center shrink-0 shadow-sm ${verdictTone.icon}`}>
                <div className="text-2xl font-bold leading-none tabular-nums">{confidence}%</div>
                <div className="text-xs font-semibold mt-1 opacity-95">Match Score</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" style={{ pageBreakInside: 'avoid' }}>
        {statTiles.map(({ label, value, Icon, tile, icon, valueClass }) => (
          <div key={label} className={`rounded-2xl border p-4 flex items-center gap-3 min-w-0 ${tile}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${icon}`}><Icon className="w-5 h-5" /></div>
            <div className="min-w-0">
              <div className={`text-xl sm:text-2xl font-bold tabular-nums leading-tight ${valueClass ?? 'text-gray-900 dark:text-slate-50'}`}>{value}</div>
              <div className="text-xs text-gray-600 dark:text-slate-400 truncate">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Executive summary — first read, ahead of the score detail */}
      <div className={card} style={{ pageBreakInside: 'avoid' }}>
        <div className={cardHeader}>
          <div className={headerIcon}><FileText className="w-4 h-4" /></div>
          <div className={cardTitle}>Executive Summary</div>
        </div>
        {/* The original summary wording, one sentence per point, each with a tick. */}
        <ul className="p-5 space-y-2.5 text-sm leading-relaxed text-gray-700 dark:text-slate-300">
          {[
            <>{candidate.name} completed an AI-powered technical interview for the <strong>{candidate.role}</strong> position on {interview.date || 'the scheduled date'}.</>,
            <>The evaluation consisted of <strong>{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}</strong> covering <strong>{totalSkills} skill{totalSkills !== 1 ? 's' : ''}</strong> across multiple priority levels.</>,
            ...(sectionsPresent.mustHave ? [
              <>The candidate achieved a <strong>Must-Have Section Score of {scores.mustHave.toFixed(2)}/10</strong>,{' '}
                {isPartialEvaluation
                  ? 'based only on the questions the candidate attended before the interview ended.'
                  : isPassed
                    ? `which exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(scores.mustHave - MHS_THRESHOLD).toFixed(2)} points.`
                    : `which falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)} points.`}</>,
            ] : []),
            ...(sectionsPresent.mustHave && sectionsPresent.niceToHave ? [
              <>The Nice-to-Have Section Score was <strong>{scores.niceToHave.toFixed(2)}/10</strong>, demonstrating {niceToHaveStrong} proficiency in supplementary skills.</>,
            ] : []),
            isPartialEvaluation
              ? <>Because the interview was terminated early, this report provides question-by-question and skill-by-skill analysis only; it does not generate a final hiring recommendation or match score.</>
              : <>Based on this evaluation, the assessment recommends <strong>{isPassed ? 'proceeding with the hiring process' : 'not proceeding with the current application'}</strong> with a match score of <strong>{confidence}%</strong>.</>,
          ].map((point, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-brand-blue" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 4. Section Score Breakdown */}
      <div className={card} style={{ pageBreakInside: 'avoid' }}>
        <div className={`${cardHeader} flex-wrap`}>
          <div className={headerIcon}><Target className="w-4 h-4" /></div>
          <div className={cardTitle}>Section Score Breakdown</div>
          <span title={`Must-Have drives Pass/Fail at ${MHS_THRESHOLD.toFixed(1)}; Nice-to-Have is informational.`}>
            <Info className="w-4 h-4 text-gray-400" />
          </span>
          <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-blue" />Score Achieved</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-gray-400" />Required Threshold</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success" />Pass</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-orange" />Info Only</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" />Fail</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {sectionsPresent.mustHave && (
            <SectionRow
              label="Must-Have Section Score"
              value={scores.mustHave}
              Icon={Target}
              iconTone={isPartialEvaluation ? 'bg-warning-subtle text-warning-strong' : isPassed ? 'bg-success-subtle text-success' : 'bg-destructive-subtle text-destructive'}
              bar={isPartialEvaluation ? 'bg-warning' : isPassed ? 'bg-success' : 'bg-destructive'}
              badge={
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${verdictTone.pill}`}>
                  {isPartialEvaluation ? 'Partial' : <>{isPassed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{isPassed ? 'PASS' : 'FAIL'}</>}
                </span>
              }
            />
          )}
          {sectionsPresent.niceToHave && (
            <SectionRow
              label="Nice-to-Have Section Score"
              value={scores.niceToHave}
              Icon={Star}
              iconTone="bg-brand-orange/10 text-brand-orange-deep"
              bar="bg-brand-orange"
              badge={<span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20">Info Only</span>}
            />
          )}
        </div>
      </div>

      {/* 5. Radar + cluster coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ pageBreakInside: 'avoid' }}>
        <div className={card}>
          <div className={cardHeader}>
            <div className={headerIcon}><Network className="w-4 h-4" /></div>
            <div className={cardTitle}>Skill Assessment Radar</div>
          </div>
          <div className="p-4">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke="var(--raw-e5e7eb)" />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: 'var(--raw-6b7280)', fontSize: 11, fontWeight: 500 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: 'var(--raw-6b7280)', fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="var(--brand-blue)" fill="var(--brand-blue)" fillOpacity={0.35} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm italic">
                Not enough data to render radar chart.
              </div>
            )}
          </div>
        </div>

        <div className={card}>
          <div className={cardHeader}>
            <div className={headerIcon}><Layers className="w-4 h-4" /></div>
            <div className={cardTitle}>Cluster Coverage Overview</div>
          </div>
          <div className="p-5">
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {sectionsPresent.mustHave && (
                <CoverageBlock label="Must-Have Section" cov={mhCov} Icon={Target}
                  tone={{ icon: 'bg-brand-blue/10 text-brand-blue', bar: 'bg-brand-blue' }} />
              )}
              {sectionsPresent.niceToHave && (
                <CoverageBlock label="Nice-to-Have Section" cov={nhCov} Icon={Star}
                  tone={{ icon: 'bg-brand-orange/10 text-brand-orange-deep', bar: 'bg-brand-orange' }} />
              )}
            </div>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-blue/5 border border-brand-blue/15 px-4 py-3 text-xs text-gray-600 dark:text-slate-400 leading-relaxed">
              <Info className="w-4 h-4 text-brand-blue shrink-0 mt-px" />
              <span><strong className="text-gray-800 dark:text-slate-200">Question Coverage</strong> reflects how much of the planned skill set was actually probed — not how well the candidate answered (that&apos;s the Section Score above).</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Skills assessment summary */}
      <div className={card}>
        <div className={`${cardHeader} flex-wrap`}>
          <div className={headerIcon}><ListChecks className="w-4 h-4" /></div>
          <div className={cardTitle}>Skills Assessment Summary</div>
          <div className="ml-auto flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-blue" />Must-Have</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-orange" />Nice-to-Have</span>
          </div>
        </div>
        {flatMustHave.length === 0 && flatNiceToHave.length === 0 ? (
          <div className="p-6 text-sm text-gray-400 italic text-center">No skills evaluated yet.</div>
        ) : (
          <div className="p-4 sm:p-5 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {sectionsPresent.mustHave && flatMustHave.length > 0 && (
              <SkillTable
                title={`Must-Have Skills (${flatMustHave.length} skill${flatMustHave.length !== 1 ? 's' : ''} evaluated)`}
                rows={flatMustHave}
                tagClass={(t) => t === 'P1' ? 'bg-brand-blue text-white' : t === 'P2' ? 'bg-brand-blue/75 text-white' : 'bg-brand-blue/15 text-brand-blue'}
              />
            )}
            {sectionsPresent.niceToHave && flatNiceToHave.length > 0 && (
              <SkillTable
                title={`Nice-to-Have Skills (${flatNiceToHave.length} skill${flatNiceToHave.length !== 1 ? 's' : ''} evaluated)`}
                rows={flatNiceToHave}
                tagClass={(t) => t === 'P1' ? 'bg-brand-orange text-white' : t === 'P2' ? 'bg-brand-orange/75 text-white' : 'bg-brand-orange/15 text-brand-orange-deep'}
              />
            )}
          </div>
        )}
      </div>

      {/* 7. Question-by-question */}
      <div className={card}>
        <div className={cardHeader}>
          <div className={headerIcon}><ClipboardList className="w-4 h-4" /></div>
          <div className={cardTitle}>Question-by-Question Performance</div>
        </div>
        {perQuestionDetails.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {perQuestionDetails.map((q, i) => {
              const isHR = q.section === 'hr';
              const sc = scoreColor(q.questionScore);
              const sectionLabel = q.section === 'mth' ? 'Must-Have' : q.section === 'nth' ? 'Nice-to-Have' : 'HR';
              const sectionClass = q.section === 'mth'
                ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20'
                : q.section === 'nth' ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' : 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/20';
              // Header middle column shows the mapped skills (HR has none);
              // the actual question text is rendered full-width just below.
              const skillsText = isHR ? '' : (q.skills.map(s => s.name).join(', ') || '');
              // Rationale regenerated from q.skills (single-sourced with the
              // Skills-assessed scores everywhere); HR has none.
              const rationaleLines = isHR ? [] : buildRationaleLines(q.skills, q.scoreRationale);
              const hasRationale = rationaleLines.length > 0;
              // Candidate's answer (with clear placeholders for the no-answer
              // cases) so the report shows the actual response, not just Q+score.
              const rawAns = String(q.answer || '').trim();
              const rtL = (q.responseType || '').toLowerCase();
              const srcL = (q.skipSource || '').toLowerCase();
              const ansIsPlaceholder = q.notDelivered || !rawAns
                || rawAns.toUpperCase() === '[SKIPPED]' || rawAns.toUpperCase() === '[NOT ASKED]';
              const answerText = q.notDelivered
                ? 'Not asked — the interview ended before this question was reached.'
                : ansIsPlaceholder
                  ? (srcL === 'candidate'
                      ? 'Skipped — candidate moved to the next question.'
                      : rtL === 'idk'
                        ? 'Candidate answered "I don\'t know".'
                        : 'No response — no answer was given.')
                  : rawAns;
              return (
                <div key={i} className="px-5 py-4 space-y-2" style={{ pageBreakInside: 'avoid' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-brand-blue">Q{q.qNum}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${sectionClass}`}>{sectionLabel}</span>
                    {skillsText && <span className="text-xs text-gray-500 dark:text-slate-400 truncate min-w-0 flex-1">{skillsText}</span>}
                    <span className="ml-auto text-right">
                      {isHR
                        ? <span className="text-xs font-medium text-gray-400 italic">Review only</span>
                        : <>
                            <span className={`text-base font-bold tabular-nums ${sc.text}`}>{q.questionScore.toFixed(2)}</span>
                            {q.notDelivered && <span className="block text-2xs font-semibold text-gray-400 uppercase tracking-wide">Not Delivered</span>}
                          </>}
                    </span>
                  </div>
                  {/* Actual interview question text — recruiters need to see
                      WHAT was asked, not just the mapped skills. */}
                  {q.question && q.question.trim() && (
                    <div className="text-sm text-gray-800 dark:text-slate-200 leading-relaxed">
                      <span className="font-semibold text-gray-500">Q:&nbsp;</span>{q.question}
                    </div>
                  )}
                  {/* Candidate's answer — the actual response the score is based on. */}
                  <div className={`text-sm leading-relaxed ${ansIsPlaceholder ? 'text-gray-400 italic' : 'text-gray-700 dark:text-slate-300'}`}>
                    <span className="font-semibold text-gray-500 not-italic">A:&nbsp;</span>{answerText}
                  </div>
                  {hasRationale && (
                    <div className="text-2xs leading-relaxed text-warning-strong bg-warning-subtle/60 border border-warning-line rounded-lg px-3 py-2" style={{ pageBreakInside: 'avoid' }}>
                      <div className="font-semibold mb-0.5">Why this score</div>
                      <div className="space-y-0.5">
                        {rationaleLines.map((line, li) => {
                          const t = line.trim();
                          if (!t) return null;
                          const ci = t.indexOf(':');
                          const labeled = ci > 0 && ci <= 120;
                          return (
                            <div key={li}>
                              {labeled
                                ? <><span className="font-semibold">{t.slice(0, ci)}</span>{t.slice(ci)}</>
                                : t}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
            <ClipboardList className="w-9 h-9 opacity-50" />
            <div className="text-sm">No question-level data available.</div>
          </div>
        )}
      </div>

      {/* 8. AI analysis | recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* AI Analysis — why pass / fail, plus the AI narrative */}
        <div className={`rounded-2xl border overflow-hidden ${verdictTone.tile}`} style={{ pageBreakInside: 'avoid' }}>
          <div className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm ${verdictTone.text}`}>
            {isPartialEvaluation || !isPassed ? <AlertTriangle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {isPartialEvaluation ? 'AI Analysis — Partial Interview Review' : `AI Analysis — Why this candidate ${isPassed ? 'Passed' : 'Failed'}`}
          </div>
          {/* Point-wise — the same wording, one sentence per point, each
              marked with the verdict's icon and colour. */}
          <div className="px-5 pb-5 space-y-3 text-sm leading-relaxed text-gray-700 dark:text-slate-300">
            <ul className="space-y-2.5">
              {[
                ...(isPartialEvaluation ? [
                  <><strong>{candidate.name}</strong> was evaluated only on the portion of the interview completed before termination.</>,
                  <>The Must-Have section average shown here is <strong>{scores.mustHave.toFixed(2)}/10</strong>, and Nice-to-Have is <strong>{scores.niceToHave.toFixed(2)}/10</strong>.</>,
                  <>These numbers summarize the attended questions only and do not produce a final pass/fail decision.</>,
                ] : [
                  <><strong>{candidate.name}</strong> {isPassed ? 'meets' : 'does not meet'} the Must-Have bar — scoring{' '}
                    <strong>{scores.mustHave.toFixed(2)}/10</strong> against the {MHS_THRESHOLD.toFixed(1)} pass threshold
                    {isPassed
                      ? ` (exceeds by ${(scores.mustHave - MHS_THRESHOLD).toFixed(2)})`
                      : ` (below by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)})`}.</>,
                  <>This Must-Have result drives the <strong>{finalResultLabel}</strong> decision; Nice-to-Have ({scores.niceToHave.toFixed(2)}/10) is informational and HR is not scored.</>,
                ]),
                ...(aiSummary ? [<>{aiSummary}</>] : []),
              ].map((point, i) => {
                const PointIcon = isPartialEvaluation ? AlertTriangle : isPassed ? CheckCircle : XCircle;
                return (
                  <li key={i} className="flex items-start gap-2.5">
                    <PointIcon className={`w-4 h-4 mt-0.5 shrink-0 ${verdictTone.text}`} />
                    <span>{point}</span>
                  </li>
                );
              })}
            </ul>
            {((strengths && strengths.length > 0) || (weaknesses && weaknesses.length > 0)) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {strengths && strengths.length > 0 && (
                  <div className="rounded-lg border border-success-line bg-white/70 dark:bg-slate-900/60 p-3">
                    <div className="text-xs font-bold text-success-strong mb-1.5">Key Strengths</div>
                    <ul className="space-y-1.5 text-xs">
                      {strengths.slice(0, 5).map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5"><CheckCircle className="w-3.5 h-3.5 mt-px shrink-0 text-success" /><span>{s}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {weaknesses && weaknesses.length > 0 && (
                  <div className="rounded-lg border border-destructive-line bg-white/70 dark:bg-slate-900/60 p-3">
                    <div className="text-xs font-bold text-destructive mb-1.5">Areas of Concern</div>
                    <ul className="space-y-1.5 text-xs">
                      {weaknesses.slice(0, 5).map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 mt-px shrink-0 text-destructive" /><span>{w}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recommendations & Next Steps */}
        <div className={`rounded-2xl border overflow-hidden ${isPassed && !isPartialEvaluation ? 'bg-success-subtle/50 border-success-line' : 'bg-brand-blue/5 border-brand-blue/15'}`} style={{ pageBreakInside: 'avoid' }}>
          <div className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm ${isPassed && !isPartialEvaluation ? 'text-success-strong' : 'text-brand-blue'}`}>
            <Lightbulb className="w-4 h-4" />
            Recommendations &amp; Next Steps
          </div>
          <ul className="px-5 pb-5 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-slate-300 list-disc pl-10">
            {isPassed ? (
              <>
                <li><strong>Proceed to next round:</strong> Candidate demonstrates strong technical competency across must-have skills</li>
                <li><strong>Technical interview:</strong> Consider a deeper assessment in core architecture and design topics</li>
                <li><strong>Cultural fit:</strong> Schedule a behavioral interview to assess team alignment</li>
                <li><strong>Areas to explore:</strong> Skills showing medium-level proficiency can benefit from additional validation</li>
              </>
            ) : (
              <>
                <li><strong>Do not proceed:</strong> Candidate did not meet the minimum requirements for must-have skills</li>
                <li><strong>Skills gap identified:</strong> Significant development needed in core technical areas</li>
                <li><strong>Alternative path:</strong> Consider for junior positions or recommend additional training</li>
              </>
            )}
          </ul>
        </div>
      </div>

      {/* 9. Methodology + confidentiality */}
      <div className="rounded-2xl bg-brand-blue/5 border border-brand-blue/15 px-5 py-4 flex items-start gap-3" style={{ pageBreakInside: 'avoid' }}>
        <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-gray-600 dark:text-slate-400 space-y-1.5">
          <p>
            <strong className="text-brand-blue">Evaluation Methodology:</strong> This report was generated using AI-powered automated assessment.
            Must-Have Section Score = Average of Must-Have question scores (Pass threshold ≥ {MHS_THRESHOLD.toFixed(1)}).
            Nice-to-Have Section Score = Average of Nice-to-Have question scores (informational only).
            Question Score = Σ(Skill Score × Priority Weight) / ΣWeights where P1=10, P2=7, P3=4.
          </p>
          <p>
            <strong className="text-brand-blue">Confidentiality Notice:</strong> This evaluation report contains proprietary and confidential
            information intended solely for authorized personnel in the hiring decision process. Evaluation ID #{evalId} · Generated {reportGenerated}.
          </p>
        </div>
      </div>
    </div>
  );
}
