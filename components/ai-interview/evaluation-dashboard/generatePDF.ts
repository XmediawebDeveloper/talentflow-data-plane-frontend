import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Cluster } from './types';

export interface PDFViolation {
  kind: string;
  severity: 'low' | 'medium' | 'high' | string;
  count: number;
}

export interface PDFProctoring {
  riskLevel: 'Low' | 'Medium' | 'High' | string;
  totalViolations: number;
  highSeverityCount: number;
  autoTerminated?: boolean;
  breakdown?: PDFViolation[];
}

export interface PDFData {
  candidate: {
    name: string;
    email?: string;
    role: string;
  };
  interview: {
    mode: string;
    duration: string;
    date: string;
  };
  scores: {
    mustHave: number;
    niceToHave: number;
    hr: number;
    final: number;
  };
  mustHaveClusters: Cluster[];
  niceToHaveClusters: Cluster[];
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  aiSummary: string;
  proctoring?: PDFProctoring;
}

type RGB = [number, number, number];

export function generateEvaluationPDF(data: PDFData) {
  const doc = new jsPDF();
  let yPos = 20;
  let currentPage = 1;

  const PRIMARY_DARK: RGB = [30, 41, 59];
  const PRIMARY_GREEN: RGB = [16, 185, 129];
  const ACCENT_BLUE: RGB = [59, 130, 246];
  const TEXT_GRAY: RGB = [75, 85, 99];
  const LIGHT_GRAY: RGB = [243, 244, 246];
  const RISK_RED: RGB = [239, 68, 68];
  const RISK_AMBER: RGB = [245, 158, 11];

  const addPageHeader = (_pageNum: number) => {
    doc.setFillColor(...PRIMARY_DARK);
    doc.rect(0, 0, 210, 15, 'F');

    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('AI INTERVIEW EVALUATION PLATFORM', 15, 9);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${data.candidate.name} | ${data.candidate.role}`, 200, 9, { align: 'right' });
  };

  const addPageFooter = (pageNum: number, totalPages: number) => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(15, 282, 195, 282);

    doc.setFontSize(7);
    doc.setTextColor(...TEXT_GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('CONFIDENTIAL - FOR INTERNAL USE ONLY', 15, 287);
    doc.text(
      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      105,
      287,
      { align: 'center' },
    );
    doc.text(`Page ${pageNum} of ${totalPages}`, 195, 287, { align: 'right' });
  };

  const checkPageBreak = (_requiredSpace: number = 25) => {
    if (yPos > 265) {
      const totalPages = doc.getNumberOfPages();
      addPageFooter(currentPage, totalPages + 1);
      doc.addPage();
      currentPage++;
      addPageHeader(currentPage);
      yPos = 25;
    }
  };

  const addSectionHeader = (title: string) => {
    checkPageBreak(15);
    doc.setFillColor(...ACCENT_BLUE);
    doc.rect(15, yPos, 4, 8, 'F');

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY_DARK);
    doc.text(title, 22, yPos + 6);

    yPos += 12;
  };

  // ── PAGE 1: COVER + EXECUTIVE SUMMARY ───────────────────────────
  doc.setFillColor(...PRIMARY_DARK);
  doc.rect(0, 0, 210, 75, 'F');

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EVALUATION REPORT', 105, 20, { align: 'center' });

  doc.setDrawColor(...PRIMARY_GREEN);
  doc.setLineWidth(1.5);
  doc.line(60, 25, 150, 25);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_GREEN);
  doc.text(data.candidate.name, 105, 36, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(200, 200, 200);
  doc.text(data.candidate.role, 105, 43, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${data.interview.mode} Interview | ${data.interview.duration} | ${data.interview.date}`,
    105,
    50,
    { align: 'center' },
  );

  doc.setFillColor(...PRIMARY_GREEN);
  doc.roundedRect(50, 57, 45, 16, 3, 3, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.scores.final.toFixed(1)}`, 72.5, 67, { align: 'center' });
  doc.setFontSize(8);
  doc.text('/ 100', 72.5, 72, { align: 'center' });

  let recColor: RGB = PRIMARY_GREEN;
  if (data.recommendation === 'Strong Hire') recColor = [16, 185, 129];
  else if (data.recommendation === 'Hire') recColor = [245, 158, 11];
  else if (data.recommendation === 'Consider') recColor = [251, 191, 36];
  else recColor = [239, 68, 68];

  doc.setFillColor(...recColor);
  doc.roundedRect(115, 57, 45, 16, 3, 3, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(data.recommendation.toUpperCase(), 137.5, 67, { align: 'center' });

  yPos = 85;

  const scoreBoxes: { label: string; score: number; max: number; weight: string; color: RGB }[] = [
    { label: 'Must-Have Skills', score: data.scores.mustHave, max: 10, weight: '70%', color: [16, 185, 129] },
    { label: 'Nice-to-Have Skills', score: data.scores.niceToHave, max: 10, weight: '30%', color: [245, 158, 11] },
  ];

  scoreBoxes.forEach((box, idx) => {
    const xStart = 15 + idx * 60;
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(xStart, yPos, 58, 30, 2, 2, 'F');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_GRAY);
    doc.text(box.label.toUpperCase(), xStart + 3, yPos + 5);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...box.color);
    doc.text(`${box.score.toFixed(1)}`, xStart + 29, yPos + 16, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(...TEXT_GRAY);
    doc.text(`/ ${box.max}`, xStart + 29, yPos + 21, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...box.color);
    doc.text(`Weight: ${box.weight}`, xStart + 29, yPos + 27, { align: 'center' });
  });

  yPos += 38;

  doc.setFillColor(...ACCENT_BLUE);
  doc.rect(15, yPos, 4, 6, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_DARK);
  doc.text('EXECUTIVE SUMMARY', 22, yPos + 5);
  yPos += 10;

  const totalSkills =
    data.mustHaveClusters.reduce((sum, c) => sum + c.skills.length, 0) +
    data.niceToHaveClusters.reduce((sum, c) => sum + c.skills.length, 0);
  const totalClusters = data.mustHaveClusters.length + data.niceToHaveClusters.length;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value', 'Details']],
    body: [
      ['Final Score', `${data.scores.final.toFixed(2)} / 100`, `${((data.scores.final / 100) * 100).toFixed(0)}% Performance`],
      ['Must-Have Status', data.scores.mustHave >= 6.0 ? 'PASSED' : 'FAILED', `Threshold: 6.0 | Score: ${data.scores.mustHave.toFixed(2)}`],
      ['Skills Evaluated', `${totalSkills} skills`, `Across ${totalClusters} clusters`],
      ['Strengths / Development', `${data.strengths.length} / ${data.weaknesses.length}`, 'High performers / Areas to improve'],
    ],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY_DARK, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { halign: 'center', cellWidth: 35 },
      2: { cellWidth: 95 },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  if (data.candidate.email) {
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(15, yPos, 180, 8, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY_DARK);
    doc.text('Contact:', 18, yPos + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(data.candidate.email, 38, yPos + 5.5);
    yPos += 12;
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(15, 285, 195, 285);
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text('CONFIDENTIAL - FOR INTERNAL USE ONLY', 15, 289);
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    105,
    289,
    { align: 'center' },
  );
  doc.text('Page 1', 195, 289, { align: 'right' });

  // ── PAGE 2+: DETAILED ASSESSMENT ─────────────────────────────────
  doc.addPage();
  currentPage = 2;
  addPageHeader(currentPage);
  yPos = 25;

  addSectionHeader('CATEGORY PERFORMANCE BREAKDOWN');

  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'Score', 'Weight', 'Contribution', 'Status']],
    body: [
      ['Must-Have Skills', data.scores.mustHave.toFixed(2), '70%', (data.scores.mustHave * 0.7).toFixed(3), data.scores.mustHave >= 6.0 ? 'PASS' : 'FAIL'],
      ['Nice-to-Have Skills', data.scores.niceToHave.toFixed(2), '30%', (data.scores.niceToHave * 0.3).toFixed(3), '—'],
      ['', '', '', '', ''],
      ['WEIGHTED SUM', '', '100%', (data.scores.mustHave * 0.7 + data.scores.niceToHave * 0.3).toFixed(3), ''],
      ['FINAL SCORE (x10)', '', '', data.scores.final.toFixed(2), ''],
      ['HR Assessment', '—', '0% (review only)', '—', '—'],
    ],
    theme: 'grid',
    headStyles: { fillColor: PRIMARY_DARK, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center' },
    },
    didParseCell: (cellData: any) => {
      const text = cellData.cell.text[0] || '';
      if (text === 'PASS') {
        cellData.cell.styles.textColor = [16, 185, 129];
        cellData.cell.styles.fontStyle = 'bold';
      } else if (text === 'FAIL') {
        cellData.cell.styles.textColor = [239, 68, 68];
        cellData.cell.styles.fontStyle = 'bold';
      }
      if (cellData.row.index === 4 || cellData.row.index === 5) {
        cellData.cell.styles.fillColor = [220, 252, 231];
        cellData.cell.styles.fontStyle = 'bold';
      }
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Must-Have Skills Detail
  checkPageBreak(60);
  addSectionHeader('MUST-HAVE SKILLS - DETAILED ASSESSMENT');

  const mustHaveData: any[] = [['Cluster / Skill', 'Score', 'Level', 'Feedback']];
  data.mustHaveClusters.forEach(cluster => {
    mustHaveData.push([
      { content: `${cluster.name} (${cluster.priority} Priority, ${cluster.weight}% weight)`, styles: { fontStyle: 'bold', fillColor: [220, 252, 231] } },
      { content: (() => {
        const total = cluster.skills.length;
        const covered = cluster.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
        return total > 0 ? `${Math.round((covered / total) * 100)}%` : '0%';
      })(), styles: { fontStyle: 'bold', fillColor: [220, 252, 231], halign: 'center' } },
      { content: 'Coverage', styles: { fillColor: [220, 252, 231] } },
      { content: '', styles: { fillColor: [220, 252, 231] } },
    ]);
    cluster.skills.forEach(skill => {
      let levelColor: RGB = [0, 0, 0];
      if (skill.level === 'High') levelColor = [16, 185, 129];
      else if (skill.level === 'Medium') levelColor = [245, 158, 11];
      else levelColor = [239, 68, 68];

      mustHaveData.push([
        `  - ${skill.name}`,
        skill.score.toFixed(1),
        { content: skill.level, styles: { textColor: levelColor, fontStyle: 'bold' } },
        skill.feedback.substring(0, 80) + (skill.feedback.length > 80 ? '...' : ''),
      ]);
    });
  });

  autoTable(doc, {
    startY: yPos,
    head: [mustHaveData[0]],
    body: mustHaveData.slice(1),
    theme: 'grid',
    headStyles: { fillColor: PRIMARY_GREEN, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 25 },
      3: { cellWidth: 80 },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Nice-to-Have Skills Detail
  checkPageBreak(60);
  addSectionHeader('NICE-TO-HAVE SKILLS - DETAILED ASSESSMENT');

  const niceToHaveData: any[] = [['Cluster / Skill', 'Score', 'Level', 'Feedback']];
  data.niceToHaveClusters.forEach(cluster => {
    niceToHaveData.push([
      { content: `${cluster.name} (${cluster.priority} Priority, ${cluster.weight}% weight)`, styles: { fontStyle: 'bold', fillColor: [254, 243, 199] } },
      { content: (() => {
        const total = cluster.skills.length;
        const covered = cluster.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
        return total > 0 ? `${Math.round((covered / total) * 100)}%` : '0%';
      })(), styles: { fontStyle: 'bold', fillColor: [254, 243, 199], halign: 'center' } },
      { content: 'Coverage', styles: { fillColor: [254, 243, 199] } },
      { content: '', styles: { fillColor: [254, 243, 199] } },
    ]);
    cluster.skills.forEach(skill => {
      let levelColor: RGB = [0, 0, 0];
      if (skill.level === 'High') levelColor = [16, 185, 129];
      else if (skill.level === 'Medium') levelColor = [245, 158, 11];
      else levelColor = [239, 68, 68];

      niceToHaveData.push([
        `  - ${skill.name}`,
        skill.score.toFixed(1),
        { content: skill.level, styles: { textColor: levelColor, fontStyle: 'bold' } },
        skill.feedback.substring(0, 80) + (skill.feedback.length > 80 ? '...' : ''),
      ]);
    });
  });

  autoTable(doc, {
    startY: yPos,
    head: [niceToHaveData[0]],
    body: niceToHaveData.slice(1),
    theme: 'grid',
    headStyles: { fillColor: [245, 158, 11], fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 25 },
      3: { cellWidth: 80 },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Strengths
  checkPageBreak(40);
  addSectionHeader('IDENTIFIED STRENGTHS');

  data.strengths.forEach((strength, idx) => {
    checkPageBreak(12);
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(15, yPos, 180, 8, 1, 1, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PRIMARY_DARK);
    const strengthText = doc.splitTextToSize(`${idx + 1}. ${strength}`, 175);
    doc.text(strengthText, 18, yPos + 5);
    yPos += 10;
  });

  yPos += 5;

  // Weaknesses
  checkPageBreak(40);
  addSectionHeader('AREAS FOR DEVELOPMENT');

  data.weaknesses.forEach((weakness, idx) => {
    checkPageBreak(12);
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(15, yPos, 180, 8, 1, 1, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PRIMARY_DARK);
    const weaknessText = doc.splitTextToSize(`${idx + 1}. ${weakness}`, 175);
    doc.text(weaknessText, 18, yPos + 5);
    yPos += 10;
  });

  yPos += 5;

  // AI Summary
  checkPageBreak(50);
  addSectionHeader('AI-GENERATED ASSESSMENT');

  doc.setFillColor(243, 232, 255);
  doc.roundedRect(15, yPos, 180, 10, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(109, 40, 217);
  doc.text('Overall Performance Analysis', 20, yPos + 7);
  yPos += 15;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_GRAY);
  const summaryLines = doc.splitTextToSize(data.aiSummary || '', 175);
  summaryLines.forEach((line: string) => {
    checkPageBreak(6);
    doc.text(line, 20, yPos);
    yPos += 5;
  });

  yPos += 10;

  // Final Recommendation Box
  checkPageBreak(25);
  doc.setFillColor(...recColor);
  doc.roundedRect(15, yPos, 180, 20, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('FINAL HIRING RECOMMENDATION:', 20, yPos + 9);
  doc.setFontSize(16);
  doc.text(data.recommendation.toUpperCase(), 20, yPos + 17);
  yPos += 28;

  // ── VIOLATION / INTEGRITY SUMMARY — LAST SECTION ────────────────
  if (data.proctoring) {
    const p = data.proctoring;
    const riskRaw = (p.riskLevel || 'Low').toString();
    const risk = riskRaw.charAt(0).toUpperCase() + riskRaw.slice(1).toLowerCase();
    let riskColor: RGB = PRIMARY_GREEN;
    if (risk === 'High') riskColor = RISK_RED;
    else if (risk === 'Medium') riskColor = RISK_AMBER;

    checkPageBreak(60);
    addSectionHeader('VIOLATION SUMMARY');

    // Headline tile — "Integrity Status: <Risk>" + big count
    doc.setFillColor(...riskColor);
    doc.roundedRect(15, yPos, 180, 28, 2, 2, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`Integrity Status: ${risk} Risk`, 20, yPos + 9);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${p.totalViolations} total violation${p.totalViolations === 1 ? '' : 's'} detected`, 20, yPos + 17);

    // Big count on the right
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text(`${p.totalViolations}`, 185, yPos + 20, { align: 'right' });
    yPos += 34;

    // Support rows: high-severity count + auto-terminate flag
    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: [
        ['Total Violations', `${p.totalViolations}`],
        ['High-Severity Count', `${p.highSeverityCount}`],
        ['Auto-Terminated by Proctor', p.autoTerminated ? 'Yes' : 'No'],
        ['Risk Level', risk],
      ],
      theme: 'grid',
      headStyles: { fillColor: PRIMARY_DARK, fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 80 },
        1: { halign: 'center', cellWidth: 100 },
      },
      didParseCell: (cellData: any) => {
        if (cellData.section === 'body' && cellData.row.index === 3 && cellData.column.index === 1) {
          cellData.cell.styles.textColor = riskColor;
          cellData.cell.styles.fontStyle = 'bold';
        }
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    // Per-kind breakdown (if provided)
    if (p.breakdown && p.breakdown.length > 0) {
      checkPageBreak(30);
      autoTable(doc, {
        startY: yPos,
        head: [['Violation Kind', 'Severity', 'Count']],
        body: p.breakdown.map(v => [v.kind, (v.severity || 'low').toString().toUpperCase(), `${v.count}`]),
        theme: 'grid',
        headStyles: { fillColor: PRIMARY_DARK, fontSize: 9, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 100 },
          1: { halign: 'center', cellWidth: 40 },
          2: { halign: 'center', cellWidth: 40 },
        },
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Apply headers and footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(i, totalPages);
  }

  const fileName = `${data.candidate.name.replace(/\s+/g, '_')}_Evaluation_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
