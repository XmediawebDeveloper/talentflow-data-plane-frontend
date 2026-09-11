'use client';

import Image from 'next/image';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { ArrowUpDown, Sparkles, BarChart3, Search, ChevronDown, ChevronRight, Mail, Phone, MapPin, Building2, CheckCircle, Star, User, Users, FileText, Send, TrendingUp, Award, Clock, Calendar, Briefcase, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, AlertTriangle, PlayCircle, Paperclip, ClipboardList, XCircle, Loader2, Info, RefreshCw, PieChart, MoreVertical, Video } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
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
import ShareAIInterviewModal from './ai-interview/ShareAIInterviewModal';
import { aiInterviewService, AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import SkillsList from '@/components/ui/SkillsList';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { formatISTDate, formatIST, formatISTTime } from '@/lib/utils/dateUtils';
/* The shared formatters, so a JD's industry and employment type read the same
   here as on the Resume Scoring rows this list is modelled on. */
import { formatEmploymentType, formatIndustryType, getDisplayStatus, getStatusConfig } from '@/lib/utils/jobOpeningDisplay';
import { useQuota } from '@/contexts/QuotaContext';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { useListSearch } from '@/lib/hooks/useListSearch';
import JDVersionHistory from '@/components/JDVersionHistory';

/* Shared row for both candidate tables' ⋮ Actions menu (Preview Resume /
   Score Resume / Invite Assessment / Invite AI Interview). */
const actionsMenuItemClass = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700 hover:!bg-gray-50 focus:!bg-gray-50 focus:!text-gray-700 focus-visible:!outline-none data-[highlighted]:!bg-gray-50 data-[highlighted]:!text-gray-700';

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
  /* Carried so the job rows can show what the Resume Scoring job rows show.
     All four already exist on the JD record; they were simply never mapped. */
  industryType?: string;
  remoteType?: string;
  postedBy?: string;
  postedDate?: string;
  /** Drives the AI / Manual badge next to Status in the version history table. */
  creationMethod?: string;
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

/**
 * AI Talent Match scores come back as a 0-100 percentage, but every place
 * this module shows a candidate's quality — "Top Match Rating", the score
 * badges, the Match History buckets — presents it as a 1-10 rating instead.
 * Every one of those spots converts through this single rounding rule, so
 * "80%" and a rating of "8" always mean the same candidate.
 */
function toMatchRating(score: number): number {
  return Math.max(0, Math.min(10, Math.round((score ?? 0) / 10)));
}

/** Exact Match = a perfect 10, Partial Match = 7-9, anything under 7 is No Match. */
function matchBandForRating(rating: number): 'exact' | 'partial' | 'no_match' {
  if (rating >= 10) return 'exact';
  if (rating >= 7) return 'partial';
  return 'no_match';
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
  const canCreateAssessments = isTenantAdmin || hasPermission('canCreateAssessments');
  const canCreateAIInterviews = isTenantAdmin || hasPermission('canCreateAIInterviews');


  /* 'details' used to be its own viewMode (the "Match Details" page) — it and
     'results' were the same page in every way that matters, just reached
     through a different breadcrumb hop, so it's gone now. `view=details` in
     the URL still works (see the searchParams effect below) — it's just an
     alias onto 'results'. */
  const [viewMode, setViewMode] = useState<'history' | 'new' | 'results' | 'matching'>('history');
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

  // Same avatar-colour hash and initials logic Resume Scoring's grouped
  // "View by Candidates" table uses, so a candidate's avatar looks the same
  // in both modules.
  const CANDIDATE_AVATAR_PALETTE = [
    { bg: 'bg-blue-100', text: 'text-blue-700' },
    { bg: 'bg-rose-100', text: 'text-rose-700' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    { bg: 'bg-violet-100', text: 'text-violet-700' },
    { bg: 'bg-amber-100', text: 'text-amber-700' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  ];
  const avatarColorFor = (key: string) => {
    const hash = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return CANDIDATE_AVATAR_PALETTE[hash % CANDIDATE_AVATAR_PALETTE.length];
  };
  const initialsFor = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
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

  /* The one thing every "view this job's match" entry point needs — Match
     Details used to be its own page/viewMode, but it and the results view
     were the same page in every way that matters (same table, same filters,
     same empty state), just reached through a different breadcrumb hop. This
     is what all of those entry points now call instead of setViewMode('details'),
     so there's exactly one "view a match" destination: the results view.
     Populates matchedCandidates synchronously from cache when available, and
     kicks off a fetch (updating both matchedCandidates and selectedHistoryItem
     once it resolves) when this specific session's candidates haven't been
     loaded yet — the same session-aware hydration Match Details relied on. */
  const openMatchResults = (item: MatchHistory, jobId: string) => {
    setSelectedHistoryItem(item);
    setSelectedJob(jobId);
    const resolved = getResolvedHistoryCandidates(item);
    setMatchedCandidates(resolved);
    if (resolved.length === 0 && item.totalMatches > 0) {
      loadHistoryCandidates(item).then(candidates => {
        setMatchedCandidates(candidates);
        setSelectedHistoryItem(prev => (prev && prev.id === item.id) ? { ...prev, matchedCandidates: candidates } : prev);
      }).catch(() => { /* loadHistoryCandidates already toasts on failure */ });
    }
    setViewMode('results');
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

  // "All Resumes": every candidate-to-job match as its own row, un-deduped —
  // the flat counterpart to the "Match by Candidate" roll-up above. It reads
  // the same `candidateRows` (each already carries every job a candidate
  // matched), so it shares that build rather than issuing a second fetch.
  const openAllResumesView = async () => {
    setHistoryPageView('resumes');
    candidateSearch.setQuery('');
    setHistoryListScrollRequest((request) => request + 1);
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
          // Same key Resume Scoring's "View by Candidates" groups by — email
          // first, so the same person collapses into one row even when a
          // different job's match run scored a re-uploaded resume with a new
          // resumeId. Keying on resumeId first (as this used to) meant two
          // matches for the same person rarely shared a key, so this roll-up
          // never actually collapsed anything and looked identical to the
          // flat "All Resumes" list.
          const key = (candidate.email || candidate.name || candidate.resumeId || '').trim().toLowerCase();
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
            // The strongest match owns the row's detail columns — including
            // resumeId, now that a row can span more than one resumeId (the
            // same person re-uploaded/re-scored under different job runs).
            if (jobEntry.score > existing.bestScore) {
              existing.bestScore = jobEntry.score;
              existing.best = candidate;
              existing.resumeId = candidate.resumeId;
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
  const [historyPageView, setHistoryPageView] = useState<'cards' | 'list' | 'candidates' | 'resumes'>('cards');
  const historyListSectionRef = useRef<HTMLDivElement | null>(null);
  const [historyListScrollRequest, setHistoryListScrollRequest] = useState(0);
  // The three rating-band pills on the "Show:" row — same idea as Resume
  // Scoring's Exact/Partial/No Match pills, continuing the same button group
  // and narrowing "All Resumes" to one band at a time.
  const [candidateRatingBand, setCandidateRatingBand] = useState<'exact' | 'partial' | 'no_match' | null>(null);
  // "Top Matching Jobs" card drill-down: narrows the Matched Jobs list (View by
  // Job) to only jobs whose best candidate hit a perfect 10/10 — the same
  // definition `topMatchingJobsCount` below counts. Separate from
  // `candidateRatingBand` because that one narrows the candidate-level "All
  // Resumes" view instead; the two views group by different things (job vs.
  // candidate-per-job), so each needs its own filter flag.
  const [showOnlyExactMatchJobs, setShowOnlyExactMatchJobs] = useState(false);

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
  // Pagination + row expansion for the "View by Candidates" grouped table —
  // same ListPagination control and expand-in-place pattern Resume Scoring's
  // grouped "View by Candidates" uses.
  const [candidateCurrentPage, setCandidateCurrentPage] = useState(1);
  const [candidateItemsPerPage, setCandidateItemsPerPage] = useState(20);
  const [expandedCandidateGroups, setExpandedCandidateGroups] = useState<Set<string>>(new Set());
  const toggleCandidateGroupExpanded = (key: string) => {
    setExpandedCandidateGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
    onChange: () => setCandidateCurrentPage(1),
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

  useEffect(() => {
    setCandidateCurrentPage(1);
  }, [candidateSortBy, candidateSortOrder]);

  const openCandidateMatch = (historyId: string) => {
    const item = matchHistory.find(h => h.id === historyId);
    if (!item) return;
    userChangedView.current = true;
    openMatchResults(item, item.jobId);
    updateUrlParams({ jdId: item.jobId, view: 'results' });
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

  // Match-score badge colours mirror the Scored Resumes match-status pills,
  // banded on the 1-10 rating rather than the raw percentage.
  const candidateScoreBadgeClass = (score: number) => {
    const band = matchBandForRating(toMatchRating(score));
    if (band === 'exact') return 'bg-green-100 text-green-700 border-green-300';
    if (band === 'partial') return 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const clearCandidateFilters = candidateSearch.reset;

  // One clear for the whole Matched Jobs list — shared by the panel's "Reset
  // all" and the empty state's button, which used to reset only three of them.
  // Also drops the "Top Matching Jobs" card's exact-match narrowing, so
  // "Clear All Filters" really does return to every matched job.
  const clearHistoryFilters = () => {
    historySearch.reset();
    setShowOnlyExactMatchJobs(false);
  };

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

  /* Preview — same in-app document viewer used by the Resume Scoring module's
     resume-selection step, opened from a row's ⋮ menu instead of navigating
     away to the full resume-view page. */
  const [previewResume, setPreviewResume] = useState<{ id: string; name: string; fileName?: string } | null>(null);

  /* Invite AI Interview from a row's ⋮ menu — same "resolve this job's live
     config, then open the share modal" flow JobDetailView uses for its own
     Scored Resumes row invite. */
  const [shareAIInterviewConfig, setShareAIInterviewConfig] = useState<AIInterviewResponse | null>(null);
  const [aiInterviewInviteSeed, setAiInterviewInviteSeed] = useState<{ name: string; email: string; resumeId?: string }[] | null>(null);
  const [resolvingInviteConfig, setResolvingInviteConfig] = useState(false);

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

  // Match History popup — one job's whole lineage of match runs, with the
  // Exact/Partial/No Match roll-up on top. Reuses the same
  // `historyVersionsByJob` fetch as "View Versions" (each version's `session`
  // there already carries its full `results`), so opening the popup for a job
  // whose versions are already expanded costs no extra request.
  const [matchHistoryModal, setMatchHistoryModal] = useState<{ item: MatchHistory; historyKey: string } | null>(null);
  const openMatchHistoryModal = (item: MatchHistory, historyKey: string) => {
    setMatchHistoryModal({ item, historyKey });
    if (!historyVersionsByJob[historyKey]) void loadAIMatchVersionHistory(historyKey, item.jobId);
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

      if (s.historyPageView === 'cards' || s.historyPageView === 'list' || s.historyPageView === 'candidates' || s.historyPageView === 'resumes') {
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
    if (historyPageView !== 'candidates' && historyPageView !== 'resumes') return;
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
    // Already on one of the roll-up tabs: the effect above owns that case.
    if (historyPageView === 'candidates' || historyPageView === 'resumes') return;
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
    if (historyPageView !== 'list' && historyPageView !== 'candidates' && historyPageView !== 'resumes') return;
    // For the candidate/resume roll-ups, wait until the rows are in —
    // scrolling to a spinner would land the user above the list once it renders.
    if ((historyPageView === 'candidates' || historyPageView === 'resumes') && loadingCandidateRows) return;

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

    // Determine view based on URL param or sessionStorage flag. `view=details`
    // is folded in here too — Match Details was never a different page, just
    // a different breadcrumb hop onto this same results view, and a couple of
    // external pages (e.g. resume-view's "back to AI Talent Match" crumb)
    // still link with `view=details`, so it stays a harmless alias rather
    // than a dead link.
    const shouldShowResults = urlView === 'results' || urlView === 'details' || showResultsOnly;
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

    /* The URL-driven effect above would normally flip viewMode to 'matching'
       itself, but it bails out immediately whenever isMatchingInProgress.current
       is set (see its guard at the top) — which this function always sets, one
       line up. Without setting it here too, callers whose current viewMode
       doesn't already render the progress panel (e.g. the version history
       list) update the URL but never actually show the panel. Reset the same
       state the effect's own 'matching' branch resets, so a run started from
       History doesn't carry over a stale selected history item or old results. */
    setSelectedHistoryItem(null);
    setSelectedCandidates([]);
    setMatchedCandidates([]);
    setMatchError(null);
    setViewMode('matching');

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

  /* Optional explicit ids so a row's ⋮ "Score Resume" can score just that one
     candidate without waiting on `setSelectedCandidates` to commit — a
     synchronous call right after that setter would otherwise still see the
     previous selection in this closure. Falls back to the current selection
     for the bulk toolbar's own "Score (n)" button. */
  const handleSubmitToScoring = async (candidateIds?: string[]) => {
    const idsToScore = candidateIds ?? selectedCandidates;
    if (idsToScore.length === 0) {
      toast.warning('Please select at least one candidate to score');
      return;
    }

    // Get the current candidates based on view mode
    const currentCandidates = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    // Get selected candidates data
    const selected = currentCandidates.filter(c => idsToScore.includes(c.id));

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
  /* Same optional-ids pattern as handleSubmitToScoring — a row's ⋮ "Invite
     Assessment" seeds this via an explicit id, not the (not-yet-committed)
     selection state. `handleProceedToInvite` below still reads
     `selectedCandidates` directly, but only fires later once the assessment
     picker modal closes, by which point that setSelectedCandidates call has
     committed. */
  const handleAssessment = async (candidateIds?: string[]) => {
    if ((candidateIds ?? selectedCandidates).length === 0) {
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

  /* Invite AI Interview — resolves this job's live (published) AI interview
     config, same lookup JobDetailView's own Scored Resumes row invite uses,
     then opens the AI Interviews module's own share modal pre-filled with
     one candidate. */
  const handleInviteAIInterview = async (seed: { name: string; email: string; resumeId?: string }[]) => {
    if (resolvingInviteConfig) return;
    const jobId = selectedJob || selectedHistoryItem?.jobId;
    if (!jobId) {
      toast.error('Job ID not found');
      return;
    }
    setAiInterviewInviteSeed(seed);
    setResolvingInviteConfig(true);
    try {
      const liveConfig = await aiInterviewService.findLiveConfigForJd(jobId);
      if (!liveConfig) {
        const draftResult = await aiInterviewService
          .listConfigs({ status: 'draft', page_size: 50, compact: true })
          .catch(() => null);
        const hasDraft = (draftResult?.items ?? []).some((c: AIInterviewResponse) => c.jd_id === jobId);
        toast.error(
          hasDraft
            ? 'This job’s AI interview is still a draft. Publish it before inviting candidates.'
            : 'No AI interview has been created for this job yet.',
          { duration: 6000 }
        );
        return;
      }
      setShareAIInterviewConfig(liveConfig);
    } catch {
      toast.error('Could not load the AI interview for this job. Please try again.');
    } finally {
      setResolvingInviteConfig(false);
    }
  };

  const getFilteredCandidates = (): MatchedCandidateWithVersions[] => {
    const candidates: MatchedCandidateWithVersions[] = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    const filtered = candidates.filter(candidate => {
      // Existing filters
      const matchesThreshold = toMatchRating(candidate.matchScore) >= filterThreshold;
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

  // A job's best candidate score, from whichever candidate list is currently
  // available for it — lazy-loaded rows once fetched, else the initial prop
  // data. Shared by the exact-match job filter below and the "Top Match
  // Rating" / "Top Matching Jobs" stats so both read the same number.
  const getJobBestScore = (item: MatchHistory): number => {
    const candidates = historyCandidatesById[item.id] ?? item.matchedCandidates ?? [];
    return candidates.reduce((best, c) => Math.max(best, c.matchScore ?? 0), 0);
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

    // "Top Matching Jobs" drill-down: same "rating 10" definition
    // `topMatchingJobsCount` counts. A job whose candidates haven't loaded yet
    // scores 0 here (see getJobBestScore) and is correctly excluded until its
    // real data arrives, rather than shown permissively.
    const matchesExactOnly = !showOnlyExactMatchJobs ||
      toMatchRating(getJobBestScore(item)) === 10;

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesMinMatches && matchesCandidateFilters && matchesExactOnly;
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
      <main className="flex-1 overflow-x-clip bg-slate-50">
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

  // View: History List
  if (viewMode === 'history') {
    const totalMatchedCandidates = matchHistory.reduce((sum, item) => sum + (item.totalMatches || 0), 0);

    // Best score per job — shared with the "Top Matching Jobs" filter above,
    // so the card's count and its drill-down list can never disagree.
    const bestScorePerJob = matchHistory.map(getJobBestScore);
    const topMatchRating = bestScorePerJob.length ? Math.max(...bestScorePerJob) : 0;
    // Exact Match = a rating of 10, same bucket the Match History popup counts.
    const topMatchingJobsCount = bestScorePerJob.filter(score => toMatchRating(score) === 10).length;

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
      const matchesScore = toMatchRating(row.bestScore) >= candidateFilterMinScore;
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

    const paginatedCandidateRows = sortedCandidateRows.slice(
      (candidateCurrentPage - 1) * candidateItemsPerPage,
      candidateCurrentPage * candidateItemsPerPage,
    );

    // "All Resumes": the same candidateRows, un-collapsed back into one row
    // per (candidate, job) match — the flat list the roll-up above dedupes
    // away. Built from candidateRows rather than a second fetch, so it shares
    // the one build both views depend on.
    const allResumeRows = candidateRows.flatMap(row =>
      row.jobs.map(job => ({ key: `${row.key}::${job.historyId}`, row, job }))
    );

    const filteredAllResumeRows = allResumeRows.filter(({ row, job }) => {
      const matchesSearch = !candidateQuery ||
        row.name?.toLowerCase().includes(candidateQuery) ||
        row.email?.toLowerCase().includes(candidateQuery) ||
        row.title?.toLowerCase().includes(candidateQuery) ||
        job.jobTitle?.toLowerCase().includes(candidateQuery);

      const matchesLocation = candidateFilterLocation === 'all' || row.location === candidateFilterLocation;
      const matchesJob = candidateFilterJob === 'all' || job.jobTitle === candidateFilterJob;
      const matchesScore = toMatchRating(job.score) >= candidateFilterMinScore;
      const matchesRatingBand = !candidateRatingBand || matchBandForRating(toMatchRating(job.score)) === candidateRatingBand;
      const matchesMultiJob = !candidateFilterMultiJob || row.jobs.length > 1;

      const matchesPhone = candidateFilterPhone === '' ||
        (!!row.phone && (
          row.phone.toLowerCase().includes(candidateFilterPhone.toLowerCase()) ||
          row.phone.replace(/[^0-9]/g, '').includes(candidateFilterPhone.replace(/[^0-9]/g, ''))
        ));

      const years = parseExperienceYears(row.experience);
      const matchesExpMin = candidateFilterExpMin === '' || (years !== null && years >= candidateFilterExpMin);
      const matchesExpMax = candidateFilterExpMax === '' || (years !== null && years <= candidateFilterExpMax);

      const matchedDay = toLocalDateKey(job.matchedAt);
      const matchesDateFrom = !candidateFilterDateFrom || matchedDay >= candidateFilterDateFrom;
      const matchesDateTo = !candidateFilterDateTo || matchedDay <= candidateFilterDateTo;

      return matchesSearch && matchesLocation && matchesJob && matchesScore && matchesRatingBand && matchesMultiJob &&
        matchesPhone && matchesExpMin && matchesExpMax && matchesDateFrom && matchesDateTo;
    });

    const sortedAllResumeRows = [...filteredAllResumeRows].sort((a, b) => {
      const direction = candidateSortOrder === 'asc' ? 1 : -1;
      if (candidateSortBy === 'name') return (a.row.name || '').localeCompare(b.row.name || '') * direction;
      if (candidateSortBy === 'date') return (new Date(a.job.matchedAt).getTime() - new Date(b.job.matchedAt).getTime()) * direction;
      // 'jobs' has no per-row meaning here (each row is already one job) —
      // falls back to score, same as the default 'score' option.
      return (a.job.score - b.job.score) * direction;
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
      <main ref={rootRef} className="flex-1 overflow-x-clip bg-slate-50">
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

        {/* Stats Cards */}
        {/* Default 4-column grid (same as /recruitment/job-openings) keeps the
            cards at the standard width instead of stretching them to half-page. */}
        <StatsCardGrid className="mb-5">
          <StatsCard
            tone="neutral"
            active={historyPageView === 'list' && !showOnlyExactMatchJobs}
            showClickArrow
            icon={History}
            label="Matched Jobs"
            value={matchHistory.length}
            sparkline={false}
            // Every matched job — drops any narrowing left by "Top Matching
            // Jobs" so this always shows the full count it displays.
            onClick={() => { setCandidateRatingBand(null); setShowOnlyExactMatchJobs(false); openHistoryListView(); }}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'candidates'}
            showClickArrow
            icon={User}
            label="Match by Candidate"
            value={totalMatchedCandidates}
            sparkline={false}
            onClick={() => { setCandidateRatingBand(null); setShowOnlyExactMatchJobs(false); void openCandidatesView(); }}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'resumes' && candidateRatingBand === matchBandForRating(toMatchRating(topMatchRating))}
            showClickArrow
            icon={Award}
            label="Top Match Rating"
            value={`${toMatchRating(topMatchRating)}`}
            sparkline={false}
            // Drills into the real candidates holding this exact rating — same
            // "All Resumes" view + rating-band filter the pills below use, so
            // there is exactly one filtering mechanism, not a second one.
            onClick={() => {
              setShowOnlyExactMatchJobs(false);
              setCandidateRatingBand(matchBandForRating(toMatchRating(topMatchRating)));
              void openAllResumesView();
            }}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'list' && showOnlyExactMatchJobs}
            showClickArrow
            icon={Briefcase}
            label="Top Matching Jobs"
            value={topMatchingJobsCount}
            sparkline={false}
            // Drills into the real jobs behind this count — View by Job,
            // narrowed to jobs whose best candidate is a perfect 10/10 (the
            // same definition the count above uses).
            onClick={() => {
              setCandidateRatingBand(null);
              setShowOnlyExactMatchJobs(true);
              openHistoryListView();
            }}
          />
        </StatsCardGrid>

        {/* View pills — same control Resume Scoring uses for its "Show:" row,
            so the two modules switch views the same way. "View by Job" and
            "View by Candidates" select what the two clickable cards above do;
            "All Resumes" has no card of its own — it's the flat, un-deduped
            counterpart to the candidate roll-up (every candidate-to-job match
            as its own row), the same relationship Resume Scoring's "All
            Resumes" pill has to its "View by Candidates" pill. The three
            rating pills continue the same row, exactly like Resume Scoring's
            Exact/Partial/No Match pills next to its own "All Resumes". */}
        {historyPageView !== 'cards' && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
            {([
              { id: 'list', label: 'View by Job', active: historyPageView === 'list' && !candidateRatingBand && !showOnlyExactMatchJobs, open: openHistoryListView },
              { id: 'candidates', label: 'View by Candidates', active: historyPageView === 'candidates' && !candidateRatingBand, open: openCandidatesView },
              { id: 'resumes', label: 'All Resumes', active: historyPageView === 'resumes' && !candidateRatingBand, open: openAllResumesView },
            ] as const).map(view => (
              <button
                key={view.id}
                type="button"
                onClick={() => { setCandidateRatingBand(null); setShowOnlyExactMatchJobs(false); void view.open(); }}
                aria-pressed={view.active}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                  view.active
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
                }`}
              >
                {view.label}
              </button>
            ))}

            {/* Rating-band filters — same toggle as "All Resumes" itself:
                clicking one narrows that view to just this band; clicking the
                active one again clears back to the unfiltered list. */}
            {([
              { id: 'exact', label: 'Rating-10' },
              { id: 'partial', label: 'Rating-9-7' },
              { id: 'no_match', label: 'Rating Below 7' },
            ] as const).map(band => (
              <button
                key={band.id}
                type="button"
                onClick={() => {
                  setCandidateRatingBand(candidateRatingBand === band.id ? null : band.id);
                  setShowOnlyExactMatchJobs(false);
                  void openAllResumesView();
                }}
                aria-pressed={candidateRatingBand === band.id}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
                  candidateRatingBand === band.id
                    ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                    : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
                }`}
              >
                {band.label}
              </button>
            ))}
          </div>
        )}

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
                        <option value={5}>5 and above</option>
                        <option value={7}>7 and above</option>
                        <option value={8}>8 and above</option>
                        <option value={9}>9 and above</option>
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
              /* Grouped table, matching Resume Scoring's grouped "View by
                 Candidates": one row per candidate (already email-deduped by
                 sortedCandidateRows), expandable to that candidate's full list
                 of job matches. Paginated the same way, via ListPagination. */
              <>
                <div className="hidden md:block rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-hidden tf-table-shell">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
                        <tr>
                          <th className="w-10 px-3 py-3" />
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Candidate</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Job Versions</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Job Titles</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Latest Matched</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                        {paginatedCandidateRows.map((row) => {
                          const isExpanded = expandedCandidateGroups.has(row.key);
                          const distinctTitles = Array.from(new Set(row.jobs.map(j => j.jobTitle).filter(Boolean))) as string[];
                          const titlesExpanded = expandedJobChips.has(row.key);
                          const hiddenTitleCount = Math.max(0, distinctTitles.length - 2);
                          const avatar = avatarColorFor(row.key);
                          const sortedJobs = [...row.jobs].sort((a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime());
                          const latestJob = sortedJobs[0];

                          return (
                            <Fragment key={row.key}>
                              <tr className="hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-3 py-4 align-top">
                                  <button
                                    onClick={() => toggleCandidateGroupExpanded(row.key)}
                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                    title={isExpanded ? 'Collapse' : 'Expand'}
                                    className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                                      isExpanded
                                        ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
                                        : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-brand-blue/30 hover:text-brand-blue'
                                    }`}
                                  >
                                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                  </button>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatar.bg} ${avatar.text}`}>
                                      {initialsFor(row.name || 'Candidate')}
                                    </div>
                                    <div className="min-w-0">
                                      <button
                                        onClick={() => openCandidateResume(row, sortedCandidateRows)}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block"
                                      >
                                        {row.name || 'Candidate'}
                                      </button>
                                      {row.email && <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{row.email}</div>}
                                      {row.phone && <div className="text-xs text-gray-500 dark:text-slate-500">{row.phone}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 whitespace-nowrap">
                                    {row.jobs.length} Job {row.jobs.length === 1 ? 'Version' : 'Versions'}
                                  </span>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="space-y-0.5">
                                    {(titlesExpanded ? distinctTitles : distinctTitles.slice(0, 2)).map((title, i) => (
                                      <div key={i} className="text-sm text-gray-700 dark:text-slate-300">{title}</div>
                                    ))}
                                    {hiddenTitleCount > 0 && (
                                      <button
                                        type="button"
                                        onClick={(e) => toggleCandidateChips(e, row.key)}
                                        title={distinctTitles.slice(2).join(', ')}
                                        className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
                                      >
                                        {titlesExpanded ? 'Show less' : `+${hiddenTitleCount} more`}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top whitespace-nowrap">
                                  <div className="text-sm text-gray-900 dark:text-slate-100">{formatISTDate(latestJob.matchedAt.toISOString())}</div>
                                  <div className="text-xs text-gray-500 dark:text-slate-500">{formatISTTime(latestJob.matchedAt.toISOString())}</div>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => openCandidateResume(row, sortedCandidateRows)}
                                      title="View Resume"
                                      className="p-2 bg-white dark:bg-slate-900 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-all border border-gray-200 dark:border-slate-700"
                                    >
                                      <Eye className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                                    </button>
                                    <button
                                      onClick={() => handleAttachmentsClick(row.best)}
                                      title="Attachments"
                                      className="p-2 bg-white dark:bg-slate-900 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-all border border-gray-200 dark:border-slate-700"
                                    >
                                      <Paperclip className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={6} className="p-0 bg-gray-50/60 dark:bg-slate-800/30">
                                    <div className="px-4 sm:px-6 py-3 overflow-x-auto">
                                      <table className="w-full min-w-[640px] table-auto">
                                        <thead>
                                          <tr className="border-b border-gray-200 dark:border-slate-700">
                                            {['Job Title', 'Match Rating', 'Matched Date', 'Action'].map(label => (
                                              <th key={label} className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                                                {label}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                          {sortedJobs.map(job => (
                                            <tr key={job.historyId} className="bg-white dark:bg-slate-900">
                                              <td className="py-2.5 px-4 align-middle text-sm text-gray-700 dark:text-slate-300">{job.jobTitle}</td>
                                              <td className="py-2.5 px-4 align-middle">
                                                <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${candidateScoreBadgeClass(job.score)}`}>
                                                  {toMatchRating(job.score)}
                                                </span>
                                              </td>
                                              <td className="py-2.5 px-4 align-middle whitespace-nowrap text-sm text-gray-700 dark:text-slate-300">
                                                {formatISTDate(job.matchedAt.toISOString())}
                                              </td>
                                              <td className="py-2.5 px-4 align-middle">
                                                <button
                                                  onClick={() => openCandidateMatch(job.historyId)}
                                                  className="text-sm font-medium text-brand-blue hover:text-brand-blue-2 hover:underline"
                                                >
                                                  Open Match
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile cards — the table is too wide below md */}
                <div className="md:hidden space-y-3">
                  {paginatedCandidateRows.map((row) => {
                    const isExpanded = expandedCandidateGroups.has(row.key);
                    const distinctTitles = Array.from(new Set(row.jobs.map(j => j.jobTitle).filter(Boolean))) as string[];
                    const titlesExpanded = expandedJobChips.has(row.key);
                    const hiddenTitleCount = Math.max(0, distinctTitles.length - 2);
                    const avatar = avatarColorFor(row.key);
                    const sortedJobs = [...row.jobs].sort((a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime());
                    const latestJob = sortedJobs[0];

                    return (
                      <div key={row.key} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
                        <div className="flex items-start gap-3 mb-2">
                          <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatar.bg} ${avatar.text}`}>
                            {initialsFor(row.name || 'Candidate')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={() => openCandidateResume(row, sortedCandidateRows)}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block truncate"
                            >
                              {row.name || 'Candidate'}
                            </button>
                            {row.email && <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{row.email}</div>}
                            {row.phone && <div className="text-xs text-gray-500 dark:text-slate-500">{row.phone}</div>}
                          </div>
                          <button
                            onClick={() => toggleCandidateGroupExpanded(row.key)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors flex-shrink-0 ${
                              isExpanded
                                ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
                                : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:border-brand-blue/30 hover:text-brand-blue'
                            }`}
                          >
                            <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 whitespace-nowrap">
                            {row.jobs.length} Job {row.jobs.length === 1 ? 'Version' : 'Versions'}
                          </span>
                        </div>

                        <div className="space-y-0.5 mb-2">
                          {(titlesExpanded ? distinctTitles : distinctTitles.slice(0, 2)).map((title, i) => (
                            <div key={i} className="text-sm text-gray-700 dark:text-slate-300">{title}</div>
                          ))}
                          {hiddenTitleCount > 0 && (
                            <button
                              type="button"
                              onClick={(e) => toggleCandidateChips(e, row.key)}
                              title={distinctTitles.slice(2).join(', ')}
                              className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
                            >
                              {titlesExpanded ? 'Show less' : `+${hiddenTitleCount} more`}
                            </button>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 dark:text-slate-500 mb-2">
                          Latest Matched: {formatISTDate(latestJob.matchedAt.toISOString())} · {formatISTTime(latestJob.matchedAt.toISOString())}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openCandidateResume(row, sortedCandidateRows)}
                            title="View Resume"
                            className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                          <button
                            onClick={() => handleAttachmentsClick(row.best)}
                            title="Attachments"
                            className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            Attachments
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 space-y-2">
                            {sortedJobs.map(job => (
                              <div key={job.historyId} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm text-gray-700 dark:text-slate-300 truncate">{job.jobTitle}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${candidateScoreBadgeClass(job.score)}`}>
                                      {toMatchRating(job.score)}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-slate-500">
                                      {formatISTDate(job.matchedAt.toISOString())}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => openCandidateMatch(job.historyId)}
                                  className="flex-shrink-0 text-sm font-medium text-brand-blue hover:text-brand-blue-2 hover:underline"
                                >
                                  Open Match
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <ListPagination
                  currentPage={candidateCurrentPage}
                  itemsPerPage={candidateItemsPerPage}
                  totalItems={sortedCandidateRows.length}
                  onPageChange={setCandidateCurrentPage}
                  onItemsPerPageChange={setCandidateItemsPerPage}
                  itemLabel="candidates"
                />
              </>
            )}
          </>
        )}

        {/* ── All Resumes (in-page) — flat, un-deduped candidate-to-job
            matches ─────────────────────────────────────────────────────── */}
        {historyPageView === 'resumes' && (
          <>
            <div ref={historyListSectionRef} className="scroll-mt-4" aria-hidden="true" />

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
              <ListToolbar
                className={showCandidateFilters ? 'mb-3' : 'mb-0'}
                searchValue={candidateSearchQuery}
                onSearchChange={candidateSearch.setQuery}
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
                    filtered={filteredAllResumeRows.length}
                    total={allResumeRows.length}
                    noun="resume"
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
                        aria-label="Sort resumes by"
                        className="appearance-none h-8 pl-3 pr-8 bg-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-brand-blue/40 text-sm font-medium text-gray-800 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="score">Match Rating</option>
                        <option value="name">Candidate Name</option>
                        <option value="date">Match Date</option>
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

              {/* Same filter panel as "View by Candidates" — one filter set
                  for both, since "All Resumes" is that view's rows un-collapsed. */}
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
                        <option value={5}>5 and above</option>
                        <option value={7}>7 and above</option>
                        <option value={8}>8 and above</option>
                        <option value={9}>9 and above</option>
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
                      <label htmlFor="resume-phone" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Mobile No</label>
                      <input
                        id="resume-phone"
                        type="text"
                        value={candidateFilterPhone}
                        onChange={(e) => candidateSearch.setFilter('phone', e.target.value)}
                        placeholder="Full or partial number"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900 placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <label htmlFor="resume-matched-from" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Last Matched From</label>
                      <input
                        id="resume-matched-from"
                        type="date"
                        value={candidateFilterDateFrom}
                        max={candidateFilterDateTo || undefined}
                        onChange={(e) => candidateSearch.setFilter('dateFrom', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label htmlFor="resume-matched-to" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Last Matched To</label>
                      <input
                        id="resume-matched-to"
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

                  <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
                    <button
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
                <span className="text-sm">Loading matched resumes...</span>
              </div>
            ) : filteredAllResumeRows.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-8 sm:p-10 text-center">
                <div className="w-12 h-12 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2">
                  {candidateFiltersApplied ? 'No resumes match your filters' : 'No matched resumes yet'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto">
                  {candidateFiltersApplied
                    ? 'Try a different name, job, location, or lower the minimum match.'
                    : 'Run AI Match on a job to see matched resumes here.'}
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
              <>
                <div className="hidden md:block min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto rounded-xl border border-gray-100 dark:border-slate-700/60 tf-table-shell">
                  <table className="w-full min-w-[1330px] table-auto">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {['Candidate Name', 'Job Title', 'Match Rating', 'Email', 'Phone', 'Location', 'Skills', 'Experience', 'Uploaded By', 'Uploaded Date', 'Attachments', 'Matched Status'].map((label) => (
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
                      {sortedAllResumeRows.map(({ key, row, job }, index) => (
                        <tr
                          key={key}
                          onClick={() => openCandidateResume(row, sortedAllResumeRows.map(entry => entry.row))}
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
                            <button
                              onClick={(e) => { e.stopPropagation(); openCandidateMatch(job.historyId); }}
                              className="block max-w-[220px] truncate text-sm text-gray-700 dark:text-slate-300 hover:text-brand-blue hover:underline text-left"
                              title={`Open ${job.jobTitle} match`}
                            >
                              {job.jobTitle}
                            </button>
                          </td>
                          <td className="py-3 px-4 align-middle whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${candidateScoreBadgeClass(job.score)}`}>
                              {toMatchRating(job.score)}
                            </span>
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
                                Matched
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-xs font-medium">
                                <XCircle className="w-3 h-3" />
                                Not Matched
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards — the table is too wide below md */}
                <div className="md:hidden space-y-3">
                  {sortedAllResumeRows.map(({ key, row, job }) => (
                    <div
                      key={key}
                      onClick={() => openCandidateResume(row, sortedAllResumeRows.map(entry => entry.row))}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-3 shadow-sm cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-blue-600 truncate">{row.name}</div>
                          <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{job.jobTitle}</div>
                        </div>
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs border flex-shrink-0 ${candidateScoreBadgeClass(job.score)}`}>
                          {toMatchRating(job.score)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-slate-400">
                        {row.email && <span className="flex items-center gap-1 min-w-0"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{row.email}</span></span>}
                        {row.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{row.phone}</span>}
                        {row.location && <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{row.location}</span></span>}
                      </div>
                    </div>
                  ))}
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg text-gray-900 dark:text-slate-50 font-medium">Matched Jobs ({filteredHistory.length})</h2>
                {/* Set by the "Top Matching Jobs" card — makes the narrowing
                    visible and reversible instead of a silent filter. */}
                {showOnlyExactMatchJobs && (
                  <button
                    type="button"
                    onClick={() => setShowOnlyExactMatchJobs(false)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 hover:bg-brand-blue/15 transition-colors"
                    title="Clear this filter"
                  >
                    <Award className="w-3 h-3" />
                    Perfect (10/10) matches only
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
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
                    openMatchResults(item, item.jobId);
                    updateUrlParams({ jdId: item.jobId, view: 'results' });
                  }}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 hover:-translate-y-0.5 transition-all duration-150 p-4 cursor-pointer group"
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* Job Info */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <div className="h-9 w-9 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {jobData?.jobId && (
                            <JobIdBadge className="inline-flex h-7 items-center flex-shrink-0">{jobData.jobId}</JobIdBadge>
                          )}
                          <h3
                            className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 truncate min-w-0 group-hover:text-brand-blue transition-colors"
                            title={item.jobTitle}
                          >
                            {item.jobTitle}
                          </h3>
                          {jobData?.currentVersion && (
                            <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs gap-1.5 border flex-shrink-0 ${
                              jobData.currentVersion > 1
                                ? 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${jobData.currentVersion > 1 ? 'bg-brand-orange' : 'bg-green-500'}`}></div>
                              {jobData.currentVersion > 1 ? 'Republished' : 'Published'}
                            </span>
                          )}
                          {jobData?.currentVersion && (
                            <span className="inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                              v{jobData.currentVersion}
                            </span>
                          )}
                          <JDVersionHistory jdId={item.jobId} version={jobData?.currentVersion} />
                          {/* Match History — every run across this job's whole
                              lineage, with the Exact/Partial/No Match roll-up
                              Resume Scoring's own History icon opens. */}
                          <button
                            onClick={(e) => { e.stopPropagation(); openMatchHistoryModal(item, historyKey); }}
                            className="inline-flex h-7 w-7 items-center justify-center p-1.5 rounded-lg border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/15 transition-colors flex-shrink-0"
                            aria-label="Match History" title="Match History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                        {jobData?.department && (
                          <span className="flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {jobData.department}
                          </span>
                        )}
                        {jobData?.industryType && (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {formatIndustryType(jobData.industryType)}
                          </span>
                        )}
                        {jobData?.location?.trim() && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {jobData.location}
                          </span>
                        )}
                        {jobData?.employmentType && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {formatEmploymentType(jobData.employmentType)}
                          </span>
                        )}
                        {jobData?.remoteType && (
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            <span className="capitalize">{jobData.remoteType}</span>
                          </span>
                        )}
                        {jobData?.postedBy && (
                          <span className="flex items-center gap-1.5">
                            <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            By {jobData.postedBy}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                          Matched {formatISTDate(item.matchedAt.toISOString())}
                        </span>
                        {/* The result gets the tinted chip, exactly as the
                            "N candidates scored" chip does on the reference. */}
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                          <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                          {item.totalMatches} {item.totalMatches === 1 ? 'candidate' : 'candidates'} matched
                        </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions — the Resume Scoring job row's arrangement: the
                        per-row action as an icon-only button on top, the version
                        toggle as a full-width primary beneath it.

                        Only ONE icon button here, where that row has two. Its
                        blue "View Progress" eye opens a scoring-run popup that
                        has no counterpart in this module, and duplicating the
                        cyan button's job just to fill the space would give the
                        row two controls that do the same thing. */}
                    <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                      <div className="flex items-center gap-1.5 self-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            userChangedView.current = true; // Prevent useEffect from resetting view
                            openMatchResults(item, item.jobId);
                            updateUrlParams({ jdId: item.jobId, view: 'results' });
                          }}
                          aria-label="View Details"
                          title="View Details"
                          className="h-9 w-9 flex items-center justify-center border border-brand-cyan/30 bg-white dark:bg-slate-900 text-brand-cyan hover:bg-brand-cyan/5 hover:border-brand-cyan/50 rounded-lg transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </div>
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
                          title={expandedHistoryJobId === historyKey ? 'Hide version history' : 'View version history'}
                          className={`px-3 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 justify-center w-full text-white ring-1 ring-white/10 ${
                            expandedHistoryJobId === historyKey
                              ? 'bg-brand-blue-2 shadow-md shadow-brand-blue/30'
                              : 'bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 hover:shadow-md hover:shadow-brand-blue/30'
                          }`}
                        >
                          {expandedHistoryJobId === historyKey ? 'Hide Versions' : 'View Versions'}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedHistoryJobId === historyKey ? 'rotate-180' : ''}`} />
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
                      {/* Same label/icon JobVersionHistoryPanel (Job Openings /
                          Resume Scoring) puts above its own version table — this
                          table renders its own rows rather than that shared
                          component, but the header stays identical so the two
                          modules' version history reads as one pattern. */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <FileText className="w-4 h-4 text-brand-blue" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Version History</p>
                      </div>
                      <AIMatchVersionHistoryTable
                        loading={loadingHistoryJobId === historyKey}
                        failed={failedHistoryJobId === historyKey}
                        versions={historyVersionsByJob[historyKey] ?? null}
                        /* Resolved per session, not per card: the rows span the
                           job's whole lineage, so each one may be a different
                           JD record with its own status. Falls back to this
                           card's job for sessions that predate `jd_id`. */
                        resolveJob={(session) => {
                          const j = jobs.find(x => x.id === (session.jd_id || item.jobId));
                          return j ? {
                            status: j.status,
                            currentVersion: j.currentVersion,
                            experience: j.experience,
                            industryType: j.industryType,
                            location: j.location,
                            employmentType: j.employmentType,
                            remoteType: j.remoteType,
                            creationMethod: j.creationMethod,
                            postedBy: j.postedBy,
                            postedDate: j.postedDate,
                          } : undefined;
                        }}
                        onRetry={() => loadAIMatchVersionHistory(historyKey, item.jobId)}
                        onViewSession={(session) => {
                          userChangedView.current = true; // Prevent useEffect from resetting view
                          // The session may belong to a different row in this
                          // job's lineage than the card it was opened from —
                          // navigate using the session's own jd_id, not this row's.
                          const targetJobId = session.jd_id || item.jobId;
                          const targetJob = jobs.find(j => j.id === targetJobId);
                          openMatchResults({
                            id: session.id,
                            jobId: targetJobId,
                            jobTitle: targetJob?.title || item.jobTitle,
                            matchedAt: new Date(session.created_at),
                            totalMatches: session.total_matches,
                            matchedCandidates: [],
                          }, targetJobId);
                          updateUrlParams({ jdId: targetJobId, view: 'results' });
                        }}
                        onRunMatch={(session) => {
                          if (!canRunAiMatch) {
                            toast.error('You do not have permission to run AI matching operations');
                            return;
                          }
                          handleRunAIMatch(session.jd_id || item.jobId);
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

      {/* Match History Modal — reference: Resume Scoring's own "Scoring
          History" popup (same header/stat-cards/close shape), adapted to AI
          Talent Match's data: sessions instead of scoring runs, a 1-10 rating
          instead of a percentage, and the existing AIMatchVersionHistoryTable
          for the body instead of a bespoke table. */}
      {matchHistoryModal && (() => {
        const { item: modalItem, historyKey: modalKey } = matchHistoryModal;
        const modalJobData = jobs.find(j => j.id === modalItem.jobId);
        const versions = historyVersionsByJob[modalKey] ?? null;
        const isLoadingModal = loadingHistoryJobId === modalKey && !versions;
        const allResults = (versions ?? []).flatMap(v => v.session.results || []);
        const ratingFor = (r: typeof allResults[number]) =>
          toMatchRating(r.final_score ?? ((r.similarity_score || 0) * 100));
        const totalMatched = (versions ?? []).reduce(
          (sum, v) => sum + (v.session.total_matches ?? (v.session.results?.length || 0)),
          0,
        );
        const exactCount = allResults.filter(r => matchBandForRating(ratingFor(r)) === 'exact').length;
        const partialCount = allResults.filter(r => matchBandForRating(ratingFor(r)) === 'partial').length;
        const noMatchCount = allResults.filter(r => matchBandForRating(ratingFor(r)) === 'no_match').length;

        const statCards: { label: string; value: number; icon: typeof FileText; iconBg: string; iconColor: string; valueColor: string }[] = [
          { label: 'Total Resumes Matched', value: totalMatched, icon: FileText, iconBg: 'bg-brand-blue/10', iconColor: 'text-brand-blue', valueColor: 'text-gray-900 dark:text-slate-50' },
          { label: '10', value: exactCount, icon: CheckCircle2, iconBg: 'bg-green-100', iconColor: 'text-green-700', valueColor: 'text-green-700' },
          { label: '9-7', value: partialCount, icon: PieChart, iconBg: 'bg-brand-orange/10', iconColor: 'text-brand-orange-deep', valueColor: 'text-brand-orange-deep' },
          { label: 'Below 7', value: noMatchCount, icon: XCircle, iconBg: 'bg-red-100', iconColor: 'text-red-600', valueColor: 'text-red-600' },
        ];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[96vw] sm:max-w-4xl max-h-[94dvh] flex flex-col tf-round-edges">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <History className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-slate-50">Match History</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-500 truncate max-w-[360px]">
                      {modalItem.jobTitle}
                      {modalJobData?.jobId && ` (${modalJobData.jobId})`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => loadAIMatchVersionHistory(modalKey, modalItem.jobId)}
                    disabled={loadingHistoryJobId === modalKey}
                    title="Fetch the latest match history"
                    aria-label="Refresh"
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${loadingHistoryJobId === modalKey ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                      {loadingHistoryJobId === modalKey ? 'Refreshing...' : 'Refresh'}
                    </span>
                  </button>
                  <button onClick={() => setMatchHistoryModal(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
                    <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto px-6 py-4 flex-1">
                {isLoadingModal ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500 dark:text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading match history...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {statCards.map(card => (
                      <div key={card.label} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`h-7 w-7 rounded-lg ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                            <card.icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
                          </div>
                          <span className="text-xs text-gray-600 dark:text-slate-400">{card.label}</span>
                        </div>
                        <div className={`text-xl font-bold ${card.valueColor}`}>{card.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                <AIMatchVersionHistoryTable
                  loading={loadingHistoryJobId === modalKey}
                  failed={failedHistoryJobId === modalKey}
                  versions={versions}
                  resolveJob={(session) => {
                    const j = jobs.find(x => x.id === (session.jd_id || modalItem.jobId));
                    return j ? {
                      status: j.status,
                      currentVersion: j.currentVersion,
                      experience: j.experience,
                      industryType: j.industryType,
                      location: j.location,
                      employmentType: j.employmentType,
                      remoteType: j.remoteType,
                      creationMethod: j.creationMethod,
                      postedBy: j.postedBy,
                      postedDate: j.postedDate,
                    } : undefined;
                  }}
                  onRetry={() => loadAIMatchVersionHistory(modalKey, modalItem.jobId)}
                  onViewSession={(session) => {
                    userChangedView.current = true; // Prevent useEffect from resetting view
                    const targetJobId = session.jd_id || modalItem.jobId;
                    const targetJob = jobs.find(j => j.id === targetJobId);
                    openMatchResults({
                      id: session.id,
                      jobId: targetJobId,
                      jobTitle: targetJob?.title || modalItem.jobTitle,
                      matchedAt: new Date(session.created_at),
                      totalMatches: session.total_matches,
                      matchedCandidates: [],
                    }, targetJobId);
                    updateUrlParams({ jdId: targetJobId, view: 'results' });
                    setMatchHistoryModal(null);
                  }}
                  onRunMatch={(session) => {
                    if (!canRunAiMatch) {
                      toast.error('You do not have permission to run AI matching operations');
                      return;
                    }
                    handleRunAIMatch(session.jd_id || modalItem.jobId);
                    setMatchHistoryModal(null);
                  }}
                />
              </div>

              <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-gray-500 dark:text-slate-500 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  Match status is based on the candidate&apos;s AI match rating (1-10 scale).
                </p>
                <button
                  onClick={() => setMatchHistoryModal(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-blue hover:bg-brand-blue-2 transition-colors shadow-sm shadow-brand-blue/25 flex-shrink-0"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Talent Match', onClick: () => setViewMode('history') },
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
                <option value={5}>5+ Rating</option>
                <option value={7}>7+ Rating</option>
                <option value={9}>9+ Rating</option>
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
                      onClick={() => handleSubmitToScoring()}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                    className={`px-3 py-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial ${
                      availableUnits !== null && selectedCandidates.length > availableUnits
                        ? 'bg-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-brand-blue hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10'
                    }`}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Score ({selectedCandidates.length})
                    </button>
                  )}
                  {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                    <button
                      onClick={() => handleAssessment()}
                      className="px-3 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 flex-1 sm:flex-initial shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
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
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
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
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
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
            <div className="border-2 border-dashed border-brand-blue/20 rounded-xl p-8 sm:p-10 text-center bg-white dark:bg-slate-900">
              <Image
                src="/ai-talent-match-empty-state.webp"
                alt="No matched candidates illustration"
                width={144}
                height={144}
                className="mb-4 h-32 w-32 object-contain mx-auto sm:h-36 sm:w-36"
              />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-50 mb-2">No AI Match Results Yet</h3>
              <p className="text-sm text-gray-600 dark:text-slate-400 max-w-md mx-auto mb-4">
                AI Talent Match has not been run for this job yet. Run AI matching to find candidates that match this job description.
              </p>
              <button
                onClick={() => {
                  if (!canRunAiMatch) {
                    toast.error('You do not have permission to run AI matching operations');
                    return;
                  }
                  handleRunAIMatch(selectedJob);
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
                Run AI Match
              </button>
            </div>
          ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
            {/* Bounded viewport so only the rows scroll — pagination below stays put. */}
            <div className="hidden md:block min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto tf-table-shell">
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
                    Job Version
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
                    Resume Version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Attachments
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Scored Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider tf-sticky-col">
                    Actions
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
                    <td className="px-4 py-3">
                      {selectedJobData?.currentVersion ? (
                        <span className="px-2 py-0.5 rounded-md font-semibold text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                          v{selectedJobData.currentVersion}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-slate-500">-</span>
                      )}
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
                      <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
                        v{candidate.resumeVersion || 1}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersionsCandidate(candidate);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {candidate.attachmentCount || 1}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      {scoredResumeIds.has(candidate.resumeId) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-800">
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
                    <td className="px-4 py-4 text-right tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Actions"
                            title="Actions"
                            className="p-1.5 bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <MoreVertical className="w-3.5 h-3.5 text-gray-600 dark:text-slate-300" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                          <DropdownMenuItem
                            className={actionsMenuItemClass}
                            onSelect={() => setPreviewResume({ id: candidate.resumeId, name: candidate.name || 'Resume' })}
                          >
                            <Eye className="w-4 h-4 text-menu-icon-view" />
                            <span className={MENU_ITEM_SCALE_CLASS}>Preview Resume</span>
                          </DropdownMenuItem>
                          {canRunScoring && (
                            <DropdownMenuItem
                              className={actionsMenuItemClass}
                              disabled={!candidate.resumeId}
                              onSelect={() => {
                                if (!candidate.resumeId) return;
                                setSelectedCandidates([candidate.id]);
                                handleSubmitToScoring([candidate.id]);
                              }}
                            >
                              <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
                            </DropdownMenuItem>
                          )}
                          {canCreateAssessments && (
                            <DropdownMenuItem
                              className={actionsMenuItemClass}
                              onSelect={() => {
                                setSelectedCandidates([candidate.id]);
                                handleAssessment([candidate.id]);
                              }}
                            >
                              <FileText className="w-4 h-4 text-menu-icon-view" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Invite Assessment</span>
                            </DropdownMenuItem>
                          )}
                          {canCreateAIInterviews && (
                            <DropdownMenuItem
                              className={actionsMenuItemClass}
                              disabled={!candidate.email || resolvingInviteConfig}
                              title={!candidate.email ? 'Candidate has no email on file' : undefined}
                              onSelect={() => {
                                if (!candidate.email) return;
                                handleInviteAIInterview([{ name: candidate.name || 'Candidate', email: candidate.email, resumeId: candidate.resumeId }]);
                              }}
                            >
                              <Video className="w-4 h-4 text-menu-icon-share" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Invite AI Interview</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Mobile cards — the table is too wide below md */}
            <div className="md:hidden space-y-3 p-3">
              {paginatedCandidates.map((candidate) => (
                <div
                  key={candidate.id}
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
                  className={`rounded-xl border p-3 shadow-sm cursor-pointer ${
                    selectedCandidates.includes(candidate.id)
                      ? 'bg-brand-blue/5 border-brand-blue/30'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.includes(candidate.id)}
                        onChange={() => handleSelectCandidate(candidate.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40 flex-shrink-0"
                      />
                      <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-xs text-brand-blue font-medium flex-shrink-0">
                        {(candidate.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-slate-50 truncate">{candidate.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-500 truncate">
                          {selectedJobData?.title || selectedHistoryItem?.jobTitle || '-'}
                        </div>
                      </div>
                    </div>
                    <div className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm flex-shrink-0 ${
                      (candidate.rank || 0) >= 9 ? 'bg-brand-blue/10 text-brand-blue border-2 border-brand-blue/30' :
                      (candidate.rank || 0) >= 7 ? 'bg-brand-cyan/10 text-brand-cyan border-2 border-brand-cyan/30' :
                      (candidate.rank || 0) >= 5 ? 'bg-brand-orange/10 text-brand-orange-deep border-2 border-brand-orange/30' :
                      'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-2 border-gray-200 dark:border-slate-700'
                    }`}>
                      {candidate.rank || '-'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-slate-400 mb-2">
                    {candidate.email && <span className="flex items-center gap-1 min-w-0"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{candidate.email}</span></span>}
                    {candidate.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{candidate.phone}</span>}
                    {candidate.location && <span className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 flex-shrink-0" /><span className="truncate">{candidate.location}</span></span>}
                    {candidate.experience && <span>{candidate.experience}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <SkillsList
                      skills={candidate.skills}
                      chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20"
                      moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium hover:bg-brand-blue/10 transition-colors cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-slate-500">
                    <span className="truncate">
                      {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                      {candidate.uploadDate && <> · {formatISTDate(candidate.uploadDate)}</>}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersionsCandidate(candidate);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-50 dark:bg-slate-800/50 text-gray-900 dark:text-slate-50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 text-xs font-medium"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        {candidate.attachmentCount || 1}
                      </button>
                      {scoredResumeIds.has(candidate.resumeId) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-800">
                          <CheckCircle className="w-3 h-3" />
                          Scored
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700">
                          <XCircle className="w-3 h-3" />
                          Not Scored
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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

      {/* Preview — opened from a row's ⋮ menu, same in-app document viewer the
          Resume Scoring module's resume-selection step uses. */}
      {previewResume && (
        <ResumeTextPreviewModal
          resumeId={previewResume.id}
          title={previewResume.name}
          subtitle={previewResume.fileName}
          onClose={() => setPreviewResume(null)}
        />
      )}

      {/* Send AI Interview via Email — opened from a row's ⋮ "Invite AI
          Interview" once its job's live config resolves. */}
      {shareAIInterviewConfig && (
        <ShareAIInterviewModal
          isOpen={!!shareAIInterviewConfig}
          onClose={() => { setShareAIInterviewConfig(null); setAiInterviewInviteSeed(null); }}
          config={shareAIInterviewConfig}
          initialCandidates={aiInterviewInviteSeed ?? undefined}
          onInviteSent={() => toast.success('AI interview invitation sent')}
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
                    <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
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
