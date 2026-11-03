// Coverage tab — converted from Vite source:
// /root/staging/MVP 1- Timed mode (Evaluation) 12-5-26/src/app/components/ClusterCoverage.tsx
// MUI Card/Box/Chip → Tailwind. Wired to live DashboardData clusters.
import { useState } from 'react';
import { Check, X, List, LayoutGrid } from 'lucide-react';
import type { DashboardData, Cluster } from './types';
import { orderQuestionsAsAsked } from './types';
import { getPriorityLabel } from '@/lib/constants/aiInterviewPriority';

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

/** Per-skill status tone — three states:
 *    asked + demonstrated  → green  "Covered · Demonstrated"
 *    asked + !demonstrated → amber  "Covered"
 *    !asked                → muted gray (disabled look) "Not Covered" */
function skillTone(s: Cluster['skills'][number]) {
  if (!isAsked(s)) {
    return { dot: 'bg-gray-300', icon: <X className="w-2.5 h-2.5 text-white" strokeWidth={3} />, text: 'text-gray-400', tagBg: 'bg-gray-100', tagText: 'text-gray-400', label: 'Not Covered' };
  }
  return isDemonstrated(s)
    ? { dot: 'bg-emerald-500', icon: <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />, text: 'text-gray-900', tagBg: 'bg-emerald-100', tagText: 'text-emerald-700', label: 'Covered · Demonstrated' }
    : { dot: 'bg-amber-500',   icon: <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />, text: 'text-gray-900', tagBg: 'bg-amber-100',   tagText: 'text-amber-700',   label: 'Covered' };
}

/** Compact two-segment bar: demonstrated (green) then covered-but-not-
 *  demonstrated (amber); the filled length is the coverage %. */
function SegmentedBar({
  total, demonstrated, nonDemonstrated, label, height = 'h-1',
}: {
  total: number;
  demonstrated: number;
  nonDemonstrated: number;
  label: string;
  height?: string;
}) {
  const w = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const pct = total > 0 ? Math.round(((demonstrated + nonDemonstrated) / total) * 100) : 0;
  return (
    <div
      className={`${height} flex rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full bg-emerald-500" style={{ width: `${w(demonstrated)}%` }} />
      <div className="h-full bg-amber-500" style={{ width: `${w(nonDemonstrated)}%` }} />
    </div>
  );
}

/** "● 2 Missing  ● 4 Demonstrated" legend for a SegmentedBar. */
function BarLegend({ nonDemonstrated, demonstrated, unit }: { nonDemonstrated: number; demonstrated: number; unit?: string }) {
  const suffix = unit ? ` ${unit}` : '';
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap tf-meta">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
        <span className="font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{nonDemonstrated}</span>
        Missing{suffix}
      </span>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{demonstrated}</span>
        Demonstrated{suffix}
      </span>
    </div>
  );
}

/** Coverage-% chip colour: full = green, half or more = amber, else red. */
function coverageChipTone(pct: number) {
  return pct === 100
    ? { bg: 'bg-emerald-100', text: 'text-emerald-700' }
    : pct >= 50
      ? { bg: 'bg-amber-100',   text: 'text-amber-700'   }
      : { bg: 'bg-red-100',     text: 'text-red-700'     };
}

function ClusterCard({
  cluster, sectionType, index,
}: {
  cluster: Cluster;
  sectionType: 'mh' | 'nh';
  index: number;
}) {
  const { total, covered, demonstrated, pct } = coverageStats(cluster);
  const tag = sectionType === 'mh' ? priorityTagColor(cluster.priority) : niceToHaveTagColor(cluster.priority);
  const coverageChip = coverageChipTone(pct);
  // P1/P2/P3 is derived from cluster.priority, so High/Medium/Low always matches the code.
  const priorityText = `${tag.tag} · ${cluster.priority} Priority`;
  // Shared scale is numeric (3 = High … 1 = Low).
  const priorityBadgeCls = getPriorityLabel(cluster.priority === 'High' ? 3 : cluster.priority === 'Medium' ? 2 : 1).color;
  return (
    <div className="@container rounded-2xl bg-white border-2 border-gray-200 p-5">
      {/* Header: index badge, name + priority tag, then progress + counts */}
      <div className="flex items-start gap-3 mb-4">
        {/* Index badge (01, 02…) uses the cluster's priority badge colours. */}
        <div
          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 text-sm font-bold tabular-nums ${priorityBadgeCls}`}
        >
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="tf-row-title leading-relaxed break-words">{cluster.name}</div>
            {/* Same priority colours as the Interview Details → Skill Clusters badges. */}
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${priorityBadgeCls}`}>
              {priorityText}
            </span>
          </div>
          <div className="mt-2 flex items-end gap-x-3 gap-y-1.5 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <div className="tf-caption mb-1">{covered}/{total} covered</div>
              <SegmentedBar
                total={total}
                demonstrated={demonstrated}
                nonDemonstrated={covered - demonstrated}
                label={`${cluster.name} coverage`}
              />
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums ${coverageChip.bg} ${coverageChip.text}`}>
              {pct}%
            </span>
          </div>
          <div className="mt-1.5">
            <BarLegend nonDemonstrated={covered - demonstrated} demonstrated={demonstrated} />
          </div>
        </div>
      </div>

      <SkillTable skills={cluster.skills} />
    </div>
  );
}

/** Skills as aligned columns: Skill | Status. Columns kick in when the card
 *  itself is wide enough (container query) — in the narrow side-by-side
 *  layout and on phones the status badge wraps under the skill name. */
function SkillTable({ skills }: { skills: Cluster['skills'] }) {
  const cols = '@xs:grid-cols-[minmax(0,1fr)_auto]';
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 p-2.5 text-center tf-hint italic">
        No skills configured.
      </div>
    );
  }
  return (
    <div>
      <div className={`hidden @xs:grid ${cols} gap-x-3 px-2.5 mb-1.5 text-xs font-medium text-gray-500`}>
        <div>Skill</div>
        <div className="text-right">Status</div>
      </div>
      <div className="flex flex-col gap-1">
        {skills.map((s, i) => {
          const tone = skillTone(s);
          return (
            <div
              key={`${s.name}-${i}`}
              className={`grid grid-cols-1 ${cols} items-center gap-x-3 gap-y-1 px-2.5 py-1`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${tone.dot}`}>
                  {tone.icon}
                </div>
                <div className={`text-xs font-medium leading-5 break-words min-w-0 ${tone.text}`}>{s.name}</div>
              </div>
              {/* On narrow cards the status badge sits under the name. */}
              <div className="pl-6 @xs:pl-0 @xs:text-right">
                <span className={`inline-block text-2xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${tone.tagBg} ${tone.tagText}`}>
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

/** List view — one table per section, grouped by cluster. Each cluster gets a
 *  header row with the same numbers as its Grid card (index, priority,
 *  covered count, bar, %, Missing / Demonstrated); its skills follow as rows:
 *  Skill | Asked in | Status. */
function SkillListTable({
  clusters, section, askedIn, emptyText,
}: {
  clusters: Cluster[];
  section: 'mth' | 'nth';
  /** `${section}|${skill name, lower-cased}` → interview-wide question numbers. */
  askedIn: Map<string, number[]>;
  emptyText: string;
}) {
  if (clusters.every(c => c.skills.length === 0)) {
    return (
      <div className="rounded-2xl border border-gray-200 p-6 text-center tf-body-muted italic">
        {emptyText}
      </div>
    );
  }
  const cols = '@xl:grid-cols-[minmax(0,1fr)_7rem_10rem]';
  return (
    <div className="tf-panel @container overflow-hidden">
      <div className={`hidden @xl:grid ${cols} items-center gap-x-4 px-4 sm:px-5 py-2.5 bg-brand-blue/5 border-b border-gray-200 text-xs font-semibold text-gray-700`}>
        <div>Skill</div>
        <div title="Question numbers as in Question Analysis">Asked in</div>
        <div className="text-right">Status</div>
      </div>
      <div className="divide-y divide-gray-200">
        {clusters.map((c, ci) => {
          const { total, covered, demonstrated, pct } = coverageStats(c);
          const chip = coverageChipTone(pct);
          const pr = getPriorityLabel(c.priority === 'High' ? 3 : c.priority === 'Medium' ? 2 : 1);
          const tag = priorityTagColor(c.priority).tag;
          return (
            <div key={`${c.name}-${ci}`}>
              {/* Cluster header row */}
              <div className="px-4 sm:px-5 py-2.5 bg-gray-50 border-b border-gray-200">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 text-xs font-bold tabular-nums ${pr.color}`}>
                      {String(ci + 1).padStart(2, '0')}
                    </div>
                    <div className="tf-row-title break-words">{c.name}</div>
                    <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${pr.color}`}>
                      {tag} · {c.priority} Priority
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="tf-caption whitespace-nowrap">{covered}/{total} covered</span>
                    <div className="w-24">
                      <SegmentedBar
                        total={total}
                        demonstrated={demonstrated}
                        nonDemonstrated={covered - demonstrated}
                        label={`${c.name} coverage`}
                      />
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums ${chip.bg} ${chip.text}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <div className="mt-1 pl-8">
                  <BarLegend nonDemonstrated={covered - demonstrated} demonstrated={demonstrated} />
                </div>
              </div>
              {/* Skill rows */}
              <div className="divide-y divide-gray-100">
                {c.skills.map((s, i) => {
                  const tone = skillTone(s);
                  const qs = askedIn.get(`${section}|${s.name.trim().toLowerCase()}`) ?? [];
                  return (
                    <div key={`${s.name}-${i}`} className={`grid grid-cols-1 ${cols} items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-2 @xl:pl-12`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${tone.dot}`}>
                          {tone.icon}
                        </div>
                        <div className={`text-sm font-medium break-words min-w-0 ${tone.text}`}>{s.name}</div>
                      </div>
                      <div className="pl-6 @xl:pl-0 tf-meta tabular-nums">
                        <span className="@xl:hidden text-gray-500">Asked in </span>
                        {qs.length > 0 ? qs.map(n => `Q${n}`).join(', ') : <span className="text-gray-400">—</span>}
                      </div>
                      <div className="pl-6 @xl:pl-0 @xl:text-right">
                        <span className={`inline-block text-2xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${tone.tagBg} ${tone.tagText}`}>
                          {tone.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({
  label, covered, total, demonstrated, pct, accent,
}: {
  label: string;
  covered: number;
  total: number;
  demonstrated: number;
  pct: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="tf-row-title">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${accent}`}>{pct}%</div>
      </div>
      <div className="mt-1 mb-1 tf-caption">
        <span className="font-semibold text-gray-900 dark:text-slate-100 tabular-nums">{covered} / {total}</span> skills covered
      </div>
      <SegmentedBar
        total={total}
        demonstrated={demonstrated}
        nonDemonstrated={covered - demonstrated}
        label={`${label} coverage`}
        height="h-1.5"
      />
      <div className="mt-1.5">
        <BarLegend nonDemonstrated={covered - demonstrated} demonstrated={demonstrated} unit="skills" />
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

  // "Asked in" — which delivered questions probed each skill, numbered as in
  // Question Analysis (interview-wide order, so never-asked slots still count).
  const askedIn = new Map<string, number[]>();
  orderQuestionsAsAsked(data.perQuestionDetails).forEach((q, i) => {
    if (q.notDelivered || q.responseType === 'not_asked' || q.section === 'hr') return;
    for (const k of q.skills) {
      const key = `${q.section}|${k.name.trim().toLowerCase()}`;
      const nums = askedIn.get(key) ?? [];
      if (!nums.includes(i + 1)) nums.push(i + 1);
      askedIn.set(key, nums);
    }
  });

  // List (default) = one table per section; Grid = the cluster cards.
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  // Same sliding segmented control as Skill Breakdown's List / Grid toggle.
  const layoutToggle = (
    <div
      role="radiogroup"
      aria-label="Skill coverage view"
      className="relative grid grid-cols-2 p-0.5 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10"
    >
      <span
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
          layout === 'grid' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {([['list', 'List', List], ['grid', 'Grid', LayoutGrid]] as const).map(([mode, label, Icon]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={layout === mode}
          onClick={() => setLayout(mode)}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap transition-colors duration-300 ${
            layout === mode ? 'text-brand-blue' : 'text-gray-500 hover:text-brand-blue'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  // Section heading; the List / Grid toggle sits at its right end, on the
  // heading that touches the page's right edge:
  //  - List, or Grid below lg (stacked): the first section's heading.
  //  - Grid at lg with both sections (side by side): the right column (NHS).
  // min-h-7 = toggle height, so side-by-side headings line up with or without it.
  const firstKind: 'mh' | 'nh' = data.sectionsPresent.mustHave ? 'mh' : 'nh';
  const sideBySide = layout === 'grid' && bothSections;
  const sectionHeading = (kind: 'mh' | 'nh') => {
    const count = kind === 'mh' ? mhClusters.length : nhClusters.length;
    const toggleCls = sideBySide
      ? kind === 'mh' ? 'lg:hidden' : 'hidden lg:block'
      : kind === firstKind ? '' : 'hidden';
    return (
      <div className="flex items-center gap-2 mb-3 flex-wrap min-h-7">
        <div className="tf-section-title">
          {kind === 'mh' ? 'Must-Have Section (MHS)' : 'Nice-to-Have Section (NHS)'}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${kind === 'mh' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
          {count} Cluster{count !== 1 ? 's' : ''}
        </span>
        {toggleCls !== 'hidden' && <div className={`ml-auto shrink-0 ${toggleCls}`}>{layoutToggle}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {layout === 'list' ? (
        <div className="space-y-6">
          {data.sectionsPresent.mustHave && (
            <div>
              {sectionHeading('mh')}
              <SkillListTable clusters={mhClusters} section="mth" askedIn={askedIn} emptyText="No must-have clusters configured." />
            </div>
          )}
          {data.sectionsPresent.niceToHave && (
            <div>
              {sectionHeading('nh')}
              <SkillListTable clusters={nhClusters} section="nth" askedIn={askedIn} emptyText="No nice-to-have clusters configured." />
            </div>
          )}
        </div>
      ) : (
        /* Side-by-side: Must-Have / Nice-to-Have. With only one section
           configured it takes the full width instead of half. */
        <div className={`grid grid-cols-1 gap-6 ${bothSections ? 'lg:grid-cols-2' : ''}`}>
          {/* Must-Have Section */}
          {data.sectionsPresent.mustHave && (
            <div>
              {sectionHeading('mh')}
              <div className="flex flex-col gap-4">
                {mhClusters.length > 0 ? (
                  mhClusters.map((c, i) => <ClusterCard key={i} index={i} cluster={c} sectionType="mh" />)
                ) : (
                  <div className="rounded-2xl border border-gray-200 p-6 text-center tf-body-muted italic">
                    No must-have clusters configured.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nice-to-Have Section */}
          {data.sectionsPresent.niceToHave && (
            <div>
              {sectionHeading('nh')}
              <div className="flex flex-col gap-4">
                {nhClusters.length > 0 ? (
                  nhClusters.map((c, i) => <ClusterCard key={i} index={i} cluster={c} sectionType="nh" />)
                ) : (
                  <div className="rounded-2xl border border-gray-200 p-6 text-center tf-body-muted italic">
                    No nice-to-have clusters configured.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coverage Summary — one tile per configured section: label and
          coverage % on one line, a bar for the %, then the counts. */}
      <div className="tf-card-soft p-6 text-gray-900 dark:text-slate-50">
        <div className="mb-4">
          <div className="text-base font-bold">Coverage Summary</div>
          <div className="tf-body-muted">Skills asked during the interview, out of the skills configured for each section.</div>
        </div>
        <div className={`grid grid-cols-1 gap-4 ${bothSections ? 'md:grid-cols-2' : ''}`}>
          {data.sectionsPresent.mustHave && (
            <SummaryTile label="Must-Have Skills" covered={mhCov} total={mhTotal} demonstrated={mhDemo} pct={mhPct} accent="text-brand-blue" />
          )}
          {data.sectionsPresent.niceToHave && (
            <SummaryTile label="Nice-to-Have Skills" covered={nhCov} total={nhTotal} demonstrated={nhDemo} pct={nhPct} accent="text-brand-orange-deep" />
          )}
        </div>
      </div>
    </div>
  );
}
