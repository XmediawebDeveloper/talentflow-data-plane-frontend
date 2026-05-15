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

/** A skill is "covered" when it was asked about during the interview, regardless
 *  of how well the candidate answered. Any score > 0 indicates the evaluator
 *  emitted a row for this skill (i.e. it was probed). The previous heuristic
 *  also required `level !== 'Low'`, which conflated "weak answer" with
 *  "never asked" — a skill scored 1.5 (level='Low') was wrongly shown as
 *  "Not Covered" even though it was clearly evaluated in the interview. */
function isCovered(score: number, _level: 'High' | 'Medium' | 'Low'): boolean {
  return score > 0;
}

function coverageStats(cluster: Cluster) {
  const total = cluster.skills.length;
  const covered = cluster.skills.filter(s => isCovered(s.score, s.level)).length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return { total, covered, pct };
}

function ClusterCard({
  cluster, sectionType,
}: {
  cluster: Cluster;
  sectionType: 'mh' | 'nh';
}) {
  const { total, covered, pct } = coverageStats(cluster);
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
          <div className="text-xs font-semibold text-gray-500">{covered}/{total} Skills</div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${coverageChip.bg} ${coverageChip.text}`}>
            {pct}% Coverage
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {cluster.skills.map((s, i) => {
          const covered = isCovered(s.score, s.level);
          return (
            <div
              key={`${s.name}-${i}`}
              className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                covered ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  covered ? 'bg-emerald-500' : 'bg-gray-400'
                }`}
              >
                {covered
                  ? <Check className="w-4 h-4 text-white" />
                  : <X     className="w-4 h-4 text-white" />}
              </div>
              <div className={`text-sm font-semibold ${covered ? 'text-emerald-800' : 'text-gray-500'}`}>
                {s.name}
              </div>
              <div className={`ml-auto text-xs font-semibold ${covered ? 'text-emerald-600' : 'text-gray-400'}`}>
                {covered ? 'Covered' : 'Not Covered'}
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
  const coveredSkills = (cs: Cluster[]) =>
    cs.reduce((n, c) => n + c.skills.filter(s => isCovered(s.score, s.level)).length, 0);

  const mhTotal = totalSkills(mhClusters);
  const mhCov   = coveredSkills(mhClusters);
  const mhPct   = mhTotal > 0 ? Math.round((mhCov / mhTotal) * 100) : 0;

  const nhTotal = totalSkills(nhClusters);
  const nhCov   = coveredSkills(nhClusters);
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
              <div className="text-2xl font-bold mb-1">{mhCov} / {mhTotal} Skills</div>
              <div className="text-4xl font-bold">{mhPct}%</div>
            </div>
          )}
          {data.sectionsPresent.niceToHave && (
            <div>
              <div className="text-sm text-white/90 mb-1">Nice-to-Have Skills Coverage:</div>
              <div className="text-2xl font-bold mb-1">{nhCov} / {nhTotal} Skills</div>
              <div className="text-4xl font-bold">{nhPct}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
