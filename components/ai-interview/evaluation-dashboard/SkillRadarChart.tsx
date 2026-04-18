import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { Cluster } from './types';

interface Props {
  mustHaveClusters: Cluster[];
  niceToHaveClusters: Cluster[];
}

export function SkillRadarChart({ mustHaveClusters, niceToHaveClusters }: Props) {
  const data = [
    ...mustHaveClusters.map(c => ({ cluster: c.name, score: c.clusterScore })),
    ...niceToHaveClusters.map(c => ({ cluster: c.name, score: c.clusterScore })),
  ];

  const allSkills = [...mustHaveClusters, ...niceToHaveClusters].flatMap(c => c.skills);

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-2xl font-bold mb-2">Skill Coverage Analysis</h2>
        <p className="text-gray-500">No cluster data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
      <h2 className="text-2xl font-bold mb-2">Skill Coverage Analysis</h2>
      <p className="text-gray-500 mb-6">Visual breakdown of performance across all skill clusters</p>

      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={data}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="cluster" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 10 }} />
          <Radar name="Performance" dataKey="score" stroke="var(--score-high)" fill="var(--score-high)" fillOpacity={0.3} strokeWidth={2} />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100/30 border border-emerald-200">
          <div className="text-xs text-emerald-700 uppercase tracking-wider mb-1 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>High Level Skills</div>
          <div className="text-2xl text-emerald-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
            {allSkills.filter(s => s.level === 'High').length}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100/30 border border-amber-200">
          <div className="text-xs text-amber-700 uppercase tracking-wider mb-1 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Medium Level Skills</div>
          <div className="text-2xl text-amber-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
            {allSkills.filter(s => s.level === 'Medium').length}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-gradient-to-br from-red-50 to-red-100/30 border border-red-200">
          <div className="text-xs text-red-700 uppercase tracking-wider mb-1 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Low Level Skills</div>
          <div className="text-2xl text-red-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
            {allSkills.filter(s => s.level === 'Low').length}
          </div>
        </div>
      </div>
    </div>
  );
}
