import type { Cluster } from './types';

export type SkillType = 'Must Have' | 'Nice To Have' | 'HR';

export interface FlatSkillRow {
  skillType: SkillType;
  name: string;
  clusterName: string;
  clusterPriority: string;
  score: number;
  level: string;
  feedback: string;
}

const HEADERS = ['Skill Type', 'Skill Name', 'Cluster', 'Cluster Priority', 'Score (0-10)', 'Level', 'AI Feedback'];

export function flattenCoverageRows(
  mustHaveClusters: Cluster[],
  niceToHaveClusters: Cluster[],
): FlatSkillRow[] {
  const push = (clusters: Cluster[], skillType: SkillType): FlatSkillRow[] =>
    clusters.flatMap(c =>
      c.skills.map(s => ({
        skillType,
        name: s.name,
        clusterName: c.name,
        clusterPriority: `${c.priority} Priority`,
        score: Math.round((s.score ?? 0) * 10) / 10,
        level: s.level,
        feedback: (s.feedback || '').replace(/\s+/g, ' ').trim(),
      })),
    );
  return [...push(mustHaveClusters, 'Must Have'), ...push(niceToHaveClusters, 'Nice To Have')];
}

function rowsAsMatrix(rows: FlatSkillRow[]): (string | number)[][] {
  return [
    HEADERS,
    ...rows.map(r => [r.skillType, r.name, r.clusterName, r.clusterPriority, r.score, r.level, r.feedback]),
  ];
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map(r =>
      r
        .map(v => {
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

export function exportCoverageCsv(rows: FlatSkillRow[], baseName: string) {
  const csv = toCsv(rowsAsMatrix(rows));
  triggerBlobDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `${baseName}.csv`,
  );
}

export async function exportCoverageXlsx(rows: FlatSkillRow[], baseName: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Skill Coverage');
  const widths = [14, 28, 28, 16, 10, 10, 60];
  ws.columns = HEADERS.map((h, i) => ({ header: h, key: h, width: widths[i] }));
  for (const r of rows) {
    ws.addRow([r.skillType, r.name, r.clusterName, r.clusterPriority, r.score, r.level, r.feedback]);
  }
  const buf = await wb.xlsx.writeBuffer();
  triggerBlobDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${baseName}.xlsx`,
  );
}
