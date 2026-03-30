'use client';

import { CheckCircle2, MinusCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface SkillScore {
  skill: string;
  score: number | null;   // 0-100
  band: string;
}

interface ClusterEntry {
  cluster_name: string;
  category: 'mth' | 'nth' | 'hr';
  section_name: string;
  section_pct: number;
  priority: number;
  weight: number;         // % share within the section
  band_score: number | null;  // 0-100
  band: string;
  skill_scores: SkillScore[];
  evaluated: number;
  total: number;
}

interface SectionScore {
  score: number | null;   // 0-100
  band: string;
  section_pct: number;
  section_name: string;
}

interface ClusterInsightsTabProps {
  clusterInsights: ClusterEntry[];
  capabilityScore?: number | null;
  sectionScores?: Record<string, SectionScore> | null;
}

const BAND_STYLES: Record<string, { badge: string; bar: string; text: string }> = {
  Strong:          { badge: 'bg-green-100 text-green-700 border-green-200',   bar: 'bg-green-500',  text: 'text-green-700' },
  Proficient:      { badge: 'bg-blue-100 text-blue-700 border-blue-200',      bar: 'bg-blue-500',   text: 'text-blue-700' },
  Developing:      { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', bar: 'bg-yellow-500', text: 'text-yellow-700' },
  Weak:            { badge: 'bg-red-100 text-red-700 border-red-200',         bar: 'bg-red-500',    text: 'text-red-700' },
  'Not Covered':   { badge: 'bg-gray-100 text-gray-500 border-gray-200',      bar: 'bg-gray-300',   text: 'text-gray-400' },
  'Not Evaluated': { badge: 'bg-gray-100 text-gray-400 border-gray-200',      bar: 'bg-gray-200',   text: 'text-gray-400' },
};

const SECTION_COLORS: Record<string, string> = {
  mth: 'border-l-purple-400 bg-purple-50/30',
  nth: 'border-l-indigo-400 bg-indigo-50/30',
  hr:  'border-l-teal-400 bg-teal-50/30',
};

const SECTION_HEADER_COLORS: Record<string, string> = {
  mth: 'bg-purple-50 border-purple-100 text-purple-900',
  nth: 'bg-indigo-50 border-indigo-100 text-indigo-900',
  hr:  'bg-teal-50 border-teal-100 text-teal-900',
};

function SkillIndicator({ band }: { band: string }) {
  if (band === 'Strong' || band === 'Proficient')
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
  if (band === 'Not Covered' || band === 'Not Evaluated')
    return <MinusCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
  return <AlertCircle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />;
}

function ScoreBar({ score, band, width = 'w-32' }: { score: number | null; band: string; width?: string }) {
  const styles = BAND_STYLES[band] ?? BAND_STYLES['Weak'];
  return (
    <div className={`${width} h-1.5 bg-gray-200 rounded-full overflow-hidden`}>
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${styles.bar}`}
        style={{ width: `${score ?? 0}%` }}
      />
    </div>
  );
}

export default function ClusterInsightsTab({ clusterInsights, capabilityScore, sectionScores }: ClusterInsightsTabProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!clusterInsights || clusterInsights.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">
        No cluster insights available for this interview.
      </div>
    );
  }

  // Group cluster entries by category (mth → nth → hr)
  const SECTION_ORDER = ['mth', 'nth', 'hr'];
  const grouped: Record<string, ClusterEntry[]> = {};
  for (const entry of clusterInsights) {
    const cat = entry.category || 'mth';
    (grouped[cat] = grouped[cat] || []).push(entry);
  }

  const toggleCluster = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">

      {/* ── Capability Score headline ── */}
      {capabilityScore != null && capabilityScore > 0 && (
        <div className="flex items-center justify-between bg-gray-900 text-white rounded-xl px-6 py-5">
          <div>
            <div className="text-sm font-medium text-gray-300">Overall Capability Score</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Weighted across all sections by recruiter-configured percentages
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">{capabilityScore}</div>
            <div className="text-xs text-gray-400">out of 100</div>
          </div>
        </div>
      )}

      {/* ── Section breakdown pills ── */}
      {sectionScores && Object.keys(sectionScores).length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {SECTION_ORDER.filter(cat => sectionScores[cat]).map(cat => {
            const sec = sectionScores[cat];
            const styles = BAND_STYLES[sec.band] ?? BAND_STYLES['Not Covered'];
            return (
              <div key={cat} className="border border-gray-200 rounded-lg p-3 bg-white text-center">
                <div className="text-xs text-gray-500 truncate">{sec.section_name}</div>
                <div className="text-xs text-gray-400">{sec.section_pct}% weight</div>
                <div className={`text-2xl font-bold mt-1 ${styles.text}`}>
                  {sec.score != null ? sec.score : '—'}
                </div>
                <div className="mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${styles.badge}`}>
                    {sec.band}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sections → Clusters → Skills ── */}
      {SECTION_ORDER.filter(cat => grouped[cat]?.length).map(cat => {
        const entries = grouped[cat];
        const sec = sectionScores?.[cat];
        const headerColor = SECTION_HEADER_COLORS[cat] || '';
        const borderColor = SECTION_COLORS[cat] || '';

        return (
          <div key={cat} className={`rounded-xl border overflow-hidden border-l-4 ${borderColor}`}>

            {/* Section header */}
            <div className={`flex items-center justify-between px-5 py-3 border-b ${headerColor}`}>
              <div>
                <span className="text-sm font-semibold">
                  {entries[0]?.section_name || cat.toUpperCase()}
                </span>
                <span className="ml-2 text-xs opacity-60">{entries[0]?.section_pct ?? 0}% of final score</span>
              </div>
              {sec?.score != null && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{sec.score}%</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${(BAND_STYLES[sec.band] ?? BAND_STYLES['Not Covered']).badge}`}>
                    {sec.band}
                  </span>
                </div>
              )}
            </div>

            {/* Clusters within this section */}
            <div className="divide-y divide-gray-100 bg-white">
              {entries.map((cluster, idx) => {
                const key = `${cat}-${idx}`;
                const isOpen = !collapsed.has(key);
                const styles = BAND_STYLES[cluster.band] ?? BAND_STYLES['Weak'];

                return (
                  <div key={idx}>
                    {/* Cluster header row */}
                    <button
                      onClick={() => toggleCluster(key)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{cluster.cluster_name}</span>
                            {/* Priority badge */}
                            <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded border border-gray-200">
                              P{cluster.priority}
                            </span>
                            {/* Weight within section */}
                            {cluster.weight > 0 && (
                              <span className="text-[10px] text-gray-400">
                                {cluster.weight}% share
                              </span>
                            )}
                          </div>
                          {/* Cluster score bar */}
                          {cluster.band_score != null && (
                            <div className="flex items-center gap-2 mt-1">
                              <ScoreBar score={cluster.band_score} band={cluster.band} width="w-36" />
                              <span className="text-xs text-gray-500">{cluster.band_score}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles.badge}`}>
                          {cluster.band}
                        </span>
                        <span className="text-xs text-gray-400">
                          {cluster.evaluated}/{cluster.total} skills
                        </span>
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </div>
                    </button>

                    {/* Skill rows — collapsible */}
                    {isOpen && cluster.skill_scores.length > 0 && (
                      <div className="border-t border-gray-50 bg-gray-50/50 divide-y divide-gray-50">
                        {cluster.skill_scores.map((s, si) => {
                          const ss = BAND_STYLES[s.band] ?? BAND_STYLES['Weak'];
                          return (
                            <div key={si} className="flex items-center gap-3 px-6 py-2.5">
                              <SkillIndicator band={s.band} />
                              <span className="text-sm text-gray-700 flex-1">{s.skill}</span>
                              {s.score != null ? (
                                <>
                                  <ScoreBar score={s.score} band={s.band} width="w-24" />
                                  <span className="text-xs font-medium text-gray-600 w-10 text-right">
                                    {s.score}%
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs border ${ss.badge}`}>
                                    {s.band}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 italic">Not evaluated</span>
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
          </div>
        );
      })}

    </div>
  );
}
