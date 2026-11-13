import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { StickyBulkBar } from '@/components/ui/sticky-bulk-bar';
import { RESUME_EMAIL_SHARE_ENABLED } from '@/lib/constants/featureFlags';
import { Mail, Phone, Calendar, Search, Download, FileDown, CheckSquare, Square, MinusSquare, Filter, X, UserPlus, Eye, AlertCircle, Loader2, Send, ShieldAlert, Info, ClipboardList, Share2, Paperclip, FileText, FileSpreadsheet, MoreVertical, Award, ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Plus, Video, BarChart3 } from 'lucide-react';
import { matchBadgeClass, MATCH_SCORE_TEXT_CLASS, normalizeMatchResult, formatOverallScore, formatOverallScoreValue } from '@/lib/utils/matchStatus';
import { truncateJobTitle } from '@/lib/utils/jobOpeningDisplay';
import { useJobActionLock } from '@/components/jobs/JobActionLock';
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import ScoredResumesExportModal from './ScoredResumesExportModal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import ListToolbar from '@/components/ui/list-toolbar';
import { FilterChipsPanelLine, type FilterChip } from '@/components/ui/filter-chips';
import ListEmptyState from '@/components/ui/list-empty-state';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import { isAssessmentRevoked, getLocallyRevokedAssessmentIds, parseAssessmentTitle } from '@/lib/utils/assessmentUtils';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { CREATE_SEND_BUTTON_CLASS } from '@/lib/constants/createSendActions';
import { scoringService } from '@/lib/services/scoringService';
import { resumeService } from '@/lib/services/resumeService';
import ResumeTextPreviewModal from './ResumeTextPreviewModal';
import ScoreTableModal from './ScoreTableModal';
import ListPagination from './ListPagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MobileRecordCard, MobileStatChip, type MobileStatTone } from '@/components/ui/mobile-record-card';
import VersionEyeBadge from '@/components/ui/version-eye-badge';
import FilterSelect from '@/components/ui/filter-select';
import { ResumeArchivedBadge } from '@/components/ui/resume-archived-badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import SearchableSelect from '@/components/ui/searchable-select';
import { useAuth } from '@/components/providers/AuthProvider';
import { useIsMobile } from '@/components/ui/use-mobile';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';

// An archived resume is off-limits for Invite/Score everywhere in the app —
// see resume-view/[id]/page.tsx's identical ARCHIVED_ACTION_MESSAGE.
const ARCHIVED_RESUME_MESSAGE = 'This resume is archived — unarchive it first to use this action';
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
import { SelectAllMenu, SortByControl, PhoneSortMenu } from '@/components/ui/select-all-menu';
import { ScoredResumesIllustration } from '@/components/jobs/JobResultsIllustrations';

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

/** The two orders of a sort, worded for the field (the phone Sort menu):
 *  dates newest / oldest, names A → Z / Z → A, counts and scores highest / lowest. */
const sortOrderLabels = (field: SortKey): { desc: string; asc: string } =>
  field === 'date'
    ? { desc: 'Newest first', asc: 'Oldest first' }
    : field === 'name' || field === 'jobTitle'
      ? { desc: 'Z → A', asc: 'A → Z' }
      : { desc: 'Highest first', asc: 'Lowest first' };

const TOOLBAR_BUTTON_CLASS =
  'h-9 px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue disabled:opacity-50 disabled:cursor-not-allowed';


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
export const JOB_TAB_FILTER_GRID_CLASS = 'tf-grid-4 [&>div]:min-w-0';
export const JOB_TAB_FILTER_FIELD_CLASS = 'min-w-0';
export const JOB_TAB_FILTER_LABEL_CLASS = 'block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium';
export const JOB_TAB_FILTER_CONTROL_CLASS =
  'w-full h-9 px-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue hover:border-brand-blue/40 transition-colors text-sm text-black dark:text-slate-50 placeholder:text-gray-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-900';

/* FilterSelect trigger overrides matching FILTER_CONTROL_CLASS / JOB_TAB_FILTER_CONTROL_CLASS. */
const FILTER_SELECT_TRIGGER_CLASS = 'w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-md sm:rounded-md border-gray-300';
const JOB_TAB_FILTER_SELECT_TRIGGER_CLASS = 'w-full sm:w-full data-[size=default]:h-9 sm:data-[size=default]:h-9 py-0 sm:py-0 px-3 sm:px-3 rounded-lg sm:rounded-lg hover:border-brand-blue/40 text-black dark:text-slate-50';

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
  // The underlying resume was archived after being scored — Invite/Score
  // must be blocked for it, same rule every other resume action follows.
  isArchived?: boolean;
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
  /** This single-job host's JD status (e.g. 'Archived', 'Disabled',
   *  'Published'). Archived/Disabled greys out both invite items with that
   *  as the reason, for hosts outside Job Details' JobActionLock context
   *  (e.g. this page's own per-job "Scoring History" view). Unset on the
   *  global cross-job list, which has no single host job to check. */
  jobStatus?: string;
  /** Status of any JD version by id ('Disabled', 'Archived', …) — for hosts
   *  whose rows span several versions ("Show All Versions"), so each row's
   *  invites follow its OWN version. Falls back to `jobStatus` for the host job. */
  jobStatusOf?: (jdId: string) => string | undefined;
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
  /** Tooltip on those disabled Score buttons (e.g. "JD is archived").
   *  Omitted = the permission message. */
  scoreResumesDisabledReason?: string;
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
  /** 'Archived' / 'Disabled' blocks both invites outright — see
   *  `resolveSelectionJobLock`. Left unset where the caller doesn't know it
   *  (JobActionLock's own context covers Job Details regardless). */
  status?: string;
}

/**
 * Can the ticked candidates be invited to an AI Assessment / AI Interview?
 *  - 'ready'   — yes (or unknown: never gate on a lookup that hasn't answered)
 *  - 'missing' — one job, and it has none yet → offer to create it
 *  - 'multi'   — the candidates span several jobs and the invite needs one
 *                (both assessment and interview target a single job)
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
  // Both the AI Assessment and the AI Interview invite target a single job, so
  // a selection spanning two or more jobs can carry neither → disabled.
  if (jobs.length > 1) return { state: 'multi' };
  const missing = jobs.filter((j) => configured(j.jdId) === false);
  if (missing.length === 0) return { state: 'ready' };
  return { state: 'missing', job: jobs[0] };
}

/**
 * An Archived or Disabled JD anywhere in the selection blocks both invites
 * outright, same "JD is archived" / "JD is disabled" reason Job Details
 * shows via JobActionLock — for the pages (Resume Scoring's and AI Talent
 * Match's own job lists) that have no JobActionLockProvider around them and
 * so must check each ticked job's status for themselves.
 */
export function resolveSelectionJobLock(jobs: InviteTargetJob[]): string | null {
  if (jobs.some((j) => j.status === 'Archived')) return 'JD is archived';
  if (jobs.some((j) => j.status === 'Disabled')) return 'JD is disabled';
  return null;
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
  deniedReason,
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
  /** Hover text when `!allowed` (permission or plan message). The item stays
   *  visible and greyed; `onInvite` should no-op silently. */
  deniedReason?: string;
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
        className={`${itemClass} ${!allowed || extraDisabled ? '!text-gray-400 opacity-60' : ''} ${!allowed ? 'cursor-not-allowed' : ''}`}
        disabled={allowed && extraDisabled}
        aria-disabled={!allowed || undefined}
        title={!allowed ? deniedReason : extraDisabled ? extraDisabledReason : undefined}
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
          <span className="block tf-micro-hint normal-case">{reason}</span>
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
  /* A disabled / archived job (Job Details' tabs): no invites from any of
     its tables, whatever the permissions, with that as the reason. */
  const jobLock = useJobActionLock();

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
    (isTenantAdmin || (hasPermissionCode('scoring:invite_assessment') && hasPermissionCode('assessments:invite'))) &&
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
    (isTenantAdmin || (hasPermissionCode('scoring:invite_ai_interview') && hasPermission('canInviteAIInterviews'))) &&
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
    canCreateAssessments: canCreateAssessments && !jobLock,
    assessmentDeniedReason: jobLock ?? assessmentDeniedReason,
    mayInviteAIInterview: mayInviteAIInterview && !jobLock,
    aiInterviewDeniedReason: jobLock ?? aiInterviewDeniedReason,
    invitePlanLocked,
    canDownloadScorecard,
    jobLockReason: jobLock,
  };
}

export default function ScoredResumesTable({
  resumes: rawResumes,
  jobTitle: rawJobTitle,
  jobId = 'jd-1',
  jobCode,
  jobVersion: hostJobVersion,
  jobStatus,
  jobStatusOf,
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
  scoreResumesDisabledReason,
  onInviteAIInterview,
  enableInternalAIInterviewInvite = false,
  assessmentConfigured,
  aiInterviewConfigured,
  viewPillsSlot,
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
  /* Phones: a row ⋮ menu has no room for Invite ▸ to open sideways (it opened
     off the left edge), so there the two invite entries sit in the menu itself. */
  const isPhone = useIsMobile();
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
    jobLockReason,
  } = useScoringActionPermissions(!!onInviteAIInterview || enableInternalAIInterviewInvite);

  /* Invite gating is permission (+ plan + job lock) only: every Assessment /
     AI Interview invite here opens THE invite popup (VersionInviteDialog),
     which itself offers Create when the job has none yet and a picker when
     the rows span several jobs — so "nothing published" no longer greys an
     entry out. Without a host opener (`onOpenInviteDialog`) the table opens
     the global one (`openRowsInvite` below). */
  const { open: openInvite } = useInviteDialog();
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
      toast.error(friendlyErrorMessage(error, "Couldn't send email. Please try again."));
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
  /* Actions ▸ Download All Scorecards: its "what this does" popup is open.
     (The invites skip it — they open THE invite popup straight away.) */
  const [bulkAction, setBulkAction] = useState<BulkActionKind | null>(null);
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

  // Active filter tags — one per filter `countFilters` counts (Score range is
  // one tag, as it counts once), so the More Filters badge and the tags always
  // agree. Each X clears only its own filter.
  const formatChipDate = (v: string) => {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const activeFilterChips: FilterChip[] = [
    !hideMatchStatusFilter && filterMatchStatus !== 'all' && { key: 'matchStatus', label: 'Match Status', value: String(filterMatchStatus), onRemove: () => search.setFilter('matchStatus', 'all' as typeof filterMatchStatus) },
    (filterScoreMin > 0 || filterScoreMax < 10) && {
      key: 'score',
      label: 'Score',
      value: `${filterScoreMin.toFixed(1)} – ${filterScoreMax.toFixed(1)}`,
      onRemove: () => { search.setFilter('scoreMin', 0); search.setFilter('scoreMax', 10); },
    },
    Boolean(filterDateFrom) && { key: 'dateFrom', label: 'Scored From', value: formatChipDate(String(filterDateFrom)), onRemove: () => search.setFilter('dateFrom', '' as typeof filterDateFrom) },
    Boolean(filterDateTo) && { key: 'dateTo', label: 'Scored To', value: formatChipDate(String(filterDateTo)), onRemove: () => search.setFilter('dateTo', '' as typeof filterDateTo) },
    filterRecruiter !== 'all' && { key: 'recruiter', label: embedded ? 'Scored By' : 'Recruiter', value: String(filterRecruiter), onRemove: () => search.setFilter('recruiter', 'all') },
    filterJdId !== 'all' && { key: 'jdId', label: 'Job ID', value: String(filterJdId), onRemove: () => search.setFilter('jdId', 'all') },
    // No control sets this one, but it counts, so it gets a tag.
    filterJobTitle !== 'all' && { key: 'jobTitle', label: 'Job Title', value: String(filterJobTitle), onRemove: () => search.setFilter('jobTitle', 'all') },
    filterJobVersion !== 'all' && { key: 'jobVersion', label: 'Job Version', value: `v${filterJobVersion}`, onRemove: () => search.setFilter('jobVersion', 'all') },
  ].filter(Boolean) as FilterChip[];

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
    if (visible.length === 0) return <span className="tf-body-muted">—</span>;
    return (
      <div className="min-w-0 space-y-0.5">
        {visible.map((title, i) => {
          const isLast = i === visible.length - 1;
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span className="tf-body truncate" title={title}>{title}</span>
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
                    <div className="px-3 py-2 border-b border-gray-100 tf-eyebrow tracking-wide">
                      Job Titles ({titles.length})
                    </div>
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {titles.map((t, j) => (
                        <li key={j} className="px-3 py-1.5 tf-body break-words">{t}</li>
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
    // Individual-row selection: bulk actions run on exactly the ticked rows,
    // even in the grouped Candidates view. A partially-ticked candidate acts on
    // only its ticked scores, not the whole person.
    return filteredResumes.filter((r) => sel.has(r.id));
  }, [selectedResumes, filteredResumes, isGrouped]);
  const allVisibleSelected = filteredResumes.length > 0 && effectiveSelectedRows.length === filteredResumes.length;
  const effectiveSelectedIds = useMemo(() => new Set(effectiveSelectedRows.map((r) => r.id)), [effectiveSelectedRows]);

  /** A row's JD status: the host's lookup when it has one (rows spanning several
   *  versions), else `jobStatus` — which only speaks for this table's own host
   *  job, never for another JD a row in the global cross-job list points at. */
  const statusOfRowJob = (rowJdId: string | undefined, id: string): string | undefined =>
    jobStatusOf?.(id) ?? (rowJdId && rowJdId !== jobId ? undefined : jobStatus);

  /* The jobs the ticked rows belong to — a row's own JD, or this table's
     one job on a single-job host. */
  const selectionJobs = useMemo((): InviteTargetJob[] => {
    const byId = new Map<string, InviteTargetJob>();
    for (const r of effectiveSelectedRows) {
      const id = r.jdId || (jobId && jobId !== 'global' ? jobId : '');
      if (!id || byId.has(id)) continue;
      byId.set(id, { jdId: id, jdCode: rowJobCode(r) || undefined, jdTitle: r.jobTitle || jobTitle, status: statusOfRowJob(r.jdId, id) });
    }
    return Array.from(byId.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelectedRows, jobId, jobTitle, jobStatus, jobStatusOf]);

  /** A scored row as THE invite popup lists it. */
  const toInvitee = (r: ScoredResume): InviteCandidate => ({
    id: r.resumeId || r.id,
    name: r.candidateName,
    email: r.email,
    phone: r.phone,
    rating: Math.round(rowRating10(r) * 10) / 10,
    resumeId: r.resumeId,
  });

  /**
   * Assessment / AI Interview invite for these rows. A host opener
   * (`onOpenInviteDialog`) gets them as is; otherwise THE invite popup opens
   * here — for the rows' one job when they share one, else (several jobs, or
   * none) on the popup's own picker of every published one. A candidate
   * ticked on several jobs is listed once.
   */
  const openRowsInvite = (kind: 'assessment' | 'interview', rows: ScoredResume[]) => {
    const seen = new Set<string>();
    const people = rows.filter((r) => {
      const k = String(r.email || r.resumeId || r.id).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (onOpenInviteDialog) {
      onOpenInviteDialog(kind, people.map(toInvitee));
      return;
    }
    const ownJobId = jobId && jobId !== 'global' && jobId !== 'jd-1' ? jobId : '';
    const jdIds = Array.from(new Set(rows.map((r) => r.jdId || ownJobId).filter(Boolean)));
    const jobRow = jdIds.length === 1 ? rows.find((r) => (r.jdId || ownJobId) === jdIds[0]) : undefined;
    openInvite({
      kind,
      job: jobRow
        ? {
            jdId: jdIds[0],
            jdTitle: jobRow.jobTitle || jobTitle,
            jdCode: rowJobCode(jobRow) || undefined,
            versionNumber: jobRow.jobVersion,
          }
        : undefined,
      candidates: people.map((r) => ({ ...toInvitee(r), source: 'score-resume', inviteSource: 'Resume Scoring' })),
      openOn: 'score-resume',
      // A bulk send clears the ticks, as the old bulk invite did.
      onSent: rows.length > 1 ? () => clearSelection() : undefined,
    });
  };

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
  /** none = no scores ticked, some = a subset (indeterminate), all = every score. */
  const groupSelectionState = (rows: ScoredResume[]): 'none' | 'some' | 'all' => {
    let n = 0;
    for (const r of rows) if (selectedResumes.includes(r.id)) n++;
    return n === 0 ? 'none' : n === rows.length ? 'all' : 'some';
  };
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
        <td key={col.id} className="tf-td whitespace-nowrap">
          <div className="flex items-center gap-2">
            {onViewCandidate ? (
              <button
                onClick={() => onViewCandidate(resume)}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
              >
                {showName(resume.candidateName)}
              </button>
            ) : (
              <div className="tf-body">{showName(resume.candidateName)}</div>
            )}
            {resume.isArchived && <ResumeArchivedBadge />}
          </div>
          {/* "Candidate" is name WITH mail — the email rides under the name
              instead of taking a column of its own. */}
          {resume.email && (
            <div className="flex items-center gap-1 tf-meta mt-0.5">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[240px]" title={resume.email}>{resume.email}</span>
            </div>
          )}
        </td>
      );
    }
    if (col.id === 'jobTitle') {
      return (
        <td key={col.id} className="tf-td whitespace-nowrap">
          {/* Capped at 25 characters so the column is the same width in every
              table; the tooltip carries the full title. */}
          <div className="tf-label" title={resume.jobTitle || undefined}>
            {truncateJobTitle(resume.jobTitle)}
          </div>
        </td>
      );
    }
    if (col.id === 'jdId') {
      // The row's own code in cross-job lists; the host job's in a single-job table.
      const code = rowJobCode(resume);
      return (
        <td key={col.id} className="tf-td whitespace-nowrap">
          {code ? <JobIdBadge>{code}</JobIdBadge> : <span className="tf-body">-</span>}
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
        <td key={col.id} className="tf-td whitespace-nowrap text-center">
          {/* Same pill as the Resume Version column, so the two version
              columns read alike. */}
          {resume.jobVersion ? (
            <span className="tf-badge border bg-blue-50 text-blue-700 border-blue-200">
              v{resume.jobVersion}
            </span>
          ) : (
            <span className="tf-body">-</span>
          )}
        </td>
      );
    }
    if (col.id === 'version') {
      const ver = resume.version || resume.resumeVersion || 1;
      // The resume version with View Resume joined to it (when there is a file to show).
      return (
        <td key={col.id} className="tf-td whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
          <VersionEyeBadge
            label={`v${ver}`}
            onView={resume.resumeId ? () => setViewResumeCandidate(resume) : undefined}
          />
        </td>
      );
    }
    if (col.id === 'email') {
      return (
        <td key={col.id} className="tf-td whitespace-nowrap">
          <div className="flex items-center gap-1 tf-body-secondary">
            <Mail className="w-3.5 h-3.5" />
            {resume.email}
          </div>
        </td>
      );
    }
    if (col.id === 'phone') {
      return (
        <td key={col.id} className="tf-td whitespace-nowrap">
          <div className="flex items-start gap-1 tf-body-secondary">
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
        <td key={col.id} className="tf-td whitespace-nowrap">
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
        <td key={col.id} className="tf-td whitespace-nowrap text-center">
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
        <td key={col.id} className="tf-td whitespace-nowrap">
          <div className="tf-body-secondary">{resume.experience || 'N/A'}</div>
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
        <td key={col.id} className="tf-td min-w-[180px]">
          <div className="tf-body-secondary">{educationDisplay}</div>
        </td>
      );
    }
    if (col.id === 'certifications') {
      return (
        <td key={col.id} className="tf-td min-w-[200px]">
          <div className="tf-body-secondary">
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
        <td key={col.id} className="tf-td whitespace-nowrap">
          <div className="tf-body">{resume.scoredBy}</div>
          <div className="flex items-center gap-1 tf-meta">
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
  /** Which invites a row can offer — permission / plan / job lock only (see
   *  below). Shared by the table's Invite button and the grid card's
   *  Actions → Invite submenu, so the two can never offer different things. */
  const getRowInviteGate = (resume: ScoredResume) => {
    /* The row's Invite opens THE invite popup just like the selection's
       items, and is gated the same way — permission only: the popup itself
       offers Create when this job has no assessment / AI interview yet, so
       "none configured" no longer greys it out. An archived resume is the
       one thing that overrides all of that — same rule every other resume
       action (Score, AI Talent Match, resume-view's Invite) follows. */
    /* A Disabled / Archived JD blocks the row's invites too — on hosts with no
       JobActionLock around them (Resume Scoring's job drill-down) this is the
       only thing that knows. */
    const rowJobId = resume.jdId || (jobId && jobId !== 'global' ? jobId : '');
    const rowJobLock = rowJobId
      ? resolveSelectionJobLock([{ jdId: rowJobId, jdTitle: resume.jobTitle || jobTitle || '', status: statusOfRowJob(resume.jdId, rowJobId) }])
      : null;
    const rowCanInviteAssessment = !resume.isArchived && !rowJobLock && canCreateAssessments;
    const rowCanInviteAIInterview = !resume.isArchived && !rowJobLock && mayInviteAIInterview;
    return {
      rowCanInviteAssessment,
      rowCanInviteAIInterview,
      rowInviteDisabled: !rowCanInviteAssessment && !rowCanInviteAIInterview,
      // The trigger stays visible but inert, with a tooltip naming the
      // reason, rather than disappearing outright.
      rowInviteDisabledTitle: resume.isArchived
        ? ARCHIVED_RESUME_MESSAGE
        : rowJobLock
        ? rowJobLock
        : jobLockReason
        ? jobLockReason
        : !(canCreateAssessments || mayInviteAIInterview)
        ? (invitePlanLocked ? PLAN_LOCKED_MESSAGE : 'You do not have permission to invite candidates')
        : 'No published assessment or AI interview for this job yet',
    };
  };

  /** The Invite menu's two entries — Assessment and AI Interview. */
  const renderInviteMenuItems = (resume: ScoredResume) => {
    const { rowCanInviteAssessment, rowCanInviteAIInterview } = getRowInviteGate(resume);
    /* Both open THE invite popup for THIS row's candidate (openRowsInvite —
       the host's opener when it has one). Labels: the host popup's
       "Create / Send …" names, else the list's own short ones. */
    return (
      <>
        <DropdownMenuItem
          className={`${scoredResumesMenuItemClass} ${!rowCanInviteAssessment ? '!text-gray-400 opacity-60 cursor-not-allowed' : ''}`}
          aria-disabled={!rowCanInviteAssessment || undefined}
          title={!rowCanInviteAssessment ? (resume.isArchived ? ARCHIVED_RESUME_MESSAGE : assessmentDeniedReason) : undefined}
          onSelect={(e) => {
            if (!rowCanInviteAssessment) { e.preventDefault(); return; }
            openRowsInvite('assessment', [resume]);
          }}
        >
          <ClipboardList className="w-4 h-4 text-menu-icon-view" />
          <span className={MENU_ITEM_SCALE_CLASS}>{onOpenInviteDialog ? 'Create / Send Assessment' : 'Assessment'}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`${scoredResumesMenuItemClass} ${!rowCanInviteAIInterview ? '!text-gray-400 opacity-60 cursor-not-allowed' : ''}`}
          aria-disabled={!rowCanInviteAIInterview || undefined}
          title={!rowCanInviteAIInterview ? (resume.isArchived ? ARCHIVED_RESUME_MESSAGE : aiInterviewDeniedReason) : undefined}
          onSelect={(e) => {
            if (!rowCanInviteAIInterview) { e.preventDefault(); return; }
            if (!onOpenInviteDialog && onInviteAIInterview) {
              onInviteAIInterview({
                name: resume.candidateName || 'Unknown',
                email: resume.email || '',
                resumeId: resume.resumeId,
              });
              return;
            }
            openRowsInvite('interview', [resume]);
          }}
        >
          <Video className="w-4 h-4 text-menu-icon-ai" />
          <span className={MENU_ITEM_SCALE_CLASS}>{onOpenInviteDialog ? 'Create / Send AI Interview' : 'AI Interview'}</span>
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
    if (isPhone) {
      return (
        <>
          <div
            className="flex items-center gap-2 px-3 pt-1.5 pb-1 text-2xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500"
            title={rowInviteDisabled ? rowInviteDisabledTitle : undefined}
          >
            <UserPlus className="w-3.5 h-3.5" /> Invite
          </div>
          {renderInviteMenuItems(resume)}
        </>
      );
    }
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className={`${scoredResumesMenuItemClass} ${rowInviteDisabled ? '!text-gray-400 opacity-60' : ''}`}
          /* No permission (or plan): stays hoverable so the tooltip shows —
             the submenu's two entries are greyed no-ops. Native disabled is
             kept only for the non-permission "nothing published" case. */
          disabled={rowInviteDisabled && (canCreateAssessments || mayInviteAIInterview)}
          aria-disabled={rowInviteDisabled || undefined}
          title={rowInviteDisabled ? rowInviteDisabledTitle : undefined}
        >
          <UserPlus className="w-4 h-4 text-menu-icon-share" />
          <span className={MENU_ITEM_SCALE_CLASS}>Invite</span>
        </DropdownMenuSubTrigger>
        {/* w-64 with the "Create / Send …" labels (onOpenInviteDialog) — the
            width the selection Actions menu gives the same two labels. */}
        <DropdownMenuSubContent className={`${onOpenInviteDialog ? 'w-64' : 'w-44'} max-w-[calc(100vw-1rem)] !rounded-lg !bg-white !py-1 !px-0 !shadow-xl`}>
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
        className={`${scoredResumesMenuItemClass} ${!canExport ? '!text-gray-400 opacity-60 cursor-not-allowed' : ''}`}
        aria-disabled={!canExport || undefined}
        title={!canExport ? 'You do not have permission to export' : undefined}
        onSelect={(e) => {
          if (!canExport) {
            e.preventDefault();
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
        className={`${scoredResumesMenuItemClass} ${!canDownloadScorecard ? '!text-gray-400 opacity-60 cursor-not-allowed' : ''}`}
        disabled={bulkDownloading}
        aria-disabled={!canDownloadScorecard || undefined}
        title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
        onSelect={(e) => {
          if (!canDownloadScorecard) {
            e.preventDefault();
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
        // An Archived/Disabled job in the selection overrides the usual
        // permission reason with why — same as Job Details' JobActionLock,
        // for the one host job this table itself knows the status of.
        const selectionJobLock = resolveSelectionJobLock(selectionJobs);
        // Same rule as a single row's Invite — an archived resume anywhere in
        // the selection blocks the whole batch rather than silently dropping it.
        const selectionArchivedCount = effectiveSelectedRows.filter((r) => r.isArchived).length;
        const assessmentAllowed = canCreateAssessments && !selectionJobLock && selectionArchivedCount === 0;
        const assessmentReason = selectionArchivedCount > 0 ? ARCHIVED_RESUME_MESSAGE : (selectionJobLock ?? assessmentDeniedReason);
        const interviewAllowed = mayInviteAIInterview && !selectionJobLock && selectionArchivedCount === 0;
        const interviewReason = selectionArchivedCount > 0 ? ARCHIVED_RESUME_MESSAGE : (selectionJobLock ?? aiInterviewDeniedReason);
        return (
          <>
            {/* Always offered (permission aside): THE invite popup with the ticked
                rows — for their one job, or the popup's picker when they span
                several. Labels: the host popup's "Create / Send …", else the list's
                "AI Assessment / AI Interview Invite". */}
            {renderInviteTargetItems({
              kind: 'assessment',
              target: { state: 'ready' },
              label: 'Create / Send Assessment',
              itemClass: scoredResumesMenuItemClass,
              allowed: assessmentAllowed,
              deniedReason: assessmentReason,
              onInvite: (e) => {
                if (!assessmentAllowed) {
                  e.preventDefault();
                  return;
                }
                openRowsInvite('assessment', effectiveSelectedRows);
              },
            })}
            {renderInviteTargetItems({
              kind: 'interview',
              target: { state: 'ready' },
              label: 'Create / Send AI Interview',
              itemClass: scoredResumesMenuItemClass,
              allowed: interviewAllowed,
              deniedReason: interviewReason,
              onInvite: (e) => {
                if (!interviewAllowed) {
                  e.preventDefault();
                  return;
                }
                openRowsInvite('interview', effectiveSelectedRows);
              },
            })}
          </>
        );
      })()}
    </>
  );

  const selectionActions = effectiveSelectedRows.length > 0 ? (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Matches the Resume Scoring "View by Job" Actions pill: a blinking
            brand-orange dot and an "Actions (N)" count, so the candidate and
            job bulk bars read identically. */}
        <button
          type="button"
          className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
          aria-label={`Actions for ${effectiveSelectedRows.length} selected`}
        >
          <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
          </span>
          {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Actions ({isGrouped ? new Set(effectiveSelectedRows.map(candidateGroupKey)).size : effectiveSelectedRows.length})
          <ChevronDown className="w-4 h-4" />
        </button>
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
    {/* Clear — untick everything, beside Actions, matching View by Job. */}
    <button
      type="button"
      onClick={clearSelection}
      title="Clear the selection"
      className={TOOLBAR_BUTTON_CLASS}
    >
      <X className="w-4 h-4" />
      Clear
    </button>
    </>
  ) : null;

  // No padded outer card, embedded or standalone: standalone it sat inside the
  // page panel and framed the already-bordered rows a second time (a card
  // inside a card). Resume Scoring's View by Job dropped the same shell.
  return (
    <div>
      {/* Header — title and the one page-level action. Everything that acts on
          the list lives in the toolbar below, and everything that acts on a
          selection lives in its own row under that, same as job-openings. */}
      {/* Embedded in a tab, the title heading and the Score Resumes button both
          come off this row (matching the AI Talent Match tab, which has no
          in-table heading): the heading is dropped and Score Resumes moves into
          the selection Actions menu. Standalone keeps the header row. */}
      {!toolbarPortal && (title || onScoreResumes) && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        {title && <h2 className="tf-section-title sm:text-xl tracking-tight">{title}</h2>}
        {/* Score Resumes — opens the host's "Select Applicants to Score" modal. */}
        {onScoreResumes && (
          <Button
            variant="primary"
            size="md"
            onClick={onScoreResumes}
            icon={<ClipboardList className="w-4 h-4" />}
            className="w-full sm:w-auto"
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
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
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
        /* Standalone (Resume Scoring's View by Candidates and job page): the Job
           Openings list's toolbar card below lg, and its phone line layout
           (globals.css, `.tf-jobs-toolbar`) — the same toolbar as View by Job. */
        <div className={toolbarPortal ? undefined : embedded ? 'mb-4 space-y-3' : 'tf-jobs-toolbar tf-toolbar-card mb-4 space-y-3'}>
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
          // Standalone too: at 768 the inline filters crushed the search box
          // to an icon, the same fix Resume Scoring's View by Job uses.
          fitToContainer
          containerBreakpoint={toolbarPortal ? undefined : '4xl'}
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
                </>
              )
              : undefined
          }
          onToggleFilters={() => setShowFilters(!showFilters)}
          // Active filter tags: a popup on hovering More Filters (laptop / desktop).
          filterChips={activeFilterChips}
          filtersOpen={showFilters}
          activeFilterCount={search.activeFilterCount}
          filtersApplied={search.filtersApplied}
          onClearFilters={search.reset}
          leadingActions={
            <>
              {/* Standalone only. Embedded in Job Details the same filter is
                  More Filters' "Scored By" field instead. */}
              {!embedded && (
                <div className="tf-jobs-filter-pills contents">
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
                </div>
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
          trailing={embedded ? <ListViewToggle value={displayMode} onChange={setDisplayMode} className="h-9 [&>button]:p-2 [&_svg]:w-4 [&_svg]:h-4" /> : undefined}
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
              onClick={() => { if (scoreResumesDisabled) return; onScoreResumes(); }}
              aria-disabled={!!scoreResumesDisabled}
              title={scoreResumesDisabled ? (scoreResumesDisabledReason ?? 'You do not have permission to score resumes') : undefined}
              icon={<ClipboardList className="w-4 h-4" />}
              className={`sm:h-9 whitespace-nowrap ${scoreResumesDisabled ? 'opacity-50 !cursor-not-allowed' : ''}`}
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
          {/* Phones sort from the Sort menu in row 2 (PhoneSortMenu). */}
          {!embedded && filteredResumes.length > 0 && (
            <div className="tf-jobs-sort contents">
            <SortByControl<SortKey>
              value={sortBy}
              order={sortOrder}
              options={isGrouped ? GROUPED_SORT_OPTIONS : FLAT_SORT_OPTIONS}
              onChange={setSortBy}
              onToggleOrder={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            />
            </div>
          )}
          {!embedded && (
            <ListViewToggle value={displayMode} onChange={setDisplayMode} className="tf-jobs-viewtoggle h-9 !border-brand-blue/10" />
          )}
        </ListToolbar>

        {/* Actions + Clear — embedded: their own full-width row under the
            toolbar once rows are ticked. Inside `beforeSearch` they shared a
            shrink-wrapped box with Select All and wrapped out of line; h-9
            matches the Job Details toolbar band. */}
        {embedded && selectionActions && (
          <StickyBulkBar className="tf-tb-bulk mb-3 flex flex-wrap items-center gap-2 [&>button]:h-9 [&>*]:flex-1 sm:[&>*]:flex-none animate-in fade-in slide-in-from-top-1 duration-200">
            {selectionActions}
          </StickyBulkBar>
        )}

        {/* Advanced Filters */}
        {showFilters && (
          /* mt-3 is the gap under the toolbar. The wrapper's space-y-3 can't
             give it: in Tailwind v4 space-y is a margin-BOTTOM on the toolbar
             row, which that row's own mb-0 overrides.
             Embedded in Job Details this drops the tinted/bordered card for
             the AI Talent Match reference's plain top-divider, so the panel
             reads as part of the same tab card the toolbar sits in. */
          <div className={embedded ? 'mt-4 sm:mt-5 pt-4 sm:pt-5 pb-4 border-t border-brand-blue/10' : 'tf-jobs-filter-panel mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4'}>
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
                final row from stretching two fields across the whole panel.

                Standalone now lays those fields on the same 1 / 2 / 4-column
                grid as the embedded panel; `[&>div]:max-w-none` cancels the
                FILTER_FIELD_* `sm:max-w-*` caps (meant for the flex row) so each
                field fills its cell. The constants themselves are shared. */}
            <div className={embedded ? JOB_TAB_FILTER_GRID_CLASS : 'tf-grid-4 [&>div]:min-w-0 [&>div]:max-w-none'}>
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
                  <FilterSelect
                    value={filterMatchStatus}
                    onChange={(v) => search.setFilter('matchStatus', v as typeof filterMatchStatus)}
                    ariaLabel="Match Status"
                    className={embedded ? JOB_TAB_FILTER_SELECT_TRIGGER_CLASS : FILTER_SELECT_TRIGGER_CLASS}
                    options={[
                      { value: 'all', label: 'All Statuses' },
                      { value: 'Exact Match', label: 'Exact Match' },
                      { value: 'Partial Match', label: 'Partial Match' },
                      { value: 'No Match', label: 'No Match' },
                    ]}
                  />
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
                  <FilterSelect
                    value={filterJobVersion}
                    onChange={(v) => search.setFilter('jobVersion', v)}
                    ariaLabel="Job Version"
                    className={FILTER_SELECT_TRIGGER_CLASS}
                    options={[
                      { value: 'all', label: 'All Versions' },
                      ...uniqueJobVersions.map(version => ({ value: version, label: `v${version}` })),
                    ]}
                  />
                </div>
              )}

            </div>

            {/* Active filter tags as the panel's last line — phones / tablets only. */}
            <FilterChipsPanelLine chips={activeFilterChips} />
          </div>
        )}

        {/* Row 2: the host's verdict pills and View by toggle. Select All now
            rides the toolbar row above (beforeSearch), matching the AI Talent
            Match reference; this row renders only when it still has content. */}
        {(viewPillsSlot || (isGrouped && paginatedGroups.length > 0) || (!embedded && filteredResumes.length > 0)) && (
        <div className={`${embedded ? '' : 'tf-jobs-row2 '}mt-3 pt-3 border-t border-gray-200 dark:border-slate-700/60 flex flex-wrap items-center gap-2`}>
          {/* Standalone: Select All leads this row, then a divider and the
              verdict pills — exactly View by Job's row 2. */}
          {!embedded && filteredResumes.length > 0 && (() => {
            const pageRows = isGrouped ? paginatedGroups.flatMap((g) => g.rows) : paginatedResumes;
            const selectedCount = isGrouped
              ? new Set(effectiveSelectedRows.map(candidateGroupKey)).size
              : effectiveSelectedRows.length;
            return (
              <>
                <div className="tf-jobs-select">
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
                </div>
                {viewPillsSlot && (
                  <span aria-hidden className="hidden sm:block h-6 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
                )}
              </>
            );
          })()}
          {viewPillsSlot}
          {/* Phones: the Job Openings list's Sort menu (the inline Sort by hides). */}
          {!embedded && filteredResumes.length > 0 && (
            <PhoneSortMenu<SortKey>
              value={sortBy}
              order={sortOrder}
              options={isGrouped ? GROUPED_SORT_OPTIONS : FLAT_SORT_OPTIONS}
              orderLabels={sortOrderLabels}
              onChange={setSortBy}
              onOrderChange={setSortOrder}
            />
          )}
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
                title={allOpen ? 'Collapse all' : 'Expand all'}
                /* Phones (standalone): an icon square beside Sort, like the Job Openings list's Refresh. */
                className={`${embedded ? '' : 'tf-jobs-refresh '}${TOOLBAR_BUTTON_CLASS} sm:ml-auto`}
              >
                {allOpen ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
                <span className={embedded ? undefined : 'max-sm:sr-only'}>{allOpen ? 'Collapse all' : 'Expand all'}</span>
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
          <StickyBulkBar className="mt-3 max-sm:mt-0 basis-full order-last flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none animate-in fade-in slide-in-from-top-1 duration-200">
            {selectionActions}
          </StickyBulkBar>
        )}

        </div>
        );
        return toolbarPortal ? createPortal(toolbarBlock, toolbarPortal) : toolbarBlock;
      })()}

      {displayMode === 'grid' ? (
        <div className="tf-card overflow-hidden">
          {gridRows.length === 0 ? (
            <ListEmptyState
              icon={Search}
              isNarrowed={search.isNarrowed}
              query={search.appliedQuery}
              entityLabel="scored resume"
              emptyTitle="No Scored Resumes Yet"
              emptyDescription="Score resumes against this job description to see the candidates here."
              onReset={search.reset}
              illustration={<ScoredResumesIllustration />}
              action={onScoreResumesFromEmptyState ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => { if (scoreResumesDisabled) return; onScoreResumesFromEmptyState(); }}
                  aria-disabled={!!scoreResumesDisabled}
                  title={scoreResumesDisabled ? (scoreResumesDisabledReason ?? 'You do not have permission to score resumes') : undefined}
                  icon={<ClipboardList className="w-4 h-4" />}
                  className={`${(scoreResumesDisabled ? 'opacity-50 !cursor-not-allowed' : '')} disabled:opacity-50`}
                >
                  Score Resumes
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="tf-grid-4 p-4">
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
                        {/* pr-7 leaves room for the corner checkbox; pl-7 keeps the
                            top-left select seal (touch, hover, any selection) off the name. */}
                        <div className="min-w-0 pr-7 pl-7">
                          <div className="flex items-center gap-2 min-w-0">
                            {onViewCandidate ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onViewCandidate(resume); }}
                                className="block max-w-full truncate text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors"
                              >
                                {showName(resume.candidateName) || 'Candidate'}
                              </button>
                            ) : (
                              <p className="tf-row-name truncate">{showName(resume.candidateName) || 'Candidate'}</p>
                            )}
                            {resume.isArchived && <ResumeArchivedBadge />}
                          </div>
                          <p className="tf-meta truncate" title={resume.email || undefined}>{resume.email || '—'}</p>
                        </div>

                        <div>
                          <span className="tf-badge bg-blue-50 text-blue-700 border border-blue-200">
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
                  {/* No initials avatar — there is no profile photo behind it.
                      pl-7 keeps the top-left select seal (touch, hover, any
                      selection) off the name. */}
                  <div className="flex items-start gap-2.5 pl-7">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{showName(resume.candidateName) || 'Candidate'}</p>
                        {resume.isArchived && <ResumeArchivedBadge />}
                      </div>
                      <p className="tf-meta truncate">{resume.email || '—'}</p>
                    </div>
                  </div>

                  {isGlobalView && resume.jobTitle && (
                    <p className="tf-meta truncate" title={resume.jobTitle}>
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
                    <div className="flex flex-wrap items-center gap-1.5 tf-meta">
                      {resume.jobVersion != null && (
                        <span className="inline-flex items-center gap-1">
                          Job
                          <span className="tf-badge text-2xs border bg-blue-50 text-blue-700 border-blue-200">v{resume.jobVersion}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        Resume
                        <VersionEyeBadge
                          label={`v${resume.version || resume.resumeVersion || 1}`}
                          onView={resume.resumeId ? () => setViewResumeCandidate(resume) : undefined}
                        />
                      </span>
                    </div>
                  )}

                  {/* The rest of the list's columns, so the card carries what a
                      table row does: JD ID + Job Title (unless the global view's
                      "Applied for" line above already shows them), then Scored
                      By / Date. Each hides with its column (hiddenColumnIds). */}
                  {!isGlobalView && (
                    (!hiddenColumnIds?.includes('jdId') && rowJobCode(resume)) ||
                    (!hiddenColumnIds?.includes('jobTitle') && resume.jobTitle)
                  ) && (
                    <div className="flex items-start gap-1.5 min-w-0 text-xs">
                      {!hiddenColumnIds?.includes('jdId') && rowJobCode(resume) && (
                        <span className="shrink-0"><JobIdBadge>{rowJobCode(resume)}</JobIdBadge></span>
                      )}
                      {!hiddenColumnIds?.includes('jobTitle') && resume.jobTitle && (
                        <span className="min-w-0 pt-0.5 text-gray-700 [overflow-wrap:anywhere]">{resume.jobTitle}</span>
                      )}
                    </div>
                  )}
                  {!hiddenColumnIds?.includes('scoredDate') && (
                    <div className="space-y-0.5 tf-meta min-w-0">
                      <p className="[overflow-wrap:anywhere]">
                        <span className="text-gray-400">Scored by:</span>{' '}
                        <span className="text-gray-700">{resume.scoredBy || '—'}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                        <span>
                          <span className="text-gray-700">{formatISTDate(resume.scoredDate)}</span>{' '}
                          <span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span>
                        </span>
                      </p>
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
                      <div className="flex-1 min-w-0 tf-meta">
                        <div className="tf-micro-hint uppercase tracking-wide">Latest Updated</div>
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
                      className="tf-grid-3 mt-1 pt-3 border-t border-gray-100 cursor-default"
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
                                <span className="tf-label truncate" title={row.jobTitle || undefined}>
                                  {truncateJobTitle(row.jobTitle) || 'Untitled role'}
                                </span>
                                {row.jobVersion ? (
                                  <span className="tf-badge text-2xs border bg-blue-50 text-blue-700 border-blue-200 shrink-0">
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
                              <div className="mt-1 flex items-center gap-1 tf-meta">
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
        <div className="tf-card overflow-hidden">
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
              <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  {/* pl-[46px]: the cell's padding plus the checkbox in front of the
                      name, so the heading lines up with the names. */}
                  <th className="tf-th-cell text-left pr-4 pl-[46px] tf-th">Candidate</th>
                  <th className="tf-th-cell text-center tf-th">Job Versions</th>
                  <th className="tf-th-cell text-left tf-th">Job Titles</th>
                  <th className="tf-th-cell text-center tf-th">Exact Match</th>
                  <th className="tf-th-cell text-center tf-th">Partial Match</th>
                  <th className="tf-th-cell text-center tf-th">No Match</th>
                  <th className="tf-th-cell text-left tf-th">Latest Updated</th>
                  <th className="tf-th-cell text-left tf-th tf-sticky-col">Actions</th>
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
                        {/* tf-wrap: the full name / email wrap inside the
                            fixed 16rem column instead of being cut to "…". */}
                        <td className="tf-td tf-wrap min-w-0">
                          {/* Checkbox before the name — no column of its own,
                              the same as View by Job's rows. Then name and
                              email only (no initials avatar, no phone). */}
                          <div className="flex items-start gap-2 min-w-0">
                            {(() => {
                              const st = groupSelectionState(rows);
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleSelectGroup(rows); }}
                                  aria-pressed={st !== 'none'}
                                  aria-label={st !== 'none' ? 'Deselect candidate' : 'Select candidate'}
                                  title={st === 'some' ? 'Some scores selected' : undefined}
                                  className="inline-flex p-1.5 -ml-1.5 hover:bg-gray-200 rounded flex-shrink-0"
                                >
                                  {st === 'all' ? (
                                    <CheckSquare className="w-4 h-4 text-brand-blue" />
                                  ) : st === 'some' ? (
                                    <MinusSquare className="w-4 h-4 text-brand-blue" />
                                  ) : (
                                    <Square className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                              );
                            })()}
                            <div className="min-w-0 w-full">
                              <div className="flex items-center gap-2 min-w-0">
                                {onViewCandidate ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onViewCandidate(primary); }}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors block max-w-full [overflow-wrap:anywhere]"
                                    title={primary.candidateName || undefined}
                                  >
                                    {primary.candidateName || 'Candidate'}
                                  </button>
                                ) : (
                                  <div className="tf-row-name [overflow-wrap:anywhere]">{primary.candidateName || 'Candidate'}</div>
                                )}
                                {primary.isArchived && <ResumeArchivedBadge />}
                              </div>
                              {primary.email && <div className="tf-meta [overflow-wrap:anywhere]" title={primary.email}>{primary.email}</div>}
                            </div>
                          </div>
                        </td>
                        {/* Just the count — the column header already says
                            "Job Versions". Centred under it, like the other counts. */}
                        <td className="tf-td text-center">
                          <span
                            className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-blue-50 text-blue-700 border border-blue-200"
                            title={`${rows.length} job ${rows.length === 1 ? 'version' : 'versions'}`}
                          >
                            {rows.length}
                          </span>
                        </td>
                        <td className="tf-td min-w-0">
                          {renderJobTitles(distinctTitles)}
                        </td>
                        {(() => {
                          const t = groupTally(rows);
                          return (
                            <>
                              <td className="tf-td text-center">{renderVerdictCount('exact', t.exact)}</td>
                              <td className="tf-td text-center">{renderVerdictCount('partial', t.partial)}</td>
                              <td className="tf-td text-center">{renderVerdictCount('none', t.none)}</td>
                            </>
                          );
                        })()}
                        <td className="tf-td whitespace-nowrap">
                          <div className="tf-body">{formatISTDate(primary.scoredDate)}</div>
                          <div className="tf-meta">{formatISTTime(primary.scoredDate)}</div>
                        </td>
                        <td className="tf-td text-left tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
                                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                    <th className="tf-th-cell w-8" aria-hidden />
                                    {enabledColumns.filter((col) => col.id !== 'candidateName').map((col) => (
                                      <th key={col.id} className={`${CENTERED_COLUMNS.has(col.id) ? 'text-center' : 'text-left'} py-2 px-4 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap`}>
                                        {col.label}
                                      </th>
                                    ))}
                                    <th className="tf-th-cell text-left tf-th">Actions</th>
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
                                      <td className="tf-td w-8" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          onClick={() => handleSelectResume(row.id)}
                                          aria-pressed={selectedResumes.includes(row.id)}
                                          aria-label={selectedResumes.includes(row.id) ? 'Deselect score' : 'Select score'}
                                          className="inline-flex p-1 -ml-1 hover:bg-gray-200 rounded"
                                        >
                                          {selectedResumes.includes(row.id) ? (
                                            <CheckSquare className="w-4 h-4 text-brand-blue" />
                                          ) : (
                                            <Square className="w-4 h-4 text-gray-400" />
                                          )}
                                        </button>
                                      </td>
                                      {enabledColumns.filter((col) => col.id !== 'candidateName').map((col) => renderResumeCell(col, row))}
                                      <td className="tf-td whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
              const t = groupTally(rows);
              const verdictTone = (kind: 'exact' | 'partial' | 'none', count: number): MobileStatTone =>
                (activeVerdict && VERDICT_OF_KIND[kind] !== activeVerdict) || count === 0
                  ? 'neutral'
                  : kind === 'exact' ? 'success' : kind === 'partial' ? 'warning' : 'danger';
              return (
                <MobileRecordCard
                  key={key}
                  selected={groupSelected}
                  select={
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSelectGroup(rows); }}
                      className="p-1 -m-1 hover:bg-gray-200 rounded flex-shrink-0"
                    >
                      {(() => {
                        const st = groupSelectionState(rows);
                        return st === 'all' ? (
                          <CheckSquare className="w-5 h-5 text-brand-blue" />
                        ) : st === 'some' ? (
                          <MinusSquare className="w-5 h-5 text-brand-blue" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        );
                      })()}
                    </button>
                  }
                  title={onViewCandidate ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onViewCandidate(primary); }}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors [overflow-wrap:anywhere]"
                    >
                      {primary.candidateName || 'Candidate'}
                    </button>
                  ) : (
                    <span className="[overflow-wrap:anywhere]">{primary.candidateName || 'Candidate'}</span>
                  )}
                  badges={primary.isArchived ? <ResumeArchivedBadge /> : undefined}
                  meta={[{ icon: <Mail className="w-3.5 h-3.5" />, label: primary.email }]}
                  fields={[
                    {
                      label: 'Scored',
                      value: <>{formatISTDate(primary.scoredDate)} <span className="text-gray-400">{formatISTTime(primary.scoredDate)}</span></>,
                    },
                  ]}
                  footer={
                    <>
                      <MobileStatChip tone={verdictTone('exact', t.exact)}>Exact Match {t.exact}</MobileStatChip>
                      <MobileStatChip tone={verdictTone('partial', t.partial)}>Partial Match {t.partial}</MobileStatChip>
                      <MobileStatChip tone={verdictTone('none', t.none)}>No Match {t.none}</MobileStatChip>
                      <MobileStatChip tone="info">
                        {rows.length} Job {rows.length === 1 ? 'Version' : 'Versions'}
                      </MobileStatChip>
                    </>
                  }
                  actions={
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
                  }
                  expanded={isExpanded && (
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
                              <div className="tf-label truncate" title={row.jobTitle || undefined}>
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
                              <div className="mt-1 flex items-center gap-1 tf-meta">
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
                >
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

                </MobileRecordCard>
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
      <div className="hidden lg:block tf-card overflow-hidden">
        <div className="overflow-x-auto tf-table-shell">
        <table className="w-full table-auto">
          {/* Header styled to the AI Talent Match table: sticky, bg-gray-50 per
              cell, light uppercase gray-500 labels with wider tracking, dark mode. */}
          <thead className="sticky top-0 z-10 [&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
            <tr>
              <th className="tf-th-cell text-left w-10 tf-sticky-col-left tf-th" aria-label="Select">
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
                <th key={col.id} className={`${CENTERED_COLUMNS.has(col.id) ? 'text-center' : 'text-left'} px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle`}>
                  {col.label}
                </th>
              ))}
              <th className="tf-th-cell text-left tf-th tf-sticky-col">Actions</th>
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
                <td className="tf-td tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedResumes.includes(resume.id)}
                    onChange={() => handleSelectResume(resume.id)}
                    className="rounded border-gray-300"
                  />
                </td>

                {enabledColumns.map((col) => renderResumeCell(col, resume))}

                {/* Actions Column — Invite is the menu's first entry. */}
                <td className="tf-td whitespace-nowrap tf-sticky-col" onClick={(e) => e.stopPropagation()}>
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
            emptyTitle="No Scored Resumes Yet"
            emptyDescription="Score resumes against this job description to see the candidates here."
            onReset={search.reset}
            illustration={<ScoredResumesIllustration />}
            action={onScoreResumesFromEmptyState ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => { if (scoreResumesDisabled) return; onScoreResumesFromEmptyState(); }}
                aria-disabled={!!scoreResumesDisabled}
                title={scoreResumesDisabled ? (scoreResumesDisabledReason ?? 'You do not have permission to score resumes') : undefined}
                icon={<ClipboardList className="w-4 h-4" />}
                className={`${(scoreResumesDisabled ? 'opacity-50 !cursor-not-allowed' : '')} disabled:opacity-50`}
              >
                Score Resumes
              </Button>
            ) : undefined}
          />
        )}
        </div>
      </div>

      {/* Mobile Card View — the shared MobileRecordCard (job-openings card):
          JD ID · name · Match Status, email, the table's columns as Label: value
          (each hides with its column, hiddenColumnIds), the score chip, then
          Invite / Share / ⋮ bottom-right. */}
      <div className="lg:hidden space-y-3">
        {paginatedResumes.map((resume) => {
          const cardJobCode = rowJobCode(resume);
          const showInvite = resume.matchStatus === 'Exact Match' || resume.matchStatus === 'Partial Match';
          const showShare = RESUME_EMAIL_SHARE_ENABLED && !!resume.resumeId;
          const showJdId = !hiddenColumnIds?.includes('jdId');
          const scoreVerdict = normalizeMatchResult(resume.matchStatus) ?? 'No Match';
          return (
          <MobileRecordCard
            key={resume.id}
            selected={selectedResumes.includes(resume.id)}
            onClick={(e) => handleRowClick(resume.id, e)}
            select={
              <button
                onClick={() => handleSelectResume(resume.id)}
                className="p-1 -m-1 hover:bg-gray-200 rounded shrink-0"
              >
                {selectedResumes.includes(resume.id) ? (
                  <CheckSquare className="w-5 h-5 text-brand-blue" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
              </button>
            }
            idBadge={showJdId && cardJobCode
              ? <JobIdBadge className="min-w-0 truncate" title={cardJobCode}>{cardJobCode}</JobIdBadge>
              : undefined}
            title={<span className="[overflow-wrap:anywhere]">{showName(resume.candidateName)}</span>}
            badges={(resume.isArchived || !hiddenColumnIds?.includes('matchStatus')) ? (
              <>
                {resume.isArchived && <ResumeArchivedBadge />}
                {!hiddenColumnIds?.includes('matchStatus') && (
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${matchBadgeClass(resume.matchStatus)}`}>
                    {resume.matchStatus}
                  </span>
                )}
              </>
            ) : undefined}
            meta={[{ icon: <Mail className="w-3.5 h-3.5" />, label: resume.email }]}
            /* The table's columns as Label: value (phone, experience and
               education are export-only; see ScoredResumesExportModal). Each
               hides with its column (hiddenColumnIds). Job Title reads
               "Applied for" in the cross-job (global) list. */
            fields={[
              ...(showJdId && !cardJobCode ? [{ label: 'JD ID', value: '-' }] : []),
              ...(!hiddenColumnIds?.includes('jobTitle') ? [{
                label: isGlobalView ? 'Applied for' : 'Job Title',
                value: <span title={resume.jobTitle || undefined}>{resume.jobTitle ? truncateJobTitle(resume.jobTitle) : '-'}</span>,
              }] : []),
              ...(!hiddenColumnIds?.includes('jobVersion') ? [{ label: 'Job Version', value: resume.jobVersion ? `v${resume.jobVersion}` : '-' }] : []),
              ...(!hiddenColumnIds?.includes('version') ? [{ label: 'Resume Version', value: `v${resume.version || resume.resumeVersion || 1}` }] : []),
              ...(!hiddenColumnIds?.includes('scoredDate') ? [
                { label: 'Scored by', value: <span title={resume.scoredBy || undefined}>{resume.scoredBy}</span> },
                { label: 'Date', value: <>{formatISTDate(resume.scoredDate)}{' '}<span className="text-gray-400">{formatISTTime(resume.scoredDate)}</span></> },
              ] : []),
            ]}
            /* Same three colours as the Match Status badge, from the one palette in
               lib/utils/matchStatus.ts - green / brand orange / red. Not a score
               threshold: Exact and Partial share the 60-100 range and are told
               apart by the Required average, so any cut-off on the number would
               contradict the badge beside it. */
            footer={!hiddenColumnIds?.includes('scorePercentage') ? (
              <MobileStatChip tone={scoreVerdict === 'Exact Match' ? 'success' : scoreVerdict === 'Partial Match' ? 'warning' : 'danger'}>
                Score {formatOverallScore(resume.overallRating10, resume.scorePercentage)}
              </MobileStatChip>
            ) : undefined}
            /* Invite / Share, then the table row's ⋮ menu (renderRowMenuItems),
               so phones reach the same per-row actions (Create / Send AI
               Interview etc.). Download Scorecard and View Resume live in the
               ⋮, so they're not repeated as buttons here. */
            actions={
              <>
              {/* Invite Button - For Exact Match & Partial Match. Opens THE
                  invite popup for this candidate (the popup offers Create
                  when the job has none yet). No permission: greyed, with the
                  reason on hover, and a no-op. No units left: disabled. */}
              {showInvite && (
                <div className="relative group min-w-0">
                  {/* Create / Send Assessment's shared look (createSendActions). */}
                  <button
                    type="button"
                    disabled={canCreateAssessments && availableUnits === 0}
                    aria-disabled={!canCreateAssessments || undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canCreateAssessments) {
                        return;
                      }
                      openRowsInvite('assessment', [resume]);
                    }}
                    className={`${CREATE_SEND_BUTTON_CLASS.assessment} !whitespace-normal !h-auto min-h-[2.5rem] py-2 text-center leading-snug justify-center ${!canCreateAssessments ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <ClipboardList className="w-4 h-4 flex-shrink-0" />
                    Invite for Assessment
                  </button>
                  {(!canCreateAssessments || availableUnits === 0) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 w-max max-w-[min(14rem,calc(100vw-2rem))] whitespace-normal break-words shadow-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                          <span>
                            {!canCreateAssessments
                              ? assessmentDeniedReason
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

              {showShare && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canShareResume) {
                      return;
                    }
                    openShareModal(resume);
                  }}
                  aria-disabled={!canShareResume}
                  title={!canShareResume ? 'You do not have permission to share resumes' : undefined}
                  icon={<Share2 className="w-4 h-4" />}
                  className={`min-w-0 !whitespace-normal !h-auto min-h-[2.5rem] py-2 text-center leading-snug ${!canShareResume ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Share Resume
                </Button>
              )}

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
              </>
            }
          />
          );
        })}

        {filteredResumes.length === 0 && (
          <ListEmptyState
            icon={Search}
            isNarrowed={search.isNarrowed}
            query={search.appliedQuery}
            entityLabel="scored resume"
            emptyTitle="No Scored Resumes Yet"
            emptyDescription="Score resumes against this job description to see the candidates here."
            onReset={search.reset}
            illustration={<ScoredResumesIllustration />}
            action={onScoreResumesFromEmptyState ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => { if (scoreResumesDisabled) return; onScoreResumesFromEmptyState(); }}
                aria-disabled={!!scoreResumesDisabled}
                title={scoreResumesDisabled ? (scoreResumesDisabledReason ?? 'You do not have permission to score resumes') : undefined}
                icon={<ClipboardList className="w-4 h-4" />}
                className={`${(scoreResumesDisabled ? 'opacity-50 !cursor-not-allowed' : '')} disabled:opacity-50`}
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


      {/* Actions ▸ Download All Scorecards — its "what this does" popup:
          explains the action and lets the user keep / drop each match status
          before anything happens. */}
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
            }
          }}
        />
      )}

      {/* Share Resume — the same dialog the resume table and the resume page
          open: the attachment with an eye to read it, then recipient, subject
          and message. */}
      {shareCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-xl shadow-2xl max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-5">
              <div className="flex items-start justify-between gap-3 mb-6">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden sm:flex w-10 h-10 flex-shrink-0 bg-brand-blue rounded-xl items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="tf-section-title tracking-tight">Share Resume</h2>
                    <p className="tf-body-muted">The selected candidate&rsquo;s resume will be shared with the recipient via email.</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeShareModal}
                 
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Both files this dialog can send, side by side: the resume
                    itself and the scorecard for this job. */}
                <div>
                  <label className="block tf-label mb-1">Attachments</label>
                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-brand-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Until the resume record answers, the file's name is
                            not known — the candidate is, so lead with that. */}
                        <div className="tf-row-name truncate" title={shareFile?.name}>
                          {shareFile ? shareFile.name : 'Loading resume file…'}
                        </div>
                        <div className="tf-meta truncate">
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
                        className="flex-shrink-0"
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
                          className="tf-row-name truncate"
                          title={`Scorecard - ${shareCandidate.candidateName}.pdf`}
                        >
                          Scorecard - {shareCandidate.candidateName}.pdf
                        </div>
                        <div className="tf-meta truncate">
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
                        className="flex-shrink-0"
                        aria-label={`View ${shareCandidate.candidateName}'s scorecard`}
                        title="View scorecard"
                      >
                        {loadingScorecardPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block tf-label mb-1">
                    Recipient Email <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="tf-input px-4"
                  />
                </div>

                <div>
                  <label className="block tf-label mb-1">Subject</label>
                  <input
                    type="text"
                    value={shareSubject}
                    onChange={(e) => setShareSubject(e.target.value)}
                    placeholder="Email subject"
                    className="tf-input px-4"
                  />
                </div>

                <div>
                  <label className="block tf-label mb-1">Message</label>
                  <textarea
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    placeholder="Enter your message"
                    rows={8}
                    className="tf-textarea px-4 py-2.5 resize-none"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-6 pt-4 border-t border-gray-100">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSendShareEmail}
                  disabled={isSendingEmail || !shareEmail.trim()}
                  icon={isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  className="w-full sm:w-auto"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-3 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="hidden sm:flex w-10 h-10 rounded-xl bg-brand-blue items-center justify-center shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="tf-section-title sm:text-lg tracking-tight truncate">Scorecard</h2>
                  <p className="tf-body-muted truncate">
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
                      return;
                    }
                    handleDownloadScorecard(shareCandidate.id);
                  }}
                  disabled={downloadingId === shareCandidate.id}
                  aria-disabled={!canDownloadScorecard}
                  title={!canDownloadScorecard ? 'You do not have permission to download the scorecard' : undefined}
                  className={`${(!canDownloadScorecard ? 'opacity-50 cursor-not-allowed' : '')} disabled:opacity-50`}
                  icon={<Download className="w-4 h-4" />}
                >
                  <span className="hidden sm:inline">Download</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeScorecardPreview}
                 
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
        <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-6 border-b border-gray-200 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="hidden sm:flex w-11 h-11 rounded-full bg-blue-50 items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 id="bulk-action-title" className="tf-section-title sm:text-lg">{info.title}</h3>
              <p className="tf-body-muted mt-1">{rows.length} selected</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          <div className="p-4 bg-blue-50/60 rounded-xl flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="tf-body">
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
                        <span className="tf-row-title tabular-nums">{counts[b]}</span>
                      </span>
                      {lockedReason && counts[b] > 0 && (
                        <span className="block mt-1 tf-meta">{lockedReason}</span>
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

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 px-4 py-4 sm:px-6 border-t border-gray-200 shrink-0">
          <p className="tf-body-secondary">
            <span className="font-semibold text-gray-900">{chosen.length}</span> of {rows.length} will be included
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3 sm:ml-auto">
            <Button variant="secondary" size="md" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
            <Button
              variant="primary"
              size="md"
              disabled={chosen.length === 0 || busy}
              onClick={() => void onConfirm(chosen)}
              icon={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              className="w-full sm:w-auto"
            >
              {info.continueLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
