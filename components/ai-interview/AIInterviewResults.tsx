'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import ListToolbar from '@/components/ui/list-toolbar';
import ListEmptyState from '@/components/ui/list-empty-state';
import TabEmptyState from '@/components/ui/tab-empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import ResultRowActions, { DownloadPdfsButton, isPhoneWidth } from './ResultRowActions';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Eye, Loader2,
  Users, CheckCircle, Clock, Mail, XCircle, AlertTriangle, CalendarDays,
  Ban, SlidersHorizontal, FileDown, FileText, FileSpreadsheet, Info, Download, X,
  Square, CheckSquare, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiInterviewService } from '@/lib/services/aiInterviewService';
import type { AIInterviewResponse, AIInterviewInvitationListResponse } from '@/lib/services/aiInterviewService';
import { formatISTDate, formatIST, parseIST } from '@/lib/utils/dateUtils';
import PageBreadcrumb, { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import ColumnCustomizationModal from '@/components/ColumnCustomizationModal';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { INVITE_SOURCE_FILTER_OPTIONS, RESULT_FILTER_OPTIONS } from './ColumnFilterFields';
import { InviteSourceValue, inviteSourceLabel, isRevocableInvite, isExpiredForActions, displayInviteScore, inviteResult, matchesInviteResultFilter, ResultBadge } from '@/components/AIInterviewInviteTable';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

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
  /** When provided (embedded case), clicking a candidate opens their details
   *  inline via this callback (passing the session id and the ordered list of
   *  currently-visible session ids for Prev/Next) instead of navigating to the
   *  standalone results-details route. Keeps the breadcrumb anchored to the
   *  interview details page the user came from. */
  onViewCandidate?: (sessionId: string, navIds: string[]) => void;
  /**
   * Page-level actions (e.g. Create, Send Invite) rendered at the front of the
   * search bar's control group, ahead of More Filters. Lets the embedding page
   * put them in this toolbar instead of a separate strip above it.
   */
  toolbarActions?: React.ReactNode;
  /**
   * Action for the nobody-invited-yet empty state. Separate from
   * `toolbarActions` because the two want different sets: the toolbar shows
   * Send Invite always (disabled until it can be used), while the empty state
   * only includes it once an interview exists to invite people to.
   */
  emptyStateAction?: React.ReactNode;
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
}

/* Toggleable table columns (Actions always shows). Same Customize Columns
 * modal the resume scoring All Resumes tab uses. */
const RESULT_COLUMNS = [
  { id: 'cid', label: 'CID' },
  { id: 'candidate', label: 'Candidate' },
  { id: 'email', label: 'Email' },
  { id: 'jobVersion', label: 'Job Version' },
  { id: 'interviewVersion', label: 'Interview Version' },
  { id: 'inviteSource', label: 'Invite Source' },
  { id: 'status', label: 'Status' },
  { id: 'score', label: 'Score' },
  { id: 'result', label: 'Result' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'proctoring', label: 'Proctoring Risk' },
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
    default: return status;
  }
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

export function getProctoringRisk(session: AIInterviewResponse): { level: string; badge: string } {
  // Prefer server-computed risk_level (persisted at completion time, AIU-82)
  const stored = session.risk_level;
  if (stored) {
    if (stored === 'high')   return { level: 'High',   badge: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line' };
    if (stored === 'medium') return { level: 'Medium', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' };
    if (stored === 'low')    return { level: 'Low',    badge: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' };
    return { level: 'None', badge: 'bg-success-subtle text-success ring-1 ring-success-line' };
  }
  // Fallback: heuristic from raw violations (pre-AIU-82 sessions or incomplete data)
  const violations = session.proctoring_violations || [];
  const severe = violations.filter((v) => v.severity === 'high' || v.severity === 'critical').length;
  const medium = violations.filter((v) => v.severity === 'medium').length;
  if (severe >= 3 || (severe >= 1 && medium >= 2)) return { level: 'High',   badge: 'bg-destructive-subtle text-destructive ring-1 ring-destructive-line' };
  if (severe >= 1 || medium >= 2)                  return { level: 'Medium', badge: 'bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/20' };
  if (violations.length > 0)                       return { level: 'Low',    badge: 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20' };
  return { level: 'None', badge: 'bg-success-subtle text-success ring-1 ring-success-line' };
}

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
/** What "All Statuses" combines (the server filters one status at a time). */
const RESULT_STATUSES = new Set(['in_progress', 'completed', 'terminated']);
const isResultStatus = (v: unknown) => RESULT_STATUS_OPTIONS.some((o) => o.value === v);

export default function AIInterviewResults({ configId, configTitle, jdTitle, jdShortId, embedded = false, showStats, hideVersionDetails = false, onViewCandidate, breadcrumbItems, toolbarActions, emptyStateAction, jobVersion: jobVersionProp, interviewVersion: interviewVersionProp }: AIInterviewResultsProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AIInterviewResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalSessions, setTotalSessions] = useState(0);
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
        const live: AIInterviewResponse[] = [];
        let apiPage = 1;
        for (;;) {
          const batch = await aiInterviewService.listConfigs({ page: apiPage, page_size: 100, compact: true });
          const items = batch.items || [];
          live.push(...items);
          const total = batch.total ?? live.length;
          if (items.length < 100 || live.length >= total) break;
          apiPage += 1;
        }
        const archivedProbe = await aiInterviewService.listConfigs({ status: 'archived', page_size: 1, compact: true });
        const archived = archivedProbe.total > archivedProbe.items.length
          ? (await aiInterviewService.listConfigs({ status: 'archived', page_size: archivedProbe.total, compact: true })).items
          : archivedProbe.items;
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
  }, [configId, jobVersionProp, interviewVersionProp]);

  const [showFilters, setShowFilters] = useState(false);
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('list');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
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
    countFilters: (f) =>
      [f.scoreMin || f.scoreMax, f.dateFrom || f.dateTo, f.jobVersion, f.interviewVersion, f.inviteSource].filter(Boolean).length,
  });

  /* Opening a candidate and coming back (breadcrumb or browser Back) remounts
     this view — restore its page, search, filters and view, per interview, so
     the user lands where they left off, not on page 1. Page is applied last:
     restoring the search and filters calls onChange, which resets it to 1. */
  // Phones open on the cards — the table's dozen columns only scroll
  // sideways there. Before the restore below, which still wins on larger
  // screens; the toggle switches back to the table any time.
  useEffect(() => {
    if (isPhoneWidth()) setDisplayMode('grid');
  }, []);
  useListStatePersistence(
    `ai-interview-results:${configId}`,
    { currentPage, query: search.query, filters: search.filters, displayMode },
    (s) => {
      if (typeof s.query === 'string' && s.query) search.setQuery(s.query);
      if (s.filters && typeof s.filters === 'object') {
        const restored = { ...search.filters, ...s.filters };
        if (!isResultStatus(restored.status)) restored.status = DEFAULT_RESULT_STATUS;
        search.setFilters(restored);
      }
      if ((s.displayMode === 'list' || s.displayMode === 'grid') && !isPhoneWidth()) setDisplayMode(s.displayMode);
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
  const needsClientFilter = !!(sourceFilter || resultFilter || scoreMin !== '' || scoreMax !== '' || statusFilter === 'all');
  const matchesClientFilters = useCallback((s: AIInterviewResponse) => {
    if (statusFilter === 'all' && !RESULT_STATUSES.has(String(s.status))) return false;
    if (sourceFilter && (s as any).invite_source !== sourceFilter) return false;
    const score = displayInviteScore(s);
    if (!matchesInviteResultFilter(s, score, resultFilter)) return false;
    if (scoreMin !== '' && (score == null || score < parseFloat(scoreMin))) return false;
    if (scoreMax !== '' && (score == null || score > parseFloat(scoreMax))) return false;
    return true;
  }, [sourceFilter, resultFilter, scoreMin, scoreMax, statusFilter]);

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

  /* The rows, total and page count to show for one list response: the
     server's own page as it is, or — with a Source filter — this page of the
     rows from that source, so the pagination and counts describe what is
     actually listed. */
  const pageBySource = useCallback((res: AIInterviewInvitationListResponse) => {
    if (!needsClientFilter) {
      return { items: res.items, total: res.total, pages: Math.max(1, res.total_pages || 1) };
    }
    const matching = res.items.filter(matchesClientFilters);
    const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    const page = Math.min(currentPage, pages);
    return { items: matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matching.length, pages };
  }, [needsClientFilter, matchesClientFilters, currentPage]);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      // The aggregate response reports completed/in_progress/terminated but
      // not expired/revoked — same gap the AI Interviews page's own tracker
      // has, filled the same way: a dedicated page_size-1 probe per status,
      // scoped by the same search/date params so the cards stay in step with
      // an active search rather than always reading the whole config.
      const [result, expiredProbe, revokedProbe, invitedProbe, allProbe]: [AIInterviewInvitationListResponse, AIInterviewInvitationListResponse, AIInterviewInvitationListResponse, AIInterviewInvitationListResponse, AIInterviewInvitationListResponse] = await Promise.all([
        aiInterviewService.getConfigInvitations(configId, requestParams),
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: 'expired', page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: 'revoked', page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: 'invited', page: 1, page_size: 1 }),
        // Every invite, whatever its status — decides "nobody invited yet".
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: undefined, page: 1, page_size: 1 }),
      ]);
      const shown = pageBySource(result);
      // A restored page past the end (rows removed since) — step back to the
      // last real page; that change re-runs this load.
      if (currentPage > shown.pages) {
        setCurrentPage(shown.pages);
        return;
      }
      setSessions(shown.items);
      setTotalSessions(shown.total);
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
      toast.error(error.message || 'Failed to load candidate sessions');
    } finally {
      setIsLoading(false);
    }
  }, [configId, requestParams, pageBySource, currentPage]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-refresh every 5s while any session is in_progress (live monitoring)
  useEffect(() => {
    const hasLive = sessions.some((s) => s.status === 'in_progress');
    if (!hasLive) return;
    const id = setInterval(() => {
      Promise.all([
        aiInterviewService.getConfigInvitations(configId, requestParams),
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: 'expired', page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: 'revoked', page: 1, page_size: 1 }),
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: 'invited', page: 1, page_size: 1 }),
        // Every invite, whatever its status — decides "nobody invited yet".
        aiInterviewService.getConfigInvitations(configId, { ...requestParams, status: undefined, page: 1, page_size: 1 }),
      ])
        .then(([r, expiredProbe, revokedProbe, invitedProbe, allProbe]) => {
          const shown = pageBySource(r);
          setSessions(shown.items);
          setTotalSessions(shown.total);
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
  }, [sessions, configId, requestParams, pageBySource]);

  // The hook's `onChange` returns to page 1 whenever the query or a filter moves.
  // Job/interview version are properties of this config, not of each row, so
  // the version filters narrow client-side against the resolved versions.
  const versionMatches =
    (!jobVersionFilter || String(jobVersion) === jobVersionFilter) &&
    (!interviewVersionFilter || String(interviewVersion) === interviewVersionFilter);
  const paginatedSessions = versionMatches ? sessions : [];

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
    .map((c) => ({ id: c.id as string, label: c.label as string, enabled: true })));
  const [showColumnModal, setShowColumnModal] = useState(false);
  const enabledColumns = columns.filter((c) => c.enabled);
  const col = (id: ResultColumnId) => columns.some((c) => c.id === id && c.enabled);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');
  const [isExporting, setIsExporting] = useState(false);

  // One export cell per column; Timeline splits into its three parts so each
  // lands in its own spreadsheet column.
  const exportHeaders = (): string[] =>
    enabledColumns.flatMap((c) => (c.id === 'timeline' ? ['Started At', 'Completed At', 'Duration'] : [c.label]));
  const exportRow = (session: AIInterviewResponse): string[] =>
    enabledColumns.flatMap((c): string[] => {
      switch (c.id) {
        case 'cid': return [session.candidate_cid || ''];
        case 'candidate': return [session.candidate_name || ''];
        case 'email': return [session.candidate_email || ''];
        case 'jobVersion': return [jobVersion != null ? `V${jobVersion}` : ''];
        case 'interviewVersion': return [interviewVersion != null ? `V${interviewVersion}` : ''];
        case 'inviteSource': return [inviteSourceLabel(session) || ''];
        case 'status': return [getStatusLabel(session.status)];
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
    const all: AIInterviewResponse[] = [];
    for (let page = 1; ; page += 1) {
      const res = await aiInterviewService.getConfigInvitations(configId, { ...requestParams, page, page_size: 100 });
      all.push(...(needsClientFilter ? res.items.filter(matchesClientFilters) : res.items));
      if (res.items.length < 100 || page >= (res.total_pages || 1)) break;
    }
    return all;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows = await collectExportRows();
      if (rows.length === 0) {
        toast.warning('No candidates to export');
        return;
      }
      const headers = exportHeaders();
      const data = rows.map(exportRow);
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
      toast.success(`Exported ${rows.length} records to ${exportFormat === 'csv' ? 'CSV' : 'Excel'}`);
      setShowExportModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export results');
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
  const showInviteActions = showStats ?? !embedded;
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
    // One at a time: each resend emails a candidate, and one failure must not
    // stop the rest.
    for (const session of targets) {
      try {
        if (action === 'revoke') await aiInterviewService.revokeInvitation(session.id);
        else await aiInterviewService.sendSessionEmail(session.id, { base_url: window.location.origin });
        done++;
      } catch {
        failed++;
      }
    }
    if (done > 0) {
      toast.success(action === 'revoke'
        ? `Revoked ${done} invitation${done === 1 ? '' : 's'}.`
        : `New invitation link${done === 1 ? '' : 's'} sent to ${done} candidate${done === 1 ? '' : 's'}.`);
    }
    if (failed > 0) {
      toast.error(`${failed} invitation${failed === 1 ? '' : 's'} could not be ${action === 'revoke' ? 'revoked' : 'resent'}.`);
    }
    setSelected(new Map());
    setIsBulkWorking(false);
    setBulkAction(null);
    await loadSessions();
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
    try {
      const navList = paginatedSessions.map((s) => ({ id: s.id }));
      sessionStorage.setItem('aiInterviewResultNavList', JSON.stringify(navList));
    } catch { /* ignore storage failures */ }
    router.push(`/recruitment/ai-interviews/${configId}/results/details?session_id=${session.id}`);
  };

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
              <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-gray-900 tracking-tight">
                {jdShortId && <JobIdBadge className="flex-shrink-0">{jdShortId}</JobIdBadge>}
                <span>{jdTitle || configTitle || 'AI Interview'}</span>
                {/* One version's results: the table has no version columns, so
                    the title names the version — "App development - V1
                    Interview Version - V1", the Track popup's header. */}
                {hideVersionDetails && (jobVersion != null || interviewVersion != null) && (
                  <span className="flex items-center gap-3 text-sm font-medium text-gray-500 whitespace-nowrap">
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
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
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

      {/* Search + Filter bar */}
      {!isUnstarted && (
      <div className="bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 p-4 mb-4">
        <ListToolbar
          searchValue={search.query}
          onSearchChange={search.setQuery}
          // The hook debounces into `appliedQuery`, so keystrokes pass through.
          searchDebounceMs={0}
          searchPlaceholder="Search by name, email, or CID..."
          // Six controls beside the search — lay out by the toolbar's own
          // width, since beside the details page's nav it's far narrower
          // than the screen.
          fitToContainer
          onToggleFilters={() => setShowFilters((v) => !v)}
          filtersOpen={showFilters}
          activeFilterCount={search.activeFilterCount}
          filtersApplied={search.filtersApplied}
          onClearFilters={search.reset}
          leadingActions={
            <>
              {toolbarActions}
              {/* Status first (All Statuses by default), then Result, then More Filters. */}
              <select
                value={statusFilter}
                onChange={(e) => search.setFilter('status', e.target.value)}
                aria-label="Status"
                className="w-36 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-black"
              >
                {RESULT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={resultFilter}
                onChange={(e) => search.setFilter('result', e.target.value)}
                aria-label="Result"
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-black"
              >
                <option value="">All Results</option>
                {RESULT_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </>
          }
          className="mb-0"
        >
          {revocableSelected.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkAction('revoke')}
              disabled={isBulkWorking}
              title="Revoke the selected candidates' interview links"
              icon={isBulkWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              className="whitespace-nowrap !h-[38px] !text-sm"
            >
              {isBulkWorking ? 'Revoking…' : `Revoke (${revocableSelected.length})`}
            </Button>
          )}
          {resendableSelected.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setBulkAction('resend')}
              disabled={isBulkWorking}
              title="Resend a fresh link to the selected expired invitations"
              icon={isBulkWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              className="whitespace-nowrap !h-[38px] !text-sm"
            >
              {isBulkWorking ? 'Sending…' : `Resend (${resendableSelected.length})`}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowColumnModal(true)}
            icon={<SlidersHorizontal className="w-4 h-4" />}
            className="hidden sm:flex whitespace-nowrap !h-[38px] !text-sm"
          >
            <span className="hidden md:inline">Customize Columns</span>
            <span className="md:hidden">Columns</span>
          </Button>
          {/* Download PDF acts on the ticked rows only (disabled until one is
              selected); Export is always on — the ticked rows, else every
              row matching the search and filters. */}
          <DownloadPdfsButton
            getRows={() => Array.from(selected.values())}
            selectedCount={selected.size}
            zipName={`${(configTitle || jdTitle || 'AI_Interview').replace(/\s+/g, '_')}_Reports_${new Date().toISOString().slice(0, 10)}.zip`}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowExportModal(true)}
            icon={<FileDown className="w-4 h-4" />}
            className="whitespace-nowrap !h-[38px] !text-sm"
          >
            Export{selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
          <ListViewToggle value={displayMode} onChange={setDisplayMode} />
        </ListToolbar>

        {/* Bulk Revoke / Resend confirmations — the Track popup's wording and
            colours: red for revoke, brand blue for resend. */}
        <ConfirmationDialog
          isOpen={bulkAction === 'revoke'}
          onClose={() => { if (!isBulkWorking) setBulkAction(null); }}
          onConfirm={runBulkAction}
          title="Revoke invitations for selected candidates?"
          description={`The interview link for ${revocableSelected.length} selected candidate${revocableSelected.length === 1 ? '' : 's'} will stop working immediately.`}
          confirmText={isBulkWorking ? 'Revoking…' : `Yes, revoke ${revocableSelected.length}`}
          cancelText="Cancel"
          variant="danger"
        />
        <ConfirmationDialog
          isOpen={bulkAction === 'resend'}
          onClose={() => { if (!isBulkWorking) setBulkAction(null); }}
          onConfirm={runBulkAction}
          title="Resend invitations to selected candidates?"
          description={`A fresh interview link will be emailed to ${resendableSelected.length} selected candidate${resendableSelected.length === 1 ? '' : 's'}. Each candidate's previous link will stop working immediately.`}
          confirmText={isBulkWorking ? 'Sending…' : `Yes, resend to ${resendableSelected.length}`}
          cancelText="Cancel"
          variant="info"
        />

        {/* Expanded filters — each field filters the list the moment it
            changes (no Done step); Reset in the toolbar clears them all. */}
        {showFilters && (
          <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10">
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <div className="flex-1 min-w-0 basis-[240px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Score Range (%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  min={0}
                  max={100}
                  value={search.filters.scoreMin}
                  onChange={(e) => search.setFilter('scoreMin', e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={100}
                  value={search.filters.scoreMax}
                  onChange={(e) => search.setFilter('scoreMax', e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>
            </div>
            <div className="flex-[1.4] min-w-0 basis-[320px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Completion Date</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={search.filters.dateFrom}
                  onChange={(e) => search.setFilter('dateFrom', e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={search.filters.dateTo}
                  onChange={(e) => search.setFilter('dateTo', e.target.value)}
                  className="w-full min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                />
              </div>
            </div>
            {!hideVersionDetails && (
            <>
            <div className="flex-1 min-w-0 basis-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Job Version</label>
              <select
                value={search.filters.jobVersion}
                onChange={(e) => search.setFilter('jobVersion', e.target.value)}
                aria-label="Job Version"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-black"
              >
                <option value="">All job versions</option>
                {jobVersion != null && <option value={String(jobVersion)}>V{jobVersion}</option>}
              </select>
            </div>
            <div className="flex-1 min-w-0 basis-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Interview Version</label>
              <select
                value={search.filters.interviewVersion}
                onChange={(e) => search.setFilter('interviewVersion', e.target.value)}
                aria-label="Interview Version"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-black"
              >
                <option value="">All interview versions</option>
                {interviewVersion != null && <option value={String(interviewVersion)}>V{interviewVersion}</option>}
              </select>
            </div>
            </>
            )}
            <div className="flex-1 min-w-0 basis-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Source</label>
              <select
                value={search.filters.inviteSource}
                onChange={(e) => search.setFilter('inviteSource', e.target.value)}
                aria-label="Source"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-black"
              >
                <option value="">All sources</option>
                {INVITE_SOURCE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          </div>
        )}
      </div>
      )}

      {/* Table — the card is only drawn once there is something to invite the
          user into. Unstarted, the empty state stands on its own like the AI
          Talent Match tab's does. */}
      <div className={isUnstarted ? '' : 'bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden'}>
        {isLoading ? (
          /* Skeleton matches the results table structure (no double border — the
             parent card already provides it) instead of a bare spinner. */
          <TableSkeleton toolbar={false} columns={6} rows={6} className="border-0 shadow-none rounded-none" />
        ) : isUnstarted ? (
          /* Nothing here yet — the shared tab empty state, carrying the actions
             since the toolbar they normally sit in is gone. */
          <TabEmptyState
            icon={Users}
            title="No AI Interview Results"
            description={summary.all > 0
              ? 'Results appear here once an invited candidate starts their interview.'
              : 'Invite candidates to this interview to see their sessions here.'}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {paginatedSessions.map((session) => {
                const risk = getProctoringRisk(session);
                const sc = session.status === 'in_progress' ? session.skill_coverage : undefined;
                const scTotal = sc ? sc.covered.length + sc.medium_covered.length + sc.low_covered.length + sc.uncovered.length : 0;
                const scCoveredPct = sc && scTotal > 0 ? Math.round(((sc.covered.length + sc.medium_covered.length) / scTotal) * 100) : 0;
                return (
                  <button
                    key={session.id}
                    onClick={() => handleViewDetails(session)}
                    className="text-left bg-white rounded-xl border border-gray-100 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-sm flex-shrink-0">
                        {(session.candidate_name || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">
                          {session.candidate_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {session.candidate_email || '—'}
                        </p>
                      </div>
                      {session.candidate_cid && (
                        <span className="text-2xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-1.5 py-0.5 rounded shrink-0">
                          {session.candidate_cid}
                        </span>
                      )}
                    </div>

                    {col('inviteSource') && inviteSourceLabel(session) && (
                      <p className="text-xs text-gray-600">
                        <InviteSourceValue inv={session} iconClassName="w-3 h-3" />
                      </p>
                    )}

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={getStatusVariant(session.status)}>
                          {getStatusIcon(session.status)}
                          {getStatusLabel(session.status)}
                        </Badge>
                        {session.status === 'in_progress' && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive text-white text-2xs font-bold rounded-full">
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
                            <span className="text-2xs text-gray-500">{sc.questions_asked}/{sc.total_questions} Q</span>
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

                    {displayInviteScore(session) != null && (
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm shrink-0 ${displayInviteScore(session)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                          {displayInviteScore(session)}%
                        </span>
                        <ResultBadge result={inviteResult(session, displayInviteScore(session))} />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
                      <span>{formatDuration(session)}</span>
                      <span>{session.completed_at ? formatIST(session.completed_at) : session.started_at ? formatIST(session.started_at) : '—'}</span>
                    </div>

                    <div
                      onClick={(e) => { e.stopPropagation(); handleViewDetails(session); }}
                      title="View Details"
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 ring-1 ring-brand-blue/20 rounded-lg transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">View Details</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-slate-50">
                <div className="text-sm text-gray-500">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalSessions)} of {totalSessions}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-500 whitespace-nowrap">Go to</span>
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
                      className="w-14 h-8 px-2 text-sm text-center border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-brand-blue font-semibold px-2 tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-gray-100">
                  <tr>
<th className="text-left px-4 py-3 w-12 align-middle tf-sticky-col-left">
                      <button
                        type="button"
                        onClick={toggleAllOnPage}
                        className="p-1 rounded hover:bg-gray-100"
                        aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                        title={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                      >
                        {allOnPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </th>
                    {col('cid') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">CID</th>}
                    {col('candidate') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Candidate</th>}
                    {col('email') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Email</th>}
                    {col('jobVersion') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Job Version</th>}
                    {col('interviewVersion') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Interview Version</th>}
                    {col('inviteSource') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Invite Source</th>}
                    {col('status') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide">Status</th>}
                    {col('score') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Score</th>}
                    {col('result') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Result</th>}
                    {col('timeline') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Timeline</th>}
                    {col('proctoring') && <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">Proctoring Risk</th>}
                    <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wide tf-sticky-col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedSessions.map((session) => {
                    const risk = getProctoringRisk(session);
                    return (
                      <tr
                        key={session.id}
                        onClick={() => handleViewDetails(session)}
                        className="hover:bg-brand-blue/5 transition-colors cursor-pointer"
                      >
<td className="px-4 py-3 w-12 align-middle tf-sticky-col-left" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleSelected(session)}
                            className="p-1 rounded hover:bg-gray-200"
                            aria-label={selected.has(session.id) ? 'Deselect candidate' : 'Select candidate'}
                          >
                            {selected.has(session.id) ? (
                              <CheckSquare className="w-4 h-4 text-brand-blue" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        {col('cid') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {session.candidate_cid ? (
                              <span className="text-xs font-mono font-medium text-brand-blue bg-brand-blue/5 ring-1 ring-brand-blue/20 px-2 py-1 rounded">
                                {session.candidate_cid}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('candidate') && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center text-brand-blue font-semibold text-xs flex-shrink-0">
                                {(session.candidate_name || 'U')[0].toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 truncate max-w-[160px]">
                                {session.candidate_name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                        )}
                        {col('email') && (
                          <td className="px-4 py-3">
                            <span className="text-gray-600 truncate max-w-[180px] block">
                              {session.candidate_email || '—'}
                            </span>
                          </td>
                        )}
                        {col('jobVersion') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {jobVersion != null ? <VersionPill kind="job" version={jobVersion} /> : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('interviewVersion') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {interviewVersion != null ? <VersionPill kind="interview" version={interviewVersion} /> : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('inviteSource') && (
                          <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                            {inviteSourceLabel(session)
                              ? <InviteSourceValue inv={session} iconClassName="w-3.5 h-3.5" />
                              : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        {col('status') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={getStatusVariant(session.status)}>
                                {getStatusIcon(session.status)}
                                {getStatusLabel(session.status)}
                              </Badge>
                              {session.status === 'in_progress' && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive text-white text-2xs font-bold rounded-full">
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
                                    <span className="text-2xs text-gray-500">{sc.questions_asked}/{sc.total_questions} Q</span>
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
                          <td className="px-4 py-3 whitespace-nowrap">
                            {displayInviteScore(session) != null ? (
                              <span className={`font-semibold text-sm ${displayInviteScore(session)! >= 60 ? 'text-success' : 'text-destructive'}`}>
                                {displayInviteScore(session)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('result') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {inviteResult(session, displayInviteScore(session)) ? (
                              <ResultBadge result={inviteResult(session, displayInviteScore(session))} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        {col('timeline') && (
                          <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                            {/* Results only care about the interview itself —
                                Started and Completed, the same two times the
                                export writes. Invite history stays on Track Invites. */}
                            <div className="flex flex-col gap-0.5 text-xs">
                              {session.started_at && (
                                <span className="flex items-center gap-1.5">
                                  <Play className="w-3 h-3 shrink-0 text-brand-orange-deep" />
                                  <span>Started: {formatIST(session.started_at)}</span>
                                </span>
                              )}
                              {session.completed_at && (
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle className="w-3 h-3 shrink-0 text-success" />
                                  <span>Completed: {formatIST(session.completed_at)}</span>
                                </span>
                              )}
                              {!session.started_at && !session.completed_at && <span>—</span>}
                              <span><span className="text-gray-400">Duration:</span> {formatDuration(session)}</span>
                            </div>
                          </td>
                        )}
                        {col('proctoring') && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {session.status === 'completed' ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                                {risk.level}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right whitespace-nowrap tf-sticky-col">
                          <ResultRowActions session={session} onView={() => handleViewDetails(session)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-slate-50">
                <div className="text-sm text-gray-500">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalSessions)} of {totalSessions}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-500 whitespace-nowrap">Go to</span>
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
                      className="w-14 h-8 px-2 text-sm text-center border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
                    />
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-brand-blue font-semibold px-2 tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>

      {showColumnModal && (
        <ColumnCustomizationModal
          columns={columns}
          onClose={() => setShowColumnModal(false)}
          onApply={(ids) => setColumns((prev) => prev.map((c) => ({ ...c, enabled: ids.includes(c.id) })))}
        />
      )}

      {/* Export format picker — same modal as the resume scoring All Resumes tab. */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileDown className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Export Interview Results</h3>
                  <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                    {selected.size > 0 ? `${selected.size} selected records` : `${versionMatches ? totalSessions : 0} records`}
                    <span className="w-1 h-1 rounded-full bg-blue-500" />
                    {enabledColumns.length} columns
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowExportModal(false)} className="px-2 flex-shrink-0" aria-label="Close">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <p className="text-sm font-bold text-gray-900 mb-3">Choose export format</p>
              <div className="space-y-3">
                {([
                  { key: 'csv', title: 'CSV Format', desc: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
                  { key: 'xls', title: 'Excel Format (.xls)', desc: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
                ] as const).map(({ key, title, desc, Icon, iconWrap, iconColor }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExportFormat(key)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      exportFormat === key ? 'border-blue-500 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${iconWrap}`}>
                      <Icon className={`w-6 h-6 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900">{title}</div>
                      <div className="text-sm text-gray-500">{desc}</div>
                    </div>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${exportFormat === key ? 'border-blue-600' : 'border-gray-300'}`}>
                      {exportFormat === key && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4 p-4 bg-blue-50/60 rounded-xl flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600">
                  <span className="block font-bold text-blue-700 mb-0.5">Columns included</span>
                  {enabledColumns.map((c) => c.label).join(', ')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 shrink-0">
              <Button variant="secondary" size="md" onClick={() => setShowExportModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleExport}
                disabled={isExporting || enabledColumns.length === 0}
                icon={isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              >
                Export
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return body;

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full min-h-[calc(100dvh-7rem)] bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
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
