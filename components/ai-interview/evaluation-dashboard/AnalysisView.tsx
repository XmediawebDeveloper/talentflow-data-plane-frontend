import { useState } from 'react';
import { SkillCard } from './SkillCard';
import { SkillRadarChart } from './SkillRadarChart';
import { EvaluationBreakdown } from './EvaluationBreakdown';
import { TimedEvaluationBreakdown } from './TimedEvaluationBreakdown';
import { Target, TrendingUp, CheckCircle2, Circle } from 'lucide-react';
import type { DashboardData } from './types';

export function AnalysisView({ data }: { data: DashboardData }) {
  const [expanded, setExpanded] = useState<number[]>(
    data.mustHaveClusters.length > 0 ? [data.mustHaveClusters[0].clusterNumber] : []
  );
  const toggle = (n: number) =>
    setExpanded(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const allClusters = [...data.mustHaveClusters, ...data.niceToHaveClusters];
  const allSkills = allClusters.flatMap(c => c.skills.map(s => ({ ...s, clusterName: c.name })));
  const coveredSkillNames = new Set(data.interviewResponses.flatMap(r => r.skillsCovered.map(s => s.toLowerCase())));
  const covered = allSkills.filter(s => coveredSkillNames.has(s.name.toLowerCase()) || s.score > 0);
  const coveragePct = allSkills.length > 0 ? (covered.length / allSkills.length) * 100 : 0;

  const mthTotal = data.mustHaveClusters.reduce((a, c) => a + c.skills.length, 0);
  const mthCov = data.mustHaveClusters.reduce((a, c) => a + c.skills.filter(s => s.score > 0).length, 0);
  const mthPct = mthTotal > 0 ? (mthCov / mthTotal) * 100 : 0;
  const nthTotal = data.niceToHaveClusters.reduce((a, c) => a + c.skills.length, 0);
  const nthCov = data.niceToHaveClusters.reduce((a, c) => a + c.skills.filter(s => s.score > 0).length, 0);
  const nthPct = nthTotal > 0 ? (nthCov / nthTotal) * 100 : 0;
  const avgCovered = covered.length > 0 ? covered.reduce((a, s) => a + s.score, 0) / covered.length : 0;

  return (
    <div className="space-y-8">
      {/* Coverage summary cards */}
      <div className="tf-grid-stats lg:gap-6">
        <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
          <div className="text-xs text-blue-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Questions Asked</div>
          <div className="text-3xl sm:text-4xl text-blue-900 mb-1 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{data.questionsAsked}</div>
          <div className="text-xs text-blue-600">assessment coverage</div>
        </div>
        <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200">
          <div className="text-xs text-emerald-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Skills Assessed</div>
          <div className="text-3xl sm:text-4xl text-emerald-900 mb-1 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{covered.length}/{allSkills.length}</div>
          <div className="text-xs text-emerald-600">{Math.round(coveragePct)}% coverage</div>
        </div>
        <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
          <div className="text-xs text-purple-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Avg Performance</div>
          <div className="text-3xl sm:text-4xl text-purple-900 mb-1 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(avgCovered)}</div>
          <div className="text-xs text-purple-600">on assessed skills</div>
        </div>
        <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
          <div className="text-xs text-amber-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Final Score</div>
          <div className="text-3xl sm:text-4xl text-amber-900 mb-1 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.scores.final)}</div>
          <div className="text-xs text-amber-600">out of 100</div>
        </div>
      </div>

      {/* Category Coverage */}
      <div className="tf-grid-2">
        <div className="tf-card-soft p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><Target size={20} className="text-emerald-600" /></div>
            <div>
              <h3 className="text-lg font-semibold">Must-Have Skills Coverage</h3>
              <p className="tf-meta">Critical competencies (70% weight)</p>
            </div>
          </div>
          <div className="flex items-end gap-3 mb-4">
            <div className="text-5xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(mthPct)}%</div>
            <div className="tf-body-muted mb-2" style={{ fontFamily: 'var(--font-mono)' }}>{mthCov}/{mthTotal} skills</div>
          </div>
          <div className="w-full h-4 bg-emerald-200 rounded-full overflow-hidden mb-4">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500" style={{ width: `${mthPct}%` }} />
          </div>
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-xs text-emerald-700 mb-2 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Category Score</div>
            <div className="text-3xl text-emerald-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.scores.mustHave)}</div>
            <div className="text-xs text-emerald-600 mt-1">out of 10.00</div>
          </div>
        </div>

        <div className="tf-card-soft p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><TrendingUp size={20} className="text-amber-600" /></div>
            <div>
              <h3 className="text-lg font-semibold">Nice-to-Have Skills Coverage</h3>
              <p className="tf-meta">Additional competencies (20% weight)</p>
            </div>
          </div>
          <div className="flex items-end gap-3 mb-4">
            <div className="text-5xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(nthPct)}%</div>
            <div className="tf-body-muted mb-2" style={{ fontFamily: 'var(--font-mono)' }}>{nthCov}/{nthTotal} skills</div>
          </div>
          <div className="w-full h-4 bg-amber-200 rounded-full overflow-hidden mb-4">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500" style={{ width: `${nthPct}%` }} />
          </div>
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-xs text-amber-700 mb-2 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Category Score</div>
            <div className="text-3xl text-amber-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.scores.niceToHave)}</div>
            <div className="text-xs text-amber-600 mt-1">out of 10.00</div>
          </div>
        </div>
      </div>

      {/* Cluster Analysis */}
      {data.mustHaveClusters.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg sm:text-2xl font-bold">Must-Have Skills Analysis</h2>
            <p className="tf-body-muted">Core competencies • {Math.round(mthPct)}% assessed</p>
          </div>
          <div className="space-y-4">
            {data.mustHaveClusters.map(c => (
              <SkillCard key={c.clusterNumber} cluster={c} expanded={expanded.includes(c.clusterNumber)} onToggle={() => toggle(c.clusterNumber)} />
            ))}
          </div>
        </div>
      )}

      {data.niceToHaveClusters.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg sm:text-2xl font-bold">Nice-to-Have Skills Analysis</h2>
            <p className="tf-body-muted">Additional competencies • {Math.round(nthPct)}% assessed</p>
          </div>
          <div className="space-y-4">
            {data.niceToHaveClusters.map(c => (
              <SkillCard key={c.clusterNumber} cluster={c} expanded={expanded.includes(c.clusterNumber)} onToggle={() => toggle(c.clusterNumber)} />
            ))}
          </div>
        </div>
      )}

      {/* Radar + Breakdown.
       *
       * Timed mode follows the doc spec: skill → weighted question score →
       * section avg → MHS≥7 pass/fail gate. The TimedEvaluationBreakdown
       * renders the actual per-question math with real numbers, so it gets a
       * full-width row below the radar.
       *
       * Conversational mode keeps the legacy 70/20/10 weighted breakdown
       * (cluster-weighted, scaled to 0-100). */}
      {allClusters.length > 0 && data.interview.mode === 'Timed' ? (
        <>
          <div className="grid grid-cols-1 gap-8">
            <SkillRadarChart mustHaveClusters={data.mustHaveClusters} niceToHaveClusters={data.niceToHaveClusters} />
          </div>
          <TimedEvaluationBreakdown data={data} />
        </>
      ) : allClusters.length > 0 && (
        <div className="tf-grid-2 md:gap-8">
          <SkillRadarChart mustHaveClusters={data.mustHaveClusters} niceToHaveClusters={data.niceToHaveClusters} />
          <EvaluationBreakdown mustHaveScore={data.scores.mustHave} niceToHaveScore={data.scores.niceToHave} hrScore={data.scores.hr} finalScore={data.scores.final} mustHaveClusters={data.mustHaveClusters} niceToHaveClusters={data.niceToHaveClusters} weights={data.weights} sectionsPresent={data.sectionsPresent} />
        </div>
      )}

      {/* Skills Coverage Status */}
      {allSkills.length > 0 && (
        <div className="tf-card-soft p-4 sm:p-6 lg:p-8">
          <h2 className="text-lg sm:text-2xl font-bold mb-6">Skills Coverage Status</h2>
          <p className="tf-body-muted mb-6">Which skills were assessed during the interview</p>
          <div className="tf-grid-2">
            {allSkills.map((skill, idx) => {
              const isCovered = skill.score > 0 || coveredSkillNames.has(skill.name.toLowerCase());
              return (
                <div key={idx} className={`p-4 rounded-lg border transition-all ${isCovered ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isCovered ? <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" /> : <Circle size={18} className="text-gray-400 flex-shrink-0" />}
                      <div>
                        <div className="text-sm font-medium">{skill.name}</div>
                        <div className="tf-meta">{skill.clusterName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isCovered && skill.level && (
                        <div className={`text-xs px-2 py-1 rounded font-semibold ${
                          skill.level === 'High' ? 'bg-emerald-100 text-emerald-700' :
                          skill.level === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-orange-100 text-orange-700'
                        }`} style={{ fontFamily: 'var(--font-mono)' }}>
                          {skill.level}
                        </div>
                      )}
                      <span className={`text-xs uppercase tracking-wider font-semibold ${isCovered ? 'text-emerald-700' : 'text-gray-400'}`} style={{ fontFamily: 'var(--font-mono)' }}>
                        {isCovered ? 'Assessed' : 'Not Tested'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
