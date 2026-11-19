// Client-side PDF for one candidate's assessment result — the result page's
// "Report" button. Laid out like the AI interview evaluation report
// (components/ai-interview/evaluation-dashboard/EvalReportCombined.tsx,
// exportEvalReportPDF): a one-page scorecard first, then a "Detailed
// Evidence" appendix, with a footer on every page.
//
// Every figure comes from the result the page already loaded and uses the
// page's own rules (lib/utils/assessmentResultScoring), so the PDF and the
// page never disagree:
//   • a section passes at the assessment's pass mark (70% when none is set),
//     scored on its round `raw_score`; HR is for reference and not scored;
//   • a question counts as answered when something was submitted.
import type { DetailedResultResponse, QuestionEvaluation, RoundScore } from '@/lib/services';
import { formatScore, toOneDecimalScore } from '@/lib/utils/score';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { pdfSafe, hasNonLatinScript, isPdfSafeChar } from '@/lib/utils/pdfText';
import {
  toInsightPoints,
  getCodingEvaluationState,
  getNormalizedQuestionPossiblePoints,
  getDisplayedQuestionEarnedPoints,
  isQuestionAnswered,
} from '@/lib/utils/assessmentResultScoring';

export interface AssessmentReportOptions {
  result: DetailedResultResponse;
  /** File name to save as (the page's own "JD-001 - … .pdf" name). */
  fileName: string;
  /** Pass mark in percent (the assessment's passing_threshold, else 70). */
  passMark: number;
  assessmentTitle?: string | null;
  /** The role / JD title the assessment is for. */
  roleTitle?: string | null;
  candidateCid?: string | null;
  /** Absolute URL of this result page, linked from the report. */
  resultUrl?: string | null;
  /** false returns the PDF as a Blob instead of downloading it. */
  save?: boolean;
}

type RGB = [number, number, number];

const roundName = (type: string) => {
  const key = (type || '').toLowerCase();
  if (key === 'hr') return 'HR';
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const isMcq = (q: QuestionEvaluation) =>
  ['mcq', 'single_choice', 'multiple_choice'].includes((q.question_type || '').toLowerCase());

export async function exportAssessmentReportPDF(opts: AssessmentReportOptions): Promise<Blob | null> {
  const { result, passMark } = opts;
  const name = result.candidate_name || 'Candidate';
  const assessmentTitle = opts.assessmentTitle || result.assessment_title || 'Assessment';
  const role = opts.roleTitle || result.ai_generation_audit?.generation_params?.jd_title || null;
  // "the AI Developer - Assessment assessment" → "the AI Developer - Assessment".
  const assessmentPhrase = /assessment\s*$/i.test(assessmentTitle) ? assessmentTitle : `${assessmentTitle} assessment`;

  const terminated = result.attempt_status === 'terminated' || (!!result.terminated_at && !result.completed_at);
  const scored = !terminated && result.scoring_status === 'completed';
  const questions = result.question_evaluations || [];
  const answered = questions.filter(isQuestionAnswered).length;
  const rounds = result.round_scores || [];
  const scoredRounds = rounds.filter((r) => r.round_type.toLowerCase() !== 'hr');
  const roundScore = (r: RoundScore) => toOneDecimalScore(r.raw_score ?? 0);
  const roundPassed = (r: RoundScore) => roundScore(r) >= passMark;
  const stats = result.proctoring_stats;
  const totalViolations = stats?.total_violations || 0;
  const insights = (result.candidate_insights || {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const submittedAt = result.completed_at || result.terminated_at || null;
  const submittedLabel = submittedAt ? `${formatISTDate(submittedAt)}, ${formatISTTime(submittedAt)}` : null;
  const timeTaken = typeof result.time_spent_seconds === 'number' && result.time_spent_seconds > 0
    ? `${Math.floor(result.time_spent_seconds / 60)}m ${result.time_spent_seconds % 60}s`
    : null;
  const reportGenerated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = 210, pageH = 297, M = 12, CW = pageW - M * 2;
  let y = M;
  const ink: RGB = [17, 24, 39], sub: RGB = [107, 114, 128], faint: RGB = [156, 163, 175];
  const line: RGB = [229, 231, 235], bgc: RGB = [249, 250, 251], white: RGB = [255, 255, 255];
  const indigo: RGB = [79, 70, 229], indigoDk: RGB = [67, 56, 202];
  const green: RGB = [16, 185, 129], red: RGB = [239, 68, 68], amber: RGB = [245, 158, 11], teal: RGB = [16, 160, 120];
  const amberBg: RGB = [255, 251, 235], amberBd: RGB = [253, 230, 138], amberDk: RGB = [146, 64, 14];
  const greenBg: RGB = [236, 253, 245], redBg: RGB = [254, 242, 242];
  // Percent bands: green from 80, amber from the pass mark, red below it —
  // the AI report's 8 / 6 bands on a 0–100 scale, anchored on this pass mark.
  const pctRGB = (p: number): RGB => (p >= 80 ? green : p >= passMark ? amber : red);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const txt = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > pageH - M - 4) { doc.addPage(); y = M; } };
  const lines = (value: string, width: number, size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style); doc.setFontSize(size);
    const raw = doc.splitTextToSize(pdfSafe(value || ''), width);
    const out = (Array.isArray(raw) ? raw : [raw]).map(String);
    return out.length > 0 ? out : [''];
  };
  const sectionBar = (title: string, color: RGB, right?: string) => {
    ensure(20);
    fill(color); doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); txt(white);
    doc.text(pdfSafe(title), M + 3, y + 6);
    if (right) { doc.setFontSize(9); doc.text(pdfSafe(right), pageW - M - 3, y + 6, { align: 'right' }); }
    y += 13;
  };
  /** Text that may run past the page: one line at a time. */
  const flow = (ls: string[], x: number, lineH: number, color: RGB, size: number, style: 'normal' | 'bold' = 'normal') => {
    ls.forEach((l) => {
      ensure(lineH + 0.5);
      doc.setFont('helvetica', style); doc.setFontSize(size); txt(color);
      doc.text(l, x, y + lineH - 0.8);
      y += lineH;
    });
  };

  // Footer on every page (run once, after all content is drawn).
  const finishPages = () => {
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      stroke(line); doc.setLineWidth(0.2); doc.line(M, pageH - 9, pageW - M, pageH - 9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); txt(faint);
      doc.text(pdfSafe(`${name}${opts.candidateCid ? `  ·  ${opts.candidateCid}` : ''}  ·  Assessment report  ·  Confidential — for authorized hiring personnel only`), M, pageH - 5.5);
      doc.text(`Page ${p} of ${pageCount}`, pageW - M, pageH - 5.5, { align: 'right' });
    }
  };

  // ── Header ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); txt(ink);
  doc.text('Assessment Evaluation Report', M, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); txt(sub);
  doc.text(pdfSafe(`${name}  ·  ${role || assessmentTitle}`), M, y + 9.5);
  const factParts = [
    opts.candidateCid,
    result.candidate_email,
    role ? `Assessment: ${assessmentTitle}` : null,
    submittedLabel ? `${terminated ? 'Ended' : 'Submitted'}: ${submittedLabel}` : null,
    timeTaken ? `Time taken: ${timeTaken}` : null,
    `Questions answered: ${answered} / ${questions.length}`,
    `Violations: ${totalViolations}`,
  ].filter(Boolean) as string[];
  const factLines = lines(factParts.join('   ·   '), CW - 45, 7.5);
  txt(sub); doc.text(factLines, M, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(faint);
  doc.text(`Generated: ${reportGenerated}`, pageW - M, y + 2, { align: 'right' });
  y += 14 + factLines.length * 3.4 + 1;
  stroke(indigo); doc.setLineWidth(0.7); doc.line(M, y, pageW - M, y); doc.setLineWidth(0.2); y += 5;

  // ── Score cards — each scored section at a glance ──────────────────
  // One card per scored section (HR is not scored, so it has none), as the
  // result page's own header cards: score, Pass / Fail against the pass mark,
  // and how many were correct. Up to three per row.
  if (scoredRounds.length > 0) {
    const perRow = Math.min(3, scoredRounds.length);
    const gap = 4, cardW = (CW - gap * (perRow - 1)) / perRow, cardH = 22;
    const scoreLabel = (t: string) => {
      const key = t.toLowerCase();
      if (key === 'coding') return 'Code Score';
      return `${roundName(t)} Score`;
    };
    scoredRounds.forEach((r, i) => {
      const col = i % perRow;
      if (col === 0) { if (i > 0) y += cardH + gap; ensure(cardH + 2); }
      const x = M + col * (cardW + gap);
      const pct = roundScore(r);
      const pass = roundPassed(r);
      const tone: RGB = !scored ? faint : pass ? green : red;
      fill(white); stroke(line); doc.setLineWidth(0.3); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD'); doc.setLineWidth(0.2);
      fill(tone); doc.roundedRect(x, y, 1.6, cardH, 0.8, 0.8, 'F'); // accent
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(sub);
      doc.text(pdfSafe(scoreLabel(r.round_type)), x + 5, y + 6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); txt(scored ? pctRGB(pct) : faint);
      const value = terminated ? 'Not scored' : !scored ? 'Pending' : `${formatScore(pct)}%`;
      if (!scored) doc.setFontSize(12);
      doc.text(value, x + 5, y + 14.5);
      if (scored) {
        // Pass / Fail pill beside the score.
        const vw = doc.getTextWidth(value);
        const label = pass ? 'PASS' : 'FAIL';
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        const pw = doc.getTextWidth(label) + 4;
        fill(pass ? greenBg : redBg); stroke(tone); doc.setLineWidth(0.25);
        doc.roundedRect(x + 5 + vw + 3, y + 10.2, pw, 4.8, 1.2, 1.2, 'FD'); doc.setLineWidth(0.2);
        txt(tone); doc.text(label, x + 5 + vw + 5, y + 13.6);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(sub);
      doc.text(`${r.questions_correct ?? 0}/${r.questions_total ?? 0} correct  ·  Pass mark ${formatScore(passMark)}%`, x + 5, y + 19);
    });
    y += cardH + 5;
  }

  // ── Integrity status (page 1, every report) ────────────────────────
  const violationParts: [string, number][] = stats ? ([
    ['Tab switches', stats.tab_switch_count],
    ['Window focus losses', stats.window_blur_count],
    ['Fullscreen exits', stats.fullscreen_exit_count],
    ['Copies', stats.copy_count],
    ['Pastes', stats.paste_count],
    ['Multiple-faces alerts', stats.multiple_faces_count],
    ['Face-not-visible alerts', stats.face_not_visible_count ?? 0],
    ['Camera obstructions', stats.camera_obstructed_count ?? 0],
    ['Voice alerts', stats.voice_violation_count],
    ['Screen capture attempts', stats.screen_capture_count ?? 0],
    ['Other', stats.other_violation_count ?? 0],
  ] as [string, number][]).filter(([, n]) => (n || 0) > 0) : [];
  {
    const level: 'high' | 'review' | 'clear' =
      terminated || stats?.integrity_status === 'suspicious' ? 'high'
        : totalViolations > 0 || stats?.integrity_status === 'flagged' ? 'review'
          : 'clear';
    const tone = level === 'high' ? { label: 'High Risk', color: red, bg: redBg }
      : level === 'review' ? { label: 'Review Needed', color: amber, bg: amberBg }
        : { label: 'No Issues', color: green, bg: greenBg };
    const detail = violationParts.length > 0
      ? `${violationParts.map(([l, n]) => `${l}: ${n}`).join('  ·  ')}. Details in the Detailed Evidence section.`
      : '';
    const detailLines = detail ? lines(detail, CW - 10, 8) : [];
    const boxH = 9 + detailLines.length * 3.8;
    ensure(boxH + 4);
    fill(tone.bg); stroke(tone.color); doc.setLineWidth(0.35); doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'FD'); doc.setLineWidth(0.2);
    fill(tone.color); doc.roundedRect(M, y, 1.6, boxH, 0.8, 0.8, 'F');
    let ix = M + 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(ink);
    doc.text('Integrity:', ix, y + 5.6); ix += doc.getTextWidth('Integrity: ');
    txt(tone.color); doc.text(tone.label, ix, y + 5.6); ix += doc.getTextWidth(tone.label) + 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(sub);
    doc.text(`Proctoring: ${totalViolations === 0 ? 'no violations recorded' : `${totalViolations} violation${totalViolations !== 1 ? 's' : ''}`}`, ix, y + 5.6);
    if (detailLines.length > 0) { txt(level === 'high' ? [185, 28, 28] : ink); doc.text(detailLines, M + 5, y + 10); }
    y += boxH + 5;
  }

  // ── Section-wise performance ───────────────────────────────────────
  const questionsOf = (r: RoundScore) => questions.filter((q) => (q.round_type || '').toLowerCase() === r.round_type.toLowerCase());
  const sectionTypes: string[] = [];
  [...rounds.map((r) => r.round_type), ...questions.map((q) => q.round_type || 'other')].forEach((t) => {
    if (!sectionTypes.some((x) => x.toLowerCase() === t.toLowerCase())) sectionTypes.push(t);
  });
  const roundOf = (t: string) => rounds.find((r) => r.round_type.toLowerCase() === t.toLowerCase()) ?? null;
  const questionsOfType = (t: string) => questions.filter((q) => (q.round_type || 'other').toLowerCase() === t.toLowerCase());
  if (rounds.length > 0) {
    sectionBar('SECTION-WISE PERFORMANCE', indigo);
    // Score and Pass / Fail are on the cards above; the table keeps the
    // detail behind them, and HR, which has no card.
    const cName = M + 2, cQs = M + 96, cCorrect = M + 136, cPoints = M + CW - 2;
    fill(bgc); doc.rect(M, y, CW, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(sub);
    doc.text('Section', cName, y + 4); doc.text('Questions', cQs, y + 4, { align: 'right' });
    doc.text('Correct', cCorrect, y + 4, { align: 'right' }); doc.text('Points', cPoints, y + 4, { align: 'right' });
    y += 7;
    rounds.forEach((r) => {
      ensure(7);
      const isHr = r.round_type.toLowerCase() === 'hr';
      const qs = questionsOf(r);
      const earned = qs.reduce((s, q) => s + getDisplayedQuestionEarnedPoints(q), 0);
      const possible = qs.reduce((s, q) => s + getNormalizedQuestionPossiblePoints(q), 0);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(ink);
      doc.text(`${roundName(r.round_type)} Round`, cName, y + 3);
      txt(sub);
      doc.text(String(r.questions_total ?? qs.length), cQs, y + 3, { align: 'right' });
      doc.text(isHr ? '—' : `${r.questions_correct ?? 0}/${r.questions_total ?? qs.length}`, cCorrect, y + 3, { align: 'right' });
      if (isHr) txt(faint);
      doc.text(isHr ? 'Not scored' : `${formatScore(toOneDecimalScore(earned))}/${formatScore(possible)}`, cPoints, y + 3, { align: 'right' });
      y += 5.6;
      stroke(line); doc.setLineWidth(0.1); doc.line(M, y - 0.4, M + CW, y - 0.4); doc.setLineWidth(0.2);
    });
    // How the table is scored, as a caption under it.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); txt(indigoDk);
    doc.text(pdfSafe(`Each scored section passes at ${formatScore(passMark)}% or above. HR answers are for reference and not scored. Points are out of 10 per question, at one decimal.`), M, y + 3);
    y += 9;
  }

  // ── Executive summary ──────────────────────────────────────────────
  {
    const scoredNames = rounds.map((r) => roundName(r.round_type)).join(', ');
    const points: string[] = [
      terminated
        ? `${name} started the ${assessmentPhrase}${role ? ` for the ${role} position` : ''}, but the attempt ended before completion.`
        : `${name} completed the ${assessmentPhrase}${role ? ` for the ${role} position` : ''}${submittedAt ? ` on ${formatISTDate(submittedAt)}` : ''}.`,
      `It had ${questions.length} question${questions.length !== 1 ? 's' : ''} across ${rounds.length} section${rounds.length !== 1 ? 's' : ''}${scoredNames ? ` (${scoredNames})` : ''}; ${answered} ${answered === 1 ? 'was' : 'were'} answered.`,
    ];
    if (scored) {
      scoredRounds.forEach((r) => {
        const pct = roundScore(r);
        points.push(`${roundName(r.round_type)} section: ${formatScore(pct)}% — ${roundPassed(r) ? 'at or above' : 'below'} the ${formatScore(passMark)}% pass mark.`);
      });
      if (rounds.some((r) => r.round_type.toLowerCase() === 'hr')) points.push('HR answers are included for reference and are not scored.');
    }
    if (str(result.summary)) points.push(...toInsightPoints(str(result.summary), 'sentences'));
    sectionBar('EXECUTIVE SUMMARY', indigo);
    points.forEach((p) => {
      const ls = lines(p, CW - 6, 8.5);
      ensure(ls.length * 4.4 + 2);
      stroke(indigo); doc.setLineWidth(0.5);
      doc.line(M + 0.6, y + 1.8, M + 1.6, y + 2.9);
      doc.line(M + 1.6, y + 2.9, M + 3.6, y + 0.4);
      doc.setLineWidth(0.2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); txt(ink);
      doc.text(ls, M + 6, y + 3);
      y += ls.length * 4.4 + 2;
    });
    y += 3;
  }

  // ── Strengths / Areas of concern ───────────────────────────────────
  {
    const strengths = str(insights.interview_strength) ? toInsightPoints(str(insights.interview_strength), 'sentences') : [];
    const concerns = str(insights.interview_weakness) ? toInsightPoints(str(insights.interview_weakness), 'sentences') : [];
    if (strengths.length > 0 || concerns.length > 0) {
      const gap = 4, colW = (CW - gap) / 2;
      const measure = (items: string[]) => {
        let h = 11;
        (items.length > 0 ? items.slice(0, 6) : ['None identified.']).forEach((it) => { h += lines(`• ${it}`, colW - 8, 8).length * 4 + 1; });
        return Math.max(h + 3, 22);
      };
      const draw = (x: number, h: number, title: string, items: string[], accent: RGB, bgFill: RGB) => {
        fill(bgFill); stroke(accent); doc.roundedRect(x, y, colW, h, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); txt(accent);
        doc.text(title, x + 3, y + 5);
        let cy = y + 9;
        (items.length > 0 ? items.slice(0, 6) : ['None identified.']).forEach((it) => {
          const ls = lines(`• ${it}`, colW - 8, 8);
          txt(ink); doc.text(ls, x + 3, cy + 3);
          cy += ls.length * 4 + 1;
        });
      };
      const h = Math.max(measure(strengths), measure(concerns));
      ensure(h + 2);
      draw(M, h, 'Key Strengths', strengths, [4, 120, 87], greenBg);
      draw(M + colW + gap, h, 'Areas of Concern', concerns, [185, 28, 28], redBg);
      y += h + 4;
    }
  }

  // ── Recommended training ───────────────────────────────────────────
  {
    const modules = str(insights.interview_training_modules) ? toInsightPoints(str(insights.interview_training_modules), 'list') : [];
    const suggestion = str(insights.interview_training_suggestion);
    if (modules.length > 0 || suggestion) {
      sectionBar('RECOMMENDED TRAINING', teal);
      if (modules.length > 0) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        const label = 'Modules: ';
        const labelW = doc.getTextWidth(label);
        const ls = lines(modules.join(', '), CW - labelW - 2, 8.5);
        ensure(ls.length * 4.4 + 2);
        doc.setFont('helvetica', 'bold'); txt(ink); doc.text(label, M, y + 3);
        doc.setFont('helvetica', 'normal'); txt(sub); doc.text(ls, M + labelW, y + 3);
        y += ls.length * 4.4 + 2;
      }
      if (suggestion) {
        toInsightPoints(suggestion, 'sentences').forEach((p) => {
          const ls = lines(`• ${p}`, CW - 2, 8.5);
          ensure(ls.length * 4.4 + 2);
          txt(ink); doc.text(ls, M, y + 3);
          y += ls.length * 4.4 + 1.5;
        });
      }
      y += 3;
    }
  }

  // ── AI-assisted evaluation notice + link back ──────────────────────
  {
    const notice = 'AI-assisted evaluation. Text answers and coding were evaluated with AI support to assist, not replace, human judgement. The final hiring decision must be made by an authorized reviewer after checking the answers and proctoring record.';
    const ls = lines(notice, CW - 8, 7.5);
    const boxH = ls.length * 3.6 + (opts.resultUrl ? 9 : 5);
    ensure(boxH + 2);
    fill(bgc); stroke(line); doc.roundedRect(M, y, CW, boxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(sub); doc.text(ls, M + 4, y + 4.5);
    if (opts.resultUrl) {
      doc.setFont('helvetica', 'bold'); txt(indigo);
      doc.textWithLink('View the full result in TalentFlow (answers, recording, violations)', M + 4, y + 4.5 + ls.length * 3.6 + 0.6, { url: opts.resultUrl });
    }
    y += boxH + 4;
  }

  // ═════ Detailed Evidence — appendix ═════
  // Skipped when there is nothing to put in it. It follows page 1's content
  // (a new page only when too little room is left), so it never leaves a
  // blank page behind.
  if (violationParts.length === 0 && questions.length === 0) {
    finishPages();
    if (opts.save === false) return doc.output('blob');
    doc.save(opts.fileName);
    return null;
  }
  if (y > M + 40) ensure(60);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); txt(ink);
  doc.text('Detailed Evidence', M, y + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(sub);
  doc.text(pdfSafe(`${name}  ·  ${assessmentTitle}`), M, y + 9);
  y += 12; stroke(indigo); doc.setLineWidth(0.5); doc.line(M, y, pageW - M, y); doc.setLineWidth(0.2); y += 5;

  // Integrity table — only when something was recorded.
  if (violationParts.length > 0) {
    sectionBar('INTEGRITY & PROCTORING', terminated || stats?.integrity_status === 'suspicious' ? red : indigo);
    fill(bgc); doc.rect(M, y, CW, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(sub);
    doc.text('Issue', M + 2, y + 4); doc.text('Count', M + CW - 2, y + 4, { align: 'right' });
    y += 7;
    violationParts.forEach(([label, n]) => {
      ensure(6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); txt(ink);
      doc.text(label, M + 2, y + 3);
      doc.text(String(n), M + CW - 2, y + 3, { align: 'right' });
      y += 5;
      stroke(line); doc.setLineWidth(0.1); doc.line(M, y - 0.5, M + CW, y - 0.5); doc.setLineWidth(0.2);
    });
    y += 5;
  }

  // Question-by-question, section by section in the page's round order.
  // Numbered Q1..N across the whole assessment, each with its section's own
  // number (the page numbers per round tab) — e.g. "Q7 · Technical Q2".
  let overall = 0;
  sectionTypes.forEach((type) => {
    const qs = questionsOfType(type);
    if (qs.length === 0) return;
    const r = roundOf(type);
    const isHr = type.toLowerCase() === 'hr';
    const right = isHr ? 'For reference'
      : !scored || !r ? (scored ? '' : 'Pending')
        : `Score: ${formatScore(roundScore(r))}% · ${roundPassed(r) ? 'PASS' : 'FAIL'}`;
    sectionBar(`${roundName(type).toUpperCase()} ROUND`, indigo, right || undefined);

    qs.forEach((q, k) => {
      overall += 1;
      const answeredQ = isQuestionAnswered(q);
      const coding = (q.question_type || '').toLowerCase() === 'coding';
      const earned = getDisplayedQuestionEarnedPoints(q);
      const possible = getNormalizedQuestionPossiblePoints(q);
      const status: { label: string; color: RGB } = isHr
        ? { label: 'For reference', color: faint }
        : !answeredQ ? { label: 'Not Answered', color: faint }
          : !scored ? { label: 'Pending', color: faint }
            : isMcq(q)
              ? { label: `${q.is_correct ? 'Correct' : 'Incorrect'} · ${formatScore(earned)}/${formatScore(possible)}`, color: q.is_correct ? green : red }
              : { label: `${formatScore(earned)}/${formatScore(possible)}`, color: pctRGB(possible > 0 ? (earned / possible) * 100 : 0) };

      // Keep the question's block (header, question, answer, code, note)
      // together on one page when it fits, so its parts don't split apart.
      {
        const qL = lines(`Q: ${q.question_text || ''}`, CW, 8.5).length;
        const aL = coding ? 1 : lines(`A: ${q.candidate_answer_text || ''}`, CW, 8.5).length + (isMcq(q) ? 1 : 0);
        const codeL = coding ? Math.min(25, (q.candidate_code_submission || '').split('\n').length) : 0;
        const noteText = coding ? getCodingEvaluationState(q).summary : str(q.feedback);
        const noteH = noteText && !isHr ? Math.min(19, lines(noteText, CW - 6, 7.5).length) * 3.4 + 10 : 0;
        const est = 6 + qL * 4 + aL * 4 + (coding ? 4 + codeL * 3.3 + 3 : 0) + noteH;
        ensure(Math.min(est, pageH - M * 2 - 12));
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(indigo);
      const head = `Q${overall}`;
      doc.text(head, M, y + 3);
      const headW = doc.getTextWidth(head);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); txt(sub);
      doc.text(` · ${roundName(type)} Q${k + 1}`, M + headW, y + 3);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); txt(status.color);
      doc.text(status.label, pageW - M, y + 3, { align: 'right' });
      y += 5;

      // Question
      const qText = [coding && q.problem_title ? q.problem_title : '', q.question_text || ''].filter(Boolean).join(' — ');
      flow(lines(`Q: ${qText || 'Question'}`, CW, 8.5), M, 4, ink, 8.5);
      y += 0.8;

      // Answer
      if (coding) {
        const anyQ = q as QuestionEvaluation & { language?: string; candidate_code_language?: string; programming_language?: string };
        const anyR = result as DetailedResultResponse & { chosen_coding_language?: string };
        const lang = anyQ.language ?? anyQ.candidate_code_language ?? anyQ.programming_language ?? anyR.chosen_coding_language ?? null;
        const t = q.candidate_test_results;
        const facts = [
          lang ? `Language: ${lang}` : null,
          t && typeof t.total === 'number' ? `Tests passed: ${t.passed ?? 0}/${t.total}` : null,
          q.candidate_code_execution_status ? `Execution: ${q.candidate_code_execution_status}` : null,
        ].filter(Boolean) as string[];
        if (facts.length > 0) flow(lines(facts.join('   ·   '), CW, 8), M, 3.8, sub, 8);
        const code = (q.candidate_code_submission || '').replace(/\t/g, '  ');
        if (code.trim()) {
          const MAX = 24;
          const all = code.split('\n');
          // Not pdfSafe: that collapses runs of spaces, which is indentation here.
          const codeSafe = (l: string) => Array.from(l).map((ch) => (isPdfSafeChar(ch) ? ch : '?')).join('');
          const shown = all.slice(0, MAX).map((l) => codeSafe(l).slice(0, 110));
          if (all.length > MAX) shown.push(`… ${all.length - MAX} more line${all.length - MAX !== 1 ? 's' : ''} — see the result page`);
          const boxH = shown.length * 3.3 + 3;
          ensure(Math.min(boxH, 60) + 2);
          // Long code breaks across pages a line at a time, on a shaded strip.
          doc.setFont('courier', 'normal'); doc.setFontSize(7);
          y += 1;
          shown.forEach((l) => {
            ensure(3.4);
            fill(bgc); doc.rect(M, y, CW, 3.3, 'F');
            txt(ink); doc.setFont('courier', 'normal'); doc.setFontSize(7);
            doc.text(l, M + 2, y + 2.4);
            y += 3.3;
          });
          y += 1.5;
        } else {
          flow(['A: No code submitted.'], M, 4, faint, 8.5);
        }
      } else if (isMcq(q)) {
        const opts2 = q.options || [];
        const selected = (q.candidate_selected_options || []).map((id) => {
          const o = opts2.find((x) => x.id === id);
          return o ? o.text : id;
        });
        flow(lines(`A: ${selected.length > 0 ? selected.join('; ') : 'Not answered.'}`, CW, 8.5), M, 4, selected.length > 0 ? ink : faint, 8.5);
        const correct = (q.correct_answer || []).filter(Boolean);
        if (correct.length > 0 && !isHr) flow(lines(`Correct answer: ${correct.join('; ')}`, CW, 8), M, 3.8, sub, 8);
      } else {
        const ans = (q.candidate_answer_text || '').trim();
        const shown = !ans ? 'Not answered.'
          : hasNonLatinScript(ans) ? '[Answer written in a script this PDF cannot show — see the result page]'
            : ans;
        flow(lines(`A: ${shown}`, CW, 8.5), M, 4, ans ? ink : faint, 8.5);
      }

      // Evaluation note — the page's feedback for this question.
      const note = coding ? getCodingEvaluationState(q).summary : str(q.feedback);
      if (note && !isHr) {
        const ls = lines(note, CW - 6, 7.5);
        const shownLs = ls.slice(0, 18);
        if (ls.length > 18) shownLs.push('… see the result page for the full evaluation');
        const boxH = shownLs.length * 3.4 + 8;
        ensure(boxH + 2);
        fill(amberBg); stroke(amberBd); doc.roundedRect(M, y + 0.5, CW, boxH, 1.2, 1.2, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); txt(amberDk);
        doc.text('Evaluation', M + 3, y + 4.7);
        doc.setFont('helvetica', 'normal'); txt(ink);
        doc.text(shownLs, M + 3, y + 8.4);
        y += boxH + 1.5;
      }

      y += 2;
      stroke(line); doc.setLineWidth(0.1); doc.line(M, y - 1, pageW - M, y - 1); doc.setLineWidth(0.2);
    });
    y += 3;
  });

  finishPages();
  if (opts.save === false) return doc.output('blob');
  doc.save(opts.fileName);
  return null;
}
