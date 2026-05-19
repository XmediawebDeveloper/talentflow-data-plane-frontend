// Coverage tab — converted from Vite source:
// /root/staging/MVP 1- Timed mode (Evaluation) 12-5-26/src/app/components/ClusterCoverage.tsx
// MUI Card/Box/Chip → Tailwind. Wired to live DashboardData clusters.
import { Check, X, Layers } from 'lucide-react';
import type { DashboardData, Cluster } from './types';

interface Props {
  data: DashboardData;
}

function priorityTagColor(priority: 'High' | 'Medium' | 'Low') {
  if (priority === 'High')   return { tag: 'P1', bg: '#4F46E5' };
  if (priority === 'Medium') return { tag: 'P2', bg: '#6366F1' };
  return                          { tag: 'P3', bg: '#A78BFA' };
}

function niceToHaveTagColor(priority: 'High' | 'Medium' | 'Low') {
  if (priority === 'High')   return { tag: 'P1', bg: '#F59E0B' };
  if (priority === 'Medium') return { tag: 'P2', bg: '#FBBF24' };
  return                          { tag: 'P3', bg: '#FCD34D' };
}

/** "Covered" = the question probed the skill. This is the Assessment Coverage
 *  signal from the backend's skill_assessed_map (built from question text +
 *  question_history at-ask-time assignments). Independent of how the
 *  candidate answered — a skill can be asked-but-not-demonstrated.
 *  Demonstration shows up as a sub-badge per skill (Low/Medium/High). */
function isAsked(s: { asked: boolean }): boolean {
  return !!s.asked;
}
function isDemonstrated(s: { score: number }): boolean {
  // Medium (≥5) or High (≥8) on the 0-10 scale = actual demonstration.
  // Low (1-5) is treated as "answered weakly", not demonstrated.
  return s.score >= 5;
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
              <div className="ml-auto flex items-center gap-1.5">
                {showScore && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${scoreChipCls}`}>
                    {s.score.toFixed(1)}/10
                  </span>
                )}
                {depthChip && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                    {depthChip}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tone.tagBg} ${tone.tagText}`}>
                  {tone.label}
                </span>
              </div>
            </div>
          );
        })}
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

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
        <div className="flex items-center gap-3">
          <Layers className="w-8 h-8" />
          <div>
            <div className="text-xl font-bold mb-0.5">Cluster Coverage Analysis</div>
            <div className="text-sm text-white/95">
              Shows which skill clusters and skills were covered in the interview questions.
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-side: Must-Have / Nice-to-Have */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

      {/* Coverage Summary */}
      <div className="rounded-2xl p-6 bg-gradient-to-br from-emerald-500 to-emerald-400 text-white">
        <div className="text-lg font-bold mb-4">Coverage Summary</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.sectionsPresent.mustHave && (
            <div>
              <div className="text-sm text-white/90 mb-1">Must-Have Skills Coverage:</div>
              <div className="text-2xl font-bold mb-1">{mhCov} / {mhTotal} covered</div>
              <div className="text-sm text-white/80 mb-1">{mhDemo} demonstrated</div>
              <div className="text-4xl font-bold">{mhPct}%</div>
            </div>
          )}
          {data.sectionsPresent.niceToHave && (
            <div>
              <div className="text-sm text-white/90 mb-1">Nice-to-Have Skills Coverage:</div>
              <div className="text-2xl font-bold mb-1">{nhCov} / {nhTotal} covered</div>
              <div className="text-sm text-white/80 mb-1">{nhDemo} demonstrated</div>
              <div className="text-4xl font-bold">{nhPct}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
