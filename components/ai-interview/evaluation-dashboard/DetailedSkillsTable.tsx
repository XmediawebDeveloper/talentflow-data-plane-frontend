import { Table2 } from 'lucide-react';
import type { Cluster, Level } from './types';
import { ExportMenu } from './ExportMenu';
import { COVERAGE_EXPORT_HEADERS, exportCoverage, flattenCoverageRows } from './coverageExport';

interface Props {
  mustHaveClusters: Cluster[];
  niceToHaveClusters: Cluster[];
  /** Optional filename stem for exports (defaults to "Skill_Coverage"). */
  exportName?: string;
}

function getLevelStyle(level: Level) {
  switch (level) {
    case 'High':   return { bg: 'var(--score-high-bg)', text: 'var(--score-high)', border: 'var(--score-high)' };
    case 'Medium': return { bg: 'var(--score-medium-bg)', text: 'var(--score-medium)', border: 'var(--score-medium)' };
    case 'Low':    return { bg: 'var(--score-low-bg)', text: 'var(--score-low)', border: 'var(--score-low)' };
  }
}

type SkillType = 'Must Have' | 'Nice To Have' | 'HR';

function skillTypeStyle(t: SkillType) {
  if (t === 'Must Have') return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  if (t === 'Nice To Have') return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
}

export function DetailedSkillsTable({ mustHaveClusters, niceToHaveClusters, exportName = 'Skill_Coverage' }: Props) {
  const allSkills = [
    ...mustHaveClusters.flatMap(c =>
      c.skills.map(s => ({ ...s, clusterName: c.name, clusterPriority: c.priority, skillType: 'Must Have' as SkillType })),
    ),
    ...niceToHaveClusters.flatMap(c =>
      c.skills.map(s => ({ ...s, clusterName: c.name, clusterPriority: c.priority, skillType: 'Nice To Have' as SkillType })),
    ),
  ];

  const exportRows = flattenCoverageRows(mustHaveClusters, niceToHaveClusters);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
          <Table2 size={20} className="text-purple-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Detailed Skills Table</h2>
          <p className="text-sm text-gray-500">Comprehensive view of all evaluated skills</p>
        </div>
        <ExportMenu
          title="Export Skill Coverage"
          recordCount={exportRows.length}
          columns={COVERAGE_EXPORT_HEADERS}
          onExport={format => exportCoverage(format, exportRows, exportName)}
        />
      </div>

      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full">
          <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="text-left p-4 text-xs text-gray-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Skill Type</th>
              <th className="text-left p-4 text-xs text-gray-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Skill Name</th>
              <th className="text-left p-4 text-xs text-gray-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Cluster</th>
              <th className="text-center p-4 text-xs text-gray-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Score</th>
              <th className="text-center p-4 text-xs text-gray-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Level</th>
              <th className="text-left p-4 text-xs text-gray-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>AI Feedback</th>
            </tr>
          </thead>
          <tbody>
            {allSkills.map((skill, idx) => {
              const ls = getLevelStyle(skill.level);
              const cs = getLevelStyle(skill.clusterPriority);
              const ts = skillTypeStyle(skill.skillType);
              return (
                <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/20 transition-colors">
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-1 text-2xs font-semibold rounded-full border ${ts.bg} ${ts.text} ${ts.border}`}>
                      {skill.skillType}
                    </span>
                  </td>
                  <td className="p-4"><div className="font-medium">{skill.name}</div></td>
                  <td className="p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">{skill.clusterName}</div>
                    <div className="text-xs uppercase tracking-wider mt-1 font-semibold" style={{ color: cs.text, fontFamily: 'var(--font-mono)' }}>
                      {skill.clusterPriority} Priority
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col items-center">
                      <div className="px-3 py-1 rounded-lg text-lg font-semibold" style={{ background: ls.bg, color: ls.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ls.border}` }}>
                        {Math.round(skill.score)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">/ 10</div>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold" style={{ background: ls.bg, color: ls.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ls.border}` }}>
                      {skill.level}
                    </span>
                  </td>
                  <td className="p-4"><p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">{skill.feedback}</p></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-gray-500">
          Total Skills Evaluated: <span style={{ fontFamily: 'var(--font-mono)' }}>{allSkills.length}</span>
        </div>
        <div className="flex gap-4 flex-wrap">
          {(['High', 'Medium', 'Low'] as Level[]).map(lvl => (
            <div key={lvl} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: `var(--score-${lvl.toLowerCase()})` }}></div>
              <span className="text-xs text-gray-500">{lvl}: {allSkills.filter(s => s.level === lvl).length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
