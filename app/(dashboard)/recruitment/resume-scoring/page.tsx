'use client';

import { formatExperienceRange } from '@/lib/utils/jobExperience';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ResumeScoringPage from '@/components/ResumeScoringPage';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { resumeService, folderService } from '@/lib/services/resumeService';
import { scoringService, normalizeScoringStatus } from '@/lib/services/scoringService';
import type { ScoredJdListParams, ScoredJdListResponse, ScoredJdRow } from '@/lib/services/scoringService';
import type { ScoredJobsPage } from '@/components/ResumeScoringPage';
import { Resume, Folder } from '@/lib/types/types';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { parseIST } from '@/lib/utils/dateUtils';
import FeatureGate from '@/components/shared/FeatureGate';
import { usePlanFeature } from '@/lib/hooks/usePlanFeature';
import ResumeScoringSkeleton from '@/components/ResumeScoringSkeleton';
import { fetchAllRows } from '@/lib/utils/fetchAllRows';
import { cachedList, listCacheKey, LIST_CACHE_TTL_MS } from '@/lib/utils/listCache';
import { clearScoringOrigin, FROM_RESUME_DATABASE } from '@/lib/utils/resumeActivityTrail';

interface ScoredResumeData {
  id: string;
  jobId: string;
  jobTitle: string;
  scoredAt: Date;
  /** The raw backend source of the most recently scored resume in this JD's
   *  group (e.g. 'my-resumes', 'database', 'ai_talent_match'). Not currently
   *  displayed anywhere; kept as real data in case a future surface needs it. */
  source: string;
  // JD metadata forwarded to <ResumeScoringPage />. This local copy of the interface had
  // drifted from the one in components/ResumeScoringPage.tsx, which declares all of these;
  // the object literal below has always passed them.
  jdStatus?: string;
  jdJobId?: string;
  jdCreationMethod?: string;
  jdCurrentVersion?: number;
  jdVersionNumber?: number;
  jdDepartment?: string;
  jdIndustryType?: string;
  jdEmploymentType?: string;
  jdRemoteType?: string;
  jdLocation?: string;
  jdPublishedAt?: string;
  jdCreatedByName?: string;
  totalScored: number;
  scoredResumes: any[];
  /** Server-counted Exact / Partial / No Match for this JD version (every
   *  score event) — GET /scoring/jds. Lets the job rows show their counts
   *  without the whole scored-resume table in the browser. */
  verdictCounts?: { exact: number; partial: number; none: number };
  /** Who ran this version's most recent scoring. */
  latestScoredBy?: string;
  /** True once `scoredResumes` holds this version's own scores (loadJdScores). */
  scoresLoaded?: boolean;
}

/** One GET /scoring/jds version row as the page's history entry (no scores yet). */
const scoredJdRowToHistory = (row: ScoredJdRow): ScoredResumeData => ({
  id: row.jd_id,
  jobId: row.jd_id,
  jobTitle: row.jd_title || 'Unknown Job',
  scoredAt: parseIST(row.latest_scored_at || new Date().toISOString()),
  source: 'database',
  jdStatus: row.jd_status || 'published',
  jdJobId: row.jd_job_id,
  jdCreationMethod: row.jd_creation_method,
  jdCurrentVersion: row.jd_current_version,
  jdVersionNumber: row.jd_version_number,
  jdDepartment: row.jd_department,
  jdIndustryType: row.jd_industry_type,
  jdEmploymentType: row.jd_employment_type,
  jdRemoteType: row.jd_remote_type,
  jdLocation: row.jd_location,
  jdPublishedAt: row.jd_published_at || undefined,
  jdCreatedByName: row.jd_created_by_name || undefined,
  totalScored: row.scored_count || 0,
  scoredResumes: [],
  verdictCounts: { exact: row.exact_count || 0, partial: row.partial_count || 0, none: row.no_match_count || 0 },
  latestScoredBy: row.latest_scored_by_name,
});

/** View by Job's server query before the page sends its own (restored) one. */
const DEFAULT_HISTORY_QUERY: ScoredJdListParams = { page: 1, page_size: 10 };

interface Job {
  id: string;
  title: string;
  location: string;
  department: string;
  status: string;
  applicants: number;
  employmentType?: string;
  remoteType?: string;
  mustHaveComments?: string[];
  experience?: string;
}

export default function ResumeScoringRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /* Entered any way but Resume Database's Score Resume (`from=resume-database`):
     Resume Database's trail does not apply. Cleared while this first renders,
     before the scoring view reads it. */
  const enteredFromResumeDatabase = searchParams.get('from') === FROM_RESUME_DATABASE;
  useState(() => {
    if (typeof window !== 'undefined' && !enteredFromResumeDatabase) clearScoringOrigin();
    return null;
  });
  const fromQuery = enteredFromResumeDatabase ? `&from=${FROM_RESUME_DATABASE}` : '';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [scoredHistory, setScoredHistory] = useState<ScoredResumeData[]>([]);
  // Total Resumes Scored / Exact / Partial / No Match, read off the cheap
  // page_size:1 probe `loadScoredHistory` already makes to GET /scoring/all
  // (which computes these via three fast COUNT queries on every call) —
  // set as soon as THAT resolves, well before the much slower follow-up
  // fetch of the entire scored-resume table `scoredHistory` waits on. See
  // ResumeScoringPage's `scoreCounts` prop.
  const [scoreCounts, setScoreCounts] = useState<{
    total: number; exact: number; partial: number; none: number;
    /** Distinct candidates behind each card (the cards' "N candidates" chip). */
    people?: { all: number; exact: number; partial: number; none: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  // `jobs` has its final value (see fetchData) — lets the JD-first flow tell
  // "not loaded yet" from "that JD is not a published one".
  const [jobsLoaded, setJobsLoaded] = useState(false);
  // Set once the mount effect has read the URL params into state, so the page
  // never mounts with them still unset.
  const [paramsReady, setParamsReady] = useState(false);
  // Read only to time the first mount (see the render gate at the bottom):
  // FeatureGate shows a bare spinner until plan availability is known.
  const { loading: planFeatureLoading } = usePlanFeature('resume_scoring');
  const [pageMounted, setPageMounted] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  /* Lineages + archived/disabled version counts that came WITH the scored-JD
     index (include_lineages) — handed to the page so its View by Job rows do
     not ask /jd/lineages and then /scoring/jd/counts after the list. */
  const [historyLineageSeed, setHistoryLineageSeed] = useState<{
    lineages?: ScoredJdListResponse['lineages'];
    versionCounts?: ScoredJdListResponse['version_counts'];
  } | null>(null);
  /* View by Job's current server page (GET /scoring/jds, one row per job,
     search / filters / sort / paging applied on the server). null until the
     first page lands, and for good on an older backend without
     `expand_versions` - the page then pages the full index itself. */
  const [historyPage, setHistoryPage] = useState<ScoredJobsPage | null>(null);
  const historyQueryRef = useRef<ScoredJdListParams>(DEFAULT_HISTORY_QUERY);
  /* Set once a response shows the backend has no `expand_versions`: from then
     on the whole scored-version index is loaded, as before. */
  const legacyIndexRef = useRef(false);
  const [initialJdId, setInitialJdId] = useState<string | null>(null);
  const [initialScoreId, setInitialScoreId] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [initialNewScoring, setInitialNewScoring] = useState(false);
  const [pendingScoringData, setPendingScoringData] = useState<{
    jobId: string;
    jobTitle: string;
    resumeIds: string[];
    resumeNames: string[];
    source?: 'Internal DB' | 'My Resumes';
    alreadyScoredItems?: Array<{
      resumeId: string;
      candidateName: string;
      score: number;
      overallRating10?: number;
    }>;
  } | null>(null);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    /** The Celery batch — the progress popup's Cancel / Retry act on it. */
    batchId?: string;
    jobId: string;
    jobTitle: string;
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    items?: {
      resumeId: string;
      candidateName: string;
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'already_scored';
      score?: number;
      overallRating10?: number;
      matchStatus?: string;
      errorMessage?: string;
    }[];
  } | null>(null);

  useEffect(() => {
    // Check if there's a jd_id in URL params
    const jdId = searchParams.get('jd_id');
    const scoreId = searchParams.get('score_id');
    const showProgressParam = searchParams.get('show_progress');
    const startScoringParam = searchParams.get('start_scoring');
    const batchIdParam = searchParams.get('batch_id');

    if (jdId) {
      console.log('[ResumeScoringRoute] Found jd_id in URL:', jdId);
      setInitialJdId(jdId);
    }
    if (scoreId) {
      console.log('[ResumeScoringRoute] Found score_id in URL:', scoreId);
      setInitialScoreId(scoreId);
    }
    if (showProgressParam === 'true') {
      console.log('[ResumeScoringRoute] Show progress requested');
      setShowProgress(true);
    }

    // Handle mode=new (Quick Action / JD-first scoring flow). With jd_id it
    // pre-selects the JD; without it just lands directly in "new scoring" view.
    const modeParam = searchParams.get('mode');
    if (modeParam === 'new') {
      console.log('[ResumeScoringRoute] mode=new requested, jd_id:', jdId || '(none)');
      setInitialNewScoring(true);
    }

    // Handle batch_id from async scoring (Celery)
    if (batchIdParam) {
      console.log('[ResumeScoringRoute] Found batch_id:', batchIdParam);
      setPendingBatchId(batchIdParam);

      // Immediately fetch current batch status from API (don't wait for poll interval)
      const fetchInitialStatus = async () => {
        let storedResumeItems: { resumeId: string; candidateName: string }[] = [];
        let alreadyScoredItems: { resumeId: string; candidateName: string; score?: number; matchStatus?: string }[] = [];
        try {
          const storedData = sessionStorage.getItem('pendingScoringBatch');
          if (storedData) {
            const data = JSON.parse(storedData);
            storedResumeItems = data.resumeItems || [];
            alreadyScoredItems = data.alreadyScoredItems || [];
          }
        } catch (e) {
          console.error('[ResumeScoringRoute] Error reading sessionStorage:', e);
        }

        const candidateNameMap = new Map<string, string>();
        storedResumeItems.forEach(item => {
          candidateNameMap.set(item.resumeId, item.candidateName);
        });

        const alreadyScoredProgressItems = alreadyScoredItems.map(item => ({
          resumeId: item.resumeId,
          candidateName: item.candidateName || 'Unknown',
          status: 'already_scored' as const,
          score: item.score,
          overallRating10: (item as { overallRating10?: number }).overallRating10,
          matchStatus: item.matchStatus,
        }));

        try {
          const status = await scoringService.getBatchStatus(batchIdParam);

          let batchItems: { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'already_scored'; score?: number; overallRating10?: number; matchStatus?: string; errorMessage?: string }[];

          if (status.items && status.items.length > 0) {
            batchItems = status.items.map((item: any) => ({
              resumeId: item.resume_id,
              candidateName: candidateNameMap.get(item.resume_id) || item.candidate_name || 'Unknown',
              status: item.status,
              score: item.overall_score,
              overallRating10: item.overall_rating_10,
              resumeDeleted: item.resume_deleted,
              matchStatus: item.match_status,
              errorMessage: item.error_message,
            }));
          } else if (storedResumeItems.length > 0) {
            batchItems = storedResumeItems.map(item => ({
              resumeId: item.resumeId,
              candidateName: item.candidateName || 'Unknown',
              status: 'queued' as const,
            }));
          } else {
            batchItems = [];
          }

          const allItems = [...alreadyScoredProgressItems, ...batchItems];

          setBatchProgress({
            batchId: status.batch_id,
            jobId: status.jd_id,
            jobTitle: status.jd_title,
            total: (status.total || storedResumeItems.length) + alreadyScoredItems.length,
            queued: status.queued,
            processing: status.processing,
            completed: status.completed,
            failed: status.failed,
            items: allItems,
          });
        } catch (e) {
          console.error('[ResumeScoringRoute] Error fetching initial status:', e);
          if (storedResumeItems.length > 0 || alreadyScoredItems.length > 0) {
            try {
              const storedData = sessionStorage.getItem('pendingScoringBatch');
              if (storedData) {
                const data = JSON.parse(storedData);
                const batchItems = storedResumeItems.map(item => ({
                  resumeId: item.resumeId,
                  candidateName: item.candidateName || 'Unknown',
                  status: 'queued' as const,
                }));
                const allItems = [...alreadyScoredProgressItems, ...batchItems];
                setBatchProgress({
                  batchId: batchIdParam,
                  jobId: data.jobId,
                  jobTitle: data.jobTitle,
                  total: data.totalResumes,
                  queued: data.totalResumes - alreadyScoredItems.length,
                  processing: 0,
                  completed: 0,
                  failed: 0,
                  items: allItems,
                });
              }
            } catch (e2) {
              console.error('[ResumeScoringRoute] Error reading stored data:', e2);
            }
          }
        }
      };
      fetchInitialStatus();
    } else {
      // No batch_id in URL - clear any stale sessionStorage data to prevent modal from appearing
      try {
        sessionStorage.removeItem('pendingScoringBatch');
      } catch (e) {
        // Ignore sessionStorage errors
      }
    }

    // Check for pending scoring data from my-resumes page (old sync method)
    if (startScoringParam === 'true') {
      try {
        const storedData = sessionStorage.getItem('pendingScoringData');
        if (storedData) {
          const data = JSON.parse(storedData);
          console.log('[ResumeScoringRoute] Found pending scoring data:', data);
          setPendingScoringData(data);
          sessionStorage.removeItem('pendingScoringData');
        }
      } catch (e) {
        console.error('[ResumeScoringRoute] Error reading pending scoring data:', e);
      }
    }

    // Independent fetches — `loadScoredHistory` doesn't read anything
    // `fetchData` produces, so chaining them with `.then()` used to make the
    // stat cards (and the rest of the scoring history) wait out the JD/resume/
    // folder fetch for no reason before even starting. Each manages its own
    // loading state, so firing both together is safe.
    fetchData();
    // The default first page goes out now; the page's own query (restored
    // filters / page) replaces it only if it differs.
    loadScoredHistory();
    // The URL-derived state above is now set, so <ResumeScoringPage> can mount
    // with it (see the render gate at the bottom).
    setParamsReady(true);
  }, []);

  // Poll for batch status when we have a pending batch
  useEffect(() => {
    if (!pendingBatchId) return;

    // Get candidate names and already-scored items from sessionStorage once at the start of polling
    let storedResumeItems: { resumeId: string; candidateName: string }[] = [];
    let alreadyScoredItems: { resumeId: string; candidateName: string; score?: number; matchStatus?: string; scoredAt?: string }[] = [];
    try {
      const storedData = sessionStorage.getItem('pendingScoringBatch');
      if (storedData) {
        const data = JSON.parse(storedData);
        storedResumeItems = data.resumeItems || [];
        alreadyScoredItems = data.alreadyScoredItems || [];
      }
    } catch (e) {
      // Ignore sessionStorage errors
    }

    // Create a map for quick lookup of candidate names by resumeId
    const candidateNameMap = new Map<string, string>();
    storedResumeItems.forEach(item => {
      candidateNameMap.set(item.resumeId, item.candidateName);
    });

    // Pre-build already-scored items with fixed status
    const alreadyScoredProgressItems = alreadyScoredItems.map(item => ({
      resumeId: item.resumeId,
      candidateName: item.candidateName || 'Unknown',
      status: 'already_scored' as const,
      score: item.score,
      overallRating10: (item as { overallRating10?: number }).overallRating10,
      matchStatus: item.matchStatus,
    }));

    // Accumulate items across poll cycles so completed items are never dropped
    // from the UI when the API stops returning them.
    type BatchItem = { resumeId: string; candidateName: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'already_scored'; score?: number; overallRating10?: number; matchStatus?: string; errorMessage?: string };
    const accumulatedItems = new Map<string, BatchItem>();

    // Seed the map from sessionStorage so all candidates are shown immediately
    storedResumeItems.forEach(item => {
      accumulatedItems.set(item.resumeId, {
        resumeId: item.resumeId,
        candidateName: item.candidateName || 'Unknown',
        status: 'queued',
      });
    });

    // Circuit breaker to match the upload-batch poll further down this file:
    // if the backend never settles this batch, stop polling it forever rather
    // than leaving the popup stuck at "Processing" with nothing the recruiter
    // can do about it.
    const pollTimeout = setTimeout(() => {
      console.warn('[ResumeScoringRoute] Batch poll timed out after 10 minutes, stopping');
      clearInterval(pollInterval);
      setPendingBatchId(null);
    }, 600000);

    const pollInterval = setInterval(async () => {
      try {
        const status = await scoringService.getBatchStatus(pendingBatchId);

        if (status.items && status.items.length > 0) {
          // Merge API-returned items into the accumulated map
          status.items.forEach((item: any) => {
            accumulatedItems.set(item.resume_id, {
              resumeId: item.resume_id,
              candidateName: candidateNameMap.get(item.resume_id) || item.candidate_name || 'Unknown',
              status: item.status === 'cancelled' ? 'cancelled' as const : normalizeScoringStatus(item.status),
              score: item.overall_score,
              overallRating10: item.overall_rating_10,
              matchStatus: item.match_status,
              errorMessage: item.error_message,
            });
          });
        }

        // Build the final list: always-scored items first, then accumulated batch items
        const allItems = [...alreadyScoredProgressItems, ...Array.from(accumulatedItems.values())];

        setBatchProgress({
          batchId: status.batch_id,
          jobId: status.jd_id,
          jobTitle: status.jd_title,
          total: (status.total || storedResumeItems.length) + alreadyScoredItems.length,
          queued: status.queued,
          processing: status.processing,
          completed: status.completed,
          failed: status.failed,
          items: allItems,
        });

        // Stop polling when batch is complete. The `status.status` string is
        // the primary signal, but SelectSourceModal.tsx's own poll (the
        // Score-Resumes flow's equivalent of this one) also falls back to the
        // counts reaching zero — this copy was missing that fallback, so a
        // batch whose aggregate `status` field never flipped to
        // 'completed'/'failed' (queued/processing both already at 0) polled
        // forever, stuck at "Processing: 1" / 0% with no way to close it.
        const aggregateStatus = normalizeScoringStatus(status.status);
        if (aggregateStatus === 'completed' || aggregateStatus === 'failed' ||
            (status.queued === 0 && status.processing === 0)) {
          console.log('[ResumeScoringRoute] Batch completed, stopping poll');
          clearInterval(pollInterval);
          clearTimeout(pollTimeout);
          setPendingBatchId(null);

          // Reload scored history to show new results
          setTimeout(async () => {
            await loadScoredHistory();
            // Clear sessionStorage after loading history
            try {
              sessionStorage.removeItem('pendingScoringBatch');
              console.log('[ResumeScoringRoute] Cleared pendingScoringBatch from sessionStorage');
            } catch (e) {
              console.error('[ResumeScoringRoute] Error clearing pendingScoringBatch:', e);
            }
            // Update URL without full page reload to preserve state
            router.push(`/recruitment/resume-scoring?jd_id=${status.jd_id}${fromQuery}`);
          }, 2000);
        }
      } catch (e) {
        console.error('[ResumeScoringRoute] Error polling batch status:', e);
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      clearInterval(pollInterval);
      clearTimeout(pollTimeout);
    };
  }, [pendingBatchId]);

  /* Bumped by every loadScoredHistory run (and per JD by every loadJdScores
     run), so a response belonging to an older run is dropped instead of
     overwriting newer data. A finished batch refreshes the history from two
     places (the poll above and ResumeScoringPage's own completion handler) a
     few seconds apart; without this, whichever response landed last won,
     even when it was the older read. */
  const historySeqRef = useRef(0);
  const jdScoresSeqRef = useRef(new Map<string, number>());

  /* JD ids whose full score list has been loaded this session (loadJdScores):
     a history refresh re-reads exactly those, so an open job page never
     drops back to an empty list. */
  const loadedJdScoresRef = useRef(new Set<string>());

  /** Merge GET /scoring/jds version rows into the history, keeping the scores
   *  already loaded for a job that is open (loadJdScores). */
  const mergeHistoryVersions = (rows: ScoredJdRow[]) => {
    if (rows.length === 0) return;
    setScoredHistory(prev => {
      const byId = new Map(prev.map(h => [h.jobId, h]));
      for (const row of rows) {
        const next = scoredJdRowToHistory(row);
        const old = byId.get(row.jd_id);
        byId.set(row.jd_id, old?.scoresLoaded ? { ...next, scoredResumes: old.scoredResumes, scoresLoaded: true } : next);
      }
      return Array.from(byId.values())
        .sort((a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime());
    });
  };

  /** Lineages / version counts that came with a response, for the page's
   *  version-lineage hook (which merges them into what it already holds). */
  const seedHistoryLineages = (res: ScoredJdListResponse) => {
    if (res.lineages) setHistoryLineageSeed({ lineages: res.lineages, versionCounts: res.version_counts });
  };

  /** The four cards (GET /scoring/stats). */
  const loadScoreCounts = async () => {
    try {
      const stats = await scoringService.getScoringStats();
      setScoreCounts({
        total: stats.total || 0,
        exact: stats.exact_match || 0,
        partial: stats.partial_match || 0,
        none: stats.no_match || 0,
        people: stats.candidates ? {
          all: stats.candidates.all || 0,
          exact: stats.candidates.exact_match || 0,
          partial: stats.candidates.partial_match || 0,
          none: stats.candidates.no_match || 0,
        } : undefined,
      });
    } catch (err) {
      console.warn('[ResumeScoringRoute] stats failed', err);
    }
  };

  /**
   * Older backend only (no `expand_versions`): the whole scored-version index
   * (GET /scoring/jds?group_by=version, every page) — the page then filters,
   * groups and pages it itself, as it did before server paging.
   */
  const loadLegacyIndex = async (isStale: () => boolean, reloadScores: boolean) => {
    const index = await fetchAllRows((page_size, page) =>
      scoringService.listScoredJds({ group_by: 'version', include_facets: false, include_lineages: true, page_size, page }),
    );
    if (isStale()) return;
    setHistoryLineageSeed(index.lineages
      ? { lineages: index.lineages, versionCounts: index.version_counts }
      : null);
    const validHistory = (index.items || []).map(scoredJdRowToHistory);
    validHistory.sort((a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime());
    // Keep the scores already loaded for an opened job on screen, then
    // re-read them (they may have just changed — this runs after scoring).
    setScoredHistory(prev => {
      const loaded = new Map(prev.filter(h => h.scoresLoaded).map(h => [h.jobId, h]));
      return validHistory.map(h => {
        const old = loaded.get(h.jobId);
        return old ? { ...h, scoredResumes: old.scoredResumes, scoresLoaded: true } : h;
      });
    });
    if (reloadScores) {
      Array.from(loadedJdScoresRef.current)
        .filter(id => validHistory.some(h => h.jobId === id))
        .forEach(id => { void loadJdScores(id); });
    }
  };

  /**
   * View by Job's current page (GET /scoring/jds?group_by=lineage): one row
   * per job with its lineage-wide counts, search / filters / verdict / sort /
   * paging done on the server, plus every scored version of just those jobs
   * (`expand_versions`) and their lineages (`include_lineages`). This used to
   * download EVERY scored JD version (page_size 10000) with lineages for all
   * of them, and filter / group / page it in the browser.
   *
   * `reloadScores`: after scoring — also re-read the scores of jobs already
   * opened this session, so an open job page never shows stale scores.
   */
  const loadHistoryList = async (reloadScores: boolean) => {
    const seq = ++historySeqRef.current;
    const isStale = () => seq !== historySeqRef.current;
    setHistoryLoading(true);
    try {
      if (legacyIndexRef.current) {
        await loadLegacyIndex(isStale, reloadScores);
        return;
      }
      const params: ScoredJdListParams = {
        ...historyQueryRef.current,
        group_by: 'lineage',
        expand_versions: true,
        include_facets: true,
        include_lineages: true,
      };
      // Going back to a filter / page seen in the last 30 s reuses that answer
      // (any write clears the cache); landing, Refresh and after-scoring read fresh.
      const res = await cachedList(
        listCacheKey('scoring-jds:history', params as Record<string, unknown>),
        () => scoringService.listScoredJds(params),
        { fresh: reloadScores, ttlMs: LIST_CACHE_TTL_MS },
      );
      if (isStale()) return;
      if (!res.versions) {
        // Older backend: no per-page versions to open the jobs with.
        legacyIndexRef.current = true;
        setHistoryPage(null);
        await loadLegacyIndex(isStale, reloadScores);
        return;
      }
      seedHistoryLineages(res);
      mergeHistoryVersions(res.versions);
      setHistoryPage({
        rows: (res.items || []).map(r => ({
          jdId: r.jd_id,
          counts: { exact: r.exact_count || 0, partial: r.partial_count || 0, none: r.no_match_count || 0 },
          lineageMaxVersion: r.lineage_max_version,
        })),
        total: res.total || 0,
        anyScored: res.any_scored ?? (res.total || 0) > 0,
        facets: res.facets,
      });
      if (reloadScores) {
        const onPage = new Set(res.versions.map(v => v.jd_id));
        Array.from(loadedJdScoresRef.current)
          .filter(id => onPage.has(id))
          .forEach(id => { void loadJdScores(id); });
      }
      // Clear old localStorage data to ensure consistency with API data
      try {
        localStorage.removeItem('scoredHistory');
      } catch (e) {
        // Ignore localStorage errors
      }
    } catch (error) {
      if (isStale()) return;
      console.error('Failed to load scored history from API:', error);
      // Without this the page reads "No Scoring History Yet" — wrong, it just failed to load.
      showErrorToast(error, "Couldn't load your scoring history", { id: 'scored-history-load', retry: loadScoredHistory });
      // Fallback to localStorage if API fails
      try {
        const saved = localStorage.getItem('scoredHistory');
        if (saved) {
          const parsed = JSON.parse(saved);
          const rawHistory = parsed.map((item: any) => ({
            ...item,
            scoredAt: new Date(item.scoredAt),
          }));
          setScoredHistory(rawHistory);
        }
      } catch (e) {
        console.error('Failed to load from localStorage:', e);
      }
    } finally {
      // A stale run leaves the loading state to the run that replaced it.
      if (!isStale()) setHistoryLoading(false);
    }
  };

  /** Refresh (landing, after scoring, the page's Refresh): the cards and the
   *  current page, re-reading the scores of jobs already opened. */
  const loadScoredHistory = async () => {
    await Promise.all([loadScoreCounts(), loadHistoryList(true)]);
  };

  /** The page's View by Job query changed (search, filters, verdict, sort,
   *  page). Ignored when it is the one already loaded — the landing sends the
   *  default first page before the page has restored its own state. */
  const queryScoredHistory = (query: ScoredJdListParams) => {
    if (JSON.stringify(query) === JSON.stringify(historyQueryRef.current)) return;
    historyQueryRef.current = query;
    if (legacyIndexRef.current) return; // the full index is already in hand
    void loadHistoryList(false);
  };

  /**
   * Every scored version of the job a JD version belongs to — for opening a
   * job that is not on the current page (a ?jd_id link, a just-finished
   * scoring run, a result opened from the progress popup).
   */
  const ensureHistoryJd = async (jdId: string): Promise<void> => {
    if (legacyIndexRef.current) return; // the full index already has it, if it was scored
    try {
      const res = await scoringService.listScoredJds({
        group_by: 'version',
        lineage_of: jdId,
        include_facets: false,
        include_lineages: true,
        page: 1,
        page_size: 500,
      });
      seedHistoryLineages(res);
      mergeHistoryVersions(res.items || []);
    } catch (error) {
      console.warn('[ResumeScoringRoute] could not load the job of', jdId, error);
    }
  };

  /**
   * Select All over every job the current search / filters match (not just
   * this page): those jobs and their versions, loaded once, on demand.
   * Returns the jobs' representative versions, in list order.
   */
  const fetchAllHistoryJobs = async (): Promise<ScoredResumeData[]> => {
    const res = await fetchAllRows((page_size, page) => scoringService.listScoredJds({
      ...historyQueryRef.current,
      group_by: 'lineage',
      expand_versions: true,
      include_facets: false,
      include_lineages: true,
      page_size,
      page,
    }));
    seedHistoryLineages(res);
    mergeHistoryVersions(res.versions || []);
    return (res.items || []).map(scoredJdRowToHistory);
  };

  // Load ALL scores for a specific JD on-demand via /jd/{jd_id} (paginated, deduped latest-per-resume)
  const loadJdScores = async (jdId: string, jdTitle?: string) => {
    const seq = (jdScoresSeqRef.current.get(jdId) ?? 0) + 1;
    jdScoresSeqRef.current.set(jdId, seq);
    const isStale = () => seq !== jdScoresSeqRef.current.get(jdId);
    loadedJdScoresRef.current.add(jdId);
    try {
      // Probe for total then pull every score for this JD in one request
      const firstPage = await fetchAllRows((page_size, page) => scoringService.getJDScoredResumes(jdId, { page_size, page, include_counts: false }));
      if (isStale()) return;
      const allItems = [...(firstPage.items || [])];
      // /scoring/jd/{id} returns newest-first — capture the most recent score's
      // date here, before `scores` below gets re-sorted by score descending for
      // display (see the same reasoning in loadScoredHistory above).
      const mostRecentScoredAt = allItems[0]?.created_at;
      // Same newest-first reasoning as loadScoredHistory above: allItems[0] is
      // this JD's most-recently-scored resume, so its own `source` is the
      // aggregate row's real origin — not a hardcoded value.
      const mostRecentSource = allItems[0]?.source;

      const scores = allItems.map((item: any) => {
        const matchScore = Math.round(item.overall_score || 0);
        let matchStatus = 'No Match';
        if (item.match_status === 'exact_match' || item.match_status === 'Exact Match') {
          matchStatus = 'Exact Match';
        } else if (item.match_status === 'partial_match' || item.match_status === 'Partial Match') {
          matchStatus = 'Partial Match';
        } else if (item.match_status === 'no_match' || item.match_status === 'No Match') {
          matchStatus = 'No Match';
        } else if (matchScore >= 70) {
          matchStatus = 'Exact Match';
        } else if (matchScore >= 50) {
          matchStatus = 'Partial Match';
        }
        return {
          id: item.id,
          resumeId: item.resume_id || '',
          candidateName: item.candidate_name || 'Unknown',
          candidateEmail: item.candidate_email || '',
          email: item.candidate_email || '',
          phone: item.phone || '',
          // Same gap as loadScoredHistory above — direct jd_id/score_id
          // navigation (no opened_from) resolves the candidate from this
          // JD-scoped load, which otherwise never told the detail page the
          // resume was archived.
          isArchived: !!item.is_archived,
          overall_score: matchScore,
          matchScore: matchScore,
          matchStatus: matchStatus,
          scorePercentage: matchScore,
          overallRating10: item.overall_rating_10,
          resumeDeleted: item.resume_deleted,
          scoredDate: item.created_at || new Date().toISOString(),
          scoredBy: item.scored_by_name || item.scored_by || 'System',
          scoredByEmail: item.scored_by,
          version: item.resume_version || 1,
          resumeVersion: item.resume_version || 1,
          source: item.source || 'database',
          status: 'completed',
          errorReason: '',
          experience: item.experience_years ? `${item.experience_years} years` : undefined,
          education: item.education,
          certifications: item.certifications || [],
          aiSummary: item.ai_summary,
          strengths: item.strengths || [],
          gaps: item.gaps || [],
          title: item.current_title,
          currentCompany: item.current_company,
          location: item.location,
          skills: item.skills || [],
          matchedSkills: item.matched_skills || item.skills || [],
          missingSkills: item.missing_skills || item.gaps || [],
          scoreBreakdown: item.score_breakdown || [],
          criteriaScores: item.criteria_scores || {},
          technicalSkills: item.technical_skills || item.skills || [],
          softSkills: item.soft_skills || [],
          experienceDetails: item.experience_details || [],
          educationDetails: item.education_details || [],
          languages: item.languages || [],
          professionalSummary: item.professional_summary || item.ai_summary || '',
        };
      });

      scores.sort((a: any, b: any) => (b.overall_score || 0) - (a.overall_score || 0));

      setScoredHistory(prev => {
        const existing = prev.find(h => h.jobId === jdId);
        const title = jdTitle || existing?.jobTitle || 'Unknown Job';
        // Spread the existing entry first so the JD metadata loadScoredHistory
        // set (jdJobId, jdVersionNumber, jdStatus, …) survives — this endpoint
        // isn't mapped here, so replacing the entry wholesale lost it.
        const updatedEntry: ScoredResumeData = {
          ...existing,
          id: jdId,
          jobId: jdId,
          jobTitle: title,
          scoredAt: parseIST(mostRecentScoredAt || scores[0]?.scoredDate || existing?.scoredAt?.toISOString() || new Date().toISOString()),
          source: mostRecentSource || existing?.source || 'database',
          totalScored: firstPage.total || scores.length,
          scoredResumes: scores,
          scoresLoaded: true,
        };
        if (existing) {
          return prev.map(h => h.jobId === jdId ? updatedEntry : h);
        } else {
          return [updatedEntry, ...prev];
        }
      });
    } catch (error) {
      console.error('[loadJdScores] Failed to load scores for JD:', jdId, error);
      if (isStale()) return;
      // Not loaded after all — so opening the job again (or Retry) refetches
      // instead of treating it as done and showing an empty table.
      loadedJdScoresRef.current.delete(jdId);
      showErrorToast(error, "Couldn't load the scores for this job", {
        id: `jd-scores-${jdId}`,
        retry: () => loadJdScores(jdId, jdTitle),
      });
    }
  };

  const saveScoredHistory = async (data: ScoredResumeData) => {
    toast.success('Scoring completed! Refreshing data...');

    // Update URL to persist the view across refreshes
    router.push(`/recruitment/resume-scoring?jd_id=${data.jobId}${fromQuery}`);

    // Refresh data from API to get the latest scores
    await loadScoredHistory();
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch JDs from tenant database. Probe for total then pull every record
      // so the dropdowns reflect actual counts.
      //
      // The full resume table is NOT fetched here any more. <ResumeScoringPage>
      // only reads its `resumes` prop in the legacy in-page resume list
      // (filteredResumes / handleSelectAll), which nothing renders — the
      // Select Resumes popup (SelectSourceModal) loads its own resumes. The
      // `refreshResumes` callback below still loads them on demand.
      //
      // Nor is every published JD any more (that walk was the slowest call on
      // the landing — every JD with every field — and the overview never reads
      // it). The "Score Resumes" job picker (JobOpeningPickerList) loads its
      // own list when that view opens, and a pick it makes that this list
      // lacks is mapped from the picked record itself (handleJobPicked). The
      // one consumer left is the JD-first flow (?mode=new&jd_id=…), which
      // needs only THAT JD — fetched by id, with the same published / my-jds
      // filters the full list applied, so a JD it would not have found is
      // still not found.
      const jdFirstId = searchParams.get('mode') === 'new' ? searchParams.get('jd_id') : null;
      const [jdResponse, folderResponse] = await Promise.all([
        jdFirstId
          ? jdService.list({ ids: [jdFirstId], status: 'published', source: 'my-jds', page: 1, page_size: 1 })
              // A malformed id is a 422 here (the old full list just missed it):
              // treat it as "not a published JD", like before.
              .catch(() => ({ items: [] as JDResponse[] }))
          : Promise.resolve({ items: [] as JDResponse[] }),
        folderService.list().catch(() => []),
      ]);

      // Convert JDResponse to Job type for component compatibility
      const convertedJobs = jdResponse.items.map((jd: JDResponse) => ({
        id: jd.id,
        title: jd.title,
        department: jd.department || 'General',
        location: jd.location || '',
        status: jd.status === 'published' ? 'Published' :
                jd.status === 'draft' ? 'Draft' :
                jd.status === 'archived' ? 'Archived' : 'Draft',
        applicants: jd.applicants_count || 0,
        employmentType: jd.employment_type || 'Full-time',
        // Years only (the level goes on experience_level): the old `min+` form
        // dropped the max and treated 0 as no value.
        experience: formatExperienceRange(jd.experience_min, jd.experience_max),
        experience_level: jd.job_level || jd.experience_level || undefined,
        job_id: jd.job_id,
        current_version: jd.current_version,
        published_at: jd.published_at,
        created_by_name: jd.created_by_name,
        creation_method: jd.creation_method,
        industry_type: jd.industry_type,
        remote_type: jd.remote_type,
      }));

      // Convert API Folder to component Folder type AND flatten the tree.
      // The API returns a nested tree (folder.children), but the resume-selection
      // sidebar walks a FLAT list keyed by parentId — so subfolders must appear
      // as siblings in the same array, not buried inside their parent's `children`.
      const convertApiFolder = (f: any): Folder => ({
        id: f.id,
        name: f.name,
        count: f.resume_count || 0,
        parentId: f.parent_id,
        children: f.children?.map(convertApiFolder),
      });
      const flattenFolders = (nodes: any[]): Folder[] => {
        const out: Folder[] = [];
        for (const node of nodes) {
          out.push(convertApiFolder(node));
          if (Array.isArray(node.children) && node.children.length > 0) {
            out.push(...flattenFolders(node.children));
          }
        }
        return out;
      };
      const convertedFolders: Folder[] = flattenFolders(
        Array.isArray(folderResponse) ? folderResponse : []
      );

      setJobs(convertedJobs);
      setFolders(convertedFolders);

    } catch (error) {
      console.error('Failed to fetch data:', error);
      showErrorToast(error, "Couldn't load your jobs and resumes", { id: 'resume-scoring-data', retry: fetchData });
    } finally {
      setLoading(false);
      setJobsLoaded(true);
    }
  };

  // Refresh only resumes (lightweight, no loading state)
  const refreshResumes = async () => {
    try {
      const resumeResponse = await fetchAllRows((page_size, page) => resumeService.list({ page_size, page, include_archived: true }));
      const convertedResumes: Resume[] = resumeResponse.items.map((r: any) => ({
        id: r.id,
        name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
        email: r.email || 'No email',
        phone: r.phone || 'No phone',
        title: r.current_title || 'N/A',
        experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
        education: r.education?.[0]?.degree || 'N/A',
        location: r.location || 'N/A',
        skills: r.skills || [],
        source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
        folderId: r.folder_id || '',
        uploadDate: r.created_at,
        attachments: r.file_name ? 1 : 0,
        uploadedBy: r.uploaded_by || 'System',
        version: r.version || 1,
        versionCount: r.version_count || 1,
        fileName: r.file_name,
        fileSizeKb: r.file_size_kb,
        isArchived: r.is_archived || false,
        archivedAt: r.archived_at,
      }));
      setResumes(convertedResumes);
      console.log('[ResumeScoringRoute] Refreshed resumes from API:', convertedResumes.length);
    } catch (error) {
      console.error('[ResumeScoringRoute] Failed to refresh resumes:', error);
      showErrorToast(error, "Couldn't refresh the resume list", { id: 'resume-scoring-resumes', retry: refreshResumes });
    }
  };

  // Only the JD-first landing (?mode=new&jd_id) waits for `jobs` (now just
  // that one JD, fetched by id) before mounting: it looks the JD up in `jobs`
  // and would otherwise show the overview first. A plain ?jd_id landing (the
  // scored-list view) reads only the scored index, so it no longer waits on
  // any JD fetch.
  // Every other landing mounts right away — <ResumeScoringPage> holds its own
  // overview skeleton until its history, global list and quota are in, and
  // the JD list keeps loading in the background for the Score Resumes flow.
  // Also held until plan availability is known, so FeatureGate's spinner never
  // flashes between this skeleton and the page's own. Once mounted it stays
  // mounted (as before: `loading` only ever flipped once).
  const readyToMount = paramsReady && !planFeatureLoading
    && !(loading && searchParams.get('jd_id') && searchParams.get('mode') === 'new');
  if (readyToMount && !pageMounted) setPageMounted(true);
  if (!pageMounted && !readyToMount) {
    // A ?jd_id in the URL means we're landing on the scored-resumes LIST view,
    // so show the list-shaped skeleton (stats + filter pills + table) rather than
    // the stats-only overview — otherwise the overview skeleton flashes first and
    // the table skeleton appears second, reading as two skeletons on refresh.
    return <ResumeScoringSkeleton variant={searchParams.get('jd_id') ? 'list' : 'overview'} />;
  }

  return (
    <FeatureGate feature="resume_scoring">
      <div className="tf-page relative flex flex-col">
        <ResumeScoringPage
        jobs={jobs}
        jobsLoaded={jobsLoaded}
        resumes={resumes}
        folders={folders}
        scoredHistory={scoredHistory}
        historyLoading={historyLoading}
        historyLineageSeed={historyLineageSeed}
        historyPage={historyPage}
        onQueryHistory={queryScoredHistory}
        onEnsureHistoryJd={ensureHistoryJd}
        onFetchAllHistoryJobs={fetchAllHistoryJobs}
        scoreCounts={scoreCounts}
        onSaveScores={saveScoredHistory}
        onRefreshHistory={loadScoredHistory}
        onLoadJdScores={loadJdScores}
        onRefreshResumes={refreshResumes}
        initialJdId={initialJdId}
        initialScoreId={initialScoreId}
        initialShowProgress={showProgress}
        initialNewScoring={initialNewScoring}
        pendingScoringData={pendingScoringData}
        batchProgress={batchProgress}
      />
      </div>
    </FeatureGate>
  );
}
