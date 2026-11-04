'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListBulkActions } from '@/components/ui/list-toolbar-slot';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, X, Video, MoreVertical, Eye, Pencil, AlertTriangle, RefreshCw, SlidersHorizontal,
  Square, CheckSquare, ChevronDown, FileDown, FileText, FileSpreadsheet,
  Archive, ArchiveRestore, Trash2, Send, CheckCircle2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import { Button } from '@/components/ui/button';
import ListPagination from '@/components/ListPagination';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import NameAvatar from '@/components/ui/name-avatar';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { DateField } from '@/components/ui/date-field';
import { aiInterviewService, isJdDisabled, jdActionLockReason, JD_DISABLED_ACTION_MESSAGE, JD_ARCHIVED_ACTION_MESSAGE, cleanAIConfigParams, type AIInterviewResponse, type AIConfigListQuery, type AIConfigFilterOptions } from '@/lib/services/aiInterviewService';
import { usePagedList } from '@/lib/hooks/usePagedList';
import { cachedList, listCacheKey, LIST_CACHE_TTL_MS } from '@/lib/utils/listCache';
import ExportColumnsModal from '@/components/ExportColumnsModal';
import { toast } from 'sonner';
import { formatISTStamp, parseIST } from '@/lib/utils/dateUtils';
import JobStatusBadge, { jobLockBadgeFor, jobStatusBadgeKind, type JobStatusBadgeKind } from '@/components/jobs/JobStatusBadge';
import { useJobStatusRefresh } from '@/lib/hooks/useJobStatusRefresh';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAuth } from '@/lib/hooks/useAuth';
import { rememberAIInterviewPagerOrder, type AIInterviewPagerList } from '@/lib/utils/aiInterviewPagerList';
import { resolveAIInterviewDraftResumeHref } from '@/lib/utils/aiInterviewDraftResume';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { MENU_ITEM_SCALE_CLASS, MENU_ITEM_LIGHT_HIGHLIGHT_CLASS, MENU_PANEL_BORDER_CLASS } from '@/lib/constants/menuAnimation';
import UnpublishedChangesChip, { hasUnpublishedChanges } from './UnpublishedChangesChip';

/** The page-size ladder this screen specifies (same ladder as the Assessments
 *  equivalent, so pagination reads the same across the two products). */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* Candidate-flow statuses (invited/consent_pending/system_check/in_progress/
   scheduled) are still published & live configs — the same normalization
   AIInterview.tsx applies to its own card list — so this screen and that one
   never disagree about what counts as "Active". */
const CANDIDATE_FLOW_STATUSES = ['invited', 'consent_pending', 'system_check', 'in_progress', 'scheduled'];
const normalizeStatus = (status: string) =>
  CANDIDATE_FLOW_STATUSES.includes(status) ? 'published' : status;

/* ── Row model ─────────────────────────────────────────────────────────────
   One flat row per interview config/version, mirroring AllAssessmentsTable's
   AssessmentRow so the two flat tables read as one family. */
interface InterviewRow {
  id: string;
  interviewId: string;    // display_id, e.g. "AI-045" — searchable, not shown
  jobId: string;           // jd_short_id            -> column 1
  jobName: string;         // jd_title               -> column 2
  jobVersion: number;      // jd_version             -> column 3
  interviewVersion: number; // derived ordinal, see below -> column 4
  jdId?: string;            // job-version id, needed for the Edit route
  rawStatus: string;        // draft | published | archived (normalized)
  status: string;           // Draft | Active | Archived   -> column 5
  rounds: string[];         // enabled round types, in config order
  invitations: number;      //                        -> column 6
  completed: number;        // completed sessions, filled in by fetchAll
  /** The Completed figure is still on its way (it comes from a second request). */
  completedPending?: boolean;
  createdAt: string;        // ISO                    -> column 7
  createdSort: number;      // epoch ms, so the sort never re-parses
  createdBy: string;        //                        -> column 8
  config: AIInterviewResponse; // the raw config, handed to `renderRowActions`
}

/* Same full labels (tooltip) and short forms (pill text) the Total Jobs tab's
   version panel uses for its Rounds cell. */
const ROUND_SHORT_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'TECH',
  behavioral: 'BEH',
  culture_fit: 'CF',
  leadership: 'LEAD',
  problem_solving: 'PS',
  must_have_skills: 'MHS',
  nice_to_have_skills: 'NHS',
};

const ROUND_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  behavioral: 'Behavioral',
  culture_fit: 'Culture Fit',
  leadership: 'Leadership',
  problem_solving: 'Problem Solving',
  must_have_skills: 'Must-Have Skills',
  nice_to_have_skills: 'Nice-to-Have Skills',
};

const STATUS_LABEL: Record<string, string> = {
  published: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

/* An interview config carries no stored version number of its own — the
   ordinal (the Nth config created against a given job version, oldest first,
   over EVERY config, archived included) is computed by the server now
   (`list_ordinal` on GET /ai-interview/configs) — the same rule this table
   used to apply in the browser over the whole downloaded set. Completed comes
   with the row too (`completed_count`), so no second request. */
function toInterviewRow(config: AIInterviewResponse): InterviewRow {
  const raw = normalizeStatus(String(config.status || 'draft').toLowerCase());
  return {
    id: config.id,
    interviewId: config.display_id || '',
    jobId: config.jd_short_id || '',
    jobName: config.jd_title || config.position || 'General Interview',
    jobVersion: config.jd_version ?? 1,
    interviewVersion: config.list_ordinal ?? 1,
    jdId: config.jd_id,
    rawStatus: raw,
    status: STATUS_LABEL[raw] || 'Draft',
    rounds: (config.rounds_config || [])
      .filter((round) => round.enabled !== false)
      .map((round) => round.type),
    invitations: config.invitations_count ?? 0,
    completed: config.completed_count ?? 0,
    createdAt: config.created_at,
    createdSort: parseIST(config.created_at).getTime() || 0,
    createdBy: config.created_by_name || 'System',
    config,
  };
}

const STATUS_BADGE: Record<string, string> = {
  Active: 'bg-success-subtle text-success ring-success-line',
  Draft: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20',
  Archived: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:ring-slate-600',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ring-1 ${
        STATUS_BADGE[status] || STATUS_BADGE.Draft
      }`}
    >
      {status}
    </span>
  );
}

/* Job versions blue, interview versions cyan — the same two colours the
   Interview/Assessment Version History panels already use for the same
   roles, so a V3 means the same thing wherever it is read. */
export function VersionPill({ kind, version }: { kind: 'job' | 'interview'; version: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 ${
        kind === 'job'
          ? 'text-brand-blue bg-brand-blue/10 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35'
          : 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20 dark:bg-brand-cyan/20 dark:text-cyan-200 dark:ring-brand-cyan/35'
      }`}
    >
      V{version}
    </span>
  );
}

/* The job's Disabled / Archived / Draft badge beside its name (shared with
   the Assessment lists), with this page's own lock messages on hover. */
const JOB_STATUS_TITLE: Record<JobStatusBadgeKind, string> = {
  disabled: JD_DISABLED_ACTION_MESSAGE,
  archived: JD_ARCHIVED_ACTION_MESSAGE,
  draft: 'This job is in Draft.',
};

export function AIInterviewJobStatusBadge({ kind }: { kind: JobStatusBadgeKind }) {
  return <JobStatusBadge kind={kind} title={JOB_STATUS_TITLE[kind]} />;
}

function CreatedBy({ name }: { name: string }) {
  return (
    // Capped, so a long creator name ends in "…" (full name on hover)
    // instead of widening the Created column.
    <span className="inline-flex items-center gap-2 min-w-0 max-w-[10rem]">
      <NameAvatar name={name} size="xs" title="" />
      <span className="truncate tf-body-secondary" title={name}>
        {name}
      </span>
    </span>
  );
}

type SortKey =
  | 'jobId' | 'jobName' | 'jobVersion' | 'interviewVersion'
  | 'status' | 'rounds' | 'invitations' | 'completed' | 'createdAt' | 'createdBy';

const text = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const COMPARATORS: Record<SortKey, (a: InterviewRow, b: InterviewRow) => number> = {
  jobId: (a, b) => text(a.jobId, b.jobId),
  jobName: (a, b) => text(a.jobName, b.jobName),
  jobVersion: (a, b) => a.jobVersion - b.jobVersion,
  interviewVersion: (a, b) => a.interviewVersion - b.interviewVersion,
  status: (a, b) => {
    const order = ['Active', 'Draft', 'Archived'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  },
  rounds: (a, b) => a.rounds.length - b.rounds.length || text(a.rounds.join(','), b.rounds.join(',')),
  invitations: (a, b) => a.invitations - b.invitations,
  completed: (a, b) => a.completed - b.completed,
  createdAt: (a, b) => a.createdSort - b.createdSort,
  createdBy: (a, b) => text(a.createdBy, b.createdBy),
};

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: 'left' | 'center' | 'right';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

const COLUMNS: ColumnDef[] = [
  { key: 'jobId', label: 'JD ID' },
  { key: 'jobName', label: 'Job Name' },
  { key: 'jobVersion', label: 'Job Version', align: 'center' },
  { key: 'interviewVersion', label: 'Interview Version', align: 'center' },
  { key: 'status', label: 'Status' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'invitations', label: 'Invitations Sent', align: 'center' },
  { key: 'completed', label: 'Completed', align: 'center' },
  /* Created On + Created By in one column: date, with who underneath. */
  { key: 'createdAt', label: 'Created' },
];

/* With `expandableRows`, the six columns the row shows; the rest open in the
   row's expanded panel (the Resume Scoring list's expand pattern). */
const PRIMARY_COLUMN_KEYS: SortKey[] = ['jobId', 'jobName', 'jobVersion', 'interviewVersion', 'status', 'invitations'];

const HIDE_CLASS: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

interface Filters {
  job: string;
  jobVersion: string;
  interviewVersion: string;
  status: string;
  createdFrom: string;
  createdTo: string;
}

const EMPTY_FILTERS: Filters = {
  job: '', jobVersion: '', interviewVersion: '', status: '', createdFrom: '', createdTo: '',
};

const hasAnyFilter = (f: Filters) => Object.values(f).some((v) => v !== '');

const STATUS_OPTIONS: SearchableSelectOption[] = [
  { value: 'published', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

export interface AllInterviewsTableProps {
  /**
   * DOM node the search/filter toolbar portals into, so it renders in the
   * shared slot above the tab pills (AIInterview.tsx) instead of its own
   * default spot inline above the table — every tab's toolbar then sits in
   * the same place regardless of which tab owns the fields. Falls back to
   * rendering inline when unset (e.g. a future standalone use).
   */
  toolbarSlot?: HTMLDivElement | null;
  /**
   * DOM node beside the host's Refresh button that the Clear Sort button
   * portals into, so it sits in the pill row with the page's other list
   * actions. Falls back to rendering above the table when unset.
   */
  sortActionSlot?: HTMLElement | null;
  /** The host's Sort by dropdown; orders the rows until a column header is clicked. */
  defaultSort?: 'newest' | 'oldest' | 'active' | 'draft';
  /** @deprecated Ignored: the table pages from the server now (usePagedList)
   *  and no longer seeds from a full list held by the host. */
  seedConfigs?: AIInterviewResponse[];
  /**
   * Bumped by the host's Refresh button (AIInterview.tsx) to force a
   * reload — this table otherwise only refetches on mount or its own Retry.
   */
  refreshSignal?: number;
  /**
   * Shows only PRIMARY_COLUMN_KEYS; a row click (or its chevron) expands the
   * row to show the remaining columns, instead of opening the interview.
   * View Details stays in the row's ⋮ menu.
   */
  expandableRows?: boolean;
  /**
   * Locks the table to one status — the Active/Draft/Archived tabs'
   * "Ungrouped" view, each showing only its own status rather than every
   * version whatever its state. The Status filter (redundant once the whole
   * table is one status) is hidden in this mode. Omitted for the real "All
   * Interviews" tab, which spans every status.
   */
  fixedStatus?: 'published' | 'draft' | 'archived';
  /**
   * The Actions cell for one row. The AI Interview page passes the same 3-dot
   * menu its Total Jobs Interview Versions table uses, so both tabs offer the
   * same actions (Share, Track, View Results, Archive, Delete …) wired to the
   * same handlers. Omitted, the table falls back to its own View / Edit menu.
   */
  renderRowActions?: (config: AIInterviewResponse, completed?: number) => React.ReactNode;
  /** List (the table) or Card (a grid of cards) — owned by the host so every
   *  AI Interview tab shares one choice. */
  displayMode?: ListDisplayMode;
  /** Given, the shared List/Card switch renders at the end of the toolbar. */
  onDisplayModeChange?: (mode: ListDisplayMode) => void;
  /**
   * Bulk Archive / Unarchive / Delete for the ticked rows (Actions menu). The
   * table works out which ticked rows qualify — the row ⋮ menu's own rules —
   * and hands them to the host, which owns the confirm popup, the service
   * calls and the refresh. Omitted, the Actions menu offers Export only.
   */
  bulkActions?: BulkActionsConfig;
  /** Export permission. False: Export stays in the Actions menu, greyed with
   *  the reason (RBAC rule: grey out, never hide). Defaults to allowed. */
  canExport?: boolean;
  /** Called after an export file is handed to the browser — the host audits it. */
  onExported?: (info: { format: 'csv' | 'xls'; recordCount: number; tab: string; ids: string[] }) => void;
  /** Told the configs on screen each time a page lands — the host reads the
   *  versions of THESE jobs for its row menus instead of every config. */
  onVisibleRowsChange?: (rows: AIInterviewResponse[]) => void;
}

export type BulkActionKind = 'archive' | 'unarchive' | 'delete';
export interface BulkSkip { reason: string; count: number }
export interface BulkActionsConfig {
  canArchive: boolean;
  canDelete: boolean;
  /** Opens the host's confirm popup for `eligible`; resolves true once a run
   *  has gone through (false if cancelled) so the table clears its ticks. */
  onRun: (kind: BulkActionKind, eligible: AIInterviewResponse[], skipped: BulkSkip[]) => Promise<boolean>;
}

/* Bulk eligibility — the SAME rules the row ⋮ menu applies
   (AIInterview.tsx renderInterviewVersionActions), so a bulk run never does
   what the row would refuse. Null when the row qualifies, else why not
   (grouped in the confirm popup's "skipped" list). */
function bulkSkipReason(kind: BulkActionKind, row: InterviewRow, cfg: BulkActionsConfig): string | null {
  const locked = !!jdActionLockReason(row.config.jd_status);
  if (kind === 'archive') {
    if (!cfg.canArchive) return 'no permission to archive';
    if (row.rawStatus === 'archived') return 'already archived';
    if (locked) return 'job is disabled or archived';
    return null;
  }
  if (kind === 'unarchive') {
    if (!cfg.canArchive) return 'no permission to unarchive';
    if (row.rawStatus !== 'archived') return 'not archived';
    if (locked) return 'job is disabled or archived';
    return null;
  }
  if (!cfg.canDelete) return 'no permission to delete';
  if (locked) return 'job is disabled or archived';
  if ((row.config.invitations_count ?? 0) > 0) return 'candidates already invited';
  return null;
}

/** The list-cache namespace this table pages under (usePagedList). */
const TABLE_CACHE_NAME = 'ai-configs-table';

/** One server page of configs for the table's query. */
const fetchInterviewPage = (q: AIConfigListQuery) =>
  aiInterviewService.listConfigsPage(q).then((res) => ({ items: res.items || [], total: res.total ?? 0 }));

/** The query a tab opens on (page 1, no search / filters, default order). */
const defaultTableQuery = (fixedStatus?: 'published' | 'draft' | 'archived'): AIConfigListQuery => ({
  page: 1,
  page_size: 10,
  ...cleanAIConfigParams({ status: fixedStatus ?? 'all', search_scope: 'table' as const }),
  sort_by: 'newest',
});

/** Warms a tab's first page in the shared list cache, so opening it draws at once. */
export async function prefetchInterviewRows(fixedStatus?: 'published' | 'draft' | 'archived'): Promise<void> {
  const q = defaultTableQuery(fixedStatus);
  await cachedList(listCacheKey(`${TABLE_CACHE_NAME}:page`, q), () => fetchInterviewPage(q), { ttlMs: LIST_CACHE_TTL_MS });
}

export default function AllInterviewsTable({ toolbarSlot, sortActionSlot, defaultSort = 'newest', refreshSignal, fixedStatus, renderRowActions, expandableRows = false, displayMode = 'list', onDisplayModeChange, bulkActions, canExport = true, onExported, onVisibleRowsChange }: AllInterviewsTableProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTenantAdmin, user } = useAuth();
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;

  const [search, setSearch] = useState('');
  const appliedSearch = useDebounce(search, 300);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // null = no column sort: the default newest-first order, no header
  // highlighted. Clear Sort returns here.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* Deep-linked from the "AI Interview Published" screen (and its Back
     redirect): `?highlight=<config id>` scrolls that row into view and
     flashes it once the list has loaded, rather than leaving the recruiter
     to hunt for it across pages and sort orders. */
  const highlightId = searchParams.get('highlight');
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const highlightHandledRef = useRef(false);
  const [flashedRowId, setFlashedRowId] = useState<string | null>(null);

  /* ── Load ── ONE page from the server for the current search / filters /
     sort (usePagedList): GET /ai-interview/configs?page&page_size&sort_by&...
     The filtering and sorting this table used to do in the browser over every
     config now run in that query (app/services/ai_interview_list_query). */
  const listFilters = useMemo(() => cleanAIConfigParams({
    // All Interviews spans every status, archived included (it used to merge
    // the live and the archived list); a status tab is pinned to its own.
    status: fixedStatus ?? (filters.status || 'all'),
    search: appliedSearch.trim(),
    search_scope: 'table' as const,
    job: filters.job,
    jd_version: filters.jobVersion ? Number(filters.jobVersion) : undefined,
    interview_version: filters.interviewVersion ? Number(filters.interviewVersion) : undefined,
    created_from: filters.createdFrom,
    created_to: filters.createdTo,
  }), [fixedStatus, filters, appliedSearch]);
  const sortQuery = sortKey
    ? { sort_by: sortKey as string, sort_dir: sortDir }
    : {
        sort_by: defaultSort === 'oldest' ? 'oldest' : 'newest',
        ...(defaultSort === 'active' ? { status_first: 'active' as const } : defaultSort === 'draft' ? { status_first: 'draft' as const } : {}),
      };
  const query: AIConfigListQuery = { page, page_size: pageSize, ...listFilters, ...sortQuery };
  const paged = usePagedList<AIInterviewResponse, null, AIConfigListQuery>({
    name: TABLE_CACHE_NAME,
    query,
    fetchPage: fetchInterviewPage,
  });
  const rows = useMemo(() => paged.items.map(toInterviewRow), [paged.items]);
  useEffect(() => {
    if (paged.items.length) onVisibleRowsChange?.(paged.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.items]);
  const total = paged.total;
  const isLoading = paged.loading;
  const error = paged.error ? (paged.error instanceof Error ? paged.error.message : 'Failed to load interviews') : null;
  const refreshList = paged.refresh;

  /* Each row's job badge comes from its config's `jd_status`, which only
     arrives with the rows — so a job disabled / archived / re-enabled anywhere
     re-reads the page quietly (rows stay on screen meanwhile). */
  useJobStatusRefresh(() => refreshList());

  const retry = () => refreshList();

  /* Host's Refresh button — skips the mount value (undefined -> 0) so this
     doesn't double-fetch alongside the initial load. */
  const skippedFirstRefreshSignal = useRef(false);
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (!skippedFirstRefreshSignal.current) {
      skippedFirstRefreshSignal.current = true;
      return;
    }
    retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  /* Filter option lists — from GET /configs/filter-options when the panel
     first opens (they used to be derived from the whole downloaded list). */
  const [filterOptions, setFilterOptions] = useState<AIConfigFilterOptions | null>(null);
  useEffect(() => {
    if (!filtersOpen || filterOptions) return;
    let alive = true;
    aiInterviewService.getConfigFilterOptions(fixedStatus ?? 'all')
      .then((opts) => { if (alive) setFilterOptions(opts); })
      .catch(() => { /* the panel still works; only its option lists are empty */ });
    return () => { alive = false; };
  }, [filtersOpen, filterOptions, fixedStatus]);

  const jobOptions: SearchableSelectOption[] = useMemo(() => (filterOptions?.jobs ?? []).map((job) => ({
    value: job.value,
    label: `${job.label} (${job.value})`,
    hint: String(job.count),
  })), [filterOptions]);
  const jobVersionOptions: SearchableSelectOption[] = useMemo(
    () => (filterOptions?.job_versions ?? []).map((v) => ({ value: String(v), label: `V${v}` })),
    [filterOptions],
  );
  const interviewVersionOptions: SearchableSelectOption[] = useMemo(
    () => (filterOptions?.interview_versions ?? []).map((v) => ({ value: String(v), label: `V${v}` })),
    [filterOptions],
  );

  /* A narrower filter can leave the page past the end: back to page 1. */
  useEffect(() => {
    if (!paged.refreshing && page > 1 && rows.length === 0 && total > 0) setPage(1);
  }, [paged.refreshing, page, rows.length, total]);

  /* The details page's Prev / Next walk THIS table — its rows, sort and
     filters — so "X / N" matches the count shown here. The order is handed
     over on every change; the row link carries which list it is. */
  const pagerList: AIInterviewPagerList =
    fixedStatus === 'published' ? 'active' : fixedStatus ?? 'all-interviews';
  /* Only the current page is in the browser now: hand it over when it IS the
     whole list; otherwise hand over nothing usable, so the details page
     rebuilds the list itself (its existing fallback) rather than walking ten
     rows. */
  useEffect(() => {
    if (isLoading) return;
    rememberAIInterviewPagerOrder(pagerList, total <= rows.length ? rows.map((r) => r.id) : []);
  }, [rows, total, pagerList, isLoading]);
  const detailsHref = (id: string) => `/recruitment/ai-interviews/${id}?list=${pagerList}`;
  /* Row click: an editable DRAFT reopens its editor at the step it was left
     on; everything else opens its details page as before. */
  const openRow = (row: InterviewRow) => {
    if (row.rawStatus === 'draft' && row.jdId && canUpdateAIInterviews && !isJdDisabled(row.config.jd_status)) {
      void resolveAIInterviewDraftResumeHref(row.id, row.jdId).then((href) => router.push(href));
      return;
    }
    router.push(detailsHref(row.id));
  };

  const safePage = page;
  const pageRows = rows;

  /* Every version's status for the rows on this page whose job reads Disabled,
     Archived or Draft — the job badge is judged on the whole job (jobLockBadgeFor). */
  const jdLineage = useJobVersionLineage();
  const { ensureFilterLineages } = jdLineage;
  useEffect(() => {
    ensureFilterLineages(
      pageRows
        .filter((row) => row.jdId && jobStatusBadgeKind(row.config.jd_status))
        .map((row) => ({ key: row.jdId!, jobId: row.jdId! })),
    );
  }, [pageRows, ensureFilterLineages]);

  // Row selection — the CheckSquare / Square column the Candidate Results tab
  // opens with. Selection survives paging (rows are server pages now, so each
  // ticked row is remembered as it was seen); a new search / filter clears it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [knownRows, setKnownRows] = useState<Record<string, InterviewRow>>({});
  useEffect(() => {
    if (rows.length === 0) return;
    setKnownRows((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.id] = row;
      return next;
    });
  }, [rows]);
  const filterKey = JSON.stringify(listFilters);
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    setSelectedIds(new Set());
  }, [filterKey]);
  /* "Select all N" — every config matching the search / filters, across
     pages: their ids from GET /configs/ids, and the rows the browser has not
     seen yet in pages of 100 by id (bulk actions and export need the rows). */
  const [selectingAll, setSelectingAll] = useState(false);
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const ids = await aiInterviewService.getConfigIds(listFilters);
      const missing = ids.filter((id) => !knownRows[id]);
      const fetched: Record<string, InterviewRow> = {};
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const res = await aiInterviewService.listConfigsPage({ page: 1, page_size: chunk.length, status: 'all', ids: chunk.join(',') });
        for (const config of res.items || []) fetched[config.id] = toInterviewRow(config);
      }
      setKnownRows((prev) => ({ ...prev, ...fetched }));
      setSelectedIds(new Set(ids));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not select every interview');
    } finally {
      setSelectingAll(false);
    }
  };
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));
  const toggleAllOnPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((row) => next.delete(row.id));
      else pageRows.forEach((row) => next.add(row.id));
      return next;
    });

  /* ── Bulk actions on the ticked rows ── Actions (N) + Clear, the Candidate
     Results pattern. Items per tab: All → Export / Archive / Unarchive /
     Delete; Active and Draft drop Unarchive; Archived drops Archive. */
  const selectedRows = useMemo(
    () => [...selectedIds].map((id) => knownRows[id]).filter((row): row is InterviewRow => !!row),
    [selectedIds, knownRows],
  );
  const bulkKinds: BulkActionKind[] = fixedStatus === 'archived'
    ? ['unarchive', 'delete']
    : fixedStatus
      ? ['archive', 'delete']
      : ['archive', 'unarchive', 'delete'];
  const BULK_META: Record<BulkActionKind, { label: string; Icon: typeof Archive; className: string }> = {
    archive: { label: 'Archive', Icon: Archive, className: 'text-menu-icon-archive' },
    unarchive: { label: 'Unarchive', Icon: ArchiveRestore, className: 'text-menu-icon-archive' },
    delete: { label: 'Delete', Icon: Trash2, className: 'text-destructive' },
  };
  const runBulk = async (kind: BulkActionKind) => {
    if (!bulkActions) return;
    const eligible: AIInterviewResponse[] = [];
    const skips = new Map<string, number>();
    for (const row of selectedRows) {
      const why = bulkSkipReason(kind, row, bulkActions);
      if (why) skips.set(why, (skips.get(why) ?? 0) + 1);
      else eligible.push(row.config);
    }
    if (eligible.length === 0) return;
    const done = await bulkActions.onRun(kind, eligible, [...skips].map(([reason, count]) => ({ reason, count })));
    if (done) setSelectedIds(new Set());
  };

  /* Export — the ticked rows, with the columns picked in the popup (the Score
     Resume tab's Export). Created exports as two columns. */
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');
  const EXPORT_COLUMNS = [
    { id: 'jobId', label: 'JD ID' },
    { id: 'jobName', label: 'Job Name' },
    { id: 'jobVersion', label: 'Job Version' },
    { id: 'interviewVersion', label: 'Interview Version' },
    { id: 'status', label: 'Status' },
    { id: 'rounds', label: 'Rounds' },
    { id: 'invitations', label: 'Invitations Sent' },
    { id: 'completed', label: 'Completed' },
    { id: 'created', label: 'Created' },
  ];
  const handleExport = (ids: string[]) => {
    if (selectedRows.length === 0) return;
    const cols = EXPORT_COLUMNS.filter((c) => ids.includes(c.id));
    const headers = cols.flatMap((c) => (c.id === 'created' ? ['Created On', 'Created By'] : [c.label]));
    const data = selectedRows.map((row) => cols.flatMap((c): string[] => {
      switch (c.id) {
        case 'jobId': return [row.jobId || ''];
        case 'jobName': return [row.jobName];
        case 'jobVersion': return [`V${row.jobVersion}`];
        case 'interviewVersion': return [`V${row.interviewVersion}`];
        case 'status': return [row.status];
        case 'rounds': return [row.rounds.map((t) => ROUND_LABELS[t] || t).join(', ')];
        case 'invitations': return [String(row.invitations)];
        case 'completed': return [String(row.completed)];
        case 'created': return [formatISTStamp(row.createdAt), row.createdBy];
        default: return [''];
      }
    }));
    const tab = fixedStatus === 'published' ? 'Active' : fixedStatus === 'draft' ? 'Draft' : fixedStatus === 'archived' ? 'Archived' : 'All';
    const baseName = `AI_Interviews_${tab}_${new Date().toISOString().slice(0, 10)}`;
    let blob: Blob;
    let fileName: string;
    if (exportFormat === 'csv') {
      const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = [headers.map(q).join(','), ...data.map((cells) => cells.map(q).join(','))].join('\n');
      blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      fileName = `${baseName}.csv`;
    } else {
      const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>table{border-collapse:collapse}th,td{border:1px solid #000;padding:8px;text-align:left}th{background:#f0f0f0;font-weight:bold}</style></head><body><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.map((cells) => `<tr>${cells.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
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
    toast.success(`Exported ${selectedRows.length} records to ${exportFormat === 'csv' ? 'CSV' : 'Excel'}`);
    onExported?.({ format: exportFormat, recordCount: selectedRows.length, tab, ids: selectedRows.map((row) => row.id) });
    setShowExportModal(false);
  };

  useEffect(() => {
    if (!highlightId || highlightHandledRef.current || isLoading) return;

    /* Only the page on screen is loaded now. A just-published interview is
       the newest, so it is on page 1 in the default order; anywhere else
       there is nothing to scroll to. */
    if (!rows.some((row) => row.id === highlightId)) {
      highlightHandledRef.current = true;
      return;
    }

    highlightHandledRef.current = true;
    setFlashedRowId(highlightId);
    const frame = window.requestAnimationFrame(() => {
      rowRefs.current.get(highlightId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearFlash = window.setTimeout(() => setFlashedRowId(null), 2500);
    // Drop the deep-link params once handled so a later back/forward or
    // refresh on this URL doesn't keep re-triggering the scroll.
    router.replace('/recruitment/ai-interviews?tab=all-interviews', { scroll: false });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clearFlash);
    };
  }, [highlightId, isLoading, rows, router]);

  const isNarrowed = !!appliedSearch.trim() || hasAnyFilter(filters);

  const searchAndReset = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
    setPage(1);
  };

  const clearAll = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setPage(1);
  };

  const clearOne = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setDraftFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const chips: FilterChip[] = useMemo(() => {
    const out: FilterChip[] = [];
    if (filters.job) {
      const job = filterOptions?.jobs.find((j) => j.value === filters.job);
      out.push({
        key: 'job',
        label: 'Job',
        value: job ? `${job.label} (${job.value})` : filters.job,
        onRemove: () => clearOne({ job: '' }),
      });
    }
    if (filters.jobVersion) {
      out.push({
        key: 'jobVersion', label: 'Job Version', value: `V${filters.jobVersion}`,
        onRemove: () => clearOne({ jobVersion: '' }),
      });
    }
    if (filters.interviewVersion) {
      out.push({
        key: 'interviewVersion', label: 'Interview Version', value: `V${filters.interviewVersion}`,
        onRemove: () => clearOne({ interviewVersion: '' }),
      });
    }
    if (filters.status) {
      out.push({
        key: 'status', label: 'Status',
        value: STATUS_OPTIONS.find((s) => s.value === filters.status)?.label || filters.status,
        onRemove: () => clearOne({ status: '' }),
      });
    }
    if (filters.createdFrom || filters.createdTo) {
      const pretty = (d: string) => (d ? formatISTStamp(`${d}T00:00:00`).split(',')[0] : '');
      const from = pretty(filters.createdFrom);
      const to = pretty(filters.createdTo);
      out.push({
        key: 'created', label: 'Created',
        value: from && to ? `${from} – ${to}` : from ? `from ${from}` : `until ${to}`,
        onRemove: () => clearOne({ createdFrom: '', createdTo: '' }),
      });
    }
    return out;
  }, [filters, filterOptions]);

  const activeFilterCount = chips.length;

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'createdAt' || key === 'invitations' || key === 'completed' ? 'desc' : 'asc');
  };
  const clearSort = () => {
    setSortKey(null);
    setSortDir('desc');
  };

  /* Clear Sort — beside the host's Refresh, and only while a column sort is
     applied: with none there is nothing to clear. */
  const clearSortButton = sortKey ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={clearSort}
      title="Clear the column sort"
      icon={<X className="w-3.5 h-3.5" />}
      className="flex-shrink-0 !h-9 !text-sm"
    >
      Clear Sort
    </Button>
  ) : null;

  /* View is always available; Edit is Draft-only and additionally gated on
     canUpdateAIInterviews, the same permission the card list's own Edit
     button checks. It routes to the JD-selection config builder — AI
     interviews have no `create?edit=` route the way Assessments does. */
  const rowActions = (row: InterviewRow) => {
    const actions: { key: string; label: string; icon: typeof Eye; run: () => void; disabled?: boolean; reason?: string }[] = [
      {
        key: 'view', label: 'View', icon: Eye,
        run: () => router.push(detailsHref(row.id)),
      },
    ];
    // Draft-only and jdId are business conditions (stay a real hide); the
    // permission itself must not remove the item — visible but disabled.
    if (row.rawStatus === 'draft' && row.jdId) {
      const jdLocked = isJdDisabled(row.config.jd_status);
      actions.push({
        key: 'edit', label: 'Edit', icon: Pencil,
        run: () => {
          if (jdLocked) return;
          void resolveAIInterviewDraftResumeHref(row.id, row.jdId!).then((href) => router.push(href));
        },
        disabled: !canUpdateAIInterviews || jdLocked,
        reason: jdLocked ? JD_DISABLED_ACTION_MESSAGE : 'You do not have permission to edit AI interviews',
      });
    }
    return actions;
  };

  /* The Actions control for one row — the host's menu when given, else this
     table's own View / Edit menu. Shared by the table row and the card. */
  const actionsCell = (row: InterviewRow) => renderRowActions ? (
  renderRowActions(row.config, row.completed)
) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-slate-400 hover:bg-brand-blue/10 hover:text-brand-blue transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          aria-label={`Actions for ${row.jobName}`}
          title="Actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`w-44 ${MENU_PANEL_BORDER_CLASS}`}>
        {rowActions(row).map(({ key, label, icon: Icon, run, disabled, reason }) => (
          /* aria-disabled, not Radix `disabled`: its pointer-events:none
             swallowed the permission tooltip. Locked = no-op click. */
          <DropdownMenuItem
            key={key}
            onClick={disabled ? undefined : run}
            onSelect={disabled ? (e) => e.preventDefault() : undefined}
            aria-disabled={disabled || undefined}
            title={disabled ? reason : undefined}
            className={`group gap-2 ${MENU_ITEM_LIGHT_HIGHLIGHT_CLASS} ${disabled ? 'text-gray-400 cursor-not-allowed opacity-60' : ''}`}
          >
            <Icon className="w-4 h-4" />
            <span className={MENU_ITEM_SCALE_CLASS}>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /* Expandable rows: which rows are open, and which columns the row itself
     shows — the rest render in its expanded panel through `cellContent`. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const shownColumns = expandableRows ? COLUMNS.filter((c) => PRIMARY_COLUMN_KEYS.includes(c.key)) : COLUMNS;
  const detailColumns = expandableRows ? COLUMNS.filter((c) => !PRIMARY_COLUMN_KEYS.includes(c.key)) : [];

  const CELL_CLASS: Record<SortKey, string> = {
    jobId: 'px-3 py-2.5 align-middle whitespace-nowrap tf-sticky-col-left',
    jobName: 'px-3 py-2.5 align-middle',
    jobVersion: 'px-3 py-2.5 align-middle whitespace-nowrap text-center',
    interviewVersion: 'px-3 py-2.5 align-middle whitespace-nowrap text-center',
    status: 'px-3 py-2.5 align-middle whitespace-nowrap',
    rounds: 'px-3 py-2.5 align-middle whitespace-nowrap',
    invitations: 'px-3 py-2.5 align-middle whitespace-nowrap text-center',
    completed: 'px-3 py-2.5 align-middle whitespace-nowrap text-center',
    createdAt: 'px-3 py-2.5 align-middle whitespace-nowrap',
    createdBy: `px-3 py-2.5 align-middle max-w-[12rem] ${HIDE_CLASS.lg}`,
  };

  const cellContent = (row: InterviewRow, key: SortKey) => {
    switch (key) {
      case 'jobId':
        return row.jobId ? <JobIdBadge>{row.jobId}</JobIdBadge> : <span className="tf-hint">—</span>;
      case 'jobName':
        return (
          /* Fixed width on the wrapper, not the td: a table cell's max-width
             is ignored, so a long job name widened the column uncut. Longer
             names end in "…" with the full name on hover (title). */
          <div className="flex items-center gap-1.5 w-[10rem] sm:w-[12rem]">
            <span
              className="block min-w-0 truncate font-medium text-gray-900 dark:text-slate-50"
              title={row.jobName}
            >
              {row.jobName}
            </span>
            {(() => {
              const lockBadge = jobLockBadgeFor(row.config.jd_status, row.jdId ? jdLineage.filterLineages[row.jdId] : undefined);
              return lockBadge ? <AIInterviewJobStatusBadge kind={lockBadge} /> : null;
            })()}
          </div>
        );
      case 'jobVersion':
        return <VersionPill kind="job" version={row.jobVersion} />;
      case 'interviewVersion':
        return <VersionPill kind="interview" version={row.interviewVersion} />;
      case 'status':
        return (
          <>
            <StatusBadge status={row.status} />
            {/* Live, with saved edits waiting for Publish. */}
            {hasUnpublishedChanges(row.config) && <UnpublishedChangesChip className="ml-1.5 align-middle" />}
          </>
        );
      case 'rounds':
        return row.rounds.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-nowrap">
            {row.rounds.map((type, index) => (
              <span
                key={`${type}-${index}`}
                title={ROUND_LABELS[type] || type}
                className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
              >
                {ROUND_SHORT_LABELS[type] || ROUND_LABELS[type] || type}
              </span>
            ))}
          </div>
        ) : (
          <span className="tf-hint">—</span>
        );
      case 'invitations':
        return (
          <>
            <span className="tabular-nums text-gray-900 dark:text-slate-100">
              {row.invitations.toLocaleString()}
            </span>
          </>
        );
      case 'completed':
        return (
          <>
            {row.completedPending
              ? <span aria-label="Loading" className="inline-block h-4 w-6 rounded bg-gray-200 dark:bg-slate-700 animate-pulse align-middle" />
              : (
                <span className="tabular-nums text-gray-900 dark:text-slate-100">
                  {row.completed.toLocaleString()}
                </span>
              )}
          </>
        );
      case 'createdAt':
        return (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-gray-600 dark:text-slate-400 tabular-nums">
              {formatISTStamp(row.createdAt)}
            </span>
            <CreatedBy name={row.createdBy} />
          </div>
        );
      case 'createdBy':
        return <CreatedBy name={row.createdBy} />;
    }
  };

  const columnCount = shownColumns.length + 2; // + Select + Actions
  /* Whether the table has data rows to lay out — and so whether its header
     belongs on screen at all.
     With none, the header is the only thing left forcing a width: its cells are
     `nowrap`, so the table stays wider than `tf-table-shell` and the single
     empty-state cell gets centred across THAT width rather than the visible
     one — the message drifts off the side behind a horizontal scrollbar that
     exists only to reach it. Nothing to label means nothing to be wide for.
     See `TABLE_EMPTY_PANEL_CLASS`. */
  const hasBodyRows = isLoading || (!error && pageRows.length > 0);

  /* Load-error and no-rows panels — the table's single full-width cell, or
     the card grid's whole body. */
  const errorPanel = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
      <div className="w-14 h-14 rounded-full bg-destructive-subtle ring-1 ring-destructive-line flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <h3 className="tf-section-title mb-1">
        Unable to load interviews
      </h3>
      <p className="tf-body-secondary mb-4 max-w-md mx-auto">
        Something went wrong while loading the interview list. Please try again.
      </p>
      <Button variant="primary" size="sm" onClick={retry} icon={<RefreshCw className="w-4 h-4" />}>
        Retry
      </Button>
    </div>
  );
  const emptyPanel = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
      <div className="w-14 h-14 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
        <Video className="w-7 h-7 text-brand-blue" />
      </div>
      <h3 className="tf-section-title mb-1">
        {isNarrowed ? 'No interviews found' : 'No interviews yet'}
      </h3>
      <p className="tf-body-secondary mb-4 max-w-md mx-auto">
        {isNarrowed
          ? 'No interviews match your current search or filter criteria.'
          : 'AI interviews you create will be listed here.'}
      </p>
      {isNarrowed && (
        <Button variant="secondary" size="sm" onClick={clearAll} icon={<X className="w-4 h-4" />}>
          Clear Filters
        </Button>
      )}
    </div>
  );

  const toolbar = (
    <>

      {/* ── Search & filter toolbar ── Portalled into the page's toolbar
          card, it takes no card of its own — Total Jobs' toolbar sits in that
          slot bare, so a second border here drew a box inside the box. */}
      <div className={toolbarSlot ? '' : 'bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4'}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => searchAndReset(e.target.value)}
              placeholder="Search interview..."
              aria-label="Search interviews by job name or job ID"
              disabled={isLoading && rows.length === 0}
              className="tf-input pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => searchAndReset('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={`h-9 px-3 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium border transition-colors flex-shrink-0 ${
              activeFilterCount > 0
                ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/25'
                : filtersOpen
                  ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
                  : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-brand-blue/40 hover:text-brand-blue'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">More Filters</span>
            <span className="sm:hidden">Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 min-w-[1.25rem] h-5 px-1 inline-flex items-center justify-center rounded-full bg-white/25 text-xs font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Sort by lands here — see `useListSortSlot`. */}
          <span data-list-sort-slot className="contents" />
          {/* Actions (N) + Clear — only while rows are ticked. */}
          {selectedRows.length > 0 && (
            <ListBulkActions>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative h-9 px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
                    aria-label={`Actions for ${selectedRows.length} selected`}
                  >
                    <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
                    </span>
                    Actions ({selectedRows.length})
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 overflow-hidden !rounded-lg !bg-white !pt-0 !pb-1 !px-0 !shadow-xl [&_[role=menuitem][data-highlighted]]:!bg-gray-100 [&_[role=menuitem]:hover]:!bg-gray-100">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500 flex items-center justify-between gap-2">
                    <span>{selectedRows.length.toLocaleString()} selected</span>
                    {selectedIds.size < total && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); void selectAllMatching(); }}
                        disabled={selectingAll}
                        className="normal-case font-medium text-brand-blue hover:underline disabled:opacity-50"
                      >
                        {selectingAll ? 'Selecting…' : `Select all ${total.toLocaleString()}`}
                      </button>
                    )}
                  </div>
                  <DropdownMenuItem
                    aria-disabled={!canExport || undefined}
                    title={canExport ? undefined : 'You do not have permission to export AI interviews'}
                    onSelect={(e) => { if (!canExport) { e.preventDefault(); return; } setShowExportModal(true); }}
                    className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExport ? 'cursor-pointer' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
                  >
                    <FileDown className={`w-4 h-4 ${canExport ? 'text-menu-icon-download' : 'text-gray-300'}`} />
                    <span>Export</span>
                  </DropdownMenuItem>
                  {bulkActions && bulkKinds.map((kind) => {
                    const { label, Icon, className } = BULK_META[kind];
                    const reasons = selectedRows.map((row) => bulkSkipReason(kind, row, bulkActions));
                    const eligibleCount = reasons.filter((r) => r === null).length;
                    const total = selectedRows.length;
                    const none = eligibleCount === 0;
                    // No ticked row qualifies: greyed with the reason, never hidden (RBAC rule).
                    const firstReason = reasons.find((r) => r !== null) ?? '';
                    return (
                      <DropdownMenuItem
                        key={kind}
                        aria-disabled={none || undefined}
                        title={none ? `None of the selected can be ${label === 'Delete' ? 'deleted' : `${label.toLowerCase()}d`} — ${firstReason}` : undefined}
                        onSelect={(e) => { if (none) { e.preventDefault(); return; } void runBulk(kind); }}
                        className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${
                          none ? 'text-gray-400 cursor-not-allowed opacity-60' : kind === 'delete' ? 'cursor-pointer text-destructive' : 'cursor-pointer'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${none ? 'text-gray-300' : className}`} />
                        <span>{label} ({eligibleCount === total ? total : `${eligibleCount} of ${total}`})</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                icon={<X className="w-4 h-4" />}
                className="whitespace-nowrap !h-9 !text-sm"
              >
                Clear
              </Button>
            </ListBulkActions>
          )}
          {onDisplayModeChange && (
            <ListViewToggle value={displayMode} onChange={onDisplayModeChange} className="self-start sm:self-auto" />
          )}
        </div>

        {filtersOpen && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700/60">
            <div className="tf-grid-4">
              <SearchableSelect
                label="Job"
                value={draftFilters.job}
                onChange={(v) => setDraftFilters((f) => ({ ...f, job: v }))}
                options={jobOptions}
                placeholder="All jobs"
                searchPlaceholder="Search job or ID..."
                allLabel="All jobs"
                emptyMessage="No jobs match"
              />
              <SearchableSelect
                label="Job Version"
                value={draftFilters.jobVersion}
                onChange={(v) => setDraftFilters((f) => ({ ...f, jobVersion: v }))}
                options={jobVersionOptions}
                placeholder="All versions"
                searchPlaceholder="Search version..."
                allLabel="All versions"
                emptyMessage="No versions match"
              />
              <SearchableSelect
                label="Interview Version"
                value={draftFilters.interviewVersion}
                onChange={(v) => setDraftFilters((f) => ({ ...f, interviewVersion: v }))}
                options={interviewVersionOptions}
                placeholder="All versions"
                searchPlaceholder="Search version..."
                allLabel="All versions"
                emptyMessage="No versions match"
              />
              {/* Redundant once the whole table is locked to one status. */}
              {!fixedStatus && (
                <SearchableSelect
                  label="Status"
                  value={draftFilters.status}
                  onChange={(v) => setDraftFilters((f) => ({ ...f, status: v }))}
                  options={STATUS_OPTIONS}
                  placeholder="All statuses"
                  searchPlaceholder="Search status..."
                  allLabel="All statuses"
                  emptyMessage="No statuses match"
                />
              )}

              <div className="sm:col-span-2">
                <label
                  htmlFor="all-interviews-created-from"
                  className="block tf-caption mb-1.5"
                >
                  Created On
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <DateField
                    id="all-interviews-created-from"
                    aria-label="Created from"
                    value={draftFilters.createdFrom}
                    max={draftFilters.createdTo || undefined}
                    onChange={(v) => setDraftFilters((f) => ({ ...f, createdFrom: v }))}
                    className="sm:flex-1 sm:min-w-0"
                  />
                  <span className="tf-hint text-center sm:text-left sm:flex-shrink-0">to</span>
                  <DateField
                    aria-label="Created to"
                    value={draftFilters.createdTo}
                    min={draftFilters.createdFrom || undefined}
                    onChange={(v) => setDraftFilters((f) => ({ ...f, createdTo: v }))}
                    className="sm:flex-1 sm:min-w-0"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3">
              <Button variant="secondary" size="sm" onClick={clearAll} icon={<X className="w-4 h-4" />}>
                Clear All
              </Button>
              <Button variant="primary" size="sm" onClick={applyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      <FilterChips chips={chips} onClearAll={clearAll} className="mb-3" />
    </>
  );

  return (
    <div className="p-3 sm:p-6">
      {toolbarSlot ? createPortal(toolbar, toolbarSlot) : toolbar}
      {clearSortButton && (sortActionSlot
        ? createPortal(clearSortButton, sortActionSlot)
        : <div className="flex justify-end mb-3">{clearSortButton}</div>)}

      {/* ── Card view ── the Candidate Results tab's card grid: one card per
          row, carrying the same fields the table shows. */}
      {displayMode === 'grid' ? (
      <div className="tf-card-soft overflow-hidden">
        {isLoading ? (
          <div className="tf-grid-4 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="rounded-xl border border-gray-100 dark:border-slate-700/60 p-4 flex flex-col gap-3">
                <div className="h-4 w-2/3 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          errorPanel
        ) : pageRows.length === 0 ? (
          emptyPanel
        ) : (
          <div className="tf-grid-4 p-4">
            {pageRows.map((row) => {
              const isSelected = selectedIds.has(row.id);
              return (
                /* A div, not a <button>: the host's Actions menu is a button
                   and must not nest inside one. */
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRow(row)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openRow(row); }}
                  className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5 transition-all p-4 flex flex-col gap-3 cursor-pointer ${
                    flashedRowId === row.id ? 'bg-brand-blue/10 dark:bg-brand-blue/15' : ''
                  } ${gridCardSelectedClass(isSelected)}`}
                >
                  <GridCardSelect
                    selected={isSelected}
                    onToggle={() => toggleSelected(row.id)}
                    label={row.jobName}
                    selectionActive={selectedIds.size > 0}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">{cellContent(row, 'jobName')}</div>
                    <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                      {actionsCell(row)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {row.jobId && <JobIdBadge>{row.jobId}</JobIdBadge>}
                    <span title="Job version"><VersionPill kind="job" version={row.jobVersion} /></span>
                    <span title="Interview version"><VersionPill kind="interview" version={row.interviewVersion} /></span>
                  </div>

                  <div className="flex items-center flex-wrap gap-y-1">{cellContent(row, 'status')}</div>

                  {row.rounds.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {row.rounds.map((type, index) => (
                        <span
                          key={`${type}-${index}`}
                          title={ROUND_LABELS[type] || type}
                          className="tf-badge text-2xs bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                        >
                          {ROUND_SHORT_LABELS[type] || ROUND_LABELS[type] || type}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-sm">
                    {/* No column headers on a card, so the counts keep their words
                        (the table cells show the number alone). */}
                    <span>{cellContent(row, 'invitations')}<span className="tf-hint ml-1">sent</span></span>
                    <span>{cellContent(row, 'completed')}<span className="tf-hint ml-1">completed</span></span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-slate-800 text-xs">
                    <span className="text-gray-500 dark:text-slate-500 tabular-nums">{formatISTStamp(row.createdAt)}</span>
                    <CreatedBy name={row.createdBy} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      ) : (
      <>
      {/* ── The table ── */}
      <div className={`tf-card-soft overflow-hidden ${DESKTOP_TABLE_ONLY}`}>
        <div ref={scrollRef} className="tf-table-shell">
          <table className="w-full text-sm border-collapse">
            {hasBodyRows && (
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                {/* Select All — this page's rows. Not pinned: Job ID is the
                    pinned column, and it covers this one as the table scrolls. */}
                <th scope="col" className="tf-th-cell pl-3 pr-0 w-10 tf-th">
                  {/* Loading: the header is skeleton bars too, as in the shared
                      TableSkeleton — no real labels until the rows arrive. */}
                  {isLoading ? (
                    <div className="h-4 w-4 ml-1 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                  ) : (
                  <button
                    type="button"
                    onClick={toggleAllOnPage}
                    disabled={isLoading}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40"
                    aria-label={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    title={allOnPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                  >
                    {allOnPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-brand-blue" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  )}
                </th>
                {shownColumns.map((col) => {
                  const isSorted = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2.5 whitespace-nowrap align-middle text-xs font-semibold text-gray-600 dark:text-slate-300 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''} ${col.key === 'jobId' ? 'tf-sticky-col-left' : ''}`}
                    >
                      {isLoading ? (
                        <div className={`h-3.5 w-16 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse ${col.align === 'right' ? 'ml-auto' : col.align === 'center' ? 'mx-auto' : ''}`} />
                      ) : (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        disabled={!!error}
                        className="inline-flex items-center transition-colors hover:text-brand-blue disabled:cursor-not-allowed"
                        title={`Sort by ${col.label}`}
                      >
                        {/* A long title (Invitations Sent, Interview Version…) wraps to two lines past 8rem. */}
                        <span className={`inline-block w-max max-w-[8rem] whitespace-normal leading-tight ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}>{col.label}</span>
                      </button>
                      )}
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="tf-th-cell text-right tf-th tf-sticky-col"
                >
                  {isLoading ? <div className="h-3.5 w-14 ml-auto rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" /> : 'Actions'}
                </th>
              </tr>
            </thead>
            )}

            <tbody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b border-gray-100 dark:border-slate-700/60">
                    <td className="tf-td pl-3 pr-0 w-10">
                      <div className="h-4 w-4 ml-1 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                    </td>
                    {shownColumns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''} ${col.key === 'jobId' ? 'tf-sticky-col-left' : ''}`}
                      >
                        <div
                          className="h-3.5 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse"
                          style={{ width: col.key === 'jobName' ? '80%' : '55%' }}
                        />
                      </td>
                    ))}
                    <td className="tf-td tf-sticky-col">
                      <div className="h-6 w-6 ml-auto rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                    </td>
                  </tr>
                ))}

              {!isLoading && error && (
                <tr>
                  <td colSpan={columnCount} className="p-0">{errorPanel}</td>
                </tr>
              )}

              {!isLoading && !error && pageRows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="p-0">{emptyPanel}</td>
                </tr>
              )}

              {!isLoading &&
                !error &&
                pageRows.map((row) => {
                  const isExpanded = expandableRows && expandedIds.has(row.id);
                  return (
                  <Fragment key={row.id}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.id, el);
                      else rowRefs.current.delete(row.id);
                    }}
                    onClick={() => (expandableRows ? toggleExpanded(row.id) : openRow(row))}
                    aria-expanded={expandableRows ? isExpanded : undefined}
                    className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 cursor-pointer transition-colors duration-700 hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 ${
                      flashedRowId === row.id ? 'bg-brand-blue/10 dark:bg-brand-blue/15' : isExpanded ? 'bg-brand-blue/[0.03] dark:bg-brand-blue/5' : ''
                    }`}
                  >
                    <td className="tf-td pl-3 pr-0 w-10" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleSelected(row.id)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
                        aria-label={selectedIds.has(row.id) ? `Deselect ${row.jobName}` : `Select ${row.jobName}`}
                      >
                        {selectedIds.has(row.id) ? (
                          <CheckSquare className="w-4 h-4 text-brand-blue" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </td>

                    {/* Job ID stays pinned on the left while the table scrolls sideways. */}
                    {shownColumns.map((col) => (
                      <td key={col.key} className={CELL_CLASS[col.key]}>
                        {cellContent(row, col.key)}
                      </td>
                    ))}

                    <td
                      className="tf-td text-right tf-sticky-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                      {/* The Resume Scoring list's expand control. */}
                      {expandableRows && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toggleExpanded(row.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Hide details' : 'Show details'}
                          title={isExpanded ? 'Hide details' : 'Show details'}
                          className="h-8 w-8"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </Button>
                      )}
                      {actionsCell(row)}
                      </div>
                    </td>
                  </tr>
                  {/* The columns the row leaves out, as the Resume Scoring
                      list's expanded full-width row. */}
                  {isExpanded && (
                    <tr className="bg-gray-50/60 dark:bg-slate-800/20 border-b border-gray-100 dark:border-slate-700/60 last:border-b-0">
                      <td colSpan={columnCount} className="tf-td pt-3 pb-4">
                        <dl className="tf-grid-stats">
                          {detailColumns.map((col) => (
                            <div key={col.key} className="min-w-0">
                              <dt className="text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                                {col.label}
                              </dt>
                              <dd className="text-sm min-w-0">{cellContent(row, col.key)}</dd>
                            </div>
                          ))}
                        </dl>
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
      <MobileRecordList
        empty={
          isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`m-skeleton-${i}`} className="tf-record-card flex flex-col gap-3">
                <div className="h-4 w-1/3 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
              </div>
            ))
          ) : error ? (
            <div className="tf-card-soft overflow-hidden">{errorPanel}</div>
          ) : (
            <div className="tf-card-soft overflow-hidden">{emptyPanel}</div>
          )
        }
      >
        {!isLoading && !error && pageRows.map((row) => {
          const lockBadge = jobLockBadgeFor(row.config.jd_status, row.jdId ? jdLineage.filterLineages[row.jdId] : undefined);
          return (
            <MobileRecordCard
              key={row.id}
              selected={selectedIds.has(row.id)}
              className={flashedRowId === row.id ? 'bg-brand-blue/10 dark:bg-brand-blue/15' : undefined}
              select={
                <button
                  type="button"
                  onClick={() => toggleSelected(row.id)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
                  aria-label={selectedIds.has(row.id) ? `Deselect ${row.jobName}` : `Select ${row.jobName}`}
                >
                  {selectedIds.has(row.id) ? (
                    <CheckSquare className="w-4 h-4 text-brand-blue" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              }
              idBadge={row.jobId ? <JobIdBadge>{row.jobId}</JobIdBadge> : undefined}
              badges={cellContent(row, 'status')}
              title={<span title={row.jobName}>{row.jobName}</span>}
              titleAddon={lockBadge ? <AIInterviewJobStatusBadge kind={lockBadge} /> : undefined}
              actions={actionsCell(row)}
              fields={[
                { label: 'Job Version', value: cellContent(row, 'jobVersion') },
                { label: 'Interview Version', value: cellContent(row, 'interviewVersion') },
                { label: 'Rounds', value: row.rounds.length > 0 ? <span className="inline-flex flex-wrap gap-1.5">{cellContent(row, 'rounds')}</span> : '—' },
                { label: 'Created', value: <span className="tabular-nums">{formatISTStamp(row.createdAt)}</span> },
                { label: 'By', value: <CreatedBy name={row.createdBy} /> },
              ]}
              footer={
                <>
                  <MobileStatChip tone="info" icon={<Send />}>{row.invitations.toLocaleString()} Sent</MobileStatChip>
                  <MobileStatChip tone="success" icon={<CheckCircle2 />}>
                    {row.completedPending
                      ? <span aria-label="Loading" className="inline-block h-3 w-5 rounded bg-gray-200 dark:bg-slate-700 animate-pulse align-middle" />
                      : row.completed.toLocaleString()} Completed
                  </MobileStatChip>
                </>
              }
              onClick={() => (expandableRows ? toggleExpanded(row.id) : openRow(row))}
            />
          );
        })}
      </MobileRecordList>
      </>
      )}

      {!isLoading && !error && (
        <ListPagination
          currentPage={safePage}
          itemsPerPage={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onItemsPerPageChange={(size) => { setPageSize(size); setPage(1); }}
          itemLabel="interviews"
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          scrollContainerRef={scrollRef}
        />
      )}

      {/* Export (Actions menu) — format, then the columns to include. */}
      {showExportModal && (
        <ExportColumnsModal<'csv' | 'xls'>
          title="Export Interviews"
          recordCount={selectedRows.length}
          formats={[
            { key: 'csv', title: 'CSV Format', description: 'Compatible with Excel, Google Sheets, and most spreadsheet apps.', Icon: FileText, iconWrap: 'bg-success-subtle', iconColor: 'text-success' },
            { key: 'xls', title: 'Excel Format (.xls)', description: 'Native Excel format with formatting and styling.', Icon: FileSpreadsheet, iconWrap: 'bg-blue-100', iconColor: 'text-blue-700' },
          ]}
          format={exportFormat}
          onFormatChange={setExportFormat}
          columns={EXPORT_COLUMNS}
          initialColumnIds={EXPORT_COLUMNS.map((c) => c.id)}
          onExport={handleExport}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
