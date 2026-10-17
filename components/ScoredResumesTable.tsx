import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { RESUME_EMAIL_SHARE_ENABLED } from '@/lib/constants/featureFlags';
import { Mail, Phone, Calendar, Search, Download, FileDown, CheckSquare, Square, Filter, X, UserPlus, Eye, AlertCircle, Loader2, Send, ShieldAlert, Info, ClipboardList, Share2, Paperclip, FileText, FileSpreadsheet, MoreVertical, Award, ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Plus, Video, BarChart3 } from 'lucide-react';
import { matchBadgeClass, MATCH_SCORE_TEXT_CLASS, normalizeMatchResult, formatOverallScore, formatOverallScoreValue } from '@/lib/utils/matchStatus';
import { truncateJobTitle } from '@/lib/utils/jobOpeningDisplay';
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import ScoredResumesExportModal from './ScoredResumesExportModal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import ListToolbar from '@/components/ui/list-toolbar';
import ListEmptyState from '@/components/ui/list-empty-state';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { useListSearch } from '@/lib/hooks/useListSearch';
import InviteShareModal from './InviteShareModal';
import InviteToAIInterviewFlow from './InviteToAIInterviewFlow';
import type { Resume } from '@/lib/types/types';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { CREATE_SEND_BUTTON_CLASS } from '@/lib/constants/createSendActions';
import { scoringService } from '@/lib/services/scoringService';
import { assessmentService } from '@/lib/services/assessmentService';
import { resumeService } from '@/lib/services/resumeService';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import ScoreTableModal from './ScoreTableModal';
import ListPagination from './ListPagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import SearchableSelect from '@/components/ui/searchable-select';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { useAllJobInviteTargets } from '@/lib/hooks/useAllJobInviteTargets';
import { formatIST, formatISTDate, formatISTTime, parseIST } from '@/lib/utils/dateUtils';
import { splitPhoneNumbers } from '@/lib/utils/phoneUtils';
import { downloadScorecardsZip as downloadScorecardsZipShared } from '@/lib/utils/scorecardDownload';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { SelectAllMenu, SortByControl } from '@/components/ui/select-all-menu';

/* Action menu item styling — cloned from the Job Openings page's three-dot
   menu (JobsListing.tsx: gray-700 text, hover:bg-gray-50, px-4/py-2.5 rows,
   sharp corners, a scale-on-hover label) so both menus read as one component
   even though this table's overflow-x-auto shell needs Radix's portal rather
   than that page's hand-rolled absolute dropdown. The `!` overrides beat the
   dropdown-menu primitive's own default item styling (accent bg, rounded-sm,
   muted-foreground icons). */
// !outline-none: globals.css's `[tabindex]:focus-visible:not([tabindex="-1"])`
// rule outranks the item's own plain `outline-hidden` on specificity, so when
// Radix moves native focus onto the highlighted item (mouse hover included,
// not just keyboard) that global rule painted a visible ring around it. The
// `data-[highlighted]` background above is this item's own focus indicator;
// !important is what it takes to actually beat that global selector.
const scoredResumesMenuItemClass = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';
/* One look and one height for every control in the toolbar row — the same
   resting style as the toolbar's own More Filters button, which it cannot be
   handed a class for. 38px is that button's natural height (py-2 + text-sm +
   a 1px border each side). */
/* Sort by — the Job Openings list's control. View by Candidates sorts
   people; the flat list sorts rows. */
type SortKey = 'date' | 'name' | 'versions' | 'exact' | 'partial' | 'none' | 'jobTitle' | 'score';
const GROUPED_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date', label: 'Latest Updated' },
  { value: 'name', label: 'Candidate Name' },
  { value: 'versions', label: 'Job Versions' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'partial', label: 'Partial Match' },
  { value: 'none', label: 'No Match' },
];
const FLAT_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date', label: 'Scored Date' },
  { value: 'name', label: 'Candidate Name' },
  { value: 'jobTitle', label: 'Job Title' },
  { value: 'score', label: 'Score' },
];

const TOOLBAR_BUTTON_CLASS =
  'h-[38px] px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed';


/* ---- The More Filters panel's field metrics ---------------------------------
   One width and one control style for every field in that panel, so "all the
   same size" is guaranteed by construction rather than by seven copies of a
   class string happening to agree — which is what let them drift in the first
   place.

   180px is sized to the WIDEST thing any of these controls must actually
   display: a native date input's `dd/mm/yyyy` plus its picker glyph. Every
   other field needs less, and none of them needs the third-of-a-panel the old
   stretching grid handed out. Full width below `sm`, where one field per row is
   the only thing that fits. */
export const FILTER_FIELD_CLASS = 'w-full sm:w-auto sm:grow sm:basis-[170px] sm:max-w-[280px]';

/* Score Range holds TWO controls in one field, so it asks for more room up
   front and takes a bigger share of whatever its row has spare — at the shared
   basis each input gets ~80px and reads cramped beside its neighbours. */
export const FILTER_FIELD_WIDE_CLASS = 'w-full sm:w-auto sm:grow-[1.5] sm:basis-[240px] sm:max-w-[380px]';
export const FILTER_LABEL_CLASS = 'block text-sm text-gray-700 mb-1 truncate';
export const FILTER_CONTROL_CLASS =
  'w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-600 bg-white';

/* Job Details' More Filters panel — the AI Talent Match tab's own layout,
   copied class for class, which the Score Resume, Assessment Result and AI
   Interview Result tabs use when embedded there: a 1 / 2 / 4-column grid
   (each field one cell), medium labels and 36px brand-blue inputs. Standalone
   pages keep the FILTER_* row above. */
export const JOB_TAB_FILTER_GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 [&>div]:min-w-0';
export const JOB_TAB_FILTER_FIELD_CLASS = 'min-w-0';
export const JOB_TAB_FILTER_LABEL_CLASS = 'block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium';
export const JOB_TAB_FILTER_CONTROL_CLASS =
  'w-full h-9 px-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue hover:border-brand-blue/40 transition-colors text-sm text-black dark:text-slate-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900';

/* The table's columns — FIXED, in this order (Actions follows as its own
   sticky column). No per-user customization: every recruiter sees the same
   table. "Candidate" carries the email under the name rather than spending a
   column on it. */
/* Short, fixed-width values read better centred under their header. */
const CENTERED_COLUMNS = new Set(['jobVersion', 'scorePercentage', 'version']);

const TABLE_COLUMNS = [
  { id: 'candidateName', label: 'Candidate' },
  { id: 'jdId', label: 'JD ID' },
  { id: 'jobTitle', label: 'Job Title' },
  { id: 'jobVersion', label: 'Job Version' },
  { id: 'matchStatus', label: 'Match Status' },
  { id: 'scorePercentage', label: 'Score out of 10' },
  { id: 'version', label: 'Resume Version' },
  { id: 'scoredDate', label: 'Scored By / Date' },
];

/** Upper-cases only the first letter; the rest is left as typed. */
const capitalizeFirst = (value: string): string => {
  if (!value) return value;
  const i = value.search(/\S/);
  return i < 0 ? value : value.slice(0, i) + value.charAt(i).toUpperCase() + value.slice(i + 1);
};

/** The 0.0–10.0 rating a row is filtered on — the same number the Score
 *  column prints. Older records without `overallRating10` fall back to their
 *  percentage on the same scale. */
/** Stable sort by a number / text key; ties keep the incoming order. */
function sortByKey<T>(items: T[], keyOf: (item: T) => number | string, order: 'asc' | 'desc'): T[] {
  return items
    .map((item, index) => ({ item, index, key: keyOf(item) }))
    .sort((a, b) => {
      const cmp = typeof a.key === 'string' || typeof b.key === 'string'
        ? String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: 'base' })
        : a.key - b.key;
      return cmp !== 0 ? (order === 'asc' ? cmp : -cmp) : a.index - b.index;
    })
    .map((x) => x.item);
}

const rowRating10 = (r: { overallRating10?: number; scorePercentage: number }) =>
  r.overallRating10 ?? (r.scorePercentage ?? 0) / 10;

/**
 * One end of the Score Range filter, shown on the 0.0–10.0 scale.
 *
 * Holds its own text while the user types so "5." or an emptied box isn't
 * snapped back mid-keystroke by a controlled number input; the parsed,
 * clamped value is committed on every change, and the box re-formats to one
 * decimal on blur (and whenever the value changes from outside, e.g. Reset).
 */
function ScoreBoundInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder: string;
  ariaLabel: string;
  className: string;
}) {
  const [text, setText] = useState(value.toFixed(1));
  useEffect(() => {
    if (Number(text) !== value) setText(value.toFixed(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min="0"
      max="10"
      step="0.1"
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === '') return;
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(Math.min(10, Math.max(0, n)));
      }}
      onBlur={() => setText(value.toFixed(1))}
      className={className}
    />
  );
}

/** The key "View by Candidates" groups rows by: one candidate per email. */
export const candidateGroupKey = (r: { email?: string; candidateName?: string; id: string }) =>
  (r.email || r.candidateName || r.id).trim().toLowerCase();

export interface ScoredResume {
  id: string;
  resumeId?: string;  // Actual resume ID (different from score ID)
  candidateName: string;
  email: string;
  phone: string;
  matchStatus: string;
  scorePercentage: number;
  // Resume Match Rating Mechanism (client doc, Sept 2026): the 0-10 Overall
  // Rating shown instead of scorePercentage wherever the score is printed as
  // plain text - see formatOverallScore() in lib/utils/matchStatus.ts.
  overallRating10?: number;
  scoredDate: string;
  scoredBy: string;
  experience?: string;
  // Education can arrive as a label ("Bachelor's"), a structured array from the
  // candidate-detail endpoint, or be absent. The cell renderer below handles
  // each shape; the union here keeps narrowing precise instead of collapsing.
  education?: string | Array<{ degree?: string; institution?: string }>;
  // Certifications: simple string list or structured objects with a name field.
  certifications?: Array<string | { name?: string }>;
  // Version info
  version?: number;
  resumeVersion?: number;
  // The JD's own version at scoring time (distinct from the resume's own
  // version above) — only meaningful in the cross-job "All Candidates" list,
  // where the same job title can repeat once per JD version.
  jobVersion?: number;
  // Source and status fields
  source?: 'my-resumes' | 'database' | string;
  status?: 'completed' | 'failed' | 'processing' | 'queued' | string;
  errorReason?: string;
  // Real scoring data from API
  aiSummary?: string;
  strengths?: string[];
  gaps?: string[];
  // Skill lists carried through from the resume converters (technical_skills ->
  // technicalSkills etc.). JobDetailView's onViewCandidate reads them as a fallback
  // chain (matchedSkills || technicalSkills || skills); all optional because which
  // ones are present depends on the endpoint the row came from.
  matchedSkills?: string[];
  missingSkills?: string[];
  technicalSkills?: string[];
  skills?: string[];
  matchReason?: string;
  scoreBreakdown?: {
    skillsMatch: number;
    experienceMatch: number;
    educationMatch: number;
    overallFit: number;
  };
  title?: string;
  currentCompany?: string;
  location?: string;
  // For global view
  jobTitle?: string;
  jdId?: string;
  /** The readable job code (e.g. "JD-151") this row's score belongs to —
   *  only set in the global "View by Candidates" view, where rows span
   *  different jobs. In a single-job view every row shares the host's own
   *  `jobId` prop instead, so this stays unset there. */
  jobCode?: string;
}

interface ScoredResumesTableProps {
  resumes: ScoredResume[];
  jobTitle: string;
  jobId?: string;
  /** The readable job code (e.g. "JD-151") for this single-job host, used to
   *  prefix downloaded scorecard filenames. Left unset by the global "View
   *  All Candidates" host, which instead relies on each row's own `jobCode`
   *  since rows there span different jobs. */
  jobCode?: string;
  /** This single-job host's JD version — the version every score here was
   *  fetched for. Only the View Score Table popup reads it, as a fallback for
   *  a row without its own `jobVersion`; the table's Job Version column stays
   *  on the rows' own values. */
  jobVersion?: number | null;
  availableUnits?: number;
  initialMatchStatus?: 'all' | 'Exact Match' | 'Partial Match' | 'No Match';
  /**
   * Drop the Match Status field from More Filters.
   *
   * Set by a host whose LIST is already one verdict — the Exact Match, Partial
   * Match and No Match sections, which hand down rows the parent has already
   * narrowed. A status filter there is at best a no-op and at worst a
   * contradiction: picking "No Match" inside the Exact Match section empties
   * the table and reads as a bug.
   *
   * It hides the control AND stops the filter applying, rather than just
   * hiding it. A value set on an earlier, unscoped view would otherwise stay
   * live behind a control that is no longer on screen to undo it — and would
   * still be counted on the Filters badge.
   */
  hideMatchStatusFilter?: boolean;
  /**
   * Preselects the date-range filter to one day (YYYY-MM-DD) — the host's way
   * of opening this table already narrowed to one scoring session, e.g. from
   * a Scoring History row. Same sync-on-change pattern as `initialMatchStatus`
   * below.
   */
  initialScoredDate?: string;
  onViewCandidate?: (resume: ScoredResume) => void;
  selectedResumes?: string[];
  onSelectResume?: (resumeId: string) => void;
  onSelectAll?: (resumeIds: string[]) => void;
  isGlobalView?: boolean; // Show job title column in global view
  /**
   * The heading above the search box. Defaults to "Scored Resumes".
   *
   * The Resume Scoring page shows six different lists through this one table —
   * per-job, per-candidate, all events, and one per match verdict — and a fixed
   * heading named none of them, so the card looked identical whichever pill was
   * selected. The host passes the selected section's name instead.
   */
  title?: string;
  /**
   * Cluster rows by candidate email (one visual group per person) rather
   * than the flat, mixed-candidate order the rows arrive in. Meaningful only
   * when there's more than one row per person to begin with — i.e. a
   * cross-job list — so it defaults off and a host opts in explicitly (the
   * Resume Scoring "View by Candidates" card does; its sibling "Total
   * Resumes Scored" card deliberately doesn't, showing the identical rows
   * as a flat per-scoring-event list instead).
   */
  groupByEmail?: boolean;
  /**
   * Grouped view only: told the candidates in on-screen order (search and
   * filters applied, one row per candidate - their most recent score), so
   * the host's results page can step Prev / Next candidate by candidate.
   */
  onCandidateOrderChange?: (candidates: ScoredResume[]) => void;
  /**
   * Opens the caller's "Select Applicants to Score" flow. Optional so the
   * button only appears where a host has somewhere to send it — JobDetailView
   * owns SelectSourceModal; ResumeScoringPage has its own scoring entry points.
   */
  onScoreResumes?: () => void;
  /**
   * Score Resumes CTA shown inside the empty state's illustration card, for
   * when this table's own list is empty from the start (not narrowed by a
   * search/filter) — separate from `onScoreResumes` (the persistent header
   * button) so a host wanting the CTA only in the "no resumes scored yet"
   * moment doesn't also get a redundant button in the header once resumes
   * exist.
   */
  onScoreResumesFromEmptyState?: () => void;
  /** When true, the empty-state "Score Resumes" button stays visible but
   *  renders disabled — the host lacks the scoring permission but the
   *  handler above is still provided (guarded internally) so the button
   *  is never removed from the DOM. */
  scoreResumesDisabled?: boolean;
  /**
   * Opens the host's "Send AI Interview via Email" flow for one candidate —
   * the AI Interview entry in each row's Invite menu. Omitted where the host
   * has no AI interview to invite to (or the viewer can't share one), and the
   * menu then offers Assessment alone.
   */
  onInviteAIInterview?: (candidate: { name: string; email: string; resumeId?: string }) => void;
  /**
   * Opt-in for a host that has NO per-job AI Interview plumbing of its own
   * (the cross-job Resume Scoring lists, where every row can belong to a
   * different job) — this component then resolves and shares the invite
   * itself per row, using that row's own `jdId`. Ignored when
   * `onInviteAIInterview` is supplied; a host that sometimes omits
   * `onInviteAIInterview` for its OWN reasons (e.g. JobDetailView hiding it
   * for a disabled job) must NOT also set this, or that per-case gate would
   * be bypassed by this fallback silently resolving anyway.
   */
  enableInternalAIInterviewInvite?: boolean;
  /**
   * Whether the host JD actually has a published assessment / a live AI
   * interview to invite candidates to. A row's Invite menu only offers what
   * exists: with neither, the whole Invite button is disabled rather than
   * opening a menu whose every entry dead-ends in "create one first".
   *
   * `undefined` means the host doesn't track this (the Resume Scoring global
   * view spans many JDs), and the entry keeps its permission-only gate.
   */
  assessmentConfigured?: boolean;
  aiInterviewConfigured?: boolean;
  /**
   * The host's "Show:" view pills (View by Job / View by Candidates / All
   * Resumes / verdict filters). Rendered between the search/filter bar and
   * the Select All row so the two read as one control stack, rather than
   * floating above the whole card. Omitted by hosts that don't have a pill
   * row of their own (e.g. a single-job view).
   */
  viewPillsSlot?: React.ReactNode;
  /**
   * Offer "＋ Create AI Assessment / AI Interview" under a greyed invite when
   * the ticked candidates' one job has none yet. The host takes it from
   * there (Resume Scoring: explain, keep the selection, go create, come
   * back and invite). Without it the invite is just greyed with the reason.
   */
  onCreateInviteTarget?: (kind: 'assessment' | 'interview', job: InviteTargetJob, rows: ScoredResume[]) => void;
  /**
   * The selection Actions menu's AI Assessment / AI Interview Invite open the
   * host's version popup (the AI Talent Match tab's VersionInviteDialog) with
   * the ticked candidates, instead of this table's own invite flow. The popup
   * handles a job with no version yet (pick one, or create the next).
   */
  onOpenInviteDialog?: (kind: 'assessment' | 'interview', candidates: InviteCandidate[]) => void;
  /**
   * Job Details → Resume Scoring: a row's ⋮ menu lists the two invite entries
   * (Create / Send Assessment | AI Interview) directly, instead of under an
   * "Invite ▸" submenu. Same entries, gates and handlers either way.
   */
  inlineRowInviteItems?: boolean;
  /**
   * Embedded use — the rows of ONE job opened inline under its row in
   * Resume Scoring's "View by Job". Drops the card chrome and the whole
   * search / More Filters / view-toggle toolbar (the host's own controls
   * already narrowed these rows); the selection's Download / Invite / Export
   * appear in a slim bar only once rows are ticked.
   */
  compact?: boolean;
  /**
   * With `compact`: don't show the slim Export / Actions bar on ticked rows —
   * the host's own toolbar acts on the selection (View by Job, whose job
   * ticks drive this table's ticks).
   */
  hideSelectionBar?: boolean;
  /**
   * When provided, the search / More Filters toolbar portals into this node
   * (the JobDetailView tab-navigation card's toolbar slot) instead of
   * rendering inline above the table, so the controls read as the second row
   * of the tab card. Keeps all toolbar state local. Optional — every other
   * host leaves it unset and the toolbar renders inline exactly as before.
   */
  toolbarPortal?: HTMLElement | null;
  /**
   * Table column ids to leave out (see TABLE_COLUMNS) — for a host that
   * already shows them around the table, e.g. AI Talent Match's per-candidate
   * score table, whose row above names the candidate and the job.
   */
  hiddenColumnIds?: string[];
  /**
   * List / Grid, controlled by the host. The table unmounts while a detail
   * page is open, so its own state reset to List on Back — a host that wants
   * the choice kept owns (and persists) it here. Uncontrolled when omitted.
   */
  displayMode?: ListDisplayMode;
  onDisplayModeChange?: (mode: ListDisplayMode) => void;
  /**
   * View by Candidates under a verdict filter: the host hands the FILTERED
   * rows as `resumes` (who is listed) and every row here (what each one's
   * Exact / Partial / No Match counts read). Without it the counts came from
   * the filtered rows, so under "No Match" every candidate read Exact 0 /
   * Partial 0 whatever they really had — unlike View by Job, whose badges
   * count every score and grey the verdicts outside the filter.
   */
  verdictCountRows?: ScoredResume[];
  /** The verdict filter in force: the other two counts are shown muted. */
  activeVerdict?: 'Exact Match' | 'Partial Match' | 'No Match' | null;
  /** Opt-in: how a candidate's name is SHOWN (Job Details: first name
   *  capitalised). Display only — search, sort, filters and exports keep the
   *  name as it is; other hosts leave it unset. */
  formatCandidateName?: (name: string) => string;
}

/**
 * Who may run Resume Scoring's bulk / invite actions — Download Scorecard,
 * Assessment invite, AI Interview invite — and why not. One source for
 * ScoredResumesTable and View by Job's Actions menu, so both gate alike.
 *
 * @param canCarryAIInterview the host can actually run an AI Interview
 *   invite (its own handler, or the internal resolve-and-share flow).
 */
/** The job an invite / a "Create …" acts on. */
export interface InviteTargetJob {
  jdId: string;
  jdCode?: string;
  jdTitle: string;
}

/**
 * Can the ticked candidates be invited to an AI Assessment / AI Interview?
 *  - 'ready'   — yes (or unknown: never gate on a lookup that hasn't answered)
 *  - 'missing' — one job, and it has none yet → offer to create it
 *  - 'multi'   — the candidates span several jobs and the invite needs one
 *                (assessment always; interview only when one lacks it)
 */
export type InviteTargetState =
  | { state: 'ready' }
  | { state: 'missing'; job: InviteTargetJob }
  | { state: 'multi' };

export function resolveInviteTargetState(
  kind: 'assessment' | 'interview',
  jobs: InviteTargetJob[],
  configured: (jdId: string) => boolean | undefined,
): InviteTargetState {
  if (jobs.length === 0) return { state: 'ready' };
  if (kind === 'assessment' && jobs.length > 1) return { state: 'multi' };
  const missing = jobs.filter((j) => configured(j.jdId) === false);
  if (missing.length === 0) return { state: 'ready' };
  // Several jobs: an AI Interview invite can still go to any interview.
  if (jobs.length > 1) return kind === 'assessment' ? { state: 'multi' } : { state: 'ready' };
  return { state: 'missing', job: jobs[0] };
}

/**
 * The invite item of a bulk Actions menu, for each target state: the
 * normal item; a greyed, unclickable one saying why; and — for a job with
 * none yet, when the host supports it — a "＋ Create …" item under it.
 */
export function renderInviteTargetItems({
  kind,
  target,
  itemClass,
  allowed,
  extraDisabled,
  extraDisabledReason,
  onInvite,
  onCreate,
  label,
}: {
  kind: 'assessment' | 'interview';
  target: InviteTargetState;
  itemClass: string;
  /** Permission + plan allow this invite at all. */
  allowed: boolean;
  /** e.g. no assessment units left. */
  extraDisabled?: boolean;
  extraDisabledReason?: string;
  onInvite: (e: Event) => void;
  onCreate?: (job: InviteTargetJob) => void;
  /** Overrides the "{what} Invite" label (Job Details: the AI Talent Match
   *  tab's "Create / Send …" names). */
  label?: string;
}) {
  const what = kind === 'assessment' ? 'AI Assessment' : 'AI Interview';
  const Icon = kind === 'assessment' ? ClipboardList : Video;
  const iconClass = kind === 'assessment' ? 'text-menu-icon-view' : 'text-menu-icon-ai';
  if (!allowed || target.state === 'ready') {
    return (
      <DropdownMenuItem
        className={`${itemClass} ${!allowed || extraDisabled ? 'text-gray-400 opacity-60' : ''}`}
        disabled={allowed && extraDisabled}
        title={allowed && extraDisabled ? extraDisabledReason : undefined}
        onSelect={onInvite}
      >
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <span className={MENU_ITEM_SCALE_CLASS}>{label ?? `${what} Invite`}</span>
      </DropdownMenuItem>
    );
  }
  const reason = target.state === 'multi'
    ? `Select candidates from one job to invite to its ${what}`
    : `${target.job.jdCode || 'This job'} has no ${what} yet`;
  return (
    <>
      {/* Greyed and not clickable — with the reason right under the label. */}
      <DropdownMenuItem className={`${itemClass} !items-start text-gray-400`} disabled>
        <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
        <span className="min-w-0">
          <span className="block">{what} Invite</span>
          <span className="block text-2xs text-gray-400 normal-case">{reason}</span>
        </span>
      </DropdownMenuItem>
      {target.state === 'missing' && onCreate && (
        <DropdownMenuItem
          className={`${itemClass} !pl-11 text-brand-blue font-medium`}
          onSelect={() => onCreate(target.job)}
        >
          <Plus className="w-4 h-4 text-brand-blue" />
          <span className={MENU_ITEM_SCALE_CLASS}>Create {what}</span>
        </DropdownMenuItem>
      )}
    </>
  );
}

export function useScoringActionPermissions(canCarryAIInterview: boolean) {
  const { isTenantAdmin, hasPermissionCode, hasPermission, tenant } = useAuth();
  const { hasPlanFeature } = usePlanFeatures();

  // Tenant-level feature toggle, independent of the subscription-plan check
  // — mirrors JobDetailView's own isFeatureEnabled(). Assumes enabled when
  // the tenant carries no flags at all, same default.
  const isFeatureEnabled = (feature: string): boolean => {
    if (!tenant?.features) return true;
    return (tenant.features as any)[feature] === true;
  };

  // Gates "Invite [to Assessment]" from a scored resume — the Resume Scoring
  // module's own `scoring:invite` toggle, not the Assessments module's
  // canCreateAssessments (creating a brand-new assessment is a different
  // action).
  const assessmentInvitePermitted =
    (isTenantAdmin || hasPermissionCode('scoring:invite')) &&
    isFeatureEnabled('assessment');
  const canCreateAssessments = assessmentInvitePermitted && hasPlanFeature('assessment');
  // A permitted user whose plan lacks Assessments is told so, not that they
  // lack permission.
  const assessmentDeniedReason = assessmentInvitePermitted
    ? PLAN_LOCKED_MESSAGE
    : 'You do not have permission to invite candidates to an assessment';
  // AI Interview: permission + plan + tenant feature, AND a way to carry it
  // out. Also requires `scoring:invite` (this button lives on the Resume
  // Scoring surface); canInviteAIInterviews is what the endpoints enforce.
  const aiInterviewInvitePermitted =
    canCarryAIInterview &&
    (isTenantAdmin || hasPermissionCode('scoring:invite')) &&
    hasPermission('canInviteAIInterviews') &&
    isFeatureEnabled('ai_interview');
  const mayInviteAIInterview = aiInterviewInvitePermitted && hasPlanFeature('ai_interview');
  const aiInterviewDeniedReason = aiInterviewInvitePermitted
    ? PLAN_LOCKED_MESSAGE
    : 'You do not have permission to invite candidates to an AI interview';
  // Permitted to invite somewhere, but the plan covers neither target.
  const invitePlanLocked =
    (assessmentInvitePermitted || aiInterviewInvitePermitted) && !canCreateAssessments && !mayInviteAIInterview;
  const canDownloadScorecard = isTenantAdmin || hasPermissionCode('scoring:download');

  return {
    canCreateAssessments,
    assessmentDeniedReason,
    mayInviteAIInterview,
    aiInterviewDeniedReason,
    invitePlanLocked,
    canDownloadScorecard,
  };
}

export default function ScoredResumesTable({
  resumes: rawResumes,
  jobTitle: rawJobTitle,
  jobId = 'jd-1',
  jobCode,
  jobVersion: hostJobVersion,
  availableUnits = 10,
  initialMatchStatus = 'all',
  hideMatchStatusFilter = false,
  initialScoredDate = '',
  onViewCandidate,
  selectedResumes: externalSelectedResumes = [],
  onSelectResume,
  onSelectAll,
  isGlobalView = false,
  title = 'Scored Resumes',
  groupByEmail = false,
  onCandidateOrderChange,
  onScoreResumes,
  onScoreResumesFromEmptyState,
  scoreResumesDisabled,
  onInviteAIInterview,
  enableInternalAIInterviewInvite = false,
  assessmentConfigured,
  aiInterviewConfigured,
  viewPillsSlot,
  onCreateInviteTarget,
  compact = false,
  hideSelectionBar = false,
  toolbarPortal,
  hiddenColumnIds,
  formatCandidateName,
  onOpenInviteDialog,
  inlineRowInviteItems = false,
  verdictCountRows,
  activeVerdict = null,
  displayMode: controlledDisplayMode,
  onDisplayModeChange,
}: ScoredResumesTableProps) {
  const showName = (name: string) => (formatCandidateName ? formatCandidateName(name) : name);
  /* Embedded in the Job Details tabs (the toolbar portals into that card's
     slot). When so, the toolbar controls switch to the 36px / tinted-pill
     chrome of the AI Talent Match reference; the standalone Resume Scoring
     page (no portal) keeps its existing 38px look. */
  const embedded = !!toolbarPortal;
  // Names and job titles are shown with a capital first letter even when
  // they were typed in lower case ("jack" → "Jack", "python devloper" →
  // "Python devloper"). Done once, here, so the table, grouped view, grid,
  // mobile cards, filter options and exports all read the same.
  const resumes = useMemo(
    () => rawResumes.map(r => ({
      ...r,
      candidateName: capitalizeFirst(r.candidateName),
      jobTitle: r.jobTitle != null ? capitalizeFirst(r.jobTitle) : r.jobTitle,
    })),
    [rawResumes],
  );
  const jobTitle = capitalizeFirst(rawJobTitle);

  const { isTenantAdmin, hasPermissionCode } = useAuth();

  // Download / Assessment / AI Interview gates — shared with View by Job's
  // Actions menu (useScoringActionPermissions above).
  const {
    canCreateAssessments,
    assessmentDeniedReason,
    mayInviteAIInterview,
    aiInterviewDeniedReason,
    invitePlanLocked,
    canDownloadScorecard,
  } = useScoringActionPermissions(!!onInviteAIInterview || enableInternalAIInterviewInvite);

  // Only the cross-job global list needs this — a single-job host (JobDetailView,
  // or this page's own per-job "Scoring History" list) already knows its one
  // answer via the assessmentConfigured/aiInterviewConfigured props above,
  // computed once for the whole table by useJobInviteTargets.
  const needsBulkInviteTargets =
    enableInternalAIInterviewInvite && assessmentConfigured === undefined && aiInterviewConfigured === undefined;
  const bulkInviteTargets = useAllJobInviteTargets(needsBulkInviteTargets);

  /* Per-row invite availability. A row that carries its own `jdId` (the
     cross-job global list) is answered from the bulk map above, keyed by
     THAT row's job — never the table-level assessmentConfigured/
     aiInterviewConfigured, which for that list is `undefined` (spans many
     jobs, nothing to hand down). A row without its own `jdId` (every
     single-job table) falls back to the table-level flag, unchanged.
     `undefined` either way keeps meaning "unknown, don't gate". */
  const resolveAssessmentConfigured = (resume: ScoredResume): boolean | undefined =>
    resume.jdId && needsBulkInviteTargets ? bulkInviteTargets.hasAssessment(resume.jdId) : assessmentConfigured;
  const resolveAIInterviewConfigured = (resume: ScoredResume): boolean | undefined =>
    resume.jdId && needsBulkInviteTargets ? bulkInviteTargets.hasAIInterview(resume.jdId) : aiInterviewConfigured;

  /* Invite gating. An entry is offered when the viewer may use it AND the JD
     has something to invite to; `undefined` from the host means unknown, which
     is treated as "don't gate" so the global scoring view is unchanged.
     With neither entry available the trigger itself goes disabled — matching
     the Assessment / AI Interview sections' own Send Invite buttons on the Job
     Details page, which read the same two flags.

     AI Interview specifically: when the host supplies its own
     `onInviteAIInterview` (e.g. JobDetailView, resolving against its one
     fixed job), that handler runs as before. When it doesn't — the cross-job
     global list, where every row belongs to a different job — this
     component resolves and shares the invite itself per row (see
     `aiInterviewInviteCandidate` below), the same "resolve on click, then
     explain why not" pattern already used for Assessment via
     InviteShareModal, just extended to AI Interview. Either way the option
     is only ever offered when `mayInviteAIInterview` is true.

     `canInviteAssessment`/`canInviteAIInterview`/`inviteDisabled` below stay
     table-wide — used only by the bulk-selection invite flow further down,
     which acts on the table's own job, not a specific row. The per-row
     dropdown in renderInviteSubmenu computes its own row-scoped versions from
     resolveAssessmentConfigured/resolveAIInterviewConfigured above instead. */
  const canInviteAssessment = canCreateAssessments && assessmentConfigured !== false;
  const canInviteAIInterview = mayInviteAIInterview && aiInterviewConfigured !== false;
  const inviteDisabled = !canInviteAssessment && !canInviteAIInterview;
  const inviteDisabledTitle =
    canCreateAssessments || mayInviteAIInterview
      ? 'No published assessment or AI interview for this job yet'
      : invitePlanLocked
        ? PLAN_LOCKED_MESSAGE
        : undefined;
  // Resume Scoring's own Export / Download Scorecard toggles — previously both
  // checked the generic, module-agnostic canExport flag (which defaults true
  // for most roles), so disabling either one here had no effect.
  const canExport = isTenantAdmin || hasPermissionCode('scoring:export');
  const canShareResume = isTenantAdmin || hasPermissionCode('my_resumes:share');

  /* Share Resume — the dialog the resume table and the resume page open, so a
     scored candidate is shared exactly as one from any other list. A scored row
     carries the score id, so the resume id (and the file behind it) comes from
     `resumeId`; rows without one can't be shared. */
  const [shareCandidate, setShareCandidate] = useState<ScoredResume | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareSubject, setShareSubject] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  /* The scored row knows nothing about the file itself, so the attachment's
     name, type and size are read from the resume record when the dialog opens. */
  const [shareFile, setShareFile] = useState<{ name: string; type: string; sizeKb?: number } | null>(null);
  const [isSharePreviewOpen, setIsSharePreviewOpen] = useState(false);
  /* "View Resume" in the Actions menu — the same read-in-place preview the
     Share dialog's attachment eye opens, but reachable directly without
     going through Share. Independent of shareCandidate/isSharePreviewOpen so
     the two entry points never fight over one piece of state. */
  const [viewResumeCandidate, setViewResumeCandidate] = useState<ScoredResume | null>(null);
  /* "View Score Table" from the Actions menu — opens the same table
     CandidateScoringDetailPage's Score Table tab shows, in a popup rather
     than navigating away. */
  const [scoreTableCandidate, setScoreTableCandidate] = useState<ScoredResume | null>(null);
  /* Scorecard side of the same dialog — the resume and the scorecard are the
     two files this page can send, so the eye beside each opens that one. */
  const [scorecardPreviewUrl, setScorecardPreviewUrl] = useState<string | null>(null);
  const [loadingScorecardPreview, setLoadingScorecardPreview] = useState(false);

  const openShareModal = async (resume: ScoredResume) => {
    const resumeId = resume.resumeId;
    if (!resumeId) {
      toast.error('This score has no resume attached to share');
      return;
    }

    const resumeLink =
      typeof window !== 'undefined' ? `${window.location.origin}/recruitment/resume-view/${resumeId}` : '';

    setShareCandidate(resume);
    setShareEmail('');
    setShareFile(null);
    setIsSharePreviewOpen(false);
    setShareSubject(`Resume: ${resume.candidateName} - ${resume.title || 'Candidate'}`);
    setShareMessage(`Hi,

I'm sharing the resume of ${resume.candidateName} for your review.

Candidate Details:
- Name: ${resume.candidateName}
- Title: ${resume.title || 'N/A'}
- Experience: ${resume.experience || 'N/A'}
- Location: ${resume.location || 'N/A'}
- Match: ${resume.matchStatus || 'N/A'}${resume.scorePercentage != null ? ` (${formatOverallScore(resume.overallRating10, resume.scorePercentage)})` : ''}

You can view the full resume at: ${resumeLink}

Best regards`);

    try {
      const detail: any = await resumeService.get(resumeId);
      setShareFile({
        name: detail?.file_name || `${resume.candidateName}.pdf`,
        type: (detail?.file_type || detail?.file_name?.split('.').pop() || 'pdf').toUpperCase(),
        sizeKb: detail?.file_size_kb,
      });
    } catch {
      // The dialog still works without the file's details.
      setShareFile({ name: `${resume.candidateName}.pdf`, type: 'PDF' });
    }
  };

  const closeShareModal = () => {
    setShareCandidate(null);
    setShareEmail('');
    setShareSubject('');
    setShareMessage('');
    setShareFile(null);
    setIsSharePreviewOpen(false);
    closeScorecardPreview();
  };

  /* Read the scorecard without leaving the dialog — the eye beside the resume
     does the same for the resume, so both attachments open in place. */
  const handlePreviewScorecard = async () => {
    if (!shareCandidate || loadingScorecardPreview) return;
    setLoadingScorecardPreview(true);
    try {
      const rawBlob = await scoringService.downloadScorecard(shareCandidate.id);
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      setScorecardPreviewUrl(window.URL.createObjectURL(blob));
    } catch (error) {
      console.error('Error previewing scorecard:', error);
      toast.error('Failed to open the scorecard. Please try again.');
    } finally {
      setLoadingScorecardPreview(false);
    }
  };

  const closeScorecardPreview = () => {
    setScorecardPreviewUrl((prev) => {
      if (prev) window.URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleSendShareEmail = async () => {
    const resumeId = shareCandidate?.resumeId;
    if (!resumeId) return;

    if (!shareEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSendingEmail(true);
    try {
      const result = await resumeService.share(resumeId, shareEmail.trim(), shareMessage);
      if (result.success) {
        toast.success('Resume shared successfully');
        closeShareModal();
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error: any) {
      console.error('Failed to share resume:', error);
      toast.error(error?.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };
  const [internalSelectedResumes, setInternalSelectedResumes] = useState<string[]>([]);

  // Use external selection if provided, otherwise use internal
  const selectedResumes = onSelectResume ? externalSelectedResumes : internalSelectedResumes;
  const setSelectedResumes = onSelectResume ?
    (ids: string[] | ((prev: string[]) => string[])) => {
      // No-op when using external control
    } : setInternalSelectedResumes;
  const [showFilters, setShowFilters] = useState(false);
  const [internalDisplayMode, setInternalDisplayMode] = useState<ListDisplayMode>('list');
  const displayMode = controlledDisplayMode ?? internalDisplayMode;
  const setDisplayMode = (mode: ListDisplayMode) => {
    setInternalDisplayMode(mode);
    onDisplayModeChange?.(mode);
  };
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCandidate, setInviteCandidate] = useState<ScoredResume | null>(null);

  // Self-contained "Invite -> AI Interview" flow for a row whose host didn't
  // supply its own `onInviteAIInterview` (Resume Scoring) — opens the shared
  // Invite to AI Interview dialog scoped to the CLICKED ROW's own job: the
  // candidate, then that job's active interview versions to pick from. Never
  // runs when a host DOES supply `onInviteAIInterview` — that path is untouched.
  const [aiInterviewInviteCandidate, setAiInterviewInviteCandidate] = useState<ScoredResume | null>(null);
  const [showBulkInviteModal, setShowBulkInviteModal] = useState(false);
  // Actions ▸ AI Interview Invite — the ticked candidates, all at once.
  const [showBulkAIInterviewInvite, setShowBulkAIInterviewInvite] = useState(false);
  /* Actions menu: the action whose "what this does" popup is open, and the
     rows that popup confirmed (the ticked rows narrowed by the statuses kept
     on). The invite dialogs act on exactly those rows. */
  const [bulkAction, setBulkAction] = useState<BulkActionKind | null>(null);
  const [bulkActionRows, setBulkActionRows] = useState<ScoredResume[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Search + filters in the shared hook. This panel commits as you pick rather
  // than staging, so it uses `setFilter` and leaves the draft pair alone.
  const search = useListSearch({
    initialFilters: {
      matchStatus: initialMatchStatus,
      // On the 0.0-10.0 scale the Score column prints (see rowRating10).
      scoreMin: 0,
      scoreMax: 10,
      dateFrom: initialScoredDate,
      dateTo: initialScoredDate,
      recruiter: 'all',
      /* Which job the rows belong to, as two independent narrowings: the title,
         and the JD version they were scored against. Separate rather than one
         combined control because they answer different questions — "every
         QA Test Engineer we scored" versus "everything scored against v2" —
         and a recruiter comparing versions of one job needs both at once.
         'all' is the off position for each, matching every other select here. */
      jdId: 'all',
      jobTitle: 'all',
      jobVersion: 'all',
    },
    // Score min/max is one logical "Score range" filter, so it counts once.
    countFilters: (f) =>
      [
        // Not counted while hidden, or the Filters badge advertises a filter
        // that has no control on screen and is not being applied.
        !hideMatchStatusFilter && f.matchStatus !== 'all',
        f.scoreMin > 0 || f.scoreMax < 10,
        Boolean(f.dateFrom),
        Boolean(f.dateTo),
        f.recruiter !== 'all',
        f.jdId !== 'all',
        f.jobTitle !== 'all',
        f.jobVersion !== 'all',
      ].filter(Boolean).length,
  });
  const searchTerm = search.appliedQuery;
  const {
    matchStatus: filterMatchStatus,
    scoreMin: filterScoreMin,
    scoreMax: filterScoreMax,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
    recruiter: filterRecruiter,
    jdId: filterJdId,
    jobTitle: filterJobTitle,
    jobVersion: filterJobVersion,
  } = search.filters;

  // The parent can preselect a match status (e.g. "Strong" from a stat card).
  useEffect(() => {
    search.setFilter('matchStatus', initialMatchStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatchStatus]);

  // The parent can also preselect one scoring day (e.g. a Scoring History
  // row) — applied to both ends of the date range for an exact-day filter.
  useEffect(() => {
    search.setFilter('dateFrom', initialScoredDate);
    search.setFilter('dateTo', initialScoredDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScoredDate]);

  // The table's columns are fixed; only the EXPORT's are chosen, in the
  // shared Export dialog (ScoredResumesExportModal).
  const enabledColumns = hiddenColumnIds?.length
    ? TABLE_COLUMNS.filter((col) => !hiddenColumnIds.includes(col.id))
    : TABLE_COLUMNS;
  // The JD ID column's value: the row's own code in cross-job lists, the host
  // job's in a single-job table. One helper so cell, export, search and the
  // JD ID filter can never disagree.
  const rowJobCode = (resume: ScoredResume): string => resume.jobCode || jobCode || '';

  // Filtering logic
  const filteredResumes = resumes.filter(resume => {
    // Search filter
    const matchesSearch =
      resume.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resume.phone.includes(searchTerm) ||
      rowJobCode(resume).toLowerCase().includes(searchTerm.toLowerCase());

    /* Match status filter. Inert when the host has hidden it — the rows are
       already one verdict, and a value left over from an unscoped view must not
       keep narrowing them from behind a control that is no longer rendered. */
    const matchesStatus =
      hideMatchStatusFilter || filterMatchStatus === 'all' || resume.matchStatus === filterMatchStatus;

    // Score range filter
    // Rounded to the one decimal shown, so a row printed "7.0" passes a
    // 7.0 bound even if its stored rating is 6.96.
    const rating = Math.round(rowRating10(resume) * 10) / 10;
    const matchesScore = rating >= filterScoreMin && rating <= filterScoreMax;

    // Date range filter - compare date portions in IST (UTC+5:30)
    let matchesDate = true;
    if (filterDateFrom || filterDateTo) {
      const d = parseIST(resume.scoredDate);
      if (!isNaN(d.getTime())) {
        // Extract YYYY-MM-DD in IST using Intl (parseIST already handles IST-naive strings)
        const scoredDateIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
        if (filterDateFrom) {
          matchesDate = matchesDate && scoredDateIST >= filterDateFrom;
        }
        if (filterDateTo) {
          matchesDate = matchesDate && scoredDateIST <= filterDateTo;
        }
      }
    }

    // Recruiter filter
    const matchesRecruiter = filterRecruiter === 'all' || resume.scoredBy === filterRecruiter;

    /* Job title / JD version. Both compared as strings against the option
       values built below from these same rows, so an option can never be
       offered that then matches nothing. A row missing the field is excluded
       once its filter is on — it cannot be shown to belong to the job asked
       for, and those rows are never offered as an option either. */
    const matchesJdId = filterJdId === 'all' || rowJobCode(resume) === filterJdId;
    const matchesJobTitle =
      filterJobTitle === 'all' || (resume.jobTitle || '').trim() === filterJobTitle;
    const matchesJobVersion =
      filterJobVersion === 'all' ||
      (resume.jobVersion !== undefined && resume.jobVersion !== null && String(resume.jobVersion) === filterJobVersion);

    return matchesSearch && matchesStatus && matchesScore && matchesDate && matchesRecruiter
      && matchesJdId && matchesJobTitle && matchesJobVersion;
  });

  // "View by Candidate" — a cross-job list spans every job, so the same
  // person can appear several times: once per job, or once per resume
  // version. Rather than a flat, mixed-candidate list, `groupByEmail` hosts
  // cluster those rows by email into one card per person, each expandable
  // to its own scoring history. `isGrouped` is the on/off switch, and the
  // host decides alone: "View by Candidates" is always grouped by candidate,
  // with no Group by control to switch it off.
  const isGrouped = groupByEmail;
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  /** ▸ / ▾ — opens or closes one candidate's job history. */
  const renderExpandButton = (key: string, expanded: boolean) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleGroupExpanded(key); }}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse' : 'Expand'}
      title={expanded ? 'Collapse' : 'Expand'}
      className={`p-2.5 rounded-lg border transition-all ${
        expanded
          ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue'
          : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:border-gray-300'
      }`}
    >
      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
    </button>
  );
  const toggleGroupExpanded = (key: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* A candidate scored against many jobs would otherwise stretch the grouped
     row to the height of their whole job list, so the "Job Titles" cell shows
     the first two and folds the rest behind a "+N more" badge, which opens
     a popup with the full list (see renderJobTitles). */
  const JOB_TITLE_PREVIEW_COUNT = 2;
  /**
   * The "Job Titles" cell of View by Candidates — shared by the list row and
   * the grid card so both read the same. The first JOB_TITLE_PREVIEW_COUNT
   * titles show; "+N more" sits on the LAST visible title's own line (no extra
   * line of its own) and opens a popup listing every title, so the row / card
   * never grows when you look.
   */
  /** A candidate's scores counted per verdict — the Exact / Partial / No
   *  Match columns of View by Candidates. Same reading as everywhere else:
   *  either spelling, and no verdict counts as No Match. */
  const tallyVerdicts = (rows: ScoredResume[]) =>
    rows.reduce(
      (acc, r) => {
        const v = normalizeMatchResult(r.matchStatus) ?? 'No Match';
        if (v === 'Exact Match') acc.exact += 1;
        else if (v === 'Partial Match') acc.partial += 1;
        else acc.none += 1;
        return acc;
      },
      { exact: 0, partial: 0, none: 0 },
    );
  /* A candidate's counts across ALL their scores (verdictCountRows), keyed
     like the groups; falls back to the listed rows when the host gives none. */
  const fullTallyByCandidate = useMemo(() => {
    if (!verdictCountRows) return null;
    const byKey = new Map<string, ScoredResume[]>();
    verdictCountRows.forEach((r) => {
      const k = candidateGroupKey(r);
      const list = byKey.get(k);
      if (list) list.push(r);
      else byKey.set(k, [r]);
    });
    return new Map(Array.from(byKey.entries()).map(([k, rows]) => [k, tallyVerdicts(rows)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictCountRows]);
  const groupTally = (rows: ScoredResume[]) =>
    (rows.length > 0 && fullTallyByCandidate?.get(candidateGroupKey(rows[0]))) || tallyVerdicts(rows);
  const VERDICT_OF_KIND = { exact: 'Exact Match', partial: 'Partial Match', none: 'No Match' } as const;
  /* One count, in its verdict's colours (the same chips View by Job's rows
     use). A zero is shown muted rather than hidden, so the columns line up;
     under a verdict filter the OTHER verdicts are muted too (count kept),
     as View by Job's badges are. */
  const VERDICT_COUNT_CLASS = {
    exact: 'bg-success-subtle text-success border-success/20',
    partial: 'bg-warning-subtle text-warning border-warning/20',
    none: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/50',
  } as const;
  const renderVerdictCount = (kind: keyof typeof VERDICT_COUNT_CLASS, count: number, label?: string) => (
    <span
      className={`inline-flex items-center justify-center gap-1 min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums border ${
        activeVerdict && VERDICT_OF_KIND[kind] !== activeVerdict
          ? 'bg-gray-50 text-gray-400 border-gray-200 opacity-60'
          : count > 0 ? VERDICT_COUNT_CLASS[kind] : 'bg-gray-50 text-gray-400 border-gray-200'
      }`}
    >
      {label && <span className="font-medium">{label}</span>}
      {count}
    </span>
  );

  const renderJobTitles = (titles: string[]) => {
    const visible = titles.slice(0, JOB_TITLE_PREVIEW_COUNT);
    const hidden = titles.length - visible.length;
    if (visible.length === 0) return <span className="text-sm text-gray-400">—</span>;
    return (
      <div className="min-w-0 space-y-0.5">
        {visible.map((title, i) => {
          const isLast = i === visible.length - 1;
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-gray-700 truncate" title={title}>{title}</span>
              {isLast && hidden > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Show all ${titles.length} job titles`}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 hover:text-gray-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      +{hidden} more
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-72 max-w-[calc(100vw-2rem)] p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Job Titles ({titles.length})
                    </div>
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {titles.map((t, j) => (
                        <li key={j} className="px-3 py-1.5 text-sm text-gray-700 break-words">{t}</li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const dateOf = (r: ScoredResume) => new Date(r.scoredDate).getTime() || 0;
  /* What the selection actually covers, on screen. Flat: the ticked visible
     rows. Grouped ("View by Candidates"): a candidate is ticked as a whole —
     ticked if ANY of their visible rows is — and covers ALL their visible
     rows. So switching the verdict filter never makes a ticked candidate
     look unticked just because new rows of theirs came into view. Ticks on
     rows the filter hides stay remembered but aren't acted on. */
  const effectiveSelectedRows = useMemo(() => {
    const sel = new Set(selectedResumes);
    if (!isGrouped) return filteredResumes.filter((r) => sel.has(r.id));
    const tickedKeys = new Set(filteredResumes.filter((r) => sel.has(r.id)).map(candidateGroupKey));
    return filteredResumes.filter((r) => tickedKeys.has(candidateGroupKey(r)));
  }, [selectedResumes, filteredResumes, isGrouped]);
  const allVisibleSelected = filteredResumes.length > 0 && effectiveSelectedRows.length === filteredResumes.length;
  const effectiveSelectedIds = useMemo(() => new Set(effectiveSelectedRows.map((r) => r.id)), [effectiveSelectedRows]);

  /* The jobs the ticked rows belong to — a row's own JD, or this table's
     one job on a single-job host. */
  const selectionJobs = useMemo((): InviteTargetJob[] => {
    const byId = new Map<string, InviteTargetJob>();
    for (const r of effectiveSelectedRows) {
      const id = r.jdId || (jobId && jobId !== 'global' ? jobId : '');
      if (!id || byId.has(id)) continue;
      byId.set(id, { jdId: id, jdCode: rowJobCode(r) || undefined, jdTitle: r.jobTitle || jobTitle });
    }
    return Array.from(byId.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelectedRows, jobId, jobTitle]);

  const candidateGroups = useMemo(() => {
    const groups = new Map<string, ScoredResume[]>();
    filteredResumes.forEach((r) => {
      const key = candidateGroupKey(r);
      const group = groups.get(key);
      if (group) group.push(r);
      else groups.set(key, [r]);
    });
    const groupKeyOf = (rows: ScoredResume[]): number | string => {
      switch (sortBy) {
        case 'name': return (rows[0].candidateName || '').toLowerCase();
        case 'versions': return rows.length;
        case 'exact': return groupTally(rows).exact;
        case 'partial': return groupTally(rows).partial;
        case 'none': return groupTally(rows).none;
        default: return dateOf(rows[0]);
      }
    };
    return sortByKey(
      Array.from(groups.entries())
        .map(([key, rows]) => ({ key, rows: [...rows].sort((a, b) => dateOf(b) - dateOf(a)) }))
        .sort((a, b) => dateOf(b.rows[0]) - dateOf(a.rows[0])),
      (g) => groupKeyOf(g.rows),
      sortOrder,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredResumes, sortBy, sortOrder]);

  // The flat list in the chosen order (selection still reads filteredResumes).
  const orderedResumes = useMemo(() => sortByKey(
    filteredResumes,
    (r): number | string => {
      switch (sortBy) {
        case 'name': return (r.candidateName || '').toLowerCase();
        case 'jobTitle': return (r.jobTitle || '').toLowerCase();
        case 'score': return rowRating10(r) ?? 0;
        default: return dateOf(r);
      }
    },
    sortOrder,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [filteredResumes, sortBy, sortOrder]);
  // Hand the host the candidate order the grouped list shows. Through a ref:
  // the callback is usually an inline arrow, so it is not an effect dep.
  const onCandidateOrderChangeRef = useRef(onCandidateOrderChange);
  onCandidateOrderChangeRef.current = onCandidateOrderChange;
  useEffect(() => {
    if (isGrouped) onCandidateOrderChangeRef.current?.(candidateGroups.map((g) => g.rows[0]));
  }, [isGrouped, candidateGroups]);
  // Back to page 1 whenever a filter/search narrows the list, grouping is
  // toggled, or the host switches to a genuinely different job (`jobId` —
  // never the `resumes` array itself: hosts that build it inline, e.g. with
  // `.map()` on every render, hand down a new array reference each time even
  // when the underlying data hasn't changed, which would otherwise snap the
  // page back to 1 while the same list is just sitting there being
  // re-rendered).
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterMatchStatus, filterScoreMin, filterScoreMax, filterDateFrom, filterDateTo, filterRecruiter, filterJdId, filterJobTitle, filterJobVersion, jobId, isGrouped, sortBy, sortOrder]);

  // Grouped mode paginates candidate CLUSTERS (one page = N people, however
  // many scoring rows each carries); ungrouped mode paginates rows directly.
  // Two independent slices sharing one currentPage/itemsPerPage pair, since
  // only one of the two ever renders at a time.
  const totalPages = Math.max(1, Math.ceil(
    (isGrouped ? candidateGroups.length : filteredResumes.length) / itemsPerPage,
  ));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedResumes = orderedResumes.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage,
  );
  const paginatedGroups = candidateGroups.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage,
  );

  /* Grid view's row source — one card per candidate either way. Grouped mode
     collapses each cluster to its primary (highest) version, same as the
     grouped table's own row, plus how many versions it's standing in for. */
  /* Grid cards. Grouped ("View by Candidates"): one card per candidate,
     carrying all their rows so the card can open its job history in place,
     the same as the list view's row. Flat: one card per row. */
  const gridRows: { resume: ScoredResume; groupKey?: string; groupRows?: ScoredResume[] }[] = isGrouped
    ? paginatedGroups.map(({ key, rows }) => ({ resume: rows[0], groupKey: key, groupRows: rows }))
    : paginatedResumes.map((resume) => ({ resume }));

  const uniqueRecruiters = Array.from(new Set(resumes.map(r => r.scoredBy)));

  /* Options for the two job filters, read off the rows this table was handed —
     never a fixed list — so they only ever offer what is actually selectable
     here. Built from `resumes` rather than `filteredResumes`, or choosing one
     value would collapse the dropdown you chose it from to that single entry.
     Blank/absent values are dropped: they cannot be matched on. */
  // Numeric order on the trailing number, so "JD-9" comes before "JD-140".
  const uniqueJdIds = Array.from(new Set(resumes.map(rowJobCode).filter(Boolean))).sort((a, b) => {
    const na = parseInt(a.match(/(\d+)\s*$/)?.[1] ?? '', 10);
    const nb = parseInt(b.match(/(\d+)\s*$/)?.[1] ?? '', 10);
    return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
  });

  /* Numeric sort, then rendered as "v2" — a plain string sort puts v10 before
     v2, which is exactly the order a version list must not be in. */
  const uniqueJobVersions = Array.from(
    new Set(
      resumes
        .map(r => r.jobVersion)
        .filter((v): v is number => v !== undefined && v !== null)
        .map(String),
    ),
  ).sort((a, b) => Number(a) - Number(b));

  /* Select all / Deselect all over what's ON SCREEN (filters applied).
     Deselect drops only the visible rows' ticks… and since a hidden tick is
     never acted on anyway, a full clear is the simpler, expected result. */
  const handleSelectAll = () => {
    const visibleIds = filteredResumes.map(r => r.id);
    if (onSelectAll) {
      onSelectAll(allVisibleSelected ? [] : visibleIds);
    } else if (onSelectResume) {
      // External control without onSelectAll - toggle each item
      filteredResumes.forEach(resume => {
        const isSelected = selectedResumes.includes(resume.id);
        if (allVisibleSelected ? isSelected : !isSelected) onSelectResume(resume.id);
      });
    } else {
      setSelectedResumes(allVisibleSelected ? [] : visibleIds);
    }
  };

  const handleSelectResume = (id: string) => {
    if (onSelectResume) {
      onSelectResume(id);
    } else {
      setSelectedResumes(prev =>
        prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
      );
    }
  };

  /* Drive the embedded Select All dropdown (the AI Talent Match reference's
     pill) in whichever selection mode this table is in — an onSelectAll parent,
     a per-row onSelectResume parent, or its own local state. `applySelection`
     reaches an exact target set; the three scopes build on it the same way the
     reference does: the page ADDS its rows, "all" SETS every filtered row,
     clear empties. */
  const applySelection = (ids: string[]) => {
    if (onSelectAll) {
      onSelectAll(ids);
    } else if (onSelectResume) {
      const target = new Set(ids);
      filteredResumes.forEach((r) => {
        const isSelected = selectedResumes.includes(r.id);
        if (target.has(r.id) !== isSelected) onSelectResume(r.id);
      });
    } else {
      setSelectedResumes(ids);
    }
  };
  const selectCurrentPage = () =>
    applySelection(Array.from(new Set([...selectedResumes, ...paginatedResumes.map((r) => r.id)])));
  const selectAllResumes = () => applySelection(filteredResumes.map((r) => r.id));
  const clearResumeSelection = () => applySelection([]);

  /* Select/deselect one candidate group in "View by Candidates" — toggles
     every scoring row that person carries (one per job/version) in one go,
     since a group has no single id of its own to select. Mirrors
     handleSelectAll's own toggle-each-row approach so it works the same way
     whether selection is externally or internally controlled. */
  const isGroupSelected = (rows: ScoredResume[]) => rows.some((r) => selectedResumes.includes(r.id));
  const handleSelectGroup = (rows: ScoredResume[]) => {
    // Ticked (any row ticked) → untick all its rows; else tick them all.
    const ticked = isGroupSelected(rows);
    rows.forEach((r) => {
      const isSelected = selectedResumes.includes(r.id);
      if (ticked ? isSelected : !isSelected) handleSelectResume(r.id);
    });
  };

  // Export dialog — the shared ScoredResumesExportModal, opened on the selection.
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExportExcel = () => {
    // Validation 1: Check if any resumes are available
    if (filteredResumes.length === 0) {
      toast.warning('No resumes available to export');
      return;
    }

    // Validation 2: Must select at least one candidate
    if (effectiveSelectedRows.length === 0) {
      toast.warning('Please select at least one candidate to export');
      return;  // ✅ BLOCK export
    }

    // Selection valid - proceed with export
    setShowExportModal(true);
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  /* The trailing number in a job code ("JD-151" -> 151), for a numerically
     correct sort — a plain string sort would put "JD-140" before "JD-9".
     NaN (no trailing digits) falls back to alphabetical below. */
  const jobCodeNumber = (code: string): number => {
    const match = code.match(/(\d+)\s*$/);
    return match ? parseInt(match[1], 10) : NaN;
  };

  /* One job code per selected resume, prefixed onto the download filename —
     that resume's own `jobCode` (set in the global "View by Candidates"
     view, which spans many jobs) or else this table's single host job. Two
     or more distinct codes collapse to a "first-last" range rather than
     listing every one, so a bulk download across many jobs still gets a
     short, readable filename. */
  const jobCodePrefix = (rows: ScoredResume[]): string => {
    const codes = Array.from(new Set(
      rows.map(r => r.jobCode || jobCode).filter((c): c is string => !!c),
    )).sort((a, b) => {
      const na = jobCodeNumber(a);
      const nb = jobCodeNumber(b);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
    });
    if (codes.length === 0) return '';
    if (codes.length === 1) return `${codes[0]}_`;
    return `${codes[0]}-${codes[codes.length - 1]}_`;
  };

  /* "_(V3)" for the JD version(s) scored — matching the same "Version"
     badge/column every row already shows. A range ("_(V1-V3)") when a bulk
     download's rows were scored against different versions of their job(s);
     nothing at all when no row carries a version number. */
  const versionTag = (rows: ScoredResume[]): string => {
    const versions = Array.from(new Set(
      rows.map(r => r.version || r.resumeVersion).filter((v): v is number => !!v),
    )).sort((a, b) => a - b);
    if (versions.length === 0) return '';
    if (versions.length === 1) return `_(V${versions[0]})`;
    return `_(V${versions[0]}-V${versions[versions.length - 1]})`;
  };

  /* DD-MM-YYYY for filenames — distinct from formatISTDate's "31 Aug 2026"
     display format, which isn't filename-safe (spaces, no fixed width). */
  const formatFileDate = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${date.getFullYear()}`;
  };

  const handleDownloadScorecard = async (resumeId: string) => {
    const resume = resumes.find(r => r.id === resumeId);
    if (!resume) return;

    setDownloadingId(resumeId);
    try {
      const rawBlob = await scoringService.downloadScorecard(resumeId);
      // Ensure blob has correct MIME type for cross-platform PDF rendering
      const blob = new Blob([rawBlob], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeCandidateName = (resume.candidateName || 'Candidate').replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate';
      link.download = `${jobCodePrefix([resume])}${safeCandidateName}${versionTag([resume])}_Scorecards.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Scorecard downloaded successfully');
    } catch (error) {
      console.error('Error downloading scorecard:', error);
      toast.error('Failed to download scorecard');
    } finally {
      setDownloadingId(null);
    }
  };

  // "Download as ZIP" confirmation — asked before a multi-candidate download.

  const handleDownloadBulkScorecards = async (rows: ScoredResume[]) => {
    if (rows.length === 0) return;

    // One candidate needs no ZIP wrapper — download that single PDF
    // directly, via the exact same path the per-row action uses.
    if (rows.length === 1) {
      await handleDownloadScorecard(rows[0].id);
      return;
    }

    setBulkDownloading(true);
    try {
      const safeName = jobTitle.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'Scorecards';
      await downloadScorecardsZip(rows, `${safeName}_Combined_Scorecards_${formatFileDate(new Date())}.zip`);
      toast.success(`${rows.length} scorecards downloaded`);
    } catch (error) {
      console.error('Error downloading bulk scorecards:', error);
      toast.error('Failed to download scorecards');
    } finally {
      setBulkDownloading(false);
    }
  };

  /* View by Candidates: the candidate row's own Download Scorecard — every
     job this person was scored against, one PDF per job in the same per-job
     folders as the bulk download. A single job is just that PDF. */
  const handleDownloadCandidateScorecards = async (rows: ScoredResume[]) => {
    if (rows.length <= 1) {
      if (rows[0]) await handleDownloadScorecard(rows[0].id);
      return;
    }
    const primary = rows[0];
    setDownloadingId(primary.id);
    try {
      const safeCandidateName = (primary.candidateName || 'Candidate').replace(/[^\w\s\-]/g, '').trim().replace(/\s+/g, '_') || 'Candidate';
      await downloadScorecardsZip(rows, `${safeCandidateName}_All_Jobs_Scorecards_${formatFileDate(new Date())}.zip`);
      toast.success(`${rows.length} scorecards downloaded`);
    } catch (error) {
      console.error('Error downloading candidate scorecards:', error);
      toast.error('Failed to download scorecards');
    } finally {
      setDownloadingId(null);
    }
  };

  /** Every row's scorecard PDF in one client-built ZIP, per-job folders. */
  // Shared with View by Job's Actions menu (lib/utils/scorecardDownload).
  const downloadScorecardsZip = (selectedRows: ScoredResume[], archiveName: string) =>
    downloadScorecardsZipShared(selectedRows, archiveName, jobTitle);


  // Function to handle row click and open detail view
  const handleRowClick = (resumeId: string, event: React.MouseEvent) => {
    // Don't open view if clicking on checkbox or action button
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input[type="checkbox"]')) {
      return;
    }
    const resume = resumes.find(r => r.id === resumeId);
    if (resume && onViewCandidate) {
      onViewCandidate(resume);
    }
  };

  /**
   * One table cell for a customizable column — shared by the flat "Total
   * Scored Resumes" table and the grouped view's expanded per-candidate
   * sub-table, so both show exactly the same columns, in the same order and
   * with the same formatting, instead of the sub-table carrying its own
   * hand-rolled four.
   */
  const renderResumeCell = (col: { id: string; label: string }, resume: ScoredResume) => {
    if (col.id === 'candidateName') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          {onViewCandidate ? (
            <button
              onClick={() => onViewCandidate(resume)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
            >
              {showName(resume.candidateName)}
            </button>
          ) : (
            <div className="text-sm text-gray-900">{showName(resume.candidateName)}</div>
          )}
          {/* "Candidate" is name WITH mail — the email rides under the name
              instead of taking a column of its own. */}
          {resume.email && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[240px]" title={resume.email}>{resume.email}</span>
            </div>
          )}
        </td>
      );
    }
    if (col.id === 'jobTitle') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          {/* Capped at 25 characters so the column is the same width in every
              table; the tooltip carries the full title. */}
          <div className="text-sm text-gray-700 font-medium" title={resume.jobTitle || undefined}>
            {truncateJobTitle(resume.jobTitle)}
          </div>
        </td>
      );
    }
    if (col.id === 'jdId') {
      // The row's own code in cross-job lists; the host job's in a single-job table.
      const code = rowJobCode(resume);
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          {code ? <JobIdBadge>{code}</JobIdBadge> : <span className="text-sm text-gray-700">-</span>}
        </td>
      );
    }
    if (col.id === 'jobVersion') {
      // The JD's own version at scoring time — only set in the
      // cross-job "All Candidates" list, where the same job
      // title repeats once per JD version. Absent (and so
      // blank) in a single-job table, which is already scoped
      // to one version.
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap text-center">
          {/* Same pill as the Resume Version column, so the two version
              columns read alike. */}
          {resume.jobVersion ? (
            <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
              v{resume.jobVersion}
            </span>
          ) : (
            <span className="text-sm text-gray-700">-</span>
          )}
        </td>
      );
    }
    if (col.id === 'version') {
      const ver = resume.version || resume.resumeVersion || 1;
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap text-center">
          <span className="inline-flex px-2 py-1 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
            v{ver}
          </span>
        </td>
      );
    }
    if (col.id === 'email') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Mail className="w-3.5 h-3.5" />
            {resume.email}
          </div>
        </td>
      );
    }
    if (col.id === 'phone') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="flex items-start gap-1 text-sm text-gray-600">
            <Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              {(() => {
                const numbers = splitPhoneNumbers(resume.phone, 2);
                return numbers.length > 0
                  ? numbers.map((num, i) => <span key={i} className="whitespace-nowrap">{num}</span>)
                  : <span className="whitespace-nowrap">-</span>;
              })()}
            </div>
          </div>
        </td>
      );
    }
    if (col.id === 'matchStatus') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${matchBadgeClass(resume.matchStatus)}`}>
            {resume.matchStatus}
          </span>
        </td>
      );
    }
    if (col.id === 'scorePercentage') {
      // Same three colors as the Match Status badge, so the
      // score reads as that status at a glance instead of its
      // own separate (and previously inconsistent) scale.
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap text-center">
          <div className={`${SCORE_CELL_TEXT} ${
            MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(resume.matchStatus) ?? 'No Match']
          }`}>
            {formatOverallScoreValue(resume.overallRating10, resume.scorePercentage)}
          </div>
        </td>
      );
    }
    if (col.id === 'experience') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="text-sm text-gray-600">{resume.experience || 'N/A'}</div>
        </td>
      );
    }
    if (col.id === 'education') {
      const educationDisplay = typeof resume.education === 'string'
        ? resume.education
        : Array.isArray(resume.education) && resume.education.length > 0
          ? (resume.education[0]?.degree || resume.education[0]?.institution || 'Education available')
          : 'N/A';
      return (
        <td key={col.id} className="py-3 px-4 align-middle min-w-[180px]">
          <div className="text-sm text-gray-600">{educationDisplay}</div>
        </td>
      );
    }
    if (col.id === 'certifications') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle min-w-[200px]">
          <div className="text-sm text-gray-600">
            {resume.certifications && resume.certifications.length > 0
              ? resume.certifications.map(cert =>
                  typeof cert === 'string' ? cert : (cert?.name || '')
                ).join(', ')
              : 'N/A'}
          </div>
        </td>
      );
    }
    if (col.id === 'scoredDate') {
      return (
        <td key={col.id} className="py-3 px-4 align-middle whitespace-nowrap">
          <div className="text-sm text-gray-900">{resume.scoredBy}</div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            <span>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></span>
          </div>
        </td>
      );
    }
    return null;
  };

  /**
   * The Invitation cell for one resume — shared with the grouped view's
   * expanded sub-table so that table carries the same Invitation column the
   * flat one does.
   */
  // Every row gets the button, whatever its match status, so a scored
  // candidate can always be invited. The menu carries the two things a
  // candidate can be invited to; each entry is gated by its own permission and
  // by whether that section exists on this JD, rather than hiding the whole
  // control. Neither configured → the button is disabled.
  // Just the invite control itself, with no `<td>` wrapper, so the grid
  // view's card can place it next to its own View/Actions buttons instead
  // of inside a table row.
  /** Which invites a row can offer. Row-scoped: for the cross-job global list
   *  this reads THIS row's own job from the bulk map
   *  (resolveAssessmentConfigured / resolveAIInterviewConfigured, see above),
   *  not the table-wide flags, which are `undefined` for that list. A
   *  single-job table's rows all resolve to the same table-wide flag. Shared
   *  by the table's Invite button and the grid card's Actions → Invite
   *  submenu, so the two can never offer different things. */
  const getRowInviteGate = (resume: ScoredResume) => {
    /* With a host version popup (onOpenInviteDialog) the row's Invite opens
       it just like the selection's Create / Send items, and is gated the same
       way — permission only: the popup itself offers Create when this job has
       no assessment / AI interview yet, so "none configured" no longer
       greys it out. */
    const rowCanInviteAssessment = canCreateAssessments && (!!onOpenInviteDialog || resolveAssessmentConfigured(resume) !== false);
    const rowCanInviteAIInterview = mayInviteAIInterview && (!!onOpenInviteDialog || resolveAIInterviewConfigured(resume) !== false);
    return {
      rowCanInviteAssessment,
      rowCanInviteAIInterview,
      rowInviteDisabled: !rowCanInviteAssessment && !rowCanInviteAIInterview,
      // The trigger stays visible but inert, with a tooltip naming the
      // reason, rather than disappearing outright.
      rowInviteDisabledTitle: !(canCreateAssessments || mayInviteAIInterview)
        ? (invitePlanLocked ? PLAN_LOCKED_MESSAGE : 'You do not have permission to invite candidates')
        : 'No published assessment or AI interview for this job yet',
    };
  };

  /** The Invite menu's two entries — Assessment and AI Interview. */
  const renderInviteMenuItems = (resume: ScoredResume) => {
    const { rowCanInviteAssessment, rowCanInviteAIInterview } = getRowInviteGate(resume);
    if (onOpenInviteDialog) {
      /* Same two entries, but each opens the host's version popup for THIS
         row's candidate — the very handler (and invitee shape) the selection
         Actions menu's Create / Send Assessment | AI Interview use, so pick an
         existing version, create the next one, come back and confirm the send
         all run through the one flow. */
      const invitee: InviteCandidate = {
        id: resume.resumeId || resume.id,
        name: resume.candidateName,
        email: resume.email,
        phone: resume.phone,
        rating: Math.round(rowRating10(resume) * 10) / 10,
        resumeId: resume.resumeId,
      };
      return (
        <>
          <DropdownMenuItem
            className={scoredResumesMenuItemClass}
            disabled={!rowCanInviteAssessment}
            title={!rowCanInviteAssessment ? assessmentDeniedReason : undefined}
            onSelect={() => onOpenInviteDialog('assessment', [invitee])}
          >
            <ClipboardList className="w-4 h-4 text-menu-icon-view" />
            <span className={MENU_ITEM_SCALE_CLASS}>Create / Send Assessment</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={scoredResumesMenuItemClass}
            disabled={!rowCanInviteAIInterview}
            title={!rowCanInviteAIInterview ? aiInterviewDeniedReason : undefined}
            onSelect={() => onOpenInviteDialog('interview', [invitee])}
          >
            <Video className="w-4 h-4 text-menu-icon-ai" />
            <span className={MENU_ITEM_SCALE_CLASS}>Create / Send AI Interview</span>
          </DropdownMenuItem>
        </>
      );
    }
    return (
      <>
          <DropdownMenuItem
            className={scoredResumesMenuItemClass}
            /* Off unless this JD has a published assessment —
               and assessment invites spend a unit, so the entry
               also goes quiet when there are none left rather
               than opening a form that cannot be submitted. */
            disabled={!canCreateAssessments || !rowCanInviteAssessment || availableUnits === 0}
            title={
              !canCreateAssessments
                ? assessmentDeniedReason
                : !rowCanInviteAssessment
                  ? 'No published assessment for this job yet'
                  : availableUnits === 0
                    ? 'No assessment units available'
                    : undefined
            }
            onSelect={() => {
              if (!canCreateAssessments) {
                toast.error(assessmentDeniedReason);
                return;
              }
              setInviteCandidate(resume);
              setShowInviteModal(true);
            }}
          >
            <ClipboardList className="w-4 h-4 text-menu-icon-view" />
            <span className={MENU_ITEM_SCALE_CLASS}>Assessment</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={scoredResumesMenuItemClass}
            /* Same rule on the interview side: nothing live on
               this JD means nothing to invite the candidate to. */
            disabled={!mayInviteAIInterview || !rowCanInviteAIInterview}
            title={
              !mayInviteAIInterview
                ? aiInterviewDeniedReason
                : !rowCanInviteAIInterview
                  ? 'No published AI interview for this job yet'
                  : undefined
            }
            onSelect={() => {
              if (!mayInviteAIInterview) {
                toast.error(aiInterviewDeniedReason);
                return;
              }
                if (onInviteAIInterview) {
                  onInviteAIInterview({
                    name: resume.candidateName || 'Unknown',
                    email: resume.email || '',
                    resumeId: resume.resumeId,
                  });
                } else {
                  // No host-supplied handler (the cross-job global list) —
                  // resolve and share THIS ROW's own job's AI interview.
                  setAiInterviewInviteCandidate(resume);
                }
              }}
            >
              <Video className="w-4 h-4 text-menu-icon-ai" />
              <span className={MENU_ITEM_SCALE_CLASS}>AI Interview</span>
            </DropdownMenuItem>
      </>
    );
  };

  /** Invite as the FIRST entry of a row's Actions menu — a submenu with
   *  Assessment / AI Interview. Shared by the table rows and the grid cards;
   *  rows no longer carry a separate Invite button. */
  /** Row ⋮ menus that hold the invite entries: w-56 once the "Create / Send …"
   *  labels sit in the menu itself — Job Details' Resumes row ⋮ width. */
  const rowInviteMenuWidthClass = inlineRowInviteItems ? 'w-56' : 'w-52';
  const renderInviteSubmenu = (resume: ScoredResume) => {
    // inlineRowInviteItems: the same entries straight in the ⋮ menu, no Invite ▸.
    if (inlineRowInviteItems) return renderInviteMenuItems(resume);
    const { rowInviteDisabled, rowInviteDisabledTitle } = getRowInviteGate(resume);
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className={`${scoredResumesMenuItemClass} ${rowInviteDisabled ? 'text-gray-400 opacity-60' : ''}`}
          disabled={rowInviteDisabled}
          title={rowInviteDisabled ? rowInviteDisabledTitle : undefined}
        >
          <UserPlus className="w-4 h-4 text-menu-icon-share" />
          <span className={MENU_ITEM_SCALE_CLASS}>Invite</span>
        </DropdownMenuSubTrigger>
        {/* w-64 with the "Create / Send …" labels (onOpenInviteDialog) — the
            width the selection Actions menu gives the same two labels. */}
        <DropdownMenuSubContent className={`${onOpenInviteDialog ? 'w-64' : 'w-44'} !rounded-lg !bg-white !py-1 !px-0 !shadow-xl`}>
          {renderInviteMenuItems(resume)}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  /**
   * The Actions dropdown's items for one resume — factored out so the
   * grouped-by-candidate view's cluster-level menu (applied to that
   * candidate's most recent score) can offer the exact same actions as the
   * per-row menu below, instead of a second hand-rolled copy drifting apart
   * from it.
   */
  /** `candidateRows` — the grouped candidate row's menu: Download Scorecard
   *  then covers every job in the group, not just its top row. */
  /** `withInvites` — a row menu in Job Details (inlineRowInviteItems): the
   *  invite entries go in the middle, so the order reads View Resume, View
   *  Results, View Score Table, Create / Send Assessment, Create / Send AI
   *  Interview, Download Scorecard. Elsewhere the order is unchanged and the
   *  caller puts its Invite ▸ submenu above these. */
  const renderActionsMenuItems = (resume: ScoredResume, candidateRows?: ScoredResume[], withInvites = false) => {
    const viewResults = (
      <DropdownMenuItem className={scoredResumesMenuItemClass} onSelect={() => onViewCandidate && onViewCandidate(resume)}>
        <Eye className="w-4 h-4 text-menu-icon-view" />
        <span className={MENU_ITEM_SCALE_CLASS}>View Results</span>
      </DropdownMenuItem>
    );
    const viewScoreTable = (
      <DropdownMenuItem className={scoredResumesMenuItemClass} onSelect={() => setScoreTableCandidate(resume)}>
        <BarChart3 className="w-4 h-4 text-menu-icon-view" />
        <span className={MENU_ITEM_SCALE_CLASS}>View Score Table</span>
      </DropdownMenuItem>
    );
    /* Only scores that still point at a resume have a file behind them to
       preview. */
    const viewResume = resume.resumeId && (
      <DropdownMenuItem className={scoredResumesMenuItemClass} onSelect={() => setViewResumeCandidate(resume)}>
        <FileText className="w-4 h-4 text-menu-icon-view" />
        <span className={MENU_ITEM_SCALE_CLASS}>View Resume</span>
      </DropdownMenuItem>
    );
    /* Only scores that still point at a resume can be shared. Hidden
       for now (RESUME_EMAIL_SHARE_ENABLED). */
    const shareViaEmail = RESUME_EMAIL_SHARE_ENABLED && resume.resumeId && (
        <DropdownMenuItem
          className={`${scoredResumesMenuItemClass} ${!canShareResume ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
          aria-disabled={!canShareResume}
          title={!canShareResume ? 'You do not have permission to share resumes' : undefined}
          onSelect={(e) => {
            if (!canShareResume) {
              e.preventDefault();
              toast.error('You do not have permission to share resumes');
              return;
            }
            openShareModal(resume);
          }}
        >
          <Share2 className="w-4 h-4 text-menu-icon-share" />
          <span className={MENU_ITEM_SCALE_CLASS}>Share via Email</span>
        </DropdownMenuItem>
    );
    const downloadScorecard = (
      <DropdownMenuItem
        className={`${scoredResumesMenuItemClass} ${!canDownloadScorecard ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
        disabled={downloadingId === resume.id}
        aria-disabled={!canDownloadScorecard}
        title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
        onSelect={(e) => {
          if (!canDownloadScorecard) {
            e.preventDefault();
            toast.error('You do not have permission to download the scorecard');
            return;
          }
          if (candidateRows) void handleDownloadCandidateScorecards(candidateRows);
          else handleDownloadScorecard(resume.id);
        }}
      >
        {downloadingId === resume.id ? (
          <Loader2 className="w-4 h-4 animate-spin text-menu-icon-download" />
        ) : (
          <Download className="w-4 h-4 text-menu-icon-download" />
        )}
        <span className={MENU_ITEM_SCALE_CLASS}>
          {candidateRows && candidateRows.length > 1 ? `Download All Scorecards (${candidateRows.length})` : 'Download Scorecard'}
        </span>
      </DropdownMenuItem>
    );
    if (inlineRowInviteItems) {
      return (
        <>
          {viewResume}
          {viewResults}
          {viewScoreTable}
          {shareViaEmail}
          {withInvites && (
            <>
              <DropdownMenuSeparator className="my-1 bg-gray-100" />
              {renderInviteMenuItems(resume)}
              <DropdownMenuSeparator className="my-1 bg-gray-100" />
            </>
          )}
          {downloadScorecard}
        </>
      );
    }
    return (
      <>
        {viewResults}
        {viewScoreTable}
        {viewResume}
        {shareViaEmail}
        {downloadScorecard}
      </>
    );
  };

  /** A row's ⋮ menu: Job Details puts the invite entries inside the actions
   *  (see renderActionsMenuItems); elsewhere Invite ▸ leads, then a divider. */
  const renderRowMenuItems = (resume: ScoredResume, candidateRows?: ScoredResume[]) =>
    inlineRowInviteItems ? (
      renderActionsMenuItems(resume, candidateRows, true)
    ) : (
      <>
        {renderInviteSubmenu(resume)}
        <DropdownMenuSeparator className="my-1 bg-gray-100" />
        {renderActionsMenuItems(resume, candidateRows)}
      </>
    );

  /* The selection's actions — Download and Invite. Shown once rows are
     picked: after the view pills when the host has them, else inside the
     search/filter row itself, so either way they share one line. */
  /** Untick everything — the Clear button beside Actions. */
  const clearSelection = () => {
    if (onSelectAll) onSelectAll([]);
    else setInternalSelectedResumes([]);
  };
  /** Make the selection exactly these row ids. */
  const selectExactly = (ids: string[]) => {
    if (onSelectAll) onSelectAll(ids);
    else if (onSelectResume) {
      const want = new Set(ids);
      resumes.forEach((r) => {
        if (selectedResumes.includes(r.id) !== want.has(r.id)) onSelectResume(r.id);
      });
    } else setInternalSelectedResumes(ids);
  };

  /* The selection Actions menu's entries, as pieces so Job Details can order
     them its own way (see the menu below). */
  /** Export — the selection, columns chosen in its dialog. */
  const renderSelectionExportItem = () => (
    <>
      <DropdownMenuItem
        className={`${scoredResumesMenuItemClass} ${!canExport ? 'text-gray-400 opacity-60' : ''}`}
        title={!canExport ? 'You do not have permission to export' : undefined}
        onSelect={(e) => {
          if (!canExport) {
            e.preventDefault();
            toast.error('You do not have permission to export');
            return;
          }
          handleExportExcel();
        }}
      >
        <FileDown className="w-4 h-4 text-menu-icon-download" />
        <span className={MENU_ITEM_SCALE_CLASS}>Export</span>
      </DropdownMenuItem>
    </>
  );
  /** Download All Scorecards for the selection. */
  const renderSelectionDownloadItem = () => (
    <>
      <DropdownMenuItem
        className={`${scoredResumesMenuItemClass} ${!canDownloadScorecard ? 'text-gray-400 opacity-60' : ''}`}
        disabled={bulkDownloading}
        title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
        onSelect={(e) => {
          if (!canDownloadScorecard) {
            e.preventDefault();
            toast.error('You do not have permission to download the scorecard');
            return;
          }
          setBulkAction('download');
        }}
      >
        <Download className="w-4 h-4 text-menu-icon-download" />
        <span className={MENU_ITEM_SCALE_CLASS}>
          {bulkDownloading ? 'Downloading...' : 'Download All Scorecards'}
        </span>
      </DropdownMenuItem>
    </>
  );
  /** Create / Send Assessment | AI Interview for the selection. */
  const renderSelectionInviteItems = () => (
    <>
      {(() => {
        /* Per invite: ready, greyed with the reason, or greyed plus
           "＋ Create …" when the one job has none yet. */
        const rowOf = (jdId: string) => effectiveSelectedRows.find((r) => (r.jdId || jobId) === jdId) ?? effectiveSelectedRows[0];
        const assessmentTarget = resolveInviteTargetState('assessment', selectionJobs, (id) => resolveAssessmentConfigured(rowOf(id)));
        const interviewTarget = resolveInviteTargetState('interview', selectionJobs, (id) => resolveAIInterviewConfigured(rowOf(id)));
        if (onOpenInviteDialog) {
          /* The AI Talent Match tab's way: always offered (permission
             aside), opening the host's version popup with the ticked rows. */
          const invitees: InviteCandidate[] = effectiveSelectedRows.map((r) => ({
            id: r.resumeId || r.id,
            name: r.candidateName,
            email: r.email,
            phone: r.phone,
            rating: Math.round(rowRating10(r) * 10) / 10,
            resumeId: r.resumeId,
          }));
          return (
            <>
              {renderInviteTargetItems({
                kind: 'assessment',
                target: { state: 'ready' },
                label: 'Create / Send Assessment',
                itemClass: scoredResumesMenuItemClass,
                allowed: canCreateAssessments,
                onInvite: (e) => {
                  if (!canCreateAssessments) {
                    e.preventDefault();
                    toast.error(assessmentDeniedReason);
                    return;
                  }
                  onOpenInviteDialog('assessment', invitees);
                },
              })}
              {renderInviteTargetItems({
                kind: 'interview',
                target: { state: 'ready' },
                label: 'Create / Send AI Interview',
                itemClass: scoredResumesMenuItemClass,
                allowed: mayInviteAIInterview,
                onInvite: (e) => {
                  if (!mayInviteAIInterview) {
                    e.preventDefault();
                    toast.error(aiInterviewDeniedReason);
                    return;
                  }
                  onOpenInviteDialog('interview', invitees);
                },
              })}
            </>
          );
        }
        const create = onCreateInviteTarget
          ? (kind: 'assessment' | 'interview') => (job: InviteTargetJob) =>
              onCreateInviteTarget(kind, job, effectiveSelectedRows.filter((r) => (r.jdId || jobId) === job.jdId))
          : undefined;
        return (
          <>
            {renderInviteTargetItems({
              kind: 'assessment',
              target: assessmentTarget,
              itemClass: scoredResumesMenuItemClass,
              allowed: canCreateAssessments,
              extraDisabled: availableUnits === 0,
              extraDisabledReason: 'No assessment units available',
              onInvite: (e) => {
                if (!canCreateAssessments) {
                  e.preventDefault();
                  toast.error(assessmentDeniedReason);
                  return;
                }
                setBulkAction('assessment');
              },
              onCreate: create?.('assessment'),
            })}
            {renderInviteTargetItems({
              kind: 'interview',
              target: interviewTarget,
              itemClass: scoredResumesMenuItemClass,
              allowed: mayInviteAIInterview,
              onInvite: (e) => {
                if (!mayInviteAIInterview) {
                  e.preventDefault();
                  toast.error(aiInterviewDeniedReason);
                  return;
                }
                setBulkAction('interview');
              },
              onCreate: create?.('interview'),
            })}
          </>
        );
      })()}
    </>
  );

  const selectionActions = effectiveSelectedRows.length > 0 ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The AI Talent Match reference's Actions pill, exactly: plain
            "Actions" label (the count already shows on the Select All pill
            and in this menu's own header strip below), no count suffix. */}
        <Button
          variant="secondary"
          size="sm"
          className="rounded-full h-9"
          aria-label={`Actions for ${effectiveSelectedRows.length} selected`}
        >
          {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Actions
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
        {/* Light grey header strip: how many the actions run on. */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
          {(isGrouped ? new Set(effectiveSelectedRows.map(candidateGroupKey)).size : effectiveSelectedRows.length).toLocaleString()} selected
        </div>
        {/* Job Details (embedded): Create / Send Assessment, Create / Send AI
            Interview, Download All Scorecards, Export. Elsewhere Export and
            Download lead, then the invites below a divider. */}
        {embedded ? (
          <>
            {renderSelectionInviteItems()}
            <DropdownMenuSeparator className="my-1 bg-gray-100" />
            {renderSelectionDownloadItem()}
            {renderSelectionExportItem()}
          </>
        ) : (
          <>
            {renderSelectionExportItem()}
            {renderSelectionDownloadItem()}
            <DropdownMenuSeparator className="my-1 bg-gray-100" />
            {renderSelectionInviteItems()}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  // Embedded in a tab (toolbar portals out) drops the padded outer card so the
  // table sits in a single bordered card like the AI Talent Match tab, not a
  // card inside a card. Standalone keeps its own card.
  return (
    <div className={compact || toolbarPortal ? '' : 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6'}>
      {/* Header — title and the one page-level action. Everything that acts on
          the list lives in the toolbar below, and everything that acts on a
          selection lives in its own row under that, same as job-openings. */}
      {/* Embedded in a tab, the title heading and the Score Resumes button both
          come off this row (matching the AI Talent Match tab, which has no
          in-table heading): the heading is dropped and Score Resumes moves into
          the selection Actions menu. Standalone keeps the header row. */}
      {!toolbarPortal && (title || onScoreResumes) && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {title && <h2 className="text-gray-900">{title}</h2>}
        {/* Score Resumes — opens the host's "Select Applicants to Score" modal. */}
        {onScoreResumes && (
          <Button
            variant="primary"
            size="md"
            onClick={onScoreResumes}
            icon={<ClipboardList className="w-4 h-4" />}
            className="self-start sm:self-auto"
          >
            <span className="hidden sm:inline">Score Resumes</span>
            <span className="sm:hidden">Score</span>
          </Button>
        )}
      </div>
      )}

      {/* Compact: no toolbar — just the selection's actions once rows are
          ticked (Export is one of them). */}
      {compact && !hideSelectionBar && selectionActions && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {selectionActions}
        </div>
      )}

      {/* Search and Filter Bar — when `toolbarPortal` is set (JobDetailView's
          tab-navigation card slot), the whole block portals there so it reads
          as the tab card's second row; without it, it renders inline above the
          table exactly as before. */}
      {!compact && (() => {
        const toolbarBlock = (
        /* In Job Details (portaled) the AI Talent Match tab's spacing: no gap
           under the block — the row's own `mb-3` and the panel's `pb-4` give
           it, exactly as there. */
        <div className={toolbarPortal ? undefined : 'mb-4 space-y-3'}>
        {/* Canonical search + filters row (same component as job-openings). The
            previous hand-rolled version used grey focus rings, rounded-md and a
            `palaceholder-gray-500` typo, so it matched no other list in the app. */}
        <ListToolbar
          searchValue={searchTerm}
          onSearchChange={search.setQuery}
          // The hook debounces into `appliedQuery`, so keystrokes pass through.
          searchDebounceMs={0}
          searchPlaceholder="Search by name, email, phone, or Job ID..."
          // Row 1: Search (fills the row), the two main filters inline,
          // More Filters, Reset, Sort by, List / Grid. In Job Details the
          // controls keep the AI Talent Match row's 12px gap from the search.
          controlsFollowSearch={!toolbarPortal}
          /* In Job Details the row also carries Select All and Actions, so it
             lays out by the tab card's width: search takes its own row until
             the card is wide enough, instead of shrinking to an icon. */
          fitToContainer={!!toolbarPortal}
          /* Select All — embedded in Job Details, at the very start of the
             toolbar row, matching the AI Talent Match reference. Standalone
             Resume Scoring keeps it leading row 2 instead (see below), the
             same place View by Job has it, so both views' toolbars match. */
          beforeSearch={
            embedded && filteredResumes.length > 0
              ? (
                <>
                  {(() => {
                  // Grouped: counted in candidates; flat: in rows.
                  const pageRows = isGrouped ? paginatedGroups.flatMap((g) => g.rows) : paginatedResumes;
                  const selectedCount = isGrouped
                    ? new Set(effectiveSelectedRows.map(candidateGroupKey)).size
                    : effectiveSelectedRows.length;
                  return (
                    <ToolbarSelectAll
                      selectedCount={selectedCount}
                      allSelected={allVisibleSelected}
                      pageCount={isGrouped ? paginatedGroups.length : paginatedResumes.length}
                      totalCount={isGrouped ? candidateGroups.length : filteredResumes.length}
                      pageSelected={pageRows.length > 0 && pageRows.every((r) => effectiveSelectedIds.has(r.id))}
                      onSelectPage={() => {
                        const ids = Array.from(new Set([...effectiveSelectedRows.map((r) => r.id), ...pageRows.map((r) => r.id)]));
                        selectExactly(ids);
                      }}
                      onDeselectPage={() => {
                        const pageIds = new Set(pageRows.map((r) => r.id));
                        selectExactly(effectiveSelectedRows.map((r) => r.id).filter((id) => !pageIds.has(id)));
                      }}
                      onSelectAll={() => selectExactly(filteredResumes.map((r) => r.id))}
                      onClear={clearSelection}
                    />
                  );
                  })()}
                  {/* Actions — beside Select All once rows are ticked, the AI
                      Talent Match reference's pattern (it used to sit in a row
                      below the toolbar). */}
                  {selectionActions}
                </>
              )
              : undefined
          }
          onToggleFilters={() => setShowFilters(!showFilters)}
          filtersOpen={showFilters}
          activeFilterCount={search.activeFilterCount}
          filtersApplied={search.filtersApplied}
          onClearFilters={search.reset}
          leadingActions={
            <>
              {/* Standalone only. Embedded in Job Details the same filter is
                  More Filters' "Scored By" field instead. */}
              {!embedded && (
                <SearchableSelect
                  className="w-full sm:w-48"
                  variant="bordered"
                  value={filterRecruiter === 'all' ? '' : filterRecruiter}
                  onChange={(v) => search.setFilter('recruiter', v || 'all')}
                  options={uniqueRecruiters.map((recruiter) => ({ value: String(recruiter), label: String(recruiter) }))}
                  allLabel="All Recruiters"
                  placeholder="All Recruiters"
                  searchPlaceholder="Search recruiter..."
                  ariaLabel="Filter by recruiter"
                />
              )}
              {/* Sort by — embedded: ahead of More Filters, matching the AI
                  Talent Match reference's control order. Standalone: after
                  More Filters (the toolbar's children), as View by Job. */}
              {embedded && filteredResumes.length > 0 && (
                <SortByControl<SortKey>
                  value={sortBy}
                  order={sortOrder}
                  options={isGrouped ? GROUPED_SORT_OPTIONS : FLAT_SORT_OPTIONS}
                  onChange={setSortBy}
                  onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                />
              )}
            </>
          }
          /* List / Grid pinned to the far right, as on the AI Talent Match tab. */
          trailing={embedded ? <ListViewToggle value={displayMode} onChange={setDisplayMode} className="h-9" /> : undefined}
          /* 36px control band like the AI Talent Match tab (its More Filters is h-9). */
          compactButtons={!!toolbarPortal}
          /* Score — right beside More Filters in Job Details, where the header's
             Score Resumes button isn't shown: the same host action (its "Select
             Applicants to Score" popup — My Resumes / Resume Database), styled
             as the AI Talent Match tab's Run Match there. Only while nothing is
             ticked: a selection brings the Actions menu instead, and clearing
             it brings Score back. */
          afterFiltersActions={embedded && onScoreResumes && effectiveSelectedRows.length === 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onScoreResumes}
              disabled={scoreResumesDisabled}
              title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
              icon={<ClipboardList className="w-4 h-4" />}
              className="h-9 whitespace-nowrap"
            >
              Score
            </Button>
          ) : undefined}
          /* Standalone the gap comes from the block's space-y; in Job Details
             the row keeps ListToolbar's own `mb-3`, as on AI Talent Match. */
          className={toolbarPortal ? undefined : 'mb-0'}
        >
          {/* Standalone: Sort by, then List / Grid, after More Filters — the
              same order and sizes as View by Job's toolbar row. */}
          {!embedded && filteredResumes.length > 0 && (
            <SortByControl<SortKey>
              value={sortBy}
              order={sortOrder}
              options={isGrouped ? GROUPED_SORT_OPTIONS : FLAT_SORT_OPTIONS}
              onChange={setSortBy}
              onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            />
          )}
          {!embedded && (
            <ListViewToggle value={displayMode} onChange={setDisplayMode} className="h-[38px] !border-brand-blue/10" />
          )}
        </ListToolbar>

        {/* Advanced Filters */}
        {showFilters && (
          /* mt-3 is the gap under the toolbar. The wrapper's space-y-3 can't
             give it: in Tailwind v4 space-y is a margin-BOTTOM on the toolbar
             row, which that row's own mb-0 overrides.
             Embedded in Job Details this drops the tinted/bordered card for
             the AI Talent Match reference's plain top-divider, so the panel
             reads as part of the same tab card the toolbar sits in. */
          <div className={embedded ? 'mt-4 sm:mt-5 pt-4 sm:pt-5 pb-4 border-t border-brand-blue/10' : 'mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4'}>
            {/* Flex-wrap, not the stretching 2/3-column grid this used to be:
                a grid cell is a third of the panel wide and every control in it
                stretched to fill that, so a "v2" dropdown was as wide as a job
                title. Each field now takes one fixed width and they pack from
                the left, wrapping when they run out of room. */}
            {/* Ordered who → when → how it scored → which job.

                Fields FLEX rather than sitting at one fixed width: the panel is
                a different width in every host and at every viewport, and fixed
                fields leave ragged trailing space at most of them. Each field's
                `basis` is the width it wants — that is what decides how many
                fit on a row — and `grow` shares out whatever the row has left,
                so a row is always filled edge to edge. `max-w` keeps a short
                final row from stretching two fields across the whole panel. */}
            <div className={embedded ? JOB_TAB_FILTER_GRID_CLASS : 'flex flex-wrap gap-4'}>
              {/* 0. Scored By (Job Details) — who scored the row, from each
                  row's scoredBy (the API's scored_by / scored_by_name); the
                  same `recruiter` filter the standalone toolbar's select sets. */}
              {embedded && (
                <div className={JOB_TAB_FILTER_FIELD_CLASS}>
                  <label className={JOB_TAB_FILTER_LABEL_CLASS}>Scored By</label>
                  <SearchableSelect
                    value={filterRecruiter === 'all' ? '' : filterRecruiter}
                    onChange={(v) => search.setFilter('recruiter', v || 'all')}
                    options={uniqueRecruiters.map((recruiter) => ({ value: String(recruiter), label: String(recruiter) }))}
                    allLabel="All Scorers"
                    placeholder="All Scorers"
                    searchPlaceholder="Search scored by..."
                    ariaLabel="Filter by scored by"
                    /* The neighbouring Match Status / Job Version selects' text
                       (JOB_TAB_FILTER_CONTROL_CLASS), not this control's
                       muted gray-500 "nothing picked" text. */
                    triggerClassName="text-black dark:text-slate-50"
                  />
                </div>
              )}

              {/* 1. Match Status — dropped when the list is already one
                  verdict; see `hideMatchStatusFilter`. The only conditional
                  field in this panel, and it turns on a host's explicit
                  statement about its own rows rather than on the data. */}
              {!hideMatchStatusFilter && (
                <div className={embedded ? JOB_TAB_FILTER_FIELD_CLASS : FILTER_FIELD_CLASS}>
                  <label className={embedded ? JOB_TAB_FILTER_LABEL_CLASS : FILTER_LABEL_CLASS}>Match Status</label>
                  <select
                    value={filterMatchStatus}
                    onChange={(e) => search.setFilter('matchStatus', e.target.value as typeof filterMatchStatus)}
                    className={embedded ? JOB_TAB_FILTER_CONTROL_CLASS : FILTER_CONTROL_CLASS}
                  >
                    <option value="all">All Statuses</option>
                    <option value="Exact Match">Exact Match</option>
                    <option value="Partial Match">Partial Match</option>
                    <option value="No Match">No Match</option>
                  </select>
                </div>
              )}

              {/* 2. Score Range — two inputs sharing ONE field, so the pair
                  reads as a single filter rather than two. Widened to take up
                  the first row's leftover space; see FILTER_FIELD_WIDE_CLASS. */}
              <div className={embedded ? JOB_TAB_FILTER_FIELD_CLASS : FILTER_FIELD_WIDE_CLASS}>
                <label className={embedded ? JOB_TAB_FILTER_LABEL_CLASS : FILTER_LABEL_CLASS}>Score Range (0.0 – 10.0)</label>
                {/* The 0.0–10.0 scale the Score column prints, not the 0–100
                    percentage underneath it. */}
                <div className="flex gap-2">
                  <ScoreBoundInput
                    value={filterScoreMin}
                    onChange={(v) => search.setFilter('scoreMin', v)}
                    placeholder="0.0"
                    ariaLabel="Minimum score"
                    /* min-w-0 so a flex child can shrink below its intrinsic
                       width — a number input's default is wider than half of
                       this field, and without it the pair overflows. */
                    className={`${embedded ? JOB_TAB_FILTER_CONTROL_CLASS : FILTER_CONTROL_CLASS} min-w-0`}
                  />
                  <ScoreBoundInput
                    value={filterScoreMax}
                    onChange={(v) => search.setFilter('scoreMax', v)}
                    placeholder="10.0"
                    ariaLabel="Maximum score"
                    className={`${embedded ? JOB_TAB_FILTER_CONTROL_CLASS : FILTER_CONTROL_CLASS} min-w-0`}
                  />
                </div>
              </div>

              {/* 3-4. JD ID / Job Version — render on the same line as the
                  fields above them now that Date From/To are gone, instead of
                  being forced to a second row.

                  Both render unconditionally, like every other field in this
                  panel. They were gated on having more than one value to pick
                  between, which meant Job Version vanished on any list whose
                  rows happened to share a version (Exact Match with four rows,
                  say) — a filter that comes and goes with the data is one users
                  cannot learn, and it left a hole in the row beside a Job Title
                  that did render. `Scored By` has always shown even with a
                  single recruiter; these now match it.
                  Job ID is standalone only: Job Details lists one job. */}
              {!embedded && (
                <div className={FILTER_FIELD_CLASS}>
                  <label className={FILTER_LABEL_CLASS}>Job ID</label>
                  <SearchableSelect
                    value={filterJdId === 'all' ? '' : filterJdId}
                    onChange={(v) => search.setFilter('jdId', v || 'all')}
                    options={uniqueJdIds.map((code) => ({ value: code, label: code }))}
                    allLabel="All Job IDs"
                    placeholder="All Job IDs"
                    searchPlaceholder="Search Job ID..."
                    ariaLabel="Filter by Job ID"
                  />
                </div>
              )}

              {/* Job Version is standalone only too: Job Details is one job
                  version's page. */}
              {!embedded && (
                <div className={FILTER_FIELD_CLASS}>
                  <label className={FILTER_LABEL_CLASS}>Job Version</label>
                  <select
                    value={filterJobVersion}
                    onChange={(e) => search.setFilter('jobVersion', e.target.value)}
                    className={FILTER_CONTROL_CLASS}
                  >
                    <option value="all">All Versions</option>
                    {uniqueJobVersions.map(version => (
                      <option key={version} value={version}>v{version}</option>
                    ))}
                  </select>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Row 2: the host's verdict pills and View by toggle. Select All now
            rides the toolbar row above (beforeSearch), matching the AI Talent
            Match reference; this row renders only when it still has content. */}
        {(viewPillsSlot || (isGrouped && paginatedGroups.length > 0) || (!embedded && filteredResumes.length > 0)) && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
          {/* Standalone: Select All leads this row, then a divider and the
              verdict pills — exactly View by Job's row 2. */}
          {!embedded && filteredResumes.length > 0 && (() => {
            const pageRows = isGrouped ? paginatedGroups.flatMap((g) => g.rows) : paginatedResumes;
            const selectedCount = isGrouped
              ? new Set(effectiveSelectedRows.map(candidateGroupKey)).size
              : effectiveSelectedRows.length;
            return (
              <>
                <SelectAllMenu
                  selectedCount={selectedCount}
                  pageCount={isGrouped ? paginatedGroups.length : paginatedResumes.length}
                  totalCount={isGrouped ? candidateGroups.length : filteredResumes.length}
                  noun={isGrouped ? 'candidates' : 'resumes'}
                  allSelected={allVisibleSelected}
                  pageSelected={pageRows.length > 0 && pageRows.every((r) => effectiveSelectedIds.has(r.id))}
                  onSelectPage={() => {
                    const ids = Array.from(new Set([...effectiveSelectedRows.map((r) => r.id), ...pageRows.map((r) => r.id)]));
                    selectExactly(ids);
                  }}
                  onDeselectPage={() => {
                    const pageIds = new Set(pageRows.map((r) => r.id));
                    selectExactly(effectiveSelectedRows.map((r) => r.id).filter((id) => !pageIds.has(id)));
                  }}
                  onSelectAll={() => selectExactly(filteredResumes.map((r) => r.id))}
                  onClear={clearSelection}
                />
                {viewPillsSlot && (
                  <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
                )}
              </>
            );
          })()}
          {viewPillsSlot}
          {/* Expand all / Collapse all — every candidate on this page. */}
          {isGrouped && paginatedGroups.length > 0 && (() => {
            const allOpen = paginatedGroups.every((g) => expandedGroupKeys.has(g.key));
            return (
              <button
                type="button"
                onClick={() =>
                  setExpandedGroupKeys((prev) => {
                    const next = new Set(prev);
                    paginatedGroups.forEach((g) => (allOpen ? next.delete(g.key) : next.add(g.key)));
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
        )}

        {/* Actions — embedded: in the toolbar row beside Select All (see
            beforeSearch), matching the AI Talent Match reference. Standalone:
            on a line of its own under Select All once rows are ticked, as
            View by Job shows it. */}
        {!embedded && selectionActions && (
          <div className="mt-3 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
            {selectionActions}
          </div>
        )}

        </div>
        );
        return toolbarPortal ? createPortal(toolbarBlock, toolbarPortal) : toolbarBlock;
      })()}

      {displayMode === 'grid' ? (
        <div className="rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 bg-white dark:bg-slate-900 overflow-hidden">
          {gridRows.length === 0 ? (
            <ListEmptyState
              icon={Search}
              isNarrowed={search.isNarrowed}
              query={search.appliedQuery}
              entityLabel="scored resume"
              emptyTitle="No Scored Resumes"
              emptyDescription="Score resumes against this job description to see the candidates here."
              onReset={search.reset}
              imageSrc="/scored-resumes-empty-state.webp"
              imageAlt="Scored resumes illustration"
              action={onScoreResumesFromEmptyState ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={onScoreResumesFromEmptyState}
                  disabled={scoreResumesDisabled}
                  title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
                  icon={<ClipboardList className="w-4 h-4" />}
                >
                  Score Resumes
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {gridRows.map(({ resume, groupKey, groupRows }) => {
                // Grouped cards open in place and tick the whole candidate;
                // flat cards keep their per-row click / tick.
                const cardExpanded = !!groupKey && expandedGroupKeys.has(groupKey);
                const cardSelected = groupRows
                  ? isGroupSelected(groupRows)
                  : selectedResumes.includes(resume.id);
                return (
                <div
                  key={groupKey || resume.id}
                  onClick={(e) => (groupKey ? toggleGroupExpanded(groupKey) : handleRowClick(resume.id, e))}
                  aria-expanded={groupKey ? cardExpanded : undefined}
                  className={`group relative text-left bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-[var(--border-dark)] transition-all p-4 flex flex-col gap-3 cursor-pointer ${
                    cardExpanded ? 'sm:col-span-2 lg:col-span-3 xl:col-span-4 !border-brand-blue/40' : 'hover:-translate-y-0.5'
                  } ${gridCardSelectedClass(cardSelected)}`}
                >
                  <GridCardSelect
                    selected={cardSelected}
                    onToggle={() => (groupRows ? handleSelectGroup(groupRows) : handleSelectResume(resume.id))}
                    label={resume.candidateName || 'candidate'}
                    selectionActive={effectiveSelectedRows.length > 0}
                  />
                  {groupRows ? (() => {
                    /* View by Candidates: exactly what the list row shows —
                       Candidate (name + email), Job Versions, Job Titles and
                       Latest Updated (in the footer) — nothing more. */
                    const titles = Array.from(new Set(groupRows.map((r) => r.jobTitle).filter(Boolean))) as string[];
                    return (
                      <>
                        {/* pr-7 leaves room for the corner checkbox. */}
                        <div className="min-w-0 pr-7">
                          {onViewCandidate ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); onViewCandidate(resume); }}
                              className="block max-w-full truncate text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
                            >
                              {showName(resume.candidateName) || 'Candidate'}
                            </button>
                          ) : (
                            <p className="text-sm font-medium text-gray-900 truncate">{showName(resume.candidateName) || 'Candidate'}</p>
                          )}
                          <p className="text-xs text-gray-500 truncate" title={resume.email || undefined}>{resume.email || '—'}</p>
                        </div>

                        <div>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                            {groupRows.length} Job {groupRows.length === 1 ? 'Version' : 'Versions'}
                          </span>
                        </div>

                        <div className="min-w-0">
                          {renderJobTitles(titles)}
                        </div>

                        {(() => {
                          const t = groupTally(groupRows);
                          return (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {renderVerdictCount('exact', t.exact, 'Exact Match')}
                              {renderVerdictCount('partial', t.partial, 'Partial Match')}
                              {renderVerdictCount('none', t.none, 'No Match')}
                            </div>
                          );
                        })()}
                      </>
                    );
                  })() : (
                  <>
                  {/* No initials avatar — there is no profile photo behind it. */}
                  <div className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{showName(resume.candidateName) || 'Candidate'}</p>
                      <p className="text-xs text-gray-500 truncate">{resume.email || '—'}</p>
                    </div>
                  </div>

                  {isGlobalView && resume.jobTitle && (
                    <p className="text-xs text-gray-500 truncate" title={resume.jobTitle}>
                      Applied for: <span className="font-medium text-gray-700">
                        {[resume.jobCode, truncateJobTitle(resume.jobTitle), resume.jobVersion != null ? `v${resume.jobVersion}` : null]
                          .filter(Boolean)
                          .join('-')}
                      </span>
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${matchBadgeClass(resume.matchStatus)}`}>
                      {resume.matchStatus}
                    </span>
                    <span className={`text-sm font-semibold ${
                      MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(resume.matchStatus) ?? 'No Match']
                    }`}>
                      {formatOverallScore(resume.overallRating10, resume.scorePercentage)}
                    </span>
                  </div>

                  {/* Job / Resume version — the list's two version columns, so
                      a job showing every version (All) tells the cards apart. */}
                  {!hiddenColumnIds?.includes('jobVersion') && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      {resume.jobVersion != null && (
                        <span className="inline-flex items-center gap-1">
                          Job
                          <span className="inline-flex px-1.5 py-0.5 rounded-full text-2xs border bg-blue-50 text-blue-700 border-blue-200">v{resume.jobVersion}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        Resume
                        <span className="inline-flex px-1.5 py-0.5 rounded-full text-2xs border bg-gray-50 text-gray-700 border-gray-200">v{resume.version || resume.resumeVersion || 1}</span>
                      </span>
                    </div>
                  )}
                  </>
                  )}

                  {/* Footer, pinned to the card's bottom (mt-auto) so every
                      card in a row lines up: Latest Updated on the left (the
                      list's column of that name), ⋮ on the right. No View
                      button — ⋮ › View Results does the same. */}
                  <div
                    className="mt-auto pt-1 flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {groupRows ? (
                      <div className="flex-1 min-w-0 text-xs text-gray-500">
                        <div className="text-gray-400 uppercase tracking-wide text-2xs">Latest Updated</div>
                        <div className="truncate">
                          <span className="text-gray-700">{formatISTDate(resume.scoredDate)}</span>{' '}
                          <span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="flex-1" aria-hidden />
                    )}
                    {groupKey && renderExpandButton(groupKey, cardExpanded)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          aria-label="Actions"
                          title="Actions"
                          className="p-2.5 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className={`${rowInviteMenuWidthClass} !rounded-lg !bg-white !py-1 !px-0 !shadow-xl`}
                      >
                        {renderRowMenuItems(resume, groupRows)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* The candidate's job history, opened in place — the grid
                      counterpart of the list view's expanded rows. */}
                  {cardExpanded && groupRows && (
                    <div
                      className="mt-1 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {groupRows.map((row) => (
                        <div
                          key={row.id}
                          // Opens this job's results, like the list's expanded row.
                          onClick={(e) => handleRowClick(row.id, e)}
                          className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                            selectedResumes.includes(row.id) ? 'border-brand-blue/40 bg-brand-blue/[0.06]' : 'border-gray-200 bg-gray-50/60 hover:border-brand-blue/30 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {rowJobCode(row) && <JobIdBadge>{rowJobCode(row)}</JobIdBadge>}
                                <span className="text-sm font-medium text-gray-800 truncate" title={row.jobTitle || undefined}>
                                  {truncateJobTitle(row.jobTitle) || 'Untitled role'}
                                </span>
                                {row.jobVersion ? (
                                  <span className="inline-flex px-1.5 py-0.5 rounded-full text-2xs border bg-blue-50 text-blue-700 border-blue-200 shrink-0">
                                    v{row.jobVersion}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${matchBadgeClass(row.matchStatus)}`}>
                                  {row.matchStatus}
                                </span>
                                <span className={`text-sm font-semibold ${MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(row.matchStatus) ?? 'No Match']}`}>
                                  {formatOverallScore(row.overallRating10, row.scorePercentage)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span>{formatISTDate(row.scoredDate)} <span className="text-gray-400">{formatISTTime(row.scoredDate)}</span></span>
                              </div>
                            </div>
                            {/* Stops clicks here, as the list's Actions cell does.
                                The menu renders in a portal, but React still
                                bubbles its clicks through this row — so ⋮ or any
                                item (even a disabled Invite) also hit the row's
                                onClick and opened the scorecard. */}
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  aria-label="Actions"
                                  title="Actions"
                                  className="p-2 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all shrink-0"
                                >
                                  <MoreVertical className="w-4 h-4 text-gray-600" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className={`${rowInviteMenuWidthClass} !rounded-lg !bg-white !py-1 !px-0 !shadow-xl`}>
                                {renderRowMenuItems(row)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : isGrouped ? (
        <div className="rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 bg-white dark:bg-slate-900 overflow-hidden">
          {/* Desktop Table View — grouped. From lg: nine columns don't fit a
              tablet without scrolling, so below lg the cards take over. */}
          <div className="hidden lg:block overflow-x-auto tf-table-shell">
            {/* Fixed layout: every column has a set width (Candidate takes
                what's left), so headers and cells line up and the table fits
                its box — no forced min width, no sideways scroll. Below lg
                this view uses the card layout instead. */}
            <table className="w-full table-fixed">
              {/* Candidate is a fixed 16rem — enough for a name and an email
                  (longer ones truncate) — and Job Titles takes what's left, so
                  Job Versions sits right beside the candidate instead of past
                  a wide gap. */}
              {/* Candidate and Job Versions fixed; the rest take a SHARE of the
                  width (not one column swallowing it all), so the spare space
                  is spread evenly instead of opening one big gap. */}
              <colgroup>
                <col className="w-[16rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[24%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[8.5rem]" />
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {/* pl-[46px]: the cell's padding plus the checkbox in front of the
                      name, so the heading lines up with the names. */}
                  <th className="text-left py-3 pr-4 pl-[46px] align-middle text-xs font-medium text-gray-700 uppercase tracking-wide">Candidate</th>
                  <th className="text-center py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Job Versions</th>
                  <th className="text-left py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide">Job Titles</th>
                  <th className="text-center py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Exact Match</th>
                  <th className="text-center py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Partial Match</th>
                  <th className="text-center py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">No Match</th>
                  <th className="text-left py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Latest Updated</th>
                  <th className="text-left py-3 px-4 align-middle text-xs font-medium text-gray-700 uppercase tracking-wide tf-sticky-col">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedGroups.map(({ key, rows }) => {
                  const primary = rows[0];
                  const isExpanded = expandedGroupKeys.has(key);
                  const distinctTitles = Array.from(new Set(rows.map((r) => r.jobTitle).filter(Boolean))) as string[];
                  const groupSelected = isGroupSelected(rows);
                  return (
                    <Fragment key={key}>
                      <tr
                        /* Click anywhere on the row to open / close the
                           candidate's job history — no separate chevron. The
                           checkbox, name link, "+N more" and Actions stop the
                           click so they keep doing their own thing. */
                        onClick={() => toggleGroupExpanded(key)}
                        aria-expanded={isExpanded}
                        data-row-selected={groupSelected ? 'true' : undefined}
                        aria-selected={groupSelected}
                        className={`cursor-pointer transition-colors ${
                          groupSelected
                            ? 'bg-brand-blue/[0.08] hover:bg-brand-blue/[0.12] dark:bg-brand-blue/15'
                            : 'hover:bg-[var(--raw-fafbfc)]'
                        }`}
                      >
                        <td className="px-4 py-3 align-middle min-w-0">
                          {/* Checkbox before the name — no column of its own,
                              the same as View by Job's rows. Then name and
                              email only (no initials avatar, no phone). */}
                          <div className="flex items-start gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSelectGroup(rows); }}
                              aria-pressed={groupSelected}
                              aria-label={groupSelected ? 'Deselect candidate' : 'Select candidate'}
                              className="inline-flex p-1.5 -ml-1.5 hover:bg-gray-200 rounded flex-shrink-0"
                            >
                              {groupSelected ? (
                                <CheckSquare className="w-4 h-4 text-brand-blue" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                            <div className="min-w-0 w-full">
                              {onViewCandidate ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onViewCandidate(primary); }}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block max-w-full truncate"
                                  title={primary.candidateName || undefined}
                                >
                                  {primary.candidateName || 'Candidate'}
                                </button>
                              ) : (
                                <div className="text-sm font-medium text-gray-900">{primary.candidateName || 'Candidate'}</div>
                              )}
                              {primary.email && <div className="text-xs text-gray-500 truncate" title={primary.email}>{primary.email}</div>}
                            </div>
                          </div>
                        </td>
                        {/* Just the count — the column header already says
                            "Job Versions". Centred under it, like the other counts. */}
                        <td className="px-4 py-3 align-middle text-center">
                          <span
                            className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-blue-50 text-blue-700 border border-blue-200"
                            title={`${rows.length} job ${rows.length === 1 ? 'version' : 'versions'}`}
                          >
                            {rows.length}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle min-w-0">
                          {renderJobTitles(distinctTitles)}
                        </td>
                        {(() => {
                          const t = groupTally(rows);
                          return (
                            <>
                              <td className="px-4 py-3 align-middle text-center">{renderVerdictCount('exact', t.exact)}</td>
                              <td className="px-4 py-3 align-middle text-center">{renderVerdictCount('partial', t.partial)}</td>
                              <td className="px-4 py-3 align-middle text-center">{renderVerdictCount('none', t.none)}</td>
                            </>
                          );
                        })()}
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatISTDate(primary.scoredDate)}</div>
                          <div className="text-xs text-gray-500">{formatISTTime(primary.scoredDate)}</div>
                        </td>
                        <td className="px-4 py-3 align-middle text-left tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                          {renderExpandButton(key, isExpanded)}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="Actions"
                                title="Actions"
                                className="p-2.5 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all"
                              >
                                <MoreVertical className="w-4 h-4 text-gray-600" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                              {renderActionsMenuItems(primary, rows)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${key}-detail`}>
                          <td colSpan={8} className="p-0 bg-gray-50/60">
                            {/* Same columns as the flat "Total Scored
                                Resumes" table (the fixed TABLE_COLUMNS) — so expanding a
                                candidate shows their scores at full detail
                                rather than a reduced set. */}
                            <div className="px-4 sm:px-6 py-3 overflow-x-auto">
                              {/* No Candidate column — every row here is the same
                                  person — and no forced min width, so it fits. */}
                              <table className="w-full table-auto">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    {enabledColumns.filter((col) => col.id !== 'candidateName').map((col) => (
                                      <th key={col.id} className={`${CENTERED_COLUMNS.has(col.id) ? 'text-center' : 'text-left'} py-2 px-4 text-xs font-medium text-gray-600 uppercase tracking-wide whitespace-nowrap`}>
                                        {col.label}
                                      </th>
                                    ))}
                                    <th className="text-left py-2 px-4 text-xs font-medium text-gray-600 uppercase tracking-wide">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {rows.map((row) => (
                                    <tr
                                      key={row.id}
                                      /* A click anywhere on this job's row opens its
                                         results — the same page the candidate's name
                                         opens. Buttons / menus keep their own click
                                         (handleRowClick skips them). */
                                      onClick={(e) => handleRowClick(row.id, e)}
                                      className={`cursor-pointer transition-colors ${
                                        selectedResumes.includes(row.id)
                                          ? 'bg-brand-blue/[0.08] hover:bg-brand-blue/[0.12] dark:bg-brand-blue/15'
                                          : 'bg-white hover:bg-[var(--raw-fafbfc)]'
                                      }`}
                                    >
                                      {enabledColumns.filter((col) => col.id !== 'candidateName').map((col) => renderResumeCell(col, row))}
                                      <td className="py-2.5 px-4 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button
                                              aria-label="Actions"
                                              title="Actions"
                                              className="p-2.5 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all"
                                            >
                                              <MoreVertical className="w-4 h-4 text-gray-600" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className={`${rowInviteMenuWidthClass} !rounded-lg !bg-white !py-1 !px-0 !shadow-xl`}>
                                            {renderRowMenuItems(row)}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
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

            {candidateGroups.length === 0 && (
              <ListEmptyState
                icon={Search}
                isNarrowed={search.isNarrowed}
                query={search.appliedQuery}
                entityLabel="candidate"
                emptyTitle="No scored candidates yet"
                emptyDescription="Upload and score candidates to see them here."
                onReset={search.reset}
              />
            )}
          </div>

          {/* Mobile Card View — grouped. Same data/state as the desktop table
              above (paginatedGroups, expandedGroupKeys,
              renderActionsMenuItems, formatters) — just laid out as cards
              with the per-candidate job history as a stacked list instead of
              a nested <table>, since a second horizontal-scrolling table
              inside a card is no more usable on a phone than the outer one. */}
          <div className="lg:hidden space-y-3">
            {paginatedGroups.map(({ key, rows }) => {
              const primary = rows[0];
              const isExpanded = expandedGroupKeys.has(key);
              const groupSelected = isGroupSelected(rows);
              return (
                <div key={key} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSelectGroup(rows); }}
                        className="p-1 hover:bg-gray-200 rounded mt-1 flex-shrink-0"
                      >
                        {groupSelected ? (
                          <CheckSquare className="w-5 h-5 text-gray-800" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        {onViewCandidate ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewCandidate(primary); }}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block truncate w-full"
                          >
                            {primary.candidateName || 'Candidate'}
                          </button>
                        ) : (
                          <div className="text-sm font-medium text-gray-900 truncate">{primary.candidateName || 'Candidate'}</div>
                        )}
                        {primary.email && <div className="text-xs text-gray-500 truncate">{primary.email}</div>}
                      </div>
                    </div>
                    <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="Actions"
                            title="Actions"
                            className="p-2.5 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                          {renderActionsMenuItems(primary, rows)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {(() => {
                    const t = groupTally(rows);
                    return (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {renderVerdictCount('exact', t.exact, 'Exact Match')}
                        {renderVerdictCount('partial', t.partial, 'Partial Match')}
                        {renderVerdictCount('none', t.none, 'No Match')}
                      </div>
                    );
                  })()}

                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                      {rows.length} Job {rows.length === 1 ? 'Version' : 'Versions'}
                    </span>
                    <div className="text-xs text-gray-500 text-right">
                      <div>{formatISTDate(primary.scoredDate)}</div>
                      <div className="text-gray-400">{formatISTTime(primary.scoredDate)}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleGroupExpanded(key)}
                    aria-label={isExpanded ? 'Collapse job history' : 'Expand job history'}
                    className={`mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      isExpanded
                        ? 'border-brand-blue/40 bg-brand-blue/5 text-brand-blue'
                        : 'border-gray-200 text-gray-600 hover:border-brand-blue/30 hover:text-brand-blue'
                    }`}
                  >
                    <span>{isExpanded ? 'Hide job history' : 'View job history'}</span>
                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          // Opens this job's results, like the list's expanded row.
                          onClick={(e) => handleRowClick(row.id, e)}
                          className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate" title={row.jobTitle || undefined}>
                                {truncateJobTitle(row.jobTitle) || 'Untitled role'}
                              </div>
                              <div className="mt-1 flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${matchBadgeClass(row.matchStatus)}`}>
                                  {row.matchStatus}
                                </span>
                                <span className={`text-sm font-semibold ${MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(row.matchStatus) ?? 'No Match']}`}>
                                  {formatOverallScore(row.overallRating10, row.scorePercentage)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span>{formatISTDate(row.scoredDate)} <span className="text-gray-400">{formatISTTime(row.scoredDate)}</span></span>
                              </div>
                            </div>
                            <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    aria-label="Actions"
                                    title="Actions"
                                    className="p-2.5 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all"
                                  >
                                    <MoreVertical className="w-4 h-4 text-gray-600" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
                                  {renderActionsMenuItems(row)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {onViewCandidate && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); onViewCandidate(row); }}
                              icon={<Eye className="w-3.5 h-3.5" />}
                              className="mt-2 w-full"
                            >
                              Open Match
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {candidateGroups.length === 0 && (
              <ListEmptyState
                icon={Search}
                isNarrowed={search.isNarrowed}
                query={search.appliedQuery}
                entityLabel="candidate"
                emptyTitle="No scored candidates yet"
                emptyDescription="Upload and score candidates to see them here."
                onReset={search.reset}
              />
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Desktop Table View — wrapped in the AI Talent Match table's bordered
          card (rounded border + ring + subtle shadow), which the flat view was
          missing, so it reads the same as that tab. */}
      <div className="hidden md:block rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto tf-table-shell">
        <table className="w-full table-auto">
          {/* Header styled to the AI Talent Match table: sticky, bg-gray-50 per
              cell, light uppercase gray-500 labels with wider tracking, dark mode. */}
          <thead className="sticky top-0 z-10 [&_th]:bg-gray-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
            <tr>
              <th className="text-left py-3 px-4 w-10 align-middle tf-sticky-col-left" aria-label="Select">
                {/* Only when there's no toolbar (compact: a job opened inline
                    in View by Job) — otherwise Select all is in the toolbar,
                    before the search box, and a second one here repeats it. */}
                {compact && (
                  <button onClick={handleSelectAll} className="inline-flex p-1.5 hover:bg-gray-100 rounded">
                    {allVisibleSelected ? (
                      <CheckSquare className="w-4 h-4 text-brand-blue" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                )}
              </th>
              {enabledColumns.map((col) => (
                <th key={col.id} className={`${CENTERED_COLUMNS.has(col.id) ? 'text-center' : 'text-left'} px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap align-middle`}>
                  {col.label}
                </th>
              ))}
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap align-middle tf-sticky-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedResumes.map((resume, index) => {
              return (
              <tr
                key={resume.id}
                onClick={(e) => handleRowClick(resume.id, e)}
                /* data-row-selected also tints the sticky checkbox / Actions
                   cells (globals.css), which carry their own background. */
                data-row-selected={selectedResumes.includes(resume.id) ? 'true' : undefined}
                aria-selected={selectedResumes.includes(resume.id)}
                /* Row styled to the AI Talent Match table: plain white/dark rows
                   (no zebra), hover:bg-gray-50, selected tint bg-blue-50. */
                className={`border-b border-gray-100 dark:border-slate-700/60 transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 ${
                  selectedResumes.includes(resume.id)
                    ? 'bg-blue-50 dark:bg-slate-800/50'
                    : 'bg-white dark:bg-slate-900'
                }`}
              >
                {/* Native checkbox, matching the AI Talent Match reference
                    table's row-select cell exactly (that tab uses a plain
                    `<input type="checkbox">`, not an icon button). */}
                <td className="py-3 px-4 align-middle tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedResumes.includes(resume.id)}
                    onChange={() => handleSelectResume(resume.id)}
                    className="rounded border-gray-300"
                  />
                </td>

                {enabledColumns.map((col) => renderResumeCell(col, resume))}

                {/* Actions Column — Invite is the menu's first entry. */}
                <td className="py-3 px-4 align-middle whitespace-nowrap tf-sticky-col" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Actions"
                        title="Actions"
                        className="p-2.5 bg-gray-100 rounded-lg border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 transition-all"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className={`${rowInviteMenuWidthClass} !rounded-lg !bg-white !py-1 !px-0 !shadow-xl`}
                    >
                      {renderRowMenuItems(resume)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        {filteredResumes.length === 0 && (
          <ListEmptyState
            icon={Search}
            isNarrowed={search.isNarrowed}
            query={search.appliedQuery}
            entityLabel="scored resume"
            emptyTitle="No Scored Resumes"
            emptyDescription="Score resumes against this job description to see the candidates here."
            onReset={search.reset}
            imageSrc="/scored-resumes-empty-state.webp"
            imageAlt="Scored resumes illustration"
            action={onScoreResumesFromEmptyState ? (
              <Button
                variant="primary"
                size="md"
                onClick={onScoreResumesFromEmptyState}
                disabled={scoreResumesDisabled}
                title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                Score Resumes
              </Button>
            ) : undefined}
          />
        )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {paginatedResumes.map((resume) => (
          <div
            key={resume.id}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-[var(--border-dark)] transition-all cursor-pointer"
            onClick={(e) => handleRowClick(resume.id, e)}
          >
            {/* Card Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={() => handleSelectResume(resume.id)}
                  className="p-1 hover:bg-gray-200 rounded mt-1 shrink-0"
                >
                  {selectedResumes.includes(resume.id) ? (
                    <CheckSquare className="w-5 h-5 text-gray-800" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className="text-gray-900 mb-1 break-words">{showName(resume.candidateName)}</h3>
                  {/* Show job title in global view */}
                  {isGlobalView && resume.jobTitle && (
                    <div className="text-xs text-gray-500 mb-1 truncate">
                      Applied for: <span className="font-medium text-gray-700" title={resume.jobTitle || undefined}>{truncateJobTitle(resume.jobTitle)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs border ${matchBadgeClass(resume.matchStatus)}`}>
                      {resume.matchStatus}
                    </span>
                    {/* Same three colours as the badge above, from the one palette in
                        lib/utils/matchStatus.ts - green / brand orange / red. Not a score
                        threshold: Exact and Partial share the 60-100 range and are told
                        apart by the Required average, so any cut-off on the number would
                        contradict the badge beside it. */}
                    <div className={`text-lg ${
                      MATCH_SCORE_TEXT_CLASS[normalizeMatchResult(resume.matchStatus) ?? 'No Match']
                    }`}>
                      {formatOverallScore(resume.overallRating10, resume.scorePercentage)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Content */}
            <div className="space-y-2 text-sm mb-3">
              {resume.email && (
                <div className="flex items-start gap-2 text-gray-600 min-w-0">
                  <Mail className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="min-w-0 break-all">{resume.email}</span>
                </div>
              )}
              {/* Same fields as the fixed table columns — phone, experience and
                  education are export-only now (see ScoredResumesExportModal). */}
              <div className="text-gray-600">
                <span className="text-gray-500">Scored by:</span> {resume.scoredBy}
                <div className="flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></span>
                </div>
              </div>
            </div>

            {/* Card Actions */}
            <div className="space-y-2">
              {/* Invite Button - For Exact Match & Partial Match + assessment permission.
                  Same two blockers as the table row's Assessment entry: no
                  published assessment on this JD, or no units left. */}
              {(resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match') && (
                <div className="relative group">
                  {/* Create / Send Assessment's shared look (createSendActions). */}
                  <button
                    type="button"
                    disabled={!canCreateAssessments || !canInviteAssessment || availableUnits === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canCreateAssessments) {
                        toast.error(assessmentDeniedReason);
                        return;
                      }
                      setInviteCandidate(resume);
                      setShowInviteModal(true);
                    }}
                    className={`${CREATE_SEND_BUTTON_CLASS.assessment} w-full justify-center`}
                  >
                    <ClipboardList className="w-4 h-4 flex-shrink-0" />
                    Invite for Assessment
                  </button>
                  {(!canCreateAssessments || !canInviteAssessment || availableUnits === 0) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                          <span>
                            {!canCreateAssessments
                              ? assessmentDeniedReason
                              : !canInviteAssessment
                                ? 'No published assessment for this job yet'
                                : 'No assessment units available'}
                          </span>
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                          <div className="border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="secondary"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canDownloadScorecard) {
                    toast.error('You do not have permission to download the scorecard');
                    return;
                  }
                  handleDownloadScorecard(resume.id);
                }}
                disabled={downloadingId === resume.id}
                aria-disabled={!canDownloadScorecard}
                title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                className={`w-full ${!canDownloadScorecard ? 'opacity-50 cursor-not-allowed' : ''}`}
                icon={downloadingId === resume.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              >
                {downloadingId === resume.id ? 'Downloading...' : 'Download Scorecard'}
              </Button>

              {resume.resumeId && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewResumeCandidate(resume);
                  }}
                  icon={<FileText className="w-4 h-4" />}
                  className="w-full"
                >
                  View Resume
                </Button>
              )}

              {RESUME_EMAIL_SHARE_ENABLED && resume.resumeId && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canShareResume) {
                      toast.error('You do not have permission to share resumes');
                      return;
                    }
                    openShareModal(resume);
                  }}
                  aria-disabled={!canShareResume}
                  title={!canShareResume ? 'You do not have permission to share resumes' : undefined}
                  icon={<Share2 className="w-4 h-4" />}
                  className={`w-full ${!canShareResume ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Share Resume
                </Button>
              )}
            </div>
          </div>
        ))}

        {filteredResumes.length === 0 && (
          <ListEmptyState
            icon={Search}
            isNarrowed={search.isNarrowed}
            query={search.appliedQuery}
            entityLabel="scored resume"
            emptyTitle="No Scored Resumes"
            emptyDescription="Score resumes against this job description to see the candidates here."
            onReset={search.reset}
            imageSrc="/scored-resumes-empty-state.webp"
            imageAlt="Scored resumes illustration"
            action={onScoreResumesFromEmptyState ? (
              <Button
                variant="primary"
                size="md"
                onClick={onScoreResumesFromEmptyState}
                disabled={scoreResumesDisabled}
                title={scoreResumesDisabled ? 'You do not have permission to score resumes' : undefined}
                icon={<ClipboardList className="w-4 h-4" />}
              >
                Score Resumes
              </Button>
            ) : undefined}
          />
        )}
      </div>

        </>
      )}

      {/* Shared between the grouped and ungrouped renders above (only one is
          ever mounted at a time) — one control regardless of which is
          showing, or of viewport in the ungrouped case. */}
      <ListPagination
        currentPage={safeCurrentPage}
        itemsPerPage={itemsPerPage}
        totalItems={isGrouped ? candidateGroups.length : filteredResumes.length}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={setItemsPerPage}
        itemLabel={isGrouped ? 'candidates' : 'scored resumes'}
      />


      {/* Actions ▸ … — the "what this does" popup every bulk action goes
          through: explains the action and lets the user keep / drop each
          match status before anything happens. */}
      {bulkAction && (
        <BulkActionConfirmModal
          action={bulkAction}
          rows={effectiveSelectedRows}
          busy={bulkDownloading}
          onCancel={() => setBulkAction(null)}
          onConfirm={async (rows) => {
            const action = bulkAction;
            setBulkAction(null);
            if (action === 'download') {
              await handleDownloadBulkScorecards(rows);
            } else if (action === 'assessment') {
              setBulkActionRows(rows);
              setShowBulkInviteModal(true);
            } else {
              setBulkActionRows(rows);
              setShowBulkAIInterviewInvite(true);
            }
          }}
        />
      )}

      {/* Invite to Assessment Modal — opens the shared ShareAssessmentModal
          used by the Assessment module (resolves the JD's assessment first).
          Uses the CLICKED ROW's own job (falling back to the table-level one
          for a single-job host, where every row already shares it) — the
          global cross-job list's rows each belong to a different job, and
          resolving against the table's own "global" placeholder job id
          instead of the real one meant this could never find a real
          assessment, so the candidate never even reached the share form. */}
      {showInviteModal && inviteCandidate && (
        <InviteShareModal
          candidate={inviteCandidate}
          jobId={inviteCandidate.jdId || jobId}
          jobTitle={inviteCandidate.jobTitle || jobTitle}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Invite to AI Interview — self-contained counterpart to the Assessment
          modal above, for a row whose host didn't supply its own
          onInviteAIInterview: the shared dialog, scoped to the row's own job. */}
      <InviteToAIInterviewFlow
        open={!!aiInterviewInviteCandidate}
        onClose={() => setAiInterviewInviteCandidate(null)}
        jobId={aiInterviewInviteCandidate ? (aiInterviewInviteCandidate.jdId || (jobId && jobId !== 'global' ? jobId : undefined)) : undefined}
        candidates={aiInterviewInviteCandidate ? [{
          id: aiInterviewInviteCandidate.resumeId || aiInterviewInviteCandidate.id,
          name: aiInterviewInviteCandidate.candidateName || 'Unknown',
          email: aiInterviewInviteCandidate.email || undefined,
        }] : []}
        resumes={aiInterviewInviteCandidate ? [{
          id: aiInterviewInviteCandidate.resumeId || aiInterviewInviteCandidate.id,
          name: aiInterviewInviteCandidate.candidateName || 'Unknown',
          email: aiInterviewInviteCandidate.email,
          phone: aiInterviewInviteCandidate.phone,
        } as unknown as Resume] : undefined}
        onInvited={() => setAiInterviewInviteCandidate(null)}
      />

      {/* Actions ▸ AI Interview Invite — every ticked candidate at once. One
          invite per person (a candidate ticked on several jobs is listed
          once). Scoped to a job's interviews when the ticked rows share one
          job; otherwise the picker lists every interview. */}
      {showBulkAIInterviewInvite && (() => {
        const picked = bulkActionRows ?? effectiveSelectedRows;
        const seen = new Set<string>();
        const people = picked.filter((r) => {
          const k = (r.email || r.resumeId || r.id).toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const jdIds = Array.from(new Set(picked.map((r) => r.jdId).filter(Boolean)));
        const scopedJobId = jdIds.length === 1
          ? jdIds[0]
          : jdIds.length === 0 && jobId && jobId !== 'global' && jobId !== 'jd-1' ? jobId : undefined;
        return (
          <InviteToAIInterviewFlow
            open
            onClose={() => { setShowBulkAIInterviewInvite(false); setBulkActionRows(null); }}
            jobId={scopedJobId}
            candidates={people.map((r) => ({
              id: r.resumeId || r.id,
              name: r.candidateName || 'Unknown',
              email: r.email || undefined,
            }))}
            resumes={people.map((r) => ({
              id: r.resumeId || r.id,
              name: r.candidateName || 'Unknown',
              email: r.email,
              phone: r.phone,
            }) as unknown as Resume)}
            onInvited={() => {
              setShowBulkAIInterviewInvite(false);
              setBulkActionRows(null);
              setSelectedResumes([]);
            }}
          />
        );
      })()}

      {/* Share Resume — the same dialog the resume table and the resume page
          open: the attachment with an eye to read it, then recipient, subject
          and message. */}
      {shareCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Share Resume</h2>
                    <p className="text-sm text-gray-500">The selected candidate&rsquo;s resume will be shared with the recipient via email.</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeShareModal}
                  className="px-2"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Both files this dialog can send, side by side: the resume
                    itself and the scorecard for this job. */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Until the resume record answers, the file's name is
                            not known — the candidate is, so lead with that. */}
                        <div className="text-sm font-medium text-gray-900 truncate" title={shareFile?.name}>
                          {shareFile ? shareFile.name : 'Loading resume file…'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          Resume
                          {shareFile?.type && <> &middot; {shareFile.type}</>}
                          {shareFile?.sizeKb ? <> &middot; {Math.round(shareFile.sizeKb)} KB</> : null}
                        </div>
                      </div>
                      <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsSharePreviewOpen(true)}
                        className="flex-shrink-0 px-2"
                        aria-label={`View ${shareCandidate.candidateName}'s resume`}
                        title="View resume"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* The scorecard PDF, built on demand — same download
                        the row's ⋮ menu offers. */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-brand-cyan/10 ring-1 ring-brand-cyan/15 flex items-center justify-center flex-shrink-0">
                        <Award className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-sm font-medium text-gray-900 truncate"
                          title={`Scorecard - ${shareCandidate.candidateName}.pdf`}
                        >
                          Scorecard - {shareCandidate.candidateName}.pdf
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          Scorecard &middot; PDF
                          {shareCandidate.scorePercentage != null && <> &middot; {formatOverallScore(shareCandidate.overallRating10, shareCandidate.scorePercentage)}</>}
                        </div>
                      </div>
                      <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handlePreviewScorecard}
                        disabled={loadingScorecardPreview}
                        className="flex-shrink-0 px-2"
                        aria-label={`View ${shareCandidate.candidateName}'s scorecard`}
                        title="View scorecard"
                      >
                        {loadingScorecardPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={shareSubject}
                    onChange={(e) => setShareSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Enter your message"
                    rows={8}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSendShareEmail}
                  disabled={isSendingEmail || !shareEmail.trim()}
                  icon={isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                >
                  {isSendingEmail ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The attachment, read in place. Rendered after the share dialog so it
          sits above it — both are z-50. */}
      {isSharePreviewOpen && shareCandidate?.resumeId && (
        <ResumeTextPreviewModal
          resumeId={shareCandidate.resumeId}
          title={shareCandidate.candidateName}
          subtitle={shareFile?.name}
          onClose={() => setIsSharePreviewOpen(false)}
        />
      )}

      {/* "View Resume" from the Actions menu — same preview, opened directly. */}
      {viewResumeCandidate?.resumeId && (
        <ResumeTextPreviewModal
          resumeId={viewResumeCandidate.resumeId}
          title={viewResumeCandidate.candidateName}
          onClose={() => setViewResumeCandidate(null)}
        />
      )}

      {/* "View Score Table" from the Actions menu. */}
      {scoreTableCandidate && (() => {
        /* Grouped (View by Candidates): page through the candidate's own
           rows — the same newest-first list their dropdown shows. */
        const jobRows = isGrouped
          ? candidateGroups.find(g => g.rows.some(r => r.id === scoreTableCandidate.id))?.rows
          : undefined;
        const jobIdx = jobRows ? jobRows.findIndex(r => r.id === scoreTableCandidate.id) : -1;
        return (
          <ScoreTableModal
            resume={scoreTableCandidate}
            jobId={jobId}
            jobCode={jobCode}
            jobVersion={hostJobVersion}
            jobTitle={scoreTableCandidate.jobTitle || jobTitle}
            onClose={() => setScoreTableCandidate(null)}
            jobPager={jobRows && jobIdx >= 0 ? {
              page: jobIdx + 1,
              total: jobRows.length,
              onPageChange: (page) => setScoreTableCandidate(jobRows[page - 1]),
            } : undefined}
          />
        );
      })()}

      {/* The scorecard, read in place. z-[60] puts it over the share
          dialog, the same level the resume preview uses. */}
      {scorecardPreviewUrl && shareCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 tracking-tight truncate">Scorecard</h2>
                  <p className="text-sm text-gray-500 truncate">
                    {shareCandidate.candidateName}
                    {shareCandidate.scorePercentage != null && <> &middot; {formatOverallScore(shareCandidate.overallRating10, shareCandidate.scorePercentage)}</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!canDownloadScorecard) {
                      toast.error('You do not have permission to download the scorecard');
                      return;
                    }
                    handleDownloadScorecard(shareCandidate.id);
                  }}
                  disabled={downloadingId === shareCandidate.id}
                  aria-disabled={!canDownloadScorecard}
                  title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                  className={!canDownloadScorecard ? 'opacity-50 cursor-not-allowed' : ''}
                  icon={<Download className="w-4 h-4" />}
                >
                  <span className="hidden sm:inline">Download</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeScorecardPreview}
                  className="px-2"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <iframe src={scorecardPreviewUrl} title="Scorecard preview" className="w-full h-full" />
            </div>
          </div>
        </div>
      )}

      {/* Bulk Invite Modal */}
      {showBulkInviteModal && (
        <BulkInviteModal
          selectedResumes={bulkActionRows ?? selectedResumes.map(id => {
            const resume = resumes.find(r => r.id === id);
            return resume!;
          }).filter(Boolean)}
          // A cross-job list has no one job of its own: use the selection's
          // (the Actions menu only offers this when it is a single job).
          jobId={jobId === 'global' && selectionJobs.length === 1 ? selectionJobs[0].jdId : jobId}
          jobTitle={jobId === 'global' && selectionJobs.length === 1 ? selectionJobs[0].jdTitle : jobTitle}
          onClose={() => { setShowBulkInviteModal(false); setBulkActionRows(null); }}
          onSuccess={() => {
            setShowBulkInviteModal(false);
            setBulkActionRows(null);
            // Clear selection after successful bulk invite
            if (onSelectAll) {
              onSelectAll([]);
            } else {
              setInternalSelectedResumes([]);
            }
          }}
        />
      )}

      {/* Export dialog — shared with View by Job (ScoredResumesExportModal).
          Exports the ticked rows; Export asks for a selection first. */}
      {showExportModal && (
        <ScoredResumesExportModal
          rows={effectiveSelectedRows}
          title={jobTitle}
          fileName={(ext) => {
            const data = effectiveSelectedRows;
            return `${jobCodePrefix(data)}${jobTitle.replace(/\s+/g, '_')}${versionTag(data)}_Scorecards_${formatFileDate(new Date())}.${ext}`;
          }}
          rowJobCode={rowJobCode}
          auditJdId={jobId}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

export type BulkActionKind = 'download' | 'assessment' | 'interview';
type MatchBucket = 'Exact Match' | 'Partial Match' | 'No Match';

const BULK_ACTION_INFO: Record<BulkActionKind, {
  title: string;
  icon: typeof Download;
  what: string;
  continueLabel: string;
  /** Statuses that can't take part, with the reason shown beside them. */
  locked?: Partial<Record<MatchBucket, string>>;
}> = {
  download: {
    title: 'Download All Scorecards',
    icon: Download,
    what: 'Downloads the scorecard PDF of every included candidate. One candidate downloads a single PDF; several are bundled into one ZIP file.',
    continueLabel: 'Download',
  },
  assessment: {
    title: 'AI Assessment Invite',
    icon: ClipboardList,
    what: "Invites the included candidates to this job's published assessment. You pick the assessment and the link expiry next. Each invitation uses one assessment unit.",
    continueLabel: 'Continue',
  },
  interview: {
    title: 'AI Interview Invite',
    icon: Video,
    what: 'Invites the included candidates to an AI interview. You pick the interview next. A candidate ticked on several jobs gets one invitation, and candidates without an email address are skipped.',
    continueLabel: 'Continue',
  },
};

/**
 * The popup every Actions-menu item opens first: says plainly what the action
 * will do, shows how many of the ticked candidates are in each match status,
 * and lets the user keep or drop each status. Nothing runs until Continue —
 * with the rows of the statuses left on.
 */
export function BulkActionConfirmModal({
  action,
  rows,
  busy,
  onCancel,
  onConfirm,
}: {
  action: BulkActionKind;
  rows: ScoredResume[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (rows: ScoredResume[]) => void | Promise<void>;
}) {
  const info = BULK_ACTION_INFO[action];
  const Icon = info.icon;
  const bucketOf = (r: ScoredResume): MatchBucket => (normalizeMatchResult(r.matchStatus) ?? 'No Match') as MatchBucket;
  const buckets: MatchBucket[] = ['Exact Match', 'Partial Match', 'No Match'];
  const counts = buckets.reduce((acc, b) => ({ ...acc, [b]: rows.filter((r) => bucketOf(r) === b).length }), {} as Record<MatchBucket, number>);
  // Every status that has rows and isn't locked starts ON.
  const [included, setIncluded] = useState<Record<MatchBucket, boolean>>(() => ({
    'Exact Match': !info.locked?.['Exact Match'],
    'Partial Match': !info.locked?.['Partial Match'],
    'No Match': !info.locked?.['No Match'],
  }));
  const chosen = rows.filter((r) => included[bucketOf(r)] && !info.locked?.[bucketOf(r)]);

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-action-title"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 id="bulk-action-title" className="text-lg font-bold text-gray-900">{info.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{rows.length} selected</p>
            </div>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="p-4 bg-blue-50/60 rounded-xl flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              <span className="block font-bold text-blue-700 mb-0.5">What this does</span>
              {info.what}
            </p>
          </div>

          <div>
            <p className="text-sm font-bold text-gray-900 mb-2">Include candidates with match status</p>
            <div className="space-y-2">
              {buckets.map((b) => {
                const lockedReason = info.locked?.[b];
                const disabled = !!lockedReason || counts[b] === 0;
                return (
                  <label
                    key={b}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      disabled ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!lockedReason && included[b] && counts[b] > 0}
                      disabled={disabled}
                      onChange={() => setIncluded((prev) => ({ ...prev, [b]: !prev[b] }))}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${matchBadgeClass(b)}`}>{b}</span>
                        <span className="text-sm font-semibold tabular-nums text-gray-700">{counts[b]}</span>
                      </span>
                      {lockedReason && counts[b] > 0 && (
                        <span className="block mt-1 text-xs text-gray-500">{lockedReason}</span>
                      )}
                      {/* No Match can be invited — the recruiter's call — but
                          say what the status means, so it's a decision. */}
                      {!lockedReason && b === 'No Match' && counts[b] > 0 && action !== 'download' && (
                        <span className="block mt-1 text-xs text-amber-700">
                          {included[b]
                            ? 'Included. These candidates did not meet the job\'s must-have requirements — untick to leave them out.'
                            : 'Left out. Tick to invite them anyway.'}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-t border-gray-200 shrink-0">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{chosen.length}</span> of {rows.length} will be included
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <Button variant="secondary" size="md" onClick={onCancel}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              disabled={chosen.length === 0 || busy}
              onClick={() => void onConfirm(chosen)}
              icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
            >
              {info.continueLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Bulk Invite Modal Component
interface BulkInviteModalProps {
  selectedResumes: ScoredResume[];
  jobId: string;
  jobTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkInviteModal({ selectedResumes, jobId, jobTitle, onClose, onSuccess }: BulkInviteModalProps) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<string>('');
  const [isLoadingAssessments, setIsLoadingAssessments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [showNoMatchWarning, setShowNoMatchWarning] = useState(false);

  // Quota stats
  const [quotaStats, setQuotaStats] = useState<{
    total_quota: number; consumed: number; pending: number; available: number;
  } | null>(null);

  // Everyone handed in is invited — which statuses to include was the
  // recruiter's choice in the popup before this. No Match is only counted,
  // to say so in the summary.
  const validCandidates = selectedResumes;
  const noMatchCandidates = selectedResumes.filter(r =>
    (normalizeMatchResult(r.matchStatus) ?? 'No Match') === 'No Match'
  );

  useEffect(() => {
    fetchAssessments();
    // Show warning if there are no match candidates
    if (noMatchCandidates.length > 0) {
      setShowNoMatchWarning(true);
    }
    // Fetch quota stats
    assessmentService.getInvitationStats()
      .then(stats => setQuotaStats(stats))
      .catch(() => setQuotaStats(null));
  }, [jobId]);

  const fetchAssessments = async () => {
    setIsLoadingAssessments(true);
    try {
      const response = await assessmentService.list({ jd_id: jobId });
      const revokedIds = getLocallyRevokedAssessmentIds();
      // Only show PUBLISHED assessments (not draft, not archived) and
      // exclude any whose invites the recruiter has revoked — once revoked
      // an assessment is sealed against further invites (duplicate to V2
      // for a fresh round).
      const activeAssessments = response.items.filter(
        (a: any) =>
          a.status === 'published' &&
          !a.is_archived &&
          !isAssessmentRevoked(a, revokedIds)
      );
      setAssessments(activeAssessments);
      // Auto-select if only one assessment
      if (activeAssessments.length === 1) {
        setSelectedAssessment(activeAssessments[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
      toast.error('Failed to load assessments');
    } finally {
      setIsLoadingAssessments(false);
    }
  };

  const handleSendBulkInvitations = async () => {
    if (!selectedAssessment) {
      toast.error('Please select an assessment first');
      return;
    }

    if (validCandidates.length === 0) {
      toast.error('No candidates to invite.');
      return;
    }

    // Quota check
    if (quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length) {
      const pendingMsg = quotaStats.pending > 0
        ? ` ${quotaStats.pending} unit(s) held by pending invitations will be released when links expire.`
        : '';
      toast.error(`Insufficient quota. ${quotaStats.available} unit(s) available, need ${validCandidates.length}.${pendingMsg}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const candidates = validCandidates.map(resume => ({
        candidate_name: resume.candidateName,
        candidate_email: resume.email,
        resume_id: resume.resumeId,
        // This is the table's own Bulk Invite button, gated on scoring:invite
        // (canCreateAssessments above) — unlike the per-row Invite dropdown,
        // this call goes straight to the API rather than through
        // InviteShareModal/ShareAssessmentModal, so invite_source was never
        // set here. Without it, the backend has no way to tell this apart
        // from any other assessment invite and can't enforce scoring:invite.
        invite_source: 'Resume Scoring',
      }));

      await assessmentService.bulkInvite(selectedAssessment, {
        candidates,
        expiry_days: expiryDays,
      });

      const message = `Successfully sent ${validCandidates.length} invitation${validCandidates.length > 1 ? 's' : ''}!`;

      toast.success(message);
      onSuccess();
    } catch (error: any) {
      console.error('Failed to send bulk invitations:', error);
      const errorMessage = error.message || 'Failed to send invitations. Please try again.';

      // Check for quota error
      if (errorMessage.includes('quota') || errorMessage.includes('units')) {
        toast.error('Insufficient assessment units available');
      } else if (errorMessage.includes('409') || errorMessage.includes('duplicate')) {
        toast.error('Some candidates have already been invited to this assessment');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAssessmentData = assessments.find(a => a.id === selectedAssessment);

  if (isLoadingAssessments) {
    // Structure-matched skeleton mirroring the loaded Bulk Invite modal it
    // replaces: same modal shell + gradient header (icon tile + title/subtitle),
    // then a body of the quota banner, the assessment-select field and the
    // expiry field, and the footer action buttons.
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 px-6 py-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="w-9 h-9 rounded-lg" />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Quota banner */}
            <Skeleton className="h-16 w-full rounded-lg" />
            {/* Assessment selection field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-3 w-56" />
            </div>
            {/* Expiry field */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[90dvh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
            <h3 className="text-gray-900 text-lg font-medium">No Assessment Found</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="px-2"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 overflow-y-auto flex-1">
            <div className="text-center">
              <div className="w-16 h-16 bg-warning-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-warning" />
              </div>
              <p className="text-gray-600 text-sm">
                There is no published assessment for this job description yet.
                Please create and publish an assessment first.
              </p>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Bulk Invite Candidates</h2>
              <p className="text-blue-100 text-sm">{jobTitle}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="px-2"
           aria-label="Close">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quota Banner */}
          {quotaStats !== null && (() => {
            const isUnlimited = quotaStats.total_quota >= 999999;
            const isInsufficient = !isUnlimited && quotaStats.available === 0;
            const isLow = !isUnlimited && !isInsufficient && quotaStats.available <= 3;
            if (isUnlimited) return null;
            return (
              <div className={`px-4 py-3 rounded-lg border text-sm flex items-start gap-2 ${
                isInsufficient ? 'bg-destructive-subtle border-destructive-line text-destructive-strong'
                : isLow ? 'bg-warning-subtle border-warning-line text-warning-strong'
                : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                {isInsufficient
                  ? <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                }
                <div className="flex-1">
                  <div className="font-medium mb-0.5">
                    {isInsufficient ? 'No assessment units available'
                      : isLow ? `Only ${quotaStats.available} unit(s) available`
                      : `${quotaStats.available} assessment unit(s) available`}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs opacity-80">
                    <span>Total: {quotaStats.total_quota}</span>
                    <span>Consumed: {quotaStats.consumed}</span>
                    {quotaStats.pending > 0 && <span>Pending: {quotaStats.pending}</span>}
                  </div>
                  {quotaStats.pending > 0 && (
                    <p className="text-xs mt-1 opacity-80">
                      {quotaStats.pending} unit(s) held by active invitations — released when links expire.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Assessment Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Assessment *</label>
            <select
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Choose an assessment --</option>
              {assessments.map((assessment) => {
                // Strip any "- Version N" baked into the stored title and
                // append the live version from `assessment.version` so the
                // dropdown always reflects the assessment's real version.
                const parsed = parseAssessmentTitle(assessment.title || '');
                const displayVersion = typeof assessment.version === 'number'
                  ? assessment.version
                  : parsed.version;
                const base = parsed.cleanTitle || assessment.short_id || 'Untitled assessment';
                const versionSuffix = displayVersion ? ` — Version ${displayVersion}` : '';
                const shortIdSuffix = assessment.short_id ? ` (${assessment.short_id})` : '';
                return (
                  <option key={assessment.id} value={assessment.id}>
                    {base}{versionSuffix}{shortIdSuffix} • {assessment.duration_minutes} min
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} available for this job
            </p>
          </div>

          {/* Expiry Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Invitation Expiry</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {/* Included No Match candidates — a note, not an exclusion. */}
          {showNoMatchWarning && noMatchCandidates.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="flex-1 text-sm text-amber-800">
                Includes <strong>{noMatchCandidates.length}</strong> No Match candidate{noMatchCandidates.length > 1 ? 's' : ''} — they did not meet the job's must-have requirements. They will be invited as you chose.
              </p>
              <button
                onClick={() => setShowNoMatchWarning(false)}
                className="text-xs text-amber-700 hover:text-amber-900 underline flex-shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Candidates to invite */}
          {validCandidates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Candidates to Invite ({validCandidates.length})
              </label>
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                {validCandidates.map((resume, index) => (
                  <div
                    key={resume.id}
                    className={`p-3 flex items-center gap-3 ${
                      index < validCandidates.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-medium text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 text-sm">{resume.candidateName}</div>
                      <div className="text-xs text-gray-600">{resume.email}</div>
                    </div>
                    {resume.matchStatus && (
                      <div
                        /* Was a two-branch test, so No Match wore the Partial
                           colour here. The shared map answers all three. */
                        className={`px-2 py-1 text-xs rounded-full border ${matchBadgeClass(resume.matchStatus)}`}
                      >
                        {resume.matchStatus}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Valid Candidates Warning */}
          {validCandidates.length === 0 && (
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-8 h-8 text-gray-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">No Candidates Selected</h4>
              <p className="text-sm text-gray-600">
                Select the candidates you want to invite and try again.
              </p>
            </div>
          )}

          {/* Preview */}
          {selectedAssessment && validCandidates.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800">Ready to Send</span>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p><strong>Assessment:</strong> {selectedAssessmentData?.title}</p>
                <p><strong>Duration:</strong> {selectedAssessmentData?.duration_minutes} minutes</p>
                <p><strong>Recipients:</strong> {validCandidates.length} candidate(s)</p>
                {noMatchCandidates.length > 0 && (
                  <p className="text-amber-700">
                    <strong>Includes:</strong> {noMatchCandidates.length} No Match candidate(s)
                  </p>
                )}
                <p><strong>Expires in:</strong> {expiryDays} day{expiryDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <div className="text-sm">
            {validCandidates.length > 0 ? (
              (() => {
                const insufficient = quotaStats !== null && quotaStats.total_quota < 999999 && quotaStats.available < validCandidates.length;
                return (
                  <span className={insufficient ? 'text-destructive font-medium' : 'text-gray-600'}>
                    <strong className={insufficient ? 'text-destructive' : 'text-success'}>{validCandidates.length}</strong> invitation{validCandidates.length !== 1 ? 's' : ''} will be sent
                    {insufficient && ` — only ${quotaStats!.available} unit(s) available`}
                    {!insufficient && noMatchCandidates.length > 0 && (
                      <span className="ml-2 text-amber-700">(incl. {noMatchCandidates.length} No Match)</span>
                    )}
                  </span>
                );
              })()
            ) : (
              <span className="text-gray-500">No candidates to invite</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={handleSendBulkInvitations}
              disabled={!selectedAssessment || isSubmitting || validCandidates.length === 0 || (quotaStats !== null && quotaStats.available === 0 && quotaStats.total_quota < 999999)}
              icon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            >
              {isSubmitting ? 'Sending...' : 'Send Invitations'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
