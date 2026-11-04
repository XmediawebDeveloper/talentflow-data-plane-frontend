'use client';

import { useEffect, useState } from 'react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { jdService } from '@/lib/services/jdService';
import { fetchAllPages } from '@/lib/utils/fetchPagesParallel';

/**
 * Candidates assessed / interviewed per JD id, for the "N assessed" and
 * "N interviewed" chips on the Job Openings cards.
 *
 * The JD list endpoint carries neither number, so both are tallied here:
 *  - assessed    — each assessment's `completed_count`, summed by its jd_id.
 *  - interviewed — each AI interview config's `completed_count` +
 *                  `terminated_count`, summed by its jd_id. Both fields are
 *                  batch-aggregated server-side (one GROUP BY query per page
 *                  of configs), so this costs the same one paginated list
 *                  call as `assessed` — no per-config follow-up requests.
 *
 * `null` until the first tally lands, so the cards show nothing rather than a
 * misleading 0. After that the cached tally shows at once (see below). A
 * failed source keeps its previously cached numbers (empty if there are none)
 * rather than overwriting them with zeros.
 */
export type JobCandidateCounts = Record<string, { assessed: number; interviewed: number }>;

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** Page 1, then the rest a few at a time — same items, same order, same
 *  stop rule (short page, total reached, MAX_PAGES) as a one-by-one loop. */
function paginate<T>(
  fetchPage: (page: number) => Promise<{ items?: T[]; total?: number }>,
): Promise<T[]> {
  return fetchAllPages(fetchPage, { pageSize: PAGE_SIZE, maxPages: MAX_PAGES });
}

/** `null` when the source failed — see `tally`. */
async function loadAssessed(): Promise<Record<string, number> | null> {
  const byJd: Record<string, number> = {};
  try {
    const assessments = await paginate((page) => assessmentService.list({ page, page_size: PAGE_SIZE }));
    for (const a of assessments) {
      if (!a.jd_id) continue;
      byJd[a.jd_id] = (byJd[a.jd_id] || 0) + (a.completed_count || 0);
    }
  } catch { return null; /* no assessments source this time */ }
  return byJd;
}

/** `null` when the source failed — see `tally`. */
async function loadInterviewed(): Promise<Record<string, number> | null> {
  const byJd: Record<string, number> = {};
  try {
    // completed_count / terminated_count are batch-aggregated server-side
    // (one GROUP BY query for the whole page) and come back on every config
    // already — summing them here costs zero extra requests, unlike the old
    // per-config-per-status fan-out (2 requests × every config tenant-wide).
    const configs = await paginate((page) =>
      aiInterviewService.listConfigs({ page, page_size: PAGE_SIZE, compact: true }),
    );
    for (const config of configs) {
      if (!config.jd_id) continue;
      const jdId = config.jd_id;
      byJd[jdId] = (byJd[jdId] || 0) + (config.completed_count || 0) + (config.terminated_count || 0);
    }
  } catch { return null; /* no interviews source this time */ }
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
  const [freshAssessed, freshInterviewed] = await Promise.all([loadAssessed(), loadInterviewed()]);
  /* A source that failed (any page) keeps what the last good tally had for
     it, so one flaky request cannot write zeros over real counts in the
     cache and sessionStorage. With no earlier tally it reads empty (0). */
  const previous = typeof window === 'undefined' ? null : readCache();
  const fromPrevious = (field: 'assessed' | 'interviewed') => {
    const byJd: Record<string, number> = {};
    for (const [id, row] of Object.entries(previous ?? {})) byJd[id] = row[field];
    return byJd;
  };
  const assessed = freshAssessed ?? fromPrevious('assessed');
  const interviewed = freshInterviewed ?? fromPrevious('interviewed');
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

/** `enabled: false` skips the tally and returns null — for a shared list whose
 *  hosts don't all show the chips. */
export function useJobCandidateCounts(enabled = true): JobCandidateCounts | null {
  const [counts, setCounts] = useState<JobCandidateCounts | null>(() =>
    typeof window === 'undefined' || !enabled ? null : readCache(),
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    prefetchJobCandidateCounts().then((fresh) => { if (!cancelled) setCounts(fresh); });
    return () => { cancelled = true; };
  }, [enabled]);

  return enabled ? counts : null;
}

/* Per-id counts already fetched by useJobCandidateCountsFor, so paging back to
   a page seen this visit paints its chips at once (then refreshes). */
const countsById: JobCandidateCounts = {};

/**
 * "N assessed" / "N interviewed" for just these JD ids (the rows on screen),
 * from GET /jd/candidate-counts — one request per set of ids, instead of
 * paging every assessment and every AI interview config tenant-wide.
 *
 * `null` until the first answer for this set lands (cards show nothing rather
 * than a misleading 0); ids answered before show their last numbers at once.
 * A failed request keeps whatever was known.
 */
export function useJobCandidateCountsFor(jdIds: string[], enabled = true): JobCandidateCounts | null {
  const key = enabled ? Array.from(new Set(jdIds.filter(Boolean))).sort().join(',') : '';
  const known = () => {
    if (!key) return null;
    const ids = key.split(',');
    if (!ids.every((id) => countsById[id])) return null;
    const out: JobCandidateCounts = {};
    ids.forEach((id) => { out[id] = countsById[id]; });
    return out;
  };
  const [counts, setCounts] = useState<JobCandidateCounts | null>(known);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setCounts(known());
    jdService
      .getCandidateCounts(key.split(','))
      .then((fresh) => {
        Object.assign(countsById, fresh);
        if (!cancelled) setCounts({ ...fresh });
      })
      .catch(() => { /* keep what is known */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return enabled ? counts : null;
}
