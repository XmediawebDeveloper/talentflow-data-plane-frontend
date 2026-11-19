'use client';

import { SCORE_CELL_TEXT } from '@/lib/utils/score';
import { StickyBulkBar } from '@/components/ui/sticky-bulk-bar';
import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import ListToolbar from '@/components/ui/list-toolbar';
import { FilterChipsPanelLine, type FilterChip } from '@/components/ui/filter-chips';
import ListEmptyState from '@/components/ui/list-empty-state';
import TabEmptyState from '@/components/ui/tab-empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import ToolbarSelectAll from '@/components/ui/toolbar-select-all';
import { SortByControl, PhoneSortMenu } from '@/components/ui/select-all-menu';
import { JOB_TAB_FILTER_GRID_CLASS, JOB_TAB_FILTER_FIELD_CLASS, JOB_TAB_FILTER_LABEL_CLASS, JOB_TAB_FILTER_CONTROL_CLASS } from '@/components/ScoredResumesTable';
import FilterSelect from '@/components/ui/filter-select';

/* FilterSelect trigger classes matching the filter bar's other controls:
   the job tab's 36px field, or the standalone bar's compact field. */
const RESULTS_JOB_TAB_TRIGGER_CLASS = 'w-full sm:w-full data-[size=default]:h-9 sm:data-[size=default]:h-9 py-0 sm:py-0 px-3 sm:px-3 rounded-lg sm:rounded-lg text-black dark:text-slate-50 hover:border-brand-blue/40';
const RESULTS_FILTER_TRIGGER_CLASS = 'w-full sm:w-full px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg text-black';
import type { InviteCandidate } from '@/components/talent-match-invite/inviteVersions';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import TimelineStamps from '@/components/ui/timeline-stamps';
import InviteStatusChip, { type InviteStatusKind } from '@/components/ui/invite-status-chip';
import { capitalizedCase } from '@/lib/utils/candidateNameDisplay';
import { MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import { DateField } from '@/components/ui/date-field';
import SearchableSelect from '@/components/ui/searchable-select';
import { tabPill } from '@/components/ui/filter-pills';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ResultRowActions, { isPhoneWidth, useCanDownloadAIReports, AI_REPORT_DOWNLOAD_DENIED, isForbiddenError } from './ResultRowActions';
import { downloadSessionReport, downloadSessionReports, canTryReport, NoReportError } from './evaluation-dashboard/downloadSessionReport';
import { getProctoringRisk } from './proctoringRisk';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  ChevronLeft, ChevronRight, ChevronDown, Eye, Loader2,
  Users, CheckCircle, Clock, Mail, XCircle, AlertTriangle,
  Ban, SlidersHorizontal, FileDown, FileText, FileSpreadsheet, Download,
  Play, MoreVertical, X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import RowInviteItems from '@/components/talent-match-invite/RowInviteItems';
import { useInviteDialog } from '@/components/talent-match-invite/InviteDialogProvider';
import { ROW_ACTION_BUTTON_CLASS, ROW_MENU_CONTENT_CLASS, ROW_MENU_ITEM_CLASS, RowDetailsPanel, RowDetailsToggle } from '@/components/ResultRowDetails';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewInvitationListResponse } from '@/lib/services/aiInterviewService';
import { formatIST, parseIST } from '@/lib/utils/dateUtils';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import ColumnCustomizationModal from '@/components/ColumnCustomizationModal';
import ExportColumnsModal from '@/components/ExportColumnsModal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { INVITE_SOURCE_FILTER_OPTIONS, RESULT_FILTER_OPTIONS } from './ColumnFilterFields';
import { InviteSourceValue, inviteSourceLabel, isRevocableInvite, isExpiredForActions, displayInviteScore, inviteResult, matchesInviteResultFilter, ResultBadge, InviteTimelineLines, hasMoreTimelineHistory, loadInterviewHistory } from '@/components/AIInterviewInviteTable';
import { RESULTS_TIMELINE_LIMIT, TimelineHistoryDialog, ViewHistoryButton } from '@/components/ui/timeline-history-dialog';
import ResendLinkModal from '@/components/recruitment/ResendLinkModal';
import RevokeLinkModal from '@/components/recruitment/RevokeLinkModal';

interface AIInterviewResultsProps {
  configId: string;
  configTitle?: string;
  jdTitle?: string;
  /** The job's short id (e.g. "JD-151"), shown before the title in the header. */
  jdShortId?: string;
  onBack: () => void;
  /** Overrides the default AI Interviews trail. Set when these results are
   *  opened from a JD's Job Details page, so the breadcrumb stays anchored to
   *  that job instead of resetting to the AI Interviews trail. */
  breadcrumbItems?: BreadcrumbCrumb[];
  /** When true, render only the results content (stats + filters + table),
   *  without the page <main>/breadcrumb/back-button chrome. Used when the
   *  results view is embedded as a tab inside the interview details page. */
  embedded?: boolean;
  /** Shows the status cards (Total, Invited, Completed …) even when
   *  embedded — the interview details page's Results tab, so it reads like
   *  the standalone results page and the Track popup. Defaults to !embedded;
   *  Job Details leaves it off, having counts of its own. */
  showStats?: boolean;
  /** Opened for ONE version (a version row's View Results, or a version's
   *  own details page): every row shares that job and interview version, so
   *  the Job Version / Interview Version columns, filters and export columns
   *  are left out. */
  hideVersionDetails?: boolean;
  /** Opened from a job's own details page: the job version is already fixed
   *  by the page, so the Job Version column and filter are left out while
   *  Interview Version stays. */
  hideJobVersion?: boolean;
  /** The interview's job is disabled: results stay viewable, but the bulk
   *  Revoke / Resend actions are withheld until the job is enabled again. */
  readOnly?: boolean;
  /** How a candidate's name is SHOWN in the table rows and cards (Job Details:
   *  first name capitalised). Display only — search, sort, filters and exports
   *  keep the name as it is; other hosts leave it unset. */
  formatCandidateName?: (name: string) => string;
  /** When provided (embedded case), clicking a candidate opens their details
   *  inline via this callback (passing the session id and the ordered list of
   *  currently-visible session ids for Prev/Next) instead of navigating to the
   *  standalone results-details route. Keeps the breadcrumb anchored to the
   *  interview details page the user came from. */
  onViewCandidate?: (sessionId: string, navIds: string[]) => void;
  /**
   * Page-level actions (Job Details: the Invite button) placed right after
   * More Filters, so they stay on the toolbar whatever the list holds.
   */
  toolbarActions?: React.ReactNode;
  /**
   * Action for the nobody-invited-yet empty state. Separate from
   * `toolbarActions` because the two want different sets: the toolbar shows
   * Send Invite always (disabled until it can be used), while the empty state
   * only includes it once an interview exists to invite people to.
   */
  emptyStateAction?: React.ReactNode;
  /** The nobody-has-a-result-yet state's supporting line; unset = default. */
  emptyStateText?: string;
  /**
   * The linked job's version and this interview config's own ordinal among
   * every config authored against that job (oldest first) — the same two
   * numbers the All Interviews table and Version History panel show. Every
   * row here belongs to the same config, so the value is constant down the
   * column. Pass these when the host already has them (the interview
   * details page's embedded Results tab does); omitted, this component
   * resolves them itself.
   */
  jobVersion?: number;
  interviewVersion?: number;
  /**
   * Opened from a job row's Result on the AI Interviews list: every interview
   * version of that job, each with its job / interview version — the same
   * scope the row's Track popup covers. The list, cards and export merge all
   * of them, and each row shows its own versions. Unset for one interview.
   */
  jobScope?: ResultsJobScopeEntry[] | null;
  /**
   * When provided (embedded in Job Details), the search / More Filters toolbar
   * portals into this node — the tab-navigation card's toolbar slot — with its
   * own card chrome dropped, so the controls read as the tab card's second row.
   * All toolbar state stays local. Optional; the standalone results page leaves
   * it unset and the toolbar renders inline in its own card as before.
   */
  toolbarPortal?: HTMLElement | null;
  /** Job Details: adds the AI Talent Match tab's "Create / Send Assessment"
   *  and "Create / Send AI Interview" to the selection Actions menu, handing
   *  the ticked candidates to the host's version popup of that type
   *  (VersionInviteDialog). Other hosts leave it unset. */
  onOpenInviteDialog?: (kind: 'assessment' | 'interview', candidates: InviteCandidate[]) => void;
  /** Job Details: told the table's record count (every page, current filters)
   *  whenever a load lands, so the tab badge shows the number the table lists. */
  onTotalItemsChange?: (total: number) => void;
}

/** One interview version of a job-wide results list. */
export type ResultsJobScopeEntry = { configId: string; jobVersion: number; interviewVersion: number };

/* A job-wide list's rows are stamped with the version they came from. */
type ScopedSession = AIInterviewResponse & { _config_id?: string; _jd_version?: number; _interview_version?: number };

/* Toggleable table columns (Actions always shows). Same Customize Columns
 * modal the resume scoring All Resumes tab uses. */
const RESULT_COLUMNS = [
  { id: 'candidate', label: 'Candidate' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'status', label: 'Status' },
  { id: 'score', label: 'Score' },
  { id: 'result', label: 'Result' },
  { id: 'proctoring', label: 'Proctoring Risk' },
  { id: 'inviteSource', label: 'Invite Source' },
  { id: 'cid', label: 'CID' },
  { id: 'jobVersion', label: 'Job Version' },
  { id: 'interviewVersion', label: 'Interview Version' },
] as const;
type ResultColumnId = (typeof RESULT_COLUMNS)[number]['id'];

/* Job versions blue, interview versions cyan — same two colours the All
 * Interviews table and the Interview/Assessment Version History panels use
 * for the same roles, so a V3 means the same thing wherever it's read. */
function VersionPill({ kind, version }: { kind: 'job' | 'interview'; version: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 ${
        kind === 'job'
          ? 'text-brand-blue bg-brand-blue/10 ring-brand-blue/20'
          : 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20'
      }`}
    >
      V{version}
    </span>
  );
}

export function getStatusBadge(status: string) {
  switch (status) {
    case 'completed': return 'bg-success-subtle text-success ring-1 ring-success-line';
    case 'in_progress': return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
    case 'invited': return 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20';
    case 'expired': return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
    case 'terminated': return 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line';
    case 'cancelled': return 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line';
    case 'revoked': return 'bg-slate-200 text-gray-700 ring-1 ring-gray-300';
    default: return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
  }
}

// Canonical status → shared Badge variant (single source of truth so a status
// reads the same colour everywhere it is shown).
export function getStatusVariant(status: string): 'success' | 'warning' | 'info' | 'destructive' | 'muted' {
  switch (status) {
    case 'completed': return 'success';
    case 'in_progress': return 'info';
    case 'invited': return 'info';
    case 'terminated':
    case 'cancelled': return 'destructive';
    case 'expired':
    default: return 'muted';
  }
}

export function getStatusLabel(status: string) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in_progress': return 'In Progress';
    case 'invited': return 'Invited';
    case 'expired': return 'Expired';
    case 'terminated': return 'Terminated';
    case 'cancelled': return 'Cancelled';
    case 'revoked': return 'Revoked';
    default: return status;
  }
}

/** Mirrors AIInviteStatusBadge in AIInterviewInviteTable.tsx: the timeout monitor
 *  stamps closing_reason 'time_limit: …' when it auto-finalizes an abandoned
 *  session and the tracking modal renders "(Auto)" for it. Same rule here so the
 *  results list and the tracking modal never disagree about the same row. */
export function isAutoCompleted(session: any): boolean {
  if (session?.status !== 'completed') return false;
  const reason = (session?.ai_evaluation?.closing_reason || '').toString().toLowerCase();
  return reason.startsWith('time_limit');
}

/** A session's status in the shared invite-status look (InviteStatusChip). */
const SESSION_STATUS_KIND: Record<string, InviteStatusKind> = {
  completed: 'completed', in_progress: 'in_progress', invited: 'invited', terminated: 'terminated',
  cancelled: 'cancelled', expired: 'expired', revoked: 'revoked',
};
export function SessionStatusChip({ session }: { session: any }) {
  const kind = SESSION_STATUS_KIND[session?.status];
  const auto = isAutoCompleted(session);
  return kind
    ? <InviteStatusChip kind={kind} auto={auto} title={auto ? 'Auto-completed when the interview duration elapsed' : undefined} />
    : <InviteStatusChip kind="other" label={getStatusLabel(session?.status)} />;
}

export function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle className="w-4 h-4 text-success" />;
    case 'in_progress': return <Clock className="w-4 h-4 text-brand-orange-deep" />;
    case 'invited': return <Mail className="w-4 h-4 text-brand-blue" />;
    case 'terminated': return <Ban className="w-4 h-4 text-destructive" />;
    case 'cancelled': return <XCircle className="w-4 h-4 text-destructive" />;
    case 'expired': return <XCircle className="w-4 h-4 text-gray-400" />;
    default: return <Mail className="w-4 h-4 text-gray-400" />;
  }
}

// Moved to ./proctoringRisk so the PDF report shows the same level as this column.
export { getProctoringRisk };

export function formatDuration(session: AIInterviewResponse): string {
  if (!session.started_at || !session.completed_at) return '—';
  // Parse with parseIST so the duration uses the SAME absolute instants as the
  // Started At / Completed At columns. Raw `new Date()` treats a tz-less backend
  // string as browser-local, which desyncs the diff from the displayed times.
  const start = parseIST(session.started_at).getTime();
  const end = parseIST(session.completed_at).getTime();
  const diffMs = end - start;
  if (diffMs <= 0) return '—';
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/** The Status dropdown: the states a result can be in, All Statuses by default.
 *  "All Statuses" is those three together — never Invited / Expired /
 *  Revoked, which have no result to show. */
const RESULT_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'terminated', label: 'Terminated' },
];
const DEFAULT_RESULT_STATUS = 'all';
/** The More Filters score inputs — the shared h-9 filter chrome. */
const SCORE_INPUT_CLASS = 'w-full min-w-0 h-9 px-3 text-sm text-black dark:text-slate-100 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg transition-colors hover:border-brand-blue/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue';
/** What "All Statuses" combines (the server filters one status at a time). */
const RESULT_STATUSES = new Set(['in_progress', 'completed', 'terminated']);
const isResultStatus = (v: unknown) => RESULT_STATUS_OPTIONS.some((o) => o.value === v);

export default function AIInterviewResults({ configId, configTitle, jdTitle, jdShortId, embedded = false, showStats, hideVersionDetails = false, hideJobVersion = false, readOnly = false, onViewCandidate, breadcrumbItems, toolbarActions, emptyStateAction, emptyStateText, jobVersion: jobVersionProp, interviewVersion: interviewVersionProp, jobScope, toolbarPortal, formatCandidateName, onOpenInviteDialog, onTotalItemsChange }: AIInterviewResultsProps) {
  const scoped = !!jobScope && jobScope.length > 0;
  /* Every name in Capitalized Case (the invite trackers' rule), after the host's own formatter. */
  const showName = (name?: string | null) => capitalizedCase(formatCandidateName && name ? formatCandidateName(name) : name);
  const router = useRouter();
  // Export is RBAC-gated (`ai_interview:export`, also enforced by the audit
  // endpoint) — greyed with the reason when missing, never hidden.
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = isTenantAdmin || hasPermissionCode('ai_interview:export');
  const EXPORT_DENIED = 'You do not have permission to export AI interviews';
  const [sessions, setSessions] = useState<AIInterviewResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalSessions, setTotalSessions] = useState(0);
  /* The host's record-count listener, in a ref so an inline callback does not
     change loadSessions' identity (and re-fetch) on every host render. */
  const onTotalItemsChangeRef = useRef(onTotalItemsChange);
  onTotalItemsChangeRef.current = onTotalItemsChange;
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    /* The server's count, before the Source / Result / Score Range filters
       applied here — so the Total card never drops to 0 because a Pass or
       Fail pick matched nothing. */
    total: 0,
    /** Every invite for the interview, any status. */
    all: 0,
    invited: 0,
    completed: 0,
    inProgress: 0,
    terminated: 0,
    expired: 0,
    revoked: 0,
  });

  // Only resolved here when the host didn't already have them (the
  // standalone /results route) — see `resolveVersions` below.
  const [resolvedJobVersion, setResolvedJobVersion] = useState<number | undefined>(undefined);
  const [resolvedInterviewVersion, setResolvedInterviewVersion] = useState<number | undefined>(undefined);
  const jobVersion = jobVersionProp ?? resolvedJobVersion;
  const interviewVersion = interviewVersionProp ?? resolvedInterviewVersion;

  useEffect(() => {
    // A job-wide list reads each row's versions off the row itself.
    if (scoped) return;
    if (jobVersionProp !== undefined && interviewVersionProp !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const own = await aiInterviewService.get(configId);
        if (cancelled) return;
        setResolvedJobVersion(own.jd_version ?? undefined);
        if (!own.jd_id) {
          setResolvedInterviewVersion(1);
          return;
        }
        // Same "fetch every config, bucket by jd_id, sort oldest first" the
        // All Interviews table and the interview details page's own
        // sibling lookup use — there is no list-by-jd_id endpoint.
        const { live, archived } = await aiInterviewService.listAllConfigsSplit();
        if (cancelled) return;
        const siblings = [...live, ...archived].filter((c) => c.jd_id === own.jd_id);
        const sorted = siblings.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        const idx = sorted.findIndex((c) => c.id === own.id);
        setResolvedInterviewVersion(idx >= 0 ? idx + 1 : 1);
      } catch {
        if (!cancelled) setResolvedInterviewVersion(1);
      }
    })();
    return () => { cancelled = true; };
  }, [configId, jobVersionProp, interviewVersionProp, scoped]);

  const [showFilters, setShowFilters] = useState(false);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');
  /* Below lg (phones / tablets) List view shows the cards, one per row, as
     Scored Resumes does — the table only fits from lg. */
  const [belowLg, setBelowLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setBelowLg(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  /* Sort — the toolbar's Sort by control, matching the AI Talent Match
     reference. Default (date desc = newest first) mirrors the server's own
     order; any other choice is applied client-side over the full fetched set
     (see sortActive / sortSessions / pageBySource), since this list's API has
     no sort parameter. */
  const [sortField, setSortField] = useState<'name' | 'score' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  // With a Source filter the list is fetched whole and paged here (see
  // pageBySource); this caps that one request.
  const SOURCE_FETCH_LIMIT = 1000;

  // Local text so a partial edit doesn't get clobbered by currentPage until Enter/blur commits it.
  const [goToPage, setGoToPage] = useState(String(currentPage));
  useEffect(() => {
    setGoToPage(String(currentPage));
  }, [currentPage]);
  const commitGoToPage = () => {
    const page = Math.round(Number(goToPage));
    if (Number.isFinite(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    } else {
      setGoToPage(String(currentPage));
    }
  };

  // Row selection for Export. Keyed by session id and holding the session
  // itself: the list is server-paginated, so a row picked on page 1 is no
  // longer in `sessions` once the user moves to page 2.
  const [selected, setSelected] = useState<Map<string, AIInterviewResponse>>(() => new Map());
  const { open: openInvite } = useInviteDialog();
  /* Actions › Create / Send Assessment | AI Interview: the ticked candidates
     (one per email) into the invite popup — the host's (Job Details), else
     the shared one, for their job when they share one. */
  const inviteSelected = (kind: 'assessment' | 'interview') => {
    const rows = [...selected.values()];
    const seen = new Set<string>();
    const candidates: InviteCandidate[] = rows
      .filter((r) => r.candidate_email)
      .filter((r) => { const k = r.candidate_email!.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((r) => ({ id: r.resume_id || r.id, name: r.candidate_name || '', email: r.candidate_email!, resumeId: r.resume_id }));
    if (onOpenInviteDialog) { onOpenInviteDialog(kind, candidates); return; }
    const jdIds = [...new Set(rows.map((r) => r.jd_id).filter(Boolean))] as string[];
    openInvite({
      kind,
      job: jdIds.length === 1 ? { jdId: jdIds[0], jdTitle: jdTitle || '', jdCode: jdShortId || undefined, versionNumber: jobVersion } : undefined,
      candidates,
      onSent: () => setSelected(new Map()),
    });
  };
  const toggleSelected = (session: AIInterviewResponse) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(session.id)) next.delete(session.id);
      else next.set(session.id, session);
      return next;
    });

  // Search and filters live in the shared hook. This view queries the SERVER,
  // so `appliedQuery` matters twice over: it keeps one request per pause rather
  // than per keystroke, and it is what the request is built from.
  const search = useListSearch({
    initialFilters: { status: DEFAULT_RESULT_STATUS, scoreMin: '', scoreMax: '', dateFrom: '', dateTo: '', jobVersion: '', interviewVersion: '', inviteSource: '', result: '' },
    onChange: () => setCurrentPage(1),
    // Score min/max is one logical range filter, and so is the date range.
    // Job Version has no control in Job Details (toolbarPortal), so a
    // restored value is neither counted nor applied there.
    countFilters: (f) =>
      [f.scoreMin || f.scoreMax, f.dateFrom || f.dateTo, !toolbarPortal && f.jobVersion, f.interviewVersion, f.inviteSource,
        /* Embedded, Status sits in More Filters. */
        !!toolbarPortal && f.status !== DEFAULT_RESULT_STATUS].filter(Boolean).length,
  });

  /* Opening a candidate and coming back (breadcrumb or browser Back) remounts
     this view — restore its page, search, filters and view, per interview, so
     the user lands where they left off, not on page 1. Page is applied last:
     restoring the search and filters calls onChange, which resets it to 1. */
  // Phones open on the cards — the table's dozen columns only scroll
  // sideways there. Before the restore below, which still wins on larger
  // screens; the toggle switches back to the table any time.
  // Job Details (portaled) opens on List even on phones — below lg List is the
  // compact list cards there, not the table — and restores a saved choice.
  useEffect(() => {
    if (isPhoneWidth() && !portaled) setDisplayMode('grid');
  }, []);
  useListStatePersistence(
    scoped ? `ai-interview-results:job:${configId}` : `ai-interview-results:${configId}`,
    { currentPage, query: search.query, filters: search.filters, displayMode },
    (s) => {
      if (typeof s.query === 'string' && s.query) search.setQuery(s.query);
      if (s.filters && typeof s.filters === 'object') {
        const restored = { ...search.filters, ...s.filters };
        if (!isResultStatus(restored.status)) restored.status = DEFAULT_RESULT_STATUS;
        search.setFilters(restored);
      }
      if ((s.displayMode === 'list' || s.displayMode === 'grid') && (portaled || !isPhoneWidth())) setDisplayMode(s.displayMode);
      if (typeof s.currentPage === 'number' && s.currentPage >= 1) setCurrentPage(s.currentPage);
    },
  );
  const {
    status: statusFilter,
    scoreMin,
    scoreMax,
    dateFrom,
    dateTo,
    jobVersion: jobVersionFilter,
    interviewVersion: interviewVersionFilter,
    inviteSource: sourceFilter,
    result: resultFilter,
  } = search.filters;

  /* Score, Score Range and Result all follow the AI Interview rule — the
     Must-Have Skills % (displayInviteScore), 60% or above is a Pass — the
     same figures every other AI Interview list shows. The server's
     score_min/max filters the legacy blended score instead, so Score Range
     is applied here, like Source and Result, which have no server filter. */
  /* A non-default sort (anything but newest-first) is applied over the full
     fetched set, so it forces the client-paged path even when the server could
     otherwise page this list itself (a specific status, no other filter). */
  const sortActive = !(sortField === 'date' && sortDirection === 'desc');
  /* A job-wide list merges several interviews' rows, so it is always paged here. */
  const needsClientFilter = !!(scoped || sourceFilter || resultFilter || scoreMin !== '' || scoreMax !== '' || statusFilter === 'all' || sortActive);
  const matchesClientFilters = useCallback((s: AIInterviewResponse) => {
    if (statusFilter === 'all' && !RESULT_STATUSES.has(String(s.status))) return false;
    if (sourceFilter && (s as any).invite_source !== sourceFilter) return false;
    const score = displayInviteScore(s);
    if (!matchesInviteResultFilter(s, score, resultFilter)) return false;
    if (scoreMin !== '' && (score == null || score < parseFloat(scoreMin))) return false;
    if (scoreMax !== '' && (score == null || score > parseFloat(scoreMax))) return false;
    return true;
  }, [sourceFilter, resultFilter, scoreMin, scoreMax, statusFilter]);

  /* The Sort by control, over the full fetched set. Name A→Z, Must-Have
     Skills % (displayInviteScore), or date (completed, else started, else
     invited). Nulls sort last whichever direction. */
  const sortSessions = useCallback((list: AIInterviewResponse[]) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    const dateKey = (s: AIInterviewResponse) =>
      new Date(s.completed_at || s.started_at || s.created_at || 0).getTime();
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = (a.candidate_name || '').localeCompare(b.candidate_name || '');
      } else if (sortField === 'score') {
        const sa = displayInviteScore(a);
        const sb = displayInviteScore(b);
        // Missing scores always sort to the bottom, regardless of direction.
        if (sa == null && sb == null) cmp = 0;
        else if (sa == null) return 1;
        else if (sb == null) return -1;
        else cmp = sa - sb;
      } else {
        cmp = dateKey(a) - dateKey(b);
      }
      return dir * cmp;
    });
  }, [sortField, sortDirection]);

  const requestParams = useMemo(() => ({
    search: search.appliedQuery || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    /* Source (email / resume) has no server-side filter, so with one set the
       whole matching list is fetched and filtered and paged here — see
       pageBySource. */
    page: needsClientFilter ? 1 : currentPage,
    page_size: needsClientFilter ? SOURCE_FETCH_LIMIT : PAGE_SIZE,
    compact: true,
  }), [search.appliedQuery, statusFilter, dateFrom, dateTo, currentPage, needsClientFilter]);

  /* The interviews this list reads: the job's versions that pass the Job
     Version / Interview Version filters, or null for a single interview. */
  const scopeTargets = useMemo(() => (scoped
    ? jobScope!.filter((entry) =>
      (!jobVersionFilter || String(entry.jobVersion) === jobVersionFilter)
      && (!interviewVersionFilter || String(entry.interviewVersion) === interviewVersionFilter))
    : null), [scoped, jobScope, jobVersionFilter, interviewVersionFilter]);

  /* One list call — for a job-wide list, the same call against every interview
     in scope, rows stamped with their versions and the counts summed, as the
     job row's Track popup does. */
  const fetchInvitations = useCallback(async (params: typeof requestParams): Promise<AIInterviewInvitationListResponse> => {
    if (!scopeTargets) return aiInterviewService.getConfigInvitations(configId, params);
    const lists = await Promise.all(scopeTargets.map((entry) =>
      aiInterviewService.getConfigInvitations(entry.configId, params).then((res) => ({
        ...res,
        items: (res.items || []).map((s): ScopedSession => ({
          ...s,
          _config_id: entry.configId,
          _jd_version: entry.jobVersion,
          _interview_version: entry.interviewVersion,
        })),
      }))));
    const sum = (pick: (res: AIInterviewInvitationListResponse) => number | undefined) =>
      lists.reduce((acc, res) => acc + (pick(res) || 0), 0);
    return {
      ...(lists[0] ?? {}),
      items: lists.flatMap((res) => res.items),
      total: sum((res) => res.total),
      completed: sum((res) => res.completed),
      in_progress: sum((res) => res.in_progress),
      terminated: sum((res) => res.terminated),
      cancelled: sum((res) => res.cancelled),
      total_pages: 1,
    } as AIInterviewInvitationListResponse;
  }, [scopeTargets, configId]);

  /* The rows, total and page count to show for one list response: the
     server's own page as it is, or — with a Source filter — this page of the
     rows from that source, so the pagination and counts describe what is
     actually listed. */
  const pageBySource = useCallback((res: AIInterviewInvitationListResponse) => {
    if (!needsClientFilter) {
      return { items: res.items, total: res.total, pages: Math.max(1, res.total_pages || 1) };
    }
    const matching = sortSessions(res.items.filter(matchesClientFilters));
    const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    const page = Math.min(currentPage, pages);
    return { items: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length, pages };
  }, [needsClientFilter, matchesClientFilters, currentPage, sortSessions]);

  /* Bumped by every loadSessions run. A response from an older run (a filter
     or page changed while it was in flight), or a 5s poll that started before
     the latest load, is dropped instead of overwriting newer rows and cards. */
  const loadSeqRef = useRef(0);
  const loadSessions = useCallback(async (): Promise<void> => {
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    setIsLoading(true);
    try {
      // The aggregate response reports completed/in_progress/terminated but
      // not expired/revoked — same gap the AI Interviews page's own tracker
      // has, filled the same way: a dedicated page_size-1 probe per status,
      // scoped by the same search/date params so the cards stay in step with
      // an active search rather than always reading the whole config.
      const [result, expiredProbe, revokedProbe, invitedProbe, allProbe]: [AIInterviewInvitationListResponse, AIInterviewInvitationListResponse, AIInterviewInvitationListResponse, AIInterviewInvitationListResponse, AIInterviewInvitationListResponse] = await Promise.all([
        fetchInvitations(requestParams),
        fetchInvitations({ ...requestParams, status: 'expired', page: 1, page_size: 1 }),
        fetchInvitations({ ...requestParams, status: 'revoked', page: 1, page_size: 1 }),
        fetchInvitations({ ...requestParams, status: 'invited', page: 1, page_size: 1 }),
        // Every invite, whatever its status — decides "nobody invited yet".
        fetchInvitations({ ...requestParams, status: undefined, page: 1, page_size: 1 }),
      ]);
      if (isStale()) return;
      const shown = pageBySource(result);
      // A restored page past the end (rows removed since) — step back to the
      // last real page; that change re-runs this load.
      if (currentPage > shown.pages) {
        setCurrentPage(shown.pages);
        return;
      }
      setSessions(shown.items);
      setTotalSessions(shown.total);
      onTotalItemsChangeRef.current?.(shown.total);
      setTotalPages(shown.pages);
      setSummary({
        total: result.total || 0,
        all: allProbe.total || 0,
        invited: invitedProbe.total || 0,
        completed: result.completed || 0,
        inProgress: result.in_progress || 0,
        terminated: result.terminated || 0,
        expired: expiredProbe.total || 0,
        revoked: revokedProbe.total || 0,
      });
    } catch (error: any) {
      if (isStale()) return;
      showErrorToast(error, "Couldn't load candidate sessions", { id: 'ai-interview-results-load', retry: () => { void loadSessions(); } });
    } finally {
      // A stale run leaves the spinner to the run that replaced it.
      if (!isStale()) setIsLoading(false);
    }
  }, [fetchInvitations, requestParams, pageBySource, currentPage]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-refresh every 5s while any session is in_progress (live monitoring)
  useEffect(() => {
    const hasLive = sessions.some((s) => s.status === 'in_progress');
    if (!hasLive) return;
    const id = setInterval(() => {
      // Polls don't bump the counter (that would strand loadSessions' spinner);
      // they only check it, so a load started after this poll wins.
      const seq = loadSeqRef.current;
      Promise.all([
        fetchInvitations(requestParams),
        fetchInvitations({ ...requestParams, status: 'expired', page: 1, page_size: 1 }),
        fetchInvitations({ ...requestParams, status: 'revoked', page: 1, page_size: 1 }),
        fetchInvitations({ ...requestParams, status: 'invited', page: 1, page_size: 1 }),
        // Every invite, whatever its status — decides "nobody invited yet".
        fetchInvitations({ ...requestParams, status: undefined, page: 1, page_size: 1 }),
      ])
        .then(([r, expiredProbe, revokedProbe, invitedProbe, allProbe]) => {
          if (seq !== loadSeqRef.current) return;
          const shown = pageBySource(r);
          setSessions(shown.items);
          setTotalSessions(shown.total);
          onTotalItemsChangeRef.current?.(shown.total);
          setTotalPages(shown.pages);
          setSummary({
            total: r.total || 0,
            all: allProbe.total || 0,
            invited: invitedProbe.total || 0,
            completed: r.completed || 0,
            inProgress: r.in_progress || 0,
            terminated: r.terminated || 0,
            expired: expiredProbe.total || 0,
            revoked: revokedProbe.total || 0,
          });
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [sessions, fetchInvitations, requestParams, pageBySource]);

  // The hook's `onChange` returns to page 1 whenever the query or a filter moves.
  // Job/interview version are properties of this config, not of each row, so
  // the version filters narrow client-side against the resolved versions.
  // A job-wide list already narrowed which interviews it read (scopeTargets).
  const versionMatches = scoped || (
    (!jobVersionFilter || !!toolbarPortal || String(jobVersion) === jobVersionFilter) &&
    (!interviewVersionFilter || String(interviewVersion) === interviewVersionFilter));
  const paginatedSessions = versionMatches ? sessions : [];
  /* A row's versions: its own on a job-wide list, else this interview's. */
  const rowJobVersion = (s: AIInterviewResponse) => (s as ScopedSession)._jd_version ?? jobVersion;
  const rowInterviewVersion = (s: AIInterviewResponse) => (s as ScopedSession)._interview_version ?? interviewVersion;
  /* The Job Version / Interview Version filter choices: every version in a
     job-wide list, else this interview's single one. */
  const versionChoices = (pick: (entry: ResultsJobScopeEntry) => number, own: number | undefined) =>
    scoped
      ? Array.from(new Set(jobScope!.map(pick))).sort((a, b) => a - b)
      : own != null ? [own] : [];
  const jobVersionChoices = versionChoices((entry) => entry.jobVersion, jobVersion);
  const interviewVersionChoices = versionChoices((entry) => entry.interviewVersion, interviewVersion);

  // No candidate has been invited to this interview yet. The search box, status
  // dropdown and More Filters would all be narrowing nothing, so the whole bar
  // comes off and the empty state carries the actions instead. A search or
  // filter that happens to match nothing is NOT this case — the bar has to stay
  // put so it can be cleared. `isNarrowed` covers search and More Filters;
  // the status cards and the toolbar Result dropdown aren't in its count,
  // so they're checked here too — otherwise a Pass / Fail pick (or a status
  // card) with no matches hid the whole bar and left no way back.
  // "Nothing to list" means no result sessions (In Progress / Completed /
  // Terminated) — not no invitations: invited-only candidates never appear in
  // this list, so counting them showed "No candidates match" with no filter on.
  const resultSessionCount = summary.completed + summary.inProgress + summary.terminated;
  const isUnstarted = !isLoading && sessions.length === 0 && !search.isNarrowed && !resultFilter
    && !search.appliedQuery && statusFilter === 'all' && resultSessionCount === 0;

  // Without the version columns in the list at all, the table, the Customize
  // Columns modal and the export all drop them together.
  const [columns, setColumns] = useState(() => RESULT_COLUMNS
    .filter((c) => !hideVersionDetails || (c.id !== 'jobVersion' && c.id !== 'interviewVersion'))
    .filter((c) => !hideJobVersion || c.id !== 'jobVersion')
    .map((c) => ({ id: c.id as string, label: c.label as string, enabled: true })));
  const [showColumnModal, setShowColumnModal] = useState(false);
  /** The row whose Timeline "View History" is open. */
  const [historyFor, setHistoryFor] = useState<AIInterviewResponse | null>(null);
  const enabledColumns = columns.filter((c) => c.enabled);
  const col = (id: ResultColumnId) => columns.some((c) => c.id === id && c.enabled);
  /* Embedded in Job Details the table follows the AI Talent Match table:
     these columns leave the main row for the row's expanded details panel
     (row click / ▾), so the table fits without a sideways scroll. */
  const DETAIL_COLUMN_IDS: ResultColumnId[] = ['timeline', 'inviteSource', 'cid', 'jobVersion'];
  const DETAIL_COLUMN_LABEL: Partial<Record<ResultColumnId, string>> = {
    timeline: 'Timeline', inviteSource: 'Invite Source', cid: 'CID', jobVersion: 'Job Version',
  };
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const toggleRowExpanded = (id: string) =>
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* ⋮ › Download Report — ResultRowActions' download, from the menu. */
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  // ai_interview:download_report — the row ⋮ item and the bulk Download PDF Reports.
  const canDownloadReports = useCanDownloadAIReports();
  const handleDownloadReport = async (sessionId: string) => {
    if (!canDownloadReports) return;
    setDownloadingReportId(sessionId);
    try {
      await downloadSessionReport(sessionId);
    } catch (err) {
      if (err instanceof NoReportError) {
        toast.warning('No report yet — it is available once the interview is evaluated.');
        return;
      }
      console.error('[AIInterviewResults] report download failed:', err);
      showErrorToast(err, "Couldn't download the report", isForbiddenError(err)
        ? { description: AI_REPORT_DOWNLOAD_DENIED }
        : { retry: () => { void handleDownloadReport(sessionId); } });
    } finally {
      setDownloadingReportId(null);
    }
  };

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');
  const [isExporting, setIsExporting] = useState(false);

  // One export cell per column; Timeline splits into its three parts so each
  // lands in its own spreadsheet column. `ids` = the Export popup's ticked
  // columns, taken in the table's column order.
  const exportColumnsOf = (ids: string[]) => columns.filter((c) => ids.includes(c.id));
  const exportHeaders = (ids: string[]): string[] =>
    exportColumnsOf(ids).flatMap((c) => (
      c.id === 'timeline' ? ['Started At', 'Completed At', 'Duration']
      // Email lives under the name on screen, but stays its own spreadsheet column.
      : c.id === 'candidate' ? ['Candidate', 'Email']
      : [c.label]
    ));
  const exportRow = (session: AIInterviewResponse, ids: string[]): string[] =>
    exportColumnsOf(ids).flatMap((c): string[] => {
      switch (c.id) {
        case 'cid': return [session.candidate_cid || ''];
        case 'candidate': return [session.candidate_name || '', session.candidate_email || ''];
        case 'jobVersion': { const v = rowJobVersion(session); return [v != null ? `V${v}` : '']; }
        case 'interviewVersion': { const v = rowInterviewVersion(session); return [v != null ? `V${v}` : '']; }
        case 'inviteSource': return [inviteSourceLabel(session) || ''];
        case 'status': return [getStatusLabel(session.status) + (isAutoCompleted(session) ? ' (Auto)' : '')];
        case 'score': { const score = displayInviteScore(session); return [score != null ? `${score}%` : '']; }
        case 'result': return [inviteResult(session, displayInviteScore(session)) || ''];
        case 'timeline': return [
          session.started_at ? formatIST(session.started_at) : '',
          session.completed_at ? formatIST(session.completed_at) : '',
          session.started_at ? formatDuration(session) : '',
        ];
        case 'proctoring': return [session.status === 'completed' ? getProctoringRisk(session).level : ''];
        default: return [''];
      }
    });

  // Exports the selected rows when any are picked; otherwise every row
  // matching the current search/filters, not just this page.
  // Shared with Download PDFs, so both cover exactly the same candidates.
  const collectExportRows = async (): Promise<AIInterviewResponse[]> => {
    if (selected.size > 0) return Array.from(selected.values());
    if (!versionMatches) return [];
    if (scopeTargets) {
      const res = await fetchInvitations({ ...requestParams, page: 1, page_size: SOURCE_FETCH_LIMIT });
      return sortSessions(res.items.filter(matchesClientFilters));
    }
    const all: AIInterviewResponse[] = [];
    for (let page = 1; ; page += 1) {
      const res = await aiInterviewService.getConfigInvitations(configId, { ...requestParams, page, page_size: 100 });
      all.push(...(needsClientFilter ? res.items.filter(matchesClientFilters) : res.items));
      if (res.items.length < 100 || page >= (res.total_pages || 1)) break;
    }
    return all;
  };

  const handleExport = async (columnIds: string[]) => {
    if (!canExport) return;
    setIsExporting(true);
    try {
      const rows = await collectExportRows();
      if (rows.length === 0) {
        toast.warning('No candidates to export');
        return;
      }
      const headers = exportHeaders(columnIds);
      const data = rows.map((row) => exportRow(row, columnIds));
      const baseName = `${(configTitle || jdTitle || 'AI_Interview').replace(/\s+/g, '_')}_Results_${new Date().toISOString().slice(0, 10)}`;
      let blob: Blob;
      let fileName: string;
      if (exportFormat === 'csv') {
        const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const csv = [headers.map(q).join(','), ...data.map((row) => row.map(q).join(','))].join('\n');
        blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        fileName = `${baseName}.csv`;
      } else {
        const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>table{border-collapse:collapse}th,td{border:1px solid #000;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:bold}</style></head><body><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
        blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        fileName = `${baseName}.xls`;
      }
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      // Audit trail: the file is built here, so record the export server-side.
      void aiInterviewService.logListExport({
        format: exportFormat,
        recordCount: rows.length,
        tab: configId,
        ids: rows.map((row: any) => row.id),
        exportType: 'ai_interview_results',
      });
      toast.success(`Exported ${rows.length} records to ${exportFormat === 'csv' ? 'CSV' : 'Excel'}`);
      setShowExportModal(false);
      // Export done — clear the ticks, which also hides the bulk bar.
      setSelected(new Map());
    } catch (error) {
      showErrorToast(error, "Couldn't export results", { retry: () => { void handleExport(columnIds); } });
    } finally {
      setIsExporting(false);
    }
  };

  /* Bulk Revoke / Resend, driven by the status card — the Track popup's
     rule: the Invited card offers Revoke for the ticked rows that can still be
     revoked, the Expired card offers Resend for the ticked rows a fresh link
     can go to. Shown wherever the cards are, since they decide which applies.
     Ticked rows that do not qualify are left out and the button's count says
     how many will actually be acted on. */
  const showInviteActions = (showStats ?? !embedded) && !readOnly;
  const selectedSessions = Array.from(selected.values());
  const revocableSelected = showInviteActions && statusFilter === 'invited'
    ? selectedSessions.filter(isRevocableInvite) : [];
  const resendableSelected = showInviteActions && statusFilter === 'expired'
    ? selectedSessions.filter((s) => isExpiredForActions(s) && !s.started_at && !s.completed_at) : [];
  const [bulkAction, setBulkAction] = useState<'revoke' | 'resend' | null>(null);
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const runBulkAction = async () => {
    const action = bulkAction;
    const targets = action === 'revoke' ? revocableSelected : resendableSelected;
    if (!action || targets.length === 0) { setBulkAction(null); return; }
    setIsBulkWorking(true);
    let done = 0;
    let failed = 0;
    let firstError: unknown = null;
    const failedSessions: AIInterviewResponse[] = [];
    // One at a time: each resend emails a candidate, and one failure must not
    // stop the rest.
    for (const session of targets) {
      try {
        if (action === 'revoke') await aiInterviewService.revokeInvitation(session.id);
        else await aiInterviewService.sendSessionEmail(session.id, { base_url: window.location.origin });
        done++;
      } catch (err) {
        if (failed === 0) firstError = err;
        failed++;
        failedSessions.push(session);
      }
    }
    if (done > 0) {
      toast.success(action === 'revoke'
        ? `Revoked ${done} invitation${done === 1 ? '' : 's'}.`
        : `New invitation link${done === 1 ? '' : 's'} sent to ${done} candidate${done === 1 ? '' : 's'}.`);
    }
    if (failed > 0) {
      showErrorToast(firstError, `Couldn't ${action === 'revoke' ? 'revoke' : 'resend'} ${failed} invitation${failed === 1 ? '' : 's'}`);
    }
    // Reload first, so the table is already current when the dialog closes
    // and the selection clears (rows no longer flash their old status).
    await loadSessions();
    // Keep only the ones that failed ticked, so a retry acts on them.
    setSelected(new Map(failedSessions.map((s) => [s.id, s])));
    setIsBulkWorking(false);
    setBulkAction(null);
  };

  /* Bulk PDF download — moved inline (rather than the shared
     `DownloadPdfsButton`) so it can live as a menu item inside the Actions
     dropdown alongside Revoke/Resend, matching the AI Talent Match / Scored
     Resumes / Assessments Results reference pattern. Same zip logic and
     toast wording `DownloadPdfsButton` uses. */
  const [downloadingPdfs, setDownloadingPdfs] = useState<{ done: number; total: number } | null>(null);
  const handleDownloadSelectedPdfs = async () => {
    if (!canDownloadReports) return;
    setDownloadingPdfs({ done: 0, total: 0 });
    try {
      const rows = Array.from(selected.values());
      const zipName = `${(configTitle || jdTitle || 'AI_Interview').replace(/\s+/g, '_')}_Reports_${new Date().toISOString().slice(0, 10)}.zip`;
      const { downloaded, skipped, failed } = await downloadSessionReports(
        rows, zipName, (done, total) => setDownloadingPdfs({ done, total }),
      );
      if (downloaded === 0 && failed === 0) {
        toast.warning('No evaluated candidates to download — reports are available once an interview is evaluated.');
      } else if (failed > 0) {
        toast.error(`Downloaded ${downloaded} report${downloaded === 1 ? '' : 's'}; ${failed} could not be generated.`);
      } else if (skipped > 0) {
        toast.success(`Downloaded ${downloaded} report${downloaded === 1 ? '' : 's'}. ${skipped} candidate${skipped === 1 ? ' has' : 's have'} no report yet.`);
      }
      // Download went through — clear the ticks (hides the bulk bar). Kept
      // when nothing downloaded or some reports failed, so the user can retry.
      if (downloaded > 0 && failed === 0) setSelected(new Map());
    } catch (err) {
      console.error('[AIInterviewResults] Bulk PDF download failed:', err);
      showErrorToast(err, "Couldn't download the reports", isForbiddenError(err)
        ? { description: AI_REPORT_DOWNLOAD_DENIED }
        : { retry: () => { void handleDownloadSelectedPdfs(); } });
    } finally {
      setDownloadingPdfs(null);
    }
  };

  const allOnPageSelected = paginatedSessions.length > 0 && paginatedSessions.every((s) => selected.has(s.id));
  const toggleAllOnPage = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) paginatedSessions.forEach((s) => next.delete(s.id));
      else paginatedSessions.forEach((s) => next.set(s.id, s));
      return next;
    });

  const handleViewDetails = (session: AIInterviewResponse) => {
    // Embedded (Results tab inside the interview details page): open the
    // candidate inline so the breadcrumb stays anchored to that page instead
    // of jumping to the standalone results-details route.
    if (onViewCandidate) {
      onViewCandidate(session.id, paginatedSessions.map((s) => s.id));
      return;
    }
    // Persist the currently-visible session order so the details view can offer
    // Previous/Next navigation between candidates (mirrors AssessmentResults).
    // A job-wide list spans interviews: each entry carries its own, and the
    // details page's Back returns to this job-wide list.
    try {
      const navList = paginatedSessions.map((s) => ({ id: s.id, configId: (s as ScopedSession)._config_id }));
      sessionStorage.setItem('aiInterviewResultNavList', JSON.stringify(navList));
    } catch { /* ignore storage failures */ }
    const ownConfigId = (session as ScopedSession)._config_id ?? configId;
    router.push(`/recruitment/ai-interviews/${ownConfigId}/results/details?session_id=${session.id}`
      + (scoped ? `&from=job-results&root=${encodeURIComponent(configId)}` : ''));
  };

  /* Row ⋮ — View Details, Create / Send Assessment | AI Interview for this
     row's candidate, Download Report. Same menu as the Assessment results row;
     the table row and the list card both use it. */
  const renderRowMenu = (session: AIInterviewResponse) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={portaled ? ROW_ACTION_BUTTON_CLASS : 'h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-slate-400 hover:bg-brand-blue/10 hover:text-brand-blue transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/30'}
          aria-label={`Actions for ${session.candidate_name || 'candidate'}`}
          title="Actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={portaled ? ROW_MENU_CONTENT_CLASS : onOpenInviteDialog ? 'w-56' : 'w-48'}>
        <DropdownMenuItem className={portaled ? ROW_MENU_ITEM_CLASS : 'gap-2'} onClick={() => handleViewDetails(session)}>
          <Eye className="w-4 h-4 text-menu-icon-view" />
          <span>View Details</span>
        </DropdownMenuItem>
        {onOpenInviteDialog && (
          <>
            <DropdownMenuSeparator className="my-1 bg-gray-100" />
            <RowInviteItems
              onInvite={(kind) => onOpenInviteDialog(kind, [{
                id: session.resume_id || session.id,
                name: session.candidate_name || '',
                email: session.candidate_email || '',
                resumeId: session.resume_id,
              }])}
            />
            <DropdownMenuSeparator className="my-1 bg-gray-100" />
          </>
        )}
        <DropdownMenuItem
          className={portaled ? ROW_MENU_ITEM_CLASS : 'gap-2'}
          disabled={!canDownloadReports || !canTryReport(session) || downloadingReportId === session.id}
          title={!canDownloadReports ? AI_REPORT_DOWNLOAD_DENIED : !canTryReport(session) ? 'Report available once the interview is evaluated' : undefined}
          onClick={() => handleDownloadReport(session.id)}
        >
          {downloadingReportId === session.id ? (
            <Loader2 className="w-4 h-4 animate-spin text-menu-icon-download" />
          ) : (
            <Download className="w-4 h-4 text-menu-icon-download" />
          )}
          <span>Download Report</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /* Embedded in the Job Details "AI Interview Result" tab (toolbar portals into
     that card's slot). When so, the toolbar controls drop to the 36px height of
     the AI Talent Match reference; the standalone results page keeps 38px. */
  const portaled = !!toolbarPortal;
  /* Embedded, the More Filters labels take the Scored Resumes panel's class;
     standalone keeps its own. */
  const filterLabelClass = portaled ? JOB_TAB_FILTER_LABEL_CLASS : 'block text-sm text-gray-700 dark:text-slate-300 mb-1.5 font-medium';
  const body = (
    <>
      {/* Header — hidden when embedded as a tab (the details page already
          shows the interview title + breadcrumb + back navigation).
          The standalone page relies on the breadcrumb's "AI Interviews" link
          for back navigation, so no separate Back button is rendered. */}
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              {/* JD ID, then the job title — one line. The subtitle that
                  repeated the title underneath is gone. */}
              <h1 className="tf-page-title flex flex-wrap items-center gap-3">
                {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                <span className="min-w-0 break-words">{jdTitle || configTitle || 'AI Interview'}</span>
                {/* One version's results: the table has no version columns, so
                    the title names the version — "App development - V1
                    Interview Version - V1", the Track popup's header. */}
                {hideVersionDetails && (jobVersion != null || interviewVersion != null) && (
                  <span className="flex items-center gap-3 tf-label whitespace-nowrap">
                    {jobVersion != null && (
                      <span className="inline-flex items-center gap-1.5">
                        -
                        <VersionPill kind="job" version={jobVersion} />
                      </span>
                    )}
                    {interviewVersion != null && (
                      <span className="inline-flex items-center gap-1.5">
                        Interview Version -
                        <VersionPill kind="interview" version={interviewVersion} />
                      </span>
                    )}
                  </span>
                )}
              </h1>
              {/* Which versions the list covers — follows the Job Version and
                  Interview Version filters in More Filters. */}
              {!hideVersionDetails && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2 tf-body-muted">
                  <span>{jobVersionFilter ? `Showing JD V${jobVersionFilter}` : 'Showing all JD versions'}</span>
                  <span className="text-gray-300 dark:text-slate-600" aria-hidden>|</span>
                  <span>{interviewVersionFilter ? `Showing Interview V${interviewVersionFilter}` : 'Showing all Interview versions'}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats — standalone page only. Embedded as the Job Details "AI Interview
          Result" tab, the summary cards are dropped: that page already carries
          its own counts and Quick Actions, and the tab leads with the candidate
          table instead. */}

      {/* Search + Filter bar — when `toolbarPortal` is set (the Job Details
          tab-navigation card slot), the block portals there with its card
          chrome dropped so it reads as the tab card's second row; otherwise it
          renders inline inside its own card exactly as before. */}
      {!isUnstarted && (() => {
        /* Sort by — field + direction drive sortSessions over the full
           fetched set; a change returns to page 1. Row 1 embedded, row 2
           standalone. */
        const sortControl = (
          <SortByControl<typeof sortField>
            value={sortField}
            order={sortDirection}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'score', label: 'Score' },
              { value: 'date', label: 'Completed' },
            ]}
            onChange={(v) => { setSortField(v); setCurrentPage(1); }}
            onToggleOrder={() => { setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc')); setCurrentPage(1); }}
          />
        );
        /* Active filter tags — one per filter `countFilters` counts (the
           score range and the completion-date range are one tag each; Result
           is the toolbar's own dropdown, not counted, so no tag). Job Version
           only standalone and Status only embedded, as the count has them. */
        const formatChipDate = (v: string) => {
          const d = new Date(`${v}T00:00:00`);
          return Number.isNaN(d.getTime())
            ? v
            : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        };
        const cf = search.filters;
        const activeFilterChips: FilterChip[] = ([
          portaled && cf.status !== DEFAULT_RESULT_STATUS && {
            key: 'status', label: 'Status',
            value: RESULT_STATUS_OPTIONS.find((o) => o.value === cf.status)?.label ?? cf.status,
            onRemove: () => search.setFilter('status', DEFAULT_RESULT_STATUS),
          },
          (cf.scoreMin || cf.scoreMax) && {
            key: 'score', label: 'Score Range',
            value: cf.scoreMin && cf.scoreMax ? `${cf.scoreMin}% – ${cf.scoreMax}%`
              : cf.scoreMin ? `from ${cf.scoreMin}%` : `up to ${cf.scoreMax}%`,
            onRemove: () => search.setFilters({ ...cf, scoreMin: '', scoreMax: '' }),
          },
          (cf.dateFrom || cf.dateTo) && {
            key: 'completed', label: 'Completed',
            value: cf.dateFrom && cf.dateTo ? `${formatChipDate(cf.dateFrom)} – ${formatChipDate(cf.dateTo)}`
              : cf.dateFrom ? `from ${formatChipDate(cf.dateFrom)}` : `until ${formatChipDate(cf.dateTo)}`,
            onRemove: () => search.setFilters({ ...cf, dateFrom: '', dateTo: '' }),
          },
          !portaled && cf.jobVersion && { key: 'jobVersion', label: 'Job Version', value: `V${cf.jobVersion}`, onRemove: () => search.setFilter('jobVersion', '') },
          cf.interviewVersion && { key: 'interviewVersion', label: 'Interview Version', value: `V${cf.interviewVersion}`, onRemove: () => search.setFilter('interviewVersion', '') },
          cf.inviteSource && {
            key: 'inviteSource', label: 'Source',
            value: INVITE_SOURCE_FILTER_OPTIONS.find((o) => o.value === cf.inviteSource)?.label ?? cf.inviteSource,
            onRemove: () => search.setFilter('inviteSource', ''),
          },
        ] as (FilterChip | false | '')[]).filter(Boolean) as FilterChip[];
        const toolbarBlock = (
        /* Standalone, phones (globals.css, `.tf-jobs-toolbar`): the Job Openings
           list's lines — search · filter icon, Result, Invite, Columns · Export,
           the status tabs (underlined), then Select All · Sort · List / Grid —
           as the AI Assessment results page. Embedded in Job Details: unchanged. */
        <div className={toolbarPortal ? '' : 'tf-jobs-toolbar tf-card p-3 sm:p-4 mb-4'}>
        <ListToolbar
          searchValue={search.query}
          onSearchChange={search.setQuery}
          // The hook debounces into `appliedQuery`, so keystrokes pass through.
          searchDebounceMs={0}
          searchPlaceholder="Search by name, email, or CID..."
          /* Embedded in Job Details: the AI Talent Match reference's Select All
             pill + dropdown at the head of the row (the standalone page keeps its
             table-header checkbox and shows nothing here). The list is
             server-paginated, so the dropdown offers this page + clear only — no
             cross-page "select all", which it can't fulfil. */
          beforeSearch={portaled ? (
            <>
              <ToolbarSelectAll
                selectedCount={selected.size}
                allSelected={allOnPageSelected}
                pageCount={paginatedSessions.length}
                pageSelected={allOnPageSelected}
                onSelectPage={() =>
                  setSelected((prev) => {
                    const next = new Map(prev);
                    paginatedSessions.forEach((s) => next.set(s.id, s));
                    return next;
                  })
                }
                onDeselectPage={() =>
                  setSelected((prev) => {
                    const next = new Map(prev);
                    paginatedSessions.forEach((s) => next.delete(s.id));
                    return next;
                  })
                }
                onClear={() => setSelected(new Map())}
              />
            </>
          ) : undefined}
          // Six controls beside the search — lay out by the toolbar's own
          // width, since beside the details page's nav it's far narrower
          // than the screen. In Job Details it takes the AI Talent Match
          // row's layout (List / Grid pinned right), which also carries
          // Select All and Actions, so it goes single-line only once the tab
          // card is 64rem wide — below that the search takes its own row
          // instead of shrinking to an icon.
          fitToContainer
          containerBreakpoint={portaled ? '5xl' : '4xl'}
          trailing={portaled ? <ListViewToggle value={displayMode} onChange={setDisplayMode} className="h-9 [&>button]:p-2 [&_svg]:w-4 [&_svg]:h-4" /> : undefined}
          onToggleFilters={() => setShowFilters((v) => !v)}
          filtersOpen={showFilters}
          activeFilterCount={search.activeFilterCount}
          filtersApplied={search.filtersApplied}
          /* Reset — on every view, Job Details included (the Job Openings
             reference): search + every filter back to the defaults. */
          onClearFilters={search.reset}
          compactButtons={portaled}
          /* Standalone: the Job Openings (JD) page's two-row toolbar. Row 1
             (this ListToolbar): Search → Result → More Filters → Customize
             Columns → Export. Row 2 (below the panel): Select All → Actions →
             status pills → Sort by → List / Grid. Embedded in Job Details:
             the AI Talent Match row as before. */
          /* Status is in More Filters when embedded, to make room here. */
          afterFiltersActions={toolbarActions && !portaled ? <div className="tf-jobs-invite contents">{toolbarActions}</div> : toolbarActions}
          leadingActions={
            <>
              {portaled ? (
                <ToolbarFilterSelect
                  value={resultFilter}
                  onChange={(value) => search.setFilter('result', value)}
                  ariaLabel="Result"
                >
                  <option value="">All Results</option>
                  {RESULT_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </ToolbarFilterSelect>
              ) : (
                /* Inline with Search, as Location / Industry are on the Job
                   Openings page. */
                <div className="tf-jobs-filter-pills contents">
                <SearchableSelect
                  className="w-full sm:w-44"
                  value={resultFilter}
                  onChange={(v) => search.setFilter('result', v)}
                  options={RESULT_FILTER_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label }))}
                  allLabel="All Results"
                  placeholder="All Results"
                  searchPlaceholder="Search result..."
                  ariaLabel="Filter by result"
                />
                </div>
              )}
              {portaled && sortControl}
            </>
          }
          /* Embedded, the row keeps ListToolbar's own `mb-3` (the AI Talent
             Match reference's gap) so it doesn't sit flush on the tab card's
             bottom edge — the Job Details toolbar slot has no bottom padding. */
          className={portaled ? undefined : 'mb-0'}
          /* Active filter tags: hover popup on More Filters (lg+). */
          filterChips={activeFilterChips}
        >
          {/* Customize Columns / Export — standalone only as buttons;
              embedded in Job Details they are items in the Actions pill. */}
          {!portaled && (
            <div className="tf-jobs-actions-line contents">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowColumnModal(true)}
              icon={<SlidersHorizontal className="w-4 h-4" />}
              className="whitespace-nowrap !h-[38px] !text-sm"
            >
              <span className="hidden md:inline">Customize Columns</span>
              <span className="md:hidden">Columns</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { if (canExport) setShowExportModal(true); }}
              aria-disabled={!canExport || undefined}
              title={canExport ? undefined : EXPORT_DENIED}
              icon={<FileDown className="w-4 h-4" />}
              className={`whitespace-nowrap !h-[38px] !text-sm ${canExport ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
              Export{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
            </div>
          )}
        </ListToolbar>

        {/* Actions + Clear — embedded in Job Details: their own full-width
            row under the toolbar once a row is ticked. Inside `beforeSearch`
            they shared a shrink-wrapped box with Select All and wrapped out
            of line; h-9 matches the toolbar band. Holds Customize Columns and
            Export plus the bulk ops — Revoke / Resend / Download PDF Reports. */}
        {portaled && selected.size > 0 && (
          <StickyBulkBar className="tf-tb-bulk mb-3 flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none animate-in fade-in slide-in-from-top-1 duration-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                  aria-label={`Actions for ${selected.size} selected`}
                >
                  <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                  </span>
                  {isBulkWorking || downloadingPdfs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Actions ({selected.size})
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                  {selected.size.toLocaleString()} selected
                </div>
                <DropdownMenuItem
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExport ? 'cursor-pointer' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                  aria-disabled={!canExport || undefined}
                  title={canExport ? undefined : EXPORT_DENIED}
                  onSelect={(e) => {
                    if (!canExport) { e.preventDefault(); return; }
                    setShowExportModal(true);
                  }}
                >
                  <FileDown className={`w-4 h-4 ${canExport ? 'text-menu-icon-download' : 'text-gray-300'}`} />
                  <span>Export</span>
                </DropdownMenuItem>
                {revocableSelected.length > 0 && (
                  <DropdownMenuItem
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer text-destructive"
                    disabled={isBulkWorking}
                    onSelect={() => setBulkAction('revoke')}
                  >
                    <Ban className="w-4 h-4" />
                    <span>Revoke ({revocableSelected.length})</span>
                  </DropdownMenuItem>
                )}
                {resendableSelected.length > 0 && (
                  <DropdownMenuItem
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer"
                    disabled={isBulkWorking}
                    onSelect={() => setBulkAction('resend')}
                  >
                    <Mail className="w-4 h-4 text-menu-icon-score" />
                    <span>Resend ({resendableSelected.length})</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canDownloadReports ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 text-gray-400'}`}
                  disabled={!!downloadingPdfs}
                  aria-disabled={!canDownloadReports || undefined}
                  title={canDownloadReports ? undefined : AI_REPORT_DOWNLOAD_DENIED}
                  onSelect={(e) => { if (!canDownloadReports) { e.preventDefault(); return; } handleDownloadSelectedPdfs(); }}
                >
                  <Download className={`w-4 h-4 ${canDownloadReports ? 'text-menu-icon-download' : 'text-gray-300'}`} />
                  <span>
                    {downloadingPdfs
                      ? (downloadingPdfs.total > 1 ? `Preparing ${downloadingPdfs.done}/${downloadingPdfs.total}…` : 'Preparing…')
                      : 'Download PDF Reports'}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-gray-100" />
                <RowInviteItems onInvite={inviteSelected} />
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              title="Clear the selection"
              className="h-9 px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </StickyBulkBar>
        )}

        {/* Bulk Revoke / Resend confirmations — the Track popup's wording and
            colours: red for revoke, brand blue for resend. */}
        <RevokeLinkModal
          isOpen={bulkAction === 'revoke'}
          kind="interview"
          bulk={{ scope: 'selected', count: revocableSelected.length }}
          targets={revocableSelected.map((s) => ({ jobCode: jdShortId, jobTitle: jdTitle, version: (s as ScopedSession)._interview_version ?? interviewVersion, email: s.candidate_email }))}
          onCancel={() => { if (!isBulkWorking) setBulkAction(null); }}
          onConfirm={runBulkAction}
          isLoading={isBulkWorking}
        />
        <ResendLinkModal
          isOpen={bulkAction === 'resend'}
          kind="interview"
          bulk={{ count: resendableSelected.length }}
          targets={resendableSelected.map((s) => ({ jobCode: jdShortId, jobTitle: jdTitle, version: (s as ScopedSession)._interview_version ?? interviewVersion, email: s.candidate_email }))}
          onCancel={() => { if (!isBulkWorking) setBulkAction(null); }}
          onConfirm={runBulkAction}
          isLoading={isBulkWorking}
        />

        {/* Expanded filters — each field filters the list the moment it
            changes (no Done step); Reset in the toolbar clears them all. */}
        {showFilters && portaled && (
          /* pb-4 when embedded — the reference panel's bottom inset, off the
             tab card's border. Embedded it is the AI Talent Match tab's panel
             (JOB_TAB_FILTER_*): its 1 / 2 / 4-column grid, labels and 36px
             inputs; no completion dates. */
          <div className={`mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10${portaled ? ' pb-4' : ''}`}>
          <div className={portaled ? JOB_TAB_FILTER_GRID_CLASS : 'flex flex-wrap gap-x-6 gap-y-4'}>
            {/* Status — off the toolbar row, to make room for Invite there. */}
            <div className={JOB_TAB_FILTER_FIELD_CLASS}>
              <label className={filterLabelClass}>Status</label>
              <FilterSelect
                value={statusFilter}
                onChange={(v) => search.setFilter('status', v)}
                ariaLabel="Status"
                className={RESULTS_JOB_TAB_TRIGGER_CLASS}
                options={RESULT_STATUS_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label }))}
              />
            </div>
            <div className={portaled ? JOB_TAB_FILTER_FIELD_CLASS : 'flex-1 min-w-0 basis-[240px]'}>
              <label className={filterLabelClass}>Score Range (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  min={0}
                  max={100}
                  value={search.filters.scoreMin}
                  onChange={(e) => search.setFilter('scoreMin', e.target.value)}
                  className={portaled ? `${JOB_TAB_FILTER_CONTROL_CLASS} min-w-0` : "w-full min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"}
                />
                <span className="tf-body-muted">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={100}
                  value={search.filters.scoreMax}
                  onChange={(e) => search.setFilter('scoreMax', e.target.value)}
                  className={portaled ? `${JOB_TAB_FILTER_CONTROL_CLASS} min-w-0` : "w-full min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"}
                />
              </div>
            </div>
            {!portaled && (
              <div className="flex-[1.4] min-w-0 basis-full sm:basis-[320px]">
                <label className={filterLabelClass}>Completion Date</label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <DateField
                    aria-label="Completion date from"
                    value={search.filters.dateFrom}
                    onChange={(v) => search.setFilter('dateFrom', v)}
                    className="sm:flex-1 sm:min-w-0"
                  />
                  <span className="tf-hint text-center sm:text-left sm:flex-shrink-0">to</span>
                  <DateField
                    aria-label="Completion date to"
                    value={search.filters.dateTo}
                    onChange={(v) => search.setFilter('dateTo', v)}
                    className="sm:flex-1 sm:min-w-0"
                  />
                </div>
              </div>
            )}
            {!hideVersionDetails && (
            <>
            {!hideJobVersion && !portaled && (
            <div className={portaled ? JOB_TAB_FILTER_FIELD_CLASS : 'flex-1 min-w-0 basis-[180px]'}>
              <label className={filterLabelClass}>Job Version</label>
              <FilterSelect
                value={search.filters.jobVersion}
                onChange={(v) => search.setFilter('jobVersion', v)}
                ariaLabel="Job Version"
                className={portaled ? RESULTS_JOB_TAB_TRIGGER_CLASS : RESULTS_FILTER_TRIGGER_CLASS}
                options={[{ value: '', label: 'All job versions' }, ...jobVersionChoices.map((v) => ({ value: String(v), label: `V${v}` }))]}
              />
            </div>
            )}
            <div className={portaled ? JOB_TAB_FILTER_FIELD_CLASS : 'flex-1 min-w-0 basis-[180px]'}>
              <label className={filterLabelClass}>Interview Version</label>
              <FilterSelect
                value={search.filters.interviewVersion}
                onChange={(v) => search.setFilter('interviewVersion', v)}
                ariaLabel="Interview Version"
                className={portaled ? RESULTS_JOB_TAB_TRIGGER_CLASS : RESULTS_FILTER_TRIGGER_CLASS}
                options={[{ value: '', label: 'All interview versions' }, ...interviewVersionChoices.map((v) => ({ value: String(v), label: `V${v}` }))]}
              />
            </div>
            </>
            )}
            <div className={portaled ? JOB_TAB_FILTER_FIELD_CLASS : 'flex-1 min-w-0 basis-[180px]'}>
              <label className={filterLabelClass}>Source</label>
              <FilterSelect
                value={search.filters.inviteSource}
                onChange={(v) => search.setFilter('inviteSource', v)}
                ariaLabel="Source"
                className={portaled ? RESULTS_JOB_TAB_TRIGGER_CLASS : RESULTS_FILTER_TRIGGER_CLASS}
                options={[
                  { value: '', label: 'All sources' },
                  ...INVITE_SOURCE_FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
                ]}
              />
            </div>
          </div>

          {/* Active filter tags — the panel's last line (phones / tablets). */}
          <FilterChipsPanelLine chips={activeFilterChips} />
          </div>
        )}
        {/* Standalone: the Job Openings (JD) page's panel — a divider and a
            1 / 2 / 4-column grid of its searchable selects and date fields,
            between the two rows. Each field applies as it changes; the
            toolbar's Reset clears them all. */}
        {showFilters && !portaled && (
          <div className="tf-jobs-filter-panel mt-3 pt-3 border-t border-brand-blue/10">
            <div className="tf-grid-4 [&>div]:min-w-0">
              <div>
                <label className={filterLabelClass}>Score Range (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    min={0}
                    max={100}
                    value={search.filters.scoreMin}
                    onChange={(e) => search.setFilter('scoreMin', e.target.value)}
                    aria-label="Minimum score"
                    className={SCORE_INPUT_CLASS}
                  />
                  <span className="tf-body-muted">to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    min={0}
                    max={100}
                    value={search.filters.scoreMax}
                    onChange={(e) => search.setFilter('scoreMax', e.target.value)}
                    aria-label="Maximum score"
                    className={SCORE_INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <label className={filterLabelClass}>Completed From</label>
                <DateField
                  aria-label="Completed From"
                  value={search.filters.dateFrom}
                  max={search.filters.dateTo || undefined}
                  onChange={(v) => search.setFilter('dateFrom', v)}
                />
              </div>
              <div>
                <label className={filterLabelClass}>Completed To</label>
                <DateField
                  aria-label="Completed To"
                  value={search.filters.dateTo}
                  min={search.filters.dateFrom || undefined}
                  onChange={(v) => search.setFilter('dateTo', v)}
                />
              </div>
              {!hideVersionDetails && !hideJobVersion && !portaled && (
                <div>
                  <label className={filterLabelClass}>Job Version</label>
                  <SearchableSelect
                    value={search.filters.jobVersion}
                    onChange={(v) => search.setFilter('jobVersion', v)}
                    options={jobVersionChoices.map((v) => ({ value: String(v), label: `V${v}` }))}
                    allLabel="All job versions"
                    placeholder="All job versions"
                    searchPlaceholder="Search version..."
                    ariaLabel="Job Version"
                  />
                </div>
              )}
              {!hideVersionDetails && (
                <div>
                  <label className={filterLabelClass}>Interview Version</label>
                  <SearchableSelect
                    value={search.filters.interviewVersion}
                    onChange={(v) => search.setFilter('interviewVersion', v)}
                    options={interviewVersionChoices.map((v) => ({ value: String(v), label: `V${v}` }))}
                    allLabel="All interview versions"
                    placeholder="All interview versions"
                    searchPlaceholder="Search version..."
                    ariaLabel="Interview Version"
                  />
                </div>
              )}
              <div>
                <label className={filterLabelClass}>Source</label>
                <SearchableSelect
                  value={search.filters.inviteSource}
                  onChange={(v) => search.setFilter('inviteSource', v)}
                  options={INVITE_SOURCE_FILTER_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                  allLabel="All sources"
                  placeholder="All sources"
                  searchPlaceholder="Search source..."
                  ariaLabel="Source"
                />
              </div>
            </div>
            <FilterChipsPanelLine chips={activeFilterChips} />
          </div>
        )}

        {/* Standalone row 2 — the Job Openings page's: Select All, the bulk
            Actions once a row is ticked, the status pills, then Sort by and
            List / Grid at the row's end. */}
        {!portaled && (
          <div className="tf-jobs-row2 flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
            <div className="tf-jobs-select">
            <ToolbarSelectAll
              selectedCount={selected.size}
              allSelected={allOnPageSelected}
              pageCount={paginatedSessions.length}
              pageSelected={allOnPageSelected}
              onSelectPage={() =>
                setSelected((prev) => {
                  const next = new Map(prev);
                  paginatedSessions.forEach((s) => next.set(s.id, s));
                  return next;
                })
              }
              onDeselectPage={() =>
                setSelected((prev) => {
                  const next = new Map(prev);
                  paginatedSessions.forEach((s) => next.delete(s.id));
                  return next;
                })
              }
              onClear={() => setSelected(new Map())}
            />
            </div>
            {selected.size > 0 && (
              <StickyBulkBar className="basis-full order-last flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                    aria-label={`Actions for ${selected.size} selected`}
                  >
                    <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                    </span>
                    {isBulkWorking || downloadingPdfs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Actions ({selected.size})
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                    {selected.size.toLocaleString()} selected
                  </div>
                  {revocableSelected.length > 0 && (
                    <DropdownMenuItem
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer text-destructive"
                      disabled={isBulkWorking}
                      onSelect={() => setBulkAction('revoke')}
                    >
                      <Ban className="w-4 h-4" />
                      <span>Revoke ({revocableSelected.length})</span>
                    </DropdownMenuItem>
                  )}
                  {resendableSelected.length > 0 && (
                    <DropdownMenuItem
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer"
                      disabled={isBulkWorking}
                      onSelect={() => setBulkAction('resend')}
                    >
                      <Mail className="w-4 h-4 text-menu-icon-score" />
                      <span>Resend ({resendableSelected.length})</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canDownloadReports ? 'cursor-pointer' : 'cursor-not-allowed opacity-60 text-gray-400'}`}
                    disabled={!!downloadingPdfs}
                    aria-disabled={!canDownloadReports || undefined}
                    title={canDownloadReports ? undefined : AI_REPORT_DOWNLOAD_DENIED}
                    onSelect={(e) => { if (!canDownloadReports) { e.preventDefault(); return; } handleDownloadSelectedPdfs(); }}
                  >
                    <Download className={`w-4 h-4 ${canDownloadReports ? 'text-menu-icon-download' : 'text-gray-300'}`} />
                    <span>
                      {downloadingPdfs
                        ? (downloadingPdfs.total > 1 ? `Preparing ${downloadingPdfs.done}/${downloadingPdfs.total}…` : 'Preparing…')
                        : 'Download PDF Reports'}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-gray-100" />
                  <RowInviteItems onInvite={inviteSelected} />
                </DropdownMenuContent>
              </DropdownMenu>
                <button
                  type="button"
                  onClick={() => setSelected(new Map())}
                  title="Clear the selection"
                  className="h-9 px-3 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 text-sm whitespace-nowrap bg-brand-blue/5 text-gray-700 border border-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              </StickyBulkBar>
            )}
            {/* Status pills — as the Job Openings page's All Jobs /
                Published / Draft … Same state the dropdown drove. */}
            <div className="tf-jobs-status-tabs contents" role="tablist" aria-label="Result status">
            {RESULT_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => search.setFilter('status', opt.value)}
                role="tab"
                aria-selected={statusFilter === opt.value}
                className={tabPill(statusFilter === opt.value)}
              >
                {opt.label}
              </button>
            ))}
            </div>
            <div className="tf-jobs-trail flex items-center gap-2 sm:ml-auto">
              <div className="tf-jobs-sort contents">{sortControl}</div>
              {/* Phones: the Job Openings list's Sort menu (the inline Sort by hides). */}
              <PhoneSortMenu<typeof sortField>
                value={sortField}
                order={sortDirection}
                options={[
                  { value: 'name', label: 'Name' },
                  { value: 'score', label: 'Score' },
                  { value: 'date', label: 'Completed' },
                ]}
                orderLabels={(f) => (f === 'date'
                  ? { desc: 'Newest first', asc: 'Oldest first' }
                  : f === 'score' ? { desc: 'Highest first', asc: 'Lowest first' } : { desc: 'Z → A', asc: 'A → Z' })}
                onChange={(v) => { setSortField(v); setCurrentPage(1); }}
                onOrderChange={(o) => { setSortDirection(o); setCurrentPage(1); }}
              />
              <ListViewToggle value={displayMode} onChange={setDisplayMode} />
            </div>
          </div>
        )}
        </div>
        );
        return toolbarPortal ? createPortal(toolbarBlock, toolbarPortal) : toolbarBlock;
      })()}

      {/* Table — the card is only drawn once there is something to invite the
          user into. Unstarted, the empty state stands on its own like the AI
          Talent Match tab's does. */}
      <div className={isUnstarted ? '' : 'tf-card overflow-hidden'}>
        {isLoading ? (
          /* Skeleton matches the results table structure (no double border — the
             parent card already provides it) instead of a bare spinner. */
          <TableSkeleton toolbar={false} columns={6} rows={6} className="border-0 shadow-none rounded-none" />
        ) : isUnstarted ? (
          /* Nothing here yet — the shared tab empty state, carrying the actions
             since the toolbar they normally sit in is gone. */
          <TabEmptyState
            // In the Job Details tab the empty state keeps the same outer card
            // the populated table would show; standalone it stands on its own.
            bordered={embedded}
            icon={Users}
            title={emptyStateText ? 'No AI Interview Results Yet' : 'No AI Interview Results'}
            description={emptyStateText ?? (summary.all > 0
              ? 'Results appear here once an invited candidate starts their interview.'
              : 'Invite candidates to this interview to see their sessions here.')}
            action={emptyStateAction ?? undefined}
          />
        ) : paginatedSessions.length === 0 ? (
          /* Records exist, a search or filter just matched none of them. That
             needs the "clear it" exit, not a create-something CTA. */
          <ListEmptyState
            icon={Users}
            isNarrowed
            query={search.appliedQuery}
            entityLabel="candidate"
            emptyTitle="No candidates invited yet"
            emptyDescription="Invite candidates to this interview to see their sessions here."
            onReset={search.reset}
          />
        ) : displayMode === 'grid' ? (
          <>
            <div className="tf-grid-4 p-4">
              {paginatedSessions.map((session) => {
                const risk = getProctoringRisk(session);
                const sc = session.status === 'in_progress' ? session.skill_coverage : undefined;
                const scTotal = sc ? sc.covered.length + sc.medium_covered.length + sc.low_covered.length + sc.uncovered.length : 0;
                const scCoveredPct = sc && scTotal > 0 ? Math.round(((sc.covered.length + sc.medium_covered.length) / scTotal) * 100) : 0;
                const score = displayInviteScore(session);
                const result = inviteResult(session, score);
                const passed = result ? result === 'Pass' : (score ?? 0) >= 60;
                const isSelected = selected.has(session.id);
                return (
                  /* div role="button", not <button>: the card now holds the
                     Download button, and a button can't nest inside one. */
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleViewDetails(session)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewDetails(session); }
                    }}
                    className={`group relative text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 ${gridCardSelectedClass(isSelected)}`}
                  >
                    <GridCardSelect
                      selected={isSelected}
                      onToggle={() => toggleSelected(session)}
                      label={session.candidate_name || 'candidate'}
                      selectionActive={selected.size > 0}
                    />
                    {/* pl-7 keeps the corner select seal off the avatar — it shows on
                        touch, on hover, and on every card once anything is selected. */}
                    <div className="flex items-start gap-2.5 pl-7">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">
                          {showName(session.candidate_name) || 'Unknown'}
                        </p>
                        <p className="tf-meta truncate">
                          {session.candidate_email || '—'}
                        </p>
                      </div>
                      {session.candidate_cid && (
                        <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                          {session.candidate_cid}
                        </span>
                      )}
                    </div>

                    {((col('inviteSource') && inviteSourceLabel(session)) || (col('interviewVersion') && rowInterviewVersion(session) != null)) && (
                      <div className="flex items-center justify-between gap-2 tf-meta">
                        {col('inviteSource') && inviteSourceLabel(session) ? (
                          <InviteSourceValue inv={session} iconClassName="w-3 h-3" />
                        ) : <span />}
                        {col('interviewVersion') && rowInterviewVersion(session) != null && (
                          <span className="inline-flex items-center gap-1 shrink-0">
                            Interview
                            <VersionPill kind="interview" version={rowInterviewVersion(session)!} />
                          </span>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <SessionStatusChip session={session} />
                        {session.status === 'in_progress' && (
                          <span className="tf-badge flex bg-destructive text-white text-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                          </span>
                        )}
                        {session.status === 'completed' && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                            {risk.level} risk
                          </span>
                        )}
                      </div>
                      {/* Mini skill coverage bar for live sessions */}
                      {sc && (
                        <div className="mt-1.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="tf-micro-hint">{sc.questions_asked}/{sc.total_questions} Q</span>
                            <span className="text-2xs text-success font-medium ml-auto">{scCoveredPct}% covered</span>
                          </div>
                          <div className="flex h-1 rounded-full overflow-hidden bg-gray-200 w-full">
                            <div className="bg-success" style={{ width: `${Math.round((sc.covered.length / (scTotal || 1)) * 100)}%` }} />
                            <div className="bg-warning" style={{ width: `${Math.round((sc.medium_covered.length / (scTotal || 1)) * 100)}%` }} />
                            <div className="bg-orange-400" style={{ width: `${Math.round((sc.low_covered.length / (scTotal || 1)) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {score != null && (
                      /* Score panel: a calm neutral number, the verdict pill
                         beside it, and a bar against the 60% pass mark so the
                         distance from passing reads at a glance. */
                      <div className="rounded-lg bg-gray-50 ring-1 ring-gray-100 px-3 py-2.5">
                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="tf-micro-hint uppercase tracking-wide">Score</p>
                            <p className="text-xl font-semibold leading-tight tabular-nums text-gray-900">
                              {score}<span className="text-sm font-medium text-gray-400">%</span>
                            </p>
                          </div>
                          <ResultBadge result={result} />
                        </div>
                        <div className="relative mt-2 h-1.5 rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${passed ? 'bg-success' : 'bg-destructive'}`}
                            style={{ width: `${Math.max(Math.min(score, 100), 2)}%` }}
                          />
                          <span
                            className="absolute -top-0.5 h-2.5 w-px bg-gray-400"
                            style={{ left: '60%' }}
                            title="Pass mark: 60%"
                          />
                        </div>
                      </div>
                    )}

                    <TimelineStamps
                      className="text-gray-500 pt-2 border-t border-gray-100"
                      startedAt={session.started_at} completedAt={session.completed_at} format={formatIST} duration={formatDuration(session)}
                    />

                    {/* View Details + Download Report (the table's button —
                        same permission / not-evaluated rules). */}
                    <div className="flex items-center gap-2">
                      <div
                        onClick={(e) => { e.stopPropagation(); handleViewDetails(session); }}
                        title="View Details"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </div>
                      <div className="shrink-0">
                        <ResultRowActions session={session} onView={() => handleViewDetails(session)} hideView />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : belowLg ? (
          /* List view below lg: one compact row-card per candidate (the shared
             MobileRecordCard), not the Grid cards. Same data as the table row. */
          <div className="tf-record-list p-3">
            {paginatedSessions.map((session) => {
              const risk = getProctoringRisk(session);
              const score = displayInviteScore(session);
              const result = inviteResult(session, score);
              const isSelected = selected.has(session.id);
              return (
                <MobileRecordCard
                  key={session.id}
                  onClick={() => handleViewDetails(session)}
                  selected={isSelected}
                  select={
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(session)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={isSelected ? 'Deselect candidate' : 'Select candidate'}
                      className="tf-checkbox"
                    />
                  }
                  title={
                    /* CID chip right after the name, as on the Assessment Results card. */
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{showName(session.candidate_name) || 'Unknown'}</span>
                      {session.candidate_cid && (
                        <span className="shrink-0 text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded">
                          {session.candidate_cid}
                        </span>
                      )}
                    </span>
                  }
                  badges={
                    <>
                      <SessionStatusChip session={session} />
                      {col('proctoring') && session.status === 'completed' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>{risk.level}</span>
                      )}
                    </>
                  }
                  /* Labelled lines, as on the Assessment Results card. */
                  fields={[
                    { label: 'Email', value: session.candidate_email ? <span className="[overflow-wrap:anywhere]">{session.candidate_email}</span> : null },
                    { label: 'Started', value: session.started_at ? formatIST(session.started_at) : null },
                    { label: 'Completed', value: session.completed_at ? formatIST(session.completed_at) : null },
                    { label: 'Duration', value: formatDuration(session) !== '—' ? formatDuration(session) : null },
                  ]}
                  footer={
                    /* One chip: the score with its Pass / Fail inside ("Score 72% - Pass"). */
                    (col('score') || (col('result') && result)) ? (
                      <MobileStatChip tone={result ? (result === 'Pass' ? 'success' : 'danger') : score == null ? 'neutral' : score >= 60 ? 'success' : 'danger'}>
                        {col('score') && <>Score {score != null ? `${score}%` : '—'}</>}
                        {col('score') && col('result') && result && ' - '}
                        {col('result') && result}
                      </MobileStatChip>
                    ) : undefined
                  }
                  /* ⋮ on the name row, as on the Assessment Results card. */
                  actions={renderRowMenu(session)}
                  actionsOnNameRow
                />
              );
            })}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full text-sm">
                {/* Styled to the AI Talent Match reference table: sticky,
                    bg-gray-50 per cell, light uppercase gray-500 labels with
                    wider tracking, dark mode. */}
                <thead className="sticky top-0 z-10 [&_th]:bg-white dark:[&_th]:bg-slate-900 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
                  <tr>
                    <th className="tf-th-cell text-left w-10 tf-sticky-col-left tf-th">
                      {/* Embedded in Job Details, Select All already lives in
                          the toolbar above (the reference pattern) — this
                          header checkbox would duplicate it, so it's empty
                          there, same as the Scored Resumes table. Standalone
                          (no toolbar Select All) keeps it. */}
                      {!portaled && (
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={toggleAllOnPage}
                          aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                          className="rounded border-gray-300"
                        />
                      )}
                    </th>
                    {col('candidate') && <th className="tf-th-cell text-left tf-th">Candidate</th>}
                    {col('timeline') && <th className="tf-th-cell text-left tf-th">Timeline</th>}
                    {col('status') && <th className="tf-th-cell text-left tf-th">Status</th>}
                    {col('score') && <th className="tf-th-cell text-left tf-th">Score</th>}
                    {col('result') && <th className="tf-th-cell text-left tf-th">Result</th>}
                    {col('proctoring') && <th className="tf-th-cell text-left tf-th">Proctoring Risk</th>}
                    {col('inviteSource') && <th className="tf-th-cell text-left tf-th">Invite Source</th>}
                    {col('cid') && <th className="tf-th-cell text-left tf-th">CID</th>}
                    {col('jobVersion') && <th className="tf-th-cell text-left tf-th">Job Version</th>}
                    {col('interviewVersion') && <th className="tf-th-cell text-left tf-th">Interview Version</th>}
                    {/* Job Details: no ⋮ in the row, so the column only needs
                        the View / Download pair — w-px + px-3 shrink it to that. */}
                    <th className={`text-right ${portaled ? 'w-px px-3' : 'px-4'} py-3 text-xs font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap align-middle tf-sticky-col`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {paginatedSessions.map((session) => {
                    const risk = getProctoringRisk(session);
                    const isExpanded = expandedRowIds.has(session.id);
                    /* Every column is inline now (the AI Interviews Candidate
                       Results table's layout), so nothing moves into an
                       expandable details row. */
                    const detailColumnIds: ResultColumnId[] = [];
                    return (
                      <Fragment key={session.id}>
                      <tr
                        /* Job Details: the row opens / closes its details, as
                           on the AI Talent Match table; ⋮ › View Details opens it. */
                        /* Clicking a row opens the candidate's result, as on the
                           AI Interviews page's Candidate Results table. */
                        onClick={() => handleViewDetails(session)}
                        /* Row styled to the AI Talent Match reference table:
                           plain white/dark rows (no zebra), hover:bg-gray-50,
                           selected tint bg-blue-50. */
                        className={`transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 ${
                          selected.has(session.id) ? 'bg-blue-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900'
                        }`}
                      >
                        <td className="tf-td w-10 tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(session.id)}
                            onChange={() => toggleSelected(session)}
                            aria-label={selected.has(session.id) ? 'Deselect candidate' : 'Select candidate'}
                            className="rounded border-gray-300"
                          />
                        </td>
                        {col('candidate') && (
                          <td className="tf-td">
                            <div className="flex items-center gap-2">
                              {/* Email under the name, as on Track Invites,
                                  rather than a column of its own. */}
                              <div className="min-w-0 max-w-[220px]">
                                <p className="font-medium text-gray-900 truncate" title={showName(session.candidate_name) || 'Unknown'}>
                                  {showName(session.candidate_name) || 'Unknown'}
                                </p>
                                <p className="tf-meta truncate" title={session.candidate_email || undefined}>
                                  {session.candidate_email || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                        )}
                        {col('timeline') && (
                          <td className="tf-td align-top whitespace-nowrap text-gray-600">
                            {/* The Track Invites timeline (Invited, System Check,
                                Started, Completed) plus this table's Duration. */}
                            <InviteTimelineLines inv={session} duration={formatDuration(session)} limit={RESULTS_TIMELINE_LIMIT} />
                            {/* The two latest events above; the whole trail
                                behind View History. */}
                            {hasMoreTimelineHistory(session, RESULTS_TIMELINE_LIMIT) && (
                              <div className="mt-1">
                                <ViewHistoryButton onClick={() => setHistoryFor(session)} />
                              </div>
                            )}
                          </td>
                        )}
                        {col('status') && (
                          <td className="tf-td whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <SessionStatusChip session={session} />
                              {session.status === 'in_progress' && (
                                <span className="tf-badge flex bg-destructive text-white text-2xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  LIVE
                                </span>
                              )}
                            </div>
                            {/* Mini skill coverage bar for live sessions */}
                            {session.status === 'in_progress' && session.skill_coverage && (() => {
                              const sc = session.skill_coverage;
                              const total = sc.covered.length + sc.medium_covered.length + sc.low_covered.length + sc.uncovered.length;
                              const coveredPct = total > 0 ? Math.round(((sc.covered.length + sc.medium_covered.length) / total) * 100) : 0;
                              return (
                                <div className="mt-1.5">
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <span className="tf-micro-hint">{sc.questions_asked}/{sc.total_questions} Q</span>
                                    <span className="text-2xs text-success font-medium ml-auto">{coveredPct}% covered</span>
                                  </div>
                                  <div className="flex h-1 rounded-full overflow-hidden bg-gray-200 w-28">
                                    <div className="bg-success" style={{ width: `${Math.round((sc.covered.length / (total || 1)) * 100)}%` }} />
                                    <div className="bg-warning" style={{ width: `${Math.round((sc.medium_covered.length / (total || 1)) * 100)}%` }} />
                                    <div className="bg-orange-400" style={{ width: `${Math.round((sc.low_covered.length / (total || 1)) * 100)}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        )}
                        {col('score') && (
                          <td className="tf-td whitespace-nowrap">
                            {displayInviteScore(session) != null ? (
                              <span className={`${SCORE_CELL_TEXT} ${displayInviteScore(session)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                                {displayInviteScore(session)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('result') && (
                          <td className="tf-td whitespace-nowrap">
                            {inviteResult(session, displayInviteScore(session)) ? (
                              <ResultBadge result={inviteResult(session, displayInviteScore(session))} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('proctoring') && (
                          <td className="tf-td whitespace-nowrap">
                            {session.status === 'completed' ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                                {risk.level}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('inviteSource') && (
                          <td className="tf-td whitespace-nowrap text-gray-700">
                            {inviteSourceLabel(session)
                              ? <InviteSourceValue inv={session} iconClassName="w-3.5 h-3.5" />
                              : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('cid') && (
                          <td className="tf-td whitespace-nowrap">
                            {session.candidate_cid ? (
                              <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                                {session.candidate_cid}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('jobVersion') && (
                          <td className="tf-td whitespace-nowrap">
                            {rowJobVersion(session) != null ? <VersionPill kind="job" version={rowJobVersion(session)!} /> : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('interviewVersion') && (
                          <td className="tf-td whitespace-nowrap">
                            {rowInterviewVersion(session) != null ? <VersionPill kind="interview" version={rowInterviewVersion(session)!} /> : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        <td className={`${portaled ? 'w-px px-3' : 'px-4'} py-3 text-right whitespace-nowrap tf-sticky-col`} onClick={portaled ? (e) => e.stopPropagation() : undefined}>
                          {/* Row ⋮ — View Details, Create / Send (not in Job
                              Details, where the toolbar's Actions covers the
                              ticked rows), Download Report. Same menu as the
                              Assessment results row. */}
                          <span className="inline-flex align-middle" onClick={(e) => e.stopPropagation()}>
                            {renderRowMenu(session)}
                          </span>
                        </td>
                      </tr>
                      {/* The row's moved columns, in a nested table under it —
                          the AI Talent Match table's expanded-row panel. */}
                      {isExpanded && detailColumnIds.length > 0 && (
                        <RowDetailsPanel
                          colSpan={2 + (['candidate', 'status', 'score', 'result', 'proctoring', 'interviewVersion'] as ResultColumnId[]).filter((id) => col(id)).length}
                          fields={detailColumnIds.map((id) => ({
                            label: DETAIL_COLUMN_LABEL[id] || id,
                            value: id === 'timeline' ? (
                              <div className="text-gray-600">
                                <InviteTimelineLines inv={session} duration={formatDuration(session)} limit={RESULTS_TIMELINE_LIMIT} />
                                {hasMoreTimelineHistory(session, RESULTS_TIMELINE_LIMIT) && (
                                  <div className="mt-1">
                                    <ViewHistoryButton onClick={() => setHistoryFor(session)} />
                                  </div>
                                )}
                              </div>
                            ) : id === 'inviteSource' ? (
                              inviteSourceLabel(session)
                                ? <InviteSourceValue inv={session} iconClassName="w-3.5 h-3.5" />
                                : <span className="text-gray-400">—</span>
                            ) : id === 'cid' ? (
                              session.candidate_cid ? (
                                <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                                  {session.candidate_cid}
                                </span>
                              ) : <span className="text-gray-400">—</span>
                            ) : (
                              rowJobVersion(session) != null ? <VersionPill kind="job" version={rowJobVersion(session)!} /> : <span className="text-gray-400">—</span>
                            ),
                          }))}
                        />
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        </div>

        {/* Pagination — the Job Openings master's bordered-card format
            (shared ListPagination look). A sibling of the table's own card
            now (matching the AI Talent Match reference) instead of being
            duplicated inside each display mode's branch, where its border
            ran straight into the card's own bottom border with no gap.
            Page size is server-fixed here, so there is no "per page"
            selector, but the card, the "Showing X to Y of N" line and the
            Go to / page-nav controls match the master. */}
        {!isLoading && !isUnstarted && paginatedSessions.length > 0 && totalPages > 1 && (
          <div className="tf-panel p-3 sm:p-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="tf-body-secondary max-sm:text-center">
                Showing <span className="font-medium text-gray-900">{((currentPage - 1) * PAGE_SIZE) + 1}</span> to{' '}
                <span className="font-medium text-gray-900">{Math.min(currentPage * PAGE_SIZE, totalSessions)}</span> of{' '}
                <span className="font-medium text-gray-900">{totalSessions}</span> candidates
              </span>
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="tf-body-secondary whitespace-nowrap">Go to</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={goToPage}
                    onChange={(e) => setGoToPage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                        commitGoToPage();
                      }
                    }}
                    onBlur={commitGoToPage}
                    aria-label="Go to page"
                    className="tf-input w-14 px-1.5 text-center rounded-xl"
                  />
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 transition-colors ${
                    currentPage === 1
                      ? 'text-gray-400 opacity-40 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'
                  }`}
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="tf-label whitespace-nowrap px-1">
                  <span className="text-brand-blue font-semibold">{currentPage}</span> / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 transition-colors ${
                    currentPage === totalPages
                      ? 'text-gray-400 opacity-40 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue hover:border-brand-blue/30'
                  }`}
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      {historyFor && (
        <TimelineHistoryDialog
          candidateName={showName(historyFor.candidate_name)}
          candidateEmail={historyFor.candidate_email}
          load={() => loadInterviewHistory(historyFor)}
          onClose={() => setHistoryFor(null)}
        />
      )}

      {showColumnModal && (
        <ColumnCustomizationModal
          columns={columns}
          onClose={() => setShowColumnModal(false)}
          onApply={(ids) => setColumns((prev) => prev.map((c) => ({ ...c, enabled: ids.includes(c.id) })))}
        />
      )}

      {/* Export — the Score Resume tab's popup: format, then the columns to
          include (starting from Customize Columns), then Cancel / Export. */}
      {showExportModal && (
        <ExportColumnsModal<'csv' | 'xls'>
          title="Export Interview Results"
          recordCount={selected.size > 0 ? selected.size : versionMatches ? totalSessions : 0}
          formats={[
            { key: 'csv', title: 'CSV Format', description: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
            { key: 'xls', title: 'Excel Format (.xls)', description: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
          ]}
          format={exportFormat}
          onFormatChange={setExportFormat}
          columns={columns}
          initialColumnIds={enabledColumns.map((c) => c.id)}
          exporting={isExporting}
          onExport={(ids) => void handleExport(ids)}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </>
  );

  if (embedded) return body;

  return (
    <main className="tf-page">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="tf-page-sheet min-h-[calc(100dvh-7rem)]">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={breadcrumbItems ?? [
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'AI Interviews', href: '/recruitment/ai-interviews' },
              // Name the interview these results belong to when we know it.
              { label: configTitle || jdTitle || 'Results' },
            ]}
          />
          {body}
        </div>
      </div>
    </main>
  );
}
