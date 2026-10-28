'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListBulkActions } from '@/components/ui/list-toolbar-slot';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, X, Video, MoreVertical, Eye, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, RefreshCw, SlidersHorizontal,
  Square, CheckSquare, ChevronDown, FileDown, FileText, FileSpreadsheet,
  Archive, ArchiveRestore, Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { Button } from '@/components/ui/button';
import ListPagination from '@/components/ListPagination';
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
import NameAvatar from '@/components/ui/name-avatar';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { DateField } from '@/components/ui/date-field';
import { aiInterviewService, isJdDisabled, jdActionLockReason, JD_DISABLED_ACTION_MESSAGE, JD_ARCHIVED_ACTION_MESSAGE, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import ExportColumnsModal from '@/components/ExportColumnsModal';
import { toast } from 'sonner';
import { formatISTStamp, parseIST } from '@/lib/utils/dateUtils';
import type { JDLineageVersion } from '@/lib/services/jdService';
import { jobVersionDisplayStatus } from '@/components/assessments/AssessmentVersionHistoryPanel';
import { useJobVersionLineage } from '@/lib/hooks/useJobVersionLineage';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { readListSnapshot, writeListSnapshot, clearListSnapshots, perfNote } from '@/lib/utils/listSnapshot';
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
   ordinal here is derived exactly the way AIInterview.tsx's own version
   history panel derives it: the Nth config created against a given job
   version (`jd_id`), oldest first. Computed once over the WHOLE loaded set
   (draft + published + archived), because a version's number must not shift
   depending on which statuses happen to be visible. */
function withInterviewVersions(items: AIInterviewResponse[]): InterviewRow[] {
  const byJobVersion = new Map<string, AIInterviewResponse[]>();
  for (const config of items) {
    if (!config.jd_id) continue;
    const bucket = byJobVersion.get(config.jd_id);
    if (bucket) bucket.push(config);
    else byJobVersion.set(config.jd_id, [config]);
  }
  const ordinalById = new Map<string, number>();
  for (const bucket of byJobVersion.values()) {
    bucket
      .slice()
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
      .forEach((config, index) => ordinalById.set(config.id, index + 1));
  }

  return items.map((config) => {
    const raw = normalizeStatus(String(config.status || 'draft').toLowerCase());
    return {
      id: config.id,
      interviewId: config.display_id || '',
      jobId: config.jd_short_id || '',
      jobName: config.jd_title || config.position || 'General Interview',
      jobVersion: config.jd_version ?? 1,
      interviewVersion: ordinalById.get(config.id) ?? 1,
      jdId: config.jd_id,
      rawStatus: raw,
      status: STATUS_LABEL[raw] || 'Draft',
      rounds: (config.rounds_config || [])
        .filter((round) => round.enabled !== false)
        .map((round) => round.type),
      invitations: config.invitations_count ?? 0,
      completed: 0,
      createdAt: config.created_at,
      createdSort: parseIST(config.created_at).getTime() || 0,
      createdBy: config.created_by_name || 'System',
      config,
    };
  });
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

/* Marks a job whose JD is disabled: its interviews stay listed and viewable,
   but every action on them is off until the JD is enabled again. */
export function JobDisabledBadge() {
  return (
    <span
      title={JD_DISABLED_ACTION_MESSAGE}
      className="inline-flex items-center flex-shrink-0 px-2 py-0.5 rounded-full text-2xs font-medium whitespace-nowrap ring-1 text-gray-600 bg-gray-100 ring-gray-200 dark:text-slate-300 dark:bg-slate-800 dark:ring-slate-700"
    >
      Job Disabled
    </span>
  );
}

/** Which job badge (if any) to show beside a job name: the JD's own Disabled /
 *  Archived status, unless another version of the same job is still Published
 *  or Republished — one closed version does not speak for a live job.
 *  `versions` undefined (not loaded yet) falls back to the JD's own status. */
export function jobLockBadgeFor(
  jdStatus: string | null | undefined,
  versions: JDLineageVersion[] | undefined,
): 'disabled' | 'archived' | null {
  const own = isJdDisabled(jdStatus)
    ? 'disabled'
    : String(jdStatus || '').toLowerCase() === 'archived'
      ? 'archived'
      : null;
  if (!own || !versions?.length) return own;
  const anyLive = versions.some((v) => {
    const label = jobVersionDisplayStatus(v.status, v.current_version);
    return label === 'Published' || label === 'Republished';
  });
  return anyLive ? null : own;
}

/* Marks a job whose JD is archived — same shape as JobDisabledBadge, in the
   Archived status pill's colours. */
export function JobArchivedBadge() {
  return (
    <span
      title={JD_ARCHIVED_ACTION_MESSAGE}
      className="inline-flex items-center flex-shrink-0 px-2 py-0.5 rounded-full text-2xs font-medium whitespace-nowrap ring-1 bg-brand-orange/10 text-brand-orange-deep dark:text-brand-orange ring-brand-orange/20"
    >
      Job Archived
    </span>
  );
}

function CreatedBy({ name }: { name: string }) {
  return (
    // Capped, so a long creator name ends in "…" (full name on hover)
    // instead of widening the Created column.
    <span className="inline-flex items-center gap-2 min-w-0 max-w-[10rem]">
      <NameAvatar name={name} size="xs" title="" />
      <span className="truncate text-sm text-gray-600 dark:text-slate-400" title={name}>
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
  /** The host page's slot in its tab-pills row (before Refresh). When given,
   *  Actions (N) + Clear render there instead of inline in the toolbar. */
  bulkActionSlot?: HTMLElement | null;
  /**
   * DOM node beside the host's Refresh button that the Clear Sort button
   * portals into, so it sits in the pill row with the page's other list
   * actions. Falls back to rendering above the table when unset.
   */
  sortActionSlot?: HTMLElement | null;
  /** The host's Sort by dropdown; orders the rows until a column header is clicked. */
  defaultSort?: 'newest' | 'oldest' | 'active' | 'draft';
  /**
   * Every interview (live + archived) the host has ALREADY loaded. Used to draw
   * the table at once on a first visit instead of asking the server for the
   * same list again; the table still refetches in the background and swaps the
   * fresh rows in. Leave unset until the host's own load has finished.
   */
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
  renderRowActions?: (config: AIInterviewResponse) => React.ReactNode;
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

/**
 * Every interview as table rows: the list first (handed to `onList` as soon as
 * it is ready), then each row's Completed count. Module level so the page can
 * warm the tab (`prefetchInterviewRows`) through the same code the table uses.
 */
async function loadInterviewRows(onList: (rows: InterviewRow[]) => void): Promise<InterviewRow[]> {
  const startedAt = performance.now();
  const { live, archived } = await aiInterviewService.listAllConfigsSplit();

  const seen = new Set<string>();
  const merged: AIInterviewResponse[] = [];
  for (const config of [...live, ...archived]) {
    if (seen.has(config.id)) continue;
    seen.add(config.id);
    merged.push(config);
  }
  const rows = withInterviewVersions(merged);

  /* The list response carries no finished-sessions count, so it is read off
     the batched `/invitation-counts` endpoint — a SECOND request. The rows
     are handed to the table first, with Completed marked pending (carrying
     over the last known figure meanwhile), so the list is on screen as soon
     as the first request answers instead of after both. */
  const withInvites = rows.filter((row) => row.invitations > 0);
  const known = new Map((readListSnapshot<InterviewRow[]>('ai-interviews:rows') ?? []).map((r) => [r.id, r.completed]));
  for (const row of withInvites) {
    row.completed = known.get(row.id) ?? 0;
    row.completedPending = true;
  }
  onList([...rows]);
  perfNote('All Interviews — rows ready', startedAt);

  const COUNTS_BATCH = 200; // backend cap on ids per request
  for (let start = 0; start < withInvites.length; start += COUNTS_BATCH) {
    const batch = withInvites.slice(start, start + COUNTS_BATCH);
    try {
      const counts = await aiInterviewService.getInvitationCounts(batch.map((row) => row.id));
      for (const row of batch) row.completed = counts[row.id]?.completed || 0;
    } catch {
      /* Older backend / transient error: fall back to the per-config probe
         for this batch, ten at a time. A failed probe leaves that row at 0. */
      for (let i = 0; i < batch.length; i += 10) {
        await Promise.all(
          batch.slice(i, i + 10).map(async (row) => {
            try {
              const res = await aiInterviewService.getConfigInvitations(row.id, { page: 1, page_size: 1, compact: true });
              row.completed = res.completed || 0;
            } catch {
              /* leave at 0 */
            }
          }),
        );
      }
    }
    for (const row of batch) row.completedPending = false;
  }
  perfNote('All Interviews — counts complete', startedAt);
  return rows;
}

/** Loads the rows (counts included) and remembers them, so the tab draws complete at once. */
export async function prefetchInterviewRows(): Promise<void> {
  const rows = await loadInterviewRows(() => {});
  writeListSnapshot('ai-interviews:rows', rows.map((row) => ({ ...row })));
}

export default function AllInterviewsTable({ toolbarSlot, sortActionSlot, defaultSort = 'newest', seedConfigs, refreshSignal, fixedStatus, renderRowActions, expandableRows = false, displayMode = 'list', onDisplayModeChange, bulkActions, canExport = true, onExported }: AllInterviewsTableProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTenantAdmin, user } = useAuth();
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;

  /* First paint, best source first: what this table last loaded (any tab of it
     shares one remembered set), else what the host page already holds. Either
     way the skeleton is skipped and the background fetch below corrects it. */
  const [initial] = useState(() => {
    const remembered = readListSnapshot<InterviewRow[]>('ai-interviews:rows');
    const seeded = !remembered && seedConfigs && seedConfigs.length > 0
      ? withInterviewVersions(seedConfigs).map((row) => (row.invitations > 0 ? { ...row, completedPending: true } : row))
      : null;
    const start = remembered ?? seeded;
    return {
      rows: start ? (fixedStatus ? start.filter((r) => r.rawStatus === fixedStatus) : start) : ([] as InterviewRow[]),
      hasRows: !!start,
    };
  });
  const hasLoadedOnce = useRef(false);
  const [rows, setRows] = useState<InterviewRow[]>(initial.rows);
  const [isLoading, setIsLoading] = useState(!initial.hasRows);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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

  /* Two requests, not one: `listConfigs` with no status filter excludes
     archived configs (AIInterview.tsx loads them separately for the same
     reason), and "All Interviews" means every version regardless of status. */
  const fetchAll = loadInterviewRows;

  useEffect(() => {
    let alive = true;
    // A load after the first follows a change (reload, Retry): drop what other
    // tabs remembered rather than show it stale.
    const isRefresh = hasLoadedOnce.current;
    hasLoadedOnce.current = true;
    const show = (next: InterviewRow[]) => {
      if (!alive) return;
      // Ordinals are computed over the WHOLE set before this filter runs, so a
      // version's number still reflects its true position in the lineage rather
      // than shifting once other statuses are hidden.
      setRows(fixedStatus ? next.filter((r) => r.rawStatus === fixedStatus) : next);
      setError(null);
      setIsLoading(false);
    };
    fetchAll(show)
      .then((next) => {
        if (!alive) return;
        // Fresh objects, so the rows whose Completed just landed re-render.
        const settled = next.map((row) => ({ ...row }));
        if (isRefresh) clearListSnapshots();
        writeListSnapshot('ai-interviews:rows', settled);
        show(settled);
      })
      .catch((err) => {
        if (!alive) return;
        console.error('[TalentFlow] Failed to load interviews:', err);
        setError(err instanceof Error ? err.message : 'Failed to load interviews');
        setRows([]);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchAll, reloadToken, fixedStatus]);

  const retry = () => {
    setIsLoading(true);
    setError(null);
    setReloadToken((t) => t + 1);
  };

  /* Host's Refresh button — skips the mount value (undefined -> 0) so this
     doesn't double-fetch alongside the initial load effect above. */
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

  const jobOptions: SearchableSelectOption[] = useMemo(() => {
    const byId = new Map<string, { label: string; count: number }>();
    for (const row of rows) {
      if (!row.jobId) continue;
      const entry = byId.get(row.jobId) ?? { label: row.jobName, count: 0 };
      entry.count += 1;
      byId.set(row.jobId, entry);
    }
    return [...byId.entries()]
      .sort((a, b) => text(a[1].label, b[1].label))
      .map(([id, { label, count }]) => ({
        value: id,
        label: `${label} (${id})`,
        hint: String(count),
      }));
  }, [rows]);

  const versionOptions = useCallback(
    (pick: (row: InterviewRow) => number): SearchableSelectOption[] => {
      const seen = new Set<number>();
      for (const row of rows) seen.add(pick(row));
      return [...seen]
        .sort((a, b) => a - b)
        .map((v) => ({ value: String(v), label: `V${v}` }));
    },
    [rows],
  );

  const jobVersionOptions = useMemo(() => versionOptions((r) => r.jobVersion), [versionOptions]);
  const interviewVersionOptions = useMemo(() => versionOptions((r) => r.interviewVersion), [versionOptions]);

  const filtered = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();

    const dayOf = (row: InterviewRow) => {
      const d = parseIST(row.createdAt);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
    };

    return rows.filter((row) => {
      if (q) {
        const haystack = `${row.jobName} ${row.jobId} ${row.interviewId}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.job && row.jobId !== filters.job) return false;
      if (filters.jobVersion && String(row.jobVersion) !== filters.jobVersion) return false;
      if (filters.interviewVersion && String(row.interviewVersion) !== filters.interviewVersion) return false;
      if (filters.status && row.rawStatus !== filters.status) return false;
      if (filters.createdFrom || filters.createdTo) {
        const day = dayOf(row);
        if (!day) return false;
        if (filters.createdFrom && day < filters.createdFrom) return false;
        if (filters.createdTo && day > filters.createdTo) return false;
      }
      return true;
    });
  }, [rows, appliedSearch, filters]);

  const sorted = useMemo(() => {
    if (!sortKey) {
      const first = defaultSort === 'active' ? 'Active' : defaultSort === 'draft' ? 'Draft' : null;
      return [...filtered].sort((a, b) => {
        if (first) {
          const aw = a.status === first ? 0 : 1;
          const bw = b.status === first ? 0 : 1;
          if (aw !== bw) return aw - bw;
        }
        return defaultSort === 'oldest' ? a.createdSort - b.createdSort : b.createdSort - a.createdSort;
      });
    }
    const compare = COMPARATORS[sortKey];
    return [...filtered].sort((a, b) => {
      const primary = compare(a, b);
      const result = primary !== 0 ? primary : b.createdSort - a.createdSort;
      return sortDir === 'asc' ? result : -result;
    });
  }, [filtered, sortKey, sortDir, defaultSort]);

  /* The details page's Prev / Next walk THIS table — its rows, sort and
     filters — so "X / N" matches the count shown here. The order is handed
     over on every change; the row link carries which list it is. */
  const pagerList: AIInterviewPagerList =
    fixedStatus === 'published' ? 'active' : fixedStatus ?? 'all-interviews';
  useEffect(() => {
    if (isLoading) return;
    rememberAIInterviewPagerOrder(pagerList, sorted.map((r) => r.id));
  }, [sorted, pagerList, isLoading]);
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  /* Every version's status for the rows on this page whose job reads Disabled
     or Archived — the job badge is judged on the whole job (jobLockBadgeFor). */
  const jdLineage = useJobVersionLineage();
  const { ensureFilterLineages } = jdLineage;
  useEffect(() => {
    ensureFilterLineages(
      pageRows
        .filter((row) => row.jdId && (isJdDisabled(row.config.jd_status) || String(row.config.jd_status || '').toLowerCase() === 'archived'))
        .map((row) => ({ key: row.jdId!, jobId: row.jdId! })),
    );
  }, [pageRows, ensureFilterLineages]);

  // Row selection — the CheckSquare / Square column the Candidate Results tab
  // opens with. Selection survives paging; it is pruned to the rows that
  // still exist after a reload or a narrower filter.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(sorted.map((row) => row.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sorted]);
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
  const selectedRows = useMemo(() => sorted.filter((row) => selectedIds.has(row.id)), [sorted, selectedIds]);
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

    const index = sorted.findIndex((row) => row.id === highlightId);
    if (index === -1) {
      // Not in the loaded set under the current (empty, on arrival) filters —
      // nothing to scroll to. Stop looking so this doesn't re-check forever.
      highlightHandledRef.current = true;
      return;
    }

    const targetPage = Math.floor(index / pageSize) + 1;
    if (targetPage !== safePage) {
      setPage(targetPage);
      return; // effect re-runs once `page`/`safePage` catch up
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
  }, [highlightId, isLoading, sorted, pageSize, safePage, router]);

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
      const job = rows.find((r) => r.jobId === filters.job);
      out.push({
        key: 'job',
        label: 'Job',
        value: job ? `${job.jobName} (${job.jobId})` : filters.job,
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
  }, [filters, rows]);

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
  renderRowActions(row.config)
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
        return row.jobId ? <JobIdBadge>{row.jobId}</JobIdBadge> : <span className="text-xs text-gray-400">—</span>;
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
              return lockBadge === 'disabled' ? <JobDisabledBadge />
                : lockBadge === 'archived' ? <JobArchivedBadge /> : null;
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
                className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
              >
                {ROUND_SHORT_LABELS[type] || ROUND_LABELS[type] || type}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
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
      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
        Unable to load interviews
      </h3>
      <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
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
      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
        {isNarrowed ? 'No interviews found' : 'No interviews yet'}
      </h3>
      <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
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
              className="w-full h-9 pl-9 pr-9 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue disabled:opacity-50"
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
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-2xs font-semibold uppercase tracking-wide text-gray-500">
                    {selectedRows.length.toLocaleString()} selected
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                  className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5"
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
                  <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
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
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden bg-white dark:bg-slate-900">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
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
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/30"
                        >
                          {ROUND_SHORT_LABELS[type] || ROUND_LABELS[type] || type}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-sm">
                    {/* No column headers on a card, so the counts keep their words
                        (the table cells show the number alone). */}
                    <span>{cellContent(row, 'invitations')}<span className="text-xs text-gray-400 ml-1">sent</span></span>
                    <span>{cellContent(row, 'completed')}<span className="text-xs text-gray-400 ml-1">completed</span></span>
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
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden bg-white dark:bg-slate-900">
        <div ref={scrollRef} className="tf-table-shell">
          <table className="w-full text-sm border-collapse">
            {hasBodyRows && (
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                {/* Select All — this page's rows. Not pinned: Job ID is the
                    pinned column, and it covers this one as the table scrolls. */}
                <th scope="col" className="pl-3 pr-0 py-2.5 w-10 align-middle">
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
                  const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2.5 whitespace-nowrap align-middle text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 ${
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
                        className={`inline-flex items-center gap-1.5 group uppercase transition-colors hover:text-brand-blue disabled:cursor-not-allowed ${
                          col.align === 'right' ? 'flex-row-reverse' : ''
                        } ${isSorted ? 'text-brand-blue' : ''}`}
                        title={`Sort by ${col.label}`}
                      >
                        {/* A long title (Invitations Sent, Interview Version…) wraps to two lines past 8rem. */}
                        <span className={`inline-block w-max max-w-[8rem] whitespace-normal leading-tight ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}>{col.label}</span>
                        <SortIcon
                          className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${
                            isSorted ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                          }`}
                        />
                      </button>
                      )}
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 tf-sticky-col"
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
                    <td className="pl-3 pr-0 py-3 w-10">
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
                    <td className="px-3 py-3 tf-sticky-col">
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
                    <td className="pl-3 pr-0 py-2.5 w-10 align-middle" onClick={(e) => e.stopPropagation()}>
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
                      className="px-3 py-2.5 align-middle text-right tf-sticky-col"
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
                          className="h-8 w-8 p-0"
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
                      <td colSpan={columnCount} className="px-3 sm:px-4 lg:px-6 pt-3 pb-4">
                        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
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
      </>
      )}

      {!isLoading && !error && (
        <ListPagination
          currentPage={safePage}
          itemsPerPage={pageSize}
          totalItems={sorted.length}
          onPageChange={setPage}
          onItemsPerPageChange={setPageSize}
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
