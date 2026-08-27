'use client';

import { useCallback, useEffect, useState } from 'react';
import { assessmentService } from '@/lib/services/assessmentService';
import { aiInterviewService } from '@/lib/services/aiInterviewService';

/**
 * What a JD can actually invite a candidate to.
 *
 * The Job Details page offers two invites — Assessment and AI Interview — from
 * three places (the Assessment/AI Interview sections' own Send Invite buttons,
 * each Scored Resumes row, and the Candidate View opened from that table). All
 * three must agree, so "configured" is defined once, here:
 *
 *   Assessment   → the JD has a PUBLISHED (or active) assessment. A draft has
 *                  nothing to invite to; clicking through would only bounce the
 *                  recruiter back with "publish it first".
 *   AI Interview → the JD has a LIVE config, i.e. one findLiveConfigForJd
 *                  matches. That call already encodes "published and in use",
 *                  and leaves a draft-only JD null — the same split.
 *
 * Revoked assessments are deliberately NOT excluded, matching JobDetailView's
 * own gate: that case has its own "duplicate one to start a fresh round"
 * message, which only lands if the click gets through.
 */
export interface JobInviteTargets {
  /** A published assessment exists for this JD. False while still loading. */
  assessmentConfigured: boolean;
  /** A live AI interview config exists for this JD. False while still loading. */
  aiInterviewConfigured: boolean;
  /**
   * Whether there was a JD to check at all. False for a caller with no job id
   * (or the global scoring view's 'global' sentinel, which spans many JDs) —
   * the two flags say nothing there, and a caller should leave its invites
   * ungated rather than read the `false` as "nothing configured".
   */
  known: boolean;
  /** True until both lookups have settled (or been skipped). */
  loading: boolean;
  /** Re-run the lookups — e.g. after creating or publishing one of them. */
  refresh: () => void;
}

const INVITABLE_ASSESSMENT_STATUSES = ['published', 'active'];

/** Published/active is the only pair the share flow treats as invitable. */
export function isInvitableAssessment(assessment: { status?: string | null } | null | undefined): boolean {
  return INVITABLE_ASSESSMENT_STATUSES.includes(String(assessment?.status || '').toLowerCase());
}

interface UseJobInviteTargetsOptions {
  /**
   * Values the host already knows. Supplied per side, and a supplied side is
   * never fetched — JobDetailView loads both on mount for its own Send Invite
   * buttons, and handing them down keeps the row menus on exactly the same
   * answer instead of racing a second copy of the same request.
   */
  assessmentConfigured?: boolean;
  aiInterviewConfigured?: boolean;
  /**
   * Skip the lookup for a side the viewer can't use anyway — no plan feature,
   * no permission. A skipped side reports false, which is what the gate wants:
   * nothing to invite to.
   */
  assessmentEnabled?: boolean;
  aiInterviewEnabled?: boolean;
}

/**
 * Resolve both invite targets for a JD.
 *
 * `jobId` may be absent or the Resume Scoring global view's 'global' sentinel,
 * which is not a JD at all — nothing is fetched then and `known` is false.
 */
export function useJobInviteTargets(
  jobId?: string,
  options: UseJobInviteTargetsOptions = {}
): JobInviteTargets {
  const {
    assessmentConfigured: assessmentOverride,
    aiInterviewConfigured: aiInterviewOverride,
    assessmentEnabled = true,
    aiInterviewEnabled = true,
  } = options;

  const realJobId = jobId && jobId !== 'global' ? jobId : undefined;
  const needsAssessmentFetch = assessmentOverride === undefined && assessmentEnabled && !!realJobId;
  const needsAIInterviewFetch = aiInterviewOverride === undefined && aiInterviewEnabled && !!realJobId;

  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  /* One key per distinct lookup. Results are stored against the key that
     produced them, so a change of JD (or of what needs fetching) invalidates
     them by comparison rather than by clearing state from inside the effect —
     no answer from the previous JD can be read as this one's. */
  const fetchKey =
    needsAssessmentFetch || needsAIInterviewFetch
      ? `${realJobId}|${needsAssessmentFetch}|${needsAIInterviewFetch}|${reloadToken}`
      : '';

  const [fetched, setFetched] = useState<{ key: string; assessment: boolean; aiInterview: boolean } | null>(null);
  const settled = fetched && fetched.key === fetchKey ? fetched : null;

  useEffect(() => {
    if (!fetchKey) return;
    let cancelled = false;

    // A JD with neither is the common case, so a failed lookup must not read as
    // "configured" — each side falls back to false and the invite stays shut.
    const assessmentLookup = needsAssessmentFetch
      ? assessmentService
          .list({ jd_id: realJobId, page_size: 100 })
          .then((resp) => (resp?.items || []).some(isInvitableAssessment))
          .catch(() => false)
      : Promise.resolve(false);

    const aiInterviewLookup = needsAIInterviewFetch
      ? aiInterviewService
          .findLiveConfigForJd(realJobId as string)
          .then((config) => !!config)
          .catch(() => false)
      : Promise.resolve(false);

    Promise.all([assessmentLookup, aiInterviewLookup]).then(([assessment, aiInterview]) => {
      if (!cancelled) setFetched({ key: fetchKey, assessment, aiInterview });
    });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, realJobId, needsAssessmentFetch, needsAIInterviewFetch]);

  return {
    assessmentConfigured: assessmentOverride ?? settled?.assessment ?? false,
    aiInterviewConfigured: aiInterviewOverride ?? settled?.aiInterview ?? false,
    // A host-supplied flag is itself an answer, so it counts as known even
    // without a job id of our own to check.
    known: !!realJobId || assessmentOverride !== undefined || aiInterviewOverride !== undefined,
    loading: !!fetchKey && !settled,
    refresh,
  };
}
