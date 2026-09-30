'use client';

import { useEffect, useState } from 'react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

/**
 * Candidates assessed / interviewed per JD id, for the "N assessed" and
 * "N interviewed" chips on the Job Openings cards.
 *
 * The JD list endpoint carries neither number, so both are tallied here:
 *  - assessed    — each assessment's `completed_count`, summed by its jd_id.
 *  - interviewed — each AI interview config's completed + terminated sessions
 *                  (the same two statuses the Candidate Results tab lists),
 *                  read as the `total` of a page_size-1 page, summed by jd_id.
 *
 * `null` until the first tally lands, so the cards show nothing rather than a
 * misleading 0. After that the cached tally shows at once (see below). A
 * failed source counts as empty.
 */
export type JobCandidateCounts = Record<string, { assessed: number; interviewed: number }>;

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
/** Per-config session totals are fetched this many at a time. */
const CONCURRENCY = 6;

async function paginate<T>(
  fetchPage: (page: number) => Promise<{ items?: T[]; total?: number }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchPage(page);
    const items = res.items ?? [];
    all.push(...items);
    if (items.length < PAGE_SIZE || all.length >= (res.total ?? all.length)) break;
  }
  return all;
}

async function mapPooled<T>(items: T[], fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

async function loadAssessed(): Promise<Record<string, number>> {
  const byJd: Record<string, number> = {};
  try {
    const assessments = await paginate((page) => assessmentService.list({ page, page_size: PAGE_SIZE }));
    for (const a of assessments) {
      if (!a.jd_id) continue;
      byJd[a.jd_id] = (byJd[a.jd_id] || 0) + (a.completed_count || 0);
    }
  } catch { /* no assessments source — every job reads 0 */ }
  return byJd;
}

async function loadInterviewed(): Promise<Record<string, number>> {
  const byJd: Record<string, number> = {};
  try {
    const configs = await paginate((page) =>
      aiInterviewService.listConfigs({ page, page_size: PAGE_SIZE, compact: true }),
    );
    // Drafts have no sessions yet — skip their requests.
    const withSessions = configs.filter((c) => c.jd_id && c.status !== 'draft');
    await mapPooled(withSessions, async (config) => {
      const totals = await Promise.all(
        (['completed', 'terminated'] as const).map((status) =>
          aiInterviewService
            .getConfigInvitations(config.id, { page: 1, page_size: 1, compact: true, status })
            .then((res) => res.total || 0)
            .catch(() => 0),
        ),
      );
      const jdId = config.jd_id as string;
      byJd[jdId] = (byJd[jdId] || 0) + totals[0] + totals[1];
    });
  } catch { /* no interviews source — every job reads 0 */ }
  return byJd;
}

const CACHE_KEY = 'tf:jobCandidateCounts';

/** Last tally, in memory and in sessionStorage, so a revisit (or a reload in
 *  the same tab) paints the chips with the job cards instead of seconds later.
 *  A fresh tally still runs each visit and replaces it. */
let cached: JobCandidateCounts | null = null;
let inflight: Promise<JobCandidateCounts> | null = null;

const readCache = (): JobCandidateCounts | null => {
  if (cached) return cached;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) cached = JSON.parse(raw);
  } catch { /* storage blocked — no cache */ }
  return cached;
};

async function tally(): Promise<JobCandidateCounts> {
  const [assessed, interviewed] = await Promise.all([loadAssessed(), loadInterviewed()]);
  const merged: JobCandidateCounts = {};
  for (const id of new Set([...Object.keys(assessed), ...Object.keys(interviewed)])) {
    merged[id] = { assessed: assessed[id] || 0, interviewed: interviewed[id] || 0 };
  }
  cached = merged;
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
  return merged;
}

/**
 * Starts the tally (once per visit — concurrent callers share it). The Job
 * Openings page calls this on mount so it runs alongside the jobs request,
 * rather than only after the list has loaded and mounted the cards.
 */
export function prefetchJobCandidateCounts(): Promise<JobCandidateCounts> {
  if (!inflight) {
    inflight = tally().finally(() => {
      // Let the next visit tally afresh, but not a remount moments later.
      setTimeout(() => { inflight = null; }, 5000);
    });
  }
  return inflight;
}

export function useJobCandidateCounts(): JobCandidateCounts | null {
  const [counts, setCounts] = useState<JobCandidateCounts | null>(() =>
    typeof window === 'undefined' ? null : readCache(),
  );

  useEffect(() => {
    let cancelled = false;
    prefetchJobCandidateCounts().then((fresh) => { if (!cancelled) setCounts(fresh); });
    return () => { cancelled = true; };
  }, []);

  return counts;
}
