'use client';

import {
  Users, BarChart3, ChevronDown, ChevronRight,
  Download, FileText, Loader2, Search, Crown, Info, Clock,
} from 'lucide-react';
import { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import teamService, {
  TeamUsageSummary,
  TeamMemberUsage,
} from '@/lib/services/teamService';
import {
  unitPoolService,
  ConsumptionLogEntry,
} from '@/lib/services/unitPoolService';
import { toast } from '@/components/ui/enhanced-toast';
import { DateField } from '@/components/ui/date-field';
import { formatISTDate, formatIST } from '@/lib/utils/dateUtils';
import { useAuth } from '@/components/providers/AuthProvider';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { Skeleton } from '@/components/ui/skeleton';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, exportRowsToCSV, type ExportFileFormat } from '@/lib/utils/exportUtils';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import ListPagination from '@/components/ListPagination';
import { ClearSortChip, SortableHeader, ariaSort, sortRows, useTableSort, type TableSort } from '@/components/ui/sortable-header';
import { UNIT_ICON, TOTAL_UNITS_ICON } from '@/lib/constants/unitColors';
import { useTeamReportRange, RangePresets, RANGE_PRESETS, todayIST, UnitRulesHelp, UnitStatCard, UNIT_STAT_GRID, useSessionState, ReportScopeBadge } from './reportControls';
import { useIsMobile } from '@/components/ui/use-mobile';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import UnitActivityLog from './UnitActivityLog';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_COLORS: Record<string, string> = {
  RS:  'text-blue-600   bg-blue-50   border-blue-200',
  AS:  'text-[color-mix(in_srgb,var(--brand-cyan)_80%,black)] dark:text-brand-cyan bg-brand-cyan/10 border-brand-cyan/30',
  AIU: 'text-success  bg-success-subtle  border-success-line',
  RU:  'text-orange-600 bg-orange-50 border-orange-200',
};

const UNIT_DOT: Record<string, string> = {
  RS: 'bg-blue-500', AS: 'bg-brand-cyan', AIU: 'bg-success', RU: 'bg-orange-500',
};

const STATUS_STYLES: Record<string, string> = {
  SUCCESS:            'bg-success-subtle text-success',
  FAILED:             'bg-destructive-subtle text-destructive',
  INSUFFICIENT_UNITS: 'bg-orange-100 text-orange-700',
  ABANDONED:          'bg-warning-subtle text-warning',
  INTERRUPTED:        'bg-orange-100 text-orange-700',
  TENANT_SUSPENDED:   'bg-destructive-subtle text-destructive',
  TENANT_EXPIRED:     'bg-destructive-subtle text-destructive',
  BLOCKED:            'bg-gray-100 text-gray-700',
};


// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCount(team: TeamUsageSummary, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return team.by_type[key]?.consumption_count ?? 0;
}

function getMCount(m: TeamMemberUsage, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return m.by_type[key]?.consumption_count ?? 0;
}

/** Net units (used − returned, e.g. a deleted resume gives its 1 RU back) —
 *  what actually left the quota. Team values use the same rule, so a team's
 *  total is the sum of its members and matches the organisation's quota. */
function getMUnits(m: TeamMemberUsage, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  const t = m.by_type[key];
  if (!SHOWS_RETURNS(key)) return t?.total_consumed ?? 0;
  return t?.net_consumed ?? t?.total_consumed ?? 0;
}

/** AI Assessment and AI Interview show units deducted only — never returned or net. */
function SHOWS_RETURNS(key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return key !== 'AS' && key !== 'AIU';
}


/** Units consumed, as shown under a count: whole numbers stay whole, fractions get one decimal. */
function formatUnits(units: number) {
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}

/** Green "+N returned" under a member's unit cell, when units were credited back
 *  (a deleted resume returns its 1 RU). Hidden when nothing was returned. */
function ReturnedNote({ member, k }: { member: TeamMemberUsage; k: 'RS' | 'AS' | 'AIU' | 'RU' }) {
  const t = member.by_type[k];
  const returned = SHOWS_RETURNS(k) ? t?.units_returned ?? 0 : 0;
  if (returned <= 0) return null;
  const used = t?.total_consumed ?? 0;
  const net = t?.net_consumed ?? used - returned;
  const why = k === 'RU' ? ' — resumes deleted, so their upload units came back' : '';
  return (
    <p
      className="text-xs font-medium text-success whitespace-nowrap"
      title={`${formatUnits(used)} used, ${formatUnits(returned)} returned${why}. Net ${formatUnits(net)}.`}
    >
      {/* The cell's number is already net (in Units mode), so show what was used. */}
      +{formatUnits(returned)} returned · {formatUnits(used)} used
    </p>
  );
}

// ─── Measure: actions (how many times) or units (how much was consumed) ─────

type Measure = 'actions' | 'units';
type UnitKey = 'RS' | 'AS' | 'AIU' | 'RU';
// Display order: Resume Units, Resume Scoring, AI Assessment, AI Interview.
const UNIT_KEYS: readonly UnitKey[] = ['RU', 'RS', 'AS', 'AIU'];

/** The Actions / Units toggle, read by every row and card below. */
const MeasureContext = createContext<Measure>('units');

function teamValue(t: TeamUsageSummary, k: UnitKey, m: Measure) {
  const u = t.by_type[k];
  if (m !== 'units') return getCount(t, k);
  return SHOWS_RETURNS(k) ? u?.net_consumed ?? u?.total_consumed ?? 0 : u?.total_consumed ?? 0;
}

/** Green "+N returned" under a team's unit cell (units credited back this period). */
function TeamReturnedNote({ team, k }: { team: TeamUsageSummary; k: UnitKey }) {
  const u = team.by_type[k];
  const returned = SHOWS_RETURNS(k) ? u?.units_returned ?? 0 : 0;
  if (returned <= 0) return null;
  const used = u?.total_consumed ?? 0;
  return (
    <p
      className="mt-0.5 text-xs font-medium text-success"
      title={`${formatUnits(used)} used, ${formatUnits(returned)} returned. Net ${formatUnits(used - returned)}.`}
    >
      +{formatUnits(returned)} returned
    </p>
  );
}
function teamTotalBy(t: TeamUsageSummary, m: Measure) {
  return UNIT_KEYS.reduce((sum, k) => sum + teamValue(t, k, m), 0);
}
function memberValue(mem: TeamMemberUsage, k: UnitKey, m: Measure) {
  return m === 'units' ? getMUnits(mem, k) : getMCount(mem, k);
}
function memberTotalBy(mem: TeamMemberUsage, m: Measure) {
  return UNIT_KEYS.reduce((sum, k) => sum + memberValue(mem, k, m), 0);
}
function formatMeasure(v: number, m: Measure) {
  return m === 'units' ? formatUnits(v) : v.toLocaleString();
}

/** Unit names as shown in the table headers, chips and tooltips (no RS / AS / AIU / RU abbreviations). */
const UNIT_FULL_NAME: Record<'RS' | 'AS' | 'AIU' | 'RU', string> = {
  RS: 'Resume Scoring',
  AS: 'AI Assessment',
  AIU: 'AI Interview',
  RU: 'Resume Units',
};

/** A member's consumption history loads this many entries at a time. */
const LOG_PAGE_SIZE = 200;

/* Member usage per team + range. Collapsing and re-opening a team used to
   refetch it every time; the cache is cleared whenever the team list reloads. */
const membersCache = new Map<string, TeamMemberUsage[]>();
const membersCacheKey = (teamId: string, fromDate: string, toDate: string) => `${teamId}|${fromDate}|${toDate}`;

// Human-readable labels for all unit types (including system ones)
const UNIT_TYPE_LABEL: Record<string, string> = {
  RS:         'Resume Scoring',
  AS:         'AI Assessment',
  AIU:        'AI Interview',
  RU:         'Resume Units',
  max_seats:  'Seats',
};

const ENTRY_UNIT_BADGE_EXTENDED: Record<string, string> = {
  RS:        'bg-blue-100 text-blue-700',
  AS:        'bg-brand-cyan/15 text-[color-mix(in_srgb,var(--brand-cyan)_80%,black)] dark:text-brand-cyan',
  AIU:       'bg-success-subtle text-success',
  RU:        'bg-orange-100 text-orange-700',
  max_seats: 'bg-slate-100 text-slate-600',
};

// ─── Consumption log entries (member drill-down detail) ───────────────────────

interface LogPaging {
  /** Entries in the range on the server — more than `entries.length` means more to load. */
  total: number;
  onLoadMore: () => void;
  loadingMore: boolean;
}

/** "Showing 200 of 340" — or just the count when everything is loaded. */
const historyCountLabel = (shown: number, total: number) =>
  total > shown ? `showing ${shown} of ${total}` : `${shown} ${shown === 1 ? 'entry' : 'entries'}`;

function LoadMoreHistory({ shown, total, onLoadMore, loadingMore, className = '' }: LogPaging & { shown: number; className?: string }) {
  if (total <= shown) return null;
  const next = Math.min(LOG_PAGE_SIZE, total - shown);
  return (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={loadingMore}
      className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/[0.04] disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {loadingMore ? 'Loading…' : `Load ${next} more`}
    </button>
  );
}

/** The four unit modules only — seat-licence entries (max_seats) aren't team usage.
 *  `total` is the server count less the seat entries already loaded. */
function unitHistory(entries: ConsumptionLogEntry[], total: number) {
  const shown = entries.filter(e => e.unit_type !== 'max_seats');
  return { shown, total: Math.max(total - (entries.length - shown.length), shown.length) };
}

/** What the units were spent on — the resume / JD / candidate name. No fallback to the
 *  module name: that sits right next to it and read as the same thing twice. */
const entryItem = (e: ConsumptionLogEntry) => e.entity_name?.trim() || '';
/** The entity type, unless it only repeats the module ("assessment" under AI Assessment). */
const entryKind = (e: ConsumptionLogEntry) => {
  const kind = e.entity_type?.replace(/_/g, ' ').trim();
  if (!kind) return '';
  const moduleName = (UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type).toLowerCase();
  return kind.toLowerCase().split(' ').some((w) => moduleName.includes(w)) ? '' : kind;
};
const entryStatus = (st: string) => st.replace(/_/g, ' ').toLowerCase();

/** Unit-type / status filters over the loaded history (client side). */
function useHistoryFilters(entries: ConsumptionLogEntry[]) {
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');
  // Resume Units, Resume Scoring, AI Assessment, AI Interview — not first-seen order.
  const unitOptions = useMemo(() => {
    const seen = new Set<string>(entries.map(e => e.unit_type));
    return [...UNIT_KEYS.filter(k => seen.has(k)), ...[...seen].filter(u => !(UNIT_KEYS as readonly string[]).includes(u))];
  }, [entries]);
  const statusOptions = useMemo(() => Array.from(new Set(entries.map(e => e.status))), [entries]);
  const filtered = useMemo(
    () => entries.filter(e => (!unit || e.unit_type === unit) && (!status || e.status === status)),
    [entries, unit, status],
  );
  return { unit, setUnit, status, setStatus, unitOptions, statusOptions, filtered, active: !!unit || !!status };
}
type HistoryFilters = ReturnType<typeof useHistoryFilters>;

/** The shown (filtered) entries as a CSV. */
function downloadHistory(entries: ConsumptionLogEntry[], memberName: string, fromDate: string, toDate: string) {
  const rows = entries.map(e => [
    formatIST(e.created_at),
    UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type,
    entryItem(e),
    e.units_consumed,
    e.balance_before ?? '',
    e.balance_after ?? '',
    entryStatus(e.status),
    e.failure_reason ?? '',
  ]);
  const slug = memberName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
  exportRowsToCSV(['Date', 'Module', 'Item', 'Units', 'Org Balance Before', 'Org Balance After', 'Status', 'Failure Reason'], rows, `${slug}-history-${fromDate}-to-${toDate}`);
}

function HistoryToolbar({ f, onDownload, className = '' }: { f: HistoryFilters; onDownload: () => void; className?: string }) {
  const select = 'h-7 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {f.unitOptions.length > 1 && (
        <select aria-label="Filter by unit type" value={f.unit} onChange={e => f.setUnit(e.target.value)} className={select}>
          <option value="">All units</option>
          {f.unitOptions.map(u => <option key={u} value={u}>{UNIT_TYPE_LABEL[u] ?? u}</option>)}
        </select>
      )}
      {f.statusOptions.length > 1 && (
        <select aria-label="Filter by status" value={f.status} onChange={e => f.setStatus(e.target.value)} className={select}>
          <option value="">All statuses</option>
          {f.statusOptions.map(st => <option key={st} value={st}>{st.replace(/_/g, ' ').toLowerCase()}</option>)}
        </select>
      )}
      <button
        type="button"
        onClick={onDownload}
        disabled={f.filtered.length === 0}
        className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:text-brand-blue disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <Download className="h-3.5 w-3.5" /> CSV
      </button>
    </div>
  );
}

function MemberLogEntries({ entries: allEntries, total: serverTotal, onLoadMore, loadingMore, memberName, fromDate, toDate }: { entries: ConsumptionLogEntry[]; memberName: string; fromDate: string; toDate: string } & LogPaging) {
  const { shown: entries, total } = unitHistory(allEntries, serverTotal);
  const f = useHistoryFilters(entries);
  const sorted = [...f.filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  // Pages over the server total; filters work on what's loaded, so with a
  // filter on, the pages cover the loaded matches only.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalItems = f.active ? sorted.length : total;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize);
  // A page past what's loaded: fetch the next batch (200) until it's covered.
  const needMore = !f.active && current * pageSize > entries.length && allEntries.length < serverTotal;
  // Once per batch: a failed load shows a Retry instead of looping.
  const requestedAt = useRef(-1);
  useEffect(() => {
    if (!needMore || loadingMore || requestedAt.current === allEntries.length) return;
    requestedAt.current = allEntries.length;
    onLoadMore();
  }, [needMore, loadingMore, onLoadMore, allEntries.length]);
  const TH = 'bg-white px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:bg-slate-900 dark:text-slate-300';
  return (
    <tr>
      <td colSpan={6} className="tf-td bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="tf-caption">
            Consumption history
            <span className="ml-1.5 font-normal text-gray-400 dark:text-slate-500">
              {historyCountLabel(entries.length, total)}{f.active && ` · ${sorted.length} matching`}
            </span>
          </p>
          <HistoryToolbar f={f} onDownload={() => downloadHistory(sorted, memberName, fromDate, toDate)} className="ml-auto" />
        </div>
        <div className="tf-panel overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className={TH}>Date &amp; time</th>
                <th className={TH}>Activity</th>
                <th className={`${TH} text-right`}>Units</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {needMore && pageRows.length < pageSize ? (
                <tr>
                  <td colSpan={4} className="tf-td text-center tf-hint">
                    {loadingMore ? (
                      <><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Loading entries…</>
                    ) : (
                      // Not loading but still short: the batch failed (the effect asks once per batch).
                      <button type="button" onClick={onLoadMore} className="font-semibold text-brand-blue hover:underline">
                        Load these entries
                      </button>
                    )}
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="tf-td text-center tf-hint">
                    {entries.length === 0 ? 'No unit usage in this range.' : 'No entries match these filters.'}
                  </td>
                </tr>
              ) : pageRows.map(e => (
                <tr key={e.id} className="align-top hover:bg-brand-blue/[0.02]">
                  <td className="tf-td whitespace-nowrap tf-meta tabular-nums">{formatIST(e.created_at)}</td>
                  <td className="tf-td max-w-[24rem]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${ENTRY_UNIT_BADGE_EXTENDED[e.unit_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type}
                      </span>
                      {entryItem(e) && (
                        <span className="truncate font-medium text-gray-900 dark:text-slate-50" title={entryItem(e)}>{entryItem(e)}</span>
                      )}
                    </div>
                    {(entryKind(e) || e.overall_score != null) && (
                      <p className="mt-0.5 truncate tf-hint capitalize">
                        {entryKind(e)}
                        {entryKind(e) && e.overall_score != null && ' · '}
                        {e.overall_score != null && <span className="normal-case">Score <span className="font-semibold text-gray-600 dark:text-slate-300">{e.overall_score}%</span></span>}
                      </p>
                    )}
                    {e.failure_reason && <p className="mt-0.5 tf-error">{e.failure_reason}</p>}
                  </td>
                  <td className="tf-td whitespace-nowrap text-right">
                    {/* Units charged only — the before → after balance was the whole
                        organisation's pool, which read as this member's. A negative
                        entry is a unit credited back (e.g. a deleted resume). */}
                    <p className={`font-semibold tabular-nums ${e.units_consumed < 0 ? 'text-success' : 'text-gray-900 dark:text-slate-50'}`}>
                      {e.units_consumed > 0 ? e.units_consumed : e.units_consumed < 0 ? `+${Math.abs(e.units_consumed)}` : '0'}
                    </p>
                  </td>
                  <td className="tf-td whitespace-nowrap">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {entryStatus(e.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <ListPagination
            attached
            compact
            currentPage={current}
            itemsPerPage={pageSize}
            totalItems={totalItems}
            onPageChange={setPage}
            onItemsPerPageChange={(size) => { setPageSize(size); setPage(1); }}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="entries"
          />
        </div>
        {/* Filters only see loaded entries — offer the rest. */}
        {f.active && allEntries.length < serverTotal && (
          <LoadMoreHistory shown={allEntries.length} total={serverTotal} onLoadMore={onLoadMore} loadingMore={loadingMore} className="mt-2" />
        )}
      </td>
    </tr>
  );
}

// ─── Data hooks (shared by the desktop rows and the phone cards) ─────────────

/** A member's consumption log, fetched on first expand. */
function useMemberLog(member: TeamMemberUsage, fromDate: string, toDate: string) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<ConsumptionLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // One page of history from `offset`. Same range as the counts above —
  // end_date used to be left out, so the history ran past the To date.
  const fetchPage = async (offset: number) => {
    const res = await unitPoolService.getConsumptionHistory({
      user_id: member.user_id,
      start_date: fromDate,
      end_date: toDate,
      limit: LOG_PAGE_SIZE,
      offset,
    });
    const items: ConsumptionLogEntry[] = Array.isArray(res)
      ? res
      : (res as any).items ?? (res as any).data ?? [];
    // No total from the server: assume more only while pages come back full.
    const serverTotal = !Array.isArray(res) && typeof res.total === 'number'
      ? res.total
      : offset + items.length + (items.length === LOG_PAGE_SIZE ? 1 : 0);
    return { items, serverTotal };
  };

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (entries !== null) return;
    setLoading(true);
    try {
      const { items, serverTotal } = await fetchPage(0);
      setEntries(items);
      setTotal(serverTotal);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!entries || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items, serverTotal } = await fetchPage(entries.length);
      setEntries([...entries, ...items]);
      setTotal(items.length === 0 ? entries.length : serverTotal);
    } catch {
      toast.error({ title: 'Could not load more history', description: 'Please try again.' });
    } finally {
      setLoadingMore(false);
    }
  };

  // Reset when either end of the range changes
  useEffect(() => { setEntries(null); setTotal(0); setExpanded(false); }, [fromDate, toDate]);

  return { expanded, toggle, entries, loading, total, loadMore, loadingMore };
}

/** A team's member usage, fetched while the team is expanded. */
function useTeamMembers(teamId: string, expanded: boolean, fromDate: string, toDate: string) {
  const [members, setMembers] = useState<TeamMemberUsage[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const key = membersCacheKey(teamId, fromDate, toDate);
    const cached = membersCache.get(key);
    if (cached) {
      setMembers(cached);
      setLoadingMembers(false);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    setMembers(null);
    teamService.getTeamMembersUsage(teamId, fromDate, toDate)
      .then(res => {
        membersCache.set(key, res.members);
        if (!cancelled) setMembers(res.members);
      })
      .catch(() => { if (!cancelled) setMembers([]); })
      .finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [expanded, teamId, fromDate, toDate]);

  return { members, loadingMembers };
}

// ─── Member list: search, sort, Top / No-usage markers ─────────────────────────

type MemberSort = 'usage' | 'name' | 'recent';

/** Search + sort over a team's members, and which one used the most. */
function useMemberView(members: TeamMemberUsage[] | null) {
  const measure = useContext(MeasureContext);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MemberSort>('usage');
  const list = useMemo(() => members ?? [], [members]);
  const topId = useMemo(() => {
    if (list.length < 2) return null;
    let best: TeamMemberUsage | null = null;
    for (const mem of list) if (!best || memberTotalBy(mem, measure) > memberTotalBy(best, measure)) best = mem;
    return best && memberTotalBy(best, measure) > 0 ? best.user_id : null;
  }, [list, measure]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? list.filter(mem => (mem.user_name || '').toLowerCase().includes(q) || (mem.user_email || '').toLowerCase().includes(q))
      : list;
    return [...found].sort((a, b) => {
      if (sort === 'name') return (a.user_name || a.user_email).localeCompare(b.user_name || b.user_email, undefined, { sensitivity: 'base' });
      if (sort === 'recent') return (b.last_activity || '').localeCompare(a.last_activity || '');
      return memberTotalBy(b, measure) - memberTotalBy(a, measure);
    });
  }, [list, query, sort, measure]);
  return { query, setQuery, sort, setSort, rows, topId, count: list.length };
}
type MemberView = ReturnType<typeof useMemberView>;

function MemberListControls({ view, className = '' }: { view: MemberView; className?: string }) {
  if (view.count < 2) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={view.query}
          onChange={e => view.setQuery(e.target.value)}
          placeholder="Search members…"
          aria-label="Search members"
          className="tf-input tf-input-sm pl-8 pr-2"
        />
      </div>
      <select
        aria-label="Sort members"
        value={view.sort}
        onChange={e => view.setSort(e.target.value as MemberSort)}
        className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-2 tf-meta dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="usage">Most usage</option>
        <option value="name">Name (A–Z)</option>
        <option value="recent">Recently active</option>
      </select>
    </div>
  );
}

/** "Top" for the team's biggest consumer; "No usage" for a member with none in the range. */
function MemberBadges({ member, isTop }: { member: TeamMemberUsage; isTop: boolean }) {
  const idle = memberTotalBy(member, 'units') === 0;
  if (!isTop && !idle) return null;
  return isTop ? (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-orange/10 px-1.5 py-px text-2xs font-semibold text-brand-orange-deep ring-1 ring-brand-orange/15">
      <Crown className="h-2.5 w-2.5" /> Top
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-1.5 py-px tf-micro-hint dark:bg-slate-800">
      No usage
    </span>
  );
}

// ─── Single member row ────────────────────────────────────────────────────────

type MemberLogView = 'activity' | 'history';

/** Switch between the two logs of an expanded member (only one shows at a time). */
function MemberLogTabs({ value, onChange }: { value: MemberLogView; onChange: (v: MemberLogView) => void }) {
  const tabs: { id: MemberLogView; label: string; hint: string }[] = [
    { id: 'activity', label: 'Unit activity', hint: 'Units deducted and returned (e.g. a deleted resume gives its unit back)' },
    { id: 'history', label: 'Consumption history', hint: 'Every metered action with its status, including failed ones' },
  ];
  return (
    <div role="tablist" aria-label="Member log" className="tf-panel mb-3 inline-flex p-0.5">
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          title={t.hint}
          onClick={(e) => { e.stopPropagation(); onChange(t.id); }}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            value === t.id ? 'bg-brand-blue text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function MemberRow({ member, teamId, fromDate, toDate, isTop = false }: { member: TeamMemberUsage; teamId: string; fromDate: string; toDate: string; isTop?: boolean }) {
  const { expanded, toggle, entries, loading, total, loadMore, loadingMore } = useMemberLog(member, fromDate, toDate);
  const [logView, setLogView] = useState<MemberLogView>('activity');
  const measure = useContext(MeasureContext);

  // The badge follows the Actions / Units toggle; the line under it shows the other one.
  const rs   = memberValue(member, 'RS', measure);
  const as_  = memberValue(member, 'AS', measure);
  const aiu  = memberValue(member, 'AIU', measure);
  const ru   = memberValue(member, 'RU', measure);

  return (
    <>
      <tr
        onClick={toggle}
        className="cursor-pointer hover:bg-brand-blue/[0.04] dark:hover:bg-slate-800 transition-colors border-t border-gray-100 dark:border-slate-700/60 select-none"
      >
        {/* Member */}
        <td className="tf-td whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="text-gray-300 dark:text-slate-500 shrink-0">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
            <NameAvatar name={member.user_name} fallback={member.user_email} size="sm" />
            <div>
              <p className="flex items-center gap-1.5 tf-row-name">
                {member.user_name || '—'}
                <MemberBadges member={member} isTop={isTop} />
              </p>
              <p className="tf-hint">{member.user_email}</p>
            </div>
          </div>
        </td>

        {/* RU */}
        <td className="tf-td whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${ru > 0 ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(ru, measure)}
            </span>
            <ReturnedNote member={member} k="RU" />
          </div>
        </td>

        {/* RS */}
        <td className="tf-td whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${rs > 0 ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(rs, measure)}
            </span>
            <ReturnedNote member={member} k="RS" />
          </div>
        </td>

        {/* AS */}
        <td className="tf-td whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${as_ > 0 ? 'bg-brand-cyan/15 text-[color-mix(in_srgb,var(--brand-cyan)_80%,black)] dark:text-brand-cyan ring-1 ring-brand-cyan/30' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(as_, measure)}
            </span>
            <ReturnedNote member={member} k="AS" />
          </div>
        </td>

        {/* AIU */}
        <td className="tf-td whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${aiu > 0 ? 'bg-success-subtle text-success ring-1 ring-success-line' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(aiu, measure)}
            </span>
            <ReturnedNote member={member} k="AIU" />
          </div>
        </td>

        {/* Last active */}
        <td className="tf-td whitespace-nowrap tf-meta">
          {member.last_activity ? formatISTDate(member.last_activity) : 'Never'}
        </td>
      </tr>

      {/* One log at a time: Unit activity (deducted + returned, default) or the
          older Consumption history — showing both stacked read as two
          disagreeing records of the same usage. */}
      {expanded && (
        <tr>
          <td colSpan={6} className={`bg-gray-50 dark:bg-slate-800/50 px-4 ${logView === 'activity' ? 'py-4 border-b border-gray-100 dark:border-slate-700/60' : 'pt-4 pb-0'}`}>
            <MemberLogTabs value={logView} onChange={setLogView} />
            {logView === 'activity' && (
              <UnitActivityLog
                teamId={teamId}
                userId={member.user_id}
                memberName={member.user_name || member.user_email}
                fromDate={fromDate}
                toDate={toDate}
              />
            )}
          </td>
        </tr>
      )}

      {/* Loading — mirrors MemberLogEntries: label + entry rows */}
      {expanded && logView === 'history' && loading && (
        <tr>
          <td colSpan={6} className="tf-td bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60">
            <Skeleton className="h-3 w-56 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="tf-panel px-4 py-3 flex items-start gap-3">
                  <Skeleton className="shrink-0 h-6 w-10 rounded-md" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="shrink-0 space-y-1.5 flex flex-col items-end">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="shrink-0 h-6 w-16 rounded-full" />
                  <Skeleton className="shrink-0 h-3 w-20" />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}

      {/* Log entries */}
      {expanded && logView === 'history' && !loading && entries !== null && entries.length > 0 && (
        <MemberLogEntries entries={entries} total={total} onLoadMore={loadMore} loadingMore={loadingMore} memberName={member.user_name || member.user_email} fromDate={fromDate} toDate={toDate} />
      )}

      {/* Empty */}
      {expanded && logView === 'history' && !loading && entries !== null && entries.length === 0 && (
        <tr>
          <td colSpan={6} className="tf-td bg-gray-50 dark:bg-slate-800/50 tf-body-muted italic border-b border-gray-100 dark:border-slate-700/60">
            No consumption entries for this member in the selected period.
          </td>
        </tr>
      )}
    </>
  );
}

// ─── % of total: a team's part of all teams' units, as a bar and a number ────

function ShareBar({ team, grandTotal, className = '' }: { team: TeamUsageSummary; grandTotal: number; className?: string }) {
  const measure = useContext(MeasureContext);
  const total = teamTotalBy(team, measure);
  if (total <= 0 || grandTotal <= 0) return <span className="text-sm text-gray-300 dark:text-slate-500">—</span>;
  const pct = Math.round((total / grandTotal) * 100);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Bar length = the team's share, so bigger users stand out at a glance.
          The per-type mix is already in the unit columns. */}
      <div
        className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
        title={`${formatMeasure(total, measure)} of ${formatMeasure(grandTotal, measure)} units across all teams`}
      >
        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.max((total / grandTotal) * 100, 2)}%` }} />
      </div>
      <span className="tf-caption tabular-nums">{pct < 1 ? '<1' : pct}%</span>
    </div>
  );
}

// ─── Team row (outer table — 7 cols) + nested member table (10 cols) ──────────

function TeamRow({
  team,
  fromDate,
  toDate,
  expanded,
  onToggle,
  grandTotal,
  canExpand,
}: {
  team: TeamUsageSummary;
  fromDate: string;
  toDate: string;
  expanded: boolean;
  onToggle: () => void;
  grandTotal: number;
  /** Member breakdown is tenant-admin only — others get a plain row. */
  canExpand: boolean;
}) {
  const { members, loadingMembers } = useTeamMembers(team.team_id, expanded, fromDate, toDate);
  const view = useMemberView(members);
  const measure = useContext(MeasureContext);

  const rs  = teamValue(team, 'RS', measure);
  const as_ = teamValue(team, 'AS', measure);
  const aiu = teamValue(team, 'AIU', measure);
  const ru  = teamValue(team, 'RU', measure);
  const total = teamTotalBy(team, measure);

  return (
    <>
      {/* Team summary row — outer table 6 cols */}
      <tr
        id={`team-usage-${team.team_id}`}
        onClick={canExpand ? onToggle : undefined}
        className={`transition-colors border-t border-gray-200 dark:border-slate-700 select-none ${canExpand ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800' : ''}`}
      >
        <td className="tf-td whitespace-nowrap">
          <div className="flex items-center gap-3">
            {/* The only expand affordance — the whole row toggles. */}
            {canExpand && (
              <div className={expanded ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'} aria-label={expanded ? 'Hide members' : 'Show members'}>
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </div>
            )}
            <div>
              <p className="tf-row-title">{team.team_name || 'Unnamed Team'}</p>
            </div>
          </div>
        </td>
        {([['RU', ru], ['RS', rs], ['AS', as_], ['AIU', aiu]] as ['RS' | 'AS' | 'AIU' | 'RU', number][]).map(([key, val]) => (
          <td key={key} className="tf-td whitespace-nowrap">
            {val > 0
              ? <span title={`${UNIT_FULL_NAME[key]}: ${formatMeasure(val, measure)} ${measure === 'units' ? 'net units' : measure}`} className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${UNIT_COLORS[key]}`}>{formatMeasure(val, measure)}</span>
              : <span className="text-gray-300 dark:text-slate-500 text-sm">—</span>}
            <TeamReturnedNote team={team} k={key} />
          </td>
        ))}
        <td className="tf-td whitespace-nowrap">
          <span className={`text-sm font-bold ${total > 0 ? 'text-gray-900 dark:text-slate-50' : 'text-gray-300 dark:text-slate-500'}`}>
            {total > 0 ? formatMeasure(total, measure) : '—'}
          </span>
        </td>
        <td className="tf-td whitespace-nowrap">
          <ShareBar team={team} grandTotal={grandTotal} />
        </td>
      </tr>

      {/* Member expansion — full-width nested table with 10 columns */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0 border-t border-gray-100 dark:border-slate-700/60">
            <div className="bg-gray-50 dark:bg-slate-800/50">
              {loadingMembers ? (
                <div className="px-4 py-3 space-y-3">
                  {/* Mirrors member rows: avatar + name/email, then unit stat columns */}
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex items-center gap-2 sm:w-56 shrink-0">
                        <Skeleton className="w-7 h-7 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                      <div className="flex-1 grid grid-cols-3 sm:grid-cols-5 gap-3">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <Skeleton key={j} className="h-6 w-full max-w-[3rem] mx-auto rounded-md" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : members && members.length > 0 ? (
                <div className="tf-table-shell">
                  <MemberListControls view={view} className="px-4 pt-3 pb-1" />
                  <table className="w-full">
                    {/* Member table header — 9 cols */}
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="tf-th-cell text-left tf-th">
                          Member
                        </th>
                        <th className="tf-th-cell text-center tf-th">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RU}`} />
                            <span className="text-gray-600 dark:text-slate-300">Resume Units</span>
                          </span>
                        </th>
                        <th className="tf-th-cell text-center tf-th">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RS}`} />
                            <span className="text-gray-600 dark:text-slate-300">Resume Scoring</span>
                          </span>
                        </th>
                        <th className="tf-th-cell text-center tf-th">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AS}`} />
                            <span className="text-gray-600 dark:text-slate-300">AI Assessment</span>
                          </span>
                        </th>
                        <th className="tf-th-cell text-center tf-th">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AIU}`} />
                            <span className="text-gray-600 dark:text-slate-300">AI Interview</span>
                          </span>
                        </th>
                        <th className="tf-th-cell text-left tf-th">
                          Last Active
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-700/60">
                      {view.rows.map(m => (
                        <MemberRow key={m.user_id} member={m} teamId={team.team_id} fromDate={fromDate} toDate={toDate} isTop={m.user_id === view.topId} />
                      ))}
                      {view.rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="tf-td tf-body-muted italic">No members match “{view.query}”.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-4 tf-body-muted italic">
                  No members with usage in this period.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Phone cards (<md) — same data and drill-down as the tables above ────────

function MobileLogEntries({ entries: allEntries, total: serverTotal, onLoadMore, loadingMore, memberName, fromDate, toDate }: { entries: ConsumptionLogEntry[]; memberName: string; fromDate: string; toDate: string } & LogPaging) {
  const { shown: entries, total } = unitHistory(allEntries, serverTotal);
  const f = useHistoryFilters(entries);
  const sorted = [...f.filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="border-t border-gray-100 px-2.5 py-2.5 dark:border-slate-700/60">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
        History · {historyCountLabel(entries.length, total)}{f.active && ` · ${sorted.length} matching`}
      </p>
      <HistoryToolbar f={f} onDownload={() => downloadHistory(sorted, memberName, fromDate, toDate)} className="mb-2" />
      {sorted.length === 0 && <p className="tf-hint italic">No entries match these filters.</p>}
      <div className="tf-record-list max-h-72 overflow-y-auto pr-0.5">
        {sorted.map(e => (
          <MobileRecordCard
            key={e.id}
            title={entryItem(e)}
            badges={
              <>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold ${ENTRY_UNIT_BADGE_EXTENDED[e.unit_type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-2xs font-medium capitalize ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {entryStatus(e.status)}
                </span>
              </>
            }
            meta={[{ icon: <Clock />, label: formatIST(e.created_at) }]}
            fields={[{ label: 'Reason', value: e.failure_reason ? <span className="text-destructive">{e.failure_reason}</span> : null }]}
            footer={
              <MobileStatChip tone={e.units_consumed > 0 ? 'warning' : e.units_consumed < 0 ? 'success' : 'neutral'}>
                {e.units_consumed > 0 ? `−${e.units_consumed}` : e.units_consumed < 0 ? `+${Math.abs(e.units_consumed)}` : '0'} units
              </MobileStatChip>
            }
          />
        ))}
      </div>
      <LoadMoreHistory shown={allEntries.length} total={serverTotal} onLoadMore={onLoadMore} loadingMore={loadingMore} className="mt-2" />
    </div>
  );
}

function MobileMemberCard({ member, teamId, fromDate, toDate, isTop = false }: { member: TeamMemberUsage; teamId: string; fromDate: string; toDate: string; isTop?: boolean }) {
  const { expanded, toggle, entries, loading, total, loadMore, loadingMore } = useMemberLog(member, fromDate, toDate);
  const [logView, setLogView] = useState<MemberLogView>('activity');
  const measure = useContext(MeasureContext);
  const stats: [string, string | number, boolean][] = [
    ...UNIT_KEYS.map((k): [string, string, boolean] => [k, formatMeasure(memberValue(member, k, measure), measure), memberValue(member, k, measure) > 0]),
  ];

  return (
    <li>
      <MobileRecordCard
        selected={expanded}
        onClick={toggle}
        title={
          <span className="flex min-w-0 items-center gap-2">
            <NameAvatar name={member.user_name} fallback={member.user_email} size="sm" />
            <span className="min-w-0 truncate">{member.user_name || '—'}</span>
          </span>
        }
        badges={<MemberBadges member={member} isTop={isTop} />}
        meta={[{ label: member.user_email }]}
        fields={[{ label: 'Last active', value: member.last_activity ? formatISTDate(member.last_activity) : 'Never' }]}
        footer={
          <>
            {stats.map(([label, value, active]) => (
              <MobileStatChip key={label} tone={active ? 'info' : 'neutral'}>
                {UNIT_FULL_NAME[label as UnitKey] ?? label} <span className="tabular-nums">{value}</span>
              </MobileStatChip>
            ))}
          </>
        }
        actions={
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide usage logs' : 'Show usage logs'}
            className="tf-icon-btn-outline"
          >
            {expanded ? <ChevronDown className="text-brand-blue" /> : <ChevronRight />}
          </button>
        }
      />
      {expanded && (
      <div className="tf-panel mt-1 overflow-hidden">
      {expanded && (
        <div className="px-2.5 pt-2.5">
          <MemberLogTabs value={logView} onChange={setLogView} />
          {logView === 'activity' && (
            <div className="pb-2.5">
              <UnitActivityLog
                teamId={teamId}
                userId={member.user_id}
                memberName={member.user_name || member.user_email}
                fromDate={fromDate}
                toDate={toDate}
                compact
              />
            </div>
          )}
        </div>
      )}
      {expanded && logView === 'history' && loading && (
        <div className="space-y-1.5 border-t border-gray-100 px-2.5 py-2.5 dark:border-slate-700/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      )}
      {expanded && logView === 'history' && !loading && entries !== null && entries.length > 0 && (
        <MobileLogEntries entries={entries} total={total} onLoadMore={loadMore} loadingMore={loadingMore} memberName={member.user_name || member.user_email} fromDate={fromDate} toDate={toDate} />
      )}
      {expanded && logView === 'history' && !loading && entries !== null && entries.length === 0 && (
        <p className="border-t border-gray-100 px-2.5 py-2.5 tf-hint italic dark:border-slate-700/60">
          No consumption entries in the selected period.
        </p>
      )}
      </div>
      )}
    </li>
  );
}

function MobileTeamCard({
  team,
  fromDate,
  toDate,
  expanded,
  onToggle,
  grandTotal,
  canExpand,
}: {
  team: TeamUsageSummary;
  fromDate: string;
  toDate: string;
  expanded: boolean;
  onToggle: () => void;
  grandTotal: number;
  /** Member breakdown is tenant-admin only — others get a plain row. */
  canExpand: boolean;
}) {
  const { members, loadingMembers } = useTeamMembers(team.team_id, expanded, fromDate, toDate);
  const view = useMemberView(members);
  const measure = useContext(MeasureContext);
  const total = teamTotalBy(team, measure);

  return (
    <li id={`team-usage-${team.team_id}`} className="space-y-2">
      <MobileRecordCard
        selected={expanded}
        onClick={canExpand ? onToggle : undefined}
        title={team.team_name || 'Unnamed Team'}
        footer={
          <>
            <MobileStatChip tone={total > 0 ? 'info' : 'neutral'}>
              <span className="tabular-nums">{total > 0 ? formatMeasure(total, measure) : '—'}</span> {measure === 'units' ? 'units' : 'total'}
            </MobileStatChip>
            {UNIT_KEYS.map(k => {
              const val = teamValue(team, k, measure);
              return (
                <MobileStatChip key={k} tone={val > 0 ? 'info' : 'neutral'}>
                  {UNIT_FULL_NAME[k]} <span className="tabular-nums">{formatMeasure(val, measure)}</span>
                  {SHOWS_RETURNS(k) && (team.by_type[k]?.units_returned ?? 0) > 0 && (
                    <span className="font-medium text-success" title="Units credited back this period (e.g. deleted resumes)">
                      +{formatUnits(team.by_type[k]?.units_returned ?? 0)} returned
                    </span>
                  )}
                </MobileStatChip>
              );
            })}
          </>
        }
        actions={canExpand ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide team members' : 'Show team members'}
            className="tf-icon-btn-outline"
          >
            {expanded ? <ChevronDown className="text-brand-blue" /> : <ChevronRight />}
          </button>
        ) : undefined}
      >
        <ShareBar team={team} grandTotal={grandTotal} className="mt-2" />
      </MobileRecordCard>
      {expanded && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-2 dark:border-slate-700/60 dark:bg-slate-800/50">
          {loadingMembers ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : members && members.length > 0 ? (
            <>
              <MemberListControls view={view} className="mb-2" />
              <ul className="space-y-2">
                {view.rows.map(m => (
                  <MobileMemberCard key={m.user_id} member={m} teamId={team.team_id} fromDate={fromDate} toDate={toDate} isTop={m.user_id === view.topId} />
                ))}
              </ul>
              {view.rows.length === 0 && <p className="px-2 py-2 tf-hint italic">No members match “{view.query}”.</p>}
            </>
          ) : (
            <p className="px-2 py-2 tf-hint italic">No members with usage in this period.</p>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Members view: every member in one table ─────────────────────────────────

/** One row per person. Someone in two teams appears once, with both teams listed
 *  (their usage is their own, so it isn't added up twice). */
export type MemberUsageRow = {
  id: string;
  name: string;
  email: string;
  teams: string[];
  units: Record<UnitKey, number>;
  total: number;
  lastActivity: string | null;
};

export function useAllMembersUsage(teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  const reqKey = `${fromDate}|${toDate}|${teams.map((t) => t.team_id).join(',')}`;
  const [data, setData] = useState<{ key: string; rows: MemberUsageRow[]; failed: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Same per-team cache as an expanded team row, so either view reuses the other's fetches.
    Promise.allSettled(teams.map(async (team) => {
      const key = membersCacheKey(team.team_id, fromDate, toDate);
      const cached = membersCache.get(key);
      if (cached) return cached;
      const res = await teamService.getTeamMembersUsage(team.team_id, fromDate, toDate);
      membersCache.set(key, res.members);
      return res.members;
    })).then((results) => {
      if (cancelled) return;
      const byId = new Map<string, MemberUsageRow>();
      const failed: string[] = [];
      results.forEach((r, i) => {
        const teamName = teams[i].team_name || 'Unnamed Team';
        if (r.status === 'rejected') { failed.push(teamName); return; }
        for (const m of r.value ?? []) {
          const existing = byId.get(m.user_id);
          if (existing) {
            if (!existing.teams.includes(teamName)) existing.teams.push(teamName);
            continue;
          }
          const units = Object.fromEntries(UNIT_KEYS.map((k) => [k, getMUnits(m, k)])) as Record<UnitKey, number>;
          byId.set(m.user_id, {
            id: m.user_id,
            name: m.user_name || m.user_email || 'Unknown',
            email: m.user_email ?? '',
            teams: [teamName],
            units,
            total: memberTotalBy(m, 'units'),
            lastActivity: m.last_activity,
          });
        }
      });
      setData({ key: reqKey, rows: Array.from(byId.values()), failed });
    });
    return () => { cancelled = true; };
    // reqKey covers teams + range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const ready = data?.key === reqKey;
  return { rows: ready ? data.rows : [], failed: ready ? data.failed : [], loading: !ready };
}

type MemberSortKey = 'name' | UnitKey | 'total' | 'last';
const MEMBER_SORT_DESC_FIRST: readonly MemberSortKey[] = ['RU', 'RS', 'AS', 'AIU', 'total', 'last'];

function MembersUsageView({ teams, fromDate, toDate, query, isMobile, sort }: {
  /** Owned by the parent: the stat cards and the phone sort menu set it too. */
  sort: TableSort<MemberSortKey>;
  teams: TeamUsageSummary[];
  fromDate: string;
  toDate: string;
  query: string;
  isMobile: boolean;
}) {
  const { rows, failed, loading } = useAllMembersUsage(teams, fromDate, toDate);
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) =>
    !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.teams.some((t) => t.toLowerCase().includes(q)),
  );
  // Default: most units first.
  const sorted = sort.sortKey
    ? sortRows(visible, sort.sortKey, sort.sortDir, {
        name: (r) => r.name,
        RU: (r) => r.units.RU,
        RS: (r) => r.units.RS,
        AS: (r) => r.units.AS,
        AIU: (r) => r.units.AIU,
        total: (r) => r.total,
        last: (r) => r.lastActivity ?? '',
      })
    : [...visible].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const shell = 'tf-card-soft overflow-hidden';
  const TH = 'px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300';
  const teamsText = (r: MemberUsageRow) => r.teams.join(', ');
  const empty = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
      <Users className="w-10 h-10 text-gray-200 dark:text-slate-500 mx-auto mb-3" />
      <p className="tf-body-muted">
        {rows.length === 0 ? 'No team members for the selected period.' : 'No members match your search.'}
      </p>
    </div>
  );

  return (
    <>
      {failed.length > 0 && (
        <p className="mb-2 text-xs text-brand-orange-deep">
          Couldn’t load members for: {failed.join(', ')}.
        </p>
      )}
      {isMobile ? (
        <div className={shell}>
          {loading ? (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="space-y-2 px-3 py-3">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </li>
              ))}
            </ul>
          ) : sorted.length === 0 ? empty : (
            <div className="tf-record-list p-3">
              {sorted.map((r) => (
                <MobileRecordCard
                  key={r.id}
                  title={
                    <span className="flex min-w-0 items-center gap-2">
                      <NameAvatar name={r.name} fallback={r.email} size="sm" />
                      <span className="min-w-0 truncate">{r.name}</span>
                    </span>
                  }
                  meta={[{ icon: <Users />, label: teamsText(r) }]}
                  footer={
                    <>
                      <MobileStatChip tone={r.total > 0 ? 'info' : 'neutral'}>
                        <span className="tabular-nums">{r.total > 0 ? formatUnits(r.total) : '—'}</span> units
                      </MobileStatChip>
                      {UNIT_KEYS.map((k) => (
                        <MobileStatChip key={k} tone={r.units[k] > 0 ? 'info' : 'neutral'}>
                          {UNIT_FULL_NAME[k]} <span className="tabular-nums">{formatUnits(r.units[k])}</span>
                        </MobileStatChip>
                      ))}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`${shell} tf-table-shell overflow-x-auto`}>
          <table className="w-full min-w-[900px]">
            <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className={TH} aria-sort={ariaSort(sort, 'name')}><SortableHeader label="Member" column="name" sort={sort} /></th>
                <th className={TH}>Team</th>
                {UNIT_KEYS.map((k) => (
                  <th key={k} className={TH} aria-sort={ariaSort(sort, k)}>
                    <SortableHeader
                      label={<><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${UNIT_DOT[k]}`} /><span className="text-left leading-tight">{UNIT_FULL_NAME[k]}</span></>}
                    className="gap-1.5 sm:gap-2"
                      column={k}
                      sort={sort}
                    />
                  </th>
                ))}
                <th className={TH} aria-sort={ariaSort(sort, 'total')}><SortableHeader label="Total" column="total" sort={sort} /></th>
                <th className={TH} aria-sort={ariaSort(sort, 'last')}><SortableHeader label="Last Active" column="last" sort={sort} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="tf-td"><Skeleton className="h-4 w-full max-w-[6rem]" /></td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8} className="p-0">{empty}</td></tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-blue/[0.03]">
                    <td className="tf-td">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <NameAvatar name={r.name} fallback={r.email} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate tf-row-name">{r.name}</p>
                          {r.email && <p className="truncate tf-meta">{r.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="tf-td max-w-[12rem] truncate tf-body-secondary" title={teamsText(r)}>
                      {teamsText(r)}
                    </td>
                    {UNIT_KEYS.map((k) => (
                      <td key={k} className="tf-td">
                        {r.units[k] > 0
                          ? <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${UNIT_COLORS[k]}`}>{formatUnits(r.units[k])}</span>
                          : <span className="text-sm text-gray-300 dark:text-slate-600">—</span>}
                      </td>
                    ))}
                    <td className="tf-td text-sm font-bold tabular-nums text-gray-900 dark:text-slate-50">{r.total > 0 ? formatUnits(r.total) : '—'}</td>
                    <td className="tf-td whitespace-nowrap tf-meta">{r.lastActivity ? formatIST(r.lastActivity) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length > 0 && (
        <p className="mt-2 tf-meta">
          {q ? `${visible.length} of ${rows.length}` : rows.length} {rows.length === 1 ? 'member' : 'members'}
          {rows.some((r) => r.teams.length > 1) && (
            <span className="text-gray-400 dark:text-slate-500">
              {' '}· Someone in more than one team is counted once here, so this can differ from the team totals above.
            </span>
          )}
        </p>
      )}
    </>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

// Units for the four unit modules, as on screen; Total is the sum of all four.
const TEAM_EXPORT_HEADERS = ['Team', 'Resume Units', 'Resume Scoring', 'AI Assessment', 'AI Interview', 'Total Units'];
const USER_EXPORT_HEADERS = ['Team', 'Member Name', 'Member Email', 'Resume Units', 'Resume Scoring', 'AI Assessment', 'AI Interview', 'Total Units', 'Last Active'];

async function exportTeams(format: ExportFileFormat, teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  const rows = teams.map(t => [
    t.team_name ?? 'Unknown',
    ...UNIT_KEYS.map(k => formatUnits(teamValue(t, k, 'units'))),
    formatUnits(teamTotalBy(t, 'units')),
  ]);
  await exportRows(format, TEAM_EXPORT_HEADERS, rows, `team-usage-${fromDate}-to-${toDate}`, { sheetName: 'Team Usage' });
}

async function exportUsers(format: ExportFileFormat, teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  // All teams at once (one by one was slow on a long list); results keep team order.
  // Teams already loaded on screen (expanded rows, Members view) come from the cache.
  const results = await Promise.allSettled(
    teams.map(async (team) => {
      const key = membersCacheKey(team.team_id, fromDate, toDate);
      const cached = membersCache.get(key);
      if (cached) return { members: cached };
      const res = await teamService.getTeamMembersUsage(team.team_id, fromDate, toDate);
      membersCache.set(key, res.members);
      return res;
    }),
  );

  const rows: (string | number | null)[][] = [];
  const skipped: string[] = [];
  results.forEach((result, i) => {
    const team = teams[i];
    if (result.status === 'rejected') {
      skipped.push(team.team_name || 'Unnamed Team');
      return;
    }
    for (const m of result.value.members ?? []) {
      rows.push([
        team.team_name ?? 'Unknown',
        m.user_name ?? '',
        m.user_email ?? '',
        ...UNIT_KEYS.map(k => formatUnits(getMUnits(m, k))),
        formatUnits(memberTotalBy(m, 'units')),
        // The backend field is `last_activity` (routers/unit_pool.py), not `last_active`.
        m.last_activity ? formatIST(m.last_activity) : '',
      ]);
    }
  });

  await exportRows(format, USER_EXPORT_HEADERS, rows, `team-usage-by-user-${fromDate}-to-${toDate}`, { sheetName: 'Team Usage by User' });

  // A team that failed used to vanish from the file without a word.
  if (skipped.length > 0) {
    toast.warning({
      title: `${skipped.length} ${skipped.length === 1 ? 'team was' : 'teams were'} left out of the export`,
      description: `Couldn't load members for: ${skipped.join(', ')}. Try exporting again.`,
    });
  }
}

const isUsageView = (v: unknown): v is 'teams' | 'members' => v === 'teams' || v === 'members';

// ─── Main component ───────────────────────────────────────────────────────────

interface TeamUsageAnalyticsProps {
  /** Team to open on arrival (e.g. clicked in the Analytics tab). */
  focusTeamId?: string | null;
  /** Called once the focus request has been applied (or the team isn't listed). */
  onFocusHandled?: () => void;
}

export default function TeamUsageAnalytics({ focusTeamId = null, onFocusHandled }: TeamUsageAnalyticsProps = {}) {
  const { isTenantAdmin, hasPermissionCode } = useAuth();
  const canExport = isTenantAdmin || hasPermissionCode('teams:export');
  // Range and Actions / Units are shared with the Analytics tab (same session values).
  const { fromDate, toDate, setFromDate, setToDate, applyPreset, activePresetId } = useTeamReportRange();
  const [teams, setTeams] = useState<TeamUsageSummary[]>([]);
  // Same-length period just before the range — null when it couldn't load.
  
  const [loading, setLoading] = useState(true);
  // Units only — every unit type is 1 unit per action, so Actions showed the same numbers.
  const measure: Measure = 'units';
  const [teamQuery, setTeamQuery] = useState('');
  // Teams (one row per team) or Members (one row per person). Members is admin-only,
  // like the member drill-down it's built from.
  const [usageView, setUsageView] = useSessionState<'teams' | 'members'>('team-usage:view', 'teams', isUsageView);
  const memberSort = useTableSort<MemberSortKey>({ descFirst: MEMBER_SORT_DESC_FIRST });
  const showMembers = isTenantAdmin && usageView === 'members';
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // Which export the format picker is open for — null while it's closed.
  const [exportScope, setExportScope] = useState<'team' | 'user' | null>(null);
  const isMobile = useIsMobile();
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const last90 = RANGE_PRESETS.find((p) => p.id === '90d')!;
  // Empty range: offer the widest preset unless it's already (or nearly) in use.
  const canWidenRange = fromDate > last90.range().from;

  // Every fetch gets a number; only the latest one's result is applied (a
  // restored range fires a second fetch right after the default one).
  const fetchSeq = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTeams = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setExpandedTeamId(null);
    membersCache.clear();
    try {
      const res = isTenantAdmin
        ? await teamService.getAllTeamsUsage(fromDate, toDate)
        : await teamService.getMyTeamsUsage(fromDate, toDate);
      if (seq !== fetchSeq.current) return;
      setTeams(res.teams ?? []);
    } catch {
      if (seq !== fetchSeq.current) return;
      toast.error({ title: 'Failed to load team usage', description: 'Please refresh and try again.' });
      setTeams([]);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [fromDate, toDate, isTenantAdmin]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  // Opened from Analytics with a team: clear this tab's filters, expand that
  // team once the list has loaded, and bring it into view.
  useEffect(() => {
    if (!focusTeamId || loading) return;
    if (teams.some((t) => t.team_id === focusTeamId)) {
      setTeamQuery('');
      setUsageView('teams');
      if (isTenantAdmin) setExpandedTeamId(focusTeamId);
      requestAnimationFrame(() =>
        document.getElementById(`team-usage-${focusTeamId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      );
    }
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTeamId, loading, teams]);

  const teamSort = useTableSort<'name' | 'RS' | 'AS' | 'AIU' | 'RU' | 'total'>({
    descFirst: ['RS', 'AS', 'AIU', 'RU', 'total'],
  });
  // Team search narrows the list; the stat cards
  // and exports still cover every team.
  const visibleTeams = teams.filter((t) => {
    const q = teamQuery.trim().toLowerCase();
    return !q || (t.team_name || 'Unnamed Team').toLowerCase().includes(q);
  });
  const sortedTeams = sortRows(visibleTeams, teamSort.sortKey, teamSort.sortDir, {
    name: (t) => t.team_name || 'Unnamed Team',
    RS: (t) => teamValue(t, 'RS', measure),
    AS: (t) => teamValue(t, 'AS', measure),
    AIU: (t) => teamValue(t, 'AIU', measure),
    RU: (t) => teamValue(t, 'RU', measure),
    total: (t) => teamTotalBy(t, measure),
  });

  const sumBy = (list: TeamUsageSummary[], k: UnitKey | 'total') =>
    list.reduce((sum, t) => sum + (k === 'total' ? teamTotalBy(t, measure) : teamValue(t, k, measure)), 0);
  const grandTotal = sumBy(teams, 'total');
  const noMatchPanel = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
      <Search className="w-8 h-8 text-gray-200 dark:text-slate-500 mx-auto mb-3" />
      <p className="tf-body-muted">No teams match your search.</p>
      <button type="button" onClick={() => setTeamQuery('')} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
        Clear search
      </button>
    </div>
  );

  return (
    <MeasureContext.Provider value={measure}>
    <div>
      {/* Whose usage this is: every team (tenant admin) or only the viewer's teams. */}
      <ReportScopeBadge
        isTenantAdmin={isTenantAdmin}
        teamNames={teams.map((t) => t.team_name || 'Unknown')}
        loading={loading}
        className="mb-3"
      />
      {/* Summary stats — each card also sorts the table below by its column,
          and says how it moved against the previous period of the same length. */}
      <div className={`${UNIT_STAT_GRID} mb-4 sm:mb-6`}>
        {([
          ['Resume Units', 'RU'],
          ['Resume Scoring', 'RS'],
          ['AI Assessment', 'AS'],
          ['AI Interview', 'AIU'],
          ['Total Units', 'total'],
        ] as const).map(([label, key]) => (
          <UnitStatCard
            key={key}
            label={label}
            value={formatMeasure(sumBy(teams, key), measure)}
            icon={key === 'total' ? TOTAL_UNITS_ICON : UNIT_ICON[key]}
            strong={key === 'total'}
            loading={loading}
            onClick={teams.length > 1 ? () => (showMembers ? memberSort.toggleSort(key) : teamSort.toggleSort(key)) : undefined}
            active={(showMembers ? memberSort.sortKey : teamSort.sortKey) === key}
            title={`Sort ${showMembers ? 'members' : 'teams'} by ${label}`}
          />
        ))}
      </div>

      {/* Controls: team search (wide) with custom dates + Export on one row, quick ranges below. */}
      <div className="mb-3 sm:mb-4 flex flex-col gap-3 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
        <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center">
        {teams.length > 1 && (
          <div className="relative w-full min-w-0 lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              placeholder={showMembers ? 'Search members, emails or teams…' : 'Search teams…'}
              aria-label={showMembers ? 'Search members' : 'Search teams'}
              className="tf-input pl-9 pr-3"
            />
          </div>
        )}
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center lg:ml-auto">
          {/* Phones: From – to – To on one row. */}
          <div className="flex flex-col gap-2 min-w-0 lg:flex-row lg:items-center max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] max-sm:items-center">
            <DateField
              aria-label="From date"
              value={fromDate}
              max={toDate}
              onChange={setFromDate}
              className="w-full lg:w-[150px] max-sm:px-2 max-sm:!text-xs"
            />
            <span className="shrink-0 tf-caption self-start lg:self-auto max-sm:self-center">to</span>
            <DateField
              aria-label="To date"
              value={toDate}
              min={fromDate}
              max={todayIST()}
              onChange={setToDate}
              className="w-full lg:w-[150px] max-sm:px-2 max-sm:!text-xs"
            />
          </div>
          <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => {
                  if (!canExport) return;
                  if (teams.length > 0 && !loading) setShowExportMenu(v => !v);
                }}
                disabled={canExport && (teams.length === 0 || loading)}
                aria-disabled={!canExport || teams.length === 0 || loading}
                title={!canExport ? 'You do not have permission to export team usage data' : ''}
                className={`flex h-9 shrink-0 items-center gap-2 px-3 max-sm:w-full max-sm:justify-center bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                  canExport ? 'hover:bg-gray-50 dark:hover:bg-slate-800' : 'text-gray-400 cursor-not-allowed opacity-60'
                }`}
              >
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 dark:text-slate-500" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => { setExportScope('team'); setShowExportMenu(false); }}
                    className="group w-full text-left px-4 py-2.5 tf-body flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <span className={MENU_ITEM_SCALE_CLASS}>Team Level</span>
                  </button>
                  {/* Reads per-member usage, which only tenant admins can see. */}
                  {isTenantAdmin && (
                    <button
                      onClick={() => { setExportScope('user'); setShowExportMenu(false); }}
                      className="group w-full text-left px-4 py-2.5 tf-body flex items-center gap-2"
                    >
                      <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                      <span className={MENU_ITEM_SCALE_CLASS}>User Level (drill-down)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          {/* User level fetches every team's members inside onExport, so the
              modal's own spinner covers that wait. */}
          <ExportFormatModal
            tone="plain"
            open={exportScope !== null}
            onClose={() => setExportScope(null)}
            title={exportScope === 'user' ? 'Export Team Usage by User' : 'Export Team Usage'}
            recordCount={exportScope === 'team' ? teams.length : undefined}
            columns={exportScope === 'user' ? USER_EXPORT_HEADERS : TEAM_EXPORT_HEADERS}
            onExport={(format) =>
              exportScope === 'user'
                ? exportUsers(format, teams, fromDate, toDate)
                : exportTeams(format, teams, fromDate, toDate)
            }
          />
        </div>
        </div>
        {/* Quick ranges, and next to them: totals come from team membership, so usage by users in no team is left out. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <RangePresets activeId={activePresetId} onPick={applyPreset} />
          {/* Same info note style as the Usage page. */}
          <div className="flex items-start gap-2 self-start rounded-lg bg-brand-blue/[0.04] px-3 py-2 tf-meta ring-1 ring-brand-blue/10 dark:bg-slate-800/50 dark:ring-slate-700 lg:self-auto">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
            <span>
              Totals include <strong className="font-semibold text-gray-900 dark:text-slate-100">team members only</strong> — usage by users who aren’t in a team isn’t counted here.
            </span>
          </div>
        </div>
      </div>

      {/* One row: "How units are counted" on the left; sort (Teams view) and the Teams / Members toggle at the end. */}
      <div className="mb-3 sm:mb-4 flex flex-wrap items-start gap-2">
        <UnitRulesHelp className="min-w-0 flex-1 basis-full sm:basis-0" />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {showMembers && (
            <>
              {isMobile && (
                <ToolbarFilterSelect
                  ariaLabel="Sort members"
                  value={memberSort.sortKey ?? ''}
                  onChange={(v) => {
                    if (!v) memberSort.clearSort?.();
                    else if (v !== memberSort.sortKey) memberSort.toggleSort(v as MemberSortKey);
                  }}
                >
                  <option value="">Most units</option>
                  <option value="name">Member name</option>
                  <option value="total">Total</option>
                  <option value="RU">Resume Units</option>
                  <option value="RS">Resume Scoring</option>
                  <option value="AS">AI Assessment</option>
                  <option value="AIU">AI Interview</option>
                  <option value="last">Last active</option>
                </ToolbarFilterSelect>
              )}
              <ClearSortChip
                sort={memberSort}
                labels={{ name: 'Member', ...UNIT_FULL_NAME, total: 'Total', last: 'Last Active' }}
                onClear={() => memberSort.clearSort?.()}
              />
            </>
          )}
          {!showMembers && (
            <>
              {/* Phones have no column headers, so sorting moves to a dropdown. */}
              {isMobile && teams.length > 1 && (
                <ToolbarFilterSelect
                  ariaLabel="Sort teams"
                  value={teamSort.sortKey ?? ''}
                  onChange={(v) => {
                    if (!v) teamSort.clearSort?.();
                    else if (v !== teamSort.sortKey) teamSort.toggleSort(v as NonNullable<typeof teamSort.sortKey>);
                  }}
                >
                  <option value="">Default order</option>
                  <option value="name">Team name</option>
                  <option value="total">Total</option>
                  <option value="RU">Resume Units</option>
                  <option value="RS">Resume Scoring</option>
                  <option value="AS">AI Assessment</option>
                  <option value="AIU">AI Interview</option>
                </ToolbarFilterSelect>
              )}
              {/* Only while a column is sorted */}
              <ClearSortChip
                sort={teamSort}
                labels={{ name: 'Team', ...UNIT_FULL_NAME, total: 'Total' }}
                onClear={() => teamSort.clearSort?.()}
              />
            </>
          )}
          {isTenantAdmin && teams.length > 0 && (
            <div role="group" aria-label="Usage view" className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-slate-800">
              {([['teams', 'Teams', BarChart3], ['members', 'Members', Users]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setUsageView(id)}
                  aria-pressed={usageView === id}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    usageView === id
                      ? 'bg-white text-brand-blue shadow-sm dark:bg-slate-900'
                      : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Phones: one card per team, members and their history open inline.
          Rendered instead of the table (not alongside it) so an expanded team
          fetches its members once. */}
      {showMembers ? (
        <MembersUsageView teams={teams} fromDate={fromDate} toDate={toDate} query={teamQuery} isMobile={isMobile} sort={memberSort} />
      ) : isMobile ? (
        <div className="tf-card-soft overflow-hidden">
          {loading ? (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="space-y-2 px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="ml-[2.625rem] h-5 w-44 rounded-md" />
                </li>
              ))}
            </ul>
          ) : teams.length === 0 ? (
            <div className={TABLE_EMPTY_PANEL_CLASS}>
              <BarChart3 className="w-10 h-10 text-gray-200 dark:text-slate-500 mx-auto mb-3" />
              <p className="tf-body-muted">No team usage data for the selected period.</p>
              {canWidenRange && (
                <button type="button" onClick={() => applyPreset(last90)} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
                  Try the last 90 days
                </button>
              )}
            </div>
          ) : sortedTeams.length === 0 ? (
            noMatchPanel
          ) : (
            <ul className="tf-record-list p-3">
              {sortedTeams.map(team => (
                <MobileTeamCard
                  key={team.team_id}
                  team={team}
                  grandTotal={grandTotal}
                  canExpand={isTenantAdmin}
                  fromDate={fromDate}
                  toDate={toDate}
                  expanded={isTenantAdmin && expandedTeamId === team.team_id}
                  onToggle={() => setExpandedTeamId(
                    expandedTeamId === team.team_id ? null : team.team_id
                  )}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
      /* Outer team table — 7 cols (Team, 4 unit types, Total, % of total) */
      <div className="tf-card-soft overflow-hidden tf-table-shell">
        <table className="w-full">
          <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="tf-th-cell text-left tf-th" aria-sort={ariaSort(teamSort, 'name')}>
                <SortableHeader label="Team" column="name" sort={teamSort} />
              </th>
              {UNIT_KEYS.map(k => (
                // Colour moved from the inner span to the th so the sort button can turn it brand-blue.
                <th key={k} className="tf-th-cell text-left tf-th" aria-sort={ariaSort(teamSort, k)}>
                  <SortableHeader
                    label={<><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${UNIT_DOT[k]}`} /><span className="text-left leading-tight">{UNIT_FULL_NAME[k]}</span></>}
                    className="gap-1.5 sm:gap-2"
                    column={k}
                    sort={teamSort}
                  />
                </th>
              ))}
              <th className="tf-th-cell text-left tf-th" aria-sort={ariaSort(teamSort, 'total')}>
                <SortableHeader label="Total" column="total" sort={teamSort} />
              </th>
              <th className="tf-th-cell text-left tf-th">
                <abbr title="This team's part of all units used by all teams in the range" className="no-underline">% of total</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              /* Skeleton rows mirror the 7-col team row: Team, 4 unit types, Total, % of total */
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-200 dark:border-slate-700">
                  <td className="tf-td whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="w-9 h-9 rounded-lg" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="tf-td whitespace-nowrap">
                      <Skeleton className="h-6 w-10 rounded-md" />
                    </td>
                  ))}
                  <td className="tf-td whitespace-nowrap">
                    <Skeleton className="h-5 w-8" />
                  </td>
                  <td className="tf-td whitespace-nowrap">
                    <Skeleton className="h-1.5 w-24 rounded-full" />
                  </td>
                </tr>
              ))
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  {/* The shared empty-state panel — centred on both axes with
                      the same height and padding every other table's uses. */}
                  <div className={TABLE_EMPTY_PANEL_CLASS}>
                    <BarChart3 className="w-10 h-10 text-gray-200 dark:text-slate-500 mx-auto mb-3" />
                    <p className="tf-body-muted">No team usage data for the selected period.</p>
                    {canWidenRange && (
                      <button type="button" onClick={() => applyPreset(last90)} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
                        Try the last 90 days
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : sortedTeams.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">{noMatchPanel}</td>
              </tr>
            ) : (
              sortedTeams.map(team => (
                <TeamRow
                  key={team.team_id}
                  team={team}
                  grandTotal={grandTotal}
                  canExpand={isTenantAdmin}
                  fromDate={fromDate}
                  toDate={toDate}
                  expanded={isTenantAdmin && expandedTeamId === team.team_id}
                  onToggle={() => setExpandedTeamId(
                    expandedTeamId === team.team_id ? null : team.team_id
                  )}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      <p className="tf-hint mt-3">
        {!isTenantAdmin
          ? 'Member-level usage is visible to tenant admins.'
          : showMembers
            ? 'Each person appears once — if they’re in more than one team, all their teams are listed.'
            : isMobile
            ? 'Tap a team to see its members · Tap a member for their history'
            : 'Click a team to see its members · Click a member to see their full consumption history'}
      </p>
    </div>
    </MeasureContext.Provider>
  );
}
