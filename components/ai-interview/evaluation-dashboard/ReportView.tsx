import { Clock, User, Briefcase, Calendar, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import type { DashboardData, Level } from './types';
import { EvaluationBreakdown } from './EvaluationBreakdown';
import { MobileRecordList, MobileRecordCard, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';

function getLevelStyle(level: Level) {
  switch (level) {
    case 'High':   return { bg: 'var(--score-high-bg)', text: 'var(--score-high)', border: 'var(--score-high)' };
    case 'Medium': return { bg: 'var(--score-medium-bg)', text: 'var(--score-medium)', border: 'var(--score-medium)' };
    case 'Low':    return { bg: 'var(--score-low-bg)', text: 'var(--score-low)', border: 'var(--score-low)' };
  }
}

export function ReportView({ data }: { data: DashboardData }) {
  const allClusters = [...data.mustHaveClusters, ...data.niceToHaveClusters];
  const allSkills = allClusters.flatMap(c => c.skills.map(s => ({ ...s, clusterName: c.name })));
  const rec = data.recommendation;
  const recColor =
    rec === 'Strong Hire' ? 'var(--score-high)' :
    rec === 'Hire' ? 'var(--score-high)' :
    rec === 'Consider' ? 'var(--score-medium)' :
    'var(--score-low)';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl p-4 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="tf-page-title mb-2">Final Evaluation Report</h1>
            <p className="text-gray-300">Comprehensive candidate assessment and analysis</p>
          </div>
          {data.interview.date && (
            <div className="text-right">
              <div className="tf-body-muted mb-1">Generated on</div>
              <div className="text-lg" style={{ fontFamily: 'var(--font-mono)' }}>{data.interview.date}</div>
            </div>
          )}
        </div>
      </div>

      {/* 1. Candidate Summary */}
      <div className="tf-card-soft p-4 sm:p-6 lg:p-8">
        <h2 className="text-lg sm:text-2xl font-bold mb-6">1. Candidate Summary</h2>
        <div className="tf-grid-2">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><User size={20} className="text-blue-600" /></div>
              <div>
                <div className="tf-meta">Candidate Name</div>
                <div className="text-lg font-medium">{data.candidate.name}</div>
                {data.candidate.email && <div className="tf-meta">{data.candidate.email}</div>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center"><Briefcase size={20} className="text-purple-600" /></div>
              <div>
                <div className="tf-meta">Role / Job</div>
                <div className="text-lg font-medium">{data.candidate.role}</div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><Calendar size={20} className="text-emerald-600" /></div>
              <div>
                <div className="tf-meta">Interview Mode</div>
                <div className="text-lg font-medium">{data.interview.mode}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><Clock size={20} className="text-amber-600" /></div>
              <div>
                <div className="tf-meta">Interview Duration</div>
                <div className="text-lg font-medium" style={{ fontFamily: 'var(--font-mono)' }}>{data.interview.duration}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Skill-Level Breakdown */}
      {allSkills.length > 0 && (
        <div className="tf-card-soft overflow-hidden">
          <div className="p-4 sm:p-6 lg:p-8 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg sm:text-2xl font-bold mb-2">2. Skill-Level Breakdown</h2>
            <p className="tf-body-muted">Detailed assessment of each individual skill</p>
          </div>
          <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
            <table className="w-full">
              <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="tf-th-cell text-left tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Skill</th>
                  <th className="tf-th-cell text-center tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Coverage</th>
                  <th className="tf-th-cell text-center tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Score</th>
                  <th className="tf-th-cell text-left tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Insight</th>
                </tr>
              </thead>
              <tbody>
                {allSkills.map((skill, idx) => {
                  const ls = getLevelStyle(skill.level);
                  return (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/20">
                      <td className="tf-td">
                        <div className="font-medium">{skill.name}</div>
                        <div className="tf-meta mt-1">{skill.clusterName}</div>
                      </td>
                      <td className="tf-td text-center">
                        <span className="px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold" style={{ background: ls.bg, color: ls.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ls.border}` }}>
                          {skill.level}
                        </span>
                      </td>
                      <td className="tf-td">
                        <div className="flex flex-col items-center">
                          <div className="px-4 py-2 rounded-lg text-xl font-semibold" style={{ background: ls.bg, color: ls.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ls.border}` }}>
                            {Math.round(skill.score)}
                          </div>
                          <div className="tf-meta mt-1">/ 10</div>
                        </div>
                      </td>
                      <td className="tf-td"><p className="tf-body-secondary max-w-lg">{skill.feedback}</p></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <MobileRecordList className="p-3">
            {allSkills.map((skill, idx) => {
              const ls = getLevelStyle(skill.level);
              return (
                <MobileRecordCard
                  key={idx}
                  badges={
                    <span className="px-3 py-1 rounded-full text-xs uppercase tracking-wider font-semibold" style={{ background: ls.bg, color: ls.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ls.border}` }}>
                      {skill.level}
                    </span>
                  }
                  title={skill.name}
                  footer={
                    <span className="px-2.5 py-0.5 rounded-lg text-base font-semibold" style={{ background: ls.bg, color: ls.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ls.border}` }}>
                      {Math.round(skill.score)}<span className="tf-meta ml-0.5">/ 10</span>
                    </span>
                  }
                  fields={[
                    { label: 'Cluster', value: skill.clusterName },
                    { label: 'Insight', value: skill.feedback },
                  ]}
                />
              );
            })}
          </MobileRecordList>
        </div>
      )}

      {/* 3. Cluster-Level Coverage Summary */}
      {allClusters.length > 0 && (
        <div className="tf-card-soft p-4 sm:p-6 lg:p-8">
          <h2 className="text-lg sm:text-2xl font-bold mb-2">3. Cluster-Level Coverage Summary</h2>
          <p className="tf-body-muted mb-6">Skills addressed at adequate level across each cluster</p>
          <div className={`overflow-x-auto tf-table-shell ${DESKTOP_TABLE_ONLY}`}>
            <table className="w-full">
              <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="tf-th-cell text-left tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Cluster</th>
                  <th className="tf-th-cell text-center tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Skills Included</th>
                  <th className="tf-th-cell text-center tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Coverage %</th>
                  <th className="tf-th-cell text-center tf-th" style={{ fontFamily: 'var(--font-mono)' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {allClusters.map((c, idx) => {
                  const ps = getLevelStyle(c.priority);
                  const totalSkills = c.skills.length;
                  const coveredCount = c.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
                  const coveragePct = totalSkills > 0 ? Math.round((coveredCount / totalSkills) * 100) : 0;
                  return (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/20">
                      <td className="tf-td">
                        <div className="font-medium">{c.name}</div>
                        <span className="text-xs uppercase tracking-wider mt-1 inline-block font-semibold" style={{ color: ps.text, fontFamily: 'var(--font-mono)' }}>
                          {c.priority} Priority
                        </span>
                      </td>
                      <td className="tf-td text-center">
                        <div className="tf-body-secondary">{c.skills.map(s => s.name).join(', ')}</div>
                      </td>
                      <td className="tf-td">
                        <div className="flex flex-col items-center">
                          <div className="px-4 py-2 rounded-lg text-xl font-semibold" style={{ background: ps.bg, color: ps.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ps.border}` }}>
                            {coveragePct}%
                          </div>
                          <div className="tf-meta mt-1">{coveredCount}/{totalSkills} skills</div>
                        </div>
                      </td>
                      <td className="tf-td text-center">
                        <div className="text-lg font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{c.weight}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <MobileRecordList>
            {allClusters.map((c, idx) => {
              const ps = getLevelStyle(c.priority);
              const totalSkills = c.skills.length;
              const coveredCount = c.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
              const coveragePct = totalSkills > 0 ? Math.round((coveredCount / totalSkills) * 100) : 0;
              return (
                <MobileRecordCard
                  key={idx}
                  badges={
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: ps.text, fontFamily: 'var(--font-mono)' }}>
                      {c.priority} Priority
                    </span>
                  }
                  title={c.name}
                  footer={
                    <span className="px-2.5 py-0.5 rounded-lg text-base font-semibold" style={{ background: ps.bg, color: ps.text, fontFamily: 'var(--font-mono)', border: `1px solid ${ps.border}` }}>
                      {coveragePct}%
                    </span>
                  }
                  fields={[
                    { label: 'Coverage', value: `${coveredCount}/${totalSkills} skills` },
                    { label: 'Weight', value: <span style={{ fontFamily: 'var(--font-mono)' }}>{c.weight}%</span> },
                    { label: 'Skills Included', value: c.skills.map(s => s.name).join(', ') },
                  ]}
                />
              );
            })}
          </MobileRecordList>
        </div>
      )}

      {/* 4. Section Scores — HR excluded (review only, not scored) */}
      <div className="tf-card-soft p-4 sm:p-6 lg:p-8">
        <h2 className="text-lg sm:text-2xl font-bold mb-6">4. Section-Level Scores</h2>
        <div className="tf-grid-2">
          <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-2 border-emerald-200">
            <div className="text-xs text-emerald-700 uppercase tracking-wider mb-3 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Must-Have (MHS)</div>
            <div className="text-3xl sm:text-4xl text-emerald-900 mb-2 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.scores.mustHave)}</div>
            <div className="text-xs text-emerald-600">Weighted cluster score</div>
            {data.mustHaveClusters.length > 0 && (
              <div className="mt-4 pt-4 border-t border-emerald-300">
                <div className="text-xs text-emerald-700 mb-2 font-semibold">Contributing Clusters:</div>
                {data.mustHaveClusters.map((c, idx) => (
                  <div key={idx} className="text-xs text-emerald-800 flex justify-between">
                    <span>{c.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{c.weight}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border-2 border-amber-200">
            <div className="text-xs text-amber-700 uppercase tracking-wider mb-3 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Nice-to-Have (NHS)</div>
            <div className="text-3xl sm:text-4xl text-amber-900 mb-2 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.scores.niceToHave)}</div>
            <div className="text-xs text-amber-600">Weighted cluster score</div>
            {data.niceToHaveClusters.length > 0 && (
              <div className="mt-4 pt-4 border-t border-amber-300">
                <div className="text-xs text-amber-700 mb-2 font-semibold">Contributing Clusters:</div>
                {data.niceToHaveClusters.map((c, idx) => (
                  <div key={idx} className="text-xs text-amber-800 flex justify-between">
                    <span>{c.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{c.weight}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Evaluation Breakdown — full scoring methodology */}
      <EvaluationBreakdown
        mustHaveScore={data.scores.mustHave}
        niceToHaveScore={data.scores.niceToHave}
        finalScore={data.scores.final}
        mustHaveClusters={data.mustHaveClusters}
        niceToHaveClusters={data.niceToHaveClusters}
        weights={data.weights}
        sectionsPresent={data.sectionsPresent}
      />

      {/* 6. Final Overall Score */}
      <div className="bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-4 sm:p-6 lg:p-8 border-2 border-gray-300 dark:border-gray-600">
        <h2 className="text-lg sm:text-2xl font-bold mb-6">6. Final Overall Score</h2>
        <div className="tf-grid-2 md:gap-8">
          <div>
            <div className="tf-panel mb-4 p-4">
              <div className="tf-eyebrow mb-2" style={{ fontFamily: 'var(--font-mono)' }}>Calculation Formula</div>
              <code className="text-sm block" style={{ fontFamily: 'var(--font-mono)' }}>Final Score = [(MHS × 70%) + (NHS × 30%)] × 10  ·  HR excluded (review only)</code>
            </div>
            <div className="space-y-2 text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
              <div className="flex justify-between p-2 rounded bg-emerald-50 text-emerald-900"><span>MHS × 0.70</span><span>= {Math.round((data.scores.mustHave * 0.7))}</span></div>
              <div className="flex justify-between p-2 rounded bg-amber-50 text-amber-900"><span>NHS × 0.30</span><span>= {Math.round((data.scores.niceToHave * 0.3))}</span></div>
              <div className="border-t-2 border-gray-300 pt-2 mt-2"></div>
              <div className="flex justify-between p-2 rounded bg-gray-100 dark:bg-gray-700 font-bold"><span>× 10</span><span>= {Math.round(data.scores.final)}</span></div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center">
            <div className="text-sm text-gray-500 mb-4 uppercase tracking-wider font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>Final Score</div>
            <div className="relative w-48 h-48 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${recColor} 0%, color-mix(in srgb, ${recColor} 86.667%, transparent) 100%)`, boxShadow: `0 8px 24px color-mix(in srgb, ${recColor} 25.098%, transparent)` }}>
              <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex flex-col items-center justify-center">
                <div className="text-5xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(data.scores.final)}</div>
                <div className="tf-body-muted">/ 100</div>
              </div>
            </div>
            <div className="mt-4 px-6 py-2 rounded-full text-sm font-semibold" style={{ background: recColor, color: 'white', fontFamily: 'var(--font-mono)' }}>{rec}</div>
          </div>
        </div>
      </div>

      {/* 6. Strengths & Concerns */}
      {(data.strengths.length > 0 || data.weaknesses.length > 0) && (
        <div className="tf-grid-2 md:gap-8">
          <div className="tf-card-soft p-4 sm:p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center"><TrendingUp size={20} className="text-emerald-600" /></div>
              <h2 className="text-lg sm:text-2xl font-bold">Strengths</h2>
            </div>
            <ul className="space-y-3">
              {data.strengths.length > 0 ? data.strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></div>
                  <span className="text-sm text-emerald-900">{s}</span>
                </li>
              )) : <li className="tf-body-muted italic">No strengths captured.</li>}
            </ul>
          </div>

          <div className="tf-card-soft p-4 sm:p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><TrendingDown size={20} className="text-amber-600" /></div>
              <h2 className="text-lg sm:text-2xl font-bold">Areas for Improvement</h2>
            </div>
            <ul className="space-y-3">
              {data.weaknesses.length > 0 ? data.weaknesses.map((w, idx) => (
                <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></div>
                  <span className="text-sm text-amber-900">{w}</span>
                </li>
              )) : <li className="tf-body-muted italic">No concerns captured.</li>}
            </ul>
          </div>
        </div>
      )}

      {/* 7. AI Summary */}
      {data.aiSummary && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl p-4 sm:p-6 lg:p-8 border-2 border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center"><Sparkles size={24} className="text-white" /></div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold">AI Summary & Recommendation</h2>
              <p className="tf-body-muted">Comprehensive narrative insight</p>
            </div>
          </div>
          <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800">
            <p className="text-base leading-relaxed">{data.aiSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
