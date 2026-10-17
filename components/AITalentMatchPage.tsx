'use client';

import Image from 'next/image';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, Sparkles, BarChart3, Search, SlidersHorizontal, Briefcase, ChevronDown, ChevronRight, Mail, Phone, MapPin, CheckCircle, Star, User, Users, FileText, Send, TrendingUp, Calendar, History, Eye, ArrowLeft, X, DollarSign, CheckCircle2, AlertCircle, AlertTriangle, PlayCircle, Paperclip, ClipboardList, XCircle, Loader2, Info, RefreshCw, PieChart, MoreVertical, Video, FileDown, CheckSquare, MinusSquare, Square, MinusCircle, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { exportData, type ExportColumn } from '@/lib/utils/exportUtils';
import ExportFormatModal from '@/components/ExportFormatModal';
import ColumnCustomizationModal from '@/components/ColumnCustomizationModal';
import JDVersionHistoryModal from '@/components/JDVersionHistoryModal';
import ApplyToJobModal from '@/components/ApplyToJobModal';
import { useScoringProgress } from '@/contexts/ScoringProgressContext';
import { trackScoringBatch } from '@/lib/utils/trackScoringBatch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SelectAllMenu, SortByControl } from '@/components/ui/select-all-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import CandidateScoringDetailPage from './CandidateScoringDetailPage';
import { toScoredResumeDetail } from '@/lib/utils/scoredResumeDetail';
import SearchableSelect from '@/components/ui/searchable-select';
import ScoredResumesTable, { renderInviteTargetItems, resolveInviteTargetState, type InviteTargetJob } from './ScoredResumesTable';
import JobInviteDialogHost, { type InviteDialogJob, type InviteDialogRequest } from '@/components/talent-match-invite/JobInviteDialogHost';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import CreateInviteTargetModal from './resume-scoring/CreateInviteTargetModal';
import { useAllJobInviteTargets } from '@/lib/hooks/useAllJobInviteTargets';
import { isInvitableAssessment } from '@/lib/hooks/useJobInviteTargets';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import {
  buildCreateUrl,
  clearInviteHandoff,
  readInviteHandoff,
  saveInviteHandoff,
  withResumeInviteMarker,
  RESUME_INVITE_PARAM,
  type InviteHandoff,
  type InviteHandoffKind,
} from '@/lib/utils/resumeScoringInviteHandoff';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AITalentMatchProgressPanel from './AITalentMatchProgressPanel';
import AITalentMatchPageJobsList from './AITalentMatchPageJobsList';
import { JobOpeningPrimaryItems } from '@/components/jobs/JobOpeningSummary';
import type { Job as SharedJob } from '@/lib/types/types';
import ResumeVersionsModal from './ResumeVersionsModal';
import Pagination from './Pagination';
import ListPagination from './ListPagination';
import { aiMatchService, MatchedCandidate, AIMatchSessionResponse } from '@/lib/services/aiMatchService';
import AIMatchVersionHistoryTable, { AIMatchSessionVersion, buildAIMatchVersions } from './AIMatchVersionHistoryTable';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import { jdService, JDLineageVersion } from '@/lib/services/jdService';
import RecordPager from '@/components/RecordPager';
import { toast } from 'sonner';
import { assessmentService } from '@/lib/services';
import ShareAssessmentModal from './ShareAssessmentModal';
import InviteToAIInterviewFlow from './InviteToAIInterviewFlow';
import InviteToAssessmentFlow, { type AssessmentInviteCandidate } from './InviteToAssessmentFlow';
import type { Resume } from '@/lib/types/types';

/** One candidate handed to the Invite to AI Interview dialog. */
type AIInviteSeed = { name: string; email: string; resumeId?: string; phone?: string; title?: string };
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds } from '@/lib/utils/assessmentUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import SkillsList from '@/components/ui/SkillsList';
import { useAuth } from '@/lib/hooks/useAuth';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { useResumeActivityTrail } from '@/lib/utils/resumeActivityTrail';
import { formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer } from 'recharts';
/* The shared formatters, so a JD's industry and employment type read the same
   here as on the Resume Scoring rows this list is modelled on. */
import { getDisplayStatus, getStatusConfig } from '@/lib/utils/jobOpeningDisplay';
import { useQuota } from '@/contexts/QuotaContext';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ui/date-field';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { useListSearch } from '@/lib/hooks/useListSearch';

/* Shared row for both candidate tables' ⋮ Actions menu (Preview Resume /
   Score Resume / Invite Assessment / Invite AI Interview). */
const actionsMenuItemClass = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';

/* Layout switches. The four stat cards are ON again (as on Job Openings),
   sitting above the list rather than as a separate 'cards' step; they
   share their counts and filter with the rating pills. The
   flat "All Resumes" view and the job row's inline "View Versions" panel
   are out of the UI (the History icon still opens every run). Hidden, not
   deleted: flip a flag to bring one back. */
const SHOW_STAT_CARDS = true;
const SHOW_ALL_RESUMES_VIEW = false;
const SHOW_VERSIONS_PANEL = false;

/* Toolbar size (h-[38px]) — More Filters / Sort by height, as on Resume Scoring. */
const TOOLBAR_BUTTON_CLASS =
  'h-[38px] px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue';

type RatingBand = 'exact' | 'partial' | 'no_match';

/* View by Candidates: what the table is sorted by — the Sort By menu and the
   clickable column headers drive the same value. */
type CandidateSortKey = 'score' | 'name' | 'jobs' | 'scored' | 'titles' | 'date';
const CANDIDATE_SORT_KEYS: CandidateSortKey[] = ['score', 'name', 'jobs', 'scored', 'titles', 'date'];

/* View by Job's inline candidate table: the sortable columns. */
type JobCandSortKey = 'rating' | 'candidate' | 'experience' | 'scored';
type JobCandSort = { key: JobCandSortKey; dir: 'asc' | 'desc' };
/** First click on a column: names A→Z, everything else highest / scored first. */
const JOB_CAND_SORT_FIRST_DIR: Record<JobCandSortKey, 'asc' | 'desc'> = {
  rating: 'desc', candidate: 'asc', experience: 'desc', scored: 'desc',
};
const DEFAULT_JOB_CAND_SORT: JobCandSort = { key: 'rating', dir: 'desc' };

/* View by Candidates: a candidate's inner matched-jobs table — sortable columns. */
type CandJobSortKey = 'rating' | 'jdId' | 'title' | 'jobVersion' | 'scored' | 'date' | 'resumeVersion';
type CandJobSort = { key: CandJobSortKey; dir: 'asc' | 'desc' };
/** First click: text A→Z, everything else highest / scored / newest first. */
const CAND_JOB_SORT_FIRST_DIR: Record<CandJobSortKey, 'asc' | 'desc'> = {
  rating: 'desc', jdId: 'asc', title: 'asc', jobVersion: 'desc', scored: 'desc', date: 'desc', resumeVersion: 'desc',
};
const DEFAULT_CAND_JOB_SORT: CandJobSort = { key: 'date', dir: 'desc' };
/** "5.5 years" → 5.5; no number → null (sorts last either way). */
const experienceYears = (value: unknown): number | null => {
  const m = String(value ?? '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/* The in-page scorecard's URL params, and its Prev / Next list's storage key. */
const SCORECARD_JD_PARAM = 'scorecard_jd';
const SCORECARD_SCORE_PARAM = 'score_id';
const SCORECARD_NAV_KEY = 'aiTalentMatchScorecardNav';
/** One score: the JD (version) it is against, and its id. */
type ScoreRef = { jdId: string; scoreId: string };

/* Every Actions-column button in this module — expand, View, Attachments
   and the ⋮ menu — Resume Scoring's row button: same box, same 16px icon. */
const ROW_ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center p-2.5 rounded-lg border transition-all bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed';
const ROW_ACTION_BUTTON_ACTIVE_CLASS =
  'inline-flex items-center justify-center p-2.5 rounded-lg border transition-all bg-brand-blue/10 border-brand-blue/30 text-brand-blue';

/* View by Job's Sort by — Resume Scoring's list (Last Scored / Job Title /
   JD ID / Candidates / Exact / Partial / No Match), in this page's terms. */
type JobSortKey = 'date' | 'title' | 'jdId' | 'matches' | 'exact' | 'partial' | 'no_match';
const JOB_SORT_OPTIONS: { value: JobSortKey; label: string }[] = [
  { value: 'date', label: 'Last Matched' },
  { value: 'title', label: 'Job Title' },
  { value: 'jdId', label: 'JD ID' },
  { value: 'matches', label: 'Candidates' },
  { value: 'exact', label: 'Rating 10' },
  { value: 'partial', label: 'Rating 9 – 7' },
  { value: 'no_match', label: 'Rating Below 7' },
];
const isJobSortKey = (v: unknown): v is JobSortKey => JOB_SORT_OPTIONS.some(o => o.value === v);

/* Same labels as Resume Scoring's filters: 'full_time' → "Full Time",
   and work mode mapped so "onsite" reads "On-site". */
const titleCaseValue = (v: string | undefined): string =>
  !v ? '-' : v.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const WORK_MODE_LABELS: Record<string, string> = { onsite: 'On-site', on_site: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
const formatWorkMode = (mode: string | undefined): string =>
  !mode ? '-' : WORK_MODE_LABELS[mode.toLowerCase()] ?? titleCaseValue(mode);

/** One matched candidate an invite / a "Create …" acts on. */
interface MatchInviteRow {
  /** `${sessionId}::${candidateId}` — unique across jobs. */
  key: string;
  historyId: string;
  jobId: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  resumeId?: string;
}

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
  /** Republish counter — ONLY for the "Published" vs "Republished" label;
   *  `currentVersion` above is the job version (v1, v2, ...). */
  publishCount?: number;
  /* Carried so the job rows can show what the Resume Scoring job rows show.
     All four already exist on the JD record; they were simply never mapped. */
  industryType?: string;
  remoteType?: string;
  postedBy?: string;
  postedDate?: string;
  /** Drives the AI / Manual badge next to Status in the version history table. */
  creationMethod?: string;
  /** JD salary, for the Matched Jobs rows' details line. */
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  compensationType?: string;
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
  /** Who ran the match — the sessions API's `run_by_name` (resolved from
   *  `ai_talent_match_sessions.run_by`). Absent only when that user row is
   *  gone, and the row then reads "System". */
  matchedByName?: string;
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
/* Results page Customize Columns — the table's optional columns. Matched
   Rating and Candidate Name always show, so they aren't offered. */
const RESULTS_COLUMNS: { id: string; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'location', label: 'Location' },
  { id: 'jobTitle', label: 'Job Title' },
  { id: 'jobVersion', label: 'Job Version' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'uploadedBy', label: 'Uploaded By' },
  { id: 'uploadDate', label: 'Uploaded Date' },
  { id: 'resumeVersion', label: 'Resume Version' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'scoredStatus', label: 'Scored Status' },
];
const RESULTS_COLUMNS_STORAGE_KEY = 'aiTalentMatch.results.hiddenColumns';

/* Results page More Filters panel — the same field metrics as Resume
   Scoring's panel (ScoredResumesTable), so the two read as one design. */
const RESULTS_FILTER_FIELD_CLASS = 'w-full sm:w-auto sm:grow sm:basis-[170px] sm:max-w-[280px]';
const RESULTS_FILTER_FIELD_WIDE_CLASS = 'w-full sm:w-auto sm:grow-[1.5] sm:basis-[240px] sm:max-w-[380px]';
const RESULTS_FILTER_LABEL_CLASS = 'block text-sm text-gray-700 dark:text-slate-300 mb-1 truncate';
const RESULTS_FILTER_CONTROL_CLASS =
  'w-full px-3 py-2 text-sm text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/40 bg-white dark:bg-slate-900';

function matchBandForRating(rating: number): 'exact' | 'partial' | 'no_match' {
  if (rating >= 10) return 'exact';
  if (rating >= 7) return 'partial';
  return 'no_match';
}

/**
 * Match History modal's own filter row (Search / Matched By / Version /
 * Rating Range / Date Range). Draft edits live separately from the applied
 * values so typing/picking doesn't narrow the table until Apply — Reset
 * clears both back to this. "Matched By" is 'all' or one of the names the
 * loaded runs were actually run by (the sessions API's `run_by_name`), with
 * 'System' standing for a run whose user can no longer be resolved.
 */
interface MatchHistoryModalFilters {
  search: string;
  matchedBy: string;
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
  jobs: Array<{ historyId: string; jobId: string; jobTitle: string; score: number; matchedAt: Date; matchedByName?: string; resumeVersion?: number; resumeId?: string; candidateId?: string }>;
}

/** True only for the first call in a document that was loaded by a browser
 *  refresh — see the view restore in `useListStatePersistence` below. */
let reloadChecked = false;
function isFirstMountAfterReload(): boolean {
  if (reloadChecked) return false;
  reloadChecked = true;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
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
  /* Results opened from a resume's Candidate Activity card keep that resume's
     trail (Resume Database › My Resumes › <candidate>); see resumeActivityTrail. */
  const resumeTrail = useResumeActivityTrail(searchParams);
  const { hasPermission, hasPermissionCode, isTenantAdmin, user } = useAuth();
  const { quotaData } = useQuota();

  // ✅ RBAC: Check if user can run AI match operations (bypass for tenant admin)
  const canRunAiMatch = isTenantAdmin || (user?.permissions?.canRunAiMatch ?? false);
  // ai_match:export uses the raw granular code, not the legacy can_export
  // column — that column is a shared bucket written by many unrelated
  // "Export" checkboxes (JD, Resumes, Internal DB, Assessments, Scoring,
  // Teams...), so it stays true from any one of them even after this
  // category's own Export checkbox is turned off (same bug shape fixed for
  // can_view_ai_match elsewhere in this app).
  const canExport = isTenantAdmin || hasPermissionCode('ai_match:export');
  // Scoring from AI Talent Match needs Resume Scoring → Score Resume AND this
  // module's own "Score Resume" checkbox (ai_match:score).
  const canRunScoring =
    isTenantAdmin || ((user?.permissions?.canRunScoring ?? false) && hasPermissionCode('ai_match:score'));
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
  // Results page rating filter — the same bands as the Match History popup
  // (10 / 9 – 7 / Below 7), via `matchBandForRating`.
  const [filterRatingBand, setFilterRatingBand] = useState<'all' | 'exact' | 'partial' | 'no_match'>('all');
  // Results page: Scored / Not Scored, against `scoredResumeIds`.
  const [filterScored, setFilterScored] = useState<'all' | 'scored' | 'not_scored'>('all');
  // Results page More Filters panel.
  const [showResultsFilters, setShowResultsFilters] = useState(false);
  // Results page List / Grid, same switch Resume Scoring uses.
  const [resultsDisplayMode, setResultsDisplayMode] = useState<ListDisplayMode>('list');
  // Results page Customize Columns — hidden column ids, kept per browser.
  const [showResultsColumnModal, setShowResultsColumnModal] = useState(false);
  // Results page "View Job Detail" — the JD viewer popup.
  const [showResultsJobDetail, setShowResultsJobDetail] = useState(false);
  const [hiddenResultColumns, setHiddenResultColumns] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(localStorage.getItem(RESULTS_COLUMNS_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const isResultColumnVisible = (id: string) => !hiddenResultColumns.includes(id);
  const visibleResultColumnCount = RESULTS_COLUMNS.filter(col => !hiddenResultColumns.includes(col.id)).length + 2;
  const applyResultColumns = (enabledIds: string[]) => {
    const hidden = RESULTS_COLUMNS.map(col => col.id).filter(id => !enabledIds.includes(id));
    setHiddenResultColumns(hidden);
    try { localStorage.setItem(RESULTS_COLUMNS_STORAGE_KEY, JSON.stringify(hidden)); } catch { /* ignore */ }
  };
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);

  // Additional filters
  const [filterExperienceMin, setFilterExperienceMin] = useState<number | ''>('');
  const [filterExperienceMax, setFilterExperienceMax] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'score' | 'experience'>('rank'); // Sort by highest rating first (DevRMS style)

  // Pagination state for match results
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Assessment-related state
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessments, setSelectedAssessments] = useState<any[]>([]); // Changed to store full assessment objects
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [currentAssessmentForShare, setCurrentAssessmentForShare] = useState<any>(null);
  const [prefilledCandidates, setPrefilledCandidates] = useState<any[]>([]);
  /* Override for `handleProceedToInvite`'s recipient list — set by the "All
     Resumes" bulk Invite Assessment action, whose selection lives in
     `selectedAllResumeKeys` (a cross-job roll-up), not `selectedCandidates`
     (scoped to one job's own candidate list, which is what that function
     normally reads). `null` means "use the normal selectedCandidates path". */
  // The job a per-row Invite Assessment was started for (View by Candidates /
  // All Resumes ⋮). Scopes the invite dialog to that job's assessment
  // versions, as Invite AI Interview is; the cross-job bulk selection leaves
  // it unset and gets the full list.
  const [pendingInviteJobId, setPendingInviteJobId] = useState<string | null>(null);
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
            // Who ran THAT match (the session's `run_by_name`), so the
            // expanded per-job rows name a person instead of "System".
            matchedByName: item.matchedByName,
            // Same field ScoredResumesTable's own "Resume Version" column
            // reads — this candidate's resume as of THIS match, not
            // necessarily the resume's current version if it was re-uploaded
            // since.
            resumeVersion: candidate.resumeVersion,
            resumeId: candidate.resumeId,
            // The match record's own id — keys this row for an invite.
            candidateId: candidate.id,
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

      const scored = await scoredIdsRequest;
      setAllScoredResumeIds(scored.ids);
      setScoredResumeIdsByJd(scored.byJd);
    } finally {
      setLoadingCandidateRows(false);
    }
  };

  /** Every scored resume id in the tenant. Page 1 gives the total; the
   *  remaining pages are fetched in parallel. Never rejects — an empty set just
   *  shows every row as "Not Scored". */
  const loadAllScoredResumeIds = async (): Promise<{ ids: Set<string>; byJd: Map<string, Map<string, string>> }> => {
    const PAGE_SIZE = 100;
    const ids = new Set<string>();
    // Also per JD (version) id: resume id → its latest score id. "Scored for
    // THIS job" — the View by Job rows' "N of M scored" chip, Scored Status
    // column and View Scorecard read it.
    const byJd = new Map<string, Map<string, string>>();
    const latestAt = new Map<string, number>();
    const collect = (items: Array<{ id?: string; resume_id?: string; jd_id?: string; created_at?: string }> = []) =>
      items.forEach(item => {
        if (!item.resume_id) return;
        ids.add(item.resume_id);
        if (item.jd_id && item.id) {
          const at = new Date(item.created_at || 0).getTime() || 0;
          const k = `${item.jd_id}::${item.resume_id}`;
          if (latestAt.has(k) && (latestAt.get(k) ?? 0) >= at) return;
          latestAt.set(k, at);
          const map = byJd.get(item.jd_id) ?? new Map<string, string>();
          map.set(item.resume_id, item.id);
          byJd.set(item.jd_id, map);
        }
      });
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
      return { ids: new Set(), byJd: new Map() };
    }
    return { ids, byJd };
  };

  // Helper to update URL params - use shallow routing to prevent full page reload
  const updateUrlParams = (params: { jdId?: string; view?: string }, options?: { replace?: boolean }) => {
    const url = new URL(window.location.href);

    // Leaving the job a resume's Candidate Activity opened: the resume trail
    // no longer describes where the recruiter is.
    if (url.searchParams.get('jdId') !== (params.jdId ?? null)) {
      url.searchParams.delete('from');
    }

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

    // `replace` for in-place moves on the results page (version switch,
    // Previous / Next job) so one Back still returns to the list.
    if (options?.replace) router.replace(url.pathname + url.search, { scroll: false });
    else router.push(url.pathname + url.search, { scroll: false });
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
      // Job-level, as on Resume Scoring: Location / Industry inline, the
      // rest in More Filters.
      jobLocation: '',
      industry: '',
      matchedBy: '',
      workMode: '',
      jobType: '',
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
    jobLocation: historyJobLocation,
    industry: historyIndustry,
    matchedBy: historyMatchedBy,
    workMode: historyWorkMode,
    jobType: historyJobType,
  } = historySearch.filters;
  const [historySortBy, setHistorySortBy] = useState<JobSortKey>('date');
  // View by Job's List / Grid switch (Resume Scoring's).
  const [jobListDisplayMode, setJobListDisplayMode] = useState<ListDisplayMode>('list');
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
  // There is no 'cards' step any more — the stat cards sit above the list,
  // so the page opens straight onto View by Job.
  const [historyPageView, setHistoryPageView] = useState<'cards' | 'list' | 'candidates' | 'resumes'>('list');
  const historyListSectionRef = useRef<HTMLDivElement | null>(null);
  /* One List / Grid choice for the whole module: picking Grid on the job
     list, View by Candidates or a job's results page switches all three,
     so opening a job's detail (or coming back from it) keeps the layout
     the user picked instead of falling back to List. Each view still keeps
     its own state (all restored by useListStatePersistence). */
  const setDisplayModeEverywhere = (mode: ListDisplayMode) => {
    setJobListDisplayMode(mode);
    setMatchDisplayMode(mode);
    setResultsDisplayMode(mode);
  };
  const [historyListScrollRequest, setHistoryListScrollRequest] = useState(0);
  // The rating pills (All / Rating 10 / 9 – 7 / Below 7) — Resume Scoring's
  // Exact / Partial / No Match pills: a filter of their own, independent of
  // the View by Job / Candidates switch, and each carries its count.
  const [candidateRatingBand, setCandidateRatingBand] = useState<RatingBand | null>(null);
  /* The View by toggle's tile position. It trails the view by two frames:
     each view draws its own toggle, so the newly mounted one starts where
     the tile WAS and then slides across (as on Resume Scoring). */
  const [viewTileRight, setViewTileRight] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setViewTileRight(historyPageView === 'candidates' || historyPageView === 'resumes'));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [historyPageView]);

  /* View by Job: ticked jobs (by session id) — a job's tick takes ALL its
     candidates; ticking single candidates in its opened list makes it
     partial (`partialJobRows`, candidate ids), shown as "–". Same model as
     Resume Scoring's View by Job. */
  const [selectedJobKeys, setSelectedJobKeys] = useState<Set<string>>(new Set());
  const [partialJobRows, setPartialJobRows] = useState<Record<string, string[]>>({});
  // Job rows opened inline onto their candidates.
  const [expandedJobKeys, setExpandedJobKeys] = useState<Set<string>>(new Set());
  // Per job row: how its inline candidate table is sorted (Rating ↓ until a header is clicked).
  const [jobCandSortByJob, setJobCandSortByJob] = useState<Record<string, JobCandSort>>({});
  // Per candidate row: how its inner matched-jobs table is sorted (newest match first by default).
  const [candJobSortByRow, setCandJobSortByRow] = useState<Record<string, CandJobSort>>({});
  const toggleJobExpanded = (key: string) =>
    setExpandedJobKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const clearPartialJob = (key: string) =>
    setPartialJobRows(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const handleSelectJob = (key: string) => {
    const whole = selectedJobKeys.has(key);
    const partial = (partialJobRows[key]?.length ?? 0) > 0;
    setSelectedJobKeys(prev => {
      const next = new Set(prev);
      if (whole || partial) next.delete(key); else next.add(key);
      return next;
    });
    clearPartialJob(key);
  };
  /** A job's selection as exactly these candidate ids: all → whole, none → off. */
  const setJobRowSelection = (key: string, ids: string[], allIds: string[]) => {
    const all = allIds.length > 0 && allIds.every(id => ids.includes(id));
    setSelectedJobKeys(prev => {
      const next = new Set(prev);
      if (all) next.add(key); else next.delete(key);
      return next;
    });
    if (all || ids.length === 0) clearPartialJob(key);
    else setPartialJobRows(prev => ({ ...prev, [key]: ids }));
  };
  const clearJobSelection = () => {
    setSelectedJobKeys(new Set());
    setPartialJobRows({});
  };
  /* View by Candidates: ticked candidates (by roll-up key) — a tick takes
     ALL their matched jobs (rating pill applied); ticking single job matches
     in the opened row makes it partial (`partialCandJobs`, session ids). */
  const [selectedCandKeys, setSelectedCandKeys] = useState<Set<string>>(new Set());
  const [partialCandJobs, setPartialCandJobs] = useState<Record<string, string[]>>({});
  const clearPartialCand = (key: string) =>
    setPartialCandJobs(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const handleSelectCand = (key: string) => {
    const whole = selectedCandKeys.has(key);
    const partial = (partialCandJobs[key]?.length ?? 0) > 0;
    setSelectedCandKeys(prev => {
      const next = new Set(prev);
      if (whole || partial) next.delete(key); else next.add(key);
      return next;
    });
    clearPartialCand(key);
  };
  /** A candidate's selection as exactly these session ids: all → whole, none → off. */
  const setCandJobSelection = (key: string, ids: string[], allIds: string[]) => {
    const all = allIds.length > 0 && allIds.every(id => ids.includes(id));
    setSelectedCandKeys(prev => {
      const next = new Set(prev);
      if (all) next.add(key); else next.delete(key);
      return next;
    });
    if (all || ids.length === 0) clearPartialCand(key);
    else setPartialCandJobs(prev => ({ ...prev, [key]: ids }));
  };
  const clearCandSelection = () => {
    setSelectedCandKeys(new Set());
    setPartialCandJobs({});
  };
  // The rows the Actions › Export dialog is open for (either view).
  const [exportRows, setExportRows] = useState<MatchInviteRow[] | null>(null);

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
  const [candidateItemsPerPage, setCandidateItemsPerPage] = useState(10);
  // Separate page/size for the "View by Resumes" flat table — same filter
  // and sort state as "View by Candidates" above, but its own row grouping,
  // so the two views paginate independently.
  const [resumeCurrentPage, setResumeCurrentPage] = useState(1);
  const [resumeItemsPerPage, setResumeItemsPerPage] = useState(10);
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
  const [candidateSortBy, setCandidateSortBy] = useState<CandidateSortKey>('jobs');
  const [candidateSortOrder, setCandidateSortOrder] = useState<'asc' | 'desc'>('desc');
  // Shared between "View by Candidates" and "All Resumes" (incl. its rating-band
  // filters) — only one of those views is ever on screen at a time, so one flag
  // is enough and a toggle made in either view carries over to the other.
  const [matchDisplayMode, setMatchDisplayMode] = useState<ListDisplayMode>('list');
  // "View by Candidates": each expanded row's matched-jobs list is paged on
  // its own, 10 per page by default. Keyed by the row's key.
  const [candidateJobsPaging, setCandidateJobsPaging] = useState<Record<string, { page: number; size: number }>>({});
  const candidateJobsPageOf = (key: string) => candidateJobsPaging[key] ?? { page: 1, size: 10 };
  const pageCandidateJobs = <T,>(key: string, jobs: T[]): T[] => {
    const { page, size } = candidateJobsPageOf(key);
    return jobs.slice((page - 1) * size, page * size);
  };
  // Both read `prev`, never this render's paging: ListPagination's per-page
  // dropdown calls size-change THEN page-change(1) in the same tick, and a
  // render-time read here put the old size straight back.
  const setCandidateJobsPage = (key: string, page: number) =>
    setCandidateJobsPaging(prev => ({ ...prev, [key]: { ...(prev[key] ?? { page: 1, size: 10 }), page } }));
  const setCandidateJobsSize = (key: string, size: number) =>
    setCandidateJobsPaging(prev => ({ ...prev, [key]: { page: 1, size } }));

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

  // View by Job: a candidate's name opens their resume, on AI Talent Match's
  // trail (Dashboard › AI Talent Match › <job> › <candidate>). `resumeIds` seeds
  // resume-view's Prev / Next with this job's list, in table order.
  const openJobCandidateResume = (jdId: string, jobTitle: string, resumeId: string | undefined, resumeIds: (string | undefined)[]) => {
    if (!resumeId) {
      toast.error('Resume not found for this candidate');
      return;
    }
    try {
      sessionStorage.setItem('resumeNavList', JSON.stringify(resumeIds.filter(Boolean)));
      sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
      sessionStorage.setItem('resumeNavAIMatchJobId', jdId);
      sessionStorage.setItem('resumeNavAIMatchJobTitle', jobTitle || '');
      markAIMatchReturnTrip();
    } catch { /* ignore */ }
    router.push(`/recruitment/resume-view/${resumeId}`);
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
    await handleSubmitToScoring([candidate.id], { candidates, jobId: item.jobId, jobTitle: item.jobTitle });
  };

  // "Invite Assessment" from the candidate roll-up's per-job list — the same
  // override path the All Resumes bulk invite uses: the recipient is built
  // straight from the row, then the normal assessment picker opens.
  const inviteAssessmentForJobMatch = (
    candidate: { name?: string; email?: string; key: string },
    job: { resumeId?: string; jobId: string },
  ) => {
    if (!canCreateAssessments) {
      toast.error('You do not have permission to invite to an assessment');
      return;
    }
    if (!candidate.email) {
      toast.error('Candidate has no email on file');
      return;
    }
    // Create / Send Assessment for THIS row's job — Job Details' popup.
    openCreateSend('assessment', job.jobId, [{
      id: job.resumeId || candidate.key,
      name: candidate.name || 'Candidate',
      email: candidate.email,
      resumeId: job.resumeId,
    }]);
  };

  // "Invite AI Interview" from the same list — scoped to THIS row's job, since
  // an AI interview config belongs to one JD.
  const inviteAIInterviewForJobMatch = (
    candidate: { name?: string; email?: string },
    job: { jobId: string; historyId: string; resumeId?: string },
  ) => {
    if (!canCreateAIInterviews) {
      toast.error('You do not have permission to invite to an AI interview');
      return;
    }
    if (!candidate.email) {
      toast.error('Candidate has no email on file');
      return;
    }
    const item = matchHistory.find(h => h.id === job.historyId);
    if (item) {
      setSelectedHistoryItem(item);
      setSelectedJob(item.jobId);
    }
    // Create / Send AI Interview for THIS row's job — Job Details' popup.
    openCreateSend('interview', job.jobId, [{
      id: job.resumeId || candidate.email,
      name: candidate.name || 'Candidate',
      email: candidate.email,
      resumeId: job.resumeId,
    }]);
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

  /* The shared Invite to AI Interview dialog, scoped to this job — the same
     popup the resume page opens: Candidates Selected, then only this job's
     active interview versions to pick from. */
  const [aiInviteFlow, setAiInviteFlow] = useState<{ jobId: string; seed: AIInviteSeed[] } | null>(null);

  // AI match version history — all match runs for one job, not just the latest.
  // Inline expand-in-place under the job card, one open at a time (like the
  // Job Openings list's own version history).
  const [expandedHistoryJobId, setExpandedHistoryJobId] = useState<string | null>(null);
  const [historyVersionsByJob, setHistoryVersionsByJob] = useState<Record<string, AIMatchSessionVersion[]>>({});
  // The JD lineage behind each history key — every version's own id, number,
  // title and status. Older versions aren't in `jobs` (it only holds each
  // job's current row), so the results page reads their title/version here.
  const [lineageByJob, setLineageByJob] = useState<Record<string, JDLineageVersion[]>>({});
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
        if (lineage.length) setLineageByJob(prev => ({ ...prev, [historyKey]: lineage }));
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
      setHistoryVersionsByJob(prev => ({ ...prev, [historyKey]: buildAIMatchVersions(hydratedSessions, jdVersionOf) }));
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
  /** A JD record's real lineage version, so the version rows read v1/v2 as
   *  the Job Descriptions page does rather than in order of first match. */
  const jdVersionOf = (jdId: string): number | undefined =>
    jobs.find(j => j.id === jdId)?.currentVersion;

  const getOptimisticAIMatchVersions = (historyKey: string): AIMatchSessionVersion[] => {
    const lineageIds = new Set(jobs.filter(j => j.jobId === historyKey).map(j => j.id));
    const knownSessions = allMatchSessions.filter(s => s.jd_id && lineageIds.has(s.jd_id));
    return buildAIMatchVersions(knownSessions, jdVersionOf);
  };

  /** History key (JD-xxx code) for any JD row id — including an older
   *  version that's only known through a loaded lineage. Falls back to the
   *  id itself, the same fallback the job list rows use. */
  const historyKeyForJd = (jdId: string): string =>
    jobs.find(j => j.id === jdId)?.jobId
    || Object.keys(lineageByJob).find(key => lineageByJob[key].some(v => v.id === jdId))
    || jdId;

  // The results page's version dropdown reads the same per-job version cache
  // as "View Versions" and the history popup — load it when a job's results
  // open and it isn't cached yet. Waits for `jobs` so the key is the JD code,
  // and doesn't retry a key that just failed.
  useEffect(() => {
    if (viewMode !== 'results' || !selectedJob || jobs.length === 0) return;
    const key = historyKeyForJd(selectedJob);
    if (historyVersionsByJob[key] || loadingHistoryJobId === key || failedHistoryJobId === key) return;
    // A fetch, not derived state — its setState calls land after the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAIMatchVersionHistory(key, selectedJob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedJob, jobs, lineageByJob, historyVersionsByJob, loadingHistoryJobId, failedHistoryJobId]);

  /* Opened per ROW (`rowId`, the history item's own id), not per job: several
     rows can share one `historyKey` — versions of the same job, or rows whose
     job isn't in the loaded list — and keying the open state on it opened every
     one of them at once. The versions themselves are still fetched and cached
     per job (`historyKey`), so rows of one job share the data, not the toggle. */
  const toggleAIMatchVersionHistory = (historyKey: string, anyRowId: string, rowId: string) => {
    const opening = expandedHistoryJobId !== rowId;
    setExpandedHistoryJobId(opening ? rowId : null);
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
  // Which version the popup's Rating Breakdown donut shows — 'all', or a
  // version's latest session id. Fresh on every open, like the filters.
  const [historyBreakdownVersion, setHistoryBreakdownVersion] = useState<string>('all');
  // Results page Export — opens the shared CSV / Excel picker first.
  const [showCandidateExportModal, setShowCandidateExportModal] = useState(false);
  const openMatchHistoryModal = (item: MatchHistory, historyKey: string) => {
    setMatchHistoryModal({ item, historyKey });
    setHistoryModalFilter(EMPTY_HISTORY_MODAL_FILTERS);
    setHistoryBreakdownVersion('all');
    if (!historyVersionsByJob[historyKey]) void loadAIMatchVersionHistory(historyKey, item.jobId);
  };

  // Score preview — the shared Score Resume dialog (candidates, versions,
  // the job fixed to this match's JD) shown before a batch starts.
  const [scoringReview, setScoringReview] = useState<{
    jobId: string;
    jobTitle: string;
    candidates: MatchedCandidateWithVersions[];
  } | null>(null);
  // App-wide scoring progress popup — scoring started here is tracked there.
  const scoringProgress = useScoringProgress();
  // Batches started from this page, until they settle — then the Scored
  // status is reloaded in place (the effect after the scored-ids fetch).
  const myScoringBatches = useRef<Set<string>>(new Set());
  const [scoredRefreshTick, setScoredRefreshTick] = useState(0);

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
  // The same scores keyed by JD (version) id — `null` until loaded.
  const [scoredResumeIdsByJd, setScoredResumeIdsByJd] = useState<Map<string, Map<string, string>> | null>(null);
  /* A scored candidate's full score (Resume Scoring's scorecard data), per JD
     (version) id, keyed by score id — loaded once per job on first need: an
     inline score summary opened, or the scorecard page opened. */
  const [scoreDetailsByJd, setScoreDetailsByJd] = useState<Record<string, Record<string, any>>>({});
  const scoreDetailRequests = useRef<Map<string, Promise<Record<string, any>>>>(new Map());
  const ensureScoreDetails = (jdId: string, jobTitle: string): Promise<Record<string, any>> => {
    if (scoreDetailsByJd[jdId]) return Promise.resolve(scoreDetailsByJd[jdId]);
    const inFlight = scoreDetailRequests.current.get(jdId);
    if (inFlight) return inFlight;
    const request = (async () => {
      const byId: Record<string, any> = {};
      try {
        const PAGE_SIZE = 100;
        let page = 1;
        // Every page — a job can have more than one page of scores.
        while (page <= 50) {
          const res: any = await jdService.getScoredResumes(jdId, { page_size: PAGE_SIZE, page, sort_by: 'latest' });
          const items: any[] = res?.items || [];
          items.forEach(it => { if (it?.id) byId[it.id] = toScoredResumeDetail(it, jobTitle); });
          if (items.length < PAGE_SIZE || Object.keys(byId).length >= (res?.total ?? 0)) break;
          page += 1;
        }
      } catch (error) {
        console.error('[AITalentMatch] Failed to load score details:', error);
        toast.error('Failed to load the score details');
      } finally {
        scoreDetailRequests.current.delete(jdId);
      }
      setScoreDetailsByJd(prev => ({ ...prev, [jdId]: byId }));
      return byId;
    })();
    scoreDetailRequests.current.set(jdId, request);
    return request;
  };
  // Inline score summaries opened, by `${jdId}::${scoreId}`.
  const [expandedScoreKeys, setExpandedScoreKeys] = useState<Set<string>>(new Set());
  const toggleScoreSummary = (jdId: string, jobTitle: string, scoreId: string) => {
    const key = `${jdId}::${scoreId}`;
    if (!expandedScoreKeys.has(key)) void ensureScoreDetails(jdId, jobTitle);
    setExpandedScoreKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  /* The full scorecard (Resume Scoring's candidate page), opened IN this page
     so the trail stays Dashboard › AI Talent Match › <job> › <candidate>.
     It lives in the URL (`scorecard_jd` + `score_id`), so Back closes it and
     a refresh reopens it. Prev / Next walk the list it was opened from —
     kept in sessionStorage so they survive a refresh too. */
  const scorecardJd = searchParams.get(SCORECARD_JD_PARAM);
  const scorecardScoreId = searchParams.get(SCORECARD_SCORE_PARAM);
  const jobTitleOf = (jdId: string) =>
    jobs.find(j => j.id === jdId)?.title || matchHistory.find(h => h.jobId === jdId)?.jobTitle || '';
  const scoreDetailView = scorecardJd && scorecardScoreId
    ? { jdId: scorecardJd, scoreId: scorecardScoreId, jobTitle: jobTitleOf(scorecardJd) }
    : null;
  const [scoreNavList, setScoreNavList] = useState<ScoreRef[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCORECARD_NAV_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter((r: any) => r?.jdId && r?.scoreId) : [];
    } catch {
      return [];
    }
  });
  // Opened from the list in this visit (Back returns to it), or landed on
  // directly (refresh / shared link — close replaces the URL instead).
  const scorecardOpenedHereRef = useRef(false);
  const scorecardUrl = (ref: ScoreRef | null) => {
    const url = new URL(window.location.href);
    if (ref) {
      url.searchParams.set(SCORECARD_JD_PARAM, ref.jdId);
      url.searchParams.set(SCORECARD_SCORE_PARAM, ref.scoreId);
    } else {
      url.searchParams.delete(SCORECARD_JD_PARAM);
      url.searchParams.delete(SCORECARD_SCORE_PARAM);
    }
    return url.pathname + url.search;
  };
  /** Open a scorecard; `nav` is the list Prev / Next step through. */
  const openScoreDetail = (jdId: string, jobTitle: string, scoreId: string, nav?: ScoreRef[]) => {
    void ensureScoreDetails(jdId, jobTitle);
    const list = nav && nav.some(r => r.jdId === jdId && r.scoreId === scoreId) ? nav : [{ jdId, scoreId }];
    setScoreNavList(list);
    try { sessionStorage.setItem(SCORECARD_NAV_KEY, JSON.stringify(list)); } catch { /* ignore */ }
    scorecardOpenedHereRef.current = true;
    router.push(scorecardUrl({ jdId, scoreId }), { scroll: false });
    try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
  };
  /** Prev / Next and the Version dropdown: move in place (one Back still returns to the list). */
  const moveScoreDetail = (ref: ScoreRef) => {
    void ensureScoreDetails(ref.jdId, jobTitleOf(ref.jdId));
    router.replace(scorecardUrl(ref), { scroll: false });
    try { window.scrollTo({ top: 0 }); } catch { /* ignore */ }
  };
  const closeScoreDetail = () => {
    if (scorecardOpenedHereRef.current) {
      scorecardOpenedHereRef.current = false;
      router.back();
    } else {
      router.replace(scorecardUrl(null), { scroll: false });
    }
  };
  // Landed on a scorecard URL (refresh / Back-Forward): load its job's scores.
  useEffect(() => {
    if (!scorecardJd || !scorecardScoreId) return;
    if (scoreDetailsByJd[scorecardJd]) return;
    void ensureScoreDetails(scorecardJd, jobTitleOf(scorecardJd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scorecardJd, scorecardScoreId]);

  /** Under a scored candidate's row: Resume Scoring's own scored-resumes
   *  table (its compact View by Job form), with this candidate's scores for
   *  this job — one row per resume version scored. A row opens its scorecard
   *  here, on this page's trail. */
  const renderScoreSummary = (jdId: string, jobTitle: string, scoreId: string, nav?: ScoreRef[]) => {
    const byId = scoreDetailsByJd[jdId];
    const detail = byId?.[scoreId];
    if (!detail) {
      return byId ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">Score details aren't available for this candidate.</p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading score...
        </div>
      );
    }
    const rows = Object.values(byId)
      .filter((r: any) => r.resumeId && r.resumeId === detail.resumeId)
      .sort((a: any, b: any) => new Date(b.scoredDate).getTime() - new Date(a.scoredDate).getTime());
    return (
      <ScoredResumesTable
        key={`${jdId}-${scoreId}`}
        compact
        hideSelectionBar
        hideMatchStatusFilter
        title=""
        resumes={rows as any}
        jobTitle={jobTitle}
        jobId={jdId}
        jobCode={jobs.find(j => j.id === jdId)?.jobId}
        assessmentConfigured={inviteTargets.hasAssessment(jdId)}
        aiInterviewConfigured={inviteTargets.hasAIInterview(jdId)}
        enableInternalAIInterviewInvite
        /* Row Invite -> Create / Send for this job — Job Details' popup. */
        onOpenInviteDialog={(kind, candidates) => openCreateSend(kind, jdId, candidates, jobTitle)}
        onViewCandidate={(r: any) => openScoreDetail(jdId, jobTitle, r.id, nav)}
        // The row above already names the candidate and the job.
        hiddenColumnIds={['candidateName', 'jdId', 'jobTitle', 'jobVersion']}
      />
    );
  };

  /** The score id of `resumeId` against JD `jdId`, or undefined when it was
   *  never scored for that job. Tolerates a non-Map entry (state kept across
   *  a dev hot reload from an older shape) instead of throwing mid-render. */
  const scoreIdFor = (jdId: string, resumeId?: string): string | undefined => {
    if (!resumeId) return undefined;
    const entry: unknown = scoredResumeIdsByJd?.get(jdId);
    return entry instanceof Map ? (entry.get(resumeId) as string | undefined) : undefined;
  };

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
      historyJobLocation, historyIndustry, historyMatchedBy, historyWorkMode, historyJobType,
      historyCurrentPage, historyItemsPerPage,
      candidateSearchQuery, candidateFilterLocation, candidateFilterJob,
      candidateFilterMinScore, candidateFilterMultiJob, candidateFilterPhone,
      candidateFilterExpMin, candidateFilterExpMax,
      candidateFilterDateFrom, candidateFilterDateTo,
      candidateSortBy, candidateSortOrder,
      searchQuery, filterRatingBand, filterScored,
      filterExperienceMin, filterExperienceMax, sortBy,
      currentPage, itemsPerPage,
      // The cards -> list/candidates drill-in. Restored with the filters below
      // rather than unconditionally: it belongs to the same "came back from a
      // resume" round trip. Without it the view reset to the stat cards and the
      // list the user had been reading was simply gone.
      historyPageView,
      // The Rating-10 / 9-7 / Below 7 pill, and the list/grid toggles.
      candidateRatingBand, resultsDisplayMode, matchDisplayMode, jobListDisplayMode,
    },
    (s) => {
      // Layout choices are harmless to restore from any entry point.
      if (typeof s.historyItemsPerPage === 'number') setHistoryItemsPerPage(s.historyItemsPerPage);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
      if (s.resultsDisplayMode === 'list' || s.resultsDisplayMode === 'grid') setResultsDisplayMode(s.resultsDisplayMode);
      if (s.matchDisplayMode === 'list' || s.matchDisplayMode === 'grid') setMatchDisplayMode(s.matchDisplayMode);
      if (s.jobListDisplayMode === 'list' || s.jobListDisplayMode === 'grid') setJobListDisplayMode(s.jobListDisplayMode);

      // The open view (Matched Jobs / View by Candidates / All Resumes) and
      // its rating pill also survive a browser refresh — the user is still
      // on the same screen. Only this document's first mount counts as the
      // refresh: the navigation entry keeps saying 'reload' for the rest of
      // the document's life, and a later in-app visit should start clean.
      const restoreViewOnReload = isFirstMountAfterReload();
      const restoreView = (pageView: unknown, band: unknown) => {
        // A view that is switched off lands on its nearest one still shown.
        if (pageView === 'cards') setHistoryPageView('list');
        else if (pageView === 'resumes') setHistoryPageView(SHOW_ALL_RESUMES_VIEW ? 'resumes' : 'candidates');
        else if (pageView === 'list' || pageView === 'candidates') setHistoryPageView(pageView);
        if (band === 'exact' || band === 'partial' || band === 'no_match' || band === null) {
          setCandidateRatingBand(band as 'exact' | 'partial' | 'no_match' | null);
        }
      };

      // Search and filters only survive a round trip *within* this module —
      // opening a candidate's resume and coming back. Arriving from anywhere
      // else (sidebar, another module, a fresh visit) starts clean, so a filter
      // set days ago can't silently hide rows.
      let keepFilters = false;
      try {
        keepFilters = sessionStorage.getItem(AI_MATCH_KEEP_FILTERS_KEY) === '1';
        sessionStorage.removeItem(AI_MATCH_KEEP_FILTERS_KEY);
      } catch { /* ignore */ }
      if (keepFilters || restoreViewOnReload) restoreView(s.historyPageView, s.candidateRatingBand);
      if (!keepFilters) return;

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
        jobLocation: typeof s.historyJobLocation === 'string' ? s.historyJobLocation : '',
        industry: typeof s.historyIndustry === 'string' ? s.historyIndustry : '',
        matchedBy: typeof s.historyMatchedBy === 'string' ? s.historyMatchedBy : '',
        workMode: typeof s.historyWorkMode === 'string' ? s.historyWorkMode : '',
        jobType: typeof s.historyJobType === 'string' ? s.historyJobType : '',
      });
      if (isJobSortKey(s.historySortBy)) setHistorySortBy(s.historySortBy);
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
      if (CANDIDATE_SORT_KEYS.includes(s.candidateSortBy)) setCandidateSortBy(s.candidateSortBy);
      if (s.candidateSortOrder === 'asc' || s.candidateSortOrder === 'desc') setCandidateSortOrder(s.candidateSortOrder);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (s.filterRatingBand === 'all' || s.filterRatingBand === 'exact' || s.filterRatingBand === 'partial' || s.filterRatingBand === 'no_match') setFilterRatingBand(s.filterRatingBand);
      if (s.filterScored === 'all' || s.filterScored === 'scored' || s.filterScored === 'not_scored') setFilterScored(s.filterScored);
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
  }, [selectedHistoryItem, selectedJob, viewMode, scoredRefreshTick]);

  /* Scoring started here no longer leaves the page, so once a batch it
     started settles (or is dismissed from the popup), reload every "Scored"
     source — the per-job map behind View by Job's Scored Status / "N of M
     scored", the tenant-wide set, the open job's set and the cached
     scorecards — so the rows flip to Scored in place. */
  useEffect(() => {
    if (myScoringBatches.current.size === 0) return;
    const jobsById = new Map(scoringProgress.activeScoringJobs.map(j => [j.jobId, j]));
    const settled = Array.from(myScoringBatches.current).filter(id => {
      const job = jobsById.get(id);
      return !job || (job.queued === 0 && job.processing === 0);
    });
    if (settled.length === 0) return;
    settled.forEach(id => myScoringBatches.current.delete(id));
    void (async () => {
      const scored = await loadAllScoredResumeIds();
      setAllScoredResumeIds(scored.ids);
      setScoredResumeIdsByJd(scored.byJd);
    })();
    scoreDetailRequests.current.clear();
    setScoreDetailsByJd({});
    setScoredRefreshTick(t => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoringProgress.activeScoringJobs]);

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

    // A match run is free — no units are charged, here or by the backend.
    // Units are used only when matched resumes are scored.

    // Save to history
    if (selectedJobData) {
      const newMatchHistory: MatchHistory = {
        id: Date.now().toString(),
        jobId: selectedJob,
        jobTitle: selectedJobData.title,
        matchedAt: new Date(),
        totalMatches: results.length,
        matchedCandidates: candidatesWithVersions,
        // This run was just made by the signed-in user; the server says the
        // same in `run_by_name` on the next sessions refresh.
        matchedByName: user?.name || undefined,
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
  /**
   * Every Score on this page — the toolbar, a row's Score Resume, the
   * candidate roll-up and All Resumes — opens the shared Candidates Selected
   * review first (the job fixed, versions pickable); its Score Resume then
   * starts the batch. `ctx` names the candidates and job explicitly for
   * callers that have just pointed the page at another session, whose state
   * this closure can't see yet.
   */
  const handleSubmitToScoring = async (
    candidateIds?: string[],
    ctx?: { candidates: MatchedCandidateWithVersions[]; jobId: string; jobTitle: string },
  ) => {
    const idsToScore = candidateIds ?? selectedCandidates;
    if (idsToScore.length === 0) {
      toast.warning('Please select at least one candidate to score');
      return;
    }

    const currentCandidates = ctx?.candidates ?? (viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem));
    const selected = currentCandidates.filter(c => idsToScore.includes(c.id) && !!c.resumeId);

    const jobId = ctx?.jobId ?? (selectedJob || selectedHistoryItem?.jobId);
    const jobTitle = ctx?.jobTitle ?? (selectedJobData?.title || selectedHistoryItem?.jobTitle || 'Job');

    if (!jobId) {
      toast.error('Job ID not found');
      return;
    }
    if (selected.length === 0) {
      toast.error('Resume ID not found for this candidate');
      return;
    }

    setScoringReview({ jobId, jobTitle, candidates: selected });
  };

  /**
   * Score these resumes against the job: skip the ones already scored for it,
   * batch the rest, and hand off to Resume Scoring's common bulk-progress
   * popup (`?batch_id=`). Each item's `resumeId` is the exact version to score.
   */
  const startBatchScoring = async (selected: Array<{ resumeId: string; name?: string }>, jobId: string, jobTitle: string) => {
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

      // The recruiter STAYS on AI Talent Match: progress rides the app-wide
      // scoring popup, and the rows' Scored status refreshes when the batch
      // settles (see `myScoringBatches`). The job's Scored Resumes tab is
      // only the popup's "view results" target.
      const jobScoredResumesUrl = `/recruitment/job-details?id=${encodeURIComponent(jobId)}&tab=scored-resumes`;

      if (newResumeIds.length === 0) {
        // All already scored — nothing to run; show them on the job's page.
        toast.info(
          `${alreadyScoredItems.length === 1 ? 'This resume is' : `All ${alreadyScoredItems.length} resumes are`} already scored for "${jobTitle}".`,
        );
        return;
      }

      // Start async bulk scoring via Celery for new resumes only
      const response = await scoringService.startBulkScoringAsync(jobId, newResumeIds);

      trackScoringBatch(scoringProgress, {
        batchId: response.batch_id,
        jobId: response.jd_id || jobId,
        jobTitle: response.jd_title || jobTitle,
        items: resumeItems,
        returnUrl: jobScoredResumesUrl,
      });
      myScoringBatches.current.add(response.batch_id);
      toast.success(
        `Scoring started for ${newResumeIds.length} resume${newResumeIds.length === 1 ? '' : 's'}` +
        (alreadyScoredItems.length > 0 ? ` (${alreadyScoredItems.length} already scored)` : '') + '.',
      );
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


  const handleProceedToInvite = (invitees?: AssessmentInviteCandidate[]) => {
    /* The candidates still ticked in the invite dialog's Candidates Selected
       panel — unticking someone there has to mean they are left out. */
    const keep = invitees ? new Set(invitees.map((i) => i.id)) : null;
    if (selectedAssessments.length === 0) {
      toast.error('Please select at least one assessment');
      return;
    }

    // `pendingInviteRecipients` — set by the "All Resumes" bulk Invite
    // Assessment action — already IS the final recipient list (built from a
    // cross-job selection, not `selectedCandidates`); everything below only
    // runs for the normal single-job selection path.
    const candidateData = pendingInviteRecipients
      ? pendingInviteRecipients.filter(r => !keep || keep.has(r.id))
      : (() => {
      const currentCandidates = viewMode === 'results'
        ? matchedCandidates
        : getResolvedHistoryCandidates(selectedHistoryItem);
      return currentCandidates
        .filter(c => selectedCandidates.includes(c.id) && (!keep || keep.has(c.id)))
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
      setPendingInviteRecipients(null);
      setPendingInviteJobId(null);
    } catch (error: any) {
      console.error('Failed to send invitations:', error);
      toast.error(error.message || 'Failed to send invitations');
    }
  };

  /* Invite AI Interview — opens the shared Invite to AI Interview dialog for
     this job: the candidates listed (untick to leave out), then this job's
     active interview versions to choose from, then the share modal. */
  const handleInviteAIInterview = (seed: AIInviteSeed[], jobIdOverride?: string) => {
    const jobId = jobIdOverride || selectedJob || selectedHistoryItem?.jobId;
    if (!jobId) {
      toast.error('Job ID not found');
      return;
    }
    setAiInviteFlow({ jobId, seed });
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
      .map(c => ({ name: c.name, email: c.email || '', resumeId: c.resumeId, phone: c.phone, title: c.title }))
      .filter(c => c.email);
    if (seed.length === 0) {
      toast.error('Selected candidates must have email addresses');
      return;
    }
    handleInviteAIInterview(seed);
  };

  /* ---- No AI Assessment / AI Interview yet → create it → back → invite ----
     Resume Scoring's round trip (resumeScoringInviteHandoff), from here:
     1. An invite for a job that has none is greyed, with "＋ Create …" under
        it (bulk Actions and each candidate's ⋮ menu alike).
     2. The explainer popup's Start saves the view, the ticks and the pending
        invite, then opens the create page with `from=ai-talent-match` — its
        breadcrumb reads Dashboard › AI Talent Match › Create ….
     3. Its published screen links back with `?resume_invite=1`; here the
        ticks come back, the job is re-checked, and the invite opens for the
        same candidates. Nothing published → ticks back, no invite. */
  const inviteTargets = useAllJobInviteTargets(viewMode === 'history' || viewMode === 'results');
  const inviteTargetJobOf = (jdId: string, title?: string): InviteTargetJob => {
    const job = jobs.find(j => j.id === jdId);
    return { jdId, jdCode: job?.jobId || undefined, jdTitle: title || job?.title || 'Job' };
  };
  /* Create / Send Assessment | AI Interview — Job Details' popup, for ONE job
     per opening (a selection spanning jobs stays greyed: "one job at a time").
     null = closed; rendered with aiInviteDialog in every view. */
  const [createSendRequest, setCreateSendRequest] = useState<InviteDialogRequest | null>(null);
  const inviteDialogJobOf = (jdId: string, title?: string): InviteDialogJob => {
    const job = jobs.find(j => j.id === jdId);
    return {
      jdId,
      jdTitle: title || job?.title || 'Job',
      jdCode: job?.jobId || undefined,
      versionNumber: job?.currentVersion,
      status: job?.status,
    };
  };
  const openCreateSend = (kind: InviteHandoffKind, jdId: string, candidates: InviteCandidate[], title?: string) =>
    setCreateSendRequest({ kind, job: inviteDialogJobOf(jdId, title), candidates });
  const createSendDialogEl = (
    <JobInviteDialogHost request={createSendRequest} onClose={() => setCreateSendRequest(null)} />
  );
  const [createInviteTarget, setCreateInviteTarget] = useState<{
    kind: InviteHandoffKind;
    job: InviteTargetJob;
    rows: MatchInviteRow[];
    view: 'job' | 'candidates' | 'results';
  } | null>(null);
  const peopleIn = (rows: MatchInviteRow[]) =>
    new Set(rows.map(r => String(r.email || r.resumeId || r.key).toLowerCase())).size;
  const toInviteRow = (historyId: string, jobId: string, c: MatchedCandidateWithVersions): MatchInviteRow => ({
    key: `${historyId}::${c.id}`,
    historyId,
    jobId,
    name: c.name || 'Candidate',
    email: c.email || undefined,
    phone: c.phone,
    title: c.title,
    resumeId: c.resumeId,
  });
  const startCreateInviteTarget = () => {
    const t = createInviteTarget;
    if (!t) return;
    // The results page comes back to the same job's results; the list views
    // to the list (the persisted view state reopens the right one).
    const returnUrl = t.view === 'results'
      ? withResumeInviteMarker(`${window.location.pathname}${window.location.search}`)
      : undefined;
    saveInviteHandoff({
      source: 'ai-talent-match',
      kind: t.kind,
      jdId: t.job.jdId,
      jdCode: t.job.jdCode,
      jdTitle: t.job.jdTitle,
      scoreIds: t.rows.map(r => r.key),
      candidateCount: peopleIn(t.rows),
      view: t.view,
      selectedJobKeys: Array.from(selectedJobKeys),
      partialJobRows,
      ratingBand: candidateRatingBand,
      returnUrl,
    });
    // Same flag a resume round trip sets: search, filters and the open view
    // are put back on return.
    markAIMatchReturnTrip();
    setCreateInviteTarget(null);
    router.push(buildCreateUrl(t.kind, { id: t.job.jdId, title: t.job.jdTitle }, returnUrl, 'ai-talent-match'));
  };

  /** Open Create / Send for `rows` (one job) — Job Details' popup, with the
   *  candidates who have an email (one per address). */
  const openInviteForRows = (kind: InviteHandoffKind, jdId: string, rows: MatchInviteRow[]) => {
    const seen = new Set<string>();
    const candidates: InviteCandidate[] = rows
      .filter(r => r.email)
      .filter(r => {
        const e = r.email!.toLowerCase();
        if (seen.has(e)) return false;
        seen.add(e);
        return true;
      })
      .map(r => ({ id: r.resumeId || r.key, name: r.name, email: r.email!, phone: r.phone, resumeId: r.resumeId }));
    if (candidates.length === 0) {
      toast.error('Selected candidates must have email addresses');
      return;
    }
    openCreateSend(kind, jdId, candidates);
  };

  /** A candidate's invite items for its ⋮ menu — greyed with "＋ Create …"
   *  when its job has no AI Assessment / AI Interview yet. */
  const renderRowInviteItems = (row: MatchInviteRow, view: 'job' | 'candidates' | 'results', jobTitle?: string) => {
    const job = inviteTargetJobOf(row.jobId, jobTitle);
    const create = (kind: InviteHandoffKind) => (target: InviteTargetJob) =>
      setCreateInviteTarget({ kind, job: target, rows: [row], view });
    const guardEmail = (): boolean => {
      if (row.email) return true;
      toast.error('Candidate has no email on file');
      return false;
    };
    return (
      <>
        {renderInviteTargetItems({
          kind: 'assessment',
          // The popup offers Create when this job has none.
          target: { state: 'ready' },
          label: 'Create / Send Assessment',
          itemClass: actionsMenuItemClass,
          allowed: canCreateAssessments,
          onInvite: (e) => {
            if (!canCreateAssessments) {
              e.preventDefault();
              toast.error('You do not have permission to invite to an assessment');
              return;
            }
            if (guardEmail()) openInviteForRows('assessment', row.jobId, [row]);
          },
          onCreate: create('assessment'),
        })}
        {renderInviteTargetItems({
          kind: 'interview',
          target: { state: 'ready' },
          label: 'Create / Send AI Interview',
          itemClass: actionsMenuItemClass,
          allowed: canCreateAIInterviews,
          onInvite: (e) => {
            if (!canCreateAIInterviews) {
              e.preventDefault();
              toast.error('You do not have permission to invite to an AI interview');
              return;
            }
            if (!guardEmail()) return;
            const item = matchHistory.find(h => h.id === row.historyId);
            if (item) {
              setSelectedHistoryItem(item);
              setSelectedJob(item.jobId);
            }
            openInviteForRows('interview', row.jobId, [row]);
          },
          onCreate: create('interview'),
        })}
      </>
    );
  };

  const createInviteTargetModal = createInviteTarget ? (
    <CreateInviteTargetModal
      kind={createInviteTarget.kind}
      jdCode={createInviteTarget.job.jdCode}
      jdTitle={createInviteTarget.job.jdTitle}
      candidateCount={peopleIn(createInviteTarget.rows)}
      sourceLabel="AI Talent Match"
      onCancel={() => setCreateInviteTarget(null)}
      onStart={startCreateInviteTarget}
    />
  ) : null;

  // Back from a create: restore first, then — once match history is in —
  // re-check the job and open the invite.
  const [handoffReturn, setHandoffReturn] = useState<InviteHandoff | null>(null);
  const handoffCheckedRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RESUME_INVITE_PARAM)) return;
    const h = readInviteHandoff();
    if (h && h.source !== 'ai-talent-match') return;
    // One candidate's resume page started it — that page finishes it.
    if (h && h.origin === 'detail') return;
    // Drop the marker so a reload doesn't run this again.
    params.delete(RESUME_INVITE_PARAM);
    const q = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    if (!h) return;
    if (h.view === 'job') setHistoryPageView('list');
    else if (h.view === 'candidates') setHistoryPageView('candidates');
    setSelectedJobKeys(new Set(h.selectedJobKeys ?? []));
    setPartialJobRows(h.partialJobRows ?? {});
    if (h.ratingBand === 'exact' || h.ratingBand === 'partial' || h.ratingBand === 'no_match') setCandidateRatingBand(h.ratingBand);
    setHandoffReturn(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!handoffReturn || handoffCheckedRef.current || matchHistory.length === 0) return;
    handoffCheckedRef.current = true;
    const h = handoffReturn;
    clearInviteHandoff();
    const what = h.kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
    const jobName = h.jdCode || h.jdTitle;
    (async () => {
      let live = false;
      try {
        live = h.kind === 'assessment'
          ? ((await assessmentService.list({ jd_id: h.jdId, page_size: 100 }))?.items || []).some(isInvitableAssessment)
          : !!(await aiInterviewService.findLiveConfigForJd(h.jdId));
      } catch {
        live = false;
      }
      if (!live) {
        toast.info(`No ${what} was published for ${jobName} yet — your selection is kept.`);
        return;
      }
      // The picked candidates, from their match sessions (cached per session).
      const keys = new Set(h.scoreIds);
      const sessionIds = Array.from(new Set(h.scoreIds.map(k => k.split('::')[0])));
      const perSession = await Promise.all(sessionIds.map(async (sid) => {
        const item = matchHistory.find(m => m.id === sid);
        if (!item) return [] as MatchInviteRow[];
        const candidates = await loadHistoryCandidates(item, { silent: true });
        return candidates.map(c => toInviteRow(item.id, item.jobId, c)).filter(r => keys.has(r.key));
      }));
      const rows = perSession.flat();
      if (rows.length === 0) {
        toast.success(`${what} is live for ${jobName}.`);
        return;
      }
      const n = peopleIn(rows);
      toast.success(`${what} is live for ${jobName} — now invite your ${n} candidate${n === 1 ? '' : 's'}.`);
      openInviteForRows(h.kind, h.jdId, rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffReturn, matchHistory.length]);

  const getFilteredCandidates = (): MatchedCandidateWithVersions[] => {
    const candidates: MatchedCandidateWithVersions[] = viewMode === 'results'
      ? matchedCandidates
      : getResolvedHistoryCandidates(selectedHistoryItem);

    const filtered = candidates.filter(candidate => {
      // Existing filters
      const matchesThreshold = filterRatingBand === 'all' ||
        matchBandForRating(toMatchRating(candidate.matchScore)) === filterRatingBand;
      // One search box covers name, title, email, phone, location and skills
      // — the same single-search pattern as the other candidate lists. Phone
      // also matches on digits alone, so "90000 11223" finds "+91 90000-11223".
      const query = searchQuery.trim().toLowerCase();
      const queryDigits = query.replace(/[^0-9]/g, '');
      const matchesSearch = query === '' ||
        candidate.name.toLowerCase().includes(query) ||
        candidate.title.toLowerCase().includes(query) ||
        (!!candidate.email && candidate.email.toLowerCase().includes(query)) ||
        (!!candidate.phone && (
          candidate.phone.toLowerCase().includes(query) ||
          (queryDigits.length >= 3 && candidate.phone.replace(/[^0-9]/g, '').includes(queryDigits))
        )) ||
        (!!candidate.location && candidate.location.toLowerCase().includes(query)) ||
        candidate.skills.some(skill => skill.toLowerCase().includes(query));

      // Experience filter
      const candidateExp = candidate.experience ? parseFloat(candidate.experience) : 0;
      const matchesExperienceMin = filterExperienceMin === '' || candidateExp >= filterExperienceMin;
      const matchesExperienceMax = filterExperienceMax === '' || candidateExp <= filterExperienceMax;

      const isScored = !!candidate.resumeId && scoredResumeIds.has(candidate.resumeId);
      const matchesScored = filterScored === 'all' || (filterScored === 'scored' ? isScored : !isScored);

      return matchesThreshold && matchesSearch && matchesScored && matchesExperienceMin && matchesExperienceMax;
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
    viewMode, matchedCandidates, selectedHistoryItem, filterRatingBand, searchQuery,
    filterScored, scoredResumeIds, filterExperienceMin, filterExperienceMax, sortBy
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
  }, [searchQuery, filterRatingBand, filterScored, filterExperienceMin, filterExperienceMax, sortBy, selectedHistoryItem, viewMode]);

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

    // Job-level filters, read off the job's own record.
    const jd = jobs.find(j => j.id === item.jobId);
    const matchesJobLocation = !historyJobLocation || jd?.location === historyJobLocation;
    const matchesIndustry = !historyIndustry || jd?.industryType === historyIndustry;
    const matchesMatchedBy = !historyMatchedBy || (item.matchedByName || 'System') === historyMatchedBy;
    const matchesWorkMode = !historyWorkMode || jd?.remoteType === historyWorkMode;
    const matchesJobType = !historyJobType || jd?.employmentType === historyJobType;

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesMinMatches && matchesCandidateFilters &&
      matchesJobLocation && matchesIndustry && matchesMatchedBy && matchesWorkMode && matchesJobType;
  });

  const sortedHistory = [...filteredHistory].sort((a, b) => {
    const direction = historySortOrder === 'asc' ? 1 : -1;
    // How many of a job's candidates fall in one rating band.
    const bandCount = (item: MatchHistory, band: RatingBand) =>
      (historyCandidatesById[item.id] ?? []).filter(c => matchBandForRating(toMatchRating(c.matchScore ?? 0)) === band).length;
    switch (historySortBy) {
      case 'matches':
        return ((a.totalMatches || 0) - (b.totalMatches || 0)) * direction;
      case 'title':
        return a.jobTitle.localeCompare(b.jobTitle) * direction;
      case 'jdId': {
        const code = (item: MatchHistory) => jobs.find(j => j.id === item.jobId)?.jobId || '';
        return code(a).localeCompare(code(b), undefined, { numeric: true, sensitivity: 'base' }) * direction;
      }
      case 'exact':
      case 'partial':
      case 'no_match':
        return (bandCount(a, historySortBy) - bandCount(b, historySortBy)) * direction;
      default:
        return (new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()) * direction;
    }
  });

  // Search sits outside the panel, so — like job-openings — it is not counted.
  const activeFiltersCount = historySearch.activeFilterCount;

  /* Invite to AI Interview — the shared dialog, scoped to this job. Rendered
     in EVERY view branch below that offers the action (history, results and
     the default view): each branch returns its own tree, so a dialog placed in
     only one of them never opened from the others. */
  /* The Score review — the shared Candidates Selected dialog (Score Resume
     mode) with the job fixed: untick to drop, the eye to pick another resume
     version, then Score Resume starts the batch. Rendered in every view
     branch below, beside the invite dialogs. */
  const reviewJobRecord = scoringReview ? jobs.find(j => j.id === scoringReview.jobId) : undefined;
  const reviewLineageEntry = scoringReview
    ? Object.values(lineageByJob).flat().find(v => v.id === scoringReview.jobId)
    : undefined;
  const scoringReviewDialog = scoringReview && (
    <ApplyToJobModal
      mode="scoring"
      resumes={scoringReview.candidates.map(c => ({
        id: c.resumeId,
        name: c.name || 'Unknown',
        title: c.title,
        email: c.email,
        phone: c.phone,
        versionCount: c.attachmentCount || c.versions?.length || 1,
      }) as unknown as Resume)}
      fixedJob={{
        id: scoringReview.jobId,
        job_id: reviewJobRecord?.jobId || reviewLineageEntry?.job_id,
        title: reviewJobRecord?.title || reviewLineageEntry?.title || scoringReview.jobTitle,
        status: 'Published',
        location: reviewJobRecord?.location || '',
        daysActive: 0,
        requiredMatch: 70,
        applicants: 0,
        skills: [],
        versionNumber: reviewLineageEntry?.version_number ?? reviewJobRecord?.currentVersion,
      } as SharedJob}
      onClose={() => setScoringReview(null)}
      onApply={(resumeIds, _jobIds, _jobs, sourceResumeIds) => {
        const review = scoringReview;
        setScoringReview(null);
        const nameFor = (index: number) =>
          review.candidates.find(c => c.resumeId === (sourceResumeIds?.[index] ?? resumeIds[index]))?.name;
        void startBatchScoring(
          resumeIds.map((resumeId, index) => ({ resumeId, name: nameFor(index) })),
          review.jobId,
          review.jobTitle,
        );
      }}
    />
  );

  const aiInviteDialog = (
    <InviteToAIInterviewFlow
      open={!!aiInviteFlow}
      onClose={() => setAiInviteFlow(null)}
      jobId={aiInviteFlow?.jobId}
      candidates={(aiInviteFlow?.seed ?? []).map((c, i) => ({ id: c.resumeId || `seed-${i}`, name: c.name, email: c.email }))}
      resumes={(aiInviteFlow?.seed ?? []).map((c, i) => ({
        id: c.resumeId || `seed-${i}`, name: c.name, email: c.email, phone: c.phone, title: c.title,
      }) as unknown as Resume)}
      onInvited={() => { setAiInviteFlow(null); setSelectedCandidates([]); clearJobSelection(); clearCandSelection(); }}
    />
  );


  /* Invite to Assessment and its Share step — like `aiInviteDialog` above,
     rendered in EVERY view branch that offers Invite Assessment (history,
     results and the default view). Each branch returns its own tree, and the
     two used to be mounted in the default view only, so the action did
     nothing from the results or history views. */
  const assessmentInviteDialogs = (
    <>
        {/* Invite to Assessment — the shared dialog (InviteToAssessmentFlow),
            the same one a resume's Invite → Assessment opens: the Invite to AI
            Interview dialog's layout, with this page's own assessment list,
            multi-select and Send step. The candidates are the ones the action
            was started for — the All Resumes selection when it seeded
            `pendingInviteRecipients`, else the selected matches. */}
        {(() => {
          const inviteCandidates: { id: string; name: string; email?: string; phone?: string; title?: string }[] =
            pendingInviteRecipients
              ? pendingInviteRecipients.map(r => ({ id: r.id, name: r.name, email: r.email }))
              : (viewMode === 'results' ? matchedCandidates : getResolvedHistoryCandidates(selectedHistoryItem))
                  .filter(c => selectedCandidates.includes(c.id))
                  .map(c => ({ id: c.id, name: c.name, email: c.email || undefined, phone: c.phone, title: c.title }));
          return (
            <InviteToAssessmentFlow
              open={isAssessmentModalOpen}
              onClose={() => {
                setIsAssessmentModalOpen(false);
                setSelectedAssessments([]);
                setPendingInviteRecipients(null);
                setPendingInviteJobId(null);
              }}
              assessments={assessments}
              multiple
              selectedAssessments={selectedAssessments}
              onSelectedAssessmentsChange={setSelectedAssessments}
              candidates={inviteCandidates.map(c => ({ id: c.id, name: c.name, email: c.email }))}
              resumes={inviteCandidates.map(c => ({
                id: c.id, name: c.name, email: c.email, phone: c.phone, title: c.title,
              }) as unknown as Resume)}
              onProceed={handleProceedToInvite}
              /* The job the candidates were matched against — the same one the
                 Invite AI Interview dialog is scoped to — so this opens on that
                 job's assessment versions. None for the cross-job All Resumes
                 selection, which gets the full list. */
              jobId={pendingInviteRecipients
                ? (pendingInviteJobId ?? undefined)
                : (selectedJob || selectedHistoryItem?.jobId || undefined)}
            />
          );
        })()}

        {/* Share Assessment Modal */}
        {isShareModalOpen && selectedAssessments.length > 0 && (
          <ShareAssessmentModal
            isOpen={isShareModalOpen}
            onClose={() => {
              setIsShareModalOpen(false);
              setCurrentAssessmentForShare(null);
              setSelectedAssessments([]);
              setPrefilledCandidates([]);
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

  // View: Matching in Progress (direct flow from resume-view / deep link)
  // A scored candidate's full scorecard — Resume Scoring's page, kept on
  // this page's trail.
  if (scoreDetailView) {
    const close = closeScoreDetail;
    const detail = scoreDetailsByJd[scoreDetailView.jdId]?.[scoreDetailView.scoreId];
    if (!detail) {
      return (
        <main className="flex-1 bg-slate-50">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
              <PageBreadcrumb
                className="mb-4 md:mb-6"
                items={[
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'AI Talent Match', onClick: close },
                  { label: scoreDetailView.jobTitle || 'Job', onClick: close },
                ]}
              />
              {scoreDetailsByJd[scoreDetailView.jdId] ? (
                <div className="text-sm text-gray-600">
                  This score could not be found.{' '}
                  <button type="button" onClick={close} className="text-brand-blue hover:underline">Back to AI Talent Match</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading scorecard...
                </div>
              )}
            </div>
          </div>
        </main>
      );
    }
    return (
      <>
      {createSendDialogEl}
      <CandidateScoringDetailPage
        resume={detail}
        jobTitle={scoreDetailView.jobTitle}
        jobId={scoreDetailView.jdId}
        /* Invite -> Create / Send for this score's job — Job Details' popup. */
        onOpenInviteDialog={(kind, candidates) => openCreateSend(kind, scoreDetailView.jdId, candidates, scoreDetailView.jobTitle)}
        onBack={close}
        // Version dropdown: that version's score for this job, in place.
        onSelectScore={(scoreId) => {
          if (scoreDetailsByJd[scoreDetailView.jdId]?.[scoreId]) moveScoreDetail({ jdId: scoreDetailView.jdId, scoreId });
        }}
        // Prev / Next — the list this scorecard was opened from.
        {...(() => {
          const idx = scoreNavList.findIndex(r => r.jdId === scoreDetailView.jdId && r.scoreId === scoreDetailView.scoreId);
          if (idx < 0 || scoreNavList.length < 2) return {};
          return {
            currentIndex: idx,
            totalCount: scoreNavList.length,
            onPrev: idx > 0 ? () => moveScoreDetail(scoreNavList[idx - 1]) : undefined,
            onNext: idx < scoreNavList.length - 1 ? () => moveScoreDetail(scoreNavList[idx + 1]) : undefined,
          };
        })()}
        assessmentConfigured={inviteTargets.hasAssessment(scoreDetailView.jdId)}
        aiInterviewConfigured={inviteTargets.hasAIInterview(scoreDetailView.jdId)}
        breadcrumbItems={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'AI Talent Match', onClick: close },
          { label: scoreDetailView.jobTitle || 'Job', onClick: close },
          { label: detail.candidateName || 'Candidate' },
        ]}
      />
      </>
    );
  }

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

      // The rating pill: candidates with at least one match in that band.
      const matchesBand = !candidateRatingBand ||
        row.jobs.some(job => matchBandForRating(toMatchRating(job.score)) === candidateRatingBand);

      return matchesSearch && matchesLocation && matchesJob && matchesScore && matchesMultiJob &&
        matchesPhone && matchesExpMin && matchesExpMax && matchesDateFrom && matchesDateTo && matchesBand;
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
      if (candidateSortBy === 'scored') {
        // Job versions scored in Resume Scoring; ties → more matched versions first.
        const scoredOf = (row: CandidateMatchRow) => row.jobs.filter(j => !!scoreIdFor(j.jobId, j.resumeId)).length;
        return (scoredOf(a) - scoredOf(b)) * direction || b.jobs.length - a.jobs.length;
      }
      if (candidateSortBy === 'titles') {
        const titlesOf = (row: CandidateMatchRow) => new Set(row.jobs.map(j => j.jobTitle).filter(Boolean)).size;
        return (titlesOf(a) - titlesOf(b)) * direction || b.jobs.length - a.jobs.length;
      }
      return (a.jobs.length - b.jobs.length) * direction;
    });

    /** A View by Candidates column header that sorts the table (click again to flip). */
    const candidateSortHeader = (key: CandidateSortKey, label: string, align: 'left' | 'center' = 'left') => {
      const active = candidateSortBy === key;
      const Icon = !active ? ArrowUpDown : candidateSortOrder === 'asc' ? ArrowUp : ArrowDown;
      return (
        <th
          aria-sort={active ? (candidateSortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
          className={`${align === 'center' ? 'text-center' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap`}
        >
          <button
            type="button"
            onClick={() => {
              if (active) {
                setCandidateSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
              } else {
                setCandidateSortBy(key);
                // Names A→Z first; counts and dates highest / newest first.
                setCandidateSortOrder(key === 'name' ? 'asc' : 'desc');
              }
            }}
            title={`Sort by ${label}`}
            className={`group inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors hover:text-brand-blue ${active ? 'text-brand-blue' : ''}`}
          >
            {label}
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
          </button>
        </th>
      );
    };

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
      // Scoring is against one job, and the review shows that job — so, as
      // with AI Interview invites, a selection spanning jobs is narrowed first.
      if (selectedAllResumeJobGroups.length > 1) {
        toast.error('Scoring is per job — select candidates for one job at a time.');
        return;
      }
      const group = selectedAllResumeJobGroups[0];
      const item = group && matchHistory.find(h => h.id === group.historyId);
      if (!item) return;
      const candidates = await loadHistoryCandidates(item);
      const ids = group.entries
        .map(({ job }) => candidates.find(c => c.resumeId === job.resumeId)?.id)
        .filter((id): id is string => !!id);
      if (ids.length === 0) return;
      setSelectedHistoryItem(item);
      setSelectedJob(item.jobId);
      await handleSubmitToScoring(ids, { candidates, jobId: item.jobId, jobTitle: item.jobTitle });
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
      setPendingInviteJobId(null); // cross-job selection — full assessment list
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
      handleInviteAIInterview(seed, item?.jobId);
    };

    /* ---- Rating pills + View by Job (Resume Scoring's layout) ----
       Every job's candidates come from its match session (prefetched in the
       background into `historyCandidatesById`); a job's Rating 10 / 9 – 7 /
       Below 7 tally, the pill counts and the rating filter all read them, so
       a count and the rows it opens can't disagree. */
    const bandOf = (c: { matchScore?: number }): RatingBand => matchBandForRating(toMatchRating(c.matchScore ?? 0));
    // A candidate's matched jobs under the rating pill (View by Candidates).
    const bandJobsOf = <T extends { score: number }>(list: T[]): T[] =>
      candidateRatingBand ? list.filter(j => matchBandForRating(toMatchRating(j.score)) === candidateRatingBand) : list;
    /** A candidate's matched jobs (under the rating pill), in its inner table's sort order. */
    const innerJobsOf = (rowKey: string, list: CandidateMatchRow['jobs']): CandidateMatchRow['jobs'] => {
      const sort = candJobSortByRow[rowKey] ?? DEFAULT_CAND_JOB_SORT;
      const sign = sort.dir === 'asc' ? 1 : -1;
      const jobRecordOf = (jdId: string) => jobs.find(j => j.id === jdId);
      const valueOf = (j: CandidateMatchRow['jobs'][number]): number | string => {
        switch (sort.key) {
          case 'rating': return j.score ?? 0;
          case 'jdId': return jobRecordOf(j.jobId)?.jobId || '';
          case 'title': return j.jobTitle || '';
          case 'jobVersion': return jobRecordOf(j.jobId)?.currentVersion ?? 1;
          case 'scored': return scoreIdFor(j.jobId, j.resumeId) ? 1 : 0;
          case 'resumeVersion': return j.resumeVersion ?? 1;
          default: return new Date(j.matchedAt).getTime();
        }
      };
      return bandJobsOf(list).slice().sort((a, b) => {
        const va = valueOf(a);
        const vb = valueOf(b);
        const diff = typeof va === 'string' || typeof vb === 'string'
          // numeric-aware so JD-9 sorts before JD-10
          ? String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
          : (va as number) - (vb as number);
        // Ties: newest match first.
        return diff * sign || new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime();
      });
    };
    const innerJobSortHeader = (rowKey: string, key: CandJobSortKey, label: string, align: 'left' | 'center', extraClass = '') => {
      const sort = candJobSortByRow[rowKey] ?? DEFAULT_CAND_JOB_SORT;
      const active = sort.key === key;
      const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
      return (
        <th
          aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
          className={`${align === 'center' ? 'text-center' : 'text-left'} py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${extraClass}`}
        >
          <button
            type="button"
            onClick={() => {
              setCandJobSortByRow(prev => ({
                ...prev,
                [rowKey]: active
                  ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
                  : { key, dir: CAND_JOB_SORT_FIRST_DIR[key] },
              }));
              setCandidateJobsPage(rowKey, 1);
            }}
            title={`Sort by ${label}`}
            className={`group inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors hover:text-brand-blue ${active ? 'text-brand-blue' : ''}`}
          >
            {label}
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
          </button>
        </th>
      );
    };
    const jobLoaded = (item: MatchHistory) =>
      (item.totalMatches || 0) <= 0 || historyCandidatesById[item.id] !== undefined || failedHistorySessionIds.has(item.id);
    const jobCandidates = (item: MatchHistory): MatchedCandidateWithVersions[] => historyCandidatesById[item.id] ?? [];
    const jobTally = (item: MatchHistory) =>
      jobCandidates(item).reduce(
        (acc, c) => { acc[bandOf(c)] += 1; return acc; },
        { exact: 0, partial: 0, no_match: 0 } as Record<RatingBand, number>,
      );
    const jobCandidatesInBand = (item: MatchHistory) =>
      candidateRatingBand ? jobCandidates(item).filter(c => bandOf(c) === candidateRatingBand) : jobCandidates(item);

    // Pill counts: the loaded sessions' tally once every one is in; until
    // then the server's band counts (Rating 10 / 9 – 7) and the runs' totals.
    const loadedTally = matchHistory.reduce(
      (acc, item) => {
        const t = jobTally(item);
        acc.exact += t.exact; acc.partial += t.partial; acc.no_match += t.no_match;
        return acc;
      },
      { exact: 0, partial: 0, no_match: 0 } as Record<RatingBand, number>,
    );
    const runsTotal = matchHistory.reduce((sum, item) => sum + (item.totalMatches || 0), 0);
    const pillCounts: Record<RatingBand | 'all', number | null> = topStatsReady
      ? { all: loadedTally.exact + loadedTally.partial + loadedTally.no_match, ...loadedTally }
      : {
          all: runsTotal,
          exact: ratingBandCounts?.exact ?? null,
          partial: ratingBandCounts?.partial ?? null,
          no_match: ratingBandCounts ? Math.max(0, runsTotal - ratingBandCounts.exact - ratingBandCounts.partial) : null,
        };

    /* View by Job under a rating pill: only jobs with such a match. A job
       whose candidates haven't loaded yet stays listed — an unloaded list
       would otherwise hide every job. */
    const bandHistory = candidateRatingBand
      ? sortedHistory.filter(item => !jobLoaded(item) || jobTally(item)[candidateRatingBand] > 0)
      : sortedHistory;
    const pageHistory = bandHistory.slice((historyCurrentPage - 1) * historyItemsPerPage, historyCurrentPage * historyItemsPerPage);
    // A run that matched nobody has nothing to tick.
    const jobKeys = bandHistory.filter(item => (item.totalMatches || 0) > 0).map(item => item.id);
    const pageJobKeys = pageHistory.filter(item => (item.totalMatches || 0) > 0).map(item => item.id);
    const isJobPartlySelected = (k: string) => !selectedJobKeys.has(k) && (partialJobRows[k]?.length ?? 0) > 0;
    const allJobsSelected = jobKeys.length > 0 && jobKeys.every(k => selectedJobKeys.has(k));
    const tickedJobs = bandHistory.filter(item => selectedJobKeys.has(item.id) || isJobPartlySelected(item.id));
    const selectedJobCount = tickedJobs.length;
    // The candidates the Actions run on: every one of a ticked job (rating
    // pill applied), or just the ticked ones of a partly ticked job.
    const jobViewSelectedRows: MatchInviteRow[] = tickedJobs.flatMap(item => {
      const ids = selectedJobKeys.has(item.id) ? null : new Set(partialJobRows[item.id] ?? []);
      return jobCandidatesInBand(item)
        .filter(c => !ids || ids.has(c.id))
        .map(c => toInviteRow(item.id, item.jobId, c));
    });
    const jobViewSelectionLoading = tickedJobs.some(item => !jobLoaded(item));

    const jobExportColumns: ExportColumn[] = [
      { key: 'jdCode', header: 'Job ID' },
      { key: 'jobTitle', header: 'Job Title' },
      { key: 'rating', header: 'Matched Rating' },
      { key: 'name', header: 'Candidate Name' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      { key: 'location', header: 'Location' },
      { key: 'experience', header: 'Experience' },
      { key: 'resumeVersion', header: 'Resume Version' },
      { key: 'matchedOn', header: 'Matched On' },
      { key: 'matchedBy', header: 'Matched By' },
    ];
    /** Export `exportRows` — each row's match record, from its session. */
    const handleExportRows = async (format: 'csv' | 'xlsx', picked?: string[]) => {
      const rows = (exportRows ?? []).flatMap(r => {
        const item = matchHistory.find(h => h.id === r.historyId);
        const c = (historyCandidatesById[r.historyId] ?? []).find(x => `${r.historyId}::${x.id}` === r.key);
        if (!item || !c) return [];
        return [{
          jdCode: jobs.find(j => j.id === item.jobId)?.jobId || '-',
          jobTitle: item.jobTitle,
          rating: toMatchRating(c.matchScore ?? 0),
          name: c.name || 'Unknown',
          email: c.email || '-',
          phone: c.phone || '-',
          location: c.location || '-',
          experience: c.experience || '-',
          resumeVersion: `v${c.resumeVersion || 1}`,
          matchedOn: formatISTDate(item.matchedAt.toISOString()),
          matchedBy: item.matchedByName || 'System',
        }];
      });
      const dateStamp = new Date().toISOString().slice(0, 10);
      const cols = picked ? jobExportColumns.filter(c => picked.includes(c.header)) : jobExportColumns;
      await exportData(format, rows, cols, `AI_Talent_Match_${dateStamp}`, {
        sheetName: 'AI Talent Match',
        title: 'AI Talent Match - Matched Candidates',
      });
      toast.success(`Exported ${rows.length} candidate${rows.length !== 1 ? 's' : ''} to ${format === 'xlsx' ? 'Excel' : 'CSV'}`);
    };

    /* ---- View by Candidates selection (Resume Scoring's) ---- */
    /** One matched job's ⋮ items under a candidate — Preview Resume, Score
     *  Resume / View Scorecard, the invites. Shared by the List view's inner
     *  table and the Grid view's opened card, so both offer the same. */
    const candJobMenuItems = (
      row: CandidateMatchRow,
      job: CandidateMatchRow['jobs'][number],
      jobScoreId: string | undefined,
      candScoreNav: ScoreRef[],
    ) => (
      <>
        <DropdownMenuItem
          className={actionsMenuItemClass}
          disabled={!job.resumeId}
          onSelect={() => job.resumeId && setPreviewResume({ id: job.resumeId, name: row.name || 'Resume' })}
        >
          <Eye className="w-4 h-4 text-menu-icon-view" />
          <span className={MENU_ITEM_SCALE_CLASS}>Preview Resume</span>
        </DropdownMenuItem>
        {jobScoreId ? (
          /* Already scored for this job — open that scorecard. */
          <DropdownMenuItem
            className={actionsMenuItemClass}
            onSelect={() => openScoreDetail(job.jobId, job.jobTitle, jobScoreId, candScoreNav)}
          >
            <FileText className="w-4 h-4 text-menu-icon-score" />
            <span className={MENU_ITEM_SCALE_CLASS}>View Scorecard</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className={`${actionsMenuItemClass} ${!canRunScoring ? 'opacity-50' : ''}`}
            disabled={!job.resumeId}
            title={!canRunScoring ? 'You do not have permission to score resumes' : undefined}
            onSelect={() => {
              if (!canRunScoring) {
                toast.error('You do not have permission to score resumes');
                return;
              }
              void scoreJobMatchCandidate(job);
            }}
          >
            <ClipboardList className="w-4 h-4 text-menu-icon-score" />
            <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-1 bg-gray-100" />
        {renderRowInviteItems(
          {
            key: `${job.historyId}::${job.candidateId ?? ''}`,
            historyId: job.historyId,
            jobId: job.jobId,
            name: row.name || 'Candidate',
            email: row.email,
            phone: row.phone,
            title: row.title,
            resumeId: job.resumeId,
          },
          'candidates',
          job.jobTitle,
        )}
      </>
    );

    const candRowsOf = (row: CandidateMatchRow, only?: Set<string>): MatchInviteRow[] =>
      bandJobsOf(row.jobs)
        .filter(j => !only || only.has(j.historyId))
        .map(j => ({
          key: `${j.historyId}::${j.candidateId ?? ''}`,
          historyId: j.historyId,
          jobId: j.jobId,
          name: row.name || 'Candidate',
          email: row.email,
          phone: row.phone,
          title: row.title,
          resumeId: j.resumeId,
        }));
    /* Job Titles cell: the first two titles and a "+N more" chip; a click
       opens a small popup listing every title under "All (N)", each with how
       many of its versions this candidate matched. Clicks inside stop here so
       the row doesn't also open / close. */
    const renderJobTitlesCell = (row: CandidateMatchRow) => {
      const versionsByTitle = new Map<string, number>();
      row.jobs.forEach(j => {
        if (!j.jobTitle) return;
        versionsByTitle.set(j.jobTitle, (versionsByTitle.get(j.jobTitle) ?? 0) + 1);
      });
      const titles = Array.from(versionsByTitle.keys());
      const hidden = Math.max(0, titles.length - 2);
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Show all job titles"
              className="block text-left space-y-0.5 rounded-md -m-1 p-1 hover:bg-brand-blue/5 transition-colors"
            >
              {titles.slice(0, 2).map(title => (
                <span key={title} className="block text-sm text-gray-700 dark:text-slate-300">{title}</span>
              ))}
              {hidden > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 whitespace-nowrap">
                  +{hidden} more
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 p-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                All ({titles.length})
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {row.jobs.length} job {row.jobs.length === 1 ? 'version' : 'versions'}
              </span>
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {titles.map(title => (
                <li key={title} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-gray-700 dark:text-slate-300">
                  <span className="min-w-0 truncate" title={title}>{title}</span>
                  {(versionsByTitle.get(title) ?? 0) > 1 && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-2xs font-semibold tabular-nums bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                      {versionsByTitle.get(title)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      );
    };

    const candKeys = sortedCandidateRows.map(r => r.key);
    const pageCandKeys = paginatedCandidateRows.map(r => r.key);
    const isCandPartly = (k: string) => !selectedCandKeys.has(k) && (partialCandJobs[k]?.length ?? 0) > 0;
    const allCandsSelected = candKeys.length > 0 && candKeys.every(k => selectedCandKeys.has(k));
    const tickedCands = sortedCandidateRows.filter(r => selectedCandKeys.has(r.key) || isCandPartly(r.key));
    const candViewSelectedRows: MatchInviteRow[] = tickedCands.flatMap(r =>
      candRowsOf(r, selectedCandKeys.has(r.key) ? undefined : new Set(partialCandJobs[r.key] ?? [])));

    /* Row 3 of either view — only while something is ticked: the Actions
       menu (Score Resumes, Export, AI Assessment / AI Interview Invite with
       "＋ Create …") and Clear. */
    const renderBulkActionsRow = (
      rows: MatchInviteRow[],
      count: number,
      noun: { one: string; many: string },
      loading: boolean,
      onClear: () => void,
      view: 'job' | 'candidates',
    ) => {
      if (count === 0) return null;
      const itemFor = (jdId: string) => {
        const r = rows.find(x => x.jobId === jdId);
        return r ? matchHistory.find(h => h.id === r.historyId) : undefined;
      };
      const guard = (): boolean => {
        if (loading) { toast.info('Candidates are still loading — try again in a moment'); return false; }
        if (rows.length === 0) {
          toast.warning(candidateRatingBand
            ? `The selected ${noun.many} have no matches in this rating`
            : `The selected ${noun.many} have no matches`);
          return false;
        }
        return true;
      };
      const oneJob = (): string | null => {
        const ids = Array.from(new Set(rows.map(r => r.jobId)));
        if (ids.length > 1) {
          toast.error('This runs per job — select candidates for one job at a time.');
          return null;
        }
        return ids[0] ?? null;
      };
      const targets: InviteTargetJob[] = Array.from(new Set(rows.map(r => r.jobId)))
        .map(jdId => inviteTargetJobOf(jdId, itemFor(jdId)?.jobTitle));
      const create = (kind: InviteHandoffKind) => (job: InviteTargetJob) =>
        setCreateInviteTarget({ kind, job, rows: rows.filter(r => r.jobId === job.jdId), view });
      /* Score Resumes and both invites run per job here, so with candidates
         from several jobs ticked all three are greyed with the reason —
         not just the assessment one (the shared resolver lets an AI
         Interview span jobs, which this page's invite cannot). */
      const multiJob = targets.length > 1;
      return (
        <div className="mt-3 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative h-[38px] px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                aria-label={`Actions for ${count} selected ${count === 1 ? noun.one : noun.many}`}
              >
                <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                </span>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Actions ({count})
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
              {/* Light grey header strip: how many the actions run on. */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                {count} {count === 1 ? noun.one : noun.many} selected
              </div>
              {/* Score Resumes — the ticked candidates not yet scored against
                  their job (scoring runs per job). */}
              {multiJob && canRunScoring ? (
                <DropdownMenuItem className={`${actionsMenuItemClass} !items-start text-gray-400`} disabled>
                  <ClipboardList className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block">Score Resumes</span>
                    <span className="block text-2xs text-gray-400 normal-case">Select candidates from one job to score them</span>
                  </span>
                </DropdownMenuItem>
              ) : (
              <DropdownMenuItem
                className={`${actionsMenuItemClass} ${!canRunScoring ? 'text-gray-400 opacity-60' : ''}`}
                onSelect={(e) => {
                  if (!canRunScoring) {
                    e.preventDefault();
                    toast.error('You do not have permission to score resumes');
                    return;
                  }
                  if (!guard()) return;
                  const jdId = oneJob();
                  if (!jdId) return;
                  const item = itemFor(jdId);
                  if (!item) return;
                  const toScore = rows.filter(r => !!r.resumeId && !scoreIdFor(item.jobId, r.resumeId));
                  const already = rows.length - toScore.length;
                  if (toScore.length === 0) {
                    toast.info('All selected candidates are already scored for this job — use View Scorecard.');
                    return;
                  }
                  if (already > 0) toast.info(`${already} already scored — scoring the other ${toScore.length}.`);
                  setSelectedHistoryItem(item);
                  setSelectedJob(item.jobId);
                  void (async () => {
                    const candidates = await loadHistoryCandidates(item);
                    await handleSubmitToScoring(
                      toScore.map(r => r.key.split('::')[1]),
                      { candidates, jobId: item.jobId, jobTitle: item.jobTitle },
                    );
                  })();
                }}
              >
                <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                <span className={MENU_ITEM_SCALE_CLASS}>Score Resumes</span>
              </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className={`${actionsMenuItemClass} ${!canExport ? 'text-gray-400 opacity-60' : ''}`}
                onSelect={(e) => {
                  if (!canExport) {
                    e.preventDefault();
                    toast.error('You do not have permission to export');
                    return;
                  }
                  if (guard()) {
                    // Candidates view rows come from every session — make
                    // sure each is loaded before the file is written.
                    rows.forEach(r => {
                      const item = matchHistory.find(h => h.id === r.historyId);
                      if (item) void loadHistoryCandidates(item, { silent: true });
                    });
                    setExportRows(rows);
                  }
                }}
              >
                <FileDown className="w-4 h-4 text-menu-icon-download" />
                <span className={MENU_ITEM_SCALE_CLASS}>Export</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-gray-100" />
              {renderInviteTargetItems({
                kind: 'assessment',
                // One job -> the popup (it offers Create); several -> greyed.
                target: resolveInviteTargetState('assessment', targets, () => true),
                label: 'Create / Send Assessment',
                itemClass: actionsMenuItemClass,
                allowed: canCreateAssessments,
                onInvite: (e) => {
                  if (!canCreateAssessments) {
                    e.preventDefault();
                    toast.error('You do not have permission to invite to an assessment');
                    return;
                  }
                  if (!guard()) return;
                  const jdId = oneJob();
                  if (jdId) openInviteForRows('assessment', jdId, rows);
                },
                onCreate: create('assessment'),
              })}
              {renderInviteTargetItems({
                kind: 'interview',
                target: multiJob
                  ? { state: 'multi' }
                  : { state: 'ready' },
                label: 'Create / Send AI Interview',
                itemClass: actionsMenuItemClass,
                allowed: canCreateAIInterviews,
                onInvite: (e) => {
                  if (!canCreateAIInterviews) {
                    e.preventDefault();
                    toast.error('You do not have permission to invite to an AI interview');
                    return;
                  }
                  if (!guard()) return;
                  const jdId = oneJob();
                  if (!jdId) return;
                  const item = itemFor(jdId);
                  if (item) {
                    setSelectedHistoryItem(item);
                    setSelectedJob(item.jobId);
                  }
                  openInviteForRows('interview', jdId, rows);
                },
                onCreate: create('interview'),
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={onClear}
            title="Clear the selection"
            className={TOOLBAR_BUTTON_CLASS}
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        </div>
      );
    };

    /* The row every view draws first (Resume Scoring's): WHAT to show — the
       rating pills, each with its count — then HOW to group it, View by
       Job / Candidates as one sliding toggle. Any grouping combines with any
       rating: "Job + Rating 10" lists the jobs that have a 10, each opening
       its own 10s. */
    const pillClass = (active: boolean) =>
      `inline-flex items-center gap-2 h-[38px] px-3 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
        active
          ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
          : 'bg-brand-blue/5 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/10 hover:text-brand-blue'
      }`;
    const pillCountClass = (active: boolean) =>
      `px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums ${
        active ? 'bg-white/20 text-white' : 'bg-white text-brand-blue ring-1 ring-brand-blue/15 dark:bg-slate-800'
      }`;
    const ratingFilters: { id: RatingBand | null; label: string; count: number | null }[] = [
      { id: null, label: 'All', count: pillCounts.all },
      { id: 'exact', label: 'Rating 10', count: pillCounts.exact },
      { id: 'partial', label: 'Rating 9 – 7', count: pillCounts.partial },
      { id: 'no_match', label: 'Rating Below 7', count: pillCounts.no_match },
    ];
    const isCandidatesView = historyPageView === 'candidates' || historyPageView === 'resumes';
    const viewPills = (
      <div className="flex items-center gap-2 flex-wrap">
        <div role="group" aria-label="Filter by match rating" className="flex items-center gap-2 flex-wrap">
          {ratingFilters.map(f => {
            const active = candidateRatingBand === f.id;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  setCandidateRatingBand(f.id);
                  setHistoryCurrentPage(1);
                  setCandidateCurrentPage(1);
                  setResumeCurrentPage(1);
                }}
                aria-pressed={active}
                className={pillClass(active)}
              >
                {f.label}
                {f.count === null ? (
                  <span className="inline-block h-4 w-6 rounded bg-white/60 dark:bg-slate-700 animate-pulse" aria-label="Loading" />
                ) : (
                  <span className={pillCountClass(active)}>{f.count.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>

        <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300 whitespace-nowrap">View by</span>
          <div
            role="radiogroup"
            aria-label="View by"
            className="relative grid grid-cols-2 h-[38px] p-1 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10"
          >
            <span
              aria-hidden
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white dark:bg-slate-800 shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
                viewTileRight ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            {([
              // Switching in place — no scroll, search kept (Resume Scoring's toggle).
              { id: 'jobs', label: 'Job', icon: Briefcase, active: !isCandidatesView, open: () => { setHistoryCurrentPage(1); setHistoryPageView('list'); } },
              {
                id: 'candidates', label: 'Candidates', icon: Users, active: isCandidatesView, open: () => {
                  setHistoryPageView('candidates');
                  if (!loadingCandidateRows && candidateRows.length === 0) void buildCandidateRows();
                },
              },
            ]).map(view => (
              <button
                key={view.id}
                type="button"
                role="radio"
                aria-checked={view.active}
                onClick={view.open}
                className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-300 ${
                  view.active ? 'text-brand-blue' : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                }`}
              >
                <view.icon className="w-4 h-4" />
                {view.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );

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
                  toast.error('You do not have permission to run AI Talent Match');
                  return;
                }
                setViewMode('new');
                setSelectedJob('');
                setSelectedCandidates([]);
                router.push('/recruitment/ai-talent-match', { scroll: false });
              }}
              aria-disabled={!canRunAiMatch}
              title={!canRunAiMatch ? 'You do not have permission to run AI Talent Match' : ''}
              className={`w-full sm:w-auto ${!canRunAiMatch ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run AI Match
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {/* Default 4-column grid (same as /recruitment/job-openings) keeps the
            cards at the standard width instead of stretching them to half-page. */}
        {/* Stats cards (SHOW_STAT_CARDS) — the Job Descriptions / Resume
            Scoring StatsCards (icon, count, a small chip under it,
            highlighted when selected). One rule on every card: the big
            number is what the title says, the chip is always "N candidates"
            — the different people behind it. All Matches / Rating 10 /
            Rating 9-7 are the same counts as the pills below. Matched Jobs /
            All Matches switch the View by toggle; the rating cards are the
            same filter as the pills. */}
        {SHOW_STAT_CARDS && (() => {
          const statLoading = (
            <span className="inline-block h-6 w-8 bg-gray-100 dark:bg-slate-800 rounded animate-pulse align-middle" aria-label="Loading" />
          );
          const pickBand = (band: RatingBand) => {
            setCandidateRatingBand(prev => (prev === band ? null : band));
            setHistoryCurrentPage(1);
            setCandidateCurrentPage(1);
            setResumeCurrentPage(1);
          };
          const onCandidates = historyPageView === 'candidates' || historyPageView === 'resumes';
          /* The chip under each count, as the JD cards carry "N versions" and
             Resume Scoring's "N candidates". */
          const StatChip = ({ count, unit, units = `${unit}s` }: { count: number; unit: string; units?: string }) => (
            <span className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
              {count.toLocaleString()} {count === 1 ? unit : units}
            </span>
          );
          // Distinct candidates holding a match in the band — only once the
          // candidate roll-up is in, so the chip never shows a false 0.
          const rowsLoaded = !loadingCandidateRows && candidateRows.length > 0;
          const peopleInBand = (band: RatingBand) =>
            candidateRows.filter(row => row.jobs.some(job => matchBandForRating(toMatchRating(job.score)) === band)).length;
          return (
        <div className="mb-4 sm:mb-5">
        <StatsCardGrid className="mb-0">
          <StatsCard
            tone="neutral"
            active={!onCandidates}
            showClickArrow
            icon={History}
            label="Matched Jobs"
            value={matchHistory.length.toLocaleString()}
            sparkline={false}
            title={`${matchHistory.length.toLocaleString()} jobs have AI Talent Match results`
              + (totalMatchedCandidatesReady ? `, matching ${totalMatchedCandidates.toLocaleString()} different candidates` : '')
              + '. Click to view by job.'}
            onClick={() => openHistoryListView()}
          >
            {totalMatchedCandidatesReady && <StatChip count={totalMatchedCandidates} unit="candidate" />}
          </StatsCard>
          <StatsCard
            tone="neutral"
            active={onCandidates}
            showClickArrow
            icon={User}
            label="All Matches"
            value={pillCounts.all === null ? statLoading : pillCounts.all.toLocaleString()}
            sparkline={false}
            title={pillCounts.all === null ? undefined
              : `${pillCounts.all.toLocaleString()} candidate–job matches`
                + (totalMatchedCandidatesReady ? `, from ${totalMatchedCandidates.toLocaleString()} different candidates` : '')
                + ' (one candidate matched to 3 jobs counts as 3). Click to view by candidate.'}
            onClick={() => { void openCandidatesView(); }}
          >
            {totalMatchedCandidatesReady && <StatChip count={totalMatchedCandidates} unit="candidate" />}
          </StatsCard>
          <StatsCard
            tone="neutral"
            active={candidateRatingBand === 'exact'}
            showClickArrow
            icon={CheckCircle2}
            label="Match Rating (10)"
            value={pillCounts.exact === null ? statLoading : pillCounts.exact.toLocaleString()}
            sparkline={false}
            title={pillCounts.exact === null ? undefined
              : `${pillCounts.exact.toLocaleString()} matches rated 10`
                + (rowsLoaded ? `, from ${peopleInBand('exact').toLocaleString()} different candidates` : '')
                + '. Click to show only these; click again to clear.'}
            onClick={() => pickBand('exact')}
          >
            {rowsLoaded && <StatChip count={peopleInBand('exact')} unit="candidate" />}
          </StatsCard>
          <StatsCard
            tone="neutral"
            active={candidateRatingBand === 'partial'}
            showClickArrow
            icon={PieChart}
            label="Match Rating (9-7)"
            value={pillCounts.partial === null ? statLoading : pillCounts.partial.toLocaleString()}
            sparkline={false}
            title={pillCounts.partial === null ? undefined
              : `${pillCounts.partial.toLocaleString()} matches rated 9 to 7`
                + (rowsLoaded ? `, from ${peopleInBand('partial').toLocaleString()} different candidates` : '')
                + '. Click to show only these; click again to clear.'}
            onClick={() => pickBand('partial')}
          >
            {rowsLoaded && <StatChip count={peopleInBand('partial')} unit="candidate" />}
          </StatsCard>
        </StatsCardGrid>
        </div>
          );
        })()}

        {/* ── Match by Candidate (in-page) ───────────────────────────────── */}
        {historyPageView === 'candidates' && (
          /* One card around the whole view, as View by Job (Resume Scoring's shell). */
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700/60 p-4 sm:p-6">
            <div ref={historyListSectionRef} className="scroll-mt-4" aria-hidden="true" />

            <div className="mb-4">
              <ListToolbar
                searchValue={candidateSearchQuery}
                onSearchChange={candidateSearch.setQuery}
                // The hook debounces into `appliedQuery`, so keystrokes pass through.
                searchDebounceMs={0}
                searchPlaceholder="Search candidates by name, email or job..."
                controlsFollowSearch
                leadingActions={
                  <>
                    <SearchableSelect
                      className="w-full sm:w-52"
                      value={candidateFilterJob === 'all' ? '' : candidateFilterJob}
                      onChange={(val) => candidateSearch.setFilter('job', val || 'all')}
                      options={candidateJobTitles.map(title => ({ value: title, label: clampOptionLabel(title) }))}
                      allLabel="All Matched Jobs"
                      placeholder="All Matched Jobs"
                      searchPlaceholder="Search job..."
                      ariaLabel="Filter by matched job"
                    />
                    <SearchableSelect
                      className="w-full sm:w-44"
                      value={candidateFilterMinScore ? String(candidateFilterMinScore) : ''}
                      onChange={(val) => candidateSearch.setFilter('minScore', val ? Number(val) : 0)}
                      options={[5, 7, 8, 9].map(n => ({ value: String(n), label: `Match ${n} and above` }))}
                      allLabel="Any Match"
                      placeholder="Any Match"
                      searchPlaceholder="Search..."
                      ariaLabel="Filter by minimum match"
                    />
                  </>
                }
                onToggleFilters={() => {
                  setShowCandidateFilters(!showCandidateFilters);
                }}
                filtersOpen={showCandidateFilters}
                activeFilterCount={candidateFiltersCount}
                filtersApplied={candidateFiltersApplied}
                onClearFilters={clearCandidateFilters}
                className="mb-0"
              >
                <SortByControl
                  value={candidateSortBy}
                  order={candidateSortOrder}
                  options={[
                    { value: 'jobs' as const, label: 'Matched Jobs' },
                    { value: 'score' as const, label: 'Best Match' },
                    { value: 'name' as const, label: 'Candidate Name' },
                    { value: 'scored' as const, label: 'Scored' },
                    { value: 'titles' as const, label: 'Job Titles' },
                    { value: 'date' as const, label: 'Last Matched' },
                  ]}
                  onChange={(v) => setCandidateSortBy(v)}
                  onToggleOrder={() => setCandidateSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                />
                <ListViewToggle
                  value={matchDisplayMode}
                  onChange={setDisplayModeEverywhere}
                  className="h-[38px] !border-brand-blue/10"
                />
              </ListToolbar>

              {showCandidateFilters && (
                <div className="mt-3 bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60 rounded-lg p-4">
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
                      <DateField
                        id="candidate-matched-from"
                        aria-label="Last matched from"
                        value={candidateFilterDateFrom}
                        max={candidateFilterDateTo || undefined}
                        onChange={(v) => candidateSearch.setFilter('dateFrom', v)}
                      />
                    </div>

                    <div>
                      <label htmlFor="candidate-matched-to" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Last Matched To</label>
                      <DateField
                        id="candidate-matched-to"
                        aria-label="Last matched to"
                        value={candidateFilterDateTo}
                        min={candidateFilterDateFrom || undefined}
                        onChange={(v) => candidateSearch.setFilter('dateTo', v)}
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

              {/* Row 2: Select All, the rating pills and View by toggle, Expand
                  all — the same row View by Job has. */}
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
                {candKeys.length > 0 && (
                  <>
                    <SelectAllMenu
                      selectedCount={tickedCands.length}
                      pageCount={pageCandKeys.length}
                      totalCount={candKeys.length}
                      noun="candidates"
                      allSelected={allCandsSelected}
                      onSelectPage={() => {
                        setSelectedCandKeys(prev => new Set([...prev, ...pageCandKeys]));
                        setPartialCandJobs(prev => {
                          const next = { ...prev };
                          pageCandKeys.forEach(k => { delete next[k]; });
                          return next;
                        });
                      }}
                      onSelectAll={() => {
                        setSelectedCandKeys(new Set(candKeys));
                        setPartialCandJobs({});
                      }}
                      onClear={clearCandSelection}
                    />
                    <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
                  </>
                )}
                {viewPills}
                {pageCandKeys.length > 0 && (() => {
                  const allOpen = pageCandKeys.every(k => expandedCandidateGroups.has(k));
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCandidateGroups(prev => {
                          const next = new Set(prev);
                          pageCandKeys.forEach(k => (allOpen ? next.delete(k) : next.add(k)));
                          return next;
                        })
                      }
                      aria-pressed={allOpen}
                      className={`${TOOLBAR_BUTTON_CLASS} sm:ml-auto`}
                    >
                      {allOpen ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
                      {allOpen ? 'Collapse all' : 'Expand all'}
                    </button>
                  );
                })()}
              </div>

              {/* Row 3 — only while candidates are ticked: Actions and Clear. */}
              {renderBulkActionsRow(candViewSelectedRows, tickedCands.length, { one: 'candidate', many: 'candidates' }, false, clearCandSelection, 'candidates')}
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
                {/* No tf-table-shell height cap here: the page itself scrolls,
                    and each opened candidate's job list scrolls in its own box. */}
                <div className={`${matchDisplayMode === 'grid' ? 'hidden' : 'hidden md:block'} rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
                        <tr>
                          <th className="w-10 pl-4 pr-1 py-3">
                            {(() => {
                              const allPage = pageCandKeys.length > 0 && pageCandKeys.every(k => selectedCandKeys.has(k));
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (allPage) {
                                      setSelectedCandKeys(prev => { const next = new Set(prev); pageCandKeys.forEach(k => next.delete(k)); return next; });
                                    } else {
                                      setSelectedCandKeys(prev => new Set([...prev, ...pageCandKeys]));
                                    }
                                    setPartialCandJobs(prev => { const next = { ...prev }; pageCandKeys.forEach(k => { delete next[k]; }); return next; });
                                  }}
                                  aria-label={allPage ? 'Deselect this page' : 'Select this page'}
                                  className="inline-flex p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                                >
                                  {allPage ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                                </button>
                              );
                            })()}
                          </th>
                          {candidateSortHeader('name', 'Candidate')}
                          {candidateSortHeader('jobs', 'Job Versions')}
                          {candidateSortHeader('scored', 'Scored', 'center')}
                          {candidateSortHeader('titles', 'Job Titles')}
                          {candidateSortHeader('date', 'Latest Matched')}
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                        {paginatedCandidateRows.map((row) => {
                          const isExpanded = expandedCandidateGroups.has(row.key);
                          const distinctTitles = Array.from(new Set(row.jobs.map(j => j.jobTitle).filter(Boolean))) as string[];
                          const titlesExpanded = expandedJobChips.has(row.key);
                          const hiddenTitleCount = Math.max(0, distinctTitles.length - 2);
                          const sortedJobs = [...row.jobs].sort((a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime());
                          const latestJob = sortedJobs[0];

                          const candSelected = selectedCandKeys.has(row.key);
                          const candPartly = isCandPartly(row.key);
                          const candAllJobIds = bandJobsOf(row.jobs).map(j => j.historyId);
                          const candTickedJobIds = candSelected ? candAllJobIds : (partialCandJobs[row.key] ?? []);
                          return (
                            <Fragment key={row.key}>
                              <tr
                                /* A click anywhere on the row opens / closes its matched
                                   jobs; the tick, name, "+N more" and Actions buttons
                                   stop the click and only do their own thing. */
                                onClick={() => toggleCandidateGroupExpanded(row.key)}
                                aria-expanded={isExpanded}
                                className={`cursor-pointer transition-colors ${candSelected ? 'bg-brand-blue/[0.04]' : 'hover:bg-gray-50/70 dark:hover:bg-slate-800/40'}`}
                              >
                                <td className="pl-4 pr-1 py-4 align-top">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleSelectCand(row.key); }}
                                    aria-pressed={candSelected ? true : candPartly ? 'mixed' : false}
                                    aria-label={candSelected || candPartly ? 'Deselect candidate' : 'Select candidate'}
                                    title={candPartly ? 'Some of this candidate\'s jobs are selected' : undefined}
                                    className="inline-flex p-1 mt-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                                  >
                                    {candSelected ? (
                                      <CheckSquare className="w-4 h-4 text-brand-blue" />
                                    ) : candPartly ? (
                                      <MinusSquare className="w-4 h-4 text-brand-blue" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-400" />
                                    )}
                                  </button>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className="min-w-0">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openCandidateResume(row, sortedCandidateRows); }}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block"
                                      >
                                        {row.name || 'Candidate'}
                                      </button>
                                      {row.email && <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{row.email}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 whitespace-nowrap">
                                    {row.jobs.length} Job {row.jobs.length === 1 ? 'Version' : 'Versions'}
                                  </span>
                                </td>
                                {/* Scored — of the Job Versions beside it, how many this
                                    candidate has been scored against in Resume Scoring. */}
                                <td className="px-4 py-4 align-top text-center whitespace-nowrap">
                                  {scoredResumeIdsByJd ? (() => {
                                    const scoredJobs = row.jobs.filter(j => !!scoreIdFor(j.jobId, j.resumeId)).length;
                                    return (
                                      <span
                                        title={`Scored against ${scoredJobs} of ${row.jobs.length} matched job versions`}
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border tabular-nums ${
                                          scoredJobs > 0
                                            ? 'bg-success-subtle text-success border-success/20'
                                            : 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700'
                                        }`}
                                      >
                                        {scoredJobs} of {row.jobs.length}
                                      </span>
                                    );
                                  })() : <span className="inline-block h-6 w-14 rounded-full bg-gray-100 dark:bg-slate-800 animate-pulse" aria-label="Loading" />}
                                </td>
                                <td className="px-4 py-4 align-top">
                                  {renderJobTitlesCell(row)}
                                </td>
                                <td className="px-4 py-4 align-top whitespace-nowrap">
                                  <div className="text-sm text-gray-900 dark:text-slate-100">{formatISTDate(latestJob.matchedAt.toISOString())}</div>
                                  <div className="text-xs text-gray-500 dark:text-slate-500">{formatISTTime(latestJob.matchedAt.toISOString())}</div>
                                </td>
                                <td className="px-4 py-4 align-top" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1.5">
                                    {/* ▾ — opens or closes this candidate's matched jobs; first in
                                        Actions, as on Resume Scoring. */}
                                    <button
                                      type="button"
                                      onClick={() => toggleCandidateGroupExpanded(row.key)}
                                      aria-expanded={isExpanded}
                                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                      title={isExpanded ? 'Collapse' : 'Expand'}
                                      className={isExpanded ? ROW_ACTION_BUTTON_ACTIVE_CLASS : ROW_ACTION_BUTTON_CLASS}
                                    >
                                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openCandidateResume(row, sortedCandidateRows)}
                                      title="View Resume"
                                      aria-label="View Resume"
                                      className={ROW_ACTION_BUTTON_CLASS}
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAttachmentsClick(row.best)}
                                      title="Attachments"
                                      aria-label="Attachments"
                                      className={ROW_ACTION_BUTTON_CLASS}
                                    >
                                      <Paperclip className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} className="p-0 bg-gray-50/60 dark:bg-slate-800/30">
                                    <div className="px-4 sm:px-6 py-3">
                                      {/* The rows scroll inside this box; the header row stays put. */}
                                      <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                      <table className="w-full min-w-[900px] table-auto">
                                        <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-800 shadow-[0_1px_0_0_var(--border)]">
                                          <tr>
                                            <th className="w-10 py-2 pl-4 pr-1" />
                                            {innerJobSortHeader(row.key, 'rating', 'Match Rating', 'center', 'tf-sticky-col-left !bg-gray-50 dark:!bg-slate-800')}
                                            {innerJobSortHeader(row.key, 'jdId', 'JD ID', 'left')}
                                            {innerJobSortHeader(row.key, 'title', 'Job Title', 'left')}
                                            {innerJobSortHeader(row.key, 'jobVersion', 'Job Version', 'center')}
                                            {innerJobSortHeader(row.key, 'scored', 'Scored Status', 'left')}
                                            {innerJobSortHeader(row.key, 'date', 'Matched By / Date', 'left')}
                                            {innerJobSortHeader(row.key, 'resumeVersion', 'Resume Version', 'center')}
                                            <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap tf-sticky-col !bg-gray-50 dark:!bg-slate-800">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                          {pageCandidateJobs(row.key, innerJobsOf(row.key, sortedJobs)).map(job => {
                                            // Who ran the match comes from the session's `run_by_name`
                                            // (ai_talent_match_sessions.run_by); 'System' is only the
                                            // fallback for a run with no resolvable user.
                                            const jobRecord = jobs.find(j => j.id === job.jobId);
                                            const jobVersion = jobRecord?.currentVersion;
                                            // Scored against THIS job (Resume Scoring) — and its scorecard.
                                            const jobScoreId = scoreIdFor(job.jobId, job.resumeId);
                                            const jobSummaryOpen = !!jobScoreId && expandedScoreKeys.has(`${job.jobId}::${jobScoreId}`);
                                            // Prev / Next on the scorecard: this candidate's scored jobs, in table order.
                                            const candScoreNav: ScoreRef[] = innerJobsOf(row.key, sortedJobs)
                                              .map(j => ({ jdId: j.jobId, scoreId: scoreIdFor(j.jobId, j.resumeId) || '' }))
                                              .filter(r => r.scoreId);
                                            return (
                                              <Fragment key={job.historyId}>
                                              <tr
                                                /* A scored match opens / closes its score table; a row inside that table opens the scorecard. */
                                                onClick={() => { if (jobScoreId) toggleScoreSummary(job.jobId, job.jobTitle, jobScoreId); }}
                                                title={jobScoreId ? (jobSummaryOpen ? 'Hide score' : 'Show score') : undefined}
                                                className={`bg-white dark:bg-slate-900 ${jobScoreId ? 'cursor-pointer hover:bg-gray-50/70 dark:hover:bg-slate-800/40' : ''}`}
                                              >
                                                <td className="py-2.5 pl-4 pr-1 align-middle" onClick={(e) => e.stopPropagation()}>
                                                  {(() => {
                                                    const ticked = candTickedJobIds.includes(job.historyId);
                                                    return (
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          const next = ticked
                                                            ? candTickedJobIds.filter(id => id !== job.historyId)
                                                            : [...candTickedJobIds, job.historyId];
                                                          setCandJobSelection(row.key, next, candAllJobIds);
                                                        }}
                                                        aria-pressed={ticked}
                                                        aria-label={ticked ? 'Deselect this job match' : 'Select this job match'}
                                                        className="inline-flex p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                                                      >
                                                        {ticked ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                                                      </button>
                                                    );
                                                  })()}
                                                </td>
                                                <td className="text-center py-2.5 px-4 align-middle tf-sticky-col-left">
                                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${candidateScoreBadgeClass(job.score)}`}>
                                                    {toMatchRating(job.score)}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                                                  {jobRecord?.jobId
                                                    ? <JobIdBadge className="inline-flex h-6 items-center">{jobRecord.jobId}</JobIdBadge>
                                                    : <span className="text-sm text-gray-400">-</span>}
                                                </td>
                                                <td className="py-2.5 px-4 align-middle text-sm text-gray-700 dark:text-slate-300">{job.jobTitle}</td>
                                                <td className="text-center py-2.5 px-4 align-middle whitespace-nowrap">
                                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30">
                                                    v{jobVersion ?? 1}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                                                  {jobScoreId ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success-subtle text-success border border-success/20">
                                                      <CheckCircle2 className="w-3 h-3" />
                                                      Scored
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                                                      <XCircle className="w-3 h-3" />
                                                      Not Scored
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-2.5 px-4 align-middle whitespace-nowrap">
                                                  <div className="text-sm text-gray-700 dark:text-slate-300">{job.matchedByName || 'System'}</div>
                                                  <div className="text-xs text-gray-500 dark:text-slate-500">
                                                    {formatISTDate(job.matchedAt.toISOString())} · {formatISTTime(job.matchedAt.toISOString())}
                                                  </div>
                                                </td>
                                                <td className="text-center py-2.5 px-4 align-middle whitespace-nowrap">
                                                  <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                                                    v{job.resumeVersion ?? 1}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-4 align-middle tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                                                  <div className="inline-flex items-center gap-1.5">
                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <button
                                                        type="button"
                                                        aria-label="Actions"
                                                        title="Actions"
                                                        className={ROW_ACTION_BUTTON_CLASS}
                                                      >
                                                        <MoreVertical className="w-4 h-4" />
                                                      </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-60 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                                      {candJobMenuItems(row, job, jobScoreId, candScoreNav)}
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                  {jobScoreId ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleScoreSummary(job.jobId, job.jobTitle, jobScoreId)}
                                                      aria-expanded={jobSummaryOpen}
                                                      aria-label={jobSummaryOpen ? 'Hide score' : 'Show score'}
                                                      title={jobSummaryOpen ? 'Hide score' : 'Show score'}
                                                      className={jobSummaryOpen ? ROW_ACTION_BUTTON_ACTIVE_CLASS : ROW_ACTION_BUTTON_CLASS}
                                                    >
                                                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${jobSummaryOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                  ) : (
                                                    <span /* unscored: an invisible ▾-sized slot, so ⋮ sits in one column on every row */ aria-hidden="true" className={`${ROW_ACTION_BUTTON_CLASS} invisible pointer-events-none`}>
                                                      <ChevronDown className="w-4 h-4" />
                                                    </span>
                                                  )}
                                                  </div>
                                                </td>
                                              </tr>
                                              {jobSummaryOpen && (
                                                <tr className="bg-gray-50/60 dark:bg-slate-800/30">
                                                  <td colSpan={9} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                    {renderScoreSummary(job.jobId, job.jobTitle, jobScoreId!, candScoreNav)}
                                                  </td>
                                                </tr>
                                              )}
                                              </Fragment>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                      </div>
                                      {/* Paged on its own — a candidate matched to
                                          dozens of jobs otherwise unrolls them all. */}
                                      <ListPagination
                                        compact
                                        currentPage={candidateJobsPageOf(row.key).page}
                                        itemsPerPage={candidateJobsPageOf(row.key).size}
                                        totalItems={innerJobsOf(row.key, sortedJobs).length}
                                        onPageChange={(page) => setCandidateJobsPage(row.key, page)}
                                        onItemsPerPageChange={(size) => setCandidateJobsSize(row.key, size)}
                                        itemLabel="matched jobs"
                                      />
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

                {/* Cards — the phone layout, and the Grid view at every width
                    (an opened card spans the full row). */}
                <div className={matchDisplayMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start' : 'md:hidden space-y-3'}>
                  {paginatedCandidateRows.map((row) => {
                    const isExpanded = expandedCandidateGroups.has(row.key);
                    const distinctTitles = Array.from(new Set(row.jobs.map(j => j.jobTitle).filter(Boolean))) as string[];
                    const titlesExpanded = expandedJobChips.has(row.key);
                    const hiddenTitleCount = Math.max(0, distinctTitles.length - 2);
                    const sortedJobs = [...row.jobs].sort((a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime());
                    const latestJob = sortedJobs[0];

                    return (
                      <div
                        key={row.key}
                        onClick={() => toggleCandidateGroupExpanded(row.key)}
                        aria-expanded={isExpanded}
                        className={`rounded-xl border bg-white dark:bg-slate-900 p-3 shadow-sm cursor-pointer min-w-0 ${
                          selectedCandKeys.has(row.key) ? 'border-brand-blue/40 !bg-brand-blue/[0.04]' : 'border-gray-200 dark:border-slate-700'
                        } ${matchDisplayMode === 'grid' && isExpanded ? 'md:col-span-2 xl:col-span-3' : ''}`}
                      >
                        <div className="flex items-start gap-3 mb-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSelectCand(row.key); }}
                            aria-pressed={selectedCandKeys.has(row.key) ? true : isCandPartly(row.key) ? 'mixed' : false}
                            aria-label={selectedCandKeys.has(row.key) ? 'Deselect candidate' : 'Select candidate'}
                            className="inline-flex p-1 mt-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded flex-shrink-0"
                          >
                            {selectedCandKeys.has(row.key) ? (
                              <CheckSquare className="w-4 h-4 text-brand-blue" />
                            ) : isCandPartly(row.key) ? (
                              <MinusSquare className="w-4 h-4 text-brand-blue" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); openCandidateResume(row, sortedCandidateRows); }}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block truncate"
                            >
                              {row.name || 'Candidate'}
                            </button>
                            {row.email && <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{row.email}</div>}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 whitespace-nowrap">
                            {row.jobs.length} Job {row.jobs.length === 1 ? 'Version' : 'Versions'}
                          </span>
                          {/* Scored — of this candidate's matched jobs, how many have been
                              scored against that job in Resume Scoring. */}
                          {scoredResumeIdsByJd && (
                            <span className="text-xs text-gray-600 dark:text-slate-400">
                              <span className="font-medium text-gray-700 dark:text-slate-300">Scored:</span>{' '}
                              {row.jobs.filter(j => !!scoreIdFor(j.jobId, j.resumeId)).length} of {row.jobs.length}
                            </span>
                          )}
                        </div>

                        <div className="mb-2">
                          {renderJobTitlesCell(row)}
                        </div>

                        {/* Footer (Resume Scoring's grid card): Latest Matched on the
                            left, ▾ (open this candidate's jobs) and ⋮ on the right. */}
                        <div className="mt-1 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex-1 min-w-0 text-xs text-gray-500 dark:text-slate-500">
                            <div className="text-gray-400 uppercase tracking-wide text-2xs">Latest Matched</div>
                            <div className="truncate">
                              <span className="text-gray-700 dark:text-slate-300">{formatISTDate(latestJob.matchedAt.toISOString())}</span>{' '}
                              <span className="text-gray-400">{formatISTTime(latestJob.matchedAt.toISOString())}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleCandidateGroupExpanded(row.key)}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                            className={isExpanded ? ROW_ACTION_BUTTON_ACTIVE_CLASS : ROW_ACTION_BUTTON_CLASS}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" aria-label="Actions" title="Actions" className={ROW_ACTION_BUTTON_CLASS}>
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                              <DropdownMenuItem className={actionsMenuItemClass} onSelect={() => openCandidateResume(row, sortedCandidateRows)}>
                                <Eye className="w-4 h-4 text-menu-icon-view" />
                                <span className={MENU_ITEM_SCALE_CLASS}>View Resume</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className={actionsMenuItemClass} onSelect={() => handleAttachmentsClick(row.best)}>
                                <Paperclip className="w-4 h-4 text-menu-icon-download" />
                                <span className={MENU_ITEM_SCALE_CLASS}>Attachments</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* The candidate's matched jobs, opened in place — the grid
                            counterpart of the list's inner table: one card per job,
                            each with its tick and its own ⋮ (Preview, Score /
                            View Scorecard, invites). */}
                        {isExpanded && (() => {
                          const gridCandSelected = selectedCandKeys.has(row.key);
                          const gridAllJobIds = bandJobsOf(row.jobs).map(j => j.historyId);
                          const gridTickedJobIds = gridCandSelected ? gridAllJobIds : (partialCandJobs[row.key] ?? []);
                          const candScoreNav: ScoreRef[] = innerJobsOf(row.key, sortedJobs)
                            .map(j => ({ jdId: j.jobId, scoreId: scoreIdFor(j.jobId, j.resumeId) || '' }))
                            .filter(r => r.scoreId);
                          return (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 cursor-default" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                              {pageCandidateJobs(row.key, innerJobsOf(row.key, sortedJobs)).map(job => {
                                const jobRecord = jobs.find(j => j.id === job.jobId);
                                const jobScoreId = scoreIdFor(job.jobId, job.resumeId);
                                const ticked = gridTickedJobIds.includes(job.historyId);
                                return (
                                  <div
                                    key={job.historyId}
                                    onClick={() => (jobScoreId ? openScoreDetail(job.jobId, job.jobTitle, jobScoreId, candScoreNav) : openCandidateMatch(job.historyId))}
                                    title={jobScoreId ? 'View Scorecard' : 'Open Match'}
                                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                                      ticked ? 'border-brand-blue/40 bg-brand-blue/[0.06]' : 'border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/30 hover:border-brand-blue/30 hover:bg-white dark:hover:bg-slate-900'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const next = ticked
                                            ? gridTickedJobIds.filter(id => id !== job.historyId)
                                            : [...gridTickedJobIds, job.historyId];
                                          setCandJobSelection(row.key, next, gridAllJobIds);
                                        }}
                                        aria-pressed={ticked}
                                        aria-label={ticked ? 'Deselect this job match' : 'Select this job match'}
                                        className="inline-flex p-0.5 mt-0.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded flex-shrink-0"
                                      >
                                        {ticked ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                                      </button>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          {jobRecord?.jobId && <JobIdBadge>{jobRecord.jobId}</JobIdBadge>}
                                          <span className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate" title={job.jobTitle}>{job.jobTitle}</span>
                                          <span className="inline-flex px-1.5 py-0.5 rounded-full text-2xs border bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 shrink-0">
                                            v{jobRecord?.currentVersion ?? 1}
                                          </span>
                                        </div>
                                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${candidateScoreBadgeClass(job.score)}`}>
                                            {toMatchRating(job.score)}
                                          </span>
                                          {jobScoreId ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success-subtle text-success border border-success/20">
                                              <CheckCircle2 className="w-3 h-3" />
                                              Scored
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                                              <XCircle className="w-3 h-3" />
                                              Not Scored
                                            </span>
                                          )}
                                        </div>
                                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-slate-500">
                                          <Calendar className="w-3 h-3" />
                                          <span className="truncate">{job.matchedByName || 'System'} · {formatISTDate(job.matchedAt.toISOString())} <span className="text-gray-400">{formatISTTime(job.matchedAt.toISOString())}</span></span>
                                        </div>
                                      </div>
                                      {/* Stops clicks here, as the list's Actions cell does — the
                                          menu's portal clicks still bubble through React. */}
                                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button type="button" aria-label="Actions" title="Actions" className={ROW_ACTION_BUTTON_CLASS}>
                                              <MoreVertical className="w-4 h-4" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-60 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                            {candJobMenuItems(row, job, jobScoreId, candScoreNav)}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <ListPagination
                              compact
                              currentPage={candidateJobsPageOf(row.key).page}
                              itemsPerPage={candidateJobsPageOf(row.key).size}
                              totalItems={innerJobsOf(row.key, sortedJobs).length}
                              onPageChange={(page) => setCandidateJobsPage(row.key, page)}
                              onItemsPerPageChange={(size) => setCandidateJobsSize(row.key, size)}
                              itemLabel="matched jobs"
                            />
                          </div>
                          );
                        })()}
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
          </div>
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
                        onChange={(e) => setCandidateSortBy(e.target.value as CandidateSortKey)}
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
                  /* The selection's actions, set apart from the view pills by
                     a divider so they don't read as one more filter. */
                  <div className="flex flex-wrap items-center gap-2 sm:ml-1">
                    <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mr-1" />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!canRunScoring) {
                          toast.error('You do not have permission to score resumes');
                          return;
                        }
                        void handleScoreSelectedAllResumes();
                      }}
                      aria-disabled={!canRunScoring}
                      className={!canRunScoring ? 'opacity-50 cursor-not-allowed' : ''}
                      title={!canRunScoring ? 'You do not have permission to score resumes' : undefined}
                      icon={<ClipboardList className="w-3.5 h-3.5" />}
                    >
                      Score ({selectedAllResumeEntries.length})
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="primary" size="sm" icon={<Send className="w-3.5 h-3.5" />}>
                          Invite ({selectedAllResumeEntries.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                        <DropdownMenuItem
                          className={actionsMenuItemClass}
                          disabled={!(hasPermission('canCreateAssessments') || isTenantAdmin)}
                          title={!(hasPermission('canCreateAssessments') || isTenantAdmin) ? 'You do not have permission to invite to an assessment' : undefined}
                          onSelect={() => {
                            if (!(hasPermission('canCreateAssessments') || isTenantAdmin)) {
                              toast.error('You do not have permission to invite to an assessment');
                              return;
                            }
                            handleInviteAssessmentSelectedAllResumes();
                          }}
                        >
                          <ClipboardList className="w-4 h-4 text-menu-icon-view" />
                          <span className={MENU_ITEM_SCALE_CLASS}>Invite Assessment</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={`${actionsMenuItemClass} ${!canCreateAIInterviews ? 'opacity-50' : ''}`}
                          aria-disabled={!canCreateAIInterviews}
                          title={!canCreateAIInterviews ? 'You do not have permission to invite to an AI interview' : undefined}
                          onSelect={() => {
                            if (!canCreateAIInterviews) {
                              toast.error('You do not have permission to invite to an AI interview');
                              return;
                            }
                            handleInviteAIInterviewSelectedAllResumes();
                          }}
                        >
                          <Video className="w-4 h-4 text-menu-icon-ai" />
                          <span className={MENU_ITEM_SCALE_CLASS}>Invite AI Interview</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                <ListViewToggle value={matchDisplayMode} onChange={setDisplayModeEverywhere} className="ml-auto" />
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
                      <DateField
                        id="resume-matched-from"
                        aria-label="Last matched from"
                        value={candidateFilterDateFrom}
                        max={candidateFilterDateTo || undefined}
                        onChange={(v) => candidateSearch.setFilter('dateFrom', v)}
                      />
                    </div>

                    <div>
                      <label htmlFor="resume-matched-to" className="block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium">Last Matched To</label>
                      <DateField
                        id="resume-matched-to"
                        aria-label="Last matched to"
                        value={candidateFilterDateTo}
                        min={candidateFilterDateFrom || undefined}
                        onChange={(v) => candidateSearch.setFilter('dateTo', v)}
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
              {/* p-2 leaves room for each card's corner select seal. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-2">
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
                      className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 cursor-pointer ${gridCardSelectedClass(selectedAllResumeKeys.has(key))}`}
                    >
                      <GridCardSelect
                        selected={selectedAllResumeKeys.has(key)}
                        onToggle={() => toggleAllResumeSelected(key)}
                        label={row.name || 'candidate'}
                        selectionActive={selectedAllResumeKeys.size > 0}
                      />
                      <div className="flex items-start gap-2.5">
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
                  <table className="w-full min-w-[1600px] table-auto">
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
                        <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky left-12 z-[8] shadow-[1px_0_0_0_var(--border)]">
                          Match Rating
                        </th>
                        {['Candidate Name', 'Email', 'Phone', 'Location', 'Job ID', 'Job Title', 'Job Version', 'Skills', 'Experience', 'Uploaded By', 'Uploaded Date', 'Resume Version', 'Attachments', 'Scored Status'].map((label) => (
                          <th
                            key={label}
                            className={`${label === 'Job Version' || label === 'Resume Version' ? 'text-center' : 'text-left'} py-3 px-4 text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap align-middle bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700`}
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
                            className={`text-center py-3 px-4 align-middle whitespace-nowrap sticky left-12 z-[5] shadow-[1px_0_0_0_var(--border)] ${
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
                          {/* Job ID — the job this match ran against, its JD code
                              off the job record (the badge every list uses). */}
                          <td className="py-3 px-4 align-middle whitespace-nowrap">
                            {(() => {
                              // The job record first; the match session's own joined
                              // JD code covers a job outside the loaded job list.
                              const jdCode = jobs.find(j => j.id === job.jobId)?.jobId
                                || allMatchSessions.find(s => s.id === job.historyId)?.jd_job_id;
                              return jdCode
                                ? <JobIdBadge>{jdCode}</JobIdBadge>
                                : <span className="text-gray-400 dark:text-slate-500">-</span>;
                            })()}
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
                          {/* Job Version — the matched JD version, the chip the
                              Match History popup's Job Version column draws. */}
                          <td className="text-center py-3 px-4 align-middle whitespace-nowrap">
                            {(() => {
                              const jobVersion = jobs.find(j => j.id === job.jobId)?.currentVersion
                                ?? allMatchSessions.find(s => s.id === job.historyId)?.jd_version_number;
                              return jobVersion
                                ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30">
                                    v{jobVersion}
                                  </span>
                                )
                                : <span className="text-gray-400 dark:text-slate-500">-</span>;
                            })()}
                          </td>
                          <td className="py-3 px-4 align-middle min-w-[220px] max-w-[260px]">
                            {/* One chip shown in full, the rest collapse into
                                "+N more" — flex-nowrap so a row with more/longer
                                skills than another never grows taller than it. */}
                            <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                              <SkillsList
                                skills={row.best.skills}
                                max={1}
                                chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 min-w-0 shrink truncate max-w-[160px]"
                                moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium whitespace-nowrap hover:bg-brand-blue/10 transition-colors cursor-pointer shrink-0"
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
                          <td className="text-center py-3 px-4 align-middle whitespace-nowrap">
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
                                  className={ROW_ACTION_BUTTON_CLASS}
                                >
                                  <MoreVertical className="w-4 h-4" />
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
                                <DropdownMenuItem
                                  className={`${actionsMenuItemClass} ${!canRunScoring ? 'opacity-50' : ''}`}
                                  disabled={!job.resumeId}
                                  title={!canRunScoring ? 'You do not have permission to score resumes' : undefined}
                                  onSelect={() => {
                                    if (!canRunScoring) {
                                      toast.error('You do not have permission to score resumes');
                                      return;
                                    }
                                    void scoreJobMatchCandidate(job);
                                  }}
                                >
                                  <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
                                </DropdownMenuItem>
                                {/* Same two invites as View by Candidates' per-job menu. */}
                                <DropdownMenuItem
                                  className={`${actionsMenuItemClass} ${!canCreateAssessments ? 'opacity-50' : ''}`}
                                  disabled={!row.email}
                                  title={!canCreateAssessments ? 'You do not have permission to invite to an assessment' : !row.email ? 'Candidate has no email on file' : undefined}
                                  onSelect={() => inviteAssessmentForJobMatch(row, job)}
                                >
                                  <ClipboardList className="w-4 h-4 text-menu-icon-view" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>Create / Send Assessment</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className={`${actionsMenuItemClass} ${!canCreateAIInterviews ? 'opacity-50' : ''}`}
                                  disabled={!row.email}
                                  title={!canCreateAIInterviews ? 'You do not have permission to invite to an AI interview' : !row.email ? 'Candidate has no email on file' : undefined}
                                  onSelect={() => inviteAIInterviewForJobMatch(row, job)}
                                >
                                  <Video className="w-4 h-4 text-menu-icon-ai" />
                                  <span className={MENU_ITEM_SCALE_CLASS}>Create / Send AI Interview</span>
                                </DropdownMenuItem>
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
        /* One card around the whole job view — search bar, job rows and
           pagination — as on Resume Scoring. */
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700/60 p-4 sm:p-6">
        <div ref={historyListSectionRef} className="scroll-mt-4" aria-hidden="true" />

        {/* Row 1 — Resume Scoring's View by Job toolbar: Search (fills the
            row), Location and Industry inline, More Filters, Reset, Sort by,
            List / Grid. No count badge — the pagination carries the totals. */}
        <div className="mb-4">
          <ListToolbar
            searchValue={historySearchQuery}
            onSearchChange={historySearch.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search by job title or JD ID..."
            controlsFollowSearch
            onToggleFilters={() => setShowHistoryFilters(!showHistoryFilters)}
            filtersOpen={showHistoryFilters}
            activeFilterCount={activeFiltersCount}
            filtersApplied={historySearch.isNarrowed}
            onClearFilters={clearHistoryFilters}
            leadingActions={(() => {
              const records = matchHistory.map(i => jobs.find(j => j.id === i.jobId)).filter(Boolean) as Job[];
              const locations = [...new Set(records.map(j => j.location).filter(Boolean))] as string[];
              const industries = [...new Set(records.map(j => j.industryType).filter(Boolean))] as string[];
              return (
                <>
                  <SearchableSelect
                    className="w-full sm:w-48"
                    value={historyJobLocation}
                    onChange={(v) => historySearch.setFilter('jobLocation', v || '')}
                    options={locations.map(l => ({ value: l, label: l }))}
                    allLabel="All Locations"
                    placeholder="All Locations"
                    searchPlaceholder="Search location..."
                    ariaLabel="Filter by location"
                  />
                  <SearchableSelect
                    className="w-full sm:w-48"
                    value={historyIndustry}
                    onChange={(v) => historySearch.setFilter('industry', v || '')}
                    options={industries.map(i => ({ value: i, label: titleCaseValue(i) }))}
                    allLabel="All Industries"
                    placeholder="All Industries"
                    searchPlaceholder="Search industry..."
                    ariaLabel="Filter by industry"
                  />
                </>
              );
            })()}
            className="mb-0"
          >
            {sortedHistory.length > 0 && (
              <SortByControl
                value={historySortBy}
                order={historySortOrder}
                options={JOB_SORT_OPTIONS}
                onChange={(v) => setHistorySortBy(v)}
                onToggleOrder={() => setHistorySortOrder(o => (o === 'asc' ? 'desc' : 'asc'))}
              />
            )}
            <ListViewToggle
              value={jobListDisplayMode}
              onChange={setDisplayModeEverywhere}
              className="h-[38px] !border-brand-blue/10"
            />
          </ListToolbar>

          {/* More Filters — Resume Scoring's boxed panel; Done rides the last
              row of fields. The controls commit as they change. */}
          {showHistoryFilters && (() => {
            const records = matchHistory.map(i => jobs.find(j => j.id === i.jobId)).filter(Boolean) as Job[];
            const workModes = [...new Set(records.map(j => j.remoteType).filter(Boolean))] as string[];
            const jobTypes = [...new Set(records.map(j => j.employmentType).filter(Boolean))] as string[];
            const matchedByNames = [...new Set(matchHistory.map(i => i.matchedByName || 'System'))].sort();
            const selectCls = 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50 text-sm';
            const labelCls = 'block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1.5';
            return (
              <div className="mt-3 bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60 rounded-lg p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className={labelCls}>Matched By</label>
                    <select value={historyMatchedBy} onChange={e => historySearch.setFilter('matchedBy', e.target.value)} className={selectCls}>
                      <option value="">All Users</option>
                      {matchedByNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Matched From</label>
                    <DateField aria-label="Matched from" value={historyDateFrom} max={historyDateTo || undefined} onChange={v => historySearch.setFilter('dateFrom', v)} />
                  </div>
                  <div>
                    <label className={labelCls}>Matched To</label>
                    <DateField aria-label="Matched to" value={historyDateTo} min={historyDateFrom || undefined} onChange={v => historySearch.setFilter('dateTo', v)} />
                  </div>
                  <div>
                    <label className={labelCls}>Work Mode</label>
                    <select value={historyWorkMode} onChange={e => historySearch.setFilter('workMode', e.target.value)} className={selectCls}>
                      <option value="">All Work Modes</option>
                      {workModes.map(m => <option key={m} value={m}>{formatWorkMode(m)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Job Type</label>
                    <select value={historyJobType} onChange={e => historySearch.setFilter('jobType', e.target.value)} className={selectCls}>
                      <option value="">All Types</option>
                      {jobTypes.map(t => <option key={t} value={t}>{titleCaseValue(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Matched Candidates</label>
                    <select
                      value={historyFilterMinMatches}
                      onChange={(e) => historySearch.setFilter('minMatches', e.target.value === '' ? '' : Number(e.target.value))}
                      className={selectCls}
                    >
                      <option value="">Any number</option>
                      <option value={1}>At least 1</option>
                      <option value={5}>At least 5</option>
                      <option value={10}>At least 10</option>
                      <option value={25}>At least 25</option>
                    </select>
                  </div>
                  {/* Candidate-level: a job stays when ANY of its candidates matches. */}
                  <div>
                    <label className={labelCls}>Candidate Location</label>
                    <input
                      type="text"
                      value={historyFilterLocation}
                      onChange={(e) => historySearch.setFilter('location', e.target.value)}
                      placeholder="e.g. Chennai"
                      className={`${selectCls} placeholder:text-gray-400`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Candidate Mobile</label>
                    <input
                      type="text"
                      value={historyFilterPhone}
                      onChange={(e) => historySearch.setFilter('phone', e.target.value)}
                      placeholder="Full or partial number"
                      className={`${selectCls} placeholder:text-gray-400`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Candidate Experience (years)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={historyFilterExpMin}
                        onChange={(e) => historySearch.setFilter('expMin', e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Min"
                        min={0}
                        aria-label="Minimum candidate experience in years"
                        className={`${selectCls} placeholder:text-gray-400`}
                      />
                      <input
                        type="number"
                        value={historyFilterExpMax}
                        onChange={(e) => historySearch.setFilter('expMax', e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Max"
                        min={0}
                        aria-label="Maximum candidate experience in years"
                        className={`${selectCls} placeholder:text-gray-400`}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3 flex items-end justify-between gap-3">
                    <p className="text-xs text-gray-500 dark:text-slate-500">
                      Candidate filters keep a job when any of its candidates matches.
                      {resolvingHistoryCandidates ? ' Loading candidates...' : ''}
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowHistoryFilters(false)}
                      className="!h-[38px] !px-4 !text-sm"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Row 2: Select All, the rating pills and View by toggle, Expand
              all (Actions and Clear get their own row once jobs are ticked)
              — Resume Scoring's View by Job. */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
            {jobKeys.length > 0 && (
              <>
                <SelectAllMenu
                  selectedCount={selectedJobCount}
                  pageCount={pageJobKeys.length}
                  totalCount={jobKeys.length}
                  noun="jobs"
                  allSelected={allJobsSelected}
                  onSelectPage={() => {
                    setSelectedJobKeys(prev => new Set([...prev, ...pageJobKeys]));
                    setPartialJobRows(prev => {
                      const next = { ...prev };
                      pageJobKeys.forEach(k => { delete next[k]; });
                      return next;
                    });
                  }}
                  onSelectAll={() => {
                    setSelectedJobKeys(new Set(jobKeys));
                    setPartialJobRows({});
                  }}
                  onClear={clearJobSelection}
                />
                <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
              </>
            )}
            {viewPills}
            {pageJobKeys.length > 0 && (() => {
              const allOpen = pageJobKeys.every(k => expandedJobKeys.has(k));
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!allOpen) pageHistory.forEach(item => { void loadHistoryCandidates(item, { silent: true }); });
                    setExpandedJobKeys(prev => {
                      const next = new Set(prev);
                      pageJobKeys.forEach(k => (allOpen ? next.delete(k) : next.add(k)));
                      return next;
                    });
                  }}
                  aria-pressed={allOpen}
                  className={`${TOOLBAR_BUTTON_CLASS} sm:ml-auto`}
                >
                  {allOpen ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
                  {allOpen ? 'Collapse all' : 'Expand all'}
                </button>
              );
            })()}
          </div>

          {/* Row 3 — only while jobs are ticked: Actions and Clear. */}
          {renderBulkActionsRow(jobViewSelectedRows, selectedJobCount, { one: 'job', many: 'jobs' }, jobViewSelectionLoading, clearJobSelection, 'job')}
        </div>

        {/* History List */}
        {bandHistory.length > 0 ? (
          <>
            {/* List: one job per row. Grid: cards two / three across; an
                opened card spans the full row so its candidates have room. */}
            <div className={jobListDisplayMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch' : 'space-y-3'}>
            {pageHistory.map((item) => {
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

              const jobKey = item.id;
              const hasMatches = (item.totalMatches || 0) > 0;
              const loaded = jobLoaded(item);
              const isJobExpanded = expandedJobKeys.has(jobKey);
              const isSelected = selectedJobKeys.has(jobKey);
              const isPartlySelected = isJobPartlySelected(jobKey);
              const tally = jobTally(item);
              const allCandidates = jobCandidates(item);
              const candSort = jobCandSortByJob[jobKey] ?? DEFAULT_JOB_CAND_SORT;
              const candSortSign = candSort.dir === 'asc' ? 1 : -1;
              const panelCandidates = jobCandidatesInBand(item)
                .slice()
                .sort((a, b) => {
                  let diff = 0;
                  if (candSort.key === 'candidate') {
                    diff = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
                  } else if (candSort.key === 'experience') {
                    const ea = experienceYears(a.experience);
                    const eb = experienceYears(b.experience);
                    // No experience on file sorts last, whichever way.
                    if (ea === null || eb === null) {
                      if (ea !== eb) return ea === null ? 1 : -1;
                    } else {
                      diff = ea - eb;
                    }
                  } else if (candSort.key === 'scored') {
                    diff = Number(!!scoreIdFor(item.jobId, a.resumeId)) - Number(!!scoreIdFor(item.jobId, b.resumeId));
                  } else {
                    diff = (a.matchScore ?? 0) - (b.matchScore ?? 0);
                  }
                  // Ties: best match first, then name.
                  return diff * candSortSign
                    || (b.matchScore ?? 0) - (a.matchScore ?? 0)
                    || (a.name || '').localeCompare(b.name || '');
                });
              const candSortHeader = (key: JobCandSortKey, label: string, align: 'left' | 'center') => {
                const active = candSort.key === key;
                const Icon = !active ? ArrowUpDown : candSort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    aria-sort={active ? (candSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`${align === 'center' ? 'text-center' : 'text-left'} py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setJobCandSortByJob(prev => ({
                          ...prev,
                          [jobKey]: active
                            ? { key, dir: candSort.dir === 'asc' ? 'desc' : 'asc' }
                            : { key, dir: JOB_CAND_SORT_FIRST_DIR[key] },
                        }));
                        setCandidateJobsPage(pagingKey, 1);
                      }}
                      title={`Sort by ${label}`}
                      className={`group inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors hover:text-brand-blue ${active ? 'text-brand-blue' : ''}`}
                    >
                      {label}
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} />
                    </button>
                  </th>
                );
              };
              const allIds = allCandidates.map(c => c.id);
              const tickedIds = isSelected ? allIds : (partialJobRows[jobKey] ?? []);
              const pagingKey = `job:${jobKey}`;
              const pagedCandidates = pageCandidateJobs(pagingKey, panelCandidates);
              const pageIds = pagedCandidates.map(c => c.id);
              const allPageTicked = pageIds.length > 0 && pageIds.every(id => tickedIds.includes(id));
              const openResults = () => {
                userChangedView.current = true; // Prevent useEffect from resetting view
                openMatchResults(item, item.jobId);
                updateUrlParams({ jdId: item.jobId, view: 'results' });
              };
              const toggleRow = () => {
                if (!isJobExpanded && !loaded) void loadHistoryCandidates(item);
                toggleJobExpanded(jobKey);
              };

              /* One candidate's state in this job's panel — shared by the
                 table rows and the Grid cards. */
              const candRowInfo = (c: (typeof pagedCandidates)[number]) => {
                const ticked = tickedIds.includes(c.id);
                const inviteRow = toInviteRow(item.id, item.jobId, c);
                // Scored against THIS job — not merely scored for some job.
                const scoreId = scoreIdFor(item.jobId, c.resumeId);
                const scored = !!scoreId;
                const summaryOpen = scored && expandedScoreKeys.has(`${item.jobId}::${scoreId}`);
                // Prev / Next on the scorecard: this job's scored candidates, in table order.
                const jobScoreNav: ScoreRef[] = panelCandidates
                  .map(x => ({ jdId: item.jobId, scoreId: scoreIdFor(item.jobId, x.resumeId) || '' }))
                  .filter(r => r.scoreId);
                return { ticked, inviteRow, scoreId, scored, summaryOpen, jobScoreNav };
              };
              const toggleCandTick = (c: (typeof pagedCandidates)[number]) => {
                const next = tickedIds.includes(c.id) ? tickedIds.filter(id => id !== c.id) : [...tickedIds, c.id];
                setJobRowSelection(jobKey, next, allIds);
              };
              /* ⋮ (Preview / Score or View Scorecard / Invite) and ▾ (the score,
                 inline) — the row's Actions cell and the card's footer. */
              const renderCandActions = (c: (typeof pagedCandidates)[number]) => {
                const { inviteRow, scoreId, scored, summaryOpen, jobScoreNav } = candRowInfo(c);
                return (
                <div className="inline-flex items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Actions"
                      title="Actions"
                      className={ROW_ACTION_BUTTON_CLASS}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                    <DropdownMenuItem
                      className={actionsMenuItemClass}
                      disabled={!c.resumeId}
                      onSelect={() => c.resumeId && setPreviewResume({ id: c.resumeId, name: c.name || 'Resume' })}
                    >
                      <Eye className="w-4 h-4 text-menu-icon-view" />
                      <span className={MENU_ITEM_SCALE_CLASS}>Preview Resume</span>
                    </DropdownMenuItem>
                    {scored ? (
                      /* Already scored against this job — open
                         that scorecard instead of scoring again. */
                      <DropdownMenuItem
                        className={actionsMenuItemClass}
                        onSelect={() => openScoreDetail(item.jobId, item.jobTitle, scoreId!, jobScoreNav)}
                      >
                        <FileText className="w-4 h-4 text-menu-icon-score" />
                        <span className={MENU_ITEM_SCALE_CLASS}>View Scorecard</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className={`${actionsMenuItemClass} ${!canRunScoring ? 'opacity-50' : ''}`}
                        disabled={!c.resumeId}
                        title={!canRunScoring ? 'You do not have permission to score resumes' : undefined}
                        onSelect={() => {
                          if (!canRunScoring) {
                            toast.error('You do not have permission to score resumes');
                            return;
                          }
                          void scoreJobMatchCandidate({ historyId: item.id, jobId: item.jobId, resumeId: c.resumeId });
                        }}
                      >
                        <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                        <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="my-1 bg-gray-100" />
                    {renderRowInviteItems(inviteRow, 'job', item.jobTitle)}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* ▾ — the score, inline (scored candidates only). */}
                {scored ? (
                  <button
                    type="button"
                    onClick={() => toggleScoreSummary(item.jobId, item.jobTitle, scoreId!)}
                    aria-expanded={summaryOpen}
                    aria-label={summaryOpen ? 'Hide score' : 'Show score'}
                    title={summaryOpen ? 'Hide score' : 'Show score'}
                    className={summaryOpen ? ROW_ACTION_BUTTON_ACTIVE_CLASS : ROW_ACTION_BUTTON_CLASS}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${summaryOpen ? 'rotate-180' : ''}`} />
                  </button>
                ) : (
                  <span /* unscored: an invisible ▾-sized slot, so ⋮ sits in one column on every row */ aria-hidden="true" className={`${ROW_ACTION_BUTTON_CLASS} invisible pointer-events-none`}>
                    <ChevronDown className="w-4 h-4" />
                  </span>
                )}
                </div>
                );
              };
              const inlineCandidatesPanel = isJobExpanded ? (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 pt-3 pl-3 sm:pl-6 border-t border-gray-100 dark:border-slate-700/60 cursor-default"
                >
                  {!loaded ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-gray-500 dark:text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading candidates...
                    </div>
                  ) : panelCandidates.length === 0 ? (
                    <p className="py-3 text-sm text-gray-500 dark:text-slate-400">
                      {candidateRatingBand ? 'No candidates in this rating for this job.' : 'No candidates matched for this job.'}
                    </p>
                  ) : (
                    <>
                      {jobListDisplayMode === 'grid' ? (
                        /* Grid: the page's List / Grid toggle reaches the opened
                           job too — one card per candidate, the table row's
                           content. A scored card opens / closes its score below
                           it (spanning the row), as the table row does. */
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = allPageTicked
                                ? tickedIds.filter(id => !pageIds.includes(id))
                                : Array.from(new Set([...tickedIds, ...pageIds]));
                              setJobRowSelection(jobKey, next, allIds);
                            }}
                            aria-label={allPageTicked ? 'Deselect these candidates' : 'Select these candidates'}
                            className="inline-flex items-center gap-1.5 px-1 py-0.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:text-brand-blue rounded"
                          >
                            {allPageTicked
                              ? <CheckSquare className="w-4 h-4 text-brand-blue" />
                              : <Square className="w-4 h-4 text-gray-400" />}
                            Select all
                          </button>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
                            {pagedCandidates.map(c => {
                              const { ticked, scoreId, scored, summaryOpen, jobScoreNav } = candRowInfo(c);
                              return (
                                <div
                                  key={c.id}
                                  onClick={() => { if (scoreId) toggleScoreSummary(item.jobId, item.jobTitle, scoreId); }}
                                  title={scored ? (summaryOpen ? 'Hide score' : 'Show score') : undefined}
                                  className={`rounded-xl border p-3 flex flex-col gap-2.5 transition-colors ${scored ? 'cursor-pointer' : ''} ${
                                    summaryOpen ? 'md:col-span-2 xl:col-span-3' : ''
                                  } ${ticked || summaryOpen ? 'border-brand-blue/40 bg-brand-blue/[0.04]' : 'border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-brand-blue/30'}`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleCandTick(c); }}
                                      aria-pressed={ticked}
                                      aria-label={ticked ? 'Deselect candidate' : 'Select candidate'}
                                      className="inline-flex p-1 -ml-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded flex-shrink-0"
                                    >
                                      {ticked ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openJobCandidateResume(item.jobId, item.jobTitle, c.resumeId, panelCandidates.map(x => x.resumeId));
                                        }}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block truncate max-w-full"
                                        title={c.name}
                                      >
                                        {c.name || 'Candidate'}
                                      </button>
                                      {c.email && <div className="text-xs text-gray-500 dark:text-slate-500 truncate">{c.email}</div>}
                                    </div>
                                    <span
                                      title="Rating"
                                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border flex-shrink-0 ${candidateScoreBadgeClass(c.matchScore ?? 0)}`}
                                    >
                                      {toMatchRating(c.matchScore ?? 0)}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 dark:text-slate-400">
                                    <span>Experience: <span className="text-gray-700 dark:text-slate-300">{c.experience || '-'}</span></span>
                                    <span className="inline-flex items-center gap-1">
                                      Resume
                                      <span className="inline-flex px-1.5 py-0.5 rounded-full text-2xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                                        v{c.resumeVersion ?? 1}
                                      </span>
                                    </span>
                                  </div>
                                  {/* Footer: Scored status left, ⋮ / ▾ right. Stops
                                      clicks — the menu renders in a portal but React
                                      still bubbles its clicks to the card. */}
                                  <div className="mt-auto flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                    {scored ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success-subtle text-success border border-success/20">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Scored
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                                        <XCircle className="w-3 h-3" />
                                        Not Scored
                                      </span>
                                    )}
                                    {renderCandActions(c)}
                                  </div>
                                  {summaryOpen && (
                                    <div className="pt-3 border-t border-gray-100 dark:border-slate-700/60 cursor-default" onClick={(e) => e.stopPropagation()}>
                                      {renderScoreSummary(item.jobId, item.jobTitle, scoreId!, jobScoreNav)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                      <div className="rounded-xl border border-gray-100 dark:border-slate-700/60 overflow-hidden">
                        {/* The rows scroll inside this box; the header row stays put. */}
                        <div className="max-h-[360px] overflow-auto">
                          <table className="w-full min-w-[760px]">
                            <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-800 shadow-[0_1px_0_0_var(--border)]">
                              <tr>
                                <th className="w-10 px-3 py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = allPageTicked
                                        ? tickedIds.filter(id => !pageIds.includes(id))
                                        : Array.from(new Set([...tickedIds, ...pageIds]));
                                      setJobRowSelection(jobKey, next, allIds);
                                    }}
                                    aria-label={allPageTicked ? 'Deselect these candidates' : 'Select these candidates'}
                                    className="inline-flex p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                                  >
                                    {allPageTicked
                                      ? <CheckSquare className="w-4 h-4 text-brand-blue" />
                                      : <Square className="w-4 h-4 text-gray-400" />}
                                  </button>
                                </th>
                                {candSortHeader('rating', 'Rating', 'center')}
                                {candSortHeader('candidate', 'Candidate', 'left')}
                                {candSortHeader('experience', 'Experience', 'left')}
                                <th className="text-center py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap">Resume Version</th>
                                {candSortHeader('scored', 'Scored Status', 'left')}
                                <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wide tf-sticky-col !bg-gray-50 dark:!bg-slate-800">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                              {pagedCandidates.map(c => {
                                const { ticked, scoreId, scored, summaryOpen, jobScoreNav } = candRowInfo(c);
                                return (
                                  <Fragment key={c.id}>
                                  <tr
                                    /* A scored candidate's row opens / closes its score table; a row inside that table opens the scorecard. */
                                    onClick={() => { if (scoreId) toggleScoreSummary(item.jobId, item.jobTitle, scoreId); }}
                                    title={scored ? (summaryOpen ? 'Hide score' : 'Show score') : undefined}
                                    className={`${scored ? 'cursor-pointer' : ''} ${ticked ? 'bg-brand-blue/[0.04]' : 'hover:bg-gray-50/70 dark:hover:bg-slate-800/40'}`}
                                  >
                                    <td className="px-3 py-2.5 align-middle">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const next = ticked ? tickedIds.filter(id => id !== c.id) : [...tickedIds, c.id];
                                          setJobRowSelection(jobKey, next, allIds);
                                        }}
                                        aria-pressed={ticked}
                                        aria-label={ticked ? 'Deselect candidate' : 'Select candidate'}
                                        className="inline-flex p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                                      >
                                        {ticked ? <CheckSquare className="w-4 h-4 text-brand-blue" /> : <Square className="w-4 h-4 text-gray-400" />}
                                      </button>
                                    </td>
                                    <td className="text-center px-3 py-2.5 align-middle">
                                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${candidateScoreBadgeClass(c.matchScore ?? 0)}`}>
                                        {toMatchRating(c.matchScore ?? 0)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle">
                                      <div className="flex items-center min-w-0">
                                        <div className="min-w-0">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openJobCandidateResume(item.jobId, item.jobTitle, c.resumeId, panelCandidates.map(x => x.resumeId));
                                            }}
                                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block truncate max-w-[16rem]"
                                            title={c.name}
                                          >
                                            {c.name || 'Candidate'}
                                          </button>
                                          {c.email && <div className="text-xs text-gray-500 dark:text-slate-500 truncate max-w-[16rem]">{c.email}</div>}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap">{c.experience || '-'}</td>
                                    <td className="text-center px-3 py-2.5 align-middle whitespace-nowrap">
                                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700">
                                        v{c.resumeVersion ?? 1}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                                      {scored ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success-subtle text-success border border-success/20">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Scored
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700">
                                          <XCircle className="w-3 h-3" />
                                          Not Scored
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 align-middle text-right tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                                      {renderCandActions(c)}
                                    </td>
                                  </tr>
                                  {summaryOpen && (
                                    <tr className="bg-gray-50/60 dark:bg-slate-800/30">
                                      <td colSpan={7} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        {renderScoreSummary(item.jobId, item.jobTitle, scoreId!, jobScoreNav)}
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
                      )}
                      <ListPagination
                        compact
                        currentPage={candidateJobsPageOf(pagingKey).page}
                        itemsPerPage={candidateJobsPageOf(pagingKey).size}
                        totalItems={panelCandidates.length}
                        onPageChange={(page) => setCandidateJobsPage(pagingKey, page)}
                        onItemsPerPageChange={(size) => setCandidateJobsSize(pagingKey, size)}
                        itemLabel="candidates"
                      />
                    </>
                  )}
                </div>
              ) : null;

              return (
                <div
                  key={item.id}
                  /* No lift on hover: the card grows when opened inline, and
                     a translating card under the pointer reads as jumpy. */
                  className={`bg-white dark:bg-slate-900 rounded-xl border ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-4 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10 transition-all duration-150 ${hasMatches ? 'cursor-pointer' : ''} ${
                    isJobExpanded || isSelected || isPartlySelected ? 'border-brand-blue/40 dark:border-brand-blue/40' : 'border-gray-300 dark:border-slate-700/60'
                  } ${isSelected ? '!bg-brand-blue/[0.06] dark:!bg-brand-blue/15' : ''} ${
                    jobListDisplayMode === 'grid' ? 'flex flex-col min-w-0' : ''
                  } ${jobListDisplayMode === 'grid' && isJobExpanded ? 'md:col-span-2 xl:col-span-3' : ''}`}
                  // The row opens its candidates in place; the job title (and
                  // the View Details button) still open the job's match results.
                  onClick={() => { if (hasMatches) toggleRow(); }}
                  aria-expanded={hasMatches ? isJobExpanded : undefined}
                >
                  <div className={`flex flex-col items-start gap-3 ${jobListDisplayMode === 'grid' && !isJobExpanded ? 'flex-1' : 'sm:flex-row'}`}>
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {/* Tick the job. Stops the click so it doesn't also
                            open / close the row. */}
                        {/* No candidates matched: the box stays, greyed and
                            not selectable — nothing to act on. */}
                        {!hasMatches && (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            aria-disabled="true"
                            title="No candidates matched — nothing to select"
                            className="inline-flex p-1.5 -ml-1.5 rounded flex-shrink-0 cursor-not-allowed"
                          >
                            <Square className="w-4 h-4 text-gray-300 dark:text-slate-600 bg-gray-100 dark:bg-slate-800 rounded-sm" />
                          </span>
                        )}
                        {hasMatches && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSelectJob(jobKey); }}
                            aria-pressed={isSelected ? true : isPartlySelected ? 'mixed' : false}
                            aria-label={isSelected || isPartlySelected ? 'Deselect job' : 'Select job'}
                            title={isPartlySelected ? 'Some candidates of this job are selected' : undefined}
                            className="inline-flex p-1.5 -ml-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded flex-shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-brand-blue" />
                            ) : isPartlySelected ? (
                              <MinusSquare className="w-4 h-4 text-brand-blue" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        )}
                        {jobData?.jobId && (
                          <JobIdBadge className="inline-flex h-7 items-center flex-shrink-0">{jobData.jobId}</JobIdBadge>
                        )}
                        <h3
                          className="text-sm sm:text-base font-medium text-gray-900 dark:text-slate-50 truncate min-w-0 cursor-pointer hover:text-brand-blue transition-colors"
                          title={item.jobTitle}
                          onClick={(e) => { e.stopPropagation(); openResults(); }}
                        >
                          {item.jobTitle}
                        </h3>
                        {jobData?.currentVersion && (
                          <span className="inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700 gap-1.5 flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-slate-500"></div>
                            v{jobData.currentVersion}
                          </span>
                        )}
                        {/* Status — only when it isn't the norm here
                            (Published / Republished), as on Resume Scoring. */}
                        {jobData && (() => {
                          const raw = jobData.status || 'published';
                          const label = getDisplayStatus(
                            raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
                            jobData.publishCount,
                          );
                          if (label === 'Published' || label === 'Republished') return null;
                          const tone = getStatusConfig(label);
                          return (
                            <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-xs ${tone.bg} ${tone.text} border ${tone.border} gap-1.5 flex-shrink-0`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></div>
                              {label}
                            </span>
                          );
                        })()}
                        {/* Match History — every run across this job's whole
                            lineage, with its Rating 10 / 9 – 7 / Below 7 roll-up. */}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); openMatchHistoryModal(item, historyKey); }}
                          className="h-7 w-7 p-0 flex-shrink-0"
                          aria-label="Match History" title="Match History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* "By: name  Matched: date" — Resume Scoring's meta
                          line. The JD's own details are left to the Job
                          Descriptions page. */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-gray-600 dark:text-slate-400 mb-2">
                        <span className="flex items-center gap-1">
                          <span className="font-medium text-gray-700 dark:text-slate-300">By:</span>
                          <span className="font-normal text-gray-500 dark:text-slate-400">{item.matchedByName || 'System'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="font-medium text-gray-700 dark:text-slate-300">Matched:</span>
                          <span className="font-normal text-gray-500 dark:text-slate-400">
                            {formatISTDate(item.matchedAt.toISOString())}, {formatISTTime(item.matchedAt.toISOString())}
                          </span>
                        </span>
                        {/* How many of this run's matched candidates have been
                            scored against this job in Resume Scoring. (Not the
                            JD's "applicants", which counts every resume ever
                            scored for the JD, matched by this run or not.) */}
                        {hasMatches && loaded && scoredResumeIdsByJd && (() => {
                          const scoredCount = allCandidates.filter(c => !!scoreIdFor(item.jobId, c.resumeId)).length;
                          return (
                            /* Same label / value look as "By:" and "Matched:" beside it. */
                            <span
                              className="flex items-center gap-1"
                              title="Matched candidates already scored against this job in Resume Scoring"
                            >
                              <span className="font-medium text-gray-700 dark:text-slate-300">Scored:</span>
                              <span className="font-normal text-gray-500 dark:text-slate-400">{scoredCount} of {allCandidates.length}</span>
                            </span>
                          );
                        })()}
                        {/* A run that found nobody still counts as a matched
                            job — it just says so. */}
                        {!hasMatches && (
                          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-warning-subtle text-warning ring-1 ring-warning-line rounded-lg">
                            <AlertCircle className="w-4 h-4" />
                            No candidates matched
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start justify-end gap-6 flex-shrink-0 w-full sm:w-auto">
                      {/* Rating 10 / 9 – 7 / Below 7, one below another — the
                          Job Descriptions cards' Applicants / Assessed /
                          Interviewed stack, in the rating colours. Under a
                          rating pill the others are muted. Until the
                          candidates load, the run's own total. */}
                      {hasMatches && (
                        <div className="flex flex-col items-stretch gap-1.5 flex-shrink-0">
                          {!loaded ? (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-info-subtle text-info-strong whitespace-nowrap">
                              <FileText className="w-4 h-4" />
                              {item.totalMatches} Matched
                            </span>
                          ) : ([
                            { id: 'exact' as const, label: 'Rating 10', count: tally.exact, Icon: CheckCircle2, cls: 'bg-success-subtle text-success-strong' },
                            { id: 'partial' as const, label: 'Rating 9 – 7', count: tally.partial, Icon: MinusCircle, cls: 'bg-warning-subtle text-warning-strong' },
                            { id: 'no_match' as const, label: 'Below 7', count: tally.no_match, Icon: XCircle, cls: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' },
                          ]).map(({ id, label, count, Icon, cls }) => {
                            const muted = !!candidateRatingBand && id !== candidateRatingBand;
                            return (
                              <span
                                key={id}
                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs whitespace-nowrap transition-opacity ${
                                  muted ? 'bg-gray-50 text-gray-400 opacity-60 dark:bg-slate-800/50 dark:text-slate-500' : cls
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                                <span className="tabular-nums">{count}</span> {label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex flex-col items-stretch gap-2">
                        <div className="flex items-center gap-1.5 self-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openResults(); }}
                            aria-label="View Details"
                            title="View Details"
                            className="h-9 w-9 p-0"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </div>
                        {hasMatches && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRow(); }}
                            aria-expanded={isJobExpanded}
                            title={isJobExpanded ? 'Hide candidates' : "Show this job's candidates"}
                            className={`h-9 px-3 rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 justify-center whitespace-nowrap border w-full ${
                              isJobExpanded
                                ? 'bg-gray-200 text-gray-900 border-gray-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-600'
                                : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 hover:text-gray-900 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700'
                            }`}
                          >
                            {isJobExpanded ? 'Hide Candidates' : 'View Candidates'}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isJobExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        {/* Version history — switched OFF (SHOW_VERSIONS_PANEL);
                            the History icon above covers every run. */}
                        {SHOW_VERSIONS_PANEL && (matchSessionCounts[historyKey] || 0) > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAIMatchVersionHistory(historyKey, item.jobId, item.id);
                            }}
                            aria-expanded={expandedHistoryJobId === item.id}
                            className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 justify-center w-full text-white bg-brand-blue hover:bg-brand-blue-2"
                          >
                            {expandedHistoryJobId === item.id ? 'Hide Versions' : 'View Versions'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {inlineCandidatesPanel}

                  {/* Version History — inline, below the row (not a popup): every
                      match run across this job's whole lineage (every republished
                      version), expanding in place the same way the Job Openings
                      list expands its own version history. */}
                  {SHOW_VERSIONS_PANEL && expandedHistoryJobId === item.id && (
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
                            // The status label's republish counter, not the job version.
                            currentVersion: j.publishCount,
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
                            matchedByName: session.run_by_name || undefined,
                          }, targetJobId);
                          updateUrlParams({ jdId: targetJobId, view: 'results' });
                        }}
                        onRunMatch={canRunAiMatch ? (session) => {
                          handleRunAIMatch(session.jd_id || item.jobId);
                        } : undefined}
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
              totalItems={bandHistory.length}
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
                    toast.error('You do not have permission to run AI Talent Match');
                    return;
                  }
                  setViewMode('new');
                  setSelectedJob('');
                  router.push('/recruitment/ai-talent-match', { scroll: false });
                }}
                aria-disabled={!canRunAiMatch}
                className={!canRunAiMatch ? 'opacity-50 cursor-not-allowed' : ''}
                title={!canRunAiMatch ? 'You do not have permission to run AI Talent Match' : ''}
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
        </div>
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
          percentage. "Matched By" is the session's `run_by_name` — the tenant
          user who ran that match — and reads "System" only when the run has no
          resolvable user. A bespoke table replaces
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
          // Who ran the most recent run of this JD version. 'System' only when
          // the session's run_by can't be resolved to a user.
          const matchedBy = version.session.run_by_name?.trim() || 'System';
          return { version, v10, v9to7, vBelow7, candidateCount, matchedBy };
        });

        // "Matched By" options — the names actually present in these runs, so
        // the filter can never offer a value that matches nothing.
        const matchedByOptions = Array.from(
          new Set(versionRows.map(r => r.matchedBy))
        ).sort((a, b) => a.localeCompare(b));

        const searchTerm = historyModalFilter.search.trim().toLowerCase();
        const filteredVersionRows = versionRows.filter(({ version, v10, v9to7, vBelow7, matchedBy }) => {
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
          const matchesMatchedBy = f.matchedBy === 'all' || f.matchedBy === matchedBy;
          return matchesSearch && matchesMatchedBy && matchesVersion && matchesRating && matchesDateFrom && matchesDateTo;
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

        const distributionRows: { label: string; band: 'exact' | 'partial' | 'no_match'; value: number; barClass: string; textClass: string; fillClass: string }[] = [
          { label: 'Rating 10', band: 'exact', value: exactCount, barClass: 'bg-success', textClass: 'text-success', fillClass: 'fill-success' },
          { label: 'Rating 9 – 7', band: 'partial', value: partialCount, barClass: 'bg-brand-orange', textClass: 'text-brand-orange-deep', fillClass: 'fill-brand-orange' },
          { label: 'Below 7', band: 'no_match', value: noMatchCount, barClass: 'bg-destructive', textClass: 'text-destructive', fillClass: 'fill-destructive' },
        ];
        const ratingPct = (value: number) => totalMatched > 0 ? Math.round((value / totalMatched) * 100) : 0;

        // Rating Breakdown donut — every version, or the one picked in its
        // own dropdown. The distribution bars stay all-versions, so the two
        // cards answer different questions. A picked version that's gone
        // (refresh) falls back to all.
        const breakdownVersion = historyBreakdownVersion === 'all'
          ? undefined
          : versionList.find(v => v.session.id === historyBreakdownVersion);
        const breakdownResults = breakdownVersion ? (breakdownVersion.session.results || []) : allResults;
        const breakdownTotal = breakdownVersion
          ? (breakdownVersion.session.total_matches ?? breakdownResults.length)
          : totalMatched;
        const breakdownRows = distributionRows.map(row => ({
          ...row,
          value: breakdownVersion
            ? breakdownResults.filter(r => matchBandForRating(ratingFor(r)) === row.band).length
            : row.value,
        }));
        const pieSegments = breakdownRows.filter(row => row.value > 0);
        const breakdownPct = (value: number) => breakdownTotal > 0 ? Math.round((value / breakdownTotal) * 100) : 0;

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
                matchedByName: session.run_by_name || undefined,
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
                            onChange={(e) => setHistoryModalFilter(prev => ({ ...prev, matchedBy: e.target.value }))}
                            className={`${filterInputClass} w-full`}
                          >
                            <option value="all">All Sources</option>
                            {matchedByOptions.map(name => (
                              <option key={name} value={name} title={name}>{clampOptionLabel(name)}</option>
                            ))}
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
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <DateField
                              aria-label="Date range from"
                              value={historyModalFilter.dateFrom}
                              max={historyModalFilter.dateTo || undefined}
                              onChange={(v) => setHistoryModalFilter(prev => ({ ...prev, dateFrom: v }))}
                              className="sm:w-[8.5rem]"
                            />
                            <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
                            <DateField
                              aria-label="Date range to"
                              value={historyModalFilter.dateTo}
                              min={historyModalFilter.dateFrom || undefined}
                              onChange={(v) => setHistoryModalFilter(prev => ({ ...prev, dateTo: v }))}
                              className="sm:w-[8.5rem]"
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

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
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
                              ) : filteredVersionRows.map(({ version, v10, v9to7, vBelow7, candidateCount, matchedBy }) => {
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
                                      <span className="inline-flex items-center gap-1.5 max-w-[11rem]" title={version.session.run_by_email || matchedBy}>
                                        <Sparkles className="w-3.5 h-3.5 text-brand-cyan flex-shrink-0" />
                                        <span className="truncate">{matchedBy}</span>
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
                          ) : filteredVersionRows.map(({ version, v10, v9to7, vBelow7, candidateCount, matchedBy }) => {
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
                                  <span className="inline-flex items-center gap-1 min-w-0"><Sparkles className="w-3 h-3 text-brand-cyan flex-shrink-0" /><span className="truncate">{matchedBy}</span></span>
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

                        {/* Distribution across every version, always
                            unfiltered (its own heading says so). */}
                        <div className="mt-4 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Rating Distribution (All Versions)</h4>
                            <BarChart3 className="w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-slate-500 mb-3">Total candidates: {totalMatched}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                            {distributionRows.map(row => {
                              const pct = ratingPct(row.value);
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

                      {/* Rating breakdown donut + legend — same treatment as the
                          Assessment / AI Interview version history popups.
                          Static: the centre always shows the total, and the
                          legend carries every count so colour is never the
                          only cue. */}
                      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex flex-col">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
                              <PieChart className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-slate-50 truncate">Rating Breakdown</span>
                          </div>
                          <select
                            value={breakdownVersion ? breakdownVersion.session.id : 'all'}
                            onChange={(e) => setHistoryBreakdownVersion(e.target.value)}
                            aria-label="Rating breakdown version"
                            className="text-xs px-2 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 flex-shrink-0"
                          >
                            <option value="all">All Versions</option>
                            {versionList.map(v => (
                              <option key={v.session.id} value={v.session.id}>v{v.versionNumber}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col items-center gap-4 flex-1 justify-center">
                          <div className="relative w-[210px] h-[210px] shrink-0">
                            {pieSegments.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <RechartsPieChart>
                                  <Pie
                                    data={pieSegments.map(row => ({ name: row.label, value: row.value }))}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius="66%"
                                    outerRadius="100%"
                                    startAngle={90}
                                    endAngle={-270}
                                    paddingAngle={pieSegments.length > 1 ? 2 : 0}
                                    cornerRadius={3}
                                    stroke="none"
                                    isAnimationActive={false}
                                  >
                                    {pieSegments.map(row => (
                                      <Cell key={row.label} className={`${row.fillClass} outline-none pointer-events-none`} />
                                    ))}
                                  </Pie>
                                </RechartsPieChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="w-full h-full rounded-full border-[22px] border-slate-100 dark:border-slate-800" />
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                              <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-50 leading-none">{breakdownTotal}</span>
                              <span className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-tight">Total<br />Candidates</span>
                            </div>
                          </div>
                          {/* Legend: names in the left half, values in the right
                              half, split by one common line down the centre. */}
                          <ul className="relative w-full space-y-1.5 text-sm">
                            <li className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 !mt-0 bg-gray-200 dark:bg-slate-700" aria-hidden />
                            {breakdownRows.map(row => (
                              <li key={row.label} className="grid grid-cols-2 items-center rounded">
                                <span className="flex items-center gap-2 min-w-0 pl-1 pr-3">
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.barClass}`} />
                                  <span className="truncate text-gray-600 dark:text-slate-400">{row.label}</span>
                                </span>
                                <span className="flex items-baseline gap-1.5 pl-3 pr-1">
                                  <span className="tabular-nums font-semibold text-gray-900 dark:text-slate-100">{row.value}</span>
                                  <span className="tabular-nums text-xs text-gray-500 dark:text-slate-400">({breakdownPct(row.value)}%)</span>
                                </span>
                              </li>
                            ))}
                          </ul>
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
              </div>
            </div>
          </div>
        );
      })()}

      {aiInviteDialog}
      {createSendDialogEl}
      {scoringReviewDialog}
      {assessmentInviteDialogs}
      {createInviteTargetModal}
      {/* Preview Resume from a row's ⋮ menu (View by Job / View by Candidates) —
          this view returns early, so the results view's copy below never rendered here. */}
      {previewResume && (
        <ResumeTextPreviewModal
          resumeId={previewResume.id}
          title={previewResume.name}
          subtitle={previewResume.fileName}
          onClose={() => setPreviewResume(null)}
        />
      )}
      <ExportFormatModal
        open={!!exportRows}
        onClose={() => setExportRows(null)}
        title="Export Matched Candidates"
        recordCount={exportRows?.length ?? 0}
        selected
        columns={jobExportColumns.map(c => c.header)}
        // Resume Scoring's export: tick the columns, remembered for next time.
        columnPrefsKey="aiTalentMatchExportColumns"
        defaultOffColumns={['Phone', 'Location', 'Experience']}
        onExport={handleExportRows}
      />
      </>
    );
  }

  // View: Results (After Matching)
  if (viewMode === 'results') {
    const filteredCandidates = filteredCandidatesMemo;
    const paginatedCandidates = getPaginatedCandidates();

    // ── JD version dropdown ──
    // Every version of this job, from the lineage; the ones with a match run
    // open that version's latest run, the rest are listed but disabled.
    const resultsHistoryKey = historyKeyForJd(selectedJob);
    const resultsLineage = lineageByJob[resultsHistoryKey] ?? [];
    const resultsLineageEntry = resultsLineage.find(v => v.id === selectedJob);
    const resultsJobTitle = selectedJobData?.title
      || resultsLineageEntry?.title
      || selectedHistoryItem?.jobTitle
      || matchHistory.find(item => item.jobId === selectedJob)?.jobTitle
      || '';
    const resultsJobCode = selectedJobData?.jobId || resultsLineageEntry?.job_id;
    const resultsVersionNumber = resultsLineageEntry?.version_number ?? selectedJobData?.currentVersion;
    const resultsJobStatus = (resultsLineageEntry?.status || selectedJobData?.status || '').toLowerCase();
    const canRunAgainHere = resultsJobStatus !== 'disabled' && resultsJobStatus !== 'archived';

    const matchedVersionOptions: { jdId: string; number: number; matchedAt?: Date; session?: AIMatchSessionVersion['session'] }[] = (historyVersionsByJob[resultsHistoryKey] ?? [])
      .filter(v => !!v.session.jd_id)
      .map(v => ({
        jdId: v.session.jd_id as string,
        number: resultsLineage.find(l => l.id === v.session.jd_id)?.version_number ?? v.versionNumber,
        // The run on screen for the current version, else the version's latest.
        matchedAt: v.session.jd_id === selectedJob && selectedHistoryItem
          ? new Date(selectedHistoryItem.matchedAt)
          : new Date(v.session.created_at),
        session: v.session,
      }));
    // A run made moments ago may not be in the cached versions yet — the
    // version on screen is always offered.
    if (selectedJob && !matchedVersionOptions.some(o => o.jdId === selectedJob) && resultsVersionNumber) {
      matchedVersionOptions.push({
        jdId: selectedJob,
        number: resultsVersionNumber,
        matchedAt: selectedHistoryItem ? new Date(selectedHistoryItem.matchedAt) : undefined,
      });
    }
    const unmatchedVersionOptions = resultsLineage
      .filter(l => !matchedVersionOptions.some(o => o.jdId === l.id))
      .map(l => ({ jdId: l.id, number: l.version_number, matchedAt: undefined }));
    // Each version's JD status in the app's shared vocabulary and colours
    // (Published / Republished / Draft / Disabled / Archived…), from the
    // lineage, else the job list for a version the lineage hasn't covered.
    // "Republished" comes from that version's republish counter, not its
    // version number — a forked v2 is "Published" until it is republished.
    const versionStatusLabel = (jdId: string): string | undefined => {
      const lineageEntry = resultsLineage.find(l => l.id === jdId);
      const jobEntry = jobs.find(j => j.id === jdId);
      const raw = lineageEntry?.status || jobEntry?.status;
      if (!raw) return undefined;
      return getDisplayStatus(
        raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
        lineageEntry?.current_version ?? jobEntry?.publishCount,
      );
    };
    const versionDropdownOptions = [
      ...matchedVersionOptions.map(o => ({ ...o, matched: true as const })),
      ...unmatchedVersionOptions.map(o => ({ ...o, matched: false as const })),
    ]
      .map(o => ({ ...o, statusLabel: versionStatusLabel(o.jdId) }))
      .sort((a, b) => b.number - a.number);

    // Reset what belongs to the previous list — selection, search, filters —
    // then open the target the same way a list click does. `replace` keeps
    // Back pointed at the list.
    const switchResultsTo = (item: MatchHistory, jdId: string) => {
      userChangedView.current = true; // Prevent useEffect from resetting view
      setSelectedCandidates([]);
      setSearchQuery('');
      setFilterRatingBand('all');
      setFilterScored('all');
      setFilterExperienceMin('');
      setFilterExperienceMax('');
      openMatchResults(item, jdId);
      updateUrlParams({ jdId, view: 'results' }, { replace: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const handleResultsVersionChange = (jdId: string) => {
      if (jdId === selectedJob) return;
      const option = matchedVersionOptions.find(o => o.jdId === jdId);
      if (!option?.session) return;
      const lineageEntry = resultsLineage.find(l => l.id === jdId);
      switchResultsTo({
        id: option.session.id,
        jobId: jdId,
        jobTitle: jobs.find(j => j.id === jdId)?.title || lineageEntry?.title || resultsJobTitle,
        matchedAt: new Date(option.session.created_at),
        totalMatches: option.session.total_matches,
        matchedCandidates: [],
        matchedByName: option.session.created_by_name || undefined,
      }, jdId);
    };

    // ── Previous / Next job ──
    // Walks the Matched Jobs list in the order it is shown — search, filters
    // and sort applied, across every page, not just the visible one. Resolved
    // by id at render time since that list can reorder as candidates load.
    const currentListIndex = (() => {
      let index = selectedHistoryItem ? sortedHistory.findIndex(item => item.id === selectedHistoryItem.id) : -1;
      if (index < 0) index = sortedHistory.findIndex(item => item.jobId === selectedJob);
      // Viewing another version of a listed job (via the dropdown).
      if (index < 0) index = sortedHistory.findIndex(item => historyKeyForJd(item.jobId) === resultsHistoryKey);
      return index;
    })();
    const prevJobItem = currentListIndex > 0 ? sortedHistory[currentListIndex - 1] : undefined;
    const nextJobItem = currentListIndex >= 0 && currentListIndex < sortedHistory.length - 1
      ? sortedHistory[currentListIndex + 1]
      : undefined;
    const showJobNavigation = currentListIndex >= 0 && sortedHistory.length > 1;

    // Filters narrowing the list — the More Filters badge (sort excluded).
    const resultsActiveFilterCount =
      (filterRatingBand !== 'all' ? 1 : 0) +
      (filterScored !== 'all' ? 1 : 0) +
      (filterExperienceMin !== '' || filterExperienceMax !== '' ? 1 : 0);

    // One Export for both states, same as ScoredResumesTable: exports the
    // selection when there is one, otherwise every currently filtered row.
    // The button opens the CSV / Excel picker; the picker writes the file.
    const candidatesToExport = selectedCandidates.length > 0
      ? filteredCandidates.filter(c => selectedCandidates.includes(c.id))
      : filteredCandidates;
    const candidateExportColumns: ExportColumn[] = [
      { key: 'rank', header: 'Matched Rating' },
      { key: 'name', header: 'Candidate Name' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      { key: 'location', header: 'Location' },
      { key: 'jobTitle', header: 'Job Title' },
      { key: 'jobVersion', header: 'Job Version' },
      { key: 'skills', header: 'Skills' },
      { key: 'experience', header: 'Experience' },
      { key: 'uploadedBy', header: 'Uploaded By' },
      { key: 'uploadDate', header: 'Uploaded Date' },
      { key: 'resumeVersion', header: 'Resume Version' },
      { key: 'attachments', header: 'Attachments' },
      { key: 'scoredStatus', header: 'Scored Status' },
    ];
    const handleExportCandidates = async (format: 'csv' | 'xlsx', picked?: string[]) => {
      const jobTitle = resultsJobTitle || 'Candidates';
      const jobVersion = resultsVersionNumber ? `v${resultsVersionNumber}` : '-';
      const rows = candidatesToExport.map(c => ({
        rank: c.rank ?? '-',
        name: c.name || 'Unknown',
        jobTitle,
        jobVersion,
        email: c.email || '-',
        phone: c.phone || '-',
        location: c.location || '-',
        skills: (c.skills || []).join(', '),
        experience: c.experience || '-',
        uploadedBy: formatUploadedBy(c.uploadedByName, c.uploadedBy),
        uploadDate: c.uploadDate ? formatISTDate(c.uploadDate) : '-',
        resumeVersion: `v${c.resumeVersion || 1}`,
        attachments: c.attachmentCount || 1,
        scoredStatus: scoredResumeIds.has(c.resumeId) ? 'Scored' : 'Not Scored',
      }));
      const filenameSafeTitle = jobTitle.replace(/\s+/g, '_');
      const dateStamp = new Date().toISOString().slice(0, 10);
      const cols = picked ? candidateExportColumns.filter(c => picked.includes(c.header)) : candidateExportColumns;
      await exportData(format, rows, cols, `AI_Talent_Match_${filenameSafeTitle}_${dateStamp}`, {
        sheetName: 'AI Talent Match',
        title: `${jobTitle} - AI Talent Match`,
      });
      toast.success(`Exported ${rows.length} candidate${rows.length !== 1 ? 's' : ''} to ${format === 'xlsx' ? 'Excel' : 'CSV'}`);
    };
    const excellentCount = matchedCandidates.filter(c => c.matchScore >= 85).length;
    const goodCount = matchedCandidates.filter(c => c.matchScore >= 70 && c.matchScore < 85).length;
    const moderateCount = matchedCandidates.filter(c => c.matchScore < 70).length;
    const historyItemForSelectedJob = matchHistory.find(item => item.jobId === selectedJob);
    const isLoadingResultsFromHistory =
      loadingHistorySessionId !== null &&
      (loadingHistorySessionId === selectedHistoryItem?.id || loadingHistorySessionId === historyItemForSelectedJob?.id);

    return (
      <>
      {aiInviteDialog}
      {createSendDialogEl}
      {scoringReviewDialog}
      {assessmentInviteDialogs}
      {createInviteTargetModal}
      <ExportFormatModal
        open={showCandidateExportModal}
        onClose={() => setShowCandidateExportModal(false)}
        title="Export Matched Candidates"
        recordCount={candidatesToExport.length}
        selected={selectedCandidates.length > 0}
        columns={candidateExportColumns.map(c => c.header)}
        columnPrefsKey="aiTalentMatchResultsExportColumns"
        defaultOffColumns={['Phone', 'Location', 'Skills', 'Attachments']}
        onExport={handleExportCandidates}
      />
      {/* Opened straight onto the version on screen; Go to JD inside it
          opens that version's job page. */}
      {selectedJob && (
        <JDVersionHistoryModal
          isOpen={showResultsJobDetail}
          onClose={() => setShowResultsJobDetail(false)}
          jdId={selectedJob}
          jdTitle={resultsJobTitle}
          initialVersionNumber={resultsVersionNumber}
          showGoToJd
          goToJdTab="ai-talent-match"
        />
      )}
      {showResultsColumnModal && (
        <ColumnCustomizationModal
          columns={RESULTS_COLUMNS.map(col => ({ ...col, enabled: isResultColumnVisible(col.id) }))}
          onClose={() => setShowResultsColumnModal(false)}
          onApply={applyResultColumns}
        />
      )}
      <main className="flex-1 overflow-x-clip bg-slate-50">
        <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={resumeTrail.active ? [
              ...resumeTrail.items,
              { label: `AI Talent Match: ${resultsJobTitle || 'Results'}` },
            ] : [
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Talent Match', onClick: () => setViewMode('history') },
              { label: resultsJobTitle || 'Results' },
            ]}
            // Previous / Next job rides inside the breadcrumb bar, as on the
            // other detail pages — through the Matched Jobs list in its
            // current order. Not when opened from one resume: that list is
            // every matched job, not this candidate's.
            actions={showJobNavigation && !resumeTrail.fromResumeView ? (
              <RecordPager
                currentIndex={currentListIndex}
                totalCount={sortedHistory.length}
                onPrev={prevJobItem ? () => switchResultsTo(prevJobItem, prevJobItem.jobId) : undefined}
                onNext={nextJobItem ? () => switchResultsTo(nextJobItem, nextJobItem.jobId) : undefined}
              />
            ) : undefined}
          />

          {/* SaaS Header */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-start gap-3 min-w-0">
                <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-brand-blue" />
                </div>
                <div className="min-w-0">
                  {/* JD ID badge before the title — the same badge the job list rows use. */}
                  <div className="flex items-center gap-2 mb-1 min-w-0">
                    {resultsJobCode && (
                      <JobIdBadge className="inline-flex h-7 items-center flex-shrink-0">{resultsJobCode}</JobIdBadge>
                    )}
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight truncate min-w-0">{resultsJobTitle}</h1>
                    {/* JD version — a dropdown once the job has more than one
                        version to pick from, else the same pill as the
                        table's Job Version column. */}
                    {versionDropdownOptions.length > 1 ? (
                      /* A menu rather than a native <select>: the badge stays
                         a compact "v2", while each item carries its match
                         date/time and JD status pill, which an <option> can't. */
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="JD version"
                            title="Switch to another version's match results"
                            className="inline-flex items-center gap-0.5 flex-shrink-0 pl-2 pr-1 py-0.5 rounded-md font-semibold text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 hover:bg-brand-blue/15 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 transition-colors"
                          >
                            v{resultsVersionNumber ?? versionDropdownOptions.find(o => o.jdId === selectedJob)?.number}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-72 !rounded-lg !bg-white dark:!bg-slate-900 !py-1 !px-0 !shadow-xl">
                          {versionDropdownOptions.map(option => {
                            const isCurrent = option.jdId === selectedJob;
                            const tone = option.statusLabel ? getStatusConfig(option.statusLabel) : undefined;
                            return (
                              <DropdownMenuItem
                                key={option.jdId}
                                disabled={!option.matched}
                                onSelect={() => handleResultsVersionChange(option.jdId)}
                                className={`!rounded-none !px-3 !py-2 flex items-center gap-3 ${isCurrent ? 'bg-brand-blue/[0.06] dark:bg-brand-blue/[0.12]' : ''}`}
                              >
                                <span className={`w-9 text-center px-1.5 py-0.5 rounded-md font-semibold text-xs flex-shrink-0 ${isCurrent ? 'bg-brand-blue text-white' : 'text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300'}`}>
                                  v{option.number}
                                </span>
                                <span className="flex-1 min-w-0 text-xs leading-tight">
                                  {option.matchedAt ? (
                                    <>
                                      <span className="block text-gray-900 dark:text-slate-100">{formatISTDate(option.matchedAt.toISOString())}</span>
                                      <span className="block text-gray-500 dark:text-slate-400">{formatISTTime(option.matchedAt.toISOString())}</span>
                                    </>
                                  ) : (
                                    <span className="text-gray-400 dark:text-slate-500">{option.matched ? 'Matched just now' : 'Not matched'}</span>
                                  )}
                                </span>
                                {option.statusLabel && tone && (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border whitespace-nowrap flex-shrink-0 ${tone.bg} ${tone.text} ${tone.border}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                                    {option.statusLabel}
                                  </span>
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : resultsVersionNumber ? (
                      <span className="px-2 py-0.5 rounded-md font-semibold text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35 flex-shrink-0">
                        v{resultsVersionNumber}
                      </span>
                    ) : null}
                    {/* "View Job Detail" — the JD these candidates were matched
                        against, read-only, beside the version it names. Same
                        neutral pill and popup as Resume Scoring's header. */}
                    {selectedJob && (
                      <button
                        type="button"
                        onClick={() => setShowResultsJobDetail(true)}
                        title="View this job description"
                        className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors flex-shrink-0 bg-gray-50 dark:bg-slate-800/50 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue"
                      >
                        <Eye className="w-3 h-3" />
                        View Job Detail
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {matchedCandidates.length} matches
                    </span>
                    {/* Who ran this match — the session's `run_by_name`, the
                        same value the Matched Jobs row and Match History show.
                        "System" only when the run has no resolvable user. */}
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">
                        Matched by {selectedHistoryItem?.matchedByName || historyItemForSelectedJob?.matchedByName || 'System'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success-subtle text-success ring-1 ring-success-line">
                      <CheckCircle2 className="w-3 h-3" />
                      Complete
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/25">
                      <Sparkles className="w-3 h-3" />
                      AI Talent Match • 0 units consumed
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {/* Run Again — re-runs the match for this same JD version.
                    Not offered on a disabled or archived version. */}
                {selectedJob && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!canRunAiMatch) {
                        toast.error('You do not have permission to run AI Talent Match');
                        return;
                      }
                      if (!canRunAgainHere) return;
                      handleRunAIMatch(selectedJob);
                    }}
                    aria-disabled={!canRunAiMatch || !canRunAgainHere}
                    title={!canRunAiMatch
                      ? 'You do not have permission to run AI Talent Match'
                      : !canRunAgainHere
                        ? `This version is ${resultsJobStatus} — switch to the latest version to run again`
                        : 'Run the match again for this job'}
                    className={`w-full sm:w-auto ${!canRunAiMatch || !canRunAgainHere ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Run Again</span>
                  </Button>
                )}
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

          {/* Search + More Filters — the canonical list toolbar, laid out as
              Resume Scoring's Scored Resumes: search, More Filters (with the
              active count and Clear), the list actions, then the count badge.
              Rating, Scored Status, Experience and Sort live in the panel. */}
          {!isLoadingResultsFromHistory && matchedCandidates.length > 0 && (
          <div className="mb-4 space-y-3">
            <ListToolbar
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search by name, email, phone, location or skills..."
              onToggleFilters={() => setShowResultsFilters(open => !open)}
              filtersOpen={showResultsFilters}
              activeFilterCount={resultsActiveFilterCount}
              filtersApplied={resultsActiveFilterCount > 0}
              onClearFilters={() => {
                setFilterRatingBand('all');
                setFilterScored('all');
                setFilterExperienceMin('');
                setFilterExperienceMax('');
              }}
              className="mb-0"
              countBadge={
                <ListCountBadge
                  filtered={filteredCandidates.length}
                  total={matchedCandidates.length}
                  noun="candidate"
                  selected={selectedCandidates.length}
                />
              }
              filterPanel={
                <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="flex flex-wrap gap-4">
                    <div className={RESULTS_FILTER_FIELD_CLASS}>
                      <label className={RESULTS_FILTER_LABEL_CLASS}>Matched Rating</label>
                      <select
                        value={filterRatingBand}
                        onChange={(e) => setFilterRatingBand(e.target.value as 'all' | 'exact' | 'partial' | 'no_match')}
                        className={RESULTS_FILTER_CONTROL_CLASS}
                      >
                        <option value="all">All Matches</option>
                        <option value="exact">Rating 10</option>
                        <option value="partial">Rating 9 – 7</option>
                        <option value="no_match">Below 7</option>
                      </select>
                    </div>
                    <div className={RESULTS_FILTER_FIELD_CLASS}>
                      <label className={RESULTS_FILTER_LABEL_CLASS}>Scored Status</label>
                      <select
                        value={filterScored}
                        onChange={(e) => setFilterScored(e.target.value as 'all' | 'scored' | 'not_scored')}
                        className={RESULTS_FILTER_CONTROL_CLASS}
                      >
                        <option value="all">All Statuses</option>
                        <option value="scored">Scored</option>
                        <option value="not_scored">Not Scored</option>
                      </select>
                    </div>
                    {/* Experience — two inputs sharing one field, like Resume
                        Scoring's Score Range. */}
                    <div className={RESULTS_FILTER_FIELD_WIDE_CLASS}>
                      <label className={RESULTS_FILTER_LABEL_CLASS}>Experience (years)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0}
                          value={filterExperienceMin}
                          onChange={(e) => setFilterExperienceMin(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Min"
                          aria-label="Minimum experience (years)"
                          className={RESULTS_FILTER_CONTROL_CLASS}
                        />
                        <input
                          type="number"
                          min={0}
                          value={filterExperienceMax}
                          onChange={(e) => setFilterExperienceMax(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Max"
                          aria-label="Maximum experience (years)"
                          className={RESULTS_FILTER_CONTROL_CLASS}
                        />
                      </div>
                    </div>
                    {/* Sort isn't a filter, so it never counts toward the
                        badge or gets reset by Clear. */}
                    <div className={RESULTS_FILTER_FIELD_CLASS}>
                      <label className={RESULTS_FILTER_LABEL_CLASS}>Sort By</label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'score' | 'experience')}
                        className={RESULTS_FILTER_CONTROL_CLASS}
                      >
                        <option value="rank">Rating (High to Low)</option>
                        <option value="name">Name (A to Z)</option>
                        <option value="score">Score</option>
                        <option value="experience">Experience</option>
                      </select>
                    </div>
                  </div>
                  {/* Controls commit as they change, so Done just closes —
                      same flow as Resume Scoring. */}
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowResultsFilters(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              }
              /* Customize Columns right after More Filters — list view only
                 (the grid has no columns), hidden on the narrowest screens
                 like Resume Scoring's. */
              afterFiltersActions={resultsDisplayMode === 'list' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowResultsColumnModal(true)}
                  icon={<SlidersHorizontal className="w-4 h-4" />}
                  className="hidden sm:flex whitespace-nowrap"
                >
                  <span className="hidden md:inline">Customize Columns</span>
                  <span className="md:hidden">Columns</span>
                </Button>
              ) : undefined}
            >
              {/* With a selection, Score / Invite lead the actions, set apart
                  from the filter controls by a divider. */}
              {selectedCandidates.length > 0 && (
                <>
                  <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
                  <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!canRunScoring) {
                          toast.error('You do not have permission to score resumes');
                          return;
                        }
                        // Review first: the candidates, their versions and
                        // the job, in the shared Score Resume dialog.
                        void handleSubmitToScoring();
                      }}
                      disabled={availableUnits !== null && selectedCandidates.length > availableUnits}
                      aria-disabled={!canRunScoring}
                      title={!canRunScoring ? 'You do not have permission to score resumes' : undefined}
                      icon={<ClipboardList className="w-3.5 h-3.5" />}
                      className={`whitespace-nowrap ${!canRunScoring ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Score ({selectedCandidates.length})
                    </Button>
                  {/* "Invite" replaces the old standalone Assessment button —
                      a dropdown of the two invite destinations, so a bulk
                      AI Interview invite has the same entry point the row
                      menu already offers per candidate. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="primary" size="sm" icon={<Send className="w-3.5 h-3.5" />} className="whitespace-nowrap">
                        Invite ({selectedCandidates.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                      {(() => {
                        /* The job on screen — an invite for a job with no AI
                           Assessment / AI Interview yet is greyed, with
                           "＋ Create …" under it (create → back → invite). */
                        const resultsSessionId = selectedHistoryItem?.id ?? historyItemForSelectedJob?.id ?? '';
                        const rows = matchedCandidates
                          .filter(c => selectedCandidates.includes(c.id))
                          .map(c => toInviteRow(resultsSessionId, selectedJob, c));
                        const target = [inviteTargetJobOf(selectedJob, resultsJobTitle)];
                        const create = (kind: InviteHandoffKind) => (job: InviteTargetJob) =>
                          setCreateInviteTarget({ kind, job, rows, view: 'results' });
                        return (
                          <>
                            {renderInviteTargetItems({
                              kind: 'assessment',
                              target: resolveInviteTargetState('assessment', target, () => true),
                              label: 'Create / Send Assessment',
                              itemClass: actionsMenuItemClass,
                              allowed: canCreateAssessments,
                              onInvite: (e) => {
                                if (!canCreateAssessments) {
                                  e.preventDefault();
                                  toast.error('You do not have permission to invite to an assessment');
                                  return;
                                }
                                openInviteForRows('assessment', selectedJob, rows);
                              },
                              onCreate: create('assessment'),
                            })}
                            {renderInviteTargetItems({
                              kind: 'interview',
                              target: resolveInviteTargetState('interview', target, () => true),
                              label: 'Create / Send AI Interview',
                              itemClass: actionsMenuItemClass,
                              allowed: canCreateAIInterviews,
                              onInvite: (e) => {
                                if (!canCreateAIInterviews) {
                                  e.preventDefault();
                                  toast.error('You do not have permission to invite to an AI interview');
                                  return;
                                }
                                openInviteForRows('interview', selectedJob, rows);
                              },
                              onCreate: create('interview'),
                            })}
                          </>
                        );
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!canExport) {
                    toast.error('You do not have permission to export');
                    return;
                  }
                  if (candidatesToExport.length === 0) {
                    toast.error('No candidates to export');
                    return;
                  }
                  setShowCandidateExportModal(true);
                }}
                aria-disabled={!canExport}
                title={!canExport ? 'You do not have permission to export' : undefined}
                icon={<FileDown className="w-4 h-4" />}
                className={`whitespace-nowrap ${!canExport ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Export
              </Button>
              <ListViewToggle value={resultsDisplayMode} onChange={setDisplayModeEverywhere} />
            </ListToolbar>

            {selectedCandidates.length > 0 && availableUnits !== null && selectedCandidates.length > availableUnits && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-orange/10 border border-brand-orange/30 ring-1 ring-brand-orange/15 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-brand-orange-deep flex-shrink-0" />
                <span className="text-xs text-brand-orange-deep font-medium">
                  Insufficient units! You have {availableUnits} RS unit{availableUnits !== 1 ? 's' : ''} but selected {selectedCandidates.length}. Remove {selectedCandidates.length - availableUnits} resume{selectedCandidates.length - availableUnits > 1 ? 's' : ''}.
                </span>
              </div>
            )}
          </div>
          )}

          {/* Candidates List */}
          <div>
          {isLoadingResultsFromHistory ? (
            /* Selected-job candidates: select, Matched Rating, Candidate Name,
               Email, Phone, Location, Job Title, Job Version, Skills,
               Experience, Uploaded By, Uploaded Date, Resume Version,
               Attachments, Scored Status, Actions. */
            <MatchTableSkeleton
              cols={['w-6', 'w-20', 'w-28', 'w-28', 'w-20', 'w-20', 'w-24', 'w-16', 'w-24', 'w-16', 'w-24', 'w-20', 'w-20', 'w-16', 'w-20', 'w-16']}
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
                    toast.error('You do not have permission to run AI Talent Match');
                    return;
                  }
                  handleRunAIMatch(selectedJob);
                }}
                aria-disabled={!canRunAiMatch}
                className={!canRunAiMatch ? 'opacity-50 cursor-not-allowed' : ''}
                title={!canRunAiMatch ? 'You do not have permission to run AI Talent Match' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Run AI Match
              </Button>
            </div>
          ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm">
            {/* Bounded viewport so only the rows scroll — pagination below stays put. */}
            <div className={`${resultsDisplayMode === 'grid' ? 'hidden' : 'hidden md:block'} min-h-[400px] max-h-[calc(100dvh-20rem)] overflow-auto tf-table-shell`}>
            <table className="w-full" style={{ minWidth: 260 + visibleResultColumnCount * 110 }}>
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
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Matched Rating
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Candidate Name
                  </th>
                  {isResultColumnVisible('email') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  )}
                  {isResultColumnVisible('phone') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Phone
                  </th>
                  )}
                  {isResultColumnVisible('location') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Location
                  </th>
                  )}
                  {isResultColumnVisible('jobTitle') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Job Title
                  </th>
                  )}
                  {isResultColumnVisible('jobVersion') && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Job Version
                  </th>
                  )}
                  {isResultColumnVisible('skills') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Skills
                  </th>
                  )}
                  {isResultColumnVisible('experience') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Experience
                  </th>
                  )}
                  {isResultColumnVisible('uploadedBy') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded By
                  </th>
                  )}
                  {isResultColumnVisible('uploadDate') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Uploaded Date
                  </th>
                  )}
                  {isResultColumnVisible('resumeVersion') && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Resume Version
                  </th>
                  )}
                  {isResultColumnVisible('attachments') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Attachments
                  </th>
                  )}
                  {isResultColumnVisible('scoredStatus') && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    Scored Status
                  </th>
                  )}
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
                    <td className="text-center px-4 py-4">
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
                    {isResultColumnVisible('email') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.email ? candidate.email : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    )}
                    {isResultColumnVisible('phone') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {(() => {
                        const numbers = splitPhoneNumbers(candidate.phone, 2);
                        return numbers.length > 0
                          ? <div className="flex flex-col gap-0.5">{numbers.map((num, i) => <span key={i}>{num}</span>)}</div>
                          : <span className="text-gray-400 dark:text-slate-500">-</span>;
                      })()}
                    </td>
                    )}
                    {isResultColumnVisible('location') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.location ? candidate.location : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    )}
                    {isResultColumnVisible('jobTitle') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      <span className="block max-w-[220px] truncate">
                        {resultsJobTitle || '-'}
                      </span>
                    </td>
                    )}
                    {isResultColumnVisible('jobVersion') && (
                    <td className="text-center px-4 py-3">
                      {resultsVersionNumber ? (
                        <span className="px-2 py-0.5 rounded-md font-semibold text-xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                          v{resultsVersionNumber}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    )}
                    {isResultColumnVisible('skills') && (
                    <td className="px-4 py-4 min-w-[220px] max-w-[260px]">
                      {/* One chip shown in full, the rest collapse into "+N
                          more" — flex-nowrap so a row with more/longer skills
                          than another never grows taller than it. */}
                      <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                        <SkillsList
                          skills={candidate.skills}
                          max={1}
                          chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 min-w-0 shrink truncate max-w-[160px]"
                          moreClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs text-brand-blue font-medium hover:bg-brand-blue/10 transition-colors cursor-pointer shrink-0"
                        />
                      </div>
                    </td>
                    )}
                    {isResultColumnVisible('experience') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{candidate.experience}</td>
                    )}
                    {isResultColumnVisible('uploadedBy') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                    </td>
                    )}
                    {isResultColumnVisible('uploadDate') && (
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                      {candidate.uploadDate ? formatISTDate(candidate.uploadDate) : <span className="text-gray-400 dark:text-slate-500">-</span>}
                    </td>
                    )}
                    {isResultColumnVisible('resumeVersion') && (
                    <td className="text-center px-4 py-4">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
                        v{candidate.resumeVersion || 1}
                      </span>
                    </td>
                    )}
                    {isResultColumnVisible('attachments') && (
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
                    )}
                    {isResultColumnVisible('scoredStatus') && (
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
                    )}
                    <td className="px-4 py-4 text-right tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Actions"
                            title="Actions"
                            className={ROW_ACTION_BUTTON_CLASS}
                          >
                            <MoreVertical className="w-4 h-4" />
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
                          <DropdownMenuItem
                            className={`${actionsMenuItemClass} ${!canRunScoring ? 'opacity-50' : ''}`}
                            disabled={!candidate.resumeId}
                            title={!canRunScoring ? 'You do not have permission to score resumes' : undefined}
                            onSelect={() => {
                              if (!canRunScoring) {
                                toast.error('You do not have permission to score resumes');
                                return;
                              }
                              if (!candidate.resumeId) return;
                              setSelectedCandidates([candidate.id]);
                              handleSubmitToScoring([candidate.id]);
                            }}
                          >
                            <ClipboardList className="w-4 h-4 text-menu-icon-score" />
                            <span className={MENU_ITEM_SCALE_CLASS}>Score Resume</span>
                          </DropdownMenuItem>
                          {renderRowInviteItems(
                            toInviteRow(selectedHistoryItem?.id ?? historyItemForSelectedJob?.id ?? '', selectedJob, candidate),
                            'results',
                            resultsJobTitle,
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Grid view — roomy cards, one fact per line: who (name,
                email, rating), which job, contact details, skills, then the
                upload / scoring facts and the View action in a footer. */}
            {resultsDisplayMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {paginatedCandidates.map((candidate) => {
                const isSelected = selectedCandidates.includes(candidate.id);
                const isScored = !!candidate.resumeId && scoredResumeIds.has(candidate.resumeId);
                const openResume = () => {
                  if (!candidate.resumeId) return;
                  try {
                    sessionStorage.setItem('resumeNavList', JSON.stringify(filteredCandidatesMemo.map((c: MatchedCandidateWithVersions) => c.resumeId).filter(Boolean)));
                    sessionStorage.setItem('resumeNavSource', 'ai-talent-match');
                    sessionStorage.setItem('resumeNavAIMatchJobId', selectedJob);
                    sessionStorage.setItem('resumeNavAIMatchJobTitle', resultsJobTitle || '');
                    markAIMatchReturnTrip();
                  } catch { /* ignore */ }
                  router.push(`/recruitment/resume-view/${candidate.resumeId}`);
                };
                return (
                  <div
                    key={candidate.id}
                    onClick={openResume}
                    className={`group relative flex flex-col min-h-[340px] rounded-xl border p-5 shadow-sm transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                      isSelected
                        ? 'bg-brand-blue/[0.04] border-brand-blue/40 ring-1 ring-brand-blue/20'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-brand-blue/30'
                    }`}
                  >
                    {/* Header: select · avatar · name/email · rating */}
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectCandidate(candidate.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${candidate.name || 'candidate'}`}
                        className="mt-3 rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/40 flex-shrink-0"
                      />
                      <div className="w-11 h-11 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-sm text-brand-blue font-semibold flex-shrink-0">
                        {(candidate.name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-50 truncate" title={candidate.name || 'Unknown'}>
                          {candidate.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5" title={candidate.email || ''}>
                          {candidate.email || '—'}
                        </p>
                      </div>
                      <div className="flex flex-col items-center flex-shrink-0">
                        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold border ${rankBadgeClass(candidate.rank || 0)}`}>
                          {candidate.rank || '-'}
                        </span>
                        <span className="text-2xs text-gray-400 dark:text-slate-500 mt-1">Rating</span>
                      </div>
                    </div>

                    {/* Job */}
                    <div className="mt-4 flex items-center gap-2 min-w-0">
                      <span className="text-xs text-gray-700 dark:text-slate-300 truncate" title={resultsJobTitle}>
                        {resultsJobTitle || '-'}
                      </span>
                      {resultsVersionNumber && (
                        <span className="px-1.5 py-0.5 rounded-md font-semibold text-2xs text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 flex-shrink-0">
                          v{resultsVersionNumber}
                        </span>
                      )}
                    </div>

                    {/* Contact + experience, one per line */}
                    <div className="mt-3 space-y-2 text-xs text-gray-600 dark:text-slate-400">
                      <div className="flex items-center gap-2 min-w-0">
                        <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        <span className="truncate">{splitPhoneNumbers(candidate.phone, 1)[0] || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        <span className="truncate" title={candidate.location || ''}>{candidate.location || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Briefcase className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        <span className="truncate">{candidate.experience || '—'}</span>
                      </div>
                    </div>

                    {/* Skills */}
                    <div className="mt-4 flex flex-wrap gap-1.5 min-h-[1.5rem]">
                      <SkillsList
                        skills={candidate.skills}
                        max={3}
                        chipClassName="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs bg-brand-blue/10 text-brand-blue border border-brand-blue/20 max-w-[140px] truncate"
                        moreClassName="inline-flex items-center px-2 py-0.5 rounded-full text-2xs text-brand-blue font-medium hover:bg-brand-blue/10 transition-colors cursor-pointer"
                      />
                    </div>

                    {/* Footer — pinned to the bottom so every card in a row
                        lines up regardless of how much it holds above. */}
                    <div className="mt-auto pt-4">
                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100 dark:border-slate-800">
                        {isScored ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-success-subtle text-success ring-1 ring-success-line">
                            <CheckCircle className="w-3 h-3" />
                            Scored
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 ring-1 ring-gray-200 dark:ring-slate-700">
                            <XCircle className="w-3 h-3" />
                            Not Scored
                          </span>
                        )}
                        <span className="text-2xs text-gray-500 dark:text-slate-500 truncate" title={`Uploaded by ${formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}`}>
                          {formatUploadedBy(candidate.uploadedByName, candidate.uploadedBy)}
                          {candidate.uploadDate && <> · {formatISTDate(candidate.uploadDate)}</>}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openResume(); }}
                          disabled={!candidate.resumeId}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 text-gray-800 dark:text-slate-200 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedVersionsCandidate(candidate); }}
                          title="Attachments"
                          aria-label={`Attachments (${candidate.attachmentCount || 1})`}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {candidate.attachmentCount || 1}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {/* List view's stand-in below md, where the table is too wide. */}
            {resultsDisplayMode === 'list' && (
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
                          {resultsJobTitle || '-'}
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
            )}

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
      </>
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

      {aiInviteDialog}
      {createSendDialogEl}
      {scoringReviewDialog}


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

      {assessmentInviteDialogs}

    </>
  );
}
