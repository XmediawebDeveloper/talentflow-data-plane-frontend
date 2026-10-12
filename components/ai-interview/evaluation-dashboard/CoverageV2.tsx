// Coverage tab — converted from Vite source:
// /root/staging/MVP 1- Timed mode (Evaluation) 12-5-26/src/app/components/ClusterCoverage.tsx
// MUI Card/Box/Chip → Tailwind. Wired to live DashboardData clusters.
import { Check, X } from 'lucide-react';
import type { DashboardData, Cluster } from './types';

interface Props {
  data: DashboardData;
}

function priorityTagColor(priority: 'High' | 'Medium' | 'Low') {
  if (priority === 'High')   return { tag: 'P1', bg: 'var(--raw-4f46e5)' };
  if (priority === 'Medium') return { tag: 'P2', bg: 'var(--raw-6366f1)' };
  return                          { tag: 'P3', bg: 'var(--raw-a78bfa)' };
}

function niceToHaveTagColor(priority: 'High' | 'Medium' | 'Low') {
  if (priority === 'High')   return { tag: 'P1', bg: 'var(--raw-f59e0b)' };
  if (priority === 'Medium') return { tag: 'P2', bg: 'var(--raw-fbbf24)' };
  return                          { tag: 'P3', bg: 'var(--raw-fcd34d)' };
}

/** "Covered" = the question probed the skill. This is the Assessment Coverage
 *  signal from the backend's skill_assessed_map (built from question text +
 *  question_history at-ask-time assignments). Independent of how the
 *  candidate answered — a skill can be asked-but-not-demonstrated.
 *  Demonstration shows up as a sub-badge per skill (Low/Medium/High). */
function isAsked(s: { asked: boolean }): boolean {
  return !!s.asked;
}
function isDemonstrated(s: { asked: boolean; score: number }): boolean {
  // Medium (≥5) or High (≥8) on the 0-10 scale = actual demonstration — BUT
  // ONLY when the skill was genuinely asked. A skill that was never probed in
  // its section can still carry a leaked score (e.g. an NHS skill merely named
  // in an MHS answer when no NHS question was asked → BUG12); that is NOT a
  // demonstration, so gate it on `asked`.
  return !!s.asked && s.score >= 5;
}

function coverageStats(cluster: Cluster) {
  const total = cluster.skills.length;
  const covered = cluster.skills.filter(isAsked).length;
  const demonstrated = cluster.skills.filter(isDemonstrated).length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return { total, covered, demonstrated, pct };
}

function ClusterCard({
  cluster, sectionType,
}: {
  cluster: Cluster;
  sectionType: 'mh' | 'nh';
}) {
  const { total, covered, demonstrated, pct } = coverageStats(cluster);
  const tag = sectionType === 'mh' ? priorityTagColor(cluster.priority) : niceToHaveTagColor(cluster.priority);
  const coverageChip = pct === 100
    ? { bg: 'bg-emerald-100', text: 'text-emerald-700' }
    : pct >= 50
      ? { bg: 'bg-amber-100',   text: 'text-amber-700'   }
      : { bg: 'bg-red-100',     text: 'text-red-700'     };

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold text-gray-900">{cluster.name}</div>
          <span
            className="text-xs font-semibold text-white px-2 py-0.5 rounded"
            style={{ backgroundColor: tag.bg }}
          >
            {tag.tag}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-gray-500">
            {covered}/{total} covered
            <span className="text-gray-300"> · </span>
            {demonstrated} demonstrated
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${coverageChip.bg} ${coverageChip.text}`}>
            {pct}% Coverage
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {cluster.skills.map((s, i) => {
          const asked = isAsked(s);
          const demo = isDemonstrated(s);
          // Three states:
          //   asked + demonstrated  → green   "Asked · Demonstrated"
          //   asked + !demonstrated → amber   "Asked · No Evidence"
          //   !asked                → gray    "Not Asked"
          const tone = asked
            ? (demo
                ? { row: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', icon: <Check className="w-4 h-4 text-white" />, text: 'text-emerald-800', tagBg: 'bg-emerald-100', tagText: 'text-emerald-700', label: 'Covered · Demonstrated' }
                : { row: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500',   icon: <Check className="w-4 h-4 text-white" />, text: 'text-amber-800',   tagBg: 'bg-amber-100',   tagText: 'text-amber-700',   label: 'Covered' })
            :   { row: 'bg-gray-50 border-gray-200',         dot: 'bg-gray-400',    icon: <X     className="w-4 h-4 text-white" />, text: 'text-gray-500',    tagBg: 'bg-gray-100',    tagText: 'text-gray-500',    label: 'Not Covered' };
          // Show the depth level (Low/Medium/High) only when the candidate
          // actually demonstrated something — Low on a 0-score skill is
          // visual noise.
          const depthChip = demo ? s.level : null;
          // Always surface the numeric score when > 0 — earlier this view
          // only showed depth buckets, which made "answered weakly" (1-5)
          // look identical to "never asked" (0). Showing the number lets
          // recruiters see at a glance how the skill actually scored.
          const showScore = s.score > 0;
          const scoreChipCls = s.score >= 8 ? 'bg-emerald-600 text-white'
            : s.score >= 5 ? 'bg-emerald-500 text-white'
            : 'bg-amber-500 text-white';
          return (
            <div
              key={`${s.name}-${i}`}
              className={`flex items-center gap-3 p-2.5 rounded-lg border ${tone.row}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${tone.dot}`}>
                {tone.icon}
              </div>
              <div className={`text-sm font-semibold ${tone.text}`}>{s.name}</div>
              {/* Per-skill marks (score chip, depth chip, Covered/Not-Covered
                  label) removed 2026-05-30 — Cluster Coverage shows COVERAGE
                  (was the skill asked), not scores. Numeric per-skill scores
                  live in Skill Breakdown / Question Analysis. The dot icon
                  already signals covered vs not; cluster % is in the header. */}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({
  label, covered, total, demonstrated, pct, accent, bar,
}: {
  label: string;
  covered: number;
  total: number;
  demonstrated: number;
  pct: number;
  accent: string;
  bar: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-gray-700 dark:text-slate-300">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${accent}`}>{pct}%</div>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} coverage`}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-slate-400">
        <span><span className="font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{covered} / {total}</span> covered</span>
        <span><span className="font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{demonstrated}</span> demonstrated</span>
      </div>
    </div>
  );
}

export function CoverageV2({ data }: Props) {
  const mhClusters = data.mustHaveClusters;
  const nhClusters = data.niceToHaveClusters;

  const totalSkills = (cs: Cluster[]) => cs.reduce((n, c) => n + c.skills.length, 0);
  const askedSkills = (cs: Cluster[]) =>
    cs.reduce((n, c) => n + c.skills.filter(isAsked).length, 0);
  const demonstratedSkills = (cs: Cluster[]) =>
    cs.reduce((n, c) => n + c.skills.filter(isDemonstrated).length, 0);

  const mhTotal = totalSkills(mhClusters);
  const mhCov   = askedSkills(mhClusters);
  const mhDemo  = demonstratedSkills(mhClusters);
  const mhPct   = mhTotal > 0 ? Math.round((mhCov / mhTotal) * 100) : 0;

  const nhTotal = totalSkills(nhClusters);
  const nhCov   = askedSkills(nhClusters);
  const nhDemo  = demonstratedSkills(nhClusters);
  const nhPct   = nhTotal > 0 ? Math.round((nhCov / nhTotal) * 100) : 0;

  const bothSections = data.sectionsPresent.mustHave && data.sectionsPresent.niceToHave;

  return (
    <div className="space-y-6">

      {/* Side-by-side: Must-Have / Nice-to-Have. With only one section
          configured it takes the full width instead of half. */}
      <div className={`grid grid-cols-1 gap-6 ${bothSections ? 'lg:grid-cols-2' : ''}`}>
        {/* Must-Have Section */}
        {data.sectionsPresent.mustHave && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="text-lg font-bold text-gray-900">Must-Have Section (MHS)</div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                {mhClusters.length} Cluster{mhClusters.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {mhClusters.length > 0 ? (
                mhClusters.map((c, i) => <ClusterCard key={i} cluster={c} sectionType="mh" />)
              ) : (
                <div className="rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-400 italic">
                  No must-have clusters configured.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nice-to-Have Section */}
        {data.sectionsPresent.niceToHave && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="text-lg font-bold text-gray-900">Nice-to-Have Section (NHS)</div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                {nhClusters.length} Cluster{nhClusters.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {nhClusters.length > 0 ? (
                nhClusters.map((c, i) => <ClusterCard key={i} cluster={c} sectionType="nh" />)
              ) : (
                <div className="rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-400 italic">
                  No nice-to-have clusters configured.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Coverage Summary — one tile per configured section: label and
          coverage % on one line, a bar for the %, then the counts. */}
      <div className="rounded-2xl p-6 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 text-gray-900 dark:text-slate-50">
        <div className="mb-4">
          <div className="text-lg font-bold">Coverage Summary</div>
          <div className="text-sm text-gray-500 dark:text-slate-400">Skills asked during the interview, out of the skills configured for each section.</div>
        </div>
        <div className={`grid grid-cols-1 gap-4 ${bothSections ? 'md:grid-cols-2' : ''}`}>
          {data.sectionsPresent.mustHave && (
            <SummaryTile label="Must-Have Skills" covered={mhCov} total={mhTotal} demonstrated={mhDemo} pct={mhPct} accent="text-brand-blue" bar="bg-brand-blue" />
          )}
          {data.sectionsPresent.niceToHave && (
            <SummaryTile label="Nice-to-Have Skills" covered={nhCov} total={nhTotal} demonstrated={nhDemo} pct={nhPct} accent="text-brand-orange-deep" bar="bg-brand-orange" />
          )}
        </div>
      </div>
    </div>
  );
}
