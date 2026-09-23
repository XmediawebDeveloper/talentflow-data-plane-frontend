'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, X, Video, MoreVertical, Eye, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, RefreshCw, SlidersHorizontal,
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
import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';
import { formatISTStamp, parseIST } from '@/lib/utils/dateUtils';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAuth } from '@/lib/hooks/useAuth';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';

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
  invitations: number;      //                        -> column 6
  createdAt: string;        // ISO                    -> column 7
  createdSort: number;      // epoch ms, so the sort never re-parses
  createdBy: string;        //                        -> column 8
}

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
      invitations: config.invitations_count ?? 0,
      createdAt: config.created_at,
      createdSort: parseIST(config.created_at).getTime() || 0,
      createdBy: config.created_by_name || 'System',
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
function VersionPill({ kind, version }: { kind: 'job' | 'interview'; version: number }) {
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
  | 'status' | 'invitations' | 'createdAt' | 'createdBy';

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
  invitations: (a, b) => a.invitations - b.invitations,
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
  { key: 'invitations', label: 'Invitations Sent', align: 'right' },
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

export default function AllInterviewsTable() {
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

  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

    const seen = new Set<string>();
    const merged: AIInterviewResponse[] = [];
    for (const config of [...live, ...archived]) {
      if (seen.has(config.id)) continue;
      seen.add(config.id);
      merged.push(config);
    }
    return withInterviewVersions(merged);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchAll()
      .then((next) => {
        if (!alive) return;
        setRows(next);
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
  }, [fetchAll, reloadToken]);

  const retry = () => {
    setIsLoading(true);
    setError(null);
    setReloadToken((t) => t + 1);
  };

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
    const compare = COMPARATORS[sortKey];
    return [...filtered].sort((a, b) => {
      const primary = compare(a, b);
      const result = primary !== 0 ? primary : b.createdSort - a.createdSort;
      return sortDir === 'asc' ? result : -result;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

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
    setSortDir(key === 'createdAt' || key === 'invitations' ? 'desc' : 'asc');
  };

  /* View is always available; Edit is Draft-only and additionally gated on
     canUpdateAIInterviews, the same permission the card list's own Edit
     button checks. It routes to the JD-selection config builder — AI
     interviews have no `create?edit=` route the way Assessments does. */
  const rowActions = (row: InterviewRow) => {
    const actions: { key: string; label: string; icon: typeof Eye; run: () => void }[] = [
      {
        key: 'view', label: 'View', icon: Eye,
        run: () => router.push(`/recruitment/ai-interviews/${row.id}`),
      },
    ];
    if (row.rawStatus === 'draft' && canUpdateAIInterviews && row.jdId) {
      actions.push({
        key: 'edit', label: 'Edit', icon: Pencil,
        run: () => router.push(`/recruitment/ai-interviews/jd-selection/ai-interview-config?jd_id=${row.jdId}&config_id=${row.id}`),
      });
    }
    return actions;
  };

  const columnCount = COLUMNS.length + 1; // + Actions
  /* Whether the table has data rows to lay out — and so whether its header
     belongs on screen at all.
     With none, the header is the only thing left forcing a width: its cells are
     `nowrap`, so the table stays wider than `tf-table-shell` and the single
     empty-state cell gets centred across THAT width rather than the visible
     one — the message drifts off the side behind a horizontal scrollbar that
     exists only to reach it. Nothing to label means nothing to be wide for.
     See `TABLE_EMPTY_PANEL_CLASS`. */
  const hasBodyRows = isLoading || (!error && pageRows.length > 0);

  return (
    <div className="p-3 sm:p-6">
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
            Filters
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

              <div className="sm:col-span-2">
                <label
                  htmlFor="all-interviews-created-from"
                  className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5"
                >
                  Created On
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="all-interviews-created-from"
                    type="date"
                    aria-label="Created from"
                    value={draftFilters.createdFrom}
                    max={draftFilters.createdTo || undefined}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, createdFrom: e.target.value }))}
                    className="flex-1 min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                  />
                  <span className="text-xs text-gray-400 flex-shrink-0">to</span>
                  <input
                    type="date"
                    aria-label="Created to"
                    value={draftFilters.createdTo}
                    min={draftFilters.createdFrom || undefined}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, createdTo: e.target.value }))}
                    className="flex-1 min-w-0 h-9 px-3 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
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

      {/* ── The table ── */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden bg-white dark:bg-slate-900">
        <div ref={scrollRef} className="tf-table-shell">
          <table className="w-full text-sm border-collapse">
            {hasBodyRows && (
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                {COLUMNS.map((col) => {
                  const isSorted = sortKey === col.key;
                  const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''}`}
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
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''}`}
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
                    onClick={() => router.push(`/recruitment/ai-interviews/${row.id}`)}
                    className={`border-b border-gray-100 dark:border-slate-700/60 last:border-b-0 cursor-pointer transition-colors duration-700 hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 ${
                      flashedRowId === row.id ? 'bg-brand-blue/10 dark:bg-brand-blue/15' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      {row.jobId ? (
                        <JobIdBadge>{row.jobId}</JobIdBadge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 align-middle max-w-[16rem]">
                      <span
                        className="block truncate font-medium text-gray-900 dark:text-slate-50"
                        title={row.jobName}
                      >
                        {row.jobName}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <VersionPill kind="job" version={row.jobVersion} />
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <VersionPill kind="interview" version={row.interviewVersion} />
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <StatusBadge status={row.status} />
                    </td>

                    <td className="px-3 py-2.5 align-middle text-right">
                      <span className="tabular-nums text-gray-900 dark:text-slate-100">
                        {row.invitations.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">sent</span>
                    </td>

                    <td className="px-3 py-2.5 align-middle">
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
                        <DropdownMenuContent align="end" className="w-44">
                          {rowActions(row).map(({ key, label, icon: Icon, run }) => (
                            <DropdownMenuItem key={key} onClick={run} className="gap-2">
                              <Icon className="w-4 h-4" />
                              {label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
