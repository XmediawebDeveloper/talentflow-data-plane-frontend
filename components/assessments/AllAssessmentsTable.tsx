'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, ClipboardList, MoreVertical, Eye, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, RefreshCw,
  Archive, ArchiveRestore, BarChart, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { assessmentJobLockMessage, loadJobVersionStatuses, checkAssessmentJobLock } from '@/lib/utils/assessmentJobLock';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import ListPagination from '@/components/ListPagination';
import NameAvatar from '@/components/ui/name-avatar';
import SearchableSelect, { type SearchableSelectOption } from '@/components/ui/searchable-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
/* The app's one list search/filter layout — the same row and the same panel
   the Assessments page's Total Jobs tab opens. This screen used to draw its
   own: a white card around a hand-built search input and a hand-built Filters
   button, then the controls inline beneath them. Same controls now, same
   behaviour, in the shared shell, so All / Active / Draft and Total Jobs read
   as one page rather than as two designs of the same thing. */
import ListToolbar from '@/components/ui/list-toolbar';
/* Renders the toolbar above into whatever position the HOST page reserves for
   it — on the Assessments page that is the one row above the tab pills, shared
   with every other tab. On this screen's own route there is no slot, and it
   renders in place exactly as before. */
import { ListToolbarPortal } from '@/components/ui/list-toolbar-slot';
import ListFilterPanel from '@/components/ui/list-filter-panel';
import { DateField } from '@/components/ui/date-field';
import { assessmentService, type AssessmentResponse } from '@/lib/services/assessmentService';
import { formatISTStamp, parseIST } from '@/lib/utils/dateUtils';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAuth } from '@/lib/hooks/useAuth';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Button } from '@/components/ui/button';
import { useArchiveAssessmentConfirm } from '@/components/assessments/ArchiveAssessmentModal';
import { useDeleteRecordConfirm } from '@/components/recruitment/DeleteRecordModal';
import { PAGER_LIST_PARAM, rememberAssessmentPagerOrder, type AssessmentPagerList } from '@/lib/utils/assessmentPagerList';

/* Same batch size and same reason as the Assessments dashboard's own list: the
   /assessments endpoint takes only jd_id, status, search and paging, so every
   filter this screen offers (job, job version, assessment version, created-on
   range) and every sort has to run over the WHOLE result set. Filtering one
   server page would silently scope "Job Version = V3" to whatever happened to
   be on screen, and sorting it would order 20 rows out of 156. */
const FULL_SET_BATCH_SIZE = 100;


/* ── Row model ─────────────────────────────────────────────────────────────
   One flat row per assessment, derived once from the API shape so the table,
   the sort comparators, the search matcher and the filter option lists all
   read the same fields. Everything here comes off AssessmentResponse — no
   column on this screen needed a new endpoint or a second request. */
interface AssessmentRow {
  id: string;
  assessmentId: string;      // AS-022, the assessment's own human id (searched, not a column)
  title: string;
  jobId: string;             // JD-014            -> column 1
  jdId: string;              // jd_id, the JD row's UUID (Edit's Configure route)
  jobName: string;           // "Senior Java …"   -> column 2
  jobVersion: number;        // jd_version        -> column 3
  assessmentVersion: number; // version           -> column 4
  rawStatus: string;         // draft | published | closed | archived
  status: string;            // Draft | Active | Completed | Archived  -> column 5
  invitations: number;       //                   -> column 6
  completed: number;         // completed_count   -> column 7 (candidates who completed it)
  createdAt: string;         // ISO               -> column 7
  createdSort: number;       // epoch ms, so the sort never re-parses
  /* When this version was published, epoch ms (0 = never): the API's
     `published_at`, or — for a published row the API returned without one —
     its `updated_at`, the moment its status last changed. The default order. */
  publishedSort: number;
  /* When this version last changed (the API's `updated_at`, else
     `created_at`), epoch ms — for a draft, when it was created or last moved
     into / edited in Draft. The Draft tab's default order. */
  updatedSort: number;
  jobKey: string;            // the job every version shares (jd_short_id, else jd_id)
  createdBy: string;         //                   -> column 8
  /** The API record the row was built from — handed to the host's
   *  `extraRowActions`, so its own handlers act on the same record. */
  raw: AssessmentResponse;
}

/** One ⋮ menu item. Exported for the host's `extraRowActions`. */
export type AssessmentRowAction = {
  key: string;
  label: string;
  icon: typeof Eye;
  iconClassName: string;
  run: () => void;
  destructive?: boolean;
  /** Shown in the menu's own disabled state, reason on hover. */
  disabled?: boolean;
  title?: string;
};

/* The status a recruiter reads, from the status the backend stores. `published`
   is shown as Active because that is the word the rest of the product uses for
   a live assessment (the dashboard's Active tab asks the API for `published`).
   Closed and archived are NOT collapsed into either: this screen's Status
   filter offers only Active and Draft, but a row that is genuinely archived
   must not be labelled Draft just because the filter has no name for it. */
const STATUS_LABEL: Record<string, string> = {
  published: 'Active',
  draft: 'Draft',
  closed: 'Completed',
  archived: 'Archived',
};

const toRow = (a: AssessmentResponse): AssessmentRow => {
  const raw = String(a.status || 'draft').toLowerCase();
  return {
    id: a.id,
    assessmentId: a.short_id || '',
    title: a.title || 'Untitled assessment',
    jobId: a.jd_short_id || '',
    jdId: a.jd_id || '',
    jobName: a.jd_title || 'General Assessment',
    jobVersion: a.jd_version ?? 1,
    assessmentVersion: a.version ?? 1,
    rawStatus: raw,
    status: STATUS_LABEL[raw] || 'Draft',
    invitations: a.invitations_count ?? 0,
    completed: a.completed_count ?? 0,
    createdAt: a.created_at,
    createdSort: parseIST(a.created_at).getTime() || 0,
    publishedSort: (() => {
      const stamp = a.published_at || (raw === 'published' ? a.updated_at : undefined);
      return stamp ? parseIST(stamp).getTime() || 0 : 0;
    })(),
    jobKey: a.jd_short_id || a.jd_id || `__unlinked__${a.id}`,
    updatedSort: (a.updated_at ? parseIST(a.updated_at).getTime() : 0) || parseIST(a.created_at).getTime() || 0,
    createdBy: a.created_by_name || 'System',
    raw: a,
  };
};

/* ── Status badge ──────────────────────────────────────────────────────────
   Text only, no icon: nine columns of data is already dense, and a dot or tick
   inside every badge in a 20-row column is decoration that has to be looked
   past. Green for live, amber for unfinished — the same two readings the
   dashboard's row pills use — and slate for the two terminal states, which are
   deliberately quieter than both. */
const STATUS_BADGE: Record<string, string> = {
  Active: 'bg-success-subtle text-success ring-success-line',
  Draft: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20',
  Completed: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600',
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

/* ── Version chip ──────────────────────────────────────────────────────────
   Job versions blue, assessment versions cyan — the same two colours, in the
   same roles, as the Assessment Version History panel's chips, so a V3 means
   the same thing and looks the same wherever it is read. Kept as a compact
   mono-width pill so a column of them lines up. */
export function VersionPill({ kind, version, label }: {
  kind: 'job' | 'assessment';
  version: number;
  /** Shown before the number ("Job V1") where the pill stands without a
   *  column heading to name it — a card. Omitted, the pill reads "V1". */
  label?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ring-1 ${
        kind === 'job'
          ? 'text-brand-blue bg-brand-blue/10 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35'
          : 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/20 dark:bg-brand-cyan/20 dark:text-cyan-200 dark:ring-brand-cyan/35'
      }`}
    >
      {label ? `${label} ` : ''}V{version}
    </span>
  );
}

/* ── Created By ────────────────────────────────────────────────────────────
   Initials rather than a photo: there is no avatar URL on AssessmentResponse,
   so a real avatar would be a second request per distinct author for a column
   the spec asks to keep subtle. The monogram gives the column a scannable left
   edge without inventing data. */
function CreatedBy({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 max-w-[12rem]">
      <NameAvatar name={name} size="xs" title="" />
      <span className="truncate text-sm text-gray-600 dark:text-slate-400" title={name}>
        {name}
      </span>
    </span>
  );
}

/* ── Sorting ───────────────────────────────────────────────────────────────
   One comparator per sortable column, keyed by the same string the header
   button sends, so a header can never sort by a different field than it names.
   Every comparator is written ASCENDING and the direction is applied once
   below — a per-column descending branch is how a table ends up with one
   column that sorts backwards. */
type SortKey =
  /* The default order, not a column: latest publish first (see `sorted`). */
  | 'published'
  | 'jobId' | 'jobName' | 'jobVersion' | 'assessmentVersion'
  | 'status' | 'invitations' | 'completed' | 'createdAt' | 'createdBy';

const text = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const COMPARATORS: Record<SortKey, (a: AssessmentRow, b: AssessmentRow) => number> = {
  published: (a, b) => a.publishedSort - b.publishedSort,
  jobId: (a, b) => text(a.jobId, b.jobId),
  jobName: (a, b) => text(a.jobName, b.jobName),
  jobVersion: (a, b) => a.jobVersion - b.jobVersion,
  assessmentVersion: (a, b) => a.assessmentVersion - b.assessmentVersion,
  /* Status sorts by MEANING, not alphabetically: Active, Draft, Completed,
     Archived is the lifecycle order, and it is the order the reader expects
     when they click the column. Alphabetical would open on Archived. */
  status: (a, b) => {
    const order = ['Active', 'Draft', 'Completed', 'Archived'];
    return order.indexOf(a.status) - order.indexOf(b.status);
  },
  invitations: (a, b) => a.invitations - b.invitations,
  completed: (a, b) => a.completed - b.completed,
  createdAt: (a, b) => a.createdSort - b.createdSort,
  createdBy: (a, b) => text(a.createdBy, b.createdBy),
};

interface ColumnDef {
  key: SortKey;
  label: string;
  /** Right-aligned for the one numeric column, so digits line up on the ones place. */
  align?: 'left' | 'right';
  /** Hidden below this breakpoint. The nine columns do not all fit a tablet. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

/* The exact column order this screen specifies. Job ID, Job Name, Job Version
   and Assessment Version are four separate columns on purpose — a combined
   "Job (V3)" cell cannot be sorted or filtered by version. */
const COLUMNS: ColumnDef[] = [
  { key: 'jobId', label: 'Job ID' },
  { key: 'jobName', label: 'Job Name' },
  { key: 'jobVersion', label: 'Job Version' },
  { key: 'assessmentVersion', label: 'Assessment Version' },
  { key: 'status', label: 'Status' },
  { key: 'invitations', label: 'Invitations Sent', align: 'right' },
  { key: 'completed', label: 'Completed', align: 'right' },
  { key: 'createdAt', label: 'Created On' },
  { key: 'createdBy', label: 'Created By', hideBelow: 'lg' },
];

const HIDE_CLASS: Record<string, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

/** Filters, as one object so "apply" and "clear" are single assignments. */
interface Filters {
  job: string;               // jobId (JD-014); '' = any
  jobVersion: string;        // stringified number; '' = any
  assessmentVersion: string;
  status: string;            // 'published' | 'draft'; '' = any
  createdFrom: string;       // yyyy-mm-dd
  createdTo: string;
}

const EMPTY_FILTERS: Filters = {
  job: '', jobVersion: '', assessmentVersion: '', status: '', createdFrom: '', createdTo: '',
};

const hasAnyFilter = (f: Filters) => Object.values(f).some((v) => v !== '');

/* The status a host can pin this table to, one per flat tab on the Assessments
   page. `archived` joins the two that were here because the Archived tab now
   lists ASSESSMENTS in this table, the way Draft always has, instead of the
   job-grouped list it used to draw — and the table already knew the status in
   every other respect: `STATUS_LABEL` names it, `STATUS_BADGE` has its slate
   pill, the Status sort puts it last in lifecycle order, and `rowActions`
   offers an archived row View but not Edit. */
type FixedAssessmentStatus = 'published' | 'draft' | 'archived';

interface AllAssessmentsTableProps {
  embedded?: boolean;
  fixedStatus?: FixedAssessmentStatus;
  title?: string;
  description?: string;
  /** Bumped by the page's Clear Sort button (next to the Settings tab, outside
   *  this table): each new value puts the sort back to its default. Only the
   *  sort — search, filters and the page stay as they are. */
  clearSortSignal?: number;
  /** Told whether the sort is at its default, so Clear Sort can disable
   *  itself when there is nothing to clear. */
  onSortDefaultChange?: (isDefault: boolean) => void;
  /** More ⋮ items for any row, from the host page — its Edit / Share /
   *  Track (`main`, after View) and Duplicate / Revoke (`more`, after View
   *  Results), so every tab offers what the same assessment's row offers on
   *  Total Jobs, through the same handlers. */
  extraRowActions?: (raw: AssessmentResponse) => { main: AssessmentRowAction[]; more: AssessmentRowAction[] } | undefined;
  /** Bumped by the host after one of those actions changes data (a share,
   *  a duplicate, a revoke) — the table refetches its rows. */
  reloadSignal?: number;
  /** Told how many rows this tab loaded (before search / filters), once a
   *  load settles — so the host's tab count is the same data as the list.
   *  `null` while loading or after a failed load. */
  onRowCountChange?: (count: number | null) => void;
  /** Told after one of this table's own status actions (Archive, Unarchive,
   *  Delete) succeeds, so the host can re-read what that action moved — its
   *  stat cards and tab counts — rather than keep the pre-action figures. */
  onMutated?: () => void;
}

const fixedStatusLabel = (status?: FixedAssessmentStatus) =>
  status === 'published' ? 'Active'
    : status === 'draft' ? 'Draft'
      : status === 'archived' ? 'Archived'
        : undefined;

/* The order every tab (All / Active / Draft / Archived) opens in, and what
   Clear Sort returns to: the most recently published assessment version
   first. */
const DEFAULT_SORT_KEY: SortKey = 'published';
const DEFAULT_SORT_DIR: 'asc' | 'desc' = 'desc';

export default function AllAssessmentsTable({ embedded = false, fixedStatus, title, description, clearSortSignal, onSortDefaultChange, onRowCountChange, extraRowActions, reloadSignal = 0, onMutated }: AllAssessmentsTableProps = {}) {
  const router = useRouter();
  const { isTenantAdmin, user } = useAuth();
  const canUpdateAssessment = isTenantAdmin || (user?.permissions?.canUpdateAssessments ?? false);
  const canDeleteAssessment = isTenantAdmin || (user?.permissions?.canDeleteAssessments ?? false);
  const { confirmArchive, archiveConfirmModal } = useArchiveAssessmentConfirm();
  const { confirmDelete, deleteConfirmModal } = useDeleteRecordConfirm('Assessment');
  const fixedLabel = fixedStatusLabel(fixedStatus);
  /* Both lines of the page header. Read only when this table is on its OWN
     route — see the header block below, which `embedded` drops whole. On the
     Assessments page the tab pill directly above the list already names it,
     and a heading repeating the pill over a paragraph repeating the heading
     was two lines of furniture between the toolbar and the rows. */
  const heading = title || (fixedLabel ? `${fixedLabel} Assessments` : 'All Assessments');
  const subheading = description || (
    fixedStatus === 'published'
      ? 'View and manage published assessments ready for candidate invites.'
      : fixedStatus === 'draft'
        ? 'View and manage draft assessments that are still being prepared.'
        : fixedStatus === 'archived'
          ? 'Assessments taken out of circulation. Archived assessments cannot be edited or sent.'
          : 'View and manage all assessments across jobs and job versions.'
  );

  const [rows, setRows] = useState<AssessmentRow[]>([]);
  /* Each row's job version status (by JD id): on an Archived / Disabled job
     version every action that changes the assessment is off — the Assessments
     page's rule. One batched read. */
  const [jobVersionStatusById, setJobVersionStatusById] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = Array.from(new Set(rows.map((r) => r.jdId).filter((id) => id && !(id in jobVersionStatusById))));
    if (missing.length === 0) return;
    let cancelled = false;
    loadJobVersionStatuses(missing)
      .then((statuses) => { if (!cancelled) setJobVersionStatusById((prev) => ({ ...prev, ...statuses })); })
      .catch(() => { /* the click-time check still blocks */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    onRowCountChange?.(isLoading || error ? null : rows.length);
  }, [isLoading, error, rows.length, onRowCountChange]);
  /** Bumped by Retry to re-run the load effect. See `retry` below. */
  const [reloadToken, setReloadToken] = useState(0);

  /* Search is applied as you type (debounced), because a search box that needs
     a second click to take effect reads as broken. The FILTERS are the
     opposite: six controls confirmed together by Apply, so picking a job then a
     version then a date range refetches nothing and re-sorts nothing until the
     user is done. `draft` is what the controls write to; `applied` is what the
     table reads. */
  const [search, setSearch] = useState('');
  const appliedSearch = useDebounce(search, 300);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(DEFAULT_SORT_DIR);

  const [page, setPage] = useState(1);
  /* Total Jobs' starting size (the Assessments page's assessmentItemsPerPage). */
  const [pageSize, setPageSize] = useState(10);

  /* Clear Sort. The first value is whatever the signal was when this tab
     mounted, so arriving on a tab never clears anything — only a click does. */
  const lastClearSortSignal = useRef(clearSortSignal);
  useEffect(() => {
    if (clearSortSignal === lastClearSortSignal.current) return;
    lastClearSortSignal.current = clearSortSignal;
    setSortKey(DEFAULT_SORT_KEY);
    setSortDir(DEFAULT_SORT_DIR);
  }, [clearSortSignal]);

  const isDefaultSort = sortKey === DEFAULT_SORT_KEY && sortDir === DEFAULT_SORT_DIR;
  useEffect(() => {
    onSortDefaultChange?.(isDefaultSort);
  }, [isDefaultSort, onSortDefaultChange]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* ── Load ────────────────────────────────────────────────────────────────
     Batched to the end of the set, mirroring how the dashboard pulls its own
     list. The fetch is separated from the state writes on purpose: `fetchAll`
     only returns rows, so `runLoad` can `await` before it touches state and
     the mount effect below therefore contains no synchronous setState at all.
     `isLoading` starts true, so a mount needs no "start loading" write either
     — only Retry does, and that is an event handler. */
  const fetchAll = useCallback(async (): Promise<AssessmentRow[]> => {
    const collected: AssessmentResponse[] = [];
    let apiPage = 1;
    for (;;) {
      const batch = await assessmentService.list({
        ...(fixedStatus ? { status: fixedStatus } : {}),
        page: apiPage,
        page_size: FULL_SET_BATCH_SIZE,
      });
      const items = batch.items || [];
      collected.push(...items);
      const total = batch.total ?? collected.length;
      if (items.length < FULL_SET_BATCH_SIZE || collected.length >= total) break;
      apiPage += 1;
    }
    /* Offset paging over a list that can change between batches (a row
       created or archived mid-walk) can hand the same assessment back on two
       pages — one row per id. */
    const seen = new Set<string>();
    return collected.filter((a) => !seen.has(a.id) && !!seen.add(a.id)).map(toRow);
  }, [fixedStatus]);

  /* Every state write lands in a promise callback rather than in the effect
     body — the shape React actually wants for "subscribe to an external system
     and setState when it answers", and the reason nothing here fires a
     synchronous render pass on mount.
     `alive` drops the answer to a request whose component has already
     unmounted, which on this screen is a real case: the full set is several
     batched requests, and a reader can click into a row long before the last
     one returns. */
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
        console.error('[TalentFlow] Failed to load assessments:', err);
        /* The message is deliberately not surfaced to the reader — the spec's
           copy is fixed, and an axios string is not something a recruiter can
           act on. It stays in the console for whoever is debugging. */
        setError(err instanceof Error ? err.message : 'Failed to load assessments');
        setRows([]);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchAll, reloadToken, reloadSignal]);

  /* Retry from the error state. Bumping the token re-runs the effect above,
     so the retry path and the mount path are the same code — a second
     hand-rolled fetch here is how the two drift into handling failure
     differently. */
  const retry = () => {
    setIsLoading(true);
    setError(null);
    setReloadToken((t) => t + 1);
  };

  /* After a status action: the same load, without the skeleton, so the row
     picks up its new status in place (or leaves a status tab it no longer
     belongs on) and the table does not flash empty in between. */
  const refreshRows = () => setReloadToken((t) => t + 1);

  /* ── Filter option lists ─────────────────────────────────────────────────
     Derived from the loaded rows, so a dropdown can only ever offer a value
     that some assessment actually has — no dead options, and no second
     endpoint to enumerate jobs. */
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
        // The job id is in the label as well as the hint so the filter box
        // matches on either "Senior Java" or "JD-014".
        label: `${label} (${id})`,
        hint: String(count),
      }));
  }, [rows]);

  const versionOptions = useCallback(
    (pick: (row: AssessmentRow) => number): SearchableSelectOption[] => {
      const seen = new Set<number>();
      for (const row of rows) seen.add(pick(row));
      return [...seen]
        .sort((a, b) => a - b)
        .map((v) => ({ value: String(v), label: `V${v}` }));
    },
    [rows],
  );

  const jobVersionOptions = useMemo(() => versionOptions((r) => r.jobVersion), [versionOptions]);
  const assessmentVersionOptions = useMemo(
    () => versionOptions((r) => r.assessmentVersion),
    [versionOptions],
  );

  /* Status offers exactly the two states this screen specifies. Written as
     data rather than as markup so the chip label below reads from the same
     place the dropdown does. */
  const STATUS_OPTIONS: SearchableSelectOption[] = [
    { value: 'published', label: 'Active' },
    { value: 'draft', label: 'Draft' },
  ];

  /* ── Search + filter + sort ──────────────────────────────────────────────
     AND across every dimension: a row survives only if it matches the search
     AND the job AND the job version AND the assessment version AND the status
     AND the created-on range. Each test is an early `false`, so adding a
     dimension cannot accidentally widen the result. */
  const filtered = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();

    /* The range is inclusive at BOTH ends and compared on the IST calendar
       day, not on the raw timestamp. Comparing `createdAt >= '2026-09-03'`
       as strings is what makes a "to" date exclude everything created that
       day — 2026-09-03T10:42 sorts after 2026-09-03 — so the row's own day
       is extracted and compared day-to-day. */
    const dayOf = (row: AssessmentRow) => {
      const d = parseIST(row.createdAt);
      if (isNaN(d.getTime())) return '';
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
      return parts; // en-CA gives yyyy-mm-dd, which compares as a string
    };

    return rows.filter((row) => {
      if (q) {
        /* Job ID and Job Name only. `jobName` falls back to "General
           Assessment" for an assessment with no job, which is a label, not
           a job name — so it is searched only when there is a job. */
        const haystack = `${row.jobId} ${row.jdId ? row.jobName : ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.job && row.jobId !== filters.job) return false;
      if (filters.jobVersion && String(row.jobVersion) !== filters.jobVersion) return false;
      if (filters.assessmentVersion && String(row.assessmentVersion) !== filters.assessmentVersion) {
        return false;
      }
      if (!fixedStatus && filters.status && row.rawStatus !== filters.status) return false;
      /* A status page shows that status only. The request already asks for
         it; this holds even if the API hands back other statuses. */
      if (fixedStatus && row.rawStatus !== fixedStatus) return false;
      if (filters.createdFrom || filters.createdTo) {
        const day = dayOf(row);
        if (!day) return false;
        if (filters.createdFrom && day < filters.createdFrom) return false;
        if (filters.createdTo && day > filters.createdTo) return false;
      }
      return true;
    });
  }, [rows, appliedSearch, filters, fixedStatus]);

  const sorted = useMemo(() => {
    const compare = COMPARATORS[sortKey];
    /* A copy, because `filtered` is memoised and sorting in place would mutate
       the array the memo hands back on the next render. Ties break on the
       creation stamp so equal values (two V1s, two Drafts) keep a stable,
       meaningful order instead of the array's incidental one. */
    /* Latest publish first, on all four tabs alike: a row's OWN publish time,
       then — for versions not published themselves (drafts, and every row on
       the Draft tab) — the latest publish among its job's versions, so a job
       that has just had a version published leads with its other versions
       next; then creation. All three newest first. */
    /* The Draft and Archived tabs, on the Active tab's pattern: Active leads
       with the version most recently MOVED to Active (published); Draft and
       Archived lead with the row most recently created or updated into that
       status (archiving updates `updated_at`) — newest first, then creation. */
    if (sortKey === 'published' && (fixedStatus === 'draft' || fixedStatus === 'archived')) {
      return [...filtered].sort((a, b) => {
        const result = (a.updatedSort - b.updatedSort) || (a.createdSort - b.createdSort);
        return sortDir === 'asc' ? result : -result;
      });
    }
    if (sortKey === 'published') {
      const jobLatest = new Map<string, number>();
      for (const row of filtered) {
        if (row.publishedSort > (jobLatest.get(row.jobKey) ?? 0)) jobLatest.set(row.jobKey, row.publishedSort);
      }
      return [...filtered].sort((a, b) => {
        const result = (a.publishedSort - b.publishedSort)
          || ((jobLatest.get(a.jobKey) ?? 0) - (jobLatest.get(b.jobKey) ?? 0))
          || (a.createdSort - b.createdSort);
        return sortDir === 'asc' ? result : -result;
      });
    }
    return [...filtered].sort((a, b) => {
      const primary = compare(a, b);
      const result = primary !== 0 ? primary : b.createdSort - a.createdSort;
      return sortDir === 'asc' ? result : -result;
    });
  }, [filtered, sortKey, sortDir, fixedStatus]);

  /* Clamped on read: a shrinking result set (a new filter, a narrower search)
     leaves the page number past the end, and the rows would come back empty
     while the pager still pointed at page 4. */
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const isNarrowed = !!appliedSearch.trim() || hasAnyFilter(filters);

  /* Every action that can shrink the result set also returns to page 1.
     Done here rather than in an effect watching the filters: narrowing is an
     EVENT, and an effect that mirrors it fires a second render pass for
     something the event already knew. The `safePage` clamp above stays as the
     backstop for the one case no handler can catch — rows disappearing under a
     refetch while the reader sits on the last page. */
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

  /* Removing ONE chip clears that dimension in both the applied and the draft
     copy. Only `applied` would leave the panel still showing the value the
     chip just removed, and re-opening it and pressing Apply would bring the
     filter back. */
  const clearOne = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setDraftFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  /* ── Chips ───────────────────────────────────────────────────────────────
     One per active dimension, labelled with the value the user picked rather
     than the value stored: the Job chip names the job, not JD-014, and the
     date chip is a single range rather than two half-chips a reader has to
     assemble. */
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
    if (filters.assessmentVersion) {
      out.push({
        key: 'assessmentVersion', label: 'Assessment Version', value: `V${filters.assessmentVersion}`,
        onRemove: () => clearOne({ assessmentVersion: '' }),
      });
    }
    if (!fixedStatus && filters.status) {
      out.push({
        key: 'status', label: 'Status',
        value: STATUS_OPTIONS.find((s) => s.value === filters.status)?.label || filters.status,
        onRemove: () => clearOne({ status: '' }),
      });
    }
    if (filters.createdFrom || filters.createdTo) {
      const pretty = (d: string) =>
        d ? formatISTStamp(`${d}T00:00:00`).split(',')[0] : '';
      const from = pretty(filters.createdFrom);
      const to = pretty(filters.createdTo);
      out.push({
        key: 'created', label: 'Created',
        value: from && to ? `${from} – ${to}` : from ? `from ${from}` : `until ${to}`,
        onRemove: () => clearOne({ createdFrom: '', createdTo: '' }),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, rows, fixedStatus]);

  const activeFilterCount = chips.length;

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    /* A new column opens in its most useful direction rather than always
       ascending: dates and counts are read newest-/largest-first, names and
       ids A-Z. */
    setSortDir(key === 'createdAt' || key === 'invitations' || key === 'completed' ? 'desc' : 'asc');
  };

  /* ── Actions ─────────────────────────────────────────────────────────────
     Only what is valid for the row's status, read off the API's own status:
       Active   — Archive, View Assessment, View Results
       Draft    — Edit, View Assessment, Delete
       Archived — Unarchive, View Assessment, Delete (Archived tab), View Results (once someone has
                  completed it)
     Edit stays Draft-only — a published assessment is edited by duplicating
     it into a new version, which is the rule the creation flow already
     enforces. Each status change is the one the Assessments page's own menu
     makes (same endpoint, same confirm, same permission, same toast), and a
     row runs one at a time. */
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const runStatusAction = async (row: AssessmentRow, verb: string, action: () => Promise<unknown>, success: string) => {
    setBusyRowId(row.id);
    try {
      const result = await action();
      toast.success(success);
      /* The row takes the API's reply at once - its new status, or gone after
         a delete, or off a status tab it no longer belongs on - and the
         refetch below then confirms it. Only on success: a failed call
         throws past this. */
      const reply = result as AssessmentResponse | undefined;
      if (verb === 'delete' || reply?.status) {
        const updated = verb === 'delete' ? null : toRow(reply as AssessmentResponse);
        setRows((prev) => (updated === null || (fixedStatus && updated.rawStatus !== fixedStatus)
          ? prev.filter((r) => r.id !== row.id)
          : prev.map((r) => (r.id === row.id ? { ...r, rawStatus: updated.rawStatus, status: updated.status } : r))));
      }
      refreshRows();
      onMutated?.();
    } catch (err) {
      console.error(`Failed to ${verb} assessment:`, err);
      toast.error(`Failed to ${verb} assessment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setBusyRowId(null);
    }
  };

  const archiveRow = async (row: AssessmentRow) => {
    // Locked menu item is greyed with a tooltip; this is only a backstop.
    if (!canDeleteAssessment) return;
    const jobLock = await checkAssessmentJobLock(row.jdId);
    if (jobLock) {
      toast.error(jobLock);
      return;
    }
    if (!await confirmArchive({
      title: `${row.jobName || row.title || 'Untitled'} - Assessment`,
      version: row.assessmentVersion,
      createdAt: row.createdAt,
    })) return;
    void runStatusAction(row, 'archive', () => assessmentService.update(row.id, { status: 'archived' }), 'Assessment archived');
  };

  /* No dedicated unarchive endpoint exists for assessments: Archive is a
     status write through PUT /assessments/{id}, so Unarchive is the same
     write back to `published` — the Active status Archive is offered from. */
  const unarchiveRow = async (row: AssessmentRow) => {
    if (!canDeleteAssessment) return;
    const jobLock = await checkAssessmentJobLock(row.jdId);
    if (jobLock) {
      toast.error(jobLock);
      return;
    }
    void runStatusAction(row, 'unarchive', () => assessmentService.update(row.id, { status: 'published' }), 'Assessment restored to Active');
  };

  /* The page's own delete rules: drafts only (the endpoint's), and never once
     a candidate has been invited. */
  const deleteRow = async (row: AssessmentRow) => {
    if (!canDeleteAssessment) return;
    if (row.invitations > 0 || row.completed > 0) {
      toast.error('Cannot delete — candidates have already been invited to this assessment');
      return;
    }
    const jobLock = await checkAssessmentJobLock(row.jdId);
    if (jobLock) {
      toast.error(jobLock);
      return;
    }
    if (!await confirmDelete({
      jobShortId: row.raw.jd_short_id,
      jobTitle: row.jobName || row.title,
      jobVersion: row.jobVersion,
      version: row.assessmentVersion,
      createdAt: row.createdAt,
      createdBy: row.raw.created_by_name,
    })) return;
    void runStatusAction(row, 'delete', () => assessmentService.delete(row.id), 'Assessment deleted');
  };

  type RowAction = AssessmentRowAction;

  /* Opens an assessment's details page, whose Prev / Next then walks THIS
     table - every record, in the order it is showing (`sorted`: its filters
     and sort) - rather than the Total Jobs list, so "X / N" counts this tab's
     assessments, not jobs. One list per tab, so each tab pages its own. */
  const pagerList: AssessmentPagerList =
    fixedStatus === 'published' ? 'active-assessments'
      : fixedStatus === 'draft' ? 'draft-assessments'
        : fixedStatus === 'archived' ? 'archived-assessments'
          : 'all-assessments';
  const openAssessmentDetails = (row: AssessmentRow, query = '') => {
    rememberAssessmentPagerOrder(pagerList, sorted.map((r) => r.id));
    const params = new URLSearchParams(query);
    params.set(PAGER_LIST_PARAM, pagerList);
    router.push(`/recruitment/assessments/${row.id}?${params.toString()}`);
  };

  const rowActions = (row: AssessmentRow) => {
    /* Disabled / Archived job version: views stay, every change is greyed. */
    const jobLock = assessmentJobLockMessage(jobVersionStatusById[row.jdId]);
    /* `iconClassName` is the ⋮-menu icon token for the action — the
       `text-menu-icon-*` set the Invitation Status tab's menu colours its
       icons with (globals.css), so View reads the same blue there and here. */
    const view: RowAction = {
      key: 'view', label: 'View Assessment', icon: Eye, iconClassName: 'text-menu-icon-view',
      run: () => openAssessmentDetails(row),
    };
    const results: RowAction = {
      key: 'results', label: 'View Results', icon: BarChart, iconClassName: 'text-menu-icon-score',
      run: () => router.push(`/recruitment/assessments/${row.id}/results`),
    };

    /* With the host's extras (every tab on the Assessments page), the Total
       Jobs menu for the row's status, in its order: View, Edit, Share/Invite,
       Track, View Results, Duplicate, Revoke (Active), then Archive /
       Unarchive, then Delete. Without them, the menu as it was, below. */
    const extra = extraRowActions?.(row.raw);
    if (extra) {
      const shared = row.invitations > 0;
      const gatedResults: RowAction = {
        ...results,
        disabled: !shared,
        title: shared ? 'View results'
          : row.rawStatus === 'draft' ? 'Publish the assessment to view results'
          : 'Share the assessment to view results',
      };
      const archive: RowAction = {
        key: 'archive', label: 'Archive', icon: Archive, iconClassName: 'text-menu-icon-archive',
        disabled: !canDeleteAssessment || !!jobLock,
        title: !canDeleteAssessment ? 'You do not have permission to archive assessments' : jobLock ?? undefined,
        run: () => void archiveRow(row),
      };
      const unarchive: RowAction = {
        key: 'unarchive', label: 'Unarchive', icon: ArchiveRestore, iconClassName: 'text-menu-icon-archive',
        disabled: !canDeleteAssessment || !!jobLock,
        title: !canDeleteAssessment ? 'You do not have permission to unarchive assessments' : jobLock ?? undefined,
        run: () => void unarchiveRow(row),
      };
      const deleteReason = !canDeleteAssessment
        ? 'You do not have permission to delete assessments'
        : jobLock
          ? jobLock
        : row.invitations > 0 || row.completed > 0
          ? 'Cannot delete — candidates have already been invited to this assessment'
          : '';
      const del: RowAction = {
        key: 'delete', label: 'Delete', icon: Trash2, iconClassName: 'text-destructive', destructive: true,
        disabled: !!deleteReason, title: deleteReason || undefined,
        run: () => void deleteRow(row),
      };
      const isArchived = row.rawStatus === 'archived';
      return [
        // No View on a draft: it is opened through Continue Editing.
        ...(row.rawStatus === 'draft' ? [] : [view]),
        ...extra.main,
        gatedResults,
        ...extra.more,
        // Drafts publish from the Configure page, so they have no Archive.
        ...(isArchived ? [unarchive] : row.rawStatus === 'draft' ? [] : [archive]),
        /* Total Jobs offers Delete on every non-archived row; the Archived
           tab keeps the Delete it already had. */
        ...(!isArchived || fixedStatus === 'archived' ? [del] : []),
      ];
    }

    const actions: RowAction[] = [];
    switch (row.rawStatus) {
      case 'published': {
        const archive: RowAction = {
          key: 'archive', label: 'Archive', icon: Archive, iconClassName: 'text-menu-icon-archive',
          disabled: !canDeleteAssessment || !!jobLock,
          title: !canDeleteAssessment
            ? 'You do not have permission to archive assessments'
            : jobLock ?? undefined,
          run: () => void archiveRow(row),
        };
        actions.push(archive, view, results);
        break;
      }
      case 'draft':
        /* No Publish on any tab: a draft is published from the Configure
           page its Edit opens, the Total Jobs Edit's flow. */
        /* The All tab has its own Edit, on every row — added below. */
        /* RBAC: shown to everyone; greyed with a tooltip without edit permission. */
        if (fixedStatus) {
          actions.push({
            // A draft is unfinished — its Edit reads "Continue Editing".
            key: 'edit', label: 'Continue Editing', icon: Pencil, iconClassName: 'text-menu-icon-edit',
            disabled: !canUpdateAssessment || !!jobLock,
            title: !canUpdateAssessment ? 'You do not have permission to edit assessments' : jobLock ?? undefined,
            /* Straight to the Configure page for this assessment — the route
               the All tab's Edit and the page's own `handleEditAssessment`
               use. Without `step=configure&jd_id` the create flow opened on
               its job picker instead. */
            run: () => router.push(`/recruitment/assessments/create?step=configure&jd_id=${row.jdId}&edit=${row.id}`),
          });
        }
        /* No View Assessment for a draft on either tab: on the All tab a
           draft is opened through Edit, and the Draft tab's menu dropped it
           too — Edit (to the Configure page) and Delete are its actions. */
        break;
      case 'archived':
        actions.push(
          {
            key: 'unarchive', label: 'Unarchive', icon: ArchiveRestore, iconClassName: 'text-menu-icon-archive',
            disabled: !canDeleteAssessment || !!jobLock,
            title: !canDeleteAssessment ? 'You do not have permission to unarchive assessments' : jobLock ?? undefined,
            run: () => void unarchiveRow(row),
          },
          view,
        );
        if (row.completed > 0) actions.push(results);
        break;
      default:
        // Completed (`closed`): nothing to change, only to read.
        actions.push(view);
        if (row.completed > 0) actions.push(results);
    }
    /* All tab: Edit on every row, following Track — the invitations sent
       (`invitations_count`) are what enable Track, so while none have gone
       out Edit is open, and once one has it is shown disabled. Permission and
       the Archived read-only rule gate it as they do everywhere else. */
    if (!fixedStatus) {
      const editReason = !canUpdateAssessment
        ? 'You do not have permission to edit assessments'
        : jobLock
          ? jobLock
        : row.invitations > 0
          ? 'Cannot edit — this assessment has already been sent to candidates'
          : row.rawStatus === 'archived'
            ? 'Archived assessments cannot be edited'
            : '';
      actions.splice(actions.indexOf(view) + 1, 0, {
        // "Continue Editing" on a draft row, "Edit" on every other.
        key: 'edit', label: row.rawStatus === 'draft' ? 'Continue Editing' : 'Edit', icon: Pencil, iconClassName: 'text-menu-icon-edit',
        disabled: !!editReason,
        title: editReason || undefined,
        /* The Total Jobs Edit's route (`handleEditAssessment` on the
           Assessments page), so both open the same Configure page with the
           same assessment loaded. */
        run: () => router.push(`/recruitment/assessments/create?step=configure&jd_id=${row.jdId}&edit=${row.id}`),
      });
    }
    /* Last, as on the page's own menu: the one action that cannot be undone.
       On every Draft, and on every row of the Archived tab. */
    if (row.rawStatus === 'draft' || fixedStatus === 'archived') {
      actions.push({
        key: 'delete', label: 'Delete', icon: Trash2, iconClassName: 'text-destructive', destructive: true,
        disabled: !canDeleteAssessment || !!jobLock,
        title: !canDeleteAssessment ? 'You do not have permission to delete assessments' : jobLock ?? undefined,
        run: () => void deleteRow(row),
      });
    }
    return actions;
  };

  /* Whether a row click opens View Assessment — every row but a Draft on
     the All tab, which has no View Assessment (see `rowActions`). */
  const opensView = (row: AssessmentRow) => !!fixedStatus || row.rawStatus !== 'draft';

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
    <div className={embedded ? 'w-full' : 'flex-1 overflow-x-clip bg-slate-50'}>
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-[1400px]'}>
        <div className={embedded ? 'w-full' : 'p-3 sm:p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl'}>
          {!embedded && (
            <PageBreadcrumb
              className="mb-4 md:mb-6"
              items={[
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'AI Assessments', href: '/recruitment/assessments' },
                { label: 'All Assessments' },
              ]}
            />
          )}

          {/* ── 1. Page header ──────────────────────────────────────────────
              Title and subtitle only. No stat cards: the dashboard this screen
              is opened FROM owns those figures, and repeating them here would
              be two places to disagree about the same number.

              Its own route only. Embedded, this table is a TAB, and the tab
              pill above it has already said "All Assessments" / "Active" /
              "Draft" — so the heading only repeated the pill and the paragraph
              only repeated the heading, both of them sitting between the
              toolbar and the rows the tab exists to show. The breadcrumb-led
              route keeps the pair, because there is no pill there to name the
              list. */}
          {!embedded && (
          <div className="flex items-start gap-3 mb-5">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-brand-blue" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 mb-0.5 tracking-tight">
                {heading}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                {subheading}
              </p>
            </div>
          </div>
          )}

          {/* ── 2. Search & filter toolbar ────────────────────────────────
              `ListToolbar` + `ListFilterPanel`, the same pair and the same
              wrapper the Total Jobs tab uses, so every tab on the Assessments
              page puts its search in the same place at the same size with the
              same Reset and the same count badge beside it.

              What stayed with this screen is what is about ITS data: which
              controls the panel holds, and the draft-then-Apply rule they
              commit under. The toolbar's own Reset is wired to `clearAll`, the
              same handler the chips row and the panel's Clear All already
              call, so there is one way to empty this list however it is
              reached. */}
          <ListToolbarPortal>
            <ListToolbar
              searchValue={search}
              /* This screen debounces the query itself (`appliedSearch`, 300ms)
                 before anything reads it, so the toolbar hands keystrokes
                 straight through rather than debouncing a second time. Same
                 arrangement as the Total Jobs tab. */
              searchDebounceMs={0}
              onSearchChange={searchAndReset}
              searchPlaceholder="Search by job name or job ID..."
              onToggleFilters={() => setFiltersOpen((o) => !o)}
              filtersOpen={filtersOpen}
              activeFilterCount={activeFilterCount}
              /* APPLIED, not merely selected: the panel batches, so a picked
                 filter that has not been applied yet is not narrowing anything
                 and must not light the button up as though it were. */
              filtersApplied={hasAnyFilter(filters)}
              onClearFilters={clearAll}
              className="mb-0"
            />

            {/* The six filter controls. A panel rather than an always-open row:
                six controls permanently above the table would push the rows —
                the thing this screen is for — below the fold on a laptop. */}
            {filtersOpen && (
              <ListFilterPanel
                footer={
                  <>
                    <Button variant="secondary" size="sm" onClick={clearAll} icon={<X className="w-4 h-4" />}>
                      Clear All
                    </Button>
                    <Button variant="primary" size="sm" onClick={applyFilters}>
                      Apply Filters
                    </Button>
                  </>
                }
              >
                {/* `[&>button]` lifts SearchableSelect's h-9 trigger to the
                    38px filter-field standard without touching components/ui. */}
                <SearchableSelect
                  className="min-w-0 [&>button]:h-[38px]"
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
                  className="min-w-0 [&>button]:h-[38px]"
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
                  className="min-w-0 [&>button]:h-[38px]"
                  label="Assessment Version"
                  value={draftFilters.assessmentVersion}
                  onChange={(v) => setDraftFilters((f) => ({ ...f, assessmentVersion: v }))}
                  options={assessmentVersionOptions}
                  placeholder="All versions"
                  searchPlaceholder="Search version..."
                  allLabel="All versions"
                  emptyMessage="No versions match"
                />
                {!fixedStatus && (
                  <SearchableSelect
                    className="min-w-0 [&>button]:h-[38px]"
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

                {/* Created On — a from/to pair of custom DateField popovers.
                    These replace native <input type="date"> because the
                    browser's own calendar dropdown can't be clamped to the
                    viewport, resized, or aligned to the field — it either
                    clipped the input's text on a narrow phone or spilled the
                    popup over surrounding content in landscape. */}
                <div className="sm:col-span-2">
                  <label
                    htmlFor="all-assessments-created-from"
                    className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5"
                  >
                    Created On
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <DateField
                      id="all-assessments-created-from"
                      aria-label="Created from"
                      value={draftFilters.createdFrom}
                      max={draftFilters.createdTo || undefined}
                      onChange={(v) => setDraftFilters((f) => ({ ...f, createdFrom: v }))}
                      className="sm:flex-1 sm:min-w-0 h-[38px] px-2 sm:px-3 text-xs sm:text-sm"
                    />
                    <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
                    <DateField
                      aria-label="Created to"
                      value={draftFilters.createdTo}
                      min={draftFilters.createdFrom || undefined}
                      onChange={(v) => setDraftFilters((f) => ({ ...f, createdTo: v }))}
                      className="sm:flex-1 sm:min-w-0 h-[38px] px-2 sm:px-3 text-xs sm:text-sm"
                    />
                  </div>
                </div>
              </ListFilterPanel>
            )}

            {/* ── 3. Active filter chips ─────────────────────────────────────
                Inside the portal, with the row they summarise: the toolbar now
                sits in the host page's slot, and chips left behind in the card
                would be a list of applied filters nowhere near the control that
                applied them. */}
            <FilterChips chips={chips} onClearAll={clearAll} className="mt-3 mb-0" />
          </ListToolbarPortal>

          {/* ── 4. The table ───────────────────────────────────────────────
              `tf-table-shell` is the house table shell: sticky header, its own
              vertical scroller, and nowrap cells with horizontal scroll rather
              than columns that collapse or stack. `tf-sticky-col` pins the
              Actions column to the right edge so a kebab is always reachable
              however far the table is scrolled sideways. Both are defined once
              in globals.css and used by the app's other data tables. */}
          <div className="rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden bg-white dark:bg-slate-900">
            <div ref={scrollRef} className="tf-table-shell">
              <table className="w-full text-sm border-collapse">
                {hasBodyRows && (
                <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    {COLUMNS.map((col) => {
                      const isSorted = sortKey === col.key;
                      const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={`px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider ${
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
                      className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-right text-2xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider tf-sticky-col"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                )}

                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {/* ── 8. Loading ── Skeleton rows INSIDE the real table, so
                      the header, the column widths and the shell stay put and
                      the page does not jump when data lands. */}
                  {isLoading &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className={`px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''}`}
                          >
                            <div
                              className="h-3.5 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse"
                              style={{ width: col.key === 'jobName' ? '80%' : '55%' }}
                            />
                          </td>
                        ))}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 tf-sticky-col">
                          <div className="h-6 w-6 ml-auto rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                        </td>
                      </tr>
                    ))}

                  {/* ── 9. Error ── One row in the body, so the header and the
                      toolbar above it survive the failure. */}
                  {!isLoading && error && (
                    <tr>
                      <td colSpan={columnCount} className="p-0"><div className={TABLE_EMPTY_PANEL_CLASS}>
                        <div className="w-14 h-14 rounded-full bg-destructive-subtle ring-1 ring-destructive-line flex items-center justify-center mx-auto mb-4">
                          <AlertTriangle className="w-7 h-7 text-destructive" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
                          Unable to load assessments
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
                          Something went wrong while loading the assessment list. Please try again.
                        </p>
                        <Button variant="primary" size="sm" onClick={retry} icon={<RefreshCw className="w-4 h-4" />}>
                          Retry
                        </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* ── 7. Empty ── Distinguishes "nothing matched your filters"
                      from "you have no assessments yet": the first needs Clear
                      Filters, the second has nothing to clear. */}
                  {!isLoading && !error && pageRows.length === 0 && (
                    <tr>
                      <td colSpan={columnCount} className="p-0"><div className={TABLE_EMPTY_PANEL_CLASS}>
                        <div className="w-14 h-14 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center mx-auto mb-4">
                          <ClipboardList className="w-7 h-7 text-brand-blue" />
                        </div>
                        {/* The "nothing here yet" wording is the one place the
                            pinned status shows through. Archived is the reason:
                            the shared line, "Assessments you create will be
                            listed here", is true of Draft and of All, and false
                            of Archived — a new assessment lands in Draft, never
                            in Archived, so on that tab it described something
                            that cannot happen. Both archived strings are
                            carried over verbatim from the empty state the
                            Archived tab used before it moved into this table,
                            so the tab reads exactly as it did. */}
                        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50 mb-1">
                          {isNarrowed
                            ? 'No assessments found'
                            : fixedStatus === 'archived'
                              ? 'No archived assessments found.'
                              : 'No assessments yet'}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
                          {isNarrowed
                            ? 'No assessments match your current search or filter criteria.'
                            : fixedStatus === 'archived'
                              ? 'Assessments you archive will appear here.'
                              : 'Assessments you create will be listed here.'}
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
                        onClick={opensView(row) ? () => openAssessmentDetails(row) : undefined}
                        className={`${opensView(row) ? 'cursor-pointer' : ''} transition-colors hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10`}
                      >
                        {/* 1. Job ID — secondary by design: the chip is the
                            house Job Openings badge, which reads as a
                            reference rather than as the row's headline. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          {row.jobId ? (
                            <JobIdBadge>{row.jobId}</JobIdBadge>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* 2. Job Name — the row's anchor, so it carries the
                            weight. The job name only, truncated with the full
                            name in `title`. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          {/* The cap sits on the span: a table cell's own
                              max-width is ignored, so on the td it let a long
                              job name widen the column uncut. */}
                          <span
                            className="block max-w-[12rem] sm:max-w-[16rem] truncate font-medium text-gray-900 dark:text-slate-50"
                            title={row.jobName}
                          >
                            {row.jobName}
                          </span>
                        </td>

                        {/* 3. Job Version — its own column, blue chip. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          <VersionPill kind="job" version={row.jobVersion} />
                        </td>

                        {/* 4. Assessment Version — its own column, cyan chip. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          <VersionPill kind="assessment" version={row.assessmentVersion} />
                        </td>

                        {/* 5. Status */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          <StatusBadge status={row.status} />
                        </td>

                        {/* 6. Invitations Sent — right-aligned and tabular, so
                            the digits line up down the column; "sent" stays
                            muted so the number is what is scanned. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-right">
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">
                            {row.invitations.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">sent</span>
                        </td>

                        {/* 7. Completed — candidates who completed this
                            assessment (`completed_count`), in the same
                            right-aligned tabular figures as Invitations Sent
                            beside it, with "Completed" muted after the
                            number — whatever the count — the way "sent"
                            follows that one. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-right whitespace-nowrap">
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">
                            {row.completed.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">Completed</span>
                        </td>

                        {/* 7. Created On — date AND time, fixed width. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          <span className="text-gray-600 dark:text-slate-400 tabular-nums">
                            {formatISTStamp(row.createdAt)}
                          </span>
                        </td>

                        {/* 8. Created By */}
                        <td className={`px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle ${HIDE_CLASS.lg}`}>
                          <CreatedBy name={row.createdBy} />
                        </td>

                        {/* 9. Actions — one kebab, not a row of buttons.
                            Radix's DropdownMenu (the same control the AI
                            Interview invite table uses) so it escapes the
                            table's scroll containers instead of being clipped
                            by them, which a hand-rolled absolute menu inside
                            an overflow:auto shell would be. */}
                        <td
                          className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-right tf-sticky-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-slate-400 hover:bg-brand-blue/10 hover:text-brand-blue transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                                aria-label={`Actions for ${row.title}`}
                                title="Actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {rowActions(row).map(({ key, label, icon: Icon, iconClassName, run, destructive, disabled, title }) => (
                                /* A disabled action (permission or state) stays listed,
                                   greyed, and keeps its reason on hover: aria-disabled
                                   rather than Radix `disabled`, whose pointer-events:none
                                   swallowed the title tooltip. The click is a no-op. */
                                <DropdownMenuItem
                                  key={key}
                                  onClick={disabled ? undefined : run}
                                  onSelect={disabled ? (e) => e.preventDefault() : undefined}
                                  disabled={busyRowId === row.id}
                                  aria-disabled={disabled || undefined}
                                  title={title}
                                  className={`gap-2${disabled ? ' text-gray-400 cursor-not-allowed opacity-60' : destructive ? ' text-destructive focus:text-destructive' : ''}`}
                                >
                                  <Icon className={`w-4 h-4 ${disabled ? 'text-gray-300' : iconClassName}`} />
                                  <span className={MENU_ITEM_SCALE_CLASS}>{label}</span>
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

          {/* ── 6. Pagination ── The shared control, on this screen's ladder.
              Hidden while loading and on failure: a pager over skeletons
              claims a total nobody knows yet. */}
          {!isLoading && !error && (
            <ListPagination
              currentPage={safePage}
              itemsPerPage={pageSize}
              totalItems={sorted.length}
              onPageChange={setPage}
              onItemsPerPageChange={setPageSize}
              itemLabel="assessments"
              scrollContainerRef={scrollRef}
            />
          )}
        </div>
      </div>
      {archiveConfirmModal}
      {deleteConfirmModal}
    </div>
  );
}
