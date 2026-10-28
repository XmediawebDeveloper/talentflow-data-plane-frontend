'use client';

import {
  Users, BarChart3, ChevronDown, ChevronRight,
  Download, FileText, ClipboardCheck, Upload, Loader2, Search, Crown,
} from 'lucide-react';
import { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import teamService, {
  TeamUsageSummary,
  TeamMemberUsage,
} from '@/lib/services/teamService';
import {
  unitPoolService,
  ConsumptionLogEntry,
  UNIT_TYPE_NAMES,
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
import { ClearSortChip, SortableHeader, ariaSort, sortRows, useTableSort } from '@/components/ui/sortable-header';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { useTeamReportRange, useReportMeasure, RangePresets, MeasureToggle, RANGE_PRESETS, todayIST, previousRange, periodDelta } from './reportControls';
import { useIsMobile } from '@/components/ui/use-mobile';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_COLORS: Record<string, string> = {
  RS:  'text-blue-600   bg-blue-50   border-blue-200',
  AS:  'text-purple-600 bg-purple-50 border-purple-200',
  AIU: 'text-success  bg-success-subtle  border-success-line',
  RU:  'text-orange-600 bg-orange-50 border-orange-200',
};

const UNIT_DOT: Record<string, string> = {
  RS: 'bg-blue-500', AS: 'bg-purple-500', AIU: 'bg-success', RU: 'bg-orange-500',
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

function getMUnits(m: TeamMemberUsage, key: 'RS' | 'AS' | 'AIU' | 'RU') {
  return m.by_type[key]?.total_consumed ?? 0;
}

function teamTotal(t: TeamUsageSummary) {
  return getCount(t, 'RS') + getCount(t, 'AS') + getCount(t, 'AIU') + getCount(t, 'RU');
}

/** Units consumed, as shown under a count: whole numbers stay whole, fractions get one decimal. */
function formatUnits(units: number) {
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}

// ─── Measure: actions (how many times) or units (how much was consumed) ─────

type Measure = 'actions' | 'units';
type UnitKey = 'RS' | 'AS' | 'AIU' | 'RU';
const UNIT_KEYS: readonly UnitKey[] = ['RS', 'AS', 'AIU', 'RU'];

/** The Actions / Units toggle, read by every row and card below. */
const MeasureContext = createContext<Measure>('actions');

function teamValue(t: TeamUsageSummary, k: UnitKey, m: Measure) {
  return m === 'units' ? t.by_type[k]?.total_consumed ?? 0 : getCount(t, k);
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

/** Full names behind the RS / AS / AIU / RU abbreviations — header tooltips and the phone legend. */
const UNIT_FULL_NAME: Record<'RS' | 'AS' | 'AIU' | 'RU', string> = {
  RS: 'Resume Scoring',
  AS: 'Assessment',
  AIU: 'AI Interview',
  RU: 'Resume Storage',
};

/** A member's consumption history loads this many entries at a time. */
const LOG_PAGE_SIZE = 200;

/* Member usage per team + range. Collapsing and re-opening a team used to
   refetch it every time; the cache is cleared whenever the team list reloads. */
const membersCache = new Map<string, TeamMemberUsage[]>();
const membersCacheKey = (teamId: string, fromDate: string, toDate: string) => `${teamId}|${fromDate}|${toDate}`;

// Human-readable labels for all unit types (including system ones)
const UNIT_TYPE_LABEL: Record<string, string> = {
  RS:         'RS',
  AS:         'AS',
  AIU:        'AIU',
  RU:         'RU',
  max_seats:  'SEAT',
};

const ENTRY_UNIT_BADGE_EXTENDED: Record<string, string> = {
  RS:        'bg-blue-100 text-blue-700',
  AS:        'bg-purple-100 text-purple-700',
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

/** Unit-type / status filters over the loaded history (client side). */
function useHistoryFilters(entries: ConsumptionLogEntry[]) {
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('');
  const unitOptions = useMemo(() => Array.from(new Set(entries.map(e => e.unit_type))), [entries]);
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
    e.unit_type === 'max_seats' ? 'Seat License' : (e.entity_name || UNIT_TYPE_NAMES[e.unit_type] || e.unit_type),
    e.units_consumed,
    e.status.replace(/_/g, ' '),
    e.failure_reason ?? '',
  ]);
  const slug = memberName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'member';
  exportRowsToCSV(['Date', 'Unit', 'Item', 'Units', 'Status', 'Failure Reason'], rows, `${slug}-history-${fromDate}-to-${toDate}`);
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

function MemberLogEntries({ entries, total, onLoadMore, loadingMore, memberName, fromDate, toDate }: { entries: ConsumptionLogEntry[]; memberName: string; fromDate: string; toDate: string } & LogPaging) {
  // Show ALL entries sorted newest-first (including system ones like max_seats)
  const f = useHistoryFilters(entries);
  const sorted = [...f.filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <tr>
      <td colSpan={8} className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 py-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          Consumption History — {historyCountLabel(entries.length, total)}{f.active && ` · ${sorted.length} matching`}
        </p>
        <HistoryToolbar f={f} onDownload={() => downloadHistory(sorted, memberName, fromDate, toDate)} className="mb-3" />
        {sorted.length === 0 && <p className="text-xs italic text-gray-400 dark:text-slate-500">No entries match these filters.</p>}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {sorted.map(e => (
            <div key={e.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-3 flex items-start gap-3 text-sm max-sm:text-[13px]">
              <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${ENTRY_UNIT_BADGE_EXTENDED[e.unit_type] ?? 'bg-gray-100 text-gray-600'}`}>
                {UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 dark:text-slate-100 truncate">
                  {e.unit_type === 'max_seats'
                    ? 'Seat License'
                    : (e.entity_name || UNIT_TYPE_NAMES[e.unit_type] || e.unit_type)}
                </p>
                {e.entity_type && e.unit_type !== 'max_seats' && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{e.entity_type.replace(/_/g, ' ')}</p>
                )}
                {e.unit_type === 'max_seats' && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">User seat allocated</p>
                )}
                {e.overall_score != null && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    Score: <span className="font-semibold text-gray-700 dark:text-slate-300">{e.overall_score}%</span>
                  </p>
                )}
                {e.failure_reason && (
                  <p className="text-xs text-destructive mt-0.5">Reason: {e.failure_reason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-gray-900 dark:text-slate-50">
                  {e.units_consumed > 0 ? `−${e.units_consumed}` : '0'} units
                </p>
                {e.balance_before != null && e.balance_after != null && (
                  <p className="text-xs text-gray-400 dark:text-slate-500">{e.balance_before} → {e.balance_after}</p>
                )}
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {e.status.replace(/_/g, ' ')}
              </span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
                {formatIST(e.created_at)}
              </span>
            </div>
          ))}
        </div>
        <LoadMoreHistory shown={entries.length} total={total} onLoadMore={onLoadMore} loadingMore={loadingMore} className="mt-2" />
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
          className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-blue/30 focus:outline-none focus:ring-2 focus:ring-brand-blue/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
      </div>
      <select
        aria-label="Sort members"
        value={view.sort}
        onChange={e => view.setSort(e.target.value as MemberSort)}
        className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
  const idle = memberTotalBy(member, 'actions') === 0;
  if (!isTop && !idle) return null;
  return isTop ? (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-orange/10 px-1.5 py-px text-2xs font-semibold text-brand-orange-deep ring-1 ring-brand-orange/15">
      <Crown className="h-2.5 w-2.5" /> Top
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-1.5 py-px text-2xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">
      No usage
    </span>
  );
}

// ─── Single member row ────────────────────────────────────────────────────────

function MemberRow({ member, fromDate, toDate, isTop = false }: { member: TeamMemberUsage; fromDate: string; toDate: string; isTop?: boolean }) {
  const { expanded, toggle, entries, loading, total, loadMore, loadingMore } = useMemberLog(member, fromDate, toDate);
  const measure = useContext(MeasureContext);

  // The badge follows the Actions / Units toggle; the line under it shows the other one.
  const rs   = memberValue(member, 'RS', measure);
  const as_  = memberValue(member, 'AS', measure);
  const aiu  = memberValue(member, 'AIU', measure);
  const ru   = memberValue(member, 'RU', measure);
  const secondary = (k: UnitKey) =>
    measure === 'units' ? `${getMCount(member, k)} actions` : `${formatUnits(getMUnits(member, k))} units`;

  return (
    <>
      <tr
        onClick={toggle}
        className="cursor-pointer hover:bg-brand-blue/[0.04] dark:hover:bg-slate-800 transition-colors border-t border-gray-100 dark:border-slate-700/60 select-none"
      >
        {/* Member */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="text-gray-300 dark:text-slate-500 shrink-0">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </div>
            <NameAvatar name={member.user_name} fallback={member.user_email} size="sm" />
            <div>
              <p className="flex items-center gap-1.5 text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50">
                {member.user_name || '—'}
                <MemberBadges member={member} isTop={isTop} />
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{member.user_email}</p>
            </div>
          </div>
        </td>

        {/* RS */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${rs > 0 ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(rs, measure)}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">{secondary('RS')}</p>
          </div>
        </td>

        {/* AS */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${as_ > 0 ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(as_, measure)}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">{secondary('AS')}</p>
          </div>
        </td>

        {/* AIU */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${aiu > 0 ? 'bg-success-subtle text-success ring-1 ring-success-line' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(aiu, measure)}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">{secondary('AIU')}</p>
          </div>
        </td>

        {/* RU */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${ru > 0 ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' : 'bg-gray-100 text-gray-400'}`}>
              {formatMeasure(ru, measure)}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">{secondary('RU')}</p>
          </div>
        </td>

        {/* JDs created */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${member.jds_created > 0 ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'bg-gray-100 text-gray-400'}`}>
              {member.jds_created}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">created</p>
          </div>
        </td>

        {/* Assessments created */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-center gap-1">
            <span className={`inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-md text-sm font-bold
              ${member.assessments_created > 0 ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-gray-100 text-gray-400'}`}>
              {member.assessments_created}
            </span>
            <p className="text-xs text-gray-400 dark:text-slate-500">created</p>
          </div>
        </td>

        {/* Last active */}
        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-slate-500">
          {member.last_activity ? formatISTDate(member.last_activity) : 'Never'}
        </td>
      </tr>

      {/* Loading — mirrors MemberLogEntries: label + entry rows */}
      {expanded && loading && (
        <tr>
          <td colSpan={8} className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700/60 px-4 py-4">
            <Skeleton className="h-3 w-56 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-3 flex items-start gap-3">
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
      {expanded && !loading && entries !== null && entries.length > 0 && (
        <MemberLogEntries entries={entries} total={total} onLoadMore={loadMore} loadingMore={loadingMore} memberName={member.user_name || member.user_email} fromDate={fromDate} toDate={toDate} />
      )}

      {/* Empty */}
      {expanded && !loading && entries !== null && entries.length === 0 && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 text-sm max-sm:text-[13px] text-gray-400 dark:text-slate-500 italic border-b border-gray-100 dark:border-slate-700/60">
            No consumption entries for this member in the selected period.
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Share bar: a team's mix of RS / AS / AIU / RU, and its % of all usage ────

function ShareBar({ team, grandTotal, className = '' }: { team: TeamUsageSummary; grandTotal: number; className?: string }) {
  const measure = useContext(MeasureContext);
  const total = teamTotalBy(team, measure);
  if (total <= 0 || grandTotal <= 0) return <span className="text-sm text-gray-300 dark:text-slate-500">—</span>;
  const pct = Math.round((total / grandTotal) * 100);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
        title={UNIT_KEYS.map(k => `${k} ${formatMeasure(teamValue(team, k, measure), measure)}`).join(' · ')}
      >
        {UNIT_KEYS.map(k => {
          const v = teamValue(team, k, measure);
          return v > 0 ? <span key={k} className={UNIT_DOT[k]} style={{ width: `${(v / total) * 100}%` }} /> : null;
        })}
      </div>
      <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-slate-300">{pct < 1 ? '<1' : pct}%</span>
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
}: {
  team: TeamUsageSummary;
  fromDate: string;
  toDate: string;
  expanded: boolean;
  onToggle: () => void;
  grandTotal: number;
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
        onClick={onToggle}
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors border-t border-gray-200 dark:border-slate-700 select-none"
      >
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
            {/* The only expand affordance — the whole row toggles. */}
            <div className={expanded ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'} aria-label={expanded ? 'Hide members' : 'Show members'}>
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>
            <div className="w-9 h-9 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-brand-blue" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm max-sm:text-[13px]">{team.team_name || 'Unnamed Team'}</p>
              {(team.jds_created > 0 || team.assessments_created > 0) && (
                <div className="flex items-center gap-3 mt-0.5">
                  {team.jds_created > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                      <FileText className="w-3 h-3" />{team.jds_created} JDs
                    </span>
                  )}
                  {team.assessments_created > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                      <ClipboardCheck className="w-3 h-3" />{team.assessments_created} Assessments
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
        {([['RS', rs], ['AS', as_], ['AIU', aiu], ['RU', ru]] as ['RS' | 'AS' | 'AIU' | 'RU', number][]).map(([key, val]) => (
          <td key={key} className="px-4 py-4 whitespace-nowrap">
            {val > 0
              ? <span title={`${UNIT_FULL_NAME[key]}: ${formatMeasure(val, measure)} ${measure}`} className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${UNIT_COLORS[key]}`}>{formatMeasure(val, measure)}</span>
              : <span className="text-gray-300 dark:text-slate-500 text-sm max-sm:text-[13px]">—</span>}
          </td>
        ))}
        <td className="px-4 py-4 whitespace-nowrap">
          <span className={`text-sm max-sm:text-[13px] font-bold ${total > 0 ? 'text-gray-900 dark:text-slate-50' : 'text-gray-300 dark:text-slate-500'}`}>
            {total > 0 ? formatMeasure(total, measure) : '—'}
          </span>
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
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
                    <div key={i} className="flex items-center gap-4">
                      <div className="flex items-center gap-2 w-56 shrink-0">
                        <Skeleton className="w-7 h-7 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                      <div className="flex-1 grid grid-cols-7 gap-3">
                        {Array.from({ length: 7 }).map((_, j) => (
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
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-slate-300">
                          Member
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-slate-300">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RS}`} />
                            <span className="text-gray-600 dark:text-slate-300">Resume Scoring</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-slate-300">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AS}`} />
                            <span className="text-gray-600 dark:text-slate-300">Assessment</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-slate-300">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.AIU}`} />
                            <span className="text-gray-600 dark:text-slate-300">AI Interview</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-slate-300">
                          <span className="flex flex-col items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${UNIT_DOT.RU}`} />
                            <span className="text-gray-600 dark:text-slate-300">Resume Storage</span>
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-slate-300">
                          <span className="flex flex-col items-center gap-0.5">
                            <FileText className="w-3 h-3 text-brand-blue" />
                            JDs
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-slate-300">
                          <span className="flex flex-col items-center gap-0.5">
                            <ClipboardCheck className="w-3 h-3 text-brand-blue" />
                            Assessments
                          </span>
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-slate-300">
                          Last Active
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-50 dark:divide-slate-700/60">
                      {view.rows.map(m => (
                        <MemberRow key={m.user_id} member={m} fromDate={fromDate} toDate={toDate} isTop={m.user_id === view.topId} />
                      ))}
                      {view.rows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-6 py-4 text-sm italic text-gray-400 dark:text-slate-500">No members match “{view.query}”.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-4 text-sm max-sm:text-[13px] text-gray-400 dark:text-slate-500 italic">
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

function MobileLogEntries({ entries, total, onLoadMore, loadingMore, memberName, fromDate, toDate }: { entries: ConsumptionLogEntry[]; memberName: string; fromDate: string; toDate: string } & LogPaging) {
  const f = useHistoryFilters(entries);
  const sorted = [...f.filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="border-t border-gray-100 px-2.5 py-2.5 dark:border-slate-700/60">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
        History · {historyCountLabel(entries.length, total)}{f.active && ` · ${sorted.length} matching`}
      </p>
      <HistoryToolbar f={f} onDownload={() => downloadHistory(sorted, memberName, fromDate, toDate)} className="mb-2" />
      {sorted.length === 0 && <p className="text-xs italic text-gray-400 dark:text-slate-500">No entries match these filters.</p>}
      <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
        {sorted.map(e => (
          <li key={e.id} className="rounded-md bg-gray-50 px-2.5 py-2 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold ${ENTRY_UNIT_BADGE_EXTENDED[e.unit_type] ?? 'bg-gray-100 text-gray-600'}`}>
                {UNIT_TYPE_LABEL[e.unit_type] ?? e.unit_type}
              </span>
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-slate-100">
                {e.unit_type === 'max_seats'
                  ? 'Seat License'
                  : (e.entity_name || UNIT_TYPE_NAMES[e.unit_type] || e.unit_type)}
              </p>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-900 dark:text-slate-50">
                {e.units_consumed > 0 ? `−${e.units_consumed}` : '0'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className={`rounded-full px-1.5 py-0.5 text-2xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {e.status.replace(/_/g, ' ')}
              </span>
              <span className="truncate text-2xs text-gray-400 dark:text-slate-500">{formatIST(e.created_at)}</span>
            </div>
            {e.failure_reason && (
              <p className="mt-1 text-2xs text-destructive">Reason: {e.failure_reason}</p>
            )}
          </li>
        ))}
      </ul>
      <LoadMoreHistory shown={entries.length} total={total} onLoadMore={onLoadMore} loadingMore={loadingMore} className="mt-2" />
    </div>
  );
}

function MobileMemberCard({ member, fromDate, toDate, isTop = false }: { member: TeamMemberUsage; fromDate: string; toDate: string; isTop?: boolean }) {
  const { expanded, toggle, entries, loading, total, loadMore, loadingMore } = useMemberLog(member, fromDate, toDate);
  const measure = useContext(MeasureContext);
  const stats: [string, string | number, boolean][] = [
    ...UNIT_KEYS.map((k): [string, string, boolean] => [k, formatMeasure(memberValue(member, k, measure), measure), memberValue(member, k, measure) > 0]),
    ['JDs', member.jds_created, member.jds_created > 0],
    ['Assess.', member.assessments_created, member.assessments_created > 0],
  ];

  return (
    <li className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left"
      >
        <span className={expanded ? 'text-brand-blue' : 'text-gray-300 dark:text-slate-500'}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <NameAvatar name={member.user_name} fallback={member.user_email} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-sm max-sm:text-[13px] font-medium text-gray-900 dark:text-slate-50">
            <span className="truncate">{member.user_name || '—'}</span>
            <MemberBadges member={member} isTop={isTop} />
          </span>
          <span className="block truncate text-xs text-gray-400 dark:text-slate-500">{member.user_email}</span>
        </span>
      </button>
      <div className="grid grid-cols-3 gap-1.5 px-2.5 pb-2.5">
        {stats.map(([label, value, active]) => (
          <div
            key={label}
            className={`rounded-md px-2 py-1 text-center ${active ? 'bg-brand-blue/5 ring-1 ring-brand-blue/10' : 'bg-gray-50 dark:bg-slate-800/50'}`}
          >
            <p className={`text-sm max-sm:text-[13px] font-semibold tabular-nums ${active ? 'text-gray-900 dark:text-slate-50' : 'text-gray-400 dark:text-slate-500'}`}>{value}</p>
            <p className="text-2xs text-gray-500 dark:text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-gray-100 px-2.5 py-1.5 text-2xs text-gray-500 dark:border-slate-700/60 dark:text-slate-500">
        Last active: {member.last_activity ? formatISTDate(member.last_activity) : 'Never'}
      </p>
      {expanded && loading && (
        <div className="space-y-1.5 border-t border-gray-100 px-2.5 py-2.5 dark:border-slate-700/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      )}
      {expanded && !loading && entries !== null && entries.length > 0 && (
        <MobileLogEntries entries={entries} total={total} onLoadMore={loadMore} loadingMore={loadingMore} memberName={member.user_name || member.user_email} fromDate={fromDate} toDate={toDate} />
      )}
      {expanded && !loading && entries !== null && entries.length === 0 && (
        <p className="border-t border-gray-100 px-2.5 py-2.5 text-xs italic text-gray-400 dark:border-slate-700/60 dark:text-slate-500">
          No consumption entries in the selected period.
        </p>
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
}: {
  team: TeamUsageSummary;
  fromDate: string;
  toDate: string;
  expanded: boolean;
  onToggle: () => void;
  grandTotal: number;
}) {
  const { members, loadingMembers } = useTeamMembers(team.team_id, expanded, fromDate, toDate);
  const view = useMemberView(members);
  const measure = useContext(MeasureContext);
  const total = teamTotalBy(team, measure);

  return (
    <li id={`team-usage-${team.team_id}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3 pb-2 pt-3 text-left"
      >
        <span className={expanded ? 'text-brand-blue' : 'text-gray-400 dark:text-slate-500'}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/15">
          <Users className="h-4 w-4 text-brand-blue" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm max-sm:text-[13px] font-semibold text-gray-900 dark:text-slate-50">{team.team_name || 'Unnamed Team'}</span>
          <span className="block truncate text-xs text-gray-400 dark:text-slate-500">
            {team.jds_created} JDs · {team.assessments_created} Assessments
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-sm max-sm:text-[13px] font-bold tabular-nums ${total > 0 ? 'text-gray-900 dark:text-slate-50' : 'text-gray-300 dark:text-slate-500'}`}>
            {total > 0 ? formatMeasure(total, measure) : '—'}
          </span>
          <span className="block text-2xs text-gray-400 dark:text-slate-500">{measure === 'units' ? 'units' : 'total'}</span>
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5 px-3 pb-3 pl-[3.25rem]">
        {(['RS', 'AS', 'AIU', 'RU'] as const).map(k => {
          const val = teamValue(team, k, measure);
          return (
            <span
              key={k}
              title={UNIT_FULL_NAME[k]}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-semibold ${val > 0 ? UNIT_COLORS[k] : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500'}`}
            >
              {k} <span className="tabular-nums">{formatMeasure(val, measure)}</span>
            </span>
          );
        })}
      </div>
      <ShareBar team={team} grandTotal={grandTotal} className="px-3 pb-3 pl-[3.25rem]" />
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-2 dark:border-slate-700/60 dark:bg-slate-800/50">
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
                  <MobileMemberCard key={m.user_id} member={m} fromDate={fromDate} toDate={toDate} isTop={m.user_id === view.topId} />
                ))}
              </ul>
              {view.rows.length === 0 && <p className="px-2 py-2 text-xs italic text-gray-400 dark:text-slate-500">No members match “{view.query}”.</p>}
            </>
          ) : (
            <p className="px-2 py-2 text-xs italic text-gray-400 dark:text-slate-500">No members with usage in this period.</p>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Summary stat card ────────────────────────────────────────────────────────

function StatCard({ label, value, dot, loading, onClick, active = false, delta }: {
  label: string; value: string; dot: string; loading: boolean;
  /** "▲ 18%" style change vs the previous period; null/undefined hides it. */
  delta?: { text: string; tone: 'up' | 'down' | 'flat'; hint: string } | null;
  /** Sorts the table by this column. */
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || loading}
      aria-pressed={active}
      title={onClick ? `Sort teams by ${label}` : undefined}
      className={`rounded-xl border shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] px-3.5 py-2.5 sm:px-5 sm:py-4 flex items-center gap-3 sm:gap-4 text-left w-full transition-colors disabled:cursor-default ${
        active
          ? 'border-brand-blue/40 bg-brand-blue/[0.04] dark:bg-brand-blue/10'
          : 'border-gray-100 bg-white hover:border-brand-blue/30 dark:border-slate-700/60 dark:bg-slate-900'
      }`}
    >
      <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{label}</p>
        {loading
          ? <div className="h-6 w-10 bg-gray-100 dark:bg-slate-800 rounded animate-pulse mt-1" />
          : <p className="text-lg max-sm:text-base sm:text-xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-slate-50">{value}</p>}
        {!loading && delta && (
          <p
            title={delta.hint}
            className={`mt-0.5 truncate text-2xs font-medium ${
              delta.tone === 'up' ? 'text-success' : delta.tone === 'down' ? 'text-brand-orange-deep' : 'text-gray-400 dark:text-slate-500'
            }`}
          >
            {delta.text}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

// Every count is actions (consumption_count), as on screen; Total is the sum of
// all four — the team export used to drop RU while its Total still counted it.
const TEAM_EXPORT_HEADERS = ['Team', 'RS Actions', 'AS Actions', 'AIU Actions', 'RU Actions', 'Total Actions', 'JDs Created', 'Assessments Created'];
const USER_EXPORT_HEADERS = ['Team', 'Member Name', 'Member Email', 'RS Actions', 'AS Actions', 'AIU Actions', 'RU Actions', 'Total Actions', 'Total Units', 'Last Active'];

async function exportTeams(format: ExportFileFormat, teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  const rows = teams.map(t => [
    t.team_name ?? 'Unknown',
    getCount(t, 'RS'), getCount(t, 'AS'), getCount(t, 'AIU'), getCount(t, 'RU'),
    teamTotal(t), t.jds_created, t.assessments_created,
  ]);
  await exportRows(format, TEAM_EXPORT_HEADERS, rows, `team-usage-${fromDate}-to-${toDate}`, { sheetName: 'Team Usage' });
}

async function exportUsers(format: ExportFileFormat, teams: TeamUsageSummary[], fromDate: string, toDate: string) {
  // All teams at once (one by one was slow on a long list); results keep team order.
  const results = await Promise.allSettled(
    teams.map(team => teamService.getTeamMembersUsage(team.team_id, fromDate, toDate)),
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
      const types = ['RS', 'AS', 'AIU', 'RU'] as const;
      const actions = types.map(k => getMCount(m, k));
      const units = types.reduce((sum, k) => sum + getMUnits(m, k), 0);
      rows.push([
        team.team_name ?? 'Unknown',
        m.user_name ?? '',
        m.user_email ?? '',
        ...actions,
        actions.reduce((a, b) => a + b, 0),
        formatUnits(units),
        // The backend field is `last_activity` (routers/unit_pool.py), not `last_active`.
        m.last_activity ?? '',
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
  const [prevTeams, setPrevTeams] = useState<TeamUsageSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [measure, setMeasure] = useReportMeasure();
  const [teamQuery, setTeamQuery] = useState('');
  const [hideIdle, setHideIdle] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  // Which export the format picker is open for — null while it's closed.
  const [exportScope, setExportScope] = useState<'team' | 'user' | null>(null);
  const isMobile = useIsMobile();
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // This tab's own filter; range and measure persist in reportControls.
  useListStatePersistence('team-usage', { hideIdle }, (saved) => {
    if (typeof saved.hideIdle === 'boolean') setHideIdle(saved.hideIdle);
  });

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
    const load = (from: string, to: string) =>
      isTenantAdmin ? teamService.getAllTeamsUsage(from, to) : teamService.getMyTeamsUsage(from, to);
    const prev = previousRange(fromDate, toDate);
    try {
      // The previous period is for the "vs previous" lines only — its failure
      // just hides them.
      const [res, prevRes] = await Promise.all([
        load(fromDate, toDate),
        load(prev.from, prev.to).catch(() => null),
      ]);
      if (seq !== fetchSeq.current) return;
      setTeams(res.teams ?? []);
      setPrevTeams(prevRes ? prevRes.teams ?? [] : null);
    } catch {
      if (seq !== fetchSeq.current) return;
      toast.error({ title: 'Failed to load team usage', description: 'Please refresh and try again.' });
      setTeams([]);
      setPrevTeams(null);
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
      setHideIdle(false);
      setExpandedTeamId(focusTeamId);
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
  // Team search + "hide teams with no usage" narrow the list; the stat cards
  // and exports still cover every team.
  const visibleTeams = teams.filter((t) => {
    if (hideIdle && teamTotalBy(t, 'actions') === 0) return false;
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
  const prevDays = previousRange(fromDate, toDate).days;
  // "▲ 18%" vs the previous period of the same length.
  const deltaFor = (k: UnitKey | 'total') =>
    prevTeams ? periodDelta(sumBy(teams, k), sumBy(prevTeams, k), prevDays, (v) => formatMeasure(v, measure)) : null;
  const filtersOn = !!teamQuery.trim() || hideIdle;
  const noMatchPanel = (
    <div className={TABLE_EMPTY_PANEL_CLASS}>
      <Search className="w-8 h-8 text-gray-200 dark:text-slate-500 mx-auto mb-3" />
      <p className="text-sm max-sm:text-[13px] text-gray-400 dark:text-slate-500">No teams match these filters.</p>
      <button type="button" onClick={() => { setTeamQuery(''); setHideIdle(false); }} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
        Clear filters
      </button>
    </div>
  );

  return (
    <MeasureContext.Provider value={measure}>
    <div>
      {/* Header */}
      <div className="mb-4 sm:mb-5 flex flex-col gap-3 sm:gap-4 rounded-xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-brand-blue" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">Team Usage</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isTenantAdmin ? 'bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'}`}>
                {isTenantAdmin ? 'All Teams' : 'Your Teams'}
              </span>
            </div>
            <p className="hidden sm:block text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">Consumption across teams and members for the selected period.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center">
          {/* Phones: From – to – To on one row. */}
          <div className="flex flex-col gap-2 min-w-0 lg:flex-row lg:items-center max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] max-sm:items-center">
            <DateField
              aria-label="From date"
              value={fromDate}
              max={toDate}
              onChange={setFromDate}
              className="w-full lg:w-[150px] max-sm:px-2 max-sm:!text-xs"
            />
            <span className="shrink-0 text-xs font-medium text-gray-400 dark:text-slate-500 self-start lg:self-auto max-sm:self-center">to</span>
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
                    className="group w-full text-left px-4 py-2.5 text-sm max-sm:text-[13px] text-gray-700 dark:text-slate-300 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <span className={MENU_ITEM_SCALE_CLASS}>Team Level</span>
                  </button>
                  <button
                    onClick={() => { setExportScope('user'); setShowExportMenu(false); }}
                    className="group w-full text-left px-4 py-2.5 text-sm max-sm:text-[13px] text-gray-700 dark:text-slate-300 flex items-center gap-2"
                  >
                    <Users className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <span className={MENU_ITEM_SCALE_CLASS}>User Level (drill-down)</span>
                  </button>
                </div>
              )}
            </div>
          {/* User level fetches every team's members inside onExport, so the
              modal's own spinner covers that wait. */}
          <ExportFormatModal
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

      {/* Quick ranges — the date fields above still allow any custom range. */}
      <RangePresets activeId={activePresetId} onPick={applyPreset} className="-mt-1 mb-3 sm:mb-4 lg:justify-end" />

      {/* Summary stats — each card also sorts the table below by its column,
          and says how it moved against the previous period of the same length. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4 sm:mb-6">
        {([
          ['Resume Scoring', 'bg-blue-500', 'RS'],
          ['Assessments', 'bg-purple-500', 'AS'],
          ['AI Interviews', 'bg-success', 'AIU'],
          ['Resume Storage', 'bg-orange-500', 'RU'],
          [measure === 'units' ? 'Total Units' : 'Total Actions', 'bg-gray-400', 'total'],
        ] as const).map(([label, dot, key]) => (
          <StatCard
            key={key}
            label={label}
            value={formatMeasure(sumBy(teams, key), measure)}
            dot={dot}
            loading={loading}
            onClick={teams.length > 1 ? () => teamSort.toggleSort(key) : undefined}
            active={teamSort.sortKey === key}
            delta={deltaFor(key)}
          />
        ))}
      </div>

      {/* Toolbar: team search, hide-idle, Actions / Units; sort + count on the right. */}
      <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-2">
        {teams.length > 1 && (
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              placeholder="Search teams…"
              aria-label="Search teams"
              className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-brand-blue/30 focus:outline-none focus:ring-2 focus:ring-brand-blue/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>
        )}
        {teams.length > 0 && (
          <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={hideIdle}
              onChange={(e) => setHideIdle(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-brand-blue"
            />
            Hide teams with no usage
          </label>
        )}
        <MeasureToggle value={measure} onChange={setMeasure} />
        <div className="ml-auto flex items-center gap-2">
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
              <option value="RS">Resume Scoring</option>
              <option value="AS">Assessment</option>
              <option value="AIU">AI Interview</option>
              <option value="RU">Resume Storage</option>
            </ToolbarFilterSelect>
          )}
          {/* Only while a column is sorted */}
          <ClearSortChip
            sort={teamSort}
            labels={{ name: 'Team', RS: 'RS', AS: 'AS', AIU: 'AIU', RU: 'RU', total: 'Total' }}
            onClear={() => teamSort.clearSort?.()}
          />
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {filtersOn ? `${visibleTeams.length} of ${teams.length}` : teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </span>
        </div>
      </div>

      {/* Phones: one card per team, members and their history open inline.
          Rendered instead of the table (not alongside it) so an expanded team
          fetches its members once. */}
      {isMobile && (
        <p className="mb-2 text-2xs text-gray-400 dark:text-slate-500">
          {(['RS', 'AS', 'AIU', 'RU'] as const).map((k, i) => (
            <span key={k}>{i > 0 && ' · '}<span className="font-semibold">{k}</span> {UNIT_FULL_NAME[k]}</span>
          ))}
        </p>
      )}
      {isMobile ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] overflow-hidden">
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
              <p className="text-sm max-sm:text-[13px] text-gray-400 dark:text-slate-500">No team usage data for the selected period.</p>
              {canWidenRange && (
                <button type="button" onClick={() => applyPreset(last90)} className="mt-2 text-xs font-semibold text-brand-blue hover:underline">
                  Try the last 90 days
                </button>
              )}
            </div>
          ) : sortedTeams.length === 0 ? (
            noMatchPanel
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {sortedTeams.map(team => (
                <MobileTeamCard
                  key={team.team_id}
                  team={team}
                  grandTotal={grandTotal}
                  fromDate={fromDate}
                  toDate={toDate}
                  expanded={expandedTeamId === team.team_id}
                  onToggle={() => setExpandedTeamId(
                    expandedTeamId === team.team_id ? null : team.team_id
                  )}
                />
              ))}
            </ul>
          )}
        </div>
      ) : (
      /* Outer team table — 7 cols (Team, RS, AS, AIU, RU, Total, Share) */
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700/60 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] overflow-hidden tf-table-shell">
        <table className="w-full">
          <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(teamSort, 'name')}>
                <SortableHeader label="Team" column="name" sort={teamSort} />
              </th>
              {(['RS', 'AS', 'AIU', 'RU'] as const).map(k => (
                // Colour moved from the inner span to the th so the sort button can turn it brand-blue.
                <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(teamSort, k)}>
                  <SortableHeader
                    label={<><span className={`w-2 h-2 rounded-full ${UNIT_DOT[k]}`} /><abbr title={UNIT_FULL_NAME[k]} className="no-underline">{k}</abbr></>}
                    column={k}
                    sort={teamSort}
                  />
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300" aria-sort={ariaSort(teamSort, 'total')}>
                <SortableHeader label="Total" column="total" sort={teamSort} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-300">
                <abbr title="Mix of RS / AS / AIU / RU, and this team's share of all usage" className="no-underline">Share</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              /* Skeleton rows mirror the 7-col team row: Team, RS, AS, AIU, RU, Total, Share */
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t border-gray-200 dark:border-slate-700">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="w-9 h-9 rounded-lg" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-4 whitespace-nowrap">
                      <Skeleton className="h-6 w-10 rounded-md" />
                    </td>
                  ))}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <Skeleton className="h-5 w-8" />
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
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
                    <p className="text-sm max-sm:text-[13px] text-gray-400 dark:text-slate-500">No team usage data for the selected period.</p>
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
                  fromDate={fromDate}
                  toDate={toDate}
                  expanded={expandedTeamId === team.team_id}
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

      <p className="text-xs text-gray-400 dark:text-slate-500 mt-3">
        {isMobile
          ? 'Tap a team to see its members · Tap a member for their history'
          : 'Click a team to see its members · Click a member to see their full consumption history'}
      </p>
    </div>
    </MeasureContext.Provider>
  );
}
