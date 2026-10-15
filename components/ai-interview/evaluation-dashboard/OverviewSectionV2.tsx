// Overview tab — converted from Vite source:
// /root/staging/MVP 1- Timed mode (Evaluation) 12-5-26/src/app/components/EvaluationOverview.tsx
// MUI Box/Card/Typography → Tailwind. Wired to live DashboardData (no mocks).
import { CheckCircle, XCircle, Play, TrendingUp } from 'lucide-react';
import type { DashboardData } from './types';
import { isSkillEvaluated } from './types';

import { formatSkillScore, formatScore1 } from '@/lib/utils/matchStatus';
interface Props {
  data: DashboardData;
  livenessVerified?: boolean;
  candidateImage?: string | null;
  /** AI confidence percentage (0–100). Optional — falls back to scaled final score. */
  aiConfidence?: number | null;
}

const MHS_THRESHOLD = 6.0;

export function OverviewSectionV2({
  data,
  livenessVerified = false,
  candidateImage,
  aiConfidence,
}: Props) {
  const {
    candidate, interview, scores, finalResult,
    mustHaveClusters, niceToHaveClusters, interviewResponses, sectionsPresent, isPartialEvaluation,
  } = data;

  const allClusters = [...mustHaveClusters, ...niceToHaveClusters];
  const allSkills = allClusters.flatMap(c => c.skills);

  // Doc-spec gate: Pass when MHS section avg ≥ 6.0
  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = isPartialEvaluation ? 'Partial Evaluation' : (finalResult ?? (isPassed ? 'Pass' : 'Fail'));

  const confidence = aiConfidence ?? Math.round(scores.final);

  const avatarInitials = candidate.name
    .split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C';

  // ── Coverage stats per section ──────────────────────────────────────
  // A skill is "covered" when it was asked at all (score > 0), regardless of
  // how strongly the candidate answered. Previously this excluded `level=Low`
  // skills, which conflated "weak answer" with "never asked" — the latter is
  // the only real meaning of "not covered" in the cluster-coverage tab.
  function coverage(clusters: typeof mustHaveClusters) {
    const total = clusters.reduce((n, c) => n + c.skills.length, 0);
    const covered = clusters.reduce(
      (n, c) => n + c.skills.filter(s => s.score > 0).length, 0,
    );
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    return { total, covered, pct, clusters: clusters.length };
  }
  const mhCov = coverage(mustHaveClusters);
  const nhCov = coverage(niceToHaveClusters);

  // ── Highest-scored skills (filter 0-score, limit 6) ─────────────────
  // Previously this took the top 6 by score unconditionally — for failing
  // candidates the list filled with skills scored 0.0-1.0, contradicting
  // the "Top Performing" label. Now we drop 0-score entries (skills the
  // candidate didn't answer at all) so the panel only surfaces skills
  // where there's at least some signal to rank. When everything's 0 we
  // render an empty-state instead of pretending there's a "top".
  const scoredSkills = allSkills.filter(s => s.score > 0);
  const topSkills = [...scoredSkills]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  // Heading honesty: when no skill scored above the section gate
  // threshold (≥6.0), the panel header should say "Highest Scoring"
  // rather than "Top Performing" so a recruiter doesn't read a fail as
  // a positive signal.
  const hasStrongSkill = topSkills.some(s => s.score >= MHS_THRESHOLD);
  const topPanelHeading = hasStrongSkill ? 'Top Performing Skills' : 'Highest Scoring Skills';


  // ── Section breakdown table ─────────────────────────────────────────
  // Question counts come from data.perQuestionDetails grouped by section
  // (the same source the Question Analysis tab uses) so the numbers
  // match across tabs. The old code filtered interviewResponses by
  // INDEX, which had no relation to section and produced wrong counts.
  const mhQCount = data.perQuestionDetails.filter(q => q.section === 'mth').length;
  const nhQCount = data.perQuestionDetails.filter(q => q.section === 'nth').length;
  const sectionRows = [
    {
      key: 'mh' as const,
      label: 'Must-Have Section',
      score: scores.mustHave,
      questions: mhQCount,
      threshold: MHS_THRESHOLD,
      status: isPartialEvaluation ? 'PARTIAL' : (scores.mustHave >= MHS_THRESHOLD ? 'PASS' : 'FAIL'),
      color: 'var(--raw-4f46e5)',
      description: isPartialEvaluation
        ? 'Average of attended Must-Have question scores — reference only for partial interviews'
        : 'Average of Must-Have question scores — determines Pass/Fail',
      present: sectionsPresent.mustHave,
    },
    {
      key: 'nh' as const,
      label: 'Nice-to-Have Section',
      score: scores.niceToHave,
      questions: nhQCount,
      threshold: null,
      status: 'INFO',
      color: 'var(--raw-f59e0b)',
      description: 'Average of Nice-to-Have question scores — informational only',
      present: sectionsPresent.niceToHave,
    },
  ].filter(r => r.present);

  // ── Interview stat tiles ────────────────────────────────────────────
  const stats: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: 'Questions Answered', value: `${data.questionsAnswered} / ${data.questionsAsked}`, icon: <Play className="w-5 h-5" /> },
    {
      // "Evaluated" = skills that were actually scored (score > 0). Previously
      // this showed `allSkills.length` which is the total JD config count and
      // contradicts the Cluster Coverage tab (e.g. "30 evaluated" vs "14/30
      // covered"). Now both tabs agree.
      label: 'Skills Evaluated',
      // Same rule as the Evaluation Report and its PDF (types.ts).
      value: `${allSkills.filter(isSkillEvaluated).length} / ${allSkills.length}`,
      icon: <CheckCircle className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Final Result Card ────────────────────────────────────────── */}
      <div
        className={`rounded-2xl p-8 text-white shadow-lg ${
          isPartialEvaluation
            ? 'bg-amber-500'
            : isPassed
              ? 'bg-emerald-500'
              : 'bg-red-500'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            {isPartialEvaluation ? (
              <div className="w-20 h-20 rounded-2xl bg-white/20 shrink-0 flex items-center justify-center text-2xl font-bold">
                AI
              </div>
            ) : isPassed ? (
              <CheckCircle className="w-20 h-20 text-white shrink-0" strokeWidth={1.5} />
            ) : (
              <XCircle className="w-20 h-20 text-white shrink-0" strokeWidth={1.5} />
            )}
            <div>
              <div className="text-4xl font-bold mb-1">{finalResultLabel}</div>
              <div className="text-xl text-white/95 mb-1">
                {isPartialEvaluation
                  ? 'Attended questions evaluated only'
                  : isPassed
                    ? 'Recommended to Hire'
                    : 'Does Not Meet Requirements'}
              </div>
              <div className="text-sm text-white/90">
                {isPartialEvaluation
                  ? `This interview ended before completion. Section scores below summarize only the questions the candidate attended.`
                  : isPassed
                    ? `Must-Have Score: ${formatScore1(scores.mustHave)} (Threshold: ${MHS_THRESHOLD.toFixed(1)}) • Exceeds by +${formatScore1((scores.mustHave - MHS_THRESHOLD))}`
                    : `Must-Have Score: ${formatScore1(scores.mustHave)} (Threshold: ${MHS_THRESHOLD.toFixed(1)}) • Below threshold by ${formatScore1((MHS_THRESHOLD - scores.mustHave))}`}
              </div>
            </div>
          </div>
          {!isPartialEvaluation && (
            <div className="px-8 py-5 rounded-2xl bg-white/20 backdrop-blur text-center">
              <div className="text-4xl font-bold leading-none mb-1">{confidence}%</div>
              {/* "Match Score" — derived from MHS×10 (normalized 0-100). Was
                  previously labeled "AI Confidence" which implied a separate
                  signal; it is not — it's just the normalized score. */}
              <div className="text-sm font-semibold text-white/95">Match Score</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Candidate Profile Card ───────────────────────────────────── */}
      <div className="rounded-2xl p-8 bg-white border-2 border-gray-200">
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
                <div className="text-4xl font-bold text-emerald-500 mb-1">{formatScore1(scores.mustHave)}</div>
                <div className="text-sm font-semibold text-gray-500">Must-Have</div>
                <div className="text-xs text-gray-400">Score</div>
              </div>
            )}
            {sectionsPresent.niceToHave && (
              <div className="px-6 text-center min-w-[120px]">
                <div className="text-4xl font-bold text-indigo-500 mb-1">{formatScore1(scores.niceToHave)}</div>
                <div className="text-sm font-semibold text-gray-500">Nice-to-Have</div>
                <div className="text-xs text-gray-400">Score</div>
              </div>
            )}
            {!isPartialEvaluation && (
              <div className="px-6 text-center min-w-[120px]">
                <div className="text-4xl font-bold text-indigo-700 mb-1">{formatScore1((scores.final / 10))}</div>
                <div className="text-sm font-semibold text-gray-500">Overall</div>
                <div className="text-xs text-gray-400">Score</div>
              </div>
            )}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-brand-blue text-white flex items-center justify-center shrink-0">
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
          <div className={`border-b px-6 py-3 ${hasStrongSkill ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className={`text-base font-bold ${hasStrongSkill ? 'text-emerald-800' : 'text-amber-800'}`}>
              {topPanelHeading}
            </div>
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
                    {formatSkillScore(skill.score)}
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
            <div
              className={`p-4 rounded-xl border text-xs leading-relaxed ${
                mhCov.pct >= 80
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : mhCov.pct >= 60
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {/* Frame this as a QUESTION coverage metric (was Bina asked
                  enough?) — NOT a performance signal (did the candidate
                  answer well?). A failing candidate can still have 100%
                  coverage; an excellent candidate with under-coverage is
                  the recruiter's planner-side bug, not the candidate's. */}
              <strong>Question Coverage:</strong>{' '}
              {mhCov.pct >= 80 ? 'Excellent' : mhCov.pct >= 60 ? 'Good' : 'Needs Improvement'}
              {' '}— Bina asked about {mhCov.pct}% of the Must-Have skills
              {sectionsPresent.niceToHave && ` and ${nhCov.pct}% of the Nice-to-Have skills`}.
              {' '}This reflects what the interview probed; candidate performance is shown in the Section Score Breakdown below.
            </div>
          </div>
        </div>
      </div>

      {/* ── Section Breakdown (the Skill Assessment Radar was removed) ── */}
      <div className="grid grid-cols-1 gap-6">
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
                    {item.threshold !== null && !isPartialEvaluation && (
                      <div className="text-xs text-gray-600 font-semibold mt-1">
                        Pass Threshold: {item.threshold.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold mb-1" style={{ color: item.color }}>
                      {formatScore1(item.score)}
                    </div>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        item.status === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-700'
                          : item.status === 'PASS'
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

          <div className="p-5 rounded-2xl bg-brand-blue/10">
            <div className="text-sm font-semibold text-brand-blue mb-1.5">Scoring Method</div>
            <div className="text-xs text-gray-600 leading-relaxed space-y-1">
              <div>• <strong>Must-Have Section Score</strong> = Average of all Must-Have question scores</div>
              <div>• <strong>Nice-to-Have Section Score</strong> = Average of all Nice-to-Have question scores</div>
              <div>
                • <strong>{isPartialEvaluation ? 'Partial Interview Rule' : 'Final Decision'}</strong>
                {' '}
                = {isPartialEvaluation
                  ? 'Terminated interviews show attended-question analysis only; no final hiring outcome is generated'
                  : `Based on Must-Have Section Score ≥ ${MHS_THRESHOLD.toFixed(1)}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
