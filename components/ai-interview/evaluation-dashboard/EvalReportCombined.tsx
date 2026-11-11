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
  CheckCircle, XCircle, Play, Sparkles, Target, Info, Star,
  Layers, ListChecks, ClipboardList, FileText, AlertTriangle, Lightbulb, Scale, ClipboardCheck,
} from 'lucide-react';
import type { DashboardData } from './types';
import { buildRationaleLines, orderQuestionsAsAsked, isSkillNotAssessed, isSkillEvaluated } from './types';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { labelOfViolation, recruiterSeverity, summarizeViolations, type ViolationRecord } from '../violationTaxonomy';
import { formatISTDate, formatISTTime, parseIST } from '@/lib/utils/dateUtils';

import { formatScore1, formatSkillScore } from '@/lib/utils/matchStatus';
import { pdfSafe } from '@/lib/utils/pdfText';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { isNonEnglishAnswer, NON_ENGLISH_ANSWER_TEXT } from './nonEnglishAnswer';

/** Session facts the PDF shows that aren't part of DashboardData. */
export interface ReportSessionDetails {
  candidateCid?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  identityVerified?: boolean;
  /** The results list's "Proctoring Risk" level (High / Medium / Low / None). */
  proctoringRisk?: string | null;
  /** data: URL of the identity photo, or null when there isn't one. */
  photoDataUrl?: string | null;
  violations?: ViolationRecord[];
  /** Absolute URL of this candidate's result page in the app. */
  resultUrl?: string | null;
}

// pdfSafe: see lib/utils/pdfText (shared with the assessment report PDF).
// Non-English answers: see ./nonEnglishAnswer (shown only in the Transcript tab).
interface Props {
  data: DashboardData;
  aiConfidence?: number | null;
  /** No longer shown in the report (the photo lives in the page header); kept so callers needn't change. */
  candidateImage?: string | null;
  evaluationId?: string | null;
  /** The AI interview session id - only used to log the PDF download for the
   *  Audit Log, since the PDF itself is built entirely client-side below. */
  sessionId?: string | null;
}

// Exported so the results-page header shows the same Pass/Fail as this report.
export const MHS_THRESHOLD = 6.0;

/** Tail of the Executive Summary's Nice-to-Have sentence — shared by the page
 *  and the PDF. It used to say "adequate" for anything under 7.5, even 0.0/10. */
function niceToHaveVerdict(score: number, anyAsked: boolean): string {
  if (!anyAsked) return 'as no Nice-to-Have question was reached before the interview ended.';
  if (score >= 7.5) return 'demonstrating strong proficiency in supplementary skills.';
  if (score >= 5) return 'demonstrating adequate proficiency in supplementary skills.';
  return 'showing limited proficiency in supplementary skills.';
}

function priorityLabel(p: 'High' | 'Medium' | 'Low'): { tag: 'P1' | 'P2' | 'P3'; weight: number } {
  if (p === 'High')   return { tag: 'P1', weight: 10 };
  if (p === 'Medium') return { tag: 'P2', weight: 7 };
  return                   { tag: 'P3', weight: 4 };
}

// Project status tokens (globals.css), not raw Tailwind hues.
/**
 * The AI's free-text verdict summary as short points: one per sentence, with
 * filler openers ("However,", "Additionally,", …) dropped and the first letter
 * re-capitalised. The wording itself is the AI's — only the structure changes.
 * Splits on sentence ends followed by a capital, so decimals ("1.5/10") and
 * percentages stay intact.
 */
function summaryToPoints(summary: string | null | undefined): string[] {
  const text = String(summary || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const FILLER = /^(however|additionally|moreover|furthermore|also|overall|in addition|in summary|in conclusion|notably|that said)\s*,?\s+/i;
  return text
    .split(/(?<=[.!?])\s+(?=["'(]?[A-Z])/)
    .map(sentence => sentence.trim().replace(FILLER, ''))
    .filter(Boolean)
    .map(sentence => sentence.charAt(0).toUpperCase() + sentence.slice(1));
}

// "Not assessed" / "evaluated" — the shared rules in types.ts, so this
// report, its PDF, Skill Breakdown and Overview all agree.
const isNotAssessed = isSkillNotAssessed;

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
  { evaluationId, sessionId, save = true, details = {} }: {
    evaluationId?: string | null; sessionId?: string | null; save?: boolean; details?: ReportSessionDetails;
  } = {},
): Promise<{ blob: Blob | null; fileName: string }> {
  const {
    candidate, interview, scores, finalResult, sectionsPresent,
    perQuestionDetails, aiSummary, strengths, weaknesses, isPartialEvaluation,
    mustHaveClusters, niceToHaveClusters, questionsAnswered, questionsAsked,
  } = data;
  // Same figures as the on-screen report's "Questions Answered" /
  // "Skills Evaluated" stat tiles.
  const allSkillsFlat = [...mustHaveClusters, ...niceToHaveClusters].flatMap((c) => c.skills);
  // Every skill a question covered — including one scored 0 — is evaluated.
  const skillsEvaluated = allSkillsFlat.filter(isSkillEvaluated).length;
  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = (finalResult ?? (isPassed ? 'Pass' : 'Fail')).toUpperCase();
  const confidence = Math.round(scores.mustHave * 10);
  const reportGenerated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  // Only a real backend id is shown. The old fallback ("EV-" + the
  // interview date's digits) gave every report from the same day the same
  // number, so with no real id the report simply carries none.
  const evalId = evaluationId || null;

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
  // Same bands as the on-screen report: green 8+, amber from the 6.0 pass
  // line, red below it — so a bar never looks better than its status label.
  const scoreRGB = (s: number): RGB => (s >= 8 ? green : s >= MHS_THRESHOLD ? amber : red);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const txt = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  // Bottom limit leaves room for the per-page footer (page X of Y).
  const ensure = (h: number) => { if (y + h > pageH - M - 4) { doc.addPage(); y = M; } };
  const splitSafe = (value: string, width: number) => doc.splitTextToSize(pdfSafe(value), width) as string[];
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
    const raw = doc.splitTextToSize(pdfSafe(value || ''), width);
    const lines = (Array.isArray(raw) ? raw : [raw]).map((line) => String(line));
    return lines.length > 0 ? lines : [''];
  };

  // Header — identity photo (when on file), title, candidate line, and the
  // interview facts row. "Generated" is when this PDF was built; the
  // interview's own date is labelled separately so the two aren't confused.
  const photoSize = 20;
  let textX = M;
  if (details.photoDataUrl) {
    try {
      const fmt = details.photoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(details.photoDataUrl, fmt, M, y, photoSize, photoSize);
      stroke(line); doc.roundedRect(M, y, photoSize, photoSize, 1.2, 1.2, 'S');
      textX = M + photoSize + 4;
    } catch { /* unsupported image — header without photo */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); txt(ink);
  doc.text('AI Interview Evaluation Report', textX, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); txt(sub);
  doc.text(pdfSafe(`${candidate.name}  ·  ${candidate.role}`), textX, y + 9.5);
  // "Duration" exactly as the result page header and the results list show
  // it: started → completed, as "5m 5s".
  const attendedDuration = (() => {
    if (!details.startedAt || !details.completedAt) return null;
    const secs = Math.floor((parseIST(details.completedAt).getTime() - parseIST(details.startedAt).getTime()) / 1000);
    if (!Number.isFinite(secs) || secs <= 0) return null;
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60;
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m${sec ? ` ${sec}s` : ''}` : `${sec}s`;
  })();
  const interviewedAt = details.completedAt
    ? `${formatISTDate(details.completedAt)}, ${formatISTTime(details.completedAt)}`
    : interview.date;
  const factParts = [
    details.candidateCid,
    candidate.email,
    interview.mode ? `${interview.mode} Mode` : null,
    interviewedAt ? `Interviewed: ${interviewedAt}` : null,
    interview.duration && interview.duration !== '0s' ? `Time taken: ${interview.duration}` : null,
    attendedDuration ? `Duration: ${attendedDuration}` : null,
  ].filter(Boolean) as string[];
  doc.setFontSize(7.5); txt(sub);
  const factLines = splitSafe(factParts.join('   |   '), pageW - M - textX - 45);
  doc.text(factLines, textX, y + 14);
  doc.setFontSize(7.5); txt(faint);
  let ry = y + 2;
  if (evalId) { doc.text(`Report #${evalId}`, pageW - M, ry, { align: 'right' }); ry += 4; }
  doc.text(`Generated: ${reportGenerated}`, pageW - M, ry, { align: 'right' });
  const headerH = Math.max(details.photoDataUrl && textX > M ? photoSize : 0, 14 + factLines.length * 3.4);
  y += headerH + 1; stroke(indigo); doc.setLineWidth(0.7); doc.line(M, y, pageW - M, y); doc.setLineWidth(0.2); y += 5;

  // Final result + Match Score
  fill(isPartialEvaluation ? [255, 251, 235] : (pass ? [236, 253, 245] : [254, 242, 242])); stroke(verdict); doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 24, 2, 2, 'FD'); doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); txt(verdict);
  doc.text(isPartialEvaluation ? 'Partial Evaluation' : `Final Result: ${finalResultLabel}`, M + 4, y + 7.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); txt(ink);
  doc.text(
    isPartialEvaluation
      ? 'This interview ended before completion. The AI evaluated only the attended questions.'
      : `${pass ? 'Recommended to Hire' : 'Does Not Meet Requirements'} · Must-Have ${formatScore1(scores.mustHave)} / Threshold ${MHS_THRESHOLD.toFixed(1)}`,
    M + 4,
    y + 13.5,
  );
  if (!isPartialEvaluation) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); txt(verdict);
    doc.text(`${confidence}%`, pageW - M - 4, y + 8, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); txt(sub);
    doc.text('Match Score (Must-Have)', pageW - M - 4, y + 13, { align: 'right' });
  }
  // Participation line — the on-screen stat tiles (Questions Answered /
  // Skills Evaluated), as label: value pairs under the verdict.
  {
    let sx = M + 4;
    const stat = (label: string, value: string) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(sub);
      doc.text(label, sx, y + 19.5); sx += doc.getTextWidth(label) + 1.2;
      doc.setFont('helvetica', 'bold'); txt(ink);
      doc.text(value, sx, y + 19.5); sx += doc.getTextWidth(value) + 8;
    };
    stat('Questions Answered:', `${questionsAnswered} / ${questionsAsked}`);
    stat('Skills Evaluated:', `${skillsEvaluated} / ${allSkillsFlat.length}`);
  }
  y += 29;
  // (The separate "Must-Have Section: x/10" box that sat here repeated the
  // section bars' own scores, so it was removed.)

  // ── Per-section question + skill breakdown ────────────────────────
  // Each question's number in the whole interview, in the order asked — the
  // on-screen report's and Question Analysis's Q1..N. The sections below keep
  // their grouping and print it beside the section's own number.
  const askedNumber = new Map(orderQuestionsAsAsked(perQuestionDetails).map((q, i) => [q, i + 1]));
  const drawSection = (key: 'mth' | 'nth' | 'hr', title: string, scoreVal: number, scored: boolean, badge: string, badgeColor: RGB) => {
    const qs = perQuestionDetails.filter(q => q.section === key);
    if (qs.length === 0) return;
    ensure(16);
    fill(indigo); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(white);
    doc.text(title, M + 3, y + 6);
    doc.setFontSize(9);
    doc.text(scored ? `Section Score: ${formatScore1(scoreVal)}/10 · ${badge}` : 'For Reference', pageW - M - 3, y + 6, { align: 'right' });
    y += 12;

    qs.forEach((q) => {
      const rt = (q.responseType || '').toLowerCase();
      const src = (q.skipSource || '').toLowerCase();
      // Candidate's answer — recruiters need the actual response to validate
      // the score, not just the question/skills/rationale. Derive a clear
      // placeholder for the no-answer cases so a blank never reads as "the
      // candidate said nothing scorable" when they were simply never asked.
      const _rawAns = String(q.answer || '').trim();
      const _rt = rt;
      const _src = src;
      const _hasAnswer = !!_rawAns && _rawAns.toUpperCase() !== '[SKIPPED]' && _rawAns.toUpperCase() !== '[NOT ASKED]';
      // Non-English answers can't be drawn in Helvetica (they print as
      // garbage), so they're named rather than reproduced.
      const _nonEnglish = _hasAnswer && isNonEnglishAnswer(_rawAns);

      let status: { label: string; color: RGB; isScore: boolean };
      if (key === 'hr') status = { label: 'For Reference', color: faint, isScore: false };
      else if (q.notDelivered) status = { label: 'Not Delivered · 0.0/10', color: scoreRGB(0), isScore: false };
      else if (rt === 'skipped' || src === 'candidate') status = { label: 'Skipped', color: sub, isScore: false };
      else if (_nonEnglish) status = { label: 'Not Scored (non-English)', color: faint, isScore: false };
      else if (['not_answered', 'idk', 'timeout', 'low_coverage'].includes(rt)) {
        // An answer that exists but couldn't be scored isn't "not answered".
        status = { label: _hasAnswer && rt !== 'idk' ? 'No Usable Answer' : 'Not Answered', color: faint, isScore: false };
      }
      else status = { label: `${formatScore1(q.questionScore)}/10`, color: scoreRGB(q.questionScore), isScore: true };

      const qSkills = key === 'hr' ? [] : q.skills;
      const qText = splitLines(q.question || `Question ${q.qNum}`, CW - 28, 8.5);
      let answerDisplay: string;
      if (q.notDelivered) {
        answerDisplay = 'Not asked — the interview ended before this question was reached.';
      } else if (_nonEnglish) {
        answerDisplay = NON_ENGLISH_ANSWER_TEXT;
      } else if (!_hasAnswer) {
        answerDisplay = _src === 'candidate'
          ? 'Skipped — candidate moved to the next question.'
          : _rt === 'idk'
            ? 'Candidate answered "I don\'t know".'
            : 'No response — no answer was given.';
      } else {
        answerDisplay = _rawAns;
      }
      // Label on its own line, the answer full-width below it (as on screen).
      const ansLines = splitLines(answerDisplay, CW - 2, 8);
      const answerBlockH = 4.5 + (ansLines.length + 1) * ANSWER_LINE_H;
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
      const overallLabel = `Question ${askedNumber.get(q) ?? q.qNum}`;
      doc.text(overallLabel, M, cursorY + 3);
      const overallW = doc.getTextWidth(overallLabel);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(sub);
      doc.text(` · ${key === 'mth' ? 'Must-Have' : key === 'nth' ? 'Nice-to-Have' : 'HR'} Q${q.qNum}`, M + overallW, cursorY + 3);
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
      doc.text("Candidate's Answer", M, _ansTop + 2.5);
      const _ansIsPlaceholder = q.notDelivered || !_hasAnswer || _nonEnglish;
      doc.setFont('helvetica', _ansIsPlaceholder ? 'italic' : 'normal');
      doc.setFontSize(8); txt(_ansIsPlaceholder ? faint : ink);
      ansLines.forEach((lineText, idx) => {
        doc.text(lineText, M, _ansTop + 2.5 + (idx + 1) * ANSWER_LINE_H);
      });
      cursorY += answerBlockH;

      skillRows.forEach(({ skill, lines, rowHeight }) => {
        const rowTop = cursorY;
        // Priority tag P1/P2/P3 (High/Medium/Low → weights 10/7/4) — was missing.
        const pLabel = !skill.priority ? '—' : skill.priority === 'High' ? 'P1' : skill.priority === 'Medium' ? 'P2' : 'P3';
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
          doc.text(`${formatSkillScore(skill.score)}/10`, pageW - M, rowTop + 2.5, { align: 'right' });
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
  // Section header bar — same style as the AI Analysis bar below.
  const sectionBar = (title: string, color: RGB) => {
    ensure(20);
    fill(color); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(white);
    doc.text(title, M + 3, y + 6); y += 13;
  };
  // Page order — a one-page scorecard first (verdict, integrity status,
  // executive summary, AI analysis, skills, recommendations, AI notice),
  // then the "Detailed Evidence" appendix on a new page (integrity detail,
  // question-by-question, scoring note). The scorecard stands on its own
  // for a hiring manager who only reads the first page.

  // ── Integrity data ────────────────────────────────────────────────
  // The same violations the result page's Violations tab and malpractice
  // banners read (session.proctoring_violations).
  const violations = details.violations ?? [];
  const vs = summarizeViolations(violations);
  const timeOf = (ts?: string) => (ts ? formatISTTime(ts) : '');
  const times = (n: number) => `${n} time${n !== 1 ? 's' : ''}`;
  // Each flag the result page raises as a banner: long form for the
  // appendix callouts, short form for the page-1 status line.
  const integrityFlags: { long: string; short: string }[] = [];
  const voiceHits = violations.filter((v) => ['multiple_voices', 'voice_identity_changed', 'voice_mismatch'].includes(v.event_type));
  if (voiceHits.length > 0) {
    const at = timeOf(voiceHits[0].timestamp);
    integrityFlags.push({
      long: `Multiple speakers detected — possible malpractice. A voice other than the enrolled candidate was heard ${times(voiceHits.length)}${at ? `, first at ${at}` : ''}. The affected answers are marked and not scored.`,
      short: `Multiple speakers (${voiceHits.length}x${at ? `, first at ${at}` : ''})`,
    });
  }
  const faceHits = violations.filter((v) => ['multiple_faces', 'face_identity_changed', 'face_mismatch'].includes(v.event_type));
  if (faceHits.length > 0) {
    integrityFlags.push({
      long: `Another person or a different face was seen on camera (${times(faceHits.length)}).`,
      short: `Another person on camera (${faceHits.length}x)`,
    });
  }
  if (violations.some((v) => v.event_type === 'face_verification_unavailable')) {
    integrityFlags.push({
      long: 'Face identity verification did not run in this interview, so a change of person on camera could not be detected. Review the recording.',
      short: 'Face identity check not run',
    });
  }
  if (vs.phoneSeen) integrityFlags.push({ long: 'A mobile phone was detected on camera.', short: 'Phone on camera' });
  if (vs.terminated) integrityFlags.push({ long: 'The interview was ended automatically by proctoring.', short: 'Ended by proctoring' });
  if (vs.repeatDeviceDisconnects) {
    integrityFlags.push({
      long: `The camera or microphone was disconnected ${vs.deviceDisconnects} times.`,
      short: `Device disconnected ${vs.deviceDisconnects}x`,
    });
  }
  // Per-issue rows (advisory timeline markers excluded, as on the Violations tab).
  const issueMap = new Map<string, { label: string; sev: string; count: number; first?: string }>();
  violations.forEach((v) => {
    const sev = recruiterSeverity(v);
    if (sev === 'advisory') return;
    const raw = labelOfViolation(v);
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    const row = issueMap.get(label) ?? { label, sev, count: 0, first: v.timestamp };
    row.count += 1;
    if (v.timestamp && (!row.first || v.timestamp < row.first)) row.first = v.timestamp;
    issueMap.set(label, row);
  });
  const sevRank: Record<string, number> = { serious: 0, moderate: 1, minor: 2 };
  const issueRows = [...issueMap.values()].sort((a, b) => (sevRank[a.sev] - sevRank[b.sev]) || (b.count - a.count));
  // The level is the results list's "Proctoring Risk" value (the stored
  // risk_level), so the PDF never says High where the list says Medium.
  // Only when it isn't passed in do we fall back to the violation counts.
  const riskLabel = details.proctoringRisk
    || (vs.someoneElse || vs.terminated || vs.phoneSeen || vs.serious > 0 ? 'High'
      : vs.counted > 0 ? 'Medium'
        : 'None');
  const integrityLevel: 'high' | 'review' | 'clear' =
    riskLabel === 'High' ? 'high' : riskLabel === 'None' ? 'clear' : 'review';
  const hasIntegrityDetail = integrityFlags.length > 0 || issueRows.length > 0;

  // ── Integrity status (page 1, every report) ───────────────────────
  // Always in the same place, so a reader learns where to look — and
  // "No issues" is information too.
  {
    const tone = integrityLevel === 'high'
      ? { label: riskLabel, color: red, bg: [254, 242, 242] as RGB }
      : integrityLevel === 'review'
        ? { label: riskLabel, color: amber, bg: amberBg }
        : { label: riskLabel, color: green, bg: [236, 253, 245] as RGB };
    const countLabel = vs.counted === 0
      ? 'no violations recorded'
      : `${vs.counted} violation${vs.counted !== 1 ? 's' : ''} (${vs.serious} serious, ${vs.moderate} moderate, ${vs.minor} minor)`;
    const flagText = integrityFlags.length > 0
      ? `Flags: ${integrityFlags.map((f) => f.short).join('  ·  ')}. Details in the Detailed Evidence section.`
      : hasIntegrityDetail ? 'Details in the Detailed Evidence section.' : '';
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const flagLines = flagText ? splitSafe(flagText, CW - 10) : [];
    const boxH = 9 + flagLines.length * 3.8;
    ensure(boxH + 4);
    fill(tone.bg); stroke(tone.color); doc.setLineWidth(0.35); doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'FD'); doc.setLineWidth(0.2);
    fill(tone.color); doc.roundedRect(M, y, 1.6, boxH, 0.8, 0.8, 'F');
    let ix = M + 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(ink);
    doc.text('Proctoring Risk:', ix, y + 5.6); ix += doc.getTextWidth('Proctoring Risk: ');
    txt(tone.color); doc.text(tone.label, ix, y + 5.6); ix += doc.getTextWidth(tone.label) + 6;
    doc.setFontSize(8); txt(sub); doc.setFont('helvetica', 'normal');
    doc.text('ID verification:', ix, y + 5.6); ix += doc.getTextWidth('ID verification: ');
    const idLabel = details.identityVerified ? 'Verified' : 'Not verified';
    doc.setFont('helvetica', 'bold'); txt(details.identityVerified ? green : red);
    doc.text(idLabel, ix, y + 5.6); ix += doc.getTextWidth(idLabel) + 6;
    doc.setFont('helvetica', 'normal'); txt(sub);
    doc.text(`Proctoring: ${countLabel}`, ix, y + 5.6);
    if (flagLines.length > 0) {
      txt(integrityLevel === 'high' ? [185, 28, 28] : ink);
      doc.text(flagLines, M + 5, y + 10);
    }
    y += boxH + 5;
  }

  // Executive Summary — the same three paragraphs as the on-screen report.
  const pdfQuestions = perQuestionDetails.length;
  const pdfHrQuestions = perQuestionDetails.filter((q) => q.section === 'hr').length;
  const pdfSkills = [...mustHaveClusters, ...niceToHaveClusters].reduce((n, c) => n + c.skills.length, 0);
  // "14 questions" read as 14 scored ones; say how many of them are HR.
  const questionBreakdown = pdfHrQuestions > 0 && pdfHrQuestions < pdfQuestions
    ? ` (${pdfQuestions - pdfHrQuestions} scored, ${pdfHrQuestions} HR not scored)`
    : '';
  // The original summary sentences, one per point with a drawn tick —
  // matching the on-screen Executive Summary (helvetica has no ✓ glyph).
  const nhVerdict = niceToHaveVerdict(scores.niceToHave, niceToHaveClusters.some((c) => c.skills.some((sk) => sk.asked)));
  const execPoints: string[] = [
    `${candidate.name} completed an AI-powered technical interview for the ${candidate.role} position on ${interview.date || 'the scheduled date'}.`,
    `The evaluation consisted of ${pdfQuestions} question${pdfQuestions !== 1 ? 's' : ''}${questionBreakdown} covering ${pdfSkills} skill${pdfSkills !== 1 ? 's' : ''} across multiple priority levels.`,
  ];
  if (sectionsPresent.mustHave) {
    execPoints.push(`The candidate achieved a Must-Have Section Score of ${formatScore1(scores.mustHave)}/10, ` + (isPartialEvaluation
      ? 'based only on the questions the candidate attended before the interview ended.'
      : pass
        ? `which exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${formatScore1((scores.mustHave - MHS_THRESHOLD))} points.`
        : `which falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${formatScore1((MHS_THRESHOLD - scores.mustHave))} points.`));
    if (sectionsPresent.niceToHave) {
      execPoints.push(`The Nice-to-Have Section Score was ${formatScore1(scores.niceToHave)}/10, ${nhVerdict}`);
    }
  }
  execPoints.push(isPartialEvaluation
    ? 'Because the interview was terminated early, this report provides question-by-question and skill-by-skill analysis only; it does not generate a final hiring recommendation or match score.'
    : `Based on this evaluation, the assessment recommends ${pass ? 'proceeding with the hiring process' : 'not proceeding with the current application'} with a match score of ${confidence}%.`);
  sectionBar('EXECUTIVE SUMMARY', indigo);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const tickIndent = 6;
  execPoints.forEach((text) => {
    const lines = splitSafe(text, CW - tickIndent);
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
        `The Must-Have score of ${formatScore1(scores.mustHave)}/10 and the Nice-to-Have score of ${formatScore1(scores.niceToHave)}/10 summarize only the attended questions.`,
        'HR is not scored, and no final pass/fail or match score is generated for this report.',
      ]
    : [
        `${candidate.name} ${pass ? 'meets' : 'does not meet'} the Must-Have bar — ${formatScore1(scores.mustHave)}/10 vs the ${MHS_THRESHOLD.toFixed(1)} threshold (${pass ? '+' : '-'}${formatScore1(Math.abs(scores.mustHave - MHS_THRESHOLD))}).`,
        // Nice-to-Have is only mentioned when the interview actually had that section.
        sectionsPresent.niceToHave
          ? `This drives the ${finalResultLabel} decision; Nice-to-Have (${formatScore1(scores.niceToHave)}/10) is informational and HR is not scored.`
          : `This drives the ${finalResultLabel} decision; HR questions are not scored.`,
      ];
  verdictPoints.push(...summaryToPoints(aiSummary));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const pointLines = verdictPoints.map((pt) => splitSafe(pt, CW - 14));
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
    const safeItems = items.length > 0 ? items.slice(0, 5) : ['None identified.'];
    safeItems.forEach((item) => {
      const lines = splitSafe(`• ${item}`, width - 8);
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
    const safeItems = items.length > 0 ? items.slice(0, 5) : ['None identified.'];
    safeItems.forEach((item) => {
      const lines = splitSafe(`• ${item}`, width - 8);
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
  // ── Skills Assessment Summary ─────────────────────────────────────
  // Every skill in one table — the on-screen report's Skills Assessment
  // Summary (same flattening and Demonstrated/Weak/Not demonstrated status),
  // so strengths and gaps read without the question-by-question pages.
  // Columns: Skill · Score · Status (Cluster, Type and Weight are not shown).
  {
    const flatten = (clusters: typeof mustHaveClusters) => clusters.flatMap((c) =>
      c.skills.map((s) => ({ name: s.name, score: s.score, asked: s.asked, askedKnown: s.askedKnown })));
    const groups = [
      { title: 'Must-Have Skills', rows: sectionsPresent.mustHave ? flatten(mustHaveClusters) : [] },
      { title: 'Nice-to-Have Skills', rows: sectionsPresent.niceToHave ? flatten(niceToHaveClusters) : [] },
    ].filter((g) => g.rows.length > 0);

    if (groups.length > 0) {
      sectionBar('SKILLS ASSESSMENT SUMMARY', indigo);
      const cSkill = M + 2;
      const cBar = M + 128, barW = 22, cScore = M + 160, cStatus = M + 163;
      const head = () => {
        fill(bgc); doc.rect(M, y, CW, 6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(sub);
        doc.text('Skill', cSkill, y + 4);
        doc.text('Score', cBar, y + 4); doc.text('Status', cStatus, y + 4);
        y += 7;
      };
      groups.forEach((g) => {
        ensure(20);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); txt(ink);
        doc.text(`${g.title} (${g.rows.length} skill${g.rows.length !== 1 ? 's' : ''})`, M, y + 3);
        y += 5;
        head();
        g.rows.forEach((r) => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
          const nameLines = splitSafe(r.name, cBar - cSkill - 4);
          const h = nameLines.length * 3.6 + 1.6;
          if (y + h > pageH - M - 4) { doc.addPage(); y = M; head(); }
          txt(ink); doc.text(nameLines, cSkill, y + 3);
          const rowNotAssessed = isNotAssessed(r);
          bar(cBar, y + 1.3, barW, rowNotAssessed ? 0 : r.score, rowNotAssessed ? faint : scoreRGB(r.score));
          doc.setFont('helvetica', 'bold'); txt(rowNotAssessed ? faint : scoreRGB(r.score));
          doc.text(rowNotAssessed ? '—' : formatSkillScore(r.score), cScore, y + 3, { align: 'right' });
          const status = rowNotAssessed
            ? { label: 'Not assessed', color: faint }
            : r.score >= MHS_THRESHOLD
              ? { label: 'Demonstrated', color: green }
              : r.score > 0 ? { label: 'Weak', color: amber } : { label: 'Not demonstrated', color: faint };
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(status.color);
          doc.text(status.label, cStatus, y + 3);
          y += h;
          stroke(line); doc.setLineWidth(0.1); doc.line(M, y - 0.4, M + CW, y - 0.4); doc.setLineWidth(0.2);
        });
        y += 4;
      });
    }
  }
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
        // Was "Consider for junior positions" — contradicted reports whose role
        // is already entry level.
        ['Re-assess later:', 'Consider a fresh interview only once the candidate has gained hands-on experience in the must-have skills'],
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
  // ── AI-assisted evaluation notice + link back to the full interview ──
  // Hiring compliance expects AI-generated assessments to say so and to
  // leave the decision with a person; the link takes the reader to the
  // recording and transcript this PDF can only summarise.
  {
    const notice = 'AI-assisted evaluation. This report was produced by an AI interviewer to support, not replace, human judgement. The final hiring decision must be made by an authorized reviewer after checking the interview recording and transcript.';
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    const noticeLines = splitSafe(notice, CW - 8);
    const boxH = noticeLines.length * 3.6 + (details.resultUrl ? 9 : 5);
    ensure(boxH + 2);
    fill(bgc); stroke(line); doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'FD');
    txt(sub); doc.text(noticeLines, M + 4, y + 4.5);
    if (details.resultUrl) {
      const ly = y + 4.5 + noticeLines.length * 3.6 + 0.6;
      doc.setFont('helvetica', 'bold'); txt(indigo);
      doc.textWithLink('View the full interview in TalentFlow (recording, transcript, violations)', M + 4, ly, { url: details.resultUrl });
    }
    y += boxH + 4;
  }

  // ═════ Detailed Evidence — appendix, always from a fresh page ═════
  doc.addPage(); y = M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); txt(ink);
  doc.text('Detailed Evidence', M, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(sub);
  doc.text(pdfSafe(`${candidate.name}  ·  ${candidate.role}`), M, y + 9);
  y += 12; stroke(indigo); doc.setLineWidth(0.5); doc.line(M, y, pageW - M, y); doc.setLineWidth(0.2); y += 5;

  // Integrity detail — callouts + per-issue table. Skipped when there's
  // nothing to detail (the page-1 status already says "No Issues").
  if (hasIntegrityDetail) {
    sectionBar('INTEGRITY & PROCTORING', integrityLevel === 'high' ? red : indigo);
    integrityFlags.forEach(({ long }) => {
      const lines = splitSafe(long, CW - 8);
      const h = lines.length * 4 + 4;
      ensure(h + 2);
      fill([254, 242, 242]); stroke(red); doc.roundedRect(M, y, CW, h, 1.2, 1.2, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt([185, 28, 28]);
      doc.text(lines, M + 4, y + 4.6);
      y += h + 2;
    });
    if (issueRows.length > 0) {
      const colSev = M + CW - 62, colCount = M + CW - 30, colFirst = M + CW;
      const head = () => {
        fill(bgc); doc.rect(M, y, CW, 6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(sub);
        doc.text('Issue', M + 2, y + 4); doc.text('Severity', colSev, y + 4);
        doc.text('Count', colCount, y + 4, { align: 'right' }); doc.text('First seen', colFirst - 2, y + 4, { align: 'right' });
        y += 7;
      };
      ensure(14); head();
      issueRows.forEach((r) => {
        const lines = splitSafe(r.label, colSev - M - 6);
        const h = lines.length * 3.8 + 1.5;
        if (y + h > pageH - M - 4) { doc.addPage(); y = M; head(); }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(ink);
        doc.text(lines, M + 2, y + 3);
        const sevColor: RGB = r.sev === 'serious' ? red : r.sev === 'moderate' ? amber : sub;
        doc.setFont('helvetica', 'bold'); txt(sevColor);
        doc.text(r.sev.charAt(0).toUpperCase() + r.sev.slice(1), colSev, y + 3);
        doc.setFont('helvetica', 'normal'); txt(ink);
        doc.text(String(r.count), colCount, y + 3, { align: 'right' });
        txt(sub); doc.text(timeOf(r.first) || '—', colFirst - 2, y + 3, { align: 'right' });
        y += h;
        stroke(line); doc.setLineWidth(0.1); doc.line(M, y - 0.5, M + CW, y - 0.5); doc.setLineWidth(0.2);
      });
    }
    y += 5;
  }

  // ── Question-by-question detail ───────────────────────────────────
  drawSection('mth', 'MUST-HAVE SECTION', scores.mustHave, true, isPartialEvaluation ? 'Partial' : (pass ? 'PASS' : 'FAIL'), verdict);
  drawSection('nth', 'NICE-TO-HAVE SECTION', scores.niceToHave, true, 'Informational only', indigo);
  drawSection('hr', 'HR SECTION', 0, false, '', faint);

  // Scoring note (confidentiality now sits in every page's footer).
  ensure(14);
  fill([238, 242, 255]); doc.roundedRect(M, y, CW, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); txt(indigoDk);
  const nthNote = sectionsPresent.niceToHave ? ' Nice-to-Have is informational;' : '';
  const foot = isPartialEvaluation
    ? `Scoring: This terminated interview report evaluates only the attended questions. No final result or match score is generated.${nthNote} HR is not scored. Question Score = Sum(Skill x Weight) / Sum(Weights), where P1=10, P2=7, P3=4. All scores are 0-10.`
    : `Scoring: Must-Have Section Score (Pass >= ${MHS_THRESHOLD.toFixed(1)}) drives the final result;${nthNote} HR is not scored. Question Score = Sum(Skill x Weight) / Sum(Weights), where P1=10, P2=7, P3=4. All scores are 0-10.`;
  doc.text(doc.splitTextToSize(foot, CW - 6), M + 3, y + 4);

  // Footer on every page: who/which report, confidentiality, page X of Y.
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    stroke(line); doc.setLineWidth(0.2); doc.line(M, pageH - 9, pageW - M, pageH - 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); txt(faint);
    doc.text(pdfSafe(`${candidate.name}${evalId ? `  ·  Report #${evalId}` : ''}  ·  AI-assisted evaluation  ·  Confidential — for authorized hiring personnel only`), M, pageH - 5.5);
    doc.text(`Page ${p} of ${pageCount}`, pageW - M, pageH - 5.5, { align: 'right' });
  }

  // eval_report_<name>_<report id | CID>_<interview date>.pdf — unique per
  // candidate/interview even without a backend report id.
  const fileDate = details.completedAt ? new Date(details.completedAt) : null;
  const fileDateStr = fileDate && !Number.isNaN(fileDate.getTime()) ? fileDate.toISOString().slice(0, 10) : '';
  const fileName = ['eval_report', candidate.name || 'candidate', evalId || details.candidateCid, fileDateStr]
    .filter(Boolean).join('_').replace(/[\s/\:*?"<>|]+/g, '_') + '.pdf';
  if (save) doc.save(fileName);

  if (sessionId) {
    aiInterviewService.logReportDownload(sessionId, 'evaluation');
  }
  return { blob: save ? null : doc.output('blob'), fileName };
}

type CoverageStats = { total: number; covered: number; demonstrated: number; pct: number };
type FlatSkill = { name: string; score: number; tag: string; weight: number; cluster?: string; asked?: boolean; askedKnown?: boolean };

/** One Section Score row: the bar carries the pass threshold as a dashed marker. */
function SectionRow({ label, value, Icon, bar, iconTone, badge }: {
  label: string; value: number; Icon: typeof Target; bar: string; iconTone: string; badge: ReactNode;
}) {
  return (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(160px,1.2fr)_minmax(0,2fr)_64px_96px] items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-4">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconTone}`}><Icon className="w-4 h-4" /></div>
      {/* Wraps on a phone, where the label column is ~120px and truncating
          left "Must-Have…" / "Nice-to-H…"; one truncated line from sm. */}
      <div className="min-w-0 tf-row-title [overflow-wrap:anywhere] sm:truncate">{label}</div>
    </div>
    <div className="relative col-span-2 sm:col-span-1 order-last sm:order-none">
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }} />
      </div>
      <div className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-gray-400 dark:border-slate-500" style={{ left: `${MHS_THRESHOLD * 10}%` }} title={`Pass threshold ${MHS_THRESHOLD.toFixed(1)}`} />
    </div>
    <div className="hidden sm:block tf-section-title tabular-nums text-right">{formatScore1(value)}</div>
    <div className="flex items-center justify-end gap-2">
      <span className="sm:hidden tf-section-title tabular-nums">{formatScore1(value)}</span>
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
        {/* Same as SectionRow: wrap on a phone rather than truncate to "…-Have …". */}
        <div className="min-w-0 tf-row-title [overflow-wrap:anywhere] sm:truncate">{label}</div>
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
    <div className="tf-meta">
      {cov.covered} of {cov.total} skills asked · <span className="font-semibold text-gray-700 dark:text-slate-300">{cov.demonstrated} demonstrated</span> (score ≥ 5)
    </div>
  </div>
  );
}

function skillStatus(score: number, notAssessed = false): { label: string; cls: string } {
  if (notAssessed) return { label: 'Not assessed', cls: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700' };
  if (score >= MHS_THRESHOLD) return { label: 'Demonstrated', cls: 'bg-success-subtle text-success-strong ring-success-line' };
  if (score > 0) return { label: 'Weak', cls: 'bg-warning-subtle text-warning-strong ring-warning-line' };
  return { label: 'Not demonstrated', cls: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700' };
}

/** Skill table for one section of the Skills Assessment Summary. `wide` (when
 *  it's the only section and has the full card width) adds Cluster, a 0–10
 *  score bar and a Status column. */
function SkillTable({ title, rows, wide = false }: {
  title: string; rows: FlatSkill[]; wide?: boolean;
}) {
  return (
  <div className="rounded-xl border border-gray-200 dark:border-slate-600/70 overflow-hidden min-w-0">
    <div className="px-4 py-3 tf-row-title">{title}</div>
    <div className={`overflow-x-auto ${DESKTOP_TABLE_ONLY}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white dark:bg-slate-900 tf-meta">
            <th className="tf-th-cell text-left tf-th">Skill</th>
            {wide && <th className="tf-th-cell text-left tf-th hidden md:table-cell">Cluster</th>}
            <th className="tf-th-cell text-center tf-th w-16">Weight</th>
            <th className={`font-semibold px-4 py-2 text-xs text-gray-600 dark:text-slate-300 ${wide ? 'text-left w-56' : 'text-right w-16'}`}>Score</th>
            {wide && <th className="tf-th-cell text-left tf-th w-40 hidden sm:table-cell">Status</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
          {rows.map((s, i) => (
            <tr key={i}>
              <td className="tf-td text-gray-800 dark:text-slate-200">{s.name}</td>
              {wide && <td className="tf-td text-gray-500 dark:text-slate-400 hidden md:table-cell">{s.cluster || '—'}</td>}
              <td className="tf-td text-center text-gray-500 dark:text-slate-400 tabular-nums">{s.weight}</td>
              {wide ? (
                <td className="tf-td">
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${scoreColor(s.score).bar}`} style={{ width: `${isNotAssessed(s) ? 0 : Math.max(0, Math.min(100, (s.score / 10) * 100))}%` }} />
                    </div>
                    <span className={`w-8 text-right font-bold tabular-nums ${isNotAssessed(s) ? 'text-gray-400' : scoreColor(s.score).text}`}>{isNotAssessed(s) ? '—' : formatSkillScore(s.score)}</span>
                  </div>
                </td>
              ) : (
                <td className={`px-4 py-2 text-right font-bold tabular-nums ${isNotAssessed(s) ? 'text-gray-400' : scoreColor(s.score).text}`}>{isNotAssessed(s) ? '—' : formatSkillScore(s.score)}</td>
              )}
              {wide && (() => {
                const st = skillStatus(s.score, isNotAssessed(s));
                return <td className="tf-td hidden sm:table-cell"><span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${st.cls}`}>{st.label}</span></td>;
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <MobileRecordList className="px-3 pb-3">
      {rows.map((s, i) => {
        const st = skillStatus(s.score, isNotAssessed(s));
        return (
          <MobileRecordCard
            key={i}
            badges={wide ? <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${st.cls}`}>{st.label}</span> : undefined}
            title={s.name}
            footer={
              <span className={`font-bold tabular-nums ${isNotAssessed(s) ? 'text-gray-400' : scoreColor(s.score).text}`}>
                {isNotAssessed(s) ? '—' : formatSkillScore(s.score)}
              </span>
            }
            fields={[
              ...(wide ? [{ label: 'Cluster', value: s.cluster || '—' }] : []),
              { label: 'Weight', value: <span className="tabular-nums">{s.weight}</span> },
            ]}
          >
            {wide && (
              <div className="mt-2.5 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                <div className={`h-full rounded-full ${scoreColor(s.score).bar}`} style={{ width: `${isNotAssessed(s) ? 0 : Math.max(0, Math.min(100, (s.score / 10) * 100))}%` }} />
              </div>
            )}
          </MobileRecordCard>
        );
      })}
    </MobileRecordList>
  </div>
  );
}


export function EvalReportCombined({
  data,
  aiConfidence,
  evaluationId,
  sessionId,
}: Props) {
  const {
    candidate, interview, scores, finalResult, sectionsPresent,
    mustHaveClusters, niceToHaveClusters, interviewResponses, perQuestionDetails,
    aiSummary, strengths, weaknesses, isPartialEvaluation,
    questionsAnswered, questionsAsked,
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
    name: s.name, score: s.score, asked: s.asked, askedKnown: s.askedKnown, cluster: c.name, ...priorityLabel(c.priority),
  })));
  const flatNiceToHave = niceToHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name, score: s.score, asked: s.asked, askedKnown: s.askedKnown, cluster: c.name, ...priorityLabel(c.priority),
  })));
  const allSkills = [...mustHaveClusters, ...niceToHaveClusters].flatMap(c => c.skills);
  // Skills Assessment Summary: which tables show, and whether one has the row to itself.
  const showMustHaveTable = !!sectionsPresent.mustHave && flatMustHave.length > 0;
  const showNiceToHaveTable = !!sectionsPresent.niceToHave && flatNiceToHave.length > 0;
  const singleSkillTable = showMustHaveTable !== showNiceToHaveTable;
  const totalSkills = flatMustHave.length + flatNiceToHave.length;
  const totalQuestions = perQuestionDetails.length;
  const niceToHaveText = niceToHaveVerdict(scores.niceToHave, niceToHaveClusters.some(c => c.skills.some(s => s.asked)));

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
  // Key Strengths / Areas of Concern get their own cards (under AI Analysis /
  // Recommendations). Always shown — with a "none identified" note when the
  // evaluation returned an empty list (common for one side on a clear pass or
  // fail) — so the 2×2 grid never has a hole.
  const strengthItems = (strengths ?? []).slice(0, 5);
  const concernItems = (weaknesses ?? []).slice(0, 5);
  const verdictTone = isPartialEvaluation
    ? { tile: 'bg-warning-subtle/60 border-warning-line', icon: 'bg-warning text-white', text: 'text-warning-strong', pill: 'bg-warning-subtle text-warning-strong ring-warning-line' }
    : isPassed
      ? { tile: 'bg-success-subtle/60 border-success-line', icon: 'bg-success text-white', text: 'text-success', pill: 'bg-success-subtle text-success-strong ring-success-line' }
      : { tile: 'bg-destructive-subtle/60 border-destructive-line', icon: 'bg-destructive text-white', text: 'text-destructive', pill: 'bg-destructive-subtle text-destructive ring-destructive-line' };
  const card = 'rounded-2xl border border-gray-300 dark:border-slate-600/70 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5';
  const cardHeader = 'flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-slate-600/70';
  const headerIcon = 'w-9 h-9 rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 flex items-center justify-center shrink-0';
  const cardTitle = 'text-base font-semibold text-gray-900 dark:text-slate-50';

  const statTiles = [
    { label: 'Questions Answered', value: `${questionsAnswered} / ${questionsAsked}`, Icon: Play,
      icon: 'bg-brand-blue text-white' },
    { label: 'Skills Evaluated', value: `${allSkills.filter(isSkillEvaluated).length} / ${allSkills.length}`, Icon: CheckCircle,
      // Brand cyan, not green: green reads as "pass" and clashed with the
      // red Fail verdict beside it.
      icon: 'bg-brand-cyan text-white' },
  ];

  return (
    <div className="space-y-5">
      {/* 1. Verdict — result, the Must-Have vs threshold line, and the key
          stats + Match Score. (The candidate photo now lives only in the page
          header; Download Report too. The report title was removed — the tab
          already names the view.) */}
          <div className={`rounded-2xl border px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-4 ${verdictTone.tile}`} style={{ pageBreakInside: 'avoid' }}>
            <div className="min-w-0">
              {isPartialEvaluation ? (
                <>
                  <div className={`text-lg font-bold ${verdictTone.text}`}>Partial Evaluation</div>
                  <div className="tf-meta mt-1 max-w-xl">
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
                  <div className="tf-meta mt-1.5 tabular-nums">
                    Must-Have {formatScore1(scores.mustHave)} / Threshold {MHS_THRESHOLD.toFixed(1)}
                    {isPassed
                      ? ` · +${formatScore1((scores.mustHave - MHS_THRESHOLD))} above`
                      : ` · Below by ${formatScore1((MHS_THRESHOLD - scores.mustHave))}`}
                  </div>
                </>
              )}
            </div>
            {/* Key stats sit beside the Match Score, same height as its
                badge, so the row (and the photo, which follows the row
                height) doesn't grow. */}
            {/* Shrinks below sm so the tiles wrap inside the card; shrink-0
                there held the row at its one-line width and clipped the last tile. */}
            <div className="flex flex-wrap items-stretch gap-2.5 min-w-0 sm:shrink-0">
              {statTiles.map(({ label, value, Icon, icon }) => (
                <div key={label} className="flex items-center gap-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-black/5 dark:ring-white/10 px-3 py-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${icon}`}><Icon className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <div className="tf-section-title tabular-nums leading-none">{value}</div>
                    <div className="tf-micro-hint mt-1 whitespace-nowrap">{label}</div>
                  </div>
                </div>
              ))}
              {/* Match Score — same chip as the stats; the icon and number
                  take the verdict colour (green pass / red fail). */}
              {!isPartialEvaluation && (
                <div className="flex items-center gap-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 ring-1 ring-black/5 dark:ring-white/10 px-3 py-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${verdictTone.icon}`}><Target className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <div className={`text-lg font-bold tabular-nums leading-none ${verdictTone.text}`}>{confidence}%</div>
                    <div className="tf-micro-hint mt-1 whitespace-nowrap">Match Score</div>
                  </div>
                </div>
              )}
            </div>
          </div>

      {/* 3. Executive summary — first read, ahead of the score detail */}
      <div className={card} style={{ pageBreakInside: 'avoid' }}>
        <div className={cardHeader}>
          <div className={headerIcon}><FileText className="w-4 h-4" /></div>
          <div className={cardTitle}>Executive Summary</div>
        </div>
        {/* The original summary wording, one sentence per point, each with a tick. */}
        <ul className="p-4 sm:p-5 space-y-2.5 tf-body leading-relaxed">
          {[
            <>{candidate.name} completed an AI-powered technical interview for the <strong>{candidate.role}</strong> position on {interview.date || 'the scheduled date'}.</>,
            <>The evaluation consisted of <strong>{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}</strong> covering <strong>{totalSkills} skill{totalSkills !== 1 ? 's' : ''}</strong> across multiple priority levels.</>,
            ...(sectionsPresent.mustHave ? [
              <>The candidate achieved a <strong>Must-Have Section Score of {formatScore1(scores.mustHave)}/10</strong>,{' '}
                {isPartialEvaluation
                  ? 'based only on the questions the candidate attended before the interview ended.'
                  : isPassed
                    ? `which exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${formatScore1((scores.mustHave - MHS_THRESHOLD))} points.`
                    : `which falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${formatScore1((MHS_THRESHOLD - scores.mustHave))} points.`}</>,
            ] : []),
            ...(sectionsPresent.mustHave && sectionsPresent.niceToHave ? [
              <>The Nice-to-Have Section Score was <strong>{formatScore1(scores.niceToHave)}/10</strong>, {niceToHaveText}</>,
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
          <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-x-4 gap-y-1 flex-wrap tf-meta">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-blue" />Score Achieved</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-gray-400" />Required Threshold</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success" />Pass</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-orange" />Info Only</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" />Fail</span>
          </div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-slate-700">
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
              badge={<span className="tf-badge ring-1 bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20">Info Only</span>}
            />
          )}
        </div>
      </div>

      {/* 5. Cluster coverage (the Skill Assessment Radar was removed) */}
      <div className="grid grid-cols-1 gap-5" style={{ pageBreakInside: 'avoid' }}>
        <div className={card}>
          <div className={cardHeader}>
            <div className={headerIcon}><Layers className="w-4 h-4" /></div>
            <div className={cardTitle}>Cluster Coverage Overview</div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="divide-y divide-gray-200 dark:divide-slate-700">
              {sectionsPresent.mustHave && (
                <CoverageBlock label="Must-Have Section" cov={mhCov} Icon={Target}
                  tone={{ icon: 'bg-brand-blue/10 text-brand-blue', bar: 'bg-brand-blue' }} />
              )}
              {sectionsPresent.niceToHave && (
                <CoverageBlock label="Nice-to-Have Section" cov={nhCov} Icon={Star}
                  tone={{ icon: 'bg-brand-orange/10 text-brand-orange-deep', bar: 'bg-brand-orange' }} />
              )}
            </div>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-blue/5 border border-brand-blue/25 px-4 py-3 tf-meta leading-relaxed">
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
          <div className="ml-auto flex items-center gap-4 tf-meta">
            {showMustHaveTable && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-blue" />Must-Have</span>}
            {showNiceToHaveTable && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-orange" />Nice-to-Have</span>}
          </div>
        </div>
        {flatMustHave.length === 0 && flatNiceToHave.length === 0 ? (
          <div className="p-6 tf-body-muted italic text-center">No skills evaluated yet.</div>
        ) : (
          // Two side-by-side tables when both sections exist; a single
          // full-width table (with Cluster / score bar / Status) otherwise.
          <div className={`p-4 sm:p-5 grid grid-cols-1 gap-4 items-start ${singleSkillTable ? '' : 'xl:grid-cols-2'}`}>
            {showMustHaveTable && (
              <SkillTable
                title={`Must-Have Skills (${flatMustHave.length} skill${flatMustHave.length !== 1 ? 's' : ''} evaluated)`}
                wide={singleSkillTable}
                rows={flatMustHave}
              />
            )}
            {showNiceToHaveTable && (
              <SkillTable
                title={`Nice-to-Have Skills (${flatNiceToHave.length} skill${flatNiceToHave.length !== 1 ? 's' : ''} evaluated)`}
                wide={singleSkillTable}
                rows={flatNiceToHave}
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
          <div className="divide-y divide-gray-200 dark:divide-slate-700">
            {/* Same order and 1..N numbering as the Question Analysis tab;
                the chip keeps the section's own number (e.g. "Must-Have · Q1"). */}
            {orderQuestionsAsAsked(perQuestionDetails).map((q, i) => {
              const isHR = q.section === 'hr';
              const sc = scoreColor(q.questionScore);
              const sectionLabel = q.section === 'mth' ? 'Must-Have' : q.section === 'nth' ? 'Nice-to-Have' : 'HR';
              const sectionClass = q.section === 'mth'
                ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/20'
                : q.section === 'nth' ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20' : 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20';
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
              const ansNonEnglish = !q.notDelivered && isNonEnglishAnswer(rawAns);
              const ansIsPlaceholder = q.notDelivered || !rawAns || ansNonEnglish
                || rawAns.toUpperCase() === '[SKIPPED]' || rawAns.toUpperCase() === '[NOT ASKED]';
              const answerText = q.notDelivered
                ? 'Not asked — the interview ended before this question was reached.'
                : ansNonEnglish
                  ? NON_ENGLISH_ANSWER_TEXT
                : ansIsPlaceholder
                  ? (srcL === 'candidate'
                      ? 'Skipped — candidate moved to the next question.'
                      : rtL === 'idk'
                        ? 'Candidate answered "I don\'t know".'
                        : 'No response — no answer was given.')
                  : rawAns;
              return (
                <div key={i} className="px-4 sm:px-5 py-4 space-y-2" style={{ pageBreakInside: 'avoid' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Same pill + section tag as Question Analysis (All view). */}
                    <span className="tf-badge text-white bg-brand-blue">Question {i + 1}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sectionClass}`}>{sectionLabel} · Q{q.qNum}</span>
                    {skillsText && <span className="tf-meta truncate min-w-0 flex-1">{skillsText}</span>}
                    <span className="ml-auto text-right">
                      {isHR
                        ? <span className="tf-caption italic">Review only</span>
                        : <>
                            <span className={`text-base font-bold tabular-nums ${sc.text}`}>{formatScore1(q.questionScore)}</span>
                            {q.notDelivered && <span className="block text-2xs font-semibold text-gray-400 uppercase tracking-wide">Not Delivered</span>}
                          </>}
                    </span>
                  </div>
                  {/* Actual interview question text — recruiters need to see
                      WHAT was asked, not just the mapped skills. */}
                  {/* Formatted as in Question Analysis: bold text, no "Q:" prefix,
                      ending in a question mark. */}
                  {q.question && q.question.trim() && (
                    <div className="tf-row-title leading-relaxed">
                      {/[?!.]$/.test(q.question.trim()) ? q.question.trim() : `${q.question.trim()}?`}
                    </div>
                  )}
                  {/* Candidate's answer — the actual response the score is based on.
                      Labelled block, as in Question Analysis. */}
                  <div className="border-l-2 border-brand-blue/20 pl-3">
                    <div className="tf-caption mb-1">Candidate&apos;s Answer</div>
                    <div className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${ansIsPlaceholder ? 'text-gray-400 italic' : 'text-gray-700 dark:text-slate-300'}`}>
                      {answerText}
                    </div>
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
            <div className="text-sm">The candidate exited the interview without answering any questions, so question-level details are not shown here.</div>
          </div>
        )}
      </div>

      {/* 8. Three titled sections, each sized to its own content:
            Hiring Verdict             — AI Analysis (why pass / fail)
            Strengths & Concerns       — Key Strengths | Areas of Concern
            Recommendations & Next Steps
          Colour lives in each part's title + icons; bodies are white. */}
      <div className={card} style={{ pageBreakInside: 'avoid' }}>
        <div className={cardHeader}>
          <div className={headerIcon}><Scale className="w-4 h-4" /></div>
          <div className={cardTitle}>Hiring Verdict</div>
        </div>
        {/* AI Analysis — why pass / fail, plus the AI narrative */}
          <div className="p-4 sm:p-5">
            <div className={`flex items-center gap-2 mb-3 font-semibold text-sm ${verdictTone.text}`}>
              {isPartialEvaluation || !isPassed ? <AlertTriangle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              {isPartialEvaluation ? 'AI Analysis — Partial Interview Review' : `AI Analysis — Why this candidate ${isPassed ? 'Passed' : 'Failed'}`}
            </div>
            {/* Point-wise — the same wording, one sentence per point, each
                marked with the verdict's icon and colour. */}
            <ul className="space-y-2.5 tf-body leading-relaxed">
              {[
                ...(isPartialEvaluation ? [
                  <><strong>{candidate.name}</strong> was evaluated only on the portion of the interview completed before termination.</>,
                  <>The Must-Have section average shown here is <strong>{formatScore1(scores.mustHave)}/10</strong>, and Nice-to-Have is <strong>{formatScore1(scores.niceToHave)}/10</strong>.</>,
                  <>These numbers summarize the attended questions only and do not produce a final pass/fail decision.</>,
                ] : [
                  <><strong>{candidate.name}</strong> {isPassed ? 'meets' : 'does not meet'} the Must-Have bar — scoring{' '}
                    <strong>{formatScore1(scores.mustHave)}/10</strong> against the {MHS_THRESHOLD.toFixed(1)} pass threshold
                    {isPassed
                      ? ` (exceeds by ${formatScore1((scores.mustHave - MHS_THRESHOLD))})`
                      : ` (below by ${formatScore1((MHS_THRESHOLD - scores.mustHave))})`}.</>,
                  <>This Must-Have result drives the <strong>{finalResultLabel}</strong> decision; Nice-to-Have ({formatScore1(scores.niceToHave)}/10) is informational and HR is not scored.</>,
                ]),
                // The AI summary paragraph, broken into one point per sentence.
                ...summaryToPoints(aiSummary).map(point => <>{point}</>),
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
          </div>
      </div>

      <div className={card} style={{ pageBreakInside: 'avoid' }}>
        <div className={cardHeader}>
          <div className={headerIcon}><ClipboardCheck className="w-4 h-4" /></div>
          <div className={cardTitle}>Strengths &amp; Concerns</div>
        </div>
        <div className="tf-grid-split divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-slate-600/70">
          {/* Key Strengths */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-success-strong">
              <CheckCircle className="w-4 h-4" />
              Key Strengths
            </div>
            {strengthItems.length > 0 ? (
              <ul className="space-y-2 tf-body leading-relaxed">
                {strengthItems.map((s, i) => (
                  <li key={i} className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-success" /><span>{s}</span></li>
                ))}
              </ul>
            ) : (
              <p className="tf-body-muted italic">No notable strengths were identified in this interview.</p>
            )}
          </div>

          {/* Areas of Concern */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              Areas of Concern
            </div>
            {concernItems.length > 0 ? (
              <ul className="space-y-2 tf-body leading-relaxed">
                {concernItems.map((w, i) => (
                  <li key={i} className="flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" /><span>{w}</span></li>
                ))}
              </ul>
            ) : (
              <p className="tf-body-muted italic">No significant concerns were identified in this interview.</p>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations & Next Steps — its own section, after the evidence. */}
      <div className={card} style={{ pageBreakInside: 'avoid' }}>
        <div className={cardHeader}>
          <div className={headerIcon}><Lightbulb className="w-4 h-4" /></div>
          <div className={cardTitle}>Recommendations &amp; Next Steps</div>
        </div>
        <div className="p-4 sm:p-5">
            <ul className="space-y-2 tf-body leading-relaxed list-disc pl-5">
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
                  <li><strong>Re-assess later:</strong> Consider a fresh interview only once the candidate has gained hands-on experience in the must-have skills</li>
                </>
              )}
            </ul>
        </div>
      </div>

      {/* 9. Methodology + confidentiality */}
      <div className="rounded-2xl bg-brand-blue/5 border border-brand-blue/25 px-4 sm:px-5 py-4 flex items-start gap-3" style={{ pageBreakInside: 'avoid' }}>
        <Info className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
        <div className="tf-meta leading-relaxed space-y-1.5">
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
