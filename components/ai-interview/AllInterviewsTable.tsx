'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, X, Video, MoreVertical, Eye, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, RefreshCw, SlidersHorizontal,
  Square, CheckSquare,
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
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { DateField } from '@/components/ui/date-field';
import { aiInterviewService, isJdDisabled, JD_DISABLED_ACTION_MESSAGE, JD_ARCHIVED_ACTION_MESSAGE, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatISTStamp, parseIST } from '@/lib/utils/dateUtils';
import type { JDLineageVersion } from '@/lib/services/jdService';
import { jobVersionDisplayStatus } from '@/components/assessments/AssessmentVersionHistoryPanel';
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
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span
        aria-hidden="true"
        className="h-6 w-6 flex-shrink-0 rounded-full bg-slate-100 dark:bg-slate-700/60 text-2xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center ring-1 ring-slate-200 dark:ring-slate-600"
      >
        {initials}
      </span>
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
  align?: 'left' | 'right';
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

const COLUMNS: ColumnDef[] = [
  { key: 'jobId', label: 'Job ID' },
  { key: 'jobName', label: 'Job Name' },
  { key: 'jobVersion', label: 'Job Version' },
  { key: 'interviewVersion', label: 'Interview Version' },
  { key: 'status', label: 'Status' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'invitations', label: 'Invitations Sent' },
  { key: 'completed', label: 'Completed' },
  { key: 'createdAt', label: 'Created On' },
  { key: 'createdBy', label: 'Created By', hideBelow: 'lg' },
];

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
  /**
   * Bumped by the host's Refresh button (AIInterview.tsx) to force a
   * reload — this table otherwise only refetches on mount or its own Retry.
   */
  refreshSignal?: number;
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
}

export default function AllInterviewsTable({ toolbarSlot, sortActionSlot, refreshSignal, fixedStatus, renderRowActions }: AllInterviewsTableProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isTenantAdmin, user } = useAuth();
  const canUpdateAIInterviews = isTenantAdmin || !!user?.permissions?.canUpdateAIInterviews;

  const [rows, setRows] = useState<InterviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const fetchAll = useCallback(async (): Promise<InterviewRow[]> => {
    const { live, archived } = await aiInterviewService.listAllConfigsSplit();

    const seen = new Set<string>();
    const merged: AIInterviewResponse[] = [];
    for (const config of [...live, ...archived]) {
      if (seen.has(config.id)) continue;
      seen.add(config.id);
      merged.push(config);
    }
    const rows = withInterviewVersions(merged);

    /* The list response carries no finished-sessions count, so read it off
       the batched `/invitation-counts` endpoint (`completed`) — one request per
       200 configs, only for configs that have sent at least one invite (the
       rest are 0). If a batch fails (older backend, transient error) fall back
       to the per-config page_size-1 probe for that batch, ten at a time. A
       failed probe just leaves that row at 0. */
    const withInvites = rows.filter((row) => row.invitations > 0);
    const COUNTS_BATCH = 200; // backend cap on ids per request
    for (let start = 0; start < withInvites.length; start += COUNTS_BATCH) {
      const batch = withInvites.slice(start, start + COUNTS_BATCH);
      try {
        const counts = await aiInterviewService.getInvitationCounts(batch.map((row) => row.id));
        for (const row of batch) row.completed = counts[row.id]?.completed || 0;
      } catch {
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
    }
    return rows;
  }, []);

  useEffect(() => {
    let alive = true;
    fetchAll()
      .then((next) => {
        if (!alive) return;
        // Ordinals are computed above over the WHOLE set before this filter
        // runs, so a version's number still reflects its true position in
        // the lineage rather than shifting once other statuses are hidden.
        setRows(fixedStatus ? next.filter((r) => r.rawStatus === fixedStatus) : next);
        setError(null);
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
    if (!sortKey) return [...filtered].sort((a, b) => b.createdSort - a.createdSort);
    const compare = COMPARATORS[sortKey];
    return [...filtered].sort((a, b) => {
      const primary = compare(a, b);
      const result = primary !== 0 ? primary : b.createdSort - a.createdSort;
      return sortDir === 'asc' ? result : -result;
    });
  }, [filtered, sortKey, sortDir]);

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
      className="flex-shrink-0"
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

  const columnCount = COLUMNS.length + 2; // + Select + Actions
  /* Whether the table has data rows to lay out — and so whether its header
     belongs on screen at all.
     With none, the header is the only thing left forcing a width: its cells are
     `nowrap`, so the table stays wider than `tf-table-shell` and the single
     empty-state cell gets centred across THAT width rather than the visible
     one — the message drifts off the side behind a horizontal scrollbar that
     exists only to reach it. Nothing to label means nothing to be wide for.
     See `TABLE_EMPTY_PANEL_CLASS`. */
  const hasBodyRows = isLoading || (!error && pageRows.length > 0);

  const toolbar = (
    <>

      {/* ── Search & filter toolbar ── */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 p-3 sm:p-4 mb-4">
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
                </th>
                {COLUMNS.map((col) => {
                  const isSorted = sortKey === col.key;
                  const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2.5 whitespace-nowrap align-middle text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''} ${col.key === 'jobId' ? 'tf-sticky-col-left' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        disabled={!!error}
                        className={`inline-flex items-center gap-1.5 group transition-colors hover:text-brand-blue disabled:cursor-not-allowed ${
                          col.align === 'right' ? 'flex-row-reverse' : ''
                        } ${isSorted ? 'text-brand-blue' : ''}`}
                        title={`Sort by ${col.label}`}
                      >
                        {col.label}
                        <SortIcon
                          className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${
                            isSorted ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                          }`}
                        />
                      </button>
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 tf-sticky-col"
                >
                  Actions
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
                    {COLUMNS.map((col) => (
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
                  <td colSpan={columnCount} className="p-0"><div className={TABLE_EMPTY_PANEL_CLASS}>
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
                  </td>
                </tr>
              )}

              {!isLoading && !error && pageRows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="p-0"><div className={TABLE_EMPTY_PANEL_CLASS}>
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
                  </td>
                </tr>
              )}

              {!isLoading &&
                !error &&
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(row.id, el);
                      else rowRefs.current.delete(row.id);
                    }}
                    onClick={() => openRow(row)}
                    className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 cursor-pointer transition-colors duration-700 hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 ${
                      flashedRowId === row.id ? 'bg-brand-blue/10 dark:bg-brand-blue/15' : ''
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
                    <td className="px-3 py-2.5 align-middle whitespace-nowrap tf-sticky-col-left">
                      {row.jobId ? (
                        <JobIdBadge>{row.jobId}</JobIdBadge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle max-w-[16rem]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="block truncate font-medium text-gray-900 dark:text-slate-50"
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
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <VersionPill kind="job" version={row.jobVersion} />
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <VersionPill kind="interview" version={row.interviewVersion} />
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <StatusBadge status={row.status} />
                      {/* Live, with saved edits waiting for Publish. */}
                      {hasUnpublishedChanges(row.config) && <UnpublishedChangesChip className="ml-1.5 align-middle" />}
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      {row.rounds.length > 0 ? (
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
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <span className="tabular-nums text-gray-900 dark:text-slate-100">
                        {row.invitations.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">sent</span>
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <span className="tabular-nums text-gray-900 dark:text-slate-100">
                        {row.completed.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">completed</span>
                    </td>

                    <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                      <span className="text-gray-600 dark:text-slate-400 tabular-nums">
                        {formatISTStamp(row.createdAt)}
                      </span>
                    </td>

                    <td className={`px-3 py-2.5 align-middle max-w-[12rem] ${HIDE_CLASS.lg}`}>
                      <CreatedBy name={row.createdBy} />
                    </td>

                    <td
                      className="px-3 py-2.5 align-middle text-right tf-sticky-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {renderRowActions ? (
                        <div className="flex justify-end">{renderRowActions(row.config)}</div>
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
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}
