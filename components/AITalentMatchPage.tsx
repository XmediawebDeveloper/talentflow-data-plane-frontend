'use client';

import JobIdBadge from '@/components/jobs/JobIdBadge';
import { ArrowUpDown, Sparkles, Target, Search, ChevronDown, Mail, Phone, MapPin, Building2, CheckCircle, Star, User, FileText, Send, TrendingUp, Award, Clock, Calendar, Briefcase, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, AlertTriangle, PlayCircle, Paperclip, ClipboardList, XCircle, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import AITalentMatchPageJobsList from './AITalentMatchPageJobsList';
import ResumeVersionsModal from './ResumeVersionsModal';
import Pagination from './Pagination';
import ListPagination from './ListPagination';
import { recordUsage } from '@/lib/services/usageTrackingService';
import { aiMatchService, MatchedCandidate } from '@/lib/services/aiMatchService';
import AIMatchVersionHistoryTable, { AIMatchSessionVersion, buildAIMatchVersions } from './AIMatchVersionHistoryTable';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import { jdService } from '@/lib/services/jdService';
import { toast } from 'sonner';
import { assessmentService } from '@/lib/services';
import ShareAssessmentModal from './ShareAssessmentModal';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import SkillsList from '@/components/ui/SkillsList';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import ModuleInfoBanner from '@/components/ModuleInfoBanner';
import RecordPager from '@/components/RecordPager';
import { formatISTDate, formatIST } from '@/lib/utils/dateUtils';
import { useQuota } from '@/contexts/QuotaContext';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { useListSearch } from '@/lib/hooks/useListSearch';
import JDVersionHistory from '@/components/JDVersionHistory';

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
}

// Extended interface for UI display (adds versions for modal)
interface MatchedCandidateWithVersions extends MatchedCandidate {
  versions?: Array<{
    id: string;
    name: string;
    uploadDate: string;
    size: string;
  }>;
}

interface MatchHistory {
  id: string;
  jobId: string;
  jobTitle: string;
  matchedAt: Date;
  totalMatches: number;
  matchedCandidates: MatchedCandidateWithVersions[];
}

/** Set just before leaving for a resume, so returning keeps the active filters. */
const AI_MATCH_KEEP_FILTERS_KEY = 'aiTalentMatchKeepFilters';

function markAIMatchReturnTrip() {
  try { sessionStorage.setItem(AI_MATCH_KEEP_FILTERS_KEY, '1'); } catch { /* ignore */ }
}

/** Local calendar day as YYYY-MM-DD, for comparing against <input type="date">. */
function toLocalDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** First number in a free-text experience value; null when there is none. */
function parseExperienceYears(value?: string): number | null {
  if (!value) return null;
  const match = String(value).match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/** One candidate, plus every job they were matched against. */
interface CandidateMatchRow {
  key: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  experience?: string;
  resumeId?: string;
  bestScore: number;
  /** The match record behind `bestScore` — carries rank, skills, upload and
   *  attachment details so this roll-up can show the same columns as the
   *  per-job match table. */
  best: MatchedCandidateWithVersions;
  jobs: Array<{ historyId: string; jobId: string; jobTitle: string; score: number; matchedAt: Date }>;
}

interface AITalentMatchPageProps {
  jobs: Job[];
  matchHistory?: MatchHistory[];
  /** Total AI match runs per job, keyed by the human JD-xxx code (not the row
   *  id — a republish forks the JD into a new row, so runs across versions
   *  share a JD code but not an id). Drives whether "View Version History"
   *  shows at all. */
  matchSessionCounts?: Record<string, number>;
  onSaveMatch?: (data: MatchHistory) => void;
  onSubmitToScoring?: (jobId: string, candidateIds: string[]) => void;
  onBack?: () => void;
}

export default function AITalentMatchPage({
  jobs,
  matchHistory = [],
  matchSessionCounts = {},
  onSaveMatch,
  onSubmitToScoring,
  onBack
}: AITalentMatchPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission, isTenantAdmin, user } = useAuth();
  const { quotaData } = useQuota();

  // ✅ RBAC: Check if user can run AI match operations (bypass for tenant admin)
  const canRunAiMatch = isTenantAdmin || (user?.permissions?.canRunAiMatch ?? false);
  const canRunScoring = isTenantAdmin || (user?.permissions?.canRunScoring ?? false);


  const [viewMode, setViewMode] = useState<'history' | 'details' | 'new' | 'results' | 'matching'>('history');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<MatchHistory | null>(null);
  const [selectedJob, setSelectedJob] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterThreshold, setFilterThreshold] = useState(0);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  // Additional filters
  const [filterPhone, setFilterPhone] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterExperienceMin, setFilterExperienceMin] = useState<number | ''>('');
  const [filterExperienceMax, setFilterExperienceMax] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'score' | 'experience'>('rank'); // Sort by highest rating first (DevRMS style)

  // Pagination state for match results
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Assessment-related state
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessments, setSelectedAssessments] = useState<any[]>([]); // Changed to store full assessment objects
  const [assessmentSearchQuery, setAssessmentSearchQuery] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [currentAssessmentForShare, setCurrentAssessmentForShare] = useState<any>(null);
  const [prefilledCandidates, setPrefilledCandidates] = useState<any[]>([]);


  // Track if we're in an active matching session to prevent URL effect interference
  const isMatchingInProgress = useRef(false);
  // Track if user manually changed view (to prevent useEffect from resetting)
  const userChangedView = useRef(false);

  // Helper function to format uploaded by name (avoid showing UUIDs)
  const formatUploadedBy = (name?: string, id?: string) => {
    // Check if uploadedByName exists and is not a UUID
    if (name && !name.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return name;
    }
    // If we only have UUID or no name, return generic label
    return 'System';
  };

  const availableUnits = useMemo(() => {
    const remaining = quotaData?.quotas?.RS?.total_remaining;
    if (typeof remaining === 'number') return remaining;
    if (typeof remaining === 'string') {
      if (remaining.toLowerCase() === 'unlimited') return null;
      const parsed = Number(remaining);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [quotaData]);

  // Sessions currently being fetched, so a re-render mid-flight reuses the
  // same promise instead of firing a duplicate request per candidate filter.
  const historyCandidateRequests = useRef<Map<string, Promise<MatchedCandidateWithVersions[]>>>(new Map());

  const getResolvedHistoryCandidates = (item: MatchHistory | null | undefined): MatchedCandidateWithVersions[] => {
    if (!item) return [];
    return historyCandidatesById[item.id] ?? item.matchedCandidates ?? [];
  };

  /**
   * @param silent Suppresses the failure toast. Set by the background prefetch,
   *   which the user never asked for — one toast per failed session would bury
   *   the page in errors about work they can't see.
   */
  const loadHistoryCandidates = async (
    item: MatchHistory,
    { silent = false }: { silent?: boolean } = {},
  ): Promise<MatchedCandidateWithVersions[]> => {
    if (historyCandidatesById[item.id]) {
      return historyCandidatesById[item.id];
    }
    // A request already in the air for this session — don't queue a second.
    const inFlight = historyCandidateRequests.current.get(item.id);
    if (inFlight) return inFlight;
    if (item.totalMatches <= 0) {
      return [];
    }

    setLoadingHistorySessionId(item.id);
    const request = (async () => {
      try {
        const details = await aiMatchService.getSession(item.id);
        const candidates = details.candidates as MatchedCandidateWithVersions[];
        setHistoryCandidatesById(prev => ({ ...prev, [item.id]: candidates }));
        return candidates;
      } catch (error) {
        console.error('[AITalentMatch] Failed to fetch session details:', error);
        if (!silent) toast.error('Failed to load matched candidates');
        return [] as MatchedCandidateWithVersions[];
      } finally {
        historyCandidateRequests.current.delete(item.id);
        setLoadingHistorySessionId(current => current === item.id ? null : current);
      }
    })();

    historyCandidateRequests.current.set(item.id, request);
    return request;
  };

  // Build the "Match by Candidate" roll-up: pull each session's candidates
  // (cached per session by loadHistoryCandidates) and group them by person, so
  // one row shows every job that candidate matched.
  const openCandidatesView = async () => {
    setHistoryPageView('candidates');
    candidateSearch.setQuery('');
    setHistoryListScrollRequest((request) => request + 1);
    // Rows already built, or the prefetch is still building them — either way
    // there is nothing to do. This used to rebuild unconditionally, flashing
    // the loader over a roll-up that would come out identical.
    if (loadingCandidateRows || candidateRows.length > 0) return;
    await buildCandidateRows();
  };

  // The roll-up itself, split out from the click handler so a restored
  // 'candidates' view can rebuild its rows once match history has loaded —
  // otherwise returning from a resume landed on an empty candidates table.
  const buildCandidateRows = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (matchHistory.length === 0) {
      setCandidateRows([]);
      return;
    }

    setLoadingCandidateRows(true);
    try {
      const perJob = await Promise.all(
        matchHistory.map(async (item) => ({ item, candidates: await loadHistoryCandidates(item, { silent }) }))
      );

      const byKey = new Map<string, CandidateMatchRow>();
      for (const { item, candidates } of perJob) {
        for (const candidate of candidates || []) {
          const key = candidate.resumeId || candidate.email || candidate.name;
          if (!key) continue;
          const jobEntry = {
            historyId: item.id,
            jobId: item.jobId,
            jobTitle: item.jobTitle,
            score: candidate.matchScore ?? 0,
            matchedAt: item.matchedAt,
          };
          const existing = byKey.get(key);
          if (existing) {
            existing.jobs.push(jobEntry);
            // The strongest match owns the row's detail columns.
            if (jobEntry.score > existing.bestScore) {
              existing.bestScore = jobEntry.score;
              existing.best = candidate;
            }
          } else {
            byKey.set(key, {
              key,
              name: candidate.name,
              title: candidate.title,
              email: candidate.email,
              phone: candidate.phone,
              location: candidate.location,
              experience: candidate.experience,
              resumeId: candidate.resumeId,
              bestScore: jobEntry.score,
              best: candidate,
              jobs: [jobEntry],
            });
          }
        }
      }

      // Most-matched first, then strongest match.
      setCandidateRows(
        [...byKey.values()].sort((a, b) => b.jobs.length - a.jobs.length || b.bestScore - a.bestScore)
      );

      // Scored status here spans every JD, so the per-JD `scoredResumeIds` set
      // can't answer it — pull the tenant-wide scored list instead.
      try {
        const ids = new Set<string>();
        let page = 1;
        let fetched = 0;
        while (true) {
          const response = await scoringService.getAllScoredResumes({ page, page_size: 100 });
          const items = response.items || [];
          items.forEach(item => { if (item.resume_id) ids.add(item.resume_id); });
          fetched += items.length;
          if (items.length === 0 || fetched >= (response.total || 0)) break;
          page++;
        }
        setAllScoredResumeIds(ids);
      } catch (error) {
        console.error('[AITalentMatch] Failed to load scored resumes for candidate roll-up:', error);
        setAllScoredResumeIds(new Set());
      }
    } finally {
      setLoadingCandidateRows(false);
    }
  };

  // Helper to update URL params - use shallow routing to prevent full page reload
  const updateUrlParams = (params: { jdId?: string; view?: string }) => {
    const url = new URL(window.location.href);

    if (params.jdId) {
      url.searchParams.set('jdId', params.jdId);
    } else {
      url.searchParams.delete('jdId');
    }

    if (params.view) {
      url.searchParams.set('view', params.view);
    } else {
      url.searchParams.delete('view');
    }

    router.push(url.pathname + url.search, { scroll: false });
  };
  
  // Matched Jobs list: search + seven filters, in the shared hook. Sorting stays
  // local — it narrows nothing, so it does not belong in the filter count.
  const historySearch = useListSearch({
    initialFilters: {
      dateFrom: '',
      dateTo: '',
      phone: '',
      location: '',
      expMin: '' as number | '',
      expMax: '' as number | '',
      minMatches: '' as number | '',
    },
    onChange: () => setHistoryCurrentPage(1),
  });
  const historySearchQuery = historySearch.appliedQuery;
  const {
    dateFrom: historyDateFrom,
    dateTo: historyDateTo,
    phone: historyFilterPhone,
    location: historyFilterLocation,
    expMin: historyFilterExpMin,
    expMax: historyFilterExpMax,
    minMatches: historyFilterMinMatches,
  } = historySearch.filters;
  const [historySortBy, setHistorySortBy] = useState<'date' | 'matches' | 'title'>('date');
  const [historySortOrder, setHistorySortOrder] = useState<'asc' | 'desc'>('desc');
  // Phone / location / experience filter the candidates inside each match, so
  // they only work once those candidates are loaded (see the effect below).
  const hasCandidateLevelFilters =
    historyFilterPhone !== '' ||
    historyFilterLocation !== '' ||
    historyFilterExpMin !== '' ||
    historyFilterExpMax !== '';
  const [resolvingHistoryCandidates, setResolvingHistoryCandidates] = useState(false);

  // Candidate-level filters need every session's candidates, which load lazily
  // per session. Pull them in when such a filter is switched on, so the filter
  // applies to the whole list instead of only the sessions already opened.
  useEffect(() => {
    if (!hasCandidateLevelFilters || matchHistory.length === 0) return;
    let cancelled = false;

    const resolveAll = async () => {
      const pending = matchHistory.filter(item => !historyCandidatesById[item.id]);
      if (pending.length === 0) return;
      setResolvingHistoryCandidates(true);
      try {
        await Promise.all(pending.map(item => loadHistoryCandidates(item)));
      } finally {
        if (!cancelled) setResolvingHistoryCandidates(false);
      }
    };

    resolveAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCandidateLevelFilters, matchHistory]);

  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  // Two-step view: 'cards' shows just the stats cards; clicking one reveals the
  // job list ('list') or the candidate-centric roll-up ('candidates').
  const [historyPageView, setHistoryPageView] = useState<'cards' | 'list' | 'candidates'>('cards');
  const historyListSectionRef = useRef<HTMLDivElement | null>(null);
  const [historyListScrollRequest, setHistoryListScrollRequest] = useState(0);

  // "Match by Candidate" roll-up: every matched candidate across all jobs, with
  // the jobs they matched. Built in-page — no navigation away.
  const [candidateRows, setCandidateRows] = useState<CandidateMatchRow[]>([]);
  const [loadingCandidateRows, setLoadingCandidateRows] = useState(false);

  // Rows whose job chips are expanded past the single-line "+N more" cutoff.
  const [expandedJobChips, setExpandedJobChips] = useState<Set<string>>(new Set());

  // Candidate roll-up filters (mirrors the job-openings "More Filters" panel)
  const [showCandidateFilters, setShowCandidateFilters] = useState(false);
  // Candidate roll-up: search + nine filters, same shared hook. Same filter
  // vocabulary as the Matched Jobs list above.
  const candidateSearch = useListSearch({
    initialFilters: {
      location: 'all',
      job: 'all',
      minScore: 0,
      multiJob: false,
      phone: '',
      expMin: '' as number | '',
      expMax: '' as number | '',
      dateFrom: '',
      dateTo: '',
    },
  });
  const candidateSearchQuery = candidateSearch.appliedQuery;
  const {
    location: candidateFilterLocation,
    job: candidateFilterJob,
    minScore: candidateFilterMinScore,
    multiJob: candidateFilterMultiJob,
    phone: candidateFilterPhone,
    expMin: candidateFilterExpMin,
    expMax: candidateFilterExpMax,
    dateFrom: candidateFilterDateFrom,
    dateTo: candidateFilterDateTo,
  } = candidateSearch.filters;
  const [candidateSortBy, setCandidateSortBy] = useState<'score' | 'name' | 'jobs' | 'date'>('jobs');
  const [candidateSortOrder, setCandidateSortOrder] = useState<'asc' | 'desc'>('desc');

  const openCandidateMatch = (historyId: string) => {
    const item = matchHistory.find(h => h.id === historyId);
    if (!item) return;
    setSelectedHistoryItem(item);
    setSelectedJob(item.jobId);
    setViewMode('details');
  };

  // Picking a person in the candidate roll-up opens their resume directly.
  // `rows` seeds resume-view's prev/next pager with the list the user sees.
  const openCandidateResume = (row: CandidateMatchRow, rows: CandidateMatchRow[]) => {
    if (!row.resumeId) {
      toast.error('Resume not found for this candidate');
      return;
    }
    try {
      sessionStorage.setItem('resumeNavList', JSON.stringify(rows.map(r => r.resumeId).filter(Boolean)));
      sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
      markAIMatchReturnTrip();
      // This roll-up spans jobs, so there is no single match-details page to
      // send the breadcrumb back to — drop any job left over from a per-job view.
      sessionStorage.removeItem('resumeNavAIMatchJobId');
      sessionStorage.removeItem('resumeNavAIMatchJobTitle');
    } catch { /* ignore */ }
    router.push(`/recruitment/resume-view/${row.resumeId}`);
  };

  const toggleCandidateChips = (e: React.MouseEvent, rowKey: string) => {
    e.stopPropagation();
    setExpandedJobChips(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
      return next;
    });
  };

  // Match-score badge colours mirror the Scored Resumes match-status pills.
  const candidateScoreBadgeClass = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700 border-green-300';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const clearCandidateFilters = candidateSearch.reset;

  // One clear for the whole Matched Jobs list — shared by the panel's "Reset
  // all" and the empty state's button, which used to reset only three of them.
  const clearHistoryFilters = historySearch.reset;

  const openHistoryListView = () => {
    setHistoryCurrentPage(1);
    setHistoryPageView('list');
    setHistoryListScrollRequest((request) => request + 1);
  };

  // Query and filter changes reset the page via the hook's `onChange`; sorting
  // does not go through the hook, so it still needs its own reset.
  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySortBy, historySortOrder]);
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  
  // Matching progress
  const [showMatchingPanel, setShowMatchingPanel] = useState(false);
  const [matchedCandidates, setMatchedCandidates] = useState<MatchedCandidateWithVersions[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  
  // Versions modal
  const [selectedVersionsCandidate, setSelectedVersionsCandidate] = useState<MatchedCandidateWithVersions | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [realVersionsData, setRealVersionsData] = useState<any[]>([]);

  // AI match version history — all match runs for one job, not just the latest.
  // Inline expand-in-place under the job card, one open at a time (like the
  // Job Openings list's own version history).
  const [expandedHistoryJobId, setExpandedHistoryJobId] = useState<string | null>(null);
  const [historyVersionsByJob, setHistoryVersionsByJob] = useState<Record<string, AIMatchSessionVersion[]>>({});
  const [loadingHistoryJobId, setLoadingHistoryJobId] = useState<string | null>(null);
  const [failedHistoryJobId, setFailedHistoryJobId] = useState<string | null>(null);

  /**
   * @param historyKey The human JD-xxx code — cache/state key, shared by every
   *   republished version of this job.
   * @param anyRowId Any row id belonging to that job's lineage (the card's own
   *   `item.jobId` is enough) — used to look up every other version's id, since
   *   AI match sessions are tied to whichever row was active when the run
   *   happened, not to the JD-xxx code.
   */
  const loadAIMatchVersionHistory = async (historyKey: string, anyRowId: string) => {
    setFailedHistoryJobId(current => current === historyKey ? null : current);
    setLoadingHistoryJobId(historyKey);
    try {
      // A republish forks the JD into a new row with its own id, so a job's
      // match history is scattered across every row in its lineage, not just
      // the current one.
      let lineageIds: string[];
      try {
        const lineage = await jdService.getLineageVersions(anyRowId);
        lineageIds = lineage.length ? lineage.map(v => v.id) : [anyRowId];
      } catch (error) {
        console.warn('Failed to load JD lineage for version history:', anyRowId, error);
        lineageIds = [anyRowId];
      }
      if (!lineageIds.includes(anyRowId)) lineageIds.push(anyRowId);

      const sessionLists = await Promise.all(
        lineageIds.map(id =>
          aiMatchService.listSessions({ jd_id: id, page_size: 100 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 100 }))
        )
      );
      const allSessions = sessionLists.flatMap(list => list.items || []);

      // listSessions returns each session with results: [] — the scores this
      // table shows only exist on the single-session record, so every version
      // has to be re-fetched individually (same gap JobDetailView's AI match
      // tab hit).
      const hydratedSessions = await Promise.all(
        allSessions.map(async (session) => {
          try {
            const { session: fullSession } = await aiMatchService.getSession(session.id);
            return fullSession;
          } catch (error) {
            console.warn('Failed to load AI match session detail:', session.id, error);
            return session;
          }
        })
      );
      setHistoryVersionsByJob(prev => ({ ...prev, [historyKey]: buildAIMatchVersions(hydratedSessions) }));
    } catch (error) {
      console.error('Failed to load AI match version history:', error);
      setFailedHistoryJobId(historyKey);
    } finally {
      setLoadingHistoryJobId(current => current === historyKey ? null : current);
    }
  };

  const toggleAIMatchVersionHistory = (historyKey: string, anyRowId: string) => {
    const opening = expandedHistoryJobId !== historyKey;
    setExpandedHistoryJobId(opening ? historyKey : null);
    if (opening && !historyVersionsByJob[historyKey]) void loadAIMatchVersionHistory(historyKey, anyRowId);
  };

  // Version selection for scoring (single candidate)
  const [showVersionSelectForScoring, setShowVersionSelectForScoring] = useState(false);
  const [scoringCandidate, setScoringCandidate] = useState<MatchedCandidateWithVersions | null>(null);
  const [scoringVersions, setScoringVersions] = useState<any[]>([]);
  const [historyCandidatesById, setHistoryCandidatesById] = useState<Record<string, MatchedCandidateWithVersions[]>>({});
  const [loadingHistorySessionId, setLoadingHistorySessionId] = useState<string | null>(null);

  // Scored resume IDs for current JD
  const [scoredResumeIds, setScoredResumeIds] = useState<Set<string>>(new Set());
  // Scored resume IDs across all JDs — used by the cross-job candidate roll-up.
  const [allScoredResumeIds, setAllScoredResumeIds] = useState<Set<string>>(new Set());

  // Persist + restore the Matched Jobs list scroll position and view state
  // (two-step view, filters, search, pagination) so returning from a detail
  // page lands the user where they left off instead of a reset list. Scroll is
  // only tracked while the history list is mounted (viewMode === 'history').
  const rootRef = useScrollRestoration<HTMLElement>('ai-talent-match', viewMode === 'history', [historyPageView]);
  useListStatePersistence(
    'ai-talent-match',
    {
      showHistoryFilters,
      historySearchQuery, historyDateFrom, historyDateTo,
      historyFilterPhone, historyFilterLocation, historyFilterExpMin, historyFilterExpMax,
      historyFilterMinMatches, historySortBy, historySortOrder,
      historyCurrentPage, historyItemsPerPage,
      candidateSearchQuery, candidateFilterLocation, candidateFilterJob,
      candidateFilterMinScore, candidateFilterMultiJob, candidateFilterPhone,
      candidateFilterExpMin, candidateFilterExpMax,
      candidateFilterDateFrom, candidateFilterDateTo,
      candidateSortBy, candidateSortOrder,
      searchQuery, filterThreshold, filterPhone, filterLocation,
      filterExperienceMin, filterExperienceMax, sortBy,
      currentPage, itemsPerPage,
      // The cards -> list/candidates drill-in. Restored with the filters below
      // rather than unconditionally: it belongs to the same "came back from a
      // resume" round trip. Without it the view reset to the stat cards and the
      // list the user had been reading was simply gone.
      historyPageView,
    },
    (s) => {
      // Layout choices are harmless to restore from any entry point.
      if (typeof s.historyItemsPerPage === 'number') setHistoryItemsPerPage(s.historyItemsPerPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);

      // Search and filters only survive a round trip *within* this module —
      // opening a candidate's resume and coming back. Arriving from anywhere
      // else (sidebar, another module, a fresh visit) starts clean, so a filter
      // set days ago can't silently hide rows.
      let keepFilters = false;
      try {
        keepFilters = sessionStorage.getItem(AI_MATCH_KEEP_FILTERS_KEY) === '1';
        sessionStorage.removeItem(AI_MATCH_KEEP_FILTERS_KEY);
      } catch { /* ignore */ }
      if (!keepFilters) return;

      if (s.historyPageView === 'cards' || s.historyPageView === 'list' || s.historyPageView === 'candidates') {
        setHistoryPageView(s.historyPageView);
      }
      if (typeof s.showHistoryFilters === 'boolean') setShowHistoryFilters(s.showHistoryFilters);
      if (typeof s.historySearchQuery === 'string') historySearch.setQuery(s.historySearchQuery);
      historySearch.setFilters({
        dateFrom: typeof s.historyDateFrom === 'string' ? s.historyDateFrom : '',
        dateTo: typeof s.historyDateTo === 'string' ? s.historyDateTo : '',
        phone: typeof s.historyFilterPhone === 'string' ? s.historyFilterPhone : '',
        location: typeof s.historyFilterLocation === 'string' ? s.historyFilterLocation : '',
        expMin: typeof s.historyFilterExpMin === 'number' ? s.historyFilterExpMin : '',
        expMax: typeof s.historyFilterExpMax === 'number' ? s.historyFilterExpMax : '',
        minMatches: typeof s.historyFilterMinMatches === 'number' ? s.historyFilterMinMatches : '',
      });
      if (s.historySortBy === 'date' || s.historySortBy === 'matches' || s.historySortBy === 'title') setHistorySortBy(s.historySortBy);
      if (s.historySortOrder === 'asc' || s.historySortOrder === 'desc') setHistorySortOrder(s.historySortOrder);
      if (typeof s.historyCurrentPage === 'number') setHistoryCurrentPage(s.historyCurrentPage);
      if (typeof s.candidateSearchQuery === 'string') candidateSearch.setQuery(s.candidateSearchQuery);
      candidateSearch.setFilters({
        location: typeof s.candidateFilterLocation === 'string' ? s.candidateFilterLocation : 'all',
        job: typeof s.candidateFilterJob === 'string' ? s.candidateFilterJob : 'all',
        minScore: typeof s.candidateFilterMinScore === 'number' ? s.candidateFilterMinScore : 0,
        multiJob: typeof s.candidateFilterMultiJob === 'boolean' ? s.candidateFilterMultiJob : false,
        phone: typeof s.candidateFilterPhone === 'string' ? s.candidateFilterPhone : '',
        expMin: typeof s.candidateFilterExpMin === 'number' ? s.candidateFilterExpMin : '',
        expMax: typeof s.candidateFilterExpMax === 'number' ? s.candidateFilterExpMax : '',
        dateFrom: typeof s.candidateFilterDateFrom === 'string' ? s.candidateFilterDateFrom : '',
        dateTo: typeof s.candidateFilterDateTo === 'string' ? s.candidateFilterDateTo : '',
      });
      if (s.candidateSortBy === 'score' || s.candidateSortBy === 'name' || s.candidateSortBy === 'jobs' || s.candidateSortBy === 'date') setCandidateSortBy(s.candidateSortBy);
      if (s.candidateSortOrder === 'asc' || s.candidateSortOrder === 'desc') setCandidateSortOrder(s.candidateSortOrder);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterThreshold === 'number') setFilterThreshold(s.filterThreshold);
      if (typeof s.filterPhone === 'string') setFilterPhone(s.filterPhone);
      if (typeof s.filterLocation === 'string') setFilterLocation(s.filterLocation);
      if (typeof s.filterExperienceMin === 'number' || s.filterExperienceMin === '') setFilterExperienceMin(s.filterExperienceMin as number | '');
      if (typeof s.filterExperienceMax === 'number' || s.filterExperienceMax === '') setFilterExperienceMax(s.filterExperienceMax as number | '');
      if (s.sortBy === 'rank' || s.sortBy === 'name' || s.sortBy === 'score' || s.sortBy === 'experience') setSortBy(s.sortBy);
      if (typeof s.currentPage === 'number') setCurrentPage(s.currentPage);
    },
  );

  // Restored straight into the candidate roll-up: its rows are built on click,
  // not fetched by the page load, so rebuild them once match history is in.
  // Guarded on empty rows so it can't re-run over a roll-up that's already
  // there, and it deliberately leaves the restored candidate search alone.
  const rebuiltRestoredCandidatesRef = useRef(false);
  useEffect(() => {
    if (rebuiltRestoredCandidatesRef.current) return;
    if (historyPageView !== 'candidates') return;
    if (loadingCandidateRows || candidateRows.length > 0) return;
    if (matchHistory.length === 0) return;
    rebuiltRestoredCandidatesRef.current = true;
    buildCandidateRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPageView, matchHistory.length, loadingCandidateRows, candidateRows.length]);

  /**
   * Warm the "Match by Candidate" roll-up in the background, so switching to
   * that tab shows rows instead of a spinner.
   *
   * Building it costs one request per match session, and none of them started
   * until the tab was clicked — the slowest part of the page sat entirely on
   * that click. Doing it while the user reads the Matched Jobs list moves the
   * wait off the interaction. Per-session results land in
   * `historyCandidatesById`, so opening a single job's results afterwards is
   * served from the same cache.
   *
   * Silent: a failed session here must not toast, since the user never asked
   * for this and one toast per session would bury the page.
   *
   * `prefetchedRef` caps it at one run — without it a failed build leaves the
   * rows empty, the effect re-satisfies its own conditions, and it retries
   * forever.
   */
  const prefetchedCandidateRowsRef = useRef(false);
  useEffect(() => {
    if (prefetchedCandidateRowsRef.current) return;
    // Only from the history screen — the tab lives there, and elsewhere this
    // would compete with whatever the user actually opened.
    if (viewMode !== 'history') return;
    // Already on the tab: the effect above owns that case.
    if (historyPageView === 'candidates') return;
    if (matchHistory.length === 0) return;
    if (loadingCandidateRows || candidateRows.length > 0) return;

    prefetchedCandidateRowsRef.current = true;
    void buildCandidateRows({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, historyPageView, matchHistory.length, loadingCandidateRows, candidateRows.length]);

  /**
   * A finished match run adds a session, which makes a roll-up built before it
   * stale. Now that the tab reuses its rows instead of rebuilding on every
   * open, that staleness would stick for the rest of the session — so drop the
   * rows and release both build guards, and whichever path runs next (prefetch
   * if the user is elsewhere, the restore effect if they're on the tab) builds
   * again from the fuller history.
   */
  const candidateRowsHistoryCountRef = useRef(matchHistory.length);
  useEffect(() => {
    if (candidateRowsHistoryCountRef.current === matchHistory.length) return;
    candidateRowsHistoryCountRef.current = matchHistory.length;
    setCandidateRows([]);
    prefetchedCandidateRowsRef.current = false;
    rebuiltRestoredCandidatesRef.current = false;
  }, [matchHistory.length]);

  useEffect(() => {
    if (historyListScrollRequest === 0) return;
    if (historyPageView !== 'list' && historyPageView !== 'candidates') return;
    // For the candidate roll-up, wait until the rows are in — scrolling to a
    // spinner would land the user above the list once it renders.
    if (historyPageView === 'candidates' && loadingCandidateRows) return;

    const frame = window.requestAnimationFrame(() => {
      historyListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [historyListScrollRequest, historyPageView, loadingCandidateRows]);

  // Fetch scored resumes when viewing details or results for a JD
  useEffect(() => {
    const jobId = selectedHistoryItem?.jobId || (viewMode === 'results' ? selectedJob : '');
    if (!jobId) {
      setScoredResumeIds(new Set());
      return;
    }
    const fetchScored = async () => {
      try {
        const allItems: any[] = [];
        let page = 1;
        while (true) {
          const response = await jdService.getScoredResumes(jobId, { page_size: 100, page });
          allItems.push(...(response.items || []));
          if (allItems.length >= (response.total || 0) || (response.items || []).length < 100) break;
          page++;
        }
        const ids = new Set<string>(
          allItems.map((r: any) => r.resume_id).filter(Boolean)
        );
        setScoredResumeIds(ids);
      } catch (e) {
        setScoredResumeIds(new Set());
      }
    };
    fetchScored();
  }, [selectedHistoryItem, selectedJob, viewMode]);

  useEffect(() => {
    const hydrateSelectedHistory = async () => {
      if (viewMode === 'details' && selectedHistoryItem) {
        const resolvedCandidates = getResolvedHistoryCandidates(selectedHistoryItem);
        if (selectedHistoryItem.totalMatches > 0 && resolvedCandidates.length === 0) {
          const candidates = await loadHistoryCandidates(selectedHistoryItem);
          setSelectedHistoryItem(prev => prev && prev.id === selectedHistoryItem.id
            ? { ...prev, matchedCandidates: candidates }
            : prev);
        }
        return;
      }

      if (viewMode === 'results' && selectedJob && matchedCandidates.length === 0) {
        const historyItem = matchHistory.find(item => item.jobId === selectedJob);
        if (!historyItem || historyItem.totalMatches <= 0) return;

        const candidates = await loadHistoryCandidates(historyItem);
        setMatchedCandidates(candidates);
        setSelectedHistoryItem({
          ...historyItem,
          matchedCandidates: candidates,
        });
      }
    };

    hydrateSelectedHistory();
  }, [viewMode, selectedHistoryItem, selectedJob, matchedCandidates.length, matchHistory, historyCandidatesById]);

  // Handle attachments click - fetch real versions
  const handleAttachmentsClick = async (candidate: MatchedCandidateWithVersions) => {
    if (!candidate.resumeId) {
      toast.error('Resume ID not found');
      return;
    }

    // Show modal with loading state
    setSelectedVersionsCandidate(candidate);
    setLoadingVersions(true);
    setRealVersionsData([]);

    try {
      console.log('[Attachments] Fetching versions for resume:', candidate.resumeId);
      const response = await resumeService.getVersions(candidate.resumeId);
      console.log('[Attachments] API Response:', response);

      // API returns array directly from response.data (resumeService already extracts .data)
      let versions = Array.isArray(response) ? response : [];

      // If no versions returned, create a default version from the candidate info
      if (versions.length === 0) {
        versions = [{
          id: candidate.resumeId,
          version: 1,
          file_name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
          created_at: candidate.uploadDate || new Date().toISOString(),
          uploaded_by_name: candidate.uploadedByName || 'System',
          file_size_kb: null,
        }];
      } else {
        // Sort by version descending so latest is first
        versions.sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
      }

      console.log('[Attachments] Versions:', versions);
      setRealVersionsData(versions);
    } catch (error) {
      console.error('[Attachments] Failed to fetch resume versions:', error);
      // On error, show the candidate's resume as version 1
      setRealVersionsData([{
        id: candidate.resumeId,
        version: 1,
        file_name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
        created_at: candidate.uploadDate || new Date().toISOString(),
        uploaded_by_name: candidate.uploadedByName || 'System',
        file_size_kb: null,
      }]);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Handle URL params and sessionStorage for job selection
  useEffect(() => {
    // Skip if we're in an active matching session
    if (isMatchingInProgress.current) return;
    // Skip if user manually changed the view (prevents resetting after clicking View Details)
    if (userChangedView.current) {
      userChangedView.current = false; // Reset for next time
      return;
    }

    // First check URL params (for refresh persistence)
    const urlJdId = searchParams.get('jdId');
    const urlView = searchParams.get('view');

    // Then check sessionStorage (for navigation from JD page)
    const sessionJobId = sessionStorage.getItem('preselectedJobId');
    const showResultsOnly = sessionStorage.getItem('showResultsOnly') === 'true';

    const preselectedJobId = urlJdId || sessionJobId;

    if (!preselectedJobId) return;
    // Wait for jobs to be loaded before processing
    if (jobs.length === 0) return;

    // Clear sessionStorage if we used it
    if (sessionJobId) {
      sessionStorage.removeItem('preselectedJobId');
      sessionStorage.removeItem('showResultsOnly');
    }

    // Set the selected job
    setSelectedJob(preselectedJobId);

    // Determine view based on URL param or sessionStorage flag
    const shouldShowResults = urlView === 'results' || showResultsOnly;
    const shouldShowDetails = urlView === 'details';
    const isMatching = urlView === 'matching';

    if (isMatching) {
      isMatchingInProgress.current = true;
      setSelectedHistoryItem(null);
      setSelectedCandidates([]);
      setMatchedCandidates([]);
      setMatchError(null);
      setViewMode('matching');
      setShowMatchingPanel(true);
      return;
    } else if (shouldShowDetails) {
      // User clicked from history list - show details view
      const existingMatch = matchHistory.find(h => h.jobId === preselectedJobId);

      if (existingMatch) {
        setSelectedHistoryItem(existingMatch);
        setViewMode('details');
      } else {
        // No match found, go to history
        setViewMode('history');
        updateUrlParams({});
      }
    } else if (shouldShowResults) {
      // User clicked "AI Talent Match Results" - show existing results or empty state
      const existingMatch = matchHistory.find(h => h.jobId === preselectedJobId);

      if (existingMatch) {
        const existingCandidates = getResolvedHistoryCandidates(existingMatch);
        setSelectedHistoryItem(existingMatch);
        setMatchedCandidates(existingCandidates);
        setViewMode('results');
      } else {
        // No results in history - but don't clear matchedCandidates if we just completed a match
        // (matchHistory prop is stale until page refresh, but matchedCandidates state has fresh results)
        setViewMode('results');
        // Only clear if we don't already have results in state (avoids clearing just-completed match results)
        setMatchedCandidates(prev => prev.length > 0 ? prev : []);
      }

      // Update URL to persist state on refresh
      if (!urlJdId) {
        updateUrlParams({ jdId: preselectedJobId, view: 'results' });
      }
    } else {
      // User clicked "AI Talent Match" - ALWAYS run new match (ignore history)
      setViewMode('new');

      // Update URL to persist state on refresh
      if (!urlJdId) {
        updateUrlParams({ jdId: preselectedJobId, view: 'matching' });
      }

      // Trigger matching panel immediately
      setTimeout(() => {
        setShowMatchingPanel(true);
      }, 300);
    }
  }, [jobs, matchHistory, searchParams]);

  const publishedJobs = jobs.filter(j => j.status === 'Published' || j.status === 'Active');
  const selectedJobData = jobs.find(j => j.id === selectedJob);

  const handleRunAIMatch = (jobId?: string) => {
    const jobToMatch = jobId || selectedJob;
    if (!jobToMatch) return;

    // Mark that we're in an active matching session to prevent URL effect interference
    isMatchingInProgress.current = true;

    // Set the selected job if provided
    if (jobId && jobId !== selectedJob) {
      setSelectedJob(jobId);
    }

    // Update URL to show matching in progress
    updateUrlParams({ jdId: jobToMatch, view: 'matching' });

    // Show matching progress panel
    setShowMatchingPanel(true);
  };

  const handleMatchingComplete = (results: MatchedCandidate[]) => {
    // Transform results to include versions placeholder for UI compatibility
    const candidatesWithVersions: MatchedCandidateWithVersions[] = results.map(candidate => ({
      ...candidate,
      versions: [{
        id: 'v1',
        name: `${candidate.name.replace(/\s+/g, '_')}_Resume.pdf`,
        uploadDate: candidate.uploadDate,
        size: '200 KB'
      }]
    }));

    setMatchedCandidates(candidatesWithVersions);
    setShowMatchingPanel(false);
    setMatchError(null);
    setViewMode('results');

    // Update URL to show results view
    updateUrlParams({ jdId: selectedJob, view: 'results' });

    // Clear matching flag after a longer delay to allow state and URL to fully settle
    // This prevents the URL effect from interfering with the just-set matchedCandidates
    setTimeout(() => {
      isMatchingInProgress.current = false;
    }, 500);

    // Track usage - POST /api/v1/external/usage/record (RS - talent match uses resume scoring quota)
    recordUsage({
      quota_type: 'RS',
      amount: results.length,
      operation_type: 'talent_match',
      resource_id: selectedJob,
      metadata: { candidates_matched: results.length }
    });

    // Save to history
    if (selectedJobData) {
      const newMatchHistory: MatchHistory = {
        id: Date.now().toString(),
        jobId: selectedJob,
        jobTitle: selectedJobData.title,
        matchedAt: new Date(),
        totalMatches: results.length,
        matchedCandidates: candidatesWithVersions
      };
      if (selectedHistoryItem?.jobId === selectedJob) {
        setSelectedHistoryItem(newMatchHistory);
        setHistoryCandidatesById(prev => ({ ...prev, [newMatchHistory.id]: candidatesWithVersions }));
      }
      onSaveMatch?.(newMatchHistory);
    }
  };

  const handleSelectCandidate = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const filtered = getFilteredCandidates();
    if (selectedCandidates.length === filtered.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filtered.map(c => c.id));
    }
  };

  const handleSubmitToScoring = async () => {
    if (selectedCandidates.length === 0) {
      toast.warning('Please select at least one candidate to score');
      return;
    }

    // Get the current candidates based on view mode
    const currentCandidates = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    // Get selected candidates data
    const selected = currentCandidates.filter(c => selectedCandidates.includes(c.id));

    // Get the job ID and title
    const jobId = selectedJob || selectedHistoryItem?.jobId;
    const jobTitle = selectedJobData?.title || selectedHistoryItem?.jobTitle || 'Job';

    if (!jobId) {
      toast.error('Job ID not found');
      return;
    }

    // SINGLE CANDIDATE: Show version selection popup
    if (selected.length === 1) {
      const candidate = selected[0];
      if (!candidate.resumeId) {
        toast.error('Resume ID not found for this candidate');
        return;
      }

      // Fetch versions and show selection modal
      setScoringCandidate(candidate);
      setLoadingVersions(true);
      setShowVersionSelectForScoring(true);

      try {
        const versions = await resumeService.getVersions(candidate.resumeId);
        setScoringVersions(versions.data || versions || []);
      } catch (error) {
        console.error('Failed to fetch versions:', error);
        setScoringVersions([]);
      } finally {
        setLoadingVersions(false);
      }
      return;
    }

    // MULTIPLE CANDIDATES: Pre-check for already-scored resumes, then batch-score only new ones
    const resumeIds = selected.map(c => c.resumeId);

    try {
      // Check which resumes are already scored for this JD
      let newResumeIds = resumeIds;
      let alreadyScoredItems: Array<{ resumeId: string; candidateName: string; score?: number; matchStatus?: string; scoredAt?: string }> = [];

      try {
        const existingCheck = await scoringService.checkExistingScores(jobId, resumeIds);
        if (existingCheck.existing_count > 0) {
          const existingMap = new Map(existingCheck.existing_scores.map(s => [s.resume_id, s]));
          alreadyScoredItems = existingCheck.existing_scores.map(s => ({
            resumeId: s.resume_id,
            candidateName: selected.find(c => c.resumeId === s.resume_id)?.name || s.candidate_name || 'Unknown',
            score: s.overall_score,
            matchStatus: s.match_status,
            scoredAt: s.scored_at || undefined,
          }));
          newResumeIds = resumeIds.filter(id => !existingMap.has(id));
        }
      } catch (checkError) {
        console.warn('[AITalentMatch] checkExistingScores failed, scoring all:', checkError);
      }

      // Get candidate names for progress display
      const newSelected = selected.filter(c => newResumeIds.includes(c.resumeId));
      const resumeItems = newSelected.map(c => ({
        resumeId: c.resumeId,
        candidateName: c.name || 'Unknown',
      }));

      if (newResumeIds.length === 0) {
        // All already scored - use pendingScoringData path (no batch needed)
        const pendingData = {
          jobId: jobId,
          jobTitle: jobTitle,
          resumeIds: [],
          resumeNames: [],
          alreadyScoredItems: alreadyScoredItems,
        };
        sessionStorage.setItem('pendingScoringData', JSON.stringify(pendingData));
        router.push(`/recruitment/resume-scoring?jd_id=${jobId}&start_scoring=true`);
        return;
      }

      // Start async bulk scoring via Celery for new resumes only
      const response = await scoringService.startBulkScoringAsync(jobId, newResumeIds);

      // Store batch info including already-scored items for progress display
      const scoringData = {
        batchId: response.batch_id,
        jobId: response.jd_id,
        jobTitle: response.jd_title,
        totalResumes: response.total_resumes + alreadyScoredItems.length,
        resumeItems: resumeItems,
        alreadyScoredItems: alreadyScoredItems,
      };
      sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));

      // Navigate to resume scoring page with batch_id to show progress
      router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
    } catch (error: any) {
      console.error('Failed to start scoring:', error);
      toast.error(error.message || 'Failed to start scoring');
    }
  };

  // Assessment handlers
  const handleAssessment = async () => {
    if (selectedCandidates.length === 0) {
      toast.warning('Please select at least one candidate');
      return;
    }

    // Fetch active assessments (published status). Revoked assessments are
    // excluded — once invites have been revoked the assessment is sealed
    // and the recruiter must duplicate it for a fresh invite round.
    try {
      const response = await assessmentService.list({ status: 'published', page_size: 100 });
      const revokedIds = getLocallyRevokedAssessmentIds();
      const activeAssessments = response.items
        .filter((a: any) => !isAssessmentRevoked(a, revokedIds))
        .map((a: any) => ({
          ...a,
          created_by_name: a.created_by_name || 'System',
          short_id: a.short_id || `AS-${String(a.id).slice(0, 8).toUpperCase()}`,
        }));

      setAssessments(activeAssessments);
      setIsAssessmentModalOpen(true);
    } catch (error) {
      console.error('[AITalentMatch] Failed to fetch assessments:', error);
      toast.error('Failed to load assessments');
    }
  };

  const handleAssessmentSelect = (assessment: any) => {
    setSelectedAssessments(prev => {
      const isSelected = prev.some(a => a.id === assessment.id);
      if (isSelected) {
        return prev.filter(a => a.id !== assessment.id);
      } else {
        return [...prev, assessment];
      }
    });
  };

  const handleProceedToInvite = () => {
    if (selectedAssessments.length === 0) {
      toast.error('Please select at least one assessment');
      return;
    }

    // Extract candidate data from selected candidates
    const currentCandidates = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);
    const candidateData = currentCandidates
      .filter(c => selectedCandidates.includes(c.id))
      .map((c, index) => ({
        id: `${Date.now()}-${index}`,
        name: c.name,
        email: c.email || '',
        source: 'ai-match' as const,
        candidateId: c.id
      }))
      .filter(c => c.email); // Only include candidates with email

    if (candidateData.length === 0) {
      toast.error('Selected candidates must have email addresses');
      return;
    }

    // Open ShareAssessmentModal with first selected assessment
    setPrefilledCandidates(candidateData);
    setCurrentAssessmentForShare(selectedAssessments[0]);
    setIsAssessmentModalOpen(false);
    setIsShareModalOpen(true);
  };

  const handleSendInvitations = async (candidates: any[], message: string) => {
    try {
      let successCount = 0;
      let failCount = 0;

      // Bulk send invitations for all selected assessments
      for (const assessment of selectedAssessments) {
        for (const candidate of candidates) {
          if (candidate.email) {
            try {
              await assessmentService.invite(assessment.id, {
                candidate_email: candidate.email,
                candidate_name: candidate.name,
                resume_id: candidate.resumeId || candidate.candidateId,
                custom_message: message,
              });
              successCount++;
            } catch (err) {
              console.error(`Failed to send invitation for ${candidate.email}:`, err);
              failCount++;
            }
          }
        }
      }

      if (successCount > 0) {
        toast.success(`Sent ${successCount} invitation(s) for ${selectedAssessments.length} assessment(s)`);
      }
      if (failCount > 0) {
        toast.error(`Failed to send ${failCount} invitation(s)`);
      }

      setIsShareModalOpen(false);
      setSelectedAssessments([]);
      setSelectedCandidates([]);
      setPrefilledCandidates([]);
      setAssessmentSearchQuery('');
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      toast.error(error.message || 'Failed to send invitations');
    }
  };

  const getFilteredCandidates = (): MatchedCandidateWithVersions[] => {
    const candidates: MatchedCandidateWithVersions[] = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    const filtered = candidates.filter(candidate => {
      // Existing filters
      const matchesThreshold = candidate.matchScore >= filterThreshold;
      const matchesSearch = searchQuery === '' ||
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (candidate.email && candidate.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        candidate.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));

      // Phone filter (normalize phone numbers - remove special chars)
      const matchesPhone = filterPhone === '' ||
        (candidate.phone && (
          candidate.phone.toLowerCase().includes(filterPhone.toLowerCase()) ||
          candidate.phone.replace(/[^0-9]/g, '').includes(filterPhone.replace(/[^0-9]/g, ''))
        ));

      // Location filter
      const matchesLocation = filterLocation === '' ||
        (candidate.location && candidate.location.toLowerCase().includes(filterLocation.toLowerCase()));

      // Experience filter
      const candidateExp = candidate.experience ? parseFloat(candidate.experience) : 0;
      const matchesExperienceMin = filterExperienceMin === '' || candidateExp >= filterExperienceMin;
      const matchesExperienceMax = filterExperienceMax === '' || candidateExp <= filterExperienceMax;

      return matchesThreshold && matchesSearch && matchesPhone && matchesLocation &&
             matchesExperienceMin && matchesExperienceMax;
    });

    // Sort by selected option
    const sorted = [...filtered];
    switch (sortBy) {
      case 'rank':
        sorted.sort((a, b) => (b.rank || 0) - (a.rank || 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'score':
        sorted.sort((a, b) => b.matchScore - a.matchScore);
        break;
      case 'experience':
        sorted.sort((a, b) => {
          const expA = a.experience ? parseFloat(a.experience) : 0;
          const expB = b.experience ? parseFloat(b.experience) : 0;
          return expB - expA;
        });
        break;
    }

    return sorted;
  };

  // Memoized filtered candidates for pagination calculations
  const filteredCandidatesMemo = useMemo(() => getFilteredCandidates(), [
    viewMode, matchedCandidates, selectedHistoryItem, filterThreshold, searchQuery,
    filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy
  ]);

  // Calculate pagination values
  const totalFilteredCandidates = filteredCandidatesMemo.length;
  const totalPages = Math.ceil(totalFilteredCandidates / itemsPerPage);

  // Get paginated candidates - maintains ranking order across pages
  const getPaginatedCandidates = (): MatchedCandidateWithVersions[] => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCandidatesMemo.slice(startIndex, endIndex);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterThreshold, filterPhone, filterLocation, filterExperienceMin, filterExperienceMax, sortBy, selectedHistoryItem, viewMode]);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle items per page change
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const getMatchColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-brand-cyan';
    if (score >= 50) return 'text-brand-orange-deep';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-green-100 border-green-300 text-green-700';
    if (score >= 70) return 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan';
    if (score >= 50) return 'bg-brand-orange/10 border-brand-orange/30 text-brand-orange-deep';
    return 'bg-gray-100 border-gray-300 text-gray-700';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Good Match';
    if (score >= 50) return 'Moderate Match';
    return 'Low Match';
  };

  const filteredHistory = matchHistory.filter(item => {
    const query = historySearchQuery.trim().toLowerCase();
    const jobCode = jobs.find(j => j.id === item.jobId)?.jobId || '';
    const matchesSearch = query === '' ||
      item.jobTitle.toLowerCase().includes(query) ||
      jobCode.toLowerCase().includes(query);

    // Compare calendar days, not instants: `new Date('2026-08-03')` is midnight
    // UTC, so an instant-comparison drops everything matched later that day.
    const matchedDay = toLocalDateKey(item.matchedAt);
    const matchesDateFrom = !historyDateFrom || matchedDay >= historyDateFrom;
    const matchesDateTo = !historyDateTo || matchedDay <= historyDateTo;

    const matchesMinMatches = historyFilterMinMatches === '' ||
      (item.totalMatches || 0) >= historyFilterMinMatches;

    // Candidate-level filters: keep the job if ANY of its candidates matches.
    // Candidates load per session on demand, so a session whose list has not
    // arrived yet stays visible while the loader below fetches it — otherwise
    // the filter would silently pass every job (the old `length === 0` check).
    const resolvedCandidates = historyCandidatesById[item.id] ?? item.matchedCandidates;
    const matchesCandidateFilters = !hasCandidateLevelFilters || !resolvedCandidates
      ? true
      : resolvedCandidates.some(candidate => {
          const matchesPhone = historyFilterPhone === '' ||
            (!!candidate.phone && (
              candidate.phone.toLowerCase().includes(historyFilterPhone.toLowerCase()) ||
              candidate.phone.replace(/[^0-9]/g, '').includes(historyFilterPhone.replace(/[^0-9]/g, ''))
            ));
          const matchesLocation = historyFilterLocation === '' ||
            (!!candidate.location && candidate.location.toLowerCase().includes(historyFilterLocation.toLowerCase()));
          // "5-7 years" / "5+ yrs" / "Fresher" — take the first number, and treat
          // "no number" as unknown so a range filter excludes it rather than
          // counting it as zero years.
          const years = parseExperienceYears(candidate.experience);
          const matchesExpMin = historyFilterExpMin === '' || (years !== null && years >= historyFilterExpMin);
          const matchesExpMax = historyFilterExpMax === '' || (years !== null && years <= historyFilterExpMax);
          return matchesPhone && matchesLocation && matchesExpMin && matchesExpMax;
        });

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesMinMatches && matchesCandidateFilters;
  });

  const sortedHistory = [...filteredHistory].sort((a, b) => {
    const direction = historySortOrder === 'asc' ? 1 : -1;
    if (historySortBy === 'matches') {
      return ((a.totalMatches || 0) - (b.totalMatches || 0)) * direction;
    }
    if (historySortBy === 'title') {
      return a.jobTitle.localeCompare(b.jobTitle) * direction;
    }
    return (new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()) * direction;
  });

  // Search sits outside the panel, so — like job-openings — it is not counted.
  const activeFiltersCount = historySearch.activeFilterCount;

  // View: Matching in Progress (direct flow from resume-view / deep link)
  if (viewMode === 'matching') {
    return (
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            <PageBreadcrumb
              className="mb-4 md:mb-6"
              items={[
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'AI Talent Match', onClick: () => setViewMode('history') },
                { label: selectedJobData?.title || 'Matching' },
              ]}
            />
            <div className="min-h-[50dvh] flex items-center justify-center">
              {matchError ? (
                <div className="text-center max-w-md">
                  <div className="w-12 h-12 bg-red-50 ring-1 ring-red-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <XCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Matching failed</h2>
                  <p className="text-sm text-gray-600 mb-4">{matchError}</p>
                  <button
                    onClick={() => selectedJob && handleRunAIMatch(selectedJob)}
                    disabled={!selectedJob}
                    className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Run AI Match
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-600">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
                  <span className="text-sm font-medium">Preparing AI Talent Match...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {showMatchingPanel && selectedJob && (
          <AITalentMatchProgressPanel
            jobTitle={selectedJobData?.title || 'Job Description'}
            jobId={selectedJob}
            onComplete={handleMatchingComplete}
            onError={(error) => {
              setMatchError(error);
              setShowMatchingPanel(false);
            }}
          />
        )}
      </main>
    );
  }

  // View: History Details
  if (viewMode === 'details' && selectedHistoryItem) {
    const detailCandidates = getResolvedHistoryCandidates(selectedHistoryItem);
    const filteredCandidates = filteredCandidatesMemo;
    const paginatedCandidates = getPaginatedCandidates();
    const excellentCount = detailCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = detailCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = detailCandidates.filter(c => c.matchScore < 70).length;
    const isLoadingSelectedHistory = loadingHistorySessionId === selectedHistoryItem.id;
    const _matchIdx = matchHistory.findIndex(h => h.jobId === selectedHistoryItem.jobId);
    const _prevMatch = _matchIdx > 0 ? matchHistory[_matchIdx - 1] : null;
    const _nextMatch = _matchIdx >= 0 && _matchIdx < matchHistory.length - 1 ? matchHistory[_matchIdx + 1] : null;
    const _goToMatch = (item: MatchHistory) => {
      setSelectedHistoryItem(item);
      setSelectedCandidates([]);
      setSelectedJob('');
    };

    return (
      <>

      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
              {/* Previous / Next rides inside the breadcrumb bar, as on
                  job-details. Run AI Match stays down in the actions row — only
                  the pager moved. */}
              <PageBreadcrumb
                className="mb-0 flex-1"
                items={[
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'AI Talent Match', onClick: () => setViewMode('history') },
                  // Deepest crumb names the job this match belongs to.
                  { label: selectedHistoryItem?.jobTitle || 'Match Details' },
                ]}
                actions={matchHistory.length > 1 ? (
                  <RecordPager
                    currentIndex={_matchIdx >= 0 ? _matchIdx : 0}
                    totalCount={matchHistory.length}
                    onPrev={_prevMatch ? () => _goToMatch(_prevMatch) : undefined}
                    onNext={_nextMatch ? () => _goToMatch(_nextMatch) : undefined}
                  />
                ) : undefined}
              />
            </div>
        {/* Header Section */}
        <div className="border-b border-gray-200 dark:border-slate-700 mb-4 pb-4">
          <div className="w-full">
          {/* Actions */}
          {(() => {
            // Check if job is disabled
            const jobData = jobs.find(j => j.id === selectedHistoryItem.jobId);
            const jobStatus = jobData?.status?.toLowerCase();
            const isJobDisabled = jobStatus === 'disabled';
            // Show Run AI Match button for all jobs except disabled ones
            const canRunAIMatch = !isJobDisabled;

            return (
              <>
                <div className="flex justify-end mb-4">
                  <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                    {/* Run AI Match — now alone in this row; the Previous/Next
                        pager it used to sit beside moved into the breadcrumb. */}
                    {canRunAIMatch && (
                      <button
                        onClick={() => {
                          if (!canRunAiMatch) {
                            toast.error('You do not have permission to run AI matching operations');
                            return;
                          }
                          const jobId = selectedJob || selectedHistoryItem?.jobId;
                          if (jobId) {
                            handleRunAIMatch(jobId);
                            setSelectedCandidates([]);
                          }
                        }}
                        disabled={!canRunAiMatch}
                        className={`px-3 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 w-full sm:w-auto ${
                          canRunAiMatch
                            ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 cursor-pointer'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                        }`}
                        title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Run AI Match
                      </button>
                    )}
                  </div>
                </div>

                {/* Job Info Card */}
                <div className="bg-gradient-to-br from-brand-blue/[0.04] to-brand-cyan/[0.03] rounded-xl border border-brand-blue/15 ring-1 ring-brand-blue/5 p-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 font-semibold">{selectedHistoryItem.jobTitle}</h1>
                        {isJobDisabled && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full border border-red-200">
                            Disabled
                          </span>
                        )}
                      </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatISTDate(selectedHistoryItem.matchedAt.toISOString())}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {selectedHistoryItem.totalMatches} matches
                  </span>
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded-full text-xs font-medium border border-brand-blue/20">
                    <Sparkles className="w-3 h-3" />
                    AI Talent Match • 0 units consumed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
                />
              </div>
              <select
                value={filterThreshold}
                onChange={(e) => setFilterThreshold(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </select>
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {availableUnits !== null && selectedCandidates.length > availableUnits && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-lg w-full sm:w-auto">
                      <AlertTriangle className="w-4 h-4 text-brand-orange-deep flex-shrink-0" />
                      <span className="text-xs text-brand-orange-deep font-medium">
                        Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                      </span>
                    </div>
                  )}
                  <>
                  {canRunScoring && (
                  <button
                      onClick={handleSubmitToScoring}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-3 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                    }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                      Score ({selectedCandidates.length})
                    </button>
                  )}
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={handleAssessment}
                      className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Assessment ({selectedCandidates.length})
                    </button>
                  )}
                </>
                </div>
              )}
              {/* Count badge closes the row, as it does on every list. */}
              <ListCountBadge
                className="sm:ml-auto"
                filtered={filteredCandidates.length}
                total={detailCandidates.length}
                noun="candidate"
                selected={selectedCandidates.length}
              />
            </div>
            {/* Additional Filters */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMin}
                onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Min exp"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMax}
                onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Max exp"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                className="col-span-2 sm:col-span-1 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value="rank">Sort by Rating</option>
                <option value="name">Sort by Name</option>
                <option value="score">Sort by Score</option>
                <option value="experience">Sort by Experience</option>
              </select>
            </div>
          </div>
              </>
            );
          })()}
          </div>
        </div>

        {/* Candidates List - Table View */}
        {isLoadingSelectedHistory ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading matched candidates...
            </div>
          </div>
        ) : detailCandidates.length === 0 ? (
          <div className="mx-auto w-full max-w-[1400px] py-8">
            <div className="border-2 border-dashed border-brand-blue/20 rounded-xl p-8 sm:p-10 text-center bg-white dark:bg-slate-900">
              <div className="w-12 h-12 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2">No matched candidates found</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto">
                There are no AI match results available for this job yet. Run AI Match to generate candidate matches.
              </p>
            </div>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="mx-auto w-full max-w-[1400px] py-8">
            <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-8 text-center bg-white dark:bg-slate-900">
              <Search className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-2">No candidates match the current filters</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Adjust the search or filter values to view matched candidates for this job.
              </p>
            </div>
          </div>
        ) : (
        <div className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] py-4">
          {/* Bounded viewport: rows scroll vertically (and horizontally) while the
              header stays pinned. Header background/border live on the cells so the
              pinned row paints solid over the rows sliding underneath. */}
          <div className="min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto rounded-xl border border-gray-100 dark:border-slate-700/60 tf-table-shell">
          <table className="w-full min-w-[1450px] table-auto">
            <thead className="sticky top-0 z-10 [&_th]:bg-gray-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
              <tr>
                <th className="w-12 px-4 py-3 align-middle tf-sticky-col-left">
                  <input
                    type="checkbox"
                    checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidates.includes(c.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCandidates(filteredCandidates.map(c => c.id));
                      } else {
                        setSelectedCandidates([]);
                      }
                    }}
                    className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Match Rating
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Candidate Name
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Job Title
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Location
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Skills
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Experience
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Uploaded By
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Uploaded Date
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Attachments
                </th>
                <th className="px-4 py-3 text-left text-xs text-gray-900 dark:text-slate-50 uppercase tracking-wider whitespace-nowrap align-middle">
                  Scored Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-700">
              {paginatedCandidates.map((candidate, index) => (
                <tr
                  key={candidate.id}
                  data-row-selected={selectedCandidates.includes(candidate.id)}
                  className={`hover:bg-brand-blue/[0.03] transition-colors cursor-pointer ${
                    selectedCandidates.includes(candidate.id) ? 'bg-brand-blue/5' : ''
                  }`}
                  onClick={() => {
                    if (candidate.resumeId) {
                      try {
                        sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidatesMemo.map((c: any) => c.resumeId).filter(Boolean)));
                        sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
                        sessionStorage.setItem('resumeNavAIMatchJobId', selectedHistoryItem.jobId);
                        // The breadcrumb names the job this match belongs to.
                        sessionStorage.setItem('resumeNavAIMatchJobTitle', selectedHistoryItem.jobTitle || '');
                        markAIMatchReturnTrip();
                      } catch { /* ignore */ }
                      router.push(`/recruitment/resume-view/${candidate.resumeId}`);
                    }
                  }}
                >
                  <td className="px-4 py-3 align-middle tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(candidate.id)}
                      onChange={() => handleSelectCandidate(candidate.id)}
                      className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <div className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md font-bold text-sm ${
                      (candidate.rank || 0) >= 7 ? 'bg-green-100 text-green-800 border border-green-300' :
                      (candidate.rank || 0) >= 4 ? 'bg-brand-orange/10 text-brand-orange-deep border border-brand-orange/20' :
                      (candidate.rank || 0) >= 1 ? 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-700' :
                      'bg-gray-50 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-700'
                    }`}>
                      {candidate.rank || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-xs text-gray-700 dark:text-slate-300 font-medium">
                        {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-slate-50">{candidate.name || 'Unknown'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <span className="block max-w-[220px] truncate text-sm text-gray-700 dark:text-slate-300">
                      {selectedHistoryItem.jobTitle || selectedJobData?.title || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {candidate.email ? candidate.email : <span className="text-gray-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {(() => {
                      const numbers = splitPhoneNumbers(candidate.phone, 2);
                      return numbers.length > 0
                        ? <div className="flex flex-col gap-0.5">{numbers.map((num, i) => <span key={i}>{num}</span>)}</div>
                        : <span className="text-gray-400 dark:text-slate-500">-</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {candidate.location ? candidate.location : <span className="text-gray-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 align-middle min-w-[220px]">
                    <div className="flex flex-wrap gap-1">
                      <SkillsList
                        skills={candidate.skills}
                        chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 whitespace-nowrap"
                        moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium whitespace-nowrap hover:bg-brand-blue/10 transition-colors cursor-pointer"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">{candidate.experience}</td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                    {candidate.uploadDate ? formatISTDate(candidate.uploadDate) : <span className="text-gray-400 dark:text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAttachmentsClick(candidate);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {candidate.attachmentCount || 1}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    {scoredResumeIds.has(candidate.resumeId) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Scored
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-xs font-medium">
                        <XCircle className="w-3 h-3" />
                        Not Scored
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </div>
        </div>
        )}

        {/* Pagination Controls */}
        {totalFilteredCandidates > 0 && (
          <div className="mx-auto w-full max-w-[1400px]">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalFilteredCandidates}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </div>
        )}
          </div>
        </div>
      </main>

      {/* Resume Versions Modal */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          versions={realVersionsData}
          loading={loadingVersions}
          onClose={() => {
            setSelectedVersionsCandidate(null);
            setRealVersionsData([]);
          }}
        />
      )}

      {/* Version Selection Modal for Scoring (single candidate) */}
      {showVersionSelectForScoring && scoringCandidate && (
        <ResumeVersionsModal
          candidate={scoringCandidate}
          versions={scoringVersions}
          loading={loadingVersions}
          selectionMode={true}
          onClose={() => {
            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
          onSelectVersion={async (version) => {
            // Score with selected version
            const jobId = selectedJob || selectedHistoryItem?.jobId;
            if (!jobId || !scoringCandidate) return;

            try {
              const response = await scoringService.startBulkScoringAsync(jobId, [version.id]);
              const scoringData = {
                batchId: response.batch_id,
                jobId: response.jd_id,
                jobTitle: response.jd_title,
                totalResumes: response.total_resumes,
                resumeItems: [{ resumeId: version.id, candidateName: scoringCandidate.name }],
              };
              sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));
              router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
            } catch (error: any) {
              console.error('Failed to start scoring:', error);
              toast.error(error.message || 'Failed to start scoring');
            }

            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
        />
      )}

      {/* AI Matching Progress Panel - for details view */}
      {showMatchingPanel && selectedJob && (
        <AITalentMatchProgressPanel
          jobTitle={selectedJobData?.title || selectedHistoryItem?.jobTitle || 'Job Description'}
          jobId={selectedJob}

          onComplete={handleMatchingComplete}
          onError={(error) => {
            setMatchError(error);
            setShowMatchingPanel(false);
          }}
        />
      )}

      {/* Assessment Selection Modal - for details/results view */}
      {isAssessmentModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setAssessmentSearchQuery('');
          }
        }}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-4xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-50">Select Active Assessments</h2>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 p-1"
                 aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3">
                Select one or more assessments to send to {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </p>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={assessmentSearchQuery}
                  onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                  placeholder="Search assessments..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              {/* Select All / Clear All */}
              {assessments.length > 0 && (() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });
                return filteredAssessments.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === filteredAssessments.length) {
                        setSelectedAssessments([]);
                      } else {
                        setSelectedAssessments(filteredAssessments);
                      }
                    }}
                    className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium mt-3"
                  >
                    {selectedAssessments.length === filteredAssessments.length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {(() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });

                return filteredAssessments.length === 0 ? (
                  <div className="text-center py-10">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-slate-500">{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments available'}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssessments.map((assessment) => {
                      const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                      return (
                        <button
                          key={assessment.id}
                          onClick={() => handleAssessmentSelect(assessment)}
                          className={`w-full text-left border-2 rounded-lg p-3 transition-all ${
                            isSelected
                              ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                              : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {/* Checkbox */}
                            <div className="flex-shrink-0 mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-brand-blue border-brand-blue'
                                  : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>

                            <div className="flex-1">
                              {/* Assessment ID, Title, Version + Active Badge */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {assessment.short_id && (
                                  <span className="text-xs px-2 py-0.5 bg-brand-blue text-white rounded font-semibold">
                                    {assessment.short_id}
                                  </span>
                                )}
                                {(() => {
                                  // Strip any "- Version N" baked into the stored title
                                  // and render the live version (from `version`, falling
                                  // back to the parsed title version) as its own badge.
                                  const parsed = parseAssessmentTitle(assessment.title || '');
                                  const displayVersion = typeof assessment.version === 'number'
                                    ? assessment.version
                                    : parsed.version;
                                  const base = parsed.cleanTitle || 'Untitled assessment';
                                  return (
                                    <>
                                      <h5 className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{base}</h5>
                                      {displayVersion && (
                                        <span className="text-xs px-2 py-0.5 bg-brand-cyan/15 text-brand-cyan ring-1 ring-brand-cyan/30 rounded font-semibold">
                                          V{displayVersion}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  Active
                                </span>
                              </div>

                              {/* Linked JD Information */}
                              {assessment.jd_short_id && (
                                <div className="text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                                  <span className="font-medium">Linked to: </span>
                                  <span className="text-gray-800 dark:text-slate-100">{assessment.jd_short_id}</span>
                                  {assessment.jd_title && (
                                    <span className="ml-1">- {assessment.jd_title}</span>
                                  )}
                                  {assessment.jd_version && (
                                    <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.jd_version}</span>
                                  )}
                                </div>
                              )}

                              {/* Duration and Sections */}
                              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {assessment.duration_minutes || 0} min
                                </span>
                              </div>

                              {/* Created By and Date */}
                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500 mt-1.5">
                                {assessment.created_by_name && (
                                  <>
                                    <span>Created by: <span className="text-gray-700 dark:text-slate-300 font-medium">{assessment.created_by_name}</span></span>
                                    <span>•</span>
                                  </>
                                )}
                                {assessment.created_at && (
                                  <span>
                                    {formatIST(assessment.created_at)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 gap-3 sm:gap-0 shrink-0">
              <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 text-center sm:text-left">
                {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white text-sm rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  <span className="hidden sm:inline">Proceed to Send Invitations</span>
                  <span className="sm:hidden">Send Invitations</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Assessment Modal - for details/results view */}
      {isShareModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setCurrentAssessmentForShare(null);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setAssessmentSearchQuery('');
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: (selectedAssessments[0].hr_enabled ? 1 : 0) +
                      (selectedAssessments[0].technical_enabled ? 1 : 0) +
                      (selectedAssessments[0].coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: selectedAssessments[0].short_id,
            version: selectedAssessments[0].version,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version,
          }}
          additionalAssessments={selectedAssessments.map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            version: a.version,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
          inviteSource="Resume Scoring"
        />
      )}
      </>
    );
  }

  // View: History List
  if (viewMode === 'history') {
    const totalMatchedCandidates = matchHistory.reduce((sum, item) => sum + (item.totalMatches || 0), 0);

    // Candidate roll-up search matches the person or any job they matched.
    const candidateQuery = candidateSearchQuery.trim().toLowerCase();
    const filteredCandidateRows = candidateRows.filter(row => {
      const matchesSearch = !candidateQuery ||
        row.name?.toLowerCase().includes(candidateQuery) ||
        row.email?.toLowerCase().includes(candidateQuery) ||
        row.title?.toLowerCase().includes(candidateQuery) ||
        row.jobs.some(job => job.jobTitle?.toLowerCase().includes(candidateQuery));

      const matchesLocation = candidateFilterLocation === 'all' || row.location === candidateFilterLocation;
      const matchesJob = candidateFilterJob === 'all' || row.jobs.some(job => job.jobTitle === candidateFilterJob);
      const matchesScore = row.bestScore >= candidateFilterMinScore;
      const matchesMultiJob = !candidateFilterMultiJob || row.jobs.length > 1;

      const matchesPhone = candidateFilterPhone === '' ||
        (!!row.phone && (
          row.phone.toLowerCase().includes(candidateFilterPhone.toLowerCase()) ||
          row.phone.replace(/[^0-9]/g, '').includes(candidateFilterPhone.replace(/[^0-9]/g, ''))
        ));

      // Unknown experience is excluded by a range filter rather than read as 0.
      const years = parseExperienceYears(row.experience);
      const matchesExpMin = candidateFilterExpMin === '' || (years !== null && years >= candidateFilterExpMin);
      const matchesExpMax = candidateFilterExpMax === '' || (years !== null && years <= candidateFilterExpMax);

      // Compare calendar days against the candidate's most recent match.
      const lastMatchedDay = row.jobs.reduce((latest, job) => {
        const key = toLocalDateKey(job.matchedAt);
        return key > latest ? key : latest;
      }, '');
      const matchesDateFrom = !candidateFilterDateFrom || lastMatchedDay >= candidateFilterDateFrom;
      const matchesDateTo = !candidateFilterDateTo || lastMatchedDay <= candidateFilterDateTo;

      return matchesSearch && matchesLocation && matchesJob && matchesScore && matchesMultiJob &&
        matchesPhone && matchesExpMin && matchesExpMax && matchesDateFrom && matchesDateTo;
    });

    const sortedCandidateRows = [...filteredCandidateRows].sort((a, b) => {
      const direction = candidateSortOrder === 'asc' ? 1 : -1;
      if (candidateSortBy === 'score') return (a.bestScore - b.bestScore) * direction;
      if (candidateSortBy === 'name') return (a.name || '').localeCompare(b.name || '') * direction;
      if (candidateSortBy === 'date') {
        const lastOf = (row: CandidateMatchRow) =>
          row.jobs.reduce((latest, job) => Math.max(latest, new Date(job.matchedAt).getTime()), 0);
        return (lastOf(a) - lastOf(b)) * direction;
      }
      return (a.jobs.length - b.jobs.length) * direction;
    });

    // Options come from the loaded rows, so only real values are offered.
    const candidateLocations = Array.from(
      new Set(candidateRows.map(row => row.location).filter(Boolean) as string[])
    ).sort();
    const candidateJobTitles = Array.from(
      new Set(candidateRows.flatMap(row => row.jobs.map(job => job.jobTitle)).filter(Boolean))
    ).sort();

    const candidateFiltersCount = candidateSearch.activeFilterCount;
    const candidateFiltersApplied = candidateSearch.isNarrowed;

    return (
      <>
      <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        {/* The candidate roll-up is an in-page view on this same route, so the
            trail stays at the module level — no extra step is added. */}
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Talent Match' }]} />
        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/80 rounded-lg transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-slate-700 self-start"
                aria-label="Back to Dashboard" title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-gray-700 dark:text-slate-300" />
              </button>
            )}
            <div className="h-9 w-9 bg-brand-blue rounded-lg flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <History className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 truncate">AI Talent Match - Matched Jobs</h1>
              <p className="text-sm text-gray-600 dark:text-slate-400 truncate">Review jobs with AI-matched candidates and their results</p>
            </div>
            
            {/* Units Display - Commented out (static data)
            {availableUnits !== null && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-800 rounded-xl shadow-lg p-4 border-2 border-gray-300">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-100 mb-0.5">Available Units</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-white">{availableUnits.toLocaleString()}</span>
                      <span className="text-xs text-gray-100">units</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            */}
            
            <button
              onClick={() => {
                if (!canRunAiMatch) {
                  toast.error('You do not have permission to run AI matching operations');
                  return;
                }
                setViewMode('new');
                setSelectedJob('');
                setSelectedCandidates([]);
                router.push('/recruitment/ai-talent-match', { scroll: false });
              }}
              disabled={!canRunAiMatch}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg transition-all text-sm font-medium flex items-center justify-center gap-2 shadow-sm ${
                canRunAiMatch
                  ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
              }`}
              title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run AI Match
            </button>
          </div>
        </div>

        <ModuleInfoBanner
          icon={<Sparkles className="h-4 w-4" />}
          title="AI-Powered Talent Matching"
          description="Use AI to compare your candidate pool with each job's skills, experience, and requirements. Review ranked matches, understand fit signals, and launch a new match whenever a role needs fresh candidates."
        />

        {/* Stats Cards */}
        {/* Default 4-column grid (same as /recruitment/job-openings) keeps the
            cards at the standard width instead of stretching them to half-page. */}
        <StatsCardGrid className="mb-5">
          <StatsCard
            tone="neutral"
            active={historyPageView === 'list'}
            showClickArrow
            icon={History}
            label="Matched Jobs"
            value={matchHistory.length}
            sparkline={false}
            onClick={openHistoryListView}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'candidates'}
            showClickArrow
            icon={User}
            label="Match by Candidate"
            value={totalMatchedCandidates}
            sparkline={false}
            onClick={openCandidatesView}
          />
        </StatsCardGrid>

        {/* ── Match by Candidate (in-page) ───────────────────────────────── */}
        {historyPageView === 'candidates' && (
          <>
            <div ref={historyListSectionRef} className="scroll-mt-4" aria-hidden="true" />

            {/* Toolbar, laid out like /recruitment/job-openings — the count
                rides inside it as a pill rather than floating above. */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
              <ListToolbar
                className={showCandidateFilters ? 'mb-3' : 'mb-0'}
                searchValue={candidateSearchQuery}
                onSearchChange={candidateSearch.setQuery}
                // The hook debounces into `appliedQuery`, so keystrokes pass through.
                searchDebounceMs={0}
                searchPlaceholder="Search candidates by name, email or job..."
                onToggleFilters={() => {
                  setShowCandidateFilters(!showCandidateFilters);
                }}
                filtersOpen={showCandidateFilters}
                activeFilterCount={candidateFiltersCount}
                filtersApplied={candidateFiltersApplied}
                onClearFilters={clearCandidateFilters}
                countBadge={
                  <ListCountBadge
                    filtered={filteredCandidateRows.length}
                    total={candidateRows.length}
                    noun="candidate"
                  />
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500 dark:text-slate-400 hidden sm:inline">Sort by</span>
                  <div className="inline-flex items-center bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-full p-0.5 hover:border-brand-blue/30 transition-colors">
                    <div className="relative">
                      <select
                        value={candidateSortBy}
                        onChange={(e) => setCandidateSortBy(e.target.value as 'score' | 'name' | 'jobs' | 'date')}
                        aria-label="Sort candidates by"
                        className="appearance-none h-8 pl-3 pr-8 bg-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-sm font-medium text-gray-800 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="jobs">Matched Jobs</option>
                        <option value="score">Best Match</option>
                        <option value="name">Candidate Name</option>
                        <option value="date">Last Matched</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCandidateSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      className="ml-0.5 h-8 w-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                      title={candidateSortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
                    >
                      <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${candidateSortOrder === 'asc' ? '' : 'rotate-180'}`} />
                    </button>
                  </div>
                </div>
              </ListToolbar>

              {showCandidateFilters && (
                <div className="pt-3 border-t border-brand-blue/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {candidateLocations.length > 0 && (
                      <div>
                        <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Location</label>
                        <select
                          value={candidateFilterLocation}
                          onChange={(e) => candidateSearch.setFilter('location', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                        >
                          <option value="all">All Locations</option>
                          {candidateLocations.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {candidateJobTitles.length > 0 && (
                      <div>
                        <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Matched Job</label>
                        <select
                          value={candidateFilterJob}
                          onChange={(e) => candidateSearch.setFilter('job', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                        >
                          <option value="all">All Jobs</option>
                          {candidateJobTitles.map(title => (
                            <option key={title} value={title}>{title}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Minimum Match</label>
                      <select
                        value={candidateFilterMinScore}
                        onChange={(e) => candidateSearch.setFilter('minScore', Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                      >
                        <option value={0}>Any score</option>
                        <option value={50}>50% and above</option>
                        <option value={70}>70% and above</option>
                        <option value={80}>80% and above</option>
                        <option value={90}>90% and above</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Job Count</label>
                      <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg cursor-pointer bg-white dark:bg-slate-900">
                        <input
                          type="checkbox"
                          checked={candidateFilterMultiJob}
                          onChange={(e) => candidateSearch.setFilter('multiJob', e.target.checked)}
                        />
                        <span className="text-sm text-gray-700 dark:text-slate-300">Matched 2+ jobs</span>
                      </label>
                    </div>

                    <div>
                      <label htmlFor="candidate-phone" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Mobile No</label>
                      <input
                        id="candidate-phone"
                        type="text"
                        value={candidateFilterPhone}
                        onChange={(e) => candidateSearch.setFilter('phone', e.target.value)}
                        placeholder="Full or partial number"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <label htmlFor="candidate-matched-from" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Last Matched From</label>
                      <input
                        id="candidate-matched-from"
                        type="date"
                        value={candidateFilterDateFrom}
                        max={candidateFilterDateTo || undefined}
                        onChange={(e) => candidateSearch.setFilter('dateFrom', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label htmlFor="candidate-matched-to" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Last Matched To</label>
                      <input
                        id="candidate-matched-to"
                        type="date"
                        value={candidateFilterDateTo}
                        min={candidateFilterDateFrom || undefined}
                        onChange={(e) => candidateSearch.setFilter('dateTo', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Experience (years)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={candidateFilterExpMin}
                          onChange={(e) => candidateSearch.setFilter('expMin', e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Min"
                          min={0}
                          aria-label="Minimum experience in years"
                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                        />
                        <input
                          type="number"
                          value={candidateFilterExpMax}
                          onChange={(e) => candidateSearch.setFilter('expMax', e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Max"
                          min={0}
                          aria-label="Maximum experience in years"
                          className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Panel footer: "Done" applies the selection and reveals the
                      toolbar Clear — same flow as job-openings. */}
                  <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                    <button
                      // The controls above commit as they change, so Done just closes.
                      onClick={() => setShowCandidateFilters(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {loadingCandidateRows ? (
              <div className="flex items-center justify-center gap-2 text-gray-500 py-16 tf-loader-center tf-loader-center--compact">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                <span className="text-sm">Loading matched candidates...</span>
              </div>
            ) : filteredCandidateRows.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-8 sm:p-10 text-center">
                <div className="w-12 h-12 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center mx-auto mb-3">
                  <User className="w-5 h-5" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2">
                  {candidateFiltersApplied ? 'No candidates match your filters' : 'No matched candidates yet'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto">
                  {candidateFiltersApplied
                    ? 'Try a different name, job, location, or lower the minimum match.'
                    : 'Run AI Match on a job to see matched candidates here.'}
                </p>
                {candidateFiltersApplied && (
                  <button
                    onClick={clearCandidateFilters}
                    className="mt-4 px-3 py-2 rounded-lg text-sm font-medium text-brand-blue bg-brand-blue/5 border border-brand-blue/20 hover:bg-brand-blue/10 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              /* Table format, matching the Resume Scoring "Scored Resumes"
                 table: desktop table + mobile card fallback. */
              <>
                <div className="hidden md:block min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto rounded-xl border border-gray-100 dark:border-slate-700/60 tf-table-shell">
                  <table className="w-full min-w-[1330px] table-auto">
                    {/* Sticky header — background/border live on the cells, since
                        a sticky <tr> doesn't paint them reliably. */}
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {['Candidate Name', 'Job Title', 'Email', 'Phone', 'Location', 'Skills', 'Experience', 'Uploaded By', 'Uploaded Date', 'Attachments', 'Scored Status'].map((label) => (
                          <th
                            key={label}
                            className="text-left py-3 px-4 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCandidateRows.map((row, index) => {
                        const chipsExpanded = expandedJobChips.has(row.key);
                        const topJob = row.jobs.reduce((best, job) => (job.score > best.score ? job : best), row.jobs[0]);
                        // The Job Title column names the strongest match; the rest
                        // of this candidate's jobs sit behind "+N more".
                        const otherJobs = row.jobs.filter(job => job.historyId !== topJob?.historyId);

                        return (
                          <tr
                            key={row.key}
                            onClick={() => openCandidateResume(row, sortedCandidateRows)}
                            className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                              index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50 dark:bg-slate-800/30'
                            }`}
                          >
                            <td className="py-3 px-4 align-middle whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-xs text-gray-700 dark:text-slate-300 font-medium">
                                  {(row.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                                  {row.name || 'Unknown'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 align-middle">
                              <div className={`flex items-center gap-2 ${chipsExpanded ? 'flex-wrap' : ''}`}>
                                <span className="block max-w-[220px] truncate text-sm text-gray-700 dark:text-slate-300">
                                  {topJob?.jobTitle || '-'}
                                </span>
                                {chipsExpanded && otherJobs.map((job) => (
                                  <button
                                    key={`${row.key}-${job.historyId}`}
                                    onClick={(e) => { e.stopPropagation(); openCandidateMatch(job.historyId); }}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 dark:bg-slate-800 rounded-md text-xs text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors flex-shrink-0 whitespace-nowrap"
                                    title={`Open ${job.jobTitle} match`}
                                  >
                                    <Briefcase className="w-3 h-3 text-gray-400" />
                                    <span className="max-w-[160px] truncate">{job.jobTitle}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className="tabular-nums font-medium">{Math.round(job.score)}%</span>
                                  </button>
                                ))}
                                {otherJobs.length > 0 && (
                                  <button
                                    onClick={(e) => toggleCandidateChips(e, row.key)}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors flex-shrink-0 whitespace-nowrap ${
                                      chipsExpanded
                                        ? 'text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:text-brand-blue hover:border-brand-blue/30'
                                        : 'text-brand-blue bg-brand-blue/5 border border-brand-blue/20 hover:bg-brand-blue/10'
                                    }`}
                                    title={chipsExpanded ? 'Hide other matched jobs' : `Show ${otherJobs.length} more matched job${otherJobs.length !== 1 ? 's' : ''}`}
                                  >
                                    {chipsExpanded ? 'Show less' : `+${otherJobs.length} more`}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                              {row.email ? row.email : <span className="text-gray-400 dark:text-slate-500">-</span>}
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                              {(() => {
                                const numbers = splitPhoneNumbers(row.phone, 2);
                                return numbers.length > 0
                                  ? <div className="flex flex-col gap-0.5">{numbers.map((num, i) => <span key={i}>{num}</span>)}</div>
                                  : <span className="text-gray-400 dark:text-slate-500">-</span>;
                              })()}
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                              {row.location ? row.location : <span className="text-gray-400 dark:text-slate-500">-</span>}
                            </td>
                            <td className="py-3 px-4 align-middle min-w-[220px]">
                              <div className="flex flex-wrap gap-1">
                                <SkillsList
                                  skills={row.best.skills}
                                  chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 whitespace-nowrap"
                                  moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium whitespace-nowrap hover:bg-brand-blue/10 transition-colors cursor-pointer"
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                              {row.experience || '-'}
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                              {formatUploadedBy(row.best.uploadedByName, row.best.uploadedBy)}
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                              {row.best.uploadDate ? formatISTDate(row.best.uploadDate) : <span className="text-gray-400 dark:text-slate-500">-</span>}
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAttachmentsClick(row.best); }}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                {row.best.attachmentCount || 1}
                              </button>
                            </td>
                            <td className="py-3 px-4 align-middle whitespace-nowrap">
                              {row.resumeId && allScoredResumeIds.has(row.resumeId) ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                  <CheckCircle className="w-3 h-3" />
                                  Scored
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-xs font-medium">
                                  <XCircle className="w-3 h-3" />
                                  Not Scored
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards — the table is too wide below md */}
                <div className="md:hidden space-y-3">
                  {sortedCandidateRows.map((row) => {
                    return (
                      <div
                        key={row.key}
                        onClick={() => openCandidateResume(row, sortedCandidateRows)}
                        className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-3 shadow-sm cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-blue-600 truncate">{row.name}</div>
                            {row.title && <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{row.title}</div>}
                          </div>
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs border flex-shrink-0 ${candidateScoreBadgeClass(row.bestScore)}`}>
                            {Math.round(row.bestScore)}%
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-slate-400">
                          {row.email && <span className="flex items-center gap-1 min-w-0"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{row.email}</span></span>}
                          {row.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{row.phone}</span>}
                          {row.location && <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{row.location}</span></span>}
                          <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{row.jobs.length} {row.jobs.length === 1 ? 'job' : 'jobs'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {historyPageView === 'list' && (
        <>
        <div ref={historyListSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Search + filters in the job-openings format: one toolbar row and an
            inline panel that confirms with "Done". */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 lg:p-5 mb-4">
          <ListToolbar
            searchValue={historySearchQuery}
            onSearchChange={historySearch.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search by job title or JD ID..."
            onToggleFilters={() => {
              setShowHistoryFilters(!showHistoryFilters);
            }}
            filtersOpen={showHistoryFilters}
            activeFilterCount={activeFiltersCount}
            filtersApplied={historySearch.isNarrowed}
            onClearFilters={clearHistoryFilters}
            className="mb-0"
            /* The history list is "Matched Jobs", so it counts in jobs too. */
            countBadge={
              <ListCountBadge
                filtered={filteredHistory.length}
                total={matchHistory.length}
                noun="job"
              />
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500 dark:text-slate-400 hidden sm:inline">Sort by</span>
              <div className="inline-flex items-center bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-full p-0.5 hover:border-brand-blue/30 transition-colors">
                <div className="relative">
                  <select
                    value={historySortBy}
                    onChange={(e) => setHistorySortBy(e.target.value as 'date' | 'matches' | 'title')}
                    aria-label="Sort matched jobs by"
                    className="appearance-none h-8 pl-3 pr-8 bg-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-sm font-medium text-gray-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="date">Match Date</option>
                    <option value="matches">Matched Candidates</option>
                    <option value="title">Job Title</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setHistorySortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="ml-0.5 h-8 w-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:border-brand-blue/30 hover:text-brand-blue transition-colors"
                  title={historySortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
                >
                  <ArrowUpDown className={`w-3.5 h-3.5 transition-transform ${historySortOrder === 'asc' ? '' : 'rotate-180'}`} />
                </button>
              </div>
            </div>

          </ListToolbar>

          {showHistoryFilters && (
            <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                <div>
                  <label htmlFor="history-date-from" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Matched From</label>
                  <input
                    id="history-date-from"
                    type="date"
                    value={historyDateFrom}
                    max={historyDateTo || undefined}
                    onChange={(e) => historySearch.setFilter('dateFrom', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="history-date-to" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Matched To</label>
                  <input
                    id="history-date-to"
                    type="date"
                    value={historyDateTo}
                    min={historyDateFrom || undefined}
                    onChange={(e) => historySearch.setFilter('dateTo', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="history-min-matches" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Matched Candidates</label>
                  <select
                    id="history-min-matches"
                    value={historyFilterMinMatches}
                    onChange={(e) => historySearch.setFilter('minMatches', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                  >
                    <option value="">Any number</option>
                    <option value={1}>At least 1</option>
                    <option value={5}>At least 5</option>
                    <option value={10}>At least 10</option>
                    <option value={25}>At least 25</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="history-location" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Candidate Location</label>
                  <input
                    id="history-location"
                    type="text"
                    value={historyFilterLocation}
                    onChange={(e) => historySearch.setFilter('location', e.target.value)}
                    placeholder="e.g. Chennai"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                  />
                </div>

                <div>
                  <label htmlFor="history-phone" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Candidate Mobile</label>
                  <input
                    id="history-phone"
                    type="text"
                    value={historyFilterPhone}
                    onChange={(e) => historySearch.setFilter('phone', e.target.value)}
                    placeholder="Full or partial number"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Candidate Experience (years)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={historyFilterExpMin}
                      onChange={(e) => historySearch.setFilter('expMin', e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Min"
                      min={0}
                      aria-label="Minimum candidate experience in years"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                    />
                    <input
                      type="number"
                      value={historyFilterExpMax}
                      onChange={(e) => historySearch.setFilter('expMax', e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Max"
                      min={0}
                      aria-label="Maximum candidate experience in years"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500 dark:text-slate-500">
                Location, mobile and experience match a job when any of its candidates matches.
                {resolvingHistoryCandidates ? ' Loading candidates...' : ''}
              </p>

              {/* Panel footer: "Done" applies the selection and reveals the
                  toolbar Clear - same flow as job-openings. */}
              <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                <button
                  // The controls above commit as they change, so Done just closes.
                  onClick={() => setShowHistoryFilters(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* History List */}
        {filteredHistory.length > 0 ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 mb-3">
              <h2 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 font-medium">Matched Jobs ({filteredHistory.length})</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Click any job to view matched candidates</p>
            </div>
            <div className="grid gap-3 sm:gap-4">
            {sortedHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage).map((item) => {
              const jobData = jobs.find(j => j.id === item.jobId);
              // Version history is cached/keyed by the human JD-xxx code, not
              // this row's id — every republished version of the same job
              // shares one history key so their runs aren't split across cards.
              const historyKey = jobData?.jobId || item.jobId;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    userChangedView.current = true; // Prevent useEffect from resetting view
                    setSelectedHistoryItem(item);
                    setSelectedJob(item.jobId);
                    setViewMode('details');
                    updateUrlParams({ jdId: item.jobId, view: 'details' });
                  }}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 p-4 cursor-pointer group"
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Job Info */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="h-9 w-9 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {jobData?.jobId && (
                            <JobIdBadge className="inline-flex items-center">{jobData.jobId}</JobIdBadge>
                          )}
                          {jobData?.currentVersion && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20">
                              v{jobData.currentVersion}
                            </span>
                          )}
                          {jobData?.currentVersion && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                              jobData.currentVersion > 1
                                ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }`}>
                              {jobData.currentVersion > 1 ? 'Republished' : 'Published'}
                            </span>
                          )}
                          <JDVersionHistory jdId={item.jobId} version={jobData?.currentVersion} />
                        </div>
                        <h3
                          className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 mb-1 truncate group-hover:text-brand-blue transition-colors"
                          title={item.jobTitle}
                        >
                          {item.jobTitle}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formatISTDate(item.matchedAt.toISOString())}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {item.totalMatches} matches
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* View Details / View Version History Buttons */}
                    <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          userChangedView.current = true; // Prevent useEffect from resetting view
                          setSelectedHistoryItem(item);
                          setSelectedJob(item.jobId);
                          setViewMode('details');
                          updateUrlParams({ jdId: item.jobId, view: 'details' });
                        }}
                        className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all flex items-center justify-center gap-2 font-medium text-sm w-full sm:w-auto shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                      >
                        View Details
                        <ArrowLeft className="w-3.5 h-3.5 rotate-180 group-hover:translate-x-1 transition-transform" />
                      </button>
                      {/* Only a job with more than one match run has history worth
                          looking back at — a v1-only job would open onto a single
                          row repeating the card above it. */}
                      {(matchSessionCounts[historyKey] || 0) > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAIMatchVersionHistory(historyKey, item.jobId);
                          }}
                          aria-expanded={expandedHistoryJobId === historyKey}
                          className={`px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 font-medium text-sm border w-full sm:w-auto ${
                            expandedHistoryJobId === historyKey
                              ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                              : 'bg-white dark:bg-slate-800 hover:bg-brand-blue/5 text-gray-700 dark:text-slate-200 hover:text-brand-blue border-gray-200 dark:border-slate-700 hover:border-brand-blue/30'
                          }`}
                        >
                          <History className="w-3.5 h-3.5" />
                          {expandedHistoryJobId === historyKey ? 'Hide Version History' : 'Version History'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Version History — inline, below the row (not a popup): every
                      match run across this job's whole lineage (every republished
                      version), expanding in place the same way the Job Openings
                      list expands its own version history. */}
                  {expandedHistoryJobId === historyKey && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60" onClick={(e) => e.stopPropagation()}>
                      <AIMatchVersionHistoryTable
                        loading={loadingHistoryJobId === historyKey}
                        failed={failedHistoryJobId === historyKey}
                        versions={historyVersionsByJob[historyKey] ?? null}
                        onRetry={() => loadAIMatchVersionHistory(historyKey, item.jobId)}
                        onViewSession={(session) => {
                          userChangedView.current = true; // Prevent useEffect from resetting view
                          // The session may belong to a different row in this
                          // job's lineage than the card it was opened from —
                          // navigate using the session's own jd_id, not this row's.
                          const targetJobId = session.jd_id || item.jobId;
                          const targetJob = jobs.find(j => j.id === targetJobId);
                          setSelectedHistoryItem({
                            id: session.id,
                            jobId: targetJobId,
                            jobTitle: targetJob?.title || item.jobTitle,
                            matchedAt: new Date(session.created_at),
                            totalMatches: session.total_matches,
                            matchedCandidates: [],
                          });
                          setSelectedJob(targetJobId);
                          setViewMode('details');
                          updateUrlParams({ jdId: targetJobId, view: 'details' });
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            <ListPagination
              currentPage={historyCurrentPage}
              itemsPerPage={historyItemsPerPage}
              totalItems={filteredHistory.length}
              onPageChange={setHistoryCurrentPage}
              onItemsPerPageChange={setHistoryItemsPerPage}
              itemLabel="jobs"
            />
          </>
        ) : matchHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <History className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2">No Matching History Yet</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                Start using AI Talent Match to find the best candidates for your jobs. Our AI will analyze and rank candidates based on job fit.
              </p>
              <button
                onClick={() => {
                  if (!canRunAiMatch) {
                    toast.error('You do not have permission to run AI matching operations');
                    return;
                  }
                  setViewMode('new');
                  setSelectedJob('');
                  router.push('/recruitment/ai-talent-match', { scroll: false });
                }}
                disabled={!canRunAiMatch}
                className={`px-4 py-2 rounded-lg transition-all font-medium shadow-sm inline-flex items-center gap-2 text-sm ${
                  canRunAiMatch
                    ? 'bg-brand-blue hover:bg-brand-blue-2 text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Run AI Match Now
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-dashed border-brand-blue/20 p-8 sm:p-10 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto mb-4 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center">
                <Search className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 mb-2">No Results Found</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                No matched jobs match your current filters. Try adjusting your search criteria.
              </p>
              <button
                onClick={clearHistoryFilters}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:shadow-md hover:shadow-brand-blue/30 inline-flex items-center gap-2 text-sm"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            </div>
          </div>
        )}
        </>
        )}
        </div>
      </div>
      </main>

      {/* Resume Versions Modal — the candidate roll-up's Attachments column
          opens it from this view too. */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          versions={realVersionsData}
          loading={loadingVersions}
          onClose={() => {
            setSelectedVersionsCandidate(null);
            setRealVersionsData([]);
          }}
        />
      )}

      </>
    );
  }

  // View: Results (After Matching)
  if (viewMode === 'results') {
    const filteredCandidates = filteredCandidatesMemo;
    const paginatedCandidates = getPaginatedCandidates();
    const excellentCount = matchedCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = matchedCandidates.filter(c => c.matchScore < 70).length;
    const historyItemForSelectedJob = matchHistory.find(item => item.jobId === selectedJob);
    const isLoadingResultsFromHistory =
      loadingHistorySessionId !== null &&
      (loadingHistorySessionId === selectedHistoryItem?.id || loadingHistorySessionId === historyItemForSelectedJob?.id);

    return (
      <main className="flex-1 overflow-x-hidden bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Talent Match', onClick: () => setViewMode('history') },
              ...(selectedHistoryItem?.jobId === selectedJob ? [{
                label: 'Match Details',
                onClick: () => {
                  setViewMode('details');
                  updateUrlParams({ jdId: selectedJob, view: 'details' });
                },
              }] : []),
              { label: selectedJobData?.title || 'Results' },
            ]}
          />

          {/* SaaS Header */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-1 tracking-tight truncate">{selectedJobData?.title}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {matchedCandidates.length} matches
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Complete
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                      <Sparkles className="w-3 h-3" />
                      AI Talent Match • 0 units consumed
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-2">
                <button
                  onClick={() => {
                    setViewMode('new');
                    setSelectedJob('');
                    setSelectedCandidates([]);
                    setMatchedCandidates([]);
                    setSelectedHistoryItem(null);
                    setShowMatchingPanel(false);
                    setMatchError(null);
                    router.push('/recruitment/ai-talent-match', { scroll: false });
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>New AI Match</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters & Search toolbar — only show when there are matched candidates to filter */}
          {!isLoadingResultsFromHistory && matchedCandidates.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
                />
              </div>
              <select
                value={filterThreshold}
                onChange={(e) => setFilterThreshold(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value={0}>All Matches</option>
                <option value={50}>50%+ Match</option>
                <option value={70}>70%+ Match</option>
                <option value={85}>85%+ Match</option>
              </select>
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {availableUnits !== null && selectedCandidates.length > availableUnits && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-lg w-full sm:w-auto">
                      <AlertTriangle className="w-4 h-4 text-brand-orange-deep flex-shrink-0" />
                      <span className="text-xs text-brand-orange-deep font-medium">
                        Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                      </span>
                    </div>
                  )}
                  <>
                  {canRunScoring && (
                  <button
                      onClick={handleSubmitToScoring}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-3 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                    }`}
                    >
                      <Target className="w-3.5 h-3.5" />
                      Score ({selectedCandidates.length})
                    </button>
                  )}
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={handleAssessment}
                      className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Assessment ({selectedCandidates.length})
                    </button>
                  )}
                </>
                </div>
              )}
              {/* Count badge closes the row, as it does on every list. */}
              <ListCountBadge
                className="sm:ml-auto"
                filtered={filteredCandidates.length}
                total={matchedCandidates.length}
                noun="candidate"
                selected={selectedCandidates.length}
              />
            </div>
            {/* Additional Filters */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMin}
                onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Min exp (years)"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="number"
                value={filterExperienceMax}
                onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Max exp (years)"
                className="w-full sm:w-28 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                className="col-span-2 sm:col-span-1 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
              >
                <option value="rank">Sort by Rating (High to Low)</option>
                <option value="name">Sort by Name (A to Z)</option>
                <option value="score">Sort by Score</option>
                <option value="experience">Sort by Experience</option>
              </select>
            </div>
          </div>
          )}

          {/* Candidates List */}
          <div>
          {isLoadingResultsFromHistory ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 tf-loader-center tf-loader-center--compact">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin mb-3" />
              <p className="text-sm text-gray-600 dark:text-slate-400 text-center">Loading matched candidates...</p>
            </div>
          ) : matchedCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="w-12 h-12 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-full flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-brand-blue" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2 text-center">No AI Match Results Yet</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 text-center max-w-md mb-4">
                AI Talent Match has not been run for this job yet. Run AI matching to find candidates that match this job description.
              </p>
            </div>
          ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
            {/* Bounded viewport so only the rows scroll — pagination below stays put. */}
            <div className="min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto tf-table-shell">
            <table className="w-full min-w-[1450px]">
              <thead className="sticky top-0 z-10 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                <tr>
                  <th className="w-12 px-4 py-3 tf-sticky-col-left">
                    <input
                      type="checkbox"
                      checked={filteredCandidates.length > 0 && filteredCandidates.every(c => selectedCandidates.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCandidates(filteredCandidates.map(c => c.id));
                        } else {
                          setSelectedCandidates([]);
                        }
                      }}
                      className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Matched Rating
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Candidate Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Job Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Skills
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Experience
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Attachments
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Scored Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-700">
                {paginatedCandidates.map((candidate, index) => (
                  <tr
                    key={candidate.id}
                    data-row-selected={selectedCandidates.includes(candidate.id)}
                    className={`hover:bg-brand-blue/[0.03] transition-colors cursor-pointer ${
                      selectedCandidates.includes(candidate.id) ? 'bg-brand-blue/5' : ''
                    }`}
                    onClick={() => {
                      if (candidate.resumeId) {
                        try {
                          sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidatesMemo.map((c: any) => c.resumeId).filter(Boolean)));
                          sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
                          sessionStorage.setItem('resumeNavAIMatchJobId', selectedJob);
                          // The breadcrumb names the job this match belongs to.
                          sessionStorage.setItem(
                            'resumeNavAIMatchJobTitle',
                            selectedJobData?.title || historyItemForSelectedJob?.jobTitle || ''
                          );
                          markAIMatchReturnTrip();
                        } catch { /* ignore */ }
                        router.push(`/recruitment/resume-view/${candidate.resumeId}`);
                      }
                    }}
                  >
                    <td className="px-4 py-4 tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedCandidates.includes(candidate.id)}
                        onChange={() => handleSelectCandidate(candidate.id)}
                        className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-base ${
                        (candidate.rank || 0) >= 9 ? 'bg-brand-blue/10 text-brand-blue border-2 border-brand-blue/30' :
                        (candidate.rank || 0) >= 7 ? 'bg-brand-cyan/10 text-brand-cyan border-2 border-brand-cyan/30' :
                        (candidate.rank || 0) >= 5 ? 'bg-brand-orange/10 text-brand-orange-deep border-2 border-brand-orange/30' :
                        'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-2 border-gray-200 dark:border-slate-700'
                      }`}>
                        {candidate.rank || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-sm text-brand-blue font-medium flex-shrink-0">
                          {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-slate-50">{candidate.name || 'Unknown'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      <span className="block max-w-[220px] truncate">
                        {selectedJobData?.title || selectedHistoryItem?.jobTitle || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.email ? candidate.email : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {(() => {
                        const numbers = splitPhoneNumbers(candidate.phone, 2);
                        return numbers.length > 0
                          ? <div className="flex flex-col gap-0.5">{numbers.map((num, i) => <span key={i}>{num}</span>)}</div>
                          : <span className="text-gray-400 dark:text-slate-500">-</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.location ? candidate.location : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        <SkillsList
                          skills={candidate.skills}
                          chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20"
                          moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium hover:bg-brand-blue/10 transition-colors cursor-pointer"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{candidate.experience}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.uploadDate ? formatISTDate(candidate.uploadDate) : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersionsCandidate(candidate);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {candidate.attachmentCount || 1}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      {scoredResumeIds.has(candidate.resumeId) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                          <CheckCircle className="w-3 h-3" />
                          Scored
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700">
                          <XCircle className="w-3 h-3" />
                          Not Scored
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Pagination Controls */}
            {totalFilteredCandidates > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalFilteredCandidates}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            )}
          </div>
          )}
          </div>
        </div>
        </div>
      </main>
    );
  }

  // View: New Match (Job Selection)
  return (
    <>

      <AITalentMatchPageJobsList
        jobs={jobs}
        matchHistory={matchHistory}
        onSelectJob={(jobId) => {
          handleRunAIMatch(jobId);
        }}
        onViewHistory={() => setViewMode('history')}
        onBack={onBack}
      />
      
      {/* AI Matching Progress Panel */}
      {showMatchingPanel && selectedJob && (
        <AITalentMatchProgressPanel
          jobTitle={selectedJobData?.title || 'Job Description'}
          jobId={selectedJob}

          onComplete={handleMatchingComplete}
          onError={(error) => {
            setMatchError(error);
            setShowMatchingPanel(false);
          }}
        />
      )}
      
      {/* Resume Versions Modal */}
      {selectedVersionsCandidate && (
        <ResumeVersionsModal
          candidate={selectedVersionsCandidate}
          versions={realVersionsData}
          loading={loadingVersions}
          onClose={() => {
            setSelectedVersionsCandidate(null);
            setRealVersionsData([]);
          }}
        />
      )}

      {/* Version Selection Modal for Scoring (single candidate) */}
      {showVersionSelectForScoring && scoringCandidate && (
        <ResumeVersionsModal
          candidate={scoringCandidate}
          versions={scoringVersions}
          loading={loadingVersions}
          selectionMode={true}
          onClose={() => {
            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
          onSelectVersion={async (version) => {
            // Score with selected version
            const jobId = selectedJob || selectedHistoryItem?.jobId;
            if (!jobId || !scoringCandidate) return;

            try {
              const response = await scoringService.startBulkScoringAsync(jobId, [version.id]);
              const scoringData = {
                batchId: response.batch_id,
                jobId: response.jd_id,
                jobTitle: response.jd_title,
                totalResumes: response.total_resumes,
                resumeItems: [{ resumeId: version.id, candidateName: scoringCandidate.name }],
              };
              sessionStorage.setItem('pendingScoringBatch', JSON.stringify(scoringData));
              router.push(`/recruitment/resume-scoring?batch_id=${response.batch_id}`);
            } catch (error: any) {
              console.error('Failed to start scoring:', error);
              toast.error(error.message || 'Failed to start scoring');
            }

            setShowVersionSelectForScoring(false);
            setScoringCandidate(null);
            setScoringVersions([]);
          }}
        />
      )}

      {/* Assessment Selection Modal */}
      {isAssessmentModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsAssessmentModalOpen(false);
            setSelectedAssessments([]);
            setAssessmentSearchQuery('');
          }
        }}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 w-full max-w-[95vw] sm:max-w-4xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-slate-50">Select Active Assessments</h2>
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="text-gray-400 dark:text-slate-500 hover:text-gray-600 p-1"
                 aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3">
                Select one or more assessments to send to {selectedCandidates.length} candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </p>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={assessmentSearchQuery}
                  onChange={(e) => setAssessmentSearchQuery(e.target.value)}
                  placeholder="Search assessments..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
                />
              </div>

              {/* Select All / Clear All */}
              {assessments.length > 0 && (() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });
                return filteredAssessments.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedAssessments.length === filteredAssessments.length) {
                        setSelectedAssessments([]);
                      } else {
                        setSelectedAssessments(filteredAssessments);
                      }
                    }}
                    className="text-xs text-brand-blue hover:text-brand-blue-2 font-medium mt-3"
                  >
                    {selectedAssessments.length === filteredAssessments.length && selectedAssessments.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {(() => {
                const filteredAssessments = assessments.filter(assessment => {
                  if (!assessmentSearchQuery.trim()) return true;
                  const query = assessmentSearchQuery.toLowerCase();
                  return (
                    assessment.short_id?.toLowerCase().includes(query) ||
                    assessment.title?.toLowerCase().includes(query) ||
                    assessment.jd_short_id?.toLowerCase().includes(query) ||
                    assessment.jd_title?.toLowerCase().includes(query)
                  );
                });

                return filteredAssessments.length === 0 ? (
                  <div className="text-center py-10">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-slate-500">{assessmentSearchQuery ? 'No assessments match your search' : 'No active assessments available'}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{assessmentSearchQuery ? 'Try different search terms' : 'Create and publish an assessment first'}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAssessments.map((assessment) => {
                      const isSelected = selectedAssessments.some(a => a.id === assessment.id);
                      return (
                        <button
                          key={assessment.id}
                          onClick={() => handleAssessmentSelect(assessment)}
                          className={`w-full text-left border-2 rounded-lg p-3 transition-all ${
                            isSelected
                              ? 'border-brand-blue/50 bg-brand-blue/5 shadow-sm shadow-brand-blue/10'
                              : 'border-gray-200 dark:border-slate-700 hover:border-brand-blue/30 hover:bg-brand-blue/5'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {/* Checkbox */}
                            <div className="flex-shrink-0 mt-1">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-brand-blue border-brand-blue'
                                  : 'bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-700'
                              }`}>
                                {isSelected && (
                                  <CheckCircle className="w-4 h-4 text-white" />
                                )}
                              </div>
                            </div>

                            <div className="flex-1">
                              {/* Assessment ID, Title, Version + Active Badge */}
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                {assessment.short_id && (
                                  <span className="text-xs px-2 py-0.5 bg-brand-blue text-white rounded font-semibold">
                                    {assessment.short_id}
                                  </span>
                                )}
                                {(() => {
                                  // Strip any "- Version N" baked into the stored title
                                  // and render the live version (from `version`, falling
                                  // back to the parsed title version) as its own badge.
                                  const parsed = parseAssessmentTitle(assessment.title || '');
                                  const displayVersion = typeof assessment.version === 'number'
                                    ? assessment.version
                                    : parsed.version;
                                  const base = parsed.cleanTitle || 'Untitled assessment';
                                  return (
                                    <>
                                      <h5 className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{base}</h5>
                                      {displayVersion && (
                                        <span className="text-xs px-2 py-0.5 bg-brand-cyan/15 text-brand-cyan ring-1 ring-brand-cyan/30 rounded font-semibold">
                                          V{displayVersion}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                                  Active
                                </span>
                              </div>

                              {/* Linked JD Information */}
                              {assessment.jd_short_id && (
                                <div className="text-xs text-gray-600 dark:text-slate-400 mb-1.5">
                                  <span className="font-medium">Linked to: </span>
                                  <span className="text-gray-800 dark:text-slate-100">{assessment.jd_short_id}</span>
                                  {assessment.jd_title && (
                                    <span className="ml-1">- {assessment.jd_title}</span>
                                  )}
                                  {assessment.jd_version && (
                                    <span className="ml-1 text-gray-500 dark:text-slate-500">v{assessment.jd_version}</span>
                                  )}
                                </div>
                              )}

                              {/* Duration and Sections */}
                              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {assessment.duration_minutes || 0} min
                                </span>
                              </div>

                              {/* Created By and Date */}
                              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-500 mt-1.5">
                                {assessment.created_by_name && (
                                  <>
                                    <span>Created by: <span className="text-gray-700 dark:text-slate-300 font-medium">{assessment.created_by_name}</span></span>
                                    <span>•</span>
                                  </>
                                )}
                                {assessment.created_at && (
                                  <span>
                                    {formatIST(assessment.created_at)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 gap-3 sm:gap-0 shrink-0">
              <div className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 text-center sm:text-left">
                {selectedAssessments.length} assessment{selectedAssessments.length !== 1 ? 's' : ''} selected
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white text-sm rounded-lg transition-all shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  <span className="hidden sm:inline">Proceed to Send Invitations</span>
                  <span className="sm:hidden">Send Invitations</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Assessment Modal */}
      {isShareModalOpen && selectedAssessments.length > 0 && (
        <ShareAssessmentModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setCurrentAssessmentForShare(null);
            setSelectedAssessments([]);
            setPrefilledCandidates([]);
            setAssessmentSearchQuery('');
          }}
          assessment={{
            id: selectedAssessments[0].id,
            title: selectedAssessments[0].title,
            duration: `${selectedAssessments[0].duration_minutes || 0} min`,
            questions: (selectedAssessments[0].hr_enabled ? 1 : 0) +
                      (selectedAssessments[0].technical_enabled ? 1 : 0) +
                      (selectedAssessments[0].coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: selectedAssessments[0].short_id,
            version: selectedAssessments[0].version,
            jd_short_id: selectedAssessments[0].jd_short_id,
            jd_title: selectedAssessments[0].jd_title,
            jd_version: selectedAssessments[0].jd_version,
          }}
          additionalAssessments={selectedAssessments.map(a => ({
            id: a.id,
            title: a.title,
            duration: `${a.duration_minutes || 0} min`,
            questions: (a.hr_enabled ? 1 : 0) + (a.technical_enabled ? 1 : 0) + (a.coding_enabled ? 1 : 0),
            type: 'AI-Generated',
            short_id: a.short_id,
            version: a.version,
            jd_short_id: a.jd_short_id,
            jd_title: a.jd_title,
            jd_version: a.jd_version
          }))}
          prefilledCandidates={prefilledCandidates}
          inviteSource="Resume Scoring"
        />
      )}

    </>
  );
}
