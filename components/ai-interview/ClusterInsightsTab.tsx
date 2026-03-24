'use client';

import { CheckCircle2, MinusCircle, AlertCircle } from 'lucide-react';

interface SkillScore {
  skill: string;
  score: number | null;
  band: string;
}

interface ClusterInsight {
  cluster_name: string;
  category: 'mth' | 'nth' | 'hr';
  band: string;
  band_score: number;
  skill_scores: SkillScore[];
}

interface ClusterInsightsTabProps {
  clusterInsights: ClusterInsight[];
  capabilityScore?: number | null;
}

const BAND_STYLES: Record<string, { badge: string; bar: string }> = {
  Strong:      { badge: 'bg-green-100 text-green-700 border-green-200',   bar: 'bg-green-500' },
  Proficient:  { badge: 'bg-blue-100 text-blue-700 border-blue-200',     bar: 'bg-blue-500' },
  Developing:  { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', bar: 'bg-yellow-500' },
  Weak:        { badge: 'bg-red-100 text-red-700 border-red-200',        bar: 'bg-red-500' },
  'Not Covered': { badge: 'bg-gray-100 text-gray-500 border-gray-200',   bar: 'bg-gray-300' },
};

const CATEGORY_LABEL: Record<string, string> = {
  mth: 'Must-Have Skills',
  nth: 'Nice-to-Have Skills',
  hr:  'HR / Behavioral',
};

const CATEGORY_WEIGHT: Record<string, string> = {
  mth: '70%',
  nth: '20%',
  hr:  '10%',
};

function SkillIndicator({ band }: { band: string }) {
  if (band === 'Strong' || band === 'Proficient') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
  }
  if (band === 'Not Covered') {
    return <MinusCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
  }
  return <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />;
}

export default function ClusterInsightsTab({ clusterInsights, capabilityScore }: ClusterInsightsTabProps) {
  if (!clusterInsights || clusterInsights.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">
        No cluster insights available for this interview.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Capability Score headline */}
      {capabilityScore != null && capabilityScore > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-5 py-4">
          <div>
            <div className="text-sm font-medium text-gray-700">Weighted Capability Score</div>
            <div className="text-xs text-gray-400 mt-0.5">MTH 70% · NTH 20% · HR 10%</div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{capabilityScore}%</div>
        </div>
      )}

      {/* Cluster cards */}
      {clusterInsights.map((cluster, idx) => {
        const styles = BAND_STYLES[cluster.band] ?? BAND_STYLES['Weak'];
        return (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Cluster header */}
            <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{cluster.cluster_name}</span>
                  <span className="text-xs text-gray-400">{CATEGORY_LABEL[cluster.category]}</span>
                  {CATEGORY_WEIGHT[cluster.category] && (
                    <span className="text-xs text-gray-300">· weight {CATEGORY_WEIGHT[cluster.category]}</span>
                  )}
                </div>
                {/* Score bar */}
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${styles.bar}`}
                      style={{ width: `${cluster.band_score}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{cluster.band_score}%</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles.badge}`}>
                {cluster.band}
              </span>
            </div>

            {/* Skill rows */}
            {cluster.skill_scores.length > 0 && (
              <div className="divide-y divide-gray-50 bg-gray-50/50">
                {cluster.skill_scores.map((s, si) => {
                  const ss = BAND_STYLES[s.band] ?? BAND_STYLES['Weak'];
                  return (
                    <div key={si} className="flex items-center gap-3 px-5 py-2.5">
                      <SkillIndicator band={s.band} />
                      <span className="text-sm text-gray-700 flex-1">{s.skill}</span>
                      {s.score != null ? (
                        <>
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${ss.bar}`}
                              style={{ width: `${s.score}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600 w-10 text-right">{s.score}%</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${ss.badge}`}>{s.band}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Not covered</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
