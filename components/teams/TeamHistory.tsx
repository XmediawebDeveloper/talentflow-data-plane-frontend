'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, UserMinus, Pencil, Trash2, Clock, ChevronLeft, ChevronRight, History, Loader2, AlertCircle, Search, Download, RefreshCw, X } from 'lucide-react';
import type { IconComponent } from '@/lib/types/icon';
import teamService, { TeamHistoryEntry } from '@/lib/services/teamService';
import { formatIST, formatISTDate, formatISTTime, parseIST, toISODateIST } from '@/lib/utils/dateUtils';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import NameAvatar from '@/components/ui/name-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';

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

/** "LEAD_CHANGED" → "Lead Changed" — for event types this screen doesn't know yet. */
const humanize = (raw: string) =>
  raw.toLowerCase().split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const eventLabel = (type: string) => EVENT_CONFIG[type]?.label ?? humanize(type);

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
        <li key={c.field} className="text-xs text-gray-500 dark:text-slate-400">
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
}

export default function TeamHistory({ onOpenTeam, openableTeamIds }: TeamHistoryProps = {}) {
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
  const [goToPage, setGoToPage] = useState('1');
  // Entries per filter, for the chip badges (null = not loaded).
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  // Remember the filter, page and page size for the session, like the other tabs.
  useListStatePersistence('team-history', { filter, page, pageSize }, (saved) => {
    if (typeof saved.filter === 'string' && (FILTERS as readonly string[]).includes(saved.filter)) setFilter(saved.filter);
    if (typeof saved.page === 'number' && saved.page >= 1) setPage(Math.floor(saved.page));
    if (typeof saved.pageSize === 'number' && PAGE_SIZES.includes(saved.pageSize)) setPageSize(saved.pageSize);
  });

  // ── Latest-activity batch: team / person / date filters, search, summary ──
  const [batch, setBatch] = useState<TeamHistoryEntry[] | null>(null);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchError, setBatchError] = useState(false);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
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
  const items = advancedOn ? batchFiltered.slice((page - 1) * pageSize, page * pageSize) : serverItems;
  const total = advancedOn ? batchFiltered.length : serverTotal;
  const loading = advancedOn ? batchLoading : serverLoading;
  const loadedOnce = advancedOn ? batch !== null : serverLoadedOnce;
  const error = advancedOn ? batchError && batch === null : serverError;
  const batchIsPartial = batchTotal > (batch?.length ?? 0);

  // Summary of what's in view (filters applied, every event type).
  const summary = useMemo(() => {
    const byType: Record<string, number> = {};
    const byActor = new Map<string, { name: string; n: number }>();
    for (const e of batchMatches) {
      byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
      if (e.actor_name) {
        const cur = byActor.get(actorKey(e)) ?? { name: e.actor_name, n: 0 };
        cur.n += 1;
        byActor.set(actorKey(e), cur);
      }
    }
    const top = Array.from(byActor.values()).sort((a, b) => b.n - a.n)[0] ?? null;
    return { byType, top, count: batchMatches.length };
  }, [batchMatches]);

  const totalPages = Math.ceil(total / pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target);
    } else {
      setGoToPage(String(page));
    }
  };

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

  const fetchBatch = useCallback(async () => {
    setBatchLoading(true);
    setBatchError(false);
    try {
      const result = await teamService.getTeamsHistory(BATCH_LIMIT, 0, 'ALL');
      setBatch(result.items);
      setBatchTotal(result.total);
    } catch {
      setBatchError(true);
    } finally {
      setBatchLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchBatch();
  }, [fetchBatch]);

  const refreshAll = () => {
    void fetchHistory();
    void fetchCounts();
    void fetchBatch();
  };

  // ── Export: what the list shows, every page (filters applied) ──
  const describeForExport = (e: TeamHistoryEntry) =>
    e.event_type === 'TEAM_UPDATED'
      ? readChanges(e.details)
          .map((c) => (c.from !== undefined || c.to !== undefined ? `${humanize(c.field)}: ${c.from ?? ''} → ${c.to ?? ''}` : humanize(c.field)))
          .join('; ')
      : e.event_type === 'TEAM_CREATED' && e.details?.member_count != null
        ? `${e.details.member_count} initial members`
        : '';
  const runExport = async (format: ExportFileFormat) => {
    let rows: TeamHistoryEntry[];
    if (advancedOn) {
      rows = batchFiltered;
    } else {
      rows = [];
      for (let offset = 0; offset < Math.min(serverTotal, EXPORT_CAP); offset += EXPORT_PAGE) {
        const page_ = await teamService.getTeamsHistory(EXPORT_PAGE, offset, filter);
        rows.push(...page_.items);
        if (page_.items.length < EXPORT_PAGE) break;
      }
    }
    const date = new Date().toISOString().split('T')[0];
    await exportRows(
      format,
      EXPORT_HEADERS,
      rows.map((e) => [formatIST(e.event_at), eventLabel(e.event_type), e.team_name, e.target_user_name ?? '', e.actor_name ?? '', describeForExport(e)]),
      `teams-history-${date}`,
      { sheetName: 'Teams History' },
    );
    setShowExport(false);
  };

  // Chip counts: one tiny request per filter (limit 1, read `total`). Best effort.
  const fetchCounts = useCallback(async () => {
    const results = await Promise.allSettled(FILTERS.map((f) => teamService.getTeamsHistory(1, 0, f)));
    const next: Record<string, number> = {};
    results.forEach((r, i) => { if (r.status === 'fulfilled') next[FILTERS[i]] = r.value.total; });
    setCounts(Object.keys(next).length > 0 ? next : null);
  }, []);
  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  const handleFilterChange = (nextFilter: string) => {
    setFilter(nextFilter);
    setPage(1);
  };

  const filterLabel = filter === 'ALL' ? '' : eventLabel(filter);

  const pageSizeSelect = (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
      Show
      <select
        value={pageSize}
        onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
        aria-label="Entries per page"
        className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
      >
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      per page
    </label>
  );

  let body: React.ReactNode;
  if (error) {
    body = (
      <div className="rounded-xl border border-destructive-line bg-destructive-subtle py-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <p className="text-sm max-sm:text-[13px] font-medium text-destructive-strong">Could not load the team history</p>
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
          <div key={i} className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4">
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
            <p className="text-sm max-sm:text-[13px]">No activity matches these filters</p>
            <button type="button" onClick={clearAdvanced} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
              Clear filters
            </button>
          </>
        ) : filter === 'ALL' ? (
          <p className="text-sm max-sm:text-[13px]">No activity recorded yet</p>
        ) : (
          <>
            <p className="text-sm max-sm:text-[13px]">No “{filterLabel}” activity</p>
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
        <div className={`relative space-y-2 sm:space-y-3 transition-opacity ${loading ? 'pointer-events-none opacity-50' : ''}`} aria-busy={loading}>
          {loading && (
            <div className="absolute inset-x-0 top-6 z-10 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-gray-600 shadow-md ring-1 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-blue" /> Loading…
              </span>
            </div>
          )}
          {items.map((entry, index) => {
            // Day heading whenever the day changes (entries come newest first).
            const day = toISODateIST(entry.event_at);
            const newDay = index === 0 || toISODateIST(items[index - 1].event_at) !== day;
            const teamOpenable = !!onOpenTeam && entry.event_type !== 'TEAM_DELETED' && !!openableTeamIds?.has(entry.team_id);
            const config = EVENT_CONFIG[entry.event_type] ?? {
              label: humanize(entry.event_type),
              icon: Clock,
              color: 'text-gray-700 dark:text-slate-300',
              bg: 'bg-gray-100 dark:bg-slate-800',
              dot: 'bg-gray-400',
            };
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
                className="flex items-start gap-3 sm:flex-wrap sm:gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-colors hover:border-brand-blue/30"
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
                        className="truncate text-left text-sm max-sm:text-[13px] font-medium text-gray-900 hover:text-brand-blue hover:underline dark:text-slate-50"
                      >
                        {entry.team_name}
                      </button>
                    ) : (
                      <span
                        className="truncate text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50"
                        title={onOpenTeam && entry.event_type !== 'TEAM_DELETED' && !openableTeamIds?.has(entry.team_id) ? 'This team no longer exists' : undefined}
                      >
                        {entry.team_name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                    {entry.event_type === 'MEMBER_ADDED' && (
                      <span>
                        <span className="font-medium">{entry.target_user_name || 'Unknown'}</span> was added{byActor}
                      </span>
                    )}
                    {entry.event_type === 'MEMBER_REMOVED' && (
                      <span>
                        <span className="font-medium">{entry.target_user_name || 'Unknown'}</span> was removed{byActor}
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
                  <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-gray-400 dark:text-slate-500 sm:hidden" title={formatDate(entry.event_at)}>
                    {entry.actor_name && <NameAvatar name={entry.actor_name} size="sm" className="h-5 w-5 text-[9px]" />}
                    {entryTime(entry.event_at)}
                  </p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  {entry.actor_name && (
                    <NameAvatar name={entry.actor_name} size="sm" />
                  )}
                  <span className="whitespace-nowrap text-xs text-gray-400 dark:text-slate-500" title={formatDate(entry.event_at)}>{entryTime(entry.event_at)}</span>
                </div>
              </div>
              </Fragment>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 sm:mt-6 flex flex-col gap-3 sm:gap-4 border-t border-gray-100 dark:border-slate-700/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                Showing <span className="font-medium">{from}-{to}</span> of <span className="font-medium">{total}</span>{' '}
                {filterLabel ? `${filterLabel} ` : ''}activities
              </p>
              {pageSizeSelect}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 max-sm:justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400 whitespace-nowrap">Go to</span>
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
                  className="w-14 h-8 sm:h-9 px-2 text-sm max-sm:text-[13px] text-center border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-50"
                />
              </div>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || loading}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:border-gray-200 dark:disabled:hover:border-slate-700 disabled:hover:text-gray-700 dark:disabled:hover:text-slate-300 transition-colors"
                aria-label="Previous page" title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300 px-1 whitespace-nowrap">
                <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages || loading}
                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-slate-900 disabled:hover:border-gray-200 dark:disabled:hover:border-slate-700 disabled:hover:text-gray-700 dark:disabled:hover:text-slate-300 transition-colors"
                aria-label="Next page" title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        )}

        {totalPages <= 1 && total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 dark:border-slate-700/60 pt-4">
            <p className="text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-400">
              Showing all <span className="font-medium">{total}</span> {filterLabel ? `${filterLabel} ` : ''}activities
            </p>
            {/* Still offered when a smaller size made everything fit (to switch back). */}
            {pageSize !== PAGE_SIZES[0] && pageSizeSelect}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <History className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">Teams History</h2>
              <button
                type="button"
                onClick={refreshAll}
                disabled={serverLoading}
                title="Refresh"
                aria-label="Refresh history"
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white hover:text-brand-blue disabled:opacity-50 dark:hover:bg-slate-900"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowExport(true)}
                disabled={total === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:text-brand-blue disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
            <p className="text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">
              {!loadedOnce && loading
                ? 'Loading activities...'
                : error
                  ? 'History unavailable'
                  : `${total} ${filterLabel ? `${filterLabel} ` : ''}${total === 1 ? 'activity' : 'activities'} recorded`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 max-sm:-mx-3 max-sm:flex-nowrap max-sm:gap-1.5 max-sm:overflow-x-auto max-sm:px-3 scrollbar-hide tf-hide-native-scrollbar">
          {FILTERS.map((entryFilter) => (
            <button
              key={entryFilter}
              onClick={() => handleFilterChange(entryFilter)}
              aria-pressed={filter === entryFilter}
              className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs font-medium transition-all ${
                filter === entryFilter
                  ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/20'
                  : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
              }`}
            >
              {entryFilter === 'ALL' ? 'All' : eventLabel(entryFilter)}
              {counts?.[entryFilter] !== undefined && (
                <span className={`ml-1.5 tabular-nums ${filter === entryFilter ? 'text-white/80' : 'text-gray-400 dark:text-slate-500'}`}>
                  {counts[entryFilter].toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Team / person / date filters + search — over the latest activity batch. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search team, member or person…"
            aria-label="Search history"
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-blue/30 focus:outline-none focus:ring-2 focus:ring-brand-blue/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
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
          <span className="text-xs text-gray-400 dark:text-slate-500">to</span>
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

      {/* Summary of what's in view; and an honest note when it's the latest batch only. */}
      {batch && summary.count > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-xs text-gray-600 ring-1 ring-gray-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700/60">
          <span className="font-semibold text-gray-900 dark:text-slate-50">
            {batchIsPartial ? `Latest ${summary.count.toLocaleString()}` : summary.count.toLocaleString()} {summary.count === 1 ? 'activity' : 'activities'}:
          </span>
          {FILTERS.filter((f) => f !== 'ALL' && summary.byType[f]).map((f) => (
            <span key={f} className="inline-flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${EVENT_CONFIG[f].dot}`} />
              {summary.byType[f]} {eventLabel(f).toLowerCase()}
            </span>
          ))}
          {summary.top && (
            <span className="ml-auto text-gray-500 dark:text-slate-400">
              Most active: <span className="font-medium text-gray-800 dark:text-slate-200">{summary.top.name}</span> ({summary.top.n})
            </span>
          )}
        </div>
      )}
      {(advancedOn || summary.count > 0) && batchIsPartial && (
        <p className="-mt-2 text-2xs text-gray-400 dark:text-slate-500">
          Search, team, person and date filters and this summary cover the latest {(batch?.length ?? 0).toLocaleString()} of {batchTotal.toLocaleString()} activities.
        </p>
      )}

      {body}

      <ExportFormatModal
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
