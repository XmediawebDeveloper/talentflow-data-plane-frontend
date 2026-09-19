'use client';

import { useState, useEffect, useCallback } from 'react';
import AITalentMatchPage from '@/components/AITalentMatchPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { aiMatchService, AIMatchSessionResponse, AIMatchSessionListResponse } from '@/lib/services/aiMatchService';
import { mapJDToJob } from '@/lib/utils/jobOpeningDisplay';
import { Loader2 } from 'lucide-react';
import FeatureGate from '@/components/shared/FeatureGate';

interface Job {
  id: string;
  title: string;
  department?: string;
  location: string;
  status: string;
  applicants: number;
  employmentType?: string;
  experience?: string;
  jobId?: string;
  currentVersion?: number;
  /** The raw lineage version number (same JD-ID, one entry per republish) —
   *  separate from `currentVersion` above, which blends in the publish
   *  counter for display. "View Versions" (job list) needs the real number
   *  to group and count a job's sibling versions correctly. */
  versionNumber?: number;
  /* Carried so the job rows can show what the Resume Scoring job rows show.
     All four already exist on the JD record; they were simply never mapped. */
  industryType?: string;
  remoteType?: string;
  postedBy?: string;
  postedDate?: string;
  /** Drives the AI / Manual badge next to Status in the version history table. */
  creationMethod?: string;
  /** ISO timestamp — "View Versions" tie-breaks same-version-number siblings
   *  by recency, the same way groupByLineage does everywhere else. */
  createdAt?: string;
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: any[];
}

// Transform JD API response to Job format for the component
//
// `currentVersion` (this page's own field, badge-visible as "vN" on every
// job card) takes the LINEAGE version first, exactly like Resume Scoring's
// own `toPageJob` mapping in ResumeScoringPage.tsx: routed through the same
// shared `mapJDToJob`, whose `versionNumber` is the lineage's v1/v2/v3 (same
// JD-ID, one entry per republish) while `currentVersion` there is the
// separate publish COUNTER (bumped by republishing without necessarily
// forking a new lineage entry). Reading the raw publish counter directly, as
// this used to, showed a job at a different version here than the identical
// JD showed on the Resume Scoring / Job Openings pages — this mapping is
// what keeps the two in agreement.
function transformJDToJob(jd: JDResponse): Job {
  const mapped = mapJDToJob(jd);
  return {
    id: mapped.id,
    title: mapped.title,
    department: mapped.department,
    location: mapped.location || '',
    status: mapped.status,
    applicants: mapped.applicants ?? 0,
    employmentType: mapped.employmentType,
    experience: mapped.experience,
    jobId: mapped.job_id,
    currentVersion: mapped.versionNumber ?? mapped.currentVersion,
    versionNumber: mapped.versionNumber,
    industryType: mapped.industry_type,
    remoteType: mapped.workMode,
    postedBy: mapped.postedBy,
    postedDate: mapped.postedDate,
    creationMethod: mapped.creation_method,
    createdAt: mapped.created_at,
  };
}

export default function AITalentMatchRoute() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [matchSessionCounts, setMatchSessionCounts] = useState<Record<string, number>>({});
  // "Top Match Rating (10)" / "Top Match Rating (9-7)": tenant-wide counts
  // precomputed server-side in the same /ai-match/sessions call, so these
  // stat cards render immediately instead of waiting on every session's
  // full candidate detail to be fetched and bucket-counted client-side.
  const [ratingBandCounts, setRatingBandCounts] = useState<{ exact: number; partial: number } | null>(null);
  // Every session from the same call, kept raw (not collapsed to one-per-job
  // like `matchHistory`) so "View Versions" can build its table straight from
  // memory instead of re-fetching per job version — see
  // AITalentMatchPage's getOptimisticAIMatchVersions.
  const [allMatchSessions, setAllMatchSessions] = useState<AIMatchSessionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Extracted so a completed match can trigger the same fetch again instead of
     only ever running once per mount. `matchHistory`/`jobs`/`matchSessionCounts`
     used to go stale after the FIRST match run because nothing re-called this —
     running a match only updated AITalentMatchPage's own local state. It looked
     like it "worked once" only because navigating away to create a JD and back
     happened to remount this route the first time; a second round trip hit
     Next's client-side route cache and reused the same (still stale) instance. */
  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
      try {
        if (!opts?.silent) setIsLoading(true);

        // Fetch ALL jobs (not just published) so we can show disabled jobs in history
        // and match history in parallel
        const [jobsResponse, historyResponse] = await Promise.all([
          jdService.list({ page_size: 100, source: 'my-jds' }), // Fetch user's jobs to show disabled jobs in history
          aiMatchService.listSessions({ page_size: 100 }).catch(
            (): AIMatchSessionListResponse => ({ items: [], total: 0, page: 1, page_size: 100 })
          ),
        ]);

        const transformedJobs = jobsResponse.items.map(transformJDToJob);
        setJobs(transformedJobs);

        // Group sessions by job - only keep the latest session per job
        const sessionsByJob = new Map<string, AIMatchSessionResponse>();
        // How many match runs a job has across its whole lineage, so the card
        // can show "View Version History" only when there is more than one run
        // to look back at. Keyed by the human JD-xxx code rather than the raw
        // session.jd_id: a republish forks the JD into a new row with its own
        // id, so a job matched once, republished, then matched again produces
        // two sessions with two DIFFERENT jd_ids — counting by jd_id alone
        // would read as "1 run" on each version and never show the button.
        const sessionCounts: Record<string, number> = {};
        for (const session of historyResponse.items) {
          const jobId = session.jd_id || session.search_query || 'unknown';
          const ownerJob = transformedJobs.find(j => j.id === session.jd_id);
          const countKey = ownerJob?.jobId || jobId;
          sessionCounts[countKey] = (sessionCounts[countKey] || 0) + 1;
          const existing = sessionsByJob.get(jobId);
          // Keep the most recent session for each job
          if (!existing || new Date(session.created_at) > new Date(existing.created_at)) {
            sessionsByJob.set(jobId, session);
          }
        }
        setMatchSessionCounts(sessionCounts);
        setRatingBandCounts({
          exact: historyResponse.top_rating_exact_count ?? 0,
          partial: historyResponse.top_rating_partial_count ?? 0,
        });
        setAllMatchSessions(historyResponse.items || []);

        // Keep route load summary-only.
        // Candidate details are fetched lazily when the user opens a specific session.
        const history: MatchHistory[] = Array.from(sessionsByJob.values()).map((session: AIMatchSessionResponse) => {
          const job = transformedJobs.find(j => j.id === session.jd_id);

          return {
            id: session.id,
            jobId: session.jd_id || '',
            jobTitle: job?.title || session.search_query || 'Unknown Job',
            matchedAt: new Date(session.created_at),
            totalMatches: session.total_matches,
            matchedCandidates: [],
          };
        });

        // Sort by most recent first
        history.sort((a, b) => b.matchedAt.getTime() - a.matchedAt.getTime());

        setMatchHistory(history);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        // A silent background refresh (after a match completes) failing
        // shouldn't wipe out the good data already on screen — only the
        // initial load clears state on error.
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setJobs([]);
          setMatchHistory([]);
          setMatchSessionCounts({});
          setRatingBandCounts(null);
          setAllMatchSessions([]);
        }
      } finally {
        setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Update matchHistory the INSTANT a match finishes, rather than waiting on
     the silent server refetch (`onMatchComplete` below) to pick it up. The
     refetch hits GET /ai-match/sessions right after the match completes —
     if the backend writes that session record slightly after responding
     with the match results (a plausible async/eventual-consistency gap),
     the refetch can win the race and come back with the OLD list, so
     "Matched Jobs" still reads its pre-match count even though the match
     genuinely just ran. This optimistic update doesn't depend on that
     timing at all — it uses the same MatchHistory object the child already
     built locally. The silent refetch stays in place as a background
     reconciliation (candidate counts, session de-dup) but is no longer the
     only source for the stat the user is actually watching. */
  const handleSaveMatch = useCallback((newMatch: MatchHistory) => {
    setMatchHistory(prev => {
      const existingIndex = prev.findIndex(h => h.jobId === newMatch.jobId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newMatch;
        return updated;
      }
      return [newMatch, ...prev];
    });
  }, []);

  if (isLoading) {
    return (
      <div className="tf-loader-page bg-slate-50 p-4">
        <div className="text-center">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brand-blue animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-slate-400 font-medium">Loading jobs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tf-loader-page bg-slate-50 p-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 ring-1 ring-red-200 dark:ring-red-500/40 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-600 dark:text-red-400 text-lg sm:text-xl">!</span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 tracking-tight">Failed to Load Jobs</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white text-sm rounded-lg transition-all font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <FeatureGate feature="ai_talent_match">
      <div className="relative flex-1 flex flex-col overflow-x-clip bg-slate-50">
        <AITalentMatchPage
          jobs={jobs}
          matchHistory={matchHistory}
          matchSessionCounts={matchSessionCounts}
          ratingBandCounts={ratingBandCounts}
          allMatchSessions={allMatchSessions}
          onSaveMatch={handleSaveMatch}
          onMatchComplete={() => fetchData({ silent: true })}
        />
      </div>
    </FeatureGate>
  );
}
