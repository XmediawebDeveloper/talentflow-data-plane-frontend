// Overview tab — converted from Vite source:
// /root/staging/MVP 1- Timed mode (Evaluation) 12-5-26/src/app/components/EvaluationOverview.tsx
// MUI Box/Card/Typography → Tailwind. Wired to live DashboardData (no mocks).
import { CheckCircle, XCircle, Play, Clock, TrendingUp } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from 'recharts';
import type { DashboardData } from './types';

interface Props {
  data: DashboardData;
  livenessVerified?: boolean;
  candidateImage?: string | null;
  /** Average response time across questions (seconds). Optional. */
  avgResponseSeconds?: number | null;
  /** AI confidence percentage (0–100). Optional — falls back to scaled final score. */
  aiConfidence?: number | null;
}

const MHS_THRESHOLD = 7.0;

export function OverviewSectionV2({
  data,
  livenessVerified = false,
  candidateImage,
  avgResponseSeconds,
  aiConfidence,
}: Props) {
  const {
    candidate, interview, scores, finalResult,
    mustHaveClusters, niceToHaveClusters, interviewResponses, sectionsPresent,
  } = data;

  const allClusters = [...mustHaveClusters, ...niceToHaveClusters];
  const allSkills = allClusters.flatMap(c => c.skills);

  // Doc-spec gate: Pass when MHS section avg ≥ 7.0
  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = finalResult ?? (isPassed ? 'Pass' : 'Fail');

  const confidence = aiConfidence ?? Math.round(scores.final);

  const avatarInitials = candidate.name
    .split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C';

  // ── Coverage stats per section ──────────────────────────────────────
  function coverage(clusters: typeof mustHaveClusters) {
    const total = clusters.reduce((n, c) => n + c.skills.length, 0);
    const covered = clusters.reduce(
      (n, c) => n + c.skills.filter(s => s.level === 'High' || s.level === 'Medium').length, 0,
    );
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    return { total, covered, pct, clusters: clusters.length };
  }
  const mhCov = coverage(mustHaveClusters);
  const nhCov = coverage(niceToHaveClusters);

  // ── Top performing skills (limit 6, sorted by score) ────────────────
  const topSkills = [...allSkills]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // ── Radar chart data (top 6 skills) ─────────────────────────────────
  const radarData = topSkills.map(s => ({ skill: s.name, score: s.score, fullMark: 10 }));

  // ── Section breakdown table ─────────────────────────────────────────
  const sectionRows = [
    {
      key: 'mh' as const,
      label: 'Must-Have Section',
      score: scores.mustHave,
      questions: interviewResponses.filter((_, i) => i < mustHaveClusters.length).length || mhCov.total,
      threshold: MHS_THRESHOLD,
      status: scores.mustHave >= MHS_THRESHOLD ? 'PASS' : 'FAIL',
      color: '#4F46E5',
      description: 'Average of Must-Have question scores — determines Pass/Fail',
      present: sectionsPresent.mustHave,
    },
    {
      key: 'nh' as const,
      label: 'Nice-to-Have Section',
      score: scores.niceToHave,
      questions: nhCov.total,
      threshold: null,
      status: 'INFO',
      color: '#F59E0B',
      description: 'Average of Nice-to-Have question scores — informational only',
      present: sectionsPresent.niceToHave,
    },
  ].filter(r => r.present);

  // ── Interview stat tiles ────────────────────────────────────────────
  const stats: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: 'Questions Answered', value: String(interviewResponses.length), icon: <Play className="w-5 h-5" /> },
    {
      label: 'Average Response Time',
      value: avgResponseSeconds && avgResponseSeconds > 0 ? `${Math.round(avgResponseSeconds)}s` : '—',
      icon: <Clock className="w-5 h-5" />,
    },
    { label: 'Skills Evaluated', value: String(allSkills.length), icon: <CheckCircle className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* ── Final Result Card ────────────────────────────────────────── */}
      <div
        className={`rounded-2xl p-8 text-white shadow-lg ${
          isPassed
            ? 'bg-gradient-to-br from-emerald-500 to-emerald-400'
            : 'bg-gradient-to-br from-red-500 to-red-400'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            {isPassed
              ? <CheckCircle className="w-20 h-20 text-white shrink-0" strokeWidth={1.5} />
              : <XCircle className="w-20 h-20 text-white shrink-0" strokeWidth={1.5} />}
            <div>
              <div className="text-4xl font-bold mb-1">{finalResultLabel}</div>
              <div className="text-xl text-white/95 mb-1">
                {isPassed ? 'Recommended to Hire' : 'Does Not Meet Requirements'}
              </div>
              <div className="text-sm text-white/90">
                {isPassed
                  ? `Must-Have Score: ${scores.mustHave.toFixed(2)} (Threshold: ${MHS_THRESHOLD.toFixed(1)}) • Exceeds by +${(scores.mustHave - MHS_THRESHOLD).toFixed(2)}`
                  : `Must-Have Score: ${scores.mustHave.toFixed(2)} (Threshold: ${MHS_THRESHOLD.toFixed(1)}) • Below threshold by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)}`}
              </div>
            </div>
          </div>
          <div className="px-8 py-5 rounded-2xl bg-white/20 backdrop-blur text-center">
            <div className="text-4xl font-bold leading-none mb-1">{confidence}%</div>
            <div className="text-sm font-semibold text-white/95">AI Confidence</div>
          </div>
        </div>
      </div>

      {/* ── Candidate Profile Card ───────────────────────────────────── */}
      <div className="rounded-2xl p-8 bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-3xl font-bold overflow-hidden ring-4 ring-indigo-100">
              {candidateImage
                ? <img src={candidateImage} alt={candidate.name} className="w-full h-full object-cover" />
                : <span>{avatarInitials}</span>}
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{candidate.name}</div>
              <div className="text-base text-gray-500 mb-2">{candidate.role}</div>
              {candidate.email && <div className="text-sm text-gray-400">{candidate.email}</div>}
            </div>
          </div>

          <div className="flex divide-x divide-gray-200">
            {sectionsPresent.mustHave && (
              <div className="px-6 text-center min-w-[120px]">
                <div className="text-4xl font-bold text-emerald-500 mb-1">{scores.mustHave.toFixed(2)}</div>
                <div className="text-sm font-semibold text-gray-500">Must-Have</div>
                <div className="text-xs text-gray-400">Score</div>
              </div>
            )}
            {sectionsPresent.niceToHave && (
              <div className="px-6 text-center min-w-[120px]">
                <div className="text-4xl font-bold text-indigo-500 mb-1">{scores.niceToHave.toFixed(2)}</div>
                <div className="text-sm font-semibold text-gray-500">Nice-to-Have</div>
                <div className="text-xs text-gray-400">Score</div>
              </div>
            )}
            <div className="px-6 text-center min-w-[120px]">
              <div className="text-4xl font-bold text-indigo-700 mb-1">{(scores.final / 10).toFixed(2)}</div>
              <div className="text-sm font-semibold text-gray-500">Overall</div>
              <div className="text-xs text-gray-400">Score</div>
            </div>
          </div>
        </div>

        <hr className="my-6 border-gray-200" />

        <div className="flex flex-wrap gap-8">
          <div>
            <div className="text-sm text-gray-500 mb-1">Interview Date</div>
            <div className="text-sm font-semibold text-gray-900">{interview.date || '—'}</div>
          </div>
          {candidate.email && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Email</div>
              <div className="text-sm font-semibold text-gray-900">{candidate.email}</div>
            </div>
          )}
          <div>
            <div className="text-sm text-gray-500 mb-1">Mode</div>
            <div className="text-sm font-semibold text-gray-900">{interview.mode}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Duration</div>
            <div className="text-sm font-semibold text-gray-900">{interview.duration || '—'}</div>
          </div>
        </div>
      </div>

      {/* ── Interview Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white flex items-center justify-center shrink-0">
                {s.icon}
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 mb-0.5">{s.value}</div>
                <div className="text-sm text-gray-500">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Top Performing Skills + Cluster Coverage Overview ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Performing Skills */}
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3">
            <div className="text-base font-bold text-emerald-800">Top Performing Skills</div>
          </div>
          <div className="p-6">
            {topSkills.length > 0 ? topSkills.map((skill, i) => (
              <div
                key={skill.name + i}
                className={`flex items-center justify-between py-3 ${
                  i < topSkills.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{skill.name}</div>
                    <div className="text-xs text-gray-500">Level: {skill.level}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(skill.score / 10) * 100}%` }} />
                  </div>
                  <div className="text-base font-bold text-emerald-500 min-w-[36px] text-right">
                    {skill.score.toFixed(1)}
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-sm text-gray-400 italic text-center py-6">No skills evaluated yet.</div>
            )}
          </div>
        </div>

        {/* Cluster Coverage Overview */}
        <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
          <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-3">
            <div className="text-base font-bold text-indigo-800">Cluster Coverage Overview</div>
          </div>
          <div className="p-6">
            {sectionsPresent.mustHave && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-900">Must-Have Section</div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      mhCov.pct === 100
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {mhCov.pct}% Coverage
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full ${mhCov.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${mhCov.pct}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {mhCov.covered} of {mhCov.total} skills covered across {mhCov.clusters} priority cluster{mhCov.clusters !== 1 ? 's' : ''}
                </div>
              </div>
            )}

            {sectionsPresent.niceToHave && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-900">Nice-to-Have Section</div>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      nhCov.pct === 100
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {nhCov.pct}% Coverage
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full ${nhCov.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${nhCov.pct}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {nhCov.covered} of {nhCov.total} skills covered across {nhCov.clusters} priority cluster{nhCov.clusters !== 1 ? 's' : ''}
                </div>
              </div>
            )}

            <hr className="my-4 border-gray-200" />
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed">
              <strong>Coverage Status:</strong>{' '}
              {mhCov.pct >= 80 ? 'Excellent' : mhCov.pct >= 60 ? 'Good' : 'Needs Improvement'}
              {' '}— Interview questions covered {mhCov.pct}% of Must-Have skills
              {sectionsPresent.niceToHave && ` and ${nhCov.pct}% of Nice-to-Have skills`}.
            </div>
          </div>
        </div>
      </div>

      {/* ── Skill Radar + Section Breakdown ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
        {/* Skill Assessment Radar */}
        <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900 mb-4">Skill Assessment Radar</div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={380}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="skill" tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }} />
                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Radar name="Score" dataKey="score" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.6} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm italic">
              Not enough data to render radar chart.
            </div>
          )}
        </div>

        {/* Section Score Breakdown */}
        <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900 mb-4">Section Score Breakdown</div>
          <div className="flex flex-col gap-4">
            {sectionRows.map((item, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border-2"
                style={{ borderColor: item.color, backgroundColor: `${item.color}0A` }}
              >
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900 mb-1">{item.label}</div>
                    <div className="text-xs text-gray-500 leading-relaxed">{item.description}</div>
                    {item.threshold !== null && (
                      <div className="text-xs text-gray-600 font-semibold mt-1">
                        Pass Threshold: {item.threshold.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold mb-1" style={{ color: item.color }}>
                      {item.score.toFixed(2)}
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        item.status === 'PASS'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.status === 'FAIL'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item.status === 'INFO' ? 'Info Only' : item.status}
                    </span>
                  </div>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(item.score / 10) * 100}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <hr className="my-5 border-gray-200" />

          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100">
            <div className="text-sm font-semibold text-indigo-700 mb-1.5">Scoring Method</div>
            <div className="text-xs text-gray-600 leading-relaxed space-y-1">
              <div>• <strong>Must-Have Section Score</strong> = Average of all Must-Have question scores</div>
              <div>• <strong>Nice-to-Have Section Score</strong> = Average of all Nice-to-Have question scores</div>
              <div>• <strong>Final Decision</strong> = Based on Must-Have Section Score ≥ {MHS_THRESHOLD.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
