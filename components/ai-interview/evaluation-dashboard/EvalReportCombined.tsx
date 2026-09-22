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
import { useState } from 'react';
import { CheckCircle, XCircle, Play, Clock, Download, Sparkles } from 'lucide-react';
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

function scoreColor(score: number) {
  if (score >= 8.0) return { text: 'text-emerald-500', bar: 'bg-emerald-500' };
  if (score >= MHS_THRESHOLD) return { text: 'text-amber-500',   bar: 'bg-amber-500'   };
  return                   { text: 'text-red-500',     bar: 'bg-red-500'     };
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

  const [exporting, setExporting] = useState(false);

  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = (finalResult ?? (isPassed ? 'Pass' : 'Fail')).toUpperCase();
  // Match Score is MUST-HAVE based only (2026-05-30) — the Must-Have section is
  // the Pass/Fail gate, so the headline % must track it, NOT the NTH-weighted
  // overall (scores.final). MHS is 0-10 → ×10 for a 0-100%.
  const confidence = Math.round(scores.mustHave * 10);
  const avatarInitials =
    candidate.name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C';

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

  // ── Interview stats ───────────────────────────────────────────────────
  const stats = [
    { label: 'Questions Answered', value: String(interviewResponses.length), icon: <Play className="w-5 h-5" /> },
    {
      label: 'Average Response Time',
      value: avgResponseSeconds && avgResponseSeconds > 0 ? `${Math.round(avgResponseSeconds)}s` : '—',
      icon: <Clock className="w-5 h-5" />,
    },
    {
      label: 'Skills Evaluated',
      value: `${allSkills.filter(s => s.score > 0).length} / ${allSkills.length}`,
      icon: <CheckCircle className="w-5 h-5" />,
    },
  ];

  // ── PDF export — complete professional recruiter report (native jsPDF) ──
  // Per the recruiter spec: Final Result, Must-Have & Nice-to-Have section
  // scores, EVERY question with its 0-10 score, EVERY skill with its 0-10
  // score, Must-Have / Nice-to-Have clearly separated, and HR shown but NOT
  // scored — nothing omitted. Drawn with jsPDF primitives (html2canvas can't
  // be used: Tailwind v4 oklch colors crash it → blank pages). Auto-paginates.
  const exportPDF = async () => {
    setExporting(true);
    try {
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
      const verdictLine = isPartialEvaluation
        ? `${candidate.name}'s interview ended before completion. The Must-Have score of ${scores.mustHave.toFixed(2)}/10 and the Nice-to-Have score of ${scores.niceToHave.toFixed(2)}/10 summarize only the attended questions. HR is not scored, and no final pass/fail or match score is generated for this report.`
        : `${candidate.name} ${pass ? 'meets' : 'does not meet'} the Must-Have bar — ${scores.mustHave.toFixed(2)}/10 vs the ${MHS_THRESHOLD.toFixed(1)} threshold (${pass ? '+' : '-'}${Math.abs(scores.mustHave - MHS_THRESHOLD).toFixed(2)}). This drives the ${finalResultLabel} decision; Nice-to-Have (${scores.niceToHave.toFixed(2)}/10) is informational and HR is not scored.`;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      const vl = doc.splitTextToSize(verdictLine, CW - 12);
      const vBoxH = vl.length * 4.4 + 6;
      ensure(vBoxH + 3);
      const vTint: RGB = isPartialEvaluation ? [255, 251, 235] : (pass ? [236, 253, 245] : [254, 242, 242]);
      fill(vTint); stroke(verdict); doc.setLineWidth(0.35); doc.roundedRect(M, y, CW, vBoxH, 1.5, 1.5, 'FD'); doc.setLineWidth(0.2);
      fill(verdict); doc.roundedRect(M, y, 1.6, vBoxH, 0.8, 0.8, 'F'); // left accent bar
      txt(ink); doc.text(vl, M + 6, y + 5); y += vBoxH + 4;

      if (aiSummary) {
        const al = doc.splitTextToSize(aiSummary, CW); ensure(al.length * 4.4 + 2);
        txt(sub); doc.text(al, M, y + 3); y += al.length * 4.4 + 3; txt(ink);
      }
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

      // Footer
      ensure(18);
      fill([238, 242, 255]); doc.roundedRect(M, y, CW, 16, 2, 2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); txt(indigoDk);
      const foot = isPartialEvaluation
        ? `Scoring: This terminated interview report evaluates only the attended questions. No final result or match score is generated. Nice-to-Have is informational; HR is not scored. Question Score = Sum(Skill x Weight) / Sum(Weights), where P1=10, P2=7, P3=4. All scores are 0-10.   Confidentiality: proprietary — for authorized hiring personnel only.`
        : `Scoring: Must-Have Section Score (Pass >= ${MHS_THRESHOLD.toFixed(1)}) drives the final result; Nice-to-Have is informational; HR is not scored. Question Score = Sum(Skill x Weight) / Sum(Weights), where P1=10, P2=7, P3=4. All scores are 0-10.   Confidentiality: proprietary — for authorized hiring personnel only.`;
      doc.text(doc.splitTextToSize(foot, CW - 6), M + 3, y + 4);

      doc.save(`eval_report_${candidate.name || 'candidate'}_${evalId}`.replace(/\s+/g, '_') + '.pdf');

      if (sessionId) {
        aiInterviewService.logReportDownload(sessionId, 'evaluation');
      }
    } catch (err) {
      console.error('[EvalReport] PDF export failed:', err);
      // eslint-disable-next-line no-alert
      window.alert('Could not generate the PDF. Please check the browser console for details.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Report header band (not part of the PDF) ─────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-blue text-white font-bold text-lg flex items-center justify-center shadow-sm shrink-0">
            AI
          </div>
          <div>
            <div className="text-base font-bold text-gray-900 leading-tight">AI Interview Evaluation Report</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} · {totalSkills} skill{totalSkills !== 1 ? 's' : ''} · ID #{evalId}
            </div>
          </div>
        </div>
        <button
          onClick={exportPDF}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-blue hover:bg-brand-blue-2 disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-brand-blue/25 transition-colors"
        >
          <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
          {exporting ? 'Preparing PDF…' : 'Download Report (PDF)'}
        </button>
      </div>

      {/* ── Everything below is captured into the PDF ─────────────────── */}
      <div className="bg-white space-y-6">
        {/* 1. Verdict hero — compact Pass/Fail + Match Score + candidate */}
        {isPartialEvaluation ? (
          <div
            className="rounded-xl p-5 text-amber-950 bg-amber-100 border border-amber-200 shadow-sm"
            style={{ pageBreakInside: 'avoid' }}
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative w-14 h-14 rounded-xl bg-amber-200/70 flex items-center justify-center text-lg font-bold overflow-hidden ring-2 ring-white/70 shrink-0">
                {candidateImage
                  ? <img src={candidateImage} alt={candidate.name} className="w-full h-full object-cover" />
                  : <span>{avatarInitials}</span>}
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold leading-tight truncate">{candidate.name}</div>
                <div className="text-sm text-amber-900/80 mb-1 truncate">{candidate.role}</div>
                <div className="text-base font-bold">Partial Evaluation</div>
                <div className="text-xs text-amber-900/80 mt-1">
                  This interview ended before completion. The AI evaluated only the questions the candidate attended, so no final pass/fail or match score is generated.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-xl p-5 text-white shadow-md ${
              isPassed ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            style={{ pageBreakInside: 'avoid' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-lg font-bold overflow-hidden ring-2 ring-white/30 shrink-0">
                  {candidateImage
                    ? <img src={candidateImage} alt={candidate.name} className="w-full h-full object-cover" />
                    : <span>{avatarInitials}</span>}
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold leading-tight truncate">{candidate.name}</div>
                  <div className="text-sm text-white/90 mb-1.5 truncate">{candidate.role}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isPassed
                      ? <CheckCircle className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                      : <XCircle className="w-4 h-4 shrink-0" strokeWidth={2.5} />}
                    <span className="text-base font-bold">{finalResultLabel}</span>
                    <span className="text-xs text-white/90">
                      · {isPassed ? 'Recommended to Hire' : 'Does Not Meet Requirements'}
                    </span>
                  </div>
                  <div className="text-xs text-white/85 mt-1">
                    Must-Have {scores.mustHave.toFixed(2)} / Threshold {MHS_THRESHOLD.toFixed(1)}
                    {isPassed
                      ? ` · +${(scores.mustHave - MHS_THRESHOLD).toFixed(2)}`
                      : ` · Below by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)}`}
                  </div>
                </div>
              </div>
              <div className="px-5 py-2.5 rounded-xl bg-white/20 backdrop-blur text-center shrink-0">
                <div className="text-2xl font-bold leading-none">{confidence}%</div>
                <div className="text-xs font-semibold text-white/95 mt-1">Match Score</div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Interview meta strip (once) */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5" style={{ pageBreakInside: 'avoid' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ['Candidate', candidate.name],
              ['Position', candidate.role],
              ['Email', candidate.email || '—'],
              ['Interview Date', interview.date || '—'],
              ['Mode', interview.mode || '—'],
              ['Duration', interview.duration || '—'],
            ].map(([label, val], i) => (
              <div key={i}>
                <div className="text-2xs uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
                <div className="text-sm font-semibold text-gray-900 break-words">{val}</div>
              </div>
            ))}
          </div>
          <hr className="my-4 border-gray-100" />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-400">
            <span>Evaluation ID: #{evalId}</span>
            <span>Report generated {reportGenerated}</span>
          </div>
        </div>

        {/* 3. Key stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ pageBreakInside: 'avoid' }}>
          {stats.map((s, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-blue text-white flex items-center justify-center shrink-0">
                  {s.icon}
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                  <div className="text-sm text-gray-500">{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 4. Score breakdown (once) */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Section Score Breakdown</div>
          </div>
          <div className="divide-y divide-gray-100">
            {sectionsPresent.mustHave && (
              <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center bg-emerald-50/60 px-5 py-4 gap-2">
                <div className="text-sm font-bold text-emerald-800">Must-Have Section Score</div>
                <div className="text-2xl font-bold text-emerald-500">{scores.mustHave.toFixed(2)}</div>
                <div className="pr-3">
                  <div className="h-3.5 bg-emerald-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(scores.mustHave / 10) * 100}%` }} />
                  </div>
                </div>
                <div>
                  {isPartialEvaluation ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                      Partial
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                      isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {isPassed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {isPassed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                </div>
              </div>
            )}
            {sectionsPresent.niceToHave && (
              <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center px-5 py-4 gap-2">
                <div className="text-sm font-semibold text-gray-900">Nice-to-Have Section Score</div>
                <div className="text-2xl font-bold text-indigo-500">{scores.niceToHave.toFixed(2)}</div>
                <div className="pr-3">
                  <div className="h-3.5 bg-indigo-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(scores.niceToHave / 10) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    Info Only
                  </span>
                </div>
              </div>
            )}
            {/* Overall Average Score row removed 2026-05-30 — Pass/Fail is
                driven by the Must-Have section; the NTH-weighted overall was
                confusing and not used for the decision. */}
          </div>
        </div>

        {/* 5. Executive summary */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Executive Summary</div>
          </div>
          <div className="p-6 space-y-4 text-sm leading-relaxed text-gray-900">
            <p>
              {candidate.name} completed an AI-powered technical interview for the {candidate.role} position
              on {interview.date || 'the scheduled date'}. The evaluation consisted of{' '}
              <strong>{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}</strong> covering{' '}
              <strong>{totalSkills} skill{totalSkills !== 1 ? 's' : ''}</strong> across multiple priority levels.
            </p>
            {sectionsPresent.mustHave && (
              <p>
                The candidate achieved a <strong>Must-Have Section Score of {scores.mustHave.toFixed(2)}/10</strong>,{' '}
                {isPartialEvaluation
                  ? 'based only on the questions the candidate attended before the interview ended.'
                  : isPassed
                    ? `which exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(scores.mustHave - MHS_THRESHOLD).toFixed(2)} points.`
                    : `which falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)} points.`}
                {sectionsPresent.niceToHave && (
                  <> {' '}The Nice-to-Have Section Score was <strong>{scores.niceToHave.toFixed(2)}/10</strong>,{' '}
                  demonstrating {niceToHaveStrong} proficiency in supplementary skills.</>
                )}
              </p>
            )}
            <p>
              {isPartialEvaluation
                ? <>Because the interview was terminated early, this report provides question-by-question and skill-by-skill analysis only; it does not generate a final hiring recommendation or match score.</>
                : <>Based on this evaluation, the assessment recommends{' '}
                  <strong>{isPassed ? 'proceeding with the hiring process' : 'not proceeding with the current application'}</strong>{' '}
                  with a match score of <strong>{confidence}%</strong>.</>}
            </p>
          </div>
        </div>

        {/* 6. Radar + cluster coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6" style={{ pageBreakInside: 'avoid' }}>
          <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
            <div className="text-lg font-semibold text-gray-900 mb-4">Skill Assessment Radar</div>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--raw-e5e7eb)" />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: 'var(--raw-6b7280)', fontSize: 12, fontWeight: 500 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: 'var(--raw-6b7280)', fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="var(--raw-4f46e5)" fill="var(--raw-4f46e5)" fillOpacity={0.6} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[360px] flex items-center justify-center text-gray-400 text-sm italic">
                Not enough data to render radar chart.
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-3">
              <div className="text-base font-bold text-indigo-800">Cluster Coverage Overview</div>
            </div>
            <div className="p-6">
              {sectionsPresent.mustHave && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Must-Have Section</div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      mhCov.pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {mhCov.pct}% Coverage
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div className={`h-full rounded-full ${mhCov.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${mhCov.pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {mhCov.covered} of {mhCov.total} skills asked · <span className="font-semibold text-gray-700">{mhCov.demonstrated} demonstrated</span> (score ≥ 5)
                  </div>
                </div>
              )}
              {sectionsPresent.niceToHave && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Nice-to-Have Section</div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      nhCov.pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {nhCov.pct}% Coverage
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div className={`h-full rounded-full ${nhCov.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${nhCov.pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {nhCov.covered} of {nhCov.total} skills asked · <span className="font-semibold text-gray-700">{nhCov.demonstrated} demonstrated</span> (score ≥ 5)
                  </div>
                </div>
              )}
              <hr className="my-4 border-gray-200" />
              <div className="text-xs text-gray-500 leading-relaxed">
                <strong>Question Coverage</strong> reflects how much of the planned skill set Bina actually probed — not how
                well the candidate answered (that's the Section Score above).
              </div>
            </div>
          </div>
        </div>

        {/* 7. Skills assessment summary (full) */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Skills Assessment Summary</div>
          </div>
          {sectionsPresent.mustHave && flatMustHave.length > 0 && (
            <div className="p-6 border-b border-gray-200">
              <div className="text-sm font-bold text-gray-900 mb-3">
                Must-Have Skills ({flatMustHave.length} skill{flatMustHave.length !== 1 ? 's' : ''} evaluated)
              </div>
              <div className="space-y-1">
                {flatMustHave.map((s, i) => {
                  const sc = scoreColor(s.score);
                  const tagBg = s.tag === 'P1' ? 'bg-indigo-600' : s.tag === 'P2' ? 'bg-indigo-500' : 'bg-indigo-400';
                  return (
                    <div key={`mh-${i}`} className="grid grid-cols-[30%_15%_15%_minmax(0,1fr)_15%] items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                      <div><span className={`inline-block text-2xs font-bold text-white px-2 py-0.5 rounded ${tagBg}`}>{s.tag}</span></div>
                      <div className="text-xs text-gray-500">Weight: {s.weight}</div>
                      <div className="pr-2">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                        </div>
                      </div>
                      <div className={`text-base font-bold ${sc.text} text-right`}>{s.score.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sectionsPresent.niceToHave && flatNiceToHave.length > 0 && (
            <div className="p-6">
              <div className="text-sm font-bold text-gray-900 mb-3">
                Nice-to-Have Skills ({flatNiceToHave.length} skill{flatNiceToHave.length !== 1 ? 's' : ''} evaluated)
              </div>
              <div className="space-y-1">
                {flatNiceToHave.map((s, i) => {
                  const sc = scoreColor(s.score);
                  const tagBg = s.tag === 'P1' ? 'bg-amber-500' : 'bg-amber-400';
                  return (
                    <div key={`nh-${i}`} className="grid grid-cols-[30%_15%_15%_minmax(0,1fr)_15%] items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                      <div><span className={`inline-block text-2xs font-bold text-white px-2 py-0.5 rounded ${tagBg}`}>{s.tag}</span></div>
                      <div className="text-xs text-gray-500">Weight: {s.weight}</div>
                      <div className="pr-2">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                        </div>
                      </div>
                      <div className={`text-base font-bold ${sc.text} text-right`}>{s.score.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {flatMustHave.length === 0 && flatNiceToHave.length === 0 && (
            <div className="p-6 text-sm text-gray-400 italic text-center">No skills evaluated yet.</div>
          )}
        </div>

        {/* 8. Question-by-question */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Question-by-Question Performance</div>
          </div>
          {perQuestionDetails.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {perQuestionDetails.map((q, i) => {
                const isHR = q.section === 'hr';
                const sc = scoreColor(q.questionScore);
                const sectionLabel = q.section === 'mth' ? 'Must-Have' : q.section === 'nth' ? 'Nice-to-Have' : 'HR';
                const sectionClass = q.section === 'mth'
                  ? 'bg-indigo-50 text-indigo-600'
                  : q.section === 'nth' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-600';
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
                  <div key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} style={{ pageBreakInside: 'avoid' }}>
                    <div className="grid grid-cols-[15%_20%_minmax(0,1fr)_15%] items-center px-5 py-3 gap-3">
                      <div className="text-sm font-bold text-indigo-600">Q{q.qNum}</div>
                      <div><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sectionClass}`}>{sectionLabel}</span></div>
                      <div className="text-xs text-gray-500 truncate">{skillsText}</div>
                      {isHR
                        ? <div className="text-xs font-medium text-gray-400 text-right italic">Review only</div>
                        : q.notDelivered
                          ? <div className="text-right"><div className={`text-base font-bold ${sc.text}`}>{q.questionScore.toFixed(2)}</div><div className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">Not Delivered</div></div>
                          : <div className={`text-base font-bold ${sc.text} text-right`}>{q.questionScore.toFixed(2)}</div>}
                    </div>
                    {/* Actual interview question text (was missing — recruiters
                        need to see WHAT was asked, not just the mapped skills). */}
                    {q.question && q.question.trim() && (
                      <div className="px-5 pb-2 -mt-1">
                        <div className="text-sm text-gray-800 leading-relaxed">
                          <span className="font-semibold text-gray-500">Q:&nbsp;</span>{q.question}
                        </div>
                      </div>
                    )}
                    {/* Candidate's answer — the actual response the score is based on. */}
                    <div className="px-5 pb-3">
                      <div className={`text-sm leading-relaxed ${ansIsPlaceholder ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                        <span className="font-semibold text-gray-500 not-italic">A:&nbsp;</span>{answerText}
                      </div>
                    </div>
                    {hasRationale && (
                      <div className="px-5 pb-3 -mt-1">
                        <div className="text-2xs leading-relaxed text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-3 py-2" style={{ pageBreakInside: 'avoid' }}>
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-400 italic text-center">No question-level data available.</div>
          )}
        </div>

        {/* 9. Recommendations */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Recommendations &amp; Next Steps</div>
          </div>
          <div className="p-6">
            {isPassed ? (
              <>
                <div className="text-sm font-bold text-emerald-800 mb-3">✓ Recommended Actions:</div>
                <ul className="space-y-2 text-sm leading-relaxed text-gray-900 list-disc pl-5">
                  <li><strong>Proceed to next round:</strong> Candidate demonstrates strong technical competency across must-have skills</li>
                  <li><strong>Technical interview:</strong> Consider a deeper assessment in core architecture and design topics</li>
                  <li><strong>Cultural fit:</strong> Schedule a behavioral interview to assess team alignment</li>
                  <li><strong>Areas to explore:</strong> Skills showing medium-level proficiency can benefit from additional validation</li>
                </ul>
              </>
            ) : (
              <>
                <div className="text-sm font-bold text-red-800 mb-3">⚠ Recommended Actions:</div>
                <ul className="space-y-2 text-sm leading-relaxed text-gray-900 list-disc pl-5">
                  <li><strong>Do not proceed:</strong> Candidate did not meet the minimum requirements for must-have skills</li>
                  <li><strong>Skills gap identified:</strong> Significant development needed in core technical areas</li>
                  <li><strong>Alternative path:</strong> Consider for junior positions or recommend additional training</li>
                </ul>
              </>
            )}
          </div>
        </div>

        {/* 9b. AI Analysis — pass/fail overview (AI narrative + strengths/concerns) */}
        <div className={`rounded-2xl border overflow-hidden ${isPartialEvaluation ? 'border-amber-200' : isPassed ? 'border-emerald-200' : 'border-rose-200'}`} style={{ pageBreakInside: 'avoid' }}>
          <div className={`px-5 py-3 border-b flex items-center gap-2 ${isPartialEvaluation ? 'bg-amber-50 border-amber-200' : isPassed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <Sparkles className={`w-4 h-4 ${isPartialEvaluation ? 'text-amber-600' : isPassed ? 'text-emerald-600' : 'text-rose-600'}`} />
            <div className={`text-base font-bold ${isPartialEvaluation ? 'text-amber-800' : isPassed ? 'text-emerald-800' : 'text-rose-800'}`}>
              {isPartialEvaluation ? 'AI Analysis — Partial Interview Review' : `AI Analysis — ${isPassed ? 'Why this candidate Passed' : 'Why this candidate Failed'}`}
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm leading-relaxed text-gray-900">
              {isPartialEvaluation ? (
                <>
                  <strong>{candidate.name}</strong> was evaluated only on the portion of the interview completed before termination.
                  The Must-Have section average shown here is <strong>{scores.mustHave.toFixed(2)}/10</strong>, and Nice-to-Have is <strong>{scores.niceToHave.toFixed(2)}/10</strong>.
                  These numbers summarize the attended questions only and do not produce a final pass/fail decision.
                </>
              ) : (
                <>
                  <strong>{candidate.name}</strong> {isPassed ? 'meets' : 'does not meet'} the Must-Have bar — scoring{' '}
                  <strong>{scores.mustHave.toFixed(2)}/10</strong> against the {MHS_THRESHOLD.toFixed(1)} pass threshold
                  {isPassed
                    ? ` (exceeds by ${(scores.mustHave - MHS_THRESHOLD).toFixed(2)})`
                    : ` (below by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)})`}.
                  {' '}This Must-Have result drives the <strong>{finalResultLabel}</strong> decision; Nice-to-Have ({scores.niceToHave.toFixed(2)}/10) is informational and HR is not scored.
                </>
              )}
            </p>
            {aiSummary && (
              <div className="text-sm leading-relaxed text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-4">
                {aiSummary}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strengths && strengths.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="text-sm font-bold text-emerald-800 mb-2">Key Strengths</div>
                  <ul className="space-y-1.5 text-sm text-gray-800 list-disc pl-5">
                    {strengths.slice(0, 5).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {weaknesses && weaknesses.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
                  <div className="text-sm font-bold text-rose-800 mb-2">Areas of Concern</div>
                  <ul className="space-y-1.5 text-sm text-gray-800 list-disc pl-5">
                    {weaknesses.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
            {!aiSummary && (!strengths || strengths.length === 0) && (!weaknesses || weaknesses.length === 0) && (
              <p className="text-sm text-gray-400 italic">
                {isPartialEvaluation
                  ? 'No additional AI narrative was generated for this partial interview.'
                  : `No additional AI narrative was generated for this interview — the ${finalResultLabel} decision is based on the Must-Have section score above.`}
              </p>
            )}
          </div>
        </div>

        {/* 10. Footer — methodology + confidentiality (once) */}
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-6" style={{ pageBreakInside: 'avoid' }}>
          <p className="text-xs text-indigo-800 leading-relaxed mb-3">
            <strong>Evaluation Methodology:</strong> This report was generated using AI-powered automated assessment.
            Must-Have Section Score = Average of Must-Have question scores (Pass threshold ≥ {MHS_THRESHOLD.toFixed(1)}).
            Nice-to-Have Section Score = Average of Nice-to-Have question scores (informational only).
            Question Score = Σ(Skill Score × Priority Weight) / ΣWeights where P1=10, P2=7, P3=4.
          </p>
          <hr className="border-indigo-200 my-3" />
          <p className="text-xs text-indigo-600 leading-relaxed">
            <strong>Confidentiality Notice:</strong> This evaluation report contains proprietary and confidential
            information intended solely for authorized personnel in the hiring decision process.
          </p>
        </div>
      </div>
    </div>
  );
}
