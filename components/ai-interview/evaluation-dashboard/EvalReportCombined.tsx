// Combined "Eval" tab — the union of the Overview and Evaluation Report tabs,
// deduplicated into a single premium report, plus a full-report PDF export.
//
// Why this exists: Overview and Evaluation Report each rendered the verdict,
// the MHS/NHS/Overall scores, and the candidate/interview meta — so those
// appeared 2–3× across the two tabs. This component shows each piece exactly
// ONCE while keeping every unique section from both:
//   • Overview-unique : interview stats, skill radar, cluster coverage
//   • EvalReport-unique: executive summary, full per-skill table,
//                        question-by-question, recommendations, methodology
// All values derive from the same DashboardData the other tabs use, so the
// numbers stay identical across tabs.
import { useRef, useState } from 'react';
import { CheckCircle, XCircle, Play, Clock, Download, Sparkles } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from 'recharts';
import type { DashboardData } from './types';

interface Props {
  data: DashboardData;
  aiConfidence?: number | null;
  candidateImage?: string | null;
  avgResponseSeconds?: number | null;
  evaluationId?: string | null;
}

const MHS_THRESHOLD = 7.0;

function priorityLabel(p: 'High' | 'Medium' | 'Low'): { tag: 'P1' | 'P2' | 'P3'; weight: number } {
  if (p === 'High')   return { tag: 'P1', weight: 10 };
  if (p === 'Medium') return { tag: 'P2', weight: 7 };
  return                   { tag: 'P3', weight: 4 };
}

function scoreColor(score: number) {
  if (score >= 8.0) return { text: 'text-emerald-500', bar: 'bg-emerald-500' };
  if (score >= 7.0) return { text: 'text-amber-500',   bar: 'bg-amber-500'   };
  return                   { text: 'text-red-500',     bar: 'bg-red-500'     };
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function EvalReportCombined({
  data,
  aiConfidence,
  candidateImage,
  avgResponseSeconds,
  evaluationId,
}: Props) {
  const {
    candidate, interview, scores, finalResult, sectionsPresent,
    mustHaveClusters, niceToHaveClusters, interviewResponses, perQuestionDetails,
  } = data;

  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const isPassed = finalResult ? finalResult === 'Pass' : scores.mustHave >= MHS_THRESHOLD;
  const finalResultLabel = (finalResult ?? (isPassed ? 'Pass' : 'Fail')).toUpperCase();
  const confidence = aiConfidence ?? Math.round(scores.final);
  const avatarInitials =
    candidate.name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C';

  const reportGenerated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const evalId = evaluationId
    ?? `EV-${(interview.date || '').replace(/[^0-9]/g, '').slice(0, 8) || 'XXXXXXXX'}`;

  // ── Skills (flattened, with priority tag/weight) ──────────────────────
  const flatMustHave = mustHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name, score: s.score, ...priorityLabel(c.priority),
  })));
  const flatNiceToHave = niceToHaveClusters.flatMap(c => c.skills.map(s => ({
    name: s.name, score: s.score, ...priorityLabel(c.priority),
  })));
  const allSkills = [...mustHaveClusters, ...niceToHaveClusters].flatMap(c => c.skills);
  const totalSkills = flatMustHave.length + flatNiceToHave.length;
  const totalQuestions = perQuestionDetails.length;
  const niceToHaveStrong = scores.niceToHave >= 7.5 ? 'strong' : 'adequate';

  // ── Radar (top 6 scored skills; pad to keep polygon readable) ─────────
  const scoredSkills = allSkills.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  const topSkills = scoredSkills.slice(0, 6);
  const radarBase = topSkills.length >= 3
    ? topSkills
    : [...topSkills, ...allSkills.filter(s => s.score === 0).slice(0, Math.max(0, 3 - topSkills.length))];
  const radarData = radarBase.map(s => ({ skill: s.name, score: s.score, fullMark: 10 }));

  // ── Coverage per section ──────────────────────────────────────────────
  const coverage = (clusters: typeof mustHaveClusters) => {
    const total = clusters.reduce((n, c) => n + c.skills.length, 0);
    const covered = clusters.reduce((n, c) => n + c.skills.filter(s => s.score > 0).length, 0);
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    return { total, covered, pct, clusters: clusters.length };
  };
  const mhCov = coverage(mustHaveClusters);
  const nhCov = coverage(niceToHaveClusters);

  // ── Interview stats ───────────────────────────────────────────────────
  const stats = [
    { label: 'Questions Answered', value: String(interviewResponses.length), icon: <Play className="w-5 h-5" /> },
    {
      label: 'Average Response Time',
      value: avgResponseSeconds && avgResponseSeconds > 0 ? `${Math.round(avgResponseSeconds)}s` : '—',
      icon: <Clock className="w-5 h-5" />,
    },
    {
      label: 'Skills Evaluated',
      value: `${allSkills.filter(s => s.score > 0).length} / ${allSkills.length}`,
      icon: <CheckCircle className="w-5 h-5" />,
    },
  ];

  // ── PDF export — renders the on-screen report to a single PDF ──────────
  const exportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const base = `eval_report_${candidate.name || 'candidate'}_${evalId}`.replace(/\s+/g, '_');
      await html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: `${base}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      } as any).from(reportRef.current).save();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Action bar (not part of the PDF) ─────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-500">
          Combined evaluation report · {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} · {totalSkills} skill{totalSkills !== 1 ? 's' : ''}
        </div>
        <button
          onClick={exportPDF}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold shadow-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Preparing PDF…' : 'Download Report (PDF)'}
        </button>
      </div>

      {/* ── Everything below is captured into the PDF ─────────────────── */}
      <div ref={reportRef} className="bg-white space-y-6">
        {/* 1. Verdict hero — Pass/Fail + Match Score + candidate */}
        <div
          className={`rounded-2xl p-8 text-white shadow-lg ${
            isPassed ? 'bg-gradient-to-br from-emerald-500 to-emerald-400' : 'bg-gradient-to-br from-red-500 to-red-400'
          }`}
          style={{ pageBreakInside: 'avoid' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="relative w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-bold overflow-hidden ring-4 ring-white/30 shrink-0">
                {candidateImage
                  ? <img src={candidateImage} alt={candidate.name} className="w-full h-full object-cover" />
                  : <span>{avatarInitials}</span>}
              </div>
              <div>
                <div className="text-3xl font-bold leading-tight">{candidate.name}</div>
                <div className="text-base text-white/90 mb-2">{candidate.role}</div>
                <div className="flex items-center gap-2">
                  {isPassed
                    ? <CheckCircle className="w-6 h-6 shrink-0" strokeWidth={2} />
                    : <XCircle className="w-6 h-6 shrink-0" strokeWidth={2} />}
                  <span className="text-xl font-bold">{finalResultLabel}</span>
                  <span className="text-sm text-white/90">
                    · {isPassed ? 'Recommended to Hire' : 'Does Not Meet Requirements'}
                  </span>
                </div>
                <div className="text-sm text-white/90 mt-1">
                  Must-Have {scores.mustHave.toFixed(2)} / Threshold {MHS_THRESHOLD.toFixed(1)}
                  {isPassed
                    ? ` · Exceeds by +${(scores.mustHave - MHS_THRESHOLD).toFixed(2)}`
                    : ` · Below by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)}`}
                </div>
              </div>
            </div>
            <div className="px-8 py-5 rounded-2xl bg-white/20 backdrop-blur text-center">
              <div className="text-4xl font-bold leading-none mb-1">{confidence}%</div>
              <div className="text-sm font-semibold text-white/95">Match Score</div>
            </div>
          </div>
        </div>

        {/* 2. Interview meta strip (once) */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5" style={{ pageBreakInside: 'avoid' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ['Candidate', candidate.name],
              ['Position', candidate.role],
              ['Email', candidate.email || '—'],
              ['Interview Date', interview.date || '—'],
              ['Mode', interview.mode || '—'],
              ['Duration', interview.duration || '—'],
            ].map(([label, val], i) => (
              <div key={i}>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
                <div className="text-sm font-semibold text-gray-900 break-words">{val}</div>
              </div>
            ))}
          </div>
          <hr className="my-4 border-gray-100" />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-400">
            <span>Evaluation ID: #{evalId}</span>
            <span>Report generated {reportGenerated}</span>
          </div>
        </div>

        {/* 3. Key stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ pageBreakInside: 'avoid' }}>
          {stats.map((s, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white flex items-center justify-center shrink-0">
                  {s.icon}
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                  <div className="text-sm text-gray-500">{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 4. Score breakdown (once) */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Section Score Breakdown</div>
          </div>
          <div className="divide-y divide-gray-100">
            {sectionsPresent.mustHave && (
              <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center bg-emerald-50/60 px-5 py-4 gap-2">
                <div className="text-sm font-bold text-emerald-800">Must-Have Section Score</div>
                <div className="text-2xl font-bold text-emerald-500">{scores.mustHave.toFixed(2)}</div>
                <div className="pr-3">
                  <div className="h-3.5 bg-emerald-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(scores.mustHave / 10) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {isPassed ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {isPassed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              </div>
            )}
            {sectionsPresent.niceToHave && (
              <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center px-5 py-4 gap-2">
                <div className="text-sm font-semibold text-gray-900">Nice-to-Have Section Score</div>
                <div className="text-2xl font-bold text-indigo-500">{scores.niceToHave.toFixed(2)}</div>
                <div className="pr-3">
                  <div className="h-3.5 bg-indigo-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(scores.niceToHave / 10) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    Info Only
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-[35%_15%_minmax(0,1fr)_20%] items-center bg-gray-50 px-5 py-4 gap-2">
              <div className="text-sm font-semibold text-gray-900">Overall Average Score</div>
              <div className="text-2xl font-bold text-indigo-700">{(scores.final / 10).toFixed(2)}</div>
              <div className="pr-3">
                <div className="h-3.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-700 rounded-full" style={{ width: `${scores.final}%` }} />
                </div>
              </div>
              <div className="text-xs italic text-gray-500">Reference only</div>
            </div>
          </div>
        </div>

        {/* 5. Executive summary */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Executive Summary</div>
          </div>
          <div className="p-6 space-y-4 text-sm leading-relaxed text-gray-900">
            <p>
              {candidate.name} completed an AI-powered technical interview for the {candidate.role} position
              on {interview.date || 'the scheduled date'}. The evaluation consisted of{' '}
              <strong>{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}</strong> covering{' '}
              <strong>{totalSkills} skill{totalSkills !== 1 ? 's' : ''}</strong> across multiple priority levels.
            </p>
            {sectionsPresent.mustHave && (
              <p>
                The candidate achieved a <strong>Must-Have Section Score of {scores.mustHave.toFixed(2)}/10</strong>,{' '}
                which {isPassed
                  ? `exceeds the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(scores.mustHave - MHS_THRESHOLD).toFixed(2)} points`
                  : `falls below the required threshold of ${MHS_THRESHOLD.toFixed(1)} by ${(MHS_THRESHOLD - scores.mustHave).toFixed(2)} points`}.
                {sectionsPresent.niceToHave && (
                  <> {' '}The Nice-to-Have Section Score was <strong>{scores.niceToHave.toFixed(2)}/10</strong>,{' '}
                  demonstrating {niceToHaveStrong} proficiency in supplementary skills.</>
                )}
              </p>
            )}
            <p>
              Based on this evaluation, the assessment recommends{' '}
              <strong>{isPassed ? 'proceeding with the hiring process' : 'not proceeding with the current application'}</strong>{' '}
              with a match score of <strong>{confidence}%</strong>.
            </p>
          </div>
        </div>

        {/* 6. Radar + cluster coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6" style={{ pageBreakInside: 'avoid' }}>
          <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
            <div className="text-lg font-semibold text-gray-900 mb-4">Skill Assessment Radar</div>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.6} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[360px] flex items-center justify-center text-gray-400 text-sm italic">
                Not enough data to render radar chart.
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
            <div className="bg-indigo-50 border-b border-indigo-200 px-6 py-3">
              <div className="text-base font-bold text-indigo-800">Cluster Coverage Overview</div>
            </div>
            <div className="p-6">
              {sectionsPresent.mustHave && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Must-Have Section</div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      mhCov.pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {mhCov.pct}% Coverage
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div className={`h-full rounded-full ${mhCov.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${mhCov.pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {mhCov.covered} of {mhCov.total} skills covered across {mhCov.clusters} cluster{mhCov.clusters !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
              {sectionsPresent.niceToHave && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Nice-to-Have Section</div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      nhCov.pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {nhCov.pct}% Coverage
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div className={`h-full rounded-full ${nhCov.pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${nhCov.pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {nhCov.covered} of {nhCov.total} skills covered across {nhCov.clusters} cluster{nhCov.clusters !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
              <hr className="my-4 border-gray-200" />
              <div className="text-xs text-gray-500 leading-relaxed">
                <strong>Question Coverage</strong> reflects how much of the planned skill set Linda actually probed — not how
                well the candidate answered (that's the Section Score above).
              </div>
            </div>
          </div>
        </div>

        {/* 7. Skills assessment summary (full) */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Skills Assessment Summary</div>
          </div>
          {sectionsPresent.mustHave && flatMustHave.length > 0 && (
            <div className="p-6 border-b border-gray-200">
              <div className="text-sm font-bold text-gray-900 mb-3">
                Must-Have Skills ({flatMustHave.length} skill{flatMustHave.length !== 1 ? 's' : ''} evaluated)
              </div>
              <div className="space-y-1">
                {flatMustHave.map((s, i) => {
                  const sc = scoreColor(s.score);
                  const tagBg = s.tag === 'P1' ? 'bg-indigo-600' : s.tag === 'P2' ? 'bg-indigo-500' : 'bg-indigo-400';
                  return (
                    <div key={`mh-${i}`} className="grid grid-cols-[30%_15%_15%_minmax(0,1fr)_15%] items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                      <div><span className={`inline-block text-[10px] font-bold text-white px-2 py-0.5 rounded ${tagBg}`}>{s.tag}</span></div>
                      <div className="text-xs text-gray-500">Weight: {s.weight}</div>
                      <div className="pr-2">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                        </div>
                      </div>
                      <div className={`text-base font-bold ${sc.text} text-right`}>{s.score.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sectionsPresent.niceToHave && flatNiceToHave.length > 0 && (
            <div className="p-6">
              <div className="text-sm font-bold text-gray-900 mb-3">
                Nice-to-Have Skills ({flatNiceToHave.length} skill{flatNiceToHave.length !== 1 ? 's' : ''} evaluated)
              </div>
              <div className="space-y-1">
                {flatNiceToHave.map((s, i) => {
                  const sc = scoreColor(s.score);
                  const tagBg = s.tag === 'P1' ? 'bg-amber-500' : 'bg-amber-400';
                  return (
                    <div key={`nh-${i}`} className="grid grid-cols-[30%_15%_15%_minmax(0,1fr)_15%] items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                      <div><span className={`inline-block text-[10px] font-bold text-white px-2 py-0.5 rounded ${tagBg}`}>{s.tag}</span></div>
                      <div className="text-xs text-gray-500">Weight: {s.weight}</div>
                      <div className="pr-2">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                        </div>
                      </div>
                      <div className={`text-base font-bold ${sc.text} text-right`}>{s.score.toFixed(1)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {flatMustHave.length === 0 && flatNiceToHave.length === 0 && (
            <div className="p-6 text-sm text-gray-400 italic text-center">No skills evaluated yet.</div>
          )}
        </div>

        {/* 8. Question-by-question */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Question-by-Question Performance</div>
          </div>
          {perQuestionDetails.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {perQuestionDetails.map((q, i) => {
                const isHR = q.section === 'hr';
                const sc = scoreColor(q.questionScore);
                const sectionLabel = q.section === 'mth' ? 'Must-Have' : q.section === 'nth' ? 'Nice-to-Have' : 'HR';
                const sectionClass = q.section === 'mth'
                  ? 'bg-indigo-50 text-indigo-600'
                  : q.section === 'nth' ? 'bg-amber-50 text-amber-700' : 'bg-purple-50 text-purple-600';
                const middleText = isHR ? q.question : (q.skills.map(s => s.name).join(', ') || q.question);
                return (
                  <div key={i} className={`grid grid-cols-[15%_20%_minmax(0,1fr)_15%] items-center px-5 py-3 gap-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <div className="text-sm font-bold text-indigo-600">Q{q.qNum}</div>
                    <div><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sectionClass}`}>{sectionLabel}</span></div>
                    <div className="text-xs text-gray-500 truncate">{middleText}</div>
                    {isHR
                      ? <div className="text-xs font-medium text-gray-400 text-right italic">Review only</div>
                      : <div className={`text-base font-bold ${sc.text} text-right`}>{q.questionScore.toFixed(2)}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-400 italic text-center">No question-level data available.</div>
          )}
        </div>

        {/* 9. Recommendations */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-base font-bold text-gray-900">Recommendations &amp; Next Steps</div>
          </div>
          <div className="p-6">
            {isPassed ? (
              <>
                <div className="text-sm font-bold text-emerald-800 mb-3">✓ Recommended Actions:</div>
                <ul className="space-y-2 text-sm leading-relaxed text-gray-900 list-disc pl-5">
                  <li><strong>Proceed to next round:</strong> Candidate demonstrates strong technical competency across must-have skills</li>
                  <li><strong>Technical interview:</strong> Consider a deeper assessment in core architecture and design topics</li>
                  <li><strong>Cultural fit:</strong> Schedule a behavioral interview to assess team alignment</li>
                  <li><strong>Areas to explore:</strong> Skills showing medium-level proficiency can benefit from additional validation</li>
                </ul>
              </>
            ) : (
              <>
                <div className="text-sm font-bold text-red-800 mb-3">⚠ Recommended Actions:</div>
                <ul className="space-y-2 text-sm leading-relaxed text-gray-900 list-disc pl-5">
                  <li><strong>Do not proceed:</strong> Candidate did not meet the minimum requirements for must-have skills</li>
                  <li><strong>Skills gap identified:</strong> Significant development needed in core technical areas</li>
                  <li><strong>Alternative path:</strong> Consider for junior positions or recommend additional training</li>
                </ul>
              </>
            )}
          </div>
        </div>

        {/* 10. Footer — methodology + confidentiality (once) */}
        <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-6" style={{ pageBreakInside: 'avoid' }}>
          <p className="text-xs text-indigo-800 leading-relaxed mb-3">
            <strong>Evaluation Methodology:</strong> This report was generated using AI-powered automated assessment.
            Must-Have Section Score = Average of Must-Have question scores (Pass threshold ≥ {MHS_THRESHOLD.toFixed(1)}).
            Nice-to-Have Section Score = Average of Nice-to-Have question scores (informational only).
            Question Score = Σ(Skill Score × Priority Weight) / ΣWeights where P1=10, P2=7, P3=4.
          </p>
          <hr className="border-indigo-200 my-3" />
          <p className="text-xs text-indigo-600 leading-relaxed">
            <strong>Confidentiality Notice:</strong> This evaluation report contains proprietary and confidential
            information intended solely for authorized personnel in the hiring decision process.
          </p>
        </div>
      </div>
    </div>
  );
}
