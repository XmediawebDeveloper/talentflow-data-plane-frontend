import type { DistRow } from '@/components/ai-interview/QuestionDistributionPopover';

/** The shape the distribution needs from a cluster — id and name are unused. */
export interface DistCluster {
  name: string;
  priority: number;
  skills: string[];
}

/**
 * The local per-question skill plan — what the stealth-dot popover shows when
 * nothing has been saved yet.
 *
 * Lifted out of AIInterviewDetailsView, which had it "ported verbatim from
 * AIInterviewClusters.tsx so the create-page popover and the details-page
 * popover always show the same per-Q skill mapping". Two verbatim copies is
 * how that guarantee gets broken by the first edit to either; one exported
 * function is how it holds. The Preview step needs the same fallback, which
 * would have made three.
 *
 * Deterministic, and the rules it follows:
 *   - Primary eligibility uses ONLY the "used-as-primary" set, so being a
 *     secondary earlier never blocks a skill from its own primary slot.
 *   - Forced duplication starts only once every skill has been primary once.
 *   - Secondary picks prefer skills never used as secondary in that cluster.
 */
export const distributeSkillsLocally = (
  clusters: DistCluster[],
  qCount: number,
  jdPool: string[] = [],
): DistRow[] => {
  if (qCount <= 0 || clusters.length === 0) return [];
  const _jdPoolSeen = new Set<string>();
  const jdPoolClean: string[] = [];
  for (const s of jdPool) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (_jdPoolSeen.has(k)) continue;
    _jdPoolSeen.add(k);
    jdPoolClean.push(t);
  }
  const sorted = [...clusters]
    .filter(c => (c.skills?.length ?? 0) > 0)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (sorted.length === 0) return [];

  // STEP 1 — per-cluster Q allocation by skill count
  const skillCounts = sorted.map(c => (c.skills?.length ?? 0));
  const totalSkills = skillCounts.reduce((s, n) => s + n, 0);
  const rawAlloc = sorted.map((_, i) =>
    totalSkills > 0
      ? (qCount * skillCounts[i]) / totalSkills
      : 0,
  );
  const allocations = rawAlloc.map(r => Math.floor(r));
  if (qCount < sorted.length) {
    for (let i = 0; i < allocations.length; i++) {
      allocations[i] = i < qCount ? 1 : 0;
    }
  } else {
    for (let i = 0; i < allocations.length; i++) {
      if (allocations[i] === 0 && skillCounts[i] > 0) allocations[i] = 1;
    }
  }
  let diff = qCount - allocations.reduce((a, b) => a + b, 0);
  while (diff < 0) {
    let trimIdx = -1;
    let trimSlack = -1;
    for (let i = 0; i < allocations.length; i++) {
      if (allocations[i] > 1) {
        const slack = allocations[i] - (qCount < sorted.length ? 1 : 0);
        if (slack > trimSlack) { trimSlack = slack; trimIdx = i; }
      }
    }
    if (trimIdx < 0) break;
    allocations[trimIdx] -= 1;
    diff += 1;
  }
  while (diff > 0) {
    const fracs = rawAlloc
      .map((r, i) => ({
        frac: r - Math.floor(r),
        priority: sorted[i].priority ?? 1,
        skillCount: skillCounts[i],
        i,
      }))
      .filter(({ skillCount }) => skillCount > 0)
      .sort((a, b) =>
        b.frac - a.frac
        || b.priority - a.priority
        || b.skillCount - a.skillCount,
      );
    if (fracs.length === 0) break;
    allocations[fracs[0].i] += 1;
    diff -= 1;
  }

  // STEP 2 — build per-Q rows
  const bucketUsedLower = new Set<string>();
  const out: DistRow[] = [];
  let qNum = 0;
  const orphanSkills: { skill: string; cluster: DistCluster }[] = [];
  for (let ci = 0; ci < sorted.length; ci++) {
    const cluster = sorted[ci];
    const alloc = allocations[ci];
    const skills = (cluster.skills ?? []).filter(
      s => typeof s === 'string' && s.trim()
    );
    if (alloc === 0 || skills.length === 0) {
      for (const s of skills) orphanSkills.push({ skill: s, cluster });
      continue;
    }
    const primaries: string[] = [];
    if (alloc <= skills.length) {
      primaries.push(...skills.slice(0, alloc));
    } else {
      primaries.push(...skills);
      const usedLower = new Set(skills.map(s => s.toLowerCase()));
      for (const jdSkill of jdPoolClean) {
        if (primaries.length >= alloc) break;
        if (usedLower.has(jdSkill.toLowerCase())) continue;
        primaries.push(jdSkill);
        usedLower.add(jdSkill.toLowerCase());
      }
      for (let p = primaries.length; p < alloc; p++) {
        primaries.push(skills[p % skills.length]);
      }
    }
    for (const p of primaries) bucketUsedLower.add(p.toLowerCase());
    const leftover = alloc <= skills.length ? skills.slice(alloc) : [];
    for (let i = 0; i < primaries.length; i++) {
      qNum += 1;
      const start = Math.floor((i * leftover.length) / primaries.length);
      const end = Math.floor(((i + 1) * leftover.length) / primaries.length);
      let secs: { name: string; priority: number }[];
      if (leftover.length > 0) {
        const slice = leftover.slice(start, end);
        for (const s of slice) bucketUsedLower.add(s.toLowerCase());
        secs = slice.map(s => ({
          name: s,
          priority: cluster.priority ?? 1,
        }));
      } else {
        const cycled = alloc > skills.length;
        const picked: string[] = [];
        if (cycled) {
          const tryPick = (cand: string) => {
            const k = cand.toLowerCase();
            if (bucketUsedLower.has(k)) return;
            bucketUsedLower.add(k);
            picked.push(cand);
          };
          for (let j = 0; j < jdPoolClean.length && picked.length < 2; j++) {
            tryPick(jdPoolClean[j]);
          }
          if (picked.length < 2) {
            for (let j = 0; j < skills.length && picked.length < 2; j++) {
              tryPick(skills[j]);
            }
          }
        }
        secs = picked.map(s => ({
          name: s,
          priority: cluster.priority ?? 1,
        }));
      }
      out.push({
        q: qNum,
        primary: primaries[i],
        secondaries: secs,
        cluster: cluster.name ?? '',
        priority: cluster.priority ?? 1,
      });
    }
  }

  // STEP 3 — orphan-cluster skills go to Q with fewest secondaries (no cap)
  for (const o of orphanSkills) {
    const target = out
      .slice()
      .sort((a, b) => a.secondaries.length - b.secondaries.length)[0];
    if (!target) break;
    target.secondaries.push({
      name: o.skill,
      priority: o.cluster.priority ?? 1,
    });
  }
  return out;
};
