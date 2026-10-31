import { AlertCircle } from 'lucide-react';
import type { Cluster, Level } from './types';

interface SkillCardProps {
  cluster: Cluster;
  expanded: boolean;
  onToggle: () => void;
}

function getLevelStyle(level: Level) {
  switch (level) {
    case 'High':   return { bg: 'var(--score-high-bg)', text: 'var(--score-high)', border: 'var(--score-high)' };
    case 'Medium': return { bg: 'var(--score-medium-bg)', text: 'var(--score-medium)', border: 'var(--score-medium)' };
    case 'Low':    return { bg: 'var(--score-low-bg)', text: 'var(--score-low)', border: 'var(--score-low)' };
  }
}

export function SkillCard({ cluster, expanded, onToggle }: SkillCardProps) {
  const priorityStyle = getLevelStyle(cluster.priority);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-all">
      <button
        onClick={onToggle}
        className="w-full p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold"
              style={{
                background: `linear-gradient(135deg, ${priorityStyle.border} 0%, ${priorityStyle.text} 100%)`,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {cluster.clusterNumber}
            </div>
          </div>

          <div className="text-left">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-xl font-semibold">{cluster.name}</h3>
              <span
                className="px-3 py-1 rounded-full text-xs uppercase tracking-wider"
                style={{
                  background: priorityStyle.bg,
                  color: priorityStyle.text,
                  fontFamily: 'var(--font-mono)',
                  border: `1px solid ${priorityStyle.border}`,
                }}
              >
                {cluster.priority} Priority
              </span>
            </div>
            <p className="tf-body-muted">
              Weight: <span style={{ fontFamily: 'var(--font-mono)' }}>{cluster.weight}%</span> • {cluster.skills.length} skill{cluster.skills.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {(() => {
          const totalSkills = cluster.skills.length;
          const coveredCount = cluster.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
          const coveragePct = totalSkills > 0 ? Math.round((coveredCount / totalSkills) * 100) : 0;
          return (
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="tf-body-muted mb-1">Coverage</div>
                <div className="text-3xl font-bold" style={{ fontFamily: 'var(--font-mono)', color: priorityStyle.border }}>
                  {coveragePct}%
                </div>
                <div className="text-2xs text-gray-500 mt-0.5">{coveredCount}/{totalSkills} skills</div>
              </div>
              <div className="w-32 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${coveragePct}%`,
                    background: `linear-gradient(90deg, ${priorityStyle.border} 0%, ${priorityStyle.text} 100%)`,
                  }}
                />
              </div>
            </div>
          );
        })()}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-3">
          {cluster.skills.map((skill, idx) => {
            const levelStyle = getLevelStyle(skill.level);
            return (
              <div key={idx} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-900/40 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold"
                      style={{
                        background: levelStyle.bg,
                        color: levelStyle.text,
                        fontFamily: 'var(--font-mono)',
                        border: `1px solid ${levelStyle.border}`,
                      }}
                    >
                      {Math.round(skill.score)}
                    </div>
                    <div>
                      <h4 className="text-base font-medium">{skill.name}</h4>
                      <span
                        className="text-xs uppercase tracking-wider"
                        style={{ color: levelStyle.text, fontFamily: 'var(--font-mono)' }}
                      >
                        {skill.level} Proficiency
                      </span>
                    </div>
                  </div>
                  <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(skill.score / 10) * 100}%`,
                        background: levelStyle.border,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2 mt-3 text-sm text-gray-600 dark:text-gray-400">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: levelStyle.text }} />
                  <p>{skill.feedback}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
