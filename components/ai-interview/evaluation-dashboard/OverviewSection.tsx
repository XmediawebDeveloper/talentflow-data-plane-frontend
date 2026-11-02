import { Mail, User, Shield, CheckCircle, TrendingUp, TrendingDown, Award, AlertCircle, Zap, Target, Star, Brain, XCircle } from 'lucide-react';
import type { DashboardData } from './types';

import { formatSkillScore, formatScore1 } from '@/lib/utils/matchStatus';
interface Props {
  data: DashboardData;
  /** Whether identity/liveness verification was confirmed for this candidate */
  livenessVerified?: boolean;
  /** Optional candidate photo URL */
  candidateImage?: string | null;
}

export function OverviewSection({ data, livenessVerified = false, candidateImage }: Props) {
  const { candidate, interview, scores, mustHaveClusters, niceToHaveClusters, strengths, weaknesses, recommendation, interviewResponses, finalResult, mhsThreshold, sectionsPresent } = data;
  const allClusters = [...mustHaveClusters, ...niceToHaveClusters];
  const allSkills = allClusters.flatMap(c => c.skills);
  const coveredNames = new Set(interviewResponses.flatMap(r => r.skillsCovered.map(s => s.toLowerCase())));
  const coveredSkills = allSkills.filter(s => s.score > 0 || coveredNames.has(s.name.toLowerCase()));
  const coveragePct = allSkills.length > 0 ? (coveredSkills.length / allSkills.length) * 100 : 0;

  // Timed-mode doc-spec gate: PASS if MHS section avg >= mhsThreshold, else FAIL.
  // Only rendered when we actually have a final_result (timed interviews; FE
  // computes a fallback when backend omits it but MHS data is present).
  const showPassFailGate = interview.mode === 'Timed' && finalResult !== null;
  const isPass = finalResult === 'Pass';

  function getRecStyle(rec: string) {
    switch (rec) {
      case 'Strong Hire': return { bg: 'var(--score-high)', text: 'white', border: 'var(--score-high)' };
      case 'Hire':        return { bg: 'var(--score-medium)', text: 'white', border: 'var(--score-medium)' };
      case 'Consider':    return { bg: 'var(--score-medium-bg)', text: 'var(--score-medium)', border: 'var(--score-medium)' };
      case 'No Hire':     return { bg: 'var(--score-low)', text: 'white', border: 'var(--score-low)' };
      default:            return { bg: 'var(--raw-e5e7eb)', text: 'var(--raw-374151)', border: 'var(--raw-e5e7eb)' };
    }
  }
  const recStyle = getRecStyle(recommendation);

  return (
    <div className="space-y-8">
      {/* Candidate Profile Card */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="w-32 h-32 rounded-2xl bg-white/20 border-4 border-white/30 overflow-hidden flex items-center justify-center">
                {candidateImage ? (
                  <img src={candidateImage} alt={candidate.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-white/60" />
                )}
              </div>
              {livenessVerified && (
                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white rounded-full p-2 shadow-lg">
                  <Shield size={20} />
                </div>
              )}
            </div>

            <div>
              <h1 className="text-4xl font-bold mb-2">{candidate.name}</h1>
              <p className="text-xl text-white/80 mb-4">{candidate.role}</p>
              <div className="space-y-2">
                {candidate.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-white/60" />
                    <span className="text-sm text-white/80">{candidate.email}</span>
                  </div>
                )}
                {livenessVerified && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 w-fit">
                    <CheckCircle size={16} className="text-emerald-300" />
                    <span className="text-sm text-emerald-100" style={{ fontFamily: 'var(--font-mono)' }}>
                      Liveness Verified
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-white/60 mb-2 uppercase tracking-wider">Overall Recommendation</div>
            <div className="px-6 py-3 rounded-xl shadow-lg inline-block" style={{ background: recStyle.bg, color: recStyle.text, border: `2px solid ${recStyle.border}` }}>
              <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{recommendation}</div>
            </div>
            <div className="text-sm text-white/60 mt-2">Interview: {interview.mode} • {interview.date}</div>
          </div>
        </div>
      </div>

      {/* Timed-mode Pass/Fail Gate — MHS section avg ≥ mhsThreshold = Pass (doc spec). */}
      {showPassFailGate && (
        <div
          className={`rounded-2xl p-8 border-2 shadow-md ${
            isPass
              ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300'
              : 'bg-gradient-to-br from-red-50 to-red-100 border-red-300'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div className="flex items-center gap-5">
              <div
                className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg ${
                  isPass ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              >
                {isPass
                  ? <CheckCircle size={40} className="text-white" />
                  : <XCircle size={40} className="text-white" />}
              </div>
              <div>
                <div
                  className={`text-xs uppercase tracking-wider font-semibold mb-1 ${
                    isPass ? 'text-emerald-700' : 'text-red-700'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  Final Result
                </div>
                <div
                  className={`text-5xl font-bold ${
                    isPass ? 'text-emerald-900' : 'text-red-900'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {finalResult?.toUpperCase()}
                </div>
                <div
                  className={`text-sm mt-2 ${
                    isPass ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {isPass
                    ? `Must-Have score meets the ≥ ${mhsThreshold.toFixed(1)} threshold.`
                    : `Must-Have score is below the ≥ ${mhsThreshold.toFixed(1)} threshold.`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 min-w-[320px]">
              {sectionsPresent.mustHave && (
                <div
                  className={`p-4 rounded-xl border-2 ${
                    isPass ? 'bg-white border-emerald-300' : 'bg-white border-red-300'
                  }`}
                >
                  <div
                    className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-1"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    Must-Have
                  </div>
                  <div
                    className={`text-3xl font-bold ${
                      isPass ? 'text-emerald-900' : 'text-red-900'
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {formatScore1(scores.mustHave)}
                    <span className="text-base text-gray-500 font-normal">/10</span>
                  </div>
                  <div
                    className={`text-2xs mt-1 ${
                      isPass ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {isPass ? '≥' : '<'} {mhsThreshold.toFixed(1)} threshold
                  </div>
                </div>
              )}
              {sectionsPresent.niceToHave && (
                <div className="p-4 rounded-xl bg-white border-2 border-amber-300">
                  <div
                    className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-1"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    Nice-to-Have
                  </div>
                  <div
                    className="text-3xl font-bold text-amber-900"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {formatScore1(scores.niceToHave)}
                    <span className="text-base text-gray-500 font-normal">/10</span>
                  </div>
                  <div className="text-2xs mt-1 text-amber-700">informational only</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Highlights */}
      <div className="grid grid-cols-2 gap-8">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-8 border-2 border-blue-200 shadow-lg">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <Award size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Final Score</h3>
                  <p className="tf-body-muted">Overall Performance</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-6xl mb-1 font-bold" style={{ fontFamily: 'var(--font-mono)', background: 'linear-gradient(135deg, var(--raw-10b981) 0%, var(--raw-059669) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {scores.final.toFixed(1)}
              </div>
              <div className="tf-body-muted">out of 100</div>
            </div>
          </div>
          <div className="relative w-full h-8 bg-gradient-to-r from-red-200 via-amber-200 to-emerald-200 rounded-full overflow-hidden shadow-inner">
            <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-medium text-gray-700">
              <span>0</span><span>50</span><span>100</span>
            </div>
            <div className="absolute top-0 w-3 h-full border-2 border-white shadow-lg transition-all duration-1000 ease-out" style={{ left: `calc(${Math.min(scores.final, 100)}% - 6px)`, background: 'linear-gradient(135deg, var(--score-high) 0%, var(--raw-059669) 100%)' }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-5 border-2 border-emerald-300 shadow-md">
            <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center mb-3"><Zap size={20} className="text-white" /></div>
            <div className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{allSkills.filter(s => s.level === 'High').length}</div>
            <div className="text-sm text-emerald-900 font-medium">High-Level Skills</div>
            <div className="text-xs text-emerald-700 mt-1">Strong expertise areas</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 border-2 border-purple-300 shadow-md">
            <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center mb-3"><Target size={20} className="text-white" /></div>
            <div className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{coveragePct.toFixed(0)}%</div>
            <div className="text-sm text-purple-900 font-medium">Skills Coverage</div>
            <div className="text-xs text-purple-700 mt-1">{coveredSkills.length}/{allSkills.length} skills</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 border-2 border-blue-300 shadow-md">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center mb-3"><Star size={20} className="text-white" /></div>
            <div className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{allClusters.filter(c => {
              const total = c.skills.length;
              const covered = c.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
              return total > 0 && (covered / total) >= 0.7;
            }).length}/{allClusters.length}</div>
            <div className="text-sm text-blue-900 font-medium">Top Clusters</div>
            <div className="text-xs text-blue-700 mt-1">Coverage ≥70%</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-5 border-2 border-amber-300 shadow-md">
            <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center mb-3"><Brain size={20} className="text-white" /></div>
            <div className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{interviewResponses.length}</div>
            <div className="text-sm text-amber-900 font-medium">Questions Asked</div>
            <div className="text-xs text-amber-700 mt-1">{interview.duration}</div>
          </div>
        </div>
      </div>

      {/* Category Score Bars */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-2xl font-bold mb-6">Performance Breakdown by Category</h2>
        <div className="space-y-6">
          {[
            { label: 'Must-Have Skills', desc: `Critical competencies • ${data.weights.mustHave.toFixed(1)}% weight`, score: scores.mustHave, count: mustHaveClusters.length, icon: CheckCircle, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', barBg: 'bg-emerald-100', barFill: 'from-emerald-500 to-emerald-600', textColor: 'text-emerald-900', present: data.sectionsPresent.mustHave },
            { label: 'Nice-to-Have Skills', desc: `Additional competencies • ${data.weights.niceToHave.toFixed(1)}% weight`, score: scores.niceToHave, count: niceToHaveClusters.length, icon: TrendingUp, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', barBg: 'bg-amber-100', barFill: 'from-amber-500 to-amber-600', textColor: 'text-amber-900', present: data.sectionsPresent.niceToHave },
          ].filter(s => s.present).map((s, idx) => (
            <div key={idx} className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${s.iconBg} flex items-center justify-center`}><s.icon size={20} className={s.iconColor} /></div>
                  <div>
                    <div className="text-base font-medium">{s.label}</div>
                    <div className="tf-meta">{s.desc}</div>
                  </div>
                </div>
                <div className={`text-3xl font-bold ${s.textColor}`} style={{ fontFamily: 'var(--font-mono)' }}>{formatScore1(s.score)}</div>
              </div>
              <div className={`relative h-6 ${s.barBg} rounded-full overflow-hidden`}>
                <div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${s.barFill} rounded-full transition-all duration-1000`} style={{ width: `${(s.score / 10) * 100}%` }} />
                <div className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${s.textColor}`}>
                  {((s.score / 10) * 100).toFixed(1)}%{s.count > 0 && ` • ${s.count} cluster${s.count !== 1 ? 's' : ''}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="grid grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border-2 border-emerald-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center"><TrendingUp size={24} className="text-emerald-600" /></div>
              <div>
                <h2 className="text-2xl font-bold">Key Strengths</h2>
                <p className="tf-body-muted">Notable areas of excellence</p>
              </div>
            </div>
            <ul className="space-y-4">
              {strengths.length > 0 ? strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle size={14} className="text-white" />
                  </div>
                  <span className="text-sm text-emerald-900">{s}</span>
                </li>
              )) : <li className="text-sm text-gray-400 italic">No strengths captured.</li>}
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border-2 border-amber-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center"><TrendingDown size={24} className="text-amber-600" /></div>
              <div>
                <h2 className="text-2xl font-bold">Areas for Growth</h2>
                <p className="tf-body-muted">Opportunities for improvement</p>
              </div>
            </div>
            <ul className="space-y-4">
              {weaknesses.length > 0 ? weaknesses.map((w, idx) => (
                <li key={idx} className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertCircle size={14} className="text-white" />
                  </div>
                  <span className="text-sm text-amber-900">{w}</span>
                </li>
              )) : <li className="text-sm text-gray-400 italic">No concerns captured.</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Skills Distribution + Score Comparison + Top Skills */}
      {allSkills.length > 0 && (
        <div className="grid grid-cols-3 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-xl font-bold mb-6">Skills Level Distribution</h3>
            <div className="space-y-6">
              {(['High', 'Medium', 'Low'] as const).map(level => {
                const count = allSkills.filter(s => s.level === level).length;
                const pct = allSkills.length > 0 ? (count / allSkills.length) * 100 : 0;
                const colors = level === 'High'
                  ? { dot: 'bg-emerald-500', bar: 'bg-emerald-100', fill: 'from-emerald-500 to-emerald-600' }
                  : level === 'Medium'
                    ? { dot: 'bg-amber-500', bar: 'bg-amber-100', fill: 'from-amber-500 to-amber-600' }
                    : { dot: 'bg-red-500', bar: 'bg-red-100', fill: 'from-red-500 to-red-600' };
                return (
                  <div key={level}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${colors.dot}`}></div>
                        <span className="text-sm">{level} Proficiency</span>
                      </div>
                      <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-mono)' }}>{count} skills</span>
                    </div>
                    <div className={`w-full h-3 ${colors.bar} rounded-full overflow-hidden`}>
                      <div className={`h-full bg-gradient-to-r ${colors.fill} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="tf-meta mt-1" style={{ fontFamily: 'var(--font-mono)' }}>{pct.toFixed(0)}% of total</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-xl font-bold mb-6">Score Comparison</h3>
            <div className="space-y-6">
              {[
                { label: 'Must-Have Skills', score: scores.mustHave, bg: 'bg-emerald-100', fill: 'from-emerald-500 to-emerald-600', text: 'text-emerald-900', present: data.sectionsPresent.mustHave },
                { label: 'Nice-to-Have Skills', score: scores.niceToHave, bg: 'bg-amber-100', fill: 'from-amber-500 to-amber-600', text: 'text-amber-900', present: data.sectionsPresent.niceToHave },
              ].filter(s => s.present).map((s, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm">{s.label}</span>
                    <span className="text-lg font-medium" style={{ fontFamily: 'var(--font-mono)' }}>{formatSkillScore(s.score)}/10</span>
                  </div>
                  <div className={`relative w-full h-8 ${s.bg} rounded-full overflow-hidden`}>
                    <div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${s.fill} rounded-full transition-all duration-1000`} style={{ width: `${(s.score / 10) * 100}%` }} />
                    <div className={`absolute inset-0 flex items-center justify-center text-xs font-medium ${s.text}`}>
                      {((s.score / 10) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-8 border-2 border-emerald-200 shadow-sm">
            <h3 className="text-xl font-bold mb-6 text-emerald-900">Top Performing Skills</h3>
            <div className="space-y-3">
              {allSkills.sort((a, b) => b.score - a.score).slice(0, 5).map((skill, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg, var(--score-high) 0%, var(--raw-059669) 100%)', fontFamily: 'var(--font-mono)' }}>
                      {idx + 1}
                    </div>
                    <span className="text-sm font-medium">{skill.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-emerald-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full" style={{ width: `${(skill.score / 10) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-emerald-900" style={{ fontFamily: 'var(--font-mono)' }}>{formatSkillScore(skill.score)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cluster Coverage Overview — coverage %, not score */}
      {allClusters.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-2xl font-bold mb-2">Cluster Coverage Overview</h2>
          <p className="tf-body-muted mb-6">Skills addressed at adequate level across all clusters</p>
          <div className="grid grid-cols-3 gap-4">
            {allClusters.map((cluster, idx) => {
              const totalSkills = cluster.skills.length;
              const coveredCount = cluster.skills.filter(s => s.level === 'High' || s.level === 'Medium').length;
              const coveragePct = totalSkills > 0 ? Math.round((coveredCount / totalSkills) * 100) : 0;
              const colors = coveragePct >= 70
                ? { bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300', fill: 'linear-gradient(90deg, var(--score-high) 0%, var(--raw-059669) 100%)' }
                : coveragePct >= 40
                  ? { bg: 'bg-gradient-to-br from-amber-50 to-amber-100', text: 'text-amber-900', border: 'border-amber-300', fill: 'linear-gradient(90deg, var(--score-medium) 0%, var(--raw-d97706) 100%)' }
                  : { bg: 'bg-gradient-to-br from-red-50 to-red-100', text: 'text-red-900', border: 'border-red-300', fill: 'linear-gradient(90deg, var(--score-low) 0%, var(--raw-dc2626) 100%)' };
              return (
                <div key={idx} className={`p-6 rounded-xl border-2 ${colors.bg} ${colors.border} hover:shadow-lg transition-all duration-300`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`text-xs uppercase tracking-wider ${colors.text} opacity-75 font-semibold`} style={{ fontFamily: 'var(--font-mono)' }}>
                      Cluster {cluster.clusterNumber}
                    </div>
                    <div className={`text-3xl font-bold ${colors.text}`} style={{ fontFamily: 'var(--font-mono)' }}>
                      {coveragePct}%
                    </div>
                  </div>
                  <div className={`text-base font-medium mb-3 ${colors.text}`}>{cluster.name}</div>
                  <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${coveragePct}%`, background: colors.fill }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${colors.text} opacity-75 font-semibold`} style={{ fontFamily: 'var(--font-mono)' }}>{cluster.priority} Priority</span>
                    <span className={`text-xs ${colors.text} opacity-75 font-semibold`} style={{ fontFamily: 'var(--font-mono)' }}>{coveredCount}/{totalSkills} skills</span>
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
