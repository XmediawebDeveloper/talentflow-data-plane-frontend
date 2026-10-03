import type { Cluster } from './types';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';

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

export const COVERAGE_EXPORT_HEADERS = ['Skill Type', 'Skill Name', 'Cluster', 'Cluster Priority', 'Score (0-10)', 'Level', 'AI Feedback'];

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

/** Writes the skill-coverage table as CSV or .xlsx (picked in ExportFormatModal). */
export async function exportCoverage(format: ExportFileFormat, rows: FlatSkillRow[], baseName: string) {
  await exportRows(
    format,
    COVERAGE_EXPORT_HEADERS,
    rows.map(r => [r.skillType, r.name, r.clusterName, r.clusterPriority, r.score, r.level, r.feedback]),
    baseName,
    { sheetName: 'Skill Coverage' },
  );
}
