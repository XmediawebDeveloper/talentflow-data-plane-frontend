'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, ClipboardList, MoreVertical, Eye, Pencil,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, RefreshCw,
  Archive, ArchiveRestore, BarChart, Trash2,
  CheckSquare, Square, ChevronDown, Loader2, FileDown, FileText, FileSpreadsheet,
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
import ListViewToggle, { type ListDisplayMode } from '@/components/ui/list-view-toggle';
import { DateField } from '@/components/ui/date-field';
import { assessmentService, type AssessmentResponse } from '@/lib/services/assessmentService';
import { formatISTStamp, parseIST } from '@/lib/utils/dateUtils';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAuth } from '@/lib/hooks/useAuth';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Button } from '@/components/ui/button';
import AppModal from '@/components/ui/app-modal';
import ExportColumnsModal from '@/components/ExportColumnsModal';
import GridCardSelect, { gridCardSelectedClass } from '@/components/ui/grid-card-select';
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
    <span className="inline-flex items-center gap-2 min-w-0 max-w-[10rem]">
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
  /** Column alignment; version and count columns are centred. */
  align?: 'left' | 'center' | 'right';
  /** Hidden below this breakpoint. The nine columns do not all fit a tablet. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

/* The exact column order this screen specifies. Job ID, Job Name, Job Version
   and Assessment Version are four separate columns on purpose — a combined
   "Job (V3)" cell cannot be sorted or filtered by version. */
const COLUMNS: ColumnDef[] = [
  { key: 'jobId', label: 'JD ID' },
  { key: 'jobName', label: 'Job Name' },
  { key: 'jobVersion', label: 'Job Version', align: 'center' },
  { key: 'assessmentVersion', label: 'Assessment Version', align: 'center' },
  { key: 'status', label: 'Status' },
  { key: 'invitations', label: 'Invitations Sent', align: 'center' },
  { key: 'completed', label: 'Completed', align: 'center' },
  /* Created On + Created By in one column: date, with who underneath. */
  { key: 'createdAt', label: 'Created' },
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
  /** The host page's List/Card choice, shared by every tab. 'list' (the
   *  default) is the table; 'grid' is one card per row. */
  displayMode?: ListDisplayMode;
  /** When passed, the List/Card switch shows at the end of this table's
   *  toolbar row. */
  onDisplayModeChange?: (mode: ListDisplayMode) => void;
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

export default function AllAssessmentsTable({ embedded = false, fixedStatus, title, description, clearSortSignal, onSortDefaultChange, onRowCountChange, extraRowActions, reloadSignal = 0, onMutated, displayMode = 'list', onDisplayModeChange }: AllAssessmentsTableProps = {}) {
  const router = useRouter();
  const { isTenantAdmin, user, hasPermissionCode } = useAuth();
  const canUpdateAssessment = isTenantAdmin || (user?.permissions?.canUpdateAssessments ?? false);
  const canDeleteAssessment = isTenantAdmin || (user?.permissions?.canDeleteAssessments ?? false);
  // `assessments:export` by permission code — not the legacy `canExport` flag,
  // which is shared with internal_db:export.
  const canExport = isTenantAdmin || hasPermissionCode('assessments:export');
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

  /* ── Row selection ─────────────────────────────────────────────────────
     The AI Interviews All / Active / Draft / Archived table's checkbox
     column, and what it is for: the Actions (N) menu below — Export,
     Archive, Unarchive, Delete — over the ticked rows. Selection survives
     paging; it is pruned to the rows that still exist after a reload or a
     narrower filter. */
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
  const selectedRows = useMemo(() => sorted.filter((row) => selectedIds.has(row.id)), [sorted, selectedIds]);

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

  /* ── Bulk Archive / Unarchive / Delete ─────────────────────────────────
     Per row, the SAME rule the row's ⋮ menu applies (permission, Disabled /
     Archived job version, drafts have no Archive, nobody invited for Delete,
     archived rows delete from the Archived tab). A row that fails it is
     skipped and named in the confirm. There is no bulk endpoint: each
     eligible row gets the row action's own call, four at a time. */
  type BulkVerb = 'archive' | 'unarchive' | 'delete';
  const bulkSkipReason = (row: AssessmentRow, verb: BulkVerb): string => {
    if (!canDeleteAssessment) return `You do not have permission to ${verb} assessments`;
    const jobLock = assessmentJobLockMessage(jobVersionStatusById[row.jdId]);
    if (jobLock) return jobLock;
    if (verb === 'archive') {
      if (row.rawStatus === 'archived') return 'Already archived';
      if (row.rawStatus === 'draft') return 'Drafts cannot be archived — delete them instead';
      return '';
    }
    if (verb === 'unarchive') return row.rawStatus === 'archived' ? '' : 'Not archived';
    if (row.invitations > 0 || row.completed > 0) return 'Candidates have already been invited';
    if (row.rawStatus === 'archived' && fixedStatus !== 'archived') return 'Archived — delete it from the Archived tab';
    return '';
  };
  const bulkPlan = (verb: BulkVerb) => {
    const eligible: AssessmentRow[] = [];
    const skipped = new Map<string, number>();
    for (const row of selectedRows) {
      const reason = bulkSkipReason(row, verb);
      if (reason) skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
      else eligible.push(row);
    }
    return { eligible, skipped, skippedCount: selectedRows.length - eligible.length };
  };
  const BULK_COPY: Record<BulkVerb, { label: string; title: string; past: string; ing: string }> = {
    archive: { label: 'Archive', title: 'Archive assessments', past: 'archived', ing: 'Archiving' },
    unarchive: { label: 'Unarchive', title: 'Unarchive assessments', past: 'restored', ing: 'Restoring' },
    delete: { label: 'Delete', title: 'Delete assessments', past: 'deleted', ing: 'Deleting' },
  };
  const [bulkVerb, setBulkVerb] = useState<BulkVerb | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const runBulk = async () => {
    if (!bulkVerb) return;
    const verb = bulkVerb;
    const { eligible, skippedCount } = bulkPlan(verb);
    const call = (row: AssessmentRow) =>
      verb === 'archive' ? assessmentService.update(row.id, { status: 'archived' })
        : verb === 'unarchive' ? assessmentService.update(row.id, { status: 'published' })
          : assessmentService.delete(row.id);
    setBulkRunning(true);
    let done = 0;
    let failed = 0;
    const queue = [...eligible];
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift()!;
        try {
          await call(row);
          done += 1;
        } catch (err) {
          console.error(`Bulk ${verb} failed for assessment ${row.id}:`, err);
          failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    setBulkRunning(false);
    setBulkVerb(null);
    setSelectedIds(new Set());
    const parts = [`${done} ${BULK_COPY[verb].past}`];
    if (skippedCount) parts.push(`${skippedCount} skipped`);
    if (failed) parts.push(`${failed} failed`);
    (failed ? toast.error : done ? toast.success : toast.warning)(parts.join(' · '));
    refreshRows();
    onMutated?.();
  };

  /* ── Bulk Export ── The ticked rows, the columns picked in the popup. */
  const EXPORT_COLUMNS = [
    { id: 'jobId', label: 'JD ID' },
    { id: 'jobName', label: 'Job Name' },
    { id: 'jobVersion', label: 'Job Version' },
    { id: 'assessmentVersion', label: 'Assessment Version' },
    { id: 'status', label: 'Status' },
    { id: 'invitations', label: 'Invitations Sent' },
    { id: 'completed', label: 'Completed' },
    { id: 'created', label: 'Created' },
  ];
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xls'>('csv');
  const handleExport = (ids: string[]) => {
    if (!canExport) return;
    if (selectedRows.length === 0) {
      toast.warning('No assessments to export');
      return;
    }
    const cols = EXPORT_COLUMNS.filter((c) => ids.includes(c.id));
    // Created splits into its two parts, so each lands in its own column.
    const headers = cols.flatMap((c) => (c.id === 'created' ? ['Created On', 'Created By'] : [c.label]));
    const data = selectedRows.map((row) => cols.flatMap((c): string[] => {
      switch (c.id) {
        case 'jobId': return [row.jobId];
        case 'jobName': return [row.jobName];
        case 'jobVersion': return [`V${row.jobVersion}`];
        case 'assessmentVersion': return [`V${row.assessmentVersion}`];
        case 'status': return [row.status];
        case 'invitations': return [String(row.invitations)];
        case 'completed': return [String(row.completed)];
        case 'created': return [row.createdAt ? formatISTStamp(row.createdAt) : '', row.createdBy];
        default: return [''];
      }
    }));
    const baseName = `Assessments_${fixedLabel || 'All'}_${new Date().toISOString().slice(0, 10)}`;
    let blob: Blob;
    let fileName: string;
    if (exportFormat === 'csv') {
      const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const csv = [headers.map(q).join(','), ...data.map((cells) => cells.map(q).join(','))].join('\n');
      blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
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
    setShowExportModal(false);
    // Audit trail for the export — best-effort, after the file is on its way.
    void assessmentService.logListExport({
      format: exportFormat,
      record_count: selectedRows.length,
      export_type: 'assessment_list',
      tab: fixedStatus || 'all',
      ids: selectedRows.map((row) => row.id),
    });
  };

  /* Which bulk items this tab offers: All → every one; Active / Draft →
     Archive + Delete; Archived → Unarchive + Delete. */
  const bulkVerbs: BulkVerb[] =
    fixedStatus === 'archived' ? ['unarchive', 'delete']
      : fixedStatus ? ['archive', 'delete']
        : ['archive', 'unarchive', 'delete'];
  const bulkActionsMenu = selectedRows.length > 0 ? (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative h-[38px] px-3 rounded-lg font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 hover:border-gray-300 data-[state=open]:bg-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-300"
            aria-label={`Actions for ${selectedRows.length} selected`}
          >
            <span aria-hidden className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75 animate-ping [animation-iteration-count:4]" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-orange ring-2 ring-white" />
            </span>
            {bulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
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
            title={canExport ? undefined : 'You do not have permission to export assessments'}
            onSelect={(e) => {
              if (!canExport) { e.preventDefault(); return; }
              setShowExportModal(true);
            }}
            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${canExport ? 'cursor-pointer' : 'text-gray-400 cursor-not-allowed opacity-60'}`}
          >
            <FileDown className={`w-4 h-4 ${canExport ? 'text-menu-icon-download' : 'text-gray-300'}`} />
            <span>Export</span>
          </DropdownMenuItem>
          {bulkVerbs.map((verb) => {
            const { eligible, skipped } = bulkPlan(verb);
            const n = eligible.length;
            const total = selectedRows.length;
            /* RBAC rule: nothing hidden — with no eligible row the item stays,
               greyed, its reason on hover, and the click does nothing. */
            const reason = n === 0 ? [...skipped.keys()].join(' · ') : undefined;
            const Icon = verb === 'archive' ? Archive : verb === 'unarchive' ? ArchiveRestore : Trash2;
            return (
              <DropdownMenuItem
                key={verb}
                aria-disabled={n === 0 || bulkRunning || undefined}
                title={reason}
                onSelect={(e) => {
                  if (n === 0 || bulkRunning) { e.preventDefault(); return; }
                  setBulkVerb(verb);
                }}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${
                  n === 0 ? 'text-gray-400 cursor-not-allowed opacity-60' : verb === 'delete' ? 'cursor-pointer text-destructive' : 'cursor-pointer'
                }`}
              >
                <Icon className={`w-4 h-4 ${n === 0 ? 'text-gray-300' : verb === 'delete' ? 'text-destructive' : 'text-menu-icon-archive'}`} />
                <span>{BULK_COPY[verb].label} ({n === total ? n : `${n} of ${total}`})</span>
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
        className="whitespace-nowrap !h-[38px] !text-sm"
      >
        Clear
      </Button>
    </>
  ) : null;

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

  const columnCount = COLUMNS.length + 2; // + Select + Actions
  /* Whether the table has data rows to lay out — and so whether its header
     belongs on screen at all.
     With none, the header is the only thing left forcing a width: its cells are
     `nowrap`, so the table stays wider than `tf-table-shell` and the single
     empty-state cell gets centred across THAT width rather than the visible
     one — the message drifts off the side behind a horizontal scrollbar that
     exists only to reach it. Nothing to label means nothing to be wide for.
     See `TABLE_EMPTY_PANEL_CLASS`. */
  /* ── 9. Error ── and ── 7. Empty ── panels, shared by the table (as one
     row in its body, so the header and toolbar survive) and the card view.
     Empty distinguishes "nothing matched your filters" from "you have no
     assessments yet": the first needs Clear Filters, the second has nothing
     to clear. */
  const errorPanel = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
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
  );
  const emptyPanel = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
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
  );

  /* ── Actions ── one kebab, not a row of buttons. Radix's DropdownMenu (the
     same control the AI Interview invite table uses) so it escapes the
     table's scroll containers instead of being clipped by them. Shared by the
     table's Actions cell and the card's corner. */
  const actionsCell = (row: AssessmentRow) => (
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
  );

  const hasBodyRows = isLoading || (!error && pageRows.length > 0);

  return (
    <div className={embedded ? 'w-full' : 'flex-1 overflow-x-clip bg-slate-50'}>
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-[1400px]'}>
        <div className={embedded ? 'w-full' : 'p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl'}>
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
              <p className="text-sm text-gray-600 dark:text-slate-400">
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
              afterFiltersActions={bulkActionsMenu}
              trailing={onDisplayModeChange ? <ListViewToggle value={displayMode} onChange={onDisplayModeChange} /> : undefined}
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
                      className="sm:flex-1 sm:min-w-0 h-[38px] px-2 sm:px-3 text-sm"
                    />
                    <span className="text-xs text-gray-400 text-center sm:text-left sm:flex-shrink-0">to</span>
                    <DateField
                      aria-label="Created to"
                      value={draftFilters.createdTo}
                      min={draftFilters.createdFrom || undefined}
                      onChange={(v) => setDraftFilters((f) => ({ ...f, createdTo: v }))}
                      className="sm:flex-1 sm:min-w-0 h-[38px] px-2 sm:px-3 text-sm"
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
          {/* ── Card view ── the Candidate Results tab's card grid: one card
              per row, carrying the same fields the table shows. */}
          {displayMode === 'grid' ? (
          <div className="rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden bg-white dark:bg-slate-900">
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
                  const openable = opensView(row);
                  const isSelected = selectedIds.has(row.id);
                  return (
                    /* A div, not a <button>: the Actions menu is a button and
                       must not nest inside one. Opens on the same rule as the
                       table row. */
                    <div
                      key={row.id}
                      role={openable ? 'button' : undefined}
                      tabIndex={openable ? 0 : undefined}
                      onClick={openable ? () => openAssessmentDetails(row) : undefined}
                      onKeyDown={openable ? (e) => { if (e.key === 'Enter') openAssessmentDetails(row); } : undefined}
                      className={`group relative text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] shadow-sm shadow-brand-blue/5 transition-all p-4 flex flex-col gap-3 ${
                        openable ? 'cursor-pointer hover:shadow-md hover:border-brand-blue/20 hover:-translate-y-0.5' : ''
                      } ${gridCardSelectedClass(isSelected)}`}
                    >
                      <GridCardSelect
                        selected={isSelected}
                        onToggle={() => toggleSelected(row.id)}
                        label={row.jobName}
                        selectionActive={selectedIds.size > 0}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-slate-50"
                          title={row.jobName}
                        >
                          {row.jobName}
                        </span>
                        <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                          {actionsCell(row)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.jobId && <JobIdBadge>{row.jobId}</JobIdBadge>}
                        <span title="Job version"><VersionPill kind="job" version={row.jobVersion} /></span>
                        <span title="Assessment version"><VersionPill kind="assessment" version={row.assessmentVersion} /></span>
                      </div>

                      <div className="flex items-center flex-wrap gap-y-1"><StatusBadge status={row.status} /></div>

                      <div className="flex items-center gap-4 text-sm">
                        <span>
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">{row.invitations.toLocaleString()}</span>
                          <span className="text-xs text-gray-400 ml-1">sent</span>
                        </span>
                        <span>
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">{row.completed.toLocaleString()}</span>
                          <span className="text-xs text-gray-400 ml-1">Completed</span>
                        </span>
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
          <div className="rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-sm shadow-brand-blue/5 overflow-hidden bg-white dark:bg-slate-900">
            <div ref={scrollRef} className="tf-table-shell">
              <table className="w-full text-sm border-collapse">
                {hasBodyRows && (
                <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    {/* Select All — this page's rows. */}
                    <th scope="col" className="pl-3 sm:pl-4 lg:pl-6 pr-0 py-3 sm:py-3.5 lg:py-4 w-10 align-middle">
                      {isLoading ? (
                        <div className="h-4 w-4 ml-1 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                      ) : (
                        <button
                          type="button"
                          onClick={toggleAllOnPage}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
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
                    {COLUMNS.map((col) => {
                      const isSorted = sortKey === col.key;
                      const SortIcon = !isSorted ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={`px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider ${
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                          } ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ''}`}
                        >
                          {/* Loading: the header is skeleton bars too, as in the
                              shared TableSkeleton — no real labels until the rows
                              arrive. */}
                          {isLoading ? (
                            <div className={`h-3.5 w-16 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse ${col.align === 'right' ? 'ml-auto' : col.align === 'center' ? 'mx-auto' : ''}`} />
                          ) : (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            disabled={!!error}
                            className={`inline-flex items-center gap-1.5 group uppercase uppercase tracking-wider transition-colors hover:text-brand-blue disabled:cursor-not-allowed ${
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
                      className="px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5 lg:py-4 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider tf-sticky-col"
                    >
                      {isLoading ? <div className="h-3.5 w-14 ml-auto rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" /> : 'Actions'}
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
                        <td className="pl-3 sm:pl-4 lg:pl-6 pr-0 py-2.5 sm:py-3 lg:py-4 w-10">
                          <div className="h-4 w-4 ml-1 rounded bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
                        </td>
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
                      <td colSpan={columnCount} className="p-0">{errorPanel}</td>
                    </tr>
                  )}

                  {/* ── 7. Empty ── Distinguishes "nothing matched your filters"
                      from "you have no assessments yet": the first needs Clear
                      Filters, the second has nothing to clear. */}
                  {!isLoading && !error && pageRows.length === 0 && (
                    <tr>
                      <td colSpan={columnCount} className="p-0">{emptyPanel}</td>
                    </tr>
                  )}

                  {!isLoading &&
                    !error &&
                    pageRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={opensView(row) ? () => openAssessmentDetails(row) : undefined}
                        className={`${opensView(row) ? 'cursor-pointer' : ''} transition-colors hover:bg-brand-blue/5 dark:hover:bg-brand-blue/10 ${selectedIds.has(row.id) ? 'bg-brand-blue/[0.04] dark:bg-brand-blue/10' : ''}`}
                      >
                        {/* 0. Select — its own click, never the row's open. */}
                        <td className="pl-3 sm:pl-4 lg:pl-6 pr-0 py-2.5 sm:py-3 lg:py-4 w-10 align-middle" onClick={(e) => e.stopPropagation()}>
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
                          {/* Fixed width on the span (a table cell's own
                              max-width is ignored): same column width on every
                              row, longer names end in "…", full name on hover. */}
                          <span
                            className="block w-[10rem] sm:w-[12rem] truncate font-medium text-gray-900 dark:text-slate-50"
                            title={row.jobName}
                          >
                            {row.jobName}
                          </span>
                        </td>

                        {/* 3. Job Version — its own column, blue chip. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-center">
                          <VersionPill kind="job" version={row.jobVersion} />
                        </td>

                        {/* 4. Assessment Version — its own column, cyan chip. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-center">
                          <VersionPill kind="assessment" version={row.assessmentVersion} />
                        </td>

                        {/* 5. Status */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          <StatusBadge status={row.status} />
                        </td>

                        {/* 6. Invitations Sent — the number alone (the header
                            names it), centred, tabular figures. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-center">
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">
                            {row.invitations.toLocaleString()}
                          </span>
                        </td>

                        {/* 7. Completed — candidates who completed this
                            assessment (`completed_count`), in the same
                            centred tabular figures as Invitations Sent
                            beside it — the number alone. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle text-center whitespace-nowrap">
                          <span className="tabular-nums text-gray-900 dark:text-slate-100">
                            {row.completed.toLocaleString()}
                          </span>
                        </td>

                        {/* 7. Created — date and time, with who created it underneath. */}
                        <td className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 lg:py-4 align-middle">
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-gray-600 dark:text-slate-400 tabular-nums">
                              {formatISTStamp(row.createdAt)}
                            </span>
                            <CreatedBy name={row.createdBy} />
                          </div>
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
                          {actionsCell(row)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

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

      {/* Bulk Archive / Unarchive / Delete — one confirm for the ticked rows:
          how many will change, and which are skipped and why. */}
      {bulkVerb && (() => {
        const { eligible, skipped } = bulkPlan(bulkVerb);
        const copy = BULK_COPY[bulkVerb];
        return (
          <AppModal
            open
            size="sm"
            onCancel={() => { if (!bulkRunning) setBulkVerb(null); }}
            cancelDisabled={bulkRunning}
            title={copy.title}
            icon={bulkVerb === 'delete' ? <Trash2 className="w-5 h-5 text-destructive" /> : bulkVerb === 'archive' ? <Archive className="w-5 h-5 text-brand-blue" /> : <ArchiveRestore className="w-5 h-5 text-brand-blue" />}
            actions={[{
              label: bulkRunning ? `${copy.ing}…` : `${copy.label} ${eligible.length}`,
              onClick: () => void runBulk(),
              variant: bulkVerb === 'delete' ? 'destructive' : 'primary',
              loading: bulkRunning,
              disabled: bulkRunning || eligible.length === 0,
            }]}
          >
            <div className="space-y-3 text-sm text-gray-700 dark:text-slate-300">
              <p>
                <span className="font-semibold">{eligible.length}</span> assessment{eligible.length === 1 ? '' : 's'} will be {copy.past}.
                {bulkVerb === 'delete' && ' This cannot be undone.'}
              </p>
              {skipped.size > 0 && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700 p-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5">Skipped</p>
                  <ul className="space-y-1 text-xs text-gray-600 dark:text-slate-400">
                    {[...skipped.entries()].map(([reason, count]) => (
                      <li key={reason}>{count} — {reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AppModal>
        );
      })()}

      {showExportModal && (
        <ExportColumnsModal<'csv' | 'xls'>
          title="Export Assessments"
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
