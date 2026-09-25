'use client';

import Image from 'next/image';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Sparkles, BarChart3, Search, ChevronDown, ChevronRight, Mail, Phone, MapPin, Building2, CheckCircle, Star, User, Users, FileText, Send, TrendingUp, Clock, Calendar, Briefcase, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, AlertTriangle, PlayCircle, Paperclip, ClipboardList, XCircle, Loader2, Info, RefreshCw, PieChart, MoreVertical, Video } from 'lucide-react';
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
import { aiMatchService, MatchedCandidate, AIMatchSessionResponse } from '@/lib/services/aiMatchService';
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
import { Skeleton } from '@/components/ui/skeleton';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import { useListSearch } from '@/lib/hooks/useListSearch';
import JDVersionHistory from '@/components/JDVersionHistory';

/* Shared row for both candidate tables' ⋮ Actions menu (Preview Resume /
   Score Resume / Invite Assessment / Invite AI Interview). */
const actionsMenuItemClass = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';

/* Neutral-gray table skeleton whose columns mirror a specific matched-candidate
   table. `cols` is one width class (e.g. 'w-24') per column, in table order. */
function MatchTableSkeleton({ cols, rows = 6 }: { cols: string[]; rows?: number }) {
  const gridStyle = { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` };
  return (
    <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="overflow-x-auto">
        {/* Header */}
        <div
          className="grid gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 px-4 py-3"
          style={gridStyle}
        >
          {cols.map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="grid items-center gap-4 px-4 py-4" style={gridStyle}>
              {cols.map((_w, c) => (
                <Skeleton key={c} className="h-4" style={{ width: `${55 + ((r + c) * 7) % 40}%` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

/** A native <select> popup grows to fit its widest <option>, so a full-address
 *  location ("1234 Elm Street, Apt. 56, Springfield, IL, 62704") or a long job
 *  title blows the open dropdown past the screen edge on mobile. Clamp only the
 *  DISPLAYED label — the option's `value` stays the full string, so filtering,
 *  the selected-value display, and the `title` tooltip are all unaffected. */
function clampOptionLabel(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Exact Match = a perfect 10, Partial Match = 7-9, anything under 7 is No Match. */
function matchBandForRating(rating: number): 'exact' | 'partial' | 'no_match' {
  if (rating >= 10) return 'exact';
  if (rating >= 7) return 'partial';
  return 'no_match';
}

/**
 * Match History modal's own filter row (Search / Matched By / Version /
 * Rating Range / Date Range). Draft edits live separately from the applied
 * values so typing/picking doesn't narrow the table until Apply — Reset
 * clears both back to this. "Matched By" only ever has one real value (the
 * API carries no per-run user attribution — every match is system-triggered)
 * so its options are honest rather than inventing names.
 */
interface MatchHistoryModalFilters {
  search: string;
  matchedBy: 'all' | 'system';
  version: 'all' | number;
  rating: 'all' | 'exact' | 'partial' | 'no_match';
  dateFrom: string;
  dateTo: string;
}
const EMPTY_HISTORY_MODAL_FILTERS: MatchHistoryModalFilters = {
  search: '',
  matchedBy: 'all',
  version: 'all',
  rating: 'all',
  dateFrom: '',
  dateTo: '',
};

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
  jobs: Array<{ historyId: string; jobId: string; jobTitle: string; score: number; matchedAt: Date; resumeVersion?: number; resumeId?: string }>;
}

interface AITalentMatchPageProps {
  jobs: Job[];
  matchHistory?: MatchHistory[];
  /** Total AI match runs per job, keyed by the human JD-xxx code (not the row
   *  id — a republish forks the JD into a new row, so runs across versions
   *  share a JD code but not an id). Drives whether "View Version History"
   *  shows at all. */
  matchSessionCounts?: Record<string, number>;
  /** Tenant-wide "Top Match Rating" band counts, precomputed server-side in
   *  the same session-list call so these two stat cards render immediately
   *  instead of waiting on every session's full candidate detail. `null`
   *  while that initial call is still in flight. */
  ratingBandCounts?: { exact: number; partial: number } | null;
  /** Tenant-wide distinct-candidate count across every job's latest match
   *  session, precomputed server-side in the same session-list call so
   *  "Match by Candidate" renders immediately instead of waiting on
   *  `buildCandidateRows`'s per-job fetch-and-dedupe. `null` while that
   *  initial call is still in flight. */
  totalMatchedCandidatesCount?: number | null;
  /** Every session from the same initial /ai-match/sessions call `matchHistory`
   *  is already built from — kept raw (not collapsed to one-per-job) so "View
   *  Versions" can paint instantly from data already in memory instead of
   *  re-fetching per version. See `getOptimisticAIMatchVersions`. */
  allMatchSessions?: AIMatchSessionResponse[];
  onSaveMatch?: (data: MatchHistory) => void;
  /** Background reconciliation after a match completes — see the route's own
   *  fetchData({ silent: true }) for why this exists alongside onSaveMatch. */
  onMatchComplete?: () => void;
  onSubmitToScoring?: (jobId: string, candidateIds: string[]) => void;
  onBack?: () => void;
}

export default function AITalentMatchPage({
  jobs,
  matchHistory = [],
  matchSessionCounts = {},
  ratingBandCounts = null,
  totalMatchedCandidatesCount = null,
  allMatchSessions = [],
  onSaveMatch,
  onMatchComplete,
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
  /* Override for `handleProceedToInvite`'s recipient list — set by the "All
     Resumes" bulk Invite Assessment action, whose selection lives in
     `selectedAllResumeKeys` (a cross-job roll-up), not `selectedCandidates`
     (scoped to one job's own candidate list, which is what that function
     normally reads). `null` means "use the normal selectedCandidates path". */
  const [pendingInviteRecipients, setPendingInviteRecipients] = useState<
    { id: string; name: string; email: string; source: 'ai-match'; candidateId: string }[] | null
  >(null);


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
    { bg: 'bg-success-subtle', text: 'text-success' },
    { bg: 'bg-violet-100', text: 'text-violet-700' },
    { bg: 'bg-warning-subtle', text: 'text-warning' },
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
        // A retry that succeeds after an earlier failure — this session is no
        // longer "failed", it's loaded.
        setFailedHistorySessionIds(prev => (prev.has(item.id) ? (() => {
          const next = new Set(prev); next.delete(item.id); return next;
        })() : prev));
        return candidates;
      } catch (error) {
        console.error('[AITalentMatch] Failed to fetch session details:', error);
        if (!silent) toast.error('Failed to load matched candidates');
        setFailedHistorySessionIds(prev => (prev.has(item.id) ? prev : new Set(prev).add(item.id)));
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
    // Scored status spans every JD, so the per-JD `scoredResumeIds` set can't
    // answer it — pull the tenant-wide scored list. Started alongside the
    // session fetches (it used to run only after them, one page at a time),
    // so the roll-up waits on the slower of the two rather than their sum.
    const scoredIdsRequest = loadAllScoredResumeIds();
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
            // Same field ScoredResumesTable's own "Resume Version" column
            // reads — this candidate's resume as of THIS match, not
            // necessarily the resume's current version if it was re-uploaded
            // since.
            resumeVersion: candidate.resumeVersion,
            resumeId: candidate.resumeId,
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

      setAllScoredResumeIds(await scoredIdsRequest);
    } finally {
      setLoadingCandidateRows(false);
    }
  };

  /** Every scored resume id in the tenant. Page 1 gives the total; the
   *  remaining pages are fetched in parallel. Never rejects — an empty set just
   *  shows every row as "Not Scored". */
  const loadAllScoredResumeIds = async (): Promise<Set<string>> => {
    const PAGE_SIZE = 100;
    const ids = new Set<string>();
    const collect = (items: Array<{ resume_id?: string }> = []) =>
      items.forEach(item => { if (item.resume_id) ids.add(item.resume_id); });
    try {
      const first = await scoringService.getAllScoredResumes({ page: 1, page_size: PAGE_SIZE });
      collect(first.items);
      const pages = Math.ceil((first.total || 0) / PAGE_SIZE);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
          scoringService.getAllScoredResumes({ page: i + 2, page_size: PAGE_SIZE }))
      );
      rest.forEach(response => collect(response.items));
    } catch (error) {
      console.error('[AITalentMatch] Failed to load scored resumes for candidate roll-up:', error);
      return new Set();
    }
    return ids;
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

  // "Match by Candidate" roll-up: every matched candidate across all jobs, with
  // the jobs they matched. Built in-page — no navigation away.
  const [candidateRows, setCandidateRows] = useState<CandidateMatchRow[]>([]);
  const [loadingCandidateRows, setLoadingCandidateRows] = useState(false);

  // Rows whose job chips are expanded past the single-line "+N more" cutoff.
  const [expandedJobChips, setExpandedJobChips] = useState<Set<string>>(new Set());
  // "All Resumes" table's own row selection, keyed by the row's own
  // `${candidateKey}::${historyId}` key — local to this table (no bulk-action
  // bar wired to it yet, since none was asked for), separate from
  // `selectedCandidates` above, which belongs to the single-job flat results
  // view and is keyed on the matched-candidate record's own id instead.
  const [selectedAllResumeKeys, setSelectedAllResumeKeys] = useState<Set<string>>(new Set());
  const toggleAllResumeSelected = (key: string) => {
    setSelectedAllResumeKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Candidate roll-up filters (mirrors the job-openings "More Filters" panel)
  const [showCandidateFilters, setShowCandidateFilters] = useState(false);
  // Candidate roll-up: search + nine filters, same shared hook. Same filter
  // vocabulary as the Matched Jobs list above.
  // Pagination + row expansion for the "View by Candidates" grouped table —
  // same ListPagination control and expand-in-place pattern Resume Scoring's
  // grouped "View by Candidates" uses.
  const [candidateCurrentPage, setCandidateCurrentPage] = useState(1);
  const [candidateItemsPerPage, setCandidateItemsPerPage] = useState(20);
  // Separate page/size for the "View by Resumes" flat table — same filter
  // and sort state as "View by Candidates" above, but its own row grouping,
  // so the two views paginate independently.
  const [resumeCurrentPage, setResumeCurrentPage] = useState(1);
  const [resumeItemsPerPage, setResumeItemsPerPage] = useState(20);
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
    onChange: () => { setCandidateCurrentPage(1); setResumeCurrentPage(1); },
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
  // Shared between "View by Candidates" and "All Resumes" (incl. its rating-band
  // filters) — only one of those views is ever on screen at a time, so one flag
  // is enough and a toggle made in either view carries over to the other.
  const [matchDisplayMode, setMatchDisplayMode] = useState<ListDisplayMode>('list');

  useEffect(() => {
    setCandidateCurrentPage(1);
    setResumeCurrentPage(1);
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

  // "Score Resume" from inside the candidate roll-up's per-job list.
  // `handleSubmitToScoring` reads the job to score against off
  // `selectedJob`/`selectedHistoryItem` — page-level state this roll-up
  // itself never sets — so this points them at THIS row's job/session first,
  // resolves that session's real candidate record (for its own `id`, which
  // scoring keys on), then runs the same single-candidate scoring flow every
  // other "Score Resume" action already uses.
  const scoreJobMatchCandidate = async (job: { historyId: string; jobId: string; resumeId?: string }) => {
    const item = matchHistory.find(h => h.id === job.historyId);
    if (!item) {
      toast.error('Match session not found');
      return;
    }
    const candidates = await loadHistoryCandidates(item);
    const candidate = candidates.find(c => c.resumeId === job.resumeId);
    if (!candidate?.resumeId) {
      toast.error('Resume not found for this candidate');
      return;
    }
    setSelectedHistoryItem(item);
    setSelectedJob(item.jobId);
    await handleSubmitToScoring([candidate.id]);
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
    if (band === 'exact') return 'bg-success-subtle text-success border-success-line';
    if (band === 'partial') return 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20';
    return 'bg-destructive-subtle text-destructive border-destructive-line';
  };

  // Same three colours as candidateScoreBadgeClass, for the entered-job
  // "Matched Rating" badge — which already carries a 1-10 rank rather than a
  // raw score, so it bands directly instead of going through toMatchRating.
  const rankBadgeClass = (rank: number) => {
    const band = matchBandForRating(rank);
    if (band === 'exact') return 'bg-success-subtle text-success border-success-line';
    if (band === 'partial') return 'bg-brand-orange/10 text-brand-orange-deep border-brand-orange/20';
    return 'bg-destructive-subtle text-destructive border-destructive-line';
  };

  const clearCandidateFilters = candidateSearch.reset;

  // One clear for the whole Matched Jobs list — shared by the panel's "Reset
  // all" and the empty state's button, which used to reset only three of them.
  const clearHistoryFilters = () => {
    historySearch.reset();
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

  /**
   * Best-effort version rows for "View Versions"' FIRST paint, built entirely
   * from data already in memory — no request. `allMatchSessions` is the raw,
   * un-collapsed reply from the same /ai-match/sessions call `matchHistory`
   * itself comes from, and every field `AIMatchVersionHistoryTable` reads off
   * `session` (`total_matches`, `created_at`, `jd_id`) is already present on
   * those summary records — unlike the full hydration `loadAIMatchVersionHistory`
   * does, nothing here needs `session.results`.
   *
   * `loadAIMatchVersionHistory` still runs every time regardless (see
   * `toggleAIMatchVersionHistory`) and overwrites `historyVersionsByJob` the
   * moment it resolves — this is only ever a head start, corrected the moment
   * the authoritative, fully-hydrated fetch lands (that fetch is also what the
   * "Match History" modal's Exact/Partial/No-Match roll-up depends on, so it
   * can't be skipped, only no longer blocking this table's first paint).
   */
  const getOptimisticAIMatchVersions = (historyKey: string): AIMatchSessionVersion[] => {
    const lineageIds = new Set(jobs.filter(j => j.jobId === historyKey).map(j => j.id));
    const knownSessions = allMatchSessions.filter(s => s.jd_id && lineageIds.has(s.jd_id));
    return buildAIMatchVersions(knownSessions);
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
  // Live — every change narrows the table immediately, no Apply step. Fresh
  // on every open so a filter set for one job doesn't leak into the next.
  const [historyModalFilter, setHistoryModalFilter] = useState<MatchHistoryModalFilters>(EMPTY_HISTORY_MODAL_FILTERS);
  const openMatchHistoryModal = (item: MatchHistory, historyKey: string) => {
    setMatchHistoryModal({ item, historyKey });
    setHistoryModalFilter(EMPTY_HISTORY_MODAL_FILTERS);
    if (!historyVersionsByJob[historyKey]) void loadAIMatchVersionHistory(historyKey, item.jobId);
  };

  // Version selection for scoring (single candidate)
  const [showVersionSelectForScoring, setShowVersionSelectForScoring] = useState(false);
  const [scoringCandidate, setScoringCandidate] = useState<MatchedCandidateWithVersions | null>(null);
  const [scoringVersions, setScoringVersions] = useState<any[]>([]);
  const [historyCandidatesById, setHistoryCandidatesById] = useState<Record<string, MatchedCandidateWithVersions[]>>({});
  const [loadingHistorySessionId, setLoadingHistorySessionId] = useState<string | null>(null);
  // Sessions whose candidate fetch failed. Kept separate from
  // `historyCandidatesById` so a failure never gets cached as "0 candidates" —
  // opening that job later still retries — but "Top Match Rating"/"Top
  // Matching Jobs" (via `topStatsReady`) need to know a session is done being
  // waited on even when it errored, or a single failed fetch would leave
  // those tiles on their loading skeleton forever.
  const [failedHistorySessionIds, setFailedHistorySessionIds] = useState<Set<string>>(new Set());

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
      onMatchComplete?.();
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

    // `pendingInviteRecipients` — set by the "All Resumes" bulk Invite
    // Assessment action — already IS the final recipient list (built from a
    // cross-job selection, not `selectedCandidates`); everything below only
    // runs for the normal single-job selection path.
    const candidateData = pendingInviteRecipients ?? (() => {
      const currentCandidates = viewMode === 'results'
        ? matchedCandidates
        : getResolvedHistoryCandidates(selectedHistoryItem);
      return currentCandidates
        .filter(c => selectedCandidates.includes(c.id))
        .map((c, index) => ({
          id: `${Date.now()}-${index}`,
          name: c.name,
          email: c.email || '',
          source: 'ai-match' as const,
          candidateId: c.id
        }))
        .filter(c => c.email); // Only include candidates with email
    })();

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
      setPendingInviteRecipients(null);
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

  /* Bulk "Invite AI Interview" — the per-row entry point already builds a
     one-candidate seed itself; this is the same idea for the toolbar's
     multi-select, building the seed from every currently `selectedCandidates`
     id the same way `handleProceedToInvite` does for bulk assessments. */
  const handleBulkInviteAIInterview = () => {
    if (selectedCandidates.length === 0) {
      toast.warning('Please select at least one candidate');
      return;
    }
    const currentCandidates = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);
    const seed = currentCandidates
      .filter(c => selectedCandidates.includes(c.id))
      .map(c => ({ name: c.name, email: c.email || '', resumeId: c.resumeId }))
      .filter(c => c.email);
    if (seed.length === 0) {
      toast.error('Selected candidates must have email addresses');
      return;
    }
    void handleInviteAIInterview(seed);
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
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-brand-cyan';
    if (score >= 50) return 'text-brand-orange-deep';
    return 'text-gray-600';
  };

  const getMatchBgColor = (score: number) => {
    if (score >= 85) return 'bg-success-subtle border-success-line text-success';
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
                  <div className="w-12 h-12 bg-destructive-subtle ring-1 ring-destructive-line rounded-full flex items-center justify-center mx-auto mb-3">
                    <XCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Matching failed</h2>
                  <p className="text-sm text-gray-600 mb-4">{matchError}</p>
                  <Button variant="primary" size="md" onClick={() => selectedJob && handleRunAIMatch(selectedJob)} disabled={!selectedJob}>
                    Run AI Match
                  </Button>
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
    // "Match by Candidate" must count unique people, not resume matches — a
    // candidate re-scored across jobs (or re-uploaded under a new resumeId)
    // is one person, not several. `candidateRows` is already deduped by
    // email/name/resumeId (see buildCandidateRows), so read its length
    // instead of summing each session's `totalMatches` (which counts every
    // matched resume/version, the same inflated total "All Resumes" lists).
    // It's ready once the roll-up has finished building, or immediately if
    // every session has zero matches (nothing to build).
    //
    // Same server-computed-prop-first rule as the rating-band cards below:
    // `totalMatchedCandidatesCount` comes from the same fast /ai-match/sessions
    // call, so the stat card no longer waits on buildCandidateRows's per-job
    // fetch-and-dedupe (previously the slowest thing on this page). The old
    // client-side tally stays as a fallback for when that prop isn't
    // available, and is still what powers the roll-up table itself once
    // the tab is opened.
    const totalMatchedCandidatesReady = totalMatchedCandidatesCount !== null || (!loadingCandidateRows &&
      (candidateRows.length > 0 || matchHistory.every(item => (item.totalMatches || 0) === 0)));
    const totalMatchedCandidates = totalMatchedCandidatesCount ?? candidateRows.length;

    // Every session's candidates load in individually (in the background — see
    // the prefetch effect above), so the rating-band counts below fill in one
    // job at a time rather than all at once. Rendering the count as each one
    // lands made "Top Match Rating (10)"/"Top Match Rating (9-7)" visibly count
    // up (1, 2, 3, ...) as sessions resolved. Holding the real number back
    // until every session has resolved means the tiles show only their final,
    // correct value.
    const topStatsReady = matchHistory.every(
      item => (item.totalMatches || 0) <= 0 ||
        historyCandidatesById[item.id] !== undefined ||
        failedHistorySessionIds.has(item.id)
    );

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

    // "Top Match Rating (10)"/"Top Match Rating (9-7)" cards: how many scored
    // resumes land in each band, out of the same un-deduped rows "All Resumes"
    // itself lists — so a card's count and its drill-down list never disagree.
    // This client-side tally is only a fallback for when the server-computed
    // `ratingBandCounts` prop isn't available yet (or at all) — normally the
    // cards render straight from that prop below, without waiting on it.
    const topRatingExactCount = allResumeRows.filter(
      ({ job }) => matchBandForRating(toMatchRating(job.score)) === 'exact'
    ).length;
    const topRatingPartialCount = allResumeRows.filter(
      ({ job }) => matchBandForRating(toMatchRating(job.score)) === 'partial'
    ).length;
    const statsReady = ratingBandCounts !== null || topStatsReady;
    const displayedExactCount = ratingBandCounts?.exact ?? topRatingExactCount;
    const displayedPartialCount = ratingBandCounts?.partial ?? topRatingPartialCount;

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

    const paginatedAllResumeRows = sortedAllResumeRows.slice(
      (resumeCurrentPage - 1) * resumeItemsPerPage,
      resumeCurrentPage * resumeItemsPerPage,
    );

    // Options come from the loaded rows, so only real values are offered.
    const candidateLocations = Array.from(
      new Set(candidateRows.map(row => row.location).filter(Boolean) as string[])
    ).sort();
    const candidateJobTitles = Array.from(
      new Set(candidateRows.flatMap(row => row.jobs.map(job => job.jobTitle)).filter(Boolean))
    ).sort();

    const candidateFiltersCount = candidateSearch.activeFilterCount;
    const candidateFiltersApplied = candidateSearch.isNarrowed;

    // "All Resumes" table's own selection, resolved to the (row, job) pairs
    // it points at, then grouped by job — a resume matched against Job A
    // can only be scored, or invited to an AI interview, against Job A's own
    // session/config, never Job B's, even when both are selected together.
    const selectedAllResumeEntries = sortedAllResumeRows.filter(entry => selectedAllResumeKeys.has(entry.key));
    const selectedAllResumeJobGroups = (() => {
      const map = new Map<string, { historyId: string; jobId: string; entries: typeof selectedAllResumeEntries }>();
      selectedAllResumeEntries.forEach(entry => {
        const existing = map.get(entry.job.historyId);
        if (existing) existing.entries.push(entry);
        else map.set(entry.job.historyId, { historyId: entry.job.historyId, jobId: entry.job.jobId, entries: [entry] });
      });
      return Array.from(map.values());
    })();

    /* "Score" from the All Resumes selection — one batch per job group,
       resolving each group's real candidate records (via the same
       loadHistoryCandidates cache every other action here uses) before
       pointing handleSubmitToScoring at that job. Sequential, since
       handleSubmitToScoring reads the job to score against off page-level
       state (selectedJob/selectedHistoryItem) rather than a parameter. */
    const handleScoreSelectedAllResumes = async () => {
      if (selectedAllResumeEntries.length === 0) return;
      for (const group of selectedAllResumeJobGroups) {
        const item = matchHistory.find(h => h.id === group.historyId);
        if (!item) continue;
        const candidates = await loadHistoryCandidates(item);
        const ids = group.entries
          .map(({ job }) => candidates.find(c => c.resumeId === job.resumeId)?.id)
          .filter((id): id is string => !!id);
        if (ids.length === 0) continue;
        setSelectedHistoryItem(item);
        setSelectedJob(item.jobId);
        await handleSubmitToScoring(ids);
      }
    };

    /* "Invite Assessment" from the All Resumes selection. Assessments aren't
       tied to one job, so — unlike scoring — this can run across every
       selected row in one go: build the recipient list straight from the
       rows' own name/email/resumeId (no per-job candidate lookup needed),
       dedup by email so one person matched against several jobs gets exactly
       one invite, then hand it to handleProceedToInvite via the override
       state (its normal `selectedCandidates` path only knows one job's
       candidate list, which can't answer for a cross-job selection). */
    const handleInviteAssessmentSelectedAllResumes = () => {
      if (selectedAllResumeEntries.length === 0) return;
      const seenEmails = new Set<string>();
      const recipients = selectedAllResumeEntries
        .map(({ row }, index) => ({
          id: `${Date.now()}-${index}`,
          name: row.name || 'Candidate',
          email: row.email || '',
          source: 'ai-match' as const,
          candidateId: row.resumeId || row.key,
        }))
        .filter(r => {
          if (!r.email || seenEmails.has(r.email.toLowerCase())) return false;
          seenEmails.add(r.email.toLowerCase());
          return true;
        });
      if (recipients.length === 0) {
        toast.error('Selected candidates must have email addresses');
        return;
      }
      setPendingInviteRecipients(recipients);
      // handleAssessment only reads its argument to check "is anything
      // selected" — the real recipient list is the override just above —
      // so any non-empty placeholder satisfies that check.
      void handleAssessment(['__all_resumes_selection__']);
    };

    /* "Invite AI Interview" from the All Resumes selection — unlike
       Assessment, an AI interview config is per-JD, so a selection spanning
       more than one job has no single config to invite against; this asks
       the user to narrow to one job rather than silently inviting against
       whichever job happened to resolve first. */
    const handleInviteAIInterviewSelectedAllResumes = () => {
      if (selectedAllResumeEntries.length === 0) return;
      if (selectedAllResumeJobGroups.length > 1) {
        toast.error('AI Interview invites are per job — select candidates for one job at a time.');
        return;
      }
      const group = selectedAllResumeJobGroups[0];
      const item = matchHistory.find(h => h.id === group.historyId);
      if (item) {
        setSelectedHistoryItem(item);
        setSelectedJob(item.jobId);
      }
      const seed = group.entries
        .map(({ row, job }) => ({ name: row.name || 'Candidate', email: row.email || '', resumeId: job.resumeId }))
        .filter(c => c.email);
      if (seed.length === 0) {
        toast.error('Selected candidates must have email addresses');
        return;
      }
      void handleInviteAIInterview(seed);
    };

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
            
            <Button
              variant="primary"
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
              className="w-full sm:w-auto"
              title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run AI Match
            </Button>
          </div>
        </div>

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
            onClick={() => { setCandidateRatingBand(null); openHistoryListView(); }}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'candidates'}
            showClickArrow
            icon={User}
            label="Match by Candidate"
            value={totalMatchedCandidatesReady ? totalMatchedCandidates : (
              <span className="inline-block h-6 w-8 bg-gray-100 dark:bg-slate-800 rounded animate-pulse align-middle" aria-label="Loading" />
            )}
            sparkline={false}
            onClick={() => { setCandidateRatingBand(null); void openCandidatesView(); }}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'resumes' && candidateRatingBand === 'exact'}
            showClickArrow
            icon={CheckCircle2}
            label="Match Rating (10)"
            // Renders straight from the server-computed `ratingBandCounts` prop
            // (available from the same fast session-list call as the other two
            // cards); only falls back to the slower per-session tally + its
            // "wait for every session" gate (`statsReady`) if that prop is
            // unavailable, so the skeleton is no longer the common case.
            value={statsReady ? displayedExactCount : (
              <span className="inline-block h-6 w-8 bg-gray-100 dark:bg-slate-800 rounded animate-pulse align-middle" aria-label="Loading" />
            )}
            sparkline={false}
            // Drills into the real scored resumes holding this rating — same
            // "All Resumes" view + rating-band filter the pills below use, so
            // there is exactly one filtering mechanism, not a second one.
            onClick={() => {
              setCandidateRatingBand('exact');
              void openAllResumesView();
            }}
          />
          <StatsCard
            tone="neutral"
            active={historyPageView === 'resumes' && candidateRatingBand === 'partial'}
            showClickArrow
            icon={PieChart}
            label="Match Rating (9-7)"
            // Same server-computed-prop-first rule as the 10-band card above.
            value={statsReady ? displayedPartialCount : (
              <span className="inline-block h-6 w-8 bg-gray-100 dark:bg-slate-800 rounded animate-pulse align-middle" aria-label="Loading" />
            )}
            sparkline={false}
            onClick={() => {
              setCandidateRatingBand('partial');
              void openAllResumesView();
            }}
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

              {/* View pills — merged into this same toolbar card, right after
                  the search row and before the expanded filter panel, the
                  same order Job Openings uses for its own "Show:" row — one
                  bordered card rather than two stacked ones. Same control
                  Resume Scoring uses for its "Show:" row, so the two modules
                  switch views the same way — one copy per view (list/
                  candidates/resumes) since each has its own toolbar card to
                  merge into, rather than one copy shared above all three.
                  "View by Job" and "View by Candidates" select what the two
                  clickable cards higher up the page do; "All Resumes" has no
                  card of its own — it's the flat, un-deduped counterpart to
                  the candidate roll-up (every candidate-to-job match as its
                  own row), the same relationship Resume Scoring's "All
                  Resumes" pill has to its "View by Candidates" pill. The
                  three rating pills continue the same row, exactly like
                  Resume Scoring's Exact/Partial/No Match pills next to its
                  own "All Resumes". */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
                {([
                  /* This copy renders only while historyPageView === 'candidates'
                     (its enclosing branch), which TS then narrows to that one
                     literal — comparing it against the other two here would be
                     flagged as an impossible comparison, so those two are
                     simply false rather than re-testing what the branch already
                     guarantees. */
                  { id: 'list', label: 'View by Job', active: false, open: openHistoryListView },
                  { id: 'candidates', label: 'View by Candidates', active: !candidateRatingBand, open: openCandidatesView },
                  { id: 'resumes', label: 'All Resumes', active: false, open: openAllResumesView },
                ] as const).map(view => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => { setCandidateRatingBand(null); void view.open(); }}
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
                    clicking one narrows that view to just this band; clicking
                    the active one again clears back to the unfiltered list. */}
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
                            <option key={loc} value={loc} title={loc}>{clampOptionLabel(loc)}</option>
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
                            <option key={title} value={title} title={title}>{clampOptionLabel(title)}</option>
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
                    <Button
                      // The controls above commit as they change, so Done just closes.
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowCandidateFilters(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {loadingCandidateRows ? (
              /* View by Candidates: expand, Candidate, Job Versions, Job Titles,
                 Latest Matched, Actions. */
              <MatchTableSkeleton cols={['w-6', 'w-32', 'w-24', 'w-28', 'w-24', 'w-16']} />
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
                  <Button variant="secondary" size="sm" onClick={clearCandidateFilters} className="mt-4">
                    Clear filters
                  </Button>
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
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => openCandidateResume(row, sortedCandidateRows)}
                                      title="View Resume"
                                      aria-label="View Resume"
                                      className="px-2"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleAttachmentsClick(row.best)}
                                      title="Attachments"
                                      aria-label="Attachments"
                                      className="px-2"
                                    >
                                      <Paperclip className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={6} className="p-0 bg-gray-50/60 dark:bg-slate-800/30">
                                    <div className="px-4 sm:px-6 py-3 overflow-x-auto">
                                      <table className="w-full min-w-[720px] table-auto">
                                        <thead>
                                          <tr className="border-b border-gray-200 dark:border-slate-700">
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap tf-sticky-col-left">Match Rating</th>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Job Title</th>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Job Version</th>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Matched By / Date</th>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Resume Version</th>
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap tf-sticky-col">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                          {sortedJobs.map(job => {
                                            // The AI Match session has no "run by" field anywhere in the
                                            // API (unlike resume scoring, which does) — 'System' names that
                                            // honestly rather than guessing a person.
                                            const jobVersion = jobs.find(j => j.id === job.jobId)?.currentVersion;
                                            return (
                                              <tr key={job.historyId} className="bg-white dark:bg-slate-900">
                                                <td className="py-2.5 px-4 align-middle tf-sticky-col-left">
                                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${candidateScoreBadgeClass(job.score)}`}>
                                                    {toMatchRating(job.score)}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle text-sm text-gray-700 dark:text-slate-300">{job.jobTitle}</td>
                                                <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30">
                                                    v{jobVersion ?? 1}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                                                  <div className="text-sm text-gray-700 dark:text-slate-300">System</div>
                                                  <div className="text-xs text-gray-500 dark:text-slate-500">
                                                    {formatISTDate(job.matchedAt.toISOString())} · {formatISTTime(job.matchedAt.toISOString())}
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                                                  <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                                                    v{job.resumeVersion ?? 1}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
                                                    <DropdownMenuContent align="end" className="w-48 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                                      <DropdownMenuItem
                                                        className={actionsMenuItemClass}
                                                        disabled={!job.resumeId}
                                                        onSelect={() => job.resumeId && setPreviewResume({ id: job.resumeId, name: row.name || 'Resume' })}
                                                      >
                                                        <Eye className="w-4 h-4 text-menu-icon-view" />
                                                        <span className={MENU_ITEM_SCALE_CLASS}>Preview Resume</span>
                                                      </DropdownMenuItem>
                                                      {canRunScoring && (
                                                        <DropdownMenuItem
                                                          className={actionsMenuItemClass}
                                                          disabled={!job.resumeId}
                                                          onSelect={() => { void scoreJobMatchCandidate(job); }}
                                                        >
                                                          <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                                                          <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
                                                        </DropdownMenuItem>
                                                      )}
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                </td>
                                              </tr>
                                            );
                                          })}
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openCandidateResume(row, sortedCandidateRows)}
                            title="View Resume"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAttachmentsClick(row.best)}
                            title="Attachments"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            Attachments
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 space-y-2">
                            {sortedJobs.map(job => (
                              <div key={job.historyId} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm text-gray-700 dark:text-slate-300 truncate">{job.jobTitle}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${candidateScoreBadgeClass(job.score)}`}>
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

              {/* View pills — merged into this same toolbar card; see the
                  "candidates" view's own copy for why this is duplicated per
                  view rather than shared. This copy also carries Score/Invite
                  for the table's checkbox selection — the only one of the
                  three sub-views that has a selection at all — sitting at the
                  row's right end via ml-auto, same treatment the single-job
                  results toolbar's own Score/Invite group uses. */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
                {([
                  // This copy renders only while historyPageView === 'resumes' —
                  // see the "candidates" copy's comment for why the other two
                  // are hardcoded false rather than re-tested here.
                  { id: 'list', label: 'View by Job', active: false, open: openHistoryListView },
                  { id: 'candidates', label: 'View by Candidates', active: false, open: openCandidatesView },
                  { id: 'resumes', label: 'All Resumes', active: !candidateRatingBand, open: openAllResumesView },
                ] as const).map(view => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => { setCandidateRatingBand(null); void view.open(); }}
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

                {selectedAllResumeEntries.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {canRunScoring && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { void handleScoreSelectedAllResumes(); }}
                        icon={<ClipboardList className="w-3.5 h-3.5" />}
                      >
                        Score ({selectedAllResumeEntries.length})
                      </Button>
                    )}
                    {(hasPermission('canCreateAssessments') || isTenantAdmin || canCreateAIInterviews) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="primary" size="sm" icon={<Send className="w-3.5 h-3.5" />}>
                            Invite ({selectedAllResumeEntries.length})
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                          {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                            <DropdownMenuItem className={actionsMenuItemClass} onSelect={handleInviteAssessmentSelectedAllResumes}>
                              <BarChart3 className="w-4 h-4 text-menu-icon-score" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Invite Assessment</span>
                            </DropdownMenuItem>
                          )}
                          {canCreateAIInterviews && (
                            <DropdownMenuItem className={actionsMenuItemClass} onSelect={handleInviteAIInterviewSelectedAllResumes}>
                              <Video className="w-4 h-4 text-menu-icon-view" />
                              <span className={MENU_ITEM_SCALE_CLASS}>Invite AI Interview</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}

                <ListViewToggle value={matchDisplayMode} onChange={setMatchDisplayMode} className="ml-auto" />
              </div>

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
                            <option key={loc} value={loc} title={loc}>{clampOptionLabel(loc)}</option>
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
                            <option key={title} value={title} title={title}>{clampOptionLabel(title)}</option>
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
                    <Button variant="secondary" size="sm" onClick={() => setShowCandidateFilters(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {loadingCandidateRows ? (
              /* All Resumes table: select, Match Rating, Candidate Name, Job
                 Title, Email, Phone, Location, Skills, Experience, Uploaded By,
                 Uploaded Date, Resume Version, Attachments, Scored Status,
                 Actions. */
              <MatchTableSkeleton
                cols={['w-6', 'w-20', 'w-28', 'w-24', 'w-28', 'w-20', 'w-20', 'w-24', 'w-16', 'w-24', 'w-20', 'w-20', 'w-16', 'w-20', 'w-16']}
              />
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
                  <Button variant="secondary" size="sm" onClick={clearCandidateFilters} className="mt-4">
                    Clear filters
                  </Button>
                )}
              </div>
            ) : matchDisplayMode === 'grid' ? (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedAllResumeRows.map(({ key, row, job }) => {
                  const scored = row.resumeId ? allScoredResumeIds.has(row.resumeId) : false;
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCandidateResume(row, sortedAllResumeRows.map(entry => entry.row))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openCandidateResume(row, sortedAllResumeRows.map(entry => entry.row));
                        }
                      }}
                      className="text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 cursor-pointer"
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name || 'candidate'}`}
                          checked={selectedAllResumeKeys.has(key)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleAllResumeSelected(key)}
                          className="mt-1.5 flex-shrink-0"
                        />
                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center text-xs text-gray-700 dark:text-slate-300 font-medium flex-shrink-0">
                          {(row.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-slate-50 truncate">{row.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{row.email || '—'}</p>
                        </div>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border flex-shrink-0 ${candidateScoreBadgeClass(job.score)}`}>
                          {toMatchRating(job.score)}
                        </span>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); openCandidateMatch(job.historyId); }}
                        className="text-xs text-gray-600 dark:text-slate-400 hover:text-brand-blue hover:underline truncate text-left"
                        title={`Open ${job.jobTitle} match`}
                      >
                        {job.jobTitle}
                      </button>

                      <div className="flex flex-wrap gap-1">
                        <SkillsList
                          skills={row.best.skills}
                          chipClassName="inline-flex items-center px-2 py-0.5 rounded-full text-2xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 whitespace-nowrap"
                          moreClassName="inline-flex items-center px-2 py-0.5 rounded-full text-2xs text-brand-blue font-medium whitespace-nowrap hover:bg-brand-blue/10 transition-colors cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {scored ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success-subtle text-success rounded-full text-2xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Scored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 rounded-full text-2xs font-medium">
                            <XCircle className="w-3 h-3" />
                            Not Scored
                          </span>
                        )}
                        {row.location && (
                          <span className="text-2xs text-gray-500 dark:text-slate-500 truncate">{row.location}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-500 pt-2 border-t border-gray-100 dark:border-slate-800">
                        <span>{row.experience || '—'}</span>
                        <div
                          onClick={(e) => { e.stopPropagation(); handleAttachmentsClick(row.best); }}
                          className="inline-flex items-center gap-1 hover:text-brand-blue transition-colors"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {row.best.attachmentCount || 1}
                        </div>
                      </div>

                      <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                        View Details
                      </div>
                    </div>
                  );
                })}
              </div>

              <ListPagination
                currentPage={resumeCurrentPage}
                itemsPerPage={resumeItemsPerPage}
                totalItems={sortedAllResumeRows.length}
                onPageChange={setResumeCurrentPage}
                onItemsPerPageChange={setResumeItemsPerPage}
                itemLabel="resumes"
              />
              </>
            ) : (
              <>
                <div className="hidden md:block min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto rounded-xl border border-gray-100 dark:border-slate-700/60 tf-table-shell">
                  <table className="w-full min-w-[1400px] table-auto">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        {/* Select + Match Rating stack as TWO sticky-left columns —
                            the shared `tf-sticky-col-left` class alone can't do this
                            (it always pins to `left: 0`, so a second copy would sit
                            on top of the first instead of beside it), so Match
                            Rating gets its own explicit offset equal to this
                            checkbox column's fixed width instead. */}
                        <th className="w-12 px-3 py-3 align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky left-0 z-[8]">
                          <input
                            type="checkbox"
                            aria-label="Select all"
                            checked={sortedAllResumeRows.length > 0 && selectedAllResumeKeys.size === sortedAllResumeRows.length}
                            onChange={(e) => {
                              setSelectedAllResumeKeys(e.target.checked ? new Set(sortedAllResumeRows.map(r => r.key)) : new Set());
                            }}
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky left-12 z-[8] shadow-[1px_0_0_0_var(--border)]">
                          Match Rating
                        </th>
                        {['Candidate Name', 'Job Title', 'Email', 'Phone', 'Location', 'Skills', 'Experience', 'Uploaded By', 'Uploaded Date', 'Resume Version', 'Attachments', 'Scored Status'].map((label) => (
                          <th
                            key={label}
                            className="text-left py-3 px-4 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700"
                          >
                            {label}
                          </th>
                        ))}
                        <th className="text-left py-3 px-4 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 tf-sticky-col">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAllResumeRows.map(({ key, row, job }, index) => (
                        <tr
                          key={key}
                          onClick={() => openCandidateResume(row, sortedAllResumeRows.map(entry => entry.row))}
                          className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                            index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50 dark:bg-slate-800/30'
                          }`}
                        >
                          <td
                            className={`py-3 px-4 align-middle whitespace-nowrap sticky left-0 z-[5] ${
                              index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.name || 'candidate'}`}
                              checked={selectedAllResumeKeys.has(key)}
                              onChange={() => toggleAllResumeSelected(key)}
                            />
                          </td>
                          <td
                            className={`py-3 px-4 align-middle whitespace-nowrap sticky left-12 z-[5] shadow-[1px_0_0_0_var(--border)] ${
                              index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800'
                            }`}
                          >
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${candidateScoreBadgeClass(job.score)}`}>
                              {toMatchRating(job.score)}
                            </span>
                          </td>
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
                            <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                              v{job.resumeVersion ?? 1}
                            </span>
                          </td>
                          <td className="py-3 px-4 align-middle whitespace-nowrap">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleAttachmentsClick(row.best); }}
                              title="Attachments"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              {row.best.attachmentCount || 1}
                            </Button>
                          </td>
                          <td className="py-3 px-4 align-middle whitespace-nowrap">
                            {row.resumeId && allScoredResumeIds.has(row.resumeId) ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success-subtle text-success rounded-full text-xs font-medium">
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
                          <td className="py-3 px-4 align-middle whitespace-nowrap tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
                              <DropdownMenuContent align="end" className="w-48 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                <DropdownMenuItem
                                  className={actionsMenuItemClass}
                                  disabled={!job.resumeId}
                                  onSelect={() => job.resumeId && setPreviewResume({ id: job.resumeId, name: row.name || 'Resume' })}
                                >
                                  <Eye className="w-4 h-4 text-menu-icon-view" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>Preview Resume</span>
                                </DropdownMenuItem>
                                {canRunScoring && (
                                  <DropdownMenuItem
                                    className={actionsMenuItemClass}
                                    disabled={!job.resumeId}
                                    onSelect={() => { void scoreJobMatchCandidate(job); }}
                                  >
                                    <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                                    <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
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
                <div className="md:hidden space-y-3">
                  {paginatedAllResumeRows.map(({ key, row, job }) => (
                    <div
                      key={key}
                      onClick={() => openCandidateResume(row, sortedAllResumeRows.map(entry => entry.row))}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-3 shadow-sm cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {/* Select — the same per-row checkbox the grid cards and
                              the desktop table have, so a resume can be picked for
                              bulk score/invite from the list view on mobile too. */}
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.name || 'candidate'}`}
                            checked={selectedAllResumeKeys.has(key)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleAllResumeSelected(key)}
                            className="mt-0.5 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-blue-600 truncate">{row.name}</div>
                            <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{job.jobTitle}</div>
                          </div>
                        </div>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border flex-shrink-0 ${candidateScoreBadgeClass(job.score)}`}>
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

                <ListPagination
                  currentPage={resumeCurrentPage}
                  itemsPerPage={resumeItemsPerPage}
                  totalItems={sortedAllResumeRows.length}
                  onPageChange={setResumeCurrentPage}
                  onItemsPerPageChange={setResumeItemsPerPage}
                  itemLabel="resumes"
                />
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

          {/* View pills — merged into this same toolbar card; see the
              "candidates" view's own copy for why this is duplicated per
              view rather than shared. */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-sm text-gray-600 dark:text-slate-400">Show:</span>
            {([
              // This copy renders only while historyPageView === 'list' — see
              // the "candidates" copy's comment for why the other two are
              // hardcoded false rather than re-tested here.
              { id: 'list', label: 'View by Job', active: !candidateRatingBand, open: openHistoryListView },
              { id: 'candidates', label: 'View by Candidates', active: false, open: openCandidatesView },
              { id: 'resumes', label: 'All Resumes', active: false, open: openAllResumesView },
            ] as const).map(view => (
              <button
                key={view.id}
                type="button"
                onClick={() => { setCandidateRatingBand(null); void view.open(); }}
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
                <Button
                  // The controls above commit as they change, so Done just closes.
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowHistoryFilters(false)}
                >
                  Done
                </Button>
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
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400">Click any job to view matched candidates</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {sortedHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage).map((item) => {
              const jobData = jobs.find(j => j.id === item.jobId);
              // Version history is cached/keyed by the human JD-xxx code, not
              // this row's id — every republished version of the same job
              // shares one history key so their runs aren't split across cards.
              const historyKey = jobData?.jobId || item.jobId;
              // The real, fully-hydrated versions once loadAIMatchVersionHistory
              // lands; an instant, data-already-in-memory guess until then — see
              // getOptimisticAIMatchVersions's own doc comment.
              const displayedHistoryVersions = historyVersionsByJob[historyKey] ?? getOptimisticAIMatchVersions(historyKey);
              const hasHistoryVersionsToShow = !!historyVersionsByJob[historyKey] || displayedHistoryVersions.length > 0;

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
                                : 'bg-success-subtle text-success border-success-line'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${jobData.currentVersion > 1 ? 'bg-brand-orange' : 'bg-success'}`}></div>
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openMatchHistoryModal(item, historyKey); }}
                            className="px-2 flex-shrink-0"
                            aria-label="Match History" title="Match History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </Button>
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
                        {/* A run that found nobody still counts as a matched job
                            (it was matched — the result was empty), so it stays
                            listed; it just says so instead of "0 candidates matched". */}
                        {item.totalMatches > 0 ? (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                            <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                            {item.totalMatches} {item.totalMatches === 1 ? 'candidate' : 'candidates'} matched
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-warning-subtle text-warning ring-1 ring-warning-line rounded-lg">
                            <AlertCircle className="w-4 h-4" />
                            No candidates matched
                          </span>
                        )}
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
                        loading={!hasHistoryVersionsToShow && loadingHistoryJobId === historyKey}
                        /* A background hydration failure (fetching the fully
                           accurate version) must not blank out a perfectly good
                           optimistic table already on screen — only shown when
                           there is nothing else to fall back on. */
                        failed={failedHistoryJobId === historyKey && !hasHistoryVersionsToShow}
                        versions={hasHistoryVersionsToShow ? displayedHistoryVersions : null}
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
              <Button
                variant="primary"
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
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Run AI Match Now
              </Button>
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
              <Button variant="secondary" size="md" onClick={clearHistoryFilters} icon={<X className="w-4 h-4" />}>
                Clear All Filters
              </Button>
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

      {/* Match History Modal — reference: the mocked-up "AI Talent Match
          History" design (stat cards, filter row, Rating Breakdown columns,
          a Rating Distribution + Latest Run Summary sidebar) adapted to this
          data: sessions instead of scoring runs, a 1-10 rating instead of a
          percentage. "Matched By" always reads System — the API carries no
          per-run user attribution, so that column states the honest single
          value rather than inventing a name. A bespoke table replaces
          AIMatchVersionHistoryTable here (still used, unchanged, by "View
          Versions" elsewhere) since the column set genuinely differs. */}
      {matchHistoryModal && (() => {
        const { item: modalItem, historyKey: modalKey } = matchHistoryModal;
        const modalJobData = jobs.find(j => j.id === modalItem.jobId);
        const versions = historyVersionsByJob[modalKey] ?? null;
        const isLoadingModal = loadingHistoryJobId === modalKey && !versions;
        const versionList = versions ?? [];
        const allResults = versionList.flatMap(v => v.session.results || []);
        const ratingFor = (r: typeof allResults[number]) =>
          toMatchRating(r.final_score ?? ((r.similarity_score || 0) * 100));
        const totalMatched = versionList.reduce(
          (sum, v) => sum + (v.session.total_matches ?? (v.session.results?.length || 0)),
          0,
        );
        const exactCount = allResults.filter(r => matchBandForRating(ratingFor(r)) === 'exact').length;
        const partialCount = allResults.filter(r => matchBandForRating(ratingFor(r)) === 'partial').length;
        const noMatchCount = allResults.filter(r => matchBandForRating(ratingFor(r)) === 'no_match').length;

        const statCards: { label: string; value: number; icon: typeof FileText; iconBg: string; iconColor: string; valueColor: string }[] = [
          { label: 'Total Candidates Matched', value: totalMatched, icon: FileText, iconBg: 'bg-brand-blue/10', iconColor: 'text-brand-blue', valueColor: 'text-gray-900 dark:text-slate-50' },
          { label: 'Rating 10', value: exactCount, icon: Star, iconBg: 'bg-success-subtle', iconColor: 'text-success', valueColor: 'text-success' },
          { label: 'Rating 9 – 7', value: partialCount, icon: Users, iconBg: 'bg-brand-orange/10', iconColor: 'text-brand-orange-deep', valueColor: 'text-brand-orange-deep' },
          { label: 'Rating Below 7', value: noMatchCount, icon: AlertCircle, iconBg: 'bg-destructive-subtle', iconColor: 'text-destructive', valueColor: 'text-destructive' },
        ];

        // One row per version, with its own Rating Breakdown — computed once
        // so the table and the Version filter's options read the same data.
        const versionRows = versionList.map(version => {
          const results = version.session.results || [];
          const v10 = results.filter(r => matchBandForRating(ratingFor(r)) === 'exact').length;
          const v9to7 = results.filter(r => matchBandForRating(ratingFor(r)) === 'partial').length;
          const vBelow7 = results.filter(r => matchBandForRating(ratingFor(r)) === 'no_match').length;
          const candidateCount = results.length || version.session.total_matches || 0;
          return { version, v10, v9to7, vBelow7, candidateCount };
        });

        const searchTerm = historyModalFilter.search.trim().toLowerCase();
        const filteredVersionRows = versionRows.filter(({ version, v10, v9to7, vBelow7 }) => {
          const f = historyModalFilter;
          const matchesSearch = !searchTerm || (version.session.results || []).some(r =>
            r.candidate_name?.toLowerCase().includes(searchTerm)
          );
          const matchesVersion = f.version === 'all' || f.version === version.versionNumber;
          const matchesRating = f.rating === 'all' ||
            (f.rating === 'exact' && v10 > 0) ||
            (f.rating === 'partial' && v9to7 > 0) ||
            (f.rating === 'no_match' && vBelow7 > 0);
          const lastMatchedDay = version.lastMatchedAt ? version.lastMatchedAt.slice(0, 10) : '';
          const matchesDateFrom = !f.dateFrom || (!!lastMatchedDay && lastMatchedDay >= f.dateFrom);
          const matchesDateTo = !f.dateTo || (!!lastMatchedDay && lastMatchedDay <= f.dateTo);
          // matchedBy has one real value today, so it never narrows anything.
          return matchesSearch && matchesVersion && matchesRating && matchesDateFrom && matchesDateTo;
        });

        const isHistoryModalFilterActive =
          historyModalFilter.search.trim() !== '' ||
          historyModalFilter.matchedBy !== 'all' ||
          historyModalFilter.version !== 'all' ||
          historyModalFilter.rating !== 'all' ||
          historyModalFilter.dateFrom !== '' ||
          historyModalFilter.dateTo !== '';
        const resetModalFilters = () => setHistoryModalFilter(EMPTY_HISTORY_MODAL_FILTERS);
        const filterInputClass = 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black dark:text-slate-100 bg-white dark:bg-slate-900';
        const filterLabelClass = 'block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1';

        const distributionRows: { label: string; value: number; barClass: string; textClass: string }[] = [
          { label: 'Rating 10', value: exactCount, barClass: 'bg-success', textClass: 'text-success' },
          { label: 'Rating 9 – 7', value: partialCount, barClass: 'bg-brand-orange', textClass: 'text-brand-orange-deep' },
          { label: 'Below 7', value: noMatchCount, barClass: 'bg-destructive', textClass: 'text-destructive' },
        ];

        // Single action: jump straight to this version's match results — no
        // dropdown, so the Action column reads the same one-click way as the
        // rest of the app's history tables.
        const renderVersionActions = (session: AIMatchSessionVersion['session']) => (
          <button
            type="button"
            onClick={() => {
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
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
            aria-label="View match results"
            title="View match results"
          >
            <Eye className="w-4 h-4" />
          </button>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[96vw] xl:max-w-6xl h-[85dvh] flex flex-col tf-round-edges">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <History className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-slate-50">AI Talent Match History</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-500 truncate max-w-[360px]">
                      {modalItem.jobTitle}
                      {modalJobData?.jobId && ` (${modalJobData.jobId})`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadAIMatchVersionHistory(modalKey, modalItem.jobId)}
                    disabled={loadingHistoryJobId === modalKey}
                    title="Fetch the latest match history"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${loadingHistoryJobId === modalKey ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline-block min-w-[5.5rem] text-left">
                      {loadingHistoryJobId === modalKey ? 'Refreshing...' : 'Refresh'}
                    </span>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setMatchHistoryModal(null)} className="px-2" aria-label="Close">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="overflow-y-auto px-4 sm:px-6 py-4 flex-1">
                {isLoadingModal ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Skeleton className="h-7 w-7 rounded-lg" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                          <Skeleton className="h-6 w-12" />
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 mb-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:overflow-x-auto py-1 -my-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="flex-1 min-w-[8rem] space-y-1.5">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-9 w-full rounded-lg" />
                          </div>
                        ))}
                        <Skeleton className="h-9 w-9 rounded-lg" />
                      </div>
                    </div>
                    {/* Version history: Version, Matched By, Date, Candidates,
                        Rating (10 / 9-7 / Below 7), Status, Action. */}
                    <MatchTableSkeleton
                      cols={['w-16', 'w-24', 'w-20', 'w-16', 'w-10', 'w-10', 'w-10', 'w-16', 'w-16']}
                    />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
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

                    {/* Filter row — Search/Matched By/Version/Rating Range/Date
                        Range narrow the table below live, as each one changes
                        — no Apply step. Always one line: Search/Matched By/
                        Version/Rating Range stretch (flex-1) to fill the row's
                        width with no dead space, while Date Range and Reset
                        stay fixed-width on the right; the row scrolls
                        horizontally on its own rather than breaking onto a
                        second line if it's ever narrower than the fields'
                        combined min-width. Reset only appears once some field
                        is actually narrowing the table, so the row doesn't
                        carry a control with nothing to undo. */}
                    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 mb-3">
                      {/* py-1 -my-1: a horizontally-scrolling flex row forces
                          its overflow-y to `auto` as well (CSS overflow rule:
                          one axis non-visible pulls the other off `visible`
                          too), which otherwise clips every field's focus ring
                          and the Reset pill's border right at this row's own
                          top/bottom edge. The padding pushes that clip
                          boundary out past them; the matching negative margin
                          cancels the padding's effect on layout, so the row's
                          rendered position is unchanged. */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:overflow-x-auto py-1 -my-1">
                        <div className="flex-1 min-w-[11rem]">
                          <label className={filterLabelClass}>Search</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                            <input
                              type="text"
                              value={historyModalFilter.search}
                              onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, search: e.target.value }))}
                              placeholder="Search by candidate name..."
                              className={`${filterInputClass} pl-9 w-full`}
                            />
                          </div>
                        </div>
                        <div className="flex-1 min-w-[8rem]">
                          <label className={filterLabelClass}>Matched By</label>
                          <select
                            value={historyModalFilter.matchedBy}
                            onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, matchedBy: e.target.value as MatchHistoryModalFilters['matchedBy'] }))}
                            className={`${filterInputClass} w-full`}
                          >
                            <option value="all">All Sources</option>
                            <option value="system">System</option>
                          </select>
                        </div>
                        <div className="flex-1 min-w-[7rem]">
                          <label className={filterLabelClass}>Version</label>
                          <select
                            value={historyModalFilter.version === 'all' ? 'all' : String(historyModalFilter.version)}
                            onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, version: e.target.value === 'all' ? 'all' : Number(e.target.value) }))}
                            className={`${filterInputClass} w-full`}
                          >
                            <option value="all">All Versions</option>
                            {versionList.map(v => (
                              <option key={v.versionNumber} value={v.versionNumber}>v{v.versionNumber}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[9rem]">
                          <label className={filterLabelClass}>Rating Range</label>
                          <select
                            value={historyModalFilter.rating}
                            onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, rating: e.target.value as MatchHistoryModalFilters['rating'] }))}
                            className={`${filterInputClass} w-full`}
                          >
                            <option value="all">All Ratings</option>
                            <option value="exact">Rating 10</option>
                            <option value="partial">Rating 9 – 7</option>
                            <option value="no_match">Rating Below 7</option>
                          </select>
                        </div>
                        <div className="flex-shrink-0">
                          <label className={filterLabelClass}>Date Range</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={historyModalFilter.dateFrom}
                              max={historyModalFilter.dateTo || undefined}
                              onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, dateFrom: e.target.value }))}
                              className={`${filterInputClass} w-[8.5rem]`}
                            />
                            <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">to</span>
                            <input
                              type="date"
                              value={historyModalFilter.dateTo}
                              min={historyModalFilter.dateFrom || undefined}
                              onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, dateTo: e.target.value }))}
                              className={`${filterInputClass} w-[8.5rem]`}
                            />
                          </div>
                        </div>
                        {isHistoryModalFilterActive && (
                          <div className="flex-shrink-0">
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={resetModalFilters}
                              className="rounded-full"
                            >
                              <XCircle className="w-4 h-4" />
                              Reset
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                      {/* Version table — Rating Breakdown gives each version's
                          10 / 9-7 / Below 7 split alongside its candidate count.
                          Fixed height (not a cap) — matching the sidebar next
                          to it regardless of how many or few versions there
                          are, so switching jobs/filters never reflows the
                          modal around it; the body scrolls internally
                          instead. The header is sticky within that scroll
                          area so it stays put while the body scrolls. */}
                      <div className="xl:col-span-2">
                        <div className="hidden md:block overflow-auto h-[266px] rounded-lg border border-gray-200 dark:border-slate-700">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 z-10">
                              <tr className="text-left bg-brand-sky dark:bg-slate-800">
                                <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Version</th>
                                <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Matched By</th>
                                <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Date</th>
                                <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Candidates</th>
                                <th colSpan={3} className="py-1.5 px-3 font-bold text-gray-900 dark:text-slate-100 text-center border-b border-gray-200 dark:border-slate-700">Rating Breakdown</th>
                                <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom">Status</th>
                                <th rowSpan={2} className="py-2.5 px-3 font-bold text-gray-900 dark:text-slate-100 align-bottom text-right">Action</th>
                              </tr>
                              <tr className="text-left bg-brand-sky dark:bg-slate-800">
                                <th className="py-1.5 px-3 font-semibold text-success">10</th>
                                <th className="py-1.5 px-3 font-semibold text-brand-orange-deep">9 – 7</th>
                                <th className="py-1.5 px-3 font-semibold text-destructive">Below 7</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                              {filteredVersionRows.length === 0 ? (
                                <tr>
                                  <td colSpan={9} className="py-6 text-center text-gray-500 dark:text-slate-500">
                                    No match runs found for the selected filters.
                                  </td>
                                </tr>
                              ) : filteredVersionRows.map(({ version, v10, v9to7, vBelow7, candidateCount }) => {
                                const isCompleted = version.session.status?.toLowerCase() === 'completed';
                                const statusLabel = version.session.status
                                  ? version.session.status.charAt(0).toUpperCase() + version.session.status.slice(1)
                                  : 'Unknown';
                                return (
                                  <tr key={version.session.id} className="hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.06]">
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span className="px-2 py-0.5 rounded-md font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                                        v{version.versionNumber}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-700 dark:text-slate-300">
                                      <span className="inline-flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
                                        System
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-600 dark:text-slate-400">
                                      <div>{formatISTDate(version.lastMatchedAt)}</div>
                                      <div className="text-gray-400 dark:text-slate-600">{formatISTTime(version.lastMatchedAt)}</div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="inline-flex px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-semibold">{candidateCount}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-semibold text-success bg-success-subtle/60">{v10}</td>
                                    <td className="py-2.5 px-3 text-center font-semibold text-brand-orange-deep bg-orange-50/60 dark:bg-orange-500/10">{v9to7}</td>
                                    <td className="py-2.5 px-3 text-center font-semibold text-destructive bg-destructive-subtle/60">{vBelow7}</td>
                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center gap-1.5 ${isCompleted ? 'text-success' : 'text-gray-500'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-success' : 'bg-gray-400'}`} />
                                        {statusLabel}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      {renderVersionActions(version.session)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards — the table above is too wide below md.
                            Same ~4-cards-then-scroll cap as the table. */}
                        <div className="md:hidden space-y-2 overflow-y-auto max-h-[520px]">
                          {filteredVersionRows.length === 0 ? (
                            <p className="text-center text-xs text-gray-500 dark:text-slate-500 py-4">
                              No match runs found for the selected filters.
                            </p>
                          ) : filteredVersionRows.map(({ version, v10, v9to7, vBelow7, candidateCount }) => {
                            const isCompleted = version.session.status?.toLowerCase() === 'completed';
                            const statusLabel = version.session.status
                              ? version.session.status.charAt(0).toUpperCase() + version.session.status.slice(1)
                              : 'Unknown';
                            return (
                              <div key={version.session.id} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 text-xs">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="px-2 py-0.5 rounded-md font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                                    v{version.versionNumber}
                                  </span>
                                  <span className={`inline-flex items-center gap-1.5 ${isCompleted ? 'text-success' : 'text-gray-500'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-success' : 'bg-gray-400'}`} />
                                    {statusLabel}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-gray-600 dark:text-slate-400 mb-2">
                                  <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-brand-cyan" />System</span>
                                  <span>{formatISTDate(version.lastMatchedAt)} · {formatISTTime(version.lastMatchedAt)}</span>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-gray-500 dark:text-slate-500">Candidates:</span>
                                  <span className="font-semibold text-gray-900 dark:text-slate-100">{candidateCount}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                                  <div className="rounded bg-success-subtle py-1">
                                    <div className="font-semibold text-success">{v10}</div>
                                    <div className="text-2xs text-gray-500 dark:text-slate-500">10</div>
                                  </div>
                                  <div className="rounded bg-orange-50 dark:bg-orange-500/10 py-1">
                                    <div className="font-semibold text-brand-orange-deep">{v9to7}</div>
                                    <div className="text-2xs text-gray-500 dark:text-slate-500">9–7</div>
                                  </div>
                                  <div className="rounded bg-destructive-subtle py-1">
                                    <div className="font-semibold text-destructive">{vBelow7}</div>
                                    <div className="text-2xs text-gray-500 dark:text-slate-500">Below 7</div>
                                  </div>
                                </div>
                                <div className="flex justify-end">
                                  {renderVersionActions(version.session)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sidebar — distribution across every version, always
                          unfiltered (its own heading says so). */}
                      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Rating Distribution (All Versions)</h4>
                          <BarChart3 className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mb-3">Total candidates: {totalMatched}</p>
                        <div className="space-y-3">
                          {distributionRows.map(row => {
                            const pct = totalMatched > 0 ? Math.round((row.value / totalMatched) * 100) : 0;
                            return (
                              <div key={row.label}>
                                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 mb-1">
                                  <span>{row.label}</span>
                                  <span className={`font-medium ${row.textClass}`}>{row.value} ({pct}%)</span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${row.barClass}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shrink-0">
                <p className="text-xs text-gray-500 dark:text-slate-500 flex items-start sm:items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  Match rating is based on AI similarity between candidate resumes and the job description (1 - 10 scale).
                </p>
                <Button variant="secondary" size="md" onClick={() => setMatchHistoryModal(null)} className="flex-shrink-0">
                  Close
                </Button>
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
              {/* Count badge closes the row up to this point, as it does on
                  every list — the Score/Invite actions below carry their own
                  `sm:ml-auto` instead, so with a selection they take over the
                  row's right edge and the badge sits just before them. */}
              <ListCountBadge
                className={selectedCandidates.length === 0 ? 'sm:ml-auto' : undefined}
                filtered={filteredCandidates.length}
                total={matchedCandidates.length}
                noun="candidate"
                selected={selectedCandidates.length}
              />
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
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
                  <Button
                      variant="secondary"
                      size="md"
                      onClick={() => handleSubmitToScoring()}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                      icon={<ClipboardList className="w-3.5 h-3.5" />}
                      className="flex-1 sm:flex-initial"
                    >
                      Score ({selectedCandidates.length})
                    </Button>
                  )}
                  {/* "Invite" replaces the old standalone Assessment button —
                      a dropdown of the two invite destinations, so a bulk
                      AI Interview invite has the same entry point the row
                      menu already offers per candidate. Hidden entirely when
                      neither destination is available to this viewer, same
                      as ScoredResumesTable's own Invite button. */}
                  {(hasPermission('canCreateAssessments') || isTenantAdmin || canCreateAIInterviews) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="primary" size="md" icon={<Send className="w-3.5 h-3.5" />} className="flex-1 sm:flex-initial">
                          Invite ({selectedCandidates.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                        {(hasPermission('canCreateAssessments') || isTenantAdmin) && (
                          <DropdownMenuItem className={actionsMenuItemClass} onSelect={() => handleAssessment()}>
                            <BarChart3 className="w-4 h-4 text-menu-icon-score" />
                            <span className={MENU_ITEM_SCALE_CLASS}>Invite Assessment</span>
                          </DropdownMenuItem>
                        )}
                        {canCreateAIInterviews && (
                          <DropdownMenuItem className={actionsMenuItemClass} onSelect={handleBulkInviteAIInterview}>
                            <Video className="w-4 h-4 text-menu-icon-view" />
                            <span className={MENU_ITEM_SCALE_CLASS}>Invite AI Interview</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
                </div>
              )}
            </div>
            {/* Additional Filters — each field gets a fixed, short width at
                `sm` and up (rather than `w-full`, which stretched every one
                of them to the row's full width and forced it onto its own
                line even inside the flex-wrap row). Below `sm` they stay
                full-width, stacked in the grid above. */}
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                placeholder="Filter by phone..."
                className="w-full sm:w-44 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
              />
              <input
                type="text"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                placeholder="Filter by location..."
                className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 text-sm text-black placeholder:text-gray-400"
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
                className="w-full sm:w-56 px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-sm text-black"
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
            /* Selected-job candidates: select, Matched Rating, Candidate Name,
               Job Title, Job Version, Email, Phone, Location, Skills,
               Experience, Uploaded By, Uploaded Date, Resume Version,
               Attachments, Scored Status, Actions. */
            <MatchTableSkeleton
              cols={['w-6', 'w-20', 'w-28', 'w-24', 'w-16', 'w-28', 'w-20', 'w-20', 'w-24', 'w-16', 'w-24', 'w-20', 'w-20', 'w-16', 'w-20', 'w-16']}
            />
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
              <Button
                variant="primary"
                onClick={() => {
                  if (!canRunAiMatch) {
                    toast.error('You do not have permission to run AI matching operations');
                    return;
                  }
                  handleRunAIMatch(selectedJob);
                }}
                disabled={!canRunAiMatch}
                title={!canRunAiMatch ? 'You do not have permission to run AI matching operations' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Run AI Match
              </Button>
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
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${rankBadgeClass(candidate.rank || 0)}`}>
                        {candidate.rank || '-'}
                      </span>
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-success-subtle text-success ring-1 ring-success-line">
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
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border flex-shrink-0 ${rankBadgeClass(candidate.rank || 0)}`}>
                      {candidate.rank || '-'}
                    </span>
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-success-subtle text-success ring-1 ring-success-line">
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
                                <span className="text-xs px-2 py-0.5 bg-success-subtle text-success rounded-full font-medium">
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
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setIsAssessmentModalOpen(false);
                    setSelectedAssessments([]);
                    setAssessmentSearchQuery('');
                    setPendingInviteRecipients(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleProceedToInvite}
                  disabled={selectedAssessments.length === 0}
                  icon={<Mail className="w-4 h-4" />}
                >
                  <span className="hidden sm:inline">Proceed to Send Invitations</span>
                  <span className="sm:hidden">Send Invitations</span>
                </Button>
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
