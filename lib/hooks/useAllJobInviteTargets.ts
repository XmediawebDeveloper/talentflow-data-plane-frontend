'use client';

import { useCallback, useEffect, useState } from 'react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import { isInvitableAssessment } from './useJobInviteTargets';

/**
 * The cross-job counterpart to useJobInviteTargets.
 *
 * A single JD's own assessment/AI-interview status is cheap to ask for
 * directly (one lookup, see useJobInviteTargets). The Resume Scoring lists
 * that span every job (the global "All Resumes" view) cannot do that per row
 * without one request per unique job on screen — which would mean a resume
 * list re-issuing dozens of assessment/AI-interview lookups on every render,
 * for jobs that were probably already checked one row up.
 *
 * Instead, this fetches every published assessment and every live AI
 * interview config ONCE (paginated in full, the same way
 * aiInterviewService.findLiveConfigForJd already paginates for a single JD),
 * and answers every row's question from those two sets in memory — the cost
 * stays flat as the resume list grows, since it's shaped by how many
 * assessments/configs the TENANT has, not how many rows are on screen.
 */

const LIVE_AI_INTERVIEW_STATUSES = [
  'published', 'invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled',
];

export interface AllJobInviteTargets {
  /** A published assessment exists for this JD. Undefined while still loading. */
  hasAssessment: (jdId: string) => boolean | undefined;
  /** A live AI interview config exists for this JD. Undefined while still loading. */
  hasAIInterview: (jdId: string) => boolean | undefined;
  loading: boolean;
  refresh: () => void;
}

async function fetchAllAssessmentJdIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 1;
  let seen = 0;
  while (page <= 50) {
    const res = await assessmentService.list({ page, page_size: 200 });
    const items = res?.items || [];
    for (const a of items) {
      if (isInvitableAssessment(a)) ids.add(a.jd_id);
    }
    seen += items.length;
    if (items.length < 200 || seen >= (res?.total ?? seen)) break;
    page += 1;
  }
  return ids;
}

async function fetchAllAiInterviewJdIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 1;
  let seen = 0;
  while (page <= 50) {
    const res = await aiInterviewService.listConfigs({ page, page_size: 200, compact: true });
    const items = res?.items || [];
    for (const c of items) {
      if (c.status !== 'archived' && LIVE_AI_INTERVIEW_STATUSES.includes(c.status)) {
        ids.add(c.jd_id);
      }
    }
    seen += items.length;
    if (items.length < 200 || seen >= (res?.total ?? seen)) break;
    page += 1;
  }
  return ids;
}

/**
 * @param enabled Skip both fetches entirely when false — e.g. a single-job
 *   host that already knows its one answer has no use for this.
 */
export function useAllJobInviteTargets(enabled: boolean = true): AllJobInviteTargets {
  const [assessmentJdIds, setAssessmentJdIds] = useState<Set<string> | null>(null);
  const [aiInterviewJdIds, setAiInterviewJdIds] = useState<Set<string> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [assessmentIds, aiInterviewIds] = await Promise.all([
          fetchAllAssessmentJdIds(),
          fetchAllAiInterviewJdIds(),
        ]);
        if (cancelled) return;
        setAssessmentJdIds(assessmentIds);
        setAiInterviewJdIds(aiInterviewIds);
      } catch (error) {
        console.error('[useAllJobInviteTargets] Failed to load invite targets:', error);
        // Deliberately leave both sets as `null` (not an empty Set) on
        // failure: `hasAssessment`/`hasAIInterview` then answer `undefined`
        // for every JD, which the per-row caller treats as "unknown, don't
        // gate" — the same as a host that never tracked this at all. An
        // empty Set here would instead read as "confirmed nothing
        // configured" and wrongly grey out every row over a network blip.
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, reloadToken]);

  const hasAssessment = useCallback(
    (jdId: string) => (assessmentJdIds ? assessmentJdIds.has(jdId) : undefined),
    [assessmentJdIds]
  );
  const hasAIInterview = useCallback(
    (jdId: string) => (aiInterviewJdIds ? aiInterviewJdIds.has(jdId) : undefined),
    [aiInterviewJdIds]
  );

  return {
    hasAssessment,
    hasAIInterview,
    loading: enabled && (assessmentJdIds === null || aiInterviewJdIds === null),
    refresh,
  };
}
