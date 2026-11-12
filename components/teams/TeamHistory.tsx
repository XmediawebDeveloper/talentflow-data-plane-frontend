'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, UserMinus, Pencil, Trash2, Clock, Loader2, AlertCircle, Search, Download, RefreshCw, X, List, Table2 } from 'lucide-react';
import type { IconComponent } from '@/lib/types/icon';
import teamService, { TeamHistoryEntry } from '@/lib/services/teamService';
import { formatIST, formatISTDate, formatISTTime, parseIST, toISODateIST } from '@/lib/utils/dateUtils';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import NameAvatar from '@/components/ui/name-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';
import ListPagination from '@/components/ListPagination';
import { toast } from '@/components/ui/enhanced-toast';
import { useIsMobile } from '@/components/ui/use-mobile';

const PAGE_SIZES = [10, 25, 50];

/** The history API can't filter by team, person or date, so those filters (and
 *  the summary strip) work on the latest this-many entries, in the browser. */
const BATCH_LIMIT = 500;
/** Export reads pages of this size, up to EXPORT_CAP entries. */
const EXPORT_PAGE = 500;
const EXPORT_CAP = 10_000;
const EXPORT_HEADERS = ['Date & Time', 'Event', 'Team', 'Member', 'By', 'Details'];

// Colour by what happened: created teal, updated blue, added green, removed / deleted red.
export const EVENT_CONFIG: Record<string, { label: string; icon: IconComponent; color: string; bg: string; dot: string }> = {
  TEAM_CREATED: { label: 'Team Created', icon: Users, color: 'text-brand-teal', bg: 'bg-brand-teal/10 ring-1 ring-brand-teal/20', dot: 'bg-brand-teal' },
  TEAM_UPDATED: { label: 'Team Updated', icon: Pencil, color: 'text-brand-blue', bg: 'bg-brand-blue/10 ring-1 ring-brand-blue/15', dot: 'bg-brand-blue' },
  TEAM_DELETED: { label: 'Team Deleted', icon: Trash2, color: 'text-destructive', bg: 'bg-destructive-subtle ring-1 ring-destructive-line', dot: 'bg-destructive' },
  MEMBER_ADDED: { label: 'Member Added', icon: UserPlus, color: 'text-success', bg: 'bg-success-subtle ring-1 ring-success-line', dot: 'bg-success' },
  MEMBER_REMOVED: { label: 'Member Removed', icon: UserMinus, color: 'text-destructive', bg: 'bg-destructive-subtle ring-1 ring-destructive-line', dot: 'bg-destructive' },
};

const FILTERS = ['ALL', 'TEAM_CREATED', 'TEAM_UPDATED', 'TEAM_DELETED', 'MEMBER_ADDED', 'MEMBER_REMOVED'] as const;
/** Export reads this many pages at once. */
const EXPORT_PARALLEL = 4;
type HistoryView = 'timeline' | 'table';
/** Shown when the backend has no name for the member (e.g. the user was deleted). */
const UNKNOWN_USER = 'Unknown user';

/** "LEAD_CHANGED" → "Lead Changed" — for event types this screen doesn't know yet. */
const humanize = (raw: string) =>
  raw.toLowerCase().split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const eventLabel = (type: string) => EVENT_CONFIG[type]?.label ?? humanize(type);

/** Style for an event type, with a neutral fallback for types this screen doesn't know. */
const eventConfig = (type: string) => EVENT_CONFIG[type] ?? {
  label: humanize(type),
  icon: Clock,
  color: 'text-gray-700 dark:text-slate-300',
  bg: 'bg-gray-100 dark:bg-slate-800',
  dot: 'bg-gray-400',
};

function formatDate(iso: string) {
  return formatIST(iso);
}

/** "just now", "5m ago", "2h ago" for today; time of day for older entries
 *  (their day heading already says the date). Full date-time is the tooltip. */
export function entryTime(iso: string) {
  if (toISODateIST(iso) !== toISODateIST(new Date())) return formatISTTime(iso);
  const mins = Math.floor((Date.now() - parseIST(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/** Day heading for an entry: Today, Yesterday, or the date. */
function dayLabel(iso: string) {
  const day = toISODateIST(iso);
  if (day === toISODateIST(new Date())) return 'Today';
  if (day === toISODateIST(new Date(Date.now() - 86_400_000))) return 'Yesterday';
  return formatISTDate(iso);
}

// ─── "What changed" for TEAM_UPDATED ──────────────────────────────────────────

type Change = { field: string; from?: string; to?: string };

const show = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'object') return Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : undefined;
  const text = String(v);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

/**
 * Reads the field changes out of an update's `details`, whichever shape the
 * backend sends: { changes: { name: { old, new } } }, { changes: [{ field, old, new }] },
 * { before: {...}, after: {...} }, or flat old_x / new_x pairs. Anything else
 * falls back to the changed field names. (The details were never shown before.)
 */
function readChanges(details: Record<string, unknown> | undefined): Change[] {
  if (!details) return [];
  const pick = (o: Record<string, unknown>, ...keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined);
  const changes = details.changes;
  if (Array.isArray(changes)) {
    return changes
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        field: String(pick(c, 'field', 'name', 'key') ?? 'field'),
        from: show(pick(c, 'old', 'from', 'before', 'old_value')),
        to: show(pick(c, 'new', 'to', 'after', 'new_value')),
      }));
  }
  if (changes && typeof changes === 'object') {
    return Object.entries(changes as Record<string, unknown>).map(([field, v]) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? { field, from: show(pick(v as Record<string, unknown>, 'old', 'from', 'before')), to: show(pick(v as Record<string, unknown>, 'new', 'to', 'after')) }
        : { field, to: show(v) },
    );
  }
  const before = details.before ?? details.old ?? details.previous;
  const after = details.after ?? details.new ?? details.current;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    return Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
      .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
      .map((field) => ({ field, from: show(b[field]), to: show(a[field]) }));
  }
  const paired = Object.keys(details)
    .filter((k) => /^(old|previous)_/.test(k))
    .map((k) => {
      const field = k.replace(/^(old|previous)_/, '');
      return { field, from: show(details[k]), to: show(details[`new_${field}`] ?? details[field]) };
    });
  if (paired.length > 0) return paired;
  // Unknown shape: at least say which fields were touched.
  return Object.keys(details)
    .filter((k) => !['member_count', 'team_id', 'team_name', 'updated_by', 'actor_id'].includes(k))
    .map((field) => ({ field }));
}

/** One line on what an entry changed: field changes for updates, initial members for creates. */
export function describeEntryDetails(e: TeamHistoryEntry) {
  if (e.event_type === 'TEAM_UPDATED') {
    return readChanges(e.details)
      .map((c) => (c.from !== undefined || c.to !== undefined ? `${humanize(c.field)}: ${c.from ?? ''} → ${c.to ?? ''}` : humanize(c.field)))
      .join('; ');
  }
  if (e.event_type === 'TEAM_CREATED' && e.details?.member_count != null) return `${e.details.member_count} initial members`;
  return '';
}

function ChangeList({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return null;
  const known = changes.filter((c) => c.from !== undefined || c.to !== undefined);
  if (known.length === 0) {
    return (
      <span className="text-gray-400 dark:text-slate-500">
        {' '}· changed {changes.map((c) => humanize(c.field).toLowerCase()).join(', ')}
      </span>
    );
  }
  return (
    <ul className="mt-1 space-y-0.5">
      {known.map((c) => (
        <li key={c.field} className="tf-meta">
          <span className="font-medium text-gray-700 dark:text-slate-300">{humanize(c.field)}:</span>{' '}
          {c.from !== undefined && <span className="line-through decoration-gray-300 dark:decoration-slate-600">{c.from}</span>}
          {c.from !== undefined && c.to !== undefined && ' → '}
          {c.to !== undefined && <span className="font-medium text-gray-800 dark:text-slate-200">{c.to}</span>}
        </li>
      ))}
    </ul>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TeamHistoryProps {
  /** Opens a team's details popup. Only for teams that still exist (see `openableTeamIds`). */
  onOpenTeam?: (teamId: string) => void;
  /** Ids of teams that exist now — a deleted team's name isn't clickable. */
  openableTeamIds?: ReadonlySet<string>;
  /** Start filtered to this team (the Team popup's "View all"). */
  initialTeamId?: string | null;
  /** Called once the initial team filter is applied, so the page can forget it. */
  onInitialTeamApplied?: () => void;
}

export default function TeamHistory({ onOpenTeam, openableTeamIds, initialTeamId = null, onInitialTeamApplied }: TeamHistoryProps = {}) {
  // Server-paged list (the normal view).
  const [serverItems, setItems] = useState<TeamHistoryEntry[]>([]);
  const [serverTotal, setTotal] = useState(0);
  const [serverLoading, setLoading] = useState(true);
  // First load has no list to keep on screen; later loads keep it (dimmed).
  const [serverLoadedOnce, setLoadedOnce] = useState(false);
  const [serverError, setError] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  // Timeline (cards by day) or Table. Phones always get the timeline.
  const [view, setView] = useState<HistoryView>('timeline');
  const isMobile = useIsMobile();
  const shownView: HistoryView = isMobile ? 'timeline' : view;
  // Entries per filter, for the chip badges (null = not loaded).
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // Remember the filter, page and page size for the session, like the other tabs.
  useListStatePersistence('team-history', { filter, page, pageSize, view }, (saved) => {
    if (typeof saved.filter === 'string' && (FILTERS as readonly string[]).includes(saved.filter)) setFilter(saved.filter);
    if (saved.view === 'timeline' || saved.view === 'table') setView(saved.view);
    if (typeof saved.page === 'number' && saved.page >= 1) setPage(Math.floor(saved.page));
    if (typeof saved.pageSize === 'number' && PAGE_SIZES.includes(saved.pageSize)) setPageSize(saved.pageSize);
  });

  // ── Latest-activity batch: team / person / date filters, search, summary ──
  const [batch, setBatch] = useState<TeamHistoryEntry[] | null>(null);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchError, setBatchError] = useState(false);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState(initialTeamId ?? '');
  useEffect(() => {
    if (initialTeamId) onInitialTeamApplied?.();
    // Mount only: the prop is just the starting filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [actorFilter, setActorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showExport, setShowExport] = useState(false);
  const advancedOn = !!(search.trim() || teamFilter || actorFilter || dateFrom || dateTo);
  const clearAdvanced = () => {
    setSearch(''); setTeamFilter(''); setActorFilter(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  const actorKey = (e: TeamHistoryEntry) => e.actor_id || e.actor_name || '';
  const teamOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of batch ?? []) if (!seen.has(e.team_id)) seen.set(e.team_id, e.team_name);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [batch]);
  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of batch ?? []) if (e.actor_name && !seen.has(actorKey(e))) seen.set(actorKey(e), e.actor_name);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [batch]);

  // Known event types first, then any others seen in the latest activity (e.g. a
  // new LEAD_CHANGED type) — so they can be filtered too.
  const chipFilters = useMemo(() => {
    const extra = new Set<string>();
    for (const e of batch ?? []) if (!(FILTERS as readonly string[]).includes(e.event_type)) extra.add(e.event_type);
    return [...FILTERS, ...Array.from(extra).sort()];
  }, [batch]);

  /** Batch entries passing the team / person / date / search filters (any event type). */
  const batchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (batch ?? []).filter((e) => {
      if (teamFilter && e.team_id !== teamFilter) return false;
      if (actorFilter && actorKey(e) !== actorFilter) return false;
      const day = toISODateIST(e.event_at);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (!q) return true;
      return [e.team_name, e.actor_name, e.target_user_name, eventLabel(e.event_type)]
        .some((v) => v && v.toLowerCase().includes(q));
    });
  }, [batch, search, teamFilter, actorFilter, dateFrom, dateTo]);
  const batchFiltered = useMemo(
    () => (filter === 'ALL' ? batchMatches : batchMatches.filter((e) => e.event_type === filter)),
    [batchMatches, filter],
  );

  // What the list shows: server pages normally, the filtered batch when the
  // team / person / date / search filters are on.
  // A page restored from the session (or left from before a filter) can be past the
  // end of the filtered batch — clamp it, rather than show "no matches".
  const advancedPage = Math.min(page, Math.max(1, Math.ceil(batchFiltered.length / pageSize)));
  const shownPage = advancedOn ? advancedPage : page;
  const items = advancedOn ? batchFiltered.slice((advancedPage - 1) * pageSize, advancedPage * pageSize) : serverItems;
  const total = advancedOn ? batchFiltered.length : serverTotal;
  const loading = advancedOn ? batchLoading : serverLoading;
  const loadedOnce = advancedOn ? batch !== null : serverLoadedOnce;
  const error = advancedOn ? batchError && batch === null : serverError;
  const batchIsPartial = batchTotal > (batch?.length ?? 0);

  // Summary of what's in view (filters applied, every event type).
  const summary = useMemo(() => {
    const byType: Record<string, number> = {};
    const byActor = new Map<string, { name: string; n: number }>();
    const byTeam = new Map<string, { name: string; n: number }>();
    for (const e of batchMatches) {
      byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
      const t = byTeam.get(e.team_id) ?? { name: e.team_name, n: 0 };
      t.n += 1;
      byTeam.set(e.team_id, t);
      if (e.actor_name) {
        const cur = byActor.get(actorKey(e)) ?? { name: e.actor_name, n: 0 };
        cur.n += 1;
        byActor.set(actorKey(e), cur);
      }
    }
    const top = Array.from(byActor.values()).sort((a, b) => b.n - a.n)[0] ?? null;
    // Only worth saying when more than one team is in view.
    const topTeam = byTeam.size > 1 ? Array.from(byTeam.values()).sort((a, b) => b.n - a.n)[0] : null;
    return { byType, top, topTeam, count: batchMatches.length };
  }, [batchMatches]);

  // Chip counts: server totals normally; with the extra filters on, counts of
  // the filtered batch, so they match the list underneath.
  const chipCounts = useMemo<Record<string, number> | null>(() => {
    if (!advancedOn) return counts;
    const out: Record<string, number> = { ALL: batchMatches.length };
    for (const e of batchMatches) out[e.event_type] = (out[e.event_type] ?? 0) + 1;
    for (const f of chipFilters) out[f] = out[f] ?? 0;
    return out;
  }, [advancedOn, counts, batchMatches, chipFilters]);

  // Each request gets a number; a response for a filter / page the user has
  // already left is dropped instead of overwriting the newer one.
  const fetchSeq = useRef(0);

  const fetchHistory = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(false);
    try {
      const result = await teamService.getTeamsHistory(pageSize, (page - 1) * pageSize, filter);
      if (seq !== fetchSeq.current) return;
      // A restored page past the end (history shrank) falls back to the last one.
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setLoadedOnce(true);
    } catch {
      if (seq !== fetchSeq.current) return;
      // Was swallowed into an empty list, which read as "no history at all".
      setError(true);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [page, pageSize, filter]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  // Chip counts: one tiny request per filter (limit 1, read `total`) — only when the
  // history is longer than the batch. Best effort.
  const fetchCounts = useCallback(async () => {
    const results = await Promise.allSettled(FILTERS.map((f) => teamService.getTeamsHistory(1, 0, f)));
    const next: Record<string, number> = {};
    results.forEach((r, i) => { if (r.status === 'fulfilled') next[FILTERS[i]] = r.value.total; });
    setCounts(Object.keys(next).length > 0 ? next : null);
  }, []);

  const fetchBatch = useCallback(async () => {
    setBatchLoading(true);
    setBatchError(false);
    try {
      const result = await teamService.getTeamsHistory(BATCH_LIMIT, 0, 'ALL');
      setBatch(result.items);
      setBatchTotal(result.total);
      if (result.total > result.items.length) {
        void fetchCounts();
      } else {
        // Everything is in the batch: count it here instead of six more requests.
        const next: Record<string, number> = { ALL: result.items.length };
        for (const k of FILTERS) next[k] = next[k] ?? 0;
        for (const e of result.items) next[e.event_type] = (next[e.event_type] ?? 0) + 1;
        setCounts(next);
      }
    } catch {
      setBatchError(true);
    } finally {
      setBatchLoading(false);
    }
  }, [fetchCounts]);
  useEffect(() => {
    void fetchBatch();
  }, [fetchBatch]);

  // The batch also refreshes the chip counts.
  const refreshAll = () => {
    void fetchHistory();
    void fetchBatch();
  };

  // ── Export: what the list shows, every page (filters applied) ──
  const describeForExport = describeEntryDetails;
  const runExport = async (format: ExportFileFormat) => {
    let rows: TeamHistoryEntry[];
    if (advancedOn) {
      rows = batchFiltered;
    } else {
      rows = [];
      const offsets: number[] = [];
      for (let offset = 0; offset < Math.min(serverTotal, EXPORT_CAP); offset += EXPORT_PAGE) offsets.push(offset);
      // A few pages at a time (was one by one); results keep their order.
      for (let i = 0; i < offsets.length; i += EXPORT_PARALLEL) {
        const pages = await Promise.all(offsets.slice(i, i + EXPORT_PARALLEL).map((o) => teamService.getTeamsHistory(EXPORT_PAGE, o, filter)));
        for (const p of pages) rows.push(...p.items);
      }
    }
    const date = toISODateIST(new Date());
    await exportRows(
      format,
      EXPORT_HEADERS,
      rows.map((e) => [formatIST(e.event_at), eventLabel(e.event_type), e.team_name, e.target_user_name ?? (e.event_type.startsWith('MEMBER_') ? UNKNOWN_USER : ''), e.actor_name ?? '', describeForExport(e)]),
      `teams-history-${date}`,
      { sheetName: 'Teams History' },
    );
    setShowExport(false);
    if (!advancedOn && serverTotal > EXPORT_CAP) {
      toast.warning({
        title: `Exported the latest ${EXPORT_CAP.toLocaleString()} activities`,
        description: `There are ${serverTotal.toLocaleString()} in all — narrow it with an event type to export older ones.`,
      });
    }
  };

  const handleFilterChange = (nextFilter: string) => {
    setFilter(nextFilter);
    setPage(1);
  };

  const filterLabel = filter === 'ALL' ? '' : eventLabel(filter);

  // Active filter tags: event, team, person and the date range as one tag (the
  // search shows in its own box). Each removes just its own filter.
  const formatChipDate = (v: string) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const activeFilterChips: FilterChip[] = [
    filter !== 'ALL' && {
      key: 'event',
      label: 'Event',
      value: eventLabel(filter),
      onRemove: () => handleFilterChange('ALL'),
    },
    teamFilter && {
      key: 'team',
      label: 'Team',
      value: teamOptions.find((t) => t.id === teamFilter)?.name ?? teamFilter,
      onRemove: () => { setTeamFilter(''); setPage(1); },
    },
    actorFilter && {
      key: 'person',
      label: 'Person',
      value: actorOptions.find((a) => a.id === actorFilter)?.name ?? actorFilter,
      onRemove: () => { setActorFilter(''); setPage(1); },
    },
    (dateFrom || dateTo) && {
      key: 'date',
      label: 'Date',
      value: dateFrom && dateTo
        ? `${formatChipDate(dateFrom)} – ${formatChipDate(dateTo)}`
        : dateFrom ? `From ${formatChipDate(dateFrom)}` : `Until ${formatChipDate(dateTo)}`,
      onRemove: () => { setDateFrom(''); setDateTo(''); setPage(1); },
    },
  ].filter(Boolean) as FilterChip[];

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="rounded-xl border border-destructive-line bg-destructive-subtle py-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive-strong">Could not load the team history</p>
        <p className="mt-1 text-xs text-destructive">Check your connection and try again.</p>
        <Button variant="secondary" size="sm" onClick={refreshAll} className="mt-4">
          Retry
        </Button>
      </div>
    );
  } else if (!loadedOnce) {
    // First load: skeleton rows in the shape of the entries.
    body = (
      <div className="space-y-2 sm:space-y-3" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="tf-panel flex items-start gap-3 p-3 sm:p-4">
            <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-5 w-32" /></div>
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="hidden h-3 w-28 sm:block" />
          </div>
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 py-16 text-center text-gray-400 dark:text-slate-500">
        <Clock className="mx-auto mb-3 h-10 w-10 opacity-40" />
        {advancedOn ? (
          <>
            <p className="text-sm">No activity matches these filters</p>
            <button type="button" onClick={clearAdvanced} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
              Clear filters
            </button>
          </>
        ) : filter === 'ALL' ? (
          <p className="text-sm">No activity recorded yet</p>
        ) : (
          <>
            <p className="text-sm">No “{filterLabel}” activity</p>
            <button type="button" onClick={() => handleFilterChange('ALL')} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
              Show all activity
            </button>
          </>
        )}
      </div>
    );
  } else {
    body = (
      <>
        {/* Later loads keep the current list (dimmed) instead of swapping it for a
            big spinner, so the page doesn't jump on every page change. */}
        {shownView === 'table' ? (
          <div className={`relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] transition-opacity dark:border-slate-700/60 dark:bg-slate-900 dark:ring-white/[0.02] ${loading ? 'pointer-events-none opacity-50' : ''}`} aria-busy={loading}>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <tr>
                    {['Date & time', 'Event', 'Team', 'Member', 'By', 'Details'].map((h) => (
                      <th key={h} className="tf-th-cell text-left tf-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {items.map((entry) => {
                    const config = eventConfig(entry.event_type);
                    const teamOpenable = !!onOpenTeam && entry.event_type !== 'TEAM_DELETED' && !!openableTeamIds?.has(entry.team_id);
                    const details = describeForExport(entry);
                    const memberEvent = entry.event_type.startsWith('MEMBER_');
                    return (
                      <tr key={entry.id} className="align-top hover:bg-brand-blue/[0.02]">
                        <td className="tf-td whitespace-nowrap tf-meta tabular-nums">{formatDate(entry.event_at)}</td>
                        <td className="tf-td whitespace-nowrap">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}>{config.label}</span>
                        </td>
                        <td className="tf-td max-w-[14rem] text-sm">
                          {teamOpenable ? (
                            <button type="button" onClick={() => onOpenTeam!(entry.team_id)} title="Open team details" className="block max-w-full truncate text-left font-medium text-gray-900 hover:text-brand-blue hover:underline dark:text-slate-50">
                              {entry.team_name}
                            </button>
                          ) : (
                            <span className="block truncate font-medium text-gray-900 dark:text-slate-50" title={entry.team_name}>{entry.team_name}</span>
                          )}
                        </td>
                        <td className="tf-td max-w-[12rem] truncate tf-body">
                          {entry.target_user_name || (memberEvent ? <span className="italic text-gray-400 dark:text-slate-500">{UNKNOWN_USER}</span> : <span className="text-gray-300 dark:text-slate-600">—</span>)}
                        </td>
                        <td className="tf-td whitespace-nowrap tf-body">
                          {entry.actor_name ? (
                            <span className="inline-flex items-center gap-2">
                              <NameAvatar name={entry.actor_name} size="sm" className="h-6 w-6 text-2xs" />
                              {entry.actor_name}
                            </span>
                          ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>
                        <td className="tf-td max-w-[18rem] tf-meta">
                          {details ? <span className="line-clamp-2" title={details}>{details}</span> : <span className="text-gray-300 dark:text-slate-600">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
        <div className={`relative space-y-2 sm:space-y-3 transition-opacity ${loading ? 'pointer-events-none opacity-50' : ''}`} aria-busy={loading}>
          {loading && (
            <div className="absolute inset-x-0 top-6 z-10 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 tf-meta shadow-md ring-1 ring-gray-200 dark:bg-slate-800 dark:ring-slate-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-blue" /> Loading…
              </span>
            </div>
          )}
          {items.map((entry, index) => {
            // Day heading whenever the day changes (entries come newest first).
            const day = toISODateIST(entry.event_at);
            const newDay = index === 0 || toISODateIST(items[index - 1].event_at) !== day;
            const teamOpenable = !!onOpenTeam && entry.event_type !== 'TEAM_DELETED' && !!openableTeamIds?.has(entry.team_id);
            const config = eventConfig(entry.event_type);
            const Icon = config.icon;
            const isTeamEvent =
              entry.event_type === 'TEAM_CREATED' || entry.event_type === 'TEAM_UPDATED' || entry.event_type === 'TEAM_DELETED';
            const byActor = entry.actor_name && (
              <>
                {' '}by <span className="font-medium">{entry.actor_name}</span>
              </>
            );

            return (
              <Fragment key={entry.id}>
              {newDay && (
                <h3 className={`flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 ${index === 0 ? '' : 'pt-2'}`}>
                  {dayLabel(entry.event_at)}
                  <span className="h-px flex-1 bg-gray-100 dark:bg-slate-700/60" />
                </h3>
              )}
              <div
                className="flex items-start gap-3 sm:flex-wrap sm:gap-4 tf-card-soft p-3 sm:p-4 transition-colors hover:border-brand-blue/30"
              >
                <div className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${config.bg}`}>
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className={`rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 text-2xs sm:text-xs font-medium ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                    {/* Opens the team's details — not for teams that no longer exist. */}
                    {teamOpenable ? (
                      <button
                        type="button"
                        onClick={() => onOpenTeam!(entry.team_id)}
                        title="Open team details"
                        className="truncate text-left text-sm font-medium text-gray-900 hover:text-brand-blue hover:underline dark:text-slate-50"
                      >
                        {entry.team_name}
                      </button>
                    ) : (
                      <span
                        className="truncate tf-row-name"
                        title={onOpenTeam && entry.event_type !== 'TEAM_DELETED' && !openableTeamIds?.has(entry.team_id) ? 'This team no longer exists' : undefined}
                      >
                        {entry.team_name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 tf-meta sm:text-sm">
                    {entry.event_type === 'MEMBER_ADDED' && (
                      <span>
                        {entry.target_user_name ? <span className="font-medium">{entry.target_user_name}</span> : <span className="italic text-gray-400 dark:text-slate-500">{UNKNOWN_USER}</span>} was added{byActor}
                      </span>
                    )}
                    {entry.event_type === 'MEMBER_REMOVED' && (
                      <span>
                        {entry.target_user_name ? <span className="font-medium">{entry.target_user_name}</span> : <span className="italic text-gray-400 dark:text-slate-500">{UNKNOWN_USER}</span>} was removed{byActor}
                      </span>
                    )}
                    {isTeamEvent && (
                      <span>
                        {entry.event_type === 'TEAM_CREATED' && 'Created'}
                        {entry.event_type === 'TEAM_UPDATED' && 'Updated'}
                        {entry.event_type === 'TEAM_DELETED' && 'Deleted'}
                        {byActor}
                        {entry.event_type === 'TEAM_CREATED' && entry.details?.member_count != null && (
                          <span className="text-gray-400 dark:text-slate-500">
                            {' '}· {entry.details.member_count} initial member{entry.details.member_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </span>
                    )}
                    {/* Event types this screen doesn't know: still say who did it. */}
                    {!isTeamEvent && entry.event_type !== 'MEMBER_ADDED' && entry.event_type !== 'MEMBER_REMOVED' && (
                      <span>
                        {entry.target_user_name && <span className="font-medium">{entry.target_user_name}</span>}
                        {byActor && <>{entry.target_user_name ? '' : 'Changed'}{byActor}</>}
                      </span>
                    )}
                    {entry.event_type === 'TEAM_UPDATED' && <ChangeList changes={readChanges(entry.details)} />}
                  </div>
                  {/* Phones: who + when on one line under the text. */}
                  <p className="mt-1.5 flex items-center gap-1.5 tf-micro-hint sm:hidden" title={formatDate(entry.event_at)}>
                    {entry.actor_name && <NameAvatar name={entry.actor_name} size="sm" className="h-5 w-5 text-2xs" />}
                    {entryTime(entry.event_at)}
                  </p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  {entry.actor_name && (
                    <NameAvatar name={entry.actor_name} size="sm" />
                  )}
                  <span className="whitespace-nowrap tf-hint" title={formatDate(entry.event_at)}>{entryTime(entry.event_at)}</span>
                </div>
              </div>
              </Fragment>
            );
          })}
        </div>

        )}

        <div className="mt-4">
          <ListPagination
            currentPage={shownPage}
            itemsPerPage={pageSize}
            totalItems={total}
            onPageChange={setPage}
            onItemsPerPageChange={(size) => { setPageSize(size); setPage(1); }}
            pageSizeOptions={PAGE_SIZES}
            itemLabel={filterLabel ? `${filterLabel.toLowerCase()} activities` : 'activities'}
            alwaysShow
            minimalOnMobile
          />
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Controls: search + filters on top; event chips, view, Refresh and Export below. */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
        {/* Search (wide) + team / person / dates — over the latest activity batch. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full min-w-0 lg:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search team, member or person…"
            aria-label="Search history"
            className="tf-input pl-8 pr-2 text-xs sm:text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          {/* Event type — was a row of chips; the counts moved into the options. */}
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value)}
            aria-label="Filter by event"
            className={`h-9 min-w-0 rounded-lg border bg-white px-2 text-xs sm:text-sm dark:bg-slate-900 lg:w-48 ${
              filter !== 'ALL' ? 'border-brand-blue/40 text-brand-blue' : 'border-gray-200 text-gray-900 dark:border-slate-700 dark:text-slate-50'
            }`}
          >
            {chipFilters.map((f) => (
              <option key={f} value={f}>
                {f === 'ALL' ? 'All events' : eventLabel(f)}{chipCounts?.[f] !== undefined ? ` (${chipCounts[f].toLocaleString()})` : ''}
              </option>
            ))}
          </select>
          <select
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setPage(1); }}
            aria-label="Filter by team"
            className="h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-xs sm:text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 lg:w-44"
          >
            <option value="">All teams</option>
            {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={actorFilter}
            onChange={(e) => { setActorFilter(e.target.value); setPage(1); }}
            aria-label="Filter by person"
            className="h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-xs sm:text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 lg:w-44"
          >
            <option value="">Anyone</option>
            {actorOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 lg:flex">
          <DateField
            aria-label="History from date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(v) => { setDateFrom(v); setPage(1); }}
            className="w-full lg:w-[140px] max-sm:px-2 max-sm:!text-xs"
          />
          <span className="tf-hint">to</span>
          <DateField
            aria-label="History to date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(v) => { setDateTo(v); setPage(1); }}
            className="w-full lg:w-[140px] max-sm:px-2 max-sm:!text-xs"
          />
        </div>
        {advancedOn && (
          <button type="button" onClick={clearAdvanced} className="inline-flex items-center gap-1 self-start text-xs font-semibold text-brand-blue hover:underline lg:self-center">
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
        </div>
        <div className="flex flex-col gap-3 border-t border-gray-200/70 pt-3 dark:border-slate-700/60 lg:flex-row lg:items-center lg:justify-between">
          {/* What's in view (filters applied, every event type). */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 tf-meta">
            {batch && summary.count > 0 ? (
              <>
                <span className="font-semibold text-gray-900 dark:text-slate-50">
                  {batchIsPartial ? `Latest ${summary.count.toLocaleString()}` : summary.count.toLocaleString()} {summary.count === 1 ? 'activity' : 'activities'}
                </span>
                {chipFilters.filter((f) => f !== 'ALL' && summary.byType[f]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFilterChange(filter === f ? 'ALL' : f)}
                    aria-pressed={filter === f}
                    title={filter === f ? 'Show all events' : `Show only ${eventLabel(f).toLowerCase()}`}
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors ${filter === f ? 'bg-brand-blue/10 text-brand-blue' : 'hover:text-brand-blue'}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${eventConfig(f).dot}`} />
                    {summary.byType[f]} {eventLabel(f).toLowerCase()}
                  </button>
                ))}
                {summary.top && (
                  <span className="text-gray-500 dark:text-slate-400">
                    · Most active: <span className="font-medium text-gray-800 dark:text-slate-200">{summary.top.name}</span> ({summary.top.n})
                  </span>
                )}
                {summary.topTeam && (
                  <span className="text-gray-500 dark:text-slate-400">
                    · Most changed team: <span className="font-medium text-gray-800 dark:text-slate-200">{summary.topTeam.name}</span> ({summary.topTeam.n})
                  </span>
                )}
              </>
            ) : (
              <span className="text-gray-400 dark:text-slate-500">{batchLoading ? 'Loading activity…' : 'No activity in view'}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
            {/* Timeline / Table — phones always get the timeline. */}
            <div role="group" aria-label="History view" className="hidden rounded-lg bg-white p-0.5 ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700 sm:inline-flex">
              {([['timeline', 'Timeline', List], ['table', 'Table', Table2]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  aria-pressed={view === id}
                  title={`${label} view`}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                    view === id ? 'bg-brand-blue/10 text-brand-blue' : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={refreshAll}
              disabled={serverLoading}
              title="Refresh"
              aria-label="Refresh history"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:text-brand-blue disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowExport(true)}
              disabled={total === 0}
              className="tf-btn tf-btn-secondary h-8 gap-1.5 border border-gray-200 bg-white px-3 text-xs text-gray-700 transition-colors hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-normal justify-start hover:bg-white"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>
        {/* Active filter tags: the card's last line (the card's gap-3 spaces them). */}
        {activeFilterChips.length > 0 && <FilterChips chips={activeFilterChips} />}
      </div>

      {/* An honest note when the summary and filters see the latest batch only. */}
      {(advancedOn || summary.count > 0) && batchIsPartial && (
        <p className="-mt-2 tf-micro-hint">
          Search, team, person and date filters and this summary cover the latest {(batch?.length ?? 0).toLocaleString()} of {batchTotal.toLocaleString()} activities.
        </p>
      )}

      {body}

      <ExportFormatModal
        tone="plain"
        open={showExport}
        onClose={() => setShowExport(false)}
        title="Export Teams History"
        recordCount={advancedOn ? total : Math.min(serverTotal, EXPORT_CAP)}
        columns={EXPORT_HEADERS}
        onExport={runExport}
      />
    </div>
  );
}
